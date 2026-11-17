const api = require('../../../services/api')
const mixin = require('../../../utils/page-mixin')
const ui = require('../../../utils/ui')
const track = require('../../../utils/track')
const { ROUTES } = require('../../../config/constants')

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      id: '',
      product: null,
      images: [],
      current: 0,
      status: 'loading',
      videoCover: '',
      playing: false,
      navSolid: false
    }),

    onLoad(options) {
      const id = options && options.id
      if (!id) {
        this.failParam('缺少产品 id')
        return
      }
      this.setData({ id: id })
      this.load()
    },

    onShow() {
      // 首次 onShow 与 onLoad 相邻，不重复请求；从其它页返回时刷新后台最新内容
      if (this._hasShown) this.load()
      else this._hasShown = true
    },

    load() {
      api
        .getProduct(this.data.id)
        .then(p => {
          track.track('page_view', { page_id: 'P02', from: '' })
          track.track('product_view', { product_id: p.id })
          const images = (p.images || []).length ? p.images : ['']
          this.setData({
            product: p,
            images: images,
            videoCover: (p.video && p.video.cover) || '',
            status: 'ok'
          })
        })
        .catch(e => this.setData({ status: e && e.code === 40401 ? 'notfound' : 'error' }))
    },

    onSwiperChange(e) {
      this.setData({ current: e.detail.current })
    },

    onPageScroll(e) {
      const solid = e.scrollTop > 200
      if (solid !== this.data.navSolid) this.setData({ navSolid: solid })
    },

    toggleCollect() {
      if (!this.requireLogin()) return
      const p = this.data.product
      const next = !p.collected
      this.setData({ 'product.collected': next })
      api.collectProduct(this.data.id, next).then(
        res => {
          this.setData({ 'product.collected': res.collected, 'product.collectCount': res.collectCount })
          ui.toast(next ? '已收藏产品' : '已取消收藏')
        },
        () => this.setData({ 'product.collected': p.collected })
      )
    },

    playVideo() {
      if (!this.data.product.video || !this.data.product.video.url) {
        ui.toast('视频暂不可播放')
        return
      }
      track.track('product_video_play', { product_id: this.data.id })
      this.setData({ playing: true })
    },

    onVideoEnded() {
      this.setData({ playing: false })
    },

    onVideoError() {
      this.setData({ playing: false })
      ui.toast('视频加载失败')
    },

    copySpec(e) {
      const item = e.currentTarget.dataset.item
      wx.setClipboardData({
        data: item.label + '：' + item.value,
        success: () => ui.toast('已复制到剪贴板')
      })
    },

    openRelated(e) {
      const id = e.currentTarget.dataset.id
      wx.redirectTo({ url: ROUTES.productDetail + '?id=' + id })
    },

    onRetry() {
      this.setData({ status: 'loading' })
      this.load()
    },

    onShareAppMessage() {
      const p = this.data.product
      return {
        title: (p ? p.name + '｜' + p.tagline : '产品详情') + ' - 健衡运动社区',
        path: '/packageProduct/pages/detail/detail?id=' + this.data.id
      }
    }
  })
)
