const api = require('../../services/api')
const auth = require('../../services/auth')
const ui = require('../../utils/ui')
const storage = require('../../utils/storage')
const track = require('../../utils/track')
const { fillColumns } = require('../../utils/masonry')
const { FEED_TYPES } = require('../../config/constants')

const DIRTY_KEY = 'jh_feed_dirty'
const REFRESH_GAP = 5000
const MYWORKS_PAGE_SIZE = 10

function decorateWork(item) {
  const work = Object.assign({}, item)
  if (!work.title) work.title = (work.content || '').slice(0, 24)
  return work
}

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    active: { type: Boolean, value: false },
    initialType: { type: String, value: '' }
  },
  data: {
    types: FEED_TYPES,
    type: 'recommend',
    /* 推荐 / 关注（游标分页 + 双列瀑布流） */
    list: [],
    leftList: [],
    rightList: [],
    leftH: 0,
    rightH: 0,
    cursor: '',
    hasMore: true,
    loading: false,
    refreshing: false,
    firstLoaded: false,
    status: 'loading',
    moreStatus: 'idle',
    errorMsg: '',
    offline: false,
    pending: {},
    /* 我的作品（页码分页 + 两列网格） */
    myworks: [],
    worksStatus: 'loading',
    worksPage: 1,
    worksHasMore: true,
    worksMoreStatus: 'idle',
    worksTotal: 0,
    worksLikes: 0,
    worksLoading: false,
    isLogin: false,
    scrollTop: 0
  },
  observers: {
    active(v) {
      if (v) this.start()
    },
    initialType(v) {
      if (v && FEED_TYPES.some(t => t.value === v) && v !== this.data.type) {
        this.setData({ type: v })
        if (this.data.active) {
          this._started = false
          this.start()
        }
      }
    }
  },
  lifetimes: {
    attached() {
      if (this.data.initialType && FEED_TYPES.some(t => t.value === this.data.initialType)) {
        this.setData({ type: this.data.initialType })
      }
      if (this.data.active) this.start()
    }
  },
  methods: {
    /* ---------- 生命周期 ---------- */
    start() {
      if (this._started) {
        this.refreshIfNeeded()
        return
      }
      this._started = true
      this.reload()
    },

    refreshIfNeeded() {
      const dirty = !!storage.get(DIRTY_KEY, false)
      const last = this.data.type === 'myworks' ? this._worksLoadedAt : this._lastLoadedAt
      const stale = Date.now() - (last || 0) > REFRESH_GAP
      if (!dirty && !stale) return
      if (dirty) storage.remove(DIRTY_KEY)
      this.reload()
    },

    reload() {
      if (this.data.type === 'myworks') return this.loadWorks(true)
      return this.fetch(true)
    },

    /* ---------- 推荐 / 关注 ---------- */
    fetch(reset) {
      if (this.data.loading) return Promise.resolve()
      // 关注流需要登录：未登录先给登录引导，不发请求
      if (this.data.type === 'follow' && !auth.isLogin()) {
        this.setData({
          status: 'needlogin',
          loading: false,
          refreshing: false,
          firstLoaded: true,
          list: [],
          leftList: [],
          rightList: [],
          leftH: 0,
          rightH: 0,
          hasMore: false
        })
        return Promise.resolve()
      }
      this.setData({ loading: true })
      if (reset) {
        this.setData({
          list: [],
          leftList: [],
          rightList: [],
          leftH: 0,
          rightH: 0,
          cursor: '',
          hasMore: true,
          status: 'loading',
          moreStatus: 'idle'
        })
      }
      return api
        .getFeed(this.data.type, reset ? '' : this.data.cursor, 10)
        .then(res => {
          const incoming = res.list || []
          const list = reset ? incoming : this.data.list.concat(incoming)
          // 双列分发：只在已有列高上继续追加，已渲染卡片不跳列
          const columns = reset
            ? fillColumns([], [], 0, 0, incoming)
            : fillColumns(this.data.leftList, this.data.rightList, this.data.leftH, this.data.rightH, incoming)
          this._lastLoadedAt = Date.now()
          this.setData({
            list: list,
            leftList: columns.left,
            rightList: columns.right,
            leftH: columns.leftH,
            rightH: columns.rightH,
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

    /* ---------- 我的作品 ---------- */
    loadWorks(reset) {
      const logged = auth.isLogin()
      this.setData({ isLogin: logged })
      if (!logged) {
        this.setData({ myworks: [], worksStatus: 'guest', worksTotal: 0, worksLikes: 0 })
        return Promise.resolve()
      }
      const profile = auth.getProfile() || {}
      if (!profile.id) {
        return api
          .getMe()
          .then(user => {
            auth.setProfile(user)
            return this.loadWorks(reset)
          })
          .catch(() => this.setData({ worksStatus: 'error' }))
      }
      if (this.data.worksLoading) return Promise.resolve()
      const page = reset ? 1 : this.data.worksPage + 1
      this.setData({
        worksLoading: true,
        myworks: reset ? [] : this.data.myworks,
        worksStatus: reset ? 'loading' : this.data.worksStatus
      })
      return api
        .getUserPosts(profile.id, page, MYWORKS_PAGE_SIZE)
        .then(res => {
          const incoming = (res.list || []).map(decorateWork)
          const list = reset ? incoming : this.data.myworks.concat(incoming)
          this._worksLoadedAt = Date.now()
          this.setData({
            myworks: list,
            worksPage: page,
            worksHasMore: !!res.hasMore,
            worksTotal: Number(res.total) || list.length,
            worksLikes:
              Number(res.likeTotal) || list.reduce((sum, w) => sum + (Number(w.likeCount) || 0), 0),
            worksStatus: list.length ? 'ok' : 'empty',
            worksMoreStatus: res.hasMore ? 'idle' : 'nomore',
            worksLoading: false
          })
        })
        .catch(() => {
          this.setData({
            worksLoading: false,
            worksStatus: this.data.myworks.length ? 'ok' : 'error'
          })
        })
    },

    /* ---------- 刷新 / 分页 ---------- */
    onRefresh() {
      this.setData({ refreshing: true })
      const task = this.data.type === 'myworks' ? this.loadWorks(true) : this.fetch(true)
      Promise.resolve(task).then(() => {
        this.setData({ refreshing: false, scrollTop: 0 })
      })
    },

    onLoadMore() {
      if (this.data.type === 'myworks') {
        if (!this.data.worksHasMore || this.data.worksLoading) return
        this.setData({ worksMoreStatus: 'loading' })
        this.loadWorks(false)
        return
      }
      if (!this.data.hasMore || this.data.loading) return
      this.setData({ moreStatus: 'loading' })
      this.fetch(false)
    },

    onRetry() {
      this.reload()
    },

    onRetryMore() {
      this.onLoadMore()
    },

    /* ---------- 筛选 ---------- */
    /** 切页签：重置列表并拉取（供页面/登录后回跳调用） */
    switchType(type) {
      if (!type || type === this.data.type) return
      const from = this.data.type
      this.setData({
        type: type,
        list: [],
        leftList: [],
        rightList: [],
        leftH: 0,
        rightH: 0,
        cursor: '',
        hasMore: true,
        myworks: [],
        worksPage: 1,
        worksHasMore: true,
        worksMoreStatus: 'idle'
      })
      if (type === 'myworks') this.loadWorks(true)
      else this.reload()
      this.triggerEvent('tabswitch', { from: from, to: type })
    },

    onTypeChange(e) {
      const type = e.detail.value
      if (type === this.data.type) return
      this.switchType(type)
    },

    /* ---------- 卡片交互 ---------- */
    findIndex(id) {
      return this.data.list.findIndex(p => String(p.id) === String(id))
    },

    /** 定位到所在列做精确 setData，避免整列重渲染；list 与列共享同一对象引用 */
    patchPost(id, patch) {
      const i = this.findIndex(id)
      if (i < 0) return
      const post = this.data.list[i]
      Object.keys(patch).forEach(key => {
        post[key] = patch[key]
      })
      const column = this.data.leftList.some(p => String(p.id) === String(id)) ? 'leftList' : 'rightList'
      const columnIndex = this.data[column].findIndex(p => String(p.id) === String(id))
      if (columnIndex < 0) return
      const data = {}
      Object.keys(patch).forEach(key => {
        data[column + '[' + columnIndex + '].' + key] = patch[key]
      })
      this.setData(data)
    },

    patchAuthor(authorId, patch) {
      this.data.list
        .filter(p => String(p.author.id) === String(authorId))
        .forEach(p => this.patchPost(p.id, patch))
    },

    /** 登录成功后自动续做点赞（PRD FR-01-05） */
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
      const prevCount = this.data.list[i].likeCount
      const next = !liked
      this.patchPost(id, { liked: next, likeCount: Math.max(0, prevCount + (next ? 1 : -1)) })
      this.setData({ ['pending.' + id]: true })
      api
        .likePost(id, next)
        .then(res => {
          this.patchPost(id, { liked: res.liked, likeCount: res.likeCount })
          track.track('like_click', { post_id: id, action: next ? 'like' : 'unlike' })
          this.triggerEvent('like', { id, action: next ? 'like' : 'unlike' })
        })
        .catch(() => {
          this.patchPost(id, { liked: liked, likeCount: prevCount })
          ui.toast('操作失败，请重试')
        })
        .then(() => {
          this.setData({ ['pending.' + id]: false })
        })
    },

    onCardTap(e) {
      this.triggerEvent('openpost', { id: e.detail.id })
    },

    onWorkTap(e) {
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
    onPublish() {
      this.triggerEvent('publish')
    },
    onLoginTap() {
      // 记录登录前的页签：登录返回后回到原页签（我的作品 / 关注）
      const action = this.data.type === 'myworks' ? { type: 'myworks' } : { type: 'follow' }
      this.triggerEvent('needlogin', { action: action })
    },
    onEmptyAction() {
      if (this.data.type === 'follow') {
        this.switchType('recommend')
        return
      }
      if (this.data.type === 'myworks') {
        this.onPublish()
        return
      }
      this.reload()
    }
  }
})
