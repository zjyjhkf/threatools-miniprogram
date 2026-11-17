/**
 * 全局断网提示条（C23 辅助组件）
 * - 订阅网络状态，断网时在页面顶部显示 64rpx 黄条
 * - 在线时不渲染节点（display:none），不产生布局位移
 */
Component({
  data: {
    show: false
  },

  lifetimes: {
    attached() {
      this._onChange = res => {
        this.setData({ show: !res.isConnected })
      }
      if (wx.onNetworkStatusChange) {
        wx.onNetworkStatusChange(this._onChange)
      }
      try {
        wx.getNetworkType({
          success: res => this.setData({ show: res.networkType === 'none' })
        })
      } catch (e) {}
    },

    detached() {
      if (this._onChange && wx.offNetworkStatusChange) {
        wx.offNetworkStatusChange(this._onChange)
        this._onChange = null
      }
    }
  }
})
