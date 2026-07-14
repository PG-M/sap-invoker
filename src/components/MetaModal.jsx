// 「元数据 → 表单」弹窗（渐进式，状态由父级持有）：
//   ① 默认只显示「目标函数名」+「获取元数据并生成表单」——走 SAP 接口拉元数据；
//   ② 一键拉元数据→转 Schema→直接生成表单；
//   ③ 「手动填写元数据」按需展开：不走接口，直接粘/填中性元数据 JSON → 转 Schema → 生成表单；
//   ④ 「显示/编辑 JSON Schema」按需展开，改完点「应用到表单」把修改同步进当前表单。
import React from 'react'
import { Modal, Space, Button, Input as AntInput, Alert } from 'antd'
import { DownOutlined, RightOutlined } from '@ant-design/icons'

export default function MetaModal({
  open, onClose,
  funcName, setFuncName, loading, onFetchAndGenerate, envLabel,
  aiLoading, onFetchAndGenerateAI,
  showMetaInput, setShowMetaInput,
  metaInputText, setMetaInputText, onConvertMeta,
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
        <Button type="link" size="small" loading={aiLoading} onClick={onFetchAndGenerateAI}>
          AI 获取
        </Button>
      </Space>

      {/* ③ 或：不走接口，手动填写中性元数据 → 转 Schema → 生成表单 */}
      <div style={{ marginTop: 16 }}>
        <Button type="link" style={{ paddingLeft: 0 }} onClick={() => setShowMetaInput((v) => !v)}>
          {showMetaInput ? <DownOutlined /> : <RightOutlined />} 手动填写元数据（不走接口）
        </Button>
      </div>

      {showMetaInput && (
        <>
          <div style={{ margin: '4px 0 8px', color: '#888', fontSize: 12 }}>
            直接粘贴 / 填写中性元数据 JSON（形如 <code>{'{ "function": "...", "params": [ { "name": "IV_X", "kind": "ELEM", "ddic_type": "CHAR", "length": 10, "required": true } ] }'}</code>），
            点「转换并生成」即走同一套转换逻辑生成表单。
          </div>
          <textarea
            value={metaInputText}
            onChange={(e) => setMetaInputText(e.target.value)}
            spellCheck={false}
            placeholder={'粘贴或填写中性元数据 JSON，再点「转换并生成」。\n例：\n{\n  "function": "ZTEST_STR",\n  "params": [\n    { "name": "IV_MATNR", "kind": "ELEM", "label": "物料号", "ddic_type": "CHAR", "length": 18, "required": true }\n  ]\n}'}
            style={{
              width: '100%', height: '40vh', fontFamily: 'Consolas, monospace',
              fontSize: 13, resize: 'vertical', border: '1px solid #eee', padding: 8,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ marginTop: 8 }}>
            <Button type="primary" onClick={onConvertMeta}>转换并生成 ▶</Button>
          </div>
        </>
      )}

      {/* ④ 进阶：按需展开 JSON Schema 编辑 */}
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
