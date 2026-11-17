/** 0.1 最小敏感词表（BR-17），提审前与后端词表同步扩充 */
const WORDS = ['医疗', '治愈', '包治', '处方', '加微信', '代购', '返现']

function hasSensitive(text) {
  const s = String(text || '')
  return WORDS.some(w => s.indexOf(w) >= 0)
}

module.exports = { WORDS, hasSensitive }
