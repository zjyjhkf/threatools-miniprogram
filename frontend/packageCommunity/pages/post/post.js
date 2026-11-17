const api = require('../../../services/api')
const auth = require('../../../services/auth')
const mixin = require('../../../utils/page-mixin')
const ui = require('../../../utils/ui')
const track = require('../../../utils/track')
const { hasSensitive } = require('../../../utils/sensitive')
const { relativeTime, formatCount } = require('../../../utils/format')
const { ROUTES } = require('../../../config/constants')

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      id: '',
      post: null,
      timeText: '',
      likeText: '',
      commentText: '',
      collectText: '',
      status: 'loading',
      reviewing: false,
      comments: [],
      cursor: '',
      hasMore: true,
      commentMore: 'idle',
      inputFocus: false,
      replyTo: null,
      placeholder: '说点什么…',
      sending: false,
      draft: '',
      commentCount: 0
    }),

    onLoad(options) {
      const id = options && options.id
      if (!id) {
        this.failParam('缺少帖子 id')
        return
      }
      this.setData({ id: id })
      this.loadPost()
      this.loadComments(true)
    },

    loadPost() {
      api
        .getPost(this.data.id)
        .then(post => {
          track.track('page_view', { page_id: 'D05', from: '' })
          this.setData({
            post: post,
            timeText: relativeTime(post.createdAt),
            likeText: formatCount(post.likeCount),
            commentText: formatCount(post.commentCount),
            collectText: formatCount(post.collectCount),
            commentCount: post.commentCount,
            reviewing: post.status === 'reviewing' || post.status === 'hidden',
            status: 'ok'
          })
        })
        .catch(e => {
          this.setData({ status: e && e.code === 40401 ? 'notfound' : 'error' })
        })
    },

    loadComments(reset) {
      if (this.data.commentLoading) return
      this.setData({ commentLoading: true })
      api
        .getComments(this.data.id, reset ? '' : this.data.cursor, 20)
        .then(res => {
          const list = reset ? res.list : this.data.comments.concat(res.list)
          this.setData({
            comments: list,
            cursor: res.nextCursor || '',
            hasMore: !!res.hasMore,
            commentMore: res.hasMore ? 'idle' : 'nomore',
            commentLoading: false
          })
        })
        .catch(() => this.setData({ commentLoading: false, commentMore: 'error' }))
    },

    onReachBottom() {
      if (!this.data.hasMore) return
      this.setData({ commentMore: 'loading' })
      this.loadComments(false)
    },

    /* 互动 */
    onLike() {
      if (!this.requireLogin()) return
      const p = this.data.post
      const next = !p.liked
      this.setData({ 'post.liked': next, 'post.likeCount': p.likeCount + (next ? 1 : -1) })
      api.likePost(this.data.id, next).then(
        res => this.setData({ 'post.liked': res.liked, 'post.likeCount': res.likeCount }),
        () => this.setData({ 'post.liked': p.liked, 'post.likeCount': p.likeCount })
      )
    },

    onCollect() {
      if (!this.requireLogin()) return
      const p = this.data.post
      const next = !p.collected
      this.setData({ 'post.collected': next })
      api.collectPost(this.data.id, next).then(
        res => {
          this.setData({ 'post.collected': res.collected, 'post.collectCount': res.collectCount })
          ui.toast(next ? '已收藏' : '已取消收藏')
        },
        () => this.setData({ 'post.collected': p.collected })
      )
    },

    onFollow() {
      if (!this.requireLogin()) return
      const p = this.data.post
      const next = !p.followed
      this.setData({ 'post.followed': next })
      api.follow(p.author.id, next).then(
        () => ui.toast(next ? '已关注 @' + p.author.nickname : '已取消关注'),
        () => this.setData({ 'post.followed': p.followed })
      )
    },

    previewImage() {
      const images = (this.data.post.images || []).map(i => i.url).filter(Boolean)
      if (!images.length) {
        ui.toast('示例图片暂不可预览')
        return
      }
      wx.previewImage({ urls: images, current: images[0] })
    },

    onMore() {
      const isAuthor = this.data.post && this.data.post.isAuthor
      const items = isAuthor ? ['复制链接', '删除'] : ['举报', '不感兴趣', '复制链接']
      wx.showActionSheet({
        itemList: items,
        success: res => {
          const label = items[res.tapIndex]
          if (label === '举报') {
            ui.toast('已收到举报')
            return
          }
          if (label === '不感兴趣') {
            ui.toast('将减少此类内容推荐')
            return
          }
          if (label === '复制链接') {
            wx.setClipboardData({ data: '健衡运动社区/post?id=' + this.data.id })
            return
          }
          this.setData({
            dialog: {
              show: true,
              type: 'deletePost',
              title: '删除这条动态？',
              content: '删除后不可恢复，评论与收藏同步失效',
              confirmText: '删除',
              cancelText: '取消',
              danger: true
            }
          })
        }
      })
    },

    onAuthor() {
      wx.navigateTo({ url: ROUTES.userProfile + '?id=' + this.data.post.author.id })
    },

    onTopic(e) {
      wx.navigateTo({ url: ROUTES.topicDetail + '?id=' + e.currentTarget.dataset.id })
    },

    /* 评论 */
    onFocusInput() {
      if (!this.requireLogin()) return
      this.setData({ inputFocus: true })
    },

    onReply(e) {
      if (!this.requireLogin()) return
      const c = e.detail.comment
      this.setData({
        replyTo: c,
        placeholder: '回复 @' + c.user.nickname,
        inputFocus: false
      })
      wx.nextTick(() => this.setData({ inputFocus: true }))
    },

    onCancelReply() {
      this.setData({ replyTo: null, placeholder: '说点什么…' })
    },

    onDraftInput(e) {
      this.setData({ draft: e.detail.value })
    },

    onSend(e) {
      const content = e.detail.content
      if (hasSensitive(content)) {
        ui.toast('内容包含不适合发布的信息')
        return
      }
      this.setData({ sending: true })
      const replyTo = this.data.replyTo
      api
        .addComment(this.data.id, content, replyTo ? replyTo.id : '')
        .then(res => {
          this.setData({
            sending: false,
            replyTo: null,
            draft: '',
            placeholder: '说点什么…',
            commentCount: res.commentCount,
            'post.commentCount': res.commentCount
          })
          this.loadComments(true)
          ui.toast('评论成功')
        })
        .catch(err => {
          this.setData({ sending: false })
          ui.toast((err && err.message) || '评论失败')
        })
    },

    onInputBlur() {
      this.setData({ inputFocus: false })
    },

    /** A34 评论点赞：乐观更新 + 失败回滚 */
    onLikeComment(e) {
      if (!this.requireLogin()) return
      const { id, liked } = e.detail
      const idx = this.data.comments.findIndex(c => String(c.id) === String(id))
      if (idx < 0) return
      if (this._likingComment) return
      this._likingComment = true

      const next = !liked
      const count = this.data.comments[idx].likeCount + (liked ? -1 : 1)
      this.setData({
        ['comments[' + idx + '].liked']: next,
        ['comments[' + idx + '].likeCount']: Math.max(0, count)
      })

      api.likeComment(id, next).then(
        res => {
          this._likingComment = false
          if (res && typeof res.likeCount === 'number') {
            const i = this.data.comments.findIndex(c => String(c.id) === String(id))
            if (i >= 0) this.setData({ ['comments[' + i + '].likeCount']: res.likeCount })
          }
        },
        () => {
          this._likingComment = false
          const i = this.data.comments.findIndex(c => String(c.id) === String(id))
          if (i >= 0) {
            this.setData({
              ['comments[' + i + '].liked']: liked,
              ['comments[' + i + '].likeCount']: this.data.comments[i].likeCount + (liked ? 1 : -1)
            })
          }
          ui.toast('操作失败，请重试')
        }
      )
    },

    onCommentLongPress(e) {
      const c = e.detail.comment
      const isMine = this.data.post.isAuthor && String(c.user.id) === String(this.data.post.author.id)
      const items = isMine ? ['复制', '删除'] : ['复制']
      wx.showActionSheet({
        itemList: items,
        success: res => {
          if (res.tapIndex === 0) {
            wx.setClipboardData({ data: c.content })
            return
          }
          if (res.tapIndex === 1 && isMine) {
            this.setData({
              dialog: {
                show: true,
                type: 'deleteComment',
                title: '删除这条评论？',
                content: '删除后不可恢复',
                confirmText: '删除',
                cancelText: '取消',
                danger: true
              }
            })
            this._pendingComment = c
          }
        }
      })
    },

    onDialogOk() {
      if (this.data.dialog.type === 'deletePost') {
        api.deletePost(this.data.id).then(
          () => {
            ui.toast('已删除')
            setTimeout(() => {
              if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1 })
              else wx.switchTab({ url: ROUTES.home })
            }, 500)
          },
          () => ui.toast('删除失败，请重试')
        )
        return
      }
      if (this.data.dialog.type === 'deleteComment') {
        const c = this._pendingComment
        if (!c) return
        this._pendingComment = null
        // A35：先落库再改 UI，失败不删（避免“假删除”）
        api.deleteComment(c.id).then(
          () => {
            this.setData({ comments: this.data.comments.filter(x => String(x.id) !== String(c.id)) })
            if (this.data.post && this.data.post.commentCount > 0) {
              this.setData({ 'post.commentCount': this.data.post.commentCount - 1 })
            }
            ui.toast('已删除')
          },
          () => ui.toast('删除失败，请重试')
        )
      }
    },

    onEmptyRetry() {
      this.setData({ status: 'loading' })
      this.loadPost()
    },

    backToFeed() {
      if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1 })
      else wx.switchTab({ url: ROUTES.home })
    }
  })
)
