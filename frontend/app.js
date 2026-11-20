const auth = require('./services/auth')
const log = require('./utils/log')
const track = require('./utils/track')
const env = require('./config/env')
const ble = require('./utils/ble')

App({
  globalData: {
    statusBarHeight: 20,
    navBarHeight: 44,
    version: env.VERSION
  },

  onLaunch() {
    let info = {}
    try {
      info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    } catch (e) {
      info = {}
    }
    this.globalData.statusBarHeight = info.statusBarHeight || 20

    auth.restore()
    auth.silentCheck()

    track.track('app_launch', { scene: (info.scene || 1001) + '', from: '' })

    const um = wx.getUpdateManager && wx.getUpdateManager()
    if (um) {
      um.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '新版本已经准备好，是否重启应用？',
          success: res => {
            if (res.confirm) um.applyUpdate()
          }
        })
      })
    }
  },

  onHide() {
    // 切后台停止扫描省电；已建立的连接保留，设备侧按 5s 安全停机
    try {
      ble.stopScan()
    } catch (e) {}
  },

  onError(msg) {
    log.error('app', msg)
    track.track('app_error', { message: String(msg).slice(0, 120) })
  },

  onUnhandledRejection(res) {
    const reason = res && res.reason
    log.error('promise', reason)
  }
})
