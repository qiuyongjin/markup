/**
 * 打包浏览器测试用的脚本：node test/build.mjs
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compile } from 'sass'
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

// 带上真实的样式，测试才能发现排版上的问题（比如末尾占位元素把文字挤成一列）
const { css } = compile(resolve(process.cwd(), 'src/styles/main.scss'), { style: 'expanded' })
writeFileSync(resolve(process.cwd(), 'test/dist/style.css'), `${css}\n`)

// 带一个随机查询串，避免浏览器缓存旧脚本
const stamp = Date.now()
writeFileSync(
  resolve(process.cwd(), 'test/dist/index.html'),
  `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>browser test</title>
    <link rel="stylesheet" href="./style.css" />
    <style>
      /* 测试页不需要应用的外边距，只要真实的排版规则 */
      .editor {
        min-height: 0;
        padding: 8px;
      }
    </style>
  </head>
  <body><script type="module" src="./browser-test.js?v=${stamp}"></script></body>
</html>
`,
)
