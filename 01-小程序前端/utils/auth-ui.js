const ui = require('./ui')

/** 统一登录拦截：C19 Dialog（PRD 3 节规则，不得用 Toast 打发） */
function showLoginDialog() {
  ui.dialog({
    type: 'login',
    title: '登录后才能操作',
    content: '登录后可点赞、收藏、评论与发布内容',
    confirmText: '去登录',
    cancelText: '取消'
  })
}

/** 登录成功后回到原页并提示 */
function backAfterLogin() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    wx.navigateBack({ delta: 1 })
  } else {
    wx.switchTab({ url: '/pages/community/index' })
  }
}

module.exports = { showLoginDialog, backAfterLogin }
