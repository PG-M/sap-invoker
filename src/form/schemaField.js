// 组件注册表：JSON Schema 里的 x-component / x-decorator 只能引用这里注册过的名字。
// 想挂 SAP F4 搜索帮助等自定义控件，就在这里注册（如 MatnrSearch），再在 schema 里引用。
import { createSchemaField } from '@formily/react'
import {
  FormItem, Input, Select, DatePicker, NumberPicker, Checkbox,
  ArrayTable, ArrayCollapse, FormLayout, FormGrid,
} from '@formily/antd-v5'
import { BoolCheckbox } from './BoolCheckbox'
import { WidthItem, Block } from './layout'

export const SchemaField = createSchemaField({
  components: {
    FormItem,
    Input,
    Select,
    DatePicker,
    NumberPicker,
    Checkbox,
    BoolCheckbox,
    ArrayTable,
    ArrayCollapse,
    FormLayout,
    FormGrid,   // 响应式栅格：新布局叶子字段分组用
    WidthItem,  // 兼容旧记录的固定宽外壳（新 schema 不再产出）
    Block,      // 可折叠节点块
  },
})
