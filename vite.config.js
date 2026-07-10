import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 关键：部署到 BSP 必须使用相对路径
  base: './',
  server: {
    host: true,        // 监听 0.0.0.0，局域网内其它机器可通过本机 IP 访问
    port: 5173,
    open: true,
    // 开发代理：绕开浏览器 CORS。前端请求 /sap-dev、/sap-test，
    // 由 Vite 转发到真实 SAP 地址（node 端请求，不受同源策略限制）
    proxy: {
      '/sap-dev': {
        target: 'http://devapp.vision-tool.com.cn:8400',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/sap-dev/, ''),
      },
      '/sap-test': {
        target: 'http://devapp.vision-tool.com.cn:8010',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/sap-test/, ''),
      },
    },
  },
})
