const ICONS = { empty: 'empty', error: 'error', offline: 'offline', login: 'user' }

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    type: { type: String, value: 'empty' },
    title: { type: String, value: '这里还什么都没有' },
    desc: { type: String, value: '' },
    btnText: { type: String, value: '' },
    compact: { type: Boolean, value: false }
  },
  data: { icon: 'empty' },
  observers: {
    type(t) {
      this.setData({ icon: ICONS[t] || 'empty' })
    }
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    }
  }
})
