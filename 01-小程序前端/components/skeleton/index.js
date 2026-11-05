Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    type: { type: String, value: 'card' },
    count: { type: Number, value: 3 }
  },
  data: { list: [] },
  observers: {
    count(n) {
      this.setData({ list: new Array(Number(n) || 1).fill(0) })
    }
  },
  attached() {
    this.setData({ list: new Array(this.data.count || 1).fill(0) })
  }
})
