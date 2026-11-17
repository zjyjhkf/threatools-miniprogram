/** 骨架屏占位高度：waterfall 变体按设计稿示例 430 / 340 / 520 / 380 错落 */
const WATERFALL_HEIGHTS = [430, 340, 520, 380]

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    type: { type: String, value: 'card' },
    count: { type: Number, value: 3 },
    /** waterfall 变体的取模偏移，便于两列错落 */
    offset: { type: Number, value: 0 }
  },
  data: { list: [], heights: WATERFALL_HEIGHTS },
  observers: {
    count() {
      this.build()
    },
    offset() {
      this.build()
    }
  },
  attached() {
    this.build()
  },
  methods: {
    build() {
      const size = Number(this.data.count) || 1
      this.setData({ list: new Array(size).fill(0) })
    }
  }
})
