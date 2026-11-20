/**
 * 设备本地档案（P0 唯一事实源）
 * - 首次握手成功后写入 jh_devices，后续冷启动直接渲染，不再依赖扫描
 * - BLE 实时状态仍以 utils/ble.snapshot() 为准，本 store 只存“曾经接入过谁”
 */
const storage = require('../utils/storage')
const { modelByKey, modelName } = require('../config/device-models')

const LIST_KEY = 'jh_devices'
const CURRENT_KEY = 'jh_device_current'
const MAX_DEVICES = 12

function list() {
  const arr = storage.get(LIST_KEY, [])
  return Array.isArray(arr) ? arr.filter(d => d && d.deviceId) : []
}

function persist(arr) {
  storage.set(LIST_KEY, arr.slice(0, MAX_DEVICES))
}

function get(deviceId) {
  if (!deviceId) return null
  return list().find(d => d.deviceId === deviceId) || null
}

function currentId() {
  return storage.get(CURRENT_KEY, '') || ''
}

function setCurrent(deviceId) {
  if (deviceId) storage.set(CURRENT_KEY, deviceId)
}

function current() {
  return get(currentId())
}

function normalize(input) {
  const model = String(input.model || '').toUpperCase()
  const meta = modelByKey(model)
  return {
    deviceId: input.deviceId,
    name: input.name || '',
    alias: input.alias || (meta ? meta.short : input.name || '康复设备'),
    model: model,
    modelText: modelName(model),
    icon: meta ? meta.icon : 'activity',
    sn: input.sn || '',
    fw: input.fw || '',
    battery: Number(input.battery) || 0,
    caps: input.caps || null,
    maxLevel: Number(input.maxLevel) || 0,
    lastLevel: Number(input.lastLevel) || 0,
    lastSeen: Number(input.lastSeen) || Date.now(),
    lastUsedAt: Number(input.lastUsedAt) || 0
  }
}

function upsert(input) {
  if (!input || !input.deviceId) return null
  const arr = list()
  const index = arr.findIndex(d => d.deviceId === input.deviceId)
  const old = index >= 0 ? arr[index] : null
  const next = normalize(
    Object.assign({}, old || {}, input, {
      alias: (old && old.alias) || input.alias || '',
      lastUsedAt: (old && old.lastUsedAt) || input.lastUsedAt || 0,
      lastSeen: Date.now()
    })
  )
  if (index >= 0) arr[index] = next
  else arr.unshift(next)
  persist(arr)
  setCurrent(next.deviceId)
  return next
}

function update(deviceId, patch) {
  const arr = list()
  const index = arr.findIndex(d => d.deviceId === deviceId)
  if (index < 0) return null
  arr[index] = Object.assign({}, arr[index], patch)
  persist(arr)
  return arr[index]
}

function remove(deviceId) {
  persist(list().filter(d => d.deviceId !== deviceId))
  if (currentId() === deviceId) storage.remove(CURRENT_KEY)
}

function rename(deviceId, alias) {
  const text = String(alias || '').trim().slice(0, 12)
  if (!text) return null
  return update(deviceId, { alias: text })
}

function markUsed(deviceId) {
  return update(deviceId, { lastUsedAt: Date.now(), lastSeen: Date.now() })
}

/** 握手成功后把快照落盘；返回标准化后的档案 */
function rememberSnapshot(snapshot) {
  const s = snapshot || {}
  if (!s.deviceId || !s.handshaked) return null
  const device = s.device || {}
  return upsert({
    deviceId: s.deviceId,
    name: s.deviceName || '',
    model: device.model,
    sn: device.serial,
    fw: device.firmware,
    battery: s.battery,
    caps: device.caps,
    maxLevel: device.maxLevel,
    lastLevel: s.level
  })
}

module.exports = {
  LIST_KEY,
  CURRENT_KEY,
  list,
  get,
  currentId,
  setCurrent,
  current,
  upsert,
  update,
  remove,
  rename,
  markUsed,
  rememberSnapshot
}
