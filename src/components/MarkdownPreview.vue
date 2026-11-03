<script setup lang="ts">
import { computed, ref } from 'vue'
import { md } from '../lib/markdown'

const props = defineProps<{ source: string }>()

const emit = defineEmits<{ scroll: [] }>()

const rootRef = ref<HTMLElement | null>(null)

/** markdown-it 已禁用原始 HTML，这里渲染出来的内容是可信的 */
const html = computed(() => md.render(props.source))

/** 供父组件做滚动同步 */
function getScroller(): HTMLElement | null {
  return rootRef.value
}

function onScroll() {
  emit('scroll')
}

defineExpose({ getScroller })
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div ref="rootRef" class="preview markdown" v-html="html" @scroll="onScroll" />
</template>
