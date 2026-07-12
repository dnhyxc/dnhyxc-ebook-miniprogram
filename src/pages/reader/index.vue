<template>
  <view class="reader" :style="readerShellStyle">
    <view v-show="chromeVisible" class="reader-top">
      <wd-navbar
        :title="chapterTitle || bookTitle"
        left-arrow
        fixed
        placeholder
        safe-area-inset-top
        :bordered="false"
        :custom-style="topBarStyle"
        @click-left="goBack"
      >
        <template #right>
          <view class="nav-actions" @click.stop>
            <view class="nav-action" @click="tocOpen = true">
              <AppIcon name="list" :size="20" :color="readerStyle.color" />
            </view>
            <view class="nav-action" @click="settingsOpen = true">
              <AppIcon name="settings" :size="20" :color="readerStyle.color" />
            </view>
          </view>
        </template>
      </wd-navbar>
    </view>

    <scroll-view
      v-if="chapterHtml"
      scroll-y
      class="reader-scroll"
      :scroll-top="scrollTop"
      :style="scrollAreaStyle"
      @scroll="onScroll"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @tap="toggleChrome"
    >
      <view class="reader-body" :style="readerStyle">
        <mp-html
          :key="chapterRenderKey"
          :content="chapterHtml"
          :copy-link="false"
          lazy-load
          :tag-style="mpTagStyle"
          :container-style="containerStyle"
        />
      </view>
    </scroll-view>

    <view v-else-if="loading" class="reader-state">
      <wd-loading />
      <text class="state-text">{{ loadingText }}</text>
    </view>

    <view v-else class="reader-state">
      <text class="state-text">{{ error || "暂无内容" }}</text>
      <wd-button v-if="error" type="primary" plain size="small" @click="initReader(true)">
        重试
      </wd-button>
    </view>

    <view
      v-show="chromeVisible && chapterHtml"
      class="reader-bottom"
      :style="bottomBarStyle"
      @click.stop
    >
      <wd-button size="small" :disabled="prevIndex == null" @click="goPrev"> 上一章 </wd-button>
      <text class="chapter-indicator">{{ chapterIndex + 1 }} / {{ chapterTotal }}</text>
      <wd-button size="small" :disabled="nextIndex == null" @click="goNext"> 下一章 </wd-button>
    </view>

    <wd-popup v-model="tocOpen" position="left" custom-style="width: 75vw; height: 100vh;">
      <view class="toc-panel">
        <text class="toc-title">目录</text>
        <scroll-view scroll-y class="toc-scroll">
          <view
            v-for="item in toc"
            :key="`${item.href}-${item.level}`"
            class="toc-item"
            :class="{ active: item.index === chapterIndex }"
            :style="{ paddingLeft: `${24 + item.level * 24}rpx` }"
            @click="goChapter(item.index)"
          >
            {{ item.title || `第 ${item.index + 1} 章` }}
          </view>
        </scroll-view>
      </view>
    </wd-popup>

    <wd-popup v-model="settingsOpen" position="bottom" round>
      <view class="settings-panel">
        <text class="settings-title">阅读设置</text>
        <view class="settings-row">
          <text>字号</text>
          <view class="font-actions">
            <wd-button size="small" @click="bumpFontSize(-1)">A-</wd-button>
            <text>{{ fontSize }}</text>
            <wd-button size="small" @click="bumpFontSize(1)">A+</wd-button>
          </view>
        </view>
        <view class="settings-row settings-row-wrap">
          <text>字体</text>
          <view class="option-actions">
            <wd-button
              v-for="opt in fontFamilies"
              :key="opt.value"
              size="small"
              :type="fontFamily === opt.value ? 'primary' : 'info'"
              @click="fontFamily = opt.value"
            >
              {{ opt.label }}
            </wd-button>
          </view>
        </view>
        <view class="settings-row settings-row-wrap">
          <text>行距</text>
          <view class="option-actions">
            <wd-button
              v-for="h in lineHeightOptions"
              :key="h"
              size="small"
              :type="lineHeight === h ? 'primary' : 'info'"
              @click="setLineHeight(h)"
            >
              {{ h }}x
            </wd-button>
          </view>
        </view>
        <view class="settings-row settings-row-wrap">
          <text>背景</text>
          <view class="option-actions">
            <wd-button
              v-for="opt in paperOptions"
              :key="opt.value"
              size="small"
              :type="paperTheme === opt.value ? 'primary' : 'info'"
              @click="paperTheme = opt.value"
            >
              {{ opt.label }}
            </wd-button>
          </view>
        </view>
      </view>
    </wd-popup>
  </view>
</template>

<script setup lang="ts">
import { onHide, onLoad, onUnload } from "@dcloudio/uni-app";
import { computed, nextTick, ref } from "vue";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { ApiError } from "@/services/http";
import { fetchBook, fetchChapter, fetchChapters } from "@/services/ebook";
import { flushProgressSave, scheduleProgressSave } from "@/services/progress-sync";
import { getChapterCache, setChapterCache } from "@/services/reader-cache";
import type { ChapterContent, ChapterMeta } from "@/types/ebook";
import { calculatePercent } from "@/types/ebook";

const bookId = ref("");
const bookTitle = ref("");
const chapterTitle = ref("");
const chapterHtml = ref("");
const chapterRenderKey = ref(0);
const chapterIndex = ref(0);
const chapterTotal = ref(0);
const chapterHref = ref("");
const prevIndex = ref<number | null>(null);
const nextIndex = ref<number | null>(null);
const toc = ref<ChapterMeta[]>([]);

const loading = ref(true);
const loadingText = ref("加载中…");
const error = ref("");
const chromeVisible = ref(true);
const tocOpen = ref(false);
const settingsOpen = ref(false);

const scrollTop = ref(0);
const scrollHeight = ref(1);
const viewportHeight = ref(1);
let scrollThrottleTimer: ReturnType<typeof setTimeout> | null = null;

const touchStartX = ref(0);
const touchStartY = ref(0);
const touchEndX = ref(0);
const touchEndY = ref(0);
const isSwiping = ref(false);

const {
  fontSize,
  paperTheme,
  fontFamily,
  lineHeight,
  readerStyle,
  mpTagStyle,
  bumpFontSize,
  setLineHeight,
  fontFamilies,
  lineHeightOptions,
  paperOptions,
} = useReaderSettings();

const readerShellStyle = computed(() => ({
  backgroundColor: readerStyle.value.backgroundColor,
  minHeight: "100vh",
}));

const containerStyle = computed(
  () =>
    `font-size:${readerStyle.value.fontSize};color:${readerStyle.value.color};line-height:${readerStyle.value.lineHeight};font-family:${readerStyle.value.fontFamily}`,
);

const scrollAreaStyle = computed(() => ({
  paddingBottom: chromeVisible.value ? "120rpx" : "0",
}));

const topBarStyle = computed(
  () =>
    `background-color: ${readerStyle.value.backgroundColor}; color: ${readerStyle.value.color};`,
);

const bottomBarStyle = computed(() => ({
  backgroundColor: readerStyle.value.backgroundColor,
  color: readerStyle.value.color,
  borderTop: `1px solid ${paperTheme.value === "dark" ? "#333" : "#e5e5e5"}`,
}));

onLoad((query) => {
  bookId.value = String(query?.bookId ?? "");
  if (!bookId.value) {
    error.value = "缺少 bookId";
    loading.value = false;
    return;
  }
  void initReader();
});

onHide(() => {
  void flushProgressSave();
});

onUnload(() => {
  void flushProgressSave();
});

function goBack() {
  uni.navigateBack();
}

function toggleChrome() {
  chromeVisible.value = !chromeVisible.value;
}

let parsePollCount = 0;
const PARSE_POLL_MAX = 24;
const PARSE_POLL_INTERVAL_MS = 5000;

function parsePendingText(): string {
  return parsePollCount >= 5 ? "书籍解析中，大文件可能需要 1–2 分钟…" : "书籍解析中，请稍候…";
}

function isChapterParsePending(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  const msg = err.message;
  return !msg.includes("失败") && !msg.includes("不存在") && !msg.includes("重新上传");
}

function resolveStartIndex(
  progChapterIndex: number | undefined,
  progPercent: number | undefined,
  total: number,
): number {
  if (progChapterIndex != null && progChapterIndex >= 0) {
    return Math.min(progChapterIndex, total - 1);
  }
  if (progPercent != null && total > 0) {
    return Math.min(Math.floor(progPercent * total), total - 1);
  }
  return 0;
}

async function initReader(forceRefresh = false) {
  loading.value = true;
  loadingText.value = "加载中…";
  error.value = "";
  chapterHtml.value = "";

  try {
    const [book, chaptersRes] = await Promise.all([
      fetchBook(bookId.value),
      fetchChapters(bookId.value),
    ]);

    parsePollCount = 0;
    bookTitle.value = book.title;
    toc.value = chaptersRes.chapters;
    chapterTotal.value = chaptersRes.total;

    const startIndex = resolveStartIndex(
      book.prog?.chapterIndex,
      book.prog?.percent,
      chaptersRes.total,
    );

    await loadChapter(startIndex, book.prog?.scrollPercent ?? 0, forceRefresh);
  } catch (err) {
    if (isChapterParsePending(err)) {
      parsePollCount += 1;
      if (parsePollCount > PARSE_POLL_MAX) {
        error.value = "解析时间较长，请稍后重试或联系管理员";
        loading.value = false;
        return;
      }
      loadingText.value = parsePendingText();
      setTimeout(() => void initReader(), PARSE_POLL_INTERVAL_MS);
      return;
    }
    error.value = err instanceof Error ? err.message : "加载失败";
    loading.value = false;
  }
}

async function loadChapter(index: number, restoreScrollPercent = 0, forceRefresh = false) {
  loading.value = true;
  error.value = "";

  try {
    let data: ChapterContent;
    const cached = !forceRefresh ? getChapterCache(bookId.value, index) : null;

    if (cached) {
      data = {
        bookId: cached.bookId,
        index: cached.index,
        title: cached.title,
        html: cached.html,
        prevIndex: index > 0 ? index - 1 : null,
        nextIndex: index < chapterTotal.value - 1 ? index + 1 : null,
        total: chapterTotal.value,
      };
    } else {
      data = await fetchChapter(bookId.value, index);
      setChapterCache(bookId.value, index, data.html, data.title);
    }

    // ponytail: mp-html 在 nodes 变短时会用 {} 填充，原地更新会触发 n.attrs.id 崩溃；先卸再挂
    chapterHtml.value = "";
    await nextTick();

    chapterIndex.value = data.index;
    chapterTitle.value = data.title;
    chapterHref.value = toc.value[index]?.href ?? "";
    prevIndex.value = data.prevIndex;
    nextIndex.value = data.nextIndex;
    chapterTotal.value = data.total;
    tocOpen.value = false;
    chapterRenderKey.value += 1;
    chapterHtml.value = data.html;

    scrollTop.value = 0;
    await new Promise((r) => setTimeout(r, 50));
    if (restoreScrollPercent > 0 && scrollHeight.value > viewportHeight.value) {
      const maxScroll = scrollHeight.value - viewportHeight.value;
      scrollTop.value = Math.floor(maxScroll * restoreScrollPercent);
    }

    persistProgress(restoreScrollPercent);
  } catch (err) {
    if (isChapterParsePending(err)) {
      parsePollCount += 1;
      if (parsePollCount > PARSE_POLL_MAX) {
        error.value = "解析时间较长，请稍后重试";
        loading.value = false;
        return;
      }
      loadingText.value = parsePendingText();
      setTimeout(
        () => void loadChapter(index, restoreScrollPercent, forceRefresh),
        PARSE_POLL_INTERVAL_MS,
      );
      return;
    }
    error.value = err instanceof Error ? err.message : "章节加载失败";
  } finally {
    loading.value = false;
  }
}

function goChapter(index: number) {
  if (index < 0 || index >= chapterTotal.value) return;
  void loadChapter(index, 0);
}

function goPrev() {
  if (prevIndex.value != null) goChapter(prevIndex.value);
}

function goNext() {
  if (nextIndex.value != null) goChapter(nextIndex.value);
}

function onTouchStart(e: { touches: { clientX: number; clientY: number }[] }) {
  touchStartX.value = e.touches[0].clientX;
  touchStartY.value = e.touches[0].clientY;
  isSwiping.value = false;
}

function onTouchMove(e: { touches: { clientX: number; clientY: number }[] }) {
  touchEndX.value = e.touches[0].clientX;
  touchEndY.value = e.touches[0].clientY;
  const deltaX = touchEndX.value - touchStartX.value;
  const deltaY = touchEndY.value - touchStartY.value;
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
    isSwiping.value = true;
  }
}

function onTouchEnd() {
  if (!isSwiping.value) return;
  const deltaX = touchEndX.value - touchStartX.value;
  if (deltaX < -80 && nextIndex.value != null) goNext();
  else if (deltaX > 80 && prevIndex.value != null) goPrev();
  isSwiping.value = false;
}

function onScroll(e: { detail: { scrollTop: number; scrollHeight: number } }) {
  const { scrollTop: top, scrollHeight: height } = e.detail;
  scrollHeight.value = height;
  if (viewportHeight.value <= 1) viewportHeight.value = Math.max(height * 0.3, 400);

  if (scrollThrottleTimer) return;
  scrollThrottleTimer = setTimeout(() => {
    scrollThrottleTimer = null;
    const maxScroll = Math.max(scrollHeight.value - viewportHeight.value, 1);
    const ratio = Math.min(1, Math.max(0, top / maxScroll));
    persistProgress(ratio);
  }, 2000);
}

function persistProgress(scrollPercent: number) {
  if (!bookId.value || chapterTotal.value <= 0) return;

  scheduleProgressSave({
    bookId: bookId.value,
    chapterIndex: chapterIndex.value,
    chapterHref: chapterHref.value,
    scrollPercent,
    percent: calculatePercent(chapterIndex.value, scrollPercent, toc.value),
  });
}
</script>

<style scoped>
.reader {
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
}

.reader-scroll {
  flex: 1;
  height: 0;
}

.reader-body {
  padding: 32rpx 40rpx 48rpx;
  box-sizing: border-box;
}

.reader-top :deep(.wd-navbar__right) {
  padding-right: 16rpx;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.nav-action {
  display: flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}

.reader-bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 32rpx calc(16rpx + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 100;
}

.chapter-indicator {
  font-size: 26rpx;
  opacity: 0.7;
}

.reader-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
}

.state-text {
  font-size: 28rpx;
  color: var(--wot-text-auxiliary);
}

.toc-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: calc(24rpx + env(safe-area-inset-top)) 0 24rpx;
  box-sizing: border-box;
}

.toc-title {
  font-size: 32rpx;
  font-weight: 600;
  padding: 0 32rpx 24rpx;
}

.toc-scroll {
  flex: 1;
  height: 0;
}

.toc-item {
  padding: 20rpx 32rpx;
  font-size: 28rpx;
  color: var(--wot-text-main);
}

.toc-item.active {
  color: var(--wot-primary-6);
  font-weight: 600;
}

.settings-panel {
  padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
}

.settings-title {
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 32rpx;
  display: block;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
  font-size: 28rpx;
}

.settings-row-wrap {
  flex-direction: column;
  align-items: flex-start;
  gap: 16rpx;
}

.font-actions,
.option-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16rpx;
}
</style>
