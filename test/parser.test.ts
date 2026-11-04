/**
 * 解析器行为测试（用 node 直接运行，不依赖测试框架）。
 * 运行：node test/parser.test.ts
 */
import { parseMarkdown, type Token } from '../src/markdown/parser.ts'
import { createHarness, finish } from './harness.ts'

const h = createHarness()

/** 把 token 树转成可断言的结构 */
function structure(tokens: Token[]): unknown[] {
  return tokens.map((token) => {
    if (token.kind === 'text') return `text:${token.text}`
    if (token.kind === 'code') return `code:${token.text}`
    if (token.kind === 'link') return `link:${token.name}`
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
      if (token.kind === 'link') return token.name
      return plain(token.children)
    })
    .join('')
}

h.section('1. 未闭合的标记按普通文本显示：')
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
  h.equal(structure(parseMarkdown(input)), [`text:${expected}`], JSON.stringify(input))
}

h.section('2. 闭合后标记被消费，变成样式：')
h.equal(structure(parseMarkdown('** hello **')), ['bold:text: hello '], '"** hello **" 加粗')
h.equal(structure(parseMarkdown('**hello**')), ['bold:text:hello'], '"**hello**" 加粗')
h.equal(structure(parseMarkdown('`hello`')), ['code:hello'], '"`hello`" 行内代码')
h.equal(structure(parseMarkdown('`hello world`')), ['code:hello world'], '"`hello world`" 行内代码')

h.section('3. 组合场景：')
h.equal(structure(parseMarkdown('**a**b**c**')), ['bold:text:a', 'text:b', 'bold:text:c'], '两段加粗')
h.equal(structure(parseMarkdown('**a`b`c**')), ['bold:text:a|code:b|text:c'], '加粗内含代码')
h.equal(structure(parseMarkdown('`a**b**c`')), ['code:a**b**c'], '代码内不再解析')
h.equal(structure(parseMarkdown('**`code`**')), ['bold:code:code'], '代码整体加粗')
h.equal(plain(parseMarkdown('** hello **')), ' hello ', '可见文本去掉加粗标记')
h.equal(plain(parseMarkdown('`hello`')), 'hello', '可见文本去掉代码标记')

h.section('4. 标题：')
h.equal(structure(parseMarkdown('# 标题')), ['h1:text:标题'], '"# 标题" 一级标题')
h.equal(structure(parseMarkdown('## 标题')), ['h2:text:标题'], '"## 标题" 二级标题')
h.equal(structure(parseMarkdown('###### 标题')), ['h6:text:标题'], '"###### 标题" 六级标题')
h.equal(structure(parseMarkdown('# 标题\n正文')), ['h1:text:标题', 'text:\n正文'], '标题后面还有正文')
h.equal(structure(parseMarkdown('正文\n# 标题')), ['text:正文\n', 'h1:text:标题'], '标题在第二行')
h.equal(structure(parseMarkdown('# **加粗**')), ['h1:bold:text:加粗'], '标题里的加粗')
h.equal(structure(parseMarkdown('# `代码`')), ['h1:code:代码'], '标题里的行内代码')
h.equal(plain(parseMarkdown('# 标题')), '标题', '可见文本去掉标题标记')

const heading = parseMarkdown('# 标题')[0]
h.equal(
  heading?.kind === 'heading' ? heading.marker : '',
  '# ',
  '标题标记是井号加空格',
)

/** 取第一个 token 的标题标记 */
function headingMarker(source: string): string {
  const token = parseMarkdown(source)[0]
  return token?.kind === 'heading' ? token.marker : ''
}
h.equal(headingMarker('#   标题'), '#   ', '标题标记吃掉井号后面的空格')

h.section('5. 不算标题的情况：')
const notHeadingCases: Array<[string, string]> = [
  ['#', '#'],
  ['#标题', '#标题'],
  ['####### 标题', '####### 标题'],
  ['a # b', 'a # b'],
  [' #### 标题', ' #### 标题'],
]
for (const [input, expected] of notHeadingCases) {
  h.equal(structure(parseMarkdown(input)), [`text:${expected}`], JSON.stringify(input))
}

h.section('6. 标题不影响行内语法：')
h.equal(
  structure(parseMarkdown('**a\nb**')),
  ['bold:text:a\nb'],
  '跨行的加粗依然能配对',
)
h.equal(
  structure(parseMarkdown('**a**\n# 标题\n**b**')),
  ['bold:text:a', 'text:\n', 'h1:text:标题', 'text:\n', 'bold:text:b'],
  '标题前后的加粗各自成对',
)
h.equal(structure(parseMarkdown('```\n')), ['code:', 'text:`\n'], '反引号照旧按行内代码解析')

h.section('7. 双向链接：')
h.equal(structure(parseMarkdown('[[hello]]')), ['link:hello'], '"[[hello]]" 是链接')
h.equal(structure(parseMarkdown('[[hello world]]')), ['link:hello world'], '页面名可以有空格')
h.equal(structure(parseMarkdown('a[[b]]c')), ['text:a', 'link:b', 'text:c'], '链接夹在文字中间')
h.equal(structure(parseMarkdown('[[a]][[b]]')), ['link:a', 'link:b'], '两个相邻的链接')
h.equal(structure(parseMarkdown('**[[a]]**')), ['bold:link:a'], '加粗里的链接')
h.equal(structure(parseMarkdown('# [[a]]')), ['h1:link:a'], '标题里的链接')
h.equal(plain(parseMarkdown('[[hello]]')), 'hello', '可见文本就是页面名')

h.section('8. 不算链接的情况：')
const notLinkCases: Array<[string, string]> = [
  ['[[', '[['],
  ['[[hello', '[[hello'],
  ['hello]]', 'hello]]'],
  ['[[]]', '[[]]'],
  ['[[a]b]]', '[[a]b]]'],
  ['[[a`b]]', '[[a`b]]'],
  ['[[a\nb]]', '[[a\nb]]'],
]
for (const [input, expected] of notLinkCases) {
  h.equal(structure(parseMarkdown(input)), [`text:${expected}`], JSON.stringify(input))
}

h.equal(
  structure(parseMarkdown('`[[a]]`')),
  ['code:[[a]]'],
  '代码里的方括号不解析成链接',
)
h.equal(
  structure(parseMarkdown('[[**a**]]')),
  ['link:**a**'],
  '链接内部不再解析加粗',
)
h.equal(
  structure(parseMarkdown('[[a]]**b**')),
  ['link:a', 'bold:text:b'],
  '链接旁边的加粗照旧生效',
)

finish(h)
