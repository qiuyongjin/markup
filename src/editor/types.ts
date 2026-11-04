/**
 * 编辑器控制器对外的契约。
 *
 * 这些是「编辑器」自己的东西（怎么弹候选窗口、怎么上报变更），
 * 和页面领域无关，所以留在 editor 侧；
 * 页面领域的端口类型在 `src/core/types.ts`。
 */
import type { LinkCandidate, LinkProvider } from '../core/types'
import type { Logger } from '../core/logger'

/** 候选窗口的状态 */
export interface SuggestionState {
  /** 候选窗口是否展开 */
  active: boolean
  /** `[[` 的源码偏移 */
  start: number
  /** 光标的源码偏移 */
  caret: number
  /** 已经输入的查询词 */
  query: string
  /** 候选项 */
  candidates: LinkCandidate[]
  /** 高亮的候选项下标，-1 表示没有高亮 */
  selected: number
  /** 光标的视口位置（候选窗口定位用） */
  rect: { left: number; top: number; bottom: number } | null
  /** 查询失败时的原因：有值说明是「查询挂了」，不是「没有匹配」 */
  error?: string
}

/** 一次渲染的统计信息（性能 HUD 用） */
export interface EditorStats {
  /** 源码长度（字符数） */
  length: number
  /**
   * 顶层 token 数（解析器的输出单位）。
   *
   * 注意：解析器把段落摊平成行内元素，
   * 所以这里是「元素个数」而不是「段落数」——
   * 一段 `**加粗** 文字` 算 2 个。
   */
  elements: number
  /** 解析耗时（毫秒） */
  parseMs: number
  /** 渲染耗时（毫秒） */
  renderMs: number
}

export interface EditorOptions {
  /** 双向链接的候选来源；不提供就没有候选窗口 */
  links?: LinkProvider
  /** 日志端口；不提供就是什么都不记 */
  logger?: Logger
  /** 每次渲染后的统计信息（性能 HUD 用） */
  onStats?: (stats: EditorStats) => void
  /** 候选窗口状态变化 */
  onSuggestion?: (state: SuggestionState | null) => void
  /** 点击了页面链接 */
  onOpenPage?: (title: string) => void
  /** 源码变化 */
  onChange?: (source: string) => void
  /**
   * 内容由谁拥有：
   *   - `'owned'`（默认）：编辑器拥有内容。外部回写的内容和自己的一样就忽略。
   *   - `'controlled'`：外部拥有内容，编辑器只上报变更。
   */
  ownership?: 'owned' | 'controlled'
  /**
   * 外部内容的版本号：只有父组件**主动替换**内容时才递增。
   *
   * `'controlled'` 模式下，编辑器靠它判断「这次外部变更不是我发起的」——
   * 比「内容字符串相等」可靠：任何中间层做一次规范化，
   * 字符串比较就会失效，进而触发 `setSource()`，把撤销历史清零、光标弹到文末。
   */
  externalVersion?: number
}
