const store = require('../../store/store')
const mixin = require('../../utils/page-mixin')
const track = require('../../utils/track')
const { ROUTES } = require('../../config/constants')

const VALID_TABS = ['recommend', 'follow', 'myworks']
const TAB_KEY = 'jh_community_tab'

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      initialType: 'recommend',
      activeType: 'recommend'
    }),

    onLoad(options) {
      const tab = options && options.tab
      const initial = VALID_TABS.indexOf(tab) >= 0 ? tab : 'recommend'
      this.setData({ initialType: initial, activeType: initial })
    },

    onShow() {
      const uiState = store.ui.get()
      if (uiState.loginJustNow) {
        store.ui.set({ loginJustNow: false })
        const action = uiState.pendingAction
        store.ui.set({ pendingAction: null })
        const pane = this.selectComponent('#pane0')
        if (action === 'publish') {
          this.goPublish()
        } else if (action && action.type === 'like' && pane) {
          // 登录成功后自动续做点赞（PRD FR-01-05）
          pane.resumeLike(action.id)
        } else if (action && action.type === 'myworks' && pane) {
          pane.switchType('myworks')
        } else if (pane) {
          // 登录后刷新当前页签（关注流/我的作品需要登录态）
          pane.reload()
        }
      }
      // 发布成功返回：切到我的作品页签
      this.consumeJumpTab()
      // 先发后审：发布成功写 feed_dirty，回到社区后刷新当前页签
      this.refreshIfDirty()
    },

    /** 其他页面通过 storage 指定落地页签（如 D09「查看我的作品」） */
    consumeJumpTab() {
      let tab = ''
      try {
        tab = wx.getStorageSync(TAB_KEY) || ''
      } catch (e) {
        tab = ''
      }
      if (!tab) return
      wx.removeStorageSync(TAB_KEY)
      if (VALID_TABS.indexOf(tab) < 0) return
      this.setData({ initialType: tab, activeType: tab })
      const pane = this.selectComponent('#pane0')
      if (pane && typeof pane.switchType === 'function') pane.switchType(tab)
    },

    refreshIfDirty() {
      const pane = this.selectComponent('#pane0')
      if (pane && typeof pane.refreshIfNeeded === 'function') pane.refreshIfNeeded()
    },

    onBack() {
      this.back()
    },

    /* 登录拦截：记录待办，登录成功后回来自动续做 */
    onNeedLogin(e) {
      const action = e && e.detail && e.detail.action
      if (action) store.ui.set({ pendingAction: action })
      this.requireLogin()
    },

    onPaneTabSwitch(e) {
      const to = e.detail && e.detail.to
      if (to) this.setData({ activeType: to })
      track.track('tab_switch', { from_tab: e.detail.from, to_tab: to })
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
    }
  })
)
