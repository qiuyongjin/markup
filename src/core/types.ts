/**
 * 领域端口类型：编辑器与页面仓库都从这里取。
 *
 * 这些类型描述的是「页面」这个领域概念（页面标题、页面是否存在、候选列表），
 * 却原来定义在编辑器控制器里，导致领域层反向依赖表示层。
 * 放在 `core/` 之后，依赖箭头变成单向：
 *
 *   pages/ ──► core/types ◄── editor/
 *
 * `core/` 是零依赖层：不 import vue，不碰 document / window。
 */

/** 候选窗口里的一项 */
export interface LinkCandidate {
  /** 页面标题（链接的目标） */
  title: string
  /** 页面内容摘要（可以没有） */
  preview?: string
  /** 页面是否已经存在；false 表示这是「新建页面」这一项 */
  exists: boolean
}

/** 一次操作的结果：要么成功，要么带上失败的原因 */
export type OpResult = { ok: true } | { ok: false; error: string }

/** 候选查询的结果 */
export interface SuggestResult {
  /** 候选列表；查询失败时是空的 */
  candidates: LinkCandidate[]
  /** 查询失败的原因；没有失败就是 undefined */
  error?: string
}

/** 候选窗口的数据来源 */
export interface LinkProvider {
  /** 根据查询词返回候选页面 */
  suggest(query: string): SuggestResult
  /** 创建一个页面 */
  create(title: string): OpResult
  /** 页面是否已经存在（用来把断链标出来） */
  exists?(title: string): boolean
  /**
   * 页面数据的版本号：页面增删改时递增。
   *
   * 编辑器靠它知道「该刷新断链的样子了」——
   * 比「页面数量变了」可靠（增删改不一定改数量）。
   */
  revision?: number
}
