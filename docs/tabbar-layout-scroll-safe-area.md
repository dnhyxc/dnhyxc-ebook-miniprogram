# TabBar 布局：滚动区域、白底与安全区

本文档说明 Tab 页**滚动条滚到工具栏下方**、**上滑露出白色背景**等布局问题的根因与解决方案。

---

## 1. 标准 Tab 页结构

```
wd-config-provider
└── page-container.with-tabbar（pageShellStyle 背景）
    ├── AppNavbar
    ├── ShelfCategoryRail（书架可选）
    ├── scroll-view.page-scroll（flex:1，唯一滚动区）
    └── AppTabbar（fixed，在 scroll-view 外）
```

```css
.page-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.page-scroll {
  flex: 1;
  height: 0;
}
```

TabBar 放在 `scroll-view` **外部**，避免微信里 `position: fixed` 随页面滚动「飘起来」。

---

## 2. 问题 A：滚动条滚到 TabBar 下面

### 现象

`scroll-view` 可视高度延伸到屏幕最底部，固定 TabBar 叠在上面，滚动条/内容进入工具栏区域。

### 根因

- `scroll-view` 使用 `flex: 1` 占满 `page-container` 全部高度
- `wd-tabbar` 的 `fixed` 脱离文档流，不占布局空间

### 解决方案

用 **`padding-bottom` 收窄** `page-container` 的可布局高度，使 `scroll-view` 在 TabBar 上方结束。

**① 布局变量** — `src/theme/variables.scss`：

```scss
@mixin app-layout-vars {
  --wot-tabbar-height: 50px;
  --app-tabbar-inset: calc(var(--wot-tabbar-height) + env(safe-area-inset-bottom));
}
```

**② 全局样式** — `src/App.vue`：

```scss
.page-container.with-tabbar {
  height: 100vh;
  box-sizing: border-box;
  padding-bottom: var(--app-tabbar-inset);
  overflow: hidden;
}
```

**③ Tab 页标记** — 书架 / 我的 / 首页模板：

```vue
<view class="page-container with-tabbar" :style="pageShellStyle">
```

**④ 内容区 padding 去重** — `.page` 底部只需内容间距，不再叠加 TabBar 高度：

```css
/* 书架示例 */
.page {
  padding: 16rpx 32rpx 32rpx;
}
```

原先写法（已废弃，会与 `with-tabbar` 重复计算）：

```css
padding: 16rpx 32rpx calc(64rpx + var(--wot-tabbar-height) + env(safe-area-inset-bottom));
```

---

## 3. 问题 B：上滑时底部出现白色背景

### 现象

在 iPhone 等设备上，向上滑动或回弹时，TabBar 下方或安全区露出**白色条**（常与 Home 指示条重叠）。

### 根因（多重）

| 原因            | 说明                                                                           |
| --------------- | ------------------------------------------------------------------------------ |
| 原生页面回弹    | 页面级滚动露出 `pages.json` 默认 `backgroundColor: #F5F5F5`                    |
| TabBar 背景透明 | 曾对 `.app-tabbar` 设置 `background-color: inherit`，安全区 padding 区域无底色 |
| 安全区未铺色    | Home 指示条区域需单独视图铺 `tabbarBg`                                         |

### 解决方案

**① 禁用 Tab 页原生滚动** — `src/pages.json`：

```json
{
  "path": "pages/shelf/index",
  "style": {
    "navigationStyle": "custom",
    "disableScroll": true
  }
}
```

书架、我的页均设置 `disableScroll: true`，只让内部 `scroll-view` 滚动。

**② 窗口底色随主题** — `applyPageChrome()`（`useTheme.ts`）：

```typescript
uni.setBackgroundColor({
  backgroundColor: colors.backgroundColor,
  backgroundColorTop: colors.backgroundColorTop,
  backgroundColorBottom: colors.backgroundColorBottom,
});
```

**③ TabBar 与安全区显式铺色** — `AppTabbar.vue`：

```vue
<view class="app-tabbar-wrap">
  <wd-tabbar ... :custom-style="tabbarStyle" safe-area-inset-bottom />
  <view class="app-tabbar-safe" :style="{ backgroundColor: tabbarBg }" />
</view>
```

```scss
.app-tabbar-wrap {
  background-color: v-bind(tabbarBg);
}
:deep(.app-tabbar.wd-tabbar) {
  background-color: v-bind(tabbarBg) !important;
}
.app-tabbar-safe {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 501;
  height: env(safe-area-inset-bottom);
}
```

**切勿**对 TabBar 使用 `background-color: inherit`（父级无底色时安全区会透明白底）。

---

## 4. 问题 C：切换 Tab 时底部菜单「飘起来」

### 根因

TabBar 放在 `scroll-view` 内部，或使用了不当的 `placeholder` 与页面原生滚动并存。

### 解决方案

- TabBar 始终在 `scroll-view` 外（见第 1 节）
- 不使用 `wd-tabbar` 的 `placeholder`（与 `safe-area-inset-bottom` 易叠加出多余空白）
- 参考 [tabbar-and-theme.md](./tabbar-and-theme.md) 历史问题汇总

---

## 5. 调试检查清单

- [ ] Tab 页 `page-container` 是否带 `with-tabbar`
- [ ] `pages.json` 是否 `disableScroll: true`（改后需重启编译）
- [ ] `applyPageChrome` 是否在 `onShow` / 切 Tab 前调用
- [ ] TabBar 是否去掉 `inherit` 背景，改用 `tabbarBg`
- [ ] `.page` 底部 padding 是否未重复计算 TabBar 高度

---

## 6. 相关文件

| 文件                           | 职责                                   |
| ------------------------------ | -------------------------------------- |
| `src/App.vue`                  | `.page-container.with-tabbar` 全局布局 |
| `src/theme/variables.scss`     | `--app-tabbar-inset`                   |
| `src/pages.json`               | `disableScroll`                        |
| `src/components/AppTabbar.vue` | 固定底栏 + 安全区铺底                  |
| `src/hooks/useTheme.ts`        | `applyPageChrome`                      |

---

## 7. 延伸阅读

- [tabbar-style-and-icon-colors.md](./tabbar-style-and-icon-colors.md) — 边框、阴影、图标色
- [tabbar-and-theme.md](./tabbar-and-theme.md) — 早期 TabBar 问题归档
