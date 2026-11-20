Component({
  options: { styleIsolation: 'apply-shared' },
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/device/index', text: '设备', icon: 'device' },
      { pagePath: '/pages/discover/index', text: '发现', icon: 'compass' },
      { pagePath: '/pages/mine/index', text: '我的', icon: 'user' }
    ]
  },
  methods: {
    onTap(e) {
      const index = e.currentTarget.dataset.index
      if (index === this.data.selected) return
      const item = this.data.list[index]
      if (!item) return
      wx.switchTab({ url: item.pagePath })
    }
  }
})
