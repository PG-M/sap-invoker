// 调用记录弹窗：列出最近调用，可「填充」（恢复表单）或「删除」，底部可清空。
import React from 'react'
import { Modal, Space, Button, List, Tag } from 'antd'

export default function HistoryModal({ open, onClose, history, limit, onRestore, onDelete, onClear }) {
  return (
    <Modal
      title={`调用记录（最近 ${history.length} 条，最多存 ${limit}）`}
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          <Button danger disabled={!history.length} onClick={onClear}>清空记录</Button>
          <Button onClick={onClose}>关闭</Button>
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
              <Button type="link" key="fill" onClick={() => onRestore(rec)}>填充</Button>,
              <Button type="link" danger key="del" onClick={() => onDelete(rec.id)}>删除</Button>,
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
  )
}
