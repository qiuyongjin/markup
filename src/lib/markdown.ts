import MarkdownIt from 'markdown-it'

/**
 * 全局唯一的 markdown-it 实例。
 *
 * - html: false  源码中的 HTML 不会被解析，天然避免 XSS
 * - linkify      自动把裸链接识别为可点击链接
 * - breaks       单个换行即渲染为 <br>，更贴近编辑器的直觉
 */
export const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})
