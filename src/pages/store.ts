/**
 * 页面仓库：保存所有「页面」（每个页面就是一段 Markdown）。
 *
 * 双向链接 `[[页面名]]` 指向的就是这里的页面：
 * 候选窗口列出已有的页面，回车可以顺手创建新页面。
 *
 * 页面只存在内存里：刷新页面就没了。
 *
 * 仓库用工厂创建（`createPageStore()`），这样测试能拿到隔离的实例，
 * 不会互相污染；模块级保留一个默认实例，现有 import 方式继续可用。
 */
import { reactive, readonly } from 'vue'
import type { LinkCandidate, LinkProvider } from '../core/types'

export interface Page {
  /** 页面标题，也就是链接里的文字 */
  title: string
  /** 页面正文（Markdown 源码） */
  content: string
  /** 最后修改时间 */
  updatedAt: number
}

/** 页面仓库对外的接口 */
export interface PageStore {
  /** 页面列表（响应式：页面变了，用它的地方会跟着更新） */
  pages: Readonly<Page[]>
  /** 页面数据的版本号：页面增删改时递增（外部靠它知道「该刷新了」） */
  revision: number
  /** 按标题找页面 */
  get(title: string): Page | undefined
  /** 页面是否已经存在 */
  has(title: string): boolean
  /** 创建页面；同名页面已经存在时直接返回它 */
  create(title: string, content?: string): Page | null
  /** 更新页面正文 */
  update(title: string, content: string): void
  /** 删除页面 */
  remove(title: string): void
  /** 按查询词找页面 */
  search(query: string): Page[]
  /** 候选窗口要用的数据 */
  suggest(query: string): LinkCandidate[]
  /** 页面内容的一句话摘要 */
  previewOf(content: string): string
  /** 存下「还没创建的页面」的正文（草稿） */
  saveDraft(title: string, content: string): void
  /** 读草稿（只读，不消费）：弹窗回显用 */
  draftOf(title: string): string | undefined
  /** 取出草稿并从仓库移除（读即消费）：创建页面时用 */
  takeDraft(title: string): string | undefined
}

/** 候选窗口最多列多少个页面 */
const MAX_SUGGESTIONS = 20
/** 摘要最多取多少个字 */
const PREVIEW_LENGTH = 60

/** 标题的比较方式：忽略大小写和首尾空格 */
function sameTitle(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

/**
 * 创建一个页面仓库。
 *
 * 工厂的理由是**可测试**（测试可以拿隔离实例）与**可复用**（多工作区），
 * 不是为将来存盘铺路 —— 项目明确不做持久化。
 */
export function createPageStore(): PageStore {
  const state = reactive<{ pages: Page[] }>({ pages: [] })
  /** 还没创建的页面的正文（草稿）：仓库是唯一的持有者 */
  const drafts = reactive(new Map<string, string>())
  /** 页面数据变化的版本号 */
  const version = reactive({ revision: 0 })

  const bump = (): void => {
    version.revision += 1
  }

  const get = (title: string): Page | undefined =>
    state.pages.find((page) => sameTitle(page.title, title))

  const has = (title: string): boolean => Boolean(get(title))

  /** 所有页面（按最后修改时间排序） */
  const list = (): Page[] => [...state.pages].sort((a, b) => b.updatedAt - a.updatedAt)

  const saveDraft = (title: string, content: string): void => {
    const name = title.trim()
    if (!name) return
    drafts.set(name, content)
  }

  const draftOf = (title: string): string | undefined => drafts.get(title.trim())

  const takeDraft = (title: string): string | undefined => {
    const name = title.trim()
    const draft = drafts.get(name)
    if (draft === undefined) return undefined
    drafts.delete(name)
    return draft
  }

  const create = (title: string, content?: string): Page | null => {
    const name = title.trim()
    if (!name) return null

    const existing = get(name)
    if (existing) {
      // 页面已经在了：这份草稿已经过时，清掉，别留下孤儿
      drafts.delete(name)
      return existing
    }

    // 草稿只被消费一次：页面建出来了，草稿就作废了（不留孤儿）
    const draft = takeDraft(name)
    // 没指定内容就用草稿
    const body = content ?? draft ?? ''
    const page: Page = { title: name, content: body, updatedAt: Date.now() }
    state.pages.push(page)
    bump()
    // 返回仓库里那一个，保证和 get() 拿到的是同一个对象
    return get(name) ?? null
  }

  const update = (title: string, content: string): void => {
    const page = get(title)
    if (!page) return
    page.content = content
    page.updatedAt = Date.now()
    bump()
  }

  const remove = (title: string): void => {
    const index = state.pages.findIndex((page) => sameTitle(page.title, title))
    if (index === -1) return
    state.pages.splice(index, 1)
    bump()
  }

  /** 按查询词找页面：前缀命中的排在前面，其次是更短的标题 */
  const search = (query: string): Page[] => {
    const keyword = query.trim().toLowerCase()
    const all = list()

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
  const previewOf = (content: string): string => {
    const text = content.replace(/\s+/g, ' ').trim()
    return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text
  }

  /** 候选窗口要用的数据 */
  const suggest = (query: string): LinkCandidate[] =>
    search(query).map((page) => ({
      title: page.title,
      preview: previewOf(page.content),
      exists: true,
    }))

  return {
    pages: readonly(state.pages),
    get revision(): number {
      return version.revision
    },
    get,
    has,
    create,
    update,
    remove,
    search,
    suggest,
    previewOf,
    saveDraft,
    draftOf,
    takeDraft,
  }
}

/**
 * 模块级默认实例。
 *
 * 现有 import 方式继续可用；测试想要隔离实例就自己 `createPageStore()`。
 */
export const defaultPageStore = createPageStore()

/** 页面列表（响应式：页面变了，用它的地方会跟着更新） */
export const pages = defaultPageStore.pages

/** 按标题找页面 */
export const getPage = defaultPageStore.get

/** 页面是否已经存在 */
export const hasPage = defaultPageStore.has

/** 创建页面；同名页面已经存在时直接返回它 */
export const createPage = defaultPageStore.create

/** 更新页面正文 */
export const updatePage = defaultPageStore.update

/** 删除页面 */
export const removePage = defaultPageStore.remove

/** 按查询词找页面：前缀命中的排在前面，其次是更短的标题 */
export const searchPages = defaultPageStore.search

/** 页面内容的一句话摘要 */
export const previewOf = defaultPageStore.previewOf

/** 候选窗口要用的数据 */
export const suggest = defaultPageStore.suggest

/** 存下「还没创建的页面」的正文（草稿） */
export const saveDraft = defaultPageStore.saveDraft

/** 读草稿（只读，不消费）：弹窗回显用 */
export const draftOf = defaultPageStore.draftOf

/** 取出草稿并从仓库移除（读即消费）：创建页面时用 */
export const takeDraft = defaultPageStore.takeDraft

/**
 * 默认实例的 LinkProvider。
 *
 * 组合根（App.vue）会自己注入一个 provider；
 * 组件没拿到注入的 provider 时，用这个兜底。
 *
 * 失败不静默：查询挂了和「没有匹配页面」要能区分开，
 * 建页失败也要有出口（返回失败结果，而不是默默丢掉）。
 */
export function defaultLinkProvider(): LinkProvider {
  return {
    suggest: (query) => {
      try {
        return { candidates: defaultPageStore.suggest(query) }
      } catch (error) {
        return { candidates: [], error: error instanceof Error ? error.message : '查询页面失败' }
      }
    },
    create: (title) => {
      try {
        const page = defaultPageStore.create(title)
        return page ? { ok: true } : { ok: false, error: '页面标题不能为空' }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : '创建页面失败' }
      }
    },
    exists: (title) => defaultPageStore.has(title),
    get revision(): number {
      return defaultPageStore.revision
    },
  }
}
