const api = require('../../../services/api')
const auth = require('../../../services/auth')
const mixin = require('../../../utils/page-mixin')
const ui = require('../../../utils/ui')
const { formatCount } = require('../../../utils/format')
const { ROUTES } = require('../../../config/constants')

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      id: '',
      topic: null,
      sort: 'hot',
      list: [],
      cursor: '',
      hasMore: true,
      loading: false,
      status: 'loading',
      moreStatus: 'idle',
      navSolid: false,
      postText: '',
      userText: ''
    }),

    onLoad(options) {
      const id = options && options.id
      if (!id) {
        this.failParam('缺少话题 id')
        return
      }
      this.setData({ id: id })
      this.loadTopic()
      this.loadPosts(true)
    },

    loadTopic() {
      api
        .getTopic(this.data.id)
        .then(t => {
          this.setData({
            topic: t,
            postText: formatCount(t.postCount),
            userText: formatCount(t.userCount)
          })
        })
        .catch(e => {
          if (e && e.code === 40401) {
            this.setData({ status: 'notfound' })
          }
        })
    },

    loadPosts(reset) {
      if (this.data.loading) return
      this.setData({ loading: true })
      api
        .getTopicPosts(this.data.id, this.data.sort, reset ? '' : this.data.cursor)
        .then(res => {
          const list = reset ? res.list : this.data.list.concat(res.list)
          this.setData({
            list: list,
            cursor: res.nextCursor || '',
            hasMore: !!res.hasMore,
            status: list.length ? 'ok' : 'empty',
            moreStatus: res.hasMore ? 'idle' : 'nomore',
            loading: false
          })
        })
        .catch(() => {
          this.setData({
            loading: false,
            status: this.data.list.length ? 'ok' : 'error',
            moreStatus: this.data.list.length ? 'error' : 'idle'
          })
        })
    },

    onSort(e) {
      const sort = e.currentTarget.dataset.value
      if (sort === this.data.sort) return
      this.setData({ sort: sort, list: [], cursor: '', hasMore: true })
      this.loadPosts(true)
    },

    onPageScroll(e) {
      const solid = e.scrollTop > 100
      if (solid !== this.data.navSolid) this.setData({ navSolid: solid })
    },

    toggleCollect() {
      if (!this.requireLogin()) return
      const t = this.data.topic
      const next = !t.collected
      this.setData({ 'topic.collected': next })
      ui.toast(next ? '已收藏话题' : '已取消收藏')
    },

    join() {
      if (!this.requireLogin()) return
      wx.navigateTo({ url: ROUTES.publish + '?topicId=' + this.data.id })
    },

    openPost(e) {
      wx.navigateTo({ url: ROUTES.post + '?id=' + e.detail.id })
    },

    onLike(e) {
      if (!this.requireLogin()) return
      const { id, liked } = e.detail
      const i = this.data.list.findIndex(p => String(p.id) === String(id))
      if (i < 0) return
      this.setData({ ['list[' + i + '].liked']: !liked })
      api.likePost(id, !liked).then(
        res => {
          const idx = this.data.list.findIndex(p => String(p.id) === String(id))
          if (idx >= 0) {
            this.setData({
              ['list[' + idx + '].liked']: res.liked,
              ['list[' + idx + '].likeCount']: res.likeCount
            })
          }
        },
        () => {
          const idx = this.data.list.findIndex(p => String(p.id) === String(id))
          if (idx >= 0) this.setData({ ['list[' + idx + '].liked']: liked })
        }
      )
    },

    onCollect(e) {
      if (!this.requireLogin()) return
      const { id, collected } = e.detail
      const i = this.data.list.findIndex(p => String(p.id) === String(id))
      if (i < 0) return
      this.setData({ ['list[' + i + '].collected']: !collected })
      api.collectPost(id, !collected).then(() => ui.toast(!collected ? '已收藏' : '已取消收藏'))
    },

    onFollow(e) {
      if (!this.requireLogin()) return
      const list = this.data.list.map(p =>
        String(p.author.id) === String(e.detail.id) ? Object.assign({}, p, { followed: !e.detail.followed }) : p
      )
      this.setData({ list: list })
      api.follow(e.detail.id, !e.detail.followed).then(() =>
        ui.toast(!e.detail.followed ? '已关注 @' + e.detail.nickname : '已取消关注')
      )
    },

    onAuthor(e) {
      wx.navigateTo({ url: ROUTES.userProfile + '?id=' + e.detail.id })
    },

    onTopic(e) {
      if (String(e.detail.id) === String(this.data.id)) return
      wx.navigateTo({ url: ROUTES.topicDetail + '?id=' + e.detail.id })
    },

    onReachBottom() {
      this.onLoadMore()
    },

    onLoadMore() {
      if (!this.data.hasMore || this.data.loading) return
      this.setData({ moreStatus: 'loading' })
      this.loadPosts(false)
    },

    onRetry() {
      this.loadPosts(true)
    }
  })
)
