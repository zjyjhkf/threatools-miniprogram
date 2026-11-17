Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    primaryText: { type: String, value: '开始训练' },
    collected: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    /** 主按钮为分享（open-type=share） */
    primaryShare: { type: Boolean, value: false },
    showCollect: { type: Boolean, value: true }
  },
  methods: {
    onPrimary() {
      if (this.data.disabled) return
      this.triggerEvent('primary')
    },
    onCollect() {
      if (!this.data.showCollect) return
      this.triggerEvent('collect', { collected: this.data.collected })
    }
  }
})
