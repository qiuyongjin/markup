/**
 * 性能回归脚本：node test/perf.ts（`pnpm test:perf`）
 *
 * 这是**独立脚本，不进单元测试**：CI 机器抖动大，在单元测试里卡毫秒级指标容易误报。
 * 这里的断言一律用宽松阈值，只用来拦截「数量级退化」。
 *
 * 背景（docs/architecture.md F5）：解析器曾经是 O(字符数 × 标记数)，
 * 「一个连续的不含标题的长段落块」会触发二次退化。
 */
import { parseMarkdown } from '../src/markdown/parser.ts'
import { createHarness, finish } from './harness.ts'

const h = createHarness()

/** 一段含代码、加粗、链接的正文：标记密度决定解析耗时 */
const PARAGRAPH = '这是第 {n} 段，包含 `code`、**bold** 和 [[link{n}]] 文字，用来把标记密度拉起来。'

/** 宽松阈值：只拦截数量级退化，不卡毫秒级指标 */
const MAX_MS = 50
/** 字符数 ×4 时，耗时最多允许 ×8（理想是 ×4） */
const MAX_SCALE = 8

/**
 * 造一个样本。
 *
 * @param paragraphs 段落数
 * @param headingEvery 每几段插一个标题（0 = 全程没有标题）
 */
function buildSample(paragraphs: number, headingEvery = 0): string {
  const lines: string[] = []
  for (let i = 0; i < paragraphs; i++) {
    if (headingEvery > 0 && i % headingEvery === 0) lines.push(`## 第 ${i} 节`)
    lines.push(PARAGRAPH.replace('{n}', String(i)))
  }
  return lines.join('\n')
}

/** 解析一段源码的平均耗时（毫秒） */
function measure(source: string, budgetMs = 100): number {
  // 预热一次，让 JIT 先跑起来
  parseMarkdown(source)

  // 先粗跑几次估个量级，再决定正式跑多少次：
  // 小样本要多跑几轮，抖动才被平均掉，缩放曲线才稳定。
  const probeRuns = 5
  const probeStart = performance.now()
  for (let i = 0; i < probeRuns; i++) parseMarkdown(source)
  const probeMs = (performance.now() - probeStart) / probeRuns

  const runs = Math.max(5, Math.min(2000, Math.round(budgetMs / Math.max(probeMs, 0.01))))
  const start = performance.now()
  for (let i = 0; i < runs; i++) parseMarkdown(source)
  return (performance.now() - start) / runs
}

h.section('1. 规模缩放（无标题：整篇并成一个段落块，最坏情况）')
const scales = [100, 200, 400, 800]
const timings: number[] = []
for (const count of scales) {
  const source = buildSample(count)
  const ms = measure(source)
  timings.push(ms)
  console.log(`  ${String(count).padStart(4)} 段 / ${String(source.length).padStart(6)} 字符 -> ${ms.toFixed(3)} ms`)
}

h.section('2. 块结构的影响（同样内容，只改有没有标题）')
// 900 段 ≈ 52,799 字符：架构评审里最坏情况的量级
const flat = buildSample(900)
const withHeadings = buildSample(900, 5)
const flatMs = measure(flat)
const headingMs = measure(withHeadings)
console.log(`  无标题（${flat.length} 字符）-> ${flatMs.toFixed(3)} ms`)
console.log(`  每 5 段一个标题（${withHeadings.length} 字符）-> ${headingMs.toFixed(3)} ms`)

h.section('3. 断言（宽松阈值，只拦数量级退化）')
h.check(
  flatMs < MAX_MS,
  `最坏情况（无标题 ${flat.length} 字符）解析耗时 < ${MAX_MS} ms`,
  `${flatMs.toFixed(3)} ms`,
)

const ratio = timings[3]! / Math.max(timings[1]!, 0.001)
h.check(
  ratio <= MAX_SCALE,
  `字符数 ×4，耗时 ×${MAX_SCALE} 以内`,
  `实测 ×${ratio.toFixed(2)}（${timings[1]!.toFixed(3)} ms -> ${timings[3]!.toFixed(3)} ms）`,
)

h.check(
  headingMs < MAX_MS,
  `带标题样本解析耗时 < ${MAX_MS} ms`,
  `${headingMs.toFixed(3)} ms`,
)

// 带标题的样本字符更多，比的是「每字符的耗时」
const flatPerChar = flatMs / flat.length
const headingPerChar = headingMs / withHeadings.length
h.check(
  headingPerChar <= flatPerChar * 1.3,
  '带标题样本的单位字符耗不比无标题样本高',
  `${((headingPerChar / flatPerChar - 1) * 100).toFixed(1)}%`,
)

finish(h)
