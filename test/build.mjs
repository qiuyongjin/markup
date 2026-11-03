/**
 * 打包浏览器测试用的脚本：node test/build.mjs
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'vite'

await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    lib: {
      entry: resolve(process.cwd(), 'test/browser.test.ts'),
      formats: ['es'],
      fileName: 'browser-test',
    },
    outDir: 'test/dist',
    emptyOutDir: true,
  },
})

// 带一个随机查询串，避免浏览器缓存旧脚本
const stamp = Date.now()
writeFileSync(
  resolve(process.cwd(), 'test/dist/index.html'),
  `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>browser test</title></head>
  <body><script type="module" src="./browser-test.js?v=${stamp}"></script></body>
</html>
`,
)
