<template>
  <view v-if="isActive" class="listen-mini" :class="{ 'listen-mini--dark': dark }" @click.stop>
    <view class="listen-mini__main" @click="expandListenPage">
      <view class="listen-mini__head">
        <text class="listen-mini__chapter">{{ chapterTitle || bookTitle || "听书" }}</text>
        <text class="listen-mini__progress">{{ progressLabel }}</text>
      </view>
      <text class="listen-mini__sentence">{{ currentSentenceText || "准备朗读…" }}</text>
    </view>

    <view v-if="rateMenuOpen" class="listen-mini__rates">
      <view
        v-for="r in rates"
        :key="r"
        class="listen-mini__rate"
        :class="{ 'listen-mini__rate--active': rate === r }"
        :style="rate === r ? accentBtnStyle : undefined"
        @click.stop="pickRate(r)"
      >
        <text>{{ r }}x</text>
      </view>
    </view>

    <view class="listen-mini__actions">
      <view class="listen-mini__btn" @click.stop="prevListenSentence">
        <text>上句</text>
      </view>
      <view
        class="listen-mini__btn listen-mini__btn--primary"
        :style="accentBtnStyle"
        @click.stop="onToggle"
      >
        <text>{{ playLabel }}</text>
      </view>
      <view class="listen-mini__btn" @click.stop="nextListenSentence">
        <text>下句</text>
      </view>
      <view
        class="listen-mini__btn"
        :class="{ 'listen-mini__btn--menu-open': rateMenuOpen }"
        @click.stop="toggleRateMenu"
      >
        <text>{{ rateLabel }}</text>
      </view>
      <view class="listen-mini__btn" @click.stop="expandListenPage">
        <text>展开</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useChapterListen } from "@/hooks/useChapterListen";
import { useThemeAccent } from "@/hooks/useTheme";

const emit = defineEmits<{ layout: [] }>();

defineProps<{
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

const { accentBtnStyle } = useThemeAccent();

const rateMenuOpen = ref(false);

const playLabel = computed(() => {
  if (status.value === "loading") return "…";
  if (status.value === "playing") return "暂停";
  return "播放";
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

.listen-mini__rates {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.listen-mini__rate {
  flex: 1;
  min-width: 0;
  height: 64rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  background: rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
}

.listen-mini--dark .listen-mini__rate {
  background: rgba(255, 255, 255, 0.1);
}

.listen-mini__rate--active {
  font-weight: 600;
}

.listen-mini__actions {
  display: flex;
  align-items: center;
  gap: 24rpx; /* 与左右 padding 一致 */
}

.listen-mini__btn {
  flex: 1;
  min-width: 0;
  height: 68rpx;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  background: rgba(0, 0, 0, 0.06);
}

.listen-mini--dark .listen-mini__btn {
  background: rgba(255, 255, 255, 0.1);
}

.listen-mini__btn--primary {
  font-weight: 600;
}

.listen-mini__btn--menu-open {
  font-weight: 600;
  opacity: 1;
}
</style>
