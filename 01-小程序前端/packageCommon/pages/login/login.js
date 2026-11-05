const api = require('../../../services/api')
const auth = require('../../../services/auth')
const store = require('../../../store/store')
const mixin = require('../../../utils/page-mixin')
const ui = require('../../../utils/ui')
const track = require('../../../utils/track')

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      agreed: false,
      loading: false,
      brand: '健衡运动社区',
      slogan: '智能康复 · 科学运动 · 健康生活',
      values: [
        { icon: 'check', text: '科学指导' },
        { icon: 'comment', text: '内容社区' },
        { icon: 'empty', text: '产品了解' }
      ],
      statusBarHeight: 20
    }),

    onLoad() {
      this.setData({ statusBarHeight: (getApp() && getApp().globalData.statusBarHeight) || 20 })
    },

    onShow() {
      if (wx.hideHomeButton) wx.hideHomeButton()
    },

    toggleAgree() {
      this.setData({ agreed: !this.data.agreed })
    },

    onLogin() {
      if (this.data.loading) return
      if (!this.data.agreed) {
        ui.toast('请先阅读并同意用户协议')
        return
      }
      this.setData({ loading: true })
      wx.login({
        success: res => {
          api
            .wechatLogin(res.code)
            .then(data => {
              auth.setSession(data.token, data.user)
              store.ui.set({ loginJustNow: true })
              track.track('login_result', { channel: 'wechat', result: 'success' })
              this.setData({ loading: false })
              this.afterLogin()
            })
            .catch(() => {
              this.setData({ loading: false })
              track.track('login_result', { channel: 'wechat', result: 'fail' })
              ui.toast('登录失败，请稍后重试')
            })
        },
        fail: () => {
          this.setData({ loading: false })
          ui.toast('微信授权失败，请重试')
        }
      })
    },

    afterLogin() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack({ delta: 1 })
      } else {
        wx.switchTab({ url: '/pages/community/index' })
      }
    },

    showAgreement(e) {
      const type = e.currentTarget.dataset.type
      ui.dialog({
        title: type === 'privacy' ? '隐私政策' : '用户协议',
        content:
          type === 'privacy'
            ? '我们仅收集昵称、头像、性别、生日、城市与你主动填写的身体档案，用于展示个人主页与生成训练建议，不会用于其他用途，也不会对外公开你的身体数据。'
            : '欢迎使用健衡运动社区。请在发布内容时遵守法律法规，不发布医疗诊断、广告导流与不实信息。平台对违规内容有权处理。',
        confirmText: '我知道了',
        cancelText: ''
      })
    },

    onDialogOk() {}
  })
)
