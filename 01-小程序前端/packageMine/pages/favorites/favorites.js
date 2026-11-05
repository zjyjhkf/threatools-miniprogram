const api = require('../../../services/api')
const mixin = require('../../../utils/page-mixin')
const ui = require('../../../utils/ui')
const { formatDuration } = require('../../../utils/format')
const { FAVORITE_TYPES, ROUTES } = require('../../../config/constants')

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      tabs: FAVORITE_TYPES,
      tab: 'post',
      list: [],
      total: 0,
      loading: true,
      status: 'loading'
    }),

    onLoad(options) {
      const tab = (options && options.type) || 'post'
      this.setData({ tab: tab })
      this.load()
    },

    load() {
      this.setData({ status: 'loading', list: [] })
      api
        .getFavorites(this.data.tab, 1, 50)
        .then(res => {
          const list = (res.list || []).map(item => {
            if (item.type === 'course') item.durText = formatDuration(item.duration)
            return item
          })
          this.setData({
            list: list,
            total: res.total || list.length,
            status: list.length ? 'ok' : 'empty'
          })
        })
        .catch(() => this.setData({ status: 'error' }))
    },

    onTab(e) {
      const tab = e.currentTarget.dataset.value
      if (tab === this.data.tab) return
      this.setData({ tab: tab })
      this.load()
    },

    openItem(e) {
      const { type, id } = e.currentTarget.dataset
      if (type === 'post') wx.navigateTo({ url: ROUTES.post + '?id=' + id })
      else if (type === 'course') wx.navigateTo({ url: ROUTES.courseDetail + '?id=' + id })
      else wx.navigateTo({ url: ROUTES.productDetail + '?id=' + id })
    },

    cancel(e) {
      const { type, id, index } = e.currentTarget.dataset
      const req =
        type === 'post'
          ? api.collectPost(id, false)
          : type === 'course'
          ? api.collectCourse(id, false)
          : api.collectProduct(id, false)

      req.then(
        () => {
          const list = this.data.list.slice()
          list.splice(Number(index), 1)
          this.setData({ list: list, total: Math.max(0, this.data.total - 1) })
          ui.toast('已取消收藏')
          if (!list.length) this.setData({ status: 'empty' })
        },
        () => ui.toast('操作失败，请重试')
      )
    },

    goExplore() {
      wx.switchTab({ url: ROUTES.community })
    },

    onRetry() {
      this.load()
    }
  })
)
