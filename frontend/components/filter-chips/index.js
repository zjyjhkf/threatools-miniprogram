Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    options: { type: Array, value: [] },
    value: { type: null, value: '' },
    multiple: { type: Boolean, value: false },
    scroll: { type: Boolean, value: false },
    /** chip：胶囊（默认）；tab：D01 下划线标签（30rpx，间距 40） */
    variant: { type: String, value: 'chip' }
  },
  data: {
    checked: {}
  },
  observers: {
    value(v) {
      const map = {}
      if (Array.isArray(v)) v.forEach(i => (map[i] = true))
      else if (v !== '' && v !== null && v !== undefined) map[v] = true
      this.setData({ checked: map })
    }
  },
  methods: {
    onTap(e) {
      const item = e.currentTarget.dataset.item
      if (!item) return
      if (this.data.multiple) {
        const checked = Object.assign({}, this.data.checked)
        checked[item.value] = !checked[item.value]
        const values = this.data.options.filter(o => checked[o.value]).map(o => o.value)
        this.triggerEvent('change', { value: values })
        return
      }
      if (item.value === this.data.value) return
      this.triggerEvent('change', { value: item.value })
    }
  }
})
