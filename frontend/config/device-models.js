/** 支持接入的康复设备目录（P0 三机型，与固件 0x10 MODEL 一致） */

const MODELS = [
  {
    key: 'PWM',
    name: '空气压力波按摩仪',
    short: '空气压力波',
    tagline: '双腔气压 · 腿部放松',
    icon: 'activity',
    scene: '久坐、久站、跑后腿部酸胀',
    intro:
      '通过双腔气囊顺序加压，帮助下肢做节律性挤压放松。连接小程序后可调节压力档位、选择模式并查看实时压力。',
    features: ['双腔交替加压，覆盖小腿与大腿', '档位、模式、时长可在小程序内调节', '运行中实时回传压力与剩余时间'],
    specs: [
      { k: '连接方式', v: '蓝牙 5.0 BLE' },
      { k: '额定功率', v: '30W' },
      { k: '气压范围', v: '20–120 mmHg' },
      { k: '适用部位', v: '小腿 / 大腿' },
      { k: '供电', v: 'DC 12V 适配器' }
    ],
    safety: ['佩戴前确认气囊管路无折叠、无破损。', '有静脉血栓、严重心血管疾病或皮肤破损时请先咨询医生。', '运行中如出现明显疼痛、麻木，请立即停止。']
  },
  {
    key: 'GUN',
    name: '筋膜枪',
    short: '筋膜枪',
    tagline: '深层肌肉放松 · 多档变速',
    icon: 'zap',
    scene: '训练后肌肉紧张、局部僵硬',
    intro:
      '高频冲击帮助放松局部肌肉与筋膜。连接小程序后可远程调节档位、切换模式，并查看设备状态与电量。',
    features: ['多档冲击频率，按部位选择强度', '小程序远程调档，避免反复弯腰操作', '电量与运行状态实时同步'],
    specs: [
      { k: '连接方式', v: '蓝牙 5.0 BLE' },
      { k: '额定功率', v: '24W' },
      { k: '档位', v: '1–5 档' },
      { k: '冲程', v: '10mm' },
      { k: '供电', v: '内置锂电池' }
    ],
    safety: ['避开颈椎、脊柱、关节骨突与颈动脉区域。', '同一部位连续使用不超过 2 分钟。', '骨折、急性损伤或皮肤破损处禁止使用。']
  },
  {
    key: 'ROLL',
    name: '电动泡沫轴',
    short: '电动泡沫轴',
    tagline: '滚动放松 · 恒定转速',
    icon: 'refresh',
    scene: '训练前后热身、筋膜放松',
    intro:
      '以恒定转速辅助泡沫轴滚动，减少自行发力。连接小程序后可调节转速档位、设置时长并查看运行状态。',
    features: ['电机驱动，保持稳定滚动节奏', '多档转速适配不同耐受度', '定时运行，到点自动停止'],
    specs: [
      { k: '连接方式', v: '蓝牙 5.0 BLE' },
      { k: '额定功率', v: '18W' },
      { k: '档位', v: '1–4 档' },
      { k: '直径', v: '120mm' },
      { k: '供电', v: '内置锂电池' }
    ],
    safety: ['避免直接滚压腰椎与膝关节。', '初次使用从最低档开始，每次不超过 10 分钟。', '骨质疏松或急性腰痛者请遵医嘱。']
  }
]

const MODEL_MAP = MODELS.reduce((map, item) => {
  map[item.key] = item
  return map
}, {})

function modelByKey(key) {
  return MODEL_MAP[String(key || '').toUpperCase()] || null
}

function modelName(key) {
  const m = modelByKey(key)
  return m ? m.name : key || '康复设备'
}

function modelFromBroadcastName(name) {
  const m = /^JH-(PWM|GUN|ROLL)-/i.exec(String(name || ''))
  return m ? m[1].toUpperCase() : ''
}

module.exports = { MODELS, MODEL_MAP, modelByKey, modelName, modelFromBroadcastName }
