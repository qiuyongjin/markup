<script setup lang="ts">
/**
 * 候选窗口：输入 `[[` 时出现在光标下方，列出已有的页面。
 *
 * 没有候选页面时，窗口里给一句提示，告诉用户可以输入内容来创建页面；
 * 查询失败时显示的是另一句 —— 「没有匹配页面」和「查询挂了」必须能区分开。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SuggestionState } from '../editor/types'

const props = defineProps<{ state: SuggestionState | null }>()
const emit = defineEmits<{
  (e: 'select', index: number): void
  (e: 'hover', index: number): void
}>()

const panel = ref<HTMLElement | null>(null)
/** 窗口自己的尺寸，用来躲开屏幕边缘 */
const box = ref({ width: 0, height: 0 })
/** 下面放不下的时候，窗口改放到光标上面 */
const flipped = ref(false)
/** 视口尺寸：浏览器窗口变了，位置要重新摆 */
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })

const style = computed(() => {
  const rect = props.state?.rect
  if (!rect) return {}

  const gap = 6
  const margin = 8
  const below = rect.bottom + gap
  const above = rect.top - box.value.height - gap

  const top = flipped.value ? Math.max(margin, above) : below
  const left = Math.max(margin, Math.min(rect.left, viewport.value.width - box.value.width - margin))
  return { left: `${left}px`, top: `${top}px` }
})

/** 量一下窗口的尺寸，顺便决定放在光标下面还是上面 */
async function measure(): Promise<void> {
  await nextTick()
  const element = panel.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  box.value = { width: rect.width, height: rect.height }

  const caret = props.state?.rect
  if (!caret) return
  // 光标下面放不下就翻到上面去
  flipped.value =
    caret.bottom + 6 + rect.height > viewport.value.height - 8 && caret.top - 6 - rect.height > 8
}

/** 浏览器窗口变了，位置跟着重新算 */
function onResize(): void {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  void measure()
}

watch(
  () => props.state,
  () => void measure(),
)

/** 高亮的项跑到窗口外面时，把它滚回来 */
watch(
  () => props.state?.selected,
  async () => {
    await nextTick()
    const element = panel.value
    const active = element?.querySelector('.link-suggest-item.is-active') as HTMLElement | null
    if (!element || !active) return

    // 自己算着滚，不动页面
    const top = active.offsetTop
    const bottom = top + active.offsetHeight
    if (top < element.scrollTop) {
      element.scrollTop = top
    } else if (bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = bottom - element.clientHeight
    }
  },
)

onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
</script>

<template>
  <div v-if="state" ref="panel" class="link-suggest" :style="style" @mousedown.prevent>
    <ul v-if="state.candidates.length" class="link-suggest-list">
      <li
        v-for="(item, index) in state.candidates"
        :key="`${item.title}-${index}`"
        class="link-suggest-item"
        :class="{ 'is-active': index === state.selected }"
        @mouseenter="emit('hover', index)"
        @click="emit('select', index)"
      >
        <span class="link-suggest-head">
          <span class="link-suggest-name">{{ item.title }}</span>
          <span v-if="!item.exists" class="link-suggest-tag">新建页面</span>
        </span>
        <span v-if="item.preview" class="link-suggest-preview">{{ item.preview }}</span>
      </li>
    </ul>
    <p v-else-if="state.error" class="link-suggest-empty link-suggest-error">
      查询失败：{{ state.error }}
    </p>
    <p v-else class="link-suggest-empty">输入内容并按回车，即可创建页面</p>

    <p v-if="state.candidates.length" class="link-suggest-hint">↑↓ 选择 · Enter 确认 · Esc 关闭</p>
  </div>
</template>
