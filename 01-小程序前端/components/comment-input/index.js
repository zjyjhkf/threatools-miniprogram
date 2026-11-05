Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    placeholder: { type: String, value: '说点什么…' },
    value: { type: String, value: '' },
    sending: { type: Boolean, value: false },
    focus: { type: Boolean, value: false }
  },
  data: { inner: '' },
  observers: {
    value(v) {
      this.setData({ inner: v })
    }
  },
  methods: {
    onInput(e) {
      this.setData({ inner: e.detail.value })
      this.triggerEvent('input', { value: e.detail.value })
    },
    onSend() {
      if (this.data.sending) return
      const v = (this.data.inner || '').trim()
      if (!v) {
        this.triggerEvent('empty')
        return
      }
      this.triggerEvent('send', { content: v })
    },
    onFocus() {
      this.triggerEvent('focus')
    },
    onBlur() {
      this.triggerEvent('blur')
    }
  }
})
