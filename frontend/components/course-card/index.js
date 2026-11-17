const { formatDuration, formatCount } = require('../../utils/format')

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    course: { type: Object, value: {} },
    mode: { type: String, value: 'row' }
  },
  data: { durText: '', learnText: '' },
  observers: {
    course(c) {
      if (!c) return
      this.setData({
        durText: formatDuration(c.duration),
        learnText: formatCount(c.learnCount)
      })
    }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.data.course.id })
    }
  }
})
