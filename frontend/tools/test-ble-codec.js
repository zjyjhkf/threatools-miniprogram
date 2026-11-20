/**
 * BLE 协议编解码单测（无需微信环境）：node tools/test-ble-codec.js
 */

const assert = require('assert')
const codec = require('../utils/ble-codec')

let passed = 0
const failed = []

function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log('  ok  ' + name)
  } catch (e) {
    failed.push({ name: name, error: e })
    console.log('  FAIL ' + name + ' -> ' + e.message)
  }
}

console.log('BLE codec')

test('CRC-16/CCITT-FALSE 标准向量', () => {
  assert.strictEqual(codec.crc16(codec.utf8Bytes('123456789')), 0x29b1)
})

test('HELLO 帧结构', () => {
  const f = codec.buildHello(7)
  assert.strictEqual(f.bytes[0], 0xaa)
  assert.strictEqual(f.bytes[1], 0x55)
  assert.strictEqual(f.bytes[2], 0x01)
  assert.strictEqual(f.bytes[3], codec.CMD.HELLO)
  assert.strictEqual(f.bytes[4], 7)
  assert.strictEqual(f.bytes.length, 9 + f.payload.length)
  const d = codec.decode(f.buffer)
  assert.strictEqual(d.ok, true)
  assert.strictEqual(d.frame.cmd, codec.CMD.HELLO)
  assert.strictEqual(d.frame.tlvs.proto, 1)
  assert.strictEqual(d.frame.tlvs.client, 1)
})

test('CRC 错误可识别', () => {
  const f = codec.buildSimple(codec.CMD.STOP, 9)
  f.bytes[f.bytes.length - 1] ^= 0xff
  const d = codec.decode(f.bytes)
  assert.strictEqual(d.ok, false)
  assert.strictEqual(d.error, 'crc')
})

test('半包 + 续包重组', () => {
  const f = codec.buildStart(3, { mode: 1, level: 2, duration: 600 })
  const first = codec.decodeStream(f.bytes.slice(0, 5))
  assert.strictEqual(first.frames.length, 0)
  assert.strictEqual(first.rest.length, 5)
  const second = codec.decodeStream(codec.concat([first.rest, f.bytes.slice(5)]))
  assert.strictEqual(second.frames.length, 1)
  assert.strictEqual(second.frames[0].cmd, codec.CMD.START)
  assert.strictEqual(second.rest.length, 0)
})

test('粘包多帧 + 垃圾前缀', () => {
  const a = codec.buildSimple(codec.CMD.PING, 1)
  const b = codec.buildSetLevel(2, 4)
  const stream = codec.concat([new Uint8Array([0x00, 0x11]), a.bytes, b.bytes])
  const res = codec.decodeStream(stream)
  assert.strictEqual(res.frames.length, 2)
  assert.strictEqual(res.frames[0].cmd, codec.CMD.PING)
  assert.strictEqual(res.frames[1].cmd, codec.CMD.SET_LEVEL)
  assert.strictEqual(res.frames[1].tlvs.level, 4)
})

test('ACK 解析', () => {
  const f = codec.encode(codec.CMD.ACK, 10, [
    { tag: codec.TAG.SEQ_ACK, type: 'u8', value: 3 },
    { tag: codec.TAG.CODE, type: 'u8', value: 0 }
  ])
  const d = codec.decode(f.buffer)
  const ack = codec.parsePayload(d.frame.cmd, d.frame.payload)
  assert.strictEqual(ack.seqAck, 3)
  assert.strictEqual(ack.code, 0)
})

test('STATE 解析（含 u16 小端）', () => {
  const f = codec.encode(codec.CMD.STATE, 11, [
    { tag: codec.TAG.STATE, type: 'u8', value: 1 },
    { tag: codec.TAG.MODE, type: 'u8', value: 2 },
    { tag: codec.TAG.LEVEL, type: 'u8', value: 3 },
    { tag: codec.TAG.REMAIN, type: 'u16', value: 1200 },
    { tag: codec.TAG.BATTERY, type: 'u8', value: 88 },
    { tag: codec.TAG.ERROR, type: 'u16', value: 0 }
  ])
  const d = codec.decode(f.buffer)
  const st = codec.parsePayload(d.frame.cmd, d.frame.payload)
  assert.deepStrictEqual(st, { state: 1, mode: 2, level: 3, remain: 1200, battery: 88, error: 0 })
})

test('HELLO_ACK 解析', () => {
  const f = codec.encode(codec.CMD.HELLO_ACK, 7, [
    { tag: codec.TAG.MODEL, type: 'str', value: 'PWM' },
    { tag: codec.TAG.FIRMWARE, type: 'str', value: '1.0.3' },
    { tag: codec.TAG.SERIAL, type: 'str', value: 'JHPWM20260001' },
    { tag: codec.TAG.CAPS, type: 'u16', value: 0x3f },
    { tag: codec.TAG.BATTERY, type: 'u8', value: 76 },
    { tag: codec.TAG.MAX_LEVEL, type: 'u8', value: 5 }
  ])
  const d = codec.decode(f.buffer)
  const info = codec.parsePayload(d.frame.cmd, d.frame.payload)
  assert.strictEqual(info.model, 'PWM')
  assert.strictEqual(info.firmware, '1.0.3')
  assert.strictEqual(info.serial, 'JHPWM20260001')
  assert.strictEqual(info.caps, 0x3f)
  assert.strictEqual(info.battery, 76)
  assert.strictEqual(info.maxLevel, 5)
  assert.deepStrictEqual(codec.capsOf(info.caps), {
    level: true,
    mode: true,
    pause: true,
    timer: true,
    battery: true,
    telemetry: true
  })
})

test('CRC 覆盖范围：篡改 payload 必失败', () => {
  const f = codec.encode(codec.CMD.TELEMETRY, 1, [
    { tag: codec.TAG.METRIC, type: 'u8', value: 1 },
    { tag: codec.TAG.VALUE, type: 'u32', value: 123456 }
  ])
  const bytes = f.bytes.slice(0)
  bytes[10] ^= 0x01
  assert.strictEqual(codec.decode(bytes).error, 'crc')
})

test('payload 上限', () => {
  assert.throws(() => codec.encodeRaw(codec.CMD.START, 1, new Uint8Array(481)), /payload too large/)
})

test('hex/fromHex 往返', () => {
  const f = codec.buildSimple(codec.CMD.STOP, 255)
  assert.deepStrictEqual(Array.from(codec.fromHex(f.hex)), Array.from(f.bytes))
})

console.log('')
if (failed.length) {
  console.error(failed.length + ' failed, ' + passed + ' passed')
  process.exit(1)
}
console.log(passed + ' passed')
