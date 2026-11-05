const api = require('../../../services/api')
const store = require('../../../store/store')
const mixin = require('../../../utils/page-mixin')
const ui = require('../../../utils/ui')
const track = require('../../../utils/track')
const { formatClock } = require('../../../utils/format')

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      id: '',
      course: null,
      chapters: [],
      index: 0,
      chapter: null,
      src: '',
      playing: false,
      currentTime: 0,
      duration: 0,
      timeText: '00:00',
      durText: '00:00',
      progress: 0,
      autoNext: true,
      error: false,
      retryCount: 0,
      status: 'loading',
      statusBarHeight: 20,
      chapterScrollTop: 0
    }),

    onLoad(options) {
      const id = options && options.id
      if (!id) {
        this.failParam('缺少课程 id')
        return
      }
      this.setData({
        id: id,
        statusBarHeight: (getApp() && getApp().globalData.statusBarHeight) || 20
      })
      this.load(options)
    },

    onReady() {
      this.videoCtx = wx.createVideoContext('player', this)
    },

    onUnload() {
      if (this.videoCtx) this.videoCtx.stop()
    },

    load(options) {
      api
        .getCourse(this.data.id)
        .then(c => {
          const chapters = (c.chapters || []).map(ch =>
            Object.assign({}, ch, { durText: formatClock(ch.duration) })
          )
          let index = Number(options && options.index)
          if (isNaN(index) || index < 0) {
            index = 0
            if (options && options.chapter) {
              const hit = chapters.findIndex(ch => String(ch.id) === String(options.chapter))
              if (hit >= 0) index = hit
            }
          }
          this.setData({ course: c, chapters: chapters, status: 'ok' })
          this.switchChapter(index, true)
        })
        .catch(() => this.setData({ status: 'error' }))
    },

    switchChapter(index, autoPlay) {
      const chapter = this.data.chapters[index]
      if (!chapter) return
      this._playedTracked = false
      if (this.videoCtx) this.videoCtx.stop()
      this.setData({
        index: index,
        chapter: chapter,
        src: chapter.videoUrl,
        error: false,
        currentTime: 0,
        progress: 0,
        timeText: '00:00',
        durText: formatClock(chapter.duration),
        playing: !!autoPlay
      })
      store.ui.set({ lastChapter: { courseId: this.data.id, index: index } })
      track.track('course_play', { course_id: this.data.id, chapter_id: chapter.id })
      if (autoPlay) {
        setTimeout(() => {
          if (this.videoCtx) this.videoCtx.play()
        }, 300)
      }
      wx.nextTick(() => this.scrollToActive())
    },

    scrollToActive() {
      const query = this.createSelectorQuery()
      query.select('.chapter-active').boundingClientRect()
      query.select('.chapter-list').boundingClientRect()
      query.exec(res => {
        if (!res || !res[0] || !res[1]) return
        const offset = res[0].top - res[1].top
        if (Math.abs(offset) > 40) {
          this.setData({ chapterScrollTop: this.data.chapterScrollTop + offset })
        }
      })
    },

    onPlayTap() {
      if (!this.videoCtx) return
      if (this.data.error) {
        this.retry()
        return
      }
      if (this.data.playing) {
        this.videoCtx.pause()
      } else {
        this.videoCtx.play()
      }
    },

    onPlay() {
      if (!this._playedTracked) {
        this._playedTracked = true
        track.track('video_play', {
          course_id: this.data.id,
          chapter_id: this.data.chapter ? this.data.chapter.id : ''
        })
      }
      this.setData({ playing: true })
    },
    onPause() {
      this.setData({ playing: false })
    },

    onTimeUpdate(e) {
      const t = e.detail.currentTime || 0
      const d = e.detail.duration || this.data.chapter.duration || 0
      this.setData({
        currentTime: t,
        duration: d,
        timeText: formatClock(t),
        durText: formatClock(d),
        progress: d ? Math.min(100, (t / d) * 100) : 0
      })
    },

    onSeek(e) {
      const value = e.detail.value
      if (!this.videoCtx || !this.data.duration) return
      this.videoCtx.seek((value / 100) * this.data.duration)
    },

    onEnded() {
      if (!this.data.autoNext) return
      const next = this.data.index + 1
      if (next < this.data.chapters.length) this.switchChapter(next, true)
      else ui.toast('已经是最后一节')
    },

    onVideoError() {
      const count = this.data.retryCount + 1
      this.setData({ error: true, playing: false, retryCount: count })
      if (count >= 3) ui.toast('视频加载失败，请稍后再试')
    },

    retry() {
      if (this.data.retryCount >= 3) {
        ui.toast('视频加载失败，请稍后再试')
        return
      }
      this.setData({ error: false, retryCount: this.data.retryCount + 1 })
      this.videoCtx && this.videoCtx.play()
    },

    selectChapter(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (index === this.data.index) return
      this.switchChapter(index, true)
    },

    prevChapter() {
      if (this.data.index <= 0) {
        ui.toast('已经是第一节')
        return
      }
      this.switchChapter(this.data.index - 1, true)
    },

    nextChapter() {
      if (this.data.index >= this.data.chapters.length - 1) {
        ui.toast('已经是最后一节')
        return
      }
      this.switchChapter(this.data.index + 1, true)
    },

    toggleAutoNext() {
      this.setData({ autoNext: !this.data.autoNext })
    },

    onFullscreen() {
      ui.toast('0.1 版本暂不支持横屏')
    },

    onRetryLoad() {
      this.setData({ status: 'loading' })
      this.load({})
    },

    onShareAppMessage() {
      const c = this.data.course
      return {
        title: (c ? c.title : '课程') + '｜健衡运动社区',
        path: '/packageCourse/pages/detail/detail?id=' + this.data.id
      }
    }
  })
)
