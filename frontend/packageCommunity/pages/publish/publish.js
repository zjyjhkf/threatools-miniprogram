const api = require('../../../services/api')
const auth = require('../../../services/auth')
const upload = require('../../../services/upload')
const mixin = require('../../../utils/page-mixin')
const ui = require('../../../utils/ui')
const storage = require('../../../utils/storage')
const track = require('../../../utils/track')
const image = require('../../../utils/image')
const { hasSensitive } = require('../../../utils/sensitive')
const { ROUTES } = require('../../../config/constants')

const DRAFT_KEY = 'jh_draft'
const MAX_IMAGES = 9
const MAX_TOPICS = 3

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      content: '',
      contentLen: 0,
      images: [],
      topics: [],
      allTopics: [],
      filteredTopics: [],
      topicShow: false,
      topicKeyword: '',
      newTopicName: '',
      creating: false,
      visibility: 'public',
      visibilityShow: false,
      canPublish: false,
      submitting: false,
      hasContent: false
    }),

    onLoad(options) {
      if (!auth.isLogin()) {
        this.setData({
          dialog: {
            show: true,
            type: 'login',
            title: '登录后才能发布',
            content: '登录后可发布动态、参与话题讨论',
            confirmText: '去登录',
            cancelText: '返回'
          }
        })
        return
      }
      this.restoreDraft()
      this.loadTopics(options && options.topicId)
    },

    onUnload() {
      if (this._published) return
      this.saveDraft()
    },

    /* ---------- 草稿 ---------- */
    restoreDraft() {
      const draft = storage.get(DRAFT_KEY, null)
      if (!draft || !draft.savedAt) return
      if (Date.now() - draft.savedAt > 24 * 3600 * 1000) {
        storage.remove(DRAFT_KEY)
        return
      }
      if (!draft.content && !(draft.images || []).length) return
      ui.dialog({
        type: 'draft',
        title: '恢复上次编辑？',
        content: '检测到 24 小时内的草稿',
        confirmText: '恢复',
        cancelText: '不恢复'
      })
    },

    saveDraft() {
      const { content, images, topics } = this.data
      if (!content.trim() && !images.length) {
        storage.remove(DRAFT_KEY)
        return
      }
      storage.set(DRAFT_KEY, {
        content: content,
        images: images,
        topics: topics,
        savedAt: Date.now()
      })
    },

    clearDraft() {
      storage.remove(DRAFT_KEY)
    },

    onDialogOk() {
      if (this.data.dialog.type === 'draft') {
        const draft = storage.get(DRAFT_KEY, null)
        if (draft) {
          this.setData({
            content: draft.content || '',
            contentLen: (draft.content || '').length,
            images: draft.images || [],
            topics: draft.topics || []
          })
          this.refreshPublishState()
        }
        return
      }
      if (this.data.dialog.type === 'discard') {
        this.clearDraft()
        this.back()
      }
    },

    /* ---------- 正文 ---------- */
    onContentInput(e) {
      const value = e.detail.value
      this.setData({ content: value, contentLen: value.length })
      this.refreshPublishState()
    },

    refreshPublishState() {
      const can = !!this.data.content.trim() || this.data.images.length > 0
      this.setData({ canPublish: can, hasContent: can })
    },

    /* ---------- 图片 ---------- */
    addImage() {
      if (this.data.images.length >= MAX_IMAGES) {
        ui.toast('最多上传 9 张图片')
        return
      }
      const remain = MAX_IMAGES - this.data.images.length
      image
        .pickAndCompress(remain)
        .then(list => {
          this.setData({ images: this.data.images.concat(list) })
          this.refreshPublishState()
        })
        .catch(err => {
          if (err && err.code === 'OVERSIZE') ui.toast('图片过大，请选择 5MB 以内的图片')
          else ui.toast('选择图片失败')
        })
    },

    removeImage(e) {
      const index = Number(e.currentTarget.dataset.index)
      const images = this.data.images.slice()
      images.splice(index, 1)
      this.setData({ images: images })
      this.refreshPublishState()
    },

    previewLocal(e) {
      const index = Number(e.currentTarget.dataset.index)
      wx.previewImage({ urls: this.data.images, current: this.data.images[index] })
    },

    /* ---------- 话题 ---------- */
    loadTopics(presetId) {
      api
        .getTopics(1, 50)
        .then(res => {
          const all = res.list || []
          this.setData({ allTopics: all, filteredTopics: all })
          if (presetId) {
            const hit = all.filter(t => String(t.id) === String(presetId))[0]
            if (hit) this.setData({ topics: [hit] })
          }
        })
        .catch(() => {})
    },

    openTopicSheet() {
      this.setData({ topicShow: true, topicKeyword: '', filteredTopics: this.data.allTopics })
    },

    closeTopicSheet() {
      this.setData({ topicShow: false })
    },

    onTopicKeyword(e) {
      const keyword = e.detail.value
      const all = this.data.allTopics
      this.setData({
        topicKeyword: keyword,
        filteredTopics: keyword ? all.filter(t => t.name.indexOf(keyword) >= 0) : all
      })
    },

    toggleTopic(e) {
      const id = e.currentTarget.dataset.id
      const selected = this.data.topics.slice()
      const idx = selected.findIndex(t => String(t.id) === String(id))
      if (idx >= 0) {
        selected.splice(idx, 1)
      } else {
        if (selected.length >= MAX_TOPICS) {
          ui.toast('最多选择 3 个话题')
          return
        }
        const hit = this.data.allTopics.filter(t => String(t.id) === String(id))[0]
        if (hit) selected.push(hit)
      }
      this.setData({ topics: selected })
    },

    onNewTopicInput(e) {
      this.setData({ newTopicName: e.detail.value })
    },

    createTopic() {
      const name = (this.data.newTopicName || '').trim()
      if (name.length < 2 || name.length > 20) {
        ui.toast('话题名需 2–20 个字')
        return
      }
      if (this.data.topics.length >= MAX_TOPICS) {
        ui.toast('最多选择 3 个话题')
        return
      }
      this.setData({ creating: true })
      api
        .createTopic(name)
        .then(res => {
          const topic = res.topic
          const all = this.data.allTopics.concat(res.existed ? [] : [topic])
          const topics = this.data.topics.concat([topic])
          this.setData({
            creating: false,
            allTopics: all,
            filteredTopics: all,
            topics: topics,
            newTopicName: ''
          })
          ui.toast(res.existed ? '已存在同名话题，已为你选中' : '话题创建成功')
        })
        .catch(err => {
          this.setData({ creating: false })
          ui.toast((err && err.message) || '创建失败')
        })
    },

    removeTopic(e) {
      const id = e.currentTarget.dataset.id
      this.setData({ topics: this.data.topics.filter(t => String(t.id) !== String(id)) })
    },

    /* ---------- 可见范围 ---------- */
    openVisibility() {
      this.setData({ visibilityShow: true })
    },
    closeVisibility() {
      this.setData({ visibilityShow: false })
    },
    pickVisibility(e) {
      this.setData({ visibility: e.currentTarget.dataset.value, visibilityShow: false })
    },

    /* ---------- 提交 ---------- */
    onBack() {
      if (this.data.hasContent) {
        this.setData({
          dialog: {
            show: true,
            type: 'discard',
            title: '放弃这次编辑？',
            content: '已填写的内容将不会保存',
            confirmText: '放弃',
            cancelText: '继续编辑',
            danger: true
          }
        })
        return
      }
      this.back()
    },

    submit() {
      if (!this.data.canPublish || this.data.submitting) return
      if (!this.requireLogin()) return
      const content = this.data.content.trim()
      if (hasSensitive(content)) {
        ui.toast('内容包含不适合发布的信息')
        return
      }
      this.setData({ submitting: true })
      wx.showLoading({ title: '发布中', mask: true })

      upload
        .uploadImages(this.data.images)
        .then(res => {
          return api.createPost({
            content: content,
            images: res.urls || [],
            topicIds: this.data.topics.map(t => t.id),
            visibility: this.data.visibility
          })
        })
        .then(res => {
          wx.hideLoading()
          track.track('post_publish_submit', {
            image_count: this.data.images.length + '',
            topic_count: this.data.topics.length + '',
            text_len: content.length + '',
            result: 'success'
          })
          this.clearDraft()
          this._published = true
          this.setData({ submitting: false })
          // 先发后审：发布即公开，通知首页/社区/我的作品刷新
          try {
            wx.setStorageSync('jh_feed_dirty', true)
          } catch (e) {}
          wx.redirectTo({ url: ROUTES.publishResult + '?status=success&id=' + res.post.id })
        })
        .catch(err => {
          wx.hideLoading()
          this.setData({ submitting: false })
          ui.toast((err && err.message) || '发布失败，草稿已保留')
          this.saveDraft()
        })
    },

    onDialogOkFallback() {}
  })
)
