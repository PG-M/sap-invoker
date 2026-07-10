// 「获取元数据 / 粘贴 Schema → 生成表单」弹窗（纯展示，状态由父级持有）。
import React from 'react'
import { Modal, Space, Button, Input as AntInput, Alert } from 'antd'

export default function MetaModal({
  open, onClose, onGenerate,
  metaText, setMetaText, metaError,
  funcName, setFuncName, loading, onFetch, envLabel,
}) {
  return (
    <Modal
      title="获取元数据 / 粘贴 Schema → 生成表单"
      open={open}
      onCancel={onClose}
      onOk={onGenerate}
      okText="生成表单 ▶"
      cancelText="取消"
      width={720}
      destroyOnClose
    >
      {/* 从接口获取元数据：复用主界面选的环境 + 账号密码。元数据服务 action 固定，不暴露修改 */}
      <Space wrap style={{ marginBottom: 8 }}>
        <span>目标函数名：</span>
        <AntInput
          value={funcName}
          onChange={(e) => setFuncName(e.target.value)}
          placeholder="如 ZTEST_STR"
          style={{ width: 200 }}
        />
        <Button loading={loading} onClick={onFetch}>
          获取元数据（{envLabel}）
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
  )
}
