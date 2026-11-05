Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    src: { type: String, value: '' },
    w: { type: null, value: 686 },
    h: { type: null, value: 515 },
    radius: { type: String, value: '16rpx' },
    mode: { type: String, value: 'aspectFill' },
    label: { type: String, value: '' },
    showText: { type: Boolean, value: true }
  },
  data: { failed: false },
  observers: {
    src() {
      if (this.data.failed) this.setData({ failed: false })
    }
  },
  methods: {
    onError() {
      this.setData({ failed: true })
    },
    onTap() {
      this.triggerEvent('tap', { src: this.data.src })
    }
  }
})
