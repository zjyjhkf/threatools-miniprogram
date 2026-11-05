const api = require('../../services/api')
const auth = require('../../services/auth')
const ui = require('../../utils/ui')
const track = require('../../utils/track')
const { FEED_TYPES } = require('../../config/constants')

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    active: { type: Boolean, value: false }
  },
  data: {
    types: FEED_TYPES,
    type: 'recommend',
    list: [],
    cursor: '',
    hasMore: true,
    loading: false,
    refreshing: false,
    firstLoaded: false,
    status: 'loading',
    moreStatus: 'idle',
    errorMsg: '',
    offline: false,
    pending: {}
  },
  observers: {
    active(v) {
      if (v && !this.data.firstLoaded) this.reload()
    }
  },
  lifetimes: {
    attached() {
      if (this.data.active && !this.data.firstLoaded) this.reload()
    }
  },
  methods: {
    /* ---------- 数据 ---------- */
    reload() {
      this.setData({ status: 'loading', list: [], cursor: '', hasMore: true, moreStatus: 'idle' })
      return this.fetch(true)
    },

    fetch(reset) {
      if (this.data.loading) return Promise.resolve()
      this.setData({ loading: true })
      const params = reset ? {} : { cursor: this.data.cursor, size: 10 }
      return api
        .getFeed(this.data.type, params.cursor, 10)
        .then(res => {
          const list = reset ? res.list : this.data.list.concat(res.list)
          this.setData({
            list: list,
            cursor: res.nextCursor || '',
            hasMore: !!res.hasMore,
            status: list.length ? 'ok' : 'empty',
            moreStatus: res.hasMore ? 'idle' : 'nomore',
            firstLoaded: true,
            loading: false
          })
        })
        .catch(e => {
          this.setData({
            loading: false,
            status: this.data.list.length ? 'ok' : 'error',
            moreStatus: this.data.list.length ? 'error' : 'idle',
            offline: !!e && e.type === 'NETWORK',
            errorMsg: (e && e.message) || '网络开小差了'
          })
        })
    },

    onRefresh() {
      this.setData({ refreshing: true })
      this.fetch(true).then(() => {
        this.setData({ refreshing: false })
        wx.nextTick(() => this.setData({ 'scrollTop': 0 }))
      })
    },

    onLoadMore() {
      if (!this.data.hasMore || this.data.loading) return
      this.setData({ moreStatus: 'loading' })
      this.fetch(false)
    },

    onRetry() {
      this.reload()
    },

    onRetryMore() {
      this.setData({ moreStatus: 'loading' })
      this.fetch(false)
    },

    /* ---------- 筛选 ---------- */
    onTypeChange(e) {
      const type = e.detail.value
      if (type === this.data.type) return
      this.setData({ type: type, list: [], cursor: '', hasMore: true })
      this.reload()
      this.triggerEvent('tabswitch', { from: this.data.type, to: type })
    },

    /* ---------- 卡片交互 ---------- */
    findIndex(id) {
      return this.data.list.findIndex(p => String(p.id) === String(id))
    },

    /** 登录成功后自动续做点赞（PRD FR-01-03） */
    resumeLike(id) {
      const i = this.findIndex(id)
      if (i < 0 || this.data.list[i].liked) return
      this.onLike({ detail: { id: id, liked: false } })
    },

    onLike(e) {
      if (!auth.isLogin()) {
        this.triggerEvent('needlogin', { action: { type: 'like', id: e.detail.id } })
        return
      }
      const { id, liked } = e.detail
      const i = this.findIndex(id)
      if (i < 0 || this.data.pending[id]) return
      const next = !liked
      const count = this.data.list[i].likeCount + (next ? 1 : -1)
      this.setData({
        ['list[' + i + '].liked']: next,
        ['list[' + i + '].likeCount']: Math.max(0, count),
        ['pending.' + id]: true
      })
      api
        .likePost(id, next)
        .then(res => {
          const idx = this.findIndex(id)
          if (idx >= 0) {
            this.setData({
              ['list[' + idx + '].liked']: res.liked,
              ['list[' + idx + '].likeCount']: res.likeCount
            })
          }
          track.track('like_click', { post_id: id, action: next ? 'like' : 'unlike' })
          this.triggerEvent('like', { id, action: next ? 'like' : 'unlike' })
        })
        .catch(() => {
          const idx = this.findIndex(id)
          if (idx >= 0) {
            this.setData({
              ['list[' + idx + '].liked']: liked,
              ['list[' + idx + '].likeCount']: this.data.list[idx].likeCount + (next ? -1 : 1)
            })
          }
          ui.toast('操作失败，请重试')
        })
        .then(() => {
          this.setData({ ['pending.' + id]: false })
        })
    },

    onCollect(e) {
      if (!auth.isLogin()) {
        this.triggerEvent('needlogin', { action: { type: 'collect', id: e.detail.id } })
        return
      }
      const { id, collected } = e.detail
      const i = this.findIndex(id)
      if (i < 0) return
      const next = !collected
      this.setData({ ['list[' + i + '].collected']: next })
      api.collectPost(id, next).then(
        res => {
          const idx = this.findIndex(id)
          if (idx >= 0) {
            this.setData({
              ['list[' + idx + '].collected']: res.collected,
              ['list[' + idx + '].collectCount']: res.collectCount
            })
          }
          ui.toast(next ? '已收藏' : '已取消收藏')
          this.triggerEvent('collect', { id, action: next ? 'collect' : 'uncollect' })
        },
        () => {
          const idx = this.findIndex(id)
          if (idx >= 0) this.setData({ ['list[' + idx + '].collected']: collected })
          ui.toast('操作失败，请重试')
        }
      )
    },

    onFollow(e) {
      if (!auth.isLogin()) {
        this.triggerEvent('needlogin')
        return
      }
      // 关注依赖登录态，登录前不记录待办
      const { id, followed, nickname } = e.detail
      const next = !followed
      const list = this.data.list.map(p => {
        if (String(p.author.id) !== String(id)) return p
        return Object.assign({}, p, { followed: next })
      })
      this.setData({ list: list })
      api.follow(id, next).then(
        () => {
          track.track('follow_click', { target_user_id: id, action: next ? 'follow' : 'unfollow' })
          ui.toast(next ? '已关注 @' + nickname : '已取消关注 @' + nickname)
          this.triggerEvent('follow', { id, action: next ? 'follow' : 'unfollow' })
        },
        () => {
          this.setData({
            list: this.data.list.map(p =>
              String(p.author.id) === String(id) ? Object.assign({}, p, { followed: followed }) : p
            )
          })
          ui.toast('操作失败，请重试')
        }
      )
    },

    onCardTap(e) {
      this.triggerEvent('openpost', { id: e.detail.id })
    },
    onCardComment(e) {
      this.triggerEvent('openpost', { id: e.detail.id })
    },
    onAuthor(e) {
      this.triggerEvent('openauthor', { id: e.detail.id })
    },
    onTopic(e) {
      this.triggerEvent('opentopic', { id: e.detail.id })
    },

    /* ---------- 入口 ---------- */
    onTopics() {
      this.triggerEvent('opentopics')
    },
    onCreate() {
      this.triggerEvent('needlogin')
    },
    onEmptyAction() {
      if (this.data.type === 'follow') {
        this.setData({ type: 'recommend' })
        this.reload()
      } else {
        this.reload()
      }
    }
  }
})
