import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { PROXY_TARGETS } from './sap.config.js'

// 开发代理：绕开浏览器 CORS。前端请求 /sap-dev、/sap-test，由 Vite 转发到真实 SAP
// 地址（node 端请求，不受同源策略限制）。目标主机集中在 sap.config.js，改那里即可。
// 每个前缀转发时把自身从路径里剥掉（/sap-dev/xxx → /xxx）。
const proxy = Object.fromEntries(
  Object.entries(PROXY_TARGETS).map(([prefix, target]) => [
    prefix,
    {
      target,
      changeOrigin: true,
      rewrite: (p) => p.replace(new RegExp(`^${prefix}`), ''),
    },
  ])
)

export default defineConfig({
  plugins: [react()],
  // 关键：部署到 BSP 必须使用相对路径
  base: './',
  server: {
    host: true,        // 监听 0.0.0.0，局域网内其它机器可通过本机 IP 访问
    port: 5173,
    open: true,
    proxy,
  },
})
