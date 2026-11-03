/**
 * 实时 Markdown 编辑器的核心逻辑（与框架无关）。
 *
 * 采用「受控编辑」模型：Markdown 源码是唯一数据源，
 * DOM 只是源码的渲染结果，用户按键时先改源码再重新渲染 DOM。
 *
 *   按键 -> beforeinput 拦截 -> 修改 Markdown 源码 -> 重新渲染 DOM -> 还原光标
 *
 * 这样可以保证源码永远和用户输入一致，不会被浏览器改写 DOM 的行为（空白折叠、
 * 行内元素合并等）污染。只有输入法组合输入交给浏览器处理，结束后再从 DOM 回收。
 */
import { parseMarkdown } from './parser'
import { positionForSourceOffset, renderTokens, serializeNodes, sourceOffsetAt } from './dom'

interface HistoryEntry {
  source: string
  caret: number
}

interface SourceSelection {
  start: number
  end: number
}

export class MarkdownEditor {
  private readonly root: HTMLElement
  private source = ''
  private caretOffset = 0
  private history: HistoryEntry[] = [{ source: '', caret: 0 }]
  private historyIndex = 0
  private composing = false
  private listeners: Array<[string, EventListener]> = []
  private segmenter: Intl.Segmenter | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.render()
    this.attach()
  }

  /** 当前 Markdown 源码 */
  get markdown(): string {
    return this.source
  }

  /** 绑定编辑区需要的原生事件 */
  private attach(): void {
    const on = (type: string, handler: (event: never) => void) => {
      const listener = handler as EventListener
      this.root.addEventListener(type, listener)
      this.listeners.push([type, listener])
    }

    on('input', () => this.handleInput())
    on('beforeinput', (event: InputEvent) => this.handleBeforeInput(event))
    on('paste', (event: ClipboardEvent) => this.handlePaste(event))
    on('compositionstart', () => this.handleCompositionStart())
    on('compositionend', () => this.handleCompositionEnd())
    on('keydown', (event: KeyboardEvent) => this.handleKeyDown(event))
  }

  /** 解绑事件 */
  destroy(): void {
    for (const [type, listener] of this.listeners) {
      this.root.removeEventListener(type, listener)
    }
    this.listeners = []
  }

  // ---------------------------------------------------------------- 渲染

  /** 重新渲染整个编辑区 */
  render(): void {
    const fragment = document.createDocumentFragment()
    renderTokens(parseMarkdown(this.source), fragment)
    this.root.replaceChildren(fragment)
  }

  focus(): void {
    this.root.focus()
  }

  // ---------------------------------------------------------------- 光标

  /** 读取当前选区（源码坐标） */
  private readSelection(): SourceSelection {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      return { start: this.caretOffset, end: this.caretOffset }
    }

    const range = selection.getRangeAt(0)
    const start = sourceOffsetAt(this.root, range.startContainer, range.startOffset)
    const end = sourceOffsetAt(this.root, range.endContainer, range.endOffset)
    return { start: Math.min(start, end), end: Math.max(start, end) }
  }

  /** 把光标移动到源码的指定偏移 */
  private writeCaretOffset(offset: number): void {
    const position = positionForSourceOffset(this.root, offset)
    const range = document.createRange()
    try {
      range.setStart(position.node, position.offset)
    } catch {
      return
    }
    range.collapse(true)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    this.caretOffset = offset
    this.keepCaretVisible(range)
  }

  /** 选中源码的某个区间 */
  private writeSelection(start: number, end: number): void {
    const from = positionForSourceOffset(this.root, start)
    const to = positionForSourceOffset(this.root, end)
    const range = document.createRange()
    try {
      range.setStart(from.node, from.offset)
      range.setEnd(to.node, to.offset)
    } catch {
      return
    }

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  /** 光标超出视口时滚动一下 */
  private keepCaretVisible(range: Range): void {
    const rect = range.getBoundingClientRect()
    if (!rect || (rect.top === 0 && rect.height === 0)) return

    const margin = 48
    if (rect.bottom > window.innerHeight - margin) {
      window.scrollBy(0, rect.bottom - window.innerHeight + margin)
    } else if (rect.top < margin) {
      window.scrollBy(0, rect.top - margin)
    }
  }

  // ---------------------------------------------------------------- 历史

  private pushHistory(next: string, caret: number): void {
    const entries = this.history.slice(0, this.historyIndex + 1)
    entries.push({ source: next, caret })
    this.history = entries
    this.historyIndex = entries.length - 1
  }

  private applyHistory(entry: HistoryEntry): void {
    this.source = entry.source
    this.render()
    this.writeCaretOffset(Math.min(entry.caret, entry.source.length))
  }

  undo(): void {
    if (this.historyIndex <= 0) return
    this.historyIndex -= 1
    this.applyHistory(this.history[this.historyIndex]!)
  }

  redo(): void {
    if (this.historyIndex >= this.history.length - 1) return
    this.historyIndex += 1
    this.applyHistory(this.history[this.historyIndex]!)
  }

  // ---------------------------------------------------------------- 源码编辑

  /** 用新内容替换源码的某个区间，并重新渲染 */
  private replaceRange(text: string, start: number, end: number): void {
    const next = this.source.slice(0, start) + text + this.source.slice(end)

    this.source = next
    this.pushHistory(next, start + text.length)
    this.render()
    this.writeSelection(start + text.length, start + text.length)
  }

  /** 在选区处插入文本 */
  insertAtCaret(text: string): void {
    const { start, end } = this.readSelection()
    this.replaceRange(text, start, end)
  }

  /** 给选中的内容套上标记 */
  wrapSelection(mark: string): void {
    const { start, end } = this.readSelection()
    const selected = this.source.slice(start, end)

    const next = this.source.slice(0, start) + mark + selected + mark + this.source.slice(end)
    this.source = next
    this.pushHistory(next, start + mark.length + selected.length)
    this.render()
    this.writeSelection(start + mark.length, start + mark.length + selected.length)
  }

  // ---------------------------------------------------------------- 删除

  /** 向前删除一个字符（按字素簇，兼容中文与 emoji） */
  deleteBackward(): void {
    const { start, end } = this.readSelection()
    if (start !== end) {
      this.replaceRange('', start, end)
      return
    }
    this.replaceRange('', this.previousGraphemeStart(start), start)
  }

  /** 向后删除一个字符 */
  deleteForward(): void {
    const { start, end } = this.readSelection()
    if (start !== end) {
      this.replaceRange('', start, end)
      return
    }
    this.replaceRange('', end, this.nextGraphemeEnd(end))
  }

  /** 向前删除一个单词 */
  deleteWordBackward(): void {
    const { start, end } = this.readSelection()
    if (start !== end) {
      this.replaceRange('', start, end)
      return
    }
    this.replaceRange('', this.previousWordStart(start), start)
  }

  /** 向后删除一个单词 */
  deleteWordForward(): void {
    const { start, end } = this.readSelection()
    if (start !== end) {
      this.replaceRange('', start, end)
      return
    }
    this.replaceRange('', end, this.nextWordEnd(end))
  }

  private getSegmenter(): Intl.Segmenter | null {
    if (!this.segmenter && typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      this.segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    }
    return this.segmenter
  }

  private previousGraphemeStart(offset: number): number {
    const before = this.source.slice(0, offset)
    if (!before) return 0

    const code = before.codePointAt(before.length - 1)!
    if (code < 0x80) return before.length - 1

    const segmenter = this.getSegmenter()
    if (!segmenter) return before.length - 1

    let start = 0
    for (const segment of segmenter.segment(before)) start = segment.index
    return start
  }

  private nextGraphemeEnd(offset: number): number {
    const after = this.source.slice(offset)
    if (!after) return this.source.length

    const code = after.codePointAt(0)!
    if (code < 0x80) return offset + 1

    const segmenter = this.getSegmenter()
    if (!segmenter) return offset + 1

    for (const segment of segmenter.segment(after)) return offset + segment.segment.length
    return offset + 1
  }

  private previousWordStart(offset: number): number {
    let index = offset
    while (index > 0 && /\s/.test(this.source[index - 1]!)) index -= 1
    while (index > 0 && !/\s/.test(this.source[index - 1]!)) index -= 1
    return index
  }

  private nextWordEnd(offset: number): number {
    let index = offset
    while (index < this.source.length && !/\s/.test(this.source[index]!)) index += 1
    while (index < this.source.length && /\s/.test(this.source[index]!)) index += 1
    return index
  }

  // ---------------------------------------------------------------- 事件

  /** 兜底同步：处理浏览器自己改动了 DOM 的情况（输入法、拖拽等） */
  handleInput(): void {
    if (this.composing) return
    this.syncFromDom()
  }

  /** 把 DOM 的变化同步回源码，并重新渲染 */
  private syncFromDom(): void {
    const offset = this.readSelection().start
    const next = serializeNodes(this.root)

    if (next !== this.source) {
      this.source = next
      this.pushHistory(next, offset)
      this.render()
    }
    this.writeCaretOffset(offset)
  }

  handleBeforeInput(event: InputEvent): void {
    // 输入法组合输入期间交给浏览器处理
    if (this.composing) return

    switch (event.inputType) {
      case 'insertText': {
        const data = event.data ?? ''
        if (!data) return
        event.preventDefault()
        this.insertAtCaret(data)
        return
      }
      case 'insertParagraph':
      case 'insertLineBreak':
        event.preventDefault()
        this.insertAtCaret('\n')
        return
      case 'deleteContentBackward':
        event.preventDefault()
        this.deleteBackward()
        return
      case 'deleteContentForward':
        event.preventDefault()
        this.deleteForward()
        return
      case 'deleteWordBackward':
        event.preventDefault()
        this.deleteWordBackward()
        return
      case 'deleteWordForward':
        event.preventDefault()
        this.deleteWordForward()
        return
      case 'insertFromPaste':
        // 由 paste 事件处理
        event.preventDefault()
        return
      case 'formatBold':
        event.preventDefault()
        this.wrapSelection('**')
        return
      default:
        return
    }
  }

  handlePaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (!text) return
    event.preventDefault()
    this.insertAtCaret(text.replace(/\r\n?/g, '\n'))
  }

  handleCompositionStart(): void {
    this.composing = true
  }

  handleCompositionEnd(): void {
    this.composing = false
    this.syncFromDom()
  }

  handleKeyDown(event: KeyboardEvent): void {
    const mod = event.metaKey || event.ctrlKey
    if (!mod) return

    const key = event.key.toLowerCase()
    if (key === 'z') {
      event.preventDefault()
      if (event.shiftKey) this.redo()
      else this.undo()
    } else if (key === 'y') {
      event.preventDefault()
      this.redo()
    } else if (key === 'b') {
      // 自己实现加粗，避免浏览器插入原生的 <b> 标签
      event.preventDefault()
      this.wrapSelection('**')
    } else if (key === 'i') {
      event.preventDefault()
    }
  }
}
