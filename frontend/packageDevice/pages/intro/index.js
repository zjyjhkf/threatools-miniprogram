const { MODELS, modelByKey } = require('../../../config/device-models')
const { ROUTES } = require('../../../config/constants')

Page({
  data: {
    title: '设备介绍',
    models: MODELS,
    modelKey: '',
    model: null,
    isDetail: false
  },

  onLoad(options) {
    const key = String(options.model || '').toUpperCase()
    this.openDetail(key)
  },

  openDetail(key) {
    const model = modelByKey(key)
    if (!model) {
      this.setData({ modelKey: '', model: null, isDetail: false })
      return
    }
    this.setData({ modelKey: model.key, model, isDetail: true, title: model.short })
  },

  onModelTap(e) {
    this.openDetail(e.currentTarget.dataset.key)
  },

  onBack() {
    if (this.data.isDetail) {
      this.setData({ modelKey: '', model: null, isDetail: false, title: '设备介绍' })
      return
    }
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: ROUTES.device })
  },

  onStartConnect() {
    if (!this.data.model) return
    wx.navigateTo({ url: ROUTES.deviceAdd + '?model=' + this.data.model.key })
  },

  onShareAppMessage() {
    return { title: '健衡智能康复设备', path: '/pages/device/index' }
  }
})
