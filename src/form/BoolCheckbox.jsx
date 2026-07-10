import React from 'react'
import { Checkbox as AntCheckbox } from 'antd'

// SAP 布尔标志位（CHAR1 X/空）用勾选框：field 值直接是 'X'/''，勾=checkedValue、
// 不勾=uncheckedValue，所以提交/回填/记录全程都是 'X'/''，无需别处做布尔↔字符转换。
export const BoolCheckbox = ({ value, onChange, checkedValue = 'X', uncheckedValue = '', ...rest }) => (
  <AntCheckbox
    checked={value === checkedValue}
    onChange={(e) => onChange?.(e.target.checked ? checkedValue : uncheckedValue)}
    {...rest}
  />
)
