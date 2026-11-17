Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    visible: { type: Boolean, value: true }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap')
    }
  }
})
