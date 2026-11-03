<script setup lang="ts">
/**
 * 首页：整页就是一个编辑区。
 *
 * 点击 `[[页面名]]` 里的页面名会弹出页面弹窗，
 * 弹窗里可以继续编辑页面，也可以点页面里的链接跳到别的页面。
 */
import { computed, ref } from 'vue'
import MarkdownEditor from './components/MarkdownEditor.vue'
import PagePopup from './components/PagePopup.vue'
import { createPage, getPage, updatePage } from './pages/store'

const editor = ref<InstanceType<typeof MarkdownEditor> | null>(null)

/** 打开的页面栈，最后一个就是当前显示的页面 */
const stack = ref<string[]>([])

const currentTitle = computed(() => stack.value[stack.value.length - 1] ?? '')
const currentPage = computed(() => (currentTitle.value ? getPage(currentTitle.value) : undefined))
const missing = computed(() => Boolean(currentTitle.value) && !currentPage.value)

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

/** 还没创建的页面，正文先存在这儿，点了「创建页面」再写进去 */
const drafts = new Map<string, string>()

/** 编辑页面正文 */
function saveContent(content: string): void {
  const title = currentTitle.value
  if (!title) return

  if (currentPage.value) {
    updatePage(title, content)
    return
  }
  // 页面还不存在，正文先存着，别让用户写的东西白写
  drafts.set(title, content)
}

/** 创建当前还不存在的页面 */
function createCurrent(): void {
  const title = currentTitle.value
  if (!title) return

  createPage(title, drafts.get(title) ?? '')
  drafts.delete(title)
}
</script>

<template>
  <main class="page" @click.self="focusEditor">
    <MarkdownEditor ref="editor" @open-page="openPage" />

    <PagePopup
      v-if="currentTitle"
      :title="currentTitle"
      :content="currentPage?.content ?? ''"
      :missing="missing"
      :can-go-back="stack.length > 1"
      @update:content="saveContent"
      @close="close"
      @back="back"
      @navigate="openPage"
      @create="createCurrent"
    />
  </main>
</template>
