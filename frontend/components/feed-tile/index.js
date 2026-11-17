/**
 * C23 FeedTile：D01 双列瀑布流帖子卡（05 §4.7）
 * 只展示封面、标题、可选运动摘要、作者与点赞；正文/话题/评论/收藏不在卡内出现。
 */
const { coverHeight } = require('../../utils/masonry')

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    item: { type: Object, value: {} }
  },
  data: {
    coverH: 257,
    coverLabel: '',
    title: '',
    failed: false
  },
  observers: {
    item(v) {
      const post = v || {}
      const cover = post.cover || {}
      const title = (post.title || '').trim() || (post.content || '').slice(0, 24)
      this.setData({
        coverH: coverHeight(cover),
        coverLabel: cover.width && cover.height ? cover.width + '×' + cover.height : '',
        title: title,
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
    },
    onAuthor() {
      const author = this.data.item.author || {}
      this.triggerEvent('author', { id: author.id })
    },
    onLike() {
      const post = this.data.item
      this.triggerEvent('like', { id: post.id, liked: !!post.liked })
    }
  }
})
