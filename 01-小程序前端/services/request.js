/**
 * 统一请求层 v2
 * - 自动带 Authorization / X-Request-Id
 * - 统一解包 {code, message, data, requestId}
 * - 401 交给 auth.handleUnauthorized（全局去重）
 * - 网络/超时自动重试一次（仅 GET）
 * - 失败自动上报（不阻塞业务）
 */
const env = require('../config/env')

const TYPES = {
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  SERVER: 'SERVER',
  AUTH: 'AUTH',
  BIZ: 'BIZ'
}

function makeError(type, message, extra) {
  const err = new Error(message || '网络异常，请稍后重试')
  err.type = type
  const fields = extra || {}
  Object.keys(fields).forEach(key => {
    err[key] = fields[key]
  })
  return err
}

function genRequestId() {
  return 'wx' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function toast(message) {
  if (!env.SHOW_ERROR_TOAST || !message) return
  try {
    wx.showToast({ title: message, icon: 'none', duration: 2000 })
  } catch (e) {}
}

function costTime(start) {
  return Date.now() - start
}

function wxSend(opts, requestId, startedAt) {
  return new Promise((resolve, reject) => {
    const method = (opts.method || 'GET').toUpperCase()
    const header = {
      'content-type': 'application/json',
      'X-Request-Id': requestId
    }
    if (opts.auth !== false) {
      const token = require('./auth').getToken()
      if (token) header.Authorization = 'Bearer ' + token
    }

    wx.request({
      url: (opts.fullURL || env.baseURL + opts.url),
      method,
      data: opts.data || {},
      header,
      timeout: opts.timeout || env.TIMEOUT,
      success(res) {
        resolve({ res, requestId, duration: costTime(startedAt) })
      },
      fail(err) {
        const raw = (err && err.errMsg) || ''
        const timeout = raw.indexOf('timeout') >= 0
        reject(
          makeError(timeout ? TYPES.TIMEOUT : TYPES.NETWORK, timeout ? '请求超时，请重试' : '网络异常，请检查网络', {
            requestId,
            duration: costTime(startedAt),
            url: opts.url
          })
        )
      }
    })
  })
}

function unwrap(payload) {
  const { res, requestId, duration } = payload
  const body = res.data && typeof res.data === 'object' ? res.data : {}
  const rid = body.requestId || requestId

  if (res.statusCode === 401 || body.code === 40101) {
    require('./auth').handleUnauthorized()
    throw makeError(TYPES.AUTH, '登录已失效，请重新登录', { code: 40101, requestId: rid, duration })
  }
  if (res.statusCode === 429 || body.code === 42901) {
    throw makeError(TYPES.BIZ, body.message || '操作太频繁，请稍后再试', {
      code: body.code || 42901,
      requestId: rid,
      duration
    })
  }
  if (res.statusCode >= 500) {
    throw makeError(TYPES.SERVER, body.message || '服务器繁忙，请稍后重试', {
      code: body.code || 50000,
      requestId: rid,
      duration,
      statusCode: res.statusCode
    })
  }
  if (typeof body.code === 'undefined') {
    throw makeError(TYPES.SERVER, '响应格式异常', { requestId: rid, duration, statusCode: res.statusCode })
  }
  if (body.code === 0) return body.data === undefined ? null : body.data
  throw makeError(TYPES.BIZ, body.message || '请求失败', { code: body.code, requestId: rid, duration })
}

function reportFailure(opts, err) {
  try {
    require('../utils/report').reportError({
      type: err.type,
      code: err.code || 0,
      message: err.message,
      url: opts.url,
      method: (opts.method || 'GET').toUpperCase(),
      requestId: err.requestId || '',
      statusCode: err.statusCode || 0,
      duration: err.duration || 0
    })
  } catch (e) {}
}

/**
 * 请求入口
 * @param {Object} opts {url, method, data, auth, retry, silent}
 */
function request(opts) {
  const options = Object.assign({ method: 'GET', auth: true, retry: null, silent: false }, opts || {})
  const requestId = genRequestId()
  const startedAt = Date.now()
  const method = String(options.method).toUpperCase()
  const maxRetry = options.retry === null ? (method === 'GET' ? 1 : 0) : options.retry

  const attempt = left =>
    wxSend(options, requestId, startedAt)
      .then(unwrap)
      .catch(err => {
        const retryable = err.type === TYPES.NETWORK || err.type === TYPES.TIMEOUT || err.type === TYPES.SERVER
        if (retryable && left > 0) return attempt(left - 1)
        throw err
      })

  return attempt(maxRetry).catch(err => {
    const quiet = options.silent || err.type === TYPES.AUTH
    if (!quiet) toast(err.message)
    if (err.type !== TYPES.BIZ || (err.code >= 50000 && err.code < 60000)) reportFailure(options, err)
    throw err
  })
}

module.exports = { request, makeError, TYPES }
