const ble = require('../../../utils/ble')
const deviceStore = require('../../../store/device')
const { ROUTES } = require('../../../config/constants')

const CAP_TEXT = {
  level: '调档',
  mode: '模式',
  pause: '暂停继续',
  timer: '定时',
  battery: '电量',
  telemetry: '遥测'
}

Page({
  data: {
    deviceId: '',
    device: null,
    alias: '',
    connected: false,
    capsText: '',
    version: 'v2.0.0'
  },

  onLoad(options) {
    const deviceId = options.deviceId ? decodeURIComponent(options.deviceId) : deviceStore.currentId()
    const device = deviceStore.get(deviceId)
    if (!device) {
      wx.showToast({ title: '设备不存在', icon: 'none' })
      setTimeout(() => wx.switchTab({ url: ROUTES.device }), 600)
      return
    }
    this.setData({ deviceId, device, alias: device.alias })
    this.onBleState = s => this.applyState(s)
    this.applyState(ble.snapshot())
  },

  onShow() {
    ble.onState(this.onBleState)
    this.applyState(ble.snapshot())
  },

  onHide() {
    ble.offState(this.onBleState)
  },

  onUnload() {
    ble.offState(this.onBleState)
  },

  applyState(snapshot) {
    const s = snapshot || {}
    const connected = !!s.connected && s.deviceId === this.data.deviceId
    const caps = (s.device && s.device.caps) || (this.data.device && this.data.device.caps) || null
    const keys = caps ? Object.keys(caps).filter(k => caps[k]).map(k => CAP_TEXT[k] || k) : []
    this.setData({
      connected,
      capsText: keys.length ? keys.join(' · ') : '以设备回传为准'
    })
  },

  onAliasInput(e) {
    this.setData({ alias: e.detail.value })
  },

  onSaveAlias() {
    const alias = String(this.data.alias || '').trim()
    if (!alias) {
      wx.showToast({ title: '请输入设备名称', icon: 'none' })
      return
    }
    const item = deviceStore.rename(this.data.deviceId, alias)
    if (item) {
      this.setData({ device: item, alias: item.alias })
      wx.showToast({ title: '已保存', icon: 'success' })
    }
  },

  onHello() {
    if (!this.data.connected) {
      wx.showToast({ title: '设备未连接', icon: 'none' })
      return
    }
    ble
      .hello()
      .then(() => wx.showToast({ title: '握手成功', icon: 'success' }))
      .catch(err => wx.showToast({ title: (err && err.message) || '握手失败', icon: 'none' }))
  },

  onDisconnect() {
    wx.showModal({
      title: '断开连接',
      content: '断开后设备将停止运行。',
      success: res => {
        if (!res.confirm) return
        ble.disconnect()
        this.applyState(ble.snapshot())
        wx.showToast({ title: '已断开', icon: 'none' })
      }
    })
  },

  onRemove() {
    wx.showModal({
      title: '移除设备',
      content: '将删除本机保存的设备档案，重新使用需再次连接。',
      confirmColor: '#D92D20',
      success: res => {
        if (!res.confirm) return
        const s = ble.snapshot()
        if (s.connected && s.deviceId === this.data.deviceId) ble.disconnect()
        deviceStore.remove(this.data.deviceId)
        wx.showToast({ title: '已移除', icon: 'success' })
        setTimeout(() => wx.switchTab({ url: ROUTES.device }), 500)
      }
    })
  },

  onDiagnose() {
    wx.navigateTo({ url: ROUTES.deviceDiagnose + '?deviceId=' + encodeURIComponent(this.data.deviceId) })
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: ROUTES.device })
  }
})
