<template>
  <wd-config-provider :theme="theme" :theme-vars="themeVars" :custom-style="themeRootStyle">
    <view class="page-container" :style="pageShellStyle">
      <AppNavbar title="我的" />
      <scroll-view scroll-y class="page-scroll">
        <view class="page">
          <view class="header">
            <text class="title">我的</text>
            <text class="subtitle">个人中心</text>
          </view>

          <wd-cell-group border>
            <wd-cell title="设置" is-link @click="goSettings" />
          </wd-cell-group>
        </view>
      </scroll-view>

      <AppTabbar />
    </view>
  </wd-config-provider>
</template>

<script setup lang="ts">
import { useTheme } from "@/hooks/useTheme";

const { theme, themeVars, pageShellStyle, themeRootStyle } = useTheme();

function goSettings() {
  uni.navigateTo({ url: "/pages/settings/index" });
}
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
  padding: 48rpx 32rpx calc(64rpx + var(--wot-tabbar-height) + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin: 80rpx 0 48rpx;
}

.title {
  font-size: 48rpx;
  font-weight: 600;
  color: var(--wot-text-main);
}

.subtitle {
  font-size: 28rpx;
  color: var(--wot-text-auxiliary);
}
</style>
