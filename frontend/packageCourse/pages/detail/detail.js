const api = require('../../../services/api')
const mixin = require('../../../utils/page-mixin')
const ui = require('../../../utils/ui')
const track = require('../../../utils/track')
const { formatDuration, formatCount, formatClock } = require('../../../utils/format')
const { ROUTES } = require('../../../config/constants')

const DIFFICULTY_TEXT = { beginner: '入门', middle: '进阶', advanced: '高阶' }

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      id: '',
      course: null,
      chapters: [],
      related: [],
      durText: '',
      learnText: '',
      difficultyText: '',
      expanded: false,
      navSolid: false,
      status: 'loading',
      lastChapter: 0
    }),

    onLoad(options) {
      const id = options && options.id
      if (!id) {
        this.failParam('缺少课程 id')
        return
      }
      this.setData({ id: id })
      this.load()
    },

    onShow() {
      const store = require('../../../store/store')
      const last = store.ui.get().lastChapter
      if (last && last.courseId === this.data.id) {
        this.setData({ lastChapter: last.index })
      }
      // 首次 onShow 与 onLoad 相邻，不重复请求；从播放页/其它页返回时刷新后台最新内容
      if (this._hasShown) this.load()
      else this._hasShown = true
    },

    load() {
      api
        .getCourse(this.data.id)
        .then(c => {
          track.track('page_view', { page_id: 'C02', from: '' })
          const chapters = (c.chapters || []).map(ch =>
            Object.assign({}, ch, { durText: formatClock(ch.duration) })
          )
          this.setData({
            course: c,
            chapters: chapters,
            related: c.related || [],
            durText: formatDuration(c.duration),
            learnText: formatCount(c.learnCount),
            difficultyText: DIFFICULTY_TEXT[c.difficulty] || '入门',
            status: 'ok'
          })
        })
        .catch(e => this.setData({ status: e && e.code === 40401 ? 'notfound' : 'error' }))
    },

    onPageScroll(e) {
      const solid = e.scrollTop > 120
      if (solid !== this.data.navSolid) this.setData({ navSolid: solid })
    },

    toggleExpand() {
      this.setData({ expanded: !this.data.expanded })
    },

    toggleCollect() {
      if (!this.requireLogin()) return
      const c = this.data.course
      const next = !c.collected
      this.setData({ 'course.collected': next })
      api.collectCourse(this.data.id, next).then(
        res => {
          this.setData({ 'course.collected': res.collected, 'course.collectCount': res.collectCount })
          ui.toast(next ? '已收藏课程' : '已取消收藏')
        },
        () => this.setData({ 'course.collected': c.collected })
      )
    },

    startTraining() {
      this.playChapter(0)
    },

    playChapter(e) {
      const index = typeof e === 'number' ? e : Number(e.currentTarget.dataset.index)
      const chapter = this.data.chapters[index]
      if (!chapter) return
      wx.navigateTo({
        url:
          ROUTES.coursePlay +
          '?id=' +
          this.data.id +
          '&chapter=' +
          encodeURIComponent(chapter.id) +
          '&index=' +
          index
      })
    },

    openRelated(e) {
      const id = e.currentTarget.dataset.id
      wx.redirectTo({ url: ROUTES.courseDetail + '?id=' + id })
    },

    chapterDuration(e) {
      return formatClock(e)
    },

    onRetry() {
      this.setData({ status: 'loading' })
      this.load()
    },

    onShareAppMessage() {
      const c = this.data.course
      return {
        title: (c ? c.title : '课程') + '｜健衡运动社区',
        path: '/packageCourse/pages/detail/detail?id=' + this.data.id,
        imageUrl: (c && c.cover) || ''
      }
    }
  })
)
