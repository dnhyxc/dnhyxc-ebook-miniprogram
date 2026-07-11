# TabBar 视觉样式与图标/文字配色

本文档说明 TabBar **边框与阴影**、**背景与页面同色**、**选中/未选中图标文字色**及**主题切换后颜色错乱**的处理方案。

---

## 1. 背景与页面同色

### 实现思路

TabBar 不是独立「卡片」，应与 `--bg-page` 融为一体。

`presets.ts`：

```typescript
tabbarBg: palette.bgPage,
```

`AppTabbar.vue`：

```typescript
const tabbarBg = computed(
  () => themeVars.value.tabbarBg ?? themeVars.value.filledBottom ?? "#bfd1b2",
);
```

`tabbarStyle` 与铺底视图均使用 `tabbarBg`（见 [tabbar-layout-scroll-safe-area.md](./tabbar-layout-scroll-safe-area.md)）。

---

## 2. 边框与上阴影

### 问题

wot-ui 默认 `bordered` 使用 `halfPixelBorder('top')`，灰色硬边过于明显，且无法跟随主题 `--border`。

### 实现思路

- 去掉 `wd-tabbar` 的 `bordered` 属性
- 在 `custom-style` 中自定义顶边线与向上阴影
- 边框用主题 `borderMain` 的半透明（对应 spec `--border-light`）
- 阴影用 `textMain` 墨色低透明度（暗色主题用黑色阴影）

```typescript
const tabbarBorderColor = computed(() => {
  const border = themeVars.value.borderMain ?? "#93bdad";
  return rgbaHex(border, theme.value === "dark" ? 0.35 : 0.5);
});

const tabbarShadow = computed(() => {
  const ink = themeVars.value.textMain ?? "#2e201d";
  if (theme.value === "dark") return "0 -2px 8px rgba(0, 0, 0, 0.18)";
  return `0 -2px 8px ${rgbaHex(ink, 0.06)}`;
});

const tabbarStyle = computed(
  () =>
    `background-color:${tabbarBg.value};` +
    `border-top:0.5px solid ${tabbarBorderColor.value};` +
    `box-shadow:${tabbarShadow.value};`,
);
```

| 属性   | 浅色主题            | 暗色主题            |
| ------ | ------------------- | ------------------- |
| 顶边框 | `border` @ 50% 透明 | `border` @ 35% 透明 |
| 阴影   | 墨色 6% 向上 8px    | 黑色 18% 向上 8px   |

---

## 3. 图标与文字选中色

### 问题：切换主题后选中/未选中颜色错乱

#### 现象

- 选中 Tab：图标深色，文字浅灰（或相反）
- 未选中 Tab：图标与文字不一致
- 切换主题后更明显

#### 根因

| 原因                | 说明                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------- |
| 双通道配色          | 图标用 `themeVars` hex；文字用 `var(--wot-primary-6)` 等 CSS 变量，更新不同步             |
| wot 默认非激活色    | SCSS 默认 `tabbar-item-color-inactive` _fallback 为 `text-main`，非 `text-auxiliary`      |
| `primary6` 语义误用 | `presets` 中 `primary6 = inkPrimary`，曾被当作「主色强调」给激活徽章，浅色底+白字对比度差 |
| vu-icons mask       | 主题切换后 mask 色偶尔不刷新                                                              |

#### 解决方案

**① 单一色源** — 图标与文字共用 computed hex：

```typescript
const activeTabColor = computed(
  () => themeVars.value.tabbarItemColorActive ?? themeVars.value.textMain ?? "#2e201d",
);
const inactiveTabColor = computed(
  () => themeVars.value.tabbarItemColorInactive ?? themeVars.value.textAuxiliary ?? "#576470",
);
```

**② 绑定到 wd-tabbar**（不用 CSS 变量字符串）：

```vue
<wd-tabbar
  :active-color="activeTabColor"
  :inactive-color="inactiveTabColor"
>
```

**③ presets 增加 Tab 专用变量**：

```typescript
tabbarItemColorActive: palette.inkPrimary,
tabbarItemColorInactive: palette.inkTertiary,
```

**④ 覆盖 wot 标题 class 颜色**：

```scss
:deep(.app-tabbar-item .wd-tabbar-item__body-title.is-active) {
  color: v-bind(activeTabColor) !important;
}
:deep(.app-tabbar-item .wd-tabbar-item__body-title.is-inactive) {
  color: v-bind(inactiveTabColor) !important;
}
```

**⑤ 图标同色传入**：

```vue
<AppIcon :color="active ? activeTabColor : inactiveTabColor" />
```

**⑥ 主题切换时重建 Tab 项** — `key` 放在 `v-for` 元素上，勿放在 slot 内子组件：

```vue
<wd-tabbar-item
  v-for="item in tabbarItems"
  :key="`${backgroundThemeId}-${item.name}`"
>
```

### 问题：编译报错 `key should be placed on the <template> tag`

#### 现象

```
[plugin:vite:vue] <template v-for> key should be placed on the <template> tag.
AppIcon :key="..."  // 在 #icon 插槽内
```

#### 解决方案

将 `:key` 从插槽内 `AppIcon` 移到外层 `wd-tabbar-item`（见上），既消除编译错误，又能在换主题时重建项。

---

## 4. Tab 切换逻辑（颜色相关）

`useTabbar.ts` 使用 `:model-value` 单向绑定，**禁止** `v-model`（会导致 `handleChange` 提前 return，无法 `switchTab`）。

切换前调用 `applyPageChrome()`，减轻窗口背景闪色。

---

## 5. 相关文件

| 文件                           | 职责                             |
| ------------------------------ | -------------------------------- |
| `src/components/AppTabbar.vue` | 样式、颜色、安全区               |
| `src/theme/presets.ts`         | `tabbarBg`、`tabbarItemColor*`   |
| `src/hooks/useTabbar.ts`       | 选中态与 switchTab               |
| `src/hooks/useTheme.ts`        | `backgroundThemeId`、`themeVars` |

---

## 6. 延伸阅读

- [vu-icons-integration.md](./vu-icons-integration.md) — 图标 mask 与 easycom
- [tabbar-layout-scroll-safe-area.md](./tabbar-layout-scroll-safe-area.md) — 滚动与白底
- [theme-presets-and-chrome.md](./theme-presets-and-chrome.md) — 主题变量语义
