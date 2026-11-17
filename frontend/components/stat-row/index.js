Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    items: { type: Array, value: [] }
  },
  methods: {
    onTap(e) {
      this.triggerEvent('tap', { index: e.currentTarget.dataset.index })
    }
  }
})
