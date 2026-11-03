<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { FormatAction } from '../lib/format'

const model = defineModel<string>({ required: true })

const emit = defineEmits<{ scroll: [] }>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)

/** 供父组件做滚动同步 */
function getScroller(): HTMLElement | null {
  return textareaRef.value
}

/** 用 text 替换 [start, end) 区间，并恢复光标与滚动位置 */
function replaceRange(
  start: number,
  end: number,
  text: string,
  selectionStart: number,
  selectionEnd: number,
) {
  const el = textareaRef.value
  if (!el) return

  const scrollTop = el.scrollTop
  model.value = model.value.slice(0, start) + text + model.value.slice(end)

  nextTick(() => {
    el.focus()
    el.setSelectionRange(selectionStart, selectionEnd)
    el.scrollTop = scrollTop
  })
}

/** 在选中的内容两侧包裹标记；没有选中时插入占位文本 */
function wrapSelection(before: string, after: string, placeholder: string) {
  const el = textareaRef.value
  if (!el) return

  const start = el.selectionStart
  const end = el.selectionEnd
  const selected = model.value.slice(start, end)
  const text = selected || placeholder

  replaceRange(
    start,
    end,
    before + text + after,
    start + before.length,
    start + before.length + text.length,
  )
}

/** 给选区所在的所有行加前缀 */
function prefixLines(prefix: string, numbered = false) {
  const el = textareaRef.value
  if (!el) return

  const start = el.selectionStart
  const end = el.selectionEnd
  const lineStart = model.value.lastIndexOf('\n', start - 1) + 1
  const lineBreak = model.value.indexOf('\n', end)
  const lineEnd = lineBreak === -1 ? model.value.length : lineBreak

  const block = model.value.slice(lineStart, lineEnd)
  const prefixed = block
    .split('\n')
    .map((line, index) => (numbered ? `${index + 1}. ` : prefix) + line)
    .join('\n')

  replaceRange(lineStart, lineEnd, prefixed, lineStart, lineStart + prefixed.length)
}

/** 在光标处插入纯文本 */
function insertText(text: string) {
  const el = textareaRef.value
  if (!el) return

  const start = el.selectionStart
  const end = el.selectionEnd
  replaceRange(start, end, text, start + text.length, start + text.length)
}

/** 对选中的内容加一层 markdown 标记 */
function applyFormat(action: FormatAction) {
  switch (action) {
    case 'bold':
      wrapSelection('**', '**', '加粗文字')
      break
    case 'italic':
      wrapSelection('*', '*', '斜体文字')
      break
    case 'strikethrough':
      wrapSelection('~~', '~~', '删除线文字')
      break
    case 'code':
      wrapSelection('`', '`', 'code')
      break
    case 'codeBlock':
      wrapSelection('```\n', '\n```', 'code')
      break
    case 'link': {
      const el = textareaRef.value
      if (!el) return
      const start = el.selectionStart
      const end = el.selectionEnd
      const text = model.value.slice(start, end) || '链接文字'
      const before = '['
      const after = '](https://)'
      replaceRange(
        start,
        end,
        before + text + after,
        start + before.length + text.length,
        start + before.length + text.length + 1,
      )
      break
    }
    case 'heading':
      prefixLines('# ')
      break
    case 'bulletList':
      prefixLines('- ')
      break
    case 'orderedList':
      prefixLines('', true)
      break
    case 'quote':
      prefixLines('> ')
      break
    case 'hr':
      insertText('\n\n---\n\n')
      break
  }
}

function onInput(event: Event) {
  model.value = (event.target as HTMLTextAreaElement).value
}

function onKeydown(event: KeyboardEvent) {
  const mod = event.metaKey || event.ctrlKey

  if (mod && event.key.toLowerCase() === 'b') {
    event.preventDefault()
    applyFormat('bold')
    return
  }

  if (mod && event.key.toLowerCase() === 'i') {
    event.preventDefault()
    applyFormat('italic')
    return
  }

  if (event.key === 'Tab') {
    event.preventDefault()
    insertText('  ')
  }
}

function onScroll() {
  emit('scroll')
}

defineExpose({ applyFormat, getScroller })
</script>

<template>
  <textarea
    ref="textareaRef"
    class="editor"
    :value="model"
    spellcheck="false"
    placeholder="在这里编写 Markdown…"
    @input="onInput"
    @keydown="onKeydown"
    @scroll="onScroll"
  />
</template>
