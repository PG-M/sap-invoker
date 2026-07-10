import React, { useState } from 'react'
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
import { metadataToSchema } from './metadataToSchema'
import { stripInternalKeys, checkedKeysToConfig, hideEmptyValues } from './visibility'
import { fetchMetadata as apiFetchMetadata, submitCall } from './api/sapClient'
import { useDynamicForm } from './hooks/useDynamicForm'
import { useCallHistory } from './hooks/useCallHistory'
import { useVisibilityProfiles } from './hooks/useVisibilityProfiles'
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
  const { history, recordCall, deleteHistory, clearHistory, getSchema } = useCallHistory()
  const { profiles, saveProfile, deleteProfile, clearProfiles } = useVisibilityProfiles()

  // 数据回填相关
  const [dataOpen, setDataOpen] = useState(false)
  const [dataText, setDataText] = useState('')
  const [dataError, setDataError] = useState('')

  // 元数据 → Schema 相关
  const [metaOpen, setMetaOpen] = useState(false)
  const [metaText, setMetaText] = useState('') // 文本框内容 = Formily Schema
  const [metaError, setMetaError] = useState('')
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

  // ---- 元数据 → 表单 ----

  // 打开数据回填弹窗，预填当前表单已有的值
  const openDataFill = () => {
    setDataText(JSON.stringify(stripInternalKeys(form.values ?? {}), null, 2))
    setDataError('')
    setDataOpen(true)
  }

  // 文本框内容就是 Formily Schema，直接生成表单
  const handleGenFromMeta = () => {
    try {
      const schema = JSON.parse(metaText)
      applySchema(schema)
      setMetaError('')
      setMetaOpen(false)
      message.success('已生成表单')
    } catch (e) {
      setMetaError('JSON 解析失败：' + e.message)
    }
  }

  // 调 SAP 接口获取元数据，转成 Schema 填进文本框（复用当前环境 + 账号密码）
  const fetchMetadata = async () => {
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
      setMetaText(JSON.stringify(schema, null, 2))
      setMetaError('')
      message.success('已获取并转换为 Schema，点「生成表单 ▶」即可渲染')
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
              <Button onClick={openVisConfig} disabled={!hasForm}>字段显隐</Button>
              <Button onClick={openDataFill} disabled={!hasForm}>填充数据 JSON</Button>
              <Button type="primary" onClick={() => setMetaOpen(true)}>元数据 → 表单</Button>
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
          <FormProvider form={form}>
            <FormLayout layout="vertical">
              <SchemaField schema={renderSchema} />
            </FormLayout>
          </FormProvider>
        </div>

        {/* ===== 弹窗 ===== */}
        <MetaModal
          open={metaOpen}
          onClose={() => setMetaOpen(false)}
          onGenerate={handleGenFromMeta}
          metaText={metaText}
          setMetaText={setMetaText}
          metaError={metaError}
          funcName={metaFuncName}
          setFuncName={setMetaFuncName}
          loading={metaLoading}
          onFetch={fetchMetadata}
          envLabel={ENVIRONMENTS[env].label}
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
