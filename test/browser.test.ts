/**
 * 浏览器里的端到端测试：模拟真实按键（浏览器真实按键会先触发 beforeinput）。
 * 由 vite 打包后在浏览器里运行。
 */
import { MarkdownEditor, type EditorOptions, type LinkProvider } from '../src/markdown/editor'
import { positionForSourceOffset, renderTokens, serializeNodes, sourceOffsetAt } from '../src/markdown/dom'
import { parseMarkdown } from '../src/markdown/parser'

const lines: string[] = []
let failed = 0
let activeRoot: HTMLElement | null = null

function check(ok: boolean, label: string, detail = ''): void {
  if (ok) {
    lines.push(`ok   ${label}${detail ? ` => ${detail}` : ''}`)
  } else {
    failed += 1
    lines.push(`FAIL ${label}${detail ? ` => ${detail}` : ''}`)
  }
}

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
  check(visible(root) === '*', '加粗：输入 * 显示为 *', visible(root))
  check(editor.markdown === '*', '加粗：源码为 *', editor.markdown)

  type('*')
  check(visible(root) === '**', '加粗：输入 ** 显示为 **', visible(root))

  type(' ')
  check(visible(root) === '** ', '加粗：输入 ** 空格', JSON.stringify(visible(root)))
  check(editor.markdown === '** ', '加粗：源码 ** 空格', JSON.stringify(editor.markdown))

  type('hello')
  check(visible(root) === '** hello', '加粗：输入 ** hello', visible(root))

  type(' ')
  check(visible(root) === '** hello ', '加粗：输入 ** hello 空格', JSON.stringify(visible(root)))

  type('*')
  check(visible(root) === '** hello *', '加粗：输入 ** hello *', visible(root))

  type('*')
  check(visible(root) === ' hello ', '加粗：闭合后显示 hello', JSON.stringify(visible(root)))
  check(root.querySelector('strong') !== null, '加粗：闭合后是 strong 标签', tag(root))
  check(editor.markdown === '** hello **', '加粗：源码保留标记', editor.markdown)

  // 闭合之后继续输入，应该落在加粗之外
  type('world')
  check(visible(root) === ' hello world', '加粗：闭合后继续输入', JSON.stringify(visible(root)))
  check(editor.markdown === '** hello **world', '加粗：闭合后继续输入的源码', editor.markdown)
  check(
    root.querySelector('strong')?.textContent === ' hello ',
    '加粗：world 不在 strong 里',
    tag(root),
  )
}

// ---------------------------------------------------------------- 行内代码

{
  const { root, editor } = makeEditor()

  type('`')
  check(visible(root) === '`', '行内代码：输入 ` 显示为 `', visible(root))

  type('hello')
  check(visible(root) === '`hello', '行内代码：输入 `hello', visible(root))

  type('`')
  check(visible(root) === 'hello', '行内代码：闭合后显示 hello', JSON.stringify(visible(root)))
  check(root.querySelector('code') !== null, '行内代码：闭合后是 code 标签', tag(root))
  check(editor.markdown === '`hello`', '行内代码：源码保留标记', editor.markdown)

  type(' world')
  check(visible(root) === 'hello world', '行内代码：闭合后继续输入', JSON.stringify(visible(root)))
  check(editor.markdown === '`hello` world', '行内代码：闭合后继续输入的源码', editor.markdown)
}

// ---------------------------------------------------------------- 标题

{
  const { root, editor } = makeEditor()

  type('#')
  check(visible(root) === '#', '标题：输入 # 显示为 #', visible(root))
  check(editor.markdown === '#', '标题：源码为 #', editor.markdown)
  check(root.querySelector('h1') === null, '标题：只有 # 还不是标题', tag(root))

  type(' ')
  check(root.querySelector('h1') !== null, '标题：打完空格变成 h1', tag(root))
  check(visible(root) === '', '标题：标记被消费', JSON.stringify(visible(root)))
  check(editor.markdown === '# ', '标题：源码保留标记', JSON.stringify(editor.markdown))

  type('标题')
  check(visible(root) === '标题', '标题：内容正常显示', JSON.stringify(visible(root)))
  check(root.querySelector('h1')?.textContent === '标题', '标题：内容在 h1 里', tag(root))
  check(editor.markdown === '# 标题', '标题：源码是 # 标题', editor.markdown)
  check(serializeNodes(root) === '# 标题', '标题：DOM 还原成源码', JSON.stringify(serializeNodes(root)))

  // 光标在标题内容末尾
  const range = window.getSelection()?.getRangeAt(0)
  check(
    range?.startContainer === root.querySelector('h1')?.firstChild,
    '标题：光标在标题内容末尾',
    `${range?.startContainer.nodeName}`,
  )
}

{
  const { root, editor } = makeEditor()

  typeAll('## 二级')
  check(root.querySelector('h2') !== null, '标题：两个井号是二级标题', tag(root))
  check(root.querySelector('h2')?.textContent === '二级', '标题：二级标题内容', tag(root))
  check(editor.markdown === '## 二级', '标题：二级标题源码', editor.markdown)
}

{
  // 退格删掉空格，标题就变回普通文本
  const { root, editor } = makeEditor()

  type('#')
  type(' ')
  check(root.querySelector('h1') !== null, '标题（退格）：先变成标题', tag(root))

  backspace()
  check(editor.markdown === '#', '标题（退格）：删掉空格后的源码', JSON.stringify(editor.markdown))
  check(visible(root) === '#', '标题（退格）：变回普通文本', JSON.stringify(visible(root)))
  check(root.querySelector('h1') === null, '标题（退格）：不再是标题', tag(root))
}

{
  // 标题结束之后，正文另起一行，中间不能多出空行
  const { root, editor } = makeEditor()

  typeAll('# 标题')
  enter()
  check(editor.markdown === '# 标题\n', '标题（回车）：源码以换行结尾', JSON.stringify(editor.markdown))

  // 光标要落到新的一行上，不能留在标题里
  const tail = root.lastElementChild
  check(
    tail instanceof HTMLElement && tail.hasAttribute('data-md-tail'),
    '标题（回车）：末尾补上占位元素',
    tag(root),
  )
  check(
    window.getSelection()?.getRangeAt(0)?.startContainer === tail,
    '标题（回车）：光标落到标题外面',
    `${window.getSelection()?.getRangeAt(0)?.startContainer.nodeName}`,
  )

  typeAll('正文')
  check(editor.markdown === '# 标题\n正文', '标题（回车）：继续输入', JSON.stringify(editor.markdown))
  check(root.querySelector('h1')?.textContent === '标题', '标题（回车）：正文没有跑进标题', tag(root))
  check(textLineCount(root) === 2, '标题（回车）：标题和正文各占一行', `排了 ${textLineCount(root)} 行`)
}

{
  // 标题前面有正文时，标题另起一行
  const { root, editor } = makeEditor()

  typeAll('正文')
  enter()
  typeAll('# 标题')
  check(editor.markdown === '正文\n# 标题', '标题（正文后）：源码', JSON.stringify(editor.markdown))
  check(root.querySelector('h1')?.textContent === '标题', '标题（正文后）：标题内容', tag(root))
  check(textLineCount(root) === 2, '标题（正文后）：正文和标题各占一行', `排了 ${textLineCount(root)} 行`)
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
  check(editor.markdown === '# 中文', '标题（输入法）：组合输入结束后同步源码', JSON.stringify(editor.markdown))
  check(root.querySelector('h1')?.textContent === '中文', '标题（输入法）：文字留在标题里', tag(root))
}

// ---------------------------------------------------------------- 编辑已有内容

{
  const { root, editor } = makeEditor()

  typeAll('**hello**')
  check(visible(root) === 'hello', '编辑：加粗后显示 hello', JSON.stringify(visible(root)))

  // 光标在末尾，退格先删掉收尾的 *
  backspace()
  check(editor.markdown === '**hello*', '编辑：退格删掉收尾标记', editor.markdown)
  check(visible(root) === '**hello*', '编辑：退格后重新显示为原文', JSON.stringify(visible(root)))

  backspace()
  check(editor.markdown === '**hello', '编辑：再退格一次', editor.markdown)

  type('!')
  check(editor.markdown === '**hello!', '编辑：继续输入', editor.markdown)
}

// ---------------------------------------------------------------- 光标位置

{
  const { root, editor } = makeEditor()

  typeAll('**ab**')
  check(editor.markdown === '**ab**', '光标：加粗源码', editor.markdown)

  // 光标应该落在 strong 之后
  const selection = window.getSelection()
  const range = selection?.getRangeAt(0)
  const container = range?.startContainer
  check(
    container === root && range?.startOffset === 1,
    '光标：闭合后位于 strong 之后',
    `${container?.nodeName}#${range?.startOffset}`,
  )
}

// ---------------------------------------------------------------- 撤销

{
  const { root, editor } = makeEditor()

  typeAll('**hi**')
  check(editor.markdown === '**hi**', '撤销：输入后源码', editor.markdown)
  editor.undo()
  check(editor.markdown === '**hi*', '撤销：回退一步', editor.markdown)
  editor.redo()
  check(editor.markdown === '**hi**', '撤销：重做', editor.markdown)
}

{
  // 换文档（弹窗里翻页）之后，撤销不会把上一个文档的内容恢复出来
  const { editor } = makeEditor()

  typeAll('aaa')
  editor.setSource('bbb')
  check(editor.markdown === 'bbb', '撤销（换文档）：内容换成新的', editor.markdown)

  editor.undo()
  check(editor.markdown === 'bbb', '撤销（换文档）：撤销不会退回上一个文档', editor.markdown)

  // 换完文档之后，这一篇自己的撤销还是正常的
  typeAll('c')
  check(editor.markdown === 'bbbc', '撤销（换文档）：新文档里照常输入', editor.markdown)
  editor.undo()
  check(editor.markdown === 'bbb', '撤销（换文档）：新文档里也能撤销', editor.markdown)
}

// ---------------------------------------------------------------- 回车 / 粘贴 / 选区

{
  const { root, editor } = makeEditor()

  typeAll('a')
  enter()
  check(editor.markdown === 'a\n', '回车：插入换行', JSON.stringify(editor.markdown))
  typeAll('b')
  check(editor.markdown === 'a\nb', '回车：换行后继续输入', JSON.stringify(editor.markdown))
}

// ---------------------------------------------------------------- 回车：最后一行
//
// 浏览器不会为结尾的换行符生成行盒，光标会被画在上一行的末尾，
// 看上去就是「按了回车却没有换行」。所以结尾有换行时要补一个占位元素。

{
  const { root, editor } = makeEditor()

  typeAll('hello')
  enter()
  check(editor.markdown === 'hello\n', '回车：源码以换行结尾', JSON.stringify(editor.markdown))

  const tail = root.lastElementChild
  check(
    tail instanceof HTMLElement && tail.hasAttribute('data-md-tail'),
    '回车：末尾补上占位元素，撑出最后一行',
    tag(root),
  )

  // 光标要落在占位元素里，否则浏览器会把它画在上一行末尾
  const range = window.getSelection()?.getRangeAt(0)
  check(
    range?.startContainer === tail,
    '回车：光标落在占位元素里（最后一行）',
    `${range?.startContainer.nodeName}`,
  )

  // 占位元素只是渲染用的，不能混进源码
  check(serializeNodes(root) === 'hello\n', '回车：占位元素不进入源码', JSON.stringify(serializeNodes(root)))
  check(
    sourceOffsetAt(root, tail!, 0) === editor.markdown.length,
    '回车：占位元素对应源码末尾',
    String(sourceOffsetAt(root, tail!, 0)),
  )

  // 继续输入应该落在新的一行上
  typeAll('world')
  check(editor.markdown === 'hello\nworld', '回车：换行后继续输入', JSON.stringify(editor.markdown))
  check(
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
  check(editor.markdown === 'hello**world**', '粘贴：插入纯文本', JSON.stringify(editor.markdown))
  check(root.querySelector('strong') !== null, '粘贴：粘贴内容也走 Markdown 渲染', tag(root))
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
  check(editor.markdown === 'abXef', '选区：输入替换选中的内容', JSON.stringify(editor.markdown))
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
  check(editor.markdown === '**中文', '输入法：组合输入结束后同步源码', JSON.stringify(editor.markdown))

  typeAll('**')
  check(editor.markdown === '**中文**', '输入法：组合输入后可以继续闭合加粗', JSON.stringify(editor.markdown))
  check(root.querySelector('strong') !== null, '输入法：组合输入内容被加粗', tag(root))
}

// ---------------------------------------------------------------- 输入法：换行之后

{
  const { root, editor } = makeEditor()

  typeAll('hello')
  enter()
  check(editor.markdown === 'hello\n', '输入法（换行后）：源码以换行结尾', JSON.stringify(editor.markdown))

  // 光标停在末尾的占位元素里，组合输入的文字会被浏览器插进这个元素
  const tail = root.lastElementChild!
  check(tail.hasAttribute('data-md-tail'), '输入法（换行后）：光标在末尾占位元素里', tail.outerHTML)

  root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  const composing = insertComposingText('nihao')

  check(
    lineCount(composing) === 1,
    '输入法（换行后）：组合输入的文字排在一行里（不是一字一行）',
    `排了 ${lineCount(composing)} 行`,
  )

  // 组合输入结束，文字进入源码
  root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'nihao' }))
  check(
    editor.markdown === 'hello\nnihao',
    '输入法（换行后）：组合输入结束后同步源码',
    JSON.stringify(editor.markdown),
  )
  check(root.querySelector('[data-md-tail]') === null, '输入法（换行后）：不再以换行结尾时占位元素消失', tag(root))
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

  check(editor.markdown === 'hello\n', '输入法（取消）：源码没有多出换行', JSON.stringify(editor.markdown))
  check(root.querySelector('[data-md-tail]') !== null, '输入法（取消）：占位元素被恢复', tag(root))
  check(root.querySelector('br') === null, '输入法（取消）：浏览器留下的 <br> 被清掉', tag(root))
}

// ---------------------------------------------------------------- 光标映射

{
  const root = document.createElement('div')
  document.body.appendChild(root)
  renderTokens(parseMarkdown('**a`b`c**'), root)

  // 源码 "**a`b`c**"：加粗内容里的代码，源码偏移 4 落在 code 内部
  const pos = positionForSourceOffset(root, 4)
  check(
    (pos.node as Element).tagName === 'CODE' ||
      (pos.node as Node).parentElement?.tagName === 'CODE',
    '光标映射：加粗里的代码定位到 code 内部',
    `${(pos.node as Node).nodeName}`,
  )
  check(
    sourceOffsetAt(root, pos.node, pos.offset) === 4,
    '光标映射：偏移可以原样还原',
    String(sourceOffsetAt(root, pos.node, pos.offset)),
  )

  // 普通文本位置
  const textPos = positionForSourceOffset(root, 2)
  check(
    sourceOffsetAt(root, textPos.node, textPos.offset) === 2,
    '光标映射：普通文本位置可以原样还原',
    String(sourceOffsetAt(root, textPos.node, textPos.offset)),
  )

  // 标题：源码 "# 标题"，标题内容从偏移 2 开始
  const headingRoot = document.createElement('div')
  document.body.appendChild(headingRoot)
  renderTokens(parseMarkdown('# 标题'), headingRoot)

  const headingPos = positionForSourceOffset(headingRoot, 3)
  check(
    sourceOffsetAt(headingRoot, headingPos.node, headingPos.offset) === 3,
    '光标映射：标题里的位置可以原样还原',
    String(sourceOffsetAt(headingRoot, headingPos.node, headingPos.offset)),
  )
  check(
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
    check(
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
  check(editor.markdown === '****', '全选：源码是 ****', editor.markdown)
  check(root.querySelector('strong') !== null, '全选：渲染成空的 strong', tag(root))

  root.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'a', metaKey: true }),
  )
  const range = window.getSelection()?.getRangeAt(0)
  check(
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
  check(editor.markdown === '', '全选：删除后内容清空', JSON.stringify(editor.markdown))
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
      return [...store.keys()]
        .filter((title) => !keyword || title.toLowerCase().includes(keyword))
        .map((title) => ({ title, preview: '', exists: true }))
    },
    create: (title) => {
      created.push(title)
      store.set(title, '')
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
  check(editor.suggestion === null, '链接：只有一个 [ 不弹窗口')

  type('[')
  check(editor.suggestion !== null, '链接：输入 [[ 弹出候选窗口')
  check(editor.suggestion?.query === '', '链接：刚输入时查询词为空', JSON.stringify(editor.suggestion?.query))
  check(editor.suggestion?.candidates.length === 0, '链接：没有页面时没有候选')
  check(editor.suggestion?.rect !== null, '链接：候选窗口知道光标的位置')
}

{
  // 输入 [[hello 回车：创建页面并补全成 [[hello]]
  const { provider, created } = makeLinkProvider()
  const { root, editor } = makeEditor({ links: provider })

  typeAll('[[')
  typeAll('hello')

  const state = editor.suggestion
  check(state?.candidates.length === 1, '链接：没有同名页面时只有一项候选', String(state?.candidates.length))
  check(state?.candidates[0]?.title === 'hello', '链接：候选项是输入的内容', state?.candidates[0]?.title)
  check(state?.candidates[0]?.exists === false, '链接：候选项表示新建页面')
  check(state?.selected === 0, '链接：默认高亮第一项')

  press('Enter')
  check(editor.markdown === '[[hello]]', '链接：回车补全成 [[hello]]', JSON.stringify(editor.markdown))
  check(created.length === 1 && created[0] === 'hello', '链接：回车创建了页面', JSON.stringify(created))
  check(editor.suggestion === null, '链接：接受候选后窗口关闭')
  check(root.querySelector('a[data-md-link]') !== null, '链接：渲染成可点击的链接', tag(root))
  check(visible(root) === 'hello', '链接：显示页面名', JSON.stringify(visible(root)))
  check(
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

  check(editor.suggestion?.candidates.length === 1, '链接：同名页面只有一项候选', String(editor.suggestion?.candidates.length))
  check(editor.suggestion?.candidates[0]?.exists === true, '链接：候选项是已有页面')

  press('Enter')
  check(editor.markdown === '[[hello]]', '链接：回车补全成 [[hello]]', JSON.stringify(editor.markdown))
  check(created.length === 0, '链接：同名页面不会被重复创建', JSON.stringify(created))
}

{
  // 候选列表会跟着查询词过滤
  const { provider } = makeLinkProvider(['hello', 'help', 'world'])
  const { editor } = makeEditor({ links: provider })

  typeAll('[[')
  check(editor.suggestion?.candidates.length === 3, '链接：空查询时列出所有页面', String(editor.suggestion?.candidates.length))
  check(editor.suggestion?.selected === 0, '链接：空查询时高亮第一项', String(editor.suggestion?.selected))

  typeAll('hel')
  check(editor.suggestion?.candidates.length === 3, '链接：查询词会带上新建选项', String(editor.suggestion?.candidates.length))
  check(editor.suggestion?.candidates[0]?.exists === false, '链接：新建选项排在最前面')
  check(editor.suggestion?.candidates[1]?.title === 'hello', '链接：匹配的页面排在后面', editor.suggestion?.candidates[1]?.title)
}

{
  // 窗口开着的时候，回车选中的就是看到的那一项
  const { provider } = makeLinkProvider(['hello'])
  const { editor } = makeEditor({ links: provider })

  typeAll('[[')
  press('Enter')
  check(editor.markdown === '[[hello]]', '链接：空查询时回车选中第一项', JSON.stringify(editor.markdown))
}

{
  // 上下键切换候选项，回车选中高亮的那一个
  const { provider, created } = makeLinkProvider(['hello', 'help'])
  const { editor } = makeEditor({ links: provider })

  typeAll('[[')
  check(editor.suggestion?.selected === 0, '链接：默认高亮第一项', String(editor.suggestion?.selected))

  press('ArrowDown')
  check(editor.suggestion?.selected === 1, '链接：下键切到第二项', String(editor.suggestion?.selected))
  press('ArrowUp')
  check(editor.suggestion?.selected === 0, '链接：上键回到第一项', String(editor.suggestion?.selected))

  // 到头会绕回来
  press('ArrowUp')
  check(editor.suggestion?.selected === 1, '链接：上键到头会绕到最后一项', String(editor.suggestion?.selected))

  press('ArrowUp')
  press('Enter')
  check(editor.markdown === '[[hello]]', '链接：回车接受高亮的候选项', JSON.stringify(editor.markdown))
  check(created.length === 0, '链接：已有页面不会被重复创建', JSON.stringify(created))
}

{
  // Esc 关掉窗口，之后继续输入也不会再弹出来
  const { provider } = makeLinkProvider()
  const { editor } = makeEditor({ links: provider })

  typeAll('[[')
  check(editor.suggestion !== null, '链接（Esc）：先弹出窗口')

  press('Escape')
  check(editor.suggestion === null, '链接（Esc）：窗口关掉了')

  typeAll('hello')
  check(editor.suggestion === null, '链接（Esc）：继续输入也不会再弹出来')
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
  check(opened === null, '链接（点击）：输入的时候不会打开页面')

  const link = root.querySelector('a[data-md-link]')!
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  check(opened === 'hello', '链接（点击）：点击链接打开页面', String(opened))
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
  check(editor.markdown === '**[[hello]]**', '链接：加粗里的链接', JSON.stringify(editor.markdown))
  check(root.querySelector('strong a[data-md-link]') !== null, '链接：渲染在加粗里面', tag(root))
}

{
  // 代码里的 [[ 不弹窗口
  const { provider } = makeLinkProvider()
  const { editor } = makeEditor({ links: provider })

  typeAll('`')
  typeAll('[[')
  check(editor.suggestion === null, '链接：代码里的 [[ 不弹窗口')
}

{
  // 编辑区失去焦点，候选窗口就关掉
  const { provider } = makeLinkProvider()
  const { root, editor } = makeEditor({ links: provider })

  typeAll('[[')
  check(editor.suggestion !== null, '链接（失焦）：先弹出窗口')

  root.dispatchEvent(new FocusEvent('blur'))
  check(editor.suggestion === null, '链接（失焦）：失焦后窗口关掉了')
}

{
  // 断链：页面还不存在的链接要标出来
  const { provider } = makeLinkProvider()
  const { root, editor } = makeEditor({ links: provider })

  typeAll('[[ghost]]')
  const link = root.querySelector('a[data-md-link]')
  check(link !== null, '断链：写出来的链接渲染成链接', tag(root))
  check(link?.classList.contains('is-missing') === true, '断链：页面不存在时标成断链', tag(root))
  check(
    link?.getAttribute('title') === '页面「ghost」还不存在',
    '断链：鼠标停上去有提示',
    link?.getAttribute('title') ?? '',
  )

  // 页面有了，就不再是断链
  provider.create('ghost')
  editor.refreshLinks()
  check(link?.classList.contains('is-missing') === false, '断链：页面有了之后不再是断链', tag(root))
  check(
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
  check(opened === 'hello', '链接（快捷键）：Cmd+Enter 打开光标处的页面', String(opened))
}

// ---------------------------------------------------------------- 输出

const output = document.createElement('pre')
output.id = 'output'
output.textContent = `${lines.join('\n')}\n\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`}`
document.body.appendChild(output)
document.title = failed === 0 ? 'ALL PASSED' : `${failed} FAILED`
