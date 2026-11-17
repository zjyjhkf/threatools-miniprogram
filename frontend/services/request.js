/**
 * 统一请求层 v3
 * - 统一解包 {code, message, data, requestId}
 * - 401：先静默重登一次并重放，失败才引导登录（登录请求本身不参与，避免递归）
 * - 网络/超时自动重试一次（仅幂等 GET；5xx 不重试，避免故障期放大流量）
 * - 失败统一上报（带 requestId，不阻塞业务）
 * - requestId 由后端生成（X-Request-Id / body.requestId），前端只透传
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

/** 仅用于本地错误上报兜底（后端不可达时没有 requestId），不写入请求头 */
function localTraceId() {
  return 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function toast(message) {
  if (!env.SHOW_ERROR_TOAST || !message) return
  try {
    wx.showToast({ title: message, icon: 'none', duration: 2000 })
  } catch (e) {}
}

function headerRequestId(res) {
  const header = (res && res.header) || {}
  return header['X-Request-Id'] || header['x-request-id'] || ''
}

function wxSend(opts, traceId, startedAt) {
  return new Promise((resolve, reject) => {
    const method = (opts.method || 'GET').toUpperCase()
    const header = { 'content-type': 'application/json' }
    if (opts.auth !== false) {
      const token = require('./auth').getToken()
      if (token) header.Authorization = 'Bearer ' + token
    }

    wx.request({
      url: opts.fullURL || env.baseURL + opts.url,
      method,
      data: opts.data || {},
      header,
      timeout: opts.timeout || env.TIMEOUT,
      success(res) {
        resolve({
          res,
          requestId: headerRequestId(res) || traceId,
          duration: Date.now() - startedAt
        })
      },
      fail(err) {
        const raw = (err && err.errMsg) || ''
        const timeout = raw.indexOf('timeout') >= 0
        reject(
          makeError(
            timeout ? TYPES.TIMEOUT : TYPES.NETWORK,
            timeout ? '请求超时，请重试' : '网络异常，请检查网络',
            { requestId: traceId, duration: Date.now() - startedAt, url: opts.url }
          )
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
    throw makeError(TYPES.SERVER, '响应格式异常', {
      requestId: rid,
      duration,
      statusCode: res.statusCode
    })
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

/** 静默重登：复用 auth.login（内部并发去重），成功返回 true */
function tryRelogin() {
  try {
    return require('./auth')
      .login()
      .then(() => true)
      .catch(() => false)
  } catch (e) {
    return Promise.resolve(false)
  }
}

/**
 * 请求入口
 * @param {Object} opts { url, method, data, auth, retry, silent, timeout, fullURL }
 *   silent: 失败不弹 toast
 *   retry:  覆盖默认重试次数（null = GET 1 次、其它 0 次）
 */
function request(opts) {
  const options = Object.assign(
    { method: 'GET', auth: true, retry: null, silent: false, _relogged: false },
    opts || {}
  )
  const traceId = localTraceId()
  const startedAt = Date.now()
  const method = String(options.method).toUpperCase()
  const maxRetry = options.retry === null ? (method === 'GET' ? 1 : 0) : options.retry

  const attempt = left =>
    wxSend(options, traceId, startedAt)
      .then(unwrap)
      .catch(err => {
        // 401：只静默重登一次并重放；登录请求（auth:false）与已重登过的请求不参与
        if (err.type === TYPES.AUTH && options.auth !== false && !options._relogged) {
          return tryRelogin().then(ok => {
            if (!ok) throw err
            return request(Object.assign({}, options, { _relogged: true, retry: 0 }))
          })
        }
        const retryable = err.type === TYPES.NETWORK || err.type === TYPES.TIMEOUT
        if (retryable && left > 0) return attempt(left - 1)
        throw err
      })

  return attempt(maxRetry).catch(err => {
    if (err.type === TYPES.AUTH) {
      require('./auth').handleUnauthorized()
    } else if (!options.silent) {
      toast(err.message)
    }
    if (err.type !== TYPES.BIZ || (err.code >= 50000 && err.code < 60000)) {
      reportFailure(options, err)
    }
    throw err
  })
}

module.exports = { request, makeError, TYPES }
