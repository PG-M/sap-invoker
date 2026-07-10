// 显隐配置方案 hook：把「字段显隐配置」存成一份份方案，用 localStorage 持久化，
// 结构与调用记录一致（接口名 + 时间 + config）。
import { useState } from 'react'
import { STORAGE } from '../config'

const { visProfileKey, visProfileLimit } = STORAGE

function loadProfiles() {
  try { return JSON.parse(localStorage.getItem(visProfileKey)) || [] } catch { return [] }
}
function saveProfiles(list) {
  try { localStorage.setItem(visProfileKey, JSON.stringify(list)) } catch { /* 忽略 */ }
}

export function useVisibilityProfiles() {
  const [profiles, setProfiles] = useState(loadProfiles)

  // 保存当前配置为一份方案（接口名 + 时间）
  const saveProfile = ({ action, config }) => {
    const entry = {
      id: `${new Date().getTime()}-${profiles.length}`,
      action: action || '(无 action)',
      time: new Date().toLocaleString('zh-CN'),
      config,
    }
    setProfiles((prev) => {
      const next = [entry, ...prev].slice(0, visProfileLimit)
      saveProfiles(next)
      return next
    })
  }

  const deleteProfile = (id) => {
    setProfiles((prev) => {
      const next = prev.filter((r) => r.id !== id)
      saveProfiles(next)
      return next
    })
  }

  const clearProfiles = () => {
    setProfiles([])
    saveProfiles([])
  }

  return { profiles, saveProfile, deleteProfile, clearProfiles }
}
