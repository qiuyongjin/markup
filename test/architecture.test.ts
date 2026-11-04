/**
 * 架构约束测试：守住分层与依赖方向。
 *
 * 这些规则写死在测试里，谁把依赖箭头掰弯了，测试就会红。
 * 运行：node test/architecture.test.ts
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHarness, finish } from './harness.ts'

const h = createHarness()
const root = fileURLToPath(new URL('..', import.meta.url))
const src = join(root, 'src')

/** 递归列出目录下的所有代码文件 */
function listFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listFiles(full))
      continue
    }
    if (/\.(ts|vue)$/.test(entry.name)) out.push(full)
  }
  return out
}

/** 文件里 import 的模块说明符 */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const specs: string[] = []
  const pattern = /(?:from|import)\s*['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    specs.push(match[1]!)
  }
  return specs
}

/** 相对路径（相对仓库根），报错时好看一些 */
function rel(file: string): string {
  return relative(root, file)
}

h.section('1. pages/ 不依赖 editor/（F1：依赖方向倒置）')
for (const file of listFiles(join(src, 'pages'))) {
  const bad = importsOf(file).filter((spec) => spec.includes('markdown') || spec.includes('editor'))
  h.check(bad.length === 0, `${rel(file)} 不 import 编辑器层`, bad.join(', '))
}

h.section('2. editor/ 不知道页面存在（只依赖 core/ 与 markdown/）')
for (const file of listFiles(join(src, 'editor'))) {
  const bad = importsOf(file).filter((spec) => spec.includes('pages'))
  h.check(bad.length === 0, `${rel(file)} 不 import pages/`, bad.join(', '))
}

h.section('2b. 组件层不直接依赖页面仓库（注入只发生在组合根）')
for (const file of listFiles(join(src, 'components'))) {
  const bad = importsOf(file).filter((spec) => spec.includes('pages'))
  h.check(bad.length === 0, `${rel(file)} 不 import pages/`, bad.join(', '))
}

h.section('3. 核心三模块零框架依赖（红线）')
for (const dir of ['markdown', 'core', 'editor']) {
  for (const file of listFiles(join(src, dir))) {
    const bad = importsOf(file).filter((spec) => spec === 'vue' || spec.startsWith('vue/'))
    h.check(bad.length === 0, `${rel(file)} 不 import vue`, bad.join(', '))
  }
}

h.section('4. core/ 是零依赖层')
for (const file of listFiles(join(src, 'core'))) {
  const specs = importsOf(file)
  h.check(specs.length === 0, `${rel(file)} 不 import 任何模块`, specs.join(', '))
}

finish(h)
