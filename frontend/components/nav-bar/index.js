Component({
  options: { styleIsolation: 'apply-shared', multipleSlots: true },
  properties: {
    title: { type: String, value: '' },
    back: { type: Boolean, value: false },
    overlay: { type: Boolean, value: false },
    transparent: { type: Boolean, value: false },
    theme: { type: String, value: 'light' },
    showSearch: { type: Boolean, value: false },
    showSetting: { type: Boolean, value: false },
    right: { type: Boolean, value: false }
  },
  data: { statusBarHeight: 20, capsuleGap: 8 },
  attached() {
    const app = getApp()
    let capsuleGap = 8
    try {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
      if (menu && menu.left && win && win.windowWidth) {
        // 右侧操作区整体左移到胶囊按钮左侧，避免压住微信返回键造成误触
        capsuleGap = Math.max(8, win.windowWidth - menu.left + 8)
      }
    } catch (e) {
      capsuleGap = 8
    }
    this.setData({
      statusBarHeight: (app && app.globalData.statusBarHeight) || 20,
      capsuleGap: capsuleGap
    })
  },
  methods: {
    onBack() {
      this.triggerEvent('back')
    },
    onSearch() {
      this.triggerEvent('search')
    },
    onSetting() {
      this.triggerEvent('action', { type: 'setting' })
    }
  }
})
