/**
 * 健衡 BLE 连接层（JH-FE-BLE-1.1）
 *
 * 职责：
 *  - 适配器 / 扫描（独立识别广播名与 NUS 服务、去重、RSSI 排序）
 *  - 连接、服务发现（优先 NUS）、订阅、MTU
 *  - HELLO 握手、PING 心跳、ACK 匹配与超时重发
 *  - 指令队列（单帧在途、分包写入）、STOP 插队
 *  - STATE / TELEMETRY 解析与 500ms 节流
 *  - 非主动断线重连（1s / 2s / 4s）
 *  - 80 条脱敏日志
 *
 * 不依赖页面，单例导出；页面只读取 snapshot() 并订阅 onState。
 */

const codec = require('./ble-codec')

const NUS_SERVICE = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'
const NUS_RX = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'
const NUS_TX = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'
const BATTERY_SERVICE = '0000180F-0000-1000-8000-00805F9B34FB'
const BATTERY_CHAR = '00002A19-0000-1000-8000-00805F9B34FB'

const MAX_LOG = 80
const CACHE_KEY = 'jh_ble_device'
const WRITE_TIMEOUT = 6000
const ACK_TIMEOUT = 300
const HELLO_TIMEOUT = 3000
const PONG_TIMEOUT = 1200
const SCAN_TIMEOUT = 15000
const SCAN_CACHE_INTERVAL = 2500
const SCAN_CACHE_TIMEOUT = 800
const SCAN_LIMIT = 30

const ERR_TEXT = {
  10000: '蓝牙适配器未初始化，请重试',
  10001: '手机蓝牙未打开，请到系统设置中开启蓝牙',
  10002: '没有找到指定设备，请重新搜索',
  10003: '连接失败，请靠近设备后重试',
  10004: '没有找到指定服务，设备固件可能不匹配',
  10005: '没有找到指定特征值，设备固件可能不匹配',
  10006: '当前连接已断开',
  10007: '该特征值不支持当前操作',
  10008: '系统异常，请重试',
  10009: 'Android 系统版本过低，不支持 BLE',
  10012: '连接超时，请重新搜索设备',
  10013: '设备标识为空，请重新搜索'
}

const REQUIRED_API = [
  'openBluetoothAdapter',
  'closeBluetoothAdapter',
  'startBluetoothDevicesDiscovery',
  'stopBluetoothDevicesDiscovery',
  'onBluetoothDeviceFound',
  'onBluetoothAdapterStateChange',
  'createBLEConnection',
  'closeBLEConnection',
  'getBLEDeviceServices',
  'getBLEDeviceCharacteristics',
  'notifyBLECharacteristicValueChange',
  'onBLECharacteristicValueChange',
  'onBLEConnectionStateChange',
  'writeBLECharacteristicValue',
  'readBLECharacteristicValue'
]

const wxApi = typeof wx !== 'undefined' ? wx : null

const state = {
  supported: true,
  adapterReady: false,
  discovering: false,
  locationEnabled: null,
  scanStatus: 'idle',
  scanIssue: '',
  scanError: '',
  scanSeen: 0,
  scanMatched: 0,
  devices: [],
  connecting: false,
  connected: false,
  deviceId: '',
  deviceName: '',
  services: [],
  protocolError: '',
  canRead: false,
  canWrite: false,
  canNotify: false,
  subscribed: false,
  mtu: 20,
  lastValue: '',
  lastText: '',
  logs: [],
  handshaked: false,
  handshakeError: '',
  device: null,
  deviceState: 0,
  level: 0,
  mode: 0,
  remain: 0,
  battery: 0,
  error: 0,
  telemetry: [],
  reconnecting: false,
  reconnectAttempt: 0,
  lastDevice: null,
  phase: 'idle'
}

let listeners = { state: [], value: [] }
let eventsBound = false
let seq = 0
let rxBuffer = new Uint8Array(0)
let writeQueue = []
let writing = false
let pending = {}
let heartbeatTimer = null
let heartbeatMissed = 0
let emitTimer = null
let scanSession = null
let scanStop = null
let manualClose = false
let reconnectTimer = null
let throttleTimer = null
let lastThrottleAt = 0
let batteryChar = null
let readChar = null

/* ---------------- 基础工具 ---------------- */

function isSupported() {
  if (!wxApi) return false
  for (let i = 0; i < REQUIRED_API.length; i++) {
    if (typeof wxApi[REQUIRED_API[i]] !== 'function') return false
  }
  return true
}

function supported() {
  if (!state.supported) return false
  state.supported = isSupported()
  return state.supported
}

function makeError(message, code) {
  const e = new Error(message)
  if (code != null) e.code = code
  return e
}

function describe(err) {
  if (!err) return '操作失败，请重试'
  if (typeof err === 'string') return err
  if (err.code != null && typeof err.code === 'number' && err.code >= 0 && err.code <= 5) {
    return codec.ackText(err.code)
  }
  if (err.errCode != null && ERR_TEXT[err.errCode]) return ERR_TEXT[err.errCode]
  if (err.message) return err.message
  if (err.errMsg) return String(err.errMsg).replace(/^.*?:fail\s*/, '') || '操作失败，请重试'
  return '操作失败，请重试'
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n
}

function nowText() {
  const d = new Date()
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
}

function maskSerial(serial) {
  const s = String(serial || '')
  if (!s) return ''
  return s.length <= 4 ? s : '****' + s.slice(-4)
}

function addLog(text) {
  const line = nowText() + '  ' + String(text || '')
  state.logs.unshift(line)
  if (state.logs.length > MAX_LOG) state.logs.length = MAX_LOG
  emit()
}

function normalizeUuid(uuid) {
  return String(uuid || '').toUpperCase()
}

function isNusService(uuid) {
  return normalizeUuid(uuid).trim().replace(/[-{}]/g, '') === NUS_SERVICE.replace(/-/g, '')
}

function isJhName(name) {
  return /^JH-(PWM|GUN|ROLL)-[A-Z0-9]{4}$/i.test(String(name || '').trim())
}

function modelFromName(name) {
  const m = String(name || '')
    .trim()
    .toUpperCase()
    .match(/^JH-(PWM|GUN|ROLL)-/)
  return m ? m[1] : ''
}

function snapshot() {
  const device = state.device
    ? {
        model: state.device.model,
        firmware: state.device.firmware,
        serial: state.device.serial,
        capsRaw: state.device.capsRaw,
        caps: Object.assign({}, state.device.caps),
        maxLevel: state.device.maxLevel,
        battery: state.device.battery
      }
    : null
  return {
    supported: state.supported,
    adapterReady: state.adapterReady,
    discovering: state.discovering,
    locationEnabled: state.locationEnabled,
    scanStatus: state.scanStatus,
    scanIssue: state.scanIssue,
    scanError: state.scanError,
    scanSeen: state.scanSeen,
    scanMatched: state.scanMatched,
    devices: state.devices.map(d => ({ deviceId: d.deviceId, name: d.name, rssi: d.rssi, model: d.model })),
    connecting: state.connecting,
    connected: state.connected,
    deviceId: state.deviceId,
    deviceName: state.deviceName,
    services: state.services.map(s => ({ uuid: s.uuid, chars: s.chars.map(c => ({ uuid: c.uuid, text: c.text })) })),
    protocolError: state.protocolError,
    canRead: state.canRead,
    canWrite: state.canWrite,
    canNotify: state.canNotify,
    subscribed: state.subscribed,
    mtu: state.mtu,
    lastValue: state.lastValue,
    lastText: state.lastText,
    logs: state.logs.slice(0),
    handshaked: state.handshaked,
    handshakeError: state.handshakeError,
    device: device,
    deviceState: state.deviceState,
    level: state.level,
    mode: state.mode,
    remain: state.remain,
    battery: state.battery,
    error: state.error,
    telemetry: state.telemetry.slice(0),
    reconnecting: state.reconnecting,
    reconnectAttempt: state.reconnectAttempt,
    lastDevice: state.lastDevice ? Object.assign({}, state.lastDevice) : null,
    phase: state.phase
  }
}

function emit() {
  if (emitTimer) return
  emitTimer = setTimeout(() => {
    emitTimer = null
    const snap = snapshot()
    listeners.state.forEach(fn => {
      try {
        fn(snap)
      } catch (e) {}
    })
  }, 0)
}

function emitThrottled() {
  const now = Date.now()
  if (now - lastThrottleAt >= 500) {
    lastThrottleAt = now
    emit()
    return
  }
  if (throttleTimer) return
  throttleTimer = setTimeout(() => {
    throttleTimer = null
    lastThrottleAt = Date.now()
    emit()
  }, 500 - (now - lastThrottleAt))
}

function emitValue(hex, text) {
  listeners.value.forEach(fn => {
    try {
      fn(hex, text)
    } catch (e) {}
  })
}

function onState(fn) {
  if (typeof fn === 'function' && listeners.state.indexOf(fn) === -1) listeners.state.push(fn)
}

function offState(fn) {
  listeners.state = listeners.state.filter(x => x !== fn)
}

function onValue(fn) {
  if (typeof fn === 'function' && listeners.value.indexOf(fn) === -1) listeners.value.push(fn)
}

function offValue(fn) {
  listeners.value = listeners.value.filter(x => x !== fn)
}

/* ---------------- wx Promise 包装 ---------------- */

function wxCall(name, options) {
  return new Promise((resolve, reject) => {
    if (!wxApi || typeof wxApi[name] !== 'function') {
      reject(makeError('当前微信版本不支持 ' + name))
      return
    }
    const opts = Object.assign({}, options || {})
    opts.success = resolve
    opts.fail = err => reject(makeError(describe(err), err && err.errCode))
    try {
      wxApi[name](opts)
    } catch (e) {
      reject(makeError(e && e.message ? e.message : '调用失败'))
    }
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 读取适配器真实状态。
 * 重复调用 openBluetoothAdapter 时微信会走 fail（already opened），
 * 此时以该接口返回的 available 作为唯一判据，避免误判成「蓝牙未开启」。
 */
async function readAdapterState() {
  if (!wxApi || typeof wxApi.getBluetoothAdapterState !== 'function') return null
  try {
    const res = await wxCall('getBluetoothAdapterState')
    return res || null
  } catch (e) {
    return null
  }
}

/** 老基础库没有 getBluetoothAdapterState 时，用错误文案兜底识别「已打开」 */
function isAlreadyOpenError(err) {
  const msg = String((err && (err.errMsg || err.message)) || '').toLowerCase()
  return /already\s+(?:open(?:ed)?|initialized)/.test(msg)
}

/* ---------------- 缓存与设置 ---------------- */

function cacheDevice() {
  if (!state.lastDevice) return
  try {
    wxApi.setStorageSync(CACHE_KEY, {
      deviceId: state.lastDevice.deviceId,
      name: state.lastDevice.name,
      model: state.lastDevice.model || ''
    })
  } catch (e) {}
}

function loadCache() {
  try {
    const cached = wxApi.getStorageSync(CACHE_KEY)
    if (cached && cached.deviceId) state.lastDevice = cached
  } catch (e) {}
}

function readSetting(name) {
  try {
    if (wxApi && typeof wxApi[name] === 'function') return wxApi[name]() || {}
  } catch (e) {}
  return {}
}

function checkScanSettings() {
  const system = readSetting('getSystemSetting')
  const auth = readSetting('getAppAuthorizeSetting')
  const device = wxApi && wxApi.getDeviceInfo ? readSetting('getDeviceInfo') : readSetting('getSystemInfoSync')
  const android = /^Android\s+(\d+)/i.exec(device.system || '')
  state.locationEnabled = typeof system.locationEnabled === 'boolean' ? system.locationEnabled : null

  if (auth.bluetoothAuthorized === 'denied') {
    return { issue: 'bluetooth-permission', text: '请在系统设置中允许微信使用蓝牙或附近设备' }
  }
  if (system.bluetoothEnabled === false) {
    return { issue: 'bluetooth-off', text: ERR_TEXT[10001] }
  }
  if (android && Number(android[1]) <= 11) {
    if (system.locationEnabled === false) {
      return { issue: 'location-off', text: '请开启手机系统定位后重新扫描' }
    }
    if (auth.locationAuthorized === 'denied') {
      return { issue: 'location-permission', text: '请在系统设置中允许微信使用位置权限' }
    }
  }
  return null
}

function openSystemSetting(kind) {
  return wxCall(kind === 'bluetooth' ? 'openSystemBluetoothSetting' : 'openAppAuthorizeSetting')
}

/* ---------------- 适配器与扫描 ---------------- */

function bindEvents() {
  if (eventsBound || !wxApi) return
  eventsBound = true

  wxApi.onBluetoothAdapterStateChange(res => {
    state.adapterReady = !!res.available
    if (!res.available) {
      const wasScanning = !!scanSession
      stopScan()
      if (wasScanning) {
        const setting = checkScanSettings() || { issue: 'bluetooth-off', text: ERR_TEXT[10001] }
        setScanError(setting.issue, setting.text)
      }
      state.devices = []
      clearChannels()
      state.phase = 'idle'
      addLog('蓝牙已关闭')
    }
    emit()
  })

  wxApi.onBluetoothDeviceFound(res => {
    const session = scanSession
    if (session && session.startRequested) collectDevices(session, res && res.devices, true)
  })

  wxApi.onBLEConnectionStateChange(res => {
    if (res.deviceId && state.deviceId && res.deviceId !== state.deviceId) return
    if (res.connected) {
      state.connected = true
      state.connecting = false
      state.phase = state.subscribed ? 'ready' : 'connected'
      emit()
      return
    }
    handleLinkDown(manualClose ? '用户主动断开' : '连接已断开')
  })

  wxApi.onBLECharacteristicValueChange(res => {
    if (state.deviceId && res.deviceId && res.deviceId !== state.deviceId) return
    handleValue(res.value)
  })
}

async function open() {
  if (!supported()) {
    state.supported = false
    emit()
    throw makeError('当前环境不支持蓝牙，请用真机预览')
  }
  if (state.adapterReady) {
    emit()
    return snapshot()
  }
  bindEvents()
  try {
    await wxCall('openBluetoothAdapter', { mode: 'central' })
  } catch (err) {
    // 适配器此前已经打开（如产品页/上次进入时已初始化）时，微信会走 fail 并返回
    // already opened，但蓝牙实际可用，不能当成失败，否则界面会一直停在「蓝牙未开启」
    const probe = await readAdapterState()
    const available = probe ? !!probe.available : isAlreadyOpenError(err)
    if (!available) {
      addLog('打开蓝牙失败：' + describe(err))
      emit()
      throw err
    }
    state.adapterReady = true
    if (!state.connected) state.phase = 'adapter'
    loadCache()
    addLog('蓝牙已处于开启状态')
    emit()
    return snapshot()
  }
  state.adapterReady = true
  if (!state.connected) state.phase = 'adapter'
  loadCache()
  addLog('蓝牙适配器已开启')
  emit()
  return snapshot()
}

function setScanError(issue, text) {
  state.scanStatus = 'error'
  state.scanIssue = issue
  state.scanError = text
  addLog('搜索失败 · ' + text)
}

function collectDevices(session, list, live) {
  if (!Array.isArray(list)) return
  list.forEach(d => {
    if (!d || !d.deviceId || (!live && session.baseline.has(d.deviceId))) return
    session.seen.add(d.deviceId)
    const before = session.matches.get(d.deviceId)
    const names = [d.localName, d.name].map(name => String(name || '').trim())
    const jhName = names.find(isJhName)
    const serviceUuids = Array.isArray(d.advertisServiceUUIDs) ? d.advertisServiceUUIDs : []
    const advertised = serviceUuids.some(isNusService) || Object.keys(d.serviceData || {}).some(isNusService)
    if (!before && !jhName && !advertised) return

    const previous = before || {}
    const canUpdate = live || !previous.live
    const incomingRssi = typeof d.RSSI === 'number' && d.RSSI < 0 && d.RSSI >= -127 ? d.RSSI : null
    const model = jhName && (canUpdate || !previous.model) ? modelFromName(jhName) : previous.model || ''
    const name = jhName && (canUpdate || !previous.model) ? jhName : previous.name || names.find(Boolean) || '健衡设备'
    session.matches.set(d.deviceId, {
      deviceId: d.deviceId,
      name,
      model,
      rssi: canUpdate && incomingRssi !== null ? incomingRssi : previous.rssi || null,
      live: live || previous.live
    })
  })
  if (!session.emitTimer) {
    session.emitTimer = setTimeout(() => {
      session.emitTimer = null
      if (scanSession === session) publishScan(session)
    }, 200)
  }
}

function publishScan(session) {
  state.scanSeen = session.seen.size
  state.scanMatched = session.matches.size
  state.devices = Array.from(session.matches.values())
    .sort((a, b) => (b.rssi || -Infinity) - (a.rssi || -Infinity))
    .slice(0, SCAN_LIMIT)
  emit()
}

async function readDiscoveredDevices() {
  if (!wxApi || typeof wxApi.getBluetoothDevices !== 'function') return []
  let timer
  try {
    const res = await Promise.race([
      wxCall('getBluetoothDevices'),
      new Promise(resolve => { timer = setTimeout(() => resolve({}), SCAN_CACHE_TIMEOUT) })
    ])
    return Array.isArray(res.devices) ? res.devices : []
  } catch (e) {
    return []
  } finally {
    clearTimeout(timer)
  }
}

function stopScan() {
  const session = scanSession
  if (!session) return scanStop || Promise.resolve()
  scanSession = null
  clearTimeout(session.timeout)
  clearTimeout(session.emitTimer)
  clearInterval(session.cacheTimer)
  publishScan(session)
  state.discovering = false
  state.scanStatus = 'finished'
  if (state.phase === 'scanning') state.phase = state.adapterReady ? 'adapter' : 'idle'
  if (session.startRequested) {
    addLog('搜索结束 · 发现 ' + state.scanSeen + ' 台 BLE 设备，匹配 ' + state.scanMatched + ' 台')
  }
  const ending = session.started.catch(() => {}).then(async () => {
    if (session.startRequested && state.adapterReady) {
      try {
        await wxCall('stopBluetoothDevicesDiscovery')
      } catch (e) {}
    }
  })
  const stopped = ending.then(() => {
    if (scanStop === stopped) scanStop = null
  })
  scanStop = stopped
  emit()
  return scanStop
}

function startScan() {
  if (scanSession) return scanSession.started
  const previousStop = scanStop
  const session = { seen: new Set(), matches: new Map(), baseline: new Set(), startRequested: false }
  scanSession = session
  state.scanStatus = 'starting'
  state.scanIssue = ''
  state.scanError = ''
  state.scanSeen = 0
  state.scanMatched = 0
  state.devices = []
  emit()
  session.started = beginScan(session, previousStop).catch(err => {
    if (scanSession !== session) return snapshot()
    scanSession = null
    clearTimeout(session.emitTimer)
    publishScan(session)
    const setting = checkScanSettings()
    if (setting) {
      setScanError(setting.issue, setting.text)
    } else {
      const issue = !state.supported ? 'unsupported' : Number(err.code) === 10001 ? 'bluetooth-off' : 'scan-failed'
      setScanError(issue, describe(err))
    }
    throw err
  })
  return session.started
}

async function beginScan(session, previousStop) {
  await previousStop
  if (scanSession !== session) return snapshot()
  const setting = wxApi && checkScanSettings()
  if (setting) throw makeError(setting.text)
  await open()
  if (scanSession !== session) return snapshot()

  // getBluetoothDevices 包含适配器历史缓存，先记录基线以免下一轮把旧设备当新结果。
  const cached = await readDiscoveredDevices()
  if (scanSession !== session) return snapshot()
  session.baseline = new Set(cached.filter(d => d && d.deviceId).map(d => d.deviceId))
  session.startRequested = true
  try {
    await wxCall('startBluetoothDevicesDiscovery', { allowDuplicatesKey: true, interval: 0 })
  } catch (err) {
    const probe = await readAdapterState()
    if (!probe || !probe.available || !probe.discovering) throw err
  }
  if (scanSession !== session) return snapshot()

  state.discovering = true
  state.scanStatus = 'scanning'
  if (!state.connected) state.phase = 'scanning'
  addLog('开始搜索附近 BLE 设备')
  session.cacheTimer = setInterval(async () => {
    const list = await readDiscoveredDevices()
    if (scanSession === session) collectDevices(session, list, false)
  }, SCAN_CACHE_INTERVAL)
  session.timeout = setTimeout(() => {
    stopScan()
    if (!session.seen.size) {
      const setting = checkScanSettings()
      if (setting) setScanError(setting.issue, setting.text)
    }
  }, SCAN_TIMEOUT)
  return snapshot()
}

/* ---------------- 连接、服务与通道 ---------------- */

async function setMtu() {
  state.mtu = 20
  if (!wxApi.setBLEMTU || !state.deviceId) return
  try {
    await new Promise((resolve, reject) => {
      wxApi.setBLEMTU({
        deviceId: state.deviceId,
        mtu: 247,
        success: resolve,
        fail: reject
      })
    })
    state.mtu = 247
    addLog('MTU 已设置为 247')
  } catch (e) {
    state.mtu = 20
    addLog('MTU 协商失败，回退 20 字节')
  }
  emit()
}

function propsText(props) {
  const list = []
  if (!props) return ''
  if (props.read) list.push('读')
  if (props.write) list.push('写')
  if (props.writeNoResponse) list.push('无响应写')
  if (props.notify) list.push('通知')
  if (props.indicate) list.push('指示')
  return list.join('/')
}

async function discover() {
  if (!state.connected || !state.deviceId) throw makeError('请先连接设备')
  const res = await wxCall('getBLEDeviceServices', { deviceId: state.deviceId })
  const services = []
  const list = (res.services || []).filter(s => s.isPrimary !== false)
  for (let i = 0; i < list.length; i++) {
    const svc = list[i]
    const uuid = normalizeUuid(svc.uuid)
    let chars = []
    try {
      const cr = await wxCall('getBLEDeviceCharacteristics', {
        deviceId: state.deviceId,
        serviceId: svc.uuid
      })
      chars = (cr.characteristics || []).map(c => ({
        uuid: normalizeUuid(c.uuid),
        rawUuid: c.uuid,
        props: c.properties || {},
        text: propsText(c.properties)
      }))
    } catch (e) {
      chars = []
    }
    services.push({ uuid: uuid, rawUuid: svc.uuid, chars: chars })
  }
  state.services = services

  const nus = services.find(s => s.uuid === NUS_SERVICE)
  state.readChar = null
  state.writeChar = null
  state.notifyChar = null
  readChar = null
  batteryChar = null

  if (!nus) {
    state.protocolError = '设备固件不支持当前协议'
    state.canRead = false
    state.canWrite = false
    state.canNotify = false
    addLog('未找到 NUS 服务，固件协议不匹配')
    emit()
    return services
  }

  state.protocolError = ''
  const rx = nus.chars.find(c => c.uuid === NUS_RX) || nus.chars.find(c => c.props.write || c.props.writeNoResponse)
  const tx = nus.chars.find(c => c.uuid === NUS_TX) || nus.chars.find(c => c.props.notify || c.props.indicate)
  state.nusServiceId = nus.rawUuid || nus.uuid
  state.writeChar = rx || null
  state.notifyChar = tx || null
  readChar = nus.chars.find(c => c.props.read) || null
  const battery = findBatteryChar(services)
  state.canWrite = !!rx
  state.canNotify = !!tx
  state.canRead = !!(readChar || battery)

  addLog(
    '服务已读取：RX ' +
      (rx ? rx.uuid.slice(4, 8) : '无') +
      ' / TX ' +
      (tx ? tx.uuid.slice(4, 8) : '无')
  )
  state.phase = 'channels'
  emit()
  return services
}

function findBatteryChar(services) {
  const svc = (services || state.services).find(s => s.uuid === BATTERY_SERVICE)
  if (!svc) return null
  const c = svc.chars.find(x => x.uuid === BATTERY_CHAR) || svc.chars[0]
  if (c) batteryChar = c
  return c || null
}

async function connect(deviceId, name, options) {
  if (!deviceId) throw makeError('设备标识为空，请重新搜索')
  const opts = options || {}
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (!opts.reconnect) {
    state.reconnecting = false
    state.reconnectAttempt = 0
  }
  await open()
  await stopScan()

  if (state.connected && state.deviceId === deviceId) {
    emit()
    return snapshot()
  }
  if (state.connected) {
    await disconnect({ silent: true })
  }

  manualClose = false
  state.connecting = true
  state.connected = false
  state.deviceId = deviceId
  state.deviceName = name || ''
  state.handshaked = false
  state.subscribed = false
  state.protocolError = ''
  state.phase = 'connecting'
  addLog('正在连接 ' + (name || deviceId))
  emit()

  try {
    await wxCall('createBLEConnection', { deviceId: deviceId, timeout: 12000 })
  } catch (e) {
    state.connecting = false
    state.phase = 'adapter'
    addLog('连接失败：' + describe(e))
    emit()
    throw e
  }

  state.connected = true
  state.connecting = false
  state.phase = 'connected'
  state.lastDevice = { deviceId: deviceId, name: name || '', model: modelFromName(name || '') }
  addLog('已连接，开始读取服务')
  emit()

  await setMtu()
  try {
    await discover()
  } catch (e) {
    addLog('读取服务失败：' + describe(e))
  }

  if (state.canNotify) {
    try {
      await subscribe()
    } catch (e) {
      addLog('订阅失败：' + describe(e))
    }
  }

  cacheDevice()
  emit()
  return snapshot()
}

async function reconnect() {
  const target = state.lastDevice
  if (!target || !target.deviceId) throw makeError('还没有连接过设备')
  return connect(target.deviceId, target.name, { reconnect: true })
}

async function disconnect(options) {
  const opts = options || {}
  const wasConnected = state.connected
  manualClose = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  state.reconnecting = false
  state.reconnectAttempt = 0
  clearHeartbeat()
  rejectPending('连接已断开')
  if (state.deviceId) {
    try {
      await wxCall('closeBLEConnection', { deviceId: state.deviceId })
    } catch (e) {}
  }
  clearChannels()
  if (wasConnected && !opts.silent) addLog('已断开连接')
  state.phase = state.adapterReady ? 'adapter' : 'idle'
  emit()
}

function clearChannels() {
  state.connected = false
  state.connecting = false
  state.subscribed = false
  state.handshaked = false
  state.services = []
  state.canRead = false
  state.canWrite = false
  state.canNotify = false
  state.readChar = null
  state.writeChar = null
  state.notifyChar = null
  state.device = null
  state.deviceState = 0
  state.level = 0
  state.mode = 0
  state.remain = 0
  state.battery = 0
  state.error = 0
  state.telemetry = []
  readChar = null
  batteryChar = null
  rxBuffer = new Uint8Array(0)
  clearHeartbeat()
  rejectPending('连接已断开')
}

async function close() {
  await stopScan()
  manualClose = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  state.reconnecting = false
  state.reconnectAttempt = 0
  clearChannels()
  try {
    if (state.adapterReady) await wxCall('closeBluetoothAdapter')
  } catch (e) {}
  state.adapterReady = false
  state.discovering = false
  state.devices = []
  state.phase = 'idle'
  addLog('蓝牙已关闭')
  emit()
}

/* ---------------- 订阅与发送 ---------------- */

async function subscribe() {
  if (!state.connected) throw makeError('请先连接设备')
  if (!state.notifyChar) throw makeError('设备固件不支持当前协议')
  await wxCall('notifyBLECharacteristicValueChange', {
    state: true,
    deviceId: state.deviceId,
    serviceId: state.nusServiceId || NUS_SERVICE,
    characteristicId: state.notifyChar.rawUuid || state.notifyChar.uuid
  })
  state.subscribed = true
  state.phase = 'subscribed'
  addLog('已订阅 TX 通知，准备握手')
  emit()
  hello().catch(e => {
    state.handshakeError = describe(e)
    addLog('握手失败：' + describe(e))
    emit()
  })
  return snapshot()
}

function nextSeq() {
  seq = (seq + 1) & 0xff
  return seq
}

async function writeBytes(bytes) {
  if (!state.writeChar) throw makeError('没有可写特征')
  const total = bytes.length
  let offset = 0
  const mtuChunk = state.mtu > 23 ? state.mtu - 3 : 20
  const chunkSize = Math.max(20, Math.min(244, mtuChunk))
  while (offset < total) {
    const end = Math.min(offset + chunkSize, total)
    const chunk = bytes.slice(offset, end)
    const buffer = codec.toArrayBuffer(chunk)
    await Promise.race([
      wxCall('writeBLECharacteristicValue', {
        deviceId: state.deviceId,
        serviceId: state.nusServiceId || NUS_SERVICE,
        characteristicId: state.writeChar.rawUuid || state.writeChar.uuid,
        value: buffer
      }),
      new Promise((resolve, reject) => {
        setTimeout(() => reject(makeError('写入超时')), WRITE_TIMEOUT)
      })
    ])
    offset = end
    if (offset < total) await sleep(12)
  }
}

function pump() {
  if (writing) return
  const item = writeQueue.shift()
  if (!item) return
  writing = true
  writeBytes(item.bytes)
    .then(() => item.resolve())
    .catch(err => item.reject(err))
    .then(() => {
      writing = false
      pump()
    })
}

function enqueueWrite(bytes, priority, meta) {
  return new Promise((resolve, reject) => {
    const item = { bytes: bytes, resolve: resolve, reject: reject, meta: meta || null }
    if (priority) writeQueue.unshift(item)
    else writeQueue.push(item)
    pump()
  })
}

function pendingList() {
  return Object.keys(pending).map(k => pending[k])
}

function rejectPending(message) {
  pendingList().forEach(p => {
    clearTimeout(p.timer)
    try {
      p.reject(makeError(message))
    } catch (e) {}
  })
  pending = {}
}

function settlePending(seqAck, code, fromCmd) {
  const p = pending[seqAck]
  if (!p) return false
  if (p.kind === 'hello' && fromCmd !== codec.CMD.HELLO_ACK) return false
  if (p.kind === 'pong' && fromCmd === codec.CMD.ACK && code !== 0) return false
  clearTimeout(p.timer)
  delete pending[seqAck]
  if (code === 0) p.resolve({ seq: seqAck, code: 0 })
  else if (code === codec.ACK_CODE.BAD_FRAME && p.retries > 0) {
    p.retries -= 1
    resend(p)
  } else if (code === codec.ACK_CODE.BUSY && p.retries > 0) {
    p.retries -= 1
    setTimeout(() => resend(p), 300)
  } else {
    p.reject(makeError(codec.ackText(code), code))
  }
  return true
}

function resend(p) {
  if (!p.frame) return
  pending[p.seq] = p
  p.timer = setTimeout(() => onPendingTimeout(p), p.timeout)
  enqueueWrite(p.frame.bytes, false).catch(err => {
    clearTimeout(p.timer)
    delete pending[p.seq]
    p.reject(err)
  })
}

function onPendingTimeout(p) {
  if (pending[p.seq] !== p) return
  if (p.retries > 0) {
    p.retries -= 1
    resend(p)
    return
  }
  delete pending[p.seq]
  p.reject(makeError(p.timeoutMessage || '操作超时，请重试'))
}

function sendFrame(cmd, tlvs, opts) {
  const o = opts || {}
  if (!state.connected) return Promise.reject(makeError('请先连接设备'))
  if (!state.canWrite) return Promise.reject(makeError('设备固件不支持当前协议'))
  const s = nextSeq()
  const frame = codec.encode(cmd, s, tlvs || [])
  const wait = o.expect || 'none'

  if (wait === 'none') {
    return enqueueWrite(frame.bytes, o.priority, { cmd: cmd, seq: s }).then(() => ({ cmd: cmd, seq: s, frame: frame }))
  }

  return new Promise((resolve, reject) => {
    const p = {
      seq: s,
      kind: wait,
      resolve: resolve,
      reject: reject,
      frame: frame,
      retries: wait === 'ack' ? 1 : 0,
      timeout: o.timeout || (wait === 'hello' ? HELLO_TIMEOUT : wait === 'pong' ? PONG_TIMEOUT : ACK_TIMEOUT),
      timeoutMessage: o.timeoutMessage || '设备未响应，请重试',
      timer: null
    }
    pending[s] = p
    p.timer = setTimeout(() => onPendingTimeout(p), p.timeout)
    enqueueWrite(frame.bytes, o.priority, { cmd: cmd, seq: s }).catch(err => {
      clearTimeout(p.timer)
      delete pending[s]
      reject(err)
    })
  })
}

function checkReady(needHandshake) {
  if (!state.connected) throw makeError('请先连接设备')
  if (!state.subscribed) throw makeError('请先订阅数据通道')
  if (needHandshake && !state.handshaked) throw makeError('设备尚未完成握手')
}

/* ---------------- 指令 ---------------- */

async function hello() {
  if (!state.connected) throw makeError('请先连接设备')
  if (!state.canWrite) throw makeError('设备固件不支持当前协议')
  addLog('发送 HELLO 握手')
  const appVer = [1, 0, 0]
  try {
    await sendFrame(codec.CMD.HELLO, [
      { tag: codec.TAG.PROTO, type: 'u8', value: 1 },
      { tag: codec.TAG.CLIENT, type: 'u8', value: 1 },
      { tag: codec.TAG.APP_VER, bytes: appVer }
    ], { expect: 'hello', timeout: HELLO_TIMEOUT, timeoutMessage: '设备未响应，请重试' })
    return snapshot()
  } catch (e) {
    state.handshakeError = describe(e)
    emit()
    throw e
  }
}

function startControl(opts) {
  try {
    checkReady(true)
  } catch (e) {
    return Promise.reject(e)
  }
  const o = opts || {}
  const mode = o.mode || 0
  const level = o.level || 1
  const duration = o.duration || 600
  const maxLevel = (state.device && state.device.maxLevel) || 5
  if (level < 1 || level > maxLevel) return Promise.reject(makeError('档位超出设备范围'))
  if (duration < 60 || duration > 3600) return Promise.reject(makeError('时长需在 1–60 分钟之间'))
  return sendFrame(codec.CMD.START, [
    { tag: codec.TAG.MODE, type: 'u8', value: mode },
    { tag: codec.TAG.LEVEL, type: 'u8', value: level },
    { tag: codec.TAG.DURATION, type: 'u16', value: duration }
  ], { expect: 'ack', timeout: ACK_TIMEOUT })
    .then(res => {
      state.deviceState = codec.DEVICE_STATE.RUNNING
      state.level = level
      state.mode = mode
      state.remain = duration
      emit()
      return res
    })
}

function stopControl() {
  try {
    checkReady(true)
  } catch (e) {
    return Promise.reject(e)
  }
  // 先撤销尚未写出的控制帧，避免 STOP 之后又把 START 发出去
  const kept = []
  writeQueue.forEach(item => {
    const cmd = item.meta && item.meta.cmd
    if (cmd && cmd !== codec.CMD.STOP) {
      const seqNo = item.meta.seq
      if (pending[seqNo]) {
        clearTimeout(pending[seqNo].timer)
        delete pending[seqNo]
      }
      try {
        item.reject(makeError('已被停止指令取消'))
      } catch (e) {}
    } else {
      kept.push(item)
    }
  })
  writeQueue = kept
  // STOP 清空在途控制指令，优先发送
  Object.keys(pending).forEach(k => {
    const p = pending[k]
    if (p.kind === 'ack') {
      clearTimeout(p.timer)
      delete pending[k]
      try {
        p.reject(makeError('已被停止指令取消'))
      } catch (e) {}
    }
  })
  return sendFrame(codec.CMD.STOP, [], {
    expect: 'ack',
    priority: true,
    timeout: ACK_TIMEOUT,
    timeoutMessage: '停止指令未响应，请重试'
  }).then(res => {
    state.deviceState = codec.DEVICE_STATE.IDLE
    state.remain = 0
    emit()
    return res
  })
}

function setLevel(level) {
  try {
    checkReady(true)
  } catch (e) {
    return Promise.reject(e)
  }
  const max = (state.device && state.device.maxLevel) || 99
  if (!(level >= 1 && level <= max)) return Promise.reject(makeError('档位超出设备范围'))
  return sendFrame(codec.CMD.SET_LEVEL, [{ tag: codec.TAG.LEVEL, type: 'u8', value: level }], {
    expect: 'ack',
    timeout: ACK_TIMEOUT
  }).then(res => {
    state.level = level
    emit()
    return res
  })
}

function pauseControl() {
  try {
    checkReady(true)
  } catch (e) {
    return Promise.reject(e)
  }
  return sendFrame(codec.CMD.PAUSE, [], { expect: 'ack', timeout: ACK_TIMEOUT }).then(res => {
    state.deviceState = codec.DEVICE_STATE.PAUSED
    emit()
    return res
  })
}

function resumeControl() {
  try {
    checkReady(true)
  } catch (e) {
    return Promise.reject(e)
  }
  return sendFrame(codec.CMD.RESUME, [], { expect: 'ack', timeout: ACK_TIMEOUT }).then(res => {
    state.deviceState = codec.DEVICE_STATE.RUNNING
    emit()
    return res
  })
}

function ping() {
  if (!state.connected || !state.canWrite) return Promise.reject(makeError('未连接'))
  return sendFrame(codec.CMD.PING, [], {
    expect: 'pong',
    timeout: PONG_TIMEOUT,
    timeoutMessage: '心跳超时'
  })
}

/* ---------------- 接收与解析 ---------------- */

function handleValue(value) {
  const bytes = new Uint8Array(value)
  state.lastValue = codec.hex(bytes)
  state.lastText = printable(bytes)
  emitValue(state.lastValue, state.lastText)

  const merged = codec.concat([rxBuffer, bytes])
  rxBuffer = merged.length > 2048 ? merged.slice(merged.length - 2048) : merged
  const result = codec.decodeStream(rxBuffer)
  rxBuffer = result.rest

  result.frames.forEach(frame => handleFrame(frame))
  emitThrottled()
}

function printable(bytes) {
  let ok = bytes.length > 0
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b < 0x20 || b > 0x7e) {
      ok = false
      break
    }
  }
  return ok ? codec.utf8Text(bytes) : ''
}

function handleFrame(frame) {
  const cmd = frame.cmd
  const payload = frame.payload
  const parsed = codec.parsePayload(cmd, payload)

  if (cmd === codec.CMD.HELLO_ACK) {
    const caps = codec.capsOf(parsed.caps)
    state.device = {
      model: parsed.model,
      firmware: parsed.firmware,
      serial: parsed.serial,
      capsRaw: parsed.caps,
      caps: caps,
      maxLevel: parsed.maxLevel || 0,
      battery: parsed.battery || 0
    }
    state.handshaked = true
    state.handshakeError = ''
    state.battery = parsed.battery || 0
    if (!state.level) state.level = 1
    state.phase = 'ready'
    if (state.lastDevice) state.lastDevice.model = parsed.model
    cacheDevice()
    addLog('握手成功：' + codec.modelText(parsed.model) + ' / 固件 ' + (parsed.firmware || '-') + ' / 电量 ' + (parsed.battery || 0) + '%')
    startHeartbeat()
    // 少数固件不回声 Seq：HELLO_ACK 未匹配到时，补偿完成最早的在途握手
    if (!settlePending(frame.seq, 0, cmd)) {
      const helloKey = Object.keys(pending).find(k => pending[k].kind === 'hello')
      if (helloKey) settlePending(Number(helloKey), 0, cmd)
    }
    emit()
    return
  }

  if (cmd === codec.CMD.ACK) {
    const ack = parsed
    addLog('ACK seq=' + ack.seqAck + ' code=' + ack.code)
    settlePending(ack.seqAck, ack.code, cmd)
    emit()
    return
  }

  if (cmd === codec.CMD.STATE) {
    state.deviceState = parsed.state
    // 空闲态回传的 mode/level 是设备记忆值，不覆盖用户正在选择的档位
    if (parsed.state !== codec.DEVICE_STATE.IDLE) {
      state.mode = parsed.mode
      state.level = parsed.level || state.level
    }
    state.remain = parsed.remain || 0
    state.battery = parsed.battery || state.battery
    state.error = parsed.error || 0
    if (parsed.state === codec.DEVICE_STATE.FAULT) {
      addLog('设备故障：' + codec.faultText(parsed.error))
      state.phase = 'fault'
    } else if (parsed.state === codec.DEVICE_STATE.RUNNING) {
      state.phase = 'running'
    } else if (parsed.state === codec.DEVICE_STATE.PAUSED) {
      state.phase = 'paused'
    } else if (state.handshaked) {
      state.phase = 'ready'
    }
    emitThrottled()
    return
  }

  if (cmd === codec.CMD.TELEMETRY) {
    const item = { metric: parsed.metric, value: parsed.value, at: Date.now() }
    state.telemetry.unshift(item)
    if (state.telemetry.length > 6) state.telemetry.length = 6
    emitThrottled()
    return
  }

  if (cmd === codec.CMD.PONG) {
    heartbeatMissed = 0
    if (parsed.battery) state.battery = parsed.battery
    if (parsed.state != null) state.deviceState = parsed.state
    settlePending(frame.seq, 0, cmd)
    emitThrottled()
    return
  }

  if (cmd === codec.CMD.ERROR) {
    state.error = parsed.error || 0
    state.deviceState = codec.DEVICE_STATE.FAULT
    state.phase = 'fault'
    addLog('设备错误：' + codec.faultText(parsed.error))
    emit()
    return
  }

  addLog('收到 ' + codec.cmdName(cmd) + ' ' + codec.hex(payload).slice(0, 48))
}

function handleLinkDown(reason) {
  const wasConnected = state.connected
  const shouldReconnect = wasConnected && !manualClose && !!state.lastDevice
  clearChannels()
  state.phase = state.adapterReady ? 'adapter' : 'idle'
  if (wasConnected) addLog(reason + '，设备将自动停止')
  emit()
  if (shouldReconnect) scheduleReconnect()
}

function clearHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  heartbeatMissed = 0
}

function startHeartbeat() {
  clearHeartbeat()
  heartbeatTimer = setInterval(() => {
    if (!state.connected || !state.handshaked) return
    ping()
      .then(() => {
        heartbeatMissed = 0
      })
      .catch(() => {
        heartbeatMissed += 1
        addLog('心跳无响应 ' + heartbeatMissed + '/3')
        if (heartbeatMissed >= 3) {
          addLog('心跳超时，主动断开并重连')
          const devId = state.deviceId
          manualClose = false
          try {
            wxApi.closeBLEConnection({ deviceId: devId })
          } catch (e) {}
          handleLinkDown('心跳超时')
        }
      })
  }, 5000)
}

function scheduleReconnect() {
  if (!state.lastDevice || state.reconnecting) return
  state.reconnecting = true
  state.reconnectAttempt = 0
  emit()

  const attempt = () => {
    if (state.reconnectAttempt >= 3) {
      state.reconnecting = false
      addLog('重连失败，请手动重新连接')
      emit()
      return
    }
    const delays = [1000, 2000, 4000]
    const delay = delays[state.reconnectAttempt]
    state.reconnectAttempt += 1
    const current = state.reconnectAttempt
    addLog('第 ' + current + ' 次重连将在 ' + delay / 1000 + 's 后开始')
    emit()
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect(state.lastDevice.deviceId, state.lastDevice.name, { reconnect: true })
        .then(() => {
          state.reconnecting = false
          emit()
        })
        .catch(err => {
          addLog('重连失败：' + describe(err))
          attempt()
        })
    }, delay)
  }
  attempt()
}

/* ---------------- 原始发送（联调） ---------------- */

function sendHex(hexStr, label) {
  const bytes = codec.fromHex(hexStr)
  if (!bytes.length) return Promise.reject(makeError('HEX 内容为空'))
  if (!state.connected || !state.canWrite) return Promise.reject(makeError('请先连接设备'))
  addLog('发送 HEX ' + (label || '') + ' ' + codec.hex(bytes))
  return enqueueWrite(bytes, false)
}

function sendText(text, label) {
  if (!state.connected || !state.canWrite) return Promise.reject(makeError('请先连接设备'))
  const bytes = new Uint8Array(codec.utf8Bytes(text))
  addLog('发送文本 ' + (label || '') + ' ' + text)
  return enqueueWrite(bytes, false)
}

async function readValue() {
  if (!state.connected) throw makeError('请先连接设备')
  const target = batteryChar || readChar
  if (!target) throw makeError('该设备没有可读特征')
  const service = serviceOf(target.uuid)
  if (!service) throw makeError('服务不存在，请刷新服务')
  const res = await wxCall('readBLECharacteristicValue', {
    deviceId: state.deviceId,
    serviceId: service.rawUuid || service.uuid,
    characteristicId: target.rawUuid || target.uuid
  })
  // 电池特征（0x2A19）首字节为百分比
  if (target.uuid === BATTERY_CHAR && res && res.value) {
    const bytes = new Uint8Array(res.value)
    if (bytes.length) {
      state.battery = bytes[0]
      emit()
    }
  }
  return res
}

function serviceOf(charUuid) {
  return state.services.find(s => s.chars.some(c => c.uuid === charUuid))
}

function clearLog() {
  state.logs = []
  emit()
}

module.exports = {
  isSupported: isSupported,
  describe: describe,
  snapshot: snapshot,
  onState: onState,
  offState: offState,
  onValue: onValue,
  offValue: offValue,
  open: open,
  close: close,
  startScan: startScan,
  stopScan: stopScan,
  connect: connect,
  reconnect: reconnect,
  disconnect: disconnect,
  discover: discover,
  subscribe: subscribe,
  readValue: readValue,
  hello: hello,
  start: startControl,
  stop: stopControl,
  setLevel: setLevel,
  pause: pauseControl,
  resume: resumeControl,
  sendHex: sendHex,
  sendText: sendText,
  clearLog: clearLog,
  openSystemSetting: openSystemSetting,
  cacheKey: CACHE_KEY
}
