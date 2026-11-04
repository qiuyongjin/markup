/**
 * 撤销 / 重做栈。
 *
 * 纯数据，不碰 DOM，可以在 node 里直接测。
 * 每一条历史存的是**整份源码**（换文档时最简单，也最不容易出错），
 * 所以要限制条数：内存是「条数 × 文档长度」。
 */

/** 一条历史 */
export interface HistoryEntry {
  /** 当时的完整源码 */
  source: string
  /** 当时的光标位置 */
  caret: number
}

/** 最多保留多少条历史 */
export const MAX_HISTORY = 200

export class History {
  private entries: HistoryEntry[]
  private index: number

  constructor(initial: HistoryEntry = { source: '', caret: 0 }) {
    this.entries = [initial]
    this.index = 0
  }

  /** 历史条数 */
  get length(): number {
    return this.entries.length
  }

  /** 当前所在的位置 */
  get position(): number {
    return this.index
  }

  /** 当前这一条 */
  current(): HistoryEntry {
    return this.entries[this.index]!
  }

  /**
   * 记一笔新的历史。
   *
   * 有了新的一笔，redo 分支就没了（标准撤销栈行为）。
   */
  push(source: string, caret: number): void {
    const entries = this.entries.slice(0, this.index + 1)
    entries.push({ source, caret })

    // 超出上限就丢掉最老的一条：内存是「条数 × 文档长度」
    while (entries.length > MAX_HISTORY) entries.shift()

    this.entries = entries
    this.index = entries.length - 1
  }

  /** 撤销一步；已经在最早的一条就返回 null */
  undo(): HistoryEntry | null {
    if (this.index <= 0) return null
    this.index -= 1
    return this.current()
  }

  /** 重做一步；已经在最新的一条就返回 null */
  redo(): HistoryEntry | null {
    if (this.index >= this.entries.length - 1) return null
    this.index += 1
    return this.current()
  }

  /** 换文档：历史重新开始（否则撤销会把上一篇的内容恢复出来） */
  reset(source: string, caret: number): void {
    this.entries = [{ source, caret }]
    this.index = 0
  }
}
