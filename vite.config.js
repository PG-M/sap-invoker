import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { PROXY_TARGETS } from './sap.config.js'

// 前缀 → 环境变量名：/sap-dev → SAP_DEV_TARGET、/sap-test → SAP_TEST_TARGET
const envKeyOf = (prefix) => prefix.replace(/^\//, '').replace(/-/g, '_').toUpperCase() + '_TARGET'

export default defineConfig(({ mode }) => {
  // 读本地 .env / .env.local（第 3 参 '' = 不限前缀，能读到无 VITE_ 前缀的变量）。
  // .env.local 已被 .gitignore 忽略：其它设备在里面填 A 的转发地址即可覆盖默认真 SAP 地址，
  // 不用改被 git 跟踪的 sap.config.js —— 本机(能连 SAP 的 A)不建该文件，就用默认真 SAP。
  const env = loadEnv(mode, process.cwd(), '')

  // 开发代理：绕开浏览器 CORS。前端请求 /sap-dev、/sap-test，由 Vite 转发到目标地址
  // （node 端请求，不受同源策略限制）。目标优先取 .env.local 覆盖，否则用 sap.config.js 默认。
  // 每个前缀转发时把自身从路径里剥掉（/sap-dev/xxx → /xxx）。
  const proxy = Object.fromEntries(
    Object.entries(PROXY_TARGETS).map(([prefix, defTarget]) => {
      const target = env[envKeyOf(prefix)] || defTarget
      return [
        prefix,
        {
          target,
          changeOrigin: true,
          rewrite: (p) => p.replace(new RegExp(`^${prefix}`), ''),
        },
      ]
    })
  )

  return {
    plugins: [react()],
    // 关键：部署到 BSP 必须使用相对路径
    base: './',
    server: {
      host: true,        // 监听 0.0.0.0，局域网内其它机器可通过本机 IP 访问
      port: 5173,
      open: true,
      proxy,
    },
  }
})

