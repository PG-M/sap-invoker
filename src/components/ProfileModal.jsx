// 配置方案记录弹窗：列出已保存的显隐方案，可「应用」或「删除」，底部可清空。
import React from 'react'
import { Modal, Space, Button, List } from 'antd'

export default function ProfileModal({ open, onClose, profiles, limit, onApply, onDelete, onClear }) {
  return (
    <Modal
      title={`配置记录（最近 ${profiles.length} 条，最多存 ${limit}）`}
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          <Button danger disabled={!profiles.length} onClick={onClear}>清空方案</Button>
          <Button onClick={onClose}>关闭</Button>
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
              <Button type="link" key="apply" onClick={() => onApply(rec)}>应用</Button>,
              <Button type="link" danger key="del" onClick={() => onDelete(rec.id)}>删除</Button>,
            ]}
          >
            <List.Item.Meta title={rec.action} description={rec.time} />
          </List.Item>
        )}
      />
    </Modal>
  )
}
