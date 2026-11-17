/** 全局轻提示 / 对话框（对应 C18 Toast、C19 Dialog，页面需引入对应组件） */
function currentPage() {
  const pages = getCurrentPages()
  return pages.length ? pages[pages.length - 1] : null
}

let toastTimer = null

function toast(text, duration) {
  const page = currentPage()
  if (!page || !page.setData) return
  if (toastTimer) clearTimeout(toastTimer)
  page.setData({ toast: { show: true, text: text || '' } })
  toastTimer = setTimeout(() => {
    toastTimer = null
    const p = currentPage()
    if (p && p.setData) p.setData({ 'toast.show': false })
  }, duration || 1500)
}

function hideToast() {
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = null
  const page = currentPage()
  if (page && page.setData) page.setData({ 'toast.show': false })
}

function dialog(opts) {
  const page = currentPage()
  if (!page || !page.setData) return
  page.setData({
    dialog: Object.assign(
      {
        show: true,
        type: '',
        title: '',
        content: '',
        confirmText: '确定',
        cancelText: '取消',
        danger: false
      },
      opts || {}
    )
  })
}

function closeDialog() {
  const page = currentPage()
  if (page && page.setData) page.setData({ 'dialog.show': false })
}

module.exports = { currentPage, toast, hideToast, dialog, closeDialog }
