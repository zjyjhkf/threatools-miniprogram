const auth = require('../../../services/auth')
const store = require('../../../store/store')
const mixin = require('../../../utils/page-mixin')
const ui = require('../../../utils/ui')
const storage = require('../../../utils/storage')
const { ROUTES } = require('../../../config/constants')
const env = require('../../../config/env')

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      isLogin: false,
      nickname: '',
      avatar: '',
      cacheText: '0KB',
      version: 'v' + env.VERSION
    }),

    onShow() {
      const profile = auth.isLogin() ? require('../../../store/user').getProfile() : null
      this.setData({
        isLogin: auth.isLogin(),
        nickname: (profile && profile.nickname) || '',
        avatar: (profile && profile.avatar) || '',
        cacheText: storage.sizeText()
      })
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

    clearCache() {
      this.setData({
        dialog: {
          show: true,
          type: 'clearCache',
          title: '清除缓存？',
          content: '将清除本地缓存数据，不影响你的账号内容',
          confirmText: '清除',
          cancelText: '取消',
          danger: false
        }
      })
    },

    logout() {
      this.setData({
        dialog: {
          show: true,
          type: 'logout',
          title: '确定退出登录？',
          content: '退出后需要重新登录才能发布内容',
          confirmText: '退出登录',
          cancelText: '取消',
          danger: true
        }
      })
    },

    onDialogOk() {
      const type = this.data.dialog.type
      if (type === 'logout') {
        auth.logout()
        this.setData({ isLogin: false, nickname: '', avatar: '' })
        ui.toast('已退出登录')
        setTimeout(() => {
          wx.switchTab({ url: ROUTES.mine })
        }, 500)
        return
      }
      if (type === 'clearCache') {
        try {
          wx.clearStorageSync()
        } catch (e) {}
        this.setData({ cacheText: '0KB' })
        ui.toast('缓存已清除')
      }
    },

    about() {
      ui.dialog({
        title: '关于健衡',
        content: '健衡运动社区 0.1\n智能康复 · 科学运动 · 健康生活\n\n本版本仅提供内容浏览与社区交流，不含在线问诊与商品交易。',
        confirmText: '我知道了',
        cancelText: ''
      })
    }
  })
)
