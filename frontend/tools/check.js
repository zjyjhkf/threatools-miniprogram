/**
 * 工程自检：JSON 合法性 / WXML 事件处理函数是否存在 / 页面组件文件是否齐全
 * 用法：node tools/check.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

function walk(dir, out) {
  const list = out || []
  fs.readdirSync(dir).forEach(name => {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      if (name !== 'node_modules' && name !== '.git' && name !== 'tools') walk(full, list)
    } else {
      list.push(full)
    }
  })
  return list
}

const files = walk(ROOT)
const rel = f => path.relative(ROOT, f)
let problems = 0

/* 1. JSON */
files
  .filter(f => f.endsWith('.json'))
  .forEach(f => {
    try {
      JSON.parse(fs.readFileSync(f, 'utf8'))
    } catch (e) {
      console.log('[JSON] ' + rel(f) + ' -> ' + e.message)
      problems++
    }
  })

/* 2. 事件处理函数（页面可用 mixin 注入的方法） */
const MIXIN = fs.readFileSync(path.join(ROOT, 'utils/page-mixin.js'), 'utf8')
const RE = /(?:bind|catch|bind:|catch:)[a-zA-Z]+="([A-Za-z0-9_]+)"/g
files
  .filter(f => f.endsWith('.wxml'))
  .forEach(f => {
    const js = f.replace(/\.wxml$/, '.js')
    if (!fs.existsSync(js)) return
    const wxml = fs.readFileSync(f, 'utf8')
    const code = fs.readFileSync(js, 'utf8') + MIXIN
    const seen = {}
    let m
    while ((m = RE.exec(wxml))) {
      const fn = m[1]
      if (seen[fn]) continue
      seen[fn] = 1
      const defined = new RegExp('(^|[^\\w])' + fn + '\\s*[(:]').test(code)
      if (!defined) {
        console.log('[HANDLER] ' + rel(f) + ' -> ' + fn + ' 未在 js 中定义')
        problems++
      }
    }
  })

/* 3. 组件路径 */
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
const pages = app.pages.concat(
  ...app.subpackages.map(s => s.pages.map(p => s.root + '/' + p))
)
pages.forEach(p => {
  ;['js', 'json', 'wxml', 'wxss'].forEach(ext => {
    if (!fs.existsSync(path.join(ROOT, p + '.' + ext))) {
      console.log('[PAGE] 缺少 ' + p + '.' + ext)
      problems++
    }
  })
})
Object.keys(app.usingComponents || {}).forEach(k => {
  const base = app.usingComponents[k].replace(/^\//, '')
  ;['js', 'json', 'wxml', 'wxss'].forEach(ext => {
    if (!fs.existsSync(path.join(ROOT, base + '.' + ext))) {
      console.log('[COMP] 缺少 ' + k + ' ' + base + '.' + ext)
      problems++
    }
  })
})

/* 3.1 各文件内声明的 usingComponents 路径 */
files
  .filter(f => f.endsWith('.json'))
  .forEach(f => {
    let cfg
    try {
      cfg = JSON.parse(fs.readFileSync(f, 'utf8'))
    } catch (e) {
      return
    }
    const uc = cfg.usingComponents || {}
    Object.keys(uc).forEach(key => {
      const p = uc[key]
      const base = p.charAt(0) === '/' ? path.join(ROOT, p) : path.resolve(path.dirname(f), p)
      ;['js', 'json', 'wxml', 'wxss'].forEach(ext => {
        if (!fs.existsSync(base + '.' + ext)) {
          console.log('[USING] ' + rel(f) + ' -> ' + key + ' 缺少 ' + base + '.' + ext)
          problems++
        }
      })
    })
  })

/* 4. WXML 基础结构 */
files
  .filter(f => f.endsWith('.wxml'))
  .forEach(f => {
    const text = fs.readFileSync(f, 'utf8')
    const open = (text.match(/\{\{/g) || []).length
    const close = (text.match(/\}\}/g) || []).length
    if (open !== close) {
      console.log('[WXML] ' + rel(f) + ' 花括号不配对 ' + open + '/' + close)
      problems++
    }
    const stack = []
    const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
    let m
    while ((m = re.exec(text))) {
      const closing = m[1] === '/'
      const tag = m[2]
      const selfClose = m[4] === '/'
      if (closing) {
        const last = stack.pop()
        if (last !== tag) {
          console.log('[WXML] ' + rel(f) + ' 标签不匹配：期望 </' + last + '>，实际 </' + tag + '>')
          problems++
          return
        }
      } else if (!selfClose) {
        stack.push(tag)
      }
    }
    if (stack.length) {
      console.log('[WXML] ' + rel(f) + ' 未闭合标签：' + stack.join(','))
      problems++
    }
  })

/* 5. 文案红线 */
const BANNED = ['智康']
files
  .filter(f => /\.(js|json|wxml|wxss)$/.test(f))
  .forEach(f => {
    const text = fs.readFileSync(f, 'utf8')
    BANNED.forEach(w => {
      if (text.indexOf(w) >= 0) {
        console.log('[COPY] ' + rel(f) + ' 含禁用词 ' + w)
        problems++
      }
    })
  })

console.log('----')
console.log('pages=' + pages.length + ' components=' + Object.keys(app.usingComponents || {}).length)
console.log(problems ? '发现 ' + problems + ' 个问题' : '自检通过')
process.exit(problems ? 1 : 0)
