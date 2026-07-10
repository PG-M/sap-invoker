// 响应式块布局用的两个轻量组件（纯展示，无状态、无拖拽、无新依赖）。
//
// · WidthItem：叶子字段的装饰器，替换 FormItem。给字段套一个固定像素宽的外壳，
//   内部仍渲染 FormItem（label/必填/错误照常）。放进 flex-wrap 容器后，固定宽 →
//   放不下自动换行。宽度由 schema 的 x-decorator-props.width 带入（会话级、不保存）。
// · Block：节点块容器（结构用作 x-component，表格用作 x-decorator）。渲染 antd Card，
//   标题取字段自身的 title，卡片 body 是 flex-wrap，让块内字段并排流式换行。
//   外层 flex-basis:100% 使每块独占一行。

import React from 'react'
import { FormItem } from '@formily/antd-v5'
import { useField } from '@formily/react'
import { Card } from 'antd'

// 叶子字段：固定宽外壳 + FormItem
export const WidthItem = ({ width = 220, children, ...rest }) => (
  <div style={{ width, flex: '0 0 auto', boxSizing: 'border-box' }}>
    <FormItem {...rest}>{children}</FormItem>
  </div>
)

// 节点块：Card（标题=字段 title）+ flex-wrap body
export const Block = ({ children, title, ...rest }) => {
  const field = useField()
  const heading = title ?? field?.title
  return (
    <Card
      size="small"
      title={heading}
      style={{ flexBasis: '100%', width: '100%', marginBottom: 12 }}
      styles={{ body: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' } }}
      {...rest}
    >
      {children}
    </Card>
  )
}
