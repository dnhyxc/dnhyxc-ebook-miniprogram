<template>
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
          <text class="listen-sentence-card__text">
            {{ currentSentenceText || (status === "loading" ? "合成中…" : "点击播放开始听书") }}
          </text>
        </view>

        <text class="listen-progress">{{ progressLabel }} 句</text>
      </view>

      <view class="listen-footer">
        <view class="listen-controls">
          <view class="listen-ctrl" @click="prevListenSentence">上一句</view>
          <view class="listen-ctrl listen-ctrl--primary" :style="accentBtnStyle" @click="onToggle">
            {{ status === "playing" || status === "loading" ? "暂停" : "播放" }}
          </view>
          <view class="listen-ctrl" @click="nextListenSentence">下一句</view>
        </view>

        <view class="listen-rates">
          <view
            v-for="r in rates"
            :key="r"
            class="listen-rate"
            :class="{ 'listen-rate--active': rate === r }"
            :style="rate === r ? accentBtnStyle : undefined"
            @click="setListenRate(r)"
          >
            {{ r }}x
          </view>
        </view>

        <view class="listen-stop" @click="onStop">停止听书</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onReady, onShow } from "@dcloudio/uni-app";
import { computed, watch } from "vue";
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
  togglePlayListen,
  resumeListen,
  stopListen,
  prevListenSentence,
  nextListenSentence,
  setListenRate,
} = useChapterListen();

const { paperTheme, paperStyles, isDarkPaper } = useReaderSettings();
const { accentBtnStyle } = useThemeAccent();

const pageStyle = computed(() => {
  const paper = paperStyles[paperTheme.value];
  return {
    backgroundColor: paper.bg,
    color: paper.fg,
    minHeight: "100vh",
  };
});

const navStyle = computed(() => {
  const paper = paperStyles[paperTheme.value];
  return [
    `background-color:${paper.bg}`,
    `color:${paper.fg}`,
    `--wot-navbar-bg:${paper.bg}`,
    `--wot-navbar-color:${paper.fg}`,
    `--wot-navbar-desc-color:${paper.fg}`,
    `--wot-navbar-arrow-color:${paper.fg}`,
  ].join(";");
});

function applyListenPageChrome() {
  const paper = paperStyles[paperTheme.value];
  const frontColor = isDarkPaper.value ? "#ffffff" : "#000000";
  uni.setBackgroundColor({
    backgroundColor: paper.bg,
    backgroundColorTop: paper.bg,
    backgroundColorBottom: paper.bg,
  });
  // 自定义导航栏下 frontColor 控制状态栏时间/电量颜色
  uni.setNavigationBarColor({
    frontColor,
    backgroundColor: paper.bg,
  });
}

watch(
  () => [paperTheme.value, isDarkPaper.value] as const,
  () => applyListenPageChrome(),
);

onReady(() => applyListenPageChrome());
onShow(() => applyListenPageChrome());

function goBack() {
  uni.navigateBack();
}

function onToggle() {
  if (status.value === "loading") return;
  if (status.value === "paused") resumeListen();
  else togglePlayListen();
}

function onStop() {
  stopListen();
  uni.navigateBack();
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
  opacity: 0.55;
}

.listen-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 32rpx 40rpx calc(32rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.listen-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.listen-meta {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  flex-shrink: 0;
}

.listen-meta__book {
  font-size: 26rpx;
  opacity: 0.5;
}

.listen-meta__chapter {
  font-size: 34rpx;
  font-weight: 600;
}

.listen-sentence-card {
  flex: 1;
  min-height: 200rpx;
  padding: 40rpx 32rpx;
  border-radius: 24rpx;
  background: rgba(0, 0, 0, 0.04);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.listen-page--dark .listen-sentence-card {
  background: rgba(255, 255, 255, 0.08);
}

.listen-sentence-card__text {
  font-size: 40rpx;
  line-height: 1.7;
  text-align: justify;
}

.listen-progress {
  flex-shrink: 0;
  font-size: 24rpx;
  opacity: 0.45;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.listen-footer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 40rpx;
  padding-top: 40rpx;
}

.listen-controls {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 24rpx;
}

.listen-ctrl {
  flex: 1;
  min-width: 0;
  height: 88rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  background: rgba(0, 0, 0, 0.06);
}

.listen-page--dark .listen-ctrl {
  background: rgba(255, 255, 255, 0.1);
}

.listen-ctrl--primary {
  flex: 1.2;
  font-weight: 600;
}

.listen-rates {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.listen-rate {
  flex: 1;
  min-width: 0;
  height: 64rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  background: rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
}

.listen-page--dark .listen-rate {
  background: rgba(255, 255, 255, 0.1);
}

.listen-rate--active {
  font-weight: 600;
}

.listen-stop {
  text-align: center;
  font-size: 26rpx;
  opacity: 0.55;
  padding: 8rpx 0 0;
}
</style>
