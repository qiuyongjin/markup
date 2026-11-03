# mdoc

一个极简风格的 Markdown 编辑器，基于 **Vite 8 + Vue 3 + TypeScript** 构建。

整个页面只有一个编辑区：没有工具栏，没有分栏预览，打开就能写。
**边输入边渲染**，标记没有闭合时按原文显示，闭合的瞬间立刻变成对应样式。

```text
*     ->  *
**    ->  **
** hello  ->  ** hello
** hello **  ->  hello（加粗）
`     ->  `
`hello`  ->  hello（行内代码）
```

## 功能

- **加粗** `**文字**`
- **行内代码** `` `文字` ``
- 编辑即预览，未闭合的标记保持原样
- 回车换行，光标跟着走到下一行
- 中文输入法正常可用：回车之后输入候选词也排在同一行
- 亮色 / 暗色主题自动跟随系统

## 开发

```bash
pnpm install
pnpm dev        # 启动开发服务器
pnpm build      # 类型检查 + 生产构建
pnpm preview    # 预览构建产物
pnpm test       # 解析器单元测试（node 直接运行）
```

## 目录结构

```
src/
├── App.vue                        # 首页：整页就是一个编辑区
├── components/
│   └── MarkdownEditor.vue         # 编辑区组件（只负责挂载/销毁）
├── markdown/
│   ├── parser.ts                  # Markdown 解析
│   ├── dom.ts                     # token 树 <-> DOM 互转 + 光标映射
│   └── editor.ts                  # 编辑器核心逻辑
├── main.ts                        # 应用入口
└── style.css                      # 全局样式（含亮/暗色主题变量）

test/
├── parser.test.ts                 # 解析器单元测试
├── browser.test.ts                # 浏览器端交互测试
└── build.mjs                      # 打包浏览器测试脚本

docs/
└── implementation.md              # 技术实现文档
```

## 文档

- [技术实现](docs/implementation.md) —— 解析规则、编辑模型、光标映射与测试方案
