<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { isInFence } from '../lib/blocks'

const props = defineProps<{
  index: number
  raw: string
  html: string
  editing: boolean
  caret: number | null
}>()

const emit = defineEmits<{
  edit: [index: number, caret: number | null]
  update: [index: number, raw: string]
  split: [index: number, caret: number]
  exit: []
}>()

const rootRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

/** 计算点击位置在渲染文本中的字符偏移 */
function charOffsetIn(root: HTMLElement, event: MouseEvent): number | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }

  let range: Range | null = null
  if (typeof doc.caretRangeFromPoint === 'function') {
    range = doc.caretRangeFromPoint(event.clientX, event.clientY)
  } else if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(event.clientX, event.clientY)
    if (position) {
      range = document.createRange()
      range.setStart(position.offsetNode, position.offset)
      range.collapse(true)
    }
  }
  if (!range) return null

  const pre = document.createRange()
  pre.selectNodeContents(root)
  try {
    pre.setEnd(range.startContainer, range.startOffset)
  } catch {
    return null
  }
  return pre.toString().length
}

/** 把渲染文本中的偏移映射回源码偏移 */
function toRawOffset(visible: string, offset: number): number {
  if (visible === props.raw) return Math.min(offset, props.raw.length)

  // 含有 markdown 语法标记时无法一一对应，退化为按“词”定位
  let start = offset
  while (start > 0 && !/\s/.test(visible[start - 1])) start--
  let end = offset
  while (end < visible.length && !/\s/.test(visible[end])) end++

  const word = visible.slice(start, end)
  if (word) {
    const index = props.raw.indexOf(word)
    if (index !== -1) return index + Math.min(offset - start, word.length)
  }
  return props.raw.length
}

function onMouseDown(event: MouseEvent) {
  if (props.editing) return

  const target = event.target as HTMLElement
  if (target.closest('textarea') || target.closest('a')) return

  // 阻止浏览器默认的“把焦点移到被点击元素上”，否则新建的输入框会立刻失焦
  event.preventDefault()

  const root = rootRef.value
  const offset = root ? charOffsetIn(root, event) : null
  const visible = root?.textContent ?? ''

  emit('edit', props.index, offset === null ? null : toRawOffset(visible, offset))
}

function resize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

watch(
  () => props.editing,
  async (editing) => {
    if (!editing) return
    await nextTick()
    const el = textareaRef.value
    if (!el) return
    resize()
    el.focus()
    const position = Math.min(props.caret ?? el.value.length, el.value.length)
    el.setSelectionRange(position, position)
  },
)

function onInput(event: Event) {
  emit('update', props.index, (event.target as HTMLTextAreaElement).value)
}

function onKeydown(event: KeyboardEvent) {
  const el = event.target as HTMLTextAreaElement

  if (event.key === 'Escape') {
    event.preventDefault()
    emit('exit')
    return
  }

  if (event.key === 'Enter' && !event.shiftKey && !isInFence(props.raw)) {
    event.preventDefault()
    emit('split', props.index, el.selectionStart)
    return
  }

  if (event.key === 'Tab') {
    event.preventDefault()
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = el.value.slice(0, start) + '  ' + el.value.slice(end)
    emit('update', props.index, next)
    nextTick(() => {
      el.setSelectionRange(start + 2, start + 2)
    })
  }
}
</script>

<template>
  <div ref="rootRef" class="block-body" @mousedown="onMouseDown">
    <template v-if="editing">
      <textarea
        ref="textareaRef"
        class="block-source"
        :value="raw"
        spellcheck="false"
        @input="onInput"
        @keydown="onKeydown"
      />
      <div class="block-live md-content" v-html="html" />
    </template>

    <template v-else>
      <div v-if="html" class="md-content" v-html="html" />
      <div v-else class="block-empty" />
    </template>
  </div>
</template>
