const ble = require('../../../utils/ble')
const deviceStore = require('../../../store/device')
const { ROUTES } = require('../../../config/constants')

const FILTERS = [
  { key: 'all', text: '全部' },
  { key: 'send', text: '发送' },
  { key: 'recv', text: '接收' },
  { key: 'err', text: '错误' }
]

function match(line, filter) {
  if (filter === 'all') return true
  if (filter === 'send') return line.indexOf('发送') >= 0
  if (filter === 'recv') return line.indexOf('收到') >= 0 || line.indexOf('ACK') >= 0 || line.indexOf('握手成功') >= 0
  return /失败|故障|错误|超时|断开/.test(line)
}

Page({
  data: {
    deviceId: '',
    device: null,
    filters: FILTERS,
    filter: 'all',
    logs: [],
    filtered: [],
    connected: false,
    handshaked: false,
    mtu: 23,
    protocolError: '',
    phase: 'idle'
  },

  onLoad(options) {
    const deviceId = options.deviceId ? decodeURIComponent(options.deviceId) : deviceStore.currentId()
    this.setData({ deviceId, device: deviceStore.get(deviceId) })
    this.onBleState = s => this.applyState(s)
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
    const logs = (s.logs || []).slice()
    this.setData(
      {
        logs,
        filtered: logs.filter(line => match(line, this.data.filter)),
        connected: !!s.connected,
        handshaked: !!s.handshaked,
        mtu: s.mtu || 23,
        protocolError: s.protocolError || '',
        phase: s.phase || 'idle'
      },
      () => this.ensureScroll()
    )
  },

  ensureScroll() {
    if (this.data.filtered.length && !this.scrolled) {
      this.scrolled = true
    }
  },

  onFilterTap(e) {
    const filter = e.currentTarget.dataset.key
    this.setData({
      filter,
      filtered: this.data.logs.filter(line => match(line, filter))
    })
  },

  onCopy() {
    const text = this.data.filtered.join('\n')
    if (!text) {
      wx.showToast({ title: '暂无日志', icon: 'none' })
      return
    }
    wx.setClipboardData({ data: text })
  },

  onClear() {
    ble.clearLog()
    this.applyState(ble.snapshot())
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: ROUTES.device })
  }
})
