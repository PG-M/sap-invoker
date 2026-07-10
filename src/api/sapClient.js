// SAP 接口调用层：地址拼接、认证头、获取元数据、提交调用。与 UI 无关的纯网络逻辑。
// 环境地址、元数据服务名等来自 ../config，改配置不用动这里。
import { ENVIRONMENTS, SAP } from '../config'

// 拼接调用地址：baseUrl 已带 ? 参数时用 &，否则用 ? 起头，避免 zpub_api&action=… 的错误
export function buildActionUrl(baseUrl, action) {
  const sep = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${sep}action=${encodeURIComponent(action)}`
}

// Basic 认证头（未填用户名则不带 Authorization）
function authHeaders(username, password) {
  const headers = { 'Content-Type': 'application/json' }
  if (username) headers['Authorization'] = 'Basic ' + btoa(`${username}:${password}`)
  return headers
}

// 取环境配置，地址未配置直接抛错（调用方 catch 后提示）
function requireEnv(env) {
  const envCfg = ENVIRONMENTS[env]
  if (!envCfg?.url) throw new Error(`【${envCfg?.label || env}】环境地址未配置`)
  return envCfg
}

// 获取元数据：返回后端「中性元数据」对象（未转 Schema）。失败抛 Error，message 含原因。
export async function fetchMetadata({ env, username, password, funcName }) {
  const envCfg = requireEnv(env)
  const url = buildActionUrl(envCfg.url, SAP.metadataAction)
  const resp = await fetch(url, {
    method: 'POST',
    headers: authHeaders(username, password),
    // 后端服务的入参名如与此不同，改 config 里的 SAP.metadataFuncKey 即可
    body: JSON.stringify({ [SAP.metadataFuncKey]: funcName }),
  })
  const raw = await resp.text()
  if (!resp.ok) throw new Error(`接口返回 HTTP ${resp.status}：${raw}`)
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('返回内容不是合法 JSON：' + raw)
  }
}

// 提交调用：payload 为已剥离内部 key 的 FM 入参。返回 { ok, status, body }（body 尽量格式化 JSON）。
export async function submitCall({ env, username, password, action, payload }) {
  const envCfg = requireEnv(env)
  const url = buildActionUrl(envCfg.url, action)
  const resp = await fetch(url, {
    method: 'POST',
    headers: authHeaders(username, password),
    body: JSON.stringify(payload),
  })
  const raw = await resp.text()
  let body = raw
  try { body = JSON.stringify(JSON.parse(raw), null, 2) } catch { /* 非 JSON，原样展示 */ }
  return { ok: resp.ok, status: resp.status, body }
}
