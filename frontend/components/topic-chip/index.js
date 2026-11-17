Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    name: { type: String, value: '' },
    closable: { type: Boolean, value: false },
    size: { type: String, value: 'm' }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { name: this.data.name })
    },
    onClose() {
      this.triggerEvent('close', { name: this.data.name })
    }
  }
})
