/**
 * 测试的公共断言与输出。
 *
 * node 侧（`test/*.test.ts`）和浏览器侧（`test/browser.test.ts`）共用同一套断言，
 * 输出格式也统一，避免两边各写一份、越差越远。
 *
 * 用法：
 *   const h = createHarness()                 // node：直接打印到控制台
 *   const h = createHarness((line) => out.push(line))  // 浏览器：收集起来最后写进页面
 */

/** 统计结果 */
export interface HarnessSummary {
  /** 失败的断言数 */
  failed: number
  /** 通过的断言数 */
  passed: number
}

/** 每一行输出的接收方 */
export type Reporter = (line: string) => void

export interface Harness {
  /** 开始一个新的大组 */
  section(title: string): void
  /** 断言一个条件成立 */
  check(ok: boolean, label: string, detail?: string): void
  /** 断言两个值相等（按 JSON 序列化后比较） */
  equal(actual: unknown, expected: unknown, label: string): void
  /** 记一次失败 */
  fail(label: string, detail?: string): void
  /** 统计结果 */
  summary(): HarnessSummary
  /** 全部输出（浏览器侧要把它写进页面） */
  report(): string
}

/**
 * 创建一个断言器。
 *
 * @param report 每一行输出的去处；默认打印到控制台
 */
export function createHarness(report: Reporter = (line) => console.log(line)): Harness {
  const lines: string[] = []
  let failed = 0
  let passed = 0

  const emit = (line: string): void => {
    lines.push(line)
    report(line)
  }

  return {
    section(title: string): void {
      emit(`\n${title}`)
    },

    check(ok: boolean, label: string, detail = ''): void {
      if (ok) {
        passed += 1
        emit(`  ok   ${label}${detail ? ` => ${detail}` : ''}`)
        return
      }
      failed += 1
      emit(`  FAIL ${label}${detail ? ` => ${detail}` : ''}`)
    },

    equal(actual: unknown, expected: unknown, label: string): void {
      const a = JSON.stringify(actual)
      const b = JSON.stringify(expected)
      if (a === b) {
        passed += 1
        emit(`  ok   ${label} => ${a}`)
        return
      }
      failed += 1
      emit(`  FAIL ${label}\n       expected ${b}\n       actual   ${a}`)
    },

    fail(label: string, detail = ''): void {
      failed += 1
      emit(`  FAIL ${label}${detail ? ` => ${detail}` : ''}`)
    },

    summary(): HarnessSummary {
      return { failed, passed }
    },

    report(): string {
      return lines.join('\n')
    },
  }
}

/**
 * node 侧测试的收尾：有失败就以非 0 退出。
 *
 * @param h 断言器
 */
export function finish(h: Harness): void {
  const { failed, passed } = h.summary()
  if (failed > 0) {
    console.log(`\n${failed} 个断言失败（通过 ${passed} 个）`)
    process.exit(1)
  }
  console.log(`\n全部通过（${passed} 个断言）`)
}
