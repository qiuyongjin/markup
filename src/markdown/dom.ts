/**
 * Markdown token 树与 DOM 之间的双向转换。
 *
 * 编辑区采用「DOM 即视图」模型：DOM 里只保留渲染后的内容，
 * 标记本身通过 `data-md` 属性记录，因此可以随时把 DOM 反序列化回 Markdown 源码，
 * 也可以在源码发生变化后重新渲染并把光标还原到正确的位置。
 */

import { BOLD_MARK, CODE_MARK, type InlineToken } from './parser'

const MD_ATTR = 'data-md'

export interface DomPosition {
  node: Node
  offset: number
}

/** 渲染 token 树 */
export function renderTokens(tokens: InlineToken[], parent: Node): void {
  for (const token of tokens) {
    if (token.kind === 'text') {
      parent.appendChild(document.createTextNode(token.text))
    } else if (token.kind === 'code') {
      const el = document.createElement('code')
      el.setAttribute(MD_ATTR, CODE_MARK)
      el.textContent = token.text
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
  let out = ''
  for (const child of parent.childNodes) out += serializeNode(child)
  return out
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node as Text).data
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as Element
  const tag = el.tagName.toLowerCase()

  if (tag === 'br') return '\n'

  const marker = el.getAttribute(MD_ATTR)
  if (marker) return marker + serializeNodes(el) + marker

  // 浏览器可能生成没有 data-md 的元素，这里做兜底还原
  if (tag === 'strong' || tag === 'b') return BOLD_MARK + serializeNodes(el) + BOLD_MARK
  if (tag === 'code') return CODE_MARK + serializeNodes(el) + CODE_MARK
  if (tag === 'em' || tag === 'i') return serializeNodes(el)
  if (tag === 'div' || tag === 'p') return serializeNodes(el) + '\n'

  return serializeNodes(el)
}

/** 元素起始标记占用的源码长度 */
function openLength(node: Node): number {
  if (node.nodeType !== Node.ELEMENT_NODE) return 0
  const marker = (node as Element).getAttribute(MD_ATTR)
  return marker ? marker.length : 0
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
  let len = contentLength(el)
  const marker = el.getAttribute(MD_ATTR)
  if (marker) len += marker.length * 2
  return len
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
  return walkForPosition(root, 0, Math.max(0, target))
}
