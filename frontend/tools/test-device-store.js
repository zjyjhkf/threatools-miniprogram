/* 设备档案 store 纯逻辑测试：node tools/test-device-store.js */
const mem = new Map()
global.wx = {
  getStorageSync: k => (mem.has(k) ? mem.get(k) : ''),
  setStorageSync: (k, v) => mem.set(k, v),
  removeStorageSync: k => mem.delete(k)
}

const store = require('../store/device')

let failed = 0
function ok(name, cond, extra) {
  if (cond) {
    console.log('ok   ' + name)
  } else {
    failed++
    console.log('FAIL ' + name + (extra ? ' -> ' + JSON.stringify(extra) : ''))
  }
}

const snapshot = {
  deviceId: 'AA:BB:CC:DD:EE:01',
  deviceName: 'JH-PWM-A1B2',
  handshaked: true,
  battery: 86,
  level: 4,
  device: { model: 'PWM', serial: 'PWM20260001', firmware: '1.0.3', caps: { level: true, mode: true, pause: true, timer: true, battery: true, telemetry: false }, maxLevel: 8 }
}

ok('空快照不落盘', store.rememberSnapshot(null) === null)
ok('未握手不落盘', store.rememberSnapshot({ deviceId: 'x', handshaked: false }) === null)

const saved = store.rememberSnapshot(snapshot)
ok('握手后落盘', !!saved && saved.deviceId === snapshot.deviceId, saved)
ok('默认别名取机型简称', saved && saved.alias === '空气压力波', saved && saved.alias)
ok('型号与能力保存', saved && saved.model === 'PWM' && saved.maxLevel === 8 && saved.caps.level === true)
ok('自动设为当前设备', store.currentId() === snapshot.deviceId)

store.rename(snapshot.deviceId, '客厅加压带')
ok('重命名生效', store.get(snapshot.deviceId).alias === '客厅加压带')

store.markUsed(snapshot.deviceId)
const usedAt = store.get(snapshot.deviceId).lastUsedAt

store.rememberSnapshot(Object.assign({}, snapshot, { battery: 80 }))
const again = store.get(snapshot.deviceId)
ok('再次握手保留别名', again.alias === '客厅加压带')
ok('再次握手保留最近使用时间', again.lastUsedAt === usedAt)
ok('再次握手更新电量', again.battery === 80)
ok('列表只一条', store.list().length === 1)

const second = store.rememberSnapshot(Object.assign({}, snapshot, {
  deviceId: 'AA:BB:CC:DD:EE:02',
  deviceName: 'JH-GUN-C3D4',
  device: { model: 'GUN', serial: 'GUN20260002', firmware: '1.0.1', caps: { level: true }, maxLevel: 5 }
}))
ok('第二台设备可接入', !!second && store.list().length === 2 && store.currentId() === second.deviceId)
ok('第二台默认别名', second.alias === '筋膜枪')

store.remove('AA:BB:CC:DD:EE:02')
ok('移除后列表减少', store.list().length === 1)
ok('移除当前设备后 current 清空', store.currentId() === '')

store.rename('AA:BB:CC:DD:EE:01', '   ')
ok('空别名不生效', store.get('AA:BB:CC:DD:EE:01').alias === '客厅加压带')

console.log(failed ? 'FAILED ' + failed : 'ALL PASS')
process.exit(failed ? 1 : 0)
