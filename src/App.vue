<script setup lang="ts">
/**
 * 首页：整页就是一个编辑区。
 *
 * 点击 `[[页面名]]` 里的页面名会弹出页面弹窗，
 * 弹窗里可以继续编辑页面，也可以点页面里的链接跳到别的页面。
 */
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import type { LinkProvider } from './core/types'
import MarkdownEditor from './components/MarkdownEditor.vue'
import PagePopup from './components/PagePopup.vue'
import { createPage, defaultLinkProvider, draftOf, getPage, saveDraft, updatePage } from './pages/store'
import type { EditorStats } from './editor/types'

const editor = ref<InstanceType<typeof MarkdownEditor> | null>(null)

/**
 * 性能 HUD：只在 dev 下挂载。
 *
 * 用动态 import + `import.meta.env.DEV` 守卫，
 * 生产构建里这段代码会被整段去掉，HUD 不会进包。
 */
const DevStats = import.meta.env.DEV
  ? defineAsyncComponent(() => import('./components/DevStats.vue'))
  : null

/** 最近一次渲染的统计信息（性能 HUD 显示） */
const stats = ref<EditorStats | null>(null)

/** 打开的页面栈，最后一个就是当前显示的页面 */
const stack = ref<string[]>([])

const currentTitle = computed(() => stack.value[stack.value.length - 1] ?? '')
const currentPage = computed(() => (currentTitle.value ? getPage(currentTitle.value) : undefined))
const missing = computed(() => Boolean(currentTitle.value) && !currentPage.value)

/**
 * 弹窗正文：页面已经存在就用仓库里的内容，
 * 还没创建就用草稿 —— **草稿必须能回显**，
 * 否则用户会以为没保存成功，关掉重开再写一遍，把之前的内容覆盖掉。
 */
const popupContent = computed(() => currentPage.value?.content ?? draftOf(currentTitle.value) ?? '')

/**
 * 外部内容的版本号：只有**真正替换内容**（切换页面）时才递增。
 *
 * 弹窗里的编辑器是「外部拥有内容」的：它上报变更，父组件决定写到哪里。
 * 编辑器靠这个版本号判断「这次外部变更不是我发起的」，
 * 而不是靠字符串比较 —— 字符串比较一旦被中间层的规范化打破，
 * 就会误判成「内容变了」，把撤销历史清零、光标弹到文末。
 */
const contentVersion = ref(0)
watch(currentTitle, () => {
  contentVersion.value += 1
})

/**
 * 页面仓库注入编辑器的地方（组合根）。
 *
 * 编辑器只认识 `LinkProvider` 这个端口，不知道页面仓库的存在。
 */
const links: LinkProvider = defaultLinkProvider()

/** 点击页面空白处时聚焦编辑区 */
function focusEditor(): void {
  editor.value?.focusEditor()
}

/** 打开一个页面（正文里的链接、弹窗里的链接都走这里） */
function openPage(title: string): void {
  if (!title) return
  stack.value = [...stack.value, title]
}

/** 返回上一层 */
function back(): void {
  stack.value = stack.value.slice(0, -1)
}

/** 关闭弹窗：焦点回到正文 */
function close(): void {
  stack.value = []
  focusEditor()
}

/** 编辑页面正文 */
function saveContent(content: string): void {
  const title = currentTitle.value
  if (!title) return

  if (currentPage.value) {
    updatePage(title, content)
    return
  }
  // 页面还不存在，正文先存在仓库里（草稿）：关掉弹窗再打开也还在
  saveDraft(title, content)
}

/** 创建当前还不存在的页面（草稿的内容一并写进去） */
function createCurrent(): void {
  const title = currentTitle.value
  if (!title) return

  createPage(title)
}
</script>

<template>
  <main class="page" @click.self="focusEditor">
    <MarkdownEditor
      ref="editor"
      :links="links"
      @stats="stats = $event"
      @open-page="openPage"
    />

    <DevStats v-if="DevStats" :stats="stats" />

    <PagePopup
      v-if="currentTitle"
      :title="currentTitle"
      :content="popupContent"
      :missing="missing"
      :links="links"
      :external-version="contentVersion"
      :can-go-back="stack.length > 1"
      @update:content="saveContent"
      @close="close"
      @back="back"
      @navigate="openPage"
      @create="createCurrent"
    />
  </main>
</template>
