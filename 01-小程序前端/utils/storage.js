function get(key, def) {
  try {
    const v = wx.getStorageSync(key)
    return v === '' || v === null || v === undefined ? def : v
  } catch (e) {
    return def
  }
}

function set(key, value) {
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (e) {
    return false
  }
}

function remove(key) {
  try {
    wx.removeStorageSync(key)
  } catch (e) {}
}

function sizeText() {
  try {
    const info = wx.getStorageInfoSync()
    const kb = info.currentSize || 0
    return kb >= 1024 ? (kb / 1024).toFixed(1) + 'MB' : kb + 'KB'
  } catch (e) {
    return '0KB'
  }
}

module.exports = { get, set, remove, sizeText }
