# mdoc

一个极简风格的 Markdown 编辑器，基于 **Vite 8 + Vue 3 + TypeScript + Sass** 构建。

整个页面只有一个编辑区：没有工具栏，没有分栏预览，打开就能写。
**边输入边渲染**，标记没有闭合时按原文显示，闭合的瞬间立刻变成对应样式。

```text
*     ->  *
**    ->  **
** hello  ->  ** hello
** hello **  ->  hello（加粗）
`     ->  `
`hello`  ->  hello（行内代码）
#     ->  #（空格还没打出来，不是标题）
# 标题  ->  标题（一级标题）
## 标题  ->  标题（二级标题）
[[     ->  [[（候选窗口弹出）
[[hello  ->  [[hello（候选窗口里可以回车创建页面）
[[hello]]  ->  hello（双向链接，可点击）
```

## 功能

- **标题** `# 文字`（行首 1~6 个 `#`，后面跟一个空格）
- **加粗** `**文字**`
- **行内代码** `` `文字` ``
- **双向链接** `[[页面名]]`
  - 输入 `[[` 时，光标下方弹出候选窗口，列出已有的页面（带内容摘要）
  - 候选窗口里没有匹配的页面时，窗口提示「输入内容并按回车，即可创建页面」
  - 输入 `[[hello` 按回车：创建页面 `hello`，并补全成 `[[hello]]`
  - `↑` `↓` 切换候选项，`Enter` 确认，`Esc` 关掉窗口
  - 点击链接里的页面名，弹窗显示这个页面，页面内容可以直接编辑
  - 光标停在链接里时，`Cmd/Ctrl + Enter` 也能打开这个页面
  - 页面里的链接可以继续点开，弹窗顶部有「返回」
  - 指向还没写的页面的链接显示成灰色虚线，一眼能看出是断链
  - 页面只存在内存里，刷新页面就没了
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

样式用 Sass 编写，源码在 `src/styles/`：主题色与字体放在 `_tokens.scss`，
反复出现的样式片段放在 `_mixins.scss`，其余按界面部分拆成 `_base` / `_editor` /
`_suggest` / `_popup`，由 `main.scss` 拼起来。开发服务器和构建都会自动编译。

## 目录结构

```text
src/
├── App.vue                        # 首页：整页就是一个编辑区 + 页面弹窗
├── components/
│   ├── MarkdownEditor.vue         # 编辑区组件（只负责挂载/销毁）
│   ├── LinkSuggest.vue            # 候选窗口（[[ 触发）
│   └── PagePopup.vue              # 页面弹窗（点击链接打开）
├── markdown/
│   ├── parser.ts                  # Markdown 解析
│   ├── dom.ts                     # token 树 <-> DOM 互转 + 光标映射
│   └── editor.ts                  # 编辑器核心逻辑
├── pages/
│   └── store.ts                   # 页面仓库（页面只存在内存里）
├── main.ts                        # 应用入口
└── styles/                        # 全局样式，用 Sass 写
    ├── main.scss                  # 样式入口：把各个部分拼起来
    ├── _tokens.scss               # 主题色与字体（亮/暗两套）
    ├── _mixins.scss               # 反复出现的样式片段
    ├── _base.scss                 # 主题变量、重置与页面骨架
    ├── _editor.scss               # 编辑区与 Markdown 排版
    ├── _suggest.scss              # 候选窗口
    └── _popup.scss                # 页面弹窗

test/
├── parser.test.ts                 # 解析器单元测试
├── browser.test.ts                # 浏览器端交互测试
└── build.mjs                      # 打包浏览器测试脚本

docs/
└── implementation.md              # 技术实现文档
```

## 文档

- [技术实现](docs/implementation.md) —— 解析规则、编辑模型、光标映射、双向链接与测试方案
