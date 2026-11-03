/**
 * 极简 Markdown 解析器（零第三方依赖）。
 *
 * 支持的语法：
 *   - 标题：`# 文字`（行首 1~6 个 `#`，后面跟一个空格）
 *   - 加粗：`**文字**`
 *   - 行内代码：`` `文字` ``
 *
 * 解析规则：
 *   1. 行内标记必须成对出现才会生效；没有配对的标记按普通文本原样输出。
 *   2. 多个同类标记依次配对：第 1 个与第 2 个一组，第 3 个与第 4 个一组，以此类推。
 *   3. 行内代码优先级高于加粗，代码内部不再解析其它语法。
 *   4. 标题是行级语法：只看行首，标题后面的内容不再解析行内语法
 *      （标题和它后面的内容是两个独立的块）。
 */

export type Token =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; children: Token[] }
  | { kind: 'code'; text: string }
  | { kind: 'heading'; level: number; marker: string; children: Token[] }

export interface Span {
  /** 内容区间（不含标记本身）的起始下标 */
  start: number
  /** 内容区间的结束下标（不含） */
  end: number
}

export const BOLD_MARK = '**'
export const CODE_MARK = '`'
export const HEADING_MARK = '#'

/** 标题标记：行首 1~6 个 `#`，后面至少一个空格或制表符 */
const HEADING_PATTERN = /^(#{1,6})([ \t]+)/

/** 解析一段 Markdown 源码，返回 token 列表 */
export function parseMarkdown(source: string): Token[] {
  const tokens: Token[] = []
  const lines = source.split('\n')

  // 普通行先攒起来，攒成一段再解析：
  // 这样跨行的加粗、行内代码依然能配对（和文档里没有标题时一致）
  let paragraph = ''

  const flushParagraph = () => {
    if (!paragraph) return
    tokens.push(...parseInline(paragraph))
    paragraph = ''
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const isLast = i === lines.length - 1
    const heading = matchHeading(line)

    if (!heading) {
      paragraph += line + (isLast ? '' : '\n')
      continue
    }

    flushParagraph()
    tokens.push({
      kind: 'heading',
      level: heading.level,
      marker: heading.marker,
      children: parseInline(heading.content),
    })
    // 标题行末尾的换行留在标题外面，跟着后面的普通行一起解析
    if (!isLast) paragraph = '\n'
  }
  flushParagraph()

  return tokens
}

interface HeadingMatch {
  /** 标题级别：1~6 */
  level: number
  /** 标题标记：`#`、`##`…加上后面的空格 */
  marker: string
  /** 标题正文（不含标记） */
  content: string
}

/**
 * 判断一行是不是标题。
 *
 * 必须是行首的 1~6 个 `#`，后面跟至少一个空格：
 *   - `# 标题` 是标题
 *   - `## 标题` 是二级标题
 *   - `#标题`、`#`、`正文 # 标题` 都不是标题，按普通文本处理
 */
function matchHeading(line: string): HeadingMatch | null {
  const match = HEADING_PATTERN.exec(line)
  if (!match) return null
  return {
    level: match[1]!.length,
    marker: match[1]! + match[2]!,
    content: line.slice(match[0].length),
  }
}

/** 解析一段行内内容，返回 token 列表 */
function parseInline(text: string): Token[] {
  const codeSpans = findCodeSpans(text)
  const boldSpans = findBoldSpans(text, codeSpans)
  return buildTokens(text, codeSpans, boldSpans)
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
function buildTokens(text: string, codeSpans: Span[], boldSpans: Span[]): Token[] {
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

  const root: Token[] = []
  const stack: Token[][] = [root]
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
      const bold: Token = { kind: 'bold', children: [] }
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
