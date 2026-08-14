import { computed, ref } from "vue";
import {
  DEFAULT_EDGE_TTS_VOICE,
  getEdgeTtsVoiceNameZh,
  isEdgeTtsVoiceId,
} from "@/constants/edgeTts";
import { ttsPlayer } from "@/services/tts-player";
import type { ListenSentence, ListenTextSpan } from "@/utils/listen-text";
import { chapterToSentences, sentenceIndexAtScrollPercent } from "@/utils/listen-text";

export type ListenStatus = "idle" | "loading" | "playing" | "paused";

export type ListenChapterPayload = {
  html: string;
  title: string;
  nextIndex: number | null;
};

export type StartListenOptions = {
  bookId: string;
  bookTitle: string;
  coverUrl?: string;
  chapterIndex: number;
  /** 全书章节数，听书页「N 章」用；缺省不展示总数 */
  chapterTotal?: number;
  /** 章内滚动进度 0–1，映射到起播句；缺省从章首 */
  scrollPercent?: number;
  getChapter: (index: number) => Promise<ListenChapterPayload>;
};

/** 阅读页迷你条 / 听书页预设圆钮；刻度另支持 0.5–3.0 / 0.1 */
const LISTEN_RATES = [0.8, 1, 1.5, 2, 3] as const;
const VOICE_STORAGE_KEY = "ebook_edge_tts_voice";

function loadStoredVoice(): string {
  try {
    const id = uni.getStorageSync(VOICE_STORAGE_KEY);
    if (typeof id === "string" && isEdgeTtsVoiceId(id)) return id;
  } catch {
    // ignore
  }
  return DEFAULT_EDGE_TTS_VOICE;
}

const status = ref<ListenStatus>("idle");
const bookId = ref("");
const bookTitle = ref("");
const coverUrl = ref("");
const chapterIndex = ref(0);
const chapterTotal = ref(0);
const chapterTitle = ref("");
const sentences = ref<ListenSentence[]>([]);
const sentenceIndex = ref(0);
/** 阅读页句级高亮 / 跟读（由 Edge WordBoundary 驱动） */
const highlightSpan = ref<ListenTextSpan | null>(null);
const rate = ref(1);
const voice = ref(loadStoredVoice());
/** 当前 TTS 合成片段全文（短句或整段/剩余长段） */
const currentClipText = ref("");
/** 当前正在播的句（段内高亮句） */
const currentSentenceText = ref("");
/** 章内播放位置/总时长（估算+实测），进度条用 */
const positionMs = ref(0);
const durationMs = ref(0);

let getChapterFn: StartListenOptions["getChapter"] | null = null;
let advancing = false;
let sessionGen = 0;
let progressTimer: ReturnType<typeof setInterval> | null = null;

function syncListenProgress() {
  try {
    const p = ttsPlayer.getProgress();
    positionMs.value = p.positionMs;
    durationMs.value = p.durationMs;
  } catch {
    // 页面切换瞬间偶发访问失败，忽略
  }
}

function startProgressTimer() {
  if (progressTimer != null) return;
  syncListenProgress();
  progressTimer = setInterval(syncListenProgress, 250);
}

function stopProgressTimer() {
  if (progressTimer == null) return;
  clearInterval(progressTimer);
  progressTimer = null;
}

function resetSession() {
  status.value = "idle";
  sentences.value = [];
  sentenceIndex.value = 0;
  highlightSpan.value = null;
  currentClipText.value = "";
  currentSentenceText.value = "";
  chapterTitle.value = "";
  chapterTotal.value = 0;
  positionMs.value = 0;
  durationMs.value = 0;
  stopProgressTimer();
}

function applyHighlight(span: ListenTextSpan) {
  highlightSpan.value = span;
  currentSentenceText.value = span.text;
}

function applySentence(index: number, partIndex = 0) {
  sentenceIndex.value = index;
  const unit = sentences.value[index];
  const parts = unit?.parts;
  const part = parts?.length ? parts[Math.min(Math.max(0, partIndex), parts.length - 1)] : null;
  if (part) applyHighlight(part);
  else if (unit) {
    applyHighlight({ text: unit.text, start: unit.start, end: unit.end });
  } else {
    highlightSpan.value = null;
    currentSentenceText.value = "";
  }
  // 合成回调到来前先用整段占位；真正出声后由 onClipTextChange 覆盖为短句/长段
  if (unit) currentClipText.value = unit.text;
}

async function loadAndPlayChapter(
  index: number,
  start: {
    fromSentence?: number;
    fromPart?: number;
    scrollPercent?: number;
    chapterTitle?: string;
  } = {},
): Promise<void> {
  if (!getChapterFn || !bookId.value) return;
  const gen = sessionGen;
  status.value = "loading";

  const chapter = await getChapterFn(index);
  if (gen !== sessionGen) return;

  const list = chapterToSentences(chapter.html);
  if (!list.length) {
    if (chapter.nextIndex != null) {
      await loadAndPlayChapter(chapter.nextIndex, { fromSentence: 0, fromPart: 0 });
      return;
    }
    uni.showToast({ title: "本章无可朗读文本", icon: "none" });
    stopListen();
    return;
  }

  const startIdx =
    start.fromSentence != null
      ? Math.min(Math.max(0, start.fromSentence), list.length - 1)
      : sentenceIndexAtScrollPercent(list, start.scrollPercent ?? 0);
  const startPart = Math.max(0, start.fromPart ?? 0);

  chapterIndex.value = index;
  const titleOverride = (start.chapterTitle ?? "").trim();
  chapterTitle.value = titleOverride || chapter.title || `第 ${index + 1} 章`;
  sentences.value = list;
  applySentence(startIdx, startPart);

  ttsPlayer.configure({
    bookId: bookId.value,
    bookTitle: bookTitle.value,
    chapterIndex: index,
    chapterTitle: chapterTitle.value,
    coverUrl: coverUrl.value,
    sentences: list,
    onSentenceChange: (i, part) => {
      if (gen !== sessionGen) return;
      applySentence(i, part ?? 0);
      syncListenProgress();
    },
    onHighlightChange: (span) => {
      if (gen !== sessionGen) return;
      applyHighlight(span);
    },
    onClipTextChange: (text) => {
      if (gen !== sessionGen) return;
      currentClipText.value = text;
    },
    onChapterEnd: () => {
      if (gen !== sessionGen) return;
      void advanceChapter();
    },
    onError: (message) => {
      if (gen !== sessionGen) return;
      uni.showToast({ title: message, icon: "none" });
      status.value = "paused";
    },
    onWaiting: () => {
      if (gen !== sessionGen) return;
      if (status.value === "idle") return;
      status.value = "loading";
    },
    onPlay: () => {
      if (gen !== sessionGen) return;
      status.value = "playing";
      startProgressTimer();
      syncListenProgress();
    },
    onPause: () => {
      if (gen !== sessionGen) return;
      if (status.value === "idle") return;
      status.value = "paused";
      syncListenProgress();
    },
  });
  // 起播前只同步参数，避免 setVoice/setRate 抢跑 playCurrent 触发误报 onError
  ttsPlayer.setVoice(voice.value, { play: false });
  ttsPlayer.setRate(rate.value, { play: false });
  syncListenProgress();
  startProgressTimer();

  // 不 await 合成：阅读页可立刻跟读滚屏；真正出声由 onPlay 切 playing
  void ttsPlayer.playFrom(startIdx, startPart);
}

async function advanceChapter(): Promise<void> {
  if (advancing || !getChapterFn) return;
  advancing = true;
  try {
    const chapter = await getChapterFn(chapterIndex.value);
    const next = chapter.nextIndex;
    if (next == null) {
      uni.showToast({ title: "已听完本书", icon: "none" });
      stopListen();
      return;
    }
    await loadAndPlayChapter(next, { fromSentence: 0 });
  } catch {
    uni.showToast({ title: "加载下一章失败", icon: "none" });
    status.value = "paused";
  } finally {
    advancing = false;
  }
}

export async function startListen(opts: StartListenOptions): Promise<void> {
  sessionGen += 1;
  ttsPlayer.stop();
  // 必须在本函数第一个 await 之前：点击栈内解锁，否则体验版首次异步 play 必失败
  ttsPlayer.unlockFromUserGesture();
  getChapterFn = opts.getChapter;
  bookId.value = opts.bookId;
  bookTitle.value = opts.bookTitle;
  coverUrl.value = opts.coverUrl ?? "";
  chapterIndex.value = opts.chapterIndex;
  chapterTotal.value = Math.max(0, opts.chapterTotal ?? 0);
  rate.value = 1;
  ttsPlayer.setVoice(voice.value, { play: false });
  ttsPlayer.setRate(1, { play: false });
  // 先进入 loading，立刻露出迷你条，再拉章合成
  status.value = "loading";
  currentClipText.value = "";
  currentSentenceText.value = "准备朗读…";
  chapterTitle.value = "";
  await loadAndPlayChapter(opts.chapterIndex, {
    scrollPercent: opts.scrollPercent ?? 0,
  });
}

/** 听书中跳到指定章（如目录点击），默认从章首起播 */
export async function seekListenChapter(
  index: number,
  fromSentenceOrOpts:
    | number
    | {
        fromSentence?: number;
        fromPart?: number;
        scrollPercent?: number;
        chapterTitle?: string;
      } = 0,
): Promise<void> {
  if (status.value === "idle" || !getChapterFn) return;
  sessionGen += 1;
  ttsPlayer.stop();
  // 切章也在点击栈里解锁，避免体验版异步 play 失败
  ttsPlayer.unlockFromUserGesture();
  status.value = "loading";
  currentClipText.value = "";
  currentSentenceText.value = "准备朗读…";
  const start =
    typeof fromSentenceOrOpts === "number"
      ? { fromSentence: fromSentenceOrOpts, fromPart: 0 }
      : fromSentenceOrOpts;
  await loadAndPlayChapter(index, start);
}

export function pauseListen(): void {
  if (status.value !== "playing" && status.value !== "loading") return;
  ttsPlayer.pause();
}

export function resumeListen(): void {
  if (status.value !== "paused") return;
  ttsPlayer.resume();
}

export function togglePlayListen(): void {
  if (status.value === "playing") pauseListen();
  else if (status.value === "paused") resumeListen();
}

export function stopListen(): void {
  sessionGen += 1;
  advancing = false;
  ttsPlayer.stop();
  getChapterFn = null;
  resetSession();
}

export function prevListenSentence(): void {
  if (status.value === "idle") return;
  ttsPlayer.prevSentence();
}

export function nextListenSentence(): void {
  if (status.value === "idle") return;
  ttsPlayer.nextSentence();
}

/** 跳到章内指定句（进度条点选 / 同 spine 目录切节） */
export function seekListenSentence(
  index: number,
  opts?: { chapterTitle?: string; fromPart?: number },
): void {
  if (status.value === "idle" || !sentences.value.length) return;
  const i = Math.max(0, Math.min(index, sentences.value.length - 1));
  const title = (opts?.chapterTitle ?? "").trim();
  if (title) chapterTitle.value = title;
  const part = Math.max(0, opts?.fromPart ?? 0);
  applySentence(i, part);
  void ttsPlayer.playFrom(i, part);
  syncListenProgress();
}

/** 拖到章内绝对时间位置 */
export function seekListenTo(ms: number): void {
  if (status.value === "idle") return;
  // 进度条立刻跟手；合成目标以最后一次为准（player 会 abort 上一次 timed）
  positionMs.value = Math.max(0, ms);
  void ttsPlayer.seekTo(ms).then(() => {
    syncListenProgress();
  });
  startProgressTimer();
}

/** 章内快进/快退（毫秒，微信听书 ±15s） */
export function seekListenBy(deltaMs: number): void {
  if (status.value === "idle") return;
  const next = Math.max(0, positionMs.value + deltaMs);
  positionMs.value = next;
  void ttsPlayer.seekTo(next).then(() => {
    syncListenProgress();
  });
  startProgressTimer();
}

/** mm:ss */
export function formatListenClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** spine 级上下章（无目录时的回退）；听书页有 toc 时应按目录项切换 */
export async function prevListenChapter(): Promise<void> {
  if (status.value === "idle" || !getChapterFn) return;
  if (chapterIndex.value <= 0) {
    uni.showToast({ title: "已是第一章", icon: "none" });
    return;
  }
  await seekListenChapter(chapterIndex.value - 1, 0);
}

export async function nextListenChapter(): Promise<void> {
  if (status.value === "idle" || !getChapterFn) return;
  const total = chapterTotal.value;
  if (total > 0 && chapterIndex.value >= total - 1) {
    uni.showToast({ title: "已是最后一章", icon: "none" });
    return;
  }
  await seekListenChapter(chapterIndex.value + 1, 0);
}

/** 展示立刻改；合成合并到停稳后一次（>2x 且合成档不变时 player 内不会打 timed） */
let rateSynthTimer: ReturnType<typeof setTimeout> | null = null;

export function setListenRate(next: number): void {
  const n = Math.round(next * 10) / 10;
  rate.value = n;
  if (rateSynthTimer != null) clearTimeout(rateSynthTimer);
  rateSynthTimer = setTimeout(() => {
    rateSynthTimer = null;
    ttsPlayer.setRate(rate.value);
  }, 360);
}

export function setListenVoice(next: string): void {
  if (!isEdgeTtsVoiceId(next) || next === voice.value) return;
  voice.value = next;
  try {
    uni.setStorageSync(VOICE_STORAGE_KEY, next);
  } catch {
    // ignore
  }
  ttsPlayer.setVoice(next);
}

export function cycleListenRate(): void {
  const list = LISTEN_RATES as readonly number[];
  let idx = list.findIndex((r) => Math.abs(r - rate.value) < 0.05);
  if (idx < 0) idx = 0;
  const next = list[(idx + 1) % list.length] ?? 1;
  setListenRate(next);
}

export function expandListenPage(): void {
  if (status.value === "idle") return;
  const pages = getCurrentPages();
  const top = pages[pages.length - 1] as { route?: string } | undefined;
  if (top?.route?.includes("pages/listen/index")) return;
  uni.navigateTo({ url: "/pages/listen/index" });
}

/** 阅读页离开时：若栈顶不是听书页则停播 */
export function stopListenIfLeavingReader(): void {
  const pages = getCurrentPages();
  const hasListen = pages.some((p) => {
    const route = (p as { route?: string }).route ?? "";
    return route.includes("pages/listen/index");
  });
  if (!hasListen) stopListen();
}

export function useChapterListen() {
  const isActive = computed(() => status.value !== "idle");
  const sentenceCount = computed(() => sentences.value.length);
  const progressLabel = computed(() => {
    if (!sentences.value.length) return "";
    return `${sentenceIndex.value + 1} / ${sentences.value.length}`;
  });
  /** 章内句进度 0–1（迷你条等） */
  const progressRatio = computed(() => {
    const n = sentences.value.length;
    if (n <= 0) return 0;
    if (n === 1) return status.value === "idle" ? 0 : 1;
    return Math.min(1, Math.max(0, sentenceIndex.value / (n - 1)));
  });
  /** 章内时长进度 0–1（听书页进度条） */
  const timeProgressRatio = computed(() => {
    if (durationMs.value <= 0) return 0;
    return Math.min(1, Math.max(0, positionMs.value / durationMs.value));
  });
  const timeProgressLabel = computed(() => {
    if (durationMs.value <= 0) return "00:00 / 00:00";
    return `${formatListenClock(positionMs.value)} / ${formatListenClock(durationMs.value)}`;
  });
  const rateLabel = computed(() => `${Number(rate.value).toFixed(1)}x`);
  const voiceLabel = computed(() => getEdgeTtsVoiceNameZh(voice.value));
  const chapterCountLabel = computed(() => {
    if (chapterTotal.value > 0) return `${chapterTotal.value} 章`;
    return "目录";
  });

  return {
    status,
    isActive,
    bookId,
    bookTitle,
    coverUrl,
    chapterIndex,
    chapterTotal,
    chapterTitle,
    sentences,
    sentenceIndex,
    highlightSpan,
    sentenceCount,
    currentClipText,
    currentSentenceText,
    rate,
    rateLabel,
    voice,
    voiceLabel,
    progressLabel,
    progressRatio,
    positionMs,
    durationMs,
    timeProgressRatio,
    timeProgressLabel,
    chapterCountLabel,
    rates: LISTEN_RATES,
    startListen,
    seekListenChapter,
    seekListenSentence,
    seekListenBy,
    seekListenTo,
    pauseListen,
    resumeListen,
    togglePlayListen,
    stopListen,
    prevListenSentence,
    nextListenSentence,
    prevListenChapter,
    nextListenChapter,
    setListenRate,
    setListenVoice,
    cycleListenRate,
    expandListenPage,
    stopListenIfLeavingReader,
  };
}
