<template>
  <wd-navbar
    :title="title"
    :left-arrow="showBack"
    fixed
    placeholder
    safe-area-inset-top
    :bordered="false"
    :custom-style="navbarStyle"
    @click-left="handleBack"
  />
</template>

<script setup lang="ts">
import { useTheme } from "@/hooks/useTheme";

withDefaults(
  defineProps<{
    title: string;
    showBack?: boolean;
  }>(),
  {
    showBack: false,
  },
);

const { navbarStyle } = useTheme();

function handleBack() {
  uni.navigateBack();
}
</script>
