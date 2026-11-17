const api = require('../../../services/api')
const mixin = require('../../../utils/page-mixin')
const ui = require('../../../utils/ui')
const { formatCount } = require('../../../utils/format')
const { ROUTES } = require('../../../config/constants')

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      id: '',
      user: null,
      postText: '',
      likeText: '',
      followText: '',
      posts: [],
      status: 'loading',
      loadingMore: false,
      hasMore: true,
      page: 1,
      navSolid: false
    }),

    onLoad(options) {
      const id = options && options.id
      if (!id) {
        this.failParam('缺少用户 id')
        return
      }
      this.setData({ id: id })
      this.loadUser()
      this.loadPosts(1)
    },

    loadUser() {
      api
        .getUser(this.data.id)
        .then(user => {
          this.setData({
            user: user,
            postText: formatCount(user.postCount),
            likeText: formatCount(user.likeCount),
            followText: formatCount(user.followCount)
          })
        })
        .catch(e => {
          this.setData({ status: e && e.code === 40401 ? 'notfound' : 'error' })
        })
    },

    loadPosts(page) {
      this.setData({ loadingMore: true })
      api
        .getUserPosts(this.data.id, page, 12)
        .then(res => {
          const list = page === 1 ? res.list : this.data.posts.concat(res.list)
          this.setData({
            posts: list,
            page: page,
            hasMore: !!res.hasMore,
            loadingMore: false,
            status: this.data.status === 'notfound' ? 'notfound' : 'ok'
          })
        })
        .catch(() => this.setData({ loadingMore: false }))
    },

    onPageScroll(e) {
      const solid = e.scrollTop > 100
      if (solid !== this.data.navSolid) this.setData({ navSolid: solid })
    },

    onReachBottom() {
      if (!this.data.hasMore || this.data.loadingMore) return
      this.loadPosts(this.data.page + 1)
    },

    toggleFollow() {
      if (!this.requireLogin()) return
      const u = this.data.user
      const next = !u.followed
      this.setData({ 'user.followed': next })
      api.follow(this.data.id, next).then(
        res => {
          this.setData({ 'user.followed': res.followed, followText: formatCount(res.followCount) })
          ui.toast(next ? '已关注 @' + u.nickname : '已取消关注')
        },
        () => this.setData({ 'user.followed': u.followed })
      )
    },

    openPost(e) {
      wx.navigateTo({ url: ROUTES.post + '?id=' + e.currentTarget.dataset.id })
    },

    onRetry() {
      this.setData({ status: 'loading' })
      this.loadUser()
      this.loadPosts(1)
    }
  })
)
