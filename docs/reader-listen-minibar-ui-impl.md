# 听书迷你条图标与布局（实现思路）

> **状态**：已采纳  
> **关联文件**：`src/components/ListenMiniBar.vue`、`src/components/AppIcon.vue`  
> **来源会话**：[听书跟读与迷你条迭代](c3f8bd51-ec80-47b8-be74-2f558038843f)  
> **相关文档**：混合形态总述 [reader-listen-hybrid-impl.md](./reader-listen-hybrid-impl.md)；听书页图标同源 `AppIcon`（`fast-backward` / `play` / `pause` / `fast-forward`）

---

## 1. 需求背景（必填）

阅读页底栏迷你播控原先五枚文字按钮：`上段 | 播放 | 下段 | 2x | 展开`。需与独立听书页视觉对齐：播控用图标；倍速靠左；右侧入口文案更贴切（进入完整听书页，而非含糊的「展开」）。

成功标准：迷你条布局为「倍速 | 上一段图标 | 播放/暂停图标 | 下一段图标 | 听书页」；加载中播放键显示 loading。

---

## 2. 用户需求与 Agent 问答（必填）

### 2.1 迷你条改图标与文案

**用户：**

> 将这个播放按钮和上段下段改为与播放页一样的图标，同时将倍速放在左边，将展开文案改的更符合语义，更合理一点，放在右边

**Agent 回答摘要：**

- 顺序改为：倍速 → `fast-backward` → `play`/`pause` → `fast-forward` →「听书页」
- 图标复用听书页 `AppIcon` 命名（含 vu-icons 方向对调映射）
- 「展开」→「听书页」，仍调用 `expandListenPage`

---

## 3. 实现思路（必填，细致到每个点）

### 3.1 总体策略

不改会话 API（仍是 `prevListenSentence` / `nextListenSentence` / `togglePlayListen` / `expandListenPage`），只改迷你条模板与样式：文字按钮换图标槽，等分 `listen-mini__cell` 布局保留。

### 3.2 控制流

- 倍速：点开 `rateMenuOpen`，上方横排 `rates`
- 上/下段：图标 soft 按钮
- 播放：base 实心；`loading` 用 `wd-loading`；播放三角略右移居中
- 「听书页」：`navigateTo` 听书页（与点摘要区相同）

### 3.3 分点设计

- 操作区顺序与图标：见 4.1
- 图标色与播放三角校正：见 4.2

---

## 4. 改动点对比：改前 / 改后（必填）

### 4.1 改动点：操作条顺序与控件形态

- **位置**：`src/components/ListenMiniBar.vue` → `.listen-mini__actions`
- **差异摘要**：倍速左置；中三键改图标；右键文案「听书页」。

#### 改动前

```vue
<!-- 操作区：上段 | 播放文案 | 下段 | 倍速 | 展开 -->
<view class="listen-mini__actions">
  <!-- 上一段 -->
  <view class="listen-mini__cell">
    <wd-button
      type="primary"
      variant="soft"
      block
      size="small"
      custom-class="listen-mini__btn"
      @click.stop="prevListenSentence"
    >
      上句
    </wd-button>
  </view>
  <!-- 播放/暂停文字 -->
  <view class="listen-mini__cell">
    <wd-button
      type="primary"
      variant="base"
      block
      size="small"
      custom-class="listen-mini__btn"
      @click.stop="onToggle"
    >
      {{ playLabel }}
    </wd-button>
  </view>
  <!-- 下一段 -->
  <view class="listen-mini__cell">
    <wd-button
      type="primary"
      variant="soft"
      block
      size="small"
      custom-class="listen-mini__btn"
      @click.stop="nextListenSentence"
    >
      下句
    </wd-button>
  </view>
  <!-- 倍速 -->
  <view class="listen-mini__cell">
    <wd-button
      type="primary"
      :variant="rateMenuOpen ? 'base' : 'soft'"
      block
      size="small"
      custom-class="listen-mini__btn"
      @click.stop="toggleRateMenu"
    >
      {{ rateLabel }}
    </wd-button>
  </view>
  <!-- 展开听书页 -->
  <view class="listen-mini__cell">
    <wd-button
      type="primary"
      variant="soft"
      block
      size="small"
      custom-class="listen-mini__btn"
      @click.stop="expandListenPage"
    >
      展开
    </wd-button>
  </view>
</view>
```

#### 改动后

```vue
<!-- 操作区：倍速 | 上段图标 | 播放图标 | 下段图标 | 听书页 -->
<view class="listen-mini__actions">
  <!-- 倍速靠左 -->
  <view class="listen-mini__cell">
    <wd-button
      type="primary"
      :variant="rateMenuOpen ? 'base' : 'soft'"
      block
      size="small"
      custom-class="listen-mini__btn"
      @click.stop="toggleRateMenu"
    >
      {{ rateLabel }}
    </wd-button>
  </view>
  <!-- 上一段：与听书页同款快退图标 -->
  <view class="listen-mini__cell">
    <wd-button
      type="primary"
      variant="soft"
      block
      size="small"
      custom-class="listen-mini__btn listen-mini__btn--icon"
      @click.stop="prevListenSentence"
    >
      <AppIcon name="fast-backward" :size="22" :color="softIconColor" />
    </wd-button>
  </view>
  <!-- 播放/暂停：实心主色 -->
  <view class="listen-mini__cell">
    <wd-button
      type="primary"
      variant="base"
      block
      size="small"
      custom-class="listen-mini__btn listen-mini__btn--icon"
      @click.stop="onToggle"
    >
      <!-- 合成中转圈 -->
      <wd-loading v-if="status === 'loading'" :color="playIconColor" size="18px" />
      <!-- 播放三角略右移视觉居中 -->
      <view
        v-else
        class="listen-mini__play-icon"
        :class="{ 'listen-mini__play-icon--play': status !== 'playing' }"
      >
        <AppIcon
          :name="status === 'playing' ? 'pause' : 'play'"
          :size="22"
          :color="playIconColor"
        />
      </view>
    </wd-button>
  </view>
  <!-- 下一段 -->
  <view class="listen-mini__cell">
    <wd-button
      type="primary"
      variant="soft"
      block
      size="small"
      custom-class="listen-mini__btn listen-mini__btn--icon"
      @click.stop="nextListenSentence"
    >
      <AppIcon name="fast-forward" :size="22" :color="softIconColor" />
    </wd-button>
  </view>
  <!-- 进入完整听书页 -->
  <view class="listen-mini__cell">
    <wd-button
      type="primary"
      variant="soft"
      block
      size="small"
      custom-class="listen-mini__btn"
      @click.stop="expandListenPage"
    >
      听书页
    </wd-button>
  </view>
</view>
```

### 4.2 改动点：图标色与按钮居中样式

- **位置**：`ListenMiniBar.vue` script `softIconColor` / `playIconColor`；样式 `.listen-mini__btn--icon`
- **差异摘要**：soft 键用主题强调色；播放键用主按钮文字色；去掉纯文案 `playLabel`。

#### 改动前

```ts
// 播放键文案随状态变
const playLabel = computed(() => {
  // 合成中
  if (status.value === "loading") return "…";
  // 播放中显示暂停
  if (status.value === "playing") return "暂停";
  // 其余显示播放
  return "播放";
});
```

#### 改动后

```ts
// soft 按钮上的图标色 = 主题强调色
const softIconColor = computed(() => String(themeVars.value.buttonPrimaryBg ?? "#dc541b"));
// 实心播放钮上的图标色 = 主按钮前景
const playIconColor = computed(() => String(themeVars.value.buttonMainColor ?? "#ffffff"));
```

```css
/* 图标按钮内容居中 */
.listen-mini :deep(.listen-mini__btn--icon) {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* 播放三角视觉重心校正 */
.listen-mini__play-icon--play {
  margin-left: 4rpx;
}
```

---

## 5. 验证要点（建议）

- [ ] 迷你条顺序：倍速在左，「听书页」在右
- [ ] 上/下段、播放图标与听书页方向一致（vu-icons 对调映射生效）
- [ ] 加载中播放键为 loading，不误触
- [ ] 「听书页」进入 `/pages/listen/index`，返回会话不断

---

## 6. 影响分析（必填，放在文档最后）

### 6.1 结论

- **是否影响已有功能点**：局部影响 — 仅迷你条 UI 与文案；播控语义（上/下句、倍速、进听书页）不变
- **是否影响既有正常逻辑**：否 — 未改 `useChapterListen` 对外 API；听书页本身布局不在本文件

### 6.2 影响点明细

| #   | 影响对象           | 影响方式                          | 程度 | 说明与回归建议                         |
| --- | ------------------ | --------------------------------- | ---- | -------------------------------------- |
| 1   | 迷你条文案「展开」 | 改为「听书页」                    | 低   | 产品文案确认即可                       |
| 2   | 上/下段视觉        | 文字→图标（与听书页章切图标同形） | 低   | 注意：动作仍是句级 prev/next，不是切章 |
| 3   | 主题色             | 图标色跟 `useThemeAccent`         | 低   | 浅/深纸张下对比度                      |

### 6.3 调用面 / 波及说明（建议）

- `ListenMiniBar` 仅挂在阅读页底栏；隐藏页卸载见 [reader-listen-hidden-page-setdata-impl.md](./reader-listen-hidden-page-setdata-impl.md)
- `AppIcon` 的 `fast-backward` / `fast-forward` 映射与听书页共用，改映射需两边一起回归
