Component({
  options: { styleIsolation: 'apply-shared', multipleSlots: true },
  properties: {
    title: { type: String, value: '' },
    back: { type: Boolean, value: false },
    overlay: { type: Boolean, value: false },
    transparent: { type: Boolean, value: false },
    theme: { type: String, value: 'light' },
    showSearch: { type: Boolean, value: false },
    showSetting: { type: Boolean, value: false }
  },
  data: { statusBarHeight: 20 },
  attached() {
    const app = getApp()
    this.setData({ statusBarHeight: (app && app.globalData.statusBarHeight) || 20 })
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
