function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

/** 统一解析 yyyy-MM-dd HH:mm:ss（iOS 不支持 - 分隔，需替换） */
function parseTime(str) {
  if (!str) return null
  if (str instanceof Date) return str
  const s = String(str).replace(/-/g, '/')
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/** 相对时间：≤7 天按小时/天，其余 yyyy-MM-dd */
function relativeTime(str) {
  const d = parseTime(str)
  if (!d) return ''
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return min + ' 分钟前'
  const hour = Math.floor(min / 60)
  if (hour < 24) return hour + ' 小时前'
  const day = Math.floor(hour / 24)
  if (day <= 7) return day + ' 天前'
  return formatDate(d)
}

function formatDate(d) {
  const t = parseTime(d)
  if (!t) return ''
  return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate())
}

function formatDateTime(d) {
  const t = parseTime(d)
  if (!t) return ''
  return formatDate(t) + ' ' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':' + pad(t.getSeconds())
}

/** 12000 → 1.2 万 */
function formatCount(n) {
  const v = Number(n) || 0
  if (v < 10000) return '' + v
  const w = v / 10000
  return (w >= 10 ? Math.round(w) : Math.round(w * 10) / 10) + ' 万'
}

/** 秒 → 18:00 / 10 分钟 */
function formatDuration(sec) {
  const s = Number(sec) || 0
  if (s < 60) return s + ' 秒'
  const m = Math.floor(s / 60)
  if (m < 60) return m + ' 分钟'
  return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分'
}

/** 秒 → mm:ss */
function formatClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  return pad(Math.floor(s / 60)) + ':' + pad(s % 60)
}

function ageOf(birthday) {
  const d = parseTime(birthday)
  if (!d) return 0
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

function today() {
  return formatDate(new Date())
}

module.exports = {
  pad,
  parseTime,
  formatDate,
  formatDateTime,
  relativeTime,
  formatCount,
  formatDuration,
  formatClock,
  ageOf,
  today
}
