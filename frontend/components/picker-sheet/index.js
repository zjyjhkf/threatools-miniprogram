Component({
  options: { styleIsolation: 'apply-shared', multipleSlots: true },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    options: { type: Array, value: [] },
    value: { type: String, value: '' },
    mode: { type: String, value: 'single' },
    confirmText: { type: String, value: '确定' },
    cancelText: { type: String, value: '取消' }
  },
  data: { current: '' },
  observers: {
    value(v) {
      this.setData({ current: v })
    }
  },
  methods: {
    onPick(e) {
      const value = e.currentTarget.dataset.value
      if (this.data.mode === 'single') this.setData({ current: value })
      this.triggerEvent('pick', { value })
    },
    onConfirm() {
      if (this.data.mode === 'single') this.triggerEvent('confirm', { value: this.data.current })
      else this.triggerEvent('confirm', {})
    },
    onCancel() {
      this.triggerEvent('cancel')
    },
    noop() {}
  }
})
