/**
 * 前端上报：错误 + 埋点统一走 POST /track/events
 * - 队列批量、定时 flush、失败丢弃（绝不阻塞业务、绝不上报失败再上报）
 */
const env = require('../config/env')

const MAX_QUEUE = 30
const FLUSH_SIZE = 10
const FLUSH_INTERVAL = 5000

let queue = []
let timer = null
let sending = false

function token() {
  try {
    return require('../services/auth').getToken()
  } catch (e) {
    return ''
  }
}

function currentPage() {
  try {
    const pages = getCurrentPages()
    if (!pages.length) return ''
    const page = pages[pages.length - 1]
    const query = page.options && Object.keys(page.options).length ? JSON.stringify(page.options) : ''
    return (page.route || '') + (query ? '?' + query : '')
  } catch (e) {
    return ''
  }
}

function scene() {
  try {
    const info = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : {}
    return typeof info.scene === 'number' ? info.scene : null
  } catch (e) {
    return null
  }
}

function clearTimer() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function schedule() {
  if (timer || sending) return
  timer = setTimeout(() => {
    timer = null
    flush()
  }, FLUSH_INTERVAL)
}

function flush() {
  if (sending || !queue.length) return Promise.resolve()
  sending = true
  clearTimer()
  const batch = queue.splice(0, FLUSH_SIZE)
  return new Promise(resolve => {
    const header = { 'content-type': 'application/json' }
    const authToken = token()
    if (authToken) header.Authorization = 'Bearer ' + authToken
    wx.request({
      url: env.baseURL + '/track/events',
      method: 'POST',
      header,
      timeout: 5000,
      data: {
        events: batch,
        platform: 'wxmp',
        version: env.VERSION,
        scene: scene()
      },
      complete() {
        sending = false
        if (queue.length >= FLUSH_SIZE) flush()
        else if (queue.length) schedule()
        resolve()
      }
    })
  })
}

/**
 * 入队一条事件
 * @param {string} event 事件名（snake_case，≤64 字符）
 * @param {Object} props 自定义属性（仅简单类型，≤20 个 key）
 */
function enqueue(event, props) {
  if (!event || typeof event !== 'string') return
  if (queue.length >= MAX_QUEUE) queue.shift()
  queue.push({
    event: event.slice(0, 64),
    page: currentPage(),
    props: props && typeof props === 'object' ? props : {}
  })
  if (queue.length >= FLUSH_SIZE) flush()
  else schedule()
}

/** 请求/运行错误上报 */
function reportError(info) {
  enqueue('client_error', {
    type: (info && info.type) || 'UNKNOWN',
    code: Number((info && info.code) || 0),
    message: String((info && info.message) || '').slice(0, 200),
    url: String((info && info.url) || '').slice(0, 120),
    method: (info && info.method) || '',
    requestId: (info && info.requestId) || '',
    statusCode: Number((info && info.statusCode) || 0),
    duration: Number((info && info.duration) || 0)
  })
}

module.exports = { enqueue, reportError, flush, currentPage }
