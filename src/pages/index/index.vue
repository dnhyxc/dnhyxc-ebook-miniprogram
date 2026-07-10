<template>
  <wd-config-provider :theme="theme" :theme-vars="themeVars" :custom-style="themeRootStyle">
    <view class="page-container" :style="pageShellStyle">
      <AppNavbar title="首页" />
      <scroll-view scroll-y class="page-scroll">
        <view class="page">
          <image class="logo" src="/static/logo.png" />

          <view class="section">
            <text class="section-title">全局主题按钮</text>
            <wd-button type="primary" block>Primary</wd-button>
            <wd-button type="success" block>Success</wd-button>
            <wd-button type="warning" block>Warning</wd-button>
            <wd-button type="danger" block>Danger</wd-button>
            <wd-button type="info" block>Info</wd-button>
          </view>
        </view>
      </scroll-view>

      <AppTabbar />
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
  padding: 48rpx 32rpx calc(64rpx + var(--wot-tabbar-height) + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.logo {
  display: block;
  width: 200rpx;
  height: 200rpx;
  margin: 80rpx auto 48rpx;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  margin-bottom: 40rpx;
}

.section-title {
  font-size: 28rpx;
  color: var(--wot-text-auxiliary);
}
</style>
