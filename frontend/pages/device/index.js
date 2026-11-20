const app = getApp()
const ble = require('../../utils/ble')
const deviceStore = require('../../store/device')
const { ROUTES } = require('../../config/constants')

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function timeText(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) return '今天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  const yesterday = new Date(now.getTime() - 86400000)
  if (d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate()) {
    return '昨天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  }
  return (d.getMonth() + 1) + '月' + d.getDate() + '日'
}

Page({
  data: {
    statusBarHeight: 20,
    devices: [],
    hasDevice: false,
    connectedCount: 0,
    last: null,
    lastText: '',
    scanning: false
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({ statusBarHeight: info.statusBarHeight || 20 })
    this.onBleState = snapshot => this.applyState(snapshot)
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    ble.onState(this.onBleState)
    this.refresh()
  },

  onHide() {
    ble.offState(this.onBleState)
  },

  onUnload() {
    ble.offState(this.onBleState)
  },

  onPullDownRefresh() {
    this.refresh()
    wx.stopPullDownRefresh()
  },

  applyState(snapshot) {
    if (snapshot && snapshot.handshaked) {
      deviceStore.rememberSnapshot(snapshot)
    }
    this.refresh(snapshot)
  },

  refresh(snapshot) {
    const s = snapshot || ble.snapshot()
    const list = deviceStore.list()
    const connectedId = s.connected ? s.deviceId : ''
    const handshaked = s.connected && s.handshaked

    const devices = list
      .map(item => {
        const isCurrent = connectedId && item.deviceId === connectedId
        const connected = !!isCurrent
        const running = connected && handshaked && s.deviceState === 1
        const paused = connected && handshaked && s.deviceState === 2
        const fault = connected && handshaked && s.deviceState === 3
        let stateText = '未连接'
        let stateClass = 'is-off'
        if (fault) {
          stateText = '故障'
          stateClass = 'is-fault'
        } else if (running) {
          stateText = '运行中'
          stateClass = 'is-on'
        } else if (paused) {
          stateText = '已暂停'
          stateClass = 'is-warn'
        } else if (connected) {
          stateText = handshaked ? '已连接' : '连接中'
          stateClass = handshaked ? 'is-on' : 'is-warn'
        } else if (s.reconnecting && deviceStore.currentId() === item.deviceId) {
          stateText = '重连中'
          stateClass = 'is-warn'
        }
        const batteryText = connected && handshaked && s.battery ? '电量 ' + s.battery + '%' : ''
        return Object.assign({}, item, {
          connected,
          handshaked: connected && handshaked,
          stateText,
          stateClass,
          batteryText,
          cta: connected ? (handshaked ? '进入控制' : '查看连接') : '连接设备'
        })
      })
      .sort((a, b) => {
        if (a.connected !== b.connected) return a.connected ? -1 : 1
        return (b.lastUsedAt || 0) - (a.lastUsedAt || 0)
      })

    const connectedCount = devices.filter(d => d.connected).length
    const lastItem = devices.slice().sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0))[0] || null
    const last = lastItem
      ? Object.assign({}, lastItem, {
          timeText: timeText(lastItem.lastUsedAt || lastItem.lastSeen),
          actionText: lastItem.connected ? '继续控制' : '重新连接'
        })
      : null

    this.setData({
      devices,
      hasDevice: devices.length > 0,
      connectedCount,
      last,
      lastText: last ? last.timeText : ''
    })
  },

  onAdd() {
    wx.navigateTo({ url: ROUTES.deviceIntro })
  },

  onDeviceTap(e) {
    const deviceId = e.currentTarget.dataset.id
    wx.navigateTo({ url: ROUTES.deviceControl + '?deviceId=' + encodeURIComponent(deviceId) + '&auto=1' })
  },

  onDeviceLongPress(e) {
    const deviceId = e.currentTarget.dataset.id
    const item = deviceStore.get(deviceId)
    if (!item) return
    wx.showActionSheet({
      itemList: ['重命名', '断开并移除'],
      success: res => {
        if (res.tapIndex === 0) this.renameDevice(deviceId, item.alias)
        if (res.tapIndex === 1) this.removeDevice(deviceId)
      }
    })
  },

  renameDevice(deviceId, alias) {
    wx.showModal({
      title: '设备名称',
      editable: true,
      placeholderText: '最多 12 个字',
      content: alias || '',
      success: res => {
        if (!res.confirm) return
        const name = (res.content || '').trim()
        if (!name) return
        deviceStore.rename(deviceId, name)
        this.refresh()
      }
    })
  },

  removeDevice(deviceId) {
    wx.showModal({
      title: '移除设备',
      content: '移除后需要重新连接并握手，确定继续？',
      confirmColor: '#D92D20',
      success: res => {
        if (!res.confirm) return
        const s = ble.snapshot()
        if (s.connected && s.deviceId === deviceId) ble.disconnect()
        deviceStore.remove(deviceId)
        this.refresh()
        wx.showToast({ title: '已移除', icon: 'none' })
      }
    })
  },

  onQuickControl() {
    const s = ble.snapshot()
    if (s.connected) {
      wx.navigateTo({ url: ROUTES.deviceControl + '?deviceId=' + encodeURIComponent(s.deviceId) })
      return
    }
    const current = deviceStore.current()
    if (current) {
      wx.navigateTo({ url: ROUTES.deviceControl + '?deviceId=' + encodeURIComponent(current.deviceId) + '&auto=1' })
      return
    }
    wx.navigateTo({ url: ROUTES.deviceIntro })
  },

  onRecentTap() {
    if (!this.data.last) return
    wx.navigateTo({
      url: ROUTES.deviceControl + '?deviceId=' + encodeURIComponent(this.data.last.deviceId) + '&auto=1'
    })
  },

  onCourse() {
    wx.setStorageSync('jh_discover_tab', 'guide')
    wx.switchTab({ url: ROUTES.discover })
  },

  onCommunity() {
    wx.navigateTo({ url: ROUTES.community + '?tab=recommend' })
  },

  onProduct() {
    wx.setStorageSync('jh_discover_tab', 'service')
    wx.switchTab({ url: ROUTES.discover })
  },

  onNotice() {
    wx.showToast({ title: '暂无新通知', icon: 'none' })
  },

  onShareAppMessage() {
    return { title: '健衡智能康复 · 设备连接与训练', path: '/pages/device/index' }
  }
})
