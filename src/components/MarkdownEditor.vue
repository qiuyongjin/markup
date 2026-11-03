<script setup lang="ts">
/**
 * 实时 Markdown 编辑区：编辑即预览。
 * 具体逻辑都在 MarkdownEditor 里，这里只负责挂载与销毁。
 *
 * 另外负责把双向链接的候选窗口渲染出来：
 * 候选数据来自页面仓库，窗口的位置由编辑器算好。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MarkdownEditor, type SuggestionState } from '../markdown/editor'
import { createPage, hasPage, pages, suggest } from '../pages/store'
import LinkSuggest from './LinkSuggest.vue'

const props = withDefaults(
  defineProps<{
    /** 初始内容；变化时会同步到编辑区 */
    modelValue?: string
    /** 紧凑排版（页面弹窗里用） */
    compact?: boolean
    /** 挂载后是否自动聚焦 */
    autofocus?: boolean
  }>(),
  { modelValue: '', compact: false, autofocus: true },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'open-page', title: string): void
}>()

const editor = ref<HTMLDivElement | null>(null)
let controller: MarkdownEditor | null = null
const suggestion = ref<SuggestionState | null>(null)

function focusEditor(): void {
  controller?.focus()
}

function acceptSuggestion(index: number): void {
  controller?.acceptSuggestion(index)
}

function hoverSuggestion(index: number): void {
  controller?.selectCandidate(index)
}

onMounted(() => {
  if (!editor.value) return
  controller = new MarkdownEditor(editor.value, {
    links: {
      suggest: (query) => suggest(query),
      create: (title) => {
        createPage(title)
      },
      exists: (title) => hasPage(title),
    },
    onSuggestion: (state) => {
      suggestion.value = state
    },
    onOpenPage: (title) => {
      emit('open-page', title)
    },
    onChange: (source) => {
      emit('update:modelValue', source)
    },
  })
  if (props.modelValue) controller.setSource(props.modelValue)
  if (props.autofocus) controller.focus()
})

watch(
  () => props.modelValue,
  (value) => {
    if (!controller) return
    // 编辑区里的内容已经是这个值了，就不用再动它
    if (value === controller.markdown) return
    controller.setSource(value)
  },
)

// 页面多了少了，断链的样子要跟着变
watch(
  () => pages.value.length,
  () => controller?.refreshLinks(),
)

onBeforeUnmount(() => {
  controller?.destroy()
  controller = null
})

defineExpose({ focusEditor })
</script>

<template>
  <div class="editor" :class="{ 'editor--compact': compact }" ref="editor" contenteditable="true" spellcheck="false"
    role="textbox" aria-multiline="true" data-placeholder="在这里输入 Markdown，标记会自动变成样式…" />
  <LinkSuggest :state="suggestion" @select="acceptSuggestion" @hover="hoverSuggestion" />
</template>
