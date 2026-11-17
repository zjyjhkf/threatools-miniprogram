Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    content: { type: String, value: '' },
    confirmText: { type: String, value: '确定' },
    cancelText: { type: String, value: '取消' },
    danger: { type: Boolean, value: false }
  },
  methods: {
    onConfirm() {
      this.triggerEvent('confirm')
    },
    onCancel() {
      this.triggerEvent('cancel')
    },
    noop() {}
  }
})
