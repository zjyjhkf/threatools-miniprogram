Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    label: { type: String, value: '' },
    value: { type: null, value: '' },
    type: { type: String, value: 'readonly' },
    inputType: { type: String, value: 'text' },
    placeholder: { type: String, value: '未填写' },
    unit: { type: String, value: '' },
    error: { type: String, value: '' },
    arrow: { type: Boolean, value: true },
    disabled: { type: Boolean, value: false },
    maxlength: { type: Number, value: 30 },
    dateStart: { type: String, value: '1940-01-01' },
    dateEnd: { type: String, value: '' },
    field: { type: String, value: '' }
  },
  data: { display: '未填写', empty: true, today: '' },
  observers: {
    value(v) {
      const empty = v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)
      let display = v
      if (Array.isArray(v)) display = v.join('、')
      if (typeof v === 'boolean') display = v ? '开启' : '关闭'
      this.setData({ empty: empty, display: empty ? this.data.placeholder : display })
    },
    placeholder(p) {
      if (this.data.empty) this.setData({ display: p })
    }
  },
  attached() {
    const d = new Date()
    const p = n => (n < 10 ? '0' + n : n)
    this.setData({ today: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) })
  },
  methods: {
    onInput(e) {
      this.triggerEvent('input', { value: e.detail.value, field: this.data.field })
    },
    onDate(e) {
      this.triggerEvent('change', { value: e.detail.value, field: this.data.field })
    },
    onSwitch(e) {
      this.triggerEvent('change', { value: e.detail.value, field: this.data.field })
    },
    onTap() {
      this.triggerEvent('tap', { field: this.data.field })
    }
  }
})
