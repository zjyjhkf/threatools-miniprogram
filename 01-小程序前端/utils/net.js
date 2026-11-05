let offline = false
try {
  wx.getNetworkType({
    success: res => {
      offline = res.networkType === 'none'
    }
  })
  wx.onNetworkStatusChange(res => {
    offline = !res.isConnected
  })
} catch (e) {}

module.exports = {
  isOffline: () => offline,
  /** 每页可在 onShow 调用，传入 page 实例 */
  watch(page) {
    if (!page || page._netWatcher) return
    page._netWatcher = res => {
      offline = !res.isConnected
      page.setData({ offline })
      if (res.isConnected && typeof page.onNetworkBack === 'function') page.onNetworkBack()
    }
    wx.onNetworkStatusChange(page._netWatcher)
  },
  unwatch(page) {
    if (page && page._netWatcher && wx.offNetworkStatusChange) {
      wx.offNetworkStatusChange(page._netWatcher)
      page._netWatcher = null
    }
  }
}
