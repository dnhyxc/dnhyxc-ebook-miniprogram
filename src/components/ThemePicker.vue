<template>
  <view class="theme-picker">
    <text v-if="title" class="theme-picker__title">{{ title }}</text>
    <view class="theme-options">
      <view
        v-for="item in backgroundThemeOptions"
        :key="item.id"
        class="theme-option"
        :class="{ active: backgroundThemeId === item.id }"
        @click="setBackgroundTheme(item.id)"
      >
        <view class="theme-swatch" :style="{ backgroundColor: item.color }">
          <view v-if="backgroundThemeId === item.id" class="theme-check" />
        </view>
        <text class="theme-name">{{ item.name }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useTheme } from "@/hooks/useTheme";

defineProps<{
  title?: string;
}>();

const { backgroundThemeId, backgroundThemeOptions, setBackgroundTheme } = useTheme();
</script>

<style scoped>
.theme-picker {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.theme-picker__title {
  font-size: 28rpx;
  color: var(--wot-text-secondary);
}

.theme-options {
  display: flex;
  flex-wrap: wrap;
  gap: 32rpx;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}

.theme-option.active .theme-name {
  color: var(--wot-primary-6);
  font-weight: 600;
}

.theme-swatch {
  position: relative;
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  border: 4rpx solid transparent;
  box-sizing: border-box;
}

.theme-option.active .theme-swatch {
  border-color: var(--wot-primary-6);
}

.theme-check {
  position: absolute;
  right: 4rpx;
  bottom: 4rpx;
  width: 24rpx;
  height: 24rpx;
  border-radius: 50%;
  background-color: #ffffff;
  border: 4rpx solid var(--wot-primary-6);
  box-sizing: border-box;
}

.theme-name {
  font-size: 24rpx;
  color: var(--wot-text-auxiliary);
}
</style>
