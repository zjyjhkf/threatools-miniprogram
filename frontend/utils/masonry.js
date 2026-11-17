/**
 * D01 双列瀑布流布局（05 §4.7）
 * 列宽 343、信息区固定 150、封面高度 clamp 320–560，缺尺寸按 4:3。
 * 高度计算只在这里实现一次，C23 与页面分发共用。
 */
const COL_W = 343
const INFO_H = 150
const MIN_COVER_H = 320
const MAX_COVER_H = 560

function coverHeight(cover) {
  const w = (cover && cover.width) || 0
  const h = (cover && cover.height) || 0
  if (!w || !h) return Math.round((COL_W * 3) / 4)
  return Math.min(MAX_COVER_H, Math.max(MIN_COVER_H, Math.round((COL_W * h) / w)))
}

function tileHeight(post) {
  return coverHeight((post && post.cover) || {}) + INFO_H
}

/**
 * 把新帖子逐条放进当前较矮的一列。
 * 追加分页时只在已有列高上继续累加，已渲染的卡片不会跳列。
 */
function fillColumns(left, right, leftH, rightH, posts) {
  const cols = [(left || []).slice(), (right || []).slice()]
  const heights = [leftH || 0, rightH || 0]
  ;(posts || []).forEach(post => {
    const index = heights[0] <= heights[1] ? 0 : 1
    cols[index].push(post)
    heights[index] += tileHeight(post)
  })
  return { left: cols[0], right: cols[1], leftH: heights[0], rightH: heights[1] }
}

module.exports = { COL_W, INFO_H, coverHeight, tileHeight, fillColumns }
