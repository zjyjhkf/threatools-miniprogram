const LEVEL = { debug: 0, info: 1, warn: 2, error: 3 }
const MIN = 1

function print(level, tag, args) {
  if (LEVEL[level] < MIN) return
  const fn = console[level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log']
  if (typeof fn === 'function') fn('[jh][' + level + '][' + tag + ']', ...args)
}

module.exports = {
  debug: (tag, ...a) => print('debug', tag, a),
  info: (tag, ...a) => print('info', tag, a),
  warn: (tag, ...a) => print('warn', tag, a),
  error: (tag, ...a) => print('error', tag, a)
}
