# vu-icons 接入与 AppIcon 实现

本文档说明底部 TabBar、阅读页等场景接入 **vu-icons** 的方案，以及微信小程序下的编译约束与排错。

---

## 1. 实现目标

- TabBar 使用 `book-open`（书架）、`user`（我的）图标
- 阅读页使用 `list`（目录）、`settings`（设置）图标
- 图标颜色随主题变化，由父组件传入 hex
- 微信小程序可正常编译、渲染（mask 方案）

---

## 2. 依赖与 easycom

`package.json` 依赖：

```json
"vu-icons": "1.3.6"
```

`src/pages.json` 配置 easycom（**必须**，否则子组件 `usingComponents` 为空）：

```json
{
  "easycom": {
    "autoscan": true,
    "custom": {
      "^Vu(.*)": "/node_modules/vu-icons/dist/uniapp/Vu$1.vue"
    }
  }
}
```

图标名与组件映射：`book-open` → `VuBookOpen`，`user` → `VuUser`，依此类推。

---

## 3. AppIcon 封装

`src/icons.ts` 限定可用图标名：

```typescript
export type AppIconName = "book-open" | "user" | "list" | "settings";
```

`src/components/AppIcon.vue`：**禁止** `<component :is>`，小程序不支持。使用 `v-if` 静态分支：

```vue
<template>
  <VuBookOpen v-if="name === 'book-open'" :size="size" :color="color" />
  <VuUser v-else-if="name === 'user'" :size="size" :color="color" />
  <VuList v-else-if="name === 'list'" :size="size" :color="color" />
  <VuSettings v-else-if="name === 'settings'" :size="size" :color="color" />
</template>
```

### 问题：编译报错 `<component is=""/> is not supported`

| 现象                   | 原因                                |
| ---------------------- | ----------------------------------- |
| 微信开发者工具编译失败 | 小程序运行时禁止动态 `component is` |

**解决方案**：保持上述静态 `v-if` 分支；若改回 `<component :is>` 会再次失败。

### 问题：图标不显示 / `usingComponents` 为空

| 现象                | 原因                        |
| ------------------- | --------------------------- |
| 组件树里无 Vu* 引用 | 未配置 easycom 或未重启 dev |

**解决方案**：

1. 确认 `pages.json` easycom 规则存在
2. 修改 easycom 后**重启** `npm run dev:mp-weixin-open`
3. 在 `AppTabbar.vue`、`reader/index.vue` 等处**显式** `import AppIcon`（easycom 对嵌套组件不一定可靠）

---

## 4. 小程序端渲染原理（vu-icons）

非 H5 环境，vu-icons 使用 **CSS mask + backgroundColor** 着色，而非 SVG stroke：

```javascript
// vu-icons dist/uniapp/VuUser.vue（节选）
maskStyle = {
  backgroundColor: props.color,
  maskImage: `url(${svgDataUri})`,
  // ...
};
```

因此：

- 必须传入**具体 hex 色值**（如 `#2e201d`），不要依赖 `var(--wot-*)` 写在 mask 的 `backgroundColor` 上（可能不解析）
- 主题切换后需保证 `:color` prop 响应式更新；必要时在 `v-for` 父级用 `:key` 含 `backgroundThemeId` 触发重建（见 TabBar 图标色专文）

---

## 5. 使用位置

### TabBar（`useTabbar.ts`）

```typescript
export const tabbarItems: TabbarItem[] = [
  { name: "shelf", title: "书架", icon: "book-open", pagePath: "/pages/shelf/index" },
  { name: "mine", title: "我的", icon: "user", pagePath: "/pages/mine/index" },
];
```

### AppTabbar 插槽

```vue
<template #icon="{ active }">
  <AppIcon :name="item.icon" :size="22" :color="active ? activeTabColor : inactiveTabColor" />
</template>
```

### 阅读页

```vue
<AppIcon name="list" :size="20" :color="readerStyle.color" />
<AppIcon name="settings" :size="20" :color="readerStyle.color" />
```

---

## 6. 相关文件

| 文件                           | 职责         |
| ------------------------------ | ------------ |
| `src/components/AppIcon.vue`   | 图标统一入口 |
| `src/icons.ts`                 | 图标名类型   |
| `src/components/AppTabbar.vue` | Tab 图标     |
| `src/pages/reader/index.vue`   | 阅读页图标   |
| `src/pages.json`               | easycom 规则 |

---

## 7. 延伸阅读

- [tabbar-style-and-icon-colors.md](./tabbar-style-and-icon-colors.md) — 主题切换后图标/文字颜色同步
