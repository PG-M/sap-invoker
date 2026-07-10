// 字段显隐配置的纯逻辑层（无 React 依赖，便于单测）。
//
// 与 metadataToSchema.js 产出的 schema 形状严格对齐：
//   叶子字段  { 'x-decorator':'FormItem', 'x-component': Input/Select/DatePicker/NumberPicker/BoolCheckbox/... }
//   结构      { type:'object', 'x-component':'FormLayout', properties:{...} }
//   ArrayTable{ type:'array', 'x-component':'ArrayTable',
//               items:{ properties:{ c_<key>:{ 'x-component':'ArrayTable.Column', properties:{ [key]: 叶子 } }, c_remove } },
//               properties:{ add } }
//   ArrayCollapse { type:'array','x-component':'ArrayCollapse',
//               items:{ properties:{ c_index, ...字段, c_remove } }, properties:{ add } }
//
// 配置对象（config）：嵌套树，镜像字段 key。叶子 = 布尔，false=隐藏；缺省/true=显示。
// 只存被隐藏的叶子（false），所以「缺失 key = 显示」——别人分享的方案套到不同 schema
// 上，未知字段安全无视，永不报错。分组用对象表示；手写 JSON 时 "GROUP": false 也支持整组隐藏。

// ArrayTable/ArrayCollapse 里的结构性 key，非业务字段，遍历时一律跳过
const SKIP_KEYS = new Set(['add', 'c_remove', 'c_index', 'remove'])

// 结构容器：新布局用 Block，旧 schema（调用记录里恢复的）用 FormLayout，两者都认
const isStructure = (s) => s && s.type === 'object' && (s['x-component'] === 'Block' || s['x-component'] === 'FormLayout')
const isArrayTable = (s) => s && s['x-component'] === 'ArrayTable'
const isArrayCollapse = (s) => s && s['x-component'] === 'ArrayCollapse'
const isColumnWrapper = (s) => s && s['x-component'] === 'ArrayTable.Column'
const isContainer = (s) => isStructure(s) || isArrayTable(s) || isArrayCollapse(s)

// 容器的「子字段集合」：结构取 properties，数组取 items.properties
function getChildProps(node) {
  if (isStructure(node)) return node.properties || {}
  if (isArrayTable(node) || isArrayCollapse(node)) return node.items?.properties || {}
  return null
}

// 取一组 properties 里第一个非跳过项（用于从 c_<key> 包装里掏出内层字段）
function firstNonSkipEntry(props) {
  if (!props) return null
  for (const [k, v] of Object.entries(props)) {
    if (SKIP_KEYS.has(k)) continue
    return [k, v]
  }
  return null
}

// 结构化深拷贝（schema 是纯 JSON），兼容无 structuredClone 的环境
function deepClone(o) {
  try {
    return structuredClone(o)
  } catch {
    return JSON.parse(JSON.stringify(o))
  }
}

// 递归剥离 Formily 内部字段（如数组项的 __DO_NOT_USE_THIS_PROPERTY_index__）。
// SAP 字段名一律大写、单下划线，绝不会以「__」开头，故按双下划线前缀过滤是安全的。
export function stripInternalKeys(value) {
  if (Array.isArray(value)) return value.map(stripInternalKeys)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('__')) continue
      out[k] = stripInternalKeys(v)
    }
    return out
  }
  return value
}

// ---- 1) 生成 antd Tree 的 treeData + 全部叶子路径 ----
// 节点 key = 点路径（IS_HEADDATA.IND_SECTOR、IT_ITEMS.MATNR）；分组为父节点、字段为叶子。
export function buildTreeData(applied) {
  const allLeafKeys = []

  function walk(properties, prefix) {
    const nodes = []
    for (const [rawKey, rawNode] of Object.entries(properties || {})) {
      if (SKIP_KEYS.has(rawKey)) continue

      // ArrayTable 列：掏出内层字段，标题取包装节点的 title
      let key = rawKey
      let node = rawNode
      let title
      if (isColumnWrapper(rawNode)) {
        const inner = firstNonSkipEntry(rawNode.properties)
        if (!inner) continue
        key = inner[0]
        node = inner[1]
        title = rawNode['x-component-props']?.title
      }

      const path = prefix ? `${prefix}.${key}` : key
      // 树上显示「技术名（中文）」，如 PLANT（工厂）；没有中文或中文与技术名相同时只显示技术名
      const cn = title || node.title
      const label = cn && cn !== key ? `${key}（${cn}）` : key

      if (isContainer(node)) {
        nodes.push({ key: path, title: label, children: walk(getChildProps(node), path) })
      } else {
        allLeafKeys.push(path)
        nodes.push({ key: path, title: label })
      }
    }
    return nodes
  }

  const treeData = walk(applied?.properties || {}, '')
  return { treeData, allLeafKeys }
}

// ---- 2) 把 config 应用到 schema，产出注入了 x-display 的渲染用 schema ----
// 隐藏用 x-display:'hidden'（保留 form.values，被隐藏字段仍照常提交）。
// ArrayTable 列必须打在 void 列包装节点上（对所有行含新增行生效）。
export function applyVisibility(applied, config) {
  // 没有任何隐藏项时（config 为空 = 全部显示），schema 不会有改动，直接返回原对象、
  // 省掉整份 schema 的深拷贝（大表单可省几毫秒且不产生垃圾）。renderSchema 只读不改，安全。
  if (!config || Object.keys(config).length === 0) return applied
  const clone = deepClone(applied)
  applyToProps(clone.properties || {}, config || {})
  return clone
}

function subConfig(config, key) {
  const v = config?.[key]
  return v && typeof v === 'object' ? v : {}
}

// 返回该层是否「还有可见字段」——供上层判断：容器内全部隐藏时，连容器（含标题/外框）
// 一起隐藏，并逐层向上冒泡。
function applyToProps(properties, config) {
  let anyVisible = false
  for (const [rawKey, node] of Object.entries(properties)) {
    if (SKIP_KEYS.has(rawKey)) continue

    // ArrayTable 列包装
    if (isColumnWrapper(node)) {
      const inner = firstNonSkipEntry(node.properties)
      if (!inner) continue
      const [ikey, inode] = inner
      if (isContainer(inode)) {
        // 列里套容器：容器全隐则连列一起隐藏
        const childVisible = config[ikey] === false ? false : applyToProps(getChildProps(inode), subConfig(config, ikey))
        if (!childVisible) node['x-display'] = 'hidden'
        else anyVisible = true
      } else if (config[ikey] === false) {
        node['x-display'] = 'hidden' // 打在包装节点上 → 整列隐藏
      } else {
        anyVisible = true
      }
      continue
    }

    if (isContainer(node)) {
      // 容器：显式整组隐藏，或子字段全隐 → 隐藏整个容器（标题/外框/新增按钮一并消失）
      const childVisible = config[rawKey] === false ? false : applyToProps(getChildProps(node), subConfig(config, rawKey))
      if (!childVisible) node['x-display'] = 'hidden'
      else anyVisible = true
    } else if (config[rawKey] === false) {
      node['x-display'] = 'hidden'
    } else {
      anyVisible = true
    }
  }
  return anyVisible
}

// ---- 3) config → Tree 受控 checkedKeys（可见的叶子）----
export function configToCheckedKeys(config, allLeafKeys) {
  return allLeafKeys.filter((path) => isLeafVisible(config, path))
}

function isLeafVisible(config, path) {
  const parts = path.split('.')
  let cur = config
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return true
    cur = cur[part]
  }
  return cur !== false // false=隐藏；true/对象/undefined=显示
}

// ---- 4) Tree checkedKeys → config（只记录被隐藏的叶子）----
export function checkedKeysToConfig(checkedLeafKeys, allLeafKeys) {
  const checked = new Set(checkedLeafKeys)
  const config = {}
  for (const path of allLeafKeys) {
    if (checked.has(path)) continue // 可见 → 不记录（缺省即显示）
    setNested(config, path, false)
  }
  return config
}

function setNested(obj, path, value) {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {}
    cur = cur[p]
  }
  cur[parts[parts.length - 1]] = value
}

// ---- 5) 空值判断（含 0 和占位日期，按需求约定）----
export function isEmptyValue(v) {
  if (v === '' || v === null || v === undefined) return true
  if (v === 0) return true
  if (v === '0000-00-00' || v === '00000000') return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v).length === 0
  return false
}

// ---- 6) 隐藏空值：按当前表单值快照，生成「空字段隐藏」的 config ----
// 表格列聚合规则：无行 → 视为空隐藏；有行 → 该列在每一行都空才隐藏。
export function hideEmptyValues(rawValues, applied) {
  const values = stripInternalKeys(rawValues || {})
  const config = {}
  walkEmpties(applied?.properties || {}, values, config)
  return config
}

function walkEmpties(properties, values, config) {
  for (const [rawKey, node] of Object.entries(properties)) {
    if (SKIP_KEYS.has(rawKey)) continue

    if (isStructure(node)) {
      const sub = values && typeof values[rawKey] === 'object' && !Array.isArray(values[rawKey]) ? values[rawKey] : {}
      const subCfg = {}
      walkEmpties(node.properties || {}, sub, subCfg)
      if (Object.keys(subCfg).length) config[rawKey] = subCfg
      continue
    }

    if (isArrayTable(node)) {
      const rows = Array.isArray(values?.[rawKey]) ? values[rawKey] : []
      const subCfg = {}
      for (const [ck, cwrap] of Object.entries(node.items?.properties || {})) {
        if (SKIP_KEYS.has(ck) || !isColumnWrapper(cwrap)) continue
        const inner = firstNonSkipEntry(cwrap.properties)
        if (!inner) continue
        const ikey = inner[0]
        const empty = rows.length === 0 ? true : rows.every((r) => isEmptyValue(r?.[ikey]))
        if (empty) subCfg[ikey] = false
      }
      if (Object.keys(subCfg).length) config[rawKey] = subCfg
      continue
    }

    if (isArrayCollapse(node)) {
      const rows = Array.isArray(values?.[rawKey]) ? values[rawKey] : []
      const subCfg = {}
      for (const [fk, fnode] of Object.entries(node.items?.properties || {})) {
        if (SKIP_KEYS.has(fk) || isContainer(fnode)) continue // 折叠面板里的嵌套容器 v1 不聚合
        const empty = rows.length === 0 ? true : rows.every((r) => isEmptyValue(r?.[fk]))
        if (empty) subCfg[fk] = false
      }
      if (Object.keys(subCfg).length) config[rawKey] = subCfg
      continue
    }

    // 叶子
    if (isEmptyValue(values?.[rawKey])) config[rawKey] = false
  }
}
