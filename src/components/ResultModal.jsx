// 接口返回结果弹窗：展示状态 + 格式化后的响应体。
import React from 'react'
import { Modal, Button, Alert } from 'antd'

export default function ResultModal({ open, onClose, result }) {
  return (
    <Modal
      title="接口返回"
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
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
  )
}
