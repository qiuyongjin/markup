/**
 * 首页默认文档的测试：node test/welcome.test.ts
 *
 * 这份文档是用户打开应用看到的第一眼，它必须满足三条：
 *   1. 只用 Markup 真正支持的语法 —— 用户照着写，才不会写出一堆不生效的标记；
 *   2. 不留落单的标记；
 *   3. 每一处 `[[` 都不会误触发「新建链接」的候选窗口：
 *      要么写在行内代码里，要么已经是一个写完的链接。
 */
import { parseMarkdown, type Token } from '../src/markdown/parser.ts'
import { EXAMPLE_PAGE_CONTENT, EXAMPLE_PAGE_TITLE, WELCOME_MARKDOWN } from '../src/pages/welcome.ts'
import { createHarness, finish } from './harness.ts'

const h = createHarness()

/** 遍历整棵 token 树 */
function walk(list: Token[], visit: (token: Token) => void): void {
  for (const token of list) {
    visit(token)
    if (token.kind === 'bold' || token.kind === 'heading') walk(token.children, visit)
  }
}

/** 解析一段源码，返回出现过的 token 类型与所有链接 */
function analyze(source: string): { kinds: Set<string>; texts: string[]; links: string[] } {
  const kinds = new Set<string>()
  const texts: string[] = []
  const links: string[] = []
  walk(parseMarkdown(source), (token) => {
    kinds.add(token.kind)
    if (token.kind === 'text') texts.push(token.text)
    if (token.kind === 'link') links.push(token.name)
  })
  return { kinds, texts, links }
}

/**
 * 这一处 `[[` 会不会被当成「新建链接」的触发点。
 *
 * 规则和编辑器一致：
 *   - 在行内代码里就不算（编辑器靠数它前面有几个反引号判断）；
 *   - 已经写完的链接也不算（`[[页面名]]`，页面名里没有方括号、反引号、换行）。
 */
function isTrigger(source: string, index: number): boolean {
  let backticks = 0
  for (let i = 0; i < index; i += 1) {
    if (source[i] === '`') backticks += 1
  }
  if (backticks % 2 === 1) return false

  const close = source.indexOf(']]', index + 2)
  if (close !== -1) {
    const content = source.slice(index + 2, close)
    if (content && !/[[\]`]/.test(content) && !content.includes('\n')) return false
  }
  return true
}

/** 源码里每一处 `[[` 的位置 */
function linkOpenings(source: string): number[] {
  const out: number[] = []
  for (let index = source.indexOf('[['); index !== -1; index = source.indexOf('[[', index + 1)) {
    out.push(index)
  }
  return out
}

const welcome = analyze(WELCOME_MARKDOWN)

h.section('1. 用到的语法都生效了')
h.check(welcome.kinds.has('heading'), '默认文档里有标题', [...welcome.kinds].join(', '))
h.check(welcome.kinds.has('bold'), '默认文档里有加粗')
h.check(welcome.kinds.has('code'), '默认文档里有行内代码')
h.check(welcome.kinds.has('text'), '默认文档里有正文')

h.section('2. 没有落单的标记')
// 没闭合的标记会按原文显示：正文里出现裸露的 `**` 或反引号，
// 说明示例本身写坏了 —— 用户会以为「语法不生效」。
const stray = welcome.texts.filter((text) => text.includes('**') || text.includes('`'))
h.check(stray.length === 0, '正文里没有裸露的标记', stray.join(' | '))

h.section('3. 有一个真的能点的链接')
h.check(welcome.links.length === 1, '默认文档里有一个真链接', welcome.links.join(', '))
h.check(welcome.links[0] === EXAMPLE_PAGE_TITLE, '链接指向预置好的示例页面', welcome.links[0] ?? '')

h.section('4. 不会误触发候选窗口')
for (const [name, source] of [
  ['默认文档', WELCOME_MARKDOWN],
  ['示例页面', EXAMPLE_PAGE_CONTENT],
] as const) {
  const openings = linkOpenings(source)
  const triggers = openings.filter((index) => isTrigger(source, index))
  h.check(
    triggers.length === 0,
    `${name}：每一处 [[ 都不会弹出候选窗口`,
    triggers.map((index) => source.slice(index, index + 12)).join(' | '),
  )
  h.check(openings.length > 0, `${name}：演示了链接语法`, `出现 ${openings.length} 次`)
}

// 示例页面里那个链接指向还没写的页面：点开就是「创建页面」那条路
const example = analyze(EXAMPLE_PAGE_CONTENT)
h.check(example.links.length === 1, '示例页面里有一个链接', example.links.join(', '))
h.check(
  example.links[0] !== EXAMPLE_PAGE_TITLE,
  '示例页面里的链接指向另一个（还没写的）页面',
  example.links[0] ?? '',
)

h.section('5. 内容覆盖了「语法」和「功能」两部分')
h.check(WELCOME_MARKDOWN.includes('## 支持的语法'), '有「支持的语法」这一节')
h.check(WELCOME_MARKDOWN.includes('## 支持的功能'), '有「支持的功能」这一节')
h.check(WELCOME_MARKDOWN.startsWith('# '), '以一级标题开头')

h.section('6. 每一行都是完整的一条')
// 编辑区按源码换行渲染（white-space: pre-wrap）：
// 一行以逗号或分号结尾，说明这句话还没说完、下一行是它的续行 ——
// 渲染出来会像另一条独立的内容。
const dangling = WELCOME_MARKDOWN.split('\n').filter((line) => /[，；,;]$/.test(line.trim()))
h.check(dangling.length === 0, '没有写了一半的行', dangling.join(' | '))

finish(h)
