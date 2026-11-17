const { ageOf } = require('./format')

const RULES = {
  nickname: v => {
    const s = String(v || '').trim()
    return s.length >= 2 && s.length <= 20 && !/^\d+$/.test(s) && !/[<>\u005c/]/.test(s)
  },
  birthday: v => {
    if (!v) return false
    const age = ageOf(v)
    return v <= todayStr() && age >= 12
  },
  city: v => !!String(v || '').trim(),
  bio: v => String(v || '').length <= 30,
  height: v => Number.isInteger(+v) && +v >= 100 && +v <= 250,
  weight: v => {
    const n = +v
    return !isNaN(n) && n >= 30 && n <= 200 && /^\d+(\.\d)?$/.test(String(v))
  },
  goals: a => Array.isArray(a) && a.length >= 1 && a.length <= 3,
  focusParts: a => Array.isArray(a) && a.length <= 6,
  injuries: v => String(v || '').length <= 100,
  content: v => String(v || '').length <= 500,
  comment: v => !!String(v || '').trim() && String(v).length <= 200,
  topicName: v => {
    const s = String(v || '').trim()
    return s.length >= 2 && s.length <= 20
  },
  keyword: v => {
    const s = String(v || '').trim()
    return s.length >= 1 && s.length <= 30
  }
}

function todayStr() {
  const d = new Date()
  const p = n => (n < 10 ? '0' + n : n)
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

const MESSAGES = {
  nickname: '昵称需 2–20 个字符',
  birthday: '请选择正确的出生日期',
  city: '请选择所在城市',
  bio: '简介最多 30 字',
  height: '请输入 100–250 之间的数值',
  weight: '请输入 30–200 之间的数值',
  goals: '请选择 1–3 个运动目标',
  focusParts: '最多选择 6 个部位',
  injuries: '最多 100 字',
  content: '正文最多 500 字',
  comment: '评论不能为空',
  topicName: '话题名需 2–20 个字',
  keyword: '请输入 1–30 个字符'
}

function validate(field, value) {
  const f = RULES[field]
  return f ? f(value) : true
}

function messageOf(field) {
  return MESSAGES[field] || '输入有误'
}

module.exports = { validate, RULES, MESSAGES, messageOf, todayStr }
