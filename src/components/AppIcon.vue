<template>
  <VuBookOpen v-if="name === 'book-open'" :size="size" :color="color" />
  <VuUser v-else-if="name === 'user'" :size="size" :color="color" />
  <VuList v-else-if="name === 'list'" :size="size" :color="color" />
  <VuSettings v-else-if="name === 'settings'" :size="size" :color="color" />
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
