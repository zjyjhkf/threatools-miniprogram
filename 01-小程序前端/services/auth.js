/**
 * 登录态 v2
 * - wx.login → POST /auth/login → 落 token
 * - token 缺失时 relogin 静默续登（并发只发一次）
 * - 401 统一处理：3 秒内只处理一次，避免多请求连环跳转
 */
const userStore = require('../store/user')
const env = require('../config/env')

let jumping = false
let lastUnauthorizedAt = 0
let loginPromise = null

function restore() {
  userStore.restore()
}

function getToken() {
  return userStore.isLogin() ? require('../store/store').user.get().token : ''
}

function isLogin() {
  return userStore.isLogin()
}

function setSession(token, profile) {
  userStore.setSession(token, profile)
}

function setProfile(profile) {
  userStore.setProfile(profile)
}

function setCompleteness(completeness) {
  userStore.setCompleteness(completeness)
}

function getProfile() {
  return userStore.getProfile()
}

function logout() {
  userStore.clear()
  const store = require('../store/store')
  store.feed.set({ lists: { recommend: [], follow: [], latest: [] } })
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (res && res.code) resolve(res.code)
        else reject(new Error('获取微信登录凭证失败'))
      },
      fail() {
        reject(new Error('微信登录失败，请重试'))
      }
    })
  })
}

/**
 * 登录（并发去重）
 * @param {Object} extra 可选：{ nickname, avatar }
 */
function login(extra) {
  if (loginPromise) return loginPromise
  loginPromise = wxLogin()
    .then(code => require('./api').wechatLogin(code, extra))
    .then(data => {
      setSession(data.token, data.user)
      try {
        require('../utils/track').track('login_success', {
          isNewUser: !!data.isNewUser,
          env: env.ENV
        })
      } catch (e) {}
      return data.user
    })
  const reset = () => {
    loginPromise = null
  }
  loginPromise.then(reset, reset)
  return loginPromise
}

/** 需要登录态的接口调用前使用：已有 token 直接返回，否则静默登录 */
function ensureLogin() {
  if (isLogin()) return Promise.resolve(userStore.getProfile())
  return login()
}

/** 401 统一处理：清 token → 引导登录，3 秒内只跳一次 */
function handleUnauthorized() {
  logout()
  const now = Date.now()
  if (now - lastUnauthorizedAt < 3000) return
  lastUnauthorizedAt = now
  if (jumping) return
  jumping = true

  const pages = getCurrentPages()
  const route = pages.length ? pages[pages.length - 1].route || '' : ''
  if (route.indexOf('pages/login/login') >= 0) {
    jumping = false
    return
  }
  wx.navigateTo({
    url: '/packageCommon/pages/login/login',
    complete() {
      setTimeout(() => {
        jumping = false
      }, 800)
    }
  })
}

/** 冷启动静默校验：失败仅清 token，不打扰浏览 */
function silentCheck() {
  if (!isLogin()) return Promise.resolve(null)
  const api = require('./api')
  return api
    .getMe()
    .then(user => {
      if (user) setProfile(user)
      return user
    })
    .catch(() => {
      userStore.clear()
      return null
    })
}

module.exports = {
  restore,
  getToken,
  getProfile,
  isLogin,
  login,
  ensureLogin,
  setSession,
  setProfile,
  setCompleteness,
  logout,
  handleUnauthorized,
  silentCheck
}
