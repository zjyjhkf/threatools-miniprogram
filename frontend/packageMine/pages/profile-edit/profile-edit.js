const api = require('../../../services/api')
const auth = require('../../../services/auth')
const upload = require('../../../services/upload')
const mixin = require('../../../utils/page-mixin')
const ui = require('../../../utils/ui')
const { validate, messageOf } = require('../../../utils/validate')
const { GENDER } = require('../../../config/constants')

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      form: {
        avatar: '',
        nickname: '',
        gender: 'secret',
        birthday: '',
        city: '',
        bio: ''
      },
      genderOptions: GENDER,
      genderLabel: '保密',
      genderShow: false,
      errors: {},
      uploading: false,
      saving: false,
      dirty: false,
      status: 'loading'
    }),

    onLoad() {
      api
        .getMe()
        .then(user => {
          this._origin = {
            avatar: user.avatar || '',
            nickname: user.nickname || '',
            gender: user.gender || 'secret',
            birthday: user.birthday || '',
            city: user.city || '',
            bio: user.bio || ''
          }
          this.setData({
            form: Object.assign({}, this._origin),
            genderLabel: this.labelOf(this._origin.gender),
            status: 'ok'
          })
        })
        .catch(() => this.setData({ status: 'error' }))
    },

    labelOf(value) {
      const hit = GENDER.filter(g => g.value === value)[0]
      return hit ? hit.label : '保密'
    },

    markDirty(patch) {
      this.setData({ form: Object.assign({}, this.data.form, patch), dirty: true })
    },

    onAvatar(e) {
      const path = e.detail.path
      this.setData({ uploading: true })
      upload
        .uploadAvatar(path)
        .then(res => {
          this.markDirty({ avatar: res.url || path })
          this.setData({ uploading: false })
        })
        .catch(() => {
          this.setData({ uploading: false })
          ui.toast('头像上传失败')
        })
    },

    onField(e) {
      const { field, value } = e.detail
      this.markDirty({ [field]: value })
      this.clearError(field)
    },

    onDate(e) {
      const value = e.detail.value
      if (!validate('birthday', value)) {
        this.setData({ 'errors.birthday': '需年满 12 周岁' })
        return
      }
      this.markDirty({ birthday: value })
      this.clearError('birthday')
    },

    onCity(e) {
      this.markDirty({ city: e.detail.value.join('/') })
      this.clearError('city')
    },

    onBio(e) {
      this.markDirty({ bio: e.detail.value })
      this.clearError('bio')
    },

    clearError(field) {
      if (!this.data.errors[field]) return
      this.setData({ ['errors.' + field]: '' })
    },

    openGender() {
      this.setData({ genderShow: true })
    },
    closeGender() {
      this.setData({ genderShow: false })
    },
    pickGender(e) {
      const value = e.detail.value
      this.markDirty({ gender: value })
      this.setData({ genderLabel: this.labelOf(value), genderShow: false })
    },

    save() {
      if (this.data.saving) return
      const form = this.data.form
      const errors = {}
      if (!validate('nickname', form.nickname)) errors.nickname = messageOf('nickname')
      if (form.birthday && !validate('birthday', form.birthday)) errors.birthday = messageOf('birthday')
      if (!validate('city', form.city)) errors.city = messageOf('city')
      if (!validate('bio', form.bio)) errors.bio = messageOf('bio')
      if (Object.keys(errors).length) {
        this.setData({ errors: errors })
        ui.toast('请检查填写内容')
        return
      }

      this.setData({ saving: true })
      api
        .saveProfile({
          avatar: form.avatar,
          nickname: form.nickname.trim(),
          gender: form.gender,
          birthday: form.birthday,
          city: form.city,
          bio: form.bio
        })
        .then(res => {
          auth.setProfile(res.user)
          require('../../../utils/track').track('profile_edit_submit', { result: 'success' })
          this.setData({ saving: false, dirty: false })
          ui.toast('已保存')
          setTimeout(() => this.back(), 600)
        })
        .catch(() => {
          this.setData({ saving: false })
          ui.toast('保存失败，请重试')
        })
    },

    onBack() {
      if (!this.data.dirty) {
        this.back()
        return
      }
      this.setData({
        dialog: {
          show: true,
          type: 'discardProfile',
          title: '放弃修改？',
          content: '当前修改尚未保存',
          confirmText: '放弃',
          cancelText: '继续编辑',
          danger: true
        }
      })
    },

    onDialogOk() {
      if (this.data.dialog.type === 'discardProfile') this.back()
    },

    onRetry() {
      this.setData({ status: 'loading' })
      this.onLoad()
    }
  })
)
