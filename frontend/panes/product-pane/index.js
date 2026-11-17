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
    refreshing: false,
    scrollTop: 0
  },
  observers: {
    active(v) {
      if (!v) return
      if (!this.data.firstLoaded) {
        this.reload()
        return
      }
      // 管理端修改商品后，切回产品页自动刷新；5 秒内不重复请求
      if (Date.now() - (this._lastLoadedAt || 0) > 5000) this.reload()
    }
  },
  lifetimes: {
    attached() {
      if (this.data.active && !this.data.firstLoaded) this.reload()
    }
  },
  methods: {
    reload() {
      if (this.data.loading) return Promise.resolve()
      this.setData({ loading: true, status: 'loading' })
      return api
        .getProducts(this.data.category)
        .then(res => {
          this._lastLoadedAt = Date.now()
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

    refresh() {
      return this.reload()
    },

    onPullRefresh() {
      this.setData({ refreshing: true })
      Promise.resolve(this.refresh()).finally(() => this.setData({ refreshing: false }))
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
