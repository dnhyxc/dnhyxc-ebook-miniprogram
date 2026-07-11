# 十套背景主题与页面 Chrome 实现

本文档说明小程序**背景主题系统**的实现思路、数据源、与 `spec/` 的对应关系，以及 Header / 窗口配色的处理原则。

---

## 1. 实现目标

| 目标               | 说明                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------ |
| 十套中式传统色主题 | 与 `spec/chinese-color-10themes.md`、`spec/theme-ui.md`、`spec/theme-color1.md` 对齐 |
| 全站同步           | 书架、我的等 Tab 页背景、文字、按钮、边框随主题切换                                  |
| Header 与页面同色  | 导航栏使用 `--bg-page`（`filledBottom`），**不用**预览里的 `--primary` 色做顶栏      |
| TabBar 与页面同色  | `tabbarBg` 映射为 `palette.bgPage`，底部工具栏融入页面背景                           |
| 原生窗口不闪白     | 通过 `applyPageChrome` 同步微信窗口/状态栏底色                                       |

---

## 2. 架构与数据流

```
用户在「我的」选择主题
    → setBackgroundTheme(id)
    → backgroundThemeId（模块级 ref，持久化 localStorage）
    → presets.ts 中对应 preset
    → themeVars 注入 wd-config-provider
    → pageShellStyle / navbarStyle / tabbarBg 等响应式更新
    → applyPageChrome() 更新 uni 窗口色
```

**单一数据源**：`src/theme/presets.ts` 的 `backgroundThemePresets`，新增主题只改此文件。

---

## 3. 预设结构

每个 `BackgroundThemePreset` 包含：

```typescript
export interface BackgroundThemePreset {
  id: BackgroundThemeId;
  name: string;
  subtitle: string;
  color: string; // 色块预览
  mode: "light" | "dark"; // wot ConfigProvider 模式
  themeVars: ConfigProviderThemeVars;
  pageChrome: {
    frontColor: "#000000" | "#ffffff";
    backgroundColor: string;
    backgroundColorTop: string;
    backgroundColorBottom: string;
  };
}
```

### 3.1 palette → themeVars 映射（核心字段）

| spec 变量         | presets 字段   | wot themeVars                              |
| ----------------- | -------------- | ------------------------------------------ |
| `--bg-page`       | `bgPage`       | `filledBottom`、`tabbarBg`                 |
| `--bg-card`       | `bgCard`       | `filledContent`                            |
| `--bg-elevated`   | `bgElevated`   | `filledOppo`                               |
| `--ink-primary`   | `inkPrimary`   | `textMain`、`tabbarItemColorActive`        |
| `--ink-secondary` | `inkSecondary` | `textSecondary`                            |
| `--ink-tertiary`  | `inkTertiary`  | `textAuxiliary`、`tabbarItemColorInactive` |
| `--border`        | `border`       | `borderMain`                               |
| `--border-light`  | 计算值         | `borderLight`                              |
| `--divider`       | 计算值         | `dividerMain`、`dividerLight`              |
| `--accent`        | `accent`       | `buttonPrimaryBg/Color`                    |
| `--accent-light`  | 计算值         | `buttonPrimarySoftBg`                      |

`createTheme` 中的关键片段：

```typescript
themeVars: {
  filledBottom: palette.bgPage,
  filledOppo: palette.bgElevated,
  filledContent: palette.bgCard,
  textMain: palette.inkPrimary,
  textSecondary: palette.inkSecondary,
  textAuxiliary: palette.inkTertiary,
  borderMain: palette.border,
  borderLight: rgbaHex(palette.border, mode === "dark" ? 0.4 : 0.5),
  dividerMain: rgbaHex(palette.border, 0.35),
  dividerLight: rgbaHex(palette.border, 0.2),
  tabbarBg: palette.bgPage,
  tabbarItemColorActive: palette.inkPrimary,
  tabbarItemColorInactive: palette.inkTertiary,
  // ...按钮语义色等
},
pageChrome: {
  frontColor: mode === "light" ? "#000000" : "#ffffff",
  backgroundColor: palette.bgPage,
  backgroundColorTop: palette.bgPage,
  backgroundColorBottom: palette.bgPage,
},
```

### 3.2 语义色分工（易错点）

| 用途               | 应使用的色                  | 不应使用的色                          |
| ------------------ | --------------------------- | ------------------------------------- |
| 页面 / TabBar 背景 | `bgPage` / `filledBottom`   | `primary`（导航标题色）               |
| 自定义 Navbar      | `filledBottom` + `textMain` | 写死 `#F5F5F5`                        |
| 主按钮 CTA         | `accent`                    | `primary6`（实为墨色）                |
| Tab 选中图标/文字  | `inkPrimary` / `textMain`   | `accent` 或 `primary6` 当「品牌主色」 |
| 筛选 Chip / 分类条 | 墨色 + 边框 + 表面层级      | `accent` 满色块（见分类条专文）       |

---

## 4. useTheme 与页面接入

`src/hooks/useTheme.ts` 使用**模块级** `backgroundThemeId`，保证 Tab 页之间主题同步。

页面标准结构：

```vue
<wd-config-provider :theme="theme" :theme-vars="themeVars" :custom-style="themeRootStyle">
  <view class="page-container with-tabbar" :style="pageShellStyle">
    <AppNavbar title="书架" />
    <scroll-view scroll-y class="page-scroll">...</scroll-view>
    <AppTabbar />
  </view>
</wd-config-provider>
```

| 导出                  | 用途                                              |
| --------------------- | ------------------------------------------------- |
| `theme` / `themeVars` | 传给 `wd-config-provider`                         |
| `pageShellStyle`      | 页面容器内联 `backgroundColor`（hex，防首帧闪烁） |
| `navbarStyle`         | `AppNavbar` 背景 + 文字色                         |
| `setBackgroundTheme`  | 「我的」页切换主题                                |
| `applyPageChrome`     | 同步微信窗口配色                                  |

`applyPageChrome` 调用时机：App `onLaunch`、主题 `watch`、`useTheme` 的 `onShow`、Tab 切换前 `useTabbar.handleChange`。

---

## 5. 自定义 Navbar（Header 同色）

`pages.json` 使用 `navigationStyle: "custom"`，由 `AppNavbar` + `navbarStyle` 渲染顶栏：

```typescript
const navbarStyle = computed(() => {
  const { filledBottom, textMain } = activePreset.value.themeVars;
  return `background-color: ${filledBottom}; color: ${textMain};`;
});
```

这样切换 Tab 时 Header 在后台已更新，避免原生导航栏闪旧色。

---

## 6. 相关文件

| 文件                             | 职责                     |
| -------------------------------- | ------------------------ |
| `src/theme/presets.ts`           | 十套主题色值与 themeVars |
| `src/hooks/useTheme.ts`          | 状态、持久化、窗口配色   |
| `src/components/AppNavbar.vue`   | 自定义顶栏               |
| `src/pages/mine/index.vue`       | 主题选择 UI              |
| `spec/chinese-color-10themes.md` | 配色预览与组件范例       |
| `spec/theme-ui.md`               | 四套主题 UI 规范速查     |

---

## 7. 延伸阅读

- [tabbar-layout-scroll-safe-area.md](./tabbar-layout-scroll-safe-area.md) — Tab 页滚动与底部留白
- [tabbar-style-and-icon-colors.md](./tabbar-style-and-icon-colors.md) — TabBar 视觉与图标色
- [shelf-category-rail-theme.md](./shelf-category-rail-theme.md) — 书架分类条配色
