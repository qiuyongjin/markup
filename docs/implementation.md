# 技术实现

本文记录 mdoc 编辑器的实现思路：Markdown 怎么解析、编辑时 DOM 和源码怎么同步、光标怎么定位，以及测试方案。

## 整体结构

```text
src/markdown/
├── parser.ts    # 源码 -> token 树
├── dom.ts       # token 树 <-> DOM 互转，光标位置在源码与 DOM 之间映射
└── editor.ts    # 编辑器核心：拦截按键、修改源码、重新渲染、还原光标
```

`editor.ts` 不依赖任何框架，`MarkdownEditor.vue` 只负责把它挂到 `contenteditable` 元素上。

## 解析器

### 支持的语法

目前只实现两种最基础的行内语法，且不依赖任何第三方 Markdown 库：

| 语法 | 写法 | 规则 |
| --- | --- | --- |
| 加粗 | `**文字**` | 标记必须成对出现，依次配对（第 1 个配第 2 个，第 3 个配第 4 个） |
| 行内代码 | `` `文字` `` | 同上，且优先级高于加粗，代码内部不再解析其它语法 |

没有配对的标记会被当作普通文字原样显示。

### 解析流程

1. **找代码区间**：从左到右扫反引号，第 1 个与第 2 个配对，第 3 个与第 4 个配对，落单的反引号不处理。
2. **找加粗区间**：跳过代码区间，继续扫 `**`，同样依次配对。配对结果是「内容区间」，
   例如 `**abc**` 得到内容区间 `[2, 5)`。
3. **组装 token 树**：把代码区间和加粗区间转成一串事件（`boldOpen` / `code` / `boldClose`），
   按位置排序后线性扫描，用一个栈维护嵌套关系，产出 token 树。

事件上除了位置还带两个字段，用来保证标记本身既不出现在内容里、也不会漏掉：

- `textEnd`：本事件之前的普通文本到哪里结束（跳过起始标记）
- `resume`：本事件处理完之后，普通文本从哪里继续（跳过结束标记）

```ts
type InlineToken =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; children: InlineToken[] }
  | { kind: 'code'; text: string }
```

## 编辑模型

### 为什么是「受控编辑」

最初的实现是让浏览器直接改 DOM，事后把 DOM 反序列化回 Markdown 源码。实测发现这样会丢内容：

- 行尾输入的空格会被 Chromium 换成 `&nbsp;`
- 在行内元素边界继续输入时，Chromium 会做空白规整，把加粗内容末尾的空格挪走甚至吃掉

也就是说，DOM 里看到的内容和用户真正输入的内容并不一致。

所以改成**受控编辑**：Markdown 源码是唯一数据源，DOM 只是它的渲染结果。

```text
按键 -> beforeinput 拦截 -> 修改 Markdown 源码 -> 重新渲染 DOM -> 还原光标
```

拦截的 `inputType`：

| inputType | 处理 |
| --- | --- |
| `insertText` | 在选区处插入文本 |
| `insertParagraph` / `insertLineBreak` | 插入换行 |
| `deleteContentBackward` / `deleteContentForward` | 删除一个字素簇 |
| `deleteWordBackward` / `deleteWordForward` | 删除一个单词 |
| `formatBold` | 给选区套上 `**` |
| `insertFromPaste` | 由 `paste` 事件处理，只取纯文本 |

这样源码永远和用户输入一致，浏览器的 DOM 改写行为不会再污染内容。

### 输入法组合输入

组合输入期间浏览器会直接改 DOM，此时不能拦截，所以：

- `compositionstart` 之后放行所有 `beforeinput`，让输入法正常工作
- `compositionend` 之后用 `serializeNodes()` 把 DOM 的变化收回成源码，再重新渲染

退格按字素簇（grapheme cluster）删除，中文和 emoji 不会被拆开，用 `Intl.Segmenter` 实现。

## DOM 与源码的互转

### 渲染

标记元素上记录 `data-md` 属性，说明它对应哪个标记：

```html
<strong data-md="**">加粗</strong>
<code data-md="`">代码</code>
```

### 反序列化

再走一遍 DOM，遇到带 `data-md` 的元素就用对应标记把内容包起来，于是 DOM 又变回源码。
没有 `data-md` 的元素（例如浏览器自己插入的 `<b>`）会走兜底规则。

### 光标映射

源码里带标记，DOM 里没有，两者的位置对不上，所以需要在源码偏移量和 DOM 位置之间双向映射：

- `sourceOffsetAt(root, container, offset)` —— DOM 位置 → 源码偏移
- `positionForSourceOffset(root, target)` —— 源码偏移 → DOM 位置

映射的依据是每个节点的「源码长度」：文本节点是自身长度，带 `data-md` 的元素是
`标记长度 + 子节点长度 + 标记长度`。两个方向的遍历用同一套长度计算，所以互为逆运算。

几个边界情况的处理：

- 源码偏移落在**起始标记**内部 → 光标落到内容开头
- 源码偏移落在**结束标记**内部 → 光标落到该元素之后
- 因此打完 `**` 让加粗闭合时，光标正好停在加粗内容**外面**，继续输入的文字不会跑进加粗里

## 其它交互

- `Cmd/Ctrl + B` 给选区加粗（同时拦截浏览器默认插入 `<b>` 的行为）
- `Cmd/Ctrl + Z` / `Cmd/Ctrl + Shift + Z` 撤销、重做，自己维护源码历史栈
- 粘贴只取纯文本，粘贴进来的内容同样走 Markdown 渲染

## 测试

```bash
pnpm test          # 解析器单元测试，node 直接运行 .ts
pnpm test:browser  # 打包浏览器测试脚本
```

浏览器测试（`test/browser.test.ts`）在真实浏览器里跑，覆盖：

- 两种语法从第一个字符到闭合的完整输入序列
- 闭合后继续输入、退格、撤销重做
- 回车、粘贴、选区替换
- 输入法组合输入
- 光标在嵌套结构（加粗里的代码）中的定位

浏览器测试脚本打包后是一个静态页面，用任意静态服务器托管即可：

```bash
pnpm test:browser
cd test/dist && python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/index.html
```

页面底部会输出每条断言的结果。
