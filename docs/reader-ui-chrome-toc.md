# 阅读页 UI：操作栏、目录抽屉与回弹背景

> **说明**：本文为迭代过程中的问题笔记。按主题拆分、含改前/改后对比与影响分析的正式实现思路见：
>
> - [reader-continuous-stream-impl.md](./reader-continuous-stream-impl.md)
> - [reader-chrome-toolbar-impl.md](./reader-chrome-toolbar-impl.md)
> - [reader-toc-drawer-impl.md](./reader-toc-drawer-impl.md)
> - [reader-theme-typography-impl.md](./reader-theme-typography-impl.md)
> - [reader-page-overscroll-navbar-impl.md](./reader-page-overscroll-navbar-impl.md)

本文记录阅读页（`src/pages/reader/index.vue`）近期一轮 UI / 交互迭代中遇到的问题、根因与最终实现。每节包含现象、思路与具体代码。

## 相关文件

| 文件                             | 职责                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/reader/index.vue`     | 阅读页主 UI：操作栏、目录抽屉、关闭手势/动画、窗口与状态栏底色、navbar 色与标题避让胶囊、mp-html 换肤、字号/行距 step 滑轨 |
| `src/hooks/useReaderSettings.ts` | 字体 / 纸张 / 行距；`mpTagStyle` 字色与两端对齐                                                                            |
| `src/utils/reader-html.ts`       | 剥离 EPUB 内联颜色与 `text-align`（换肤前置条件）                                                                          |
| `src/pages.json`                 | 阅读页 `disableScroll`、默认 `backgroundColor`                                                                             |

## 层级一览（最终）

| 层                                  | z-index | 说明                                     |
| ----------------------------------- | ------- | ---------------------------------------- |
| 顶部导航 `reader-top` / `wd-navbar` | 101     | 始终显示                                 |
| 底部操作栏 `reader-chrome-bottom`   | 100     | 默认隐藏，点击正文切换；滚动时隐藏       |
| 目录抽屉 `toc-sheet`                | 99      | 全宽底部 sheet，夹在 header 与底部栏之间 |
| 底部安全区色条 `reader-safe-bottom` | 98      | 铺底色，防 home 指示条白边               |

> 曾存在 `toc-mask`（遮罩，z-index 98），后按产品要求移除。

---

## 问题 1：字体设置滑块「轨道太粗 / 标签位置不佳」

### 现象

字体 / 行距滑块轨道显眼，数值与标签挤在一起，不像阅读类 App 的细控件。

### 思路

- 数值标签放到轨道**上方**（`typo-slider-head`）
- 轨道用细圆角条 + 小圆钮；随后按视觉要求把轨道加到 `16rpx`

### 关键代码（样式）

```scss
.typo-slider {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.typo-slider-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.typo-slider-track {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 16rpx;
  transform: translateY(-50%);
  border-radius: 999rpx;
  background: rgba(0, 0, 0, 0.08);
}

.typo-slider-knob {
  position: absolute;
  top: 50%;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  /* 中心对齐在当前进度百分比 */
}
```

---

## 问题 2：正文无法两端对齐

### 现象

章节 HTML 仍按 EPUB 原样式排版，两端对齐不生效，或换肤后仍被内联 `text-align` 覆盖。

### 思路

两层同时做：

1. **主题侧**：`mpTagStyle` / `containerStyle` 强制 `text-align: justify`
2. **内容侧**：解析 HTML 时剥掉内联对齐相关属性，否则 EPUB 作者样式会盖过主题

### 关键代码（`useReaderSettings.ts`）

```ts
const mpTagStyle = computed(() => {
  const color = `color:${readerStyle.value.color} !important`;
  const justify = "text-align:justify !important;text-justify:inter-ideograph;text-align-last:left";
  const textBase = `line-height:${lineHeight.value};font-size:${fontSize.value}px;${color};${justify}`;
  return {
    p: `margin:0 0 1em;${textBase}`,
    div: textBase,
    span: textBase,
    // ...
  };
});
```

### 关键代码（`reader-html.ts`）

```ts
const READER_STRIP_PROPS = new Set([
  "color",
  "background",
  "background-color",
  "text-align",
  "text-align-last",
  "text-justify",
]);

/** 去掉 EPUB 内联颜色与对齐，阅读主题才能即时控制字色与两端对齐 */
export function stripReaderColorStyles(html: string): string {
  return html
    .replace(/<font\b([^>]*)\s+color\s*=\s*["'][^"']*["']([^>]*)>/gi, "<font$1$2>")
    .replace(/\s+color\s*=\s*["'][^"']*["']/gi, "")
    .replace(
      /(\sstyle\s*=\s*["'])([^"']*)(["'])/gi,
      (_match, open: string, styles: string, close: string) => {
        const kept = styles
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((s) => !READER_STRIP_PROPS.has(s.split(":")[0]?.trim().toLowerCase() ?? ""));
        return kept.length ? `${open}${kept.join(";")}${close}` : "";
      },
    );
}
```

### 关键代码（页面 `containerStyle` + 章节块）

```ts
const containerStyle = computed(
  () =>
    `font-size:${readerStyle.value.fontSize};color:${readerStyle.value.color} !important;` +
    `line-height:${readerStyle.value.lineHeight};font-family:${readerStyle.value.fontFamily};` +
    `text-align:justify;text-justify:inter-ideograph;text-align-last:left`,
);
```

```scss
.chapter-block :deep(._root),
.chapter-block :deep(._p),
.chapter-block :deep(._div) {
  text-align: justify;
  text-justify: inter-ideograph;
  text-align-last: left;
}
```

---

## 问题 3：顶部 / 底部操作栏显隐策略

### 现象与产品决策

- 需要类似微信读书：正文区域点击切换「沉浸 / 操作」状态
- **Header 始终显示**（曾尝试随底部栏一起隐藏，用户明确撤回）
- 底部栏默认隐藏；滚动时自动收起；打开目录时保持可见

### 思路

- `chromeVisible` 控制底部栏；header 不做显隐
- 正文 `@tap="toggleChrome"`；滚动位移超过阈值 → `hideBottomChrome`
- 底部栏用 `transform: translateY(100%)` + `opacity` 做进出动画

### 关键代码（模板结构）

```vue
<view class="reader-top">
  <wd-navbar ... />
</view>

<scroll-view ...>
  <view class="reader-stream" @tap="toggleChrome">
    <!-- chapters -->
  </view>
</scroll-view>

<view
  v-if="hasContent"
  class="reader-chrome-bottom"
  :class="{ 'reader-chrome-bottom--visible': chromeVisible }"
  :style="chromeBarStyle"
  @click.stop
>
  <!-- 主题 / 翻页 / 字体 / 目录 工具栏 -->
</view>
```

### 关键代码（逻辑）

```ts
function hideBottomChrome() {
  if (!chromeVisible.value) return;
  chromeVisible.value = false;
  bottomPanel.value = null;
  closeToc();
  void nextTick(() => setTimeout(measureChromeInsets, 120));
}

function toggleChrome() {
  chromeVisible.value = !chromeVisible.value;
  if (!chromeVisible.value) {
    bottomPanel.value = null;
    closeToc();
  }
  void nextTick(() => {
    setTimeout(() => {
      measureViewport();
      measureChromeInsets();
    }, 120);
  });
}
```

### 关键代码（样式）

```scss
.reader-chrome-bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom);
  transform: translateY(100%);
  opacity: 0;
  pointer-events: none;
  transition:
    transform 0.28s cubic-bezier(0.32, 0.72, 0, 1),
    opacity 0.28s ease;
}

.reader-chrome-bottom--visible {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}
```

### 注意

微信小程序**无法隐藏**右上角胶囊按钮；全屏沉浸只能做到自定义导航以下区域。

---

## 问题 4：目录布局从侧栏改为「微信读书式」底部抽屉

### 现象（旧方案）

- 左侧约 `75vw` 侧栏易被底部操作栏遮挡
- `scroll-view` 高度按错误的 `windowHeight`（默认 667）算，导致顶部阴影 / 间隙 / 底部大量空白反复返工

### 思路

改为全宽底部 sheet：

- `top` = 实测导航底边 `chromeInsets.top`
- `bottom` = 底部栏高度 `bottomChromeInset`（工具栏可见或目录打开时保留）
- 列表高度 = `liveWindowHeight() - top - bottom - TOC_HANDLE_HEIGHT`
- 用 `uni.getWindowInfo().windowHeight` 现取现用，避免缓存默认值

### 关键代码（尺寸）

```ts
const TOOLBAR_INSET_FALLBACK = 72;
const TOC_HANDLE_HEIGHT = 64;

const bottomChromeInset = computed(() => {
  if (!chromeVisible.value && !tocOpen.value) return 0;
  return chromeInsets.value.bottom || lastChromeBottom || TOOLBAR_INSET_FALLBACK;
});

function liveWindowHeight(): number {
  try {
    const { windowHeight: h } = uni.getWindowInfo();
    if (h > 0) return h;
  } catch {
    // ponytail: 降级用缓存值
  }
  return windowHeight.value || 667;
}

const tocScrollHeight = computed(() => {
  const top = chromeInsets.value.top || 88;
  const bottom = bottomChromeInset.value;
  return Math.max(liveWindowHeight() - top - bottom - TOC_HANDLE_HEIGHT, 120);
});

const tocSheetStyle = computed(() => ({
  top: `${chromeInsets.value.top}px`,
  bottom: `${bottomChromeInset.value}px`,
  backgroundColor: readerStyle.value.backgroundColor,
  color: readerStyle.value.color,
}));
```

### 关键代码（打开目录）

```ts
function openBottomPanel(panel: BottomPanel | "toc") {
  if (panel === "toc") {
    if (tocOpen.value && !tocClosing.value) {
      closeToc();
      return;
    }
    if (tocClosing.value) return;
    chromeVisible.value = true;
    bottomPanel.value = null;
    tocOpen.value = true;
    void nextTick(() => {
      measureChromeInsets();
      setTimeout(measureChromeInsets, 320); // 等底部栏动画结束后复测
    });
    return;
  }
  // ...
}
```

> 再次点击「目录」图标关闭抽屉，见 **问题 18**。

### 关键代码（模板）

```vue
<view
  v-if="hasContent && tocOpen"
  class="toc-sheet"
  :class="{
    'toc-sheet--dark': paperTheme === 'dark',
    'toc-sheet--closing': tocClosing,
  }"
  :style="tocSheetStyle"
>
  <view
    class="toc-handle"
    @tap="closeToc"
    @touchstart="onTocHandleTouchStart"
    @touchend="onTocHandleTouchEnd"
  >
    <view class="toc-handle-bar" />
  </view>
  <scroll-view
    scroll-y
    class="toc-scroll"
    :style="{ height: `${tocScrollHeight}px` }"
    :show-scrollbar="false"
  >
    <!-- toc items -->
  </scroll-view>
</view>
```

### 踩坑小结

| 坑                                  | 处理                                       |
| ----------------------------------- | ------------------------------------------ |
| `box-shadow` 在顶部形成「黑缝」错觉 | 去掉不必要顶阴影，或只用底部阴影           |
| `scroll-view` 必须显式像素高度      | 用计算高度，不能只靠 `flex:1`              |
| 异步测量时机                        | 打开后 `nextTick` + `320ms` 再测一次工具栏 |

---

## 问题 5：开启目录时不要底部遮罩

### 现象

目录打开后半透明 `toc-mask` 盖住正文与底部栏，观感压抑。

### 思路

直接删除遮罩节点、`tocMaskStyle` 与 `.toc-mask` 样式。关闭路径改为：

- 点击顶部导航
- 点击 / 下滑抽屉顶栏（handle）
- 返回键优先关目录

### 关键代码变更

移除类似结构：

```vue
<!-- 已删除 -->
<view class="toc-mask" :style="tocMaskStyle" @click="closeToc" />
```

---

## 问题 6：点击头部关闭目录；handle 点击区域过小

### 现象

- 点 header 无法关目录（或只绑定了一部分区域）
- 抽屉顶栏只有细横条可点，命中面积不够

### 思路

1. `reader-top` 绑 `@tap="onReaderTopTap"`（目录打开时 `closeToc`）
2. handle `min-height: 120rpx`；`TOC_HANDLE_HEIGHT` 同步改为 `64`（与列表高度公式一致）
3. `@click-left="goBack"`：目录开着先关，再 `navigateBack`

### 关键代码

```vue
<view
  class="reader-top"
  @tap="onReaderTopTap"
  @touchstart="onTocHeaderTouchStart"
  @touchend="onTocHeaderTouchEnd"
>
  <wd-navbar @click-left="goBack" ... />
</view>
```

```ts
function goBack() {
  if (tocOpen.value) {
    closeToc();
    return;
  }
  uni.navigateBack();
}

function onReaderTopTap() {
  if (tocOpen.value && !tocClosing.value) closeToc();
}
```

```scss
.toc-handle {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 120rpx;
  box-sizing: border-box;
}
```

---

## 问题 7 / 8：点击、下滑都关不掉目录（手势与 tap 冲突）

### 现象

用户反馈：点击抽屉顶栏、向下滑动都无法关闭。中途修了几次反而更差。

### 根因（微信小程序）

1. 对 `touchstart` / `touchend` 使用 `.stop`（编译为 `catch`）会**阻止系统生成 `tap`**
2. `@touchmove.stop.prevent` 在手指轻微移动时取消默认行为，同样打断 tap
3. 父级 `@click.stop` / `@touchmove.stop` 可能干扰子元素事件

### 最终思路（对齐微信读书习惯）

| 交互                      | 实现                                                                          |
| ------------------------- | ----------------------------------------------------------------------------- |
| 点击关闭                  | handle / header 上只用 **bind** 级 `@tap`，**不用** catch touch               |
| 下滑关闭                  | 只在 `touchstart` 记 Y、`touchend` 用 `changedTouches` 算位移；超过 40px 关闭 |
| 不在 `touchmove` 里关抽屉 | 避免移动过程里反复抢事件、阻断 tap                                            |

### 关键代码（最终手势）

```ts
const TOC_SWIPE_CLOSE_PX = 40;

let tocHeaderStartY = 0;
let tocHandleStartY = 0;

function onTocHeaderTouchStart(e: TouchEvent) {
  if (!tocOpen.value) return;
  tocHeaderStartY = e.touches[0]?.clientY ?? 0;
}

function onTocHeaderTouchEnd(e: TouchEvent) {
  if (!tocOpen.value || !tocHeaderStartY) {
    tocHeaderStartY = 0;
    return;
  }
  const endY = e.changedTouches[0]?.clientY ?? 0;
  if (endY - tocHeaderStartY > TOC_SWIPE_CLOSE_PX) closeToc();
  tocHeaderStartY = 0;
}

function onTocHandleTouchStart(e: TouchEvent) {
  if (!tocOpen.value) return;
  tocHandleStartY = e.touches[0]?.clientY ?? 0;
}

function onTocHandleTouchEnd(e: TouchEvent) {
  if (!tocOpen.value || !tocHandleStartY) {
    tocHandleStartY = 0;
    return;
  }
  const endY = e.changedTouches[0]?.clientY ?? 0;
  if (endY - tocHandleStartY > TOC_SWIPE_CLOSE_PX) closeToc();
  tocHandleStartY = 0;
}
```

```vue
<!-- 正确：tap + touchstart/end，均无 .stop -->
<view
  class="toc-handle"
  @tap="closeToc"
  @touchstart="onTocHandleTouchStart"
  @touchend="onTocHandleTouchEnd"
>
  <view class="toc-handle-bar" />
</view>
```

### 失败路径备忘（勿再引入）

```vue
<!-- ❌ catch 会打掉 tap -->
@touchstart.stop="..." @touchend.stop="..." @touchmove.stop.prevent="..."

<!-- ❌ 父级轻易 stop 会坑子元素 -->
@click.stop @touchmove.stop
```

官方社区相关共识：`catchtouchmove` 可防页面跟滚，但不要 catch `start`/`end`，否则 tap 失效。

---

## 问题 9：目录关闭时没有过渡动画

### 现象

打开有 `toc-slide-up`，关闭时 `v-if` 立刻卸载，瞬间消失。

### 思路

关闭分两步：

1. `tocClosing = true` → 加 class 播 `toc-slide-down`
2. `280ms` 后再 `tocOpen = false` 卸载
3. 关闭过程中 `pointer-events: none`，防连点；再次打开时 `resetTocCloseAnimation` 清定时器

### 关键代码

```ts
const TOC_ANIM_MS = 280;
const tocClosing = ref(false);
let tocCloseTimer: ReturnType<typeof setTimeout> | null = null;

function closeToc() {
  if (!tocOpen.value || tocClosing.value) return;
  tocClosing.value = true;
  if (tocCloseTimer) clearTimeout(tocCloseTimer);
  tocCloseTimer = setTimeout(() => {
    tocOpen.value = false;
    tocClosing.value = false;
    tocCloseTimer = null;
    void nextTick(() => measureChromeInsets());
  }, TOC_ANIM_MS);
}

function resetTocCloseAnimation() {
  if (tocCloseTimer) {
    clearTimeout(tocCloseTimer);
    tocCloseTimer = null;
  }
  tocClosing.value = false;
}
```

```scss
.toc-sheet {
  animation: toc-slide-up 0.28s cubic-bezier(0.32, 0.72, 0, 1);
}

.toc-sheet--closing {
  animation: toc-slide-down 0.28s cubic-bezier(0.32, 0.72, 0, 1) forwards;
  pointer-events: none;
}

@keyframes toc-slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes toc-slide-down {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
}
```

跳章 `openAtChapter` 也走 `closeToc()`，保证同一套关闭动画（若需瞬间跳过可再拆 `closeTocImmediate`）。

---

## 问题 10：上下滑动时顶部 / 底部露出白色背景

### 现象

按住上下拖动（橡皮筋回弹）时，状态栏附近与底部 home 指示条区域露出白 / 浅灰底，与当前纸张色（如绿色 `#cce8cf`）不一致。

### 根因

1. 全局 `pages.json` → `globalStyle.backgroundColor: #F5F5F5`，页面窗口底色未跟阅读主题
2. iOS `scroll-view` 默认 `bounces`，边界外露出窗口色
3. 页面级还可被外层再滚一次（未 `disableScroll`）
4. 底部 `safe-area-inset-bottom` 在工具栏隐藏时可能透出底色

### 思路（组合拳）

1. 阅读页 `disableScroll: true`，只滚内部 `scroll-view`
2. `enhanced` + `:bounces="false"` 关 iOS 回弹
3. `uni.setBackgroundColor` 把窗口 top/bottom 底色同步成纸张色；换肤时 watch
4. `.reader { overflow: hidden }` + `scroll-view` 自身背景色
5. 固定 `reader-safe-bottom` 色条盖住底部安全区

### 关键代码（`pages.json`）

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

> 改 `pages.json` 后需**重新编译**小程序才生效。

### 关键代码（窗口底色）

```ts
const scrollViewStyle = computed(() => ({
  backgroundColor: readerStyle.value.backgroundColor,
}));

function applyReaderPageChrome() {
  const bg = readerStyle.value.backgroundColor;
  uni.setBackgroundColor({
    backgroundColor: bg,
    backgroundColorTop: bg,
    backgroundColorBottom: bg,
  });
  // 状态栏字色见问题 20：setNavigationBarColor({ frontColor })
}

watch(
  () => readerStyle.value.backgroundColor,
  () => applyReaderPageChrome(),
);

onReady(() => {
  // ...
  applyReaderPageChrome();
});

onShow(() => {
  applyReaderPageChrome();
});
```

### 关键代码（scroll-view + 安全区）

```vue
<scroll-view
  v-if="hasContent"
  scroll-y
  enhanced
  :bounces="false"
  class="reader-scroll"
  :style="scrollViewStyle"
  ...
/>

<view
  v-if="hasContent"
  class="reader-safe-bottom"
  :style="{ backgroundColor: readerStyle.backgroundColor }"
/>
```

```scss
.reader {
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

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

## 问题 11：去除头部右侧操作（目录 / 设置）

### 现象

顶栏右侧有目录、设置图标，与微信小程序胶囊按钮挤在一起；目录 / 主题 / 字体能力已下沉到底部操作栏，头栏入口重复。

### 思路

- 顶栏只保留返回 + 章节标题，去掉 `#right` 插槽
- 删除仅由头栏触发的「阅读设置」`wd-popup`（与底栏设置重复）
- 目录仍从底栏「目录」入口打开

### 关键变化

```vue
<!-- 之前 -->
<wd-navbar ...>
  <template #right>
    <view class="nav-actions">目录 / 设置</view>
  </template>
</wd-navbar>

<!-- 之后 -->
<wd-navbar :title="chapterTitle || bookTitle" left-arrow @click-left="goBack" />
```

---

## 问题 12：切换主题 / 字号 / 行距不即时生效，必须切章才变

### 现象

底栏改主题、字号、行距后，面板状态已更新，正文视觉不变；切到别的章节（或重新加载 HTML）后才生效。

### 根因

`mp-html` **只 watch `content`**：`tag-style` / `container-style` 变更不会触发 `setContent` 重解析。切章会换 HTML，顺带用上新样式，故看起来像「切章才生效」。

微信小程序上仅靠给 `mp-html` 换 `:key` 也不稳定，不能当唯一手段。

### 思路

1. 计算 `mpRenderKey`（颜色 + 字号 + 行距），绑到章节块 `:key`，必要时强制 remount
2. `watch` 主题 / 字号 / 行距，收集各章 `mp-html` 实例，调用 **`setContent(html)`** 按最新 `tagStyle` 重解析
3. 拿不到 ref 时降级：短暂 `mpHtmlMounted = false` 再挂回

### 关键代码（思路骨架）

```ts
const mpRenderKey = computed(
  () => `${readerStyle.value.color}-${fontSize.value}-${lineHeight.value}`,
);

function refreshMpHtmlStyles() {
  void nextTick(() => {
    for (const block of chapterBlocks.value) {
      const html = stripReaderColorStyles(block.html);
      if (html !== block.html) block.html = html;
      mpHtmlRefs.get(block.index)?.setContent?.(html);
    }
  });
}

watch(
  () => `${paperTheme.value}-${fontSize.value}-${lineHeight.value}`,
  () => refreshMpHtmlStyles(),
  { flush: "post" },
);
```

```vue
<view v-for="block in chapterBlocks" :key="`${block.index}-${mpRenderKey}`" class="chapter-block">
  <mp-html :content="block.html" :tag-style="mpTagStyle" ... />
</view>
```

---

## 问题 13：切换主题后字色不跟随（背景变了字还是黑）

### 现象

纸张背景已换（如夜间 / 绿色），正文仍是 EPUB 自带深色字，需切章后才像换色成功。

### 根因

EPUB 章节 HTML 大量带内联 `color` / `<font color>`。`mp-html` 解析时**内联样式覆盖 `tag-style` 默认色**，仅提高 `tag-style` 优先级不够时就会「背景变、字不变」。

### 思路

1. **内容侧**：`stripReaderColorStyles` 去掉 `color`、`background`、`background-color` 及 `<font color>`
2. **主题侧**：`mpTagStyle` 对 `p` / `div` / `span` 等写 `color: ... !important`
3. 换肤走问题 12 的 `setContent`，否则清洗后的 HTML 也不会立刻重渲染

### 关键代码（`reader-html.ts`，与问题 2 同源、侧重颜色）

```ts
export function stripReaderColorStyles(html: string): string {
  return html
    .replace(/<font\b([^>]*)\s+color\s*=\s*["'][^"']*["']([^>]*)>/gi, "<font$1$2>")
    .replace(/\s+color\s*=\s*["'][^"']*["']/gi, "");
  // …再剥 style 里的 color / background*
}
```

加载章节时：`html: stripReaderColorStyles(data.html)`；换肤时再次清洗再 `setContent`。

---

## 问题 14：底部操作栏字色不随主题变化

### 现象

切到夜间主题后，底栏背景变深，但「目录 / 主题 / 翻页 / 字体」标签仍近乎黑色，对比度极低。

### 根因

底栏只对 dark 做了背景特例（或固定浅灰底），**未绑定 `paperStyles[theme].fg`**；文字依赖 `color: inherit`，而祖先又没把主题字色传下来。

### 思路

- `chromeBarStyle`：背景用纸张色（带透明度），`color` 用对应 `fg`
- 页面根 `readerShellStyle` 同步 `color`
- `AppIcon` 等无法继承的图标显式传 `readerStyle.color`

```ts
const chromeBarStyle = computed(() => {
  const paper = paperStyles[paperTheme.value];
  return {
    color: paper.fg,
    backgroundColor: withAlpha(paper.bg),
  };
});
```

---

## 问题 15：正文被底部操作栏挡住；滚动条/内容滚进栏底

### 现象

底栏展开后，靠近屏幕底部的正文被盖住；滚到底时内容仍进到操作栏背后。

### 根因

1. 占位写在 `scroll-view` 的 `padding-bottom` 上：微信小程序里常常**不增加可滚内容高度**
2. 占位用固定 `200rpx / 360rpx`，与真实底栏高度（含子面板）对不齐

### 思路

- 把留白放到内部 `.reader-stream` 的 `paddingBottom`（px）
- 高度用实测 `chromeInsets.bottom`（来自 `.reader-chrome-bottom` 的 `windowHeight - top`）
- `watch([chromeVisible, bottomPanel])`，底栏动画结束后再 `measureChromeInsets`

```ts
const streamPaddingStyle = computed(() => {
  if (!chromeVisible.value) return {};
  const pad = chromeInsets.value.bottom || lastChromeBottom;
  return pad > 0 ? { paddingBottom: `${pad}px` } : {};
});
```

---

## 问题 16：字号 / 行距滑轨交互错乱（无法像 step 一样定位）

### 现象

早期左右半区「点一下减 / 加一档」易点偏；圆钮与轨道内 A/标签叠在一起；用户期望：**点击轨道某位置跳到对应档位，或拖动吸附到档位**。

### 思路

做成离散 step 滑轨：

| 控件 | 档位                                   |
| ---- | -------------------------------------- |
| 字号 | `14…28` 共 15 档                       |
| 行距 | `lineHeightOptions`（如 1.4～2.2）5 档 |

- 点击：`(localX / railWidth)` → `round` 到最近 index → `setFontStep` / `setLineStep`
- 拖动：`touchstart` / `touchmove` 同一套换算；拖动中关掉 thumb 的 `transition`
- 两侧 A 放到**轨道外**，避免挡住可点区域；行距右侧刻度「松」用 `pointer-events: none`

```ts
function resolveStepIndex(localX: number, railWidth: number, stepCount: number): number {
  const ratio = Math.min(1, Math.max(0, localX / railWidth));
  return Math.round(ratio * (stepCount - 1));
}
```

视觉迭代（标签在上方、细轨道）见 **问题 1**；本条侧重交互语义。

---

## 问题 17：阅读页右侧边距明显宽于左侧

### 现象

红框对比：左内边距窄、右内边距宽，正文块视觉上偏左。换肤、切章后仍常见。

### 根因（叠加）

1. EPUB 内联 `padding` / `margin` / `width` / `align` 不对称
2. 微信小程序里 `mp-html`/`rich-text` 段落常按行内或非整宽排，末行视觉上右侧留白更大
3. 曾只靠 `chapter-block { padding: 32rpx 40rpx }`，内层样式仍可打破左右对称
4. 系统滚动条若占用右侧视觉宽度，也会加重「右宽」观感

### 思路

1. 加载 / 换肤时用 `stripReaderColorStyles`（及必要时更激进的 layout 剥离）清掉干扰对齐与色值的内联样式
2. `mpTagStyle` 给 `p`/`div` 明确 `display:block;width:100%;box-sizing:border-box;padding:0`
3. **左右边距只由一层控制**：例如 `.reader-stream { padding-left/right: 40rpx }`，章节块不再各加一套水平 padding
4. `:show-scrollbar="false"`，并对 `._root` / `rich-text` 设 `width:100%`、`overflow-x:hidden`

### 注意

「两端对齐」后末行天然短于满行，不等于右边距变宽；验收时应以**满行**相对绿底边缘的左右空隙为准。

---

## 问题 18：再次点击目录图标无法关闭抽屉

### 现象

目录已打开时，再点底部工具栏「目录」只会再次打开（或无反应），无法像微信读书那样切换关闭。

### 思路

`openBottomPanel('toc')` 改成 toggle：

- 已打开且未在关闭动画中 → `closeToc()`
- 正在关闭动画中 → 忽略，防连点打断
- 已关闭 → 打开并复测 inset

### 关键代码

```ts
function openBottomPanel(panel: BottomPanel | "toc") {
  if (panel === "toc") {
    if (tocOpen.value && !tocClosing.value) {
      closeToc();
      return;
    }
    if (tocClosing.value) return;
    chromeVisible.value = true;
    bottomPanel.value = null;
    tocOpen.value = true;
    void nextTick(() => {
      measureChromeInsets();
      setTimeout(measureChromeInsets, 320);
    });
    return;
  }
  bottomPanel.value = bottomPanel.value === panel ? null : panel;
  void nextTick(() => measureChromeInsets());
}
```

---

## 问题 19：目录条目字体偏小

### 现象

目录抽屉内章节标题字号偏小，长列表不易扫读。

### 思路

调大 `.toc-item-text` 字号即可（与正文阅读字号无关，目录用独立字号）。

### 关键代码

```scss
.toc-item-text {
  display: block;
  font-size: 32rpx; /* 原 28rpx */
  line-height: 1.5;
  color: inherit;
  word-break: break-all;
}
```

---

## 问题 20：切换纸张主题后，状态栏时间 / 电量字色不随变

### 现象

选「夜间」后正文与底栏已是深色，但顶部系统状态栏（时间、电量）仍是深色字，对比度极低、几乎不可见。

### 根因

`applyReaderPageChrome` 只同步了窗口底色（`uni.setBackgroundColor`），未改状态栏文字色。自定义导航栏下需靠 `uni.setNavigationBarColor` 的 `frontColor`（仅允许 `#000000` / `#ffffff`）。

### 思路

换肤时按纸张主题写入 `frontColor`：夜间用白，其它纸张用黑；并在 `onReady` / `onShow` / `watch(paperTheme)` 时调用。

### 关键代码

```ts
function applyReaderPageChrome() {
  const bg = readerStyle.value.backgroundColor;
  const frontColor = paperTheme.value === "dark" ? "#ffffff" : "#000000";
  uni.setBackgroundColor({
    backgroundColor: bg,
    backgroundColorTop: bg,
    backgroundColorBottom: bg,
  });
  // 自定义导航栏下 frontColor 仅影响状态栏时间/电量等文字颜色
  uni.setNavigationBarColor({
    frontColor,
    backgroundColor: bg,
  });
}

watch(
  () => [readerStyle.value.backgroundColor, paperTheme.value] as const,
  () => applyReaderPageChrome(),
);
```

> 问题 10 中的 `applyReaderPageChrome` 示例以此处最终版为准。

---

## 问题 21：夜间主题下返回箭头与 navbar 标题仍是深色

### 现象

状态栏已可变浅，但 `wd-navbar` 左侧返回图标与中间 title 在深色纸张上仍接近黑/深紫，难辨认。

### 根因

组件标题与箭头**不继承**根节点 `color`，而使用 CSS 变量：

- 标题 / 箭头：`--wot-navbar-color`
- 左右文案：`--wot-navbar-desc-color`
- 背景：`--wot-navbar-bg`

只写 `custom-style: color: ...` 无效。

### 思路

`topBarStyle` 同步写入上述变量，取值与阅读字色 `readerStyle.color` 一致。

### 关键代码

```ts
const topBarStyle = computed(() => {
  const { backgroundColor, color } = readerStyle.value;
  return [
    `background-color:${backgroundColor}`,
    `color:${color}`,
    `--wot-navbar-bg:${backgroundColor}`,
    `--wot-navbar-color:${color}`,
    `--wot-navbar-desc-color:${color}`,
    `z-index:101`,
  ].join(";");
});
```

---

## 问题 22：顶部长标题被右侧胶囊遮挡

### 现象

章节 / 书名较长时，居中 title 右侧文字盖住微信小程序胶囊按钮（「…」圆点区域），无省略或留白不足。

### 根因

`wd-navbar` 默认 `.wd-navbar__title { max-width: 60% }` 且 `margin: 0 auto` 居中。在常见机型上，居中 60% 宽度块的右缘仍会伸进胶囊左侧。

### 思路

用 `uni.getMenuButtonBoundingClientRect()` 实测胶囊；对居中标题满足：

\[
\frac{W_{\text{screen}}}{2} + \frac{W_{\text{title}}}{2} \le menu.left - gap
\]

即 `W_title ≤ 2*(menu.left - gap) - windowWidth`，再与左侧返回区约束取小，设到 `:deep(.wd-navbar__title) { max-width }`，并保留 ellipsis。

### 关键代码

```ts
const navbarTitleMaxWidth = ref("48%");

function measureNavbarTitleMaxWidth() {
  try {
    const { windowWidth } = uni.getWindowInfo();
    const menu = uni.getMenuButtonBoundingClientRect();
    if (!(windowWidth > 0) || !(menu.left > 0)) return;
    const gap = 8;
    const leftReserve = 88; // 返回箭头区域
    const byCapsule = 2 * (menu.left - gap) - windowWidth;
    const byLeft = windowWidth - 2 * leftReserve;
    const maxW = Math.max(Math.min(byCapsule, byLeft), 120);
    navbarTitleMaxWidth.value = `${Math.floor(maxW)}px`;
  } catch {
    // ponytail: H5/非微信环境保持百分比兜底
  }
}

// onReady 中调用 measureNavbarTitleMaxWidth()
```

```scss
.reader-top :deep(.wd-navbar__title) {
  max-width: v-bind(navbarTitleMaxWidth);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box;
}
```

---

## 问题 23：换肤 / 改字号不收起操作栏，手动滑动才收起

### 现象

产品期望：

| 操作                           | 期望                   |
| ------------------------------ | ---------------------- |
| 手动上下滑动正文               | **立即**收起底部操作栏 |
| 切换纸张主题 / 拖字号 / 改行距 | **不要**自动收起操作栏 |

若不加区分，一点主题或滑字号，底栏就会马上消失（换肤触发的伪滚动被当成用户滑动）。

### 根因

改主题 / 字号 / 行距会走 `refreshMpHtmlStyles` → `setContent`（或 remount），正文重排会校正 `scroll-view` 的 `scrollTop`，连续触发 `@scroll`。原先逻辑是「`scrollTop` 变化 ≥ 10px 就 `hideBottomChrome()`」，无法区分**重排伪滚动**与**用户滑动**。

仅换夜间等颜色、字号不变时，`scrollHeight` 也几乎不变，不能单靠高度差分判断。

### 踩过的失败路径（勿再引入）

| 方案                                | 为何不够                                            |
| ----------------------------------- | --------------------------------------------------- |
| 子面板打开时一律不收起              | 面板打开时手动滑也不隐藏                            |
| 纯时间窗抑制（400–600ms）           | 过短：重排未完又收起；过长：滑动无响应              |
| 依赖 `scrollHeight` 变化            | 仅换颜色时高度几乎不变，仍会因 scrollTop 抖动而收起 |
| 只绑 `scroll-view` 的 `@touchstart` | 微信里不稳定                                        |
| 只依赖 `enhanced` 的 `@dragstart`   | 真机不稳定，滑动侧易失效                            |

### 最终思路：样式重排护栏 + 触达正文立刻解除

1. **换肤 / 改字号 / 改行距**（以及底栏展开导致 `padding` 变化）时调用 `armChromeScrollGuard()`
2. 护栏开启期间：`onScroll` **只同步** `lastScrollTopForChrome`，**不**调用 `hideBottomChrome`；每次伪滚动重置约 320ms 静默计时
3. 手指 `touchstart` 点到正文（`scroll-view` / `reader-stream`）：`releaseChromeScrollGuard()`，之后滑动位移 ≥ 10px 立即收起
4. 伪滚动停稳约 320ms 后自动解除护栏

### 关键代码（与当前 `index.vue` 一致）

模板：

```vue
<scroll-view ... @scroll="onScroll" @touchstart="releaseChromeScrollGuard">
  <view
    class="reader-stream"
    :style="streamPaddingStyle"
    @touchstart="releaseChromeScrollGuard"
    @tap="toggleChrome"
  >
    ...
  </view>
</scroll-view>
```

逻辑：

```ts
let lastScrollTopForChrome = 0;
const SCROLL_HIDE_CHROME_PX = 10;

/**
 * 样式重排护栏：换主题/字号时 setContent 会冒伪 scroll。
 * - 护栏开启：只同步 scrollTop，不收起操作栏
 * - 手指 touchstart 点到正文：立刻解除，随后滑动可立即收起
 * - 伪滚动停稳约 320ms 后自动解除
 */
let chromeScrollGuard = false;
let chromeScrollGuardTimer: ReturnType<typeof setTimeout> | null = null;

function armChromeScrollGuard() {
  chromeScrollGuard = true;
  bumpChromeScrollGuardSettle();
}

function bumpChromeScrollGuardSettle() {
  if (chromeScrollGuardTimer) clearTimeout(chromeScrollGuardTimer);
  chromeScrollGuardTimer = setTimeout(() => {
    chromeScrollGuard = false;
    chromeScrollGuardTimer = null;
    lastScrollTopForChrome = currentScrollTop.value;
  }, 320);
}

function releaseChromeScrollGuard() {
  if (!chromeScrollGuard && !chromeScrollGuardTimer) return;
  chromeScrollGuard = false;
  if (chromeScrollGuardTimer) {
    clearTimeout(chromeScrollGuardTimer);
    chromeScrollGuardTimer = null;
  }
}

function onScroll(e: { detail: { scrollTop: number; scrollHeight: number } }) {
  const { scrollTop: top, scrollHeight: height } = e.detail;

  if (chromeScrollGuard) {
    lastScrollTopForChrome = top;
    bumpChromeScrollGuardSettle();
  } else if (
    chromeVisible.value &&
    Math.abs(top - lastScrollTopForChrome) >= SCROLL_HIDE_CHROME_PX
  ) {
    hideBottomChrome();
    lastScrollTopForChrome = top;
  } else {
    lastScrollTopForChrome = top;
  }

  currentScrollTop.value = top;
  scrollHeight.value = height;
  // ... 章节定位 / 预加载不变
}

function refreshMpHtmlStyles() {
  armChromeScrollGuard();
  // ... setContent / remount
}

watch([chromeVisible, bottomPanel, tocOpen], () => {
  if (chromeVisible.value) armChromeScrollGuard(); // 底栏 padding 变化同样会冒伪 scroll
  // ... measureChromeInsets
});
```

### 验收要点

- [ ] 打开主题面板点色块 → 操作栏保持
- [ ] 拖字号 / 行距 → 操作栏保持
- [ ] 设置后手指滑正文 → 操作栏马上隐藏
- [ ] 仅露出工具栏（无子面板）时滑动 → 仍自动隐藏

---

## 关闭目录能力矩阵（最终）

| 入口                          | 方式                                             |
| ----------------------------- | ------------------------------------------------ |
| 底部工具栏「目录」图标        | 已打开时再点 → `closeToc()`（toggle）            |
| 抽屉顶栏 handle               | `@tap` 点击；下滑 > 40px                         |
| 顶部导航区域                  | `@tap`；下滑 > 40px                              |
| 左上角返回                    | `goBack`：目录开着则先关闭                       |
| 隐藏底部栏 / 点正文收起操作栏 | `hideBottomChrome` / `toggleChrome` → `closeToc` |
| 跳章                          | `openAtChapter` → `closeToc`                     |

---

## 验收清单

- [ ] 字体 / 行距滑块：标签在上方，轨道细、圆钮可拖；点击轨道可跳档、拖动可吸附
- [ ] 正文两端对齐，换「绿色 / 夜间」主题后仍保持
- [ ] Header 始终可见、无右侧目录/设置；底部栏默认隐藏，点正文切换，滚动收起；显隐有过渡动画
- [ ] 切换主题 / 字号 / 行距后正文样式**立即**生效（无需切章）
- [ ] 切换主题 / 字号 / 行距时操作栏**不**自动收起；手指滑正文后立即收起
- [ ] 夜间等主题下底栏标签 / 图标字色可读
- [ ] 夜间主题下：状态栏时间电量、返回箭头、navbar 标题均为浅色
- [ ] 浅色纸张下：状态栏与 navbar 标题 / 返回为深色
- [ ] 长标题不被胶囊遮挡，超出部分省略号截断
- [ ] 底栏展开时正文不被挡，滚到底停在栏上方
- [ ] 正文左右内边距视觉一致（比满行相对纸张边缘）
- [ ] 目录为全宽底部抽屉，无半透明遮罩；条目字号约 `32rpx`
- [ ] 点顶栏 / handle / 返回键可关目录；handle 区域足够大
- [ ] 目录已打开时再点「目录」图标可关闭（带关闭动画）
- [ ] 关目录有向下滑出动画（约 280ms）
- [ ] 上下用力拖动时，顶底不露白底（需在真机 iOS 复验）
- [ ] 切换纸张主题后窗口底色即时同步

---

## 已知约束

1. **胶囊按钮**无法在小程序侧隐藏；标题只能避让缩宽，不能盖住或改样式
2. `setNavigationBarColor.frontColor` 仅允许 `#000000` / `#ffffff`，无法做中间灰
3. `enhanced` / `bounces` 依赖基础库能力；安卓表现可能与 iOS 不完全一致
4. `uni.setBackgroundColor` 是窗口级 API，退出阅读页后其他页应用自己的 `applyPageChrome`（见 `useTheme.ts`）覆盖回去
5. 目录列表高度依赖实测 inset；设备旋转或分栏场景若未复测可能短一截，可在 `onResize` 再测（标题 max-width 同理建议复测）
6. `mp-html` 不监听 `tag-style`：换肤必须 `setContent` 或可靠 remount（问题 12）
7. 过度剥离 EPUB `style` 可能丢掉合理版式（图片 float 等）；优先剥颜色 / 对齐 / 横向 padding，再按书目加严
8. 操作栏「护栏」依赖正文 `touchstart` 解除（问题 23）；若个别机型触达不到正文层，可再叠加其它手势释放入口
