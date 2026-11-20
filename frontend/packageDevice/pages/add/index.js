const ble = require('../../../utils/ble')
const deviceStore = require('../../../store/device')
const { modelByKey } = require('../../../config/device-models')
const { ROUTES } = require('../../../config/constants')

function signalOf(rssi) {
  if (rssi == null) return '信号未知'
  if (rssi >= -55) return '信号极佳'
  if (rssi >= -68) return '信号良好'
  if (rssi >= -80) return '信号一般'
  return '信号弱'
}

Page({
  data: {
    title: '连接设备',
    modelKey: '',
    model: null,
    supported: true,
    scanning: true,
    devices: [],
    connectingId: '',
    statusText: '正在准备蓝牙…',
    statusClass: 'is-warn',
    showHelp: false,
    scanIssue: '',
    resultHint: ''
  },

  onLoad(options) {
    const key = String(options.model || '').toUpperCase()
    const model = modelByKey(key)
    this.setData({
      modelKey: model ? model.key : '',
      model,
      title: model ? '连接' + model.short : '连接设备'
    })
    this.onBleState = snapshot => this.applyState(snapshot)
  },

  onShow() {
    this.visible = true
    ble.onState(this.onBleState)
    if (this.finished && !this.redirectTimer) this.openControl(this.connectedDeviceId)
    else if (this.data.connectingId) this.applyState(ble.snapshot())
    else this.startScan()
  },

  onHide() {
    this.visible = false
    ble.offState(this.onBleState)
    ble.stopScan()
  },

  onUnload() {
    this.onHide()
    this.unloaded = true
    clearTimeout(this.connectTimer)
    clearTimeout(this.redirectTimer)
  },

  async startScan() {
    if (this.data.connectingId || this.finished) return
    this.connectError = ''
    this.setData({
      scanning: true,
      devices: [],
      scanIssue: '',
      resultHint: '',
      statusText: '正在准备蓝牙…',
      statusClass: 'is-warn'
    })
    try {
      await ble.startScan()
    } catch (err) {
      // 错误类别已写入扫描快照，由页面统一渲染。
    }
    if (this.visible) this.applyState(ble.snapshot())
  },

  applyState(s) {
    if (!this.visible || this.finished) return
    const list = s.devices
      .filter(item => !this.data.modelKey || !item.model || item.model === this.data.modelKey)
      .map(item => {
        const meta = modelByKey(item.model)
        return Object.assign({}, item, {
          modelText: meta ? meta.short : '连接后确认型号',
          icon: meta ? meta.icon : 'bluetooth',
          signalText: signalOf(item.rssi),
          connecting: this.data.connectingId === item.deviceId
        })
      })

    const scanning = s.scanStatus === 'starting' || s.scanStatus === 'scanning'
    const resultHint = !scanning && s.scanStatus === 'finished' && !list.length
      ? s.scanSeen
        ? '微信发现 ' + s.scanSeen + ' 台 BLE 设备，暂无符合当前条件的设备。'
        : '微信未收到附近 BLE 设备上报。请确认设备已进入配对模式，且未被其他手机连接。'
      : ''
    const patch = {
      supported: s.supported,
      scanning,
      devices: list,
      scanIssue: s.scanIssue,
      resultHint,
      statusText: '正在准备蓝牙…',
      statusClass: 'is-warn'
    }

    if (s.scanStatus === 'error') {
      patch.statusText = s.scanError
      patch.statusClass = 'is-fault'
    } else if (s.scanStatus === 'scanning') {
      patch.statusText = '正在搜索附近设备…'
    } else if (s.scanStatus === 'finished') {
      patch.statusText = list.length ? '请选择要连接的设备' : '本轮搜索结束'
      patch.statusClass = list.length ? 'is-on' : 'is-off'
    }

    const target = this.data.connectingId
    if (target) {
      const linked = s.connected && s.deviceId === target
      if (linked && s.handshaked) {
        this.finish(s)
        return
      }
      if (linked && s.handshakeError) {
        this.failConnect('握手失败：' + s.handshakeError)
        return
      }
      patch.statusText = linked ? '已连接，正在握手…' : '正在连接设备…'
      patch.statusClass = 'is-warn'
    } else if (this.connectError) {
      patch.statusText = this.connectError
      patch.statusClass = 'is-fault'
    }

    this.setData(patch)
  },

  finish(snapshot) {
    if (this.finished) return
    this.finished = true
    clearTimeout(this.connectTimer)
    const saved = deviceStore.rememberSnapshot(snapshot)
    if (!saved) {
      this.finished = false
      return
    }
    this.connectedDeviceId = saved.deviceId
    deviceStore.markUsed(saved.deviceId)
    this.setData({ connectingId: '', scanning: false, statusText: '连接成功', statusClass: 'is-on' })
    wx.showToast({ title: '连接成功', icon: 'success', duration: 900 })
    this.redirectTimer = setTimeout(() => {
      this.redirectTimer = null
      if (this.visible) this.openControl(saved.deviceId)
    }, 650)
  },

  openControl(deviceId) {
    wx.redirectTo({
      url: ROUTES.deviceControl + '?deviceId=' + encodeURIComponent(deviceId),
      fail: () => {
        this.finished = false
        this.startScan()
      }
    })
  },

  failConnect(message) {
    clearTimeout(this.connectTimer)
    if (this.unloaded) return
    this.connectError = message
    this.setData({ connectingId: '', statusText: message, statusClass: 'is-fault' })
    if (this.visible) this.applyState(ble.snapshot())
  },

  async onConnectTap(e) {
    if (this.data.connectingId || this.finished) return
    const deviceId = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    this.connectError = ''
    this.setData({ connectingId: deviceId, statusText: '正在连接设备…', statusClass: 'is-warn' })
    this.connectTimer = setTimeout(() => {
      if (this.data.connectingId === deviceId) this.failConnect('连接超时，请靠近设备后重试')
    }, 18000)

    try {
      const current = ble.snapshot()
      if (current.connected && current.deviceId === deviceId && !current.handshaked) await ble.disconnect()
      const s = await ble.connect(deviceId, name)
      if (this.unloaded || this.data.connectingId !== deviceId) return
      if (!s.subscribed) {
        this.failConnect(s.protocolError || '设备通信通道不可用，请确认固件后重试')
      } else {
        this.applyState(s)
      }
    } catch (err) {
      if (this.data.connectingId === deviceId) this.failConnect(ble.describe(err))
    }
  },

  onRescan() {
    if (!this.data.scanning) this.startScan()
  },

  onOpenSettings() {
    const bluetoothOff = this.data.scanIssue === 'bluetooth-off'
    ble.openSystemSetting(bluetoothOff ? 'bluetooth' : 'permissions').catch(() => {
      const title = bluetoothOff ? '请在手机设置中开启蓝牙' : '请从手机设置手动开启权限'
      wx.showToast({ title, icon: 'none' })
    })
  },

  onToggleHelp() {
    this.setData({ showHelp: !this.data.showHelp })
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: ROUTES.device })
  }
})
