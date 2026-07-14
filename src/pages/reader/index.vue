<template>
  <view class="reader" :style="readerShellStyle">
    <view
      class="reader-top"
      @tap="onReaderTopTap"
      @touchstart="onTocHeaderTouchStart"
      @touchend="onTocHeaderTouchEnd"
    >
      <wd-navbar
        :title="chapterTitle || bookTitle"
        left-arrow
        fixed
        placeholder
        safe-area-inset-top
        :bordered="false"
        :custom-style="topBarStyle"
        @click-left="goBack"
      />
    </view>

    <scroll-view
      v-if="hasContent"
      scroll-y
      enhanced
      :bounces="false"
      class="reader-scroll"
      :style="scrollViewStyle"
      :scroll-top="scrollTop"
      :scroll-with-animation="false"
      lower-threshold="280"
      upper-threshold="280"
      @scroll="onScroll"
      @scrolltolower="onScrollNearEnd"
      @scrolltoupper="onScrollNearStart"
      @touchstart="onReaderContentTouchStart"
    >
      <view
        class="reader-stream"
        :style="streamPaddingStyle"
        @touchstart="onReaderContentTouchStart"
        @tap="toggleChrome"
      >
        <view
          v-for="block in chapterBlocks"
          :id="`chapter-${block.index}`"
          :key="block.index"
          class="chapter-block"
          :style="chapterBlockStyle"
        >
          <view
            v-if="block.title"
            class="chapter-heading"
            :style="`font-size:${readerStyle.fontSize};color:${readerStyle.color}`"
          >
            {{ block.title }}
          </view>
          <!-- 听书当前章：块级原生 view 定位，避免往 mp-html 灌句锚 -->
          <template v-if="mpHtmlMounted && isListenSegmentedChapter(block.index)">
            <view
              v-for="(seg, si) in block.segments"
              :id="`ls-${block.index}-${si}`"
              :key="`ls-${block.index}-${si}`"
              class="chapter-seg"
            >
              <mp-html
                :id="`mp-html-${block.index}-${si}`"
                :content="seg.html || ''"
                :container-style="containerStyle"
                :tag-style="mpTagStyle"
                :copy-link="false"
                :lazy-load="true"
                :domain="''"
                :error-img="''"
                :loading-img="''"
                :scroll-table="false"
                :selectable="false"
                :use-anchor="false"
              />
            </view>
          </template>
          <mp-html
            v-else-if="mpHtmlMounted"
            :id="`mp-html-${block.index}`"
            :content="block.html || ''"
            :container-style="containerStyle"
            :tag-style="mpTagStyle"
            :copy-link="false"
            :lazy-load="true"
            :domain="''"
            :error-img="''"
            :loading-img="''"
            :scroll-table="false"
            :selectable="false"
            :use-anchor="false"
          />
        </view>
        <view v-if="loadingMore" class="stream-loading">
          <wd-loading size="20px" />
        </view>
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

    <!-- 听书跟读中且底栏收起：右下角圆形入口 -->
    <view
      v-if="showListenFloat"
      class="reader-listen-float"
      :class="{ 'reader-listen-float--playing': listenStatus === 'playing' }"
      :style="listenFloatStyle"
      @click.stop="onListenFloatTap"
    >
      <text class="reader-listen-float__text">听</text>
    </view>

    <view
      v-if="hasContent"
      class="reader-chrome-bottom"
      :class="{
        'reader-chrome-bottom--visible': chromeVisible,
        'reader-chrome-bottom--dark': isDarkPaper,
      }"
      :style="chromeBarStyle"
      @click.stop
    >
      <!-- 挂在底栏上沿：高度随迷你条/子面板变化，不会钻进栏内 -->
      <view
        v-if="showListenFollowFab && chromeVisible"
        class="reader-listen-follow reader-listen-follow--docked"
        :style="accentBtnStyle"
        @click.stop="onListenFollowTap"
      >
        <text class="reader-listen-follow__text">回位</text>
      </view>
      <ListenMiniBar :dark="isDarkPaper" @layout="onListenMiniLayout" />

      <view v-if="bottomPanel" class="reader-subpanel">
        <view v-if="bottomPanel === 'theme'" class="subpanel-section">
          <text class="subpanel-label">背景</text>
          <view class="theme-swatches">
            <view
              v-for="opt in paperOptions"
              :key="opt.value"
              class="theme-swatch"
              :class="{
                'theme-swatch--active': paperTheme === opt.value,
                'theme-swatch--dark': paperStyles[opt.value].dark,
              }"
              @click="paperTheme = opt.value"
            >
              <view
                class="theme-swatch__fill"
                :style="{ backgroundColor: paperStyles[opt.value].bg }"
              />
            </view>
          </view>
        </view>

        <view v-else-if="bottomPanel === 'pageMode'" class="subpanel-section">
          <text class="subpanel-label">翻页</text>
          <view class="option-pills">
            <view
              v-for="opt in pageModeOptions"
              :key="opt.value"
              class="option-pill"
              :class="{ active: pageMode === opt.value }"
              @click="setPageMode(opt.value)"
            >
              {{ opt.label }}
            </view>
          </view>
        </view>

        <view v-else-if="bottomPanel === 'typography'" class="subpanel-section subpanel-typography">
          <view class="typo-slider">
            <view class="typo-slider-head">
              <text class="typo-slider-label">字号</text>
              <text class="typo-slider-value">{{ fontSize }}</text>
            </view>
            <view class="typo-slider-body">
              <text class="typo-slider-mark typo-slider-mark--sm" @tap.stop="setFontStep(0)"
                >A</text
              >
              <view
                id="font-rail"
                class="typo-slider-rail"
                @tap="onFontRailTap"
                @touchstart.stop="onFontRailTouch"
                @touchmove.stop.prevent="onFontRailTouch"
                @touchend.stop="onFontRailTouchEnd"
              >
                <view class="typo-slider-track" />
                <view
                  class="typo-slider-knob"
                  :class="{ 'typo-slider-knob--dragging': fontRailDragging }"
                  :style="{ left: fontKnobLeft }"
                />
              </view>
              <text
                class="typo-slider-mark typo-slider-mark--lg"
                @tap.stop="setFontStep(FONT_SIZE_MAX - FONT_SIZE_MIN)"
              >
                A
              </text>
            </view>
          </view>

          <view class="typo-slider">
            <view class="typo-slider-head">
              <text class="typo-slider-label">行距</text>
              <text class="typo-slider-value">{{ lineHeightLabel }}</text>
            </view>
            <view class="typo-slider-body">
              <text class="typo-slider-mark typo-slider-mark--tight" @tap.stop="setLineStep(0)">
                紧
              </text>
              <view
                id="line-rail"
                class="typo-slider-rail"
                @tap="onLineRailTap"
                @touchstart.stop="onLineRailTouch"
                @touchmove.stop.prevent="onLineRailTouch"
                @touchend.stop="onLineRailTouchEnd"
              >
                <view class="typo-slider-track" />
                <view
                  class="typo-slider-knob"
                  :class="{ 'typo-slider-knob--dragging': lineRailDragging }"
                  :style="{ left: lineKnobLeft }"
                />
              </view>
              <text
                class="typo-slider-mark typo-slider-mark--loose"
                @tap.stop="setLineStep(lineHeightOptions.length - 1)"
              >
                松
              </text>
            </view>
          </view>
        </view>
      </view>

      <view class="reader-toolbar">
        <view class="toolbar-item" @click="openBottomPanel('toc')">
          <AppIcon name="list" :size="22" :color="readerStyle.color" />
          <text class="toolbar-label">目录</text>
        </view>
        <view
          class="toolbar-item"
          :class="{ active: bottomPanel === 'theme' }"
          @click="openBottomPanel('theme')"
        >
          <view class="toolbar-icon-theme" />
          <text class="toolbar-label">主题</text>
        </view>
        <view
          class="toolbar-item"
          :class="{ active: bottomPanel === 'pageMode' }"
          @click="openBottomPanel('pageMode')"
        >
          <view class="toolbar-icon-page" />
          <text class="toolbar-label">翻页</text>
        </view>
        <view
          class="toolbar-item"
          :class="{ active: bottomPanel === 'typography' }"
          @click="openBottomPanel('typography')"
        >
          <text class="toolbar-icon-text">A</text>
          <text class="toolbar-label">字体</text>
        </view>
        <view class="toolbar-item" :class="{ active: listenActive }" @click="onListenTap">
          <text class="toolbar-icon-text">听</text>
          <text class="toolbar-label">{{ listenToolbarLabel }}</text>
        </view>
      </view>
    </view>

    <!-- 底栏收起：固定在「听」标识上方 -->
    <view
      v-if="showListenFollowFab && !chromeVisible"
      class="reader-listen-follow"
      :style="listenFollowStyle"
      @click.stop="onListenFollowTap"
    >
      <text class="reader-listen-follow__text">回位</text>
    </view>

    <view
      v-if="hasContent && tocOpen"
      class="toc-sheet"
      :class="{
        'toc-sheet--dark': isDarkPaper,
        'toc-sheet--closing': tocClosing,
      }"
      :style="tocSheetStyle"
    >
      <view
        class="toc-handle"
        @tap="closeToc"
        @touchstart="onTocHandleTouchStart"
        @touchend="onTocHandleTouchEnd"
      >
        <view class="toc-handle-bar" />
      </view>
      <scroll-view
        scroll-y
        class="toc-scroll"
        :style="{ height: `${tocScrollHeight}px` }"
        :show-scrollbar="false"
      >
        <view
          v-for="item in toc"
          :key="item.index"
          class="toc-item"
          :class="{ active: item.index === chapterIndex }"
          :style="{ paddingLeft: `${24 + item.level * 24}rpx` }"
          @click="goChapter(item.index)"
        >
          <text class="toc-item-text">{{ item.title || `第 ${item.index + 1} 章` }}</text>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onHide, onLoad, onReady, onShow, onUnload } from "@dcloudio/uni-app";
import { computed, getCurrentInstance, nextTick, ref, watch } from "vue";
import ListenMiniBar from "@/components/ListenMiniBar.vue";
import { useChapterListen } from "@/hooks/useChapterListen";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { useThemeAccent } from "@/hooks/useTheme";
import { ApiError } from "@/services/http";
import { fetchBook, fetchChapter, fetchChapters } from "@/services/ebook";
import { flushProgressSave, scheduleProgressSave } from "@/services/progress-sync";
import { getChapterCache, setChapterCache } from "@/services/reader-cache";
import type { ChapterContent, ChapterMeta } from "@/types/ebook";
import { calculatePercent, resolveStartChapterIndex } from "@/types/ebook";
import { resolveUploadFileUrl } from "@/utils/upload-file-url";
import {
  buildChapterHtmlSegments,
  segmentIndexForChar,
  type ChapterHtmlSegment,
} from "@/utils/listen-text";
import { stripReaderColorStyles } from "@/utils/reader-html";

defineOptions({
  components: { ListenMiniBar },
});

interface ChapterBlock {
  index: number;
  title: string;
  html: string;
  href: string;
  /** 块级切段，听书跟读时用原生 view id 定位 */
  segments: ChapterHtmlSegment[];
}

const bookId = ref("");
const bookTitle = ref("");
const bookCoverUrl = ref("");
const chapterTitle = ref("");
const chapterIndex = ref(0);
const chapterTotal = ref(0);
const chapterHref = ref("");
const prevIndex = ref<number | null>(null);
const nextIndex = ref<number | null>(null);
const toc = ref<ChapterMeta[]>([]);
const chapterBlocks = ref<ChapterBlock[]>([]);
const hasContent = computed(() => chapterBlocks.value.length > 0);

const loading = ref(true);
const loadingMore = ref(false);
const loadingText = ref("加载中…");
const error = ref("");
const chromeVisible = ref(false);
const tocOpen = ref(false);
const tocClosing = ref(false);

type BottomPanel = "theme" | "pageMode" | "typography";
const bottomPanel = ref<BottomPanel | null>(null);

const scrollTop = ref(0);
const currentScrollTop = ref(0);
const scrollHeight = ref(1);
const viewportHeight = ref(1);
const chromeInsets = ref({ top: 0, bottom: 0 });
const windowHeight = ref(667);
let cachedWindowHeight = 667;
let activeChapterTimer: ReturnType<typeof setTimeout> | null = null;
let expandingEdge: "top" | "bottom" | null = null;

const readerInstance = getCurrentInstance();

const {
  fontSize,
  paperTheme,
  lineHeight,
  readerStyle,
  mpTagStyle,
  setLineHeight,
  setPageMode,
  pageMode,
  paperStyles,
  pageModeOptions,
  lineHeightOptions,
  paperOptions,
  isDarkPaper,
} = useReaderSettings();

const readerShellStyle = computed(() => ({
  backgroundColor: readerStyle.value.backgroundColor,
  color: readerStyle.value.color,
  minHeight: "100vh",
}));

const scrollViewStyle = computed(() => ({
  backgroundColor: readerStyle.value.backgroundColor,
}));

function applyReaderPageChrome() {
  const bg = readerStyle.value.backgroundColor;
  const frontColor = isDarkPaper.value ? "#ffffff" : "#000000";
  uni.setBackgroundColor({
    backgroundColor: bg,
    backgroundColorTop: bg,
    backgroundColorBottom: bg,
  });
  // 自定义导航栏下 frontColor 仅影响状态栏时间/电量等文字颜色
  uni.setNavigationBarColor({
    frontColor,
    backgroundColor: bg,
  });
}

watch(
  () => [readerStyle.value.backgroundColor, paperTheme.value] as const,
  () => applyReaderPageChrome(),
);

function withAlpha(hex: string, alpha = 0.96): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

const chromeBarStyle = computed(() => {
  const paper = paperStyles[paperTheme.value];
  return {
    color: paper.fg,
    backgroundColor: withAlpha(paper.bg),
  };
});

const {
  status: listenStatus,
  isActive: listenActive,
  chapterIndex: listenChapterIndex,
  sentenceIndex: listenSentenceIndex,
  sentenceCount: listenSentenceCount,
  sentences: listenSentences,
  startListen,
  seekListenChapter,
  stopListen,
  stopListenIfLeavingReader,
} = useChapterListen();

const { accentBtnStyle } = useThemeAccent();

const listenToolbarLabel = computed(() => {
  if (listenStatus.value === "loading") return "加载";
  if (listenActive.value) return "关闭";
  return "听书";
});

/**
 * 听书自动跟读。
 * ponytail: enhanced scroll-view 上 touch/drag 经常收不到，打断只看 @scroll 相对基线位移。
 * 底栏/程序滚期间用时间窗把滚动写回基线，避免误出「回位」。
 */
const listenAutoFollow = ref(true);
let listenProgrammaticUntil = 0;
let listenBreakSuppressUntil = 0;
let listenFollowBaselineTop = 0;
const LISTEN_BREAK_FOLLOW_PX = 36;
const LISTEN_FAB_SIZE_RPX = 104;
const LISTEN_FAB_GAP_RPX = 16;
const LISTEN_FAB_EDGE_RPX = 48;

function markListenProgrammatic(ms = 400) {
  listenProgrammaticUntil = Math.max(listenProgrammaticUntil, Date.now() + ms);
}

function suppressListenBreak(ms = 600) {
  listenBreakSuppressUntil = Math.max(listenBreakSuppressUntil, Date.now() + ms);
}

function isListenScrollIgnored() {
  return Date.now() < listenBreakSuppressUntil || Date.now() < listenProgrammaticUntil;
}

function syncListenFollowAnchor(top = currentScrollTop.value) {
  listenFollowBaselineTop = top;
}

function breakListenAutoFollow() {
  if (!listenActive.value || !listenAutoFollow.value) return;
  listenAutoFollow.value = false;
}

/**
 * 跟读中的滚动：忽略窗内不改基线（避免手滑被吃掉）；
 * 窗外相对基线超阈值 → 回位。基线只在 syncListenFollowAnchor 显式更新。
 */
function onListenScrollWhileFollowing(top: number) {
  if (!listenActive.value || !listenAutoFollow.value) return;
  if (isListenScrollIgnored()) return;
  if (Math.abs(top - listenFollowBaselineTop) >= LISTEN_BREAK_FOLLOW_PX) {
    breakListenAutoFollow();
  }
}

/** 听书中底栏收起：右下角「听」入口（跟读打断后仍保留，回位叠在其上） */
const showListenFloat = computed(
  () => hasContent.value && listenActive.value && !chromeVisible.value && !tocOpen.value,
);

/** 跟读被手动滚动打断后：回到播放位置 */
const showListenFollowFab = computed(
  () => hasContent.value && listenActive.value && !listenAutoFollow.value && !tocOpen.value,
);

const listenFloatStyle = computed(() => ({
  ...accentBtnStyle.value,
  bottom: `calc(${LISTEN_FAB_EDGE_RPX}rpx + env(safe-area-inset-bottom))`,
}));

function onListenFloatTap() {
  suppressListenBreak(600);
  chromeVisible.value = true;
  bottomPanel.value = null;
  void nextTick(() => setTimeout(measureChromeInsets, 80));
}

function onReaderContentTouchStart() {
  releaseChromeScrollGuard();
}

watch(listenActive, (active) => {
  if (active) {
    listenAutoFollow.value = true;
    syncListenFollowAnchor();
  }
});

/** 当前章内阅读进度，听书起播用 */
const readingScrollPercent = ref(0);

let lastChromeBottom = 0;
const TOOLBAR_INSET_FALLBACK = 72;

const bottomChromeInset = computed(() => {
  if (!chromeVisible.value && !tocOpen.value) return 0;
  return chromeInsets.value.bottom || lastChromeBottom || TOOLBAR_INSET_FALLBACK;
});

/** 仅底栏收起时使用：叠在「听」正上方（底栏开启时改挂 chrome 上沿） */
const listenFollowStyle = computed(() => {
  const aboveListen = LISTEN_FAB_EDGE_RPX + LISTEN_FAB_SIZE_RPX + LISTEN_FAB_GAP_RPX;
  return {
    ...accentBtnStyle.value,
    bottom: `calc(${aboveListen}rpx + env(safe-area-inset-bottom))`,
  };
});

/** 按已读字符占比估算句在章内位置（块段定位失败时的兜底） */
function listenSentenceScrollPercent(sent: number): number {
  const list = listenSentences.value;
  if (!list.length) return 0;
  let totalChars = 0;
  let before = 0;
  for (let i = 0; i < list.length; i++) {
    const len = Math.max(list[i]?.text.length ?? 0, 1);
    totalChars += len;
    if (i < sent) before += len;
  }
  if (totalChars <= 0) return 0;
  const curLen = Math.max(list[sent]?.text.length ?? 0, 1);
  return Math.min(1, Math.max(0, (before + curLen * 0.2) / totalChars));
}

/** 微信 scroll-view：scroll-top 同值不生效，需先错开再设目标 */
async function applyScrollTop(target: number, forceBump = false) {
  const next = Math.max(0, Math.floor(Number.isFinite(target) ? target : 0));
  if (forceBump || Math.abs(scrollTop.value - next) < 1) {
    scrollTop.value = next + 1;
    await nextTick();
  }
  scrollTop.value = next;
  currentScrollTop.value = next;
}

function isListenSegmentedChapter(chapterIdx: number): boolean {
  return (
    listenActive.value &&
    listenChapterIndex.value === chapterIdx &&
    (chapterBlocks.value.find((b) => b.index === chapterIdx)?.segments.length ?? 0) > 0
  );
}

function listenFocusOffsetPx(): number {
  const wh = liveWindowHeight();
  const bottomInset = chromeVisible.value ? chromeInsets.value.bottom || lastChromeBottom || 0 : 0;
  const visible = Math.max(wh - bottomInset, 160);
  return Math.max(72, Math.floor(visible * 0.28));
}

/**
 * 滚到块段原生 view，并按段内字符占比微调。
 * ponytail: id 在 view 上，不进 mp-html nodes，无句锚 setData 膨胀。
 */
function scrollToListenSegment(
  chapterIdx: number,
  sentStart: number,
  sentEnd: number,
  segments: ChapterHtmlSegment[],
  forceBump = false,
): Promise<boolean> {
  const si = segmentIndexForChar(segments, sentStart);
  const seg = segments[si];
  if (!seg) return Promise.resolve(false);
  const focus = listenFocusOffsetPx();
  const span = Math.max(seg.end - seg.start, 1);
  const frac = Math.min(
    1,
    Math.max(0, (sentStart - seg.start + Math.max(sentEnd - sentStart, 1) * 0.2) / span),
  );

  return new Promise((resolve) => {
    createQuery()
      .select(`#ls-${chapterIdx}-${si}`)
      .boundingClientRect((segRect) => {
        createQuery()
          .select(".reader-scroll")
          .fields({ rect: true, size: true, scrollOffset: true }, (scrollData) => {
            void (async () => {
              const block = segRect && !Array.isArray(segRect) ? segRect : null;
              const scroll = scrollData && !Array.isArray(scrollData) ? scrollData : null;
              const offsetTop = scroll?.scrollTop;
              if (!block || !scroll || typeof offsetTop !== "number") {
                resolve(false);
                return;
              }
              const segTop = (block.top ?? 0) - (scroll.top ?? 0) + offsetTop;
              const segH = block.height ?? 0;
              const target = Math.max(0, Math.floor(segTop + frac * segH - focus));
              markListenProgrammatic(700);
              await applyScrollTop(target, forceBump);
              syncListenFollowAnchor(target);
              lastScrollTopForChrome = target;
              resolve(true);
            })();
          })
          .exec();
      })
      .exec();
  });
}

/** 听书跟读：优先块段 view 定位，失败再回退章内字符占比 */
async function scrollToListenSentence(force = false) {
  if (!listenActive.value) return;
  if (!force && !listenAutoFollow.value) return;
  const chap = listenChapterIndex.value;
  const sent = listenSentenceIndex.value;
  const total = listenSentenceCount.value;
  if (total <= 0) return;

  markListenProgrammatic(800);
  try {
    await ensureChapterLoaded(chap);
    await nextTick();
    // 切到分段 mp-html 后等一帧量高度
    await new Promise((r) => setTimeout(r, force ? 80 : 32));
    if (!force && !listenAutoFollow.value) return;

    const block = chapterBlocks.value.find((b) => b.index === chap);
    const meta = listenSentences.value[sent];
    if (block?.segments.length && meta && typeof meta.start === "number") {
      const ok = await scrollToListenSegment(chap, meta.start, meta.end, block.segments, force);
      if (ok) return;
    }
    await scrollToChapter(chap, listenSentenceScrollPercent(sent), "listen");
  } finally {
    markListenProgrammatic(280);
    syncListenFollowAnchor();
    lastScrollTopForChrome = currentScrollTop.value;
    setTimeout(() => {
      if (listenActive.value && listenAutoFollow.value) syncListenFollowAnchor();
    }, 300);
  }
}

function onListenFollowTap() {
  listenAutoFollow.value = true;
  suppressListenBreak(400);
  markListenProgrammatic(400);
  void scrollToListenSentence(true);
}

async function onListenTap() {
  if (!bookId.value || !hasContent.value) return;
  if (listenActive.value) {
    stopListen();
    void nextTick(() => setTimeout(measureChromeInsets, 80));
    return;
  }
  bottomPanel.value = null;
  try {
    await startListen({
      bookId: bookId.value,
      bookTitle: bookTitle.value,
      coverUrl: bookCoverUrl.value,
      chapterIndex: chapterIndex.value,
      scrollPercent: readingScrollPercent.value,
      getChapter: async (index) => {
        const block = await fetchChapterBlock(index);
        return {
          html: block.html,
          title: block.title,
          nextIndex: index < chapterTotal.value - 1 ? index + 1 : null,
        };
      },
    });
    void nextTick(() => {
      setTimeout(measureChromeInsets, 80);
      void scrollToListenSentence(true);
    });
  } catch (err) {
    uni.showToast({
      title: err instanceof Error ? err.message : "听书启动失败",
      icon: "none",
    });
  }
}

function onListenMiniLayout() {
  if (listenActive.value) {
    suppressListenBreak(500);
    markListenProgrammatic(500);
  }
  void nextTick(() => {
    setTimeout(() => {
      measureChromeInsets();
      if (listenActive.value && listenAutoFollow.value) syncListenFollowAnchor();
    }, 50);
  });
}

function liveWindowHeight(): number {
  try {
    const { windowHeight: h } = uni.getWindowInfo();
    if (h > 0) return h;
  } catch {
    // ponytail: 降级用缓存值
  }
  return windowHeight.value || 667;
}

const TOC_HANDLE_HEIGHT = 64;

const tocScrollHeight = computed(() => {
  const top = chromeInsets.value.top || 88;
  const bottom = bottomChromeInset.value;
  return Math.max(liveWindowHeight() - top - bottom - TOC_HANDLE_HEIGHT, 120);
});

const tocSheetStyle = computed(() => ({
  top: `${chromeInsets.value.top}px`,
  bottom: `${bottomChromeInset.value}px`,
  backgroundColor: readerStyle.value.backgroundColor,
  color: readerStyle.value.color,
}));

const chapterBlockStyle = computed(() => {
  const s = readerStyle.value;
  return [
    `background-color:${s.backgroundColor}`,
    `color:${s.color}`,
    `font-size:${s.fontSize}`,
    `font-family:${s.fontFamily}`,
    `line-height:${s.lineHeight}`,
    `letter-spacing:${s.letterSpacing}`,
  ].join(";");
});

const containerStyle = computed(
  () =>
    `font-size:${readerStyle.value.fontSize};color:${readerStyle.value.color} !important;line-height:${readerStyle.value.lineHeight};font-family:${readerStyle.value.fontFamily};text-align:justify;text-justify:inter-ideograph;text-align-last:left;overflow-wrap:anywhere;word-break:break-all;max-width:100%;box-sizing:border-box`,
);

// ponytail: 换肤靠 setContent，不靠把主题塞进 v-for :key（会整表 remount）

interface MpHtmlInstance {
  setContent?: (content: string, append?: boolean) => void;
}

const mpHtmlMounted = ref(true);

function extractMpHtml(inst: unknown): MpHtmlInstance | null {
  if (!inst || typeof inst !== "object") return null;
  const candidate = inst as Record<string, unknown>;
  if (typeof candidate.setContent === "function") return candidate as MpHtmlInstance;
  const vm = candidate.$vm as Record<string, unknown> | undefined;
  if (vm && typeof vm.setContent === "function") return vm as MpHtmlInstance;
  return null;
}

/** ponytail: 不用 :ref 函数——v-for 卸载/增章时 ref→undefined 会触发微信 setData 警告 */
function getMpHtmlById(id: string): MpHtmlInstance | null {
  try {
    const proxy = readerInstance?.proxy as
      { $scope?: { selectComponent?: (sel: string) => unknown } } | null | undefined;
    const comp = proxy?.$scope?.selectComponent?.(`#${id}`);
    return extractMpHtml(comp);
  } catch {
    return null;
  }
}

function refreshMpHtmlStyles() {
  // 主题/字号/行距变更会触发正文重排伪滚动，先护栏；手指点到正文再解除
  armChromeScrollGuard();
  void nextTick(async () => {
    let hit = 0;
    for (const block of chapterBlocks.value) {
      const html = stripReaderColorStyles(block.html);
      if (html !== block.html) {
        block.html = html;
        block.segments = buildChapterHtmlSegments(html);
      }
      if (isListenSegmentedChapter(block.index)) {
        for (let si = 0; si < block.segments.length; si++) {
          const inst = getMpHtmlById(`mp-html-${block.index}-${si}`);
          const segHtml = block.segments[si]?.html ?? "";
          if (inst?.setContent) {
            inst.setContent(segHtml);
            hit++;
          }
        }
      } else {
        const inst = getMpHtmlById(`mp-html-${block.index}`);
        if (inst?.setContent) {
          inst.setContent(html);
          hit++;
        }
      }
    }
    if (chapterBlocks.value.length && hit === 0) {
      mpHtmlMounted.value = false;
      await nextTick();
      mpHtmlMounted.value = true;
    }
  });
}

watch(
  () => `${paperTheme.value}-${fontSize.value}-${lineHeight.value}`,
  () => refreshMpHtmlStyles(),
  { flush: "post" },
);

watch([chromeVisible, bottomPanel, tocOpen, listenActive], () => {
  // 展开/收起底栏改 padding：抑制窗内滚动只更新基线，不打断跟读
  armChromeScrollGuard();
  if (listenActive.value) {
    suppressListenBreak(700);
    markListenProgrammatic(700);
  }
  void nextTick(() => {
    setTimeout(
      () => {
        measureChromeInsets();
        if (listenActive.value && listenAutoFollow.value) {
          syncListenFollowAnchor();
        }
      },
      chromeVisible.value || tocOpen.value ? 360 : 100,
    );
  });
});

const streamPaddingStyle = computed(() => {
  const inset = chromeInsets.value.bottom || lastChromeBottom;
  const pad = chromeVisible.value && inset > 0 ? inset : 0;
  // 始终带 paddingBottom，避免从小程序 data 里删字段变成 undefined
  return { paddingBottom: `${pad}px` };
});

const FONT_SIZE_MIN = 14;
const FONT_SIZE_MAX = 28;
const FONT_STEP_COUNT = FONT_SIZE_MAX - FONT_SIZE_MIN + 1;

const fontRailDragging = ref(false);
const lineRailDragging = ref(false);

const KNOB_INSET = 20;

const lineHeightLabels = ["紧", "略紧", "标准", "略松", "松"] as const;

function stepKnobLeft(stepIndex: number, stepCount: number): string {
  if (stepCount <= 1) return "50%";
  const ratio = stepIndex / (stepCount - 1);
  return `calc(${KNOB_INSET}rpx + (100% - ${KNOB_INSET * 2}rpx) * ${ratio})`;
}

const fontKnobLeft = computed(() => stepKnobLeft(fontSize.value - FONT_SIZE_MIN, FONT_STEP_COUNT));

const lineKnobLeft = computed(() => {
  const idx = lineHeightOptions.indexOf(lineHeight.value);
  return stepKnobLeft(idx < 0 ? 0 : idx, lineHeightOptions.length);
});

const lineHeightLabel = computed(() => {
  const idx = lineHeightOptions.indexOf(lineHeight.value);
  return idx >= 0 ? lineHeightLabels[idx] : "标准";
});

function setFontStep(index: number) {
  fontSize.value = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, FONT_SIZE_MIN + index));
}

function setLineStep(index: number) {
  const i = Math.min(lineHeightOptions.length - 1, Math.max(0, index));
  setLineHeight(lineHeightOptions[i]);
}

function resolveStepIndex(localX: number, railWidth: number, stepCount: number): number {
  const ratio = Math.min(1, Math.max(0, localX / railWidth));
  return Math.round(ratio * (stepCount - 1));
}

function pickFontFromLocalX(localX: number, railWidth: number) {
  setFontStep(resolveStepIndex(localX, railWidth, FONT_STEP_COUNT));
}

function pickLineFromLocalX(localX: number, railWidth: number) {
  setLineStep(resolveStepIndex(localX, railWidth, lineHeightOptions.length));
}

function onFontRailTap(e: { detail?: { x?: number } }) {
  const x = e.detail?.x;
  if (typeof x !== "number") return;
  createQuery()
    .select("#font-rail")
    .boundingClientRect((rect) => {
      if (!rect || Array.isArray(rect) || !rect.width) return;
      pickFontFromLocalX(x, rect.width);
    })
    .exec();
}

function onLineRailTap(e: { detail?: { x?: number } }) {
  const x = e.detail?.x;
  if (typeof x !== "number") return;
  createQuery()
    .select("#line-rail")
    .boundingClientRect((rect) => {
      if (!rect || Array.isArray(rect) || !rect.width) return;
      pickLineFromLocalX(x, rect.width);
    })
    .exec();
}

function onFontRailTouch(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;
  fontRailDragging.value = true;
  createQuery()
    .select("#font-rail")
    .boundingClientRect((rect) => {
      if (!rect || Array.isArray(rect) || !rect.width) return;
      pickFontFromLocalX(touch.clientX - (rect.left ?? 0), rect.width);
    })
    .exec();
}

function onLineRailTouch(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;
  lineRailDragging.value = true;
  createQuery()
    .select("#line-rail")
    .boundingClientRect((rect) => {
      if (!rect || Array.isArray(rect) || !rect.width) return;
      pickLineFromLocalX(touch.clientX - (rect.left ?? 0), rect.width);
    })
    .exec();
}

function onFontRailTouchEnd() {
  fontRailDragging.value = false;
}

function onLineRailTouchEnd() {
  lineRailDragging.value = false;
}

const topBarStyle = computed(() => {
  const { backgroundColor, color } = readerStyle.value;
  return [
    `background-color:${backgroundColor}`,
    `color:${color}`,
    `--wot-navbar-bg:${backgroundColor}`,
    `--wot-navbar-color:${color}`,
    `--wot-navbar-desc-color:${color}`,
    `z-index:101`,
  ].join(";");
});

/** 居中标题最大宽度，避开左侧返回与右侧胶囊 */
const navbarTitleMaxWidth = ref("48%");

function measureNavbarTitleMaxWidth() {
  try {
    const { windowWidth } = uni.getWindowInfo();
    const menu = uni.getMenuButtonBoundingClientRect();
    if (!(windowWidth > 0) || !(menu.left > 0)) return;
    const gap = 8;
    const leftReserve = 88; // 返回箭头区域
    // 标题居中：右缘 = windowWidth/2 + W/2，需 ≤ capsule.left - gap
    const byCapsule = 2 * (menu.left - gap) - windowWidth;
    const byLeft = windowWidth - 2 * leftReserve;
    const maxW = Math.max(Math.min(byCapsule, byLeft), 120);
    navbarTitleMaxWidth.value = `${Math.floor(maxW)}px`;
  } catch {
    // ponytail: H5/非微信环境保持百分比兜底
  }
}

function openBottomPanel(panel: BottomPanel | "toc") {
  if (panel === "toc") {
    if (tocOpen.value && !tocClosing.value) {
      closeToc();
      return;
    }
    if (tocClosing.value) return;
    chromeVisible.value = true;
    bottomPanel.value = null;
    tocOpen.value = true;
    void nextTick(() => {
      measureChromeInsets();
      setTimeout(measureChromeInsets, 320);
    });
    return;
  }
  bottomPanel.value = bottomPanel.value === panel ? null : panel;
  void nextTick(() => measureChromeInsets());
}

onLoad((query) => {
  bookId.value = String(query?.bookId ?? "");
  if (!bookId.value) {
    error.value = "缺少 bookId";
    loading.value = false;
    return;
  }
  void initReader();
});

onReady(() => {
  cacheWindowHeight();
  measureViewport();
  measureChromeInsets();
  measureNavbarTitleMaxWidth();
  applyReaderPageChrome();
});

onShow(() => {
  applyReaderPageChrome();
});

onHide(() => {
  void flushProgressSave();
});

onUnload(() => {
  resetTocCloseAnimation();
  stopListenIfLeavingReader();
  void flushProgressSave();
});

function goBack() {
  if (tocOpen.value) {
    closeToc();
    return;
  }
  uni.navigateBack();
}

const TOC_SWIPE_CLOSE_PX = 40;
const TOC_ANIM_MS = 280;

let tocHeaderStartY = 0;
let tocHandleStartY = 0;
let tocCloseTimer: ReturnType<typeof setTimeout> | null = null;

function closeToc() {
  if (!tocOpen.value || tocClosing.value) return;
  tocClosing.value = true;
  if (tocCloseTimer) clearTimeout(tocCloseTimer);
  tocCloseTimer = setTimeout(() => {
    tocOpen.value = false;
    tocClosing.value = false;
    tocCloseTimer = null;
    void nextTick(() => measureChromeInsets());
  }, TOC_ANIM_MS);
}

function resetTocCloseAnimation() {
  if (tocCloseTimer) {
    clearTimeout(tocCloseTimer);
    tocCloseTimer = null;
  }
  tocClosing.value = false;
}

function onReaderTopTap() {
  if (tocOpen.value && !tocClosing.value) closeToc();
}

function onTocHeaderTouchStart(e: TouchEvent) {
  if (!tocOpen.value) return;
  tocHeaderStartY = e.touches[0]?.clientY ?? 0;
}

function onTocHeaderTouchEnd(e: TouchEvent) {
  if (!tocOpen.value || !tocHeaderStartY) {
    tocHeaderStartY = 0;
    return;
  }
  const endY = e.changedTouches[0]?.clientY ?? 0;
  if (endY - tocHeaderStartY > TOC_SWIPE_CLOSE_PX) closeToc();
  tocHeaderStartY = 0;
}

function onTocHandleTouchStart(e: TouchEvent) {
  if (!tocOpen.value) return;
  tocHandleStartY = e.touches[0]?.clientY ?? 0;
}

function onTocHandleTouchEnd(e: TouchEvent) {
  if (!tocOpen.value || !tocHandleStartY) {
    tocHandleStartY = 0;
    return;
  }
  const endY = e.changedTouches[0]?.clientY ?? 0;
  if (endY - tocHandleStartY > TOC_SWIPE_CLOSE_PX) closeToc();
  tocHandleStartY = 0;
}

function hideBottomChrome() {
  if (!chromeVisible.value) return;
  chromeVisible.value = false;
  bottomPanel.value = null;
  closeToc();
  void nextTick(() => setTimeout(measureChromeInsets, 120));
}

function toggleChrome() {
  armChromeScrollGuard();
  if (listenActive.value) {
    suppressListenBreak(700);
    markListenProgrammatic(700);
  }
  chromeVisible.value = !chromeVisible.value;
  if (!chromeVisible.value) {
    bottomPanel.value = null;
    closeToc();
  }
  void nextTick(() => {
    setTimeout(() => {
      measureViewport();
      measureChromeInsets();
      if (listenActive.value && listenAutoFollow.value) {
        syncListenFollowAnchor();
      }
    }, 120);
  });
}

let parsePollCount = 0;
let initReaderSeq = 0;
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

function createQuery() {
  const query = uni.createSelectorQuery();
  if (readerInstance?.proxy) query.in(readerInstance.proxy);
  return query;
}

function cacheWindowHeight() {
  try {
    if (typeof uni.getWindowInfo === "function") {
      const { windowHeight: h } = uni.getWindowInfo();
      if (h > 0) {
        cachedWindowHeight = h;
        windowHeight.value = h;
      }
    }
  } catch {
    // ponytail: 保留默认 667，不再调用已废弃的 getSystemInfoSync
  }
}

function getEffectiveViewport(): number {
  if (viewportHeight.value > 1) return viewportHeight.value;
  return Math.max(cachedWindowHeight - 180, 320);
}

function measureViewport() {
  createQuery()
    .select(".reader-scroll")
    .boundingClientRect((rect) => {
      const height = rect && !Array.isArray(rect) ? (rect.height ?? 0) : 0;
      if (height > 0) viewportHeight.value = height;
    })
    .exec();
}

function getNavBarBottom(): number {
  try {
    const { statusBarHeight } = uni.getWindowInfo();
    const menu = uni.getMenuButtonBoundingClientRect();
    if (menu.height > 0 && menu.top >= statusBarHeight) {
      return (menu.top - statusBarHeight) * 2 + menu.height + statusBarHeight;
    }
  } catch {
    // ponytail: 非小程序环境跳过
  }
  return 0;
}

function measureChromeInsets() {
  createQuery()
    .select(".reader-top")
    .boundingClientRect()
    .select(".reader-chrome-bottom")
    .boundingClientRect()
    .exec((res) => {
      const topRect = res[0] && !Array.isArray(res[0]) ? res[0] : null;
      const bottomRect = res[1] && !Array.isArray(res[1]) ? res[1] : null;
      const navBottom = getNavBarBottom();
      const placeholderBottom = topRect?.bottom ?? topRect?.height ?? 0;
      const top = navBottom || placeholderBottom || 88;

      if (bottomRect && typeof bottomRect.top === "number" && bottomRect.top > 0) {
        lastChromeBottom = Math.max(liveWindowHeight() - bottomRect.top, 0);
      } else if (bottomRect?.height) {
        lastChromeBottom = bottomRect.height;
      }

      const bottom =
        chromeVisible.value || tocOpen.value ? lastChromeBottom || TOOLBAR_INSET_FALLBACK : 0;
      chromeInsets.value = { top, bottom };
    });
}

function sortChapterBlocks() {
  chapterBlocks.value.sort((a, b) => a.index - b.index);
}

function hasChapterBlock(index: number): boolean {
  return chapterBlocks.value.some((b) => b.index === index);
}

function firstLoadedIndex(): number | null {
  return chapterBlocks.value[0]?.index ?? null;
}

function lastLoadedIndex(): number | null {
  return chapterBlocks.value[chapterBlocks.value.length - 1]?.index ?? null;
}

function setActiveChapterMeta(index: number) {
  chapterIndex.value = index;
  const block = chapterBlocks.value.find((b) => b.index === index);
  chapterTitle.value = block?.title ?? toc.value[index]?.title ?? "";
  chapterHref.value = block?.href ?? toc.value[index]?.href ?? "";
  prevIndex.value = index > 0 ? index - 1 : null;
  nextIndex.value = index < chapterTotal.value - 1 ? index + 1 : null;
}

async function fetchChapterBlock(index: number, forceRefresh = false): Promise<ChapterBlock> {
  const cached = !forceRefresh ? getChapterCache(bookId.value, index) : null;
  let data: ChapterContent;

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

  const html = stripReaderColorStyles(data.html || "");
  return {
    index: data.index,
    title: data.title || "",
    html,
    href: toc.value[index]?.href ?? "",
    segments: buildChapterHtmlSegments(html),
  };
}

async function ensureChapterLoaded(index: number, forceRefresh = false): Promise<void> {
  if (index < 0 || index >= chapterTotal.value) return;
  if (!forceRefresh && hasChapterBlock(index)) return;
  const block = await fetchChapterBlock(index, forceRefresh);
  if (!hasChapterBlock(index)) {
    chapterBlocks.value.push(block);
    sortChapterBlocks();
  }
}

async function scrollToChapter(
  index: number,
  scrollPercent = 0,
  mode: "progress" | "listen" = "progress",
) {
  await nextTick();
  await new Promise((r) => setTimeout(r, mode === "listen" ? 40 : 120));

  return new Promise<void>((resolve) => {
    createQuery()
      .select(`#chapter-${index}`)
      .boundingClientRect((blockRect) => {
        createQuery()
          .select(".reader-scroll")
          .fields({ rect: true, size: true, scrollOffset: true }, (scrollData) => {
            void (async () => {
              const block = blockRect && !Array.isArray(blockRect) ? blockRect : null;
              const scroll = scrollData && !Array.isArray(scrollData) ? scrollData : null;
              const offsetTop = scroll?.scrollTop;
              if (!block || !scroll || typeof offsetTop !== "number") {
                resolve();
                return;
              }

              const blockTop = (block.top ?? 0) - (scroll.top ?? 0) + offsetTop;
              const blockHeight = block.height ?? 0;
              const vp = getEffectiveViewport();
              const p = Math.min(1, Math.max(0, scrollPercent));
              let target = blockTop;

              if (mode === "listen") {
                // 把当前句估算位置放到视口约 28% 处，保证落在展示区内
                const sentenceY = blockTop + p * blockHeight;
                target = Math.max(0, Math.floor(sentenceY - vp * 0.28));
              } else if (p > 0 && blockHeight > vp) {
                target += Math.floor((blockHeight - vp) * p);
              }

              await applyScrollTop(target);
              setActiveChapterMeta(index);
              resolve();
            })();
          })
          .exec();
      })
      .exec();
  });
}

watch(
  () =>
    [
      listenActive.value,
      listenAutoFollow.value,
      listenChapterIndex.value,
      listenSentenceIndex.value,
      listenSentenceCount.value,
    ] as const,
  ([active, follow, , , total]) => {
    if (!active || !follow || total <= 0) return;
    void scrollToListenSentence(false);
  },
);

async function openAtChapter(index: number, scrollPercent = 0, forceRefresh = false) {
  chapterBlocks.value = [];
  closeToc();
  setActiveChapterMeta(index);

  // 先挂当前章并定位，邻章错峰加载，避免连续几次 MB 级 setData
  await ensureChapterLoaded(index, forceRefresh);
  await scrollToChapter(index, scrollPercent);
  persistProgress(scrollPercent);
  await nextTick();
  measureViewport();

  const neighbors: Promise<void>[] = [];
  if (index + 1 < chapterTotal.value) neighbors.push(ensureChapterLoaded(index + 1, forceRefresh));
  if (index > 0) neighbors.push(ensureChapterLoaded(index - 1, forceRefresh));
  if (neighbors.length) {
    await new Promise((r) => setTimeout(r, 64));
    await Promise.all(neighbors);
  }

  // 短章不足一屏时继续预加载，凑够可滚动高度
  void fillStreamIfShort();
}

async function fillStreamIfShort() {
  if (loadingMore.value) return;
  const vp = getEffectiveViewport();
  if (scrollHeight.value > vp + 80) return;

  const last = lastLoadedIndex();
  if (last == null || last >= chapterTotal.value - 1) return;

  loadingMore.value = true;
  try {
    await ensureChapterLoaded(last + 1);
    await nextTick();
    await new Promise((r) => setTimeout(r, 80));
    if (scrollHeight.value <= vp + 80) await fillStreamIfShort();
  } finally {
    loadingMore.value = false;
  }
}

async function appendNextChapter() {
  const last = lastLoadedIndex();
  if (last == null || last >= chapterTotal.value - 1) return;
  if (expandingEdge === "bottom" || loadingMore.value) return;

  expandingEdge = "bottom";
  loadingMore.value = true;
  try {
    await ensureChapterLoaded(last + 1);
  } finally {
    loadingMore.value = false;
    expandingEdge = null;
  }
}

async function prependPrevChapter() {
  const first = firstLoadedIndex();
  if (first == null || first <= 0) return;
  if (expandingEdge === "top" || loadingMore.value) return;

  expandingEdge = "top";
  loadingMore.value = true;
  const prevTop = currentScrollTop.value;
  const prevHeight = scrollHeight.value;

  try {
    await ensureChapterLoaded(first - 1);
    await nextTick();
    await new Promise((r) => setTimeout(r, 100));

    await new Promise<void>((resolve) => {
      createQuery()
        .select(`#chapter-${first - 1}`)
        .boundingClientRect((rect) => {
          const added = rect && !Array.isArray(rect) ? (rect.height ?? 0) : 0;
          const delta = added > 0 ? added : Math.max(scrollHeight.value - prevHeight, 0);
          const nextTop = prevTop + delta;
          scrollTop.value = nextTop;
          currentScrollTop.value = nextTop;
          resolve();
        })
        .exec();
    });
  } finally {
    loadingMore.value = false;
    expandingEdge = null;
  }
}

async function initReader(forceRefresh = false) {
  const seq = ++initReaderSeq;
  loading.value = true;
  loadingText.value = "加载中…";
  error.value = "";
  chapterBlocks.value = [];

  try {
    const [book, chaptersRes] = await Promise.all([
      fetchBook(bookId.value),
      fetchChapters(bookId.value),
    ]);

    if (seq !== initReaderSeq) return;

    parsePollCount = 0;
    bookTitle.value = book.title;
    bookCoverUrl.value = resolveUploadFileUrl(book.coverUrl) || "";
    toc.value = chaptersRes.chapters;
    chapterTotal.value = chaptersRes.total;

    const startIndex = resolveStartChapterIndex(
      book.prog?.chapterIndex,
      book.prog?.percent,
      chaptersRes.total,
    );

    await openAtChapter(startIndex, book.prog?.scrollPercent ?? 0, forceRefresh);
    readingScrollPercent.value = book.prog?.scrollPercent ?? 0;
  } catch (err) {
    if (seq !== initReaderSeq) return;
    if (isChapterParsePending(err)) {
      parsePollCount += 1;
      if (parsePollCount > PARSE_POLL_MAX) {
        error.value = "解析时间较长，请稍后重试或联系管理员";
        loading.value = false;
        return;
      }
      loadingText.value = parsePendingText();
      setTimeout(() => void initReader(forceRefresh), PARSE_POLL_INTERVAL_MS);
      return;
    }
    error.value = err instanceof Error ? err.message : "加载失败";
  } finally {
    loading.value = false;
    if (chapterBlocks.value.length > 0) {
      void nextTick(() => {
        measureChromeInsets();
        setTimeout(measureChromeInsets, 320);
      });
    }
  }
}

function goChapter(index: number) {
  if (index < 0 || index >= chapterTotal.value) return;
  const resumeListenAtChapter = listenActive.value;
  void (async () => {
    await openAtChapter(index, 0);
    if (resumeListenAtChapter) {
      await seekListenChapter(index, 0);
      void nextTick(() => setTimeout(measureChromeInsets, 80));
    }
  })();
}

function onScrollNearEnd() {
  void appendNextChapter();
}

function onScrollNearStart() {
  void prependPrevChapter();
}

function updateActiveChapterFromScroll() {
  if (!chapterBlocks.value.length) return;

  createQuery()
    .selectAll(".chapter-block")
    .boundingClientRect()
    .select(".reader-scroll")
    .boundingClientRect()
    .exec((res) => {
      const blocks = res?.[0];
      const scrollRect = res?.[1] && !Array.isArray(res[1]) ? res[1] : null;
      if (!Array.isArray(blocks) || !scrollRect || !blocks.length) return;

      const anchorY = scrollRect.top + getEffectiveViewport() * 0.25;
      let activeIdx = chapterBlocks.value[0].index;
      let activeRect = blocks[0];

      for (let i = 0; i < blocks.length; i++) {
        const rect = blocks[i];
        if (!rect || typeof rect.top !== "number") continue;
        if (rect.top <= anchorY) {
          activeIdx = chapterBlocks.value[i]?.index ?? activeIdx;
          activeRect = rect;
        }
      }

      if (activeIdx !== chapterIndex.value) setActiveChapterMeta(activeIdx);

      const blockHeight = activeRect.height ?? 1;
      const within = Math.min(1, Math.max(0, (anchorY - activeRect.top) / blockHeight));
      persistProgress(within);
    });
}

let lastScrollTopForChrome = 0;
const SCROLL_HIDE_CHROME_PX = 10;

/**
 * 样式重排护栏：换主题/字号时 setContent 会冒伪 scroll。
 * - 护栏开启：只同步 scrollTop，不收起操作栏
 * - 手指 touchstart 点到正文：立刻解除，随后滑动可立即收起
 * - 伪滚动停稳约 320ms 后自动解除（仅改颜色也可能有轻微 scroll）
 */
let chromeScrollGuard = false;
let chromeScrollGuardTimer: ReturnType<typeof setTimeout> | null = null;

function armChromeScrollGuard() {
  chromeScrollGuard = true;
  bumpChromeScrollGuardSettle();
}

function bumpChromeScrollGuardSettle() {
  if (chromeScrollGuardTimer) clearTimeout(chromeScrollGuardTimer);
  chromeScrollGuardTimer = setTimeout(() => {
    chromeScrollGuard = false;
    chromeScrollGuardTimer = null;
    lastScrollTopForChrome = currentScrollTop.value;
  }, 320);
}

function releaseChromeScrollGuard() {
  if (!chromeScrollGuard && !chromeScrollGuardTimer) return;
  chromeScrollGuard = false;
  if (chromeScrollGuardTimer) {
    clearTimeout(chromeScrollGuardTimer);
    chromeScrollGuardTimer = null;
  }
}

function onScroll(e: { detail: { scrollTop: number; scrollHeight: number } }) {
  const { scrollTop: top, scrollHeight: height } = e.detail;

  if (listenActive.value && listenAutoFollow.value) {
    onListenScrollWhileFollowing(top);
  }

  if (chromeScrollGuard) {
    lastScrollTopForChrome = top;
    bumpChromeScrollGuardSettle();
  } else if (
    chromeVisible.value &&
    !listenActive.value &&
    Math.abs(top - lastScrollTopForChrome) >= SCROLL_HIDE_CHROME_PX
  ) {
    // 听书中保留底栏播控，滚动不自动收起
    hideBottomChrome();
    lastScrollTopForChrome = top;
  } else {
    lastScrollTopForChrome = top;
  }

  currentScrollTop.value = top;
  scrollHeight.value = height;

  if (activeChapterTimer) clearTimeout(activeChapterTimer);
  activeChapterTimer = setTimeout(() => {
    activeChapterTimer = null;
    updateActiveChapterFromScroll();
  }, 200);

  const vp = getEffectiveViewport();
  if (top + vp >= height - 280) void appendNextChapter();
  if (top <= 280) void prependPrevChapter();
}

function persistProgress(scrollPercent: number) {
  if (!bookId.value || chapterTotal.value <= 0) return;
  readingScrollPercent.value = scrollPercent;

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
  overflow: hidden;
}

.reader-top {
  position: relative;
  z-index: 101;
}

.reader-top :deep(.wd-navbar__title) {
  max-width: v-bind(navbarTitleMaxWidth);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box;
}

.reader-scroll {
  flex: 1;
  height: 0;
  width: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
}

.reader-stream {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  transition: padding-bottom 0.28s cubic-bezier(0.32, 0.72, 0, 1);
}

.chapter-block {
  padding: 32rpx 40rpx 16rpx;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

.chapter-block :deep(._root),
.chapter-block :deep(._p),
.chapter-block :deep(._div) {
  text-align: justify;
  text-justify: inter-ideograph;
  text-align-last: left;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-all;
  box-sizing: border-box;
}

.chapter-block :deep(._root) {
  color: inherit;
}

.chapter-heading {
  font-weight: 600;
  margin-bottom: 24rpx;
  line-height: 1.4;
}

.stream-loading {
  display: flex;
  justify-content: center;
  padding: 24rpx 0 48rpx;
}

.reader-chrome-bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  backdrop-filter: blur(12px);
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.04);
  transform: translateY(100%);
  opacity: 0;
  pointer-events: none;
  overflow: visible;
  transition:
    transform 0.28s cubic-bezier(0.32, 0.72, 0, 1),
    opacity 0.28s ease;
  will-change: transform, opacity;
}

.reader-chrome-bottom--visible {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}

.reader-listen-float {
  position: fixed;
  right: 32rpx;
  z-index: 90;
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 28rpx rgba(0, 0, 0, 0.22);
  box-sizing: border-box;
}

.reader-listen-float--playing {
  animation: listen-float-pulse 1.6s ease-in-out infinite;
}

@keyframes listen-float-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.06);
  }
}

.reader-listen-float__text {
  font-size: 34rpx;
  font-weight: 700;
  line-height: 1;
  color: inherit;
}

.reader-listen-follow {
  position: fixed;
  right: 32rpx;
  z-index: 110;
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 28rpx rgba(0, 0, 0, 0.22);
  box-sizing: border-box;
}

/* 锚定底栏顶边，随迷你条/子面板长高，始终在整块操作栏之外 */
.reader-listen-follow--docked {
  position: absolute;
  right: 32rpx;
  bottom: 100%;
  margin-bottom: 24rpx;
  z-index: 1;
}

.reader-listen-follow__text {
  font-size: 28rpx;
  font-weight: 700;
  line-height: 1;
  color: inherit;
}

.reader-subpanel {
  padding: 28rpx 32rpx 12rpx;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.06);
}

.reader-chrome-bottom--dark .reader-subpanel {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.subpanel-section {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.subpanel-label {
  font-size: 24rpx;
  opacity: 0.55;
}

.theme-swatches {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4rpx 0 8rpx;
  box-sizing: border-box;
}

.theme-swatch {
  flex-shrink: 0;
  width: 64rpx;
  height: 64rpx;
  padding: 5rpx;
  border-radius: 50%;
  border: 3rpx solid transparent;
  box-sizing: border-box;
}

.theme-swatch--active {
  border-color: var(--wot-primary-6);
}

.theme-swatch__fill {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1rpx rgba(0, 0, 0, 0.08);
}

.theme-swatch--dark .theme-swatch__fill {
  box-shadow: inset 0 0 0 1rpx rgba(255, 255, 255, 0.2);
}

.option-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.option-pill {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  font-size: 26rpx;
  background: rgba(0, 0, 0, 0.06);
  color: inherit;
}

.reader-chrome-bottom--dark .option-pill {
  background: rgba(255, 255, 255, 0.1);
}

.option-pill.active {
  background: var(--wot-primary-6);
  color: #fff;
}

.option-pills--compact {
  gap: 12rpx;
}

.option-pill--compact {
  padding: 10rpx 20rpx;
  font-size: 24rpx;
}

.subpanel-typography {
  gap: 32rpx;
  padding-bottom: 8rpx;
}

.typo-slider {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.typo-slider-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.typo-slider-label {
  font-size: 26rpx;
  opacity: 0.55;
}

.typo-slider-value {
  font-size: 28rpx;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.typo-slider-body {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.typo-slider-mark {
  flex-shrink: 0;
  width: 36rpx;
  text-align: center;
  line-height: 1;
  color: inherit;
  opacity: 0.45;
}

.typo-slider-mark--sm {
  font-size: 24rpx;
}

.typo-slider-mark--lg {
  font-size: 40rpx;
  font-weight: 600;
  opacity: 0.7;
}

.typo-slider-mark--tight,
.typo-slider-mark--loose {
  font-size: 24rpx;
}

.typo-slider-rail {
  flex: 1;
  position: relative;
  height: 72rpx;
}

.typo-slider-track {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 16rpx;
  transform: translateY(-50%);
  border-radius: 999rpx;
  background: rgba(0, 0, 0, 0.08);
}

.reader-chrome-bottom--dark .typo-slider-track {
  background: rgba(255, 255, 255, 0.14);
}

.typo-slider-knob {
  position: absolute;
  top: 50%;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: #fff;
  box-shadow:
    0 2rpx 8rpx rgba(0, 0, 0, 0.12),
    0 0 0 1rpx rgba(0, 0, 0, 0.06);
  transform: translate(-50%, -50%);
  z-index: 2;
  transition:
    left 0.2s cubic-bezier(0.32, 0.72, 0, 1),
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.reader-chrome-bottom--dark .typo-slider-knob {
  background: #3a3a3c;
  box-shadow:
    0 2rpx 10rpx rgba(0, 0, 0, 0.35),
    0 0 0 1rpx rgba(255, 255, 255, 0.1);
}

.typo-slider-knob--dragging {
  transition: none;
  transform: translate(-50%, -50%) scale(1.12);
  box-shadow:
    0 4rpx 16rpx rgba(0, 0, 0, 0.16),
    0 0 0 1rpx rgba(0, 0, 0, 0.08);
}

.reader-chrome-bottom--dark .typo-slider-knob--dragging {
  box-shadow:
    0 4rpx 16rpx rgba(0, 0, 0, 0.45),
    0 0 0 1rpx rgba(255, 255, 255, 0.14);
}

.reader-toolbar {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  padding: 12rpx 16rpx 16rpx;
}

.toolbar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  padding: 12rpx 0;
  color: inherit;
  opacity: 0.85;
  min-width: 0;
}

.toolbar-item.active {
  opacity: 1;
  color: var(--wot-primary-6);
}

.toolbar-label {
  font-size: 22rpx;
}

.toolbar-icon-text {
  font-size: 36rpx;
  font-weight: 700;
  line-height: 1;
}

.toolbar-icon-theme {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  border: 3rpx solid currentColor;
  background: linear-gradient(90deg, transparent 50%, currentColor 50%);
  opacity: 0.9;
}

.toolbar-icon-page {
  width: 32rpx;
  height: 36rpx;
  border: 3rpx solid currentColor;
  border-radius: 4rpx;
  position: relative;
}

.toolbar-icon-page::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 8rpx;
  bottom: 8rpx;
  width: 2rpx;
  background: currentColor;
  transform: translateX(-50%);
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

.toc-sheet {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 99;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border-radius: 24rpx 24rpx 0 0;
  overflow: hidden;
  box-shadow: 0 -8rpx 32rpx rgba(0, 0, 0, 0.08);
  animation: toc-slide-up 0.28s cubic-bezier(0.32, 0.72, 0, 1);
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
  min-height: 120rpx;
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

.toc-item-text {
  display: block;
  font-size: 32rpx;
  line-height: 1.5;
  color: inherit;
  word-break: break-all;
}

.toc-item.active .toc-item-text {
  color: var(--wot-primary-6);
  font-weight: 600;
}
</style>
