Component({
  options: { styleIsolation: 'apply-shared' },
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/home/index', text: '首页', icon: 'home' },
      { pagePath: '/pages/product/index', text: '产品', icon: 'box' },
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
