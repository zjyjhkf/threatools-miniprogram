/** 选图 + 压缩（06 第 9 节） */
const MAX_SIZE = 5 * 1024 * 1024

function chooseImages(count) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: count,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: res => resolve(res.tempFiles || []),
      fail: err => reject(err)
    })
  })
}

function compress(src) {
  return new Promise(resolve => {
    wx.compressImage({
      src,
      quality: 80,
      success: res => resolve(res.tempFilePath),
      fail: () => resolve(src)
    })
  })
}

/** 返回可用的本地临时路径数组；超限抛 OVERSIZE */
async function pickAndCompress(max) {
  const files = await chooseImages(max)
  const oversize = files.filter(f => f.size > MAX_SIZE)
  if (oversize.length) {
    const err = new Error('OVERSIZE')
    err.code = 'OVERSIZE'
    throw err
  }
  const list = []
  for (let i = 0; i < files.length; i++) {
    const p = await compress(files[i].tempFilePath)
    list.push(p)
  }
  return list
}

function previewImages(urls, current) {
  if (!urls || !urls.length) return
  wx.previewImage({ urls, current: current || urls[0] })
}

module.exports = { chooseImages, compress, pickAndCompress, previewImages, MAX_SIZE }
