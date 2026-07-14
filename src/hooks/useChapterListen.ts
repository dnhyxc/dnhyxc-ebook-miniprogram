import { computed, ref } from "vue";
import { ttsPlayer } from "@/services/tts-player";
import type { ListenSentence } from "@/utils/listen-text";
import { chapterToSentences } from "@/utils/listen-text";

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
  /** 章内滚动进度 0–1，映射到起播句；缺省从章首 */
  scrollPercent?: number;
  getChapter: (index: number) => Promise<ListenChapterPayload>;
};

const LISTEN_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

const status = ref<ListenStatus>("idle");
const bookId = ref("");
const bookTitle = ref("");
const coverUrl = ref("");
const chapterIndex = ref(0);
const chapterTitle = ref("");
const sentences = ref<ListenSentence[]>([]);
const sentenceIndex = ref(0);
const rate = ref(1);
const currentSentenceText = ref("");

let getChapterFn: StartListenOptions["getChapter"] | null = null;
let advancing = false;
let sessionGen = 0;

function resetSession() {
  status.value = "idle";
  sentences.value = [];
  sentenceIndex.value = 0;
  currentSentenceText.value = "";
  chapterTitle.value = "";
}

function applySentence(index: number) {
  sentenceIndex.value = index;
  currentSentenceText.value = sentences.value[index]?.text ?? "";
}

/** 章内滚动进度 → 句下标（对齐听书跟随滚屏的近似映射） */
function sentenceIndexFromScrollPercent(count: number, scrollPercent: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 0;
  const p = Math.min(1, Math.max(0, scrollPercent));
  if (p <= 0) return 0;
  if (p >= 1) return count - 1;
  return Math.min(count - 1, Math.floor(p * count));
}

async function loadAndPlayChapter(
  index: number,
  start: { fromSentence?: number; scrollPercent?: number } = {},
): Promise<void> {
  if (!getChapterFn || !bookId.value) return;
  const gen = sessionGen;
  status.value = "loading";

  const chapter = await getChapterFn(index);
  if (gen !== sessionGen) return;

  const list = chapterToSentences(chapter.html);
  if (!list.length) {
    if (chapter.nextIndex != null) {
      await loadAndPlayChapter(chapter.nextIndex, { fromSentence: 0 });
      return;
    }
    uni.showToast({ title: "本章无可朗读文本", icon: "none" });
    stopListen();
    return;
  }

  const startIdx =
    start.fromSentence != null
      ? Math.min(Math.max(0, start.fromSentence), list.length - 1)
      : sentenceIndexFromScrollPercent(list.length, start.scrollPercent ?? 0);

  chapterIndex.value = index;
  chapterTitle.value = chapter.title || `第 ${index + 1} 章`;
  sentences.value = list;
  applySentence(startIdx);

  ttsPlayer.configure({
    bookId: bookId.value,
    bookTitle: bookTitle.value,
    chapterIndex: index,
    chapterTitle: chapterTitle.value,
    coverUrl: coverUrl.value,
    sentences: list,
    onSentenceChange: (i) => {
      if (gen !== sessionGen) return;
      applySentence(i);
      if (status.value === "loading") status.value = "playing";
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
  });
  ttsPlayer.setRate(rate.value);

  await ttsPlayer.playFrom(startIdx);
  if (gen !== sessionGen) return;
  if (status.value === "loading") status.value = "playing";
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
  getChapterFn = opts.getChapter;
  bookId.value = opts.bookId;
  bookTitle.value = opts.bookTitle;
  coverUrl.value = opts.coverUrl ?? "";
  chapterIndex.value = opts.chapterIndex;
  rate.value = 1;
  // 先进入 loading，立刻露出迷你条，再拉章合成
  status.value = "loading";
  currentSentenceText.value = "准备朗读…";
  chapterTitle.value = "";
  await loadAndPlayChapter(opts.chapterIndex, {
    scrollPercent: opts.scrollPercent ?? 0,
  });
}

/** 听书中跳到指定章（如目录点击），默认从章首起播 */
export async function seekListenChapter(index: number, fromSentence = 0): Promise<void> {
  if (status.value === "idle" || !getChapterFn) return;
  sessionGen += 1;
  ttsPlayer.stop();
  status.value = "loading";
  currentSentenceText.value = "准备朗读…";
  await loadAndPlayChapter(index, { fromSentence });
}

export function pauseListen(): void {
  if (status.value !== "playing") return;
  ttsPlayer.pause();
  status.value = "paused";
}

export function resumeListen(): void {
  if (status.value !== "paused") return;
  ttsPlayer.resume();
  status.value = "playing";
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
  status.value = "playing";
  ttsPlayer.prevSentence();
}

export function nextListenSentence(): void {
  if (status.value === "idle") return;
  status.value = "playing";
  ttsPlayer.nextSentence();
}

export function setListenRate(next: number): void {
  rate.value = next;
  ttsPlayer.setRate(next);
  // setRate 会按新语速重合成当前句并开播
  if (status.value !== "idle") status.value = "playing";
}

export function cycleListenRate(): void {
  const idx = LISTEN_RATES.indexOf(rate.value as (typeof LISTEN_RATES)[number]);
  const next = LISTEN_RATES[(idx + 1) % LISTEN_RATES.length] ?? 1;
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
    return `${sentenceIndex.value + 1}/${sentences.value.length}`;
  });
  const rateLabel = computed(() => `${rate.value}x`);

  return {
    status,
    isActive,
    bookId,
    bookTitle,
    coverUrl,
    chapterIndex,
    chapterTitle,
    sentences,
    sentenceIndex,
    sentenceCount,
    currentSentenceText,
    rate,
    rateLabel,
    progressLabel,
    rates: LISTEN_RATES,
    startListen,
    seekListenChapter,
    pauseListen,
    resumeListen,
    togglePlayListen,
    stopListen,
    prevListenSentence,
    nextListenSentence,
    setListenRate,
    cycleListenRate,
    expandListenPage,
    stopListenIfLeavingReader,
  };
}
