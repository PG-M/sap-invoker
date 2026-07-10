// 「填充数据 JSON」弹窗：把一份 values JSON 填进当前表单。
import React from 'react'
import { Modal, Alert } from 'antd'

export default function DataFillModal({ open, onClose, onFill, dataText, setDataText, dataError }) {
  return (
    <Modal
      title="填充数据 JSON"
      open={open}
      onCancel={onClose}
      onOk={onFill}
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
  )
}
