/**
 * 撤销 / 重做栈的行为测试（node 侧直接跑）。
 * 运行：node test/history.test.ts
 */
import { History, MAX_HISTORY } from '../src/editor/history.ts'
import { createHarness, finish } from './harness.ts'

const h = createHarness()

h.section('1. 撤销与重做')
{
  const history = new History()

  history.push('a', 1)
  history.push('ab', 2)

  h.check(history.current().source === 'ab', '当前是最新的一条', history.current().source)
  h.check(history.length === 3, '一共三条（初始 + 两次 push）', String(history.length))

  const undone = history.undo()
  h.check(undone?.source === 'a', '撤销一步', undone?.source ?? '')
  h.check(history.undo()?.source === '', '再撤销一步回到初始', history.current().source)
  h.check(history.undo() === null, '没有更早的了', String(history.undo()))

  const redone = history.redo()
  h.check(redone?.source === 'a', '重做一步', redone?.source ?? '')
  h.check(history.redo()?.source === 'ab', '再重做回到最新', history.current().source)
  h.check(history.redo() === null, '没有更新的了')
}

h.section('2. 撤销之后又输入：redo 分支被截断')
{
  const history = new History()

  history.push('a', 1)
  history.push('ab', 2)
  history.undo()
  history.push('x', 1)

  h.check(history.length === 3, '长度回到三条（旧的 redo 分支没了）', String(history.length))
  h.check(history.current().source === 'x', '当前是新输入的内容', history.current().source)
  h.check(history.redo() === null, '不能再重做到被截断的内容')
}

h.section('3. 光标位置一起被记下来')
{
  const history = new History()

  history.push('hello', 3)
  h.check(history.current().caret === 3, '记下了光标位置', String(history.current().caret))
  h.check(history.undo()?.caret === 0, '撤销后光标位置也回来了', String(history.undo()?.caret ?? ''))
}

h.section('4. 换文档：历史重新开始')
{
  const history = new History()

  history.push('a', 1)
  history.push('ab', 2)
  history.reset('新文档', 0)

  h.check(history.length === 1, '只剩一条', String(history.length))
  h.check(history.current().source === '新文档', '内容换成新文档', history.current().source)
  h.check(history.undo() === null, '不能再撤销回上一篇', String(history.undo()))
}

h.section('5. 条数上限：内存是「条数 × 文档长度」')
{
  const history = new History()

  for (let i = 0; i < MAX_HISTORY + 50; i++) history.push(`第 ${i} 步`, i)

  h.check(history.length === MAX_HISTORY, '超过上限时丢掉最老的一条', String(history.length))
  h.check(history.current().source === `第 ${MAX_HISTORY + 49} 步`, '最新的还在', history.current().source)
}

finish(h)
