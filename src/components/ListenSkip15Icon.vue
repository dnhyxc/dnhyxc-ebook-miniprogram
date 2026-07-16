<template>
  <!-- 用 PNG：微信小程序 image 对 SVG 支持不稳定；资源在 src/static -->
  <image class="skip15" :src="src" :style="boxStyle" mode="aspectFit" />
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** true = 快进（右侧） */
    forward?: boolean;
    size?: number;
    /** 纸张字色；亮色用 *-light.png，暗色用 *-dark.png */
    color?: string;
  }>(),
  {
    forward: false,
    size: 28,
    color: "#e5e5ea",
  },
);

function isLightInk(hex: string): boolean {
  const h = hex.replace("#", "").trim();
  if (h.length < 6) return true;
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}

const src = computed(() => {
  const tone = isLightInk(props.color) ? "light" : "dark";
  const dir = props.forward ? "fwd" : "back";
  return `/static/listen/skip15-${dir}-${tone}.png`;
});

const boxStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  flexShrink: "0",
}));
</script>

<style scoped lang="scss">
.skip15 {
  display: block;
}
</style>
