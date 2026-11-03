# mdoc

一个纯前端的 Markdown 编辑器，基于 **Vite 8 + Vue 3 + TypeScript** 构建。

当前为第一版：只实现编辑能力，不做任何数据存储，刷新页面内容即丢失。

## 交互

整篇文档默认以**排版后的样子**呈现，页面上没有任何工具栏：

- **点击任意段落** → 该段切换成源码编辑框，光标落在点击的位置
- 编辑时，源码下方**实时显示**这一段的渲染结果
- **点击文档以外区域**或按 `Esc` → 退出编辑，段落还原为排版效果
- `Enter` 另起一段，`Tab` 缩进两格

## 功能

- 块级即时编辑：文档按空行切分成块，只渲染/编辑被点击的那一块
- 实时渲染预览（markdown-it）
- 亮色 / 暗色主题自适应
- 底部状态栏显示字数与行数

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
├── App.vue                        # 文档布局、编辑状态协调
├── components/
│   └── DocBlock.vue               # 单个块：渲染态 / 源码编辑态
├── lib/
│   ├── blocks.ts                  # 文档切块（跳过代码块内的空行）
│   ├── markdown.ts                # markdown-it 实例
│   └── sample.ts                  # 默认示例文档
├── main.ts
└── style.css
```

## 技术说明

- 预览使用 [markdown-it](https://github.com/markdown-it/markdown-it) 渲染，并关闭了 `html` 选项，源码中的原始 HTML 会被转义，避免 XSS。
- 切块时会识别围栏代码块（``` / ~~~），代码块内部的空行不会被误切。
- 监听文档级 `mousedown` 时使用 `composedPath()` 判断点击位置，因为事件冒泡到 `document` 时 Vue 可能已经把节点卸载，此时 `event.target` 已脱离文档树。
