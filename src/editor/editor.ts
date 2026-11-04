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
import { CODE_MARK, LINK_CLOSE, LINK_OPEN, parseMarkdown } from '../markdown/parser'
import {
  createTailElement,
  positionForSourceOffset,
  renderTokens,
  serializeNodes,
  sourceOffsetAt,
} from '../markdown/dom'
import type { LinkCandidate } from '../core/types'
import { noopLogger, type Logger } from '../core/logger'
import { History, type HistoryEntry } from './history'
import { nextGraphemeEnd, nextWordEnd, previousGraphemeStart, previousWordStart } from './text'
import type { EditorOptions, SuggestionState } from './types'

interface SourceSelection {
  start: number
  end: number
}

export class MarkdownEditor {
  private readonly root: HTMLElement
  private readonly options: EditorOptions
  private readonly logger: Logger
  private source = ''
  private caretOffset = 0
  private readonly history = new History()
  /** 外部内容的版本号（'controlled' 模式下用来判断变更来源） */
  private externalVersion: number
  private composing = false
  private listeners: Array<[string, EventListener]> = []
  private suggestionState: SuggestionState | null = null
  /** 被 Esc 关掉的触发位置：同一个 `[[` 不会再自动弹出窗口 */
  private dismissedTrigger: number | null = null

  constructor(root: HTMLElement, options: EditorOptions = {}) {
    this.root = root
    this.options = options
    this.logger = options.logger ?? noopLogger
    this.externalVersion = options.externalVersion ?? 0
    this.render()
    this.attach()
  }

  /** 当前 Markdown 源码 */
  get markdown(): string {
    return this.source
  }

  /** 当前候选窗口的状态（没有展开时是 null） */
  get suggestion(): SuggestionState | null {
    return this.suggestionState
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
    on('mousedown', (event: MouseEvent) => this.handleMouseDown(event))
    on('click', (event: MouseEvent) => this.handleClick(event))
    on('blur', () => this.dismissSuggestion())
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
    const parseStart = performance.now()
    const tokens = parseMarkdown(this.source)
    const parseMs = performance.now() - parseStart

    const renderStart = performance.now()
    const fragment = document.createDocumentFragment()
    renderTokens(tokens, fragment)

    // 结尾是换行时补一个占位元素：撑出最后一行，光标才能停在这一行上
    if (this.source.endsWith('\n')) {
      fragment.appendChild(createTailElement())
    }

    this.root.replaceChildren(fragment)
    this.markMissingLinks()
    const renderMs = performance.now() - renderStart

    // 性能数字：dev 的 HUD 会显示它，也是验证性能修复效果的直接手段
    const stats = {
      length: this.source.length,
      // 解析器把段落摊平成行内元素，所以这是「元素数」不是「段落数」
      elements: tokens.length,
      parseMs,
      renderMs,
    }
    this.logger.debug('渲染完成', stats)
    this.options.onStats?.(stats)
  }

  /**
   * 把指向「还没有的页面」的链接标出来。
   *
   * 断链一眼能看出来，不用点进去才发现页面不存在。
   */
  private markMissingLinks(): void {
    const links = this.root.querySelectorAll('a[data-md-link]')
    if (!links.length) return

    const exists = this.options.links?.exists
    if (!exists) return

    for (const link of links) {
      const title = link.getAttribute('data-page') ?? ''
      const missing = title !== '' && !exists(title)
      link.classList.toggle('is-missing', missing)
      // 鼠标停上去给个提示：这是哪一页？
      link.setAttribute('title', missing ? `页面「${title}」还不存在` : `打开页面「${title}」`)
    }
  }

  /** 页面数据变了，重新标一下哪些链接是断链 */
  refreshLinks(): void {
    this.markMissingLinks()
  }

  focus(): void {
    this.root.focus()
    // 焦点回到编辑区时，光标要回到原来的位置
    this.writeCaretOffset(this.caretOffset)
  }

  /** 用新的内容替换整个文档（页面弹窗切换页面时用） */
  setSource(source: string, caret = source.length): void {
    this.source = source
    // 换文档就是换了一篇内容，历史记录重新开始：
    // 否则撤销会把上一页的内容恢复出来（弹窗里翻页时尤其明显）。
    this.history.reset(source, caret)
    this.render()
    this.writeCaretOffset(Math.min(caret, source.length))
    this.options.onChange?.(this.source)
    this.updateSuggestion()
  }

  /**
   * 外部内容变了：按「内容由谁拥有」的契约决定要不要换掉编辑区里的内容。
   *
   * - `'owned'`（默认）：内容和自己的一样就说明是自己改的，忽略。
   * - `'controlled'`：内容由外部拥有。父组件**主动替换**内容时版本号会变，
   *   这时才换；只是回显我刚上报的内容（版本号没变）就不动 ——
   *   这一下就避免了「内容被清空 + 撤销历史归零 + 光标弹到文末」。
   */
  applyExternalSource(source: string, version?: number): void {
    const controlled = this.options.ownership === 'controlled' && version !== undefined
    if (!controlled) {
      // 编辑器拥有内容：内容一样就说明是自己改的，不用动
      if (source === this.source) return
      this.setSource(source)
      return
    }

    if (version === this.externalVersion) return
    this.externalVersion = version
    this.setSource(source)
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
    } catch (error) {
      // 光标定位失败：保留「忽略这个异常」的语义，但不能什么都不说
      this.logger.warn('光标定位失败', { offset, error })
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
    } catch (error) {
      // 同上：忽略异常，但留下痕迹
      this.logger.warn('选区定位失败', { start, end, error })
      return
    }

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    // 记下光标的位置，焦点回到编辑区时要还原
    this.caretOffset = end
    this.keepCaretVisible(range)
  }

  /**
   * 选中整个文档。
   *
   * 这里直接用根节点的位置，不能走源码偏移的映射：
   * 行内元素的起始标记在源码里位于元素之前，在 DOM 里却在元素内部，
   * 走映射会漏掉开头的标记（比如 `**`），删除时就删不干净。
   */
  private selectAll(): void {
    const range = document.createRange()
    range.setStart(this.root, 0)
    range.setEnd(this.root, this.root.childNodes.length)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  /** 光标超出视口时滚动一下 */
  private keepCaretVisible(range: Range): void {
    let rect = range.getBoundingClientRect()

    // 折叠的选区有时拿不到矩形（比如光标在末尾的占位元素里），退回用所在元素的矩形
    if (!rect || (rect.top === 0 && rect.height === 0)) {
      const node = range.startContainer
      const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
      if (!element) return
      rect = element.getBoundingClientRect()
    }
    if (!rect || rect.height === 0) return

    const margin = 48
    if (rect.bottom > window.innerHeight - margin) {
      window.scrollBy(0, rect.bottom - window.innerHeight + margin)
    } else if (rect.top < margin) {
      window.scrollBy(0, rect.top - margin)
    }
  }

  // ---------------------------------------------------------------- 历史

  private applyHistory(entry: HistoryEntry): void {
    this.source = entry.source
    this.render()
    this.writeCaretOffset(Math.min(entry.caret, entry.source.length))
    this.options.onChange?.(this.source)
    this.updateSuggestion()
  }

  undo(): void {
    const entry = this.history.undo()
    if (!entry) return
    this.applyHistory(entry)
  }

  redo(): void {
    const entry = this.history.redo()
    if (!entry) return
    this.applyHistory(entry)
  }

  // ---------------------------------------------------------------- 源码编辑

  /** 用新内容替换源码的某个区间，并重新渲染 */
  private replaceRange(text: string, start: number, end: number): void {
    const next = this.source.slice(0, start) + text + this.source.slice(end)

    this.source = next
    this.history.push(next, start + text.length)
    this.render()
    this.writeSelection(start + text.length, start + text.length)
    this.options.onChange?.(this.source)
    this.updateSuggestion()
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
    this.history.push(next, start + mark.length + selected.length)
    this.render()
    this.writeSelection(start + mark.length, start + mark.length + selected.length)
    this.options.onChange?.(this.source)
    this.updateSuggestion()
  }

  // ---------------------------------------------------------------- 删除

  /** 向前删除一个字符（按字素簇，兼容中文与 emoji） */
  deleteBackward(): void {
    const { start, end } = this.readSelection()
    if (start !== end) {
      this.replaceRange('', start, end)
      return
    }
    this.replaceRange('', previousGraphemeStart(this.source, start), start)
  }

  /** 向后删除一个字符 */
  deleteForward(): void {
    const { start, end } = this.readSelection()
    if (start !== end) {
      this.replaceRange('', start, end)
      return
    }
    this.replaceRange('', end, nextGraphemeEnd(this.source, end))
  }

  /** 向前删除一个单词 */
  deleteWordBackward(): void {
    const { start, end } = this.readSelection()
    if (start !== end) {
      this.replaceRange('', start, end)
      return
    }
    this.replaceRange('', previousWordStart(this.source, start), start)
  }

  /** 向后删除一个单词 */
  deleteWordForward(): void {
    const { start, end } = this.readSelection()
    if (start !== end) {
      this.replaceRange('', start, end)
      return
    }
    this.replaceRange('', end, nextWordEnd(this.source, end))
  }

  // ---------------------------------------------------------------- 双向链接

  /**
   * 重新计算候选窗口。
   *
   * 触发条件是光标前面有一个还没闭合的 `[[`：
   * 源码里从 `[[` 到光标之间的内容就是查询词。
   */
  private updateSuggestion(): void {
    if (!this.options.links || !this.selectionInsideRoot() || this.isInCode()) {
      this.setSuggestion(null)
      return
    }

    const caret = this.readSelection().start
    const trigger = this.findTrigger(caret)
    if (trigger === null) {
      // 触发点没了（被删掉了），下次输入可以重新弹出窗口
      this.dismissedTrigger = null
      this.setSuggestion(null)
      return
    }
    if (trigger === this.dismissedTrigger) {
      this.setSuggestion(null)
      return
    }
    // 代码里的 `[[` 不弹窗口
    if (this.isInsideCode(trigger)) {
      this.setSuggestion(null)
      return
    }

    const query = this.source.slice(trigger + LINK_OPEN.length, caret)
    const { candidates, error } = this.buildCandidates(query)

    this.setSuggestion({
      active: true,
      start: trigger,
      caret,
      query,
      candidates,
      // 窗口开着就高亮第一项，回车选中的就是看到的那一项
      selected: candidates.length > 0 ? 0 : -1,
      rect: this.caretRect(),
      // 查询失败和「没有匹配页面」要能区分开
      error,
    })
  }

  /**
   * 找出光标前面那个还没闭合的 `[[`。
   *
   * 从光标往前找最近的一个 `[[`：
   *   - 后面跟着 `]` 说明已经闭合了，不是触发点
   *   - 后面跟着 `[` 说明是 `[[[`，也不是触发点
   *   - 中间有换行说明链接不跨行，也不是触发点
   */
  private findTrigger(caret: number): number | null {
    const text = this.source
    for (let index = caret - LINK_OPEN.length; index >= 0; index -= 1) {
      if (!text.startsWith(LINK_OPEN, index)) continue
      const query = text.slice(index + LINK_OPEN.length, caret)
      if (query.includes(']')) continue
      if (query.includes('[')) continue
      if (query.includes('\n')) return null
      return index
    }
    return null
  }

  /**
   * 组装候选列表：同名页面优先，「新建页面」排在最前面。
   *
   * 查询失败时返回空列表并带上原因 ——
   * 「查询挂了」和「没有匹配页面」在界面上必须能区分开。
   */
  private buildCandidates(query: string): { candidates: LinkCandidate[]; error?: string } {
    const provider = this.options.links
    if (!provider) return { candidates: [] }

    const result = provider.suggest(query)
    if (result.error) {
      this.logger.error('候选查询失败', { query, error: result.error })
      return { candidates: [], error: result.error }
    }

    const matched = result.candidates
    const title = query.trim()
    const exact = title
      ? matched.find((item) => item.title.toLowerCase() === title.toLowerCase())
      : undefined

    const candidates: LinkCandidate[] = []
    // 没有同名页面时，第一项是「用这个名字新建页面」
    if (title && !exact) {
      candidates.push({ title, preview: '', exists: false })
    }
    if (exact) candidates.push(exact)
    for (const item of matched) {
      if (item !== exact) candidates.push(item)
    }
    return { candidates }
  }

  /** 候选窗口的锚点：光标在视口中的位置 */
  private caretRect(): { left: number; top: number; bottom: number } | null {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null

    const range = selection.getRangeAt(0)
    if (!this.root.contains(range.startContainer)) return null

    let rect = range.getBoundingClientRect()
    // 折叠的选区有时拿不到矩形，退回到所在元素的矩形
    if (!rect || (rect.top === 0 && rect.height === 0)) {
      const node = range.startContainer
      const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
      if (!element) return null
      rect = element.getBoundingClientRect()
    }
    if (!rect || rect.height === 0) return null

    return { left: rect.left, top: rect.top, bottom: rect.bottom }
  }

  /** 选区是否在编辑区里 */
  private selectionInsideRoot(): boolean {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return false
    return this.root.contains(selection.getRangeAt(0).startContainer)
  }

  /** 光标是否在行内代码里（代码里的 `[[` 不触发候选窗口） */
  private isInCode(): boolean {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return false

    let node: Node | null = selection.getRangeAt(0).startContainer
    while (node && node !== this.root) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'code') {
        return true
      }
      node = node.parentNode
    }
    return false
  }

  /**
   * 触发点是不是在行内代码里。
   *
   * 看源码里触发点之前有多少个反引号：落单的那个就是没闭合的代码，
   * `[[` 写在它里面当然不是链接。
   * （代码已经闭合的情况由 DOM 判断，两边互补。）
   */
  private isInsideCode(trigger: number): boolean {
    const before = this.source.slice(0, trigger)
    let count = 0
    for (let index = 0; index < before.length; index += 1) {
      if (before[index] === CODE_MARK) count += 1
    }
    return count % 2 === 1
  }

  private setSuggestion(state: SuggestionState | null): void {
    this.suggestionState = state
    this.options.onSuggestion?.(state)
  }

  /** 页面数据变了，重新算一次候选 */
  refreshSuggestion(): void {
    this.updateSuggestion()
  }

  /** 高亮某一项（鼠标划过候选项时用） */
  selectCandidate(index: number): void {
    const state = this.suggestionState
    if (!state) return
    if (state.selected === index) return
    this.setSuggestion({ ...state, selected: index })
  }

  /** 上下键切换候选项 */
  private moveSuggestion(delta: number): void {
    const state = this.suggestionState
    if (!state || !state.candidates.length) return

    const count = state.candidates.length
    let next: number
    if (state.selected < 0) {
      next = delta > 0 ? 0 : count - 1
    } else {
      next = (state.selected + delta + count) % count
    }
    this.setSuggestion({ ...state, selected: next })
  }

  /**
   * 接受候选项：把 `[[查询词` 换成 `[[页面名]]`。
   * 选中的候选项还不存在时，先把页面创建出来。
   */
  acceptSuggestion(index?: number): boolean {
    const state = this.suggestionState
    if (!state) return false

    const candidate = state.candidates[index ?? state.selected]
    if (!candidate) return false

    const title = candidate.title.trim()
    if (!title) return false

    if (!candidate.exists) {
      // 建页失败要留下痕迹，不能静默吞掉
      const result = this.options.links?.create(title)
      if (result && !result.ok) {
        this.logger.error('创建页面失败', { title, error: result.error })
      }
    }

    this.replaceRange(`${LINK_OPEN}${title}${LINK_CLOSE}`, state.start, state.caret)
    return true
  }

  /** 关掉候选窗口（Esc）；同一个 `[[` 不会再自动弹出 */
  dismissSuggestion(): void {
    if (this.suggestionState) this.dismissedTrigger = this.suggestionState.start
    this.setSuggestion(null)
  }

  /** 候选窗口里的按键 */
  private handleSuggestionKey(event: KeyboardEvent): boolean {
    const state = this.suggestionState
    if (!state) return false

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        this.moveSuggestion(1)
        return true
      case 'ArrowUp':
        event.preventDefault()
        this.moveSuggestion(-1)
        return true
      case 'Enter':
      case 'Tab': {
        // 没有高亮项时不拦截，回车还是插入换行
        if (state.selected < 0 || !state.candidates[state.selected]) return false
        event.preventDefault()
        this.acceptSuggestion()
        return true
      }
      case 'Escape':
        event.preventDefault()
        // 别让 Esc 继续往上冒（页面弹窗会监听它）
        event.stopPropagation()
        this.dismissSuggestion()
        return true
      default:
        return false
    }
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
      this.history.push(next, offset)
      this.options.onChange?.(this.source)
    }

    // 浏览器可能顺手改了 DOM 的结构（比如输入法组合输入被取消后，
    // 它会把末尾的占位元素换成 <br>），重新渲染一次，把 DOM 恢复成源码的样子
    this.render()
    this.writeCaretOffset(offset)
    this.updateSuggestion()
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
    // 候选窗口开着的时候，上下键、回车、Esc 都归它管
    if (this.suggestionState && !this.composing) {
      if (this.handleSuggestionKey(event)) return
    }

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
    } else if (key === 'a') {
      // 自己实现全选：内容只有一个空行内元素时（例如只剩 `****`），
      // 浏览器的全选只会得到一个空选区，「全选 + 删除」就删不掉东西
      event.preventDefault()
      this.selectAll()
    } else if (key === 'enter') {
      // Cmd/Ctrl + Enter：打开光标处的页面
      const link = this.linkAtCaret()
      if (!link) return
      event.preventDefault()
      const title = link.getAttribute('data-page') ?? ''
      if (title) this.options.onOpenPage?.(title)
    } else if (key === 'i') {
      // 斜体不做：但要拦住浏览器自己插入 <i> 标签（那会破坏源码与 DOM 的一致性）
      event.preventDefault()
    }
  }

  /** 点击链接时不要移动光标 */
  handleMouseDown(event: MouseEvent): void {
    if (this.linkAt(event.target)) event.preventDefault()
  }

  /** 点击页面链接：打开这个页面 */
  handleClick(event: MouseEvent): void {
    const link = this.linkAt(event.target)
    if (!link) return

    event.preventDefault()
    const title = link.getAttribute('data-page') ?? link.textContent ?? ''
    if (title) this.options.onOpenPage?.(title)
  }

  /** 事件命中的页面链接 */
  private linkAt(target: EventTarget | null): HTMLAnchorElement | null {
    if (!(target instanceof Element)) return null
    const link = target.closest('a[data-md-link]')
    if (!(link instanceof HTMLAnchorElement)) return null
    if (!this.root.contains(link)) return null
    return link
  }

  /** 光标所在的那个页面链接 */
  private linkAtCaret(): HTMLAnchorElement | null {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null

    const node = selection.getRangeAt(0).startContainer
    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
    const link = element?.closest('a[data-md-link]')
    if (!(link instanceof HTMLAnchorElement)) return null
    if (!this.root.contains(link)) return null
    return link
  }
}
