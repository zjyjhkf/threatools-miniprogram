Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    /** idle | loading | nomore | error */
    status: { type: String, value: 'idle' }
  },
  methods: {
    onRetry() {
      this.triggerEvent('retry')
    }
  }
})
