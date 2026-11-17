Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    product: { type: Object, value: {} },
    mode: { type: String, value: 'grid' }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.data.product.id })
    }
  }
})
