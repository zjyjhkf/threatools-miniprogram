const { ROUTES } = require('../../../config/constants')

const CONTENT = {
  agreement: {
    title: '用户协议',
    updatedAt: '2026-11-05',
    sections: [
      {
        heading: '一、服务说明',
        paragraphs: [
          '健衡运动社区（以下简称“本小程序”）由健衡健康科技提供，面向运动爱好者与康复人群，提供内容浏览、课程学习、产品了解与个人资料管理服务。',
          '本小程序提供的课程与内容仅供运动参考，不构成医疗诊断或治疗建议。如有伤病，请遵医嘱。'
        ]
      },
      {
        heading: '二、账号与使用',
        paragraphs: [
          '你通过微信授权登录本小程序。你应妥善保管账号，并对账号下的一切行为负责。',
          '你需保证填写的资料真实、准确；不得冒用他人身份，不得使用违法违规的昵称与头像。'
        ]
      },
      {
        heading: '三、内容规范',
        paragraphs: [
          '你发布的内容（文字、图片、话题）应遵守法律法规与公序良俗，不得包含：违法违规信息、医疗诊断与疗效承诺、广告导流与联系方式、侵犯他人权利的内容、虚假与误导性信息。',
          '平台有权对违规内容进行隐藏、删除，并对违规账号采取限制措施。'
        ]
      },
      {
        heading: '四、知识产权',
        paragraphs: [
          '本小程序的课程、产品资料、界面设计等内容的知识产权归健衡健康科技或相应权利人所有，未经许可不得转载、商用。',
          '你发布的内容，你保留著作权，并授权平台在本小程序内展示、推荐。'
        ]
      },
      {
        heading: '五、免责与变更',
        paragraphs: [
          '因网络、设备、第三方服务等原因导致的服务中断，平台将尽力恢复，但不承担由此产生的间接损失。',
          '本协议可能随业务调整而更新，更新后将在本页面公示；继续使用即视为接受更新后的协议。'
        ]
      }
    ]
  },
  privacy: {
    title: '隐私政策',
    updatedAt: '2026-11-05',
    sections: [
      {
        heading: '一、我们收集的信息',
        paragraphs: [
          '账号信息：微信 OpenID（用于识别账号）、昵称、头像。',
          '资料信息：性别、生日、所在城市、一句话简介，以及你主动填写的身体档案（身高、体重、运动目标、运动频次、运动水平、关注部位、旧伤描述）。',
          '内容信息：你发布的文字、图片、话题，以及点赞、收藏、关注、评论等互动记录。',
          '设备与日志：设备型号、操作系统版本、网络类型、页面访问与错误日志，用于排查问题与改进体验。'
        ]
      },
      {
        heading: '二、信息的使用',
        paragraphs: [
          '用于展示你的个人主页、生成内容推荐与课程推荐、统计内容热度。',
          '用于账号安全、异常排查、内容治理与合规审计。',
          '我们不会将你的身体档案对外公开，也不会用于广告投放。'
        ]
      },
      {
        heading: '三、存储与安全',
        paragraphs: [
          '数据存储于中国境内的服务器，传输过程使用 HTTPS 加密。',
          '我们采取访问控制、最小权限、日志审计等措施保护数据；但请理解互联网环境不存在绝对安全。'
        ]
      },
      {
        heading: '四、共享与披露',
        paragraphs: [
          '除以下情形外，我们不会向第三方共享你的个人信息：获得你的明确同意；法律法规要求；为维护平台与用户重大合法权益所必需。',
          '我们不会出售你的个人信息。'
        ]
      },
      {
        heading: '五、你的权利',
        paragraphs: [
          '你可以随时在「我的—个人信息 / 身体档案」查看与修改你的资料。',
          '你可以删除自己发布的内容与评论。',
          '如需注销账号或导出数据，可通过「我的—设置—意见反馈」联系我们，我们将在 15 个工作日内处理。'
        ]
      },
      {
        heading: '六、联系我们',
        paragraphs: [
          '如对本政策有疑问，可通过「我的—设置—意见反馈」联系。我们会在收到后尽快回复。'
        ]
      }
    ]
  },
  about: {
    title: '关于我们',
    updatedAt: '2026-11-05',
    sections: [
      {
        heading: '健衡运动社区',
        paragraphs: [
          '智能康复 · 科学运动 · 健康生活。',
          '我们希望把专业的运动恢复知识、可执行的训练课程与可靠的康复装备，放到同一个地方，让每一次运动的疲惫都有处安放。'
        ]
      },
      {
        heading: '版本信息',
        paragraphs: ['当前版本：1.0.0', '更新日期：2026-11-05']
      },
      {
        heading: '联系我们',
        paragraphs: ['商务与合作：bd@jianheng.example.com', '问题反馈：「我的—设置—意见反馈」']
      }
    ]
  }
}

Page({
  data: {
    type: 'agreement',
    title: '用户协议',
    updatedAt: '',
    sections: []
  },

  onLoad(options) {
    const type = (options && options.type) || 'agreement'
    const item = CONTENT[type] || CONTENT.agreement
    this.setData({
      type: CONTENT[type] ? type : 'agreement',
      title: item.title,
      updatedAt: item.updatedAt,
      sections: item.sections
    })
    if (wx.setNavigationBarTitle) {
      wx.setNavigationBarTitle({ title: item.title })
    }
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 })
    } else {
      wx.switchTab({ url: ROUTES.community })
    }
  }
})
