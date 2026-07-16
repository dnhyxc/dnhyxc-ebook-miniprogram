<template>
  <!-- 禁止 <component :is>，小程序不支持；静态分支 + easycom 解析 Vu* -->
  <VuBookOpen v-if="name === 'book-open'" :size="size" :color="color" />
  <VuUser v-else-if="name === 'user'" :size="size" :color="color" />
  <VuList v-else-if="name === 'list'" :size="size" :color="color" />
  <VuSettings v-else-if="name === 'settings'" :size="size" :color="color" />
  <VuVolume2 v-else-if="name === 'volume-2'" :size="size" :color="color" />
  <VuGauge v-else-if="name === 'gauge'" :size="size" :color="color" />
  <VuSkipBack v-else-if="name === 'skip-back'" :size="size" :color="color" />
  <VuSkipForward v-else-if="name === 'skip-forward'" :size="size" :color="color" />
  <!-- vu-icons FastForward/Backward 路径对调；按视觉方向接对组件 -->
  <VuFastForward v-else-if="name === 'fast-backward'" :size="size" :color="color" />
  <VuFastBackward v-else-if="name === 'fast-forward'" :size="size" :color="color" />
  <VuPlay v-else-if="name === 'play'" :size="size" :color="color" />
  <VuPause v-else-if="name === 'pause'" :size="size" :color="color" />
</template>

<script setup lang="ts">
import type { AppIconName } from "@/icons";

withDefaults(
  defineProps<{
    name: AppIconName;
    size?: number | string;
    color?: string;
  }>(),
  {
    size: 24,
    color: "currentColor",
  },
);
</script>
