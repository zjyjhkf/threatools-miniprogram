const api = require('../../../services/api')
const auth = require('../../../services/auth')
const mixin = require('../../../utils/page-mixin')
const ui = require('../../../utils/ui')
const { validate, messageOf } = require('../../../utils/validate')
const { GOALS, FREQUENCY, LEVELS, FOCUS_PARTS } = require('../../../config/constants')

Page(
  Object.assign({}, mixin.mixin, {
    data: Object.assign(mixin.baseData(), {
      height: '',
      weight: '',
      goals: [],
      frequency: '',
      level: '',
      focusParts: [],
      injuries: '',
      allowPublic: false,
      goalOptions: GOALS,
      frequencyOptions: FREQUENCY,
      levelOptions: LEVELS,
      partOptions: FOCUS_PARTS,
      frequencyLabel: '未选择',
      levelLabel: '未选择',
      frequencyShow: false,
      levelShow: false,
      errors: {},
      saving: false,
      dirty: false,
      status: 'loading'
    }),

    onLoad() {
      api
        .getBodyProfile()
        .then(b => {
          const data = {
            height: b.height ? String(b.height) : '',
            weight: b.weight ? String(b.weight) : '',
            goals: b.goals || [],
            frequency: b.frequency || '',
            level: b.level || '',
            focusParts: b.focusParts || [],
            injuries: b.injuries || '',
            allowPublic: !!b.allowPublic
          }
          this._origin = JSON.parse(JSON.stringify(data))
          this.setData(data)
          this.setData({
            frequencyLabel: this.labelOf(FREQUENCY, data.frequency),
            levelLabel: this.labelOf(LEVELS, data.level),
            status: 'ok'
          })
        })
        .catch(() => this.setData({ status: 'error' }))
    },

    labelOf(list, value) {
      const hit = list.filter(i => i.value === value)[0]
      return hit ? hit.label : '未选择'
    },

    onHeight(e) {
      this.setData({ height: e.detail.value, dirty: true, 'errors.height': '' })
    },
    onWeight(e) {
      this.setData({ weight: e.detail.value, dirty: true, 'errors.weight': '' })
    },
    onGoals(e) {
      this.setData({ goals: e.detail.value, dirty: true, 'errors.goals': '' })
    },
    onParts(e) {
      const parts = e.detail.value
      if (parts.length > 5) {
        ui.toast('最多选择 5 个部位')
        return
      }
      this.setData({ focusParts: parts, dirty: true })
    },
    onInjuries(e) {
      this.setData({ injuries: e.detail.value, dirty: true })
    },
    onPublic(e) {
      this.setData({ allowPublic: e.detail.value, dirty: true })
    },

    openFrequency() {
      this.setData({ frequencyShow: true })
    },
    closeFrequency() {
      this.setData({ frequencyShow: false })
    },
    pickFrequency(e) {
      this.setData({
        frequency: e.detail.value,
        frequencyLabel: this.labelOf(FREQUENCY, e.detail.value),
        frequencyShow: false,
        dirty: true
      })
    },

    openLevel() {
      this.setData({ levelShow: true })
    },
    closeLevel() {
      this.setData({ levelShow: false })
    },
    pickLevel(e) {
      this.setData({
        level: e.detail.value,
        levelLabel: this.labelOf(LEVELS, e.detail.value),
        levelShow: false,
        dirty: true
      })
    },

    save() {
      if (this.data.saving) return
      const d = this.data
      const errors = {}
      if (!validate('height', d.height)) errors.height = messageOf('height')
      if (!validate('weight', d.weight)) errors.weight = messageOf('weight')
      if (!validate('goals', d.goals)) errors.goals = messageOf('goals')
      if (!validate('injuries', d.injuries)) errors.injuries = messageOf('injuries')

      if (Object.keys(errors).length) {
        this.setData({ errors: errors })
        ui.toast('请检查填写内容')
        return
      }

      this.setData({ saving: true })
      api
        .saveBodyProfile({
          height: Number(d.height),
          weight: Number(d.weight),
          goals: d.goals,
          frequency: d.frequency,
          level: d.level,
          focusParts: d.focusParts,
          injuries: d.injuries,
          allowPublic: d.allowPublic
        })
        .then(res => {
          auth.setCompleteness(res.completeness)
          this.setData({ saving: false, dirty: false })
          ui.toast('身体档案已保存')
          setTimeout(() => this.back(), 700)
        })
        .catch(() => {
          this.setData({ saving: false })
          ui.toast('保存失败，请重试')
        })
    },

    onBack() {
      if (!this.data.dirty) {
        this.back()
        return
      }
      this.setData({
        dialog: {
          show: true,
          type: 'discardBody',
          title: '放弃修改？',
          content: '身体档案尚未保存',
          confirmText: '放弃',
          cancelText: '继续编辑',
          danger: true
        }
      })
    },

    onDialogOk() {
      if (this.data.dialog.type === 'discardBody') this.back()
    },

    onRetry() {
      this.setData({ status: 'loading' })
      this.onLoad()
    }
  })
)
