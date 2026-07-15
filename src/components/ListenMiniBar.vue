<template>
  <wd-config-provider v-if="isActive" :theme="dark ? 'dark' : 'light'" :theme-vars="miniThemeVars">
    <view class="listen-mini" :class="{ 'listen-mini--dark': dark }" @click.stop>
      <view class="listen-mini__main" @click="expandListenPage">
        <view class="listen-mini__head">
          <text class="listen-mini__chapter">{{ chapterTitle || bookTitle || "听书" }}</text>
          <text class="listen-mini__progress">{{ progressLabel }}</text>
        </view>
        <text class="listen-mini__sentence">{{ currentSentenceText || "准备朗读…" }}</text>
      </view>

      <view v-if="rateMenuOpen" class="listen-mini__rates">
        <view v-for="r in rates" :key="r" class="listen-mini__cell">
          <wd-button
            type="primary"
            :variant="rate === r ? 'base' : 'soft'"
            block
            size="small"
            custom-class="listen-mini__btn"
            @click.stop="pickRate(r)"
          >
            {{ r }}x
          </wd-button>
        </view>
      </view>

      <view class="listen-mini__actions">
        <view class="listen-mini__cell">
          <wd-button
            type="primary"
            variant="soft"
            block
            size="small"
            custom-class="listen-mini__btn"
            @click.stop="prevListenSentence"
          >
            上句
          </wd-button>
        </view>
        <view class="listen-mini__cell">
          <wd-button
            type="primary"
            variant="base"
            block
            size="small"
            custom-class="listen-mini__btn"
            @click.stop="onToggle"
          >
            {{ playLabel }}
          </wd-button>
        </view>
        <view class="listen-mini__cell">
          <wd-button
            type="primary"
            variant="soft"
            block
            size="small"
            custom-class="listen-mini__btn"
            @click.stop="nextListenSentence"
          >
            下句
          </wd-button>
        </view>
        <view class="listen-mini__cell">
          <wd-button
            type="primary"
            :variant="rateMenuOpen ? 'base' : 'soft'"
            block
            size="small"
            custom-class="listen-mini__btn"
            @click.stop="toggleRateMenu"
          >
            {{ rateLabel }}
          </wd-button>
        </view>
        <view class="listen-mini__cell">
          <wd-button
            type="primary"
            variant="soft"
            block
            size="small"
            custom-class="listen-mini__btn"
            @click.stop="expandListenPage"
          >
            展开
          </wd-button>
        </view>
      </view>
    </view>
  </wd-config-provider>
</template>

<script setup lang="ts">
import type { ConfigProviderThemeVars } from "@wot-ui/ui";
import { computed, ref, watch } from "vue";
import { useChapterListen } from "@/hooks/useChapterListen";
import { useThemeAccent } from "@/hooks/useTheme";

const emit = defineEmits<{ layout: [] }>();

const props = defineProps<{
  dark?: boolean;
}>();

const {
  status,
  isActive,
  bookTitle,
  chapterTitle,
  currentSentenceText,
  progressLabel,
  rate,
  rateLabel,
  rates,
  togglePlayListen,
  resumeListen,
  prevListenSentence,
  nextListenSentence,
  setListenRate,
  expandListenPage,
} = useChapterListen();

const { themeVars } = useThemeAccent();

const rateMenuOpen = ref(false);

const playLabel = computed(() => {
  if (status.value === "loading") return "…";
  if (status.value === "playing") return "暂停";
  return "播放";
});

/** soft 底色对齐原迷你条，并带上组件按下态 SoftBgActive */
const miniThemeVars = computed<ConfigProviderThemeVars>(() => {
  const base = themeVars.value;
  const accent = String(base.buttonPrimaryBg ?? "#dc541b");
  const dark = !!props.dark;
  return {
    ...base,
    buttonPrimaryBg: accent,
    buttonPrimaryBgActive: base.buttonPrimaryBgActive,
    buttonPrimaryColor: accent,
    buttonPrimaryColorActive: String(base.buttonPrimaryColorActive ?? accent),
    buttonPrimarySoftBg: dark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.06)",
    buttonPrimarySoftBgActive: dark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.12)",
    buttonMainColor: base.buttonMainColor,
  };
});

watch(isActive, (active) => {
  if (!active) rateMenuOpen.value = false;
});

watch(rateMenuOpen, () => {
  emit("layout");
});

function onToggle() {
  if (status.value === "loading") return;
  rateMenuOpen.value = false;
  if (status.value === "paused") resumeListen();
  else togglePlayListen();
}

function toggleRateMenu() {
  rateMenuOpen.value = !rateMenuOpen.value;
}

function pickRate(r: number) {
  setListenRate(r);
  rateMenuOpen.value = false;
}
</script>

<style scoped>
.listen-mini {
  padding: 28rpx 24rpx 24rpx;
  box-sizing: border-box;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.06);
}

.listen-mini--dark {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.listen-mini__main {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-bottom: 24rpx;
  min-width: 0;
}

.listen-mini__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.listen-mini__chapter {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  opacity: 0.55;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.listen-mini__sentence {
  font-size: 32rpx;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.listen-mini__progress {
  flex-shrink: 0;
  font-size: 26rpx;
  opacity: 0.45;
  font-variant-numeric: tabular-nums;
}

.listen-mini__rates,
.listen-mini__actions {
  display: flex;
  align-items: stretch;
  gap: 16rpx;
}

.listen-mini__rates {
  margin-bottom: 24rpx;
}

/* 等分格子包一层，避免 wd-button 按文案撑宽 */
.listen-mini__cell {
  flex: 1;
  min-width: 0;
  width: 0;
}

.listen-mini :deep(.listen-mini__btn) {
  width: 100% !important;
  height: 56rpx !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  border-radius: 12rpx !important;
  font-size: 24rpx !important;
  font-variant-numeric: tabular-nums;
  box-sizing: border-box;
}

.listen-mini :deep(.listen-mini__btn::after) {
  border-radius: 12rpx !important;
}
</style>
