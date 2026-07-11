# UI 主题、TabBar 与书架分类 — 总览

本文档是本期 UI 主题相关改动的**索引与实现总览**，各专题细节见独立文档。

---

## 1. 本期实现范围

| 模块          | 内容                                                 |
| ------------- | ---------------------------------------------------- |
| 主题系统      | 十套中式传统色、`presets.ts` 单一数据源、窗口 Chrome |
| 自定义 TabBar | wot-ui + vu-icons、与页面同色、边框阴影、滚动布局    |
| 书架分类条    | 横向 Chip、墨色+边框配色、数量徽章可读性             |
| 阅读页图标    | `list` / `settings` vu-icons                         |

**明确不做**：Header 不使用 `--primary` 导航色，而与 `--bg-page` 一致（见主题专文）。

---

## 2. 文档索引

| 文档                                                                     | 说明                                         |
| ------------------------------------------------------------------------ | -------------------------------------------- |
| [theme-presets-and-chrome.md](./theme-presets-and-chrome.md)             | 十套主题、preset 映射、Navbar/窗口配色       |
| [vu-icons-integration.md](./vu-icons-integration.md)                     | vu-icons、AppIcon、easycom、小程序限制       |
| [tabbar-layout-scroll-safe-area.md](./tabbar-layout-scroll-safe-area.md) | 滚动区域、白底、安全区、`with-tabbar`        |
| [tabbar-style-and-icon-colors.md](./tabbar-style-and-icon-colors.md)     | TabBar 边框阴影、图标文字色、主题切换        |
| [shelf-category-rail-theme.md](./shelf-category-rail-theme.md)           | 书架分类条配色原则与实现                     |
| [tabbar-and-theme.md](./tabbar-and-theme.md)                             | 早期 TabBar 归档（3 主题时代，可作历史参考） |

---

## 3. 关键文件地图

```
src/
├── App.vue                          # with-tabbar 全局布局、onLaunch 隐藏原生 TabBar
├── pages.json                       # easycom、disableScroll、tabBar 占位
├── theme/
│   ├── presets.ts                   # 十套主题色 + themeVars
│   └── variables.scss               # --app-tabbar-inset 等布局变量
├── hooks/
│   ├── useTheme.ts                  # 主题状态、applyPageChrome
│   └── useTabbar.ts                 # Tab 切换、选中态
├── components/
│   ├── AppTabbar.vue                # 底栏 UI
│   ├── AppIcon.vue                  # vu-icons 封装
│   ├── AppNavbar.vue                # 顶栏
│   └── ShelfCategoryRail.vue        # 书架分类条
├── icons.ts                         # AppIconName 类型
└── pages/
    ├── shelf/index.vue              # 书架 + 分类条
    ├── mine/index.vue               # 我的 + 主题选择
    └── reader/index.vue             # 阅读页图标
```

---

## 4. 问题 → 文档速查

| 问题                               | 文档                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------- |
| 滚动条滚到 TabBar 下面             | [tabbar-layout-scroll-safe-area.md](./tabbar-layout-scroll-safe-area.md) §2 |
| 上滑底部露白                       | [tabbar-layout-scroll-safe-area.md](./tabbar-layout-scroll-safe-area.md) §3 |
| TabBar 边框太明显                  | [tabbar-style-and-icon-colors.md](./tabbar-style-and-icon-colors.md) §2     |
| 换主题后 Tab 图标/文字颜色错乱     | [tabbar-style-and-icon-colors.md](./tabbar-style-and-icon-colors.md) §3     |
| 图标不显示 / component is 编译失败 | [vu-icons-integration.md](./vu-icons-integration.md) §3                     |
| 分类数字看不清 / 配色突兀          | [shelf-category-rail-theme.md](./shelf-category-rail-theme.md) §3           |
| Header 要与页面同色                | [theme-presets-and-chrome.md](./theme-presets-and-chrome.md) §5             |

---

## 5. 标准 Tab 页模板（当前）

```vue
<wd-config-provider :theme="theme" :theme-vars="themeVars" :custom-style="themeRootStyle">
  <view class="page-container with-tabbar" :style="pageShellStyle">
    <AppNavbar title="书架" />
    <!-- 可选：<ShelfCategoryRail ... /> -->
    <scroll-view scroll-y class="page-scroll">
      <view class="page">...</view>
    </scroll-view>
    <AppTabbar />
  </view>
</wd-config-provider>
```

---

## 6. 维护约定

1. **新增主题**：只改 `presets.ts`，`mine` 页色块自动出现
2. **新增 Tab 页**：复制标准模板 + `pages.json` tabBar.list + `useTabbar.tabbarItems`
3. **改 TabBar 高度**：只改 `variables.scss` 的 `--wot-tabbar-height`，`--app-tabbar-inset` 自动联动
4. **改 easycom / pages.json**：重启 `npm run dev:mp-weixin-open`
5. **配色争议**：以 `spec/theme-ui.md` 语义为准——accent 给 CTA，筛选/导航给 ink+border+surface

---

_文档版本：2026-07-11，对应当前工作区实现。_
