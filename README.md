# mdoc

一个纯前端的 Markdown 编辑器，基于 **Vite 8 + Vue 3 + TypeScript** 构建。

当前为第一版：只实现编辑能力，不做任何数据存储，刷新页面内容即丢失。

## 功能

- 左右分栏，编辑区与预览区实时联动
- 工具栏一键插入常用格式（标题、加粗、斜体、删除线、行内代码、代码块、链接、列表、引用、分割线）
- 快捷键：`⌘/Ctrl + B` 加粗、`⌘/Ctrl + I` 斜体、`Tab` 缩进两格
- 实时统计字数、字符数与行数
- 两栏按比例联动滚动
- 亮色 / 暗色主题自适应，窄屏自动上下堆叠

## 开发

```bash
pnpm install
pnpm dev        # 启动开发服务器
pnpm build      # 类型检查 + 生产构建
pnpm preview    # 预览构建产物
```

## 目录结构

```
src/
├── App.vue                        # 布局、工具栏、状态与滚动同步
├── components/
│   ├── MarkdownEditor.vue         # 编辑区（textarea + 格式化）
│   └── MarkdownPreview.vue        # 预览区（markdown-it 渲染）
├── lib/
│   ├── format.ts                  # 格式化动作类型
│   ├── markdown.ts                # markdown-it 实例
│   └── sample.ts                  # 默认示例文档
├── main.ts
└── style.css
```

## 技术说明

预览使用 [markdown-it](https://github.com/markdown-it/markdown-it) 渲染，并关闭了 `html` 选项，源码中的原始 HTML 会被转义，避免 XSS。
