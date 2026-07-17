<template>
  <!--
    刻度横滑、指针固定居中。
    ponytail: 滑动中必须把 scrollLeft 同步成 liveLeft，否则 draft 重渲染会回写旧 scroll-left → 整页抖。
  -->
  <view class="rate-picker">
    <text class="rate-picker__value">{{ displayLabel }}</text>

    <view :id="wrapId" class="rate-picker__ruler">
      <view class="rate-picker__pointer" aria-hidden="true">
        <view class="rate-picker__tri" />
        <view class="rate-picker__line" />
      </view>

      <scroll-view
        class="rate-picker__scroll"
        scroll-x
        :show-scrollbar="false"
        :scroll-left="scrollLeft"
        :scroll-with-animation="scrollAnim"
        @scroll="onScroll"
        @touchstart="onTouchStart"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <view class="rate-picker__track" :style="{ width: `${trackWidthPx}px` }">
          <view class="rate-picker__pad" :style="{ width: `${padPx}px` }" />
          <view
            v-for="tick in ticks"
            :key="tick.rate"
            class="rate-picker__cell"
            :style="{ width: `${tickWpx}px` }"
          >
            <view
              class="rate-picker__mark"
              :class="{
                'rate-picker__mark--major': tick.major,
                'rate-picker__mark--active': tick.index === activeIndex,
              }"
            />
            <text v-if="tick.major" class="rate-picker__label">{{ formatRate(tick.rate) }}</text>
          </view>
          <view class="rate-picker__pad" :style="{ width: `${padPx}px` }" />
        </view>
      </scroll-view>
    </view>

    <view class="rate-picker__presets">
      <view
        v-for="p in presets"
        :key="p"
        class="rate-picker__preset"
        :class="{ 'rate-picker__preset--active': approx(p, draftRate) }"
        @tap.stop="onPreset(p)"
      >
        <text class="rate-picker__preset-text">{{ formatPreset(p) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onMounted, ref, watch } from "vue";

const RATE_MIN = 0.5;
const RATE_MAX = 3;
const RATE_STEP = 0.1;
const PRESETS = [0.8, 1, 1.5, 2, 3] as const;
const TICK_RPX = 40;

const props = defineProps<{
  modelValue: number;
  active?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [number];
}>();

const presets = PRESETS;
const wrapId = `rate-ruler-${Math.random().toString(36).slice(2, 8)}`;
const instance = getCurrentInstance();

type Tick = { rate: number; major: boolean; index: number };

const ticks: Tick[] = (() => {
  const list: Tick[] = [];
  const steps = Math.round((RATE_MAX - RATE_MIN) / RATE_STEP);
  for (let i = 0; i <= steps; i += 1) {
    const rate = Math.round((RATE_MIN + i * RATE_STEP) * 10) / 10;
    list.push({ rate, major: Math.round(rate * 10) % 5 === 0, index: i });
  }
  return list;
})();

const tickWpx = ref(20);
const padPx = ref(0);
const scrollLeft = ref(0);
const scrollAnim = ref(false);
const draftRate = ref(clampRate(props.modelValue));
const activeIndex = ref(indexOfRate(draftRate.value));
const displayLabel = computed(() => formatRate(draftRate.value));

let liveLeft = 0;
let touching = false;
let progLock = 0;
let snapTimer: ReturnType<typeof setTimeout> | null = null;
let measured = false;
/** rAF 合并 draft 更新，减少滑动中 setData 次数 */
let rafId = 0;
let pendingDraft = draftRate.value;

const trackWidthPx = computed(() => padPx.value * 2 + tickWpx.value * ticks.length);

function clampRate(n: number): number {
  const x = Math.round(n * 10) / 10;
  return Math.min(RATE_MAX, Math.max(RATE_MIN, x));
}

function formatRate(n: number): string {
  return `${clampRate(n).toFixed(1)}x`;
}

function formatPreset(n: number): string {
  return clampRate(n).toFixed(1);
}

function approx(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.05;
}

function indexOfRate(rate: number): number {
  return Math.round((clampRate(rate) - RATE_MIN) / RATE_STEP);
}

function rateFromScroll(left: number): number {
  const w = Math.max(1, tickWpx.value);
  const idx = Math.round(left / w);
  const maxIdx = ticks.length - 1;
  const clamped = Math.min(maxIdx, Math.max(0, idx));
  return ticks[clamped]?.rate;
}

function scrollForRate(rate: number): number {
  return indexOfRate(rate) * tickWpx.value;
}

function clearSnapTimer() {
  if (snapTimer == null) return;
  clearTimeout(snapTimer);
  snapTimer = null;
}

function flushDraft() {
  rafId = 0;
  const next = pendingDraft;
  if (approx(next, draftRate.value)) return;
  draftRate.value = next;
  activeIndex.value = indexOfRate(next);
}

function queueDraft(next: number) {
  pendingDraft = next;
  if (rafId) return;
  rafId =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(flushDraft)
      : (setTimeout(flushDraft, 16) as unknown as number);
}

function measure(): Promise<void> {
  return new Promise((resolve) => {
    const tw = Math.max(8, Math.round(uni.upx2px(TICK_RPX)));
    tickWpx.value = tw;

    const finish = (width: number) => {
      let w = width;
      if (!(w > 0) && typeof uni.getSystemInfoSync === "function") {
        w = uni.getSystemInfoSync().windowWidth;
      }
      if (!(w > 0)) w = 375;
      padPx.value = Math.max(0, Math.round(w / 2 - tw / 2));
      measured = true;
      resolve();
    };

    const q = uni.createSelectorQuery();
    const proxy = instance?.proxy;
    if (proxy) q.in(proxy as never);
    q.select(`#${wrapId}`)
      .boundingClientRect((rect) => {
        const box = (Array.isArray(rect) ? rect[0] : rect) as { width?: number } | null;
        finish(Number(box?.width ?? 0));
      })
      .exec();
  });
}

function setScrollLeftTo(left: number, anim: boolean) {
  const target = Math.max(0, Math.round(left));
  progLock += 1;
  const lock = progLock;
  scrollAnim.value = anim;
  liveLeft = target;
  // 同值不触发微信 scroll-view，先错开再设目标
  scrollLeft.value = target + (target === 0 ? 0.01 : -0.01);
  nextTick(() => {
    scrollLeft.value = target;
    setTimeout(
      () => {
        if (lock !== progLock) return;
        progLock = 0;
        scrollAnim.value = false;
        liveLeft = target;
        scrollLeft.value = target;
      },
      anim ? 280 : 80,
    );
  });
}

/** 已向父组件提交过的倍速，防止吸附/关抽屉重复 emit */
let lastCommitted = clampRate(props.modelValue);

function commitToParent(next = draftRate.value) {
  const rate = clampRate(next);
  if (approx(rate, lastCommitted)) return;
  lastCommitted = rate;
  emit("update:modelValue", rate);
}

/** 停稳后吸附并立刻改播放倍速（滑动过程不提交） */
function snapAndCommit() {
  if (!measured || touching || progLock > 0) return;
  const next = rateFromScroll(liveLeft);
  const targetLeft = scrollForRate(next);
  draftRate.value = next;
  activeIndex.value = indexOfRate(next);
  pendingDraft = next;
  if (Math.abs(liveLeft - targetLeft) > 0.5) {
    setScrollLeftTo(targetLeft, true);
  } else {
    liveLeft = targetLeft;
    scrollLeft.value = targetLeft;
  }
  commitToParent(next);
}

function scheduleSettle() {
  clearSnapTimer();
  snapTimer = setTimeout(() => {
    snapTimer = null;
    if (touching || progLock > 0) return;
    snapAndCommit();
  }, 320);
}

function onTouchStart() {
  touching = true;
  clearSnapTimer();
  progLock = 0;
  scrollAnim.value = false;
}

function onTouchEnd() {
  touching = false;
  flushDraft();
  scheduleSettle();
}

function onScroll(e: { detail?: { scrollLeft?: number } }) {
  const left = Number(e.detail?.scrollLeft ?? 0);
  // 程序化定位中忽略回写：抽屉刚开时常见 scrollLeft=0，会把目标倍速冲回 0.5x
  if (progLock > 0 && !touching) return;
  liveLeft = left;
  // 关键：重渲染前把绑定值改成当前位置，杜绝旧 scroll-left 回写造成抖动
  if (!scrollAnim.value) {
    scrollLeft.value = left;
  }
  queueDraft(rateFromScroll(left));
  if (!touching) scheduleSettle();
}

function onPreset(p: number) {
  touching = false;
  clearSnapTimer();
  const next = clampRate(p);
  draftRate.value = next;
  activeIndex.value = indexOfRate(next);
  pendingDraft = next;
  setScrollLeftTo(scrollForRate(next), true);
  commitToParent(next);
}

async function syncOpen() {
  await nextTick();
  // 抽屉动画/布局未完成时 measure 与 scroll-left 常无效，多等一帧
  await new Promise<void>((r) => setTimeout(r, 80));
  await measure();
  await nextTick();
  const next = clampRate(props.modelValue);
  draftRate.value = next;
  activeIndex.value = indexOfRate(next);
  pendingDraft = next;
  lastCommitted = next;
  const target = scrollForRate(next);
  liveLeft = target;
  setScrollLeftTo(target, false);
  // scroll-view 在抽屉内二次钉位，避免首次赋 src 被忽略
  await new Promise<void>((r) => setTimeout(r, 160));
  if (touching) return;
  const again = clampRate(props.modelValue);
  draftRate.value = again;
  activeIndex.value = indexOfRate(again);
  pendingDraft = again;
  lastCommitted = again;
  setScrollLeftTo(scrollForRate(again), false);
}

onMounted(() => {
  // 仅量宽；真正滚到倍速等抽屉 active 再 sync（隐藏态设 scroll-left 无效）
  void measure();
});

watch(
  () => props.active,
  (open, wasOpen) => {
    if (open) {
      void syncOpen();
      return;
    }
    // 关抽屉再兜底提交一次（若停稳时已提交则 lastCommitted 会跳过）
    if (wasOpen) {
      clearSnapTimer();
      flushDraft();
      commitToParent();
    }
  },
);

watch(
  () => props.modelValue,
  (v) => {
    if (touching || progLock > 0) return;
    const next = clampRate(v);
    draftRate.value = next;
    activeIndex.value = indexOfRate(next);
    pendingDraft = next;
    lastCommitted = next;
    // 抽屉未开时只改文案/预设选中；刻度等打开再 syncOpen
    if (!props.active) return;
    if (approx(v, rateFromScroll(liveLeft))) return;
    setScrollLeftTo(scrollForRate(next), false);
  },
);
</script>

<style scoped>
.rate-picker {
  width: 100%;
  box-sizing: border-box;
  padding: 8rpx 0 12rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: transparent;
  color: var(--listen-fg, #1a1a1a);
  /* 隔离绘制，减轻滑动时整页重绘 */
  transform: translateZ(0);
}

.rate-picker__value {
  font-size: 64rpx;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 1rpx;
  color: var(--listen-fg, #1a1a1a);
  font-variant-numeric: tabular-nums;
  margin-bottom: 36rpx;
}

.rate-picker__ruler {
  position: relative;
  width: 100%;
  height: 120rpx;
  margin-bottom: 48rpx;
  overflow: hidden;
}

.rate-picker__pointer {
  position: absolute;
  left: 50%;
  top: 0;
  z-index: 2;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  height: 72rpx;
}

.rate-picker__tri {
  width: 0;
  height: 0;
  border-left: 10rpx solid transparent;
  border-right: 10rpx solid transparent;
  border-top: 14rpx solid var(--listen-accent, #dc541b);
  margin-bottom: -2rpx;
}

.rate-picker__line {
  width: 4rpx;
  flex: 1;
  background: var(--listen-accent, #dc541b);
  border-radius: 2rpx;
}

.rate-picker__scroll {
  width: 100%;
  height: 120rpx;
}

.rate-picker__track {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  height: 120rpx;
  box-sizing: border-box;
}

.rate-picker__pad {
  flex-shrink: 0;
  height: 1px;
}

.rate-picker__cell {
  flex-shrink: 0;
  height: 120rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  padding-top: 22rpx;
}

.rate-picker__mark {
  width: 2rpx;
  height: 22rpx;
  border-radius: 2rpx;
  background: var(--listen-ink-mute, rgba(0, 0, 0, 0.28));
}

.rate-picker__mark--major {
  height: 36rpx;
  width: 3rpx;
  background: var(--listen-ink-soft, rgba(0, 0, 0, 0.45));
}

.rate-picker__mark--active {
  background: var(--listen-accent, #dc541b);
  width: 3rpx;
}

.rate-picker__label {
  margin-top: 10rpx;
  font-size: 20rpx;
  line-height: 1;
  color: var(--listen-ink-mute, rgba(0, 0, 0, 0.34));
  font-variant-numeric: tabular-nums;
}

.rate-picker__presets {
  width: 100%;
  padding: 0 40rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.rate-picker__preset {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  box-sizing: border-box;
  border: 2rpx solid var(--listen-divider, rgba(0, 0, 0, 0.1));
  background: var(--listen-surface, rgba(0, 0, 0, 0.045));
  display: flex;
  align-items: center;
  justify-content: center;
}

.rate-picker__preset--active {
  border-color: var(--listen-accent, #dc541b);
  background: var(--listen-surface-strong, rgba(0, 0, 0, 0.07));
}

.rate-picker__preset-text {
  font-size: 28rpx;
  font-weight: 500;
  color: var(--listen-fg, #1a1a1a);
  font-variant-numeric: tabular-nums;
}

.rate-picker__preset--active .rate-picker__preset-text {
  color: var(--listen-accent, #dc541b);
}
</style>
