import React, { useState, useEffect } from 'react'
import { FormProvider } from '@formily/react'
import { FormLayout } from '@formily/antd-v5'
import {
  ConfigProvider, message, Alert, Button, Space,
  Select as AntSelect, Input as AntInput,
} from 'antd'
import zhCN from 'antd/locale/zh_CN'
import 'antd/dist/reset.css'

import { ENVIRONMENTS, SAP, STORAGE } from './config'
import { SchemaField } from './form/schemaField'
import { BlockCollapseContext } from './form/layout'
import { metadataToSchema } from './metadataToSchema'
import { stripInternalKeys, checkedKeysToConfig, hideEmptyValues } from './visibility'
import { fetchMetadata as apiFetchMetadata, submitCall } from './api/sapClient'
import { useDynamicForm } from './hooks/useDynamicForm'
import { useCallHistory } from './hooks/useCallHistory'
import { useVisibilityProfiles } from './hooks/useVisibilityProfiles'
import { downloadJson, timestampName } from './utils/file'
import MetaModal from './components/MetaModal'
import DataFillModal from './components/DataFillModal'
import HistoryModal from './components/HistoryModal'
import ResultModal from './components/ResultModal'
import VisibilityModal from './components/VisibilityModal'
import ProfileModal from './components/ProfileModal'

export default function App() {
  // 表单生命周期（schema / 显隐 / form 重建 / 派生数据）集中在此 hook
  const {
    applied, config, setConfig,
    form, renderSchema, treeData, allLeafKeys, checkedKeys,
    applySchema, restore,
  } = useDynamicForm()

  // 调用记录 & 显隐方案两套持久化
  const { history, recordCall, deleteHistory, clearHistory, getSchema, exportBundle, importBundle } = useCallHistory()
  const { profiles, saveProfile, deleteProfile, clearProfiles } = useVisibilityProfiles()

  // 数据回填相关
  const [dataOpen, setDataOpen] = useState(false)
  const [dataText, setDataText] = useState('')
  const [dataError, setDataError] = useState('')

  // 元数据 → Schema 相关
  const [metaOpen, setMetaOpen] = useState(false)
  const [metaText, setMetaText] = useState('') // JSON 编辑框内容 = 当前表单的 Formily Schema
  const [metaError, setMetaError] = useState('')
  const [metaShowJson, setMetaShowJson] = useState(false) // 是否展开 JSON Schema 编辑区
  const [metaFuncName, setMetaFuncName] = useState(SAP.defaultFuncName) // 目标 FM 函数名
  const [metaLoading, setMetaLoading] = useState(false)

  // 接口调用相关
  const [env, setEnv] = useState('dev')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [result, setResult] = useState(null)     // { ok, status, body }
  const [resultOpen, setResultOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 调用记录弹窗
  const [historyOpen, setHistoryOpen] = useState(false)

  // 字段显隐配置
  const [visOpen, setVisOpen] = useState(false)
  const [visView, setVisView] = useState('tree')    // 'tree' | 'json'
  const [visJsonText, setVisJsonText] = useState('') // JSON 视图文本
  const [visJsonError, setVisJsonError] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)

  // 是否已有可用表单（applied 里有字段/栅格）
  const hasForm = !!(applied?.properties && Object.keys(applied.properties).length > 0)

  // 全部展开/折叠：collapseCmd 每点一次换一个新对象广播给所有 Block；allCollapsed 控制按钮文案
  const [collapseCmd, setCollapseCmd] = useState(null)
  const [allCollapsed, setAllCollapsed] = useState(false)
  const toggleCollapseAll = () => {
    const next = !allCollapsed
    setAllCollapsed(next)
    setCollapseCmd({ open: !next }) // next=折叠 → open:false
  }
  // 换了 schema（重新生成/恢复记录）→ 复位为「全部展开」文案（新块默认展开）
  useEffect(() => { setAllCollapsed(false) }, [applied])

  // ---- 元数据 → 表单 ----

  // 打开数据回填弹窗，预填当前表单已有的值
  const openDataFill = () => {
    setDataText(JSON.stringify(stripInternalKeys(form.values ?? {}), null, 2))
    setDataError('')
    setDataOpen(true)
  }

  // 打开「元数据 → 表单」：默认收起 JSON；预填 JSON 编辑框 = 当前已生成的 Schema
  const openMeta = () => {
    setMetaText(hasForm ? JSON.stringify(applied, null, 2) : '')
    setMetaShowJson(false)
    setMetaError('')
    setMetaOpen(true)
  }

  // 展开的 JSON 编辑框内容就是 Formily Schema，点「应用到表单」直接生成/更新表单
  const applyJsonToForm = () => {
    try {
      const schema = JSON.parse(metaText)
      applySchema(schema)
      setMetaError('')
      message.success('已按 JSON 更新表单')
    } catch (e) {
      setMetaError('JSON 解析失败：' + e.message)
    }
  }

  // 一键：调 SAP 拉元数据 → 转 Schema → 直接生成表单并关闭弹窗（复用当前环境 + 账号密码）
  const fetchAndGenerate = async () => {
    if (!metaFuncName.trim()) { message.error('请填写目标函数名'); return }
    setMetaLoading(true)
    try {
      const meta = await apiFetchMetadata({ env, username, password, funcName: metaFuncName.trim() })
      let schema
      try {
        schema = metadataToSchema(meta)
      } catch (e) {
        setMetaError('元数据转换 Schema 失败：' + e.message)
        return
      }
      applySchema(schema)                            // 直接生成表单
      setMetaText(JSON.stringify(schema, null, 2))   // 同步进 JSON 编辑框，便于后续查看/微调
      setMetaError('')
      setMetaOpen(false)
      message.success('已获取元数据并生成表单')
    } catch (e) {
      setMetaError(e.message)
    } finally {
      setMetaLoading(false)
    }
  }

  // ---- 数据填充 ----

  // 把一份 values 填充进当前已存在的表单：先清旧值（含数组行），再合并填充
  const fillValues = async (values) => {
    await form.reset('*', { forceClear: true, validate: false })
    form.setValues(values)
  }

  const handleFill = async () => {
    let parsed
    try {
      parsed = JSON.parse(dataText)
    } catch (e) {
      setDataError('JSON 解析失败：' + e.message)
      return
    }
    try {
      await fillValues(parsed)
      setDataError('')
      setDataOpen(false)
      message.success('已按 JSON 填充表单')
    } catch (e) {
      setDataError('填充失败：' + e.message)
    }
  }

  // ---- 调用记录 ----

  // 从记录恢复：schema 从池里按引用取回，值/显隐配置一并还原
  const restoreFromHistory = (rec) => {
    const schema = getSchema(rec) || applied
    const hasSchema = !!getSchema(rec)
    restore(schema, rec.values || {}, rec.config || {})
    if (rec.action) setMetaFuncName(rec.action)
    if (rec.env && ENVIRONMENTS[rec.env]) setEnv(rec.env)
    setHistoryOpen(false)
    message.success(hasSchema ? '已从记录填充（含 Schema）' : '已从记录填充（该记录无 Schema）')
  }

  const onDeleteHistory = (id) => { deleteHistory(id); message.success('已删除该记录') }
  const onClearHistory = () => { clearHistory(); message.success('已清空调用记录') }

  // 下载调用记录（含引用的 Schema）为 JSON，分享给别人
  const onExportHistory = () => {
    if (!history.length) { message.warning('暂无调用记录可下载'); return }
    downloadJson(timestampName('call-history'), exportBundle())
    message.success('已下载全部调用记录')
  }

  // 只下载选中的那一条记录（含它引用的 Schema）
  const onExportOne = (rec) => {
    const safe = (rec.action || 'record').replace(/[^\w.-]+/g, '_').slice(0, 40)
    downloadJson(timestampName(`call-record-${safe}`), exportBundle([rec]))
    message.success('已下载该条记录')
  }

  // 导入别人分享的调用记录文件（合并进现有记录，非破坏性）
  const onImportHistoryFile = async (file) => {
    try {
      const data = JSON.parse(await file.text())
      const added = importBundle(data)
      message.success(added ? `已导入 ${added} 条新记录` : '没有新增记录（可能都已存在）')
    } catch (e) {
      message.error('导入失败：' + e.message)
    }
  }

  // ---- 提交调用 SAP ----

  // 校验通过后，values 就是最终要回传给 FM 的入参 JSON
  const handleSubmit = async (values) => {
    if (!ENVIRONMENTS[env]?.url) {
      message.error(`【${ENVIRONMENTS[env]?.label || env}】环境地址未配置`)
      return
    }
    if (!metaFuncName.trim()) {
      message.error('请先在「元数据 → 表单」里填写函数名')
      return
    }
    const action = metaFuncName.trim()
    const payload = stripInternalKeys(values) // 剥掉 Formily 内部 key，再作为 FM 入参
    try {
      const res = await submitCall({ env, username, password, action, payload })
      setResult(res)
      setResultOpen(true)
      recordCall({ applied, values: payload, ok: res.ok, status: res.status, env, envLabel: ENVIRONMENTS[env].label, action, config })
      if (res.ok) message.success('调用成功')
      else message.error(`接口返回 HTTP ${res.status}`)
    } catch (e) {
      // 网络错误 / CORS 拦截通常走这里
      setResult({ ok: false, status: '请求失败', body: String(e) })
      setResultOpen(true)
      recordCall({ applied, values: payload, ok: false, status: '请求失败', env, envLabel: ENVIRONMENTS[env].label, action, config })
      message.error('请求失败：' + e.message)
    }
  }

  // 顶栏「提交」：先跑校验，通过才调 handleSubmit；不通过各字段就地标红
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

  // ---- 字段显隐配置 ----

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
    const leafChecked = (Array.isArray(keys) ? keys : keys.checked).filter((k) => allLeafKeys.includes(k))
    updateConfig(checkedKeysToConfig(leafChecked, allLeafKeys))
  }

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

  const onSaveProfile = () => {
    saveProfile({ action: metaFuncName.trim(), config })
    message.success('已保存配置方案')
  }
  const applyProfile = (rec) => {
    updateConfig(rec.config || {})
    setProfileOpen(false)
    message.success('已应用配置方案')
  }
  const onDeleteProfile = (id) => { deleteProfile(id); message.success('已删除该方案') }
  const onClearProfiles = () => { clearProfiles(); message.success('已清空配置方案') }

  return (
    <ConfigProvider locale={zhCN}>
      {/* 纵向 Flex：上=固定工具栏（不随滚动），下=表单滚动区 */}
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
            {/* 左：标题 + 接口调用参数 */}
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
              <Button onClick={toggleCollapseAll} disabled={!hasForm}>{allCollapsed ? '全部展开' : '全部折叠'}</Button>
              <Button onClick={openVisConfig} disabled={!hasForm}>字段显隐</Button>
              <Button onClick={openDataFill} disabled={!hasForm}>填充数据 JSON</Button>
              <Button type="primary" onClick={openMeta}>元数据 → 表单</Button>
              <Button type="primary" danger loading={submitting} disabled={!hasForm} onClick={doSubmit}>
                提交并调用 SAP
              </Button>
            </Space>
          </div>
        </div>

        {/* ===== 表单滚动区 ===== */}
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
          <BlockCollapseContext.Provider value={collapseCmd}>
            <FormProvider form={form}>
              <FormLayout layout="vertical">
                <SchemaField schema={renderSchema} />
              </FormLayout>
            </FormProvider>
          </BlockCollapseContext.Provider>
        </div>

        {/* ===== 弹窗 ===== */}
        <MetaModal
          open={metaOpen}
          onClose={() => setMetaOpen(false)}
          funcName={metaFuncName}
          setFuncName={setMetaFuncName}
          loading={metaLoading}
          onFetchAndGenerate={fetchAndGenerate}
          envLabel={ENVIRONMENTS[env].label}
          showJson={metaShowJson}
          setShowJson={setMetaShowJson}
          metaText={metaText}
          setMetaText={setMetaText}
          onApplyJson={applyJsonToForm}
          metaError={metaError}
        />

        <DataFillModal
          open={dataOpen}
          onClose={() => setDataOpen(false)}
          onFill={handleFill}
          dataText={dataText}
          setDataText={setDataText}
          dataError={dataError}
        />

        <HistoryModal
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          history={history}
          limit={STORAGE.historyLimit}
          onRestore={restoreFromHistory}
          onDelete={onDeleteHistory}
          onClear={onClearHistory}
          onExport={onExportHistory}
          onExportOne={onExportOne}
          onImportFile={onImportHistoryFile}
        />

        <ResultModal open={resultOpen} onClose={() => setResultOpen(false)} result={result} />

        <VisibilityModal
          open={visOpen}
          onClose={() => setVisOpen(false)}
          treeData={treeData}
          checkedKeys={checkedKeys}
          onTreeCheck={onTreeCheck}
          visView={visView}
          setVisView={setVisView}
          config={config}
          visJsonText={visJsonText}
          setVisJsonText={setVisJsonText}
          visJsonError={visJsonError}
          onApplyJson={applyVisJson}
          onApplyHideEmpty={applyHideEmpty}
          onShowAll={() => updateConfig({})}
          onHideAll={() => updateConfig(checkedKeysToConfig([], allLeafKeys))}
          onSaveProfile={onSaveProfile}
          onOpenProfiles={() => setProfileOpen(true)}
          profilesCount={profiles.length}
        />

        <ProfileModal
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          profiles={profiles}
          limit={STORAGE.visProfileLimit}
          onApply={applyProfile}
          onDelete={onDeleteProfile}
          onClear={onClearProfiles}
        />
      </div>
    </ConfigProvider>
  )
}
