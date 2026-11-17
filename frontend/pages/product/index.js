const mixin = require('../../utils/page-mixin')
const storage = require('../../utils/storage')
const track = require('../../utils/track')
const { ROUTES } = require('../../config/constants')

const TAB_KEY = 'jh_product_tab'
const TABS = ['product', 'course']

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      tab: 0,
      tabs: ['产品', '课程'],
      titles: ['产品', '课程']
    }),

    onLoad(options) {
      const fromQuery = options && options.tab
      const fromStorage = storage.get(TAB_KEY, '')
      const wanted = fromQuery || fromStorage
      const index = TABS.indexOf(wanted)
      if (index >= 0) this.setData({ tab: index })
    },

    onShow() {
      this.syncTabBar()
      // 首页快捷场景会写 jh_product_tab 后 switchTab 过来；tab 页不会重新 onLoad
      const saved = storage.get(TAB_KEY, '')
      const index = TABS.indexOf(saved)
      if (index >= 0 && index !== this.data.tab) this.setData({ tab: index })
      this.refreshActivePane()
    },

    syncTabBar() {
      const tb = this.getTabBar && this.getTabBar()
      if (tb) tb.setData({ selected: 1 })
    },

    /** 管理端保存后切回本页可见；5 秒内不重复请求由 pane 自行节流 */
    refreshActivePane() {
      const pane = this.selectComponent('#pane' + this.data.tab)
      if (pane && typeof pane.refresh === 'function') pane.refresh()
    },

    onTabChange(e) {
      const index = Number(e.detail.index)
      if (index === this.data.tab) return
      this.setData({ tab: index })
      storage.set(TAB_KEY, TABS[index])
      track.track('tab_switch', { from_tab: TABS[this.data.tab], to_tab: TABS[index] })
    },

    onSwiperChange(e) {
      const index = e.detail.current
      if (index === this.data.tab) return
      this.setData({ tab: index })
      storage.set(TAB_KEY, TABS[index])
    },

    onTabTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (index === this.data.tab) return
      const from = this.data.tab
      this.setData({ tab: index })
      storage.set(TAB_KEY, TABS[index])
      track.track('tab_switch', { from_tab: TABS[from], to_tab: TABS[index] })
    },

    goSearch() {
      wx.navigateTo({ url: ROUTES.search })
    },

    openProduct(e) {
      wx.navigateTo({ url: ROUTES.productDetail + '?id=' + e.detail.id })
    },

    openCourse(e) {
      wx.navigateTo({ url: ROUTES.courseDetail + '?id=' + e.detail.id })
    },

    onTabSwitchTrack(e) {
      track.track('tab_switch', { from_tab: e.detail.from, to_tab: e.detail.to })
    }
  })
)
