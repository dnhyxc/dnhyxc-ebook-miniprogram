<template>
  <wd-config-provider :theme="theme" :theme-vars="themeVars" :custom-style="themeRootStyle">
    <view class="page-container" :style="pageShellStyle">
      <AppNavbar title="设置" show-back />
      <scroll-view scroll-y class="page-scroll">
        <view class="page">
          <view class="section">
            <ThemePicker title="背景主题色" />
          </view>
        </view>
      </scroll-view>
    </view>
  </wd-config-provider>
</template>

<script setup lang="ts">
import { useTheme } from "@/hooks/useTheme";

const { theme, themeVars, pageShellStyle, themeRootStyle } = useTheme();
</script>

<style scoped>
.page-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.page-scroll {
  flex: 1;
  height: 0;
}

.page {
  min-height: 100%;
  padding: 48rpx 32rpx calc(64rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
</style>
