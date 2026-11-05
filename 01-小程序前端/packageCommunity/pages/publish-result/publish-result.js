const mixin = require('../../../utils/page-mixin')
const { ROUTES } = require('../../../config/constants')

const CONTENT = {
  pending: {
    icon: 'clock',
    title: '已提交审核',
    desc: '审核通过后将展示在运动社区，通常需要几分钟',
    primary: '查看我的内容'
  },
  success: {
    icon: 'check',
    title: '发布成功',
    desc: '你的动态已经展示在运动社区',
    primary: '查看我的内容'
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
      status: 'pending',
      view: CONTENT.pending,
      postId: ''
    }),

    onLoad(options) {
      const status = (options && options.status) || 'pending'
      this.setData({
        status: status,
        view: CONTENT[status] || CONTENT.pending,
        postId: (options && options.id) || ''
      })
    },

    onPrimary() {
      if (this.data.status === 'fail') {
        wx.navigateBack({ delta: 1 })
        return
      }
      const id = this.data.postId
      if (id) {
        wx.redirectTo({ url: ROUTES.post + '?id=' + id })
      } else {
        wx.switchTab({ url: ROUTES.community })
      }
    },

    goCommunity() {
      wx.switchTab({ url: ROUTES.community })
    },

    onShareAppMessage() {
      return {
        title: '健衡运动社区 · 科学运动，从一次放松开始',
        path: '/pages/community/index'
      }
    }
  })
)
