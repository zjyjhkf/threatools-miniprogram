/**
 * 健衡 BLE 协议编解码（JH-FE-BLE-1.0）
 *
 * 帧：AA 55 | ver | cmd | seq | len(LE2) | payload | CRC16(LE2)
 * CRC：CRC-16/CCITT-FALSE，poly 0x1021，init 0xFFFF，覆盖 ver..payload
 * TLV：Tag | Len | Value（多字节小端，字符串 UTF-8 无 \0）
 *
 * 本文件是纯函数模块，不依赖 wx，可直接在 Node 中单测。
 */

const MAGIC = [0xaa, 0x55]
const VERSION = 0x01
const HEADER_LEN = 7
const MAX_PAYLOAD = 480

const CMD = {
  HELLO: 0x01,
  HELLO_ACK: 0x81,
  PING: 0x02,
  PONG: 0x82,
  START: 0x10,
  STOP: 0x11,
  SET_LEVEL: 0x12,
  PAUSE: 0x13,
  RESUME: 0x14,
  STATE: 0x90,
  TELEMETRY: 0x91,
  ACK: 0xa0,
  ERROR: 0xe0
}

const CMD_NAME = {
  0x01: 'HELLO',
  0x81: 'HELLO_ACK',
  0x02: 'PING',
  0x82: 'PONG',
  0x10: 'START',
  0x11: 'STOP',
  0x12: 'SET_LEVEL',
  0x13: 'PAUSE',
  0x14: 'RESUME',
  0x90: 'STATE',
  0x91: 'TELEMETRY',
  0xa0: 'ACK',
  0xe0: 'ERROR'
}

const TAG = {
  PROTO: 0x01,
  CLIENT: 0x02,
  APP_VER: 0x03,
  MODEL: 0x10,
  FIRMWARE: 0x11,
  SERIAL: 0x12,
  CAPS: 0x13,
  BATTERY: 0x14,
  MAX_LEVEL: 0x15,
  MODE: 0x16,
  LEVEL: 0x17,
  REMAIN: 0x18,
  STATE: 0x19,
  ERROR: 0x1a,
  DURATION: 0x1b,
  RSSI: 0x1c,
  SEQ_ACK: 0x1d,
  CODE: 0x1e,
  METRIC: 0x1f,
  VALUE: 0x20
}

const TAG_NAME = {
  0x01: 'proto',
  0x02: 'client',
  0x03: 'appVer',
  0x10: 'model',
  0x11: 'firmware',
  0x12: 'serial',
  0x13: 'caps',
  0x14: 'battery',
  0x15: 'maxLevel',
  0x16: 'mode',
  0x17: 'level',
  0x18: 'remain',
  0x19: 'state',
  0x1a: 'error',
  0x1b: 'duration',
  0x1c: 'rssi',
  0x1d: 'seqAck',
  0x1e: 'code',
  0x1f: 'metric',
  0x20: 'value'
}

const STRING_TAGS = { 0x03: true, 0x10: true, 0x11: true, 0x12: true }
const U16_TAGS = { 0x13: true, 0x18: true, 0x1a: true, 0x1b: true, 0x1f: true }
const U32_TAGS = { 0x20: true }
const I8_TAGS = { 0x1c: true }

const ACK_CODE = {
  OK: 0,
  BAD_FRAME: 1,
  UNSUPPORTED: 2,
  BUSY: 3,
  RANGE: 4,
  NOT_READY: 5
}

const ACK_TEXT = {
  0: '操作成功',
  1: '设备通信异常',
  2: '设备不支持该操作',
  3: '设备正在执行，请稍候',
  4: '档位/时长超出设备范围',
  5: '设备尚未就绪，请先完成握手'
}

const DEVICE_STATE = { IDLE: 0, RUNNING: 1, PAUSED: 2, FAULT: 3 }
const STATE_TEXT = { 0: '空闲', 1: '运行中', 2: '已暂停', 3: '故障' }

const FAULT_TEXT = {
  0x0001: '过流保护',
  0x0002: '过温保护',
  0x0003: '气压异常',
  0x0004: '电量过低',
  0x0005: '传感器异常',
  0x00ff: '未知故障'
}

const MODEL_TEXT = { PWM: '空气压力波按摩仪', GUN: '筋膜枪', ROLL: '电动泡沫轴' }

/* ---------------- 字节工具 ---------------- */

function u8(n) {
  return [n & 0xff]
}

function u16(n) {
  const v = n & 0xffff
  return [v & 0xff, (v >> 8) & 0xff]
}

function u32(n) {
  const v = n >>> 0
  return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]
}

function i8(n) {
  return [n & 0xff]
}

function utf8Bytes(str) {
  const out = []
  const s = String(str == null ? '' : str)
  for (let i = 0; i < s.length; i++) {
    let code = s.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000
        i++
      }
    }
    if (code < 0x80) out.push(code)
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
  }
  return out
}

function utf8Text(bytes, start, end) {
  const arr = []
  let i = start == null ? 0 : start
  const stop = end == null ? bytes.length : end
  while (i < stop) {
    const b = bytes[i]
    if (b < 0x80) {
      arr.push(b)
      i += 1
    } else if (b >= 0xc0 && b < 0xe0 && i + 1 < stop) {
      arr.push(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f))
      i += 2
    } else if (b >= 0xe0 && b < 0xf0 && i + 2 < stop) {
      arr.push(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f))
      i += 3
    } else if (b >= 0xf0 && i + 3 < stop) {
      arr.push(((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f))
      i += 4
    } else {
      arr.push(0xfffd)
      i += 1
    }
  }
  try {
    return decodeURIComponent(escape(String.fromCharCode.apply(null, arr)))
  } catch (e) {
    return String.fromCharCode.apply(null, arr)
  }
}

function toBytes(input) {
  if (!input) return new Uint8Array(0)
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (Array.isArray(input)) return new Uint8Array(input)
  if (input.buffer instanceof ArrayBuffer) return new Uint8Array(input.buffer)
  return new Uint8Array(0)
}

function toArrayBuffer(bytes) {
  const src = toBytes(bytes)
  const out = new ArrayBuffer(src.length)
  new Uint8Array(out).set(src)
  return out
}

function concat(parts) {
  let total = 0
  parts.forEach(p => {
    total += p.length
  })
  const out = new Uint8Array(total)
  let offset = 0
  parts.forEach(p => {
    out.set(p, offset)
    offset += p.length
  })
  return out
}

function hex(bytes, sep) {
  const arr = toBytes(bytes)
  const list = []
  for (let i = 0; i < arr.length; i++) {
    list.push((arr[i] < 16 ? '0' : '') + arr[i].toString(16).toUpperCase())
  }
  return list.join(sep == null ? ' ' : sep)
}

function fromHex(str) {
  const clean = String(str || '').replace(/[^0-9a-fA-F]/g, '')
  const out = new Uint8Array(Math.floor(clean.length / 2))
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16)
  }
  return out
}

/* ---------------- CRC ---------------- */

function crc16(bytes, start, end) {
  const arr = toBytes(bytes)
  const from = start == null ? 0 : start
  const to = end == null ? arr.length : end
  let crc = 0xffff
  for (let i = from; i < to; i++) {
    crc ^= arr[i] << 8
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff
      else crc = (crc << 1) & 0xffff
    }
  }
  return crc
}

/* ---------------- TLV ---------------- */

function encodeTLV(items) {
  const parts = []
  ;(items || []).forEach(item => {
    if (!item || item.tag == null) return
    let value
    if (item.bytes) value = toBytes(item.bytes)
    else if (item.type === 'str' || typeof item.value === 'string') value = new Uint8Array(utf8Bytes(item.value))
    else if (item.type === 'u8') value = new Uint8Array(u8(item.value))
    else if (item.type === 'i8') value = new Uint8Array(i8(item.value))
    else if (item.type === 'u16') value = new Uint8Array(u16(item.value))
    else if (item.type === 'u32') value = new Uint8Array(u32(item.value))
    else {
      const n = Number(item.value) || 0
      if (n >= 0 && n <= 0xff) value = new Uint8Array(u8(n))
      else if (n >= 0 && n <= 0xffff) value = new Uint8Array(u16(n))
      else value = new Uint8Array(u32(n))
    }
    if (value.length > 255) value = value.slice(0, 255)
    parts.push(new Uint8Array([item.tag & 0xff, value.length]))
    parts.push(value)
  })
  return concat(parts)
}

function readTLV(bytes) {
  const arr = toBytes(bytes)
  const out = {}
  const list = []
  let i = 0
  while (i + 2 <= arr.length) {
    const tag = arr[i]
    const len = arr[i + 1]
    if (i + 2 + len > arr.length) break
    const value = arr.slice(i + 2, i + 2 + len)
    const name = TAG_NAME[tag] || 'tag_' + tag.toString(16)
    let parsed
    if (STRING_TAGS[tag]) parsed = utf8Text(value, 0, value.length)
    else if (U16_TAGS[tag]) parsed = value.length >= 2 ? value[0] | (value[1] << 8) : value[0] || 0
    else if (U32_TAGS[tag]) {
      parsed = 0
      for (let k = value.length - 1; k >= 0; k--) parsed = parsed * 256 + value[k]
    } else if (I8_TAGS[tag]) parsed = value.length ? (value[0] > 127 ? value[0] - 256 : value[0]) : 0
    else parsed = value.length === 1 ? value[0] : Array.prototype.slice.call(value)
    out[name] = parsed
    list.push({ tag: tag, name: name, value: parsed })
    i += 2 + len
  }
  out.list = list
  return out
}

/* ---------------- 帧编解码 ---------------- */

function buildPayload(cmd, tlvs) {
  if (!tlvs || !tlvs.length) return new Uint8Array(0)
  // 兼容已经拼好的 payload
  if (tlvs.length === 1 && tlvs[0] && tlvs[0].__payload) return toBytes(tlvs[0].__payload)
  return encodeTLV(tlvs)
}

function encode(cmd, seq, tlvs) {
  const payload = buildPayload(cmd, tlvs)
  return encodeRaw(cmd, seq, payload)
}

function encodeRaw(cmd, seq, payload) {
  const body = toBytes(payload)
  if (body.length > MAX_PAYLOAD) throw new Error('payload too large: ' + body.length)
  const header = new Uint8Array([
    MAGIC[0],
    MAGIC[1],
    VERSION,
    cmd & 0xff,
    seq & 0xff,
    body.length & 0xff,
    (body.length >> 8) & 0xff
  ])
  const noCrc = concat([header, body])
  const crc = crc16(noCrc, 2, noCrc.length)
  const bytes = concat([noCrc, new Uint8Array(u16(crc))])
  return {
    cmd: cmd & 0xff,
    seq: seq & 0xff,
    payload: body,
    bytes: bytes,
    buffer: toArrayBuffer(bytes),
    hex: hex(bytes)
  }
}

function decode(input) {
  const bytes = toBytes(input)
  if (bytes.length < HEADER_LEN + 2) return { ok: false, error: 'short', bytes: bytes }
  if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1]) return { ok: false, error: 'magic', bytes: bytes }
  const version = bytes[2]
  if (version !== VERSION) return { ok: false, error: 'version', version: version, bytes: bytes }
  const cmd = bytes[3]
  const seq = bytes[4]
  const len = bytes[5] | (bytes[6] << 8)
  if (len > MAX_PAYLOAD) return { ok: false, error: 'length', length: len, cmd: cmd, seq: seq, bytes: bytes }
  const total = HEADER_LEN + len + 2
  if (bytes.length < total) return { ok: false, error: 'incomplete', need: total, bytes: bytes }
  const expect = crc16(bytes, 2, HEADER_LEN + len)
  const actual = bytes[HEADER_LEN + len] | (bytes[HEADER_LEN + len + 1] << 8)
  if (expect !== actual) {
    return { ok: false, error: 'crc', expect: expect, actual: actual, cmd: cmd, seq: seq, bytes: bytes }
  }
  const payload = bytes.slice(HEADER_LEN, HEADER_LEN + len)
  const frame = {
    cmd: cmd,
    seq: seq,
    payload: payload,
    tlvs: readTLV(payload),
    hex: hex(bytes.slice(0, total))
  }
  return { ok: true, frame: frame, bytes: bytes.slice(0, total) }
}

/**
 * 处理可能粘包/半包的接收流，返回完整帧和剩余字节。
 */
function decodeStream(input) {
  let rest = toBytes(input)
  const frames = []
  const errors = []
  let guard = 0
  while (rest.length >= 2 && guard++ < 64) {
    let start = 0
    while (start + 1 < rest.length && !(rest[start] === MAGIC[0] && rest[start + 1] === MAGIC[1])) start++
    if (start >= rest.length - 1) {
      rest = new Uint8Array(0)
      break
    }
    if (start > 0) rest = rest.slice(start)
    if (rest.length < HEADER_LEN + 2) break
    const len = rest[5] | (rest[6] << 8)
    if (len > MAX_PAYLOAD) {
      errors.push({ error: 'length', length: len })
      rest = rest.slice(2)
      continue
    }
    const total = HEADER_LEN + len + 2
    if (rest.length < total) break
    const res = decode(rest.slice(0, total))
    if (res.ok) {
      frames.push(res.frame)
      rest = rest.slice(total)
    } else {
      errors.push(res)
      rest = rest.slice(2)
    }
  }
  return { frames: frames, rest: rest, errors: errors }
}

/* ---------------- 指令构造 ---------------- */

function helloPayload(appVersion) {
  const ver = toBytes(appVersion || [1, 0, 1])
  return encodeTLV([
    { tag: TAG.PROTO, type: 'u8', value: 1 },
    { tag: TAG.CLIENT, type: 'u8', value: 1 },
    { tag: TAG.APP_VER, bytes: ver }
  ])
}

function buildHello(seq, appVersion) {
  const ver = appVersion || [1, 0, 1]
  return encode(CMD.HELLO, seq, [
    { tag: TAG.PROTO, type: 'u8', value: 1 },
    { tag: TAG.CLIENT, type: 'u8', value: 1 },
    { tag: TAG.APP_VER, bytes: toBytes(ver) }
  ])
}

function buildStart(seq, opts) {
  const o = opts || {}
  return encode(CMD.START, seq, [
    { tag: TAG.MODE, type: 'u8', value: o.mode || 0 },
    { tag: TAG.LEVEL, type: 'u8', value: o.level || 1 },
    { tag: TAG.DURATION, type: 'u16', value: o.duration || 600 }
  ])
}

function buildSetLevel(seq, level) {
  return encode(CMD.SET_LEVEL, seq, [{ tag: TAG.LEVEL, type: 'u8', value: level }])
}

function buildSimple(cmd, seq) {
  return encode(cmd, seq, [])
}

/* ---------------- 解析 ---------------- */

function parsePayload(cmd, payload) {
  const tlv = readTLV(payload)
  if (cmd === CMD.HELLO_ACK) {
    return {
      model: tlv.model || '',
      firmware: tlv.firmware || '',
      serial: tlv.serial || '',
      caps: tlv.caps || 0,
      battery: tlv.battery || 0,
      maxLevel: tlv.maxLevel || 0
    }
  }
  if (cmd === CMD.ACK) return { seqAck: tlv.seqAck || 0, code: tlv.code || 0 }
  if (cmd === CMD.STATE) {
    return {
      state: tlv.state || 0,
      mode: tlv.mode || 0,
      level: tlv.level || 0,
      remain: tlv.remain || 0,
      battery: tlv.battery || 0,
      error: tlv.error || 0
    }
  }
  if (cmd === CMD.TELEMETRY) return { metric: tlv.metric || 0, value: tlv.value || 0 }
  if (cmd === CMD.ERROR) return { error: tlv.error || 0 }
  if (cmd === CMD.PONG) return { battery: tlv.battery || 0, state: tlv.state || 0 }
  return tlv
}

function capsOf(caps) {
  const c = Number(caps) || 0
  return {
    level: !!(c & 0x01),
    mode: !!(c & 0x02),
    pause: !!(c & 0x04),
    timer: !!(c & 0x08),
    battery: !!(c & 0x10),
    telemetry: !!(c & 0x20)
  }
}

function cmdName(cmd) {
  return CMD_NAME[cmd] || '0x' + Number(cmd || 0).toString(16).toUpperCase()
}

function ackText(code) {
  return ACK_TEXT[code] || '设备返回错误（' + code + '）'
}

function stateText(state) {
  return STATE_TEXT[state] || '未知'
}

function faultText(code) {
  const n = Number(code) || 0
  if (FAULT_TEXT[n]) return FAULT_TEXT[n]
  let hexCode = n.toString(16).toUpperCase()
  while (hexCode.length < 4) hexCode = '0' + hexCode
  return '故障码 0x' + hexCode
}

function modelText(model) {
  return MODEL_TEXT[model] || model || ''
}

module.exports = {
  MAGIC: MAGIC,
  VERSION: VERSION,
  HEADER_LEN: HEADER_LEN,
  MAX_PAYLOAD: MAX_PAYLOAD,
  CMD: CMD,
  CMD_NAME: CMD_NAME,
  TAG: TAG,
  ACK_CODE: ACK_CODE,
  DEVICE_STATE: DEVICE_STATE,
  u8: u8,
  u16: u16,
  u32: u32,
  i8: i8,
  utf8Bytes: utf8Bytes,
  utf8Text: utf8Text,
  toBytes: toBytes,
  toArrayBuffer: toArrayBuffer,
  concat: concat,
  hex: hex,
  fromHex: fromHex,
  crc16: crc16,
  encodeTLV: encodeTLV,
  readTLV: readTLV,
  encode: encode,
  encodeRaw: encodeRaw,
  decode: decode,
  decodeStream: decodeStream,
  helloPayload: helloPayload,
  buildHello: buildHello,
  buildStart: buildStart,
  buildSetLevel: buildSetLevel,
  buildSimple: buildSimple,
  parsePayload: parsePayload,
  capsOf: capsOf,
  cmdName: cmdName,
  ackText: ackText,
  stateText: stateText,
  faultText: faultText,
  modelText: modelText
}
