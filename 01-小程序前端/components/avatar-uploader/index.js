Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    src: { type: String, value: '' },
    size: { type: Number, value: 128 },
    uploading: { type: Boolean, value: false }
  },
  methods: {
    onChoose(e) {
      const url = e.detail && e.detail.avatarUrl
      if (url) this.triggerEvent('choose', { path: url })
    }
  }
})
