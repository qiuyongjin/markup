<script setup lang="ts">
/**
 * 开发环境的性能 HUD。
 *
 * 只在 dev 下挂载（见 App.vue 的 `import.meta.env.DEV` 守卫），
 * 生产构建里既不渲染、也不进包。
 *
 * 它把「解析 / 渲染耗时」变成屏幕上的数字：
 * 性能问题从此不再是「感觉有点卡」，而是看得见的数。
 */
import type { EditorStats } from '../editor/types'

defineProps<{
  /** 最近一次渲染的统计信息 */
  stats: EditorStats | null
}>()
</script>

<template>
  <div v-if="stats" class="dev-stats">
    <span class="dev-stats-item">源码 {{ stats.length }} 字符</span>
    <span class="dev-stats-item">{{ stats.elements }} 元素</span>
    <span class="dev-stats-item">解析 {{ stats.parseMs.toFixed(2) }} ms</span>
    <span class="dev-stats-item">渲染 {{ stats.renderMs.toFixed(2) }} ms</span>
  </div>
</template>

<!-- 样式跟着组件走：组件不进生产包，样式也就不进 -->
<style lang="scss" scoped src="../styles/_dev.scss"></style>
