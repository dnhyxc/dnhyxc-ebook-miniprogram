# 书架分类条（ShelfCategoryRail）主题配色

本文档说明书架顶部分类横向滚动条的配色实现思路、踩坑与最终方案。

---

## 1. 组件职责

`src/components/ShelfCategoryRail.vue`：

- 展示「全部」、各分类、「公开」「未分类」等 Chip
- 每项包含标签文字 + 数量徽章
- 位于 `AppNavbar` 下方、`scroll-view` 上方，不随书列表滚动

数据由 `pages/shelf/index.vue` 传入：`categories`、`activeKey`、各类 `count`。

---

## 2. 设计原则（对齐 spec）

参考 `spec/chinese-color-10themes.md` 与 `spec/theme-ui.md`：

| 语义                       | 用途                 | 典型变量                                        |
| -------------------------- | -------------------- | ----------------------------------------------- |
| **accent**                 | 主按钮 / CTA         | 朱柿、檀纁等                                    |
| **accent-light**           | 强调徽章底           | `badge-primary`                                 |
| **ink + border + surface** | 筛选、幽灵按钮、标签 | `text-secondary`、`border-light`、`filled-oppo` |

**分类筛选不是 CTA**，不应大量使用 `accent` 满色块，否则与页面墨色/自然色背景冲突（用户反馈「色泽搭配不符整体」）。

### spec 中的参考样式

**幽灵按钮（未选中筛选）**：

```css
.btn-ghost {
  background: transparent;
  color: var(--ink-secondary);
  border-color: var(--border);
}
```

**徽章（若需强调数字，非筛选条首选）**：

```css
.badge-primary {
  background: var(--accent-light);
  color: var(--accent);
}
```

书架分类条采用 **幽灵 + 表面层级**，而非 `badge-primary` 满色 accent。

---

## 3. 问题演进与解决方案

### 问题 A：部分主题下数字看不清

#### 现象

暗色主题（如墨韵）选中项：数量徽章浅底 + 浅色字，对比度极低。

#### 根因（错误实现）

```css
/* 已废弃 */
.chip.active .chip-count {
  color: #fff;
  background: var(--wot-primary-6); /* 实际映射 inkPrimary，浅色 */
}
```

`primary6` 在 `presets` 中等于 `inkPrimary`（墨色/浅字色），**不是**品牌主色；再叠 `#fff` 在浅色底上几乎不可读。

#### 中间方案（已废弃）

用 `accent` 实底 + `accentText` 作激活数字色——对比度够，但整条分类条变成「橙色按钮组」，破坏整体色调。

### 问题 B：整体色泽与页面不协调

#### 现象

选中 Chip 大面积 `accent-light` / 橙色标签，与 `--bg-page` 自然色突兀。

#### 解决方案（当前实现）

全部使用 wot 注入的**表面与墨色**变量，由 `presets` 提供 `borderLight`、`dividerLight` 等：

```css
/* 未选中：幽灵 */
.chip {
  border: 1px solid var(--wot-border-light);
  background: transparent;
}
.chip-label {
  color: var(--wot-text-secondary);
}
.chip-count {
  color: var(--wot-text-auxiliary);
  background: var(--wot-divider-light);
}

/* 选中：表面抬升 */
.chip.active {
  background: var(--wot-filled-oppo); /* bg-elevated */
  border-color: var(--wot-border-main);
}
.chip.active .chip-label {
  color: var(--wot-text-main);
  font-weight: 600;
}
.chip.active .chip-count {
  color: var(--wot-text-main);
  background: var(--wot-filled-content); /* bg-card */
  font-weight: 600;
}
```

### presets 侧支撑字段

```typescript
borderLight: rgbaHex(palette.border, mode === "dark" ? 0.4 : 0.5),
dividerMain: rgbaHex(palette.border, 0.35),
dividerLight: rgbaHex(palette.border, 0.2),
```

---

## 4. 配色对照表

| 元素      | 未选中           | 选中             |
| --------- | ---------------- | ---------------- |
| Chip 背景 | 透明             | `filled-oppo`    |
| Chip 边框 | `border-light`   | `border-main`    |
| 标签文字  | `text-secondary` | `text-main` 加粗 |
| 数字背景  | `divider-light`  | `filled-content` |
| 数字文字  | `text-auxiliary` | `text-main` 加粗 |

十套主题切换时，以上变量均由 `wd-config-provider` 自动换色，无需在组件内写死 hex。

---

## 5. 勿再使用的写法

```css
/* 硬编码黑半透明 — 暗色主题下失效 */
background: rgba(0, 0, 0, 0.04);

/* 把 primary6 当品牌强调色 */
background: var(--wot-primary-6);
color: #fff;

/* 筛选条大面积 accent */
background: var(--wot-button-primary-soft-bg);
color: var(--wot-button-primary-color);
```

---

## 6. 相关文件

| 文件                                   | 职责                       |
| -------------------------------------- | -------------------------- |
| `src/components/ShelfCategoryRail.vue` | 分类条 UI 与样式           |
| `src/pages/shelf/index.vue`            | 数据与 `activeCategoryKey` |
| `src/theme/presets.ts`                 | `borderLight`、`divider*`  |
| `spec/chinese-color-10themes.md`       | badge / ghost 范例         |

---

## 7. 延伸阅读

- [theme-presets-and-chrome.md](./theme-presets-and-chrome.md) — 主题变量语义
- [phase1-epub-shelf-reader-plan.md](./phase1-epub-shelf-reader-plan.md) — 书架整体方案
