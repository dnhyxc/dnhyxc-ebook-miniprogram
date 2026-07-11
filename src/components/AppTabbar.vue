<template>
  <view class="app-tabbar-wrap">
    <wd-tabbar
      :model-value="selected"
      custom-class="app-tabbar"
      fixed
      safe-area-inset-bottom
      :z-index="500"
      :custom-style="tabbarStyle"
      :active-color="activeTabColor"
      :inactive-color="inactiveTabColor"
      @change="handleChange"
    >
      <wd-tabbar-item
        v-for="item in tabbarItems"
        :key="`${backgroundThemeId}-${item.name}`"
        custom-class="app-tabbar-item"
        :name="item.name"
        :title="item.title"
      >
        <template #icon="{ active }">
          <AppIcon
            :name="item.icon"
            :size="22"
            :color="active ? activeTabColor : inactiveTabColor"
          />
        </template>
      </wd-tabbar-item>
    </wd-tabbar>
    <!-- ponytail: 小程序 safe-area 常露白，单独铺底与页面同色 -->
    <view class="app-tabbar-safe" :style="{ backgroundColor: tabbarBg }" />
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { computed } from "vue";
import { useTabbar } from "@/hooks/useTabbar";
import { applyPageChrome, useTheme } from "@/hooks/useTheme";

function rgbaHex(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const { tabbarItems, selected, syncActive, handleChange } = useTabbar();
const { backgroundThemeId, theme, themeVars } = useTheme();

const tabbarBg = computed(
  () => themeVars.value.tabbarBg ?? themeVars.value.filledBottom ?? "#bfd1b2",
);
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

const activeTabColor = computed(
  () => themeVars.value.tabbarItemColorActive ?? themeVars.value.textMain ?? "#2e201d",
);
const inactiveTabColor = computed(
  () => themeVars.value.tabbarItemColorInactive ?? themeVars.value.textAuxiliary ?? "#576470",
);

onShow(() => {
  syncActive();
  applyPageChrome();
});
</script>

<style scoped>
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
  pointer-events: none;
}

:deep(.app-tabbar-item) {
  align-items: flex-start;
  justify-content: flex-start;
  padding-top: 6px;
  box-sizing: border-box;
}

:deep(.app-tabbar-item .wd-tabbar-item__body) {
  gap: 2px;
}

:deep(.app-tabbar-item .wd-tabbar-item__body-title) {
  margin-top: 2px;
}

:deep(.app-tabbar-item .wd-tabbar-item__body-title.is-active) {
  color: v-bind(activeTabColor) !important;
}

:deep(.app-tabbar-item .wd-tabbar-item__body-title.is-inactive) {
  color: v-bind(inactiveTabColor) !important;
}
</style>
