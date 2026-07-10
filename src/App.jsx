import React, { useMemo, useState, useRef, useDeferredValue } from 'react'
import { createForm } from '@formily/core'
import { createSchemaField, FormProvider } from '@formily/react'
import {
  FormItem, Input, Select, DatePicker, NumberPicker, Checkbox,
  ArrayTable, ArrayCollapse, FormLayout,
} from '@formily/antd-v5'
import { ConfigProvider, message, Alert, Modal, Button, Space, List, Tag, Tree, Select as AntSelect, Input as AntInput, Checkbox as AntCheckbox } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import 'antd/dist/reset.css'
import { metadataToSchema } from './metadataToSchema'
import { WidthItem, Block } from './layout'
import {
  stripInternalKeys, buildTreeData, applyVisibility,
  configToCheckedKeys, checkedKeysToConfig, hideEmptyValues,
} from './visibility'

// SAP 布尔标志位（CHAR1 X/空）用勾选框：field 值直接是 'X'/''，勾=checkedValue、
// 不勾=uncheckedValue，所以提交/回填/记录全程都是 'X'/''，无需别处做布尔↔字符转换。
const BoolCheckbox = ({ value, onChange, checkedValue = 'X', uncheckedValue = '', ...rest }) => (
  <AntCheckbox
    checked={value === checkedValue}
    onChange={(e) => onChange?.(e.target.checked ? checkedValue : uncheckedValue)}
    {...rest}
  />
)

// 1) 注册可用组件：JSON Schema 里的 x-component 只能引用这里注册过的名字
const SchemaField = createSchemaField({
  components: {
    FormItem,
    Input,
    Select,
    DatePicker,
    NumberPicker,
    Checkbox,
    BoolCheckbox,
    ArrayTable,
    ArrayCollapse,
    FormLayout,
    WidthItem,
    Block,
  },
})

// 2) 表单空白起步：初始无 schema，用户通过「元数据 → 表单」获取/粘贴 Schema 后生成



// 3) 三套环境的接口地址，按运行模式自适应：
//   · 本地开发（npm run dev，import.meta.env.DEV=true）：走 vite.config.js 的开发代理
//     （/sap-dev、/sap-test）转发到不同 SAP 服务器，绕开浏览器 CORS。
//   · 打包部署到 BSP（生产构建）：前端与 SAP 同源，代理不存在，直接相对调用根目录下的
//     zpub_api（无 CORS、无需代理）。三套环境此时指向同一个同源服务，由所在 SAP 系统决定。
const ENVIRONMENTS = import.meta.env.DEV
  ? {
      dev:  { label: '开发', url: '/sap-dev/zpub_api?sap-client=300' },
      test: { label: '测试', url: '/sap-test/zpub_api?sap-client=700' },
      prod: { label: '生产', url: '' }, // 本地开发下暂不可用，提交会拦截提示
    }
  : {
      dev:  { label: '开发', url: '/zpub_api' },
      test: { label: '测试', url: '/zpub_api' },
      prod: { label: '生产', url: '/zpub_api' },
    }

// 拼接调用地址：baseUrl 已带 ? 参数时用 &，否则用 ? 起头，避免 zpub_api&action=… 的错误
function buildActionUrl(baseUrl, action) {
  const sep = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${sep}action=${encodeURIComponent(action)}`
}

// 返回元数据的服务 action，固定值（不对用户开放修改）
const METADATA_ACTION = 'ZTEST_FUNCTION_VALUE_DATA'

// 递归剥离 Formily 内部字段的 stripInternalKeys 已移至 ./visibility 复用

// 4) 调用记录：用 localStorage 持久化最近 100 次，刷新/关页也不丢
const HISTORY_KEY = 'formily-demo:call-history'
const HISTORY_LIMIT = 100

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [] } catch { return [] }
}
function saveHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)) } catch { /* 超配额等，忽略 */ }
}

// 调用记录里的 schema（大表单可达数百 KB）在池里去重存一份，记录只存引用 schemaId：
// 同一个 FM 反复提交不会把整份 schema 复制进每条记录，避免 localStorage 膨胀/超配额。
const SCHEMA_POOL_KEY = 'formily-demo:schema-pool'

function loadSchemaPool() {
  try { return JSON.parse(localStorage.getItem(SCHEMA_POOL_KEY)) || {} } catch { return {} }
}
function saveSchemaPool(pool) {
  try { localStorage.setItem(SCHEMA_POOL_KEY, JSON.stringify(pool)) } catch { /* 忽略 */ }
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

// 5) 显隐配置方案：同样用 localStorage 持久化，结构与调用记录一致
const VIS_PROFILE_KEY = 'formily-demo:visibility-profiles'
const VIS_PROFILE_LIMIT = 100

function loadProfiles() {
  try { return JSON.parse(localStorage.getItem(VIS_PROFILE_KEY)) || [] } catch { return [] }
}
function saveProfiles(list) {
  try { localStorage.setItem(VIS_PROFILE_KEY, JSON.stringify(list)) } catch { /* 忽略 */ }
}

export default function App() {
  const [applied, setApplied] = useState({ type: 'object', properties: {} })

  // 数据回填相关
  const [dataOpen, setDataOpen] = useState(false)
  const [dataText, setDataText] = useState('')
  const [dataError, setDataError] = useState('')

  // 元数据 → Schema 相关
  const [metaOpen, setMetaOpen] = useState(false)
  const [metaText, setMetaText] = useState('') // 文本框内容 = Formily Schema（粘贴或由获取元数据转换而来）
  const [metaError, setMetaError] = useState('')
  // 从接口获取元数据相关
  const [metaFuncName, setMetaFuncName] = useState('Z_SRM_CREATE_PO') // 目标 FM 函数名
  const [metaLoading, setMetaLoading] = useState(false)

  // 接口调用相关
  const [env, setEnv] = useState('dev')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [result, setResult] = useState(null)     // { ok, status, body }
  const [resultOpen, setResultOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false) // 提交按钮 loading

  // 调用记录
  const [history, setHistory] = useState(loadHistory)
  const [historyOpen, setHistoryOpen] = useState(false)

  // 字段显隐配置
  const [visOpen, setVisOpen] = useState(false)
  const [config, setConfig] = useState({})          // 显隐配置：只记录被隐藏的叶子
  const [visView, setVisView] = useState('tree')    // 'tree' | 'json'
  const [visJsonText, setVisJsonText] = useState('') // JSON 视图文本
  const [visJsonError, setVisJsonError] = useState('')
  const [profiles, setProfiles] = useState(loadProfiles) // 已存配置方案
  const [profileOpen, setProfileOpen] = useState(false)

  // 调用记录里 schema 去重存储的池（不参与渲染，用 ref）
  const schemaPoolRef = useRef(loadSchemaPool())

  // 显隐配置的「重活」（重建/重渲染表单）用 deferred 值驱动 —— 勾选框即时更新 config，
  // React 把昂贵的表单重渲染延后为非阻塞任务，大表单切显隐时勾选不卡（不改显隐机制本身）。
  const deferredConfig = useDeferredValue(config)

  // 重建 form 的时机：schema(applied) 变、或显隐配置(deferredConfig) 变。
  // Formily 的字段模型按路径缓存复用，改 schema 的 x-display 后已挂载字段不会重读 display，
  // 所以显隐必须靠重建 form 才能落到普通字段上。重建时初始值优先级：
  //   1) 恢复调用记录 → 直接灌入记录里的值（避免空渲染+reset+再渲染的两遍开销）
  //   2) 仅切显隐（schema 未变）→ 继承当前已填值，避免丢数据
  //   3) 换了 schema → 空表单
  const formRef = useRef(null)
  const appliedRef = useRef(applied)
  const pendingRestoreRef = useRef(null) // 恢复调用记录时暂存要灌入的值
  const form = useMemo(() => {
    let values
    if (pendingRestoreRef.current) {
      values = pendingRestoreRef.current
      pendingRestoreRef.current = null
    } else if (appliedRef.current === applied && formRef.current) {
      values = stripInternalKeys(formRef.current.values || {})
    }
    appliedRef.current = applied
    const f = createForm(values ? { values } : undefined)
    formRef.current = f
    return f
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, deferredConfig])

  // 显隐派生：把 config 注入 applied 得到渲染用 schema（用 deferred 值，重渲染非阻塞）
  const renderSchema = useMemo(() => applyVisibility(applied, deferredConfig), [applied, deferredConfig])
  const { treeData, allLeafKeys } = useMemo(() => buildTreeData(applied), [applied])
  // 勾选树用即时 config（保证勾选框响应），故此处不用 deferred
  const checkedKeys = useMemo(() => configToCheckedKeys(config, allLeafKeys), [config, allLeafKeys])

  // 打开数据回填弹窗，预填当前表单已有的值
  const openDataFill = () => {
    setDataText(JSON.stringify(stripInternalKeys(form.values ?? {}), null, 2))
    setDataError('')
    setDataOpen(true)
  }

  // 文本框内容就是 Formily Schema，直接生成表单（不做元数据转换/识别）
  const handleGenFromMeta = () => {
    try {
      const schema = JSON.parse(metaText)
      setApplied(schema)
      setConfig({}) // 新表单从「全部显示」起步，不继承上一个 schema 的显隐配置
      setMetaError('')
      setMetaOpen(false)
      message.success('已生成表单')
    } catch (e) {
      setMetaError('JSON 解析失败：' + e.message)
    }
  }

  // 调 SAP 接口获取元数据，填进文本框（复用当前环境 + 账号密码）
  const fetchMetadata = async () => {
    const envCfg = ENVIRONMENTS[env]
    if (!envCfg.url) { message.error(`【${envCfg.label}】环境地址未配置`); return }
    if (!metaFuncName.trim()) { message.error('请填写目标函数名'); return }

    const url = buildActionUrl(envCfg.url, METADATA_ACTION)
    const headers = { 'Content-Type': 'application/json' }
    if (username) headers['Authorization'] = 'Basic ' + btoa(`${username}:${password}`)

    setMetaLoading(true)
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        // 后端服务的入参名如与此不同，改这里的 key 即可
        body: JSON.stringify({ func_name: metaFuncName.trim() }),
      })
      const raw = await resp.text()
      if (!resp.ok) {
        setMetaError(`接口返回 HTTP ${resp.status}：${raw}`)
        return
      }
      let meta
      try {
        meta = JSON.parse(raw)
      } catch {
        setMetaError('返回内容不是合法 JSON：' + raw)
        return
      }
      // 拉到的是「中性元数据」，转成 Formily Schema 再填进文本框（文本框里始终是 schema）
      let schema
      try {
        schema = metadataToSchema(meta)
      } catch (e) {
        setMetaError('元数据转换 Schema 失败：' + e.message)
        return
      }
      setMetaText(JSON.stringify(schema, null, 2))
      setMetaError('')
      message.success('已获取并转换为 Schema，点「生成表单 ▶」即可渲染')
    } catch (e) {
      setMetaError('请求失败（可能是 CORS/网络）：' + e.message)
    } finally {
      setMetaLoading(false)
    }
  }

  // 把一份 values 填充进表单（「填充数据 JSON」用：填进当前已存在的表单，需先清旧值）
  const fillValues = async (values) => {
    await form.reset('*', { forceClear: true, validate: false })
    form.setValues(values)
  }

  // 追加一条调用记录，最多保留最近 HISTORY_LIMIT 条
  const pushHistory = (entry) => {
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, HISTORY_LIMIT)
      saveHistory(next)
      prunePool(next, schemaPoolRef.current) // 清掉不再被引用的 schema
      return next
    })
  }

  // 把输入的 JSON 数据填充进表单
  const handleFill = async () => {
    let parsed
    try {
      parsed = JSON.parse(dataText)
    } catch (e) {
      setDataError('JSON 解析失败：' + e.message)
      return
    }
    try {
      // 先清空旧值（含数组行），再逐键合并填充，确保已挂载字段的 UI 得到刷新
      await fillValues(parsed)
      setDataError('')
      setDataOpen(false)
      message.success('已按 JSON 填充表单')
    } catch (e) {
      setDataError('填充失败：' + e.message)
    }
  }

  // 从调用记录恢复：把值暂存到 ref，setApplied/setConfig 触发的重建会直接把值灌进新 form
  // （避免「空表单先渲染 → reset → 带值再渲染」的两遍开销）
  const restoreFromHistory = (rec) => {
    // 新记录 schema 存在池里、只留 schemaId；旧记录仍内联 rec.schema；都找不到则回退当前
    const schema = rec.schema || schemaPoolRef.current[rec.schemaId] || applied
    const hasSchema = !!(rec.schema || schemaPoolRef.current[rec.schemaId])
    pendingRestoreRef.current = rec.values || {}
    setApplied(schema)
    setConfig(rec.config || {})              // 还原当时的字段显隐（旧记录无则全部显示）
    if (rec.action) setMetaFuncName(rec.action)
    if (rec.env && ENVIRONMENTS[rec.env]) setEnv(rec.env)
    setHistoryOpen(false)
    message.success(hasSchema ? '已从记录填充（含 Schema）' : '已从记录填充（该记录无 Schema）')
  }

  const clearHistory = () => {
    setHistory([])
    saveHistory([])
    schemaPoolRef.current = {}
    saveSchemaPool({})
    message.success('已清空调用记录')
  }

  // 删除单条调用记录
  const deleteHistory = (id) => {
    setHistory((prev) => {
      const next = prev.filter((r) => r.id !== id)
      saveHistory(next)
      prunePool(next, schemaPoolRef.current)
      return next
    })
    message.success('已删除该记录')
  }

  // 校验通过后，values 就是最终要回传给 FM 的入参 JSON；这里真正调用 SAP 接口
  const handleSubmit = async (values) => {
    const envCfg = ENVIRONMENTS[env]
    if (!envCfg.url) {
      message.error(`【${envCfg.label}】环境地址未配置`)
      return
    }
    if (!metaFuncName.trim()) {
      message.error('请先在「元数据 → 表单」里填写函数名')
      return
    }

    const url = buildActionUrl(envCfg.url, metaFuncName.trim())
    const headers = { 'Content-Type': 'application/json' }
    if (username) {
      headers['Authorization'] = 'Basic ' + btoa(`${username}:${password}`)
    }

    // 剥掉 Formily 内部 key（如 __DO_NOT_USE_THIS_PROPERTY_index__），再作为 FM 入参
    const payload = stripInternalKeys(values)

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      const raw = await resp.text()
      // 尝试格式化 JSON，失败就原样展示
      let body = raw
      try { body = JSON.stringify(JSON.parse(raw), null, 2) } catch { /* 非 JSON，原样 */ }

      setResult({ ok: resp.ok, status: resp.status, body })
      setResultOpen(true)
      recordCall(payload, resp.ok, resp.status)
      if (resp.ok) message.success('调用成功')
      else message.error(`接口返回 HTTP ${resp.status}`)
    } catch (e) {
      // 网络错误 / CORS 拦截通常走这里
      setResult({ ok: false, status: '请求失败', body: String(e) })
      setResultOpen(true)
      recordCall(payload, false, '请求失败')
      message.error('请求失败：' + e.message)
    }
  }

  // 组装并保存一条调用记录（schema 去重存池、记录只留 schemaId，恢复时按引用取回）
  const recordCall = (values, ok, status) => {
    const sid = schemaId(applied)
    if (!schemaPoolRef.current[sid]) schemaPoolRef.current[sid] = applied // 池里无则存一份
    pushHistory({
      id: `${new Date().getTime()}-${history.length}`,
      time: new Date().toLocaleString('zh-CN'),
      env,
      envLabel: ENVIRONMENTS[env].label,
      action: metaFuncName.trim(),
      schemaId: sid, // 引用池里的 schema，不再内联整份
      config,        // 当时的字段显隐配置，恢复时一并还原
      values,
      ok,
      status,
    })
  }

  // 是否已有可用表单（applied 里有字段）
  const hasForm = !!(applied?.properties && Object.keys(applied.properties).length > 0)

  // 顶栏「提交」按钮：直接驱动 form.submit —— 先跑校验，通过才调 handleSubmit（真正请求）。
  // 校验不通过时 form.submit 会 reject，错误已由各字段就地标红，这里只兜住异常 + 提示。
  const doSubmit = async () => {
    setSubmitting(true)
    try {
      await form.submit(handleSubmit)
    } catch {
      message.error('表单校验未通过，请检查标红字段')
    } finally {
      setSubmitting(false)
    }
  }

  // ---- 字段显隐配置相关 ----

  // 打开配置弹窗，同步 JSON 文本 = 当前 config
  const openVisConfig = () => {
    setVisJsonText(JSON.stringify(config, null, 2))
    setVisJsonError('')
    setVisView('tree')
    setVisOpen(true)
  }

  // 统一更新 config，并把 JSON 文本同步刷新（树 → JSON 方向）
  const updateConfig = (next) => {
    setConfig(next)
    setVisJsonText(JSON.stringify(next, null, 2))
    setVisJsonError('')
  }

  // Tree 勾选变化：checkedKeys 为「可见」的 key，反推 config（只记录被隐藏叶子）
  const onTreeCheck = (keys) => {
    // checkStrictly=false 时 keys 是数组（含父节点），过滤出叶子即可
    const leafChecked = (Array.isArray(keys) ? keys : keys.checked).filter((k) => allLeafKeys.includes(k))
    updateConfig(checkedKeysToConfig(leafChecked, allLeafKeys))
  }

  // 隐藏空值：按当前表单值快照生成 config
  const applyHideEmpty = () => {
    updateConfig(hideEmptyValues(form.values, applied))
    message.success('已按当前数据隐藏空值字段')
  }

  // 应用右侧 JSON 文本（显式解析，失败提示不崩）
  const applyVisJson = () => {
    try {
      const parsed = JSON.parse(visJsonText)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setVisJsonError('配置必须是一个 JSON 对象')
        return
      }
      setConfig(parsed)
      setVisJsonError('')
      message.success('已应用 JSON 配置')
    } catch (e) {
      setVisJsonError('JSON 解析失败：' + e.message)
    }
  }

  // 保存当前配置为一份方案（接口名 + 时间），像调用记录一样
  const saveProfile = () => {
    const entry = {
      id: `${new Date().getTime()}-${profiles.length}`,
      action: metaFuncName.trim() || '(无 action)',
      time: new Date().toLocaleString('zh-CN'),
      config,
    }
    setProfiles((prev) => {
      const next = [entry, ...prev].slice(0, VIS_PROFILE_LIMIT)
      saveProfiles(next)
      return next
    })
    message.success('已保存配置方案')
  }

  const applyProfile = (rec) => {
    updateConfig(rec.config || {})
    setProfileOpen(false)
    message.success('已应用配置方案')
  }

  const deleteProfile = (id) => {
    setProfiles((prev) => {
      const next = prev.filter((r) => r.id !== id)
      saveProfiles(next)
      return next
    })
    message.success('已删除该方案')
  }

  const clearProfiles = () => {
    setProfiles([])
    saveProfiles([])
    message.success('已清空配置方案')
  }

  return (
    <ConfigProvider locale={zhCN}>
      {/* 纵向 Flex：上=固定工具栏（不随滚动），下=表单滚动区。
          用「固定头 + flex:1 滚动体」而非 position:sticky —— 头在滚动容器之外，结构上永不移动 */}
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>

        {/* ===== 置顶工具栏 ===== */}
        <div
          style={{
            flex: '0 0 auto',
            background: '#fff',
            borderBottom: '1px solid #f0f0f0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            padding: '10px 16px',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            {/* 左：标题 + 接口调用参数（环境 / 账号 / 密码 / 将调用） */}
            <Space wrap size={8}>
              <strong style={{ fontSize: 16, marginRight: 4 }}>自动生成的表单</strong>
              <span>环境：</span>
              <AntSelect
                value={env}
                onChange={setEnv}
                style={{ width: 120 }}
                options={Object.entries(ENVIRONMENTS).map(([k, v]) => ({
                  value: k,
                  label: v.url ? v.label : `${v.label}（未配置）`,
                }))}
              />
              <AntInput
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="用户名"
                style={{ width: 130 }}
              />
              <AntInput.Password
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                style={{ width: 130 }}
              />
              <span style={{ color: '#888' }}>
                将调用：{metaFuncName ? <b>{metaFuncName}</b> : '（未设置）'}
              </span>
            </Space>

            {/* 右：动作按钮 + 提交 */}
            <Space wrap size={8}>
              <Button onClick={() => setHistoryOpen(true)}>调用记录（{history.length}）</Button>
              <Button onClick={openVisConfig} disabled={!hasForm}>字段显隐</Button>
              <Button onClick={openDataFill} disabled={!hasForm}>填充数据 JSON</Button>
              <Button type="primary" onClick={() => setMetaOpen(true)}>元数据 → 表单</Button>
              <Button type="primary" danger loading={submitting} disabled={!hasForm} onClick={doSubmit}>
                提交并调用 SAP
              </Button>
            </Space>
          </div>
        </div>

        {/* ===== 表单滚动区（仅此区域随屏滚动） ===== */}
        <div style={{ flex: '1 1 auto', overflow: 'auto', padding: 16 }}>
          {!hasForm && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="尚未生成表单"
              description="点右上角「元数据 → 表单」，填函数名从接口获取，或直接粘贴 Formily Schema，再点「生成表单」。"
            />
          )}
          <FormProvider form={form}>
            <FormLayout layout="vertical">
              {/* 每个节点块（Block/结构/表）都是块级、独占整行、纵向堆叠；
                  块内字段的横向并排+换行由 Block 自身的 flex-wrap body 负责 */}
              <SchemaField schema={renderSchema} />
            </FormLayout>
          </FormProvider>
        </div>

        {/* 元数据 → 表单弹窗 */}
        <Modal
          title="获取元数据 / 粘贴 Schema → 生成表单"
          open={metaOpen}
          onCancel={() => setMetaOpen(false)}
          onOk={handleGenFromMeta}
          okText="生成表单 ▶"
          cancelText="取消"
          width={720}
          destroyOnClose
        >
          {/* 从接口获取元数据：复用主界面选的环境 + 账号密码。
              元数据服务 action 固定（METADATA_ACTION），不暴露给用户修改 */}
          <Space wrap style={{ marginBottom: 8 }}>
            <span>目标函数名：</span>
            <AntInput
              value={metaFuncName}
              onChange={(e) => setMetaFuncName(e.target.value)}
              placeholder="如 ZTEST_STR"
              style={{ width: 200 }}
            />
            <Button loading={metaLoading} onClick={fetchMetadata}>
              获取元数据（{ENVIRONMENTS[env].label}）
            </Button>
          </Space>

          <textarea
            value={metaText}
            onChange={(e) => setMetaText(e.target.value)}
            spellCheck={false}
            placeholder="在此粘贴已转换好的 Formily JSON Schema；或上面点「获取元数据」自动拉取并转换填入。可手动修改后再点「生成表单」。"
            style={{
              width: '100%', height: '55vh', fontFamily: 'Consolas, monospace',
              fontSize: 13, resize: 'vertical', border: '1px solid #eee', padding: 8,
              boxSizing: 'border-box',
            }}
          />
          {metaError && <Alert type="error" message={metaError} style={{ marginTop: 8 }} />}
        </Modal>

        {/* 数据回填弹窗 */}
        <Modal
          title="填充数据 JSON"
          open={dataOpen}
          onCancel={() => setDataOpen(false)}
          onOk={handleFill}
          okText="填充表单 ▶"
          cancelText="取消"
          width={720}
          destroyOnClose
        >
          <div style={{ marginBottom: 8, color: '#888', fontSize: 12 }}>
            输入表单字段对应的数据，如 {'{ "IV_EBELN": "4500000001", "IT_ITEMS": [{ "MATNR": "M001", "MENGE": 5 }] }'}
          </div>
          <textarea
            value={dataText}
            onChange={(e) => setDataText(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%', height: '50vh', fontFamily: 'Consolas, monospace',
              fontSize: 13, resize: 'vertical', border: '1px solid #eee', padding: 8,
              boxSizing: 'border-box',
            }}
          />
          {dataError && <Alert type="error" message={dataError} style={{ marginTop: 8 }} />}
        </Modal>

        {/* 调用记录弹窗 */}
        <Modal
          title={`调用记录（最近 ${history.length} 条，最多存 ${HISTORY_LIMIT}）`}
          open={historyOpen}
          onCancel={() => setHistoryOpen(false)}
          footer={
            <Space>
              <Button danger disabled={!history.length} onClick={clearHistory}>清空记录</Button>
              <Button onClick={() => setHistoryOpen(false)}>关闭</Button>
            </Space>
          }
          width={720}
        >
          <List
            size="small"
            locale={{ emptyText: '暂无调用记录，提交一次后会自动记录' }}
            dataSource={history}
            style={{ maxHeight: '60vh', overflow: 'auto' }}
            renderItem={(rec) => (
              <List.Item
                actions={[
                  <Button type="link" key="fill" onClick={() => restoreFromHistory(rec)}>填充</Button>,
                  <Button type="link" danger key="del" onClick={() => deleteHistory(rec.id)}>删除</Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space size={8} wrap>
                      <span>{rec.action || '(无 action)'}</span>
                      <Tag color="blue">{rec.envLabel || rec.env}</Tag>
                      <Tag color={rec.ok ? 'green' : 'red'}>{rec.ok ? '成功' : '失败'} {rec.status}</Tag>
                    </Space>
                  }
                  description={rec.time}
                />
              </List.Item>
            )}
          />
        </Modal>

        {/* 接口返回结果 */}
        <Modal
          title="接口返回"
          open={resultOpen}
          onCancel={() => setResultOpen(false)}
          footer={<Button onClick={() => setResultOpen(false)}>关闭</Button>}
          width={720}
        >
          {result && (
            <>
              <Alert
                type={result.ok ? 'success' : 'error'}
                message={`状态：${result.status}`}
                style={{ marginBottom: 8 }}
              />
              <pre
                style={{
                  maxHeight: '60vh', overflow: 'auto', background: '#f5f5f5',
                  padding: 12, borderRadius: 4, fontSize: 13,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
                }}
              >
                {result.body}
              </pre>
            </>
          )}
        </Modal>

        {/* 字段显隐配置弹窗 */}
        <Modal
          title="字段显隐配置"
          open={visOpen}
          onCancel={() => setVisOpen(false)}
          width={760}
          footer={
            <Space wrap>
              <Button onClick={applyHideEmpty}>隐藏空值（按当前数据）</Button>
              <Button onClick={() => updateConfig({})}>全部显示</Button>
              <Button onClick={() => updateConfig(checkedKeysToConfig([], allLeafKeys))}>全部隐藏</Button>
              <Button type="primary" onClick={saveProfile}>保存配置</Button>
              <Button onClick={() => setProfileOpen(true)}>配置记录（{profiles.length}）</Button>
              <Button onClick={() => setVisOpen(false)}>关闭</Button>
            </Space>
          }
        >
          <Space style={{ marginBottom: 8 }}>
            <span>视图：</span>
            <AntSelect
              value={visView}
              onChange={(v) => {
                if (v === 'json') setVisJsonText(JSON.stringify(config, null, 2))
                setVisView(v)
              }}
              style={{ width: 160 }}
              options={[
                { value: 'tree', label: '勾选表单' },
                { value: 'json', label: 'JSON（可分享）' },
              ]}
            />
            <span style={{ color: '#888', fontSize: 12 }}>勾选=显示；取消=隐藏。被隐藏字段仍照常提交。</span>
          </Space>

          {visView === 'tree' ? (
            <div style={{ maxHeight: '58vh', overflow: 'auto', border: '1px solid #eee', borderRadius: 4, padding: 8 }}>
              {treeData.length ? (
                <Tree
                  checkable
                  selectable={false}
                  defaultExpandAll
                  treeData={treeData}
                  checkedKeys={checkedKeys}
                  onCheck={onTreeCheck}
                />
              ) : (
                <span style={{ color: '#888' }}>暂无字段</span>
              )}
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 8, color: '#888', fontSize: 12 }}>
                这份 JSON 就是可分享的显隐配置：只列出被隐藏的字段（缺省即显示）。改完点「应用 JSON」。
              </div>
              <textarea
                value={visJsonText}
                onChange={(e) => setVisJsonText(e.target.value)}
                spellCheck={false}
                style={{
                  width: '100%', height: '48vh', fontFamily: 'Consolas, monospace',
                  fontSize: 13, resize: 'vertical', border: '1px solid #eee', padding: 8,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ marginTop: 8 }}>
                <Button type="primary" onClick={applyVisJson}>应用 JSON</Button>
              </div>
              {visJsonError && <Alert type="error" message={visJsonError} style={{ marginTop: 8 }} />}
            </>
          )}
        </Modal>

        {/* 配置方案记录弹窗 */}
        <Modal
          title={`配置记录（最近 ${profiles.length} 条，最多存 ${VIS_PROFILE_LIMIT}）`}
          open={profileOpen}
          onCancel={() => setProfileOpen(false)}
          footer={
            <Space>
              <Button danger disabled={!profiles.length} onClick={clearProfiles}>清空方案</Button>
              <Button onClick={() => setProfileOpen(false)}>关闭</Button>
            </Space>
          }
          width={640}
        >
          <List
            size="small"
            locale={{ emptyText: '暂无配置方案，点「保存配置」后会记录' }}
            dataSource={profiles}
            style={{ maxHeight: '60vh', overflow: 'auto' }}
            renderItem={(rec) => (
              <List.Item
                actions={[
                  <Button type="link" key="apply" onClick={() => applyProfile(rec)}>应用</Button>,
                  <Button type="link" danger key="del" onClick={() => deleteProfile(rec.id)}>删除</Button>,
                ]}
              >
                <List.Item.Meta title={rec.action} description={rec.time} />
              </List.Item>
            )}
          />
        </Modal>
      </div>
    </ConfigProvider>
  )
}
