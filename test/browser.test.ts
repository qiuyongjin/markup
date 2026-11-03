/**
 * 浏览器里的端到端测试：模拟真实按键（浏览器真实按键会先触发 beforeinput）。
 * 由 vite 打包后在浏览器里运行。
 */
import { MarkdownEditor } from '../src/markdown/editor'
import { positionForSourceOffset, renderTokens, sourceOffsetAt } from '../src/markdown/dom'
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
  root.dispatchEvent(
    new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertParagraph' }),
  )
  check(editor.markdown === 'a\n', '回车：插入换行', JSON.stringify(editor.markdown))
  typeAll('b')
  check(editor.markdown === 'a\nb', '回车：换行后继续输入', JSON.stringify(editor.markdown))
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

// ---------------------------------------------------------------- 输出

const output = document.createElement('pre')
output.id = 'output'
output.textContent = `${lines.join('\n')}\n\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`}`
document.body.appendChild(output)
document.title = failed === 0 ? 'ALL PASSED' : `${failed} FAILED`
