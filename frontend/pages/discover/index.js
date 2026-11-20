const api = require('../../services/api')
const { formatCount } = require('../../utils/format')
const { ROUTES } = require('../../config/constants')

const TABS = [
  { key: 'recommend', text: '推荐' },
  { key: 'guide', text: '指南' },
  { key: 'service', text: '服务' }
]

Page({
  data: {
    tabs: TABS,
    tab: 'recommend',
    posts: [],
    courses: [],
    products: [],
    loaded: { recommend: false, guide: false, service: false },
    status: 'loading',
    errorText: ''
  },

  onLoad(options) {
    const tab = TABS.some(t => t.key === options.tab) ? options.tab : 'recommend'
    this.setData({ tab })
    this.ensure(tab)
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    const jump = wx.getStorageSync('jh_discover_tab')
    if (jump) {
      wx.removeStorageSync('jh_discover_tab')
      if (TABS.some(t => t.key === jump) && jump !== this.data.tab) {
        this.setData({ tab: jump })
        this.ensure(jump)
      }
    }
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.key
    if (tab === this.data.tab) return
    this.setData({ tab })
    this.ensure(tab)
  },

  ensure(tab) {
    if (this.data.loaded[tab]) {
      const list = tab === 'recommend' ? this.data.posts : tab === 'guide' ? this.data.courses : this.data.products
      this.setData({ status: list.length ? 'ok' : 'empty' })
      return
    }
    if (tab === 'recommend') this.loadPosts()
    if (tab === 'guide') this.loadCourses()
    if (tab === 'service') this.loadProducts()
  },

  loadPosts() {
    this.setData({ status: 'loading' })
    api
      .getFeed('recommend', '', 12)
      .then(res => {
        const list = (res.list || []).map(post => ({
          id: post.id,
          title: post.title || (post.content || '').slice(0, 28),
          cover: post.cover && post.cover.url ? post.cover.url : post.coverImage || '',
          author: (post.author && post.author.nickname) || '健衡用户',
          likeText: formatCount(post.likeCount || 0),
          imageCount: post.imageCount || 0
        }))
        const loaded = Object.assign({}, this.data.loaded, { recommend: true })
        this.setData({ posts: list, loaded, status: list.length ? 'ok' : 'empty', errorText: '' })
      })
      .catch(() => {
        this.setData({ status: 'error', errorText: '内容加载失败，请稍后重试' })
      })
  },

  loadCourses() {
    this.setData({ status: 'loading' })
    api
      .getCourses({ page: 1, size: 12 })
      .then(res => {
        const list = res.list || []
        const loaded = Object.assign({}, this.data.loaded, { guide: true })
        this.setData({ courses: list, loaded, status: list.length ? 'ok' : 'empty', errorText: '' })
      })
      .catch(() => {
        this.setData({ status: 'error', errorText: '课程加载失败，请稍后重试' })
      })
  },

  loadProducts() {
    this.setData({ status: 'loading' })
    api
      .getProducts('')
      .then(res => {
        const list = res.list || []
        const loaded = Object.assign({}, this.data.loaded, { service: true })
        this.setData({ products: list, loaded, status: list.length ? 'ok' : 'empty', errorText: '' })
      })
      .catch(() => {
        this.setData({ status: 'error', errorText: '产品加载失败，请稍后重试' })
      })
  },

  onRetry() {
    const loaded = Object.assign({}, this.data.loaded)
    loaded[this.data.tab] = false
    this.setData({ loaded })
    this.ensure(this.data.tab)
  },

  openPost(e) {
    wx.navigateTo({ url: ROUTES.post + '?id=' + e.detail.id })
  },

  openCourse(e) {
    wx.navigateTo({ url: ROUTES.courseDetail + '?id=' + e.detail.id })
  },

  openProduct(e) {
    wx.navigateTo({ url: ROUTES.productDetail + '?id=' + e.detail.id })
  },

  goSearch() {
    wx.navigateTo({ url: ROUTES.search })
  },

  goDeviceGuide() {
    wx.navigateTo({ url: ROUTES.deviceIntro })
  },

  goCommunity() {
    wx.navigateTo({ url: ROUTES.community + '?tab=recommend' })
  }
})
