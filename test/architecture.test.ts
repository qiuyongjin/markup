/**
 * 架构约束测试：守住分层与依赖方向。
 *
 * 这些规则写死在测试里，谁把依赖箭头掰弯了，测试就会红。
 * 运行：node test/architecture.test.ts
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
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

/**
 * 文件里 import 的模块说明符。
 *
 * 静态导入（`from '…'` / `import '…'`）与动态导入（`import('…')`）都要算 ——
 * 动态导入同样是一条依赖边，不该有绕过去的口子。
 */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const specs: string[] = []
  const pattern = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    specs.push(match[1] ?? match[2] ?? match[3]!)
  }
  return specs
}

/** 相对路径（相对仓库根），报错时好看一些 */
function rel(file: string): string {
  return relative(root, file)
}

/** 这个文件属于哪一层：`src/` 下的第一级目录；在 `src/` 根下算 '(root)' */
function layerOf(file: string): string {
  const top = relative(src, file).split(sep)[0] ?? ''
  return top.includes('.') ? '(root)' : top
}

/**
 * 说明符指向哪一层。
 *
 * 只处理相对路径：包名（`vue` 之类）不参与分层，框架依赖另有规则管。
 * 指到 `src/` 之外的（理论上没有）返回 null，不参与检查。
 */
function targetLayer(file: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const abs = resolve(dirname(file), spec)
  if (!abs.startsWith(src + sep)) return null
  return layerOf(abs)
}

/**
 * 允许的依赖方向：一层可以依赖哪几层。
 *
 * 规则来自 docs/architecture.md §4.1：
 * - `core/` 是零依赖层；
 * - `markdown/`（渲染层）只依赖 core；
 * - `editor/` 依赖 core 与 markdown，**不知道页面存在**；
 * - `pages/` 只依赖 core；
 * - `components/`（UI 层）依赖 editor 与 core，
 *   **不直接依赖 pages** —— 页面仓库的具体实现只在组合根出现，
 *   组件只通过 `LinkProvider` 端口拿数据；
 * - `src/` 根下的 `App.vue` / `main.ts` 是组合根，可以依赖任何一层。
 */
const ALLOWED: Record<string, string[]> = {
  '(root)': ['(root)', 'components', 'core', 'editor', 'markdown', 'pages'],
  components: ['components', 'core', 'editor'],
  editor: ['editor', 'core', 'markdown'],
  markdown: ['markdown', 'core'],
  pages: ['pages', 'core'],
  core: [],
}

/**
 * 不是代码层的目录：样式与静态资源。
 *
 * 它们不参与分层判断（`main.ts` 引 `styles/main.scss` 是正常的），
 * 但也不能悄悄多出别的目录 —— 出现了就说明分层表该更新了。
 */
const ASSET_LAYERS = new Set(['styles'])

h.section('1. 依赖方向：每一条依赖边都在允许的表里')
for (const file of listFiles(src)) {
  const from = layerOf(file)
  const allowed = ALLOWED[from]
  if (!allowed) {
    h.check(false, `${rel(file)} 所在的层「${from}」没有定义规则`)
    continue
  }
  const bad: string[] = []
  for (const spec of importsOf(file)) {
    const to = targetLayer(file, spec)
    if (to === null) continue
    if (ASSET_LAYERS.has(to)) continue
    if (!ALLOWED[to]) {
      bad.push(`${spec} → ${to}（未知层）`)
      continue
    }
    if (!allowed.includes(to)) bad.push(`${spec} → ${to}`)
  }
  h.check(bad.length === 0, `${rel(file)}（${from}）不依赖不允许的层`, bad.join(', '))
}

h.section('2. core/ 是零依赖层')
for (const file of listFiles(join(src, 'core'))) {
  const specs = importsOf(file)
  h.check(specs.length === 0, `${rel(file)} 不 import 任何模块`, specs.join(', '))
}

h.section('3. 核心三模块零框架依赖（红线）')
for (const dir of ['markdown', 'core', 'editor']) {
  for (const file of listFiles(join(src, dir))) {
    const bad = importsOf(file).filter((spec) => spec === 'vue' || spec.startsWith('vue/'))
    h.check(bad.length === 0, `${rel(file)} 不 import vue`, bad.join(', '))
  }
}

finish(h)
