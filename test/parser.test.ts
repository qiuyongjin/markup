/**
 * 解析器行为测试（用 node 直接运行，不依赖测试框架）。
 * 运行：node test/parser.test.ts
 */
import { parseMarkdown, type Token } from '../src/markdown/parser.ts'

let failed = 0

/** 把 token 树转成可断言的结构 */
function structure(tokens: Token[]): unknown[] {
  return tokens.map((token) => {
    if (token.kind === 'text') return `text:${token.text}`
    if (token.kind === 'code') return `code:${token.text}`
    if (token.kind === 'heading') return `h${token.level}:${structure(token.children).join('|')}`
    return `bold:${structure(token.children).join('|')}`
  })
}

/** 渲染后的可见文本（不含标记） */
function plain(tokens: Token[]): string {
  return tokens
    .map((token) => {
      if (token.kind === 'text') return token.text
      if (token.kind === 'code') return token.text
      return plain(token.children)
    })
    .join('')
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    console.log(`  ok   ${label} => ${a}`)
  } else {
    failed += 1
    console.log(`  FAIL ${label}\n       expected ${b}\n       actual   ${a}`)
  }
}

console.log('1. 未闭合的标记按普通文本显示：')
const literalCases: Array<[string, string]> = [
  ['*', '*'],
  ['**', '**'],
  ['** ', '** '],
  ['** hello', '** hello'],
  ['** hello *', '** hello *'],
  ['`', '`'],
  ['`hello', '`hello'],
  ['**未闭合', '**未闭合'],
  ['`未闭合', '`未闭合'],
  ['普通文本', '普通文本'],
]
for (const [input, expected] of literalCases) {
  assertEqual(structure(parseMarkdown(input)), [`text:${expected}`], JSON.stringify(input))
}

console.log('\n2. 闭合后标记被消费，变成样式：')
assertEqual(structure(parseMarkdown('** hello **')), ['bold:text: hello '], '"** hello **" 加粗')
assertEqual(structure(parseMarkdown('**hello**')), ['bold:text:hello'], '"**hello**" 加粗')
assertEqual(structure(parseMarkdown('`hello`')), ['code:hello'], '"`hello`" 行内代码')
assertEqual(structure(parseMarkdown('`hello world`')), ['code:hello world'], '"`hello world`" 行内代码')

console.log('\n3. 组合场景：')
assertEqual(structure(parseMarkdown('**a**b**c**')), ['bold:text:a', 'text:b', 'bold:text:c'], '两段加粗')
assertEqual(structure(parseMarkdown('**a`b`c**')), ['bold:text:a|code:b|text:c'], '加粗内含代码')
assertEqual(structure(parseMarkdown('`a**b**c`')), ['code:a**b**c'], '代码内不再解析')
assertEqual(structure(parseMarkdown('**`code`**')), ['bold:code:code'], '代码整体加粗')
assertEqual(plain(parseMarkdown('** hello **')), ' hello ', '可见文本去掉加粗标记')
assertEqual(plain(parseMarkdown('`hello`')), 'hello', '可见文本去掉代码标记')

console.log('\n4. 标题：')
assertEqual(structure(parseMarkdown('# 标题')), ['h1:text:标题'], '"# 标题" 一级标题')
assertEqual(structure(parseMarkdown('## 标题')), ['h2:text:标题'], '"## 标题" 二级标题')
assertEqual(structure(parseMarkdown('###### 标题')), ['h6:text:标题'], '"###### 标题" 六级标题')
assertEqual(structure(parseMarkdown('# 标题\n正文')), ['h1:text:标题', 'text:\n正文'], '标题后面还有正文')
assertEqual(structure(parseMarkdown('正文\n# 标题')), ['text:正文\n', 'h1:text:标题'], '标题在第二行')
assertEqual(structure(parseMarkdown('# **加粗**')), ['h1:bold:text:加粗'], '标题里的加粗')
assertEqual(structure(parseMarkdown('# `代码`')), ['h1:code:代码'], '标题里的行内代码')
assertEqual(plain(parseMarkdown('# 标题')), '标题', '可见文本去掉标题标记')

const heading = parseMarkdown('# 标题')[0]
assertEqual(
  heading?.kind === 'heading' ? heading.marker : '',
  '# ',
  '标题标记是井号加空格',
)

/** 取第一个 token 的标题标记 */
function headingMarker(source: string): string {
  const token = parseMarkdown(source)[0]
  return token?.kind === 'heading' ? token.marker : ''
}
assertEqual(headingMarker('#   标题'), '#   ', '标题标记吃掉井号后面的空格')

console.log('\n5. 不算标题的情况：')
const notHeadingCases: Array<[string, string]> = [
  ['#', '#'],
  ['#标题', '#标题'],
  ['####### 标题', '####### 标题'],
  ['a # b', 'a # b'],
  [' #### 标题', ' #### 标题'],
]
for (const [input, expected] of notHeadingCases) {
  assertEqual(structure(parseMarkdown(input)), [`text:${expected}`], JSON.stringify(input))
}

console.log('\n6. 标题不影响行内语法：')
assertEqual(
  structure(parseMarkdown('**a\nb**')),
  ['bold:text:a\nb'],
  '跨行的加粗依然能配对',
)
assertEqual(
  structure(parseMarkdown('**a**\n# 标题\n**b**')),
  ['bold:text:a', 'text:\n', 'h1:text:标题', 'text:\n', 'bold:text:b'],
  '标题前后的加粗各自成对',
)
assertEqual(structure(parseMarkdown('```\n')), ['code:', 'text:`\n'], '反引号照旧按行内代码解析')

if (failed > 0) {
  console.log(`\n${failed} 个断言失败`)
  process.exit(1)
}
console.log('\n全部通过')
