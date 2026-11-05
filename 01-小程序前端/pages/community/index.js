const store = require('../../store/store')
const mixin = require('../../utils/page-mixin')
const track = require('../../utils/track')
const { ROUTES } = require('../../config/constants')

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      tab: 0,
      tabs: ['运动社区', '课程', '产品'],
      titles: ['运动社区', '课程', '产品']
    }),

    onLoad(options) {
      const idx = ['community', 'course', 'product'].indexOf(options && options.tab)
      if (idx >= 0) {
        this.setData({ tab: idx })
        store.ui.set({ tab: idx })
      }
    },

    onShow() {
      this.syncTabBar()
      const ui = store.ui.get()
      if (ui.loginJustNow) {
        store.ui.set({ loginJustNow: false })
        const action = ui.pendingAction
        store.ui.set({ pendingAction: null })
        if (action === 'publish') {
          this.goPublish()
        } else if (action && action.type === 'like') {
          const pane = this.selectComponent('#pane0')
          if (pane) pane.resumeLike(action.id)
        }
      }
    },

    syncTabBar() {
      const tb = this.getTabBar && this.getTabBar()
      if (tb) tb.setData({ selected: 0 })
    },

    onTabChange(e) {
      const index = e.detail.index
      const from = this.data.tab
      this.setData({ tab: index })
      store.ui.set({ tab: index })
      this.markVisited(index)
      if (from !== index) track.track('tab_switch', { from_tab: from + '', to_tab: index + '' })
    },

    onSwiperChange(e) {
      const index = e.detail.current
      if (index === this.data.tab) return
      this.setData({ tab: index })
      store.ui.set({ tab: index })
      this.markVisited(index)
    },

    markVisited(index) {
      const visited = store.ui.get().visited.slice()
      visited[index] = true
      store.ui.set({ visited })
    },

    onPaneTabSwitch(e) {
      track.track('tab_switch', { from_tab: e.detail.from, to_tab: e.detail.to })
    },

    /* 登录拦截：记录待办，登录成功后回来自动续做 */
    onNeedLogin(e) {
      const action = e && e.detail && e.detail.action
      if (action) store.ui.set({ pendingAction: action })
      this.requireLogin()
    },

    goSearch() {
      wx.navigateTo({ url: ROUTES.search })
    },

    goPublish() {
      if (!this.requireLogin()) {
        store.ui.set({ pendingAction: 'publish' })
        return
      }
      wx.navigateTo({ url: ROUTES.publish })
    },

    openPost(e) {
      track.track('feed_item_click', { post_id: e.detail.id, position: '0' })
      wx.navigateTo({ url: ROUTES.post + '?id=' + e.detail.id })
    },

    openAuthor(e) {
      wx.navigateTo({ url: ROUTES.userProfile + '?id=' + e.detail.id })
    },

    openTopic(e) {
      wx.navigateTo({ url: ROUTES.topicDetail + '?id=' + e.detail.id })
    },

    openTopics() {
      wx.navigateTo({ url: ROUTES.topics })
    },

    openCourse(e) {
      wx.navigateTo({ url: ROUTES.courseDetail + '?id=' + e.detail.id })
    },

    openProduct(e) {
      wx.navigateTo({ url: ROUTES.productDetail + '?id=' + e.detail.id })
    }
  })
)
