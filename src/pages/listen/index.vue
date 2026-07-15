<template>
  <!--
    设计方向：quiet paper-stage
    听书页是阅读纸张的延续，表面色/字色跟纸张主题走；强调色只留给播放与选中态。
    不用嵌在 cell 里的 segmented（微信里 getRect 量宽失败会塌成一条线）。
  -->
  <wd-config-provider :theme="configTheme" :theme-vars="listenThemeVars">
    <view class="listen-page" :class="{ 'listen-page--dark': isDarkPaper }" :style="pageStyle">
      <view class="listen-top">
        <wd-navbar
          title="听书"
          left-arrow
          fixed
          placeholder
          safe-area-inset-top
          :bordered="false"
          :custom-style="navStyle"
          @click-left="goBack"
        />
      </view>

      <view v-if="!isActive" class="listen-empty">
        <text class="listen-empty__text">暂无听书会话</text>
        <wd-button type="primary" size="small" @click="goBack">返回阅读</wd-button>
      </view>

      <view v-else class="listen-body">
        <view class="listen-main">
          <view class="listen-meta">
            <text class="listen-meta__book">{{ bookTitle }}</text>
            <text class="listen-meta__chapter">{{ chapterTitle }}</text>
          </view>

          <view class="listen-sentence-card">
            <!-- 滚动条贴卡片右缘：padding 放在内容层，不超出时原生不出现滚动 -->
            <scroll-view scroll-y enable-flex class="listen-sentence-card__scroll">
              <view class="listen-sentence-card__pad">
                <text class="listen-sentence-card__text">
                  {{
                    currentSentenceText || (status === "loading" ? "合成中…" : "点击播放开始听书")
                  }}
                </text>
              </view>
            </scroll-view>
          </view>

          <text class="listen-progress">{{ progressLabel }} 句</text>
        </view>

        <view class="listen-footer">
          <!-- 与上方句子卡片同色同圆角 -->
          <view class="listen-panel">
            <view class="listen-transport">
              <wd-button
                type="primary"
                variant="soft"
                block
                custom-class="listen-side-btn"
                @click="prevListenSentence"
              >
                上一句
              </wd-button>
              <view
                class="listen-play"
                :class="{ 'listen-play--loading': status === 'loading' }"
                :style="playCircleStyle"
                @click="onToggle"
              >
                <view class="listen-play__core">
                  <view class="listen-play__shine" />
                  <wd-loading v-if="status === 'loading'" :color="playIconColor" size="30px" />
                  <wd-icon
                    v-else
                    :name="playIcon"
                    size="48px"
                    :color="playIconColor"
                    :custom-class="
                      playIcon === 'play-arrow-fill'
                        ? 'listen-play__icon listen-play__icon--play'
                        : 'listen-play__icon'
                    "
                  />
                </view>
              </view>
              <wd-button
                type="primary"
                variant="soft"
                block
                custom-class="listen-side-btn"
                @click="nextListenSentence"
              >
                下一句
              </wd-button>
            </view>

            <view class="listen-opts">
              <view class="listen-opts__group">
                <text class="listen-opts__label">语速</text>
                <view class="listen-opts__rates">
                  <wd-button
                    v-for="r in rates"
                    :key="r"
                    type="primary"
                    :variant="rate === r ? 'base' : 'soft'"
                    custom-class="listen-rate-btn"
                    @click="setListenRate(r)"
                  >
                    {{ r }}x
                  </wd-button>
                </view>
              </view>

              <view class="listen-opts__group">
                <text class="listen-opts__label">Edge 音色</text>
                <wd-button
                  type="primary"
                  variant="soft"
                  block
                  custom-class="listen-voice-btn"
                  @click="openVoiceDrawer"
                >
                  <view class="listen-voice-btn__row">
                    <text class="listen-voice-btn__text">{{ voiceLabel }}</text>
                    <wd-icon name="arrow-right" size="16px" custom-class="listen-voice-btn__icon" />
                  </view>
                </wd-button>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- root-portal 会脱离外层 provider，抽屉内再包一层并沿用纸张 theme-vars -->
      <wd-popup
        v-model="voiceDrawerOpen"
        position="bottom"
        round
        root-portal
        :z-index="1000"
        :custom-style="popupStyle"
      >
        <wd-config-provider :theme="configTheme" :theme-vars="listenThemeVars">
          <!-- 只挂纸色 token，勿带 minHeight:100vh，否则抽屉被撑成全屏留下大块空白 -->
          <view class="voice-drawer" :style="paperTokenStyle">
            <view class="voice-drawer__handle" @tap="closeVoiceDrawer">
              <view class="voice-drawer__handle-bar" />
            </view>
            <text class="voice-drawer__title">选择 Edge 音色</text>
            <scroll-view scroll-y class="voice-drawer__scroll" :show-scrollbar="false">
              <view
                v-for="item in edgeVoices"
                :key="item.id"
                class="voice-item"
                :class="{ 'voice-item--active': voice === item.id }"
                :style="voice === item.id ? accentBtnStyle : undefined"
                @tap="onPickVoice(item.id)"
              >
                <text class="voice-item__name">{{ item.nameZh }}</text>
                <text class="voice-item__meta">
                  {{ item.gender === "female" ? "女声" : "男声" }} · {{ item.locale }}
                </text>
              </view>
            </scroll-view>
          </view>
        </wd-config-provider>
      </wd-popup>
    </view>
  </wd-config-provider>
</template>

<script setup lang="ts">
import type { ConfigProviderThemeVars } from "@wot-ui/ui";
import { onReady, onShow } from "@dcloudio/uni-app";
import { computed, ref, watch } from "vue";
import { EDGE_TTS_LISTEN_VOICES, getEdgeTtsVoiceNameZh } from "@/constants/edgeTts";
import { useChapterListen } from "@/hooks/useChapterListen";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { useThemeAccent } from "@/hooks/useTheme";

const {
  status,
  isActive,
  bookTitle,
  chapterTitle,
  currentSentenceText,
  progressLabel,
  rate,
  rates,
  voice,
  togglePlayListen,
  resumeListen,
  prevListenSentence,
  nextListenSentence,
  setListenRate,
  setListenVoice,
} = useChapterListen();

const { themeVars, accentBtnStyle } = useThemeAccent();
const { paperTheme, paperStyles, isDarkPaper } = useReaderSettings();

const voiceDrawerOpen = ref(false);
const edgeVoices = EDGE_TTS_LISTEN_VOICES;
/** 与抽屉一致：名称 + 性别 · locale，单行展示 */
const voiceLabel = computed(() => {
  const item =
    EDGE_TTS_LISTEN_VOICES.find((v) => v.id === voice.value) ?? EDGE_TTS_LISTEN_VOICES[0];
  const gender = item.gender === "female" ? "女声" : "男声";
  return `${item.nameZh} · ${gender} · ${item.locale}`;
});
const configTheme = computed(() => (isDarkPaper.value ? "dark" : "light"));
const playIcon = computed(() => (status.value === "playing" ? "pause" : "play-arrow-fill"));
const playIconColor = computed(() => String(themeVars.value.buttonMainColor ?? "#ffffff"));

function hexToRgbTuple(hex: string): { r: number; g: number; b: number } | null {
  const n = hex.replace("#", "").trim();
  const full =
    n.length === 3
      ? n
          .split("")
          .map((c) => c + c)
          .join("")
      : n;
  if (full.length !== 6) return null;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function mixHex(hex: string, withWhite: number): string {
  const rgb = hexToRgbTuple(hex);
  if (!rgb) return hex;
  const mix = (c: number) => Math.round(c + (255 - c) * withWhite);
  const to = (c: number) => mix(c).toString(16).padStart(2, "0");
  return `#${to(rgb.r)}${to(rgb.g)}${to(rgb.b)}`;
}

function rgbaFromHex(hex: string, alpha: number): string {
  const rgb = hexToRgbTuple(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** 播放键光晕 / 渐变（不用 color-mix，兼容微信） */
const playCircleStyle = computed(() => {
  const accent = String(themeVars.value.buttonPrimaryBg ?? "#dc541b");
  const deep = String(themeVars.value.buttonPrimaryBgActive ?? accent);
  return {
    "--play-accent": accent,
    "--play-accent-deep": deep,
    "--play-accent-light": mixHex(accent, 0.22),
  };
});

const paper = computed(() => paperStyles[paperTheme.value]);

/** 把纸张 bg/fg 灌进 wot 变量，按钮/文字对比度跟阅读主题一致 */
const listenThemeVars = computed<ConfigProviderThemeVars>(() => {
  const { bg, fg, dark } = paper.value;
  const base = themeVars.value;
  const inkSoft = dark ? "rgba(229, 229, 234, 0.62)" : "rgba(0, 0, 0, 0.48)";
  const inkMute = dark ? "rgba(229, 229, 234, 0.4)" : "rgba(0, 0, 0, 0.36)";
  const surface = dark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.06)";
  const surfaceSoft = dark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)";
  const border = dark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)";
  const accent = String(base.buttonPrimaryBg ?? "#dc541b");
  const softBg = String(base.buttonPrimarySoftBg ?? rgbaFromHex(accent, dark ? 0.15 : 0.12));
  // soft 按下态略加深（主题未配 SoftBgActive 时兜底）
  const softBgActive = String(
    (base as { buttonPrimarySoftBgActive?: string }).buttonPrimarySoftBgActive ??
      rgbaFromHex(accent, dark ? 0.28 : 0.22),
  );

  return {
    ...base,
    // 页面纸色；柔和按钮走 primary soft，不依赖 filledBottom
    filledBottom: bg,
    filledContent: surfaceSoft,
    filledOppo: surface,
    textMain: fg,
    textSecondary: inkSoft,
    textAuxiliary: inkMute,
    borderMain: border,
    borderLight: border,
    dividerMain: border,
    dividerLight: border,
    // 组件柔和模式：浅底 + 强调色字 + 按下加深
    buttonPrimaryBg: accent,
    buttonPrimaryBgActive: base.buttonPrimaryBgActive,
    buttonPrimaryColor: accent,
    buttonPrimaryColorActive: String(base.buttonPrimaryColorActive ?? accent),
    buttonPrimarySoftBg: softBg,
    buttonPrimarySoftBgActive: softBgActive,
    buttonMainColor: base.buttonMainColor,
  };
});

/** 纸色 CSS 变量（页面 / 抽屉共用；抽屉不要带 minHeight） */
const paperTokenStyle = computed(() => {
  const { bg, fg, dark } = paper.value;
  return {
    backgroundColor: bg,
    color: fg,
    "--listen-fg": fg,
    "--listen-bg": bg,
    "--listen-surface": dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.045)",
    "--listen-surface-strong": dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.07)",
    "--listen-ink-soft": dark ? "rgba(229,229,234,0.55)" : "rgba(0,0,0,0.45)",
    "--listen-ink-mute": dark ? "rgba(229,229,234,0.38)" : "rgba(0,0,0,0.34)",
    "--listen-divider": dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.07)",
    "--listen-handle": dark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.14)",
    // 对齐阅读页 ListenMiniBar 按钮圆角
    "--listen-radius": "12rpx",
    // 对齐 wd-button medium（上一句）高度 ≈ 40px → 80rpx
    "--listen-btn-h": "80rpx",
  };
});

const pageStyle = computed(() => ({
  ...paperTokenStyle.value,
  minHeight: "100vh",
}));

const navStyle = computed(() => {
  const { bg, fg } = paper.value;
  return [
    `background-color:${bg}`,
    `color:${fg}`,
    `--wot-navbar-bg:${bg}`,
    `--wot-navbar-color:${fg}`,
    `--wot-navbar-desc-color:${fg}`,
    `--wot-navbar-arrow-color:${fg}`,
  ].join(";");
});

const popupStyle = computed(() => {
  const { bg } = paper.value;
  return `background-color:${bg};border-radius:12rpx 12rpx 0 0;`;
});

function applyListenPageChrome() {
  const { bg } = paper.value;
  const frontColor = isDarkPaper.value ? "#ffffff" : "#000000";
  uni.setBackgroundColor({
    backgroundColor: bg,
    backgroundColorTop: bg,
    backgroundColorBottom: bg,
  });
  uni.setNavigationBarColor({
    frontColor,
    backgroundColor: bg,
  });
}

watch(
  () => [paperTheme.value, isDarkPaper.value] as const,
  () => applyListenPageChrome(),
);

onReady(() => applyListenPageChrome());
onShow(() => applyListenPageChrome());

function goBack() {
  if (voiceDrawerOpen.value) {
    closeVoiceDrawer();
    return;
  }
  uni.navigateBack();
}

function onToggle() {
  if (status.value === "loading") return;
  if (status.value === "paused") resumeListen();
  else togglePlayListen();
}

function openVoiceDrawer() {
  voiceDrawerOpen.value = true;
}

function closeVoiceDrawer() {
  voiceDrawerOpen.value = false;
}

function onPickVoice(id: string) {
  setListenVoice(id);
  voiceDrawerOpen.value = false;
  uni.showToast({ title: `已切换：${getEdgeTtsVoiceNameZh(id)}`, icon: "none" });
}
</script>

<style scoped>
.listen-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.listen-top :deep(.wd-navbar__title),
.listen-top :deep(.wd-navbar__arrow),
.listen-top :deep(.wd-navbar__text) {
  color: inherit !important;
}

.listen-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
}

.listen-empty__text {
  font-size: 28rpx;
  color: var(--listen-ink-soft);
}

.listen-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 28rpx 36rpx calc(20rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.listen-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.listen-meta {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  flex-shrink: 0;
}

.listen-meta__book {
  font-size: 24rpx;
  color: var(--listen-ink-soft);
}

.listen-meta__chapter {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--listen-fg);
  letter-spacing: 1rpx;
}

.listen-sentence-card {
  flex: 1;
  /* 允许在 flex 布局里被压缩，否则内部 scroll-view 拿不到确定高度 */
  min-height: 0;
  border-radius: var(--listen-radius);
  background: var(--listen-surface);
  box-sizing: border-box;
  overflow: hidden;
}

.listen-sentence-card__scroll {
  height: 100%;
  width: 100%;
  box-sizing: border-box;
}

/* 原卡片 padding / 居中挪到内容层，视觉不变，滚动条可贴边 */
.listen-sentence-card__pad {
  min-height: 100%;
  padding: 40rpx 36rpx;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
}

.listen-sentence-card__text {
  font-size: 40rpx;
  line-height: 1.75;
  text-align: justify;
  color: var(--listen-fg);
}

.listen-progress {
  flex-shrink: 0;
  font-size: 22rpx;
  color: var(--listen-ink-mute);
  text-align: center;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1rpx;
}

.listen-footer {
  flex-shrink: 0;
  padding-top: 20rpx;
}

.listen-panel {
  border-radius: var(--listen-radius);
  background: var(--listen-surface);
  padding: 28rpx 24rpx 24rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}

.listen-transport {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.listen-transport :deep(.listen-side-btn) {
  flex: 1;
  min-width: 0;
  height: var(--listen-btn-h) !important;
  border-radius: var(--listen-radius) !important;
}

.listen-transport :deep(.listen-side-btn::after) {
  border-radius: var(--listen-radius) !important;
}

.listen-play {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.listen-play__core {
  position: relative;
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: transform 0.18s ease;
  background: linear-gradient(
    150deg,
    var(--play-accent-light) 0%,
    var(--play-accent) 48%,
    var(--play-accent-deep) 100%
  );
  box-shadow:
    0 8rpx 20rpx rgba(0, 0, 0, 0.16),
    inset 0 3rpx 8rpx rgba(255, 255, 255, 0.28),
    inset 0 -4rpx 10rpx rgba(0, 0, 0, 0.16);
}

.listen-play__shine {
  position: absolute;
  top: -18%;
  left: -8%;
  width: 92%;
  height: 52%;
  border-radius: 50%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.36) 0%, transparent 100%);
  pointer-events: none;
}

.listen-play:active .listen-play__core {
  transform: scale(0.93);
}

.listen-play--loading .listen-play__core {
  opacity: 0.92;
}

.listen-transport :deep(.listen-play__icon--play) {
  /* 三角播放键视觉重心偏左，略右移居中 */
  margin-left: 6rpx;
}

.listen-opts {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}

.listen-opts__group {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.listen-opts__label {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--listen-fg);
  letter-spacing: 1rpx;
}

.listen-opts__rates {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.listen-opts :deep(.listen-rate-btn),
.listen-opts :deep(.listen-voice-btn) {
  height: var(--listen-btn-h) !important;
  border-radius: var(--listen-radius) !important;
}

.listen-opts :deep(.listen-rate-btn::after),
.listen-opts :deep(.listen-voice-btn::after) {
  border-radius: var(--listen-radius) !important;
}

.listen-opts :deep(.listen-rate-btn) {
  flex: 1;
  min-width: 0;
  width: 0;
  margin: 0 !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  font-variant-numeric: tabular-nums;
}

.listen-opts :deep(.listen-voice-btn) {
  padding-left: 24rpx !important;
  padding-right: 24rpx !important;
  /* 覆盖 button 默认居中，保证文案靠左、箭头靠右 */
  justify-content: flex-start !important;
  text-align: left !important;
}

.listen-opts :deep(.listen-voice-btn .wd-button__content),
.listen-opts :deep(.listen-voice-btn .wd-button__text) {
  width: 100% !important;
  max-width: 100% !important;
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  box-sizing: border-box;
}

.listen-voice-btn__row {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  box-sizing: border-box;
}

.listen-voice-btn__text {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.2;
  text-align: left;
  /* 与抽屉同内容单行完整展示，不折行、不省略 */
  white-space: nowrap;
}

.listen-opts :deep(.listen-voice-btn__icon) {
  flex-shrink: 0;
  margin-left: auto;
  color: inherit !important;
}

.voice-drawer {
  width: 100%;
  height: 70vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
  background-color: var(--listen-bg);
  color: var(--listen-fg);
}

.voice-drawer__handle {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 56rpx;
}

.voice-drawer__handle-bar {
  width: 72rpx;
  height: 8rpx;
  border-radius: 999rpx;
  background: var(--listen-handle);
}

.voice-drawer__title {
  flex-shrink: 0;
  padding: 0 32rpx 16rpx;
  font-size: 30rpx;
  font-weight: 600;
  text-align: center;
  color: var(--listen-fg);
}

.voice-drawer__scroll {
  /* 微信 scroll-view 需要明确高度；扣掉 handle/标题/安全区 */
  height: calc(70vh - 120rpx - env(safe-area-inset-bottom));
  width: 100%;
  box-sizing: border-box;
}

.voice-item {
  /* 左右 margin 给滚动条贴边留空，避免压在卡片上 */
  margin: 0 28rpx 12rpx 24rpx;
  padding: 24rpx 28rpx;
  border-radius: var(--listen-radius);
  background: var(--listen-surface-strong);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.voice-item:last-child {
  margin-bottom: 24rpx;
}

.voice-item__name {
  font-size: 28rpx;
  color: var(--listen-fg);
}

.voice-item__meta {
  font-size: 22rpx;
  color: var(--listen-ink-soft);
}

.voice-item--active .voice-item__name,
.voice-item--active .voice-item__meta {
  color: inherit;
}
</style>
