const api = require('../../services/api')
const ble = require('../../utils/ble')
const { PRODUCT_CATEGORIES } = require('../../config/constants')

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    active: { type: Boolean, value: false }
  },
  data: {
    categories: PRODUCT_CATEGORIES,
    category: 'all',
    ble: { connected: false, deviceName: '', adapterReady: false, supported: true },
    connectTip: '通过蓝牙连接健衡设备，开启数据回传',
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
      this._supported = ble.isSupported()
      this._onBle = s => this.applyBle(s)
      ble.onState(this._onBle)
      this.applyBle(ble.snapshot())
      if (this.data.active && !this.data.firstLoaded) this.reload()
    },
    detached() {
      ble.offState(this._onBle)
    }
  },
  methods: {
    applyBle(s) {
      const supported = this._supported !== false
      let connectTip = '通过蓝牙连接健衡设备，开启数据回传'
      if (!supported) {
        connectTip = '当前环境不支持蓝牙，请用真机预览'
      } else if (s.connected) {
        connectTip = '数据通道已就绪，可查看设备状态'
      } else if (s.adapterReady) {
        connectTip = '搜索并连接附近的康复设备'
      }

      this.setData({
        ble: {
          connected: s.connected,
          deviceName: s.deviceName,
          adapterReady: s.adapterReady,
          supported: supported
        },
        connectTip: connectTip
      })
    },

    reload() {
      if (this.data.loading) return Promise.resolve()
      this.setData({ loading: true, status: 'loading' })
      return api
        .getProducts(this.data.category)
        .then(res => {
          this._lastLoadedAt = Date.now()
          this.setData({
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

    onConnectTap() {
      this.triggerEvent('openconnect')
    },

    onRetry() {
      this.reload()
    }
  }
})
