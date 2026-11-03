export interface DocBlock {
  /** 块在源码中的起始偏移 */
  start: number
  /** 块在源码中的结束偏移（不含行尾换行） */
  end: number
  /** 块的原始文本 */
  raw: string
}

/**
 * 按空行把文档切分成块。
 *
 * - 围栏代码块（``` / ~~~）内部的空行不会切分
 * - 连续空行会保留中间的空段落（空行数 - 1 个）
 * - 每块记录源码偏移，编辑时只替换该块，其余内容原样保留
 */
export function splitBlocks(text: string): DocBlock[] {
  const blocks: DocBlock[] = []
  const lines = text.split('\n')

  let offset = 0
  let inFence = false
  let fenceChar = ''

  let bufLines: string[] = []
  let bufStart = 0
  let blankCount = 0
  let blankStart = 0

  const flush = () => {
    if (!bufLines.length) return
    const raw = bufLines.join('\n')
    blocks.push({ start: bufStart, end: bufStart + raw.length, raw })
    bufLines = []
  }

  const pushEmptyBlocks = (count: number) => {
    for (let i = 0; i < count; i++) {
      const pos = blankStart + i + 1
      blocks.push({ start: pos, end: pos, raw: '' })
    }
  }

  for (const line of lines) {
    const lineStart = offset
    offset += line.length + 1

    const fence = /^(\s*)(```+|~~~+)/.exec(line)
    if (fence) {
      if (!inFence) {
        inFence = true
        fenceChar = fence[2][0]
      } else if (fence[2][0] === fenceChar) {
        inFence = false
      }
    }

    if (!inFence && line.trim() === '') {
      flush()
      if (blankCount === 0) blankStart = lineStart
      blankCount++
      continue
    }

    if (blankCount > 0) {
      pushEmptyBlocks(blankCount - 1)
      blankCount = 0
      bufStart = lineStart
    } else if (!bufLines.length) {
      bufStart = lineStart
    }
    bufLines.push(line)
  }

  flush()
  if (blankCount > 0) pushEmptyBlocks(blankCount - 1)

  return blocks
}

/** 块的类型，用于样式（间距） */
export type BlockKind = 'heading' | 'code' | 'quote' | 'list' | 'paragraph'

export function blockKind(raw: string): BlockKind {
  const text = raw.trim()
  if (/^#{1,6}\s/.test(text)) return 'heading'
  if (/^(```|~~~)/.test(text)) return 'code'
  if (/^>/.test(text)) return 'quote'
  if (/^([-*+]|\d+\.)\s/.test(text)) return 'list'
  return 'paragraph'
}

/** 是否处于围栏代码块中（此时回车应插入换行而不是拆分段落） */
export function isInFence(raw: string): boolean {
  return /^\s*(```|~~~)/m.test(raw)
}
