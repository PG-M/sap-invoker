// 「元数据 → 表单」弹窗（渐进式三步，状态由父级持有）：
//   ① 默认只显示「目标函数名」+「获取元数据并生成表单」——JSON 富文本框默认隐藏；
//   ② 一键拉元数据→转 Schema→直接生成表单；
//   ③ 「显示/编辑 JSON Schema」按需展开，改完点「应用到表单」把修改同步进当前表单。
import React from 'react'
import { Modal, Space, Button, Input as AntInput, Alert } from 'antd'
import { DownOutlined, RightOutlined } from '@ant-design/icons'

export default function MetaModal({
  open, onClose,
  funcName, setFuncName, loading, onFetchAndGenerate, envLabel,
  showJson, setShowJson,
  metaText, setMetaText, onApplyJson,
  metaError,
}) {
  return (
    <Modal
      title="元数据 → 表单"
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
      width={720}
    >
      {/* ① 第一步：函数名 + 一键获取并生成 */}
      <Space wrap>
        <span>目标函数名：</span>
        <AntInput
          value={funcName}
          onChange={(e) => setFuncName(e.target.value)}
          onPressEnter={onFetchAndGenerate}
          placeholder="如 ZTEST_STR"
          style={{ width: 220 }}
        />
        <Button type="primary" loading={loading} onClick={onFetchAndGenerate}>
          获取元数据并生成表单{envLabel ? `（${envLabel}）` : ''}
        </Button>
      </Space>

      {/* ③ 进阶：按需展开 JSON Schema 编辑 */}
      <div style={{ marginTop: 16 }}>
        <Button type="link" style={{ paddingLeft: 0 }} onClick={() => setShowJson((v) => !v)}>
          {showJson ? <DownOutlined /> : <RightOutlined />} 显示 / 编辑 JSON Schema
        </Button>
      </div>

      {showJson && (
        <>
          <div style={{ margin: '4px 0 8px', color: '#888', fontSize: 12 }}>
            这里是当前表单的 Formily JSON Schema，可直接粘贴/修改，点「应用到表单」即同步渲染。
          </div>
          <textarea
            value={metaText}
            onChange={(e) => setMetaText(e.target.value)}
            spellCheck={false}
            placeholder="粘贴或修改 Formily JSON Schema，再点「应用到表单」。"
            style={{
              width: '100%', height: '48vh', fontFamily: 'Consolas, monospace',
              fontSize: 13, resize: 'vertical', border: '1px solid #eee', padding: 8,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ marginTop: 8 }}>
            <Button type="primary" onClick={onApplyJson}>应用到表单 ▶</Button>
          </div>
        </>
      )}

      {metaError && <Alert type="error" message={metaError} style={{ marginTop: 8 }} />}
    </Modal>
  )
}
