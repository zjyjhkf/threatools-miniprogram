/**
 * 埋点 v2：双写（后端 A33 + 本地最近 200 条），并做 1 秒同事件去抖
 */
const report = require('./report')

const STORAGE_KEY = 'jh_track_buffer'
const BUFFER_MAX = 200
const DEDUPE_MS = 1000

let lastKey = ''
let lastAt = 0

function storeLocal(event, props) {
  try {
    const list = wx.getStorageSync(STORAGE_KEY) || []
    list.push({ event, props, ts: Date.now() })
    wx.setStorageSync(STORAGE_KEY, list.slice(-BUFFER_MAX))
  } catch (e) {}
}

/**
 * 业务埋点
 * @param {string} event 事件名，如 feed_pullup / post_publish
 * @param {Object} props 属性
 */
function track(event, props) {
  if (!event) return
  const key = event + '|' + JSON.stringify(props || {})
  const now = Date.now()
  if (key === lastKey && now - lastAt < DEDUPE_MS) return
  lastKey = key
  lastAt = now
  storeLocal(event, props)
  report.enqueue(event, props)
}

/** 页面曝光等只记一次的场景 */
function trackOnce(event, props) {
  const key = 'jh_once_' + event
  try {
    if (wx.getStorageSync(key)) return
    wx.setStorageSync(key, 1)
  } catch (e) {}
  track(event, props)
}

module.exports = { track, trackOnce }
