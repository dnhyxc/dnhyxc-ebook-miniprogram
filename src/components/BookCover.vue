<template>
  <view class="cover" :style="coverStyle">
    <image
      v-if="showImage"
      class="cover-img"
      :src="coverUrl"
      mode="aspectFill"
      lazy-load
      @error="onImageError"
    />
    <view v-else class="cover-fallback">
      <text class="cover-fallback-text">{{ fallbackText }}</text>
    </view>
    <view v-if="percent != null && percent > 0" class="cover-progress">
      <view class="cover-progress-bar" :style="{ width: `${Math.round(percent * 100)}%` }" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    coverUrl?: string;
    percent?: number;
    width?: string;
    ratio?: number;
  }>(),
  {
    width: "100%",
    ratio: 1.4,
  },
);

const imageFailed = ref(false);

watch(
  () => props.coverUrl,
  () => {
    imageFailed.value = false;
  },
);

const showImage = computed(() => Boolean(props.coverUrl) && !imageFailed.value);

const coverStyle = computed(() => ({
  width: props.width,
  paddingBottom: `${props.ratio * 100}%`,
}));

const fallbackText = computed(() => {
  const t = props.title.trim();
  return t || "书";
});

function onImageError() {
  imageFailed.value = true;
}
</script>

<style scoped>
.cover {
  position: relative;
  height: 0;
  border-radius: 12rpx;
  overflow: hidden;
  background: var(--wot-fill-2, #e8e8e8);
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.08);
}

.cover-img,
.cover-fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16rpx;
  box-sizing: border-box;
}

.cover-fallback-text {
  width: 100%;
  font-size: 26rpx;
  line-height: 1.4;
  font-weight: 600;
  text-align: center;
  color: var(--wot-text-auxiliary);
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  display: -webkit-box;
}

.cover-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 6rpx;
  background: rgba(0, 0, 0, 0.15);
}

.cover-progress-bar {
  height: 100%;
  background: var(--wot-primary-6);
}
</style>
