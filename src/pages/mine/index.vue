<template>
  <wd-config-provider :theme="theme" :theme-vars="themeVars" :custom-style="themeRootStyle">
    <view class="page-container with-tabbar" :style="pageShellStyle">
      <AppNavbar title="我的" />
      <scroll-view scroll-y class="page-scroll">
        <view class="page">
          <view class="header">
            <text class="title">我的</text>
            <text class="subtitle">{{ subtitle }}</text>
          </view>

          <!-- 未登录 -->
          <view v-if="phase === 'guest'" class="card">
            <text class="card-title">登录</text>
            <text class="card-desc">微信登录后可同步 Web 端书架与阅读进度</text>
            <wd-button type="primary" block :loading="loggingIn" @click="handleLogin">
              微信登录
            </wd-button>
          </view>

          <!-- 需绑定 Web 账号 -->
          <view v-else-if="phase === 'need_bind'" class="card">
            <text class="card-title">绑定 Web 账号</text>
            <text class="card-desc">
              微信已授权。请在 Web「账号设置 → 微信小程序」生成 6 位关联码，或输入 Web
              用户名密码完成绑定。
            </text>

            <view class="mode-row">
              <wd-button
                size="small"
                :type="bindMode === 'code' ? 'primary' : 'info'"
                @click="bindMode = 'code'"
              >
                关联码
              </wd-button>
              <wd-button
                size="small"
                :type="bindMode === 'account' ? 'primary' : 'info'"
                @click="bindMode = 'account'"
              >
                账号密码
              </wd-button>
            </view>

            <view v-if="bindMode === 'code'" class="form">
              <wd-input
                v-model="linkCode"
                label="关联码"
                placeholder="6 位数字"
                type="number"
                :maxlength="6"
              />
            </view>
            <view v-else class="form">
              <wd-input v-model="username" label="账号" placeholder="Web 用户名或邮箱" />
              <wd-input
                v-model="password"
                label="密码"
                placeholder="Web「用户名登录」的密码"
                show-password
              />
            </view>

            <wd-button type="primary" block :loading="binding" @click="handleBind">
              确认绑定
            </wd-button>
            <wd-button type="info" block plain @click="handleRelogin">重新微信登录</wd-button>
          </view>

          <!-- 已登录 -->
          <view v-else class="card">
            <text class="card-title">{{ displayName }}</text>
            <text v-if="displayEmail" class="card-desc">{{ displayEmail }}</text>
            <text class="card-desc success">已关联 Web 账号，书架与进度已同步</text>
            <wd-button type="info" block plain @click="handleLogout">退出登录</wd-button>
          </view>

          <wd-cell-group border custom-class="menu-group">
            <wd-cell title="设置" is-link @click="goSettings" />
          </wd-cell-group>
        </view>
      </scroll-view>

      <AppTabbar />
    </view>
  </wd-config-provider>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { useTabbar } from "@/hooks/useTabbar";
import { useTheme } from "@/hooks/useTheme";
import {
  AuthNeedBindError,
  bindWechatAccount,
  getAuthPhase,
  getBindToken,
  getStoredProfile,
  getToken,
  logout,
  refreshAuthFromServer,
  type AuthPhase,
  wxLogin,
} from "@/services/auth";

const { theme, themeVars, pageShellStyle, themeRootStyle } = useTheme();
const { syncActive } = useTabbar();

const phase = ref<AuthPhase>("guest");
const loggingIn = ref(false);
const binding = ref(false);
const bindMode = ref<"code" | "account">("code");
const linkCode = ref("");
const username = ref("");
const password = ref("");
const displayName = ref("");
const displayEmail = ref("");

const subtitle = computed(() => {
  if (phase.value === "logged_in") return "账号已登录";
  if (phase.value === "need_bind") return "请完成 Web 账号绑定";
  return "个人中心";
});

function syncPhase() {
  phase.value = getAuthPhase();
  syncDisplayFromProfile();
}

function syncDisplayFromProfile() {
  const profile = getStoredProfile();
  if (phase.value === "logged_in" && profile) {
    displayName.value = profile.username || "用户";
    displayEmail.value = profile.email || "";
  } else {
    displayName.value = "";
    displayEmail.value = "";
  }
}

async function handleLogin() {
  loggingIn.value = true;
  try {
    const profile = await wxLogin();
    phase.value = "logged_in";
    displayName.value = profile.username || "用户";
    displayEmail.value = profile.email || "";
    uni.showToast({ title: "登录成功", icon: "success" });
  } catch (err) {
    if (err instanceof AuthNeedBindError) {
      phase.value = "need_bind";
      return;
    }
    uni.showToast({
      title: err instanceof Error ? err.message : "登录失败",
      icon: "none",
    });
  } finally {
    loggingIn.value = false;
  }
}

async function handleRelogin() {
  logout();
  syncPhase();
  await handleLogin();
}

async function handleBind() {
  const bind_token = getBindToken();
  if (!bind_token) {
    uni.showToast({ title: "请先点击微信登录", icon: "none" });
    phase.value = "guest";
    return;
  }

  binding.value = true;
  try {
    if (bindMode.value === "code") {
      const code = linkCode.value.trim();
      if (code.length !== 6) {
        uni.showToast({ title: "请输入 6 位关联码", icon: "none" });
        return;
      }
      await bindWechatAccount({ bind_token, link_code: code });
    } else {
      if (!username.value.trim() || !password.value) {
        uni.showToast({ title: "请填写用户名和密码", icon: "none" });
        return;
      }
      await bindWechatAccount({
        bind_token,
        username: username.value.trim(),
        password: password.value.trim(),
      });
    }
    phase.value = "logged_in";
    syncDisplayFromProfile();
    linkCode.value = "";
    password.value = "";
    uni.showToast({ title: "绑定成功", icon: "success" });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "绑定失败";
    const title = raw.includes("用户名或密码错误")
      ? "密码错误：需 Web「用户名登录」密码，或改用关联码"
      : raw;
    uni.showToast({ title, icon: "none", duration: 3000 });
  } finally {
    binding.value = false;
  }
}

function handleLogout() {
  logout();
  syncPhase();
  displayName.value = "";
  displayEmail.value = "";
  uni.showToast({ title: "已退出", icon: "none" });
}

function goSettings() {
  if (!getToken()) {
    uni.showToast({ title: "请先在下方完成登录", icon: "none" });
    return;
  }
  uni.navigateTo({ url: "/pages/settings/index" });
}

onShow(() => {
  syncActive();
  void (async () => {
    if (getAuthPhase() === "logged_in") {
      phase.value = await refreshAuthFromServer();
    } else {
      syncPhase();
    }
    syncDisplayFromProfile();
  })();
});
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
  padding: 48rpx 32rpx 32rpx;
  box-sizing: border-box;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin: 80rpx 0 32rpx;
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

.card {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding: 32rpx;
  margin-bottom: 32rpx;
  border-radius: 16rpx;
  background: var(--wot-fill-2, rgba(0, 0, 0, 0.03));
}

.card-title {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--wot-text-main);
}

.card-desc {
  font-size: 26rpx;
  line-height: 1.6;
  color: var(--wot-text-auxiliary);
}

.card-desc.success {
  color: var(--wot-primary-6);
}

.mode-row {
  display: flex;
  gap: 16rpx;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.menu-group {
  margin-top: 8rpx;
}
</style>
