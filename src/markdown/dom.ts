/**
 * Markdown token 树与 DOM 之间的双向转换。
 *
 * 编辑区采用「DOM 即视图」模型：DOM 里只保留渲染后的内容，
 * 标记本身通过 `data-md` 属性记录，因此可以随时把 DOM 反序列化回 Markdown 源码，
 * 也可以在源码发生变化后重新渲染并把光标还原到正确的位置。
 */

import { BOLD_MARK, CODE_MARK, HEADING_MARK, LINK_CLOSE, LINK_OPEN, type Token } from './parser'

/** 斜体标记：解析器还不支持，只在兜底还原时用 */
const ITALIC_MARK = '*'

const MD_ATTR = 'data-md'
const MD_END_ATTR = 'data-md-end'
const TAIL_ATTR = 'data-md-tail'
const LINK_ATTR = 'data-md-link'
const PAGE_ATTR = 'data-page'

export interface DomPosition {
  node: Node
  offset: number
}

/**
 * 末尾换行的占位元素。
 *
 * 浏览器不会为结尾的换行符生成行盒（`white-space: pre-wrap` 也不例外），
 * 于是最后一行的光标无处安放，浏览器会把光标画在上一行的末尾——
 * 看上去就是「按了回车却没有换行」。
 *
 * 所以文档以换行结尾时补一个极窄的行内块：它撑出最后一行，
 * 光标也能真正停在这一行上。它本身不代表任何源码，序列化时会被忽略。
 */
export function createTailElement(): HTMLElement {
  const el = document.createElement('span')
  el.setAttribute(TAIL_ATTR, '')
  return el
}

/** 是否是末尾换行的占位元素 */
function isTailElement(node: Node | null | undefined): node is HTMLElement {
  return !!node && node.nodeType === Node.ELEMENT_NODE && (node as Element).hasAttribute(TAIL_ATTR)
}

/**
 * 元素对应的标记。
 *
 * 大多数标记是成对的（`**`、`\``），结束标记默认和起始标记一样；
 * 标题没有结束标记，用 `data-md-end=""` 显式说明。
 */
function markersOf(el: Element): { open: string; close: string } {
  const open = el.getAttribute(MD_ATTR)
  if (open === null) return { open: '', close: '' }
  const close = el.hasAttribute(MD_END_ATTR) ? el.getAttribute(MD_END_ATTR) ?? '' : open
  return { open, close }
}

/** 渲染 token 树 */
export function renderTokens(tokens: Token[], parent: Node): void {
  for (const token of tokens) {
    if (token.kind === 'text') {
      parent.appendChild(document.createTextNode(token.text))
    } else if (token.kind === 'code') {
      const el = document.createElement('code')
      el.setAttribute(MD_ATTR, CODE_MARK)
      el.textContent = token.text
      parent.appendChild(el)
    } else if (token.kind === 'link') {
      const el = document.createElement('a')
      el.setAttribute(MD_ATTR, LINK_OPEN)
      el.setAttribute(MD_END_ATTR, LINK_CLOSE)
      el.setAttribute(LINK_ATTR, '')
      el.setAttribute(PAGE_ATTR, token.name)
      el.textContent = token.name
      parent.appendChild(el)
    } else if (token.kind === 'heading') {
      const el = document.createElement(`h${token.level}`)
      el.setAttribute(MD_ATTR, token.marker)
      el.setAttribute(MD_END_ATTR, '')
      renderTokens(token.children, el)
      parent.appendChild(el)
    } else {
      const el = document.createElement('strong')
      el.setAttribute(MD_ATTR, BOLD_MARK)
      renderTokens(token.children, el)
      parent.appendChild(el)
    }
  }
}

/** 把 DOM 还原成 Markdown 源码 */
export function serializeNodes(parent: Node): string {
  return serializeChildren(parent, true)
}

/** 是否是 <br> */
function isBrElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'br'
}

function serializeChildren(parent: Node, isRoot: boolean): string {
  let out = ''
  const children = parent.childNodes
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    // 末尾的 <br> 只是浏览器给「空的最后一行」留的占位
    // （输入法组合输入被取消后，浏览器会把它塞到最后一行），
    // 源码里的换行本来就写在文本节点里，这里忽略掉，避免凭空多出一个空行
    if (isRoot && i === children.length - 1 && isBrElement(child)) continue
    out += serializeNode(child)
  }
  return out
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node as Text).data
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as Element
  const tag = el.tagName.toLowerCase()

  if (tag === 'br') return '\n'

  const { open, close } = markersOf(el)
  if (open) return open + serializeChildren(el, false) + close

  // 浏览器可能生成没有 data-md 的元素，这里做兜底还原
  if (tag === 'strong' || tag === 'b') return BOLD_MARK + serializeChildren(el, false) + BOLD_MARK
  if (tag === 'code') return CODE_MARK + serializeChildren(el, false) + CODE_MARK
  if (tag === 'a') return LINK_OPEN + serializeChildren(el, false) + LINK_CLOSE
  // 斜体：解析器还不支持，但**不能把标记悄悄丢掉** ——
  // 丢掉的话，用户以为自己写的是斜体，回头一看标记没了，内容也变了。
  // 这里按 Markdown 的习惯还原成 `*…*`：解析器不认它，至少标记还看得见。
  if (tag === 'em' || tag === 'i') return ITALIC_MARK + serializeChildren(el, false) + ITALIC_MARK
  if (tag === 'div' || tag === 'p') return serializeChildren(el, false) + '\n'
  if (/^h[1-6]$/.test(tag)) {
    return HEADING_MARK.repeat(Number(tag[1])) + ' ' + serializeChildren(el, false)
  }

  return serializeChildren(el, false)
}

/** 元素起始标记占用的源码长度 */
function openLength(node: Node): number {
  if (node.nodeType !== Node.ELEMENT_NODE) return 0
  return markersOf(node as Element).open.length
}

/** 元素结束标记占用的源码长度 */
function closeLength(node: Node): number {
  if (node.nodeType !== Node.ELEMENT_NODE) return 0
  return markersOf(node as Element).close.length
}

/** 元素内容占用的源码长度 */
function contentLength(el: Element): number {
  let len = 0
  for (const child of el.childNodes) len += sourceLength(child)
  return len
}

/** 节点对应的源码长度 */
export function sourceLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node as Text).data.length
  if (node.nodeType !== Node.ELEMENT_NODE) return 0

  const el = node as Element
  return openLength(el) + contentLength(el) + closeLength(el)
}

/**
 * 计算 DOM 位置对应的 Markdown 源码偏移。
 * @param acc 当前节点起始标记之前的源码偏移
 */
function walkForOffset(node: Node, acc: number, container: Node, offset: number): number | null {
  if (node === container) {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = (node as Text).data.length
      return acc + Math.max(0, Math.min(offset, length))
    }
    let sum = acc + openLength(node)
    const children = node.childNodes
    for (let i = 0; i < offset && i < children.length; i++) sum += sourceLength(children[i]!)
    return sum
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null

  let cur = acc + openLength(node)
  for (const child of node.childNodes) {
    const found = walkForOffset(child, cur, container, offset)
    if (found !== null) return found
    cur += sourceLength(child)
  }
  return null
}

/** DOM 位置 -> Markdown 源码偏移 */
export function sourceOffsetAt(root: Element, container: Node, offset: number): number {
  return walkForOffset(root, 0, container, offset) ?? 0
}

/**
 * Markdown 源码偏移 -> DOM 位置。
 * @param acc 当前节点起始标记之前的源码偏移
 */
function walkForPosition(parent: Node, acc: number, target: number): DomPosition {
  const children = parent.childNodes
  let cur = acc + openLength(parent)
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    const len = sourceLength(child)
    if (target > cur + len) {
      cur += len
      continue
    }

    if (child.nodeType === Node.TEXT_NODE) {
      const length = (child as Text).data.length
      return { node: child, offset: Math.max(0, Math.min(target - cur, length)) }
    }

    const open = openLength(child)
    if (target <= cur + open) {
      // 落在起始标记内部，落到内容开头
      return { node: child, offset: 0 }
    }
    const contentEnd = cur + open + contentLength(child as Element)
    if (target <= contentEnd) {
      const inner = walkForPosition(child, cur, target)
      return inner
    }
    // 落在结束标记内部或之后，放到该元素之后
    return { node: parent, offset: i + 1 }
  }
  return { node: parent, offset: parent.childNodes.length }
}

/** Markdown 源码偏移 -> DOM 位置 */
export function positionForSourceOffset(root: Element, target: number): DomPosition {
  const clamped = Math.max(0, target)

  // 文档以换行结尾时，光标要落在末尾的占位元素里。
  // 否则光标停在换行符的边界上，浏览器会把它画在上一行的末尾。
  const tail = root.lastElementChild
  if (isTailElement(tail) && clamped >= sourceLength(root)) {
    return { node: tail, offset: 0 }
  }

  return walkForPosition(root, 0, clamped)
}
