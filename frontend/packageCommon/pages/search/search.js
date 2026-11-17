const api = require('../../../services/api')
const mixin = require('../../../utils/page-mixin')
const track = require('../../../utils/track')
const storage = require('../../../utils/storage')
const { debounce } = require('../../../utils/throttle')
const { ROUTES } = require('../../../config/constants')

const HISTORY_KEY = 'jh_search_history'
const TABS = [
  { label: '综合', value: 'all' },
  { label: '社区', value: 'post' },
  { label: '课程', value: 'course' },
  { label: '产品', value: 'product' }
]

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      keyword: '',
      mode: 'idle',
      tabs: TABS,
      tab: 'all',
      history: [],
      hot: [],
      result: { courses: [], products: [], posts: [] },
      counts: { post: 0, course: 0, product: 0 },
      searching: false,
      autoFocus: true,
      statusBarHeight: 20
    }),

    onLoad(options) {
      this.setData({
        history: storage.get(HISTORY_KEY, []) || [],
        tab: (options && options.type) || 'all',
        statusBarHeight: (getApp() && getApp().globalData.statusBarHeight) || 20
      })
      this._search = debounce(this.doSearch.bind(this), 300)
      this.loadHot()
    },

    loadHot() {
      api
        .getHotTopics(8)
        .then(res => this.setData({ hot: (res.list || []).slice(0, 8) }))
        .catch(() => {})
    },

    onInput(e) {
      const keyword = e.detail.value
      this.setData({ keyword: keyword })
      if (!keyword.trim()) {
        this.setData({ mode: 'idle', result: { courses: [], products: [], posts: [] } })
        return
      }
      this._search()
    },

    onConfirm() {
      if (!this.data.keyword.trim()) return
      this.saveHistory(this.data.keyword.trim())
      track.track('search_submit', { keyword: this.data.keyword.trim(), tab: this.data.tab })
      this.doSearch(true)
    },

    doSearch(force) {
      const keyword = (this.data.keyword || '').trim()
      if (!keyword) return
      if (force) this.saveHistory(keyword)
      this.setData({ searching: true })
      api
        .search(keyword, this.data.tab, 1)
        .then(res => {
          this.setData({
            result: {
              courses: res.courses || [],
              products: res.products || [],
              posts: res.posts || []
            },
            counts: res.counts || { post: 0, course: 0, product: 0 },
            mode: 'result',
            searching: false
          })
        })
        .catch(() => {
          this.setData({ searching: false, mode: 'result' })
        })
    },

    saveHistory(word) {
      let history = storage.get(HISTORY_KEY, []) || []
      history = history.filter(w => w !== word)
      history.unshift(word)
      history = history.slice(0, 10)
      storage.set(HISTORY_KEY, history)
      this.setData({ history: history })
    },

    clearHistory() {
      uiDlg(this, '清空搜索历史？', '清空后不可恢复', () => {
        storage.set(HISTORY_KEY, [])
        this.setData({ history: [] })
      })
    },

    onTabChange(e) {
      const tab = e.currentTarget.dataset.value
      if (tab === this.data.tab) return
      this.setData({ tab: tab })
      this.doSearch()
    },

    pickWord(e) {
      const word = e.currentTarget.dataset.word
      this.setData({ keyword: word })
      this.onConfirm()
    },

    onCancel() {
      this.back()
    },

    openCourse(e) {
      wx.navigateTo({ url: ROUTES.courseDetail + '?id=' + e.detail.id })
    },
    openProduct(e) {
      wx.navigateTo({ url: ROUTES.productDetail + '?id=' + e.detail.id })
    },
    openPost(e) {
      wx.navigateTo({ url: ROUTES.post + '?id=' + e.detail.id })
    },
    viewAll(e) {
      const tab = e.currentTarget.dataset.value
      this.setData({ tab: tab })
      this.doSearch()
    },
    switchToRecommend() {
      this.setData({ keyword: '', mode: 'idle' })
    },

    onDialogOk() {
      if (typeof this._ok === 'function') this._ok()
      this._ok = null
    }
  })
)

function uiDlg(page, title, content, ok) {
  page._ok = ok
  page.setData({
    dialog: {
      show: true,
      type: '',
      title: title,
      content: content,
      confirmText: '清空',
      cancelText: '取消',
      danger: true
    }
  })
}
