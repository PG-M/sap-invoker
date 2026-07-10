// 浏览器端文件下载 / 命名小工具（无依赖）。
// 把一个对象序列化成 JSON 触发浏览器下载，用于「下载调用记录分享给别人」等场景。
export function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// 生成带时间戳的文件名（避免 Windows 文件名非法字符，用下划线不用冒号）
export function timestampName(prefix, ext = 'json') {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `${prefix}-${stamp}.${ext}`
}
