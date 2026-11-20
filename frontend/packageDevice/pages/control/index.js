const ble = require('../../../utils/ble')
const codec = require('../../../utils/ble-codec')
const deviceStore = require('../../../store/device')
const { modelByKey } = require('../../../config/device-models')
const { ROUTES } = require('../../../config/constants')

const MODES = ['舒缓', '标准', '强力']
const DURATIONS = [
  { value: 600, text: '10 分钟' },
  { value: 900, text: '15 分钟' },
  { value: 1200, text: '20 分钟' }
]

function fmtRemain(sec) {
  const s = Math.max(0, Number(sec) || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return (m < 10 ? '0' + m : m) + ':' + (r < 10 ? '0' + r : r)
}

Page({
  data: {
    deviceId: '',
    device: null,
    supported: true,
    connected: false,
    handshaked: false,
    connecting: false,
    reconnecting: false,
    handshakeError: '',
    phase: 'idle',
    statusText: '未连接',
    statusClass: 'is-off',
    icon: 'activity',
    modelText: '康复设备',
    alias: '',
    sn: '',
    fw: '',
    battery: 0,
    caps: null,
    maxLevel: 5,
    level: 3,
    levelLabel: '强度档位',
    mode: 0,
    duration: 600,
    remain: 0,
    remainText: '--:--',
    deviceState: 0,
    faultText: '',
    telemetry: [],
    modes: MODES,
    durations: DURATIONS,
    canStart: false,
    canPause: false,
    canResume: false,
    canStop: false,
    canLevel: false,
    busy: false
  },

  onLoad(options) {
    const deviceId = options.deviceId ? decodeURIComponent(options.deviceId) : deviceStore.currentId()
    const device = deviceStore.get(deviceId)
    if (!device) {
      wx.showToast({ title: '设备档案不存在', icon: 'none' })
      setTimeout(() => wx.switchTab({ url: ROUTES.device }), 600)
      return
    }
    const meta = modelByKey(device.model) || {}
    this.setData({
      deviceId,
      device,
      alias: device.alias,
      icon: meta.icon || device.icon || 'activity',
      modelText: device.modelText || meta.name || '康复设备',
      sn: device.sn || '',
      fw: device.fw || '',
      battery: device.battery || 0,
      caps: device.caps || null,
      maxLevel: device.maxLevel || 5,
      level: device.lastLevel || 3,
      duration: 600
    })
    this.onBleState = snapshot => this.applyState(snapshot)
    this.wantAuto = options.auto === '1'
  },

  onShow() {
    ble.onState(this.onBleState)
    this.applyState(ble.snapshot())
    if (this.wantAuto) {
      this.wantAuto = false
      const s = ble.snapshot()
      if (!s.connected) this.autoConnect()
    }
  },

  onHide() {
    ble.offState(this.onBleState)
    this.stopTick()
  },

  onUnload() {
    ble.offState(this.onBleState)
    this.stopTick()
  },

  autoConnect() {
    const d = this.data.device
    if (!d) return
    this.setData({ connecting: true, statusText: '正在连接设备…', statusClass: 'is-warn' })
    clearTimeout(this.connectTimer)
    this.connectTimer = setTimeout(() => {
      if (!this.data.handshaked) this.setData({ connecting: false, statusText: '连接超时，请重试', statusClass: 'is-fault' })
    }, 18000)
    ble
      .connect(d.deviceId, d.name)
      .then(() => {
        this.applyState(ble.snapshot())
      })
      .catch(err => {
        const msg = (ble.describe && ble.describe(err)) || (err && err.message) || '连接失败'
        this.setData({ connecting: false, statusText: msg, statusClass: 'is-fault' })
      })
  },

  applyState(snapshot) {
    const s = snapshot || {}
    if (s.handshaked) {
      clearTimeout(this.connectTimer)
      deviceStore.rememberSnapshot(s)
      deviceStore.markUsed(s.deviceId)
    }
    const device = this.data.device || {}
    const caps = (s.device && s.device.caps) || device.caps || null
    const maxLevel = (s.device && s.device.maxLevel) || device.maxLevel || 5
    const connected = !!s.connected && s.deviceId === this.data.deviceId
    const handshaked = connected && !!s.handshaked
    const model = handshaked && s.device ? s.device.model : device.model
    const state = handshaked ? Number(s.deviceState) || 0 : 0
    const level = s.level || this.data.level || device.lastLevel || 3
    const mode = typeof s.mode === 'number' ? s.mode : this.data.mode
    const battery = connected ? s.battery || device.battery || 0 : device.battery || 0
    const remain = connected ? Number(s.remain) || 0 : 0
    const fault = state === 3

    let statusText = '未连接'
    let statusClass = 'is-off'
    if (s.reconnecting) {
      statusText = '正在重连…'
      statusClass = 'is-warn'
    } else if (this.data.connecting || (s.connecting && s.deviceId === this.data.deviceId)) {
      statusText = '正在连接…'
      statusClass = 'is-warn'
    } else if (connected && !handshaked) {
      statusText = s.handshakeError ? '握手失败' : '正在握手…'
      statusClass = s.handshakeError ? 'is-fault' : 'is-warn'
    } else if (handshaked) {
      if (fault) {
        statusText = '设备故障'
        statusClass = 'is-fault'
      } else if (state === 1) {
        statusText = '运行中'
        statusClass = 'is-on'
      } else if (state === 2) {
        statusText = '已暂停'
        statusClass = 'is-warn'
      } else {
        statusText = '已连接'
        statusClass = 'is-on'
      }
    }

    const telemetry = (s.telemetry || []).slice(-4).map(item => ({
      key: item.metric,
      text: '指标 ' + item.metric + ' · ' + item.value
    }))

    const connecting = !handshaked && (this.data.connecting || (!!s.connecting && s.deviceId === this.data.deviceId))

    this.setData(
      {
        connected,
        handshaked,
        connecting,
        reconnecting: !!s.reconnecting,
        handshakeError: s.handshakeError || '',
        phase: s.phase || (handshaked ? 'ready' : 'idle'),
        statusText,
        statusClass,
        battery,
        fw: (s.device && s.device.firmware) || this.data.fw,
        sn: (s.device && s.device.serial) || this.data.sn,
        caps,
        maxLevel,
        level,
        levelLabel: model === 'PWM' ? '压力档位' : '强度档位',
        mode,
        remain,
        remainText: fmtRemain(remain),
        deviceState: state,
        faultText: state === 3 ? codec.faultText(s.error) : '',
        telemetry,
        canStart: handshaked && !fault,
        canPause: handshaked && state === 1,
        canResume: handshaked && state === 2,
        canStop: handshaked,
        canLevel: handshaked && (!caps || caps.level !== false),
        busy: false
      },
      () => {
        if (handshaked && state === 1 && remain > 0) this.startTick()
        else this.stopTick()
      }
    )
  },

  startTick() {
    if (this.tick) return
    this.tick = setInterval(() => {
      const remain = this.data.remain
      if (!this.data.handshaked || this.data.deviceState !== 1 || remain <= 0) {
        this.stopTick()
        return
      }
      this.setData({ remain: remain - 1, remainText: fmtRemain(remain - 1) })
    }, 1000)
  },

  stopTick() {
    if (this.tick) {
      clearInterval(this.tick)
      this.tick = null
    }
  },

  guard() {
    if (!this.data.handshaked) {
      wx.showToast({ title: '请先完成设备连接与握手', icon: 'none' })
      return false
    }
    return true
  },

  run(fn) {
    if (this.data.busy) return
    this.setData({ busy: true })
    Promise.resolve(fn())
      .catch(err => {
        const msg = (err && (err.message || err.errMsg)) || '操作失败'
        wx.showToast({ title: msg, icon: 'none' })
      })
      .then(() => {
        setTimeout(() => this.setData({ busy: false }), 300)
      })
  },

  onModeTap(e) {
    const mode = Number(e.currentTarget.dataset.index)
    this.setData({ mode })
  },

  onDurationTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({ duration: DURATIONS[index].value })
  },

  onLevelTap(e) {
    if (!this.data.canLevel) return
    const delta = Number(e.currentTarget.dataset.delta)
    const next = Math.min(this.data.maxLevel, Math.max(1, this.data.level + delta))
    if (next === this.data.level) return
    this.setData({ level: next })
    if (this.data.handshaked) {
      this.run(() => ble.setLevel(next))
    }
  },

  onStart() {
    if (!this.guard()) return
    this.run(() =>
      ble.start({ mode: this.data.mode, level: this.data.level, duration: this.data.duration })
    )
  },

  onPause() {
    if (!this.guard()) return
    this.run(() => ble.pause())
  },

  onResume() {
    if (!this.guard()) return
    this.run(() => ble.resume())
  },

  onStop() {
    if (!this.guard()) return
    this.run(() => ble.stop())
  },

  onReconnect() {
    this.setData({ statusText: '正在连接设备…', statusClass: 'is-warn' })
    this.autoConnect()
  },

  onDisconnect() {
    wx.showModal({
      title: '断开设备',
      content: '断开后设备将停止运行，确定继续？',
      success: res => {
        if (!res.confirm) return
        ble.disconnect()
        this.setData({ statusText: '已断开', statusClass: 'is-off' })
      }
    })
  },

  onSettings() {
    wx.navigateTo({ url: ROUTES.deviceSettings + '?deviceId=' + encodeURIComponent(this.data.deviceId) })
  },

  onDiagnose() {
    wx.navigateTo({ url: ROUTES.deviceDiagnose + '?deviceId=' + encodeURIComponent(this.data.deviceId) })
  },

  onAddDevice() {
    wx.navigateTo({ url: ROUTES.deviceIntro })
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: ROUTES.device })
  }
})
