/**
 * 文本边界：字素簇与单词。
 *
 * 纯函数，不碰 DOM，可以在 node 里直接测。
 * 输入法相关的边界都在这里：中文、emoji、组合字符都要照顾到。
 */

/** 字素簇切分器（按需创建，模块内复用） */
let segmenter: Intl.Segmenter | null = null

function getSegmenter(): Intl.Segmenter | null {
  if (!segmenter && typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return segmenter
}

/** 光标前面一个字素簇的起点（删除一个字素簇时用） */
export function previousGraphemeStart(source: string, offset: number): number {
  const before = source.slice(0, offset)
  if (!before) return 0

  const code = before.codePointAt(before.length - 1)!
  if (code < 0x80) return before.length - 1

  const seg = getSegmenter()
  if (!seg) return before.length - 1

  let start = 0
  for (const segment of seg.segment(before)) start = segment.index
  return start
}

/** 光标后面一个字素簇的终点（删除一个字素簇时用） */
export function nextGraphemeEnd(source: string, offset: number): number {
  const after = source.slice(offset)
  if (!after) return source.length

  const code = after.codePointAt(0)!
  if (code < 0x80) return offset + 1

  const seg = getSegmenter()
  if (!seg) return offset + 1

  for (const segment of seg.segment(after)) return offset + segment.segment.length
  return offset + 1
}

/** 上一个单词的起点 */
export function previousWordStart(source: string, offset: number): number {
  let index = offset
  while (index > 0 && /\s/.test(source[index - 1]!)) index -= 1
  while (index > 0 && !/\s/.test(source[index - 1]!)) index -= 1
  return index
}

/** 下一个单词的终点 */
export function nextWordEnd(source: string, offset: number): number {
  let index = offset
  while (index < source.length && !/\s/.test(source[index]!)) index += 1
  while (index < source.length && /\s/.test(source[index]!)) index += 1
  return index
}
