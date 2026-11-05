const store = require('./store')
const storage = require('../utils/storage')

const TOKEN_KEY = 'jh_token'
const USER_KEY = 'jh_user'

function isLogin() {
  return !!store.user.get().token
}

function getProfile() {
  return store.user.get().profile
}

function getCompleteness() {
  return store.user.get().completeness || { filled: 0, total: 7, missing: [] }
}

function setSession(token, profile) {
  if (token) storage.set(TOKEN_KEY, token)
  if (profile) storage.set(USER_KEY, profile)
  store.user.set({
    token: token || store.user.get().token,
    isLogin: true,
    profile: profile || store.user.get().profile
  })
}

function setProfile(profile) {
  if (!profile) return
  storage.set(USER_KEY, profile)
  const patch = { profile }
  if (profile.completeness) patch.completeness = profile.completeness
  store.user.set(patch)
}

function setCompleteness(c) {
  if (!c) return
  store.user.set({ completeness: c })
}

function clear() {
  storage.remove(TOKEN_KEY)
  storage.remove(USER_KEY)
  store.user.set({
    token: '',
    isLogin: false,
    profile: null,
    completeness: { filled: 0, total: 7, missing: [] }
  })
}

function restore() {
  const token = storage.get(TOKEN_KEY, '')
  const profile = storage.get(USER_KEY, null)
  store.user.set({
    token,
    isLogin: !!token,
    profile,
    completeness: (profile && profile.completeness) || { filled: 0, total: 7, missing: [] }
  })
}

module.exports = {
  TOKEN_KEY,
  isLogin,
  getProfile,
  getCompleteness,
  setSession,
  setProfile,
  setCompleteness,
  clear,
  restore
}
