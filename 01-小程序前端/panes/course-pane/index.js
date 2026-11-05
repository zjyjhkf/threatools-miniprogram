const api = require('../../services/api')
const { COURSE_CATEGORIES } = require('../../config/constants')

const DIFFICULTY = [
  { label: '入门', value: 'beginner' },
  { label: '进阶', value: 'middle' },
  { label: '高阶', value: 'advanced' }
]
const DURATION = [
  { label: '10 分钟内', value: 'lt10' },
  { label: '10–20 分钟', value: '10to20' },
  { label: '20 分钟以上', value: 'gt20' }
]
const PARTS = [
  { label: '下肢', value: 'rehab' },
  { label: '肩颈体态', value: 'posture' },
  { label: '全身放松', value: 'recovery' },
  { label: '拉伸舒展', value: 'stretch' }
]

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    active: { type: Boolean, value: false }
  },
  data: {
    categories: COURSE_CATEGORIES,
    category: 'all',
    difficultyOptions: DIFFICULTY,
    durationOptions: DURATION,
    partOptions: PARTS,
    difficulty: [],
    duration: '',
    part: '',
    main: null,
    list: [],
    hasMore: true,
    page: 1,
    loading: false,
    firstLoaded: false,
    status: 'loading',
    moreStatus: 'idle',
    filterShow: false,
    filterCount: 0,
    scrollTop: 0
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
    reload() {
      this.setData({ list: [], page: 1, hasMore: true, status: 'loading', main: null })
      return this.fetch(1)
    },

    fetch(page) {
      if (this.data.loading) return Promise.resolve()
      this.setData({ loading: true })
      const params = {
        category: this.data.part || this.data.category,
        page: page,
        size: 10
      }
      if (this.data.difficulty.length) params.difficulty = this.data.difficulty.join(',')
      if (this.data.duration) params.duration = this.data.duration

      return api
        .getCourses(params)
        .then(res => {
          const list = page === 1 ? res.list : this.data.list.concat(res.list)
          this.setData({
            main: page === 1 ? res.main : this.data.main,
            list: list,
            hasMore: !!res.hasMore,
            page: page,
            status: list.length || (page === 1 && res.main) ? 'ok' : 'empty',
            moreStatus: res.hasMore ? 'idle' : 'nomore',
            firstLoaded: true,
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

    onCategoryChange(e) {
      this.setData({ category: e.detail.value, scrollTop: 0 })
      wx.nextTick(() => this.setData({ scrollTop: 1 }))
      this.reload()
      this.triggerEvent('tabswitch', { from: this.data.category, to: e.detail.value })
    },

    onLoadMore() {
      if (!this.data.hasMore || this.data.loading) return
      this.setData({ moreStatus: 'loading' })
      this.fetch(this.data.page + 1)
    },

    onRetry() {
      this.reload()
    },
    onRetryMore() {
      this.setData({ moreStatus: 'loading' })
      this.fetch(this.data.page + 1)
    },
    refresh() {
      this.reload()
    },

    /* 筛选 */
    openFilter() {
      this.setData({ filterShow: true })
    },
    closeFilter() {
      this.setData({ filterShow: false })
    },
    onDifficulty(e) {
      this.setData({ difficulty: e.detail.value })
    },
    onDuration(e) {
      this.setData({ duration: e.detail.value })
    },
    onPart(e) {
      this.setData({ part: e.detail.value === this.data.part ? '' : e.detail.value })
    },
    resetFilter() {
      this.setData({ difficulty: [], duration: '', part: '' })
    },
    applyFilter() {
      const count =
        (this.data.difficulty.length ? 1 : 0) + (this.data.duration ? 1 : 0) + (this.data.part ? 1 : 0)
      this.setData({ filterShow: false, filterCount: count })
      this.reload()
    },

    onCourseTap(e) {
      this.triggerEvent('opencourse', { id: e.detail.id })
    },
    onMainTap() {
      if (!this.data.main) return
      this.triggerEvent('opencourse', { id: this.data.main.id })
    }
  }
})
