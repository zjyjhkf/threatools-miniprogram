const api = require('../../../services/api')
const auth = require('../../../services/auth')
const mixin = require('../../../utils/page-mixin')
const { formatCount } = require('../../../utils/format')
const { ROUTES } = require('../../../config/constants')

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      hot: [],
      all: [],
      keyword: '',
      searching: false,
      loading: true,
      status: 'loading'
    }),

    onLoad() {
      this.load()
    },

    load() {
      this.setData({ status: 'loading' })
      Promise.all([api.getHotTopics(10), api.getTopics(1, 30)])
        .then(res => {
          const hot = (res[0].list || []).map((t, i) =>
            Object.assign({}, t, { rank: i + 1, postText: formatCount(t.postCount) })
          )
          const all = (res[1].list || []).map(t =>
            Object.assign({}, t, { postText: formatCount(t.postCount) })
          )
          this.setData({ hot: hot, all: all, status: hot.length || all.length ? 'ok' : 'empty' })
        })
        .catch(() => this.setData({ status: 'error' }))
    },

    onKeyword(e) {
      const keyword = e.detail.value
      this.setData({ keyword: keyword })
      if (!keyword.trim()) {
        this.load()
        return
      }
      api
        .searchTopics(keyword.trim())
        .then(res => {
          this.setData({
            all: (res.list || []).map(t => Object.assign({}, t, { postText: formatCount(t.postCount) })),
            hot: [],
            status: res.list && res.list.length ? 'ok' : 'empty'
          })
        })
        .catch(() => {})
    },

    startSearch() {
      this.setData({ searching: true })
    },

    stopSearch() {
      this.setData({ searching: false, keyword: '' })
      this.load()
    },

    openTopic(e) {
      wx.navigateTo({ url: ROUTES.topicDetail + '?id=' + e.currentTarget.dataset.id })
    },

    joinTopic(e) {
      if (!this.requireLogin()) return
      wx.navigateTo({ url: ROUTES.publish + '?topicId=' + e.currentTarget.dataset.id })
    },

    goPublish() {
      if (!this.requireLogin()) return
      wx.navigateTo({ url: ROUTES.publish })
    },

    onRetry() {
      this.load()
    }
  })
)
