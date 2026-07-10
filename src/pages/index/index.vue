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
          </view>

          <view class="section">
            <text class="section-title">局部主题（ConfigProvider）</text>
            <wd-config-provider :theme-vars="accentThemeVars">
              <wd-button type="primary" block>局部同色系按钮</wd-button>
            </wd-config-provider>
          </view>
        </view>
      </scroll-view>

      <AppTabbar />
    </view>
  </wd-config-provider>
</template>

<script setup lang="ts">
import type { ConfigProviderThemeVars } from "@wot-ui/ui";
import { computed } from "vue";
import { useTheme } from "@/hooks/useTheme";

const { theme, themeVars, pageShellStyle, themeRootStyle } = useTheme();

const accentThemeVars = computed<ConfigProviderThemeVars>(() => ({
  buttonPrimaryBg: themeVars.value.buttonPrimaryBgActive,
  buttonPrimaryBgActive: themeVars.value.buttonPrimaryBg,
  buttonPrimaryColor: themeVars.value.buttonPrimaryBgActive,
  buttonPrimaryColorActive: themeVars.value.buttonPrimaryBg,
  buttonMainColor: themeVars.value.buttonMainColor,
  buttonSuccessBg: themeVars.value.buttonSuccessBgActive,
  buttonSuccessBgActive: themeVars.value.buttonSuccessBg,
  buttonSuccessColor: themeVars.value.buttonSuccessBgActive,
  buttonSuccessColorActive: themeVars.value.buttonSuccessBg,
}));
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
