/**
 * 我的作品卡（UI 2.1）：封面 + 标题 + 日期/点赞 + 状态胶囊
 * 首页社区模块「我的作品」与社区全屏「我的作品」共用，避免两套卡片。
 */
const { parseTime } = require('../../utils/format')

function formatDay(str) {
  const d = parseTime(str)
  if (!d) return ''
  return d.getMonth() + 1 + '月' + d.getDate() + '日'
}

const STATUS_TEXT = {
  published: '已发布',
  hidden: '已隐藏',
  deleted: '已删除',
  reviewing: '已发布'
}

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    item: { type: Object, value: {} },
    showStatus: { type: Boolean, value: true }
  },
  data: {
    dayText: '',
    statusText: '',
    statusClass: 'is-published',
    failed: false
  },
  observers: {
    item(v) {
      const work = v || {}
      const status = work.status || 'published'
      this.setData({
        dayText: formatDay(work.createdAt),
        statusText: STATUS_TEXT[status] || '已发布',
        statusClass: status === 'hidden' || status === 'deleted' ? 'is-hidden' : 'is-published',
        failed: false
      })
    }
  },
  methods: {
    onCoverError() {
      this.setData({ failed: true })
    },
    onOpen() {
      this.triggerEvent('tap', { id: this.data.item.id })
    }
  }
})
