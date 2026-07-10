// 调用记录 hook：用 localStorage 持久化最近若干次调用，刷新/关页也不丢。
// 记录里的 schema（大表单可达数百 KB）在池里去重存一份，记录只存引用 schemaId：
// 同一个 FM 反复提交不会把整份 schema 复制进每条记录，避免 localStorage 膨胀/超配额。
import { useRef, useState } from 'react'
import { STORAGE } from '../config'

const { historyKey, historyLimit, schemaPoolKey } = STORAGE

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(historyKey)) || [] } catch { return [] }
}
function saveHistory(list) {
  try { localStorage.setItem(historyKey, JSON.stringify(list)) } catch { /* 超配额等，忽略 */ }
}
function loadSchemaPool() {
  try { return JSON.parse(localStorage.getItem(schemaPoolKey)) || {} } catch { return {} }
}
function saveSchemaPool(pool) {
  try { localStorage.setItem(schemaPoolKey, JSON.stringify(pool)) } catch { /* 忽略 */ }
}

// djb2 字符串哈希；id 再拼上长度进一步降低碰撞概率
function schemaId(schema) {
  const s = JSON.stringify(schema)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return `s${h.toString(36)}_${s.length}`
}
// 清掉池里不再被任何记录引用的 schema，避免池无限增长
function prunePool(list, pool) {
  const used = new Set(list.map((r) => r.schemaId).filter(Boolean))
  for (const k of Object.keys(pool)) if (!used.has(k)) delete pool[k]
  saveSchemaPool(pool)
}

export function useCallHistory() {
  const [history, setHistory] = useState(loadHistory)
  // schema 去重池（不参与渲染，用 ref）
  const schemaPoolRef = useRef(loadSchemaPool())

  // 追加一条记录，最多保留最近 historyLimit 条，并清掉不再被引用的 schema
  const pushHistory = (entry) => {
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, historyLimit)
      saveHistory(next)
      prunePool(next, schemaPoolRef.current)
      return next
    })
  }

  // 组装并保存一条调用记录：schema 去重存池、记录只留 schemaId，恢复时按引用取回
  const recordCall = ({ applied, values, ok, status, env, envLabel, action, config }) => {
    const sid = schemaId(applied)
    if (!schemaPoolRef.current[sid]) schemaPoolRef.current[sid] = applied // 池里无则存一份
    pushHistory({
      id: `${new Date().getTime()}-${history.length}`,
      time: new Date().toLocaleString('zh-CN'),
      env,
      envLabel,
      action,
      schemaId: sid, // 引用池里的 schema，不再内联整份
      config,        // 当时的字段显隐配置，恢复时一并还原
      values,
      ok,
      status,
    })
  }

  const deleteHistory = (id) => {
    setHistory((prev) => {
      const next = prev.filter((r) => r.id !== id)
      saveHistory(next)
      prunePool(next, schemaPoolRef.current)
      return next
    })
  }

  const clearHistory = () => {
    setHistory([])
    saveHistory([])
    schemaPoolRef.current = {}
    saveSchemaPool({})
  }

  // 取记录对应的 schema：新记录从池里按 schemaId 取，旧记录仍内联 rec.schema；都无返回 null
  const getSchema = (rec) => rec.schema || schemaPoolRef.current[rec.schemaId] || null

  // 导出打包：记录 + 它们引用的 schema（只带被引用的，避免把整份池导出）。
  // 供「下载分享」用；导入方据此还原表单，不至于「该记录无 Schema」。
  // records 缺省=全部；传入子集（如 [rec]）即可只导出选中的那一条。
  const exportBundle = (records = history) => {
    const schemas = {}
    for (const r of records) {
      if (r.schemaId && schemaPoolRef.current[r.schemaId]) schemas[r.schemaId] = schemaPoolRef.current[r.schemaId]
    }
    return {
      app: 'formily-demo',
      kind: 'call-history',
      version: 1,
      exportedAt: new Date().toLocaleString('zh-CN'),
      count: records.length,
      history: records,
      schemas,
    }
  }

  // 导入合并：把分享文件里的记录并入现有记录（按 id 去重，schema 并回池，按时间倒序截断到上限）。
  // 非破坏性——已有记录不丢；返回新增条数供 UI 提示。格式不对则抛错。
  const importBundle = (data) => {
    if (!data || data.kind !== 'call-history' || !Array.isArray(data.history)) {
      throw new Error('文件格式不对（不是本工具导出的调用记录）')
    }
    const incomingSchemas = data.schemas && typeof data.schemas === 'object' ? data.schemas : {}
    const tsOf = (id) => {
      const n = parseInt(String(id).split('-')[0], 10)
      return Number.isFinite(n) ? n : 0
    }
    let added = 0
    setHistory((prev) => {
      const existingIds = new Set(prev.map((r) => r.id))
      const fresh = data.history.filter((r) => r && r.id && !existingIds.has(r.id))
      added = fresh.length
      // 并入导入的 schema（池里已有则不覆盖）
      for (const [k, v] of Object.entries(incomingSchemas)) {
        if (!schemaPoolRef.current[k]) schemaPoolRef.current[k] = v
      }
      const merged = [...fresh, ...prev]
        .sort((a, b) => tsOf(b.id) - tsOf(a.id)) // 新的在前
        .slice(0, historyLimit)
      saveHistory(merged)
      prunePool(merged, schemaPoolRef.current) // 清掉被截断/未引用的 schema
      return merged
    })
    return added
  }

  return { history, recordCall, deleteHistory, clearHistory, getSchema, exportBundle, importBundle }
}
