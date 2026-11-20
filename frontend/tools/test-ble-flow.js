/**
 * BLE 链路联调（模拟 wx BLE + 模拟 ESP32 固件）：node tools/test-ble-flow.js
 * 覆盖：扫描过滤 -> 连接 -> 发现 NUS -> 订阅 -> HELLO 握手 -> START/STOP -> STATE 遥测。
 */

const assert = require('assert')
const codec = require('../utils/ble-codec')

const DEVICE_ID = 'AA:BB:CC:DD:EE:01'
const DEVICE_NAME = 'JH-PWM-A1B2'
const NUS = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'
const RX = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'
const TX = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'
const BAT = '0000180F-0000-1000-8000-00805F9B34FB'
const BATCHAR = '00002A19-0000-1000-8000-00805F9B34FB'

let valueListener = null
let written = []
let connected = false
let subscribed = false
let ackMode = 0
let systemSetting = { bluetoothEnabled: true, locationEnabled: true }
let appSetting = { bluetoothAuthorized: 'authorized', locationAuthorized: 'authorized' }
let platform = 'Android 13'
let cache = []
let nativeStarts = 0
let nativeStops = 0

function respond(frame) {
  if (!subscribed) return
  const seq = frame.seq
  let out = null
  if (frame.cmd === codec.CMD.HELLO) {
    out = codec.encode(codec.CMD.HELLO_ACK, seq, [
      { tag: codec.TAG.MODEL, type: 'str', value: 'PWM' },
      { tag: codec.TAG.FIRMWARE, type: 'str', value: '1.0.3' },
      { tag: codec.TAG.SERIAL, type: 'str', value: 'JHPWM20260001' },
      { tag: codec.TAG.CAPS, type: 'u16', value: 0x3f },
      { tag: codec.TAG.BATTERY, type: 'u8', value: 76 },
      { tag: codec.TAG.MAX_LEVEL, type: 'u8', value: 5 }
    ])
  } else if (frame.cmd === codec.CMD.PING) {
    out = codec.encode(codec.CMD.PONG, seq, [
      { tag: codec.TAG.BATTERY, type: 'u8', value: 75 },
      { tag: codec.TAG.STATE, type: 'u8', value: 1 }
    ])
  } else if (
    frame.cmd === codec.CMD.START ||
    frame.cmd === codec.CMD.STOP ||
    frame.cmd === codec.CMD.SET_LEVEL ||
    frame.cmd === codec.CMD.PAUSE ||
    frame.cmd === codec.CMD.RESUME
  ) {
    out = codec.encode(codec.CMD.ACK, seq, [
      { tag: codec.TAG.SEQ_ACK, type: 'u8', value: seq },
      { tag: codec.TAG.CODE, type: 'u8', value: ackMode }
    ])
  }
  if (!out) return
  const value = out.buffer
  setTimeout(() => {
    if (valueListener) {
      valueListener({ deviceId: DEVICE_ID, serviceId: NUS, characteristicId: TX, value: value })
    }
  }, 5)
}

const wx = {
  canIUse() {
    return true
  },
  getSystemSetting() {
    return systemSetting
  },
  getAppAuthorizeSetting() {
    return appSetting
  },
  getDeviceInfo() {
    return { system: platform }
  },
  openSystemBluetoothSetting() {},
  getStorageSync() {
    return ''
  },
  setStorageSync() {},
  removeStorageSync() {},
  openBluetoothAdapter(opts) {
    setTimeout(() => {
      opts && opts.success && opts.success({})
    }, 2)
  },
  closeBluetoothAdapter(opts) {
    connected = false
    setTimeout(() => opts && opts.success && opts.success({}), 2)
  },
  getBluetoothAdapterState(opts) {
    setTimeout(() => opts.success({ available: true, discovering: false }), 2)
  },
  startBluetoothDevicesDiscovery(opts) {
    nativeStarts += 1
    assert.strictEqual(opts.allowDuplicatesKey, true)
    assert.strictEqual(opts.services, undefined)
    setTimeout(() => opts && opts.success && opts.success({}), 2)
  },
  stopBluetoothDevicesDiscovery(opts) {
    nativeStops += 1
    setTimeout(() => opts && opts.success && opts.success({}), 2)
  },
  getBluetoothDevices(opts) {
    setTimeout(() => opts.success({ devices: cache.slice() }), 2)
  },
  onBluetoothAdapterStateChange(cb) {
    wx._adapterCb = cb
  },
  onBluetoothDeviceFound(cb) {
    wx._foundCb = cb
  },
  offBluetoothDeviceFound() {},
  offBluetoothAdapterStateChange() {},
  createBLEConnection(opts) {
    setTimeout(() => {
      connected = true
      opts.success({})
    }, 5)
  },
  closeBLEConnection(opts) {
    connected = false
    setTimeout(() => opts.success({}), 2)
  },
  setBLEMTU(opts) {
    setTimeout(() => opts.success({ mtu: 247 }), 2)
  },
  getBLEDeviceServices(opts) {
    setTimeout(
      () =>
        opts.success({
          services: [
            { uuid: BAT, isPrimary: true },
            { uuid: NUS, isPrimary: true }
          ]
        }),
      2
    )
  },
  getBLEDeviceCharacteristics(opts) {
    const list =
      opts.serviceId === NUS
        ? [
            { uuid: RX, properties: { write: true, writeNoResponse: true } },
            { uuid: TX, properties: { notify: true } }
          ]
        : [{ uuid: BATCHAR, properties: { read: true } }]
    setTimeout(() => opts.success({ characteristics: list }), 2)
  },
  notifyBLECharacteristicValueChange(opts) {
    subscribed = true
    setTimeout(() => opts.success({}), 2)
  },
  onBLECharacteristicValueChange(cb) {
    valueListener = cb
  },
  offBLECharacteristicValueChange() {},
  onBLEConnectionStateChange(cb) {
    wx._connCb = cb
  },
  offBLEConnectionStateChange() {},
  readBLECharacteristicValue(opts) {
    setTimeout(() => opts.success({ value: new Uint8Array([72]).buffer }), 2)
  },
  writeBLECharacteristicValue(opts) {
    const bytes = new Uint8Array(opts.value)
    written.push(bytes)
    const d = codec.decode(bytes)
    assert.strictEqual(d.ok, true, 'firmware should decode written frame')
    // 模拟分片：一帧可能被拆成多片，这里只按完整帧响应
    setTimeout(() => {
      opts.success({})
      respond(d.frame)
    }, 1)
  }
}

global.wx = wx

const ble = require('../utils/ble')

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  console.log('BLE flow')
  assert.strictEqual(ble.isSupported(), true)

  const states = []
  ble.onState(s => states.push(s))

  await ble.open()
  assert.strictEqual(ble.snapshot().adapterReady, true)
  console.log('  ok  适配器已开启')

  await ble.startScan()
  wx._foundCb({
    devices: [
      { deviceId: 'other-1', name: 'Xiaomi Band', RSSI: -30 },
      { deviceId: DEVICE_ID, name: '旧名称', localName: DEVICE_NAME, RSSI: -55 },
      { deviceId: DEVICE_ID, RSSI: -50 },
      { deviceId: 'nus-only', serviceData: { [NUS.toLowerCase().replace(/-/g, '')]: {} }, RSSI: -70 },
      { deviceId: 'gun', name: 'JH-GUN-B1B2', RSSI: -65 }
    ]
  })
  await sleep(320)
  const scan = ble.snapshot()
  assert.strictEqual(scan.scanSeen, 4)
  assert.strictEqual(scan.devices.length, 3, 'JH broadcast name or NUS service kept')
  assert.strictEqual(scan.devices[0].deviceId, DEVICE_ID)
  assert.strictEqual(scan.devices[0].name, DEVICE_NAME, 'prefer a matching localName')
  assert.strictEqual(scan.devices[0].rssi, -50, 'duplicate updated to latest rssi')
  assert.strictEqual(scan.devices[2].model, '', 'NUS candidate can initially lack a model')

  global.Page = definition => {
    const page = Object.assign({}, definition, {
      data: Object.assign({}, definition.data),
      setData(patch) { Object.assign(this.data, patch) }
    })
    page.onLoad({ model: 'PWM' })
    page.visible = true
    page.applyState(scan)
    assert.deepStrictEqual(page.data.devices.map(d => d.deviceId), [DEVICE_ID, 'nus-only'])
    assert.strictEqual(page.data.devices[0].signalText, '信号极佳')
  }
  require('../packageDevice/pages/add/index')
  delete global.Page

  wx._foundCb({ devices: [{ deviceId: 'nus-only', localName: 'JH-PWM-AAAA', RSSI: -70 }] })
  await sleep(220)
  assert.strictEqual(ble.snapshot().devices[2].name, 'JH-PWM-AAAA', 'late scan response updates name at same RSSI')
  console.log('  ok  广播分段、NUS、型号筛选、RSSI 去重')

  await ble.stopScan()
  platform = 'Android 11'
  systemSetting = { bluetoothEnabled: true, locationEnabled: false }
  await assert.rejects(ble.startScan(), /系统定位/)
  assert.strictEqual(ble.snapshot().scanIssue, 'location-off')
  platform = 'Android 13'
  appSetting = { bluetoothAuthorized: 'denied' }
  await assert.rejects(ble.startScan(), /附近设备/)
  assert.strictEqual(ble.snapshot().scanIssue, 'bluetooth-permission')
  assert.strictEqual(nativeStarts, 1, 'known permission failures do not start discovery')
  appSetting = { bluetoothAuthorized: 'authorized' }

  cache = [{ deviceId: 'old-device', name: 'JH-PWM-0000', RSSI: -48 }]
  const second = ble.startScan()
  assert.strictEqual(ble.startScan(), second, 'one native scan per session')
  await second
  cache.push({ deviceId: 'cache-device', advertisServiceUUIDs: [NUS], RSSI: -60 })
  await sleep(2800)
  assert.deepStrictEqual(ble.snapshot().devices.map(d => d.deviceId), ['cache-device'])
  const ending = ble.stopScan()
  wx._foundCb({ devices: [{ deviceId: 'late-event', name: 'JH-PWM-1111' }] })
  await ending
  assert.strictEqual(ble.snapshot().scanStatus, 'finished')
  assert.strictEqual(ble.snapshot().scanSeen, 1, 'ignore late events after stop')
  assert.strictEqual(nativeStarts, 2, 'Android 12+ can scan with location off')
  assert.strictEqual(nativeStops, 2)

  const cancelled = ble.startScan()
  await ble.stopScan()
  await cancelled
  assert.strictEqual(nativeStarts, 2, 'hide before startup prevents a late native scan')
  console.log('  ok  权限、缓存基线、单次扫描与退出清理')

  const realSetTimeout = global.setTimeout
  global.setTimeout = (callback, ms, ...args) => realSetTimeout(callback, ms === 15000 ? 250 : ms, ...args)
  try {
    await ble.startScan()
  } finally {
    global.setTimeout = realSetTimeout
  }
  wx._foundCb({
    devices: Array.from({ length: 32 }, (_, i) => ({
      deviceId: 'limit-' + i, name: 'JH-PWM-ABCD', RSSI: -90 + i
    }))
  })
  await sleep(320)
  const finished = ble.snapshot()
  assert.strictEqual(finished.scanStatus, 'finished', 'auto-stop after configured scan window')
  assert.strictEqual(finished.scanMatched, 32)
  assert.strictEqual(finished.devices.length, 30)
  assert.strictEqual(finished.devices[0].rssi, -59)
  assert.strictEqual(nativeStops, 3)
  console.log('  ok  15 秒自动停扫与列表上限')

  await ble.connect(DEVICE_ID, DEVICE_NAME)
  await sleep(60)
  const conn = ble.snapshot()
  assert.strictEqual(conn.connected, true)
  assert.strictEqual(conn.subscribed, true)
  assert.strictEqual(conn.handshaked, true, 'handshake done')
  assert.strictEqual(conn.device.model, 'PWM')
  assert.strictEqual(conn.device.maxLevel, 5)
  assert.strictEqual(conn.device.serial, 'JHPWM20260001')
  assert.strictEqual(conn.battery, 76)
  console.log('  ok  连接 -> NUS -> 订阅 -> HELLO_ACK')

  const start = await ble.start({ mode: 1, level: 3, duration: 600 })
  assert.ok(start.seq >= 0)
  await sleep(30)
  const run = ble.snapshot()
  assert.strictEqual(run.deviceState, 1)
  assert.strictEqual(run.level, 3)
  assert.strictEqual(run.remain, 600)
  console.log('  ok  START -> ACK -> RUNNING')

  const lv = await ble.setLevel(4)
  assert.ok(lv)
  await sleep(20)
  assert.strictEqual(ble.snapshot().level, 4)

  // 设备回传 STATE：mode/level/remain 更新
  const st = codec.encode(codec.CMD.STATE, 1, [
    { tag: codec.TAG.STATE, type: 'u8', value: 2 },
    { tag: codec.TAG.MODE, type: 'u8', value: 2 },
    { tag: codec.TAG.LEVEL, type: 'u8', value: 5 },
    { tag: codec.TAG.REMAIN, type: 'u16', value: 420 },
    { tag: codec.TAG.BATTERY, type: 'u8', value: 70 },
    { tag: codec.TAG.ERROR, type: 'u16', value: 0 }
  ])
  valueListener({ deviceId: DEVICE_ID, serviceId: NUS, characteristicId: TX, value: st.buffer })
  await sleep(30)
  const paused = ble.snapshot()
  assert.strictEqual(paused.deviceState, 2)
  assert.strictEqual(paused.remain, 420)
  assert.strictEqual(paused.level, 5)
  console.log('  ok  STATE -> PAUSED（剩余/档位同步）')

  // 电池读取
  const readBack = await ble.readValue()
  assert.ok(readBack)
  await sleep(20)
  assert.strictEqual(ble.snapshot().battery, 72)
  console.log('  ok  读取电池特征')

  // 上限校验
  let rejected = false
  try {
    await ble.start({ mode: 0, level: 9, duration: 600 })
  } catch (e) {
    rejected = true
  }
  assert.strictEqual(rejected, true, 'level > maxLevel rejected')
  console.log('  ok  档位越界拦截')

  await ble.stop()
  await sleep(30)
  assert.strictEqual(ble.snapshot().deviceState, 0)
  console.log('  ok  STOP -> IDLE')

  // 主动断开不触发重连
  await ble.disconnect()
  await sleep(50)
  const off = ble.snapshot()
  assert.strictEqual(off.connected, false)
  assert.strictEqual(off.reconnecting, false)
  console.log('  ok  主动断开不重连')

  assert.ok(states.length > 0)
  console.log('')
  console.log('all flow checks passed')
  process.exit(0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
