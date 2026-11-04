/**
 * 浏览器里的端到端测试：模拟真实按键（浏览器真实按键会先触发 beforeinput）。
 * 由 vite 打包后在浏览器里运行。
 */
import { MarkdownEditor } from '../src/editor/editor'
import type { EditorOptions, EditorStats } from '../src/editor/types'
import type { LinkProvider } from '../src/core/types'
import type { Logger } from '../src/core/logger'
import { positionForSourceOffset, renderTokens, serializeNodes, sourceOffsetAt } from '../src/markdown/dom'
import { parseMarkdown } from '../src/markdown/parser'
import { createApp, nextTick } from 'vue'
import App from '../src/App.vue'
import { removePage } from '../src/pages/store'
import { createHarness } from './harness'

const lines: string[] = []
const h = createHarness((line) => lines.push(line))
let activeRoot: HTMLElement | null = null

function makeEditor(options?: EditorOptions): { root: HTMLElement; editor: MarkdownEditor } {
  const root = document.createElement('div')
  root.className = 'editor'
  root.contentEditable = 'true'
  document.body.appendChild(root)
  const editor = new MarkdownEditor(root, options)
  root.focus()
  activeRoot = root
  return { root, editor }
}

/** 模拟真实按键输入（浏览器真实按键会先触发 beforeinput） */
function type(text: string): void {
  activeRoot!.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: text,
    }),
  )
}

/** 模拟真实退格 */
function backspace(): void {
  activeRoot!.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'deleteContentBackward',
      data: null,
    }),
  )
}

/** 一个字符一个字符地输入 */
function typeAll(text: string): void {
  for (const char of text) type(char)
}

function visible(root: HTMLElement): string {
  return root.textContent ?? ''
}

function tag(root: HTMLElement): string {
  return root.innerHTML.replace(/ data-md(-end)?="[^"]*"/g, '')
}

/** 内容排了几行（按不同的行顶算） */
function lineCount(node: Node): number {
  const range = document.createRange()
  range.selectNodeContents(node)
  const tops = new Set<number>()
  for (const rect of Array.from(range.getClientRects())) tops.add(Math.round(rect.top))
  return tops.size
}

/**
 * 文字排了几行（按不同的行顶算）。
 *
 * 和 `lineCount` 的区别：只看文字本身，不算元素的盒子。
 * 标题是行内块，它的盒子和里面的文字是两个不同的行顶，
 * 直接用 `lineCount` 会把同一行算成两行。
 */
function textLineCount(root: HTMLElement): number {
  const tops = new Set<number>()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const range = document.createRange()
    range.selectNodeContents(node)
    for (const rect of Array.from(range.getClientRects())) {
      // 换行会留下一个零宽的片段，不算一行
      if (rect.height > 0 && rect.width > 0) tops.add(Math.round(rect.top))
    }
    node = walker.nextNode()
  }
  return tops.size
}

/** 模拟回车 */
function enter(): void {
  activeRoot!.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertParagraph',
      data: null,
    }),
  )
}

/** 模拟按键 */
function press(key: string, init: KeyboardEventInit = {}): void {
  activeRoot!.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init }),
  )
}

/** 模拟浏览器在组合输入期间改 DOM：把文字插到光标所在的位置 */
function insertComposingText(text: string): Text {
  const selection = window.getSelection()!
  const range = selection.getRangeAt(0)
  const node = document.createTextNode(text)
  range.insertNode(node)

  const after = document.createRange()
  after.setStart(node, node.data.length)
  after.collapse(true)
  selection.removeAllRanges()
  selection.addRange(after)

  activeRoot!.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
  return node
}

// ---------------------------------------------------------------- 加粗

{
  const { root, editor } = makeEditor()

  type('*')
  h.check(visible(root) === '*', '加粗：输入 * 显示为 *', visible(root))
  h.check(editor.markdown === '*', '加粗：源码为 *', editor.markdown)

  type('*')
  h.check(visible(root) === '**', '加粗：输入 ** 显示为 **', visible(root))

  type(' ')
  h.check(visible(root) === '** ', '加粗：输入 ** 空格', JSON.stringify(visible(root)))
  h.check(editor.markdown === '** ', '加粗：源码 ** 空格', JSON.stringify(editor.markdown))

  type('hello')
  h.check(visible(root) === '** hello', '加粗：输入 ** hello', visible(root))

  type(' ')
  h.check(visible(root) === '** hello ', '加粗：输入 ** hello 空格', JSON.stringify(visible(root)))

  type('*')
  h.check(visible(root) === '** hello *', '加粗：输入 ** hello *', visible(root))

  type('*')
  h.check(visible(root) === ' hello ', '加粗：闭合后显示 hello', JSON.stringify(visible(root)))
  h.check(root.querySelector('strong') !== null, '加粗：闭合后是 strong 标签', tag(root))
  h.check(editor.markdown === '** hello **', '加粗：源码保留标记', editor.markdown)

  // 闭合之后继续输入，应该落在加粗之外
  type('world')
  h.check(visible(root) === ' hello world', '加粗：闭合后继续输入', JSON.stringify(visible(root)))
  h.check(editor.markdown === '** hello **world', '加粗：闭合后继续输入的源码', editor.markdown)
  h.check(
    root.querySelector('strong')?.textContent === ' hello ',
    '加粗：world 不在 strong 里',
    tag(root),
  )
}

// ---------------------------------------------------------------- 行内代码

{
  const { root, editor } = makeEditor()

  type('`')
  h.check(visible(root) === '`', '行内代码：输入 ` 显示为 `', visible(root))

  type('hello')
  h.check(visible(root) === '`hello', '行内代码：输入 `hello', visible(root))

  type('`')
  h.check(visible(root) === 'hello', '行内代码：闭合后显示 hello', JSON.stringify(visible(root)))
  h.check(root.querySelector('code') !== null, '行内代码：闭合后是 code 标签', tag(root))
  h.check(editor.markdown === '`hello`', '行内代码：源码保留标记', editor.markdown)

  type(' world')
  h.check(visible(root) === 'hello world', '行内代码：闭合后继续输入', JSON.stringify(visible(root)))
  h.check(editor.markdown === '`hello` world', '行内代码：闭合后继续输入的源码', editor.markdown)
}

// ---------------------------------------------------------------- 标题

{
  const { root, editor } = makeEditor()

  type('#')
  h.check(visible(root) === '#', '标题：输入 # 显示为 #', visible(root))
  h.check(editor.markdown === '#', '标题：源码为 #', editor.markdown)
  h.check(root.querySelector('h1') === null, '标题：只有 # 还不是标题', tag(root))

  type(' ')
  h.check(root.querySelector('h1') !== null, '标题：打完空格变成 h1', tag(root))
  h.check(visible(root) === '', '标题：标记被消费', JSON.stringify(visible(root)))
  h.check(editor.markdown === '# ', '标题：源码保留标记', JSON.stringify(editor.markdown))

  type('标题')
  h.check(visible(root) === '标题', '标题：内容正常显示', JSON.stringify(visible(root)))
  h.check(root.querySelector('h1')?.textContent === '标题', '标题：内容在 h1 里', tag(root))
  h.check(editor.markdown === '# 标题', '标题：源码是 # 标题', editor.markdown)
  h.check(serializeNodes(root) === '# 标题', '标题：DOM 还原成源码', JSON.stringify(serializeNodes(root)))

  // 光标在标题内容末尾
  const range = window.getSelection()?.getRangeAt(0)
  h.check(
    range?.startContainer === root.querySelector('h1')?.firstChild,
    '标题：光标在标题内容末尾',
    `${range?.startContainer.nodeName}`,
  )
}

{
  const { root, editor } = makeEditor()

  typeAll('## 二级')
  h.check(root.querySelector('h2') !== null, '标题：两个井号是二级标题', tag(root))
  h.check(root.querySelector('h2')?.textContent === '二级', '标题：二级标题内容', tag(root))
  h.check(editor.markdown === '## 二级', '标题：二级标题源码', editor.markdown)
}

{
  // 退格删掉空格，标题就变回普通文本
  const { root, editor } = makeEditor()

  type('#')
  type(' ')
  h.check(root.querySelector('h1') !== null, '标题（退格）：先变成标题', tag(root))

  backspace()
  h.check(editor.markdown === '#', '标题（退格）：删掉空格后的源码', JSON.stringify(editor.markdown))
  h.check(visible(root) === '#', '标题（退格）：变回普通文本', JSON.stringify(visible(root)))
  h.check(root.querySelector('h1') === null, '标题（退格）：不再是标题', tag(root))
}

{
  // 标题结束之后，正文另起一行，中间不能多出空行
  const { root, editor } = makeEditor()

  typeAll('# 标题')
  enter()
  h.check(editor.markdown === '# 标题\n', '标题（回车）：源码以换行结尾', JSON.stringify(editor.markdown))

  // 光标要落到新的一行上，不能留在标题里
  const tail = root.lastElementChild
  h.check(
    tail instanceof HTMLElement && tail.hasAttribute('data-md-tail'),
    '标题（回车）：末尾补上占位元素',
    tag(root),
  )
  h.check(
    window.getSelection()?.getRangeAt(0)?.startContainer === tail,
    '标题（回车）：光标落到标题外面',
    `${window.getSelection()?.getRangeAt(0)?.startContainer.nodeName}`,
  )

  typeAll('正文')
  h.check(editor.markdown === '# 标题\n正文', '标题（回车）：继续输入', JSON.stringify(editor.markdown))
  h.check(root.querySelector('h1')?.textContent === '标题', '标题（回车）：正文没有跑进标题', tag(root))
  h.check(textLineCount(root) === 2, '标题（回车）：标题和正文各占一行', `排了 ${textLineCount(root)} 行`)
}

{
  // 标题前面有正文时，标题另起一行
  const { root, editor } = makeEditor()

  typeAll('正文')
  enter()
  typeAll('# 标题')
  h.check(editor.markdown === '正文\n# 标题', '标题（正文后）：源码', JSON.stringify(editor.markdown))
  h.check(root.querySelector('h1')?.textContent === '标题', '标题（正文后）：标题内容', tag(root))
  h.check(textLineCount(root) === 2, '标题（正文后）：正文和标题各占一行', `排了 ${textLineCount(root)} 行`)
}

{
  // 标题里也能用输入法
  const { root, editor } = makeEditor()

  typeAll('# ')
  root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))

  const heading = root.querySelector('h1')!
  const textNode = document.createTextNode('中文')
  heading.appendChild(textNode)
  const range = document.createRange()
  range.setStart(textNode, 2)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  root.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))

  root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' }))
  h.check(editor.markdown === '# 中文', '标题（输入法）：组合输入结束后同步源码', JSON.stringify(editor.markdown))
  h.check(root.querySelector('h1')?.textContent === '中文', '标题（输入法）：文字留在标题里', tag(root))
}

// ---------------------------------------------------------------- 编辑已有内容

{
  const { root, editor } = makeEditor()

  typeAll('**hello**')
  h.check(visible(root) === 'hello', '编辑：加粗后显示 hello', JSON.stringify(visible(root)))

  // 光标在末尾，退格先删掉收尾的 *
  backspace()
  h.check(editor.markdown === '**hello*', '编辑：退格删掉收尾标记', editor.markdown)
  h.check(visible(root) === '**hello*', '编辑：退格后重新显示为原文', JSON.stringify(visible(root)))

  backspace()
  h.check(editor.markdown === '**hello', '编辑：再退格一次', editor.markdown)

  type('!')
  h.check(editor.markdown === '**hello!', '编辑：继续输入', editor.markdown)
}

// ---------------------------------------------------------------- 光标位置

{
  const { root, editor } = makeEditor()

  typeAll('**ab**')
  h.check(editor.markdown === '**ab**', '光标：加粗源码', editor.markdown)

  // 光标应该落在 strong 之后
  const selection = window.getSelection()
  const range = selection?.getRangeAt(0)
  const container = range?.startContainer
  h.check(
    container === root && range?.startOffset === 1,
    '光标：闭合后位于 strong 之后',
    `${container?.nodeName}#${range?.startOffset}`,
  )
}

// ---------------------------------------------------------------- 撤销

{
  const { editor } = makeEditor()

  typeAll('**hi**')
  h.check(editor.markdown === '**hi**', '撤销：输入后源码', editor.markdown)
  editor.undo()
  h.check(editor.markdown === '**hi*', '撤销：回退一步', editor.markdown)
  editor.redo()
  h.check(editor.markdown === '**hi**', '撤销：重做', editor.markdown)
}

{
  // 换文档（弹窗里翻页）之后，撤销不会把上一个文档的内容恢复出来
  const { editor } = makeEditor()

  typeAll('aaa')
  editor.setSource('bbb')
  h.check(editor.markdown === 'bbb', '撤销（换文档）：内容换成新的', editor.markdown)

  editor.undo()
  h.check(editor.markdown === 'bbb', '撤销（换文档）：撤销不会退回上一个文档', editor.markdown)

  // 换完文档之后，这一篇自己的撤销还是正常的
  typeAll('c')
  h.check(editor.markdown === 'bbbc', '撤销（换文档）：新文档里照常输入', editor.markdown)
  editor.undo()
  h.check(editor.markdown === 'bbb', '撤销（换文档）：新文档里也能撤销', editor.markdown)
}

// ---------------------------------------------------------------- 回车 / 粘贴 / 选区

{
  const { editor } = makeEditor()

  typeAll('a')
  enter()
  h.check(editor.markdown === 'a\n', '回车：插入换行', JSON.stringify(editor.markdown))
  typeAll('b')
  h.check(editor.markdown === 'a\nb', '回车：换行后继续输入', JSON.stringify(editor.markdown))
}

// ---------------------------------------------------------------- 回车：最后一行
//
// 浏览器不会为结尾的换行符生成行盒，光标会被画在上一行的末尾，
// 看上去就是「按了回车却没有换行」。所以结尾有换行时要补一个占位元素。

{
  const { root, editor } = makeEditor()

  typeAll('hello')
  enter()
  h.check(editor.markdown === 'hello\n', '回车：源码以换行结尾', JSON.stringify(editor.markdown))

  const tail = root.lastElementChild
  h.check(
    tail instanceof HTMLElement && tail.hasAttribute('data-md-tail'),
    '回车：末尾补上占位元素，撑出最后一行',
    tag(root),
  )

  // 光标要落在占位元素里，否则浏览器会把它画在上一行末尾
  const range = window.getSelection()?.getRangeAt(0)
  h.check(
    range?.startContainer === tail,
    '回车：光标落在占位元素里（最后一行）',
    `${range?.startContainer.nodeName}`,
  )

  // 占位元素只是渲染用的，不能混进源码
  h.check(serializeNodes(root) === 'hello\n', '回车：占位元素不进入源码', JSON.stringify(serializeNodes(root)))
  h.check(
    sourceOffsetAt(root, tail!, 0) === editor.markdown.length,
    '回车：占位元素对应源码末尾',
    String(sourceOffsetAt(root, tail!, 0)),
  )

  // 继续输入应该落在新的一行上
  typeAll('world')
  h.check(editor.markdown === 'hello\nworld', '回车：换行后继续输入', JSON.stringify(editor.markdown))
  h.check(
    root.querySelector('[data-md-tail]') === null,
    '回车：不再以换行结尾时占位元素消失',
    tag(root),
  )
}

{
  const { root, editor } = makeEditor()

  typeAll('hello')
  // 模拟粘贴：paste 事件会被阻止，文本由我们自己插入
  const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(paste, 'clipboardData', {
    value: { getData: () => '**world**' },
  })
  root.dispatchEvent(paste)
  h.check(editor.markdown === 'hello**world**', '粘贴：插入纯文本', JSON.stringify(editor.markdown))
  h.check(root.querySelector('strong') !== null, '粘贴：粘贴内容也走 Markdown 渲染', tag(root))
}

{
  const { root, editor } = makeEditor()

  typeAll('abcdef')
  // 选中中间两个字符后输入，替换选区
  const textNode = root.firstChild!
  const range = document.createRange()
  range.setStart(textNode, 2)
  range.setEnd(textNode, 4)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)

  type('X')
  h.check(editor.markdown === 'abXef', '选区：输入替换选中的内容', JSON.stringify(editor.markdown))
}

// ---------------------------------------------------------------- 输入法组合输入

{
  const { root, editor } = makeEditor()

  typeAll('**')
  root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))

  // 浏览器在组合输入期间会直接改 DOM
  const textNode = document.createTextNode('中文')
  root.appendChild(textNode)
  const range = document.createRange()
  range.setStart(textNode, 2)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  root.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))

  root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' }))
  h.check(editor.markdown === '**中文', '输入法：组合输入结束后同步源码', JSON.stringify(editor.markdown))

  typeAll('**')
  h.check(editor.markdown === '**中文**', '输入法：组合输入后可以继续闭合加粗', JSON.stringify(editor.markdown))
  h.check(root.querySelector('strong') !== null, '输入法：组合输入内容被加粗', tag(root))
}

// ---------------------------------------------------------------- 输入法：换行之后

{
  const { root, editor } = makeEditor()

  typeAll('hello')
  enter()
  h.check(editor.markdown === 'hello\n', '输入法（换行后）：源码以换行结尾', JSON.stringify(editor.markdown))

  // 光标停在末尾的占位元素里，组合输入的文字会被浏览器插进这个元素
  const tail = root.lastElementChild!
  h.check(tail.hasAttribute('data-md-tail'), '输入法（换行后）：光标在末尾占位元素里', tail.outerHTML)

  root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  const composing = insertComposingText('nihao')

  h.check(
    lineCount(composing) === 1,
    '输入法（换行后）：组合输入的文字排在一行里（不是一字一行）',
    `排了 ${lineCount(composing)} 行`,
  )

  // 组合输入结束，文字进入源码
  root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'nihao' }))
  h.check(
    editor.markdown === 'hello\nnihao',
    '输入法（换行后）：组合输入结束后同步源码',
    JSON.stringify(editor.markdown),
  )
  h.check(root.querySelector('[data-md-tail]') === null, '输入法（换行后）：不再以换行结尾时占位元素消失', tag(root))
}

// ---------------------------------------------------------------- 输入法：组合输入被取消

{
  const { root, editor } = makeEditor()

  typeAll('hello')
  enter()
  root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  insertComposingText('nihao')

  // 浏览器取消组合输入时，会把占位元素换成一个 <br>
  const tail = root.querySelector('[data-md-tail]')!
  tail.replaceWith(document.createElement('br'))

  root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))

  h.check(editor.markdown === 'hello\n', '输入法（取消）：源码没有多出换行', JSON.stringify(editor.markdown))
  h.check(root.querySelector('[data-md-tail]') !== null, '输入法（取消）：占位元素被恢复', tag(root))
  h.check(root.querySelector('br') === null, '输入法（取消）：浏览器留下的 <br> 被清掉', tag(root))
}

// ---------------------------------------------------------------- 光标映射

{
  const root = document.createElement('div')
  document.body.appendChild(root)
  renderTokens(parseMarkdown('**a`b`c**'), root)

  // 源码 "**a`b`c**"：加粗内容里的代码，源码偏移 4 落在 code 内部
  const pos = positionForSourceOffset(root, 4)
  h.check(
    (pos.node as Element).tagName === 'CODE' ||
      (pos.node as Node).parentElement?.tagName === 'CODE',
    '光标映射：加粗里的代码定位到 code 内部',
    `${(pos.node as Node).nodeName}`,
  )
  h.check(
    sourceOffsetAt(root, pos.node, pos.offset) === 4,
    '光标映射：偏移可以原样还原',
    String(sourceOffsetAt(root, pos.node, pos.offset)),
  )

  // 普通文本位置
  const textPos = positionForSourceOffset(root, 2)
  h.check(
    sourceOffsetAt(root, textPos.node, textPos.offset) === 2,
    '光标映射：普通文本位置可以原样还原',
    String(sourceOffsetAt(root, textPos.node, textPos.offset)),
  )

  // 标题：源码 "# 标题"，标题内容从偏移 2 开始
  const headingRoot = document.createElement('div')
  document.body.appendChild(headingRoot)
  renderTokens(parseMarkdown('# 标题'), headingRoot)

  const headingPos = positionForSourceOffset(headingRoot, 3)
  h.check(
    sourceOffsetAt(headingRoot, headingPos.node, headingPos.offset) === 3,
    '光标映射：标题里的位置可以原样还原',
    String(sourceOffsetAt(headingRoot, headingPos.node, headingPos.offset)),
  )
  h.check(
    (headingPos.node as Element).tagName === 'H1' ||
      (headingPos.node as Node).parentElement?.tagName === 'H1',
    '光标映射：标题里的位置落在 h1 内部',
    `${(headingPos.node as Node).nodeName}`,
  )
}

// ---------------------------------------------------------------- 源码往返

{
  // 源码 -> DOM -> 源码，必须原样还原
  const samples = [
    '',
    '正文',
    '# 标题',
    '# ',
    '# 标题\n',
    '# 标题\n正文',
    '正文\n# 标题',
    '正文\n# 标题\n正文',
    '# 标题\n\n## 二级标题\n',
    '# **加粗** 标题',
    '# `代码` 标题',
    '**加粗**\n# 标题\n`代码`',
    '## 二级标题',
    'a\nb\n# c\nd',
    '# 标题\n**加粗**\n# 另一个\n',
  ]
  for (const sample of samples) {
    const root = document.createElement('div')
    document.body.appendChild(root)
    renderTokens(parseMarkdown(sample), root)
    h.check(
      serializeNodes(root) === sample,
      `源码往返：${JSON.stringify(sample)}`,
      JSON.stringify(serializeNodes(root)),
    )
  }
}

// ---------------------------------------------------------------- 全选 / 删除

{
  const { root, editor } = makeEditor()

  // 内容只剩一个空行内元素时，浏览器的全选只会得到一个空选区，
  // 「全选 + 删除」就删不掉东西，这里要自己实现全选
  typeAll('****')
  h.check(editor.markdown === '****', '全选：源码是 ****', editor.markdown)
  h.check(root.querySelector('strong') !== null, '全选：渲染成空的 strong', tag(root))

  root.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'a', metaKey: true }),
  )
  const range = window.getSelection()?.getRangeAt(0)
  h.check(
    range?.startContainer === root && range?.startOffset === 0 && range?.endOffset === 1,
    '全选：选中整个文档',
    `${range?.startContainer.nodeName}@${range?.startOffset}..${range?.endOffset}`,
  )

  root.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'deleteContentBackward',
    }),
  )
  h.check(editor.markdown === '', '全选：删除后内容清空', JSON.stringify(editor.markdown))
}

// ---------------------------------------------------------------- 双向链接

/** 造一个页面仓库的替身 */
function makeLinkProvider(titles: string[] = []): {
  provider: LinkProvider
  created: string[]
  store: Map<string, string>
} {
  const store = new Map<string, string>()
  for (const title of titles) store.set(title, '')
  const created: string[] = []

  const provider: LinkProvider = {
    suggest: (query) => {
      const keyword = query.trim().toLowerCase()
      return {
        candidates: [...store.keys()]
          .filter((title) => !keyword || title.toLowerCase().includes(keyword))
          .map((title) => ({ title, preview: '', exists: true })),
      }
    },
    create: (title) => {
      created.push(title)
      store.set(title, '')
      return { ok: true }
    },
    exists: (title) => store.has(title),
  }

  return { provider, created, store }
}

{
  // 输入 [[ 就弹出候选窗口；一个页面都没有时候选是空的
  const { provider } = makeLinkProvider()
  const { editor } = makeEditor({ links: provider })

  type('[')
  h.check(editor.suggestion === null, '链接：只有一个 [ 不弹窗口')

  type('[')
  h.check(editor.suggestion !== null, '链接：输入 [[ 弹出候选窗口')
  h.check(editor.suggestion?.query === '', '链接：刚输入时查询词为空', JSON.stringify(editor.suggestion?.query))
  h.check(editor.suggestion?.candidates.length === 0, '链接：没有页面时没有候选')
  h.check(editor.suggestion?.rect !== null, '链接：候选窗口知道光标的位置')
}

{
  // 输入 [[hello 回车：创建页面并补全成 [[hello]]
  const { provider, created } = makeLinkProvider()
  const { root, editor } = makeEditor({ links: provider })

  typeAll('[[')
  typeAll('hello')

  const state = editor.suggestion
  h.check(state?.candidates.length === 1, '链接：没有同名页面时只有一项候选', String(state?.candidates.length))
  h.check(state?.candidates[0]?.title === 'hello', '链接：候选项是输入的内容', state?.candidates[0]?.title)
  h.check(state?.candidates[0]?.exists === false, '链接：候选项表示新建页面')
  h.check(state?.selected === 0, '链接：默认高亮第一项')

  press('Enter')
  h.check(editor.markdown === '[[hello]]', '链接：回车补全成 [[hello]]', JSON.stringify(editor.markdown))
  h.check(created.length === 1 && created[0] === 'hello', '链接：回车创建了页面', JSON.stringify(created))
  h.check(editor.suggestion === null, '链接：接受候选后窗口关闭')
  h.check(root.querySelector('a[data-md-link]') !== null, '链接：渲染成可点击的链接', tag(root))
  h.check(visible(root) === 'hello', '链接：显示页面名', JSON.stringify(visible(root)))
  h.check(
    root.querySelector('a[data-md-link]')?.getAttribute('data-page') === 'hello',
    '链接：链接上带着页面名',
    tag(root),
  )
}

{
  // 已经有同名页面时，候选里是那个页面，回车不会再创建
  const { provider, created } = makeLinkProvider(['hello'])
  const { editor } = makeEditor({ links: provider })

  typeAll('[[')
  typeAll('hello')

  h.check(editor.suggestion?.candidates.length === 1, '链接：同名页面只有一项候选', String(editor.suggestion?.candidates.length))
  h.check(editor.suggestion?.candidates[0]?.exists === true, '链接：候选项是已有页面')

  press('Enter')
  h.check(editor.markdown === '[[hello]]', '链接：回车补全成 [[hello]]', JSON.stringify(editor.markdown))
  h.check(created.length === 0, '链接：同名页面不会被重复创建', JSON.stringify(created))
}

{
  // 候选列表会跟着查询词过滤
  const { provider } = makeLinkProvider(['hello', 'help', 'world'])
  const { editor } = makeEditor({ links: provider })

  typeAll('[[')
  h.check(editor.suggestion?.candidates.length === 3, '链接：空查询时列出所有页面', String(editor.suggestion?.candidates.length))
  h.check(editor.suggestion?.selected === 0, '链接：空查询时高亮第一项', String(editor.suggestion?.selected))

  typeAll('hel')
  h.check(editor.suggestion?.candidates.length === 3, '链接：查询词会带上新建选项', String(editor.suggestion?.candidates.length))
  h.check(editor.suggestion?.candidates[0]?.exists === false, '链接：新建选项排在最前面')
  h.check(editor.suggestion?.candidates[1]?.title === 'hello', '链接：匹配的页面排在后面', editor.suggestion?.candidates[1]?.title)
}

{
  // 窗口开着的时候，回车选中的就是看到的那一项
  const { provider } = makeLinkProvider(['hello'])
  const { editor } = makeEditor({ links: provider })

  typeAll('[[')
  press('Enter')
  h.check(editor.markdown === '[[hello]]', '链接：空查询时回车选中第一项', JSON.stringify(editor.markdown))
}

{
  // 上下键切换候选项，回车选中高亮的那一个
  const { provider, created } = makeLinkProvider(['hello', 'help'])
  const { editor } = makeEditor({ links: provider })

  typeAll('[[')
  h.check(editor.suggestion?.selected === 0, '链接：默认高亮第一项', String(editor.suggestion?.selected))

  press('ArrowDown')
  h.check(editor.suggestion?.selected === 1, '链接：下键切到第二项', String(editor.suggestion?.selected))
  press('ArrowUp')
  h.check(editor.suggestion?.selected === 0, '链接：上键回到第一项', String(editor.suggestion?.selected))

  // 到头会绕回来
  press('ArrowUp')
  h.check(editor.suggestion?.selected === 1, '链接：上键到头会绕到最后一项', String(editor.suggestion?.selected))

  press('ArrowUp')
  press('Enter')
  h.check(editor.markdown === '[[hello]]', '链接：回车接受高亮的候选项', JSON.stringify(editor.markdown))
  h.check(created.length === 0, '链接：已有页面不会被重复创建', JSON.stringify(created))
}

{
  // Esc 关掉窗口，之后继续输入也不会再弹出来
  const { provider } = makeLinkProvider()
  const { editor } = makeEditor({ links: provider })

  typeAll('[[')
  h.check(editor.suggestion !== null, '链接（Esc）：先弹出窗口')

  press('Escape')
  h.check(editor.suggestion === null, '链接（Esc）：窗口关掉了')

  typeAll('hello')
  h.check(editor.suggestion === null, '链接（Esc）：继续输入也不会再弹出来')
}

{
  // 点击链接：打开对应的页面
  const { provider } = makeLinkProvider()
  let opened: string | null = null
  const { root } = makeEditor({
    links: provider,
    onOpenPage: (title) => {
      opened = title
    },
  })

  typeAll('[[')
  typeAll('hello')
  press('Enter')
  h.check(opened === null, '链接（点击）：输入的时候不会打开页面')

  const link = root.querySelector('a[data-md-link]')!
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  h.check(opened === 'hello', '链接（点击）：点击链接打开页面', String(opened))
}

{
  // 链接也可以在加粗和标题里
  const { provider } = makeLinkProvider()
  const { root, editor } = makeEditor({ links: provider })

  typeAll('**')
  typeAll('[[')
  typeAll('hello')
  press('Enter')
  typeAll('**')
  h.check(editor.markdown === '**[[hello]]**', '链接：加粗里的链接', JSON.stringify(editor.markdown))
  h.check(root.querySelector('strong a[data-md-link]') !== null, '链接：渲染在加粗里面', tag(root))
}

{
  // 代码里的 [[ 不弹窗口
  const { provider } = makeLinkProvider()
  const { editor } = makeEditor({ links: provider })

  typeAll('`')
  typeAll('[[')
  h.check(editor.suggestion === null, '链接：代码里的 [[ 不弹窗口')
}

{
  // 编辑区失去焦点，候选窗口就关掉
  const { provider } = makeLinkProvider()
  const { root, editor } = makeEditor({ links: provider })

  typeAll('[[')
  h.check(editor.suggestion !== null, '链接（失焦）：先弹出窗口')

  root.dispatchEvent(new FocusEvent('blur'))
  h.check(editor.suggestion === null, '链接（失焦）：失焦后窗口关掉了')
}

{
  // 断链：页面还不存在的链接要标出来
  const { provider } = makeLinkProvider()
  const { root, editor } = makeEditor({ links: provider })

  typeAll('[[ghost]]')
  const link = root.querySelector('a[data-md-link]')
  h.check(link !== null, '断链：写出来的链接渲染成链接', tag(root))
  h.check(link?.classList.contains('is-missing') === true, '断链：页面不存在时标成断链', tag(root))
  h.check(
    link?.getAttribute('title') === '页面「ghost」还不存在',
    '断链：鼠标停上去有提示',
    link?.getAttribute('title') ?? '',
  )

  // 页面有了，就不再是断链
  provider.create('ghost')
  editor.refreshLinks()
  h.check(link?.classList.contains('is-missing') === false, '断链：页面有了之后不再是断链', tag(root))
  h.check(
    link?.getAttribute('title') === '打开页面「ghost」',
    '断链：页面有了之后提示也跟着变',
    link?.getAttribute('title') ?? '',
  )
}

{
  // 光标停在链接里，Cmd+Enter 就能打开这个页面
  const { provider } = makeLinkProvider()
  let opened: string | null = null
  const { root } = makeEditor({
    links: provider,
    onOpenPage: (title) => {
      opened = title
    },
  })

  typeAll('[[hello]]')
  const link = root.querySelector('a[data-md-link]')!

  // 把光标放到链接里面
  const range = document.createRange()
  range.setStart(link.firstChild!, 1)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)

  press('Enter', { metaKey: true })
  h.check(opened === 'hello', '链接（快捷键）：Cmd+Enter 打开光标处的页面', String(opened))
}

// ---------------------------------------------------------------- 草稿回显（App 级别）

{
  // 用真实的 App 组件跑一遍「还没创建的页面」的完整流程。
  // 这条路径以前是坏的：草稿只写不读，关掉弹窗再打开就是空的，
  // 用户会以为没保存成功，于是重写一遍，把之前的内容覆盖掉。
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(App)
  app.mount(host)

  const bodyEditor = host.querySelector('.editor') as HTMLElement
  activeRoot = bodyEditor
  bodyEditor.focus()
  typeAll('[[草稿页]]')

  const link = bodyEditor.querySelector('a[data-md-link]') as HTMLElement
  h.check(link !== null, '草稿：正文里的链接渲染出来了', tag(bodyEditor))
  link.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await nextTick()

  const popup = host.querySelector('.popup') as HTMLElement
  h.check(popup !== null, '草稿：点链接弹出页面弹窗')
  const popupEditor = popup.querySelector('.editor') as HTMLElement
  h.check(visible(popupEditor) === '', '草稿：刚打开时弹窗是空的', visible(popupEditor))

  // 在弹窗里输入
  activeRoot = popupEditor
  typeAll('hello')
  h.check(visible(popupEditor) === 'hello', '草稿：弹窗里输入了 hello', visible(popupEditor))

  // 关掉弹窗：弹窗卸载，编辑器销毁
  ;(popup.querySelector('.popup-close') as HTMLElement).dispatchEvent(
    new MouseEvent('click', { bubbles: true }),
  )
  await nextTick()
  h.check(host.querySelector('.popup') === null, '草稿：弹窗关掉了')

  // 再点一次链接，重新打开
  link.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await nextTick()
  const reopened = host.querySelector('.popup') as HTMLElement
  const reopenedEditor = reopened.querySelector('.editor') as HTMLElement
  h.check(
    visible(reopenedEditor) === 'hello',
    '草稿：重新打开，之前写的内容还在',
    visible(reopenedEditor),
  )

  // 继续输入：接着上次的内容写，不是从头来
  activeRoot = reopenedEditor
  typeAll(' world')
  h.check(
    visible(reopenedEditor) === 'hello world',
    '草稿：继续输入是接着写的',
    visible(reopenedEditor),
  )

  // 点「创建页面」：写入完整内容
  ;(reopened.querySelector('.popup-create') as HTMLElement).dispatchEvent(
    new MouseEvent('click', { bubbles: true }),
  )
  await nextTick()
  h.check(
    visible(reopenedEditor) === 'hello world',
    '草稿：创建页面后内容没变',
    visible(reopenedEditor),
  )

  // 页面建好了，正文里的链接不再是断链
  await nextTick()
  const linkAfter = bodyEditor.querySelector('a[data-md-link]') as HTMLElement
  h.check(
    linkAfter.classList.contains('is-missing') === false,
    '草稿：页面建好后，链接不再是断链',
    tag(bodyEditor),
  )

  app.unmount()
  host.remove()
  removePage('草稿页')
}

{
  // 候选来源一路传到弹窗里的编辑器：
  // provider 由组合根（App.vue）注入，组件自己不拿页面仓库。
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(App)
  app.mount(host)

  const bodyEditor = host.querySelector('.editor') as HTMLElement
  activeRoot = bodyEditor
  bodyEditor.focus()
  typeAll('[[候选页]]')

  const link = bodyEditor.querySelector('a[data-md-link]') as HTMLElement
  link.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await nextTick()

  const popup = host.querySelector('.popup') as HTMLElement
  const popupEditor = popup.querySelector('.editor') as HTMLElement
  activeRoot = popupEditor
  popupEditor.focus()
  typeAll('[[候')
  await nextTick()

  const suggest = host.querySelector('.link-suggest') as HTMLElement
  h.check(suggest !== null, '弹窗：编辑器也拿到了候选来源，窗口弹出来了', tag(host))
  h.check(
    suggest?.querySelector('.link-suggest-item') !== null,
    '弹窗：候选窗口里有「新建页面」这一项',
    tag(suggest ?? host),
  )

  app.unmount()
  host.remove()
  removePage('候选页')
}

{
  // 弹窗头部：不显示页面标题，只有「关闭」；
  // 「返回」只在真的能返回（有上一层）时才出现。
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(App)
  app.mount(host)

  const bodyEditor = host.querySelector('.editor') as HTMLElement
  activeRoot = bodyEditor
  bodyEditor.focus()
  typeAll('[[第一页]]')

  const link = bodyEditor.querySelector('a[data-md-link]') as HTMLElement
  link.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await nextTick()

  const popup = host.querySelector('.popup') as HTMLElement
  h.check(popup !== null, '弹窗：点链接弹出页面弹窗')

  const head = popup.querySelector('.popup-head') as HTMLElement

  // 头部不显示页面标题
  h.check(head.querySelector('.popup-title') === null, '弹窗：标题栏里没有标题', tag(head))
  h.check(
    !(head.textContent ?? '').includes('第一页'),
    '弹窗：标题栏里不出现页面名',
    head.textContent ?? '',
  )
  // 标题不显示了，但弹窗的无障碍名称还在（读屏软件仍能知道这是哪个页面）
  h.check(
    popup.getAttribute('aria-label') === '第一页',
    '弹窗：aria-label 保留页面名',
    popup.getAttribute('aria-label') ?? '',
  )

  // 第一层没有上一层可回：「返回」不出现
  h.check(head.querySelector('.popup-back') === null, '弹窗：第一层没有「返回」按钮', tag(head))
  h.check(head.querySelector('.popup-close') !== null, '弹窗：有「关闭」按钮', tag(head))

  // 「关闭」靠右（没有「返回」时也不会跑到左边）
  const headRect = head.getBoundingClientRect()
  const closeRect = (head.querySelector('.popup-close') as HTMLElement).getBoundingClientRect()
  h.check(
    Math.abs(headRect.right - closeRect.right) < 2,
    '弹窗：「关闭」按钮靠右',
    `head.right=${headRect.right} close.right=${closeRect.right}`,
  )

  // 在弹窗里再点一个链接：有上一层了，「返回」出现
  const popupEditor = popup.querySelector('.editor') as HTMLElement
  activeRoot = popupEditor
  popupEditor.focus()
  typeAll('[[第二页]]')

  const innerLink = popupEditor.querySelector('a[data-md-link]') as HTMLElement
  h.check(innerLink !== null, '弹窗：弹窗里的链接渲染出来了', tag(popupEditor))
  innerLink.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await nextTick()

  const popup2 = host.querySelector('.popup') as HTMLElement
  const head2 = popup2.querySelector('.popup-head') as HTMLElement
  h.check(head2.querySelector('.popup-back') !== null, '弹窗：跳到第二层后出现「返回」', tag(head2))
  h.check(head2.querySelector('.popup-close') !== null, '弹窗：第二层也有「关闭」', tag(head2))
  h.check(
    !(head2.textContent ?? '').includes('第二页'),
    '弹窗：第二层也不显示页面名',
    head2.textContent ?? '',
  )

  // 「返回」靠左
  const head2Rect = head2.getBoundingClientRect()
  const backRect = (head2.querySelector('.popup-back') as HTMLElement).getBoundingClientRect()
  h.check(
    Math.abs(head2Rect.left - backRect.left) < 2,
    '弹窗：「返回」按钮靠左',
    `head.left=${head2Rect.left} back.left=${backRect.left}`,
  )

  // 点「返回」回到第一层，「返回」又消失
  ;(head2.querySelector('.popup-back') as HTMLElement).dispatchEvent(
    new MouseEvent('click', { bubbles: true }),
  )
  await nextTick()

  const popup3 = host.querySelector('.popup') as HTMLElement
  const head3 = popup3.querySelector('.popup-head') as HTMLElement
  h.check(
    head3.querySelector('.popup-back') === null,
    '弹窗：回到第一层后「返回」消失',
    tag(head3),
  )
  h.check(
    popup3.getAttribute('aria-label') === '第一页',
    '弹窗：返回后回到第一页',
    popup3.getAttribute('aria-label') ?? '',
  )

  app.unmount()
  host.remove()
  removePage('第一页')
  removePage('第二页')
}

{
  // 内容所有权契约：外部拥有内容时，靠版本号判断变更来源
  const { editor } = makeEditor({ ownership: 'controlled', externalVersion: 1 })

  typeAll('hello')
  h.check(editor.markdown === 'hello', '所有权：输入正常', editor.markdown)

  // 父组件回显同样的内容（版本号没变）：不动编辑区，撤销历史还在
  editor.applyExternalSource('hello', 1)
  h.check(editor.markdown === 'hello', '所有权：回显不改内容', editor.markdown)
  editor.undo()
  h.check(editor.markdown === 'hell', '所有权：回显之后撤销历史还在', editor.markdown)

  // 父组件真的换了内容（版本号变了）：换掉编辑区里的内容
  editor.applyExternalSource('别的内容', 2)
  h.check(editor.markdown === '别的内容', '所有权：版本号变了就换内容', editor.markdown)
}

// ---------------------------------------------------------------- 兜底还原

{
  // 浏览器插入的 <em> 不能被静默丢掉标记
  const root = document.createElement('div')
  root.className = 'editor'
  root.contentEditable = 'true'
  document.body.appendChild(root)
  const editor = new MarkdownEditor(root)
  root.focus()
  activeRoot = root

  // 模拟浏览器自己插入了一个 <em>（比如粘贴带格式的内容）
  root.innerHTML = '<em>hello</em>'
  editor.handleInput()

  h.check(
    editor.markdown.includes('*'),
    '兜底：<em> 序列化后保留了标记，没有被静默丢掉',
    JSON.stringify(editor.markdown),
  )
  h.check(
    editor.markdown.includes('hello'),
    '兜底：<em> 里的文字没有丢',
    JSON.stringify(editor.markdown),
  )
}

// ---------------------------------------------------------------- 可观察性

{
  // 「没有匹配页面」和「查询挂了」必须能区分开
  const provider: LinkProvider = {
    suggest: () => ({ candidates: [], error: '仓库挂了' }),
    create: () => ({ ok: true }),
    exists: () => true,
  }
  const { editor } = makeEditor({ links: provider })

  typeAll('[[')
  h.check(
    editor.suggestion?.error === '仓库挂了',
    '可观察：查询失败时状态里带上了原因',
    editor.suggestion?.error ?? '(没有)',
  )
  h.check(editor.suggestion?.candidates.length === 0, '可观察：查询失败时没有候选')
}

{
  // 只是没有匹配页面时，不是错误
  const { provider } = makeLinkProvider()
  const { editor } = makeEditor({ links: provider })

  typeAll('[[')
  h.check(editor.suggestion?.error === undefined, '可观察：没有匹配页面不算错误')
  h.check(editor.suggestion?.candidates.length === 0, '可观察：没有匹配页面时候选是空的')
}

{
  // 统计信息：性能 HUD 的数据来源
  let stats: EditorStats | null = null
  makeEditor({
    onStats: (value) => {
      stats = value
    },
  })

  typeAll('hello')
  h.check(stats !== null, '可观察：渲染后有统计信息')
  h.check(stats?.length === 5, '可观察：统计里有源码长度', String(stats?.length ?? ''))
  h.check(stats?.elements === 1, '可观察：统计里有元素数', String(stats?.elements ?? ''))
  h.check(typeof stats?.parseMs === 'number', '可观察：统计里有解析耗时')
  h.check(typeof stats?.renderMs === 'number', '可观察：统计里有渲染耗时')
}

{
  // logger 端口：注入就能拿到日志，不注入就什么都不发生
  const logs: string[] = []
  const logger: Logger = {
    debug: (message) => logs.push(message),
    warn: (message) => logs.push(message),
    error: (message) => logs.push(message),
  }
  makeEditor({ logger })
  typeAll('hi')
  h.check(logs.length > 0, '可观察：注入 logger 后能拿到日志', String(logs.length))
}

// ---------------------------------------------------------------- 源码往返（属性测试）

{
  /**
   * 固定种子的伪随机数（mulberry32）。
   *
   * 用固定种子，样本每次都一样：测试失败时能稳定复现。
   */
  function makeRandom(seed: number): () => number {
    let state = seed >>> 0
    return () => {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  /** 随机源码用的碎片：既有配对的标记，也有落单的标记 */
  const PIECES = [
    'hello',
    ' ',
    '\n',
    '**',
    '`',
    '[[',
    ']]',
    '#',
    'a',
    '中文',
    '**bold**',
    '`code`',
    '[[link]]',
    '*',
    '[',
    ']',
    '\n\n',
  ]

  function randomSource(rand: () => number): string {
    const count = 1 + Math.floor(rand() * 12)
    let out = ''
    for (let i = 0; i < count; i++) out += PIECES[Math.floor(rand() * PIECES.length)]!
    return out
  }

  /** 源码 -> token -> DOM -> 源码 */
  function roundTrip(source: string): string {
    const root = document.createElement('div')
    renderTokens(parseMarkdown(source), root)
    return serializeNodes(root)
  }

  // 边界情况：空串、纯标记、跨行、嵌套
  const edgeCases: string[] = [
    '',
    '**',
    '``',
    '[[',
    ']]',
    '**a\nb**',
    '**[[a]]**',
    '**`a`**',
    '# 标题\n\n正文',
    'a\n',
  ]

  const rand = makeRandom(20240607)
  const samples: string[] = [...edgeCases]
  for (let i = 0; i < 300; i++) samples.push(randomSource(rand))

  let broken = 0
  let firstBroken = ''
  for (const source of samples) {
    const actual = roundTrip(source)
    if (actual === source) continue
    broken += 1
    if (!firstBroken) {
      firstBroken = `${JSON.stringify(source)} => ${JSON.stringify(actual)}`
    }
  }

  h.check(
    broken === 0,
    `往返：${samples.length} 个样本（300 个随机 + ${edgeCases.length} 个边界）都能回到原文`,
    firstBroken ? `首个失败：${firstBroken}` : '',
  )
}

// ---------------------------------------------------------------- 输出

const failed = h.summary().failed
const output = document.createElement('pre')
output.id = 'output'
output.textContent = `${h.report()}\n\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`}`
document.body.appendChild(output)
document.title = failed === 0 ? 'ALL PASSED' : `${failed} FAILED`
