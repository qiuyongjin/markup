<script setup lang="ts">
/**
 * 实时 Markdown 编辑区：编辑即预览。
 * 具体逻辑都在 MarkdownEditor 里，这里只负责挂载与销毁。
 *
 * 另外负责把双向链接的候选窗口渲染出来：
 * 候选数据来自注入的 LinkProvider，窗口的位置由编辑器算好。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LinkProvider } from '../core/types'
import { consoleLogger, noopLogger } from '../core/logger'
import { MarkdownEditor } from '../editor/editor'
import type { EditorStats, SuggestionState } from '../editor/types'
import LinkSuggest from './LinkSuggest.vue'

const props = withDefaults(
  defineProps<{
    /** 初始内容；变化时会同步到编辑区 */
    modelValue?: string
    /** 紧凑排版（页面弹窗里用） */
    compact?: boolean
    /** 挂载后是否自动聚焦 */
    autofocus?: boolean
    /** 双向链接的候选来源；不注入就用默认的页面仓库 */
    links?: LinkProvider
    /**
     * 内容由谁拥有：
     *   - `'owned'`（默认）：编辑器拥有内容
     *   - `'controlled'`：外部拥有内容，编辑器只上报变更
     */
    ownership?: 'owned' | 'controlled'
    /** 外部内容的版本号：父组件主动替换内容时才递增 */
    externalVersion?: number
  }>(),
  {
    modelValue: '',
    compact: false,
    autofocus: true,
    links: undefined,
    ownership: 'owned',
    externalVersion: undefined,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'open-page', title: string): void
  (e: 'stats', stats: EditorStats): void
}>()

const editor = ref<HTMLDivElement | null>(null)
let controller: MarkdownEditor | null = null
const suggestion = ref<SuggestionState | null>(null)

/**
 * 日志端口：开发环境打到 console，生产环境什么都不记。
 *
 * 之前这个项目里一条日志都没有，出了问题完全无从查起。
 */
const logger = import.meta.env.DEV ? consoleLogger() : noopLogger

/**
 * 候选来源：由组合根（App.vue）注入。
 *
 * 这里**不自己去拿页面仓库** —— 依赖方向要求「页面仓库的实现」只在组合根出现，
 * 组件只认识 `LinkProvider` 这个端口。没注入就没有候选窗口（与注入前一致）。
 */

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
    links: props.links,
    logger,
    ownership: props.ownership,
    externalVersion: props.externalVersion,
    onStats: import.meta.env.DEV
      ? (stats) => {
          emit('stats', stats)
        }
      : undefined,
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
  [() => props.modelValue, () => props.externalVersion],
  ([value, version]) => {
    if (!controller) return
    // 换不换内容由「内容所有权契约」决定（控制器里判）：
    // 编辑器拥有内容时靠字符串相等，外部拥有内容时靠版本号。
    controller.applyExternalSource(value, version)
  },
)

// 页面增删改了，断链的样子要跟着变
watch(
  () => props.links?.revision,
  () => controller?.refreshLinks(),
)

onBeforeUnmount(() => {
  controller?.destroy()
  controller = null
})

defineExpose({ focusEditor })
</script>

<template>
  <div
    ref="editor"
    class="editor"
    :class="{ 'editor--compact': compact }"
    contenteditable="true"
    spellcheck="false"
    role="textbox"
    aria-multiline="true"
    data-placeholder="在这里输入 Markdown，标记会自动变成样式…"
  />
  <LinkSuggest :state="suggestion" @select="acceptSuggestion" @hover="hoverSuggestion" />
</template>
