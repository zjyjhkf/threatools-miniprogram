/**
 * 环境配置：接口地址 / 上传地址 / 版本号 / 超时
 * 切换环境只改 ENV 一处；上线前确认 baseURL 为 https。
 * 0.1 起前端不再内置本地假数据，所有数据来自 backend 接口。
 */
/**
 * 开发态 Host（只改这一处）
 * - 模拟器：127.0.0.1:8000
 * - 真机：电脑局域网 IP，如 192.168.1.5:8000
 *   同时后端 .env 的 UPLOAD_URL_PREFIX 要指向同一 host，否则种子/上传图片会 404
 */
const DEV_HOST = '127.0.0.1:8000'

const ENVS = {
  dev: {
    baseURL: 'http://' + DEV_HOST + '/api/v1',
    uploadURL: 'http://' + DEV_HOST + '/api/v1/upload'
  },
  test: {
    baseURL: 'https://test-api.jianheng.com/api/v1',
    uploadURL: 'https://test-api.jianheng.com/api/v1/upload'
  },
  prod: {
    baseURL: 'https://api.jianheng.com/api/v1',
    uploadURL: 'https://api.jianheng.com/api/v1/upload'
  }
}

const ENV = 'dev'
const current = ENVS[ENV]

module.exports = {
  ENV,
  baseURL: current.baseURL,
  uploadURL: current.uploadURL,
  TIMEOUT: 10000,
  /** 版本号唯一来源：app.js / 个人中心 / 设置页 / 埋点都读这里 */
  VERSION: '1.0.0',
  /** 上传约束：前端先拦一道，后端仍会二次校验 */
  UPLOAD: {
    maxSizeMB: 5,
    maxCount: 9,
    accept: ['jpg', 'jpeg', 'png', 'webp']
  },
  /** 开启后请求失败会提示 toast（登录失效除外） */
  SHOW_ERROR_TOAST: true
}
