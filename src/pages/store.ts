/**
 * 页面仓库：保存所有「页面」（每个页面就是一段 Markdown）。
 *
 * 双向链接 `[[页面名]]` 指向的就是这里的页面：
 * 候选窗口列出已有的页面，回车可以顺手创建新页面。
 *
 * 页面只存在内存里：刷新页面就没了。
 */
import { computed, reactive } from 'vue'
import type { LinkCandidate } from '../markdown/editor'

export interface Page {
  /** 页面标题，也就是链接里的文字 */
  title: string
  /** 页面正文（Markdown 源码） */
  content: string
  /** 最后修改时间 */
  updatedAt: number
}

/** 候选窗口最多列多少个页面 */
const MAX_SUGGESTIONS = 20
/** 摘要最多取多少个字 */
const PREVIEW_LENGTH = 60

const state = reactive<{ pages: Page[] }>({ pages: [] })

/** 页面列表（响应式：页面变了，用它的地方会跟着更新） */
export const pages = computed(() => state.pages)

/** 标题的比较方式：忽略大小写和首尾空格 */
function sameTitle(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

/** 所有页面（按最后修改时间排序） */
export function listPages(): Page[] {
  return [...state.pages].sort((a, b) => b.updatedAt - a.updatedAt)
}

/** 按标题找页面 */
export function getPage(title: string): Page | undefined {
  return state.pages.find((page) => sameTitle(page.title, title))
}

/** 页面是否已经存在 */
export function hasPage(title: string): boolean {
  return Boolean(getPage(title))
}

/** 创建页面；同名页面已经存在时直接返回它 */
export function createPage(title: string, content = ''): Page | null {
  const name = title.trim()
  if (!name) return null

  const existing = getPage(name)
  if (existing) return existing

  const page: Page = { title: name, content, updatedAt: Date.now() }
  state.pages.push(page)
  return page
}

/** 更新页面正文 */
export function updatePage(title: string, content: string): void {
  const page = getPage(title)
  if (!page) return
  page.content = content
  page.updatedAt = Date.now()
}

/** 删除页面 */
export function removePage(title: string): void {
  const index = state.pages.findIndex((page) => sameTitle(page.title, title))
  if (index === -1) return
  state.pages.splice(index, 1)
}

/** 按查询词找页面：前缀命中的排在前面，其次是更短的标题 */
export function searchPages(query: string): Page[] {
  const keyword = query.trim().toLowerCase()
  const all = listPages()

  if (!keyword) return all.slice(0, MAX_SUGGESTIONS)

  return all
    .filter((page) => page.title.toLowerCase().includes(keyword))
    .sort((a, b) => {
      const aStart = a.title.toLowerCase().startsWith(keyword) ? 0 : 1
      const bStart = b.title.toLowerCase().startsWith(keyword) ? 0 : 1
      if (aStart !== bStart) return aStart - bStart
      if (a.title.length !== b.title.length) return a.title.length - b.title.length
      return b.updatedAt - a.updatedAt
    })
}

/** 页面内容的一句话摘要 */
export function previewOf(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim()
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text
}

/** 候选窗口要用的数据 */
export function suggest(query: string): LinkCandidate[] {
  return searchPages(query).map((page) => ({
    title: page.title,
    preview: previewOf(page.content),
    exists: true,
  }))
}
