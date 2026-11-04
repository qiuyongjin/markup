/**
 * 页面仓库的行为测试（node 侧直接跑）。
 * 运行：node test/store.test.ts
 */
import { createPageStore } from '../src/pages/store.ts'
import { createHarness, finish } from './harness.ts'

const h = createHarness()

h.section('1. 工厂：每个实例互相隔离')
{
  const a = createPageStore()
  const b = createPageStore()

  a.create('只属于 a')
  h.check(a.has('只属于 a'), '实例 a 里能查到刚建的页面')
  h.check(!b.has('只属于 a'), '实例 b 里查不到（没有互相污染）')
  h.check(a.pages.length === 1, '实例 a 有 1 个页面', String(a.pages.length))
  h.check(b.pages.length === 0, '实例 b 还是空的', String(b.pages.length))
}

h.section('2. 页面增删改查')
{
  const store = createPageStore()

  const page = store.create('  笔记  ')
  h.check(page?.title === '笔记', '创建时标题去掉首尾空格', page?.title ?? '')
  h.check(store.get('笔记') !== undefined, '能按标题查到')
  h.check(store.get('  笔记 ') !== undefined, '查询也忽略首尾空格')
  h.check(store.has('笔记'), 'has 判断存在')
  h.check(store.get('不存在') === undefined, '查不到时是 undefined')

  const again = store.create('笔记')
  h.check(again === store.get('笔记'), '同名页面已存在时直接返回它')
  h.check(store.pages.length === 1, '不会建出第二个', String(store.pages.length))

  store.update('笔记', '正文')
  h.check(store.get('笔记')?.content === '正文', '更新正文生效')

  store.remove('笔记')
  h.check(store.get('笔记') === undefined, '删除生效')
  h.check(store.pages.length === 0, '删干净了', String(store.pages.length))
}

h.section('3. 搜索')
{
  const store = createPageStore()
  store.create('React 入门')
  store.create('Vue 入门')
  store.create('随手记')

  const hits = store.search('入门').map((page) => page.title).sort()
  h.equal(hits, ['React 入门', 'Vue 入门'], '按关键字搜')

  const prefixed = store.search('Re').map((page) => page.title)
  h.equal(prefixed, ['React 入门'], '前缀命中的排在前面')
}

h.section('4. 草稿：仓库是唯一的持有者')
{
  const store = createPageStore()

  store.saveDraft('草稿页', 'hello')
  h.check(store.draftOf('草稿页') === 'hello', '草稿能读到')
  h.check(store.takeDraft('草稿页') === 'hello', '取出草稿能拿到内容')
  h.check(store.draftOf('草稿页') === undefined, '取出的草稿被消费掉了（读即消费）')
  h.check(store.takeDraft('草稿页') === undefined, '消费过就没有了')
}

h.section('5. 创建页面时把草稿写进去')
{
  const store = createPageStore()

  store.saveDraft('带草稿', '写好的正文')
  store.create('带草稿')
  h.check(store.get('带草稿')?.content === '写好的正文', '草稿的内容进了页面')
  h.check(store.draftOf('带草稿') === undefined, '草稿被消费掉了，不留孤儿')

  // 指定了内容也一样：页面建出来了，草稿就作废了，不能留下孤儿
  store.saveDraft('带草稿二', '旧草稿')
  store.create('带草稿二', '新正文')
  h.check(store.get('带草稿二')?.content === '新正文', '指定内容时用指定的内容')
  h.check(store.draftOf('带草稿二') === undefined, '指定内容时草稿也会被消费掉')
}

h.section('6. 版本号：页面变了就变')
{
  const store = createPageStore()
  const before = store.revision

  store.create('一页')
  h.check(store.revision > before, '新建页面后版本号变大', String(store.revision))

  const afterCreate = store.revision
  store.update('一页', '正文')
  h.check(store.revision > afterCreate, '更新页面后版本号变大', String(store.revision))

  const afterUpdate = store.revision
  store.remove('一页')
  h.check(store.revision > afterUpdate, '删除页面后版本号变大', String(store.revision))
}

h.section('7. 草稿覆盖的完整路径（F4 回归）')
{
  // 这一段复刻 App.vue 的逻辑：弹窗内容 = 页面内容 ?? 草稿内容
  const store = createPageStore()
  const title = 'foo'

  const popupContent = (): string => store.get(title)?.content ?? store.draftOf(title) ?? ''
  const saveContent = (content: string): void => {
    if (store.get(title)) store.update(title, content)
    else store.saveDraft(title, content)
  }

  h.check(popupContent() === '', '1. 打开缺失页面 foo：内容是空的')

  saveContent('hello')
  h.check(popupContent() === 'hello', '2. 输入 hello：弹窗里能回显出来')

  // 3. 关掉弹窗 —— 弹窗卸载，编辑器销毁，草稿留在仓库里
  h.check(popupContent() === 'hello', '4. 重新打开 foo：之前写的内容还在')

  // 5. 用户接着写
  saveContent('hello world')
  h.check(popupContent() === 'hello world', '5. 继续输入：接着上次的内容写')

  // 6. 点「创建页面」：草稿被消费，写进页面
  store.create(title)
  h.check(store.get(title)?.content === 'hello world', '6. 创建页面：写入完整内容')
  h.check(store.draftOf(title) === undefined, '7. 创建后没有残留草稿')
}

finish(h)
