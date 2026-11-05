const auth = require('../services/auth')
const ui = require('./ui')
const authUi = require('./auth-ui')
const { ROUTES } = require('../config/constants')

/** 页面公共 data 片段 */
function baseData() {
  return {
    dialog: {
      show: false,
      type: '',
      title: '',
      content: '',
      confirmText: '确定',
      cancelText: '取消',
      danger: false
    },
    toast: { show: false, text: '' }
  }
}

/**
 * 页面公共方法，页面用 Object.assign({}, mixin, {...}) 合并
 * 约定：页面自定义确认逻辑实现 onDialogOk()
 */
const mixin = {
  closeDialog() {
    this.setData({ 'dialog.show': false })
  },

  onDialogConfirm() {
    const d = this.data.dialog || {}
    this.setData({ 'dialog.show': false })
    if (d.type === 'login') {
      wx.navigateTo({ url: ROUTES.login })
      return
    }
    if (typeof this.onDialogOk === 'function') this.onDialogOk()
  },

  /** 返回 true 表示已登录 */
  requireLogin() {
    if (auth.isLogin()) return true
    authUi.showLoginDialog()
    return false
  },

  toast(text) {
    ui.toast(text)
  },

  back(delta) {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: delta || 1 })
    } else {
      wx.switchTab({ url: ROUTES.community })
    }
  },

  /** 参数缺失兜底：不白屏 */
  failParam(msg) {
    ui.dialog({ title: '参数缺失', content: msg || '页面参数不完整', confirmText: '返回', cancelText: '' })
    this._backOnConfirm = true
  }
}

module.exports = { mixin, baseData }
