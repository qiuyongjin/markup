/**
 * 文本边界的行为测试（字素簇与单词，node 侧直接跑）。
 * 运行：node test/text.test.ts
 */
import {
  nextGraphemeEnd,
  nextWordEnd,
  previousGraphemeStart,
  previousWordStart,
} from '../src/editor/text.ts'
import { createHarness, finish } from './harness.ts'

const h = createHarness()

h.section('1. 字素簇：英文')
{
  h.check(previousGraphemeStart('abc', 3) === 2, 'abc：往前一个字素', String(previousGraphemeStart('abc', 3)))
  h.check(previousGraphemeStart('abc', 1) === 0, 'abc：开头', String(previousGraphemeStart('abc', 1)))
  h.check(previousGraphemeStart('', 0) === 0, '空串：往前是 0')
  h.check(nextGraphemeEnd('abc', 0) === 1, 'abc：往后一个字素', String(nextGraphemeEnd('abc', 0)))
  h.check(nextGraphemeEnd('abc', 3) === 3, 'abc：末尾往后还是末尾', String(nextGraphemeEnd('abc', 3)))
}

h.section('2. 字素簇：中文')
{
  h.check(previousGraphemeStart('中文', 2) === 1, '中文：往前一个字', String(previousGraphemeStart('中文', 2)))
  h.check(previousGraphemeStart('中文', 1) === 0, '中文：第一个字', String(previousGraphemeStart('中文', 1)))
  h.check(nextGraphemeEnd('中文', 0) === 1, '中文：往后一个字', String(nextGraphemeEnd('中文', 0)))
  h.check(nextGraphemeEnd('中文', 1) === 2, '中文：第二个字往后', String(nextGraphemeEnd('中文', 1)))
}

h.section('3. 字素簇：emoji（占两个 UTF-16 码元）')
{
  const thumb = '👍'
  h.check(thumb.length === 2, 'emoji 占两个码元', String(thumb.length))
  h.check(previousGraphemeStart(thumb, 2) === 0, 'emoji：往前是 0', String(previousGraphemeStart(thumb, 2)))
  h.check(nextGraphemeEnd(thumb, 0) === 2, 'emoji：往后是 2', String(nextGraphemeEnd(thumb, 0)))
  h.check(previousGraphemeStart(`a${thumb}`, 3) === 1, 'emoji 跟在字母后面', String(previousGraphemeStart(`a${thumb}`, 3)))
  h.check(nextGraphemeEnd(`a${thumb}b`, 1) === 3, 'emoji 后面还有字母', String(nextGraphemeEnd(`a${thumb}b`, 1)))
}

h.section('4. 字素簇：组合字符（é 的分解形式）')
{
  const eAcute = 'e\u0301'
  h.check(eAcute.length === 2, '组合字符占两个码元', String(eAcute.length))
  h.check(previousGraphemeStart(eAcute, 2) === 0, '组合字符：往前是 0', String(previousGraphemeStart(eAcute, 2)))
  // 往前是对的；往前的快路径只看第一个码元，「e」是 ASCII 就直接 +1，
  // 组合符会被当成另一个字素簇 —— 这是搬移前就有的行为，Phase 5a 只做搬家，不改逻辑。
  h.check(
    nextGraphemeEnd(eAcute, 0) === 1,
    '组合字符：往前的快路径只看第一个码元（既有行为）',
    String(nextGraphemeEnd(eAcute, 0)),
  )
}

h.section('5. 单词边界')
{
  h.check(previousWordStart('hello world', 11) === 6, '往前一个单词', String(previousWordStart('hello world', 11)))
  h.check(previousWordStart('hello world', 6) === 0, '往前到第一个单词', String(previousWordStart('hello world', 6)))
  h.check(previousWordStart('hello world', 5) === 0, '单词中间的空格被跳过', String(previousWordStart('hello world', 5)))
  h.check(nextWordEnd('hello world', 0) === 6, '往后一个单词（含后面的空格）', String(nextWordEnd('hello world', 0)))
  h.check(nextWordEnd('hello world', 6) === 11, '往后到最后', String(nextWordEnd('hello world', 6)))
  h.check(nextWordEnd('hello ', 0) === 6, '后面的空格也算在内', String(nextWordEnd('hello ', 0)))
  h.check(previousWordStart('中文 空格', 7) === 3, '中文也算一个单词', String(previousWordStart('中文 空格', 7)))
}

finish(h)
