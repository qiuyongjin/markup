# Markup 架构评审与调整方案

> **本文性质**：项目架构层面的评审记录与调整方向。
>
> **评审范围**：分层与依赖、模块职责、单一事实来源、可测试性、可扩展性、工程化基建。
> **不在范围**：界面与交互设计、Markdown 语法本身的产品取舍、是否落盘的存储决策。
>
> **硬约束**：本次评审**不改动任何运行时代码**。下列所有建议均以「后续可独立合入、
> 每一步都保持现有功能不变」的小步形式给出。
>
> 评审基线：`main` @ `17dd5c7`，`pnpm test` 全绿，`pnpm build` 通过。

### 怎么读这份文档

| 你是 | 建议读法 |
| --- | --- |
| **只想知道要改什么** | [§0 结论速览](#0-结论速览) → [§5.0 优先级分层](#50-优先级分层先看这张表) |
| **要动手实施** | §5.0 → 按 Phase 顺序做，每个 Phase 都有验收标准 |
| **想理解某个结论怎么来的** | [§2 主要发现](#2-主要发现)（F1–F11，每条都带代码位置） |
| **想看证据** | [附录 B 实测数据](#附录-b性能实测数据)（本文所有数字都来自实测，可复现） |
| **想查改哪个文件** | [附录 C 文件级改动索引](#附录-c文件级改动索引) |

**一句话结论**：Markup 的功能边界和产品取舍都很好，**问题在结构不在行为**。
真正需要动手的是四件事 —— 建安全网、**让草稿能被看见**、修性能悬崖、**让系统可观察**；
其余的结构性优化都可以推迟，硬做反而是过度设计。

---

## 0. 结论速览

Markup 是一个**功能边界收得很干净**的项目：没有工具栏、没有分栏预览、页面只存内存，
四种 Markdown 语法 + 双向链接，编辑器核心（`markdown/editor.ts`）不依赖任何框架。
这些取舍是合理的，本次评审**不建议推翻其中任何一条**。

> **本次评审的前提（与项目当前方向一致）**：
> - **不做数据持久化** —— 页面只存内存，刷新即失。这是**有意的产品决定**，本次评审认可并保留；
>   评审中所有"丢失"相关的发现，都**不是**指刷新丢失（见 F4 的澄清）。
> - **当前重心是功能与体验的打磨** —— 因此评审把**体验类缺陷**（F4）与
>   **可观察性**（F10）提到了比纯结构问题更高的位置。

问题集中在**结构而不是行为**：模块边界画错了地方、依赖方向反了、
"一种语法"和"一个页面"的概念各自散落在多个文件里。
再叠加一处**词法分析器的二次复杂度**和**完全不可观察**的现状。

### 0.1 按五个目标方向评估

| 目标方向 | 现状 | 评级 | 对应发现 | 详见 |
| --- | --- | --- | --- | --- |
| **架构清晰** | 依赖方向反了（`pages` → `editor`）；页面状态三个持有者；`editor.ts` 七职责单体 | ❌ | F1、F2、F4 | §2 |
| **可测试** | 纯逻辑与 DOM 强耦合，node 侧只能测解析器；无 CI、无 lint | ❌ | F8、F9 | §2 |
| **可观察** | **0 条日志、0 处错误上报、2 处空 catch 静默吞异常** | ❌ | F10 | §2 |
| **高复用** | 核心三模块零框架依赖（**大资产**）；但页面仓库是单例、链接目标写死 | ⚠️ | F6、F11 | §2 |
| **可扩展** | 加一种语法要改 4 处；链接目标只能是"页面"，堵死了锚点/外链 | ⚠️ | F3、F11 | §2 |

### 0.2 逐条发现

| # | 维度 | 现状 | 评级 | 调整方向 | 详见 |
| --- | --- | --- | --- | --- | --- |
| F1 | 依赖方向 | 领域层 `pages/store.ts` 反向依赖控制器层 `markdown/editor.ts` | ❌ 不合格 | 端口类型下沉，依赖单向 | §2 · F1 |
| F2 | 模块内聚 | `markdown/editor.ts` 845 行、7 类职责、~56 个方法 | ⚠️ 尚可 | 抽出纯函数（4a）即可；全量拆分可推迟 | §2 · F2 |
| F3 | 可扩展性 | 加一种语法要改 3 个文件、4 处代码 | ⚠️ 尚可 | 先修序列化隐患（5）；注册表等第 5 种语法 | §2 · F3 |
| F4 | 体验（草稿） | 未创建页面的草稿**不回显、会被下一次输入覆盖**（同一次会话内，非刷新丢失） | ❌ 不合格 | 让草稿可见，路径最短 | §2 · F4 |
| F5 | 性能 | 词法分析 O(块长 × 标记数)；**无标题**文档 50KB 达 89ms/次 | ❌ 不合格 | 扫描改双指针，整体 O(n) | §2 · F5 |
| F6 | 可替换性 | 页面仓库是模块级单例 | ⚠️ 较差 | 工厂化（理由是**可测试 + 可复用**，不是持久化） | §2 · F6 |
| F7 | 数据流 | `v-model` 上下双向 + 字符串相等守卫 | ⚠️ 尚可 | 明确单向数据流契约 | §2 · F7 |
| F8 | 可测试性 | 纯逻辑与 DOM 强耦合，node 侧只能测解析器 | ⚠️ 较差 | 抽出纯函数层，纳入单元测试 | §2 · F8 |
| F9 | 工程化 | 无 lint、无 CI、测试断言逻辑重复 | ⚠️ 较差 | 补安全网（Phase 0） | §2 · F9 |
| F10 | 可观察性 | **0 条日志、0 处错误上报、2 处空 catch** | ❌ 不合格 | logger 端口 + 性能 HUD + 失败有出口 | §2 · F10 |
| F11 | 复用/扩展 | 链接目标是裸字符串，只能指向"页面" | ⚠️ 尚可 | 类型化为 `LinkTarget` 判别联合（扩展点，非现在做） | §2 · F11 |

**保持良好的方面（本次不建议改动）**：

| 维度 | 现状 |
| --- | --- |
| 一致性 / 规范 | 注释详实、中文注释风格统一、2 空格缩进、`noUnusedLocals` 已开 |
| 文档 | `docs/implementation.md` 质量很高，问题成因与踩坑记录详尽 —— 这是本次评审能快速定位 F5 的基础 |
| 产品边界 | 功能收得很干净，没有工具栏、没有分栏预览、页面只存内存 |
| **编辑器内核** | `markdown/editor.ts` 不依赖任何框架，通过 `LinkProvider` 端口与页面仓库解耦 —— **这个设计要保留并推广**，它是 Markup 最大的复用资产 |
| 测试投入 | 业务 1,850 行 / 测试 1,144 行，覆盖投入健康 |

**优先级建议**（详见 [§5.0](#50-优先级分层先看这张表) 的分层）：

- 🔴 **必须做**：Phase 0（安全网）→ Phase 3（草稿体验）→ Phase 2（性能悬崖）→ Phase 4（可观察性）
- 🟡 **值得做**：Phase 1（依赖方向）→ Phase 5a（抽出纯函数）
- 🟢 **可推迟**：Phase 5b / 6 / 7 / 8 —— 现在做属于过度设计，**不构成阻塞**

依赖顺序：Phase 0 先建安全网 → Phase 3 修掉体验缺陷 → Phase 2 修掉性能悬崖 →
Phase 4 让系统可观察（这样后面每一步的效果都看得见）→ 之后再考虑结构性的 Phase 1 / 5a。
F2（拆分）与 F3（注册表）**不在关键路径上**，可以按需随时做或不做。

---

## 1. 现状快照

### 1.1 技术栈

| 项 | 选型 | 备注 |
| --- | --- | --- |
| 构建 | Vite 8 | `vite.config.ts` 仅一个 vue 插件，配置极简 |
| 框架 | Vue 3.5（`<script setup>`） | 只用于 UI 层，编辑器核心与框架无关 |
| 语言 | TypeScript 6（`strict` 基线） | `noUnusedLocals` / `noUnusedParameters` 已开 |
| 样式 | Sass 1.107 | BEM 式类名，`_tokens` 定义亮/暗两套主题变量 |
| Markdown | **零第三方依赖，自研解析器** | 有意为之，见 `docs/implementation.md` |
| 测试 | 无框架，node 直接跑 `.ts` | 解析器单测 + 真实浏览器 E2E（自建打包） |

### 1.2 模块清单与规模

```text
src/
├── App.vue                      87 行   页面外壳：弹窗栈 + 草稿 Map
├── components/
│   ├── MarkdownEditor.vue       99 行   Vue 适配层：挂载控制器 + 渲染候选窗口
│   ├── LinkSuggest.vue         110 行   候选窗口 UI
│   └── PagePopup.vue            69 行   页面弹窗 UI
├── markdown/
│   ├── parser.ts               294 行   源码 -> Token 树
│   ├── dom.ts                  245 行   Token <-> DOM 互转 + 光标映射
│   └── editor.ts               845 行   编辑器控制器（7 类职责）
├── pages/
│   └── store.ts                110 行   页面仓库（模块级单例）
├── main.ts                       5 行   入口
└── styles/                      6 个 partial   主题变量 / 混入 / 按界面分区

test/
├── parser.test.ts              166 行   解析器单测（node）
├── browser.test.ts             930 行   真实浏览器 E2E（合成事件驱动）
└── build.mjs                    48 行   打包浏览器测试页
```

业务代码合计约 1,850 行，测试约 1,144 行 —— **测试覆盖投入是健康的**，这点应当在
任何重构中保持。

### 1.3 依赖关系（现状，含问题）

```text
   ┌───────────────────────────────────────────────────────────────┐
   │  ui/  components/                                            │
   │    App.vue ──► MarkdownEditor.vue ──► LinkSuggest.vue         │
   │        │              │                    PagePopup.vue      │
   └────────┼──────────────┼─────────────────────────┼─────────────┘
            │              │                         │
            │              ▼                         ▼
            │      ┌───────────────┐         ┌──────────────┐
            │      │ markdown/     │         │  pages/      │
            │      │   parser.ts   │◄────────│   store.ts   │
            │      │   dom.ts      │         │              │
            │      │   editor.ts   │────────►│              │
            │      └───────────────┘  ❌F1   └──────────────┘
            │              ▲
            │              │  LinkCandidate / LinkProvider
            │              │  （页面领域的端口，却定义在编辑器里）
            │              │
            └──────────────┘
```

实际的反向依赖只有一处，但是它决定了整个方向：

```ts
// src/pages/store.ts:10
import type { LinkCandidate } from '../markdown/editor'
```

`LinkCandidate` / `LinkProvider` 描述的是**页面**这个领域概念（页面标题、页面是否存在、
候选列表），却定义在**编辑器控制器**里。后果：

- 领域层（`pages`）依赖了表示层（`editor`），依赖箭头反向；
- `markdown/editor.ts` 一旦需要引用页面数据（当前不需要），立刻形成**循环依赖**；
- 换一个存储实现（比如换成文件系统），必须连带引用编辑器模块。

### 1.4 运行时数据流

```text
  用户按键
     │
     ▼
 beforeinput ──► MarkdownEditor.replaceRange()        ← 唯一事实来源：source: string
     │                    │
     │                    ├─► pushHistory()            ← 存整份 source，无上限
     │                    ├─► render()
     │                    │     ├─ parseMarkdown(source)   全文重新解析
     │                    │     ├─ renderTokens(...)       全文重建 DOM
     │                    │     └─ markMissingLinks()
     │                    ├─► writeSelection()            光标还原
     │                    └─► updateSuggestion()          ← 每次按键都重算
     │                              │
     ▼                              ▼
 onSuggestion ──► LinkSuggest.vue   onOpenPage ──► App.openPage() ──► stack
                                                              │
                                                              ▼
                                                    PagePopup ──► MarkdownEditor
                                                              │        （第二个编辑器实例）
                                                              ▼
                                                    onChange ──► App.saveContent()
                                                              │
                                              ┌───────────────┴───────────────┐
                                              ▼                               ▼
                                     store.updatePage()              drafts.set()  ← F4
                                     （页面已存在）                    （页面不存在）
```

两条路径值得注意：

1. **页面正文有 3 份副本**：`editor.source`（编辑器内存）、`store.pages[].content`（仓库）、
   `App.vue` 的 `drafts` Map。同一份内容在 3 处存在，靠 `App.vue` 手工保持同步。
2. **编辑器核心不知道页面存在**：`editor.ts` 只通过 `LinkProvider` 端口取数据，
   这一点设计得**很好**，应保留并推广到其他边界。

---

## 2. 主要发现

### F1 ❌ 依赖方向倒置 —— 领域层依赖表示层

**位置**：`src/pages/store.ts:10`

如 §1.3 所述，`LinkCandidate` / `LinkProvider` 是页面领域的端口契约，
却寄生在编辑器控制器模块里。

**影响**：

- `pages/` 无法独立于 `markdown/` 存在，未来的持久化实现（localStorage / 文件）
  会被迫引用编辑器模块；
- 潜在的循环依赖（编辑器一旦需要页面反向引用）；
- 端口语义被埋没：`LinkProvider` 的真实含义是「页面仓库对外暴露的查询能力」，
  放在 `editor.ts` 里会让后来者误以为它是编辑器的一个可选特性。

**方向**：端口类型下沉到与「页面」同层（或更底层的契约层），编辑器与页面仓库
都从那里引用，依赖箭头变成单向。

---

### F2 ⚠️ `markdown/editor.ts` 是七职责单体

**位置**：`src/markdown/editor.ts`（845 行，~56 个方法）

文件自带 7 个分区注释，暴露了它的真实职责：

| 分区 | 行范围 | 职责 | 是否需要 DOM |
| --- | --- | --- | --- |
| 渲染 | 132–191 | 全文解析 + 重建 DOM + 标断链 | 是 |
| 光标 | 193–284 | 选区读写、视口滚动 | 是 |
| 历史 | 286–313 | 撤销/重做栈 | 否（纯数据） |
| 源码编辑 | 315–347 | 替换区间、套标记 | 否（除取选区） |
| 删除 | 349–439 | 字素簇、单词边界 | 否（除取选区） |
| 双向链接 | 441–681 | 触发点查找、候选组装、候选键盘 | 部分 |
| 事件 | 683–845 | 按键/输入法/鼠标分发 | 是 |

**影响**：

- **测试面被 DOM 绑架**：`历史`、`字素簇边界`、`单词边界`、`触发点查找` 这些
  纯逻辑本可以在 node 里直接测，却因为和 `this.root` / `window.getSelection()`
  混在同一个类里，只能靠浏览器测试覆盖（`test/browser.test.ts` 930 行里
  大量篇幅在手工模拟事件）。
- **改一处怕三处**：候选窗口状态机（240 行）和键盘分发（160 行）挤在一起，
  调整 `[[` 触发规则时很容易误伤按键处理。
- **类的公共 API 过大**：`MarkdownEditor` 对外暴露 **25 个公开方法 + 2 个 getter**
  （`render` / `setSource` / `focus` / `undo` / `redo` / `insertAtCaret` /
  `wrapSelection` / `deleteBackward` / `deleteForward` / `deleteWordBackward` /
  `deleteWordForward` / `acceptSuggestion` / `selectCandidate` / `refreshLinks` /
  `refreshSuggestion` / `dismissSuggestion` / `handleInput` /
  `handleBeforeInput` / `handlePaste` / `handleCompositionStart` /
  `handleCompositionEnd` / `handleKeyDown` / `handleMouseDown` / `handleClick` /
  `destroy` 等），其中大半只被 `MarkdownEditor.vue` 的适配层调用，
  另有 8 个 `handle*` 方法是**本不该公开的事件处理器**。

**方向**：按 §1.2 的分区切成独立模块，编辑器控制器退化为**编排器**。
切分点天然对应已有的注释分区，属于**低风险重构**。

> **⚠️ 自我校准**：以上问题都是**真实的**，但**没有一条会造成用户可感知的故障**。
> `editor.ts` 有清晰的分区注释，`test/browser.test.ts` 覆盖充分，
> 事实上**没有表现出实际维护困难**。
> 因此本条被降级为 🟡（只做 Phase 5a：抽出 `text` / `history` 这两个纯函数，
> 让它们能进 node 测试）/ 🟢（Phase 5b 的全量拆分可以推迟）。
> **把"文件大"本身当成问题去解决，是最容易产生的过度设计。**

---

### F3 ⚠️ 语法定义分散在三处、四个位置

这是"加一种语法要改几个地方"的量化答案：

| # | 位置 | 需要做什么 | 加斜体 `*x*` 时的具体改动 |
| --- | --- | --- | --- |
| 1 | `parser.ts` `find*Spans()` | 写区间识别规则 | 新增 `findItalicSpans()` |
| 2 | `parser.ts` `buildTokens()` | 登记事件类型与标记长度 | 新增 `italicOpen/italicClose` 事件 + `textEnd`/`resume` 算术 |
| 3 | `dom.ts` `renderTokens()` | token → 元素 + `data-md` | 新增 `em` 分支 |
| 4 | `dom.ts` `serializeNode()` | 元素 → 标记（反向） | 新增 `em` 分支（否则序列化会**丢标记**） |
| 5 | `styles/_editor.scss` | 样式 | 新增 `em` 样式 |

**关键风险在第 4 步**：`serializeNode()` 现有的兜底分支
`if (tag === 'em' || tag === 'i') return serializeChildren(el, false)`（`dom.ts:129`）
**不带标记**。也就是说，DOM 里任何一个 `<em>` 元素被序列化时，
斜体标记会被静默丢弃 —— 这是 F3（语法定义分散）最直接的危害：
新增语法时只要漏掉序列化分支，内容就会在"DOM → 源码"这一步被吃掉（F7 描述的正是这条路径）。
`parser.ts` 的 `buildTokens()` 里那套 `textEnd` / `resume` 算术（`parser.ts:217-290`）
更是把"标记长度"硬编码进了每个事件类型，新增语法必须手推这两个偏移量，
少算一个字符就会让光标映射整体偏移一位。

**方向**：把"一种语法"的全部知识收敛成一条描述（标记、元素、优先级、识别规则），
识别、渲染、序列化三处都从这张表读。

> **⚠️ 自我校准**：注册表本身是**过度设计的前兆** —— 只有 4 种语法时，
> 4 个 if-else 分支比一套通用 DSL 更简单、更易读。
> 因此本条拆成两半：
> - **Phase 6**（🟢，成本一行）：修掉 `dom.ts:129` 那个**静默丢标记**的兜底分支；
> - **Phase 7**（🟢，等第 5 种语法出现时再做）：完整注册表。
> 真正值得记住的不是"要建注册表"，而是
> **「加语法时，渲染和序列化必须成对修改」这个约束目前只靠人记住」。**

---

### F4 ❌ 未创建页面的草稿既不回显、也会被覆盖

> **先澄清一个常见的误解**：本条**不是**「刷新页面后数据丢失」。
> 页面只存在内存里、刷新就没了 —— 这是**有意为之的产品设计**（见 `README.md` 与
> `docs/implementation.md`），本次评审**认可并保留**它，不在调整范围内。
>
> 本条说的是**同一次会话内**：你在一个「还没创建的页面」的弹窗里输入的内容，
> **看不见了、并且会被下一次输入覆盖掉**。这是体验问题，不是持久化问题。

**位置**：`src/App.vue:44-67`（`drafts` Map）、`src/App.vue:77`（`:content` prop）

#### 机制：草稿只写不读

`drafts` 的**全部**读写点只有 4 处（`grep -rn drafts src/`）：

```ts
const drafts = new Map<string, string>()          // App.vue:45  声明
drafts.set(title, content)                        // App.vue:57  写入（每次输入）
createPage(title, drafts.get(title) ?? '')         // App.vue:65  读取 —— 只在点「创建页面」时
drafts.delete(title)                              // App.vue:66  清理
```

**`drafts.get()` 只有「创建页面」按钮这一个读取点。**
草稿从来没有被回显到编辑器里 —— 而弹窗的内容 prop 是：

```vue
<!-- App.vue:77 -->
:content="currentPage?.content ?? ''"
```

页面还不存在 → `currentPage` 是 `undefined` → 弹窗**永远**拿到 `''`。
加上 `v-if="currentTitle"`（App.vue:75），关掉弹窗会**整个卸载**它，
再打开就是全新的编辑器实例、`modelValue` 又是 `''`。

#### 复现（用真实的 store 模块跑的，见附录 B.6）

```text
1. 打开缺失页面 foo（点正文里的 [[foo]]）
   弹窗显示内容 = ""   missing=true

2. 在弹窗里输入「hello」
   弹窗显示内容 = ""   （编辑器里是 "hello"）
   drafts = [["foo","hello"]]

3. 关掉弹窗（Esc / 点遮罩）→ 弹窗卸载，编辑器实例销毁

4. 再点一次链接，重新打开 foo
   弹窗显示内容 = ""        ← 用户之前写的 "hello" 看不见了
   drafts 还在 = [["foo","hello"]]   （但编辑器不会回显它）

5. 用户以为弹窗是空的，于是又输入「world」
   drafts = [["foo","world"]]      ← "hello" 被覆盖，永久丢失

6. 点「创建页面」
   页面 foo 的内容 = "world"      ← "hello" 没有任何路径可以找回
```

第 4 步是问题的核心：**草稿还在内存里，但用户看不到它**，
于是第 5 步用户理所当然地重新输入，把草稿覆盖掉。
「创建页面」按钮最终写入的是**最后一次**的输入。

#### 根因

不是「少了一次持久化」，而是**草稿没有回显路径**：
内容被存进了一个只有「提交按钮」能读到的黑盒，而用户看到的是空白编辑器。
**存了但看不见，比根本没存更糟** —— 用户会以为自己没保存成功，于是重写一遍。

#### 附带问题

1. **两条创建路径**（`LinkProvider.create` 与弹窗「创建页面」按钮）语义不同：
   前者建空页面，后者建带草稿的页面。走前者创建时，`drafts` 里的旧草稿
   不会被清理（`createCurrent` 才会 `delete`），留下孤儿条目。
2. `App.vue` 的 `drafts` 是普通 `Map`，而 `store.ts` 用 Vue 的 `reactive`
   （`store.ts:26`）—— 同一份数据两套响应式风格。

#### 方向（纯体验修复，不涉及持久化）

**让草稿能被看见**，路径最短的一条：

```ts
// App.vue —— 弹窗内容改为「页面内容 ?? 草稿内容」
:content="currentPage?.content ?? drafts.get(currentTitle) ?? ''"
```

再让 `saveContent()` 在草稿被读到时**把它搬进仓库**（而不是继续留在 `drafts` 里），
消除两套状态。修完之后：

- 重新打开弹窗 → 看到自己之前写的内容 ✅
- 继续输入 → 接着写，不再覆盖 ✅
- 点「创建页面」→ 写入完整内容 ✅

**刷新后仍然会丢** —— 这是设计如此，不改。

---

### F5 ❌ 词法分析器是 O(块长 × 标记数)，实测为二次复杂度

**位置**：`src/markdown/parser.ts:152`、`185`、`190`、`162`

三处内层循环都在**每一个字符位置**上，对整个区间数组做线性查找：

```ts
// parser.ts:185 —— findBoldSpans 内层循环
const code = codeSpans.find((span) => index >= span.start && index < span.end)
if (code) { index = code.end; continue }
const link = linkSpans.find((span) => index >= span.start && index < span.end)
```

`find()` 每次都从数组头部开始扫，复杂度是 `O(标记数)`；
外层循环 `O(字符数)`，因此整体是 `O(字符数 × 标记数)`。
`parser.ts:162` 的 `codeSpans.some(...)`（链接与代码区间重叠检查）
同样是 `O(链接数 × 代码数)`。

#### 关键限定：复杂度是「按块」的，不是「按文档」的

`parseMarkdown()` 会把**连续的非标题行合并成同一个段落块**
（`parser.ts:49-79`：非标题行先攒进 `paragraph`，遇标题才 flush）。
标题因此成为块的天然切分点 —— 于是：

> **二次退化的触发条件是「一个连续的、不含标题的长段落块」，
> 而不是「文档很长」。**

实测（同样字符数，只改块结构）：

```text
                              26,399 字符      35.87 ms   ← 无标题，全部并成 1 个块
同样内容，每 5 段插一个标题   27,257 字符       1.04 ms   ← 切成约 480 个块
```

**同一份内容，差 34 倍。** 完整数据见附录 B.4。

#### 「性能悬崖」

编辑器采用**受控编辑 + 全文重渲染**模型
（`editor.ts:135-146` 每次按键 `parseMarkdown` 全文 + `renderTokens` 全文重建 DOM）。
这是 `docs/implementation.md` 记录的**有意为之**的取舍，本评审**不建议推翻**。
但解析耗时会**乘上"每次按键一次"的频率**，于是形成悬崖：

| 无标题文档 | 每次按键的解析耗时 | 体感 |
| ---: | ---: | --- |
| 13 KB | 15.56 ms | 流畅 |
| 26 KB | 21.70 ms | 可察觉 |
| 53 KB | 89.21 ms | 明显卡顿 |
| 106 KB | 412.52 ms | 不可用 |

| 同样内容、每 5 段一个标题 | 每次按键的解析耗时 | 体感 |
| ---: | ---: | --- |
| 14 KB | 0.86 ms | 流畅 |
| 27 KB | 1.24 ms | 流畅 |
| 55 KB | 2.16 ms | 流畅 |
| 109 KB | 4.72 ms | 流畅 |

**结论**：典型的带标题的笔记**不会**触发这个问题；
但**长篇无标题的散文**（文章、会议记录、长章节）会，
而且是在 30KB~50KB 这个对笔记类工具来说完全合理的体量上撞墙。
"页面存在内存里、可以越写越长"的产品设定让这个风险随使用时间增长。

#### 成本极低的修复方向

`codeSpans` / `linkSpans` 在生成时**本身就是按 start 升序**的
（`findCodeSpans` 按 index 递增扫描产出），因此内层循环可以改用**双指针**
（维护一个指向当前区间数组的游标，只向前推进），整体降为 `O(字符数 + 标记数)`。

⚠️ 一处需要额外小心：`parser.ts:162` 的 `codeSpans.some(...)`
（链接与代码区间重叠检查）扫的是**整个数组**，改游标时需要单独处理
"候选链接区间跨越了多个代码区间"的情况 —— 这是本 Phase 唯一非平凡的点。
其余改动是纯局部的，不改变任何输出。

---

### F6 ⚠️ 全局单例页面仓库，限制了可测试与可复用

**位置**：`src/pages/store.ts:26`

```ts
const state = reactive<{ pages: Page[] }>({ pages: [] })
```

模块级单例带来三个限制：

- **不可测试**：无法在测试中创建隔离实例、无法重置状态 ——
  任何涉及页面的测试都会互相污染；
- **单文档假设**：整个应用隐含"只有一个页面集合"。
  将来若要支持"多工作区 / 多文档"，单例就挡住了；
- **不可替换**：存储策略写死在模块里。

> **注意**：本条**与"要不要做持久化"无关**。
> 项目已明确不做持久化，本次评审**不引入任何持久化端口**
> （原方案里的 `PageRepository` 已从计划中移除，见 §6 与 Phase 3）。
> 保留这一条的理由是**可测试**与**可复用**，不是为将来存盘铺路。

**方向**：`createPageStore()` 工厂，返回一个窄接口的实例。
模块级保留一个默认实例，**现有 import 方式继续可用**，调用方无需改动。

```ts
export function createPageStore(): PageStore
```

---

### F7 ⚠️ 双向数据流 + 字符串相等守卫

**位置**：`src/components/MarkdownEditor.vue:71-79`

```ts
watch(() => props.modelValue, (value) => {
  if (!controller) return
  if (value === controller.markdown) return   // ← 守卫
  controller.setSource(value)
})
```

内容从编辑器**向上**流（`onChange` → `update:modelValue` → `App` → `store`），
再从 store **向下**流回编辑器 prop，靠字符串相等判断"这次是不是我自己改的"。
这是 v-model 的标准做法，本身没问题；但它带来两个架构代价：

1. **守卫是脆弱的**：任何对内容做规范化的中间层（trim、换行统一、持久化时的编码）
   都会让 `value !== controller.markdown` 成立，从而触发 `setSource()`，
   **重置撤销历史**（`editor.ts:185-186`）并把光标弹到文末。
   F4 的数据丢失路径第 4 步正是踩中了这个守卫的**反面**——
   内容被清空后 `setSource('')` 触发，编辑历史归零。
2. **两次编辑器实例语义不同**：正文编辑器是"用户输入→立即持久化"，
   弹窗编辑器是"用户输入→上报父组件→父组件决定写哪里"，
   但两者用的是同一个 `MarkdownEditor` 组件、同一套 v-model 契约。

**方向**：把"内容由谁拥有"写成显式契约（编辑器拥有 / 外部拥有），
让同步方向单向化。

---

### F8 ⚠️ 纯逻辑与 DOM 强耦合，单元测试面窄

**位置**：`src/markdown/editor.ts`

以下逻辑**本质上是纯函数**，却因为寄生在控制器类里而无法在 node 中测试：

| 函数 | 行 | 职责 | 能否脱离 DOM |
| --- | --- | --- | --- |
| `previousGraphemeStart` / `nextGraphemeEnd` | 398 / 413 | 字素簇边界（`Intl.Segmenter`） | ✅ 可以 |
| `previousWordStart` / `nextWordEnd` | 427 / 434 | 单词边界 | ✅ 可以 |
| `findTrigger` | 496 | 找 `[[` 触发点 | ✅ 可以（只需 source） |
| `isInsideCode` | 582 | 反引号奇偶计数 | ✅ 可以（只需 source） |
| `buildCandidates` | 510 | 候选列表组装 | ✅ 可以（只需 provider） |
| `pushHistory` / `applyHistory` | 288 / 295 | 历史栈 | ✅ 可以 |

`test/parser.test.ts` 目前只覆盖了解析器（166 行）。
上表 6 组逻辑在 node 中加测的成本极低，却能覆盖输入法相关的大量边界
（字素簇、组合输入位置）—— 而这些恰恰是浏览器测试最难稳定复现的部分。

---

### F9 ⚠️ 工程化基建缺位

| 项 | 现状 | 影响 |
| --- | --- | --- |
| CI | 无 `.github/workflows` | 每次改动靠人工跑测试 |
| Lint / Format | 无 ESLint / Prettier / Biome | 风格靠 AGENTS.md 口头约定（2 空格缩进） |
| 测试框架 | 无 runner，`assertEqual`（parser.test.ts:32）与 `check`（browser.test.ts:13）各写一套 | 断言逻辑重复，输出格式不统一 |
| 测试覆盖 | 解析器 + 浏览器 E2E；**纯逻辑层缺失** | 见 F8 |
| 性能回归 | 无 | F5 这类问题无法被自动发现 |
| HTML lang | `index.html` 是 `lang="en"`，实际内容与测试页均为 `lang="zh-CN"` | 无障碍与翻译标注不一致 |

---

### F10 ❌ 完全不可观察：0 条日志、0 处错误上报

**位置**：整个 `src/`

实测：

```text
src 里的 console/日志调用: 0
src 里的错误上报/告警 UI: 0
src 里的 try/catch: 5 处 —— 全部是空 catch，异常被静默吞掉
```

两处空 `catch` 在最关键的位置 —— **光标定位失败时静默放弃**：

```ts
// editor.ts:212-216 —— 写光标
try {
  range.setStart(position.node, position.offset)
} catch {
  return          // ← 什么都不说，光标就这么不动了
}
```

用户看到的是「光标卡住了 / 打字没反应」，但**没有任何线索**说明发生了什么。

同样地，`LinkProvider` 的失败也是静默的：

```ts
// editor.ts:36-43
export interface LinkProvider {
  suggest(query: string): LinkCandidate[]
  create(title: string): void      // ← 建页失败？调用方无法知道
  exists?(title: string): boolean
}
```

`acceptSuggestion()` 里 `this.options.links?.create(title)` 出错会直接抛出去；
而 `suggest()` 返回空数组时，候选窗口显示的是
**「输入内容并按回车，即可创建页面」**（`LinkSuggest.vue:106`）——
**"没有匹配页面"和"查询挂了"在界面上完全无法区分**。

**影响**：

- 任何异常都变成"玄学 bug"，排查只能靠加日志重跑；
- F5 这类性能问题在用户侧只表现为"卡"，但**卡在哪一步无从得知**；
- 未来的功能（多标签、导出、搜索）出错时，同样没有反馈通道。

**方向**（按性价比排序）：

1. **性能 HUD（dev only）** —— 性价比最高的一条。
   显示当前页面的 `源码长度 / 段落块数 / 解析耗时 / 渲染耗时`。
   它把 F5 从"文档里的一行结论"变成**屏幕上看得见的数字**，
   也能直接用来验证 Phase 2 的修复效果（改完前后对比）。
2. **可注入的 logger 端口**（`core/logger.ts`）——
   默认 no-op，生产环境关闭，dev 打开；编辑器在解析、渲染、光标跳变处记日志。
   注入式设计保证 `core/` 仍然零依赖。
3. **失败要有出口** —— `LinkProvider.create` 返回 `Result` 而不是 `void`；
   `suggest` 区分"空结果"与"查询失败"。至少让候选窗口能显示"查询失败"而不是
   "没有匹配页面"。
4. **空 catch 至少要留痕** —— `catch (e) { logger.warn(...) }`，
   保留"忽略这个异常"的语义，但不丢弃信息。

---

### F11 ⚠️ 复用与扩展：核心模块是资产，但链接目标写死成了「页面」

**位置**：`src/markdown/parser.ts:23`、`src/markdown/dom.ts:15`、`src/markdown/editor.ts:36-43`

**先说资产 —— 这是 Markup 最值钱的地方**：

`markdown/parser.ts`、`markdown/dom.ts`、`markdown/editor.ts` **三个模块零框架依赖**
（`editor.ts` 只 import 自己的 parser/dom，不 import `vue`）。
它们可以被任何宿主复用：

| 模块 | 可以被复用于 |
| --- | --- |
| `parser.ts` | 导出 Markdown、CLI 工具、服务端渲染、静态站点生成 |
| `dom.ts` | 任何 "Markdown → HTML" 的渲染器（不限于本编辑器） |
| `editor.ts` | 任何 contenteditable 编辑器宿主（VS Code 插件、Obsidian 插件、独立的编辑器组件） |

**这个设计要保护好**：后续任何"统一风格"式的重构，
都**不要**把 Vue 的 `ref`/`computed` 引进 `editor.ts` —— 一旦引入，
最大的复用资产就报废了。

**再说限制**：链接目标目前是一个**裸字符串**，只能指向"页面"。

```ts
// parser.ts:23
| { kind: 'link'; name: string }

// dom.ts:15
const PAGE_ATTR = 'data-page'
```

于是 `[[foo]]` 只能打开一个页面。**页内锚点**（`[[foo#某个标题]]`）、
**外部链接**、**块引用**都无处安放 —— 每加一种都得改
`parser.ts` 的页面名校验、`dom.ts` 的属性、候选窗口的语义。

**方向**：把链接目标类型化，**这是"可扩展 + 高复用"最有价值的一处改动**：

```ts
// core/types.ts
export type LinkTarget =
  | { kind: 'page'; title: string }
  | { kind: 'anchor'; title: string; anchor: string }
  | { kind: 'external'; url: string }
```

带来的收益是连锁的：

- `LinkProvider` 的语义从"页面仓库"泛化成"链接解析器"，
  但**接口保持窄**（3 个方法）—— 窄接口才是复用点：
  任何实现了它的东西都能接进编辑器；
- 候选窗口可以按目标类型给出不同候选（锚点来自当前页的标题、外部链接来自历史）；
- 断链判定（`exists`）从"页面存不存在"泛化为"目标能否解析"。

**注意**：这是**扩展点**，不是现在必须做的功能。
`[[foo]]` 指向页面这一种形态，够用很久。
本条的价值在于**别把路堵死** —— 等真要加第二种链接形态时，
改一处（判别联合）而不是改三处。

---

## 3. 次要发现

| # | 位置 | 问题 | 建议 |
| --- | --- | --- | --- |
| m1 | `markdown/editor.ts:804-806` | `else if (key === 'i') { event.preventDefault() }` —— 空实现，静默吞掉 `Cmd/Ctrl+I` | 保留行为（防浏览器插入 `<i>`），但补一行注释说明意图 |
| m2 | `components/MarkdownEditor.vue:82-85` | 用 `pages.value.length` 作为"页面数据变了"的信号 | 改为显式的变更计数或事件，避免依赖"增删会改长度"这一隐含前提 |
| m3 | `markdown/editor.ts:288-293` | 历史栈无长度上限，且每条存**完整 source** → 内存 `O(历史条数 × 文档长度)` | 加条数上限（如 200）或改存差分 |
| m4 | `markdown/editor.ts:449`、`:582`、`:496` | 每次按键都做全量前缀扫描（数反引号 / 回溯找 `[[`） | 与 F5 一并处理：扫描改为增量或复用解析结果 |
| m5 | `src/markdown/` | 目录名是 `markdown`，但 `editor.ts` 是**编辑器控制器**（DOM 事件、光标、历史），与 Markdown 语法无关 | 最小改法：把 `markdown/editor.ts` 移到 `editor/editor.ts`；全面拆分见 §4.2（可推迟） |
| m6 | `styles/_editor.scss` | 同时包含"编辑器容器布局"和"Markdown 排版" | 拆成 `_editor.scss` + `_markdown.scss`（可选） |
| m7 | `App.vue:45` | `drafts` 用普通 `Map`，与全项目 `reactive` 风格不一致 | 随 F4 一并收敛（Phase 3：草稿移入 store） |
| m8 | `pages/store.ts:29` | `pages` 这个 `computed` 是给外部"看长度"用的导出的响应式量 | 随 F6 一并收敛（Phase 3：工厂化后由 store 自身持有） |

---

## 4. 目标架构

### 4.1 分层与依赖规则

**唯一的硬规则：依赖只能自上而下，不得反向、不得跨层。**

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  ui/            Vue 组件（App / PagePopup / LinkSuggest）      │  ← 唯一允许 import vue
   │                 可依赖 editor / pages / core                   │
   ├──────────────────────────────────────────────────────────────┤
   │  editor/        编辑器控制器（编排 core + render）             │  ← 不 import vue
   │                 依赖 core / render，**不 import pages**        │
   ├──────────────────────────────────────────────────────────────┤
   │  render/        DOM 渲染 / 序列化 / 光标映射                    │  ← 不 import vue / ui
   │                 依赖 core                                        │
   ├──────────────────────────────────────────────────────────────┤
   │  core/          纯逻辑：语法表、词法分析、文本边界、端口类型    │  ← 零依赖
   └──────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────┐
   │  pages/          页面领域：仓库 + 草稿                          │  ← 依赖 core
   │                  不 import editor（修 F1）                      │
   └──────────────────────────────────────────────────────────────┘

   组合根：`main.ts` / `App.vue` —— 唯一允许把 `pages/` 的具体实现
   注入 `editor/`（作为 `LinkProvider` 端口）的地方。
```

**规则细则**：

1. `core/` 是**零依赖**层：不 import `vue`、不碰 `document`/`window`。
   所有类型（`Token`、`LinkCandidate`、`LinkProvider`、`SuggestionState`）都在此或紧邻的契约层定义。
2. `editor/` 只依赖 `core/` 与 `render/`；**不知道页面存在**，
   继续通过 `LinkProvider` 端口取数据（现有设计，保留）。
3. `pages/` 只依赖 `core/` 的类型，**不 import `editor/`**（修 F1）。
4. `ui/` 可以依赖一切，但**不持有业务状态**；页面栈与草稿这类状态归 `pages/` 或组合根。
5. 组合根（`main.ts` / `App.vue`）是唯一允许把 `pages/` 的具体实现注入 `editor/` 的地方。
6. `pages/` 与 `editor/` 之间**只通过 `core/` 里的端口类型通信**，不互相引用。

### 4.2 目录结构（目标）

```text
src/
├── core/                     # 纯逻辑层：零依赖，node 可直接测
│   ├── types.ts              # Token / LinkCandidate / LinkProvider / LinkTarget / SuggestionState
│   ├── syntax.ts             # ★ 语法注册表：一种语法一条描述（Phase 7，可推迟）
│   ├── parser.ts             # 源码 -> Token（由 syntax.ts 驱动）
│   ├── text.ts               # 字素簇 / 单词边界（纯函数）
│   └── logger.ts             # 可注入 logger，默认 no-op（Phase 4）
│
├── render/                   # DOM 层：渲染、序列化、光标映射
│   ├── render.ts             # Token -> DOM（由 syntax.ts 驱动）
│   ├── serialize.ts          # DOM -> 源码（由 syntax.ts 驱动）
│   └── caret.ts              # 源码偏移 <-> DOM 位置
│
├── editor/                   # 编辑器层：编排 core + render
│   ├── editor.ts             # 编排器 + 事件绑定
│   ├── history.ts            # 撤销/重做栈（纯数据，Phase 5a）
│   ├── text.ts               # 字素簇 / 单词边界（纯函数，Phase 5a）
│   ├── links.ts              # 双向链接：触发点查找、候选状态机（Phase 5b）
│   └── input.ts              # 事件 -> 编辑意图（Phase 5b）
│
├── pages/                    # 页面领域层
│   ├── types.ts              # Page
│   └── store.ts              # createPageStore() 工厂 + 默认实例（Phase 3）
│
├── ui/                       # Vue 组件层
│   ├── App.vue
│   ├── MarkdownEditor.vue
│   ├── LinkSuggest.vue
│   ├── PagePopup.vue
│   └── DevStats.vue          # dev-only 性能 HUD（Phase 4）
│
└── styles/
```

> **这张图是「理想终局」，不是必达路径。** 标注了 Phase 的条目才是真正要建的；
> 未标注的目录（`render/`、`core/syntax.ts`）分别对应可推迟的 Phase 5b / Phase 7。
>
> **关于目录改名**：`markdown/` → `core/` + `render/`、`components/` → `ui/` 属于**纯改名**，
> 单独可做，也可延后。**语义修正（F1/F4）不需要等改名完成**，建议先改依赖再改目录，
> 这样每一步的 diff 都更容易 review。
>
> ⚠️ **但按 §5.0 的结论，全面改名属于「可推迟」**：它不解决任何具体问题，
> 只会让后续每个 diff 混入改名噪声。
> **最小改法**：只把 `markdown/editor.ts` 移到 `editor/editor.ts`（解掉 m5 的语义问题），
> `parser.ts` / `dom.ts` 保持在 `markdown/` 下不动。

### 4.3 关键契约

**① 语法注册表（修 F3）** —— 一种语法的全部知识写在一处：

```ts
// src/core/syntax.ts
export interface SyntaxDescriptor {
  /** token 类型标识 */
  kind: string
  /** 起始标记，例如 '**' */
  open: string
  /** 结束标记；为空表示该标记不闭合（如标题） */
  close: string
  /** 渲染用的元素标签，例如 'strong' */
  tag: string
  /** 优先级：数字大的先匹配（行内代码 > 链接 > 加粗） */
  priority: number
  /** 区间识别：在文本里找出该语法的成对区间 */
  find(text: string, skip: Span[]): Span[]
}
```

`parser.ts` 的区间扫描、`render.ts` 的渲染、`serialize.ts` 的反序列化，
三处全部改为遍历这张表。这样"加一种语法"从 **4 处代码 + 1 处样式** 降为 **1 处代码 + 1 处样式**。

**② 页面仓库端口（修 F1 / F6）**：

```ts
// src/core/types.ts —— 领域端口，编辑器与页面仓库都从这里取
export interface LinkCandidate {
  title: string
  preview?: string
  exists: boolean
}

export interface LinkProvider {
  suggest(query: string): LinkCandidate[]
  create(title: string): void
  exists?(title: string): boolean
}
```

`pages/store.ts` 改为 `import type { LinkCandidate } from '../core/types'`，
依赖箭头回正。

**③ 页面仓库工厂（修 F6）**：

```ts
// src/pages/store.ts
export interface PageStore {
  pages: Readonly<Page[]>
  get(title: string): Page | undefined
  has(title: string): boolean
  create(title: string, content?: string): Page | null
  update(title: string, content: string): void
  remove(title: string): void
  search(query: string): Page[]
  /** 未创建页面的草稿：仓库内部裁决，UI 不再自己存 */
  saveDraft(title: string, content: string): void
  takeDraft(title: string): string | undefined
}

export function createPageStore(): PageStore   // 注意：没有 repository 参数
```

> **不做持久化，所以没有 `PageRepository` 端口。**
> 工厂的理由是**可测试**（隔离实例）与**可复用**（多工作区），
> 不是为将来存盘铺路。

**④ 草稿的单一归属（修 F4）**：把 `App.vue` 的 `drafts` Map 移进 store，
并让弹窗**能取到草稿**：

```ts
// 弹窗内容：页面内容 ?? 草稿内容  ← 关键：草稿要能回显
:content="currentPage?.content ?? store.takeDraft(currentTitle) ?? ''"
```

`takeDraft()` 取出后即从仓库移除（读即消费），
后续输入通过 `saveDraft()` 写回 —— 这样"草稿"只有一个持有者，
既不会看不见，也不会被意外覆盖。

同时 `LinkProvider.create` 与弹窗「创建页面」按钮**走同一条路径**，
消除"两条创建路径"的结构性差异。

**⑤ 编辑器内容所有权契约（修 F7）**：

当前的 `modelValue` 双向同步靠**字符串相等**判断"这次变更是不是我自己发起的"（`MarkdownEditor.vue:76`）。
字符串比较是**内容**比较，而真正需要判断的是**变更来源**。更稳的做法是显式传一个版本号：

```ts
export interface EditorOptions {
  /**
   * 'owned'：编辑器拥有内容，外部不反写（默认）
   * 'controlled'：外部拥有内容，编辑器只上报变更
   */
  ownership?: 'owned' | 'controlled'
  /**
   * 外部内容的版本号：只有当父组件**主动替换**内容时递增。
   * 编辑器据此判断"这次外部变更不是我发起的"，从而决定要不要 setSource。
   */
  externalVersion?: number
}
```

`controlled` 模式下，回写同步**仍然保留**（功能不变），
只是把"内容相等"换成"版本号相等"来判断变更来源。
父组件在"真正替换内容"时（例如页面切换、首次加载）才递增版本号，
普通的 `update:content` 上报不递增 —— 这样 F4 的"内容被清空 + 撤销历史归零"
从根上消失，且**不改变任何现有交互行为**。

**⑥ 可注入的 logger 端口（修 F10）**：

```ts
// src/core/logger.ts —— 零依赖，默认 no-op
export interface Logger {
  debug(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
}

export const noopLogger: Logger = { debug() {}, warn() {}, error() {} }
```

`core/` 与 `editor/` 通过 `EditorOptions.logger` 接收它，
**不直接依赖任何日志库**，生产环境传入 `noopLogger` 即可。

**⑦ 链接目标类型化（修 F11）**：

```ts
// src/core/types.ts
export type LinkTarget =
  | { kind: 'page'; title: string }
  | { kind: 'anchor'; title: string; anchor: string }
  | { kind: 'external'; url: string }
```

当前只用 `page` 一种；类型化是为了**别把扩展路堵死**，
等真要加锚点/外链时，改判别联合而不是改三处。**现在不实现后两种。**

---

## 5. 实施路线

**总原则**：每个 Phase 独立可合入；每个 Phase 结束后 `pnpm test` 与 `pnpm build` 必须全绿，
**运行时可观察行为除「明确说明的改进」外完全不变**。禁止跨 Phase 混提。

> **唯一有意改变可见行为的是 Phase 3**（草稿开始能被看见）——
> 这正是它要修的体验缺陷。其余 Phase 都是**纯内部重构**：
> 用户看到的东西应该一模一样。
> Phase 4 的性能 HUD 是 **dev-only**，生产构建不出现。

### 5.0 优先级分层（先看这张表）

架构问题不是都要马上修。本项目**业务代码仅 1,850 行、单人维护、9 次提交**，
按"投入产出比"排序后，结论与"把所有发现都修一遍"很不一样：

| 分层 | 范围 | 理由 |
| --- | --- | --- |
| 🔴 **必须做** | **Phase 0**（安全网）、**Phase 3**（草稿体验）、**Phase 2**（性能悬崖）、**Phase 4**（可观察性） | 分别是"让其余改动可被验证的前提"、"用户写的内容看不见且会被覆盖"、"用户可感知的卡顿"、"出问题无从查起" |
| 🟡 **值得做** | **Phase 1**（依赖方向）、**Phase 5a**（抽出纯函数） | 成本低、收益明确；依赖方向是后续所有演化的前提 |
| 🟢 **可推迟** | **Phase 5b**（拆 DOM 耦合部分）、**Phase 6**（修序列化隐患）、**Phase 7**（语法注册表）、**Phase 8**（改名等收尾） | 见下方说明 —— 现在做属于**过度设计** |

**关于可推迟项的说明**（这是本次评审的自我校准）：

- **Phase 5b（把 `caret` / `input` / `links` 拆成独立文件）**：
  这三块**都依赖 DOM**，拆出去并不会让它们变得可单元测试 ——
  真正能进 node 测试的只有 `text`（字素簇）和 `history`（即 Phase 5a）。
  845 行 + 清晰的分区注释并不等于"难以维护"，
  把耦合的代码搬进更多文件只会增加 import 噪声和 diff 体积。**建议只做 4a。**
- **Phase 7（语法注册表）**：
  当前只有 4 种语法，注册表要引入一套通用的区间查找 DSL，
  用它的收益（"加语法从改 4 处变 1 处"）要在第 5 种语法出现时才兑现。
  **触发条件**：真的要加第 5 种语法时，先做这个 Phase。
- **Phase 6（修序列化丢标记）**：
  相比注册表，这一项**成本极低**（改一行兜底分支）且修掉的是一个**静默丢数据**的隐患，
  所以单独拆出来。虽然同属"可推迟"，但它的性价比明显高于 5b —— 建议顺手做掉。
- **Phase 8（目录改名）**：
  `markdown/` → `core/` + `render/` + `editor/` 是纯 churn：功能零变化，
  却让后续每个 diff 都被改名噪声淹没。当前只有一个语义问题
  （`markdown/editor.ts` 其实不是 Markdown 相关），**最小改法**是把它移到 `editor/` 即可。

### Phase 0 — 安全网（不改任何运行时行为）🔴 必须做

**目的**：在动结构之前，先让"行为没变"这件事**可自动判定**。

| 改动 | 文件 |
| --- | --- |
| 抽取共享断言/输出模块，消除两套重复的断言实现 | 新增 `test/harness.ts`；改 `test/parser.test.ts`、`test/browser.test.ts` |
| 补"语法往返"属性测试：随机生成 source，断言 `serialize(render(parse(s))) === s`（**需要 DOM，必须放在浏览器测试里**） | 改 `test/browser.test.ts` |
| 补 CI：`pnpm install` → `pnpm test` → `pnpm build` → `pnpm test:browser` | 新增 `.github/workflows/ci.yml` |
| 补 ESLint（flat config）+ Prettier，接入 `pnpm lint` | 新增 `eslint.config.js`、`.prettierrc` |
| 修正 `index.html` 的 `lang="zh-CN"` | `index.html` |

**验收标准**
- `pnpm test`、`pnpm build`、`pnpm test:browser` 全绿，输出与现状一致
- 往返属性测试覆盖 **≥ 200 个随机样本**（含边界：空串、纯标记、跨行、嵌套）全部通过
  （注：`renderTokens` / `serializeNodes` 依赖 DOM，因此该测试只能跑在浏览器测试里；
  `test/parser.test.ts` 仍只做纯解析断言）
- CI 在 PR 上运行

**风险**：低。断言模块抽取可能改变测试输出格式 —— 属预期。

---

### Phase 1 — 依赖方向修正（纯移动，零逻辑改动）🟡 值得做

**目标**：修 F1，让 `pages/` 不再依赖 `editor/`。

| 改动 | 文件 |
| --- | --- |
| 新建 `src/core/types.ts`，从 `markdown/editor.ts` 移出 `LinkCandidate` / `LinkProvider` | 新增 `src/core/types.ts`；改 `src/markdown/editor.ts` |
| `pages/store.ts` 改为从 `core/types.ts` 取类型 | 改 `src/pages/store.ts:10` |
| `SuggestionState` / `EditorOptions` 属于**控制器对外契约**，留在 editor 侧（可放 `src/markdown/types.ts`） | 改 `src/markdown/editor.ts` |
| 加一条 grep 断言守住方向：`src/pages/**` 不得 import `src/markdown/**` | `test/parser.test.ts` 或 CI 脚本 |

**验收标准**
- `grep -r "markdown/editor" src/pages/` 无结果
- 全部测试通过；`dist` 产物体积与改动前一致（±1%）

**风险**：极低。仅类型移动 + import 路径改写。

---

### Phase 2 — 性能修复：词法分析降到线性（修 F5）🔴 必须做

**目标**：把 `O(字符数 × 标记数)` 降为 `O(字符数 + 标记数)`，**不改变任何解析输出**。

| 改动 | 文件 |
| --- | --- |
| `findLinkSpans` 内层：`codeSpans.find(...)` → 双指针游标 | 改 `src/markdown/parser.ts:152` |
| `findBoldSpans` 内层：`codeSpans.find(...)` / `linkSpans.find(...)` → 双指针游标 | 改 `src/markdown/parser.ts:185`、`:190` |
| `findLinkSpans` 的 `codeSpans.some(...)` 重叠检查 → 随游标位置判断 | 改 `src/markdown/parser.ts:162` |
| 加性能回归脚本（**独立脚本，不放进单元测试**，避免 CI 机器抖动导致误报） | 新增 `test/perf.ts`，`pnpm test:perf` |

**验收标准**
- 现有解析器测试 **逐条通过，token 结构逐字节不变**（Phase 0 的往返属性测试同时保证）
- **无标题**样本（附录 B.1 的最坏情况）：52,799 字符解析耗时 **< 10ms**（当前 98.57ms）
- 缩放曲线近似线性：字符数 ×4，耗时 ×4 以内（当前 ×16）
- **带标题**样本不应变慢（当前已很快，改动不能引入回归）
- 性能断言用**宽松阈值**（例如 50ms），只用于拦截"数量级退化"，不用于卡毫秒级指标

**风险**：低—中。游标推进逻辑需仔细处理"区间可能重叠/嵌套"的边界，
尤其 `parser.ts:162` 的重叠检查必须保证与原来**逐位等价**；
必须由 Phase 0 的往返属性测试兜底。**建议先写测试再改实现。**

---

### Phase 3 — 草稿回显与页面生命周期收敛（修 F4 / F6）🔴 必须做

**目标**：让**未创建页面的草稿能被看见、不会被意外覆盖**。
这是纯体验修复，**与持久化无关** —— 刷新后仍然会丢，那是设计如此。

| 改动 | 文件 |
| --- | --- |
| 弹窗内容改为「页面内容 ?? 草稿内容」，草稿要能回显 | 改 `src/App.vue:77` |
| 草稿 `drafts` 移入 store（`saveDraft` / `takeDraft`，读即消费） | 改 `src/pages/store.ts`；删 `src/App.vue:45` |
| `createPageStore()` 工厂 + `PageStore` 接口；保留模块级默认实例，**现有 import 方式继续可用** | 改 `src/pages/store.ts` |
| `LinkProvider.create` 与弹窗「创建页面」按钮走同一条路径 | 改 `src/components/MarkdownEditor.vue:50-56`、`src/App.vue:61-67` |
| ~~`PageRepository` 端口~~ | **不做** —— 不做持久化，不需要持久化端口 |

**验收标准**
- 补一条回归测试，覆盖 F4 的完整路径：
  「在未创建页面的弹窗里输入 → 关掉弹窗 → 重新打开 → **内容还在** → 继续输入 → 点创建页面 → 写入完整内容」
- `pages/store.ts` 具备 node 侧单元测试（可创建隔离实例、可重置）
- 全部现有测试通过

**风险**：中。触及"未创建页面"这一 UX 分支，需逐条比对现有行为。
**建议先补回归测试锁死现状行为，再重构。**

> **注意**：本 Phase **不引入任何持久化**。`PageStore` 工厂化的理由是
> **可测试**（隔离实例）与**可复用**（多工作区），不是为存盘铺路。

---

### Phase 4 — 让系统可观察（修 F10）🔴 必须做

**目标**：从"出问题完全无从查起"变成"看得见、查得到"。
这一 Phase 的价值不只是调试体验 —— 它也是**验证 Phase 2 修复效果的手段**。

| 改动 | 文件 |
| --- | --- |
| 新增可注入的 `logger` 端口（零依赖，默认 no-op） | 新增 `src/core/logger.ts` |
| `EditorOptions` 增加 `logger`，解析/渲染/光标跳变处记日志 | 改 `src/markdown/editor.ts` |
| **dev-only 性能 HUD**：显示源码长度 / 段落块数 / 解析耗时 / 渲染耗时 | 新增 `src/components/DevStats.vue`（仅 dev 挂载） |
| 两处空 `catch` 改为「记录 + 保持原有忽略语义」 | 改 `src/markdown/editor.ts:212-216`、`:233-237` |
| `LinkProvider.create` 返回结果，失败不再静默 | 改 `src/markdown/editor.ts:36-43`、`src/components/MarkdownEditor.vue:50-56` |
| 候选窗口区分「没有匹配页面」与「查询失败」 | 改 `src/components/LinkSuggest.vue` |

**验收标准**
- dev 模式下能看到当前页面的解析/渲染耗时；**改动前后可直接对比**
  （Phase 2 修完，HUD 上的数字应显著下降）
- 人为制造一次光标定位异常，**能在 console 看到日志**，而不是静默无反应
- 生产构建里 HUD 不出现（`import.meta.env.DEV` 守卫），logger 为 no-op

**风险**：低。纯增量，不改现有交互。
**注意**：性能 HUD 是 dev-only，不能进入生产包。

---

### Phase 5a — 抽出纯函数（修 F8）🟡 值得做

**目标**：把**真正纯**的逻辑抽出来，让它们能在 node 里被单元测试。

> 本 Phase 只做「能进 node 测试」的部分。DOM 耦合的部分（`caret` / `input` / `links`）
> 拆出去并不带来可测试性收益，**推迟到 Phase 5b**（见 §5.0 的说明）。

| 新模块 | 迁入内容（源位置） | 依赖 DOM？ |
| --- | --- | --- |
| `editor/text.ts` | 字素簇与单词边界 4 个方法（`editor.ts:391-439`） | 否 |
| `editor/history.ts` | 撤销/重做栈（`editor.ts:286-313`） | 否 |

**关键纪律**：**纯搬家，不改逻辑**。迁出后立即跑全量测试。

**验收标准**
- `text.ts` 具备 node 侧单元测试：中文、emoji、组合字符（如 `é` 的分解形式）的边界
- `history.ts` 具备 node 侧单元测试：撤销/重做/分支截断
- `editor.ts` 行数下降（845 → 约 750），全部测试通过

**风险**：低。纯搬移。

---

### Phase 5b — 拆分 DOM 耦合部分（修 F2）🟢 可推迟

**目标**：把 `caret` / `input` / `links` 拆成独立模块，`editor.ts` 退化为编排器。

| 新模块 | 迁入内容（源位置） | 依赖 DOM？ |
| --- | --- | --- |
| `editor/caret.ts` | 选区读写、视口滚动（`editor.ts:193-284`） | 是 |
| `editor/links.ts` | 触发点查找、候选组装、候选状态机（`editor.ts:441-681`） | 部分（`caretRect` 除外） |
| `editor/input.ts` | 事件 → 编辑意图（`editor.ts:683-845`） | 是 |
| `editor/editor.ts` | 编排：持有各模块、协调调用顺序 | 是 |

**关键纪律**：**纯搬家，不改逻辑**。每个模块迁出后立即跑全量测试。

**验收标准**
- `markdown/editor.ts` ≤ 250 行
- 浏览器 E2E 全部通过（这批测试就是拆分的安全网）
- 行为逐条等价：拆分前后 `pnpm test:browser` 的断言列表**逐条相同**

**风险**：中。文件移动量大，但每步可独立验证。

**为什么可以推迟**：`editor.ts` 虽有 845 行，但分区注释清晰、
浏览器 E2E 覆盖充分，**没有表现出实际维护困难**。
拆分的主要收益是"结构更漂亮"，而不是"修掉某个具体问题"。

---

### Phase 6 — 修掉序列化丢标记的隐患（修 F3 的一部分）🟢 可推迟

**目标**：修掉一个**现在就存在**的隐患 —— `serializeNode()` 的兜底分支
`if (tag === 'em' || tag === 'i') return serializeChildren(el, false)`（`dom.ts:129`）
**不带标记**，任何 `<em>` / `<i>` 元素被序列化时标记会被静默丢弃。

**改动很小**：让兜底分支带上正确的标记（`*`），或者干脆对未知内联元素
一律保留内容并标注"无法还原"，让问题**可见**而不是静默。

**验收标准**
- 构造一个 `<em>hello</em>` 放进编辑区，序列化结果包含 `*` 或有明确告警，**不静默丢失**

**风险**：低。

---

### Phase 7 — 语法注册表 🟢 可推迟（等第 5 种语法出现时再做）

**目标**：加一种语法从"改 4 处"降为"改 1 处"。

| 改动 | 文件 |
| --- | --- |
| 新建 `src/core/syntax.ts`，把现有 4 种语法（标题/加粗/行内代码/双向链接）写成描述符 | 新增 |
| `parser.ts` 的区间扫描改为遍历语法表 | 改 `src/markdown/parser.ts` |
| `render.ts` / `serialize.ts` 的 if-else 链改为遍历语法表 | 改 `src/markdown/dom.ts` |

**验收标准**
- 现有 4 种语法的 token 结构与 DOM 结构**逐字节不变**（由 Phase 0 的往返测试 + 现有测试保证）
- **用一种临时语法（如斜体）验证注册表机制可行**：只改 `syntax.ts` + 样式，
  `parser.ts` / `dom.ts` 零改动即可生效；验证后**移除该临时语法**（本 Phase 不新增产品功能）

**风险**：中。`buildTokens()` 里 `textEnd`/`resume` 的标记长度算术
（`parser.ts:217-290`）需要改写成由语法表推导，是本 Phase 最需小心的部分。

**为什么可以推迟**：注册表要引入一套通用的区间查找 DSL，
用它的收益（"加语法从改 4 处变 1 处"）要在**第 5 种语法出现时**才兑现。
在此之前，4 个 if-else 分支是**更简单**的实现。
**触发条件**：真的要加第 5 种语法时，先做这个 Phase。

---

### Phase 8 — 收尾 🟢 可推迟

| 项 | 说明 | 建议 |
| --- | --- | --- |
| 目录改名 | `markdown/` → `core/` + `render/` + `editor/`；`components/` → `ui/` | **降级**：只把 `markdown/editor.ts` 移到 `editor/` 即可解决 m5 的语义问题，其余改名不做 |
| 内容所有权契约 | 落实 §4.3 ⑤ 的 `ownership` 选项，消除 `modelValue` 回写守卫（修 F7） | 做（修 F7） |
| 历史栈限额 | 加条数上限或改存差分（修 m3） | 做（成本极低） |
| `pages` 变更信号 | 用显式版本号替代 `pages.value.length`（修 m2） | 做（成本极低） |
| 样式拆分 | `_editor.scss` 拆出 `_markdown.scss`（修 m6） | 不做（收益近零） |
| 文档同步 | 更新 `README.md` 的目录结构、`docs/implementation.md` 的模块划分 | 做（Phase 0 起就要同步本文档） |


---

## 6. 明确不做的事

以下事项在本次评审中**被评估并否决**，记录下来避免反复讨论：

| 事项 | 结论 | 理由 |
| --- | --- | --- |
| 引入第三方 Markdown 库 | ❌ 不做 | 自研解析器是明确的、有意识的选择；四种语法不足以支撑引入依赖的复杂度 |
| 改用 ProseMirror / Lexical / Slate 等编辑器框架 | ❌ 不做 | 与"极简、零依赖、可控编辑"的定位冲突；当前自研方案的复杂度是**可控**的 |
| 放弃「受控编辑」改为浏览器直接改 DOM | ❌ 不做 | `docs/implementation.md` 已记录实测踩坑（空白折叠、标记丢失） |
| 改为增量渲染 / 虚拟滚动 | ❌ 现在不做 | F5 修复后，50KB 以内文档的解析耗时已可接受。增量渲染会显著抬高输入法（IME）场景的风险，收益不足 |
| 引入 Pinia 等状态管理库 | ❌ 不做 | 状态量极小（页面列表 + 一个栈），`reactive` 足够；引入依赖不划算 |
| 拆成 monorepo / 多包 | ❌ 不做 | 全量 1,850 行业务代码，无跨包复用需求 |
| 做数据持久化（localStorage / 文件 / 同步） | ❌ **不做** | **项目已明确决定不做**，本次评审认可并保留。刷新即失是设计如此；所有"丢失"类发现都指**同一次会话内**的体验问题（见 F4） |
| 为持久化预留 `PageRepository` 端口 | ❌ 不做 | 没有持久化就不需要这个抽象。`PageStore` 工厂化的理由是**可测试 + 可复用**，不是为存盘铺路 |
| 改用 CSS-in-JS | ❌ 不做 | Sass 方案清晰、主题变量用 CSS 自定义属性输出、运行时可切主题，无需改动 |
| 为拆分而拆分 `editor.ts`（Phase 5b） | ❌ 现在不做 | 见 §5.0：845 行 + 清晰分区注释 + 充分的 E2E 覆盖，**尚未表现出实际维护困难**；拆分收益是"结构更漂亮"而非"修掉问题" |
| 现在就建语法注册表（Phase 7） | ❌ 现在不做 | 4 种语法下，4 个 if-else 分支比一套通用 DSL 更简单；等第 5 种语法出现时再做 |
| 全面重命名目录（`core/` `render/` `ui/`） | ❌ 不做 | 纯 churn，功能零变化却让后续每个 diff 被改名噪声淹没；只把 `markdown/editor.ts` 移到 `editor/` |

---

## 7. 风险登记与回滚

| 风险 | 等级 | 缓解措施 | 回滚 |
| --- | --- | --- | --- |
| Phase 2 游标改造引入解析偏差 | 中 | 先补往返属性测试；解析结果逐字节比对；`:162` 的重叠检查单独验证 | 单 Phase revert，不影响其他 Phase |
| Phase 3 改变"未创建页面"的 UX 细节 | 中 | 先写回归测试锁死现状；逐条比对 | 同上 |
| Phase 5b 拆分时误改行为 | 中 | 拆分过程只做搬家；浏览器 E2E 断言列表逐条比对 | 同上 |
| Phase 7 标记长度算术改写错误 | 中 | 由语法表统一推导 + 往返属性测试 | 同上 |
| Phase 4 的 logger 拖慢热路径 | 低 | logger 默认 no-op；只在解析/渲染等低频点埋点，不在每次按键的路径上 | 同上 |
| Phase 4 的性能 HUD 进了生产包 | 低 | `import.meta.env.DEV` 守卫 + 构建产物大小检查 | 同上 |
| Phase 1 类型移动引起循环依赖 | 低 | 类型检查 + grep 断言守住方向 | 同上 |
| 长期无 CI 导致回归 | 低 | Phase 0 建立 CI | — |

**回滚策略**：每个 Phase 一个独立 commit / PR，任何 Phase 出现问题可单独 revert，
不阻塞其它 Phase。**Phase 0 必须最先合入**——它是后续所有 Phase 的安全网。

**因为 Phase 5b / 6 / 7 / 8 已降级为"可推迟"，即使它们全部不做，
Markup 也已经解决了本次评审发现的三个**用户可感知的问题**
（草稿看不见且会被覆盖、性能悬崖、出问题无从查起）
和一个**结构性问题**（依赖方向）。**这是本次评审的完成线。**

---

## 附录 A：评审度量

分两栏：**必须达成**（对应 🔴 / 🟡 Phase）与 **可选达成**（对应 🟢 Phase，可推迟）。

| 指标 | 现状 | 目标 | 达成要求 | 关联 |
| --- | --- | --- | --- | --- |
| 无标题文档 50KB 的解析耗时 | 89.21 ms | < 10 ms | 必须 | F5 |
| 无标题文档 100KB 的解析耗时 | 412.52 ms | < 20 ms | 必须 | F5 |
| 词法分析复杂度 | O(块长 × 标记数) | O(块长 + 标记数) | 必须 | F5 |
| 未创建页面的草稿能否回显 | ❌ 不能，且会被覆盖 | ✅ 能 | 必须 | F4 |
| 页面状态持有者 | 3 处 | 1 处（仓库） | 必须 | F4 |
| 反向依赖 | 1 处（`pages` → `editor`） | 0 | 必须 | F1 |
| src 里的日志/错误上报 | 0 条 | ≥ 1 个可注入 logger + 关键路径埋点 | 必须 | F10 |
| 空 `catch`（静默吞异常） | 2 处 | 0 处 | 必须 | F10 |
| 「查询失败」与「无匹配」能否区分 | ❌ 不能 | ✅ 能 | 必须 | F10 |
| CI | 无 | PR 必跑 | 必须 | F9 |
| 往返属性测试样本量 | 0 | ≥ 200 | 必须 | F9 |
| 纯逻辑的 node 单元测试模块数 | 1（解析器） | ≥ 3（+text +history） | 必须 | F8 |
| 页面仓库是否可创建隔离实例 | ❌ 单例 | ✅ `createPageStore()` | 必须 | F6 |
| 最大文件行数 | 845（`markdown/editor.ts`） | ≤ 300 | 可选 | F2 |
| 单文件方法数 | ~56 | ≤ 15 | 可选 | F2 |
| 控制器公开方法数 | 25（+2 getter） | ≤ 8 | 可选 | F2 |
| 加一种语法的改动点 | 4 处代码 + 1 处样式 | 1 处代码 + 1 处样式 | 可选 | F3 |
| 分层数 | 隐式 3 层（组件/编辑器+解析/仓库） | 显式 4 层 + 单一依赖方向 | 可选 | F1 |
| 链接目标的形态数 | 1（只有页面） | 判别联合，形态可扩展 | 可选 | F11 |
| 核心三模块的框架依赖 | 0 | **保持 0** | **红线** | F11 |

## 附录 B：性能实测数据

测量环境：macOS，Node 运行 `src/markdown/parser.ts`（DOM 无关部分），
`node --experimental-strip-types`，每档预热一次后取 5~200 次平均。

> **B.1 ~ B.3 的样本都是「无标题文档」** —— 即整篇文档被合并成**一个段落块**。
> 这是触发二次退化的最坏情况，也是理解 B.4 的前提。

**B.1 规模缩放**（同一段含代码/加粗/链接的内容重复 N 段，**无标题**）：

| 段落数 | 字符数 | 单次 parse | 相对上一档 |
| ---: | ---: | ---: | ---: |
| 50 | 3,299 | 0.520 ms | — |
| 100 | 6,599 | 2.532 ms | ×4.9 |
| 200 | 13,199 | 5.803 ms | ×2.3 |
| 400 | 26,399 | 22.785 ms | ×3.9 |
| 800 | 52,799 | 98.574 ms | ×4.3 |

字符数翻倍 → 耗时约 ×4：**二次复杂度**。

**B.2 内容形态对比**（均约 40,000 字符，**无标题**）：

| 形态 | 字符数 | 段落数 | 单次 parse | 相对纯文本 |
| --- | ---: | ---: | ---: | ---: |
| 纯文本（无标记） | 41,525 | 1,538 | 1.16 ms | 1× |
| 含双向链接 | 40,842 | 869 | 26.39 ms | 23× |
| 含行内代码 | 41,106 | 1,111 | 71.46 ms | 62× |

字符数相同，**耗时差 62 倍** → 瓶颈是标记数量而非文本长度，
与 F5 的 `spans.find()` 分析一致。

**B.3 标记密度对比**（均约 20,000 字符）：

| 每段代码标记数 | 字符数 | 段落数 | 单次 parse |
| ---: | ---: | ---: | ---: |
| 1 | 20,669 | 689 | 23.42 ms |
| 2 | 20,624 | 625 | 45.85 ms |
| 4 | 20,513 | 526 | 73.19 ms |
| 8 | 20,399 | 400 | 123.54 ms |

标记数翻倍 → 耗时约 ×2：**对标记数线性、对字符数平方**，
再次确认内层 `.find()` 是唯一热点。

**B.4 块结构的影响（最关键的一组数据）** —— 同样字符数，只改「有没有标题」：

| 样本 | 字符数 | 块数 | 单次 parse |
| --- | ---: | ---: | ---: |
| 无标题（全部并成 1 个块） | 26,399 | 1 | 35.87 ms |
| 每 5 段插一个标题 | 27,257 | ≈480 | 1.04 ms |
| 每 1 段插一个标题 | 30,689 | ≈800 | 1.12 ms |
| 每 20 段插一个标题 | 26,613 | ≈420 | 1.83 ms |

**同样内容，差 34 倍** —— 因为 `parseMarkdown()` 把连续的非标题行合并成同一个块，
标题是唯一的块切分点。二次退化的真实触发条件是
**「一个连续的、不含标题的长段落块」**，不是「文档长」。

**B.5 性能悬崖（每次按键都要全量重解析）**：

| 无标题文档 | 解析耗时 | 体感 | | 每 5 段一个标题 | 解析耗时 | 体感 |
| ---: | ---: | --- | --- | ---: | ---: | --- |
| 3,299 | 0.70 ms | 流畅 | | 3,397 | 0.14 ms | 流畅 |
| 6,599 | 1.55 ms | 流畅 | | 6,797 | 0.33 ms | 流畅 |
| 13,199 | 15.56 ms | 流畅 | | 13,617 | 0.86 ms | 流畅 |
| 26,399 | 21.70 ms | 可察觉 | | 27,257 | 1.24 ms | 流畅 |
| 52,799 | 89.21 ms | 明显卡顿 | | 54,537 | 2.16 ms | 流畅 |
| 105,599 | 412.52 ms | 不可用 | | 109,217 | 4.72 ms | 流畅 |

**同样 106KB，两种文档结构的单次按键解析耗时差 87 倍。**
带标题的笔记完全无感；长篇无标题散文在 50KB 就开始卡、100KB 就不可用。

> **注**：以上仅为解析耗时。编辑器每次按键还会执行**全文 DOM 重建**
> （`editor.ts:135-146`），该部分耗时未在此测量（需真实浏览器），
> 实际单次按键延迟会高于上表数值。

**B.6 草稿覆盖的复现脚本**（F4 的证据）—— 用**真实的** `src/pages/store.ts`
复刻 `App.vue` 的逻辑跑出来的输出：

```text
1. 打开缺失页面 foo（点正文里的 [[foo]]）
   弹窗显示内容 = ""   missing=true
2. 在弹窗里输入「hello」
   弹窗显示内容 = ""   （编辑器里是 "hello"）
   drafts = [["foo","hello"]]
3. 关掉弹窗（Esc / 点遮罩）→ 弹窗卸载，编辑器实例销毁
4. 再点一次链接，重新打开 foo
   弹窗显示内容 = ""        ← 用户之前写的 "hello" 看不见了
   drafts 还在 = [["foo","hello"]]   （但编辑器不会回显它）
5. 用户以为弹窗是空的，于是又输入「world」
   drafts = [["foo","world"]]      ← "hello" 被覆盖，永久丢失
6. 点「创建页面」
   页面 foo 的内容 = "world"      ← "hello" 没有任何路径可以找回
```

复现脚本的要点（可直接重跑验证）：

```ts
// 关键就三行，和 App.vue 一一对应
const popupContent = () => currentPage()?.content ?? ''   // App.vue:77
const saveContent = (c: string) => {
  if (currentPage()) updatePage(title, c)
  else drafts.set(title, c)                              // App.vue:57
}
const createCurrent = () => createPage(title, drafts.get(title) ?? '')  // App.vue:65
```

## 附录 C：文件级改动索引

| Phase | 优先级 | 文件 | 改动类型 |
| --- | --- | --- | --- |
| 0 | 🔴 | `test/harness.ts` | 新增 |
| 0 | 🔴 | `test/parser.test.ts` / `test/browser.test.ts` | 改用共享断言 |
| 0 | 🔴 | `test/browser.test.ts` | 加往返属性测试（需要 DOM） |
| 0 | 🔴 | `.github/workflows/ci.yml` | 新增 |
| 0 | 🔴 | `eslint.config.js` / `.prettierrc` | 新增 |
| 0 | 🔴 | `index.html` | 改 `lang` |
| 1 | 🟡 | `src/core/types.ts` | 新增 |
| 1 | 🟡 | `src/markdown/editor.ts` | 移出类型定义 |
| 1 | 🟡 | `src/pages/store.ts` | 改 import |
| 2 | 🔴 | `src/markdown/parser.ts` | 双指针改造（`:152` `:162` `:185` `:190`） |
| 2 | 🔴 | `test/perf.ts` | 新增（性能回归脚本） |
| 3 | 🔴 | `src/pages/store.ts` | 工厂化 + 草稿内收（`saveDraft` / `takeDraft`） |
| 3 | 🔴 | `src/App.vue` | 弹窗内容加草稿回显（`:77`），移除 `drafts`（`:45`），统一创建路径（`:61-67`） |
| 3 | 🔴 | `src/components/MarkdownEditor.vue` | 统一创建路径（`:50-56`） |
| 4 | 🔴 | `src/core/logger.ts` | 新增（可注入 logger，默认 no-op） |
| 4 | 🔴 | `src/markdown/editor.ts` | `EditorOptions` 加 `logger`；两处空 `catch` 改为记录（`:212-216` `:233-237`） |
| 4 | 🔴 | `src/components/DevStats.vue` | 新增（dev-only 性能 HUD） |
| 4 | 🔴 | `src/components/LinkSuggest.vue` | 区分「无匹配」与「查询失败」 |
| 5a | 🟡 | `src/editor/{text,history}.ts` | 新增（由 `editor.ts` 迁出，纯函数） |
| 5b | 🟢 | `src/editor/{caret,links,input}.ts` | 新增（由 `editor.ts` 迁出，DOM 耦合） |
| 5b | 🟢 | `src/markdown/editor.ts` | 瘦身为编排器 |
| 6 | 🟢 | `src/markdown/dom.ts` | 修 `em`/`i` 兜底分支丢标记（`:129`） |
| 7 | 🟢 | `src/core/syntax.ts` | 新增（语法注册表） |
| 7 | 🟢 | `src/markdown/parser.ts` / `src/markdown/dom.ts` | 改为语法表驱动 |
| 7 | 🟢 | `src/core/types.ts` | 加 `LinkTarget` 判别联合（只用 `page` 一种） |
| 8 | 🟢 | `src/markdown/editor.ts` → `src/editor/editor.ts` | 最小改名（只解 m5 的语义问题） |
| 8 | 🟢 | `src/components/MarkdownEditor.vue` 等 | 内容所有权契约、历史限额、变更信号 |
| 8 | 🟢 | `README.md` / `docs/implementation.md` | 同步目录结构与模块划分 |

> **全表不包含任何持久化相关文件** —— 不做持久化是项目已明确的方向。
