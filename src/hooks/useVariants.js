// 变式 hook：手动保存「当前表单的完整状态」并命名，之后按名一键回填。
// 变式 = 名字 + 当前字段值 + Schema(布局) + 显隐配置 —— 回填时连布局、显示/隐藏都还原，
// 等同「调用记录的填充」。底层复用 useRecordStore（Schema 去重池 + 打包导出/导入分享）。
import { STORAGE } from '../config'
import { useRecordStore } from './useRecordStore'

const { variantKey, variantLimit, variantPoolKey } = STORAGE

export function useVariants() {
  const store = useRecordStore({
    recordsKey: variantKey,
    poolKey: variantPoolKey,
    limit: variantLimit,
    kind: 'variant',
    listField: 'variants',
  })

  // 保存一个变式：name 用户命名，applied=当前 schema，values=当前字段值，config=当前显隐
  const saveVariant = ({ name, applied, values, config, action }) => {
    store.add({ schema: applied, name, action, config, values })
  }

  return {
    variants: store.records,
    saveVariant,
    deleteVariant: store.remove,
    clearVariants: store.clear,
    getSchema: store.getSchema,
    exportBundle: store.exportBundle,
    importBundle: store.importBundle,
  }
}
