/**
 * 浏览器里的端到端测试：模拟真实按键（浏览器真实按键会先触发 beforeinput）。
 * 由 vite 打包后在浏览器里运行。
 */
import { MarkdownEditor } from '../src/markdown/editor'
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

function makeEditor(): { root: HTMLElement; editor: MarkdownEditor } {
  const root = document.createElement('div')
  root.className = 'editor'
  root.contentEditable = 'true'
  document.body.appendChild(root)
  const editor = new MarkdownEditor(root)
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
  return root.innerHTML.replace(/ data-md="[^"]*"/g, '')
}

/** 内容排了几行（按不同的行顶算） */
function lineCount(node: Node): number {
  const range = document.createRange()
  range.selectNodeContents(node)
  const tops = new Set<number>()
  for (const rect of Array.from(range.getClientRects())) tops.add(Math.round(rect.top))
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

// ---------------------------------------------------------------- 输出

const output = document.createElement('pre')
output.id = 'output'
output.textContent = `${lines.join('\n')}\n\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`}`
document.body.appendChild(output)
document.title = failed === 0 ? 'ALL PASSED' : `${failed} FAILED`
