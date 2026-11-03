<script setup lang="ts">
import { ref } from 'vue'
import MarkdownEditor from './components/MarkdownEditor.vue'

const editor = ref<InstanceType<typeof MarkdownEditor> | null>(null)

/** 点击页面空白处时聚焦编辑区 */
function focusEditor(): void {
  editor.value?.focusEditor()
}
</script>

<template>
  <main class="page" @click.self="focusEditor">
    <MarkdownEditor ref="editor" />
  </main>
</template>
