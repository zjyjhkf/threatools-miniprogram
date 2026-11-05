const { relativeTime, formatCount } = require('../../utils/format')

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    comment: { type: Object, value: {} },
    isAuthor: { type: Boolean, value: false }
  },
  data: { timeText: '', likeText: '', childCount: 0 },
  observers: {
    comment(c) {
      if (!c) return
      this.setData({
        timeText: relativeTime(c.createdAt),
        likeText: formatCount(c.likeCount),
        childCount: (c.children || []).length
      })
    }
  },
  methods: {
    onLike() {
      this.triggerEvent('like', { id: this.data.comment.id, liked: this.data.comment.liked })
    },
    onReply() {
      this.triggerEvent('reply', { comment: this.data.comment })
    },
    onLongPress() {
      this.triggerEvent('longpress', { comment: this.data.comment })
    },
    onChildReply(e) {
      this.triggerEvent('reply', { comment: e.currentTarget.dataset.item })
    }
  }
})
