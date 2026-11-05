Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    value: { type: String, value: '' },
    placeholder: { type: String, value: '搜索社区、课程、产品' },
    readonly: { type: Boolean, value: false },
    focus: { type: Boolean, value: false },
    showCancel: { type: Boolean, value: false }
  },
  methods: {
    onInput(e) {
      this.triggerEvent('input', { value: e.detail.value })
    },
    onConfirm(e) {
      this.triggerEvent('confirm', { value: e.detail.value })
    },
    onClear() {
      this.triggerEvent('input', { value: '' })
      this.triggerEvent('clear')
    },
    onTap() {
      if (!this.data.readonly) return
      this.triggerEvent('tap')
    },
    onCancel() {
      this.triggerEvent('cancel')
    }
  }
})
