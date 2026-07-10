<template>
  <wd-tabbar
    :model-value="selected"
    custom-class="app-tabbar"
    fixed
    bordered
    safe-area-inset-bottom
    :z-index="500"
    active-color="var(--wot-primary-6)"
    inactive-color="var(--wot-text-auxiliary)"
    @change="handleChange"
  >
    <wd-tabbar-item
      v-for="item in tabbarItems"
      :key="item.name"
      custom-class="app-tabbar-item"
      :name="item.name"
      :title="item.title"
      :icon="item.icon"
    />
  </wd-tabbar>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { useTabbar } from "@/hooks/useTabbar";

const { tabbarItems, selected, syncActive, handleChange } = useTabbar();

onShow(() => {
  syncActive();
});
</script>

<style scoped>
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
</style>
