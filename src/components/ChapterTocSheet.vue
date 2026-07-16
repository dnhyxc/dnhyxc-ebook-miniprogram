<template>
  <!--
    微信：自定义组件内 fixed 相对组件自身；用全屏 toc-root + absolute sheet。
    列表高度按 sheet 实测，避免 window/screen 坐标系不一致留下底空带。
  -->
  <view v-if="mounted" class="toc-root">
    <view
      class="toc-sheet"
      :class="{ 'toc-sheet--dark': dark, 'toc-sheet--closing': closing }"
      :style="sheetStyle"
    >
      <view
        class="toc-handle"
        @tap="requestClose"
        @touchstart="onHandleTouchStart"
        @touchend="onHandleTouchEnd"
      >
        <view class="toc-handle-bar" />
      </view>
      <scroll-view
        scroll-y
        class="toc-scroll"
        :style="{ height: `${scrollHeight}px` }"
        :show-scrollbar="false"
      >
        <view
          v-for="item in chapters"
          :key="item.index"
          class="toc-item"
          :class="{ 'toc-item--active': item.index === activeIndex }"
          :style="itemStyle(item)"
          @click="onSelect(item.index)"
        >
          <text
            class="toc-item__text"
            :style="item.index === activeIndex ? activeTextStyle : undefined"
          >
            {{ item.title || `第 ${item.index + 1} 章` }}
          </text>
        </view>
        <view v-if="contentSafeBottom > 0" :style="{ height: `${contentSafeBottom}px` }" />
      </scroll-view>
    </view>
  </view>
</template>

<script lang="ts">
export default {
  options: {
    virtualHost: true,
  },
};
</script>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onUnmounted, ref, watch } from "vue";
import type { ChapterMeta } from "@/types/ebook";

const TOC_HANDLE_RPX = 72;
const TOC_SWIPE_CLOSE_PX = 40;
const TOC_ANIM_MS = 280;

const props = withDefaults(
  defineProps<{
    open: boolean;
    chapters: ChapterMeta[];
    activeIndex: number;
    dark?: boolean;
    backgroundColor: string;
    color: string;
    /** 距顶 px（避开导航栏） */
    top?: number;
    /** 距底 px：阅读页传底栏高度；听书页传 0，安全区用 contentSafeBottom */
    bottom?: number;
    activeColor?: string;
    /** 列表末安全区内边距（不抬高整块抽屉） */
    contentSafeBottom?: number;
  }>(),
  {
    dark: false,
    top: 88,
    bottom: 0,
    contentSafeBottom: 0,
  },
);

const emit = defineEmits<{
  "update:open": [open: boolean];
  select: [index: number];
  closed: [];
}>();

const instance = getCurrentInstance();
const mounted = ref(false);
const closing = ref(false);
const scrollHeight = ref(120);
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let measureTimer: ReturnType<typeof setTimeout> | null = null;
let handleStartY = 0;

function handleHeightPx(): number {
  try {
    if (typeof uni.upx2px === "function") return uni.upx2px(TOC_HANDLE_RPX);
  } catch {
    // ignore
  }
  return 60;
}

function fallbackScrollHeight(): number {
  let wh = 667;
  try {
    const info = uni.getWindowInfo();
    wh = Number(info.windowHeight || info.screenHeight || 667);
  } catch {
    // ignore
  }
  return Math.max(wh - props.top - props.bottom - handleHeightPx(), 120);
}

/** 按抽屉真实高度量列表，消掉坐标系不一致造成的底空 */
function measureScrollHeight() {
  const proxy = instance?.proxy;
  const query = uni.createSelectorQuery();
  if (proxy) query.in(proxy);

  query
    .select(".toc-sheet")
    .boundingClientRect()
    .select(".toc-handle")
    .boundingClientRect()
    .exec((res) => {
      const sheet = (Array.isArray(res) ? res[0] : null) as { height?: number } | null;
      const handle = (Array.isArray(res) ? res[1] : null) as { height?: number } | null;
      const sheetH = Number(sheet?.height ?? 0);
      const handleH = Number(handle?.height ?? 0) || handleHeightPx();
      if (sheetH > handleH) {
        scrollHeight.value = Math.max(Math.floor(sheetH - handleH), 120);
        return;
      }
      scrollHeight.value = fallbackScrollHeight();
    });
}

function scheduleMeasure() {
  if (measureTimer) clearTimeout(measureTimer);
  scrollHeight.value = fallbackScrollHeight();
  void nextTick(() => {
    measureScrollHeight();
    // 动画落稳后再量一次
    measureTimer = setTimeout(() => {
      measureTimer = null;
      measureScrollHeight();
    }, 50);
  });
}

const sheetStyle = computed(() => ({
  top: `${props.top}px`,
  bottom: `${props.bottom}px`,
  backgroundColor: props.backgroundColor,
  color: props.color,
}));

const activeTextStyle = computed(() =>
  props.activeColor ? { color: props.activeColor, fontWeight: "600" as const } : undefined,
);

function itemStyle(item: ChapterMeta) {
  return { paddingLeft: `${24 + item.level * 24}rpx` };
}

function clearCloseTimer() {
  if (!closeTimer) return;
  clearTimeout(closeTimer);
  closeTimer = null;
}

function finishClose() {
  clearCloseTimer();
  mounted.value = false;
  closing.value = false;
  emit("closed");
}

function playClose() {
  if (closing.value || !mounted.value) return;
  closing.value = true;
  clearCloseTimer();
  closeTimer = setTimeout(finishClose, TOC_ANIM_MS);
}

function requestClose() {
  if (!props.open || closing.value) return;
  emit("update:open", false);
}

function onSelect(index: number) {
  emit("select", index);
  requestClose();
}

function onHandleTouchStart(e: TouchEvent) {
  if (!props.open) return;
  handleStartY = e.touches[0]?.clientY ?? 0;
}

function onHandleTouchEnd(e: TouchEvent) {
  if (!props.open || !handleStartY) {
    handleStartY = 0;
    return;
  }
  const endY = e.changedTouches[0]?.clientY ?? 0;
  if (endY - handleStartY > TOC_SWIPE_CLOSE_PX) requestClose();
  handleStartY = 0;
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      clearCloseTimer();
      closing.value = false;
      mounted.value = true;
      scheduleMeasure();
      return;
    }
    if (mounted.value) playClose();
  },
  { immediate: true },
);

watch(
  () => [props.top, props.bottom, props.chapters.length] as const,
  () => {
    if (props.open && mounted.value) scheduleMeasure();
  },
);

onUnmounted(() => {
  clearCloseTimer();
  if (measureTimer) clearTimeout(measureTimer);
});

defineExpose({
  reset() {
    clearCloseTimer();
    if (measureTimer) clearTimeout(measureTimer);
    mounted.value = false;
    closing.value = false;
  },
});
</script>

<style scoped>
.toc-root {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99;
  pointer-events: none;
}

.toc-sheet {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border-radius: 24rpx 24rpx 0 0;
  overflow: hidden;
  box-shadow: 0 -8rpx 32rpx rgba(0, 0, 0, 0.08);
  animation: toc-slide-up 0.28s cubic-bezier(0.32, 0.72, 0, 1);
  pointer-events: auto;
}

.toc-sheet--closing {
  animation: toc-slide-down 0.28s cubic-bezier(0.32, 0.72, 0, 1) forwards;
  pointer-events: none;
}

@keyframes toc-slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes toc-slide-down {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
}

.toc-handle {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  /* 原 120rpx 偏高，压缩把手区减少底部相对空感 */
  min-height: 72rpx;
  box-sizing: border-box;
}

.toc-handle-bar {
  width: 72rpx;
  height: 8rpx;
  border-radius: 999rpx;
  background: rgba(0, 0, 0, 0.12);
}

.toc-sheet--dark .toc-handle-bar {
  background: rgba(255, 255, 255, 0.2);
}

.toc-scroll {
  width: 100%;
  box-sizing: border-box;
}

.toc-item {
  display: block;
  padding: 20rpx 32rpx;
  box-sizing: border-box;
}

.toc-item__text {
  display: block;
  font-size: 32rpx;
  line-height: 1.5;
  color: inherit;
  word-break: break-all;
}

.toc-item--active .toc-item__text {
  color: var(--wot-primary-6);
  font-weight: 600;
}
</style>
