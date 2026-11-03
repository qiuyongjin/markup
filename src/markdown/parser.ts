/**
 * 极简 Markdown 解析器（零第三方依赖）。
 *
 * 目前只实现两种最基础的行内语法：
 *   - 加粗：`**文字**`
 *   - 行内代码：`` `文字` ``
 *
 * 解析规则：
 *   1. 标记必须成对出现才会生效；没有配对的标记按普通文本原样输出。
 *   2. 多个同类标记依次配对：第 1 个与第 2 个一组，第 3 个与第 4 个一组，以此类推。
 *   3. 行内代码优先级高于加粗，代码内部不再解析其它语法。
 */

export type InlineToken =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; children: InlineToken[] }
  | { kind: 'code'; text: string }

export interface Span {
  /** 内容区间（不含标记本身）的起始下标 */
  start: number
  /** 内容区间的结束下标（不含） */
  end: number
}

export const BOLD_MARK = '**'
export const CODE_MARK = '`'

/** 解析一段 Markdown 源码，返回行内 token 列表 */
export function parseMarkdown(source: string): InlineToken[] {
  const codeSpans = findCodeSpans(source)
  const boldSpans = findBoldSpans(source, codeSpans)
  return buildTokens(source, codeSpans, boldSpans)
}

/**
 * 找出成对的反引号。
 * 第 1 个与第 2 个配对，第 3 个与第 4 个配对；落单的反引号当作普通文本。
 */
function findCodeSpans(text: string): Span[] {
  const spans: Span[] = []
  let index = 0
  while (index < text.length) {
    if (text[index] !== CODE_MARK) {
      index += 1
      continue
    }
    const close = text.indexOf(CODE_MARK, index + 1)
    if (close === -1) {
      // 找不到配对的反引号，按普通文本处理
      index += 1
      continue
    }
    spans.push({ start: index + 1, end: close })
    index = close + 1
  }
  return spans
}

/**
 * 找出成对的 `**`（跳过行内代码内部）。
 * 第 1 个与第 2 个配对，第 3 个与第 4 个配对；落单的 `**` 按普通文本处理。
 */
function findBoldSpans(text: string, codeSpans: Span[]): Span[] {
  const marks: number[] = []
  let index = 0
  while (index < text.length) {
    const code = codeSpans.find((span) => index >= span.start && index < span.end)
    if (code) {
      index = code.end
      continue
    }
    if (text.startsWith(BOLD_MARK, index)) {
      marks.push(index)
      index += BOLD_MARK.length
      continue
    }
    index += 1
  }

  const spans: Span[] = []
  for (let i = 0; i + 1 < marks.length; i += 2) {
    spans.push({ start: marks[i] + BOLD_MARK.length, end: marks[i + 1] })
  }
  return spans
}

/**
 * 把代码区间与加粗区间组装成 token 树。
 *
 * 标记本身既不是内容也不显示，所以每个事件都记录了两件事：
 *   - `textEnd`：本事件之前的普通文本到哪里结束（跳过起始标记）
 *   - `resume` ：本事件处理完之后，普通文本从哪里继续（跳过结束标记）
 */
function buildTokens(text: string, codeSpans: Span[], boldSpans: Span[]): InlineToken[] {
  type Event =
    | { pos: number; order: number; kind: 'code'; span: Span; textEnd: number; resume: number }
    | { pos: number; order: number; kind: 'boldOpen' | 'boldClose'; span: Span; textEnd: number; resume: number }

  const events: Event[] = []
  for (const span of codeSpans) {
    events.push({
      pos: span.start,
      order: 1,
      kind: 'code',
      span,
      textEnd: span.start - CODE_MARK.length,
      resume: span.end + CODE_MARK.length,
    })
  }
  for (const span of boldSpans) {
    events.push({
      pos: span.start,
      order: 0,
      kind: 'boldOpen',
      span,
      textEnd: span.start - BOLD_MARK.length,
      resume: span.start,
    })
    events.push({
      pos: span.end,
      order: 2,
      kind: 'boldClose',
      span,
      textEnd: span.end,
      resume: span.end + BOLD_MARK.length,
    })
  }
  events.sort((a, b) => a.pos - b.pos || a.order - b.order)

  const root: InlineToken[] = []
  const stack: InlineToken[][] = [root]
  let pos = 0

  const pushText = (value: string) => {
    if (!value) return
    stack[stack.length - 1].push({ kind: 'text', text: value })
  }

  for (const event of events) {
    if (event.textEnd > pos) {
      pushText(text.slice(pos, event.textEnd))
      pos = event.textEnd
    }
    if (event.kind === 'boldOpen') {
      const bold: InlineToken = { kind: 'bold', children: [] }
      stack[stack.length - 1].push(bold)
      stack.push(bold.children)
    } else if (event.kind === 'boldClose') {
      if (stack.length > 1) stack.pop()
    } else {
      stack[stack.length - 1].push({ kind: 'code', text: text.slice(event.span.start, event.span.end) })
    }
    pos = event.resume
  }
  pushText(text.slice(pos))

  return root
}
