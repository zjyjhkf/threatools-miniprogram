const api = require('../../services/api')
const auth = require('../../services/auth')
const store = require('../../store/store')
const mixin = require('../../utils/page-mixin')
const ui = require('../../utils/ui')
const storage = require('../../utils/storage')
const { ROUTES } = require('../../config/constants')
const { formatCount, formatDuration } = require('../../utils/format')

const DIRTY_KEY = 'jh_feed_dirty'
const REFRESH_GAP = 5000
const RECOMMEND_SIZE = 3
const WORKS_SIZE = 2

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      statusBarHeight: 20,
      feedTab: 0,
      recommend: [],
      recommendStatus: 'loading',
      works: [],
      worksStatus: 'loading',
      worksTotal: 0,
      worksLikes: 0,
      isLogin: false,
      featured: { product: null, course: null, courseMeta: '' },
      featuredStatus: 'loading',
      refreshing: false
    }),

    onLoad() {
      const app = getApp()
      this.setData({ statusBarHeight: (app && app.globalData.statusBarHeight) || 20 })
      this.loadFeatured()
      this.loadRecommend(true)
      this.loadWorks(true)
    },

    onShow() {
      this.syncTabBar()
      const uiState = store.ui.get()
      if (uiState.loginJustNow) {
        store.ui.set({ loginJustNow: false })
        const action = uiState.pendingAction
        store.ui.set({ pendingAction: null })
        if (action === 'publish') this.goPublish()
        // 登录后“我的作品/完善度”立即刷新
        this.loadWorks(true)
      }
      this.refreshIfNeeded()
    },

    syncTabBar() {
      const tb = this.getTabBar && this.getTabBar()
      if (tb) tb.setData({ selected: 0 })
    },

    /* ---------- 数据 ---------- */
    loadRecommend(showLoading) {
      if (this.data.recommendStatus === 'loading' && !showLoading) return Promise.resolve()
      if (showLoading) this.setData({ recommendStatus: 'loading' })
      return api
        .getFeed('recommend', '', RECOMMEND_SIZE)
        .then(res => {
          const list = (res.list || []).map(item => this.decorate(item))
          this._lastLoadedAt = Date.now()
          this.setData({
            recommend: list,
            recommendStatus: list.length ? 'ok' : 'empty'
          })
        })
        .catch(() => {
          this.setData({
            recommendStatus: this.data.recommend.length ? 'ok' : 'error'
          })
        })
    },

    decorate(item) {
      const post = Object.assign({}, item)
      post.displayTitle = (post.title || '').trim() || (post.content || '').slice(0, 24)
      post.likeText = formatCount(post.likeCount)
      return post
    },

    loadWorks(showLoading) {
      const logged = auth.isLogin()
      this.setData({ isLogin: logged })
      if (!logged) {
        this.setData({ works: [], worksStatus: 'guest', worksTotal: 0, worksLikes: 0 })
        return Promise.resolve()
      }
      const profile = auth.getProfile() || {}
      if (!profile.id) {
        return api
          .getMe()
          .then(user => {
            auth.setProfile(user)
            return this.loadWorks(showLoading)
          })
          .catch(() => this.setData({ worksStatus: 'error' }))
      }
      if (showLoading) this.setData({ worksStatus: 'loading' })
      return api
        .getUserPosts(profile.id, 1, WORKS_SIZE)
        .then(res => {
          const list = (res.list || []).map(item => this.decorateWork(item))
          this.setData({
            works: list,
            worksTotal: Number(res.total) || list.length,
            worksLikes: Number(res.likeTotal) || list.reduce((sum, w) => sum + (w.likeCount || 0), 0),
            worksStatus: list.length ? 'ok' : 'empty'
          })
        })
        .catch(() => {
          this.setData({ worksStatus: this.data.works.length ? 'ok' : 'error' })
        })
    },

    decorateWork(item) {
      const work = Object.assign({}, item)
      work.displayTitle = (work.title || '').trim() || (work.content || '').slice(0, 24)
      return work
    },

    loadFeatured() {
      return Promise.all([api.getProducts('all'), api.getCourses({ page: 1, size: 3 })])
        .then(([products, courses]) => {
          const product = (products.list || [])[0] || null
          const course = courses.main || (courses.list || [])[0] || null
          this.setData({
            featured: {
              product: product ? { id: product.id, name: product.name, tagline: product.tagline, cover: product.cover } : null,
              course: course
                ? {
                    id: course.id,
                    title: course.title,
                    cover: course.cover,
                    actionCount: course.actionCount,
                    duration: course.duration
                  }
                : null,
              courseMeta: course ? (course.actionCount || 0) + ' 个动作 · ' + formatDuration(course.duration) : ''
            },
            featuredStatus: product || course ? 'ok' : 'empty'
          })
        })
        .catch(() => this.setData({ featuredStatus: 'empty' }))
    },

    refreshIfNeeded() {
      const dirty = !!storage.get(DIRTY_KEY, false)
      const stale = Date.now() - (this._lastLoadedAt || 0) > REFRESH_GAP
      if (!dirty && !stale) return
      this.loadRecommend(true)
      this.loadWorks(true)
      this.loadFeatured()
      if (dirty) storage.remove(DIRTY_KEY)
    },

    onPullRefresh() {
      this.setData({ refreshing: true })
      Promise.all([this.loadRecommend(true), this.loadWorks(true), this.loadFeatured()]).then(() => {
        this.setData({ refreshing: false })
      })
    },

    /* ---------- 交互 ---------- */
    onFeedTab(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (index === this.data.feedTab) return
      this.setData({ feedTab: index })
      if (index === 1 && auth.isLogin() && this.data.worksStatus === 'loading') this.loadWorks(true)
    },

    onNotice() {
      ui.toast('暂无新消息')
    },

    onMore() {
      if (this.data.feedTab === 0) this.goCommunity()
      else this.goMyWorks()
    },

    goCommunity() {
      wx.navigateTo({ url: ROUTES.community + '?tab=recommend' })
    },

    goMyWorks() {
      if (!this.requireLogin()) return
      wx.navigateTo({ url: ROUTES.community + '?tab=myworks' })
    },

    goProduct(e) {
      const tab = (e && e.currentTarget && e.currentTarget.dataset.tab) || 'product'
      storage.set('jh_product_tab', tab)
      wx.switchTab({ url: ROUTES.product })
    },

    goPublish() {
      if (!this.requireLogin()) {
        store.ui.set({ pendingAction: 'publish' })
        return
      }
      wx.navigateTo({ url: ROUTES.publish })
    },

    openPost(e) {
      const id = (e.currentTarget.dataset.id || e.detail.id)
      wx.navigateTo({ url: ROUTES.post + '?id=' + id })
    },

    openWork(e) {
      const id = (e.currentTarget.dataset.id || e.detail.id)
      wx.navigateTo({ url: ROUTES.post + '?id=' + id })
    },

    openProduct(e) {
      wx.navigateTo({ url: ROUTES.productDetail + '?id=' + e.currentTarget.dataset.id })
    },

    openCourse(e) {
      wx.navigateTo({ url: ROUTES.courseDetail + '?id=' + e.currentTarget.dataset.id })
    },

    goLogin() {
      wx.navigateTo({ url: ROUTES.login })
    },

    retryWorks() {
      this.loadWorks(true)
    },

    retryRecommend() {
      this.loadRecommend(true)
    }
  })
)
