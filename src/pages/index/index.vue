<template>
  <wd-config-provider :theme="theme">
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
          <wd-button type="primary" block>局部绿色主题</wd-button>
        </wd-config-provider>
      </view>

      <view class="section">
        <wd-button plain block @click="toggleTheme()">
          切换 {{ theme === "light" ? "深色" : "浅色" }}模式
        </wd-button>
      </view>
    </view>
  </wd-config-provider>
</template>

<script setup lang="ts">
import type { ConfigProviderThemeVars } from "@wot-ui/ui";
import { reactive } from "vue";
import { useTheme } from "@/composables/useTheme";

const { theme, toggleTheme } = useTheme();

const accentThemeVars = reactive<ConfigProviderThemeVars>({
  buttonPrimaryBg: "#07c160",
  buttonPrimaryColor: "#ffffff",
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 48rpx 32rpx 64rpx;
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
  color: #666;
}
</style>
