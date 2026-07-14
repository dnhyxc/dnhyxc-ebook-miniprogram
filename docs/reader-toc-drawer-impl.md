# 阅读页目录底部抽屉（实现思路）

> **状态**：已采纳  
> **关联文件**：`src/pages/reader/index.vue`  
> **来源会话**：[EPUB 阅读与操作栏](8b499fc2-b71a-4661-a818-13e365c53986)、[阅读 UI 迭代](478d2163-8768-4eb5-8e66-d25230844f76)

---

## 1. 需求背景（必填）

目录从左侧 `wd-popup`（约 75vw）改为微信读书式**全宽底部 sheet**：夹在顶部 Header 与底部操作栏之间，从底部滑入；无半透明遮罩；支持点 Header、点 handle、下滑手势、返回键、再次点「目录」关闭；关闭要有向下滑出过渡。过程中还修过间隙、空白过高、手势与 tap 冲突、字体偏小等问题。

---

## 2. 用户需求与 Agent 问答（必填）

### 2.1 夹在 Header 与底栏之间

**用户：**

> 目录不要占满整个屏幕高度，需要出现在顶部 header 和 底部操作栏之间

**已落地方案：** 自测 `chromeInsets.top/bottom`，sheet 的 `top`/`bottom` 动态贴齐。

### 2.2 全宽 + 底部划出 + 点头/下滑关闭

**用户：**

> 目录是否能占满整个屏幕宽度，与微信读书的目录一样，点击头部或者点击头部向下滑动关闭目录抽屉。同时抽屉的开启方式要改为从底部划出

### 2.3 不要底部遮罩

**用户：**

> 开启目录时，不要底部遮罩

**已采纳：** 移除 `toc-mask`。

### 2.4 关闭手势失效再修复

**用户：**

> 点击、向下滑动都无法关闭目录抽屉了，你参考微信读书的这部分处理逻辑进行改动

**根因：** handle 上 `.stop` 拦截 touch，阻碍小程序生成 `tap`。  
**已采纳：** tap 关闭 + touchstart/touchend 判下滑，不 catch/stop 拦截。

### 2.5 关闭过渡

**用户：**

> 目录关闭时没有过渡效果

**已采纳：** `tocClosing` + `toc-slide-down`，动画结束后再卸 `tocOpen`。

### 2.6 再次点目录图标关闭

**用户：**

> 如果目录开启了，再次点击目录图标也同样需要关闭目录抽屉

### 2.7 目录字体加大

**用户：**

> 目录字体需要调大一些

---

## 3. 实现思路（必填）

### 3.1 总体策略

不用 `wd-popup`，改为自绘 `toc-sheet`：`position:fixed`，纵向夹在实测顶/底 inset 之间；高度用 `liveWindowHeight()` 现取，避免缓存默认 667 导致大片空白。关闭走「先播放退出动画 → 再卸载」两段式。

### 3.2 关闭能力矩阵（最终）

| 操作                    | 行为                               |
| ----------------------- | ---------------------------------- |
| 点 Header               | `onReaderTopTap` → `closeToc`      |
| Header 下滑 >40px       | `onTocHeaderTouchEnd`              |
| 点 handle / handle 下滑 | tap + touchend                     |
| 点底栏「目录」且已开    | `openBottomPanel('toc')` 内 toggle |
| 点 navbar 返回且目录开  | `goBack` 先关目录                  |
| 遮罩点击                | （无遮罩，不适用）                 |

### 3.3 尺寸

`tocScrollHeight = liveWindowHeight - topInset - bottomInset - TOC_HANDLE_HEIGHT(64)`。

---

## 4. 改动点对比：改前 / 改后（必填）

### 4.1 改动点：左侧 popup → 底部 sheet

- **位置**：`src/pages/reader/index.vue` 模板目录区（约第 226–260 行）
- **差异摘要**：全宽、无遮罩、高度夹在 chrome 之间。

#### 改动前

```vue
<!-- 左侧 75vw 全屏高度弹层 -->
<wd-popup v-model="tocOpen" position="left" custom-style="width: 75vw; height: 100vh;">
  <view class="toc-panel">
    <text class="toc-title">目录</text>
    <scroll-view scroll-y class="toc-scroll">
      <view
        v-for="item in toc"
        :key="`${item.href}-${item.level}`"
        class="toc-item"
        :class="{ active: item.index === chapterIndex }"
        :style="{ paddingLeft: `${24 + item.level * 24}rpx` }"
        @click="goChapter(item.index)"
      >
        {{ item.title || `第 ${item.index + 1} 章` }}
      </view>
    </scroll-view>
  </view>
</wd-popup>
```

#### 改动后

```vue
<!-- 仅 tocOpen 时挂载；关闭动画期仍保留至定时结束 -->
<view
  v-if="hasContent && tocOpen"
  class="toc-sheet"
  :class="{
    'toc-sheet--dark': paperTheme === 'dark',
    'toc-sheet--closing': tocClosing,
  }"
  :style="tocSheetStyle"
>
  <!-- 加高可点区域的拖拽条 -->
  <view
    class="toc-handle"
    @tap="closeToc"
    @touchstart="onTocHandleTouchStart"
    @touchend="onTocHandleTouchEnd"
  >
    <view class="toc-handle-bar" />
  </view>
  <!-- 高度用计算值，避免底部大片空白 -->
  <scroll-view scroll-y class="toc-scroll" :style="{ height: `${tocScrollHeight}px` }">
    <view
      v-for="item in toc"
      :key="item.index"
      class="toc-item"
      :class="{ active: item.index === chapterIndex }"
      :style="{ paddingLeft: `${24 + item.level * 24}rpx` }"
      @click="goChapter(item.index)"
    >
      <text class="toc-item-text">{{ item.title || `第 ${item.index + 1} 章` }}</text>
    </view>
  </scroll-view>
</view>
```

### 4.2 改动点：尺寸与贴齐

- **位置**：`tocSheetStyle` / `tocScrollHeight` / `bottomChromeInset`（约第 387–415 行）
- **差异摘要：** 用实时 windowHeight + 实测 inset，底栏可见或目录开时保留 bottom。

#### 改动前

```ts
// popup 写死 100vh，不测顶底 chrome
// scroll-view 高度常依赖错误的默认 windowHeight=667
```

#### 改动后

```ts
// 底栏不可见且目录关闭时不占底部 inset
const bottomChromeInset = computed(() => {
  if (!chromeVisible.value && !tocOpen.value) return 0;
  // 实测优先，其次上次值，再兜底 72
  return chromeInsets.value.bottom || lastChromeBottom || TOOLBAR_INSET_FALLBACK;
});

// 每次计算现取窗口高度，避免缓存陈旧
function liveWindowHeight(): number {
  try {
    const { windowHeight: h } = uni.getWindowInfo();
    if (h > 0) return h;
  } catch {
    // ponytail: 降级用缓存值
  }
  return windowHeight.value || 667;
}

// 列表可视高度 = 全高 - 顶 - 底 - handle
const tocScrollHeight = computed(() => {
  const top = chromeInsets.value.top || 88;
  const bottom = bottomChromeInset.value;
  return Math.max(liveWindowHeight() - top - bottom - TOC_HANDLE_HEIGHT, 120);
});

// sheet 贴齐顶底 chrome，背景跟随纸张
const tocSheetStyle = computed(() => ({
  top: `${chromeInsets.value.top}px`,
  bottom: `${bottomChromeInset.value}px`,
  backgroundColor: readerStyle.value.backgroundColor,
  color: readerStyle.value.color,
}));
```

### 4.3 改动点：关闭动画与手势

- **位置**：`closeToc` / Header·handle touch（约第 693–752 行）
- **差异摘要：** 两段式关闭；下滑阈值 40px；不 `.stop` 挡 tap。

#### 改动前

```ts
// 直接 tocOpen=false，无退出动画
function closeToc() {
  tocOpen.value = false;
}
```

#### 改动后

```ts
// 下滑关闭阈值（px）
const TOC_SWIPE_CLOSE_PX = 40;
// 与 CSS 动画时长对齐
const TOC_ANIM_MS = 280;

// 先进入 closing，播完再卸载
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

// 点顶部导航区域关目录
function onReaderTopTap() {
  if (tocOpen.value && !tocClosing.value) closeToc();
}

// Header 上记录起点
function onTocHeaderTouchStart(e: TouchEvent) {
  if (!tocOpen.value) return;
  tocHeaderStartY = e.touches[0]?.clientY ?? 0;
}

// Header 下滑超过阈值则关闭
function onTocHeaderTouchEnd(e: TouchEvent) {
  if (!tocOpen.value || !tocHeaderStartY) {
    tocHeaderStartY = 0;
    return;
  }
  const endY = e.changedTouches[0]?.clientY ?? 0;
  if (endY - tocHeaderStartY > TOC_SWIPE_CLOSE_PX) closeToc();
  tocHeaderStartY = 0;
}
```

### 4.4 改动点：目录按钮 toggle

- **位置**：`openBottomPanel`（约第 634–648 行）
- **差异摘要：** 已打开再点「目录」走 `closeToc`。

#### 改动前

```ts
// 旧逻辑：navbar 上 tocOpen = true，无二次点击关闭
```

#### 改动后

```ts
function openBottomPanel(panel: BottomPanel | "toc") {
  if (panel === "toc") {
    // 已打开且非关闭动画中 → 关闭
    if (tocOpen.value && !tocClosing.value) {
      closeToc();
      return;
    }
    // 关闭动画进行中忽略，防抖动
    if (tocClosing.value) return;
    // 打开时保证底栏在，便于贴齐
    chromeVisible.value = true;
    bottomPanel.value = null;
    tocOpen.value = true;
    void nextTick(() => {
      measureChromeInsets();
      setTimeout(measureChromeInsets, 320);
    });
    return;
  }
  // 其它面板：同项再点则收起
  bottomPanel.value = bottomPanel.value === panel ? null : panel;
}
```

---

## 5. 验证要点（建议）

- [ ] 打开目录：全宽、顶贴 Header 底、底贴操作栏、无遮罩、无顶阴影大间隙
- [ ] 点 Header / handle / 下滑 / 再点目录 / 返回：均可关闭且有下滑动画
- [ ] 目录列表可滚动，不被底栏挡住
- [ ] 目录字号可读（`toc-item-text`）

---

## 6. 影响分析（必填，放在文档最后）

### 6.1 结论

- **是否影响已有功能点**：是 — 目录交互与布局整体替换。
- **是否影响既有正常逻辑**：局部影响 — 依赖底栏 `chromeVisible` 与 inset 测量；返回键在目录打开时先关目录。

### 6.2 影响点明细

| #   | 影响对象 | 影响方式           | 程度 | 说明与回归建议               |
| --- | -------- | ------------------ | ---- | ---------------------------- |
| 1   | 目录入口 | navbar → 底栏      | 高   | 确认旧右侧图标已不存在       |
| 2   | 返回键   | 目录开时不立刻出页 | 中   | 开目录后点返回应只关目录     |
| 3   | 底栏显隐 | 开目录强制显示底栏 | 中   | 关目录后可再点正文收栏       |
| 4   | 遮罩     | 已移除             | 低   | 确认不能点遮罩关闭（无遮罩） |

### 6.3 调用面 / 波及说明

目录逻辑全部在 `pages/reader/index.vue`；无跨页组件复用。与「底部操作栏」「页面 Chrome」文档共享 inset 测量，回归时建议三块一起测。
