# Formily JSON Schema → 表单 Demo

左边粘贴 JSON Schema，点「生成表单」，右边实时渲染成可填写的 Ant Design 表单；
点「提交」后经过校验，弹出最终出参 JSON（即将来要回传给 SAP FM 的入参）。

## 运行

```bash
cd formily-demo
npm install
npm run dev
```

浏览器自动打开 http://localhost:5173

## 看点

- `IV_EBELN`：ELEM → Input，`required: true` 演示必填校验，`maxLength` 演示长度限制
- `IV_BSART`：domain 固定值 → `enum` → Select 下拉
- `IV_BEDAT`：DATS → DatePicker，`format: YYYYMMDD` 存字符串
- `IS_HEADER`：STRUCTURE → 嵌套对象
- `IT_ITEMS`：TABLE → ArrayTable，可增删行

## 关键概念（对应你后端 metadata 的映射）

| Schema 字段 | 作用 | 后端从哪来 |
|---|---|---|
| `type` / `x-component` | 决定用哪个控件 | 由 ui_type 映射 |
| `title` | label | desc |
| `required` | 必填校验 | 参数 optional 反推 |
| `enum` | 下拉选项 | domain fixed values |
| `x-component-props.maxLength` | 长度 | length |
| `x-validator` | 更复杂校验 | conv_exit / 正则 |

> 只要注册进 `createSchemaField({ components })` 的组件，才能在 `x-component` 里引用。
> 想挂 SAP F4 搜索帮助，就自定义一个组件（如 `MatnrSearch`）注册进去，再在 schema 里 `"x-component": "MatnrSearch"`。
