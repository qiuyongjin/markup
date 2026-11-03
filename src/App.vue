<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import DocBlock from './components/DocBlock.vue'
import { blockKind, splitBlocks } from './lib/blocks'
import { md } from './lib/markdown'
import { DEFAULT_SOURCE } from './lib/sample'

const source = shallowRef(DEFAULT_SOURCE)

/** 正在编辑的块下标，null 表示没有块处于编辑状态 */
const editingIndex = ref<number | null>(null)
/** 进入编辑状态时光标应落在的偏移 */
const pendingCaret = ref<number | null>(null)

const blocks = computed(() => splitBlocks(source.value))
const kinds = computed(() => blocks.value.map((block) => blockKind(block.raw)))
const rendered = computed(() => blocks.value.map((block) => md.render(block.raw)))

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
    lines: text.split('\n').length,
  }
})

function startEdit(index: number, caret: number | null) {
  editingIndex.value = index
  pendingCaret.value = caret
}

function updateBlock(index: number, raw: string) {
  const block = blocks.value[index]
  if (!block || block.raw === raw) return
  source.value = source.value.slice(0, block.start) + raw + source.value.slice(block.end)
}

function splitBlock(index: number, caret: number) {
  const block = blocks.value[index]
  if (!block) return

  const before = block.raw.slice(0, caret)
  const after = block.raw.slice(caret)
  source.value =
    source.value.slice(0, block.start) + before + '\n\n' + after + source.value.slice(block.end)

  editingIndex.value = index + 1
  pendingCaret.value = 0
}

function exitEdit() {
  editingIndex.value = null
}

/**
 * 点击文档以外的区域时退出编辑。
 *
 * 注意：这里必须用 composedPath() 判断，事件冒泡到 document 时 Vue 可能已经
 * 把点击到的节点从 DOM 中卸载，此时 event.target 已经脱离文档树。
 */
function onDocumentMouseDown(event: MouseEvent) {
  const path = event.composedPath()
  const inside = path.some(
    (node) => node instanceof HTMLElement && node.hasAttribute('data-doc-block'),
  )
  if (inside) return
  editingIndex.value = null
}

onMounted(() => document.addEventListener('mousedown', onDocumentMouseDown))
onUnmounted(() => document.removeEventListener('mousedown', onDocumentMouseDown))
</script>

<template>
  <main class="doc">
    <div
      v-for="(block, index) in blocks"
      :key="index"
      class="block"
      :class="[`kind-${kinds[index]}`, { 'is-editing': editingIndex === index }]"
      data-doc-block
    >
      <DocBlock
        :index="index"
        :raw="block.raw"
        :html="rendered[index] ?? ''"
        :editing="editingIndex === index"
        :caret="pendingCaret"
        @edit="startEdit"
        @update="updateBlock"
        @split="splitBlock"
        @exit="exitEdit"
      />
    </div>
  </main>

  <div class="status">mdoc · {{ stats.words }} 字 · {{ stats.lines }} 行</div>
</template>
