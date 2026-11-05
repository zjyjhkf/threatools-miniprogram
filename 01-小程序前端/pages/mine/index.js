const api = require('../../services/api')
const auth = require('../../services/auth')
const store = require('../../store/store')
const mixin = require('../../utils/page-mixin')
const ui = require('../../utils/ui')
const { ROUTES } = require('../../config/constants')
const env = require('../../config/env')

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      isLogin: false,
      user: null,
      completeness: { filled: 0, total: 7, missing: [] },
      percent: 0,
      done: false,
      favoriteCount: 0,
      version: '健衡 v' + env.VERSION,
      copyright: '© 2026 健衡健康科技'
    }),

    onShow() {
      this.syncTabBar()
      this.refresh()
    },

    onHide() {
      store.user.unwatch(this._watcher)
    },

    syncTabBar() {
      const tb = this.getTabBar && this.getTabBar()
      if (tb) tb.setData({ selected: 1 })
    },

    refresh() {
      const logged = auth.isLogin()
      this.setData({ isLogin: logged })
      if (!logged) {
        this.setData({ user: null, percent: 0, done: false, favoriteCount: 0 })
        return
      }
      api
        .getMe()
        .then(user => {
          auth.setProfile(user)
          this.applyUser(user)
          return this.loadFavoriteCount()
        })
        .catch(e => {
          if (e && e.type === 'AUTH') {
            this.setData({ isLogin: false, user: null })
          }
        })
    },

    applyUser(user) {
      const c = user.completeness || { filled: 0, total: 7 }
      const percent = Math.round((c.filled / c.total) * 100)
      this.setData({
        user: user,
        completeness: c,
        percent: percent,
        done: c.filled >= c.total,
        isLogin: true
      })
    },

    loadFavoriteCount() {
      return Promise.all([
        api.getFavorites('post', 1, 1),
        api.getFavorites('course', 1, 1),
        api.getFavorites('product', 1, 1)
      ])
        .then(res => {
          const total = res.reduce((sum, r) => sum + ((r && r.total) || 0), 0)
          this.setData({ favoriteCount: total })
        })
        .catch(() => {})
    },

    goLogin() {
      wx.navigateTo({ url: ROUTES.login })
    },

    goEditProfile() {
      if (!this.requireLogin()) return
      wx.navigateTo({ url: ROUTES.profileEdit })
    },

    goProfile() {
      if (!this.requireLogin()) return
      wx.navigateTo({ url: ROUTES.profile })
    },

    goBody() {
      if (!this.requireLogin()) return
      wx.navigateTo({ url: ROUTES.bodyProfile })
    },

    goFavorites() {
      if (!this.requireLogin()) return
      wx.navigateTo({ url: ROUTES.favorites + '?type=post' })
    },

    goSettings() {
      if (!this.requireLogin()) return
      wx.navigateTo({ url: ROUTES.settings })
    },

    goComplete() {
      if (this.data.done) return
      const missing = this.data.completeness.missing || []
      if (missing.indexOf('height') >= 0 || missing.indexOf('weight') >= 0 || missing.indexOf('goals') >= 0) {
        wx.navigateTo({ url: ROUTES.bodyProfile })
        return
      }
      wx.navigateTo({ url: ROUTES.profileEdit })
    }
  })
)
