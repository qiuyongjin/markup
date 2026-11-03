/**
 * 解析器行为测试（用 node 直接运行，不依赖测试框架）。
 * 运行：node test/parser.test.ts
 */
import { parseMarkdown, type InlineToken } from '../src/markdown/parser.ts'

let failed = 0

/** 把 token 树转成可断言的结构 */
function structure(tokens: InlineToken[]): unknown[] {
  return tokens.map((token) => {
    if (token.kind === 'text') return `text:${token.text}`
    if (token.kind === 'code') return `code:${token.text}`
    return `bold:${structure(token.children).join('|')}`
  })
}

/** 渲染后的可见文本（不含标记） */
function plain(tokens: InlineToken[]): string {
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

if (failed > 0) {
  console.log(`\n${failed} 个断言失败`)
  process.exit(1)
}
console.log('\n全部通过')
