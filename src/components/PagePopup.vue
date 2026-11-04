<script setup lang="ts">
/**
 * 页面弹窗：点击 `[[页面名]]` 里的页面名时弹出，显示这个页面的内容。
 *
 * 正文可以直接编辑，编辑结果就是页面的 Markdown 源码。
 * 页面里再点一个链接，可以继续跳到别的页面。
 */
import { onBeforeUnmount, onMounted } from 'vue'
import type { LinkProvider } from '../core/types'
import MarkdownEditor from './MarkdownEditor.vue'

defineProps<{
  /** 页面标题 */
  title: string
  /** 页面正文（Markdown 源码） */
  content: string
  /** 页面还不存在 */
  missing?: boolean
  /** 能不能返回上一层 */
  canGoBack?: boolean
  /** 双向链接的候选来源 */
  links?: LinkProvider
  /** 外部内容的版本号：切换页面时递增 */
  externalVersion?: number
}>()

const emit = defineEmits<{
  (e: 'update:content', value: string): void
  (e: 'close'): void
  (e: 'back'): void
  (e: 'navigate', title: string): void
  (e: 'create'): void
}>()

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="popup-mask" @click.self="emit('close')">
    <div class="popup" role="dialog" aria-modal="true" :aria-label="title">
      <header class="popup-head">
        <button v-if="canGoBack" class="popup-back" type="button" @click="emit('back')">返回</button>
        <h2 class="popup-title">{{ title }}</h2>
        <button class="popup-close" type="button" @click="emit('close')">关闭</button>
      </header>

      <p v-if="missing" class="popup-missing">
        这个页面还不存在。
        <button class="popup-create" type="button" @click="emit('create')">创建页面</button>
      </p>

      <div class="popup-body">
        <MarkdownEditor
          :model-value="content"
          :links="links"
          :external-version="externalVersion"
          ownership="controlled"
          compact
          @update:model-value="emit('update:content', $event)"
          @open-page="emit('navigate', $event)"
        />
      </div>
    </div>
  </div>
</template>
