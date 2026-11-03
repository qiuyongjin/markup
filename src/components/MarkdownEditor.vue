<script setup lang="ts">
/**
 * 实时 Markdown 编辑区：编辑即预览。
 * 具体逻辑都在 MarkdownEditor 里，这里只负责挂载与销毁。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { MarkdownEditor } from '../markdown/editor'

const editor = ref<HTMLDivElement | null>(null)
let controller: MarkdownEditor | null = null

function focusEditor(): void {
  controller?.focus()
}

defineExpose({ focusEditor })

onMounted(() => {
  if (!editor.value) return
  controller = new MarkdownEditor(editor.value)
  controller.focus()
})

onBeforeUnmount(() => {
  controller?.destroy()
  controller = null
})
</script>

<template>
  <div class="editor" ref="editor" contenteditable="true" spellcheck="false" role="textbox"
    aria-multiline="true" data-placeholder="在这里输入 Markdown，标记会自动变成样式…" />
</template>
