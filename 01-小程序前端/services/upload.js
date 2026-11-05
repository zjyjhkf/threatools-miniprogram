const env = require('../config/env')
const { request } = require('./request')
const auth = require('./auth')
const report = require('../utils/report')

function genRequestId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function toastError(message) {
  if (!env.SHOW_ERROR_TOAST) return
  wx.showToast({ title: message || '上传失败', icon: 'none', duration: 2000 })
}

function parse(res, resolve, reject) {
  let body
  try {
    body = JSON.parse(res.data)
  } catch (e) {
    toastError('上传返回异常')
    reject(e)
    return
  }
  if (body.code === 0) {
    resolve(body.data)
    return
  }
  if (body.code === 401 || body.code === 40101 || res.statusCode === 401) {
    auth.handleUnauthorized()
  } else {
    toastError(body.message)
  }
  report.reportError({ type: 'upload', message: body.message, code: body.code, url: res.errMsg })
  reject(body)
}

function uploadFile(localPath, path, name) {
  return new Promise((resolve, reject) => {
    const token = auth.getToken()
    wx.uploadFile({
      url: env.baseURL + path,
      filePath: localPath,
      name,
      header: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        'X-Request-Id': genRequestId()
      },
      success: res => parse(res, resolve, reject),
      fail(err) {
        toastError('网络异常，上传失败')
        report.reportError({ type: 'network', message: err.errMsg, url: path })
        reject(err)
      }
    })
  })
}

/** A30 头像上传 */
function uploadAvatar(localPath) {
  return uploadFile(localPath, '/upload/avatar', 'file')
}

/** A31 动态图片上传，单请求单图，并发 3 */
function uploadImages(paths) {
  const list = (paths || []).slice(0, 9)
  if (!list.length) return Promise.resolve({ urls: [] })
  const urls = new Array(list.length).fill('')
  let index = 0
  return new Promise(resolve => {
    let finished = 0
    const next = () => {
      if (index >= list.length) return
      const i = index++
      uploadFile(list[i], '/upload/images', 'files')
        .then(data => {
          urls[i] = (data && data.urls && data.urls[0]) || ''
        })
        .catch(() => {
          urls[i] = ''
        })
        .then(() => {
          finished++
          if (finished >= list.length) resolve({ urls })
          else next()
        })
    }
    const concurrency = Math.min(3, list.length)
    for (let c = 0; c < concurrency; c++) next()
  })
}

module.exports = { uploadAvatar, uploadImages, request }
