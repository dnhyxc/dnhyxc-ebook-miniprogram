# 阅读正文强制断行（实现思路）

> **状态**：已采纳  
> **关联文件**：`src/hooks/useReaderSettings.ts`、`src/pages/reader/index.vue`（`containerStyle`）  
> **来源会话**：[听书混合交互](faa5daf9-2879-4986-83be-4d4d503a5cec)

---

## 1. 需求背景（必填）

部分 EPUB 正文含超长无空格符号串（如连续 `*`）或 URL，在小程序 `mp-html` 中不会自动换行，把阅读区撑出横向滚动。

成功标准：此类内容在屏宽内折行，不再出现横向滑动。

---

## 2. 用户需求与 Agent 问答（必填）

### 2.1 长串撑开横向滚动

**用户：**

> （现象）正文出现横向滚动 / 长串符号撑开页面

**Agent 回答摘要：**

- 在 `mpTagStyle` 与 `containerStyle` 增加 `overflow-wrap: anywhere`、`word-break: break-all`、`max-width: 100%`

---

## 3. 实现思路（必填，细致到每个点）

### 3.1 总体策略

不改 HTML 内容，只在阅读主题样式层强制断行，让 `mp-html` 标签默认样式带上 wrap 规则。

### 3.2 数据流 / 控制流

```text
paperTheme/fontSize → mpTagStyle / containerStyle → mp-html 渲染
```

### 3.3 分点设计

- **现象**：无空格长串不换行
- **目标**：任意标签文本可断行
- **做法**：见 4.1

---

## 4. 改动点对比：改前 / 改后（必填）

### 4.1 改动点：mpTagStyle 增加 wrap

- **位置**：`src/hooks/useReaderSettings.ts` → `mpTagStyle` computed
- **差异摘要**：所有正文相关标签拼接 wrap 片段。

#### 改动前

```ts
    // 字色强制覆盖 EPUB 内联色
    const color = `color:${readerStyle.value.color} !important`;
    // 两端对齐
    const justify =
      "text-align:justify !important;text-justify:inter-ideograph;text-align-last:left";
    // 行高字号颜色对齐
    const textBase = `line-height:${lineHeight.value};font-size:${fontSize.value}px;${color};${justify}`;
    return {
      // 段落间距 + 文本基样式
      p: `margin:0 0 1em;${textBase}`,
      // 其它块/行内标签复用
      div: textBase,
      span: textBase,
      li: textBase,
      a: textBase,
```

#### 改动后

```ts
    // 字色强制覆盖 EPUB 内联色
    const color = `color:${readerStyle.value.color} !important`;
    // 两端对齐
    const justify =
      "text-align:justify !important;text-justify:inter-ideograph;text-align-last:left";
    // 长串 **** / URL 等无空格字符必须断行，否则会撑出横向滚动
    const wrap = "overflow-wrap:anywhere;word-break:break-all;max-width:100%";
    // 行高字号颜色对齐 + 断行
    const textBase = `line-height:${lineHeight.value};font-size:${fontSize.value}px;${color};${justify};${wrap}`;
    return {
      // 段落间距 + 文本基样式
      p: `margin:0 0 1em;${textBase}`,
      // 其它块/行内标签复用
      div: textBase,
      span: textBase,
      li: textBase,
      a: textBase,
```

---

## 5. 验证要点（建议）

- [ ] 含长串 `*` / 无空格 URL 的章无横向滚动
- [ ] 中文两端对齐与换肤不受影响

---

## 6. 影响分析（必填，放在文档最后）

### 6.1 结论

- **是否影响已有功能点**：局部影响 — 所有经 `mpTagStyle` 渲染的正文均启用强制断行
- **是否影响既有正常逻辑**：否 — 仅样式字符串追加，不改加载/进度逻辑

### 6.2 影响点明细

| #   | 影响对象   | 影响方式                       | 程度 | 说明与回归建议                |
| --- | ---------- | ------------------------------ | ---- | ----------------------------- |
| 1   | 正文排版   | 英文长词可能在任意字符处断开   | 低   | 抽查含 URL 章节观感是否可接受 |
| 2   | 听书分段章 | 段内 mp-html 同样吃 mpTagStyle | 低   | 听书中改字号仍断行            |

### 6.3 调用面 / 波及说明（建议）

- `useReaderSettings().mpTagStyle`：阅读页（及听书分段渲染共用）
