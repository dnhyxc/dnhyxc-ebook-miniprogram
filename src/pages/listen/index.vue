<template>
  <!--
    设计方向：quiet paper-stage + 微信读书听书操作区布局
    听书页是阅读纸张的延续，表面色/字色跟纸张主题走；强调色只留给播放与选中态。
    操作区三行：音色/语速 → ±段+进度 → 原文/上下章/播控/目录（不含定时关闭、加入书架）。
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

          <view class="listen-script">
            <view class="listen-script__body">
              <scroll-view scroll-y enable-flex class="listen-script__scroll">
                <view class="listen-script__pad">
                  <view class="listen-script__clip">
                    {{ currentClipText || (status === "loading" ? "合成中…" : "点击播放开始听书") }}
                  </view>
                </view>
              </scroll-view>
            </view>
            <view v-if="currentSentenceText" class="listen-script__sentence">
              <text class="listen-script__label">当前句</text>
              <view class="listen-script__now">{{ currentSentenceText }}</view>
            </view>
          </view>
        </view>

        <!-- 微信读书听书操作区：音色/语速 → 进度 → 原文/上下章/播控/目录 -->
        <view class="listen-footer">
          <view class="listen-panel" :style="playCircleStyle">
            <!-- 第一行：音色 | 语速（不含定时关闭、加入书架） -->
            <view class="listen-row listen-row--opts">
              <view class="listen-opt listen-opt--left" @click="openVoiceDrawer">
                <view class="listen-opt__head">
                  <AppIcon name="volume-2" :size="26" :color="iconColor" />
                </view>
                <text class="listen-opt__label">{{ shortVoiceLabel }}</text>
              </view>
              <view class="listen-opt listen-opt--right" @click="openRateDrawer">
                <view class="listen-opt__head">
                  <AppIcon name="gauge" :size="26" :color="iconColor" />
                </view>
                <text class="listen-opt__label">语速 {{ rateLabel }}</text>
              </view>
            </view>

            <!-- 第二行：±15s | 时长进度条（可拖） -->
            <view class="listen-row listen-row--seek">
              <view class="listen-skip" @click="onSkip(-15_000)">
                <ListenSkip15Icon :size="28" :color="iconColor" />
              </view>

              <view
                class="listen-seek"
                @touchstart.stop.prevent="onSeekTouchStart"
                @touchmove.stop.prevent="onSeekTouchMove"
                @touchend.stop.prevent="onSeekTouchEnd"
                @touchcancel.stop.prevent="onSeekTouchEnd"
              >
                <view class="listen-seek__rail" />
                <view class="listen-seek__fill" :style="{ width: `${seekPercent}%` }" />
                <view class="listen-seek__pill" :style="seekPillStyle">
                  <text class="listen-seek__time">{{ seekLabel }}</text>
                </view>
              </view>

              <view class="listen-skip" @click="onSkip(15_000)">
                <ListenSkip15Icon forward :size="28" :color="iconColor" />
              </view>
            </view>

            <!-- 第三行：原文 | 上一章 | 播放 | 下一章 | 目录 -->
            <view class="listen-row listen-row--transport">
              <view class="listen-nav" @click="goOriginal">
                <AppIcon name="book-open" :size="26" :color="iconColor" />
                <text class="listen-nav__label">原文</text>
              </view>

              <view class="listen-chap" @click="onPrevChapter">
                <AppIcon name="fast-backward" :size="32" :color="iconColor" />
              </view>

              <view
                class="listen-play"
                :class="{ 'listen-play--loading': status === 'loading' }"
                @click="onToggle"
              >
                <view class="listen-play__core">
                  <view class="listen-play__shine" />
                  <wd-loading v-if="status === 'loading'" :color="playIconColor" size="32px" />
                  <view
                    v-else
                    class="listen-play__icon"
                    :class="{ 'listen-play__icon--play': status !== 'playing' }"
                  >
                    <AppIcon
                      :name="status === 'playing' ? 'pause' : 'play'"
                      :size="32"
                      :color="playIconColor"
                    />
                  </view>
                </view>
              </view>

              <view class="listen-chap" @click="onNextChapter">
                <AppIcon name="fast-forward" :size="32" :color="iconColor" />
              </view>

              <view class="listen-nav" @click="openToc">
                <AppIcon name="list" :size="26" :color="iconColor" />
                <text class="listen-nav__label">{{ chapterCountLabel }}</text>
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

      <wd-popup
        v-model="rateDrawerOpen"
        position="bottom"
        round
        root-portal
        :z-index="1000"
        :custom-style="popupStyle"
      >
        <wd-config-provider :theme="configTheme" :theme-vars="listenThemeVars">
          <!-- 拦截 touchmove 冒泡，避免滑刻度时底下听书页跟着抖 -->
          <view class="rate-drawer" :style="rateDrawerStyle" @touchmove.stop="noopTouchMove">
            <view class="voice-drawer__handle" @tap="closeRateDrawer">
              <view class="voice-drawer__handle-bar" />
            </view>
            <text class="voice-drawer__title">语速</text>
            <!-- 滑动中只改展示；停稳/点预设后 emit → 实时改播放倍速 -->
            <ListenRatePicker
              :model-value="rate"
              :active="rateDrawerOpen"
              @update:model-value="setListenRate"
            />
          </view>
        </wd-config-provider>
      </wd-popup>
    </view>

    <!-- 放在 overflow:hidden 的 listen-page 外，避免小程序裁切 fixed 抽屉 -->
    <ChapterTocSheet
      v-model:open="tocOpen"
      :chapters="tocChapters"
      :active-toc-index="activeTocIndex"
      :dark="isDarkPaper"
      :background-color="paper.bg"
      :color="paper.fg"
      :top="tocTop"
      :bottom="0"
      :content-safe-bottom="tocSafeBottom"
      :active-color="String(themeVars.buttonPrimaryBg ?? '')"
      @select="onTocSelect"
    />
  </wd-config-provider>
</template>

<script setup lang="ts">
import type { ConfigProviderThemeVars } from "@wot-ui/ui";
import { onReady, onShow } from "@dcloudio/uni-app";
import { computed, ref, watch } from "vue";
import AppIcon from "@/components/AppIcon.vue";
import ListenRatePicker from "@/components/ListenRatePicker.vue";
import ListenSkip15Icon from "@/components/ListenSkip15Icon.vue";
import { EDGE_TTS_LISTEN_VOICES, getEdgeTtsVoiceNameZh } from "@/constants/edgeTts";
import { useChapterListen } from "@/hooks/useChapterListen";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { useThemeAccent } from "@/hooks/useTheme";
import { fetchChapter, fetchChapters } from "@/services/ebook";
import type { ChapterMeta } from "@/types/ebook";
import { findActiveTocListIndex, tocItemListenAnchor } from "@/utils/ebook-toc";

defineOptions({
  components: { AppIcon, ListenRatePicker, ListenSkip15Icon },
});

const {
  status,
  isActive,
  bookId,
  bookTitle,
  chapterTitle,
  chapterIndex,
  currentClipText,
  currentSentenceText,
  durationMs,
  timeProgressRatio,
  timeProgressLabel,
  rate,
  rateLabel,
  voice,
  chapterCountLabel,
  togglePlayListen,
  resumeListen,
  prevListenChapter,
  nextListenChapter,
  seekListenChapter,
  seekListenBy,
  seekListenTo,
  setListenRate,
  setListenVoice,
} = useChapterListen();

const { themeVars, accentBtnStyle } = useThemeAccent();
const { paperTheme, paperStyles, isDarkPaper } = useReaderSettings();

const voiceDrawerOpen = ref(false);
const rateDrawerOpen = ref(false);
const tocOpen = ref(false);
const tocChapters = ref<ChapterMeta[]>([]);
const tocLoading = ref(false);

const activeTocIndex = computed(() =>
  findActiveTocListIndex(tocChapters.value, chapterIndex.value, {
    scrollPercent: timeProgressRatio.value,
  }),
);
const edgeVoices = EDGE_TTS_LISTEN_VOICES;
/** 操作区短标签：音色名 */
const shortVoiceLabel = computed(() => getEdgeTtsVoiceNameZh(voice.value));
const configTheme = computed(() => (isDarkPaper.value ? "dark" : "light"));
const playIconColor = computed(() => String(themeVars.value.buttonMainColor ?? "#ffffff"));

/** 拖拽中临时比例；松手后 seek */
const scrubbing = ref(false);
const scrubRatio = ref(0);

const seekPercent = computed(() => {
  const r = scrubbing.value ? scrubRatio.value : timeProgressRatio.value;
  return Math.round(Math.min(1, Math.max(0, r)) * 1000) / 10;
});

/** 起点贴左、终点贴右，避免 translate(-50%) 盖住 ±15 */
const seekPillStyle = computed(() => {
  const p = seekPercent.value;
  return {
    left: `${p}%`,
    transform: `translate(${-p}%, -50%)`,
  };
});

const seekLabel = computed(() => {
  if (!scrubbing.value) return timeProgressLabel.value;
  const dur = durationMs.value;
  if (dur <= 0) return "00:00 / 00:00";
  const pos = Math.round(scrubRatio.value * dur);
  const fmt = (ms: number) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };
  return `${fmt(pos)} / ${fmt(dur)}`;
});

function ratioFromTouchX(clientX: number, rect: { left: number; width: number }): number {
  if (!(rect.width > 0)) return 0;
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
}

function readSeekRatio(clientX: number, done: (ratio: number) => void) {
  uni
    .createSelectorQuery()
    .select(".listen-seek")
    .boundingClientRect((rect) => {
      const box = (Array.isArray(rect) ? rect[0] : rect) as {
        left?: number;
        width?: number;
      } | null;
      const width = Number(box?.width ?? 0);
      if (!(width > 0)) return;
      done(ratioFromTouchX(clientX, { left: Number(box?.left ?? 0), width }));
    })
    .exec();
}

function onSeekTouchStart(e: TouchEvent) {
  const x = e.touches[0]?.clientX;
  if (x == null) return;
  scrubbing.value = true;
  readSeekRatio(x, (r) => {
    scrubRatio.value = r;
  });
}

function onSeekTouchMove(e: TouchEvent) {
  if (!scrubbing.value) return;
  const x = e.touches[0]?.clientX;
  if (x == null) return;
  readSeekRatio(x, (r) => {
    scrubRatio.value = r;
  });
}

function onSeekTouchEnd() {
  if (!scrubbing.value) return;
  const r = scrubRatio.value;
  scrubbing.value = false;
  const dur = durationMs.value;
  if (dur > 0) seekListenTo(r * dur);
}

function onSkip(deltaMs: number) {
  seekListenBy(deltaMs);
}

/** 目录顶边：状态栏 + 导航栏，避开听书顶栏 */
const tocTop = computed(() => {
  try {
    const { statusBarHeight } = uni.getWindowInfo();
    return (statusBarHeight || 20) + 44;
  } catch {
    return 88;
  }
});

/** 列表末安全区：只垫内容，不抬高整块抽屉（避免底部大块空白） */
const tocSafeBottom = computed(() => {
  try {
    const info = uni.getWindowInfo();
    const inset = Number(
      (info as { safeAreaInsets?: { bottom?: number } }).safeAreaInsets?.bottom ?? 0,
    );
    if (inset > 0) return inset;
    const screen = Number(info.screenHeight ?? 0);
    const safeBottom = Number(info.safeArea?.bottom ?? 0);
    if (screen > 0 && safeBottom > 0) return Math.max(0, screen - safeBottom);
  } catch {
    // ignore
  }
  return 0;
});

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
/** 操作区图标跟纸张字色走，深浅主题一致 */
const iconColor = computed(() => paper.value.fg);

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

/** 倍速抽屉：纸色 token + 主题强调色给刻度组件 */
const rateDrawerStyle = computed(() => {
  const accent = String(themeVars.value.buttonPrimaryBg ?? "#dc541b");
  return {
    ...paperTokenStyle.value,
    "--listen-accent": accent,
  };
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
  if (rateDrawerOpen.value) {
    closeRateDrawer();
    return;
  }
  if (tocOpen.value) {
    tocOpen.value = false;
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
  rateDrawerOpen.value = false;
  tocOpen.value = false;
  voiceDrawerOpen.value = true;
}

function closeVoiceDrawer() {
  voiceDrawerOpen.value = false;
}

function openRateDrawer() {
  voiceDrawerOpen.value = false;
  tocOpen.value = false;
  rateDrawerOpen.value = true;
}

function closeRateDrawer() {
  rateDrawerOpen.value = false;
}

function noopTouchMove() {
  // 仅 stop 冒泡，不 prevent，以免挡住刻度 scroll-view
}

function onPickVoice(id: string) {
  setListenVoice(id);
  voiceDrawerOpen.value = false;
  uni.showToast({ title: `已切换：${getEdgeTtsVoiceNameZh(id)}`, icon: "none" });
}

/** 原文：回阅读页当前跟读位置 */
function goOriginal() {
  uni.navigateBack();
}

async function ensureTocLoaded(): Promise<ChapterMeta[]> {
  if (tocChapters.value.length) return tocChapters.value;
  if (!bookId.value) return [];
  if (tocLoading.value) return tocChapters.value;
  tocLoading.value = true;
  try {
    const res = await fetchChapters(bookId.value);
    tocChapters.value = res.toc?.length ? res.toc : (res.chapters ?? []);
  } catch {
    // 回退 spine 切章
  } finally {
    tocLoading.value = false;
  }
  return tocChapters.value;
}

async function openToc() {
  voiceDrawerOpen.value = false;
  rateDrawerOpen.value = false;
  if (!bookId.value) {
    uni.showToast({ title: "暂无听书会话", icon: "none" });
    return;
  }
  if (!tocChapters.value.length) {
    uni.showLoading({ title: "加载目录", mask: true });
    try {
      await ensureTocLoaded();
    } finally {
      uni.hideLoading();
    }
  }
  if (!tocChapters.value.length) {
    uni.showToast({ title: "暂无目录", icon: "none" });
    return;
  }
  tocOpen.value = true;
}

/** 当前播放对应的目录下标（同 spine 多节时优先标题，再按进度） */
async function resolvePlayingTocIndex(toc: ChapterMeta[]): Promise<number> {
  const spine = chapterIndex.value;
  const title = (chapterTitle.value || "").trim();
  if (title) {
    const exact = toc.findIndex((t) => t.index === spine && (t.title || "").trim() === title);
    if (exact >= 0) return exact;
  }
  let chapterHtml = "";
  try {
    if (bookId.value) {
      const data = await fetchChapter(bookId.value, spine);
      chapterHtml = data.html || "";
    }
  } catch {
    // ignore
  }
  return findActiveTocListIndex(toc, spine, {
    chapterHtml,
    scrollPercent: timeProgressRatio.value,
  });
}

async function seekToTocItem(item: ChapterMeta) {
  let fromSentence = 0;
  let fromPart = 0;
  try {
    if (bookId.value) {
      const data = await fetchChapter(bookId.value, item.index);
      const anchor = tocItemListenAnchor(data.html || "", item);
      fromSentence = anchor.sentenceIndex;
      fromPart = anchor.partIndex;
    }
  } catch {
    // 无正文时仍切章
  }
  await seekListenChapter(item.index, {
    fromSentence,
    fromPart,
    chapterTitle: (item.title || "").trim() || undefined,
  });
}

function onTocSelect(item: ChapterMeta) {
  void seekToTocItem(item);
}

/** 按目录上一项/下一项切章（同文件多节不能用 spine±1） */
async function jumpChapterByToc(delta: -1 | 1) {
  const toc = await ensureTocLoaded();
  if (!toc.length) {
    if (delta < 0) await prevListenChapter();
    else await nextListenChapter();
    return;
  }
  const active = await resolvePlayingTocIndex(toc);
  if (active < 0) {
    if (delta < 0) await prevListenChapter();
    else await nextListenChapter();
    return;
  }
  const target = active + delta;
  if (target < 0) {
    uni.showToast({ title: "已是第一章", icon: "none" });
    return;
  }
  if (target >= toc.length) {
    uni.showToast({ title: "已是最后一章", icon: "none" });
    return;
  }
  const item = toc[target];
  if (!item) return;
  await seekToTocItem(item);
}

function onPrevChapter() {
  void jumpChapterByToc(-1);
}

function onNextChapter() {
  void jumpChapterByToc(1);
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
  padding: 28rpx 36rpx calc(8rpx + env(safe-area-inset-bottom));
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
  font-size: 38rpx;
  font-weight: 600;
  color: var(--listen-fg);
  letter-spacing: 1rpx;
}

.listen-script {
  flex: 1;
  min-height: 0;
  border-radius: var(--listen-radius);
  background: var(--listen-surface);
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.listen-script__body {
  flex: 1;
  min-height: 0;
  /* 视口上下留白：滚动中文字也不贴顶/贴「当前句」 */
  padding: 28rpx 0 24rpx;
  box-sizing: border-box;
}

.listen-script__scroll {
  height: 100%;
  width: 100%;
  box-sizing: border-box;
}

.listen-script__pad {
  padding: 0 32rpx;
  box-sizing: border-box;
}

.listen-script__clip {
  width: 100%;
  font-size: 38rpx;
  line-height: 1.7;
  text-align: justify;
  text-justify: inter-ideograph;
  text-align-last: left;
  overflow-wrap: anywhere;
  word-break: break-all;
  color: var(--listen-fg);
  box-sizing: border-box;
}

.listen-script__sentence {
  flex-shrink: 0;
  padding: 24rpx 32rpx 36rpx;
  border-top: 1rpx solid var(--listen-divider);
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.listen-script__label {
  font-size: 22rpx;
  line-height: 1.2;
  color: var(--listen-ink-mute);
  letter-spacing: 1rpx;
}

.listen-script__now {
  width: 100%;
  font-size: 40rpx;
  line-height: 1.65;
  text-align: justify;
  text-justify: inter-ideograph;
  text-align-last: left;
  overflow-wrap: anywhere;
  word-break: break-all;
  color: var(--listen-fg);
  box-sizing: border-box;
}

.listen-footer {
  flex-shrink: 0;
  padding-top: 36rpx;
}

.listen-panel {
  --listen-side: 112rpx;
  border-radius: var(--listen-radius);
  background: var(--listen-surface);
  padding: 22rpx 0 33rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 36rpx;
}

.listen-row {
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 0;
}

/* 上中下外侧同列：图标落在 --listen-side 槽位居中，与 ±15 / 原文 对齐 */
.listen-row--opts {
  justify-content: space-between;
  align-items: flex-start;
}

.listen-opt {
  --listen-opt-icon: 52rpx;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  max-width: 48%;
  min-width: var(--listen-side);
  padding: 8rpx 0;
  box-sizing: border-box;
}

.listen-opt--left {
  align-items: flex-start;
}

.listen-opt--right {
  align-items: flex-end;
}

.listen-opt:active {
  opacity: 0.65;
}

.listen-opt__head {
  width: var(--listen-side);
  height: var(--listen-opt-icon);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.listen-opt__label {
  font-size: 22rpx;
  color: var(--listen-ink-soft);
  white-space: nowrap;
  line-height: 1.2;
}

/* 文案与图标左右边对齐：(侧栏宽 - 图标宽) / 2 */
.listen-opt--left .listen-opt__label {
  text-align: left;
  padding-left: calc((var(--listen-side) - var(--listen-opt-icon)) / 2);
}

.listen-opt--right .listen-opt__label {
  text-align: right;
  padding-right: calc((var(--listen-side) - var(--listen-opt-icon)) / 2);
}

.listen-row--seek {
  /* 与微信读书一致：±15 与进度条同轴居中，间距收紧 */
  gap: 6rpx;
  height: 56rpx;
  align-items: center;
}

.listen-skip {
  flex-shrink: 0;
  width: var(--listen-side);
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.listen-skip:active {
  opacity: 0.65;
}

.listen-seek {
  flex: 1;
  min-width: 0;
  height: 56rpx;
  position: relative;
  display: flex;
  align-items: center;
}

.listen-seek__rail,
.listen-seek__fill {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 6rpx;
  border-radius: 999rpx;
}

.listen-seek__rail {
  background: var(--listen-divider);
}

.listen-seek__fill {
  right: auto;
  background: var(--play-accent, var(--listen-fg));
  max-width: 100%;
}

.listen-seek__pill {
  position: absolute;
  top: 50%;
  z-index: 2;
  /* 最小宽刚好盖住常见 mm:ss / mm:ss；更长时码再随内容撑开 */
  min-width: 168rpx;
  height: 40rpx;
  padding: 0 12rpx;
  border-radius: 999rpx;
  background: var(--listen-bg);
  border: 1rpx solid var(--listen-divider);
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.16);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
}

.listen-seek__time {
  font-size: 18rpx;
  color: var(--listen-fg);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  line-height: 1;
  text-align: center;
}

.listen-row--transport {
  justify-content: space-between;
}

.listen-nav {
  width: var(--listen-side);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
  box-sizing: border-box;
}

.listen-nav:active {
  opacity: 0.65;
}

.listen-nav__label {
  font-size: 20rpx;
  color: var(--listen-ink-soft);
  text-align: center;
  white-space: nowrap;
}

.listen-chap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80rpx;
}

.listen-chap:active {
  opacity: 0.65;
}

.listen-play {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 8rpx;
}

.listen-play__core {
  position: relative;
  width: 112rpx;
  height: 112rpx;
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

.listen-play--loading {
  pointer-events: none;
  opacity: 0.72;
}

.listen-play--loading .listen-play__core {
  opacity: 1;
}

.listen-row--transport :deep(.listen-play__icon--play) {
  /* 三角播放键视觉重心偏左，略右移居中 */
  margin-left: 6rpx;
}

.rate-drawer {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
  background-color: var(--listen-bg);
  color: var(--listen-fg);
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
