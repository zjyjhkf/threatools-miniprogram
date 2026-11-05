const api = require('../../services/api')
const { PRODUCT_CATEGORIES } = require('../../config/constants')

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    active: { type: Boolean, value: false }
  },
  data: {
    categories: PRODUCT_CATEGORIES,
    category: 'all',
    banner: null,
    list: [],
    loading: false,
    firstLoaded: false,
    status: 'loading',
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
      if (this.data.loading) return
      this.setData({ loading: true, status: 'loading' })
      api
        .getProducts(this.data.category)
        .then(res => {
          this.setData({
            banner: res.banner,
            list: res.list,
            status: res.list.length ? 'ok' : 'empty',
            firstLoaded: true,
            loading: false
          })
        })
        .catch(() => {
          this.setData({ loading: false, status: this.data.list.length ? 'ok' : 'error' })
        })
    },

    onCategoryChange(e) {
      this.setData({ category: e.detail.value })
      wx.nextTick(() => this.setData({ scrollTop: 1 }))
      this.reload()
      this.triggerEvent('tabswitch', { from: this.data.category, to: e.detail.value })
    },

    onProductTap(e) {
      this.triggerEvent('openproduct', { id: e.detail.id })
    },

    onRetry() {
      this.reload()
    }
  }
})
