<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import MarkdownEditor from './components/MarkdownEditor.vue'
import MarkdownPreview from './components/MarkdownPreview.vue'
import type { FormatAction } from './lib/format'
import { DEFAULT_SOURCE } from './lib/sample'

const source = shallowRef(DEFAULT_SOURCE)

const editorRef = useTemplateRef<InstanceType<typeof MarkdownEditor>>('editor')
const previewRef = useTemplateRef<InstanceType<typeof MarkdownPreview>>('preview')

const toolbar: { action: FormatAction; label: string; title: string }[] = [
  { action: 'heading', label: 'H1', title: '标题' },
  { action: 'bold', label: 'B', title: '加粗 (⌘/Ctrl + B)' },
  { action: 'italic', label: 'I', title: '斜体 (⌘/Ctrl + I)' },
  { action: 'strikethrough', label: 'S', title: '删除线' },
  { action: 'code', label: 'Code', title: '行内代码' },
  { action: 'codeBlock', label: 'Code Block', title: '代码块' },
  { action: 'link', label: 'Link', title: '链接' },
  { action: 'bulletList', label: '• List', title: '无序列表' },
  { action: 'orderedList', label: '1. List', title: '有序列表' },
  { action: 'quote', label: 'Quote', title: '引用' },
  { action: 'hr', label: 'HR', title: '分割线' },
]

const stats = computed(() => {
  const text = source.value
  const cjk = text.match(/[\u4e00-\u9fa5]/g)?.length ?? 0
  const latin = text
    .replace(/[\u4e00-\u9fa5]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length

  return {
    words: cjk + latin,
    chars: text.length,
    lines: text.split('\n').length,
  }
})

/** 两栏按比例联动滚动；用时间戳避免相互触发形成回环 */
let lastSync = 0
function syncScroll(from: 'editor' | 'preview') {
  const now = Date.now()
  if (now - lastSync < 150) return

  const src = from === 'editor' ? editorRef.value?.getScroller() : previewRef.value?.getScroller()
  const dst = from === 'editor' ? previewRef.value?.getScroller() : editorRef.value?.getScroller()
  if (!src || !dst) return

  const max = src.scrollHeight - src.clientHeight
  const ratio = max > 0 ? src.scrollTop / max : 0
  dst.scrollTop = ratio * (dst.scrollHeight - dst.clientHeight)
  lastSync = now
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <h1 class="app-title">mdoc</h1>
      <div class="stats">
        <span>{{ stats.words }} 字</span>
        <span>{{ stats.chars }} 字符</span>
        <span>{{ stats.lines }} 行</span>
      </div>
    </header>

    <div class="toolbar">
      <button
        v-for="item in toolbar"
        :key="item.action"
        type="button"
        class="tool"
        :title="item.title"
        @click="editorRef?.applyFormat(item.action)"
      >
        {{ item.label }}
      </button>
      <span class="toolbar-hint">⌘/Ctrl + B 加粗 · ⌘/Ctrl + I 斜体</span>
    </div>

    <main class="panes">
      <section class="pane">
        <div class="pane-head">Markdown</div>
        <MarkdownEditor ref="editor" v-model="source" @scroll="syncScroll('editor')" />
      </section>

      <section class="pane">
        <div class="pane-head">预览</div>
        <MarkdownPreview ref="preview" :source="source" @scroll="syncScroll('preview')" />
      </section>
    </main>
  </div>
</template>
