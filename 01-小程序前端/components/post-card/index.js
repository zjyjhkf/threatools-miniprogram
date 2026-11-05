const { relativeTime, formatCount } = require('../../utils/format')

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    post: { type: Object, value: {} },
    showFollow: { type: Boolean, value: true },
    compact: { type: Boolean, value: false }
  },
  data: { timeText: '', likeText: '', commentText: '', grid: false },
  observers: {
    post(p) {
      if (!p) return
      const images = p.images || []
      this.setData({
        timeText: relativeTime(p.createdAt),
        likeText: formatCount(p.likeCount),
        commentText: formatCount(p.commentCount),
        grid: images.length === 2 || images.length >= 4
      })
    }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.data.post.id })
    },
    onAuthor() {
      this.triggerEvent('author', { id: this.data.post.author.id })
    },
    onTopic(e) {
      this.triggerEvent('topic', { id: e.currentTarget.dataset.id })
    },
    onLike() {
      this.triggerEvent('like', { id: this.data.post.id, liked: this.data.post.liked })
    },
    onComment() {
      this.triggerEvent('comment', { id: this.data.post.id })
    },
    onCollect() {
      this.triggerEvent('collect', { id: this.data.post.id, collected: this.data.post.collected })
    },
    onFollow() {
      this.triggerEvent('follow', {
        id: this.data.post.author.id,
        followed: this.data.post.followed,
        nickname: this.data.post.author.nickname
      })
    }
  }
})
