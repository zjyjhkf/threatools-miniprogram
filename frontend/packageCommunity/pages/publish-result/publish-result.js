const mixin = require('../../../utils/page-mixin')
const { ROUTES } = require('../../../config/constants')

/**
 * D09 发布结果（UI 2.1 先发后审）
 * - 发布成功：作品已展示，管理员事后审核
 * - 不再出现「已提交审核 / 审核中」阻断态
 */
const CONTENT = {
  success: {
    icon: 'check',
    title: '发布成功',
    desc: '作品已展示，管理员会事后审核',
    primary: '查看我的作品'
  },
  fail: {
    icon: 'error',
    title: '发布失败',
    desc: '网络异常或内容未通过校验，草稿已为你保留',
    primary: '返回重新编辑'
  }
}

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      status: 'success',
      view: CONTENT.success,
      postId: ''
    }),

    onLoad(options) {
      // 兼容旧参数 pending：UI 2.1 一律按发布成功处理
      const raw = (options && options.status) || 'success'
      const status = raw === 'fail' ? 'fail' : 'success'
      this.setData({
        status: status,
        view: CONTENT[status],
        postId: (options && options.id) || ''
      })
    },

    onPrimary() {
      if (this.data.status === 'fail') {
        wx.navigateBack({ delta: 1 })
        return
      }
      // 记录落地页签：若社区页仍在栈内则直接返回，由社区 onShow 切换
      wx.setStorageSync('jh_community_tab', 'myworks')
      const pages = getCurrentPages()
      const prev = pages[pages.length - 2]
      const elder = pages[pages.length - 3]
      if (prev && prev.route === 'pages/community/index') {
        wx.navigateBack({ delta: 1 })
        return
      }
      if (elder && elder.route === 'pages/community/index') {
        wx.navigateBack({ delta: 2 })
        return
      }
      // 发布页/结果页都不再保留，避免返回时又看到旧表单
      wx.reLaunch({ url: ROUTES.community + '?tab=myworks' })
    },

    goCommunity() {
      const pages = getCurrentPages()
      const prev = pages[pages.length - 2]
      const elder = pages[pages.length - 3]
      if (prev && prev.route === 'pages/community/index') {
        wx.navigateBack({ delta: 1 })
        return
      }
      if (elder && elder.route === 'pages/community/index') {
        wx.navigateBack({ delta: 2 })
        return
      }
      wx.reLaunch({ url: ROUTES.community + '?tab=recommend' })
    },

    onShareAppMessage() {
      return {
        title: '健衡运动社区 · 科学运动，从一次放松开始',
        path: '/pages/home/index'
      }
    }
  })
)
