Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    tabs: { type: Array, value: [] },
    current: { type: Number, value: 0 }
  },
  methods: {
    onTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (index === this.data.current) return
      this.triggerEvent('change', { index })
    }
  }
})
