# 阅读页窗口 Chrome、回弹白底与导航栏（实现思路）

> **状态**：已采纳  
> **关联文件**：`src/pages/reader/index.vue`、`src/pages.json`  
> **来源会话**：[阅读 UI 迭代](478d2163-8768-4eb5-8e66-d25230844f76)

---

## 1. 需求背景（必填）

上下滑动（含橡皮筋回弹）时，页面上下露出**白色**系统/窗口背景；夜间主题下状态栏时间电量、返回箭头与标题仍偏深色；长标题被右侧胶囊遮挡；底栏安全区可能露白边。需要把窗口背景、状态栏字色、navbar 变量、标题最大宽度、安全区色条与纸张主题对齐，并从页面配置层关掉整页滚动。

---

## 2. 用户需求与 Agent 问答（必填）

### 2.1 滑动露白底

**用户：**

> 上下按住滑动的时候，上下会出现白色的底部背景，我不希望出现

**已落地方案：** `pages.json` `disableScroll` + `backgroundColor`；`uni.setBackgroundColor`；`scroll-view` `bounces=false`；底部 `reader-safe-bottom` 铺纸张色。

### 2.2 状态栏时间/电量随主题

**用户：**

> 当改变主题是，顶部左右两侧的时间及电量字体颜色也要随着改变

**已采纳：** `uni.setNavigationBarColor({ frontColor })`，夜间 `#ffffff`，其它 `#000000`。

### 2.3 返回箭头与标题色

**用户：**

> 返回图标颜色以及 title 字体颜色也需要随着改变

**已采纳：** `topBarStyle` 写入 `--wot-navbar-color` 等 CSS 变量。

### 2.4 长标题被胶囊遮挡

**用户：**

> 顶部 title 如果内容很长，会被遮挡

**已采纳：** `getMenuButtonBoundingClientRect` 算 `navbarTitleMaxWidth`，标题 ellipsis。

### 2.5 全屏隐藏胶囊（未采纳）

**用户曾问：** 希望时间/电量/小程序胶囊一并隐藏。  
**结果：** 微信小程序无法隐藏胶囊；最终 **Header 保持显示**，该能力未落地，**不记为实现**。

---

## 3. 实现思路（必填）

### 3.1 总体策略

白边来自多层：页面可滚动、窗口默认白底、scroll-view 回弹、home 指示条区域。每一层都刷成当前纸张背景，并禁止页面级滚动与 bounces。Navbar 用 wot 变量而不是只写 `color`（后者不进箭头/标题）。

### 3.2 调用时机

`onReady` / `onShow` / `watch(backgroundColor, paperTheme)` → `applyReaderPageChrome()`。

---

## 4. 改动点对比：改前 / 改后（必填）

### 4.1 改动点：阅读页 pages.json

- **位置**：`src/pages.json` → `pages/reader/index`
- **差异摘要：** 禁止页面滚动并给出默认窗体底色。

#### 改动前

```json
{
  "path": "pages/reader/index",
  "style": {
    "navigationStyle": "custom",
    "navigationBarTitleText": "阅读"
  }
}
```

#### 改动后

```json
{
  "path": "pages/reader/index",
  "style": {
    "navigationStyle": "custom",
    "navigationBarTitleText": "阅读",
    "disableScroll": true,
    "backgroundColor": "#ffffff"
  }
}
```

### 4.2 改动点：运行时窗口/状态栏色

- **位置**：`applyReaderPageChrome`（约第 349–367 行）
- **差异摘要：** 背景三向 + 状态栏 frontColor 随夜间切换。

#### 改动前

```ts
// 无统一窗口底色 API 调用
// 仅 shell / navbar custom-style 写 backgroundColor
const topBarStyle = computed(
  () =>
    `background-color: ${readerStyle.value.backgroundColor}; color: ${readerStyle.value.color};`,
);
```

#### 改动后

```ts
function applyReaderPageChrome() {
  // 当前纸张背景
  const bg = readerStyle.value.backgroundColor;
  // 夜间状态栏用浅色字，其它用深色字
  const frontColor = paperTheme.value === "dark" ? "#ffffff" : "#000000";
  // 窗口上下与整体背景都刷成纸张色，减少回弹露白
  uni.setBackgroundColor({
    backgroundColor: bg,
    backgroundColorTop: bg,
    backgroundColorBottom: bg,
  });
  // 自定义导航下 frontColor 主要影响状态栏时间/电量
  uni.setNavigationBarColor({
    frontColor,
    backgroundColor: bg,
  });
}

// 纸张或背景变了立刻同步
watch(
  () => [readerStyle.value.backgroundColor, paperTheme.value] as const,
  () => applyReaderPageChrome(),
);
```

### 4.3 改动点：navbar 变量与标题避让胶囊

- **位置**：`topBarStyle` / `measureNavbarTitleMaxWidth`（约第 602–632、1245–1250 行）
- **差异摘要：** wot 变量驱动箭头/标题色；标题 max-width 动态计算。

#### 改动前

```ts
// 只写 color，wd-navbar 箭头/标题不继承
const topBarStyle = computed(
  () =>
    `background-color: ${readerStyle.value.backgroundColor}; color: ${readerStyle.value.color};`,
);
// 标题无胶囊避让，易被遮
```

#### 改动后

```ts
const topBarStyle = computed(() => {
  const { backgroundColor, color } = readerStyle.value;
  return [
    `background-color:${backgroundColor}`,
    `color:${color}`,
    // wot navbar 实际读这些变量
    `--wot-navbar-bg:${backgroundColor}`,
    `--wot-navbar-color:${color}`,
    `--wot-navbar-desc-color:${color}`,
    `z-index:101`,
  ].join(";");
});

// 按胶囊左缘与返回区算居中标题最大宽度
function measureNavbarTitleMaxWidth() {
  try {
    const { windowWidth } = uni.getWindowInfo();
    const menu = uni.getMenuButtonBoundingClientRect();
    if (!(windowWidth > 0) || !(menu.left > 0)) return;
    const gap = 8;
    const leftReserve = 88;
    // 居中标题右缘不得超过胶囊左缘
    const byCapsule = 2 * (menu.left - gap) - windowWidth;
    const byLeft = windowWidth - 2 * leftReserve;
    const maxW = Math.max(Math.min(byCapsule, byLeft), 120);
    navbarTitleMaxWidth.value = `${Math.floor(maxW)}px`;
  } catch {
    // ponytail: H5/非微信环境保持百分比兜底
  }
}
```

```scss
/* 标题使用动态 max-width 并省略 */
.reader-top :deep(.wd-navbar__title) {
  max-width: v-bind(navbarTitleMaxWidth);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box;
}
```

### 4.4 改动点：scroll-view 禁回弹 + 安全区色条

- **位置**：模板 `scroll-view` 与 `reader-safe-bottom`（约第 21–36、262–266、1258–1266 行）
- **差异摘要：** 减少橡皮筋露白；home 指示条下铺纸张色。

#### 改动前

```vue
<!-- 普通 scroll-y，未关 bounces，无底部安全区色条 -->
<scroll-view scroll-y class="reader-scroll" ...>
```

#### 改动后

```vue
<!-- enhanced + 关闭弹性，降低露白概率 -->
<scroll-view scroll-y enhanced :bounces="false" class="reader-scroll" :style="scrollViewStyle" ...>
</scroll-view>

<!-- 与纸张同色的安全区垫片，z-index 低于底栏 -->
<view
  v-if="hasContent"
  class="reader-safe-bottom"
  :style="{ backgroundColor: readerStyle.backgroundColor }"
/>
```

```scss
.reader-safe-bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 98;
  height: env(safe-area-inset-bottom);
  pointer-events: none;
}
```

---

## 5. 验证要点（建议）

- [ ] 各纸张主题下用力上下拉：尽量无白边（机型差异见已知约束）
- [ ] 夜间：状态栏时间电量为浅色；箭头与标题为浅色
- [ ] 护眼/绿色：状态栏深色字，navbar 字色与纸张 fg 一致
- [ ] 超长章节标题：省略且不侵入胶囊
- [ ] 底栏隐藏时，home 指示条区域仍是纸张色

---

## 6. 影响分析（必填，放在文档最后）

### 6.1 结论

- **是否影响已有功能点**：局部影响 — 仅阅读页窗口/导航 Chrome；其它 tab 页配置未改。
- **是否影响既有正常逻辑**：局部影响 — `disableScroll` 后整页手势滚动关闭，阅读滚动完全依赖内部 `scroll-view`（与连续流设计一致）。

### 6.2 影响点明细

| #   | 影响对象          | 影响方式         | 程度 | 说明与回归建议                |
| --- | ----------------- | ---------------- | ---- | ----------------------------- |
| 1   | 阅读页页面滚动    | 禁用             | 高   | 确认只有正文 scroll-view 可滚 |
| 2   | 状态栏字色        | 随纸张主题       | 中   | 四套主题各看一眼              |
| 3   | wd-navbar 外观    | CSS 变量         | 中   | 夜间返回箭头对比度            |
| 4   | 标题宽度          | 动态缩小         | 低   | 短书名仍居中观感正常          |
| 5   | 部分 Android 回弹 | 系统层仍可能露底 | 低   | 属平台约束，已多层兜底        |

### 6.3 调用面 / 波及说明

`applyReaderPageChrome` 仅阅读页调用；`pages.json` 仅改 reader 路由。与全局 App 主题（`presets`）独立——此处是**纸张主题**，不是设置页十套色。

### 6.4 已知约束

微信无法隐藏右上角胶囊；全屏沉浸只能做到自定义导航以下区域。部分机型橡皮筋仍可能短暂露底，已通过禁 bounces + 背景 API 尽量压低。
