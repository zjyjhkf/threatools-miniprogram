const api = require('../../../services/api')
const auth = require('../../../services/auth')
const mixin = require('../../../utils/page-mixin')
const { GENDER } = require('../../../config/constants')
const { ROUTES } = require('../../../config/constants')

function genderText(value) {
  const hit = GENDER.filter(g => g.value === value)[0]
  return hit ? hit.label : '保密'
}

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      user: null,
      genderText: '保密',
      visibilityText: '仅自己可见',
      status: 'loading'
    }),

    onShow() {
      this.load()
    },

    load() {
      api
        .getMe()
        .then(user => {
          auth.setProfile(user)
          this.setData({
            user: user,
            genderText: genderText(user.gender),
            visibilityText: user.profileVisibility === 'public' ? '公开' : '仅自己可见',
            status: 'ok'
          })
        })
        .catch(() => this.setData({ status: 'error' }))
    },

    goEdit() {
      wx.navigateTo({ url: ROUTES.profileEdit })
    },

    copyId() {
      wx.setClipboardData({
        data: String(this.data.user.id),
        success: () => this.toast('ID 已复制')
      })
    },

    onRetry() {
      this.setData({ status: 'loading' })
      this.load()
    }
  })
)
