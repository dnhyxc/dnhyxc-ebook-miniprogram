import { DEFAULT_EDGE_TTS_VOICE } from "@/constants/edgeTts";
import {
  synthesizeEdgeSpeechTimed,
  type EdgeSpeechTimedRequest,
  type EdgeTtsBoundary,
} from "@/services/tts";
import type { ListenSentence, ListenTextSpan } from "@/utils/listen-text";
import {
  boundaryTimelineMs,
  estimateSpeechDurationMs,
  listenPartIndexAtTime,
  listenPartStartOffsetMs,
  listenUnitParts,
  listenUnitTail,
  listenUnitTailText,
  locateSpeechOffset,
  pickListenPartByTime,
  resolveListenSynthTarget,
} from "@/utils/listen-text";

function userDataPath(): string {
  // mp-weixin: wx.env.USER_DATA_PATH；uni 部分版本暴露 uni.env
  const uniEnv = (uni as unknown as { env?: { USER_DATA_PATH?: string } }).env;
  if (uniEnv?.USER_DATA_PATH) return uniEnv.USER_DATA_PATH;
  const g = globalThis as typeof globalThis & {
    wx?: { env?: { USER_DATA_PATH?: string } };
  };
  return g.wx?.env?.USER_DATA_PATH ?? "";
}

/** 缓存键 → 稳定短文件名，同键覆盖写，避免拖进度堆出无数 tts-*.mp3 */
function ttsFileNameForKey(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `tts-${(h >>> 0).toString(36)}.mp3`;
}

function isStorageFullError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /maximum size|storage limit|exceeded|文件存储|上限/i.test(msg);
}

/** 本地 mp3 最多留几份（当前+预取+余量）；超出先删最旧 */
const MAX_TTS_FILES = 4;

function clampRate(rate: number): number {
  // 听书刻度：0.5x–3.0x，步进 0.1
  const n = Math.round(rate * 10) / 10;
  return Math.min(3, Math.max(0.5, n));
}

/** timed 接口/Edge 合成上限 2x；更高倍速用 playbackRate 补 */
function synthSpeedOf(rate: number): number {
  return Math.min(2, clampRate(rate));
}

function isDevtools(): boolean {
  try {
    const getDeviceInfo = (uni as typeof uni & { getDeviceInfo?: () => { platform?: string } })
      .getDeviceInfo;
    if (typeof getDeviceInfo === "function") {
      return getDeviceInfo().platform === "devtools";
    }
  } catch {
    // ignore
  }
  return false;
}

/** 合法 PCM 静音 WAV（约 100ms），点击栈内解锁后台音频 */
function buildSilentWavBuffer(): ArrayBuffer {
  const sampleRate = 8000;
  const numSamples = 800;
  const dataSize = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  return buf;
}

let silentWavPath = "";

function ensureSilentWavPath(): string {
  if (silentWavPath) return silentWavPath;
  const base = userDataPath();
  if (!base) return "";
  const path = `${base}/tts-unlock-silent-v2.wav`;
  try {
    uni.getFileSystemManager().accessSync(path);
  } catch {
    uni.getFileSystemManager().writeFileSync(path, buildSilentWavBuffer());
  }
  silentWavPath = path;
  return path;
}

export type TtsPlayerConfigure = {
  bookId: string;
  bookTitle: string;
  chapterIndex: number;
  chapterTitle: string;
  coverUrl?: string;
  sentences: ListenSentence[];
  onSentenceChange?: (index: number, partIndex?: number) => void;
  /** 段内句级高亮（由 WordBoundary 时间戳驱动） */
  onHighlightChange?: (span: ListenTextSpan) => void;
  /** 当前正在播的 TTS 合成文本（短句或整段/剩余长段） */
  onClipTextChange?: (text: string) => void;
  onChapterEnd?: () => void;
  onError?: (message: string) => void;
  /** 开始准备/等待出声（合成或挂 src） */
  onWaiting?: () => void;
  /** 真正开始出声时回调（用于把 UI 从 loading/paused 切到 playing） */
  onPlay?: () => void;
  /** 锁屏/控制中心暂停时同步 UI */
  onPause?: () => void;
};

type SpeechPayload = {
  audio: ArrayBuffer;
  boundaries: EdgeTtsBoundary[];
};

type SpeechJob = {
  key: string;
  req: EdgeSpeechTimedRequest;
  promise: Promise<SpeechPayload | null>;
};

type ApplyOpts = {
  /** 为 false 时只改参数，不开播（起播前设音色/倍速用） */
  play?: boolean;
};

/** 预取：每次只备 1 段；等该段开播后再预取下一段 */
const PREFETCH_AHEAD = 1;
/** 上下句连点停稳后再切，避免一次一 timed */
const SKIP_DEBOUNCE_MS = 220;
/** BGM onTimeUpdate 不可靠；用 tick + boundary 表驱动高亮 */
const HIGHLIGHT_TICK_MS = 200;

/**
 * ponytail: 锁屏/后台续播必须用 BackgroundAudioManager。
 * 代价：微信会显示系统音频播控条；自定义迷你条仍保留，二者并存。
 */
class TtsPlayer {
  private bgm: UniApp.BackgroundAudioManager | null = null;
  private bgmBound = false;
  private sentences: ListenSentence[] = [];
  private sentenceIndex = 0;
  private rate = 1;
  private voice = DEFAULT_EDGE_TTS_VOICE;
  private playGen = 0;
  private playedGen = -1;
  private lastTempPath = "";
  /** 当前 bgm.src 对应的 playGen；用于忽略解锁静音 / 被取消音频的 onEnded */
  private srcGen = -1;
  /**
   * 播放意图（与 UI 对齐的唯一真相）：
   * - run：要出声（合成中 / 播放中）
   * - hold：用户或系统暂停
   */
  private intent: "run" | "hold" = "hold";
  /** 正在等 timed/写盘：此间 bgm 事件不得把 UI 打成 paused */
  private buffering = false;
  /** 已挂上新 src、等 onPlay；此间忽略 pause */
  private expectingPlayback = false;
  /** 当前是否有可听输出 */
  private outputActive = false;
  private playWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private highlightTimer: ReturnType<typeof setInterval> | null = null;
  private highlightStartedAt = 0;
  private highlightPausedMs = 0;
  private highlightPauseAt = 0;
  private activeBoundaries: EdgeTtsBoundary[] = [];
  private lastHighlightKey = "";
  /** 进行中的合成 */
  private jobs = new Map<string, SpeechJob>();
  /** 已完成的音频+boundary（预取结果必须留下） */
  private speechCache = new Map<string, SpeechPayload>();
  /** 已写入本地的 mp3，切段时直接 bgm.src，少一次写盘等待 */
  private fileCache = new Map<string, string>();
  private bookTitle = "";
  private chapterTitle = "";
  private coverUrl = "";
  private onSentenceChange?: (index: number, partIndex?: number) => void;
  private onHighlightChange?: (span: ListenTextSpan) => void;
  private onClipTextChange?: (text: string) => void;
  private onChapterEnd?: () => void;
  private onError?: (message: string) => void;
  private onWaiting?: () => void;
  private onPlay?: () => void;
  private onPause?: () => void;
  /** 各句实测/估算时长（ms）；倍速变更后重估 */
  private sentenceDurMs: number[] = [];
  /** playCurrent 时句内起播偏移（seek 用） */
  private pendingStartMs = 0;
  /** 换合成单元时落到第几句（有 boundary 后换算成 pendingStartMs） */
  private pendingPartIndex: number | null = null;
  /** 当前播的是短句轨还是长片段轨 */
  private clipKind: "part" | "unit" = "unit";
  /** 短句轨时对应的段内句下标；长片段由 boundary 推算 */
  private clipPartIndex = 0;
  /**
   * 播放「剩余长段」时的临时单元（text 不含已播短句）。
   * 高亮/boundary 用它；句下标仍相对原 unit，需加 playPartOffset。
   */
  private boundaryUnit: ListenSentence | null = null;
  /** boundaryUnit.parts[0] 在原 unit 中的下标 */
  private playPartOffset = 0;
  /**
   * 仅起播/切句/改音色倍速等紧急路径为 true：允许先合成短句。
   * playNext 续播必须为 false，走长片段，避免又变回逐句 timed。
   */
  private preferShort = false;
  /** 当前句高亮时钟起点（句内 offset） */
  private clipOriginMs = 0;
  /** 最新 seek 目标；连拖时只落地最后一次，中间请求立刻 abort */
  private pendingSeekMs: number | null = null;
  private seekDrain: Promise<void> | null = null;
  private prefetchTimer: ReturnType<typeof setTimeout> | null = null;
  /** 上下句连点合并：只对停稳后的目标打一次 timed */
  private skipDelta = 0;
  private skipTimer: ReturnType<typeof setTimeout> | null = null;
  private skipGen = 0;

  private clearPlayWatchdog(): void {
    if (this.playWatchdogTimer == null) return;
    clearTimeout(this.playWatchdogTimer);
    this.playWatchdogTimer = null;
  }

  private clearPrefetchTimer(): void {
    if (this.prefetchTimer == null) return;
    clearTimeout(this.prefetchTimer);
    this.prefetchTimer = null;
  }

  private clearSkipTimer(): void {
    if (this.skipTimer == null) return;
    clearTimeout(this.skipTimer);
    this.skipTimer = null;
  }

  /** 真正开始播放后再预取下一段，避免与首句 timed 并行 */
  private schedulePrefetch(fromIndex: number): void {
    this.clearPrefetchTimer();
    const gen = this.playGen;
    void this.prefetchAhead(fromIndex, gen);
  }

  /** 当前播放段对应的「下一段」预取文本（短句→剩余长段；长段→下一单元） */
  private nextPrefetchText(fromIndex: number): string {
    const cur = this.sentences[fromIndex];
    if (!cur?.text) return "";
    if (this.clipKind === "part") {
      return listenUnitTailText(cur, this.clipPartIndex + 1);
    }
    for (let i = 1; i <= PREFETCH_AHEAD; i += 1) {
      const s = this.sentences[fromIndex + i];
      if (s?.text) return s.text;
    }
    return "";
  }

  private stopHighlightTick(): void {
    if (this.highlightTimer == null) return;
    clearInterval(this.highlightTimer);
    this.highlightTimer = null;
  }

  private emitHighlight(timeMs: number): void {
    const origin = this.sentences[this.sentenceIndex];
    if (!origin || !this.onHighlightChange) return;
    // 短句轨 boundary 只覆盖当前句，不能拿去对 unit.text 做词对齐
    if (this.clipKind === "part") {
      const span = listenUnitParts(origin)[this.clipPartIndex];
      if (!span) return;
      const key = `${this.sentenceIndex}:${span.start}:${span.end}`;
      if (key === this.lastHighlightKey) return;
      this.lastHighlightKey = key;
      this.onHighlightChange(span);
      return;
    }
    const unit = this.boundaryUnit ?? origin;
    const span = pickListenPartByTime(unit, this.activeBoundaries, timeMs);
    const key = `${this.sentenceIndex}:${span.start}:${span.end}`;
    if (key === this.lastHighlightKey) return;
    this.lastHighlightKey = key;
    this.onHighlightChange(span);
  }

  /** 当前音频文件内的播放时间（短句轨 = 句内；长片段 = 段内） */
  private resolvePlaybackTimeMs(): number {
    const bgm = this.bgm;
    const cur = Number(bgm?.currentTime ?? 0);
    if (Number.isFinite(cur) && cur > 0) return Math.round(cur * 1000);

    // currentTime 不可用：用墙钟映射到 boundary 时间轴（语速已烘焙进音频）
    const total = boundaryTimelineMs(this.activeBoundaries);
    if (total <= 0) return 0;
    let paused = this.highlightPausedMs;
    if (this.highlightPauseAt > 0) paused += Date.now() - this.highlightPauseAt;
    const elapsed = Math.max(0, Date.now() - this.highlightStartedAt - paused);
    return Math.min(total * 0.99, elapsed);
  }

  /** 映射到长片段时间轴（进度条 / 跨段 seek） */
  private resolveUnitTimeMs(): number {
    if (this.clipKind !== "part") return this.resolvePlaybackTimeMs();
    const unit = this.sentences[this.sentenceIndex];
    if (!unit) return this.resolvePlaybackTimeMs();
    const head = listenPartStartOffsetMs(
      unit,
      [],
      this.clipPartIndex,
      this.durationAt(this.sentenceIndex),
    );
    return head + this.resolvePlaybackTimeMs();
  }

  private currentPartIndex(): number {
    const unit = this.sentences[this.sentenceIndex];
    if (!unit) return 0;
    if (this.clipKind === "part") return this.clipPartIndex;
    const mapUnit = this.boundaryUnit ?? unit;
    const rel = listenPartIndexAtTime(mapUnit, this.activeBoundaries, this.resolvePlaybackTimeMs());
    return this.boundaryUnit ? this.playPartOffset + rel : rel;
  }

  private tickHighlight(): void {
    try {
      this.emitHighlight(this.resolvePlaybackTimeMs());
    } catch {
      // 隐藏页/销毁瞬间回调可能踩微信框架空指针，吞掉即可
    }
  }

  private startHighlightTick(resetClock: boolean): void {
    this.stopHighlightTick();
    if (resetClock) {
      this.highlightStartedAt = Date.now() - this.clipOriginMs;
      this.highlightPausedMs = 0;
    } else if (this.highlightPauseAt > 0) {
      this.highlightPausedMs += Date.now() - this.highlightPauseAt;
    }
    this.highlightPauseAt = 0;
    this.tickHighlight();
    this.highlightTimer = setInterval(() => this.tickHighlight(), HIGHLIGHT_TICK_MS);
  }

  private pauseHighlightTick(): void {
    if (this.highlightPauseAt <= 0) this.highlightPauseAt = Date.now();
    this.stopHighlightTick();
  }

  private markPlaying(gen: number): void {
    if (gen !== this.playGen) return;
    if (this.intent !== "run") return;
    // 还在等 timed/写盘：绝不能切 playing（微信 stop 后仍可能冒出 onPlay/timeUpdate）
    if (this.buffering) return;
    if (this.playedGen === gen) return;
    this.playedGen = gen;
    this.expectingPlayback = false;
    this.outputActive = true;
    this.clearPlayWatchdog();
    this.startHighlightTick(true);
    this.onPlay?.();
    this.schedulePrefetch(this.sentenceIndex);
  }

  private armPlayWatchdog(gen: number): void {
    this.clearPlayWatchdog();
    this.playWatchdogTimer = setTimeout(() => {
      this.playWatchdogTimer = null;
      if (gen !== this.playGen) return;
      if (this.playedGen === gen) return;
      // 仅已挂 src、仍在等出声时兜底
      if (!this.expectingPlayback || this.buffering) return;
      this.markPlaying(gen);
    }, 800);
  }

  /** 需要等合成：loading + 停掉旧声。用 stop 而非 pause，避免微信异步 onPause 污染 UI */
  private beginBuffering(): void {
    this.intent = "run";
    this.buffering = true;
    this.expectingPlayback = false;
    this.outputActive = false;
    this.clearPlayWatchdog();
    this.pauseHighlightTick();
    this.onWaiting?.();
    // 防止旧音频 onEnded 误切下一句
    this.srcGen = -1;
    if (this.bgm) {
      try {
        this.bgm.stop();
      } catch {
        // ignore
      }
    }
  }

  private ensureBgm(): UniApp.BackgroundAudioManager {
    if (this.bgm) return this.bgm;
    const bgm = uni.getBackgroundAudioManager();
    if (!this.bgmBound) {
      bgm.onEnded(() => {
        this.stopHighlightTick();
        this.outputActive = false;
        if (this.intent !== "run") return;
        if (this.buffering || this.expectingPlayback) return;
        // 忽略解锁静音 / stop 后旧音频尾巴，避免切章时 playNext 跳过句首
        if (this.srcGen !== this.playGen || !this.lastTempPath) return;
        void this.playNext();
      });
      bgm.onPlay(() => {
        if (this.intent !== "run") return;
        // 只有已挂上目标 src 后才认作出声；buffering 期间的 play 事件一律忽略
        if (this.expectingPlayback) {
          this.markPlaying(this.playGen);
        } else if (
          !this.buffering &&
          this.sentences[this.sentenceIndex] &&
          this.highlightTimer == null
        ) {
          this.startHighlightTick(false);
        }
      });
      bgm.onPause(() => {
        // 缓冲 / 挂 src 过程中的 pause/stop 副作用：一律忽略
        if (this.buffering || this.expectingPlayback) return;
        this.outputActive = false;
        this.pauseHighlightTick();
        this.clearPlayWatchdog();
        // 用户 pause() 已发过 onPause；此处只处理系统播控条打断
        if (this.intent === "hold") return;
        this.intent = "hold";
        this.onPause?.();
      });
      bgm.onStop(() => {
        // stop 用于缓冲清旧声，不驱动 UI
        if (this.buffering || this.expectingPlayback) return;
        this.expectingPlayback = false;
        this.outputActive = false;
        this.clearPlayWatchdog();
        this.stopHighlightTick();
      });
      bgm.onPrev(() => {
        this.prevSentence();
      });
      bgm.onNext(() => {
        this.nextSentence();
      });
      bgm.onTimeUpdate(() => {
        // 仅「已换源、等出声」时用进度兜底；buffering 时旧进度绝不能变成 playing
        if (this.expectingPlayback) {
          this.markPlaying(this.playGen);
        }
        this.tickHighlight();
      });
      bgm.onError(() => undefined);
      this.bgmBound = true;
    }
    this.bgm = bgm;
    return bgm;
  }

  private applyBgmMeta(title: string): void {
    const bgm = this.ensureBgm();
    bgm.title = title.slice(0, 64) || this.chapterTitle || "听书";
    bgm.epname = this.bookTitle || "听书";
    bgm.singer = this.chapterTitle || "听书";
    if (this.coverUrl) bgm.coverImgUrl = this.coverUrl;
  }

  /**
   * 必须在用户点击的同步调用栈里执行（任何 await 之前）。
   * 后台音频同样需要手势内先占住播放会话。
   */
  unlockFromUserGesture(): void {
    const bgm = this.ensureBgm();
    this.clearPlayWatchdog();
    this.applyBgmMeta("听书");
    if (isDevtools()) return;
    const silent = ensureSilentWavPath();
    if (!silent) return;
    try {
      bgm.src = silent;
    } catch {
      // ignore
    }
  }

  configure(opts: TtsPlayerConfigure): void {
    this.ensureBgm();
    this.bookTitle = opts.bookTitle;
    this.chapterTitle = opts.chapterTitle;
    this.coverUrl = opts.coverUrl ?? "";
    this.sentences = opts.sentences;
    this.onSentenceChange = opts.onSentenceChange;
    this.onHighlightChange = opts.onHighlightChange;
    this.onClipTextChange = opts.onClipTextChange;
    this.onChapterEnd = opts.onChapterEnd;
    this.onError = opts.onError;
    this.onWaiting = opts.onWaiting;
    this.onPlay = opts.onPlay;
    this.onPause = opts.onPause;
    this.sentenceIndex = 0;
    this.activeBoundaries = [];
    this.lastHighlightKey = "";
    this.pendingStartMs = 0;
    this.pendingPartIndex = null;
    this.clipKind = "unit";
    this.clipPartIndex = 0;
    this.boundaryUnit = null;
    this.playPartOffset = 0;
    this.preferShort = false;
    this.skipDelta = 0;
    this.clearSkipTimer();
    this.reestimateDurations();
    this.abortAllSpeech();
  }

  private reestimateDurations(): void {
    this.sentenceDurMs = this.sentences.map((s) => estimateSpeechDurationMs(s.text, this.rate));
  }

  private durationAt(index: number): number {
    const known = this.sentenceDurMs[index];
    if (known != null && known > 0) return known;
    const s = this.sentences[index];
    return s ? estimateSpeechDurationMs(s.text, this.rate) : 0;
  }

  private rememberDuration(index: number, boundaries: EdgeTtsBoundary[]): void {
    const fromBoundary = boundaryTimelineMs(boundaries);
    let fromBgm = 0;
    try {
      const d = Number(this.bgm?.duration ?? 0);
      if (Number.isFinite(d) && d > 0) fromBgm = Math.round(d * 1000);
    } catch {
      // ignore
    }
    const next = fromBoundary || fromBgm || this.durationAt(index);
    if (next > 0) this.sentenceDurMs[index] = next;
  }

  /** 章内播放进度（估算总时长 + 当前长片段时间轴） */
  getProgress(): { positionMs: number; durationMs: number } {
    let durationMs = 0;
    for (let i = 0; i < this.sentences.length; i += 1) durationMs += this.durationAt(i);
    let positionMs = 0;
    for (let i = 0; i < this.sentenceIndex; i += 1) positionMs += this.durationAt(i);
    positionMs += this.resolveUnitTimeMs();
    if (durationMs > 0) positionMs = Math.min(positionMs, durationMs);
    return { positionMs, durationMs };
  }

  /** 当前是否仍有可听输出（用于：预取中勿把播放钮打成 loading） */
  isAudible(): boolean {
    return this.outputActive && !!this.lastTempPath && this.highlightPauseAt <= 0;
  }

  /** ±毫秒快进/快退（跨句）；连点合并到最新目标 */
  seekBy(deltaMs: number): Promise<void> {
    const base = this.pendingSeekMs ?? this.getProgress().positionMs;
    return this.seekTo(base + deltaMs);
  }

  /** 跳到章内绝对时间；loading 中再次拖动会立刻取消上一次 timed，只合成最新点 */
  seekTo(positionMs: number): Promise<void> {
    this.pendingSeekMs = positionMs;
    // 立刻作废当前 playCurrent / timed，不等上一段跑完
    this.playGen += 1;
    this.clearPrefetchTimer();
    this.clearPlayWatchdog();
    this.expectingPlayback = false;
    for (const job of this.jobs.values()) {
      job.req.abort();
    }
    this.jobs.clear();

    if (!this.seekDrain) {
      this.seekDrain = this.drainSeeks().finally(() => {
        this.seekDrain = null;
      });
    }
    return this.seekDrain;
  }

  private async drainSeeks(): Promise<void> {
    while (this.pendingSeekMs != null) {
      const ms = this.pendingSeekMs;
      this.pendingSeekMs = null;
      await this.seekToUnlocked(ms);
    }
  }

  private async seekToUnlocked(positionMs: number): Promise<void> {
    if (!this.sentences.length) return;
    this.intent = "run";
    const durs = this.sentences.map((_, i) => this.durationAt(i));
    const total = durs.reduce((a, b) => a + b, 0);
    const target = Math.max(0, Math.min(positionMs, Math.max(total - 1, 0)));
    const { index, offsetMs } = locateSpeechOffset(durs, target);
    const sameClip = index === this.sentenceIndex;

    // 同段且落在真实音频长度内：直接 seek，不停播、不 loading
    // ponytail: 只用 bgm.duration，不用估算 clipDur（估算偏大时会误判同段）
    if (sameClip && this.clipKind === "unit" && this.bgm && this.lastTempPath) {
      const mediaMs = Math.round((Number(this.bgm.duration) || 0) * 1000);
      if (mediaMs > 0 && offsetMs < mediaMs - 50) {
        try {
          this.bgm.seek(offsetMs / 1000);
          this.clipOriginMs = offsetMs;
          this.highlightStartedAt = Date.now() - offsetMs;
          this.highlightPausedMs = 0;
          this.highlightPauseAt = 0;
          this.buffering = false;
          this.emitHighlight(offsetMs);
          if (!this.isAudible()) {
            this.outputActive = true;
            try {
              this.bgm.play();
            } catch {
              // ignore
            }
          }
          this.onPlay?.();
          return;
        } catch {
          // fall through
        }
      }
    }

    this.sentenceIndex = index;
    this.pendingStartMs = offsetMs;
    this.pendingPartIndex = null;
    await this.playCurrent();
  }

  getSentenceIndex(): number {
    return this.sentenceIndex;
  }

  getRate(): number {
    return this.rate;
  }

  getVoice(): string {
    return this.voice;
  }

  /** 发给 timed 的 speed（≤2） */
  private synthSpeed(): number {
    return synthSpeedOf(this.rate);
  }

  /** rate/synthSpeed：>2x 时用播放器加速补足（BGM 若支持 playbackRate） */
  private playbackBoost(): number {
    const synth = this.synthSpeed();
    if (synth <= 0) return 1;
    return clampRate(this.rate) / synth;
  }

  private applyPlaybackBoost(): void {
    const bgm = this.bgm;
    if (!bgm) return;
    const boost = this.playbackBoost();
    try {
      (bgm as UniApp.BackgroundAudioManager & { playbackRate?: number }).playbackRate = boost;
    } catch {
      // 部分端不支持，忽略
    }
  }

  setRate(rate: number, opts: ApplyOpts = {}): void {
    const next = clampRate(rate);
    if (next === this.rate) return;
    const prevSynth = synthSpeedOf(this.rate);
    const nextSynth = synthSpeedOf(next);
    this.rate = next;
    this.reestimateDurations();
    this.applyPlaybackBoost();
    // 合成倍速没变（例如 2.1→2.8 都打 timed speed=2）：只改播放速率，不重打 timed
    if (prevSynth === nextSynth) return;
    this.clearPrefetchTimer();
    this.abortAllSpeech();
    if (opts.play !== false && this.sentences.length) {
      // 重合成时保住当前句，避免倍速切换跳回段首
      if (this.pendingPartIndex == null) this.pendingPartIndex = this.currentPartIndex();
      this.preferShort = true;
      void this.playCurrent();
    }
  }

  setVoice(voice: string, opts: ApplyOpts = {}): void {
    const next = voice.trim() || DEFAULT_EDGE_TTS_VOICE;
    if (next === this.voice) return;
    this.voice = next;
    this.abortAllSpeech();
    if (opts.play !== false && this.sentences.length) {
      if (this.pendingPartIndex == null) this.pendingPartIndex = this.currentPartIndex();
      this.preferShort = true;
      void this.playCurrent();
    }
  }

  async playFrom(index = 0, partIndex = 0): Promise<void> {
    this.ensureBgm();
    if (!this.sentences.length) {
      this.onChapterEnd?.();
      return;
    }
    this.intent = "run";
    this.sentenceIndex = Math.max(0, Math.min(index, this.sentences.length - 1));
    this.pendingStartMs = 0;
    const unit = this.sentences[this.sentenceIndex];
    const parts = unit ? listenUnitParts(unit) : [];
    const pi = Math.min(Math.max(0, partIndex), Math.max(0, parts.length - 1));
    this.pendingPartIndex = pi;
    this.clipPartIndex = pi;
    this.preferShort = true;
    await this.playCurrent();
  }

  pause(): void {
    this.intent = "hold";
    this.buffering = false;
    this.expectingPlayback = false;
    this.outputActive = false;
    this.clearPlayWatchdog();
    this.pauseHighlightTick();
    this.onPause?.();
    try {
      this.ensureBgm().pause();
    } catch {
      // ignore
    }
  }

  resume(): void {
    this.intent = "run";
    this.buffering = false;
    this.expectingPlayback = true;
    this.outputActive = true;
    this.onPlay?.();
    try {
      this.ensureBgm().play();
      this.startHighlightTick(false);
    } catch {
      // ignore
    }
  }

  stop(): void {
    this.playGen += 1;
    this.srcGen = -1;
    this.abortAllSpeech();
    this.intent = "hold";
    this.buffering = false;
    this.expectingPlayback = false;
    this.outputActive = false;
    this.clearPlayWatchdog();
    this.clearPrefetchTimer();
    this.stopHighlightTick();
    this.activeBoundaries = [];
    this.lastHighlightKey = "";
    this.pendingStartMs = 0;
    this.pendingPartIndex = null;
    this.clipKind = "unit";
    this.clipPartIndex = 0;
    this.boundaryUnit = null;
    this.playPartOffset = 0;
    this.preferShort = false;
    this.skipDelta = 0;
    this.clearSkipTimer();
    this.sentenceDurMs = [];
    if (this.bgm) {
      try {
        this.bgm.stop();
      } catch {
        // ignore
      }
    }
    this.removeTemp(this.lastTempPath);
    this.lastTempPath = "";
    this.sentences = [];
  }

  destroy(): void {
    this.stop();
    this.bgm = null;
  }

  /** 同片段内 seek；失败则 false，由调用方重开播 */
  private seekInClip(startMs: number): boolean {
    if (!this.bgm || !this.lastTempPath) return false;
    try {
      this.bgm.seek(startMs / 1000);
      this.clipOriginMs = startMs;
      this.highlightStartedAt = Date.now() - startMs;
      this.highlightPausedMs = 0;
      this.highlightPauseAt = 0;
      this.emitHighlight(startMs);
      return true;
    } catch {
      return false;
    }
  }

  private hasSynthCacheFor(unitIndex: number, partIndex: number): boolean {
    const unit = this.sentences[unitIndex];
    if (!unit) return false;
    const parts = listenUnitParts(unit);
    const part = parts[partIndex];
    if (part?.text) {
      const pk = this.cacheKey(part.text);
      if (this.fileCache.has(pk) || this.speechCache.has(pk) || this.jobs.has(pk)) return true;
    }
    const uk = this.cacheKey(unit.text);
    if (this.fileCache.has(uk) || this.speechCache.has(uk) || this.jobs.has(uk)) return true;
    if (partIndex > 0) {
      const tail = listenUnitTailText(unit, partIndex);
      if (tail) {
        const tk = this.cacheKey(tail);
        if (this.fileCache.has(tk) || this.speechCache.has(tk) || this.jobs.has(tk)) return true;
      }
    }
    return false;
  }

  /** 从当前句起挪 steps 步（跨单元），返回目标 unit/part；动不了则 null */
  private resolveSkipTarget(steps: number): { sentenceIndex: number; partIndex: number } | null {
    if (!steps || !this.sentences.length) return null;
    let si = this.sentenceIndex;
    let pi = this.currentPartIndex();
    let left = steps;
    while (left !== 0) {
      const unit = this.sentences[si];
      if (!unit) return null;
      const parts = listenUnitParts(unit);
      if (left < 0) {
        if (pi > 0) {
          pi -= 1;
          left += 1;
        } else if (si > 0) {
          si -= 1;
          const prev = this.sentences[si];
          pi = Math.max(0, listenUnitParts(prev ?? unit).length - 1);
          left += 1;
        } else {
          break;
        }
      } else if (pi < parts.length - 1) {
        pi += 1;
        left -= 1;
      } else if (si < this.sentences.length - 1) {
        si += 1;
        pi = 0;
        left -= 1;
      } else {
        break;
      }
    }
    if (si === this.sentenceIndex && pi === this.currentPartIndex() && left === steps) {
      return null;
    }
    return { sentenceIndex: si, partIndex: pi };
  }

  private queueSkip(delta: -1 | 1): void {
    if (!this.sentences.length) return;
    this.skipDelta += delta;

    // 长片段内、且累计仍落在同单元：立刻 seek，不走防抖/timed
    if (this.clipKind === "unit" && this.skipDelta !== 0) {
      const target = this.resolveSkipTarget(this.skipDelta);
      if (target && target.sentenceIndex === this.sentenceIndex) {
        const unit = this.sentences[target.sentenceIndex];
        if (unit) {
          const mapUnit = this.boundaryUnit ?? unit;
          const rel = target.partIndex - (this.boundaryUnit ? this.playPartOffset : 0);
          const mapParts = listenUnitParts(mapUnit);
          if (rel >= 0 && rel < mapParts.length) {
            const startMs = listenPartStartOffsetMs(
              mapUnit,
              this.activeBoundaries,
              rel,
              this.durationAt(target.sentenceIndex),
            );
            if (this.seekInClip(startMs)) {
              this.clipPartIndex = target.partIndex;
              this.onSentenceChange?.(target.sentenceIndex, target.partIndex);
              this.skipDelta = 0;
              this.clearSkipTimer();
              return;
            }
          }
        }
      }
    }

    // 需要重开播：马上取消上一次切句/预取未完成的 timed，避免连点堆请求
    this.abortInFlightSpeech();
    this.clearSkipTimer();
    const gen = ++this.skipGen;
    this.skipTimer = setTimeout(() => {
      this.skipTimer = null;
      if (gen !== this.skipGen) return;
      const steps = this.skipDelta;
      this.skipDelta = 0;
      this.applySkip(steps);
    }, SKIP_DEBOUNCE_MS);
  }

  private applySkip(steps: number): void {
    if (!steps) return;
    const target = this.resolveSkipTarget(steps);
    if (!target) {
      if (steps > 0) {
        const last = this.sentences[this.sentences.length - 1];
        if (
          this.sentenceIndex >= this.sentences.length - 1 &&
          last &&
          this.currentPartIndex() >= listenUnitParts(last).length - 1
        ) {
          this.onChapterEnd?.();
        }
      }
      return;
    }

    const { sentenceIndex: si, partIndex: pi } = target;
    // 同长片段内能 seek 就不重打 timed
    if (si === this.sentenceIndex && this.clipKind === "unit") {
      const unit = this.sentences[si];
      if (unit) {
        const mapUnit = this.boundaryUnit ?? unit;
        const rel = pi - (this.boundaryUnit ? this.playPartOffset : 0);
        const mapParts = listenUnitParts(mapUnit);
        if (rel >= 0 && rel < mapParts.length) {
          const startMs = listenPartStartOffsetMs(
            mapUnit,
            this.activeBoundaries,
            rel,
            this.durationAt(si),
          );
          if (this.seekInClip(startMs)) {
            this.clipPartIndex = pi;
            this.onSentenceChange?.(si, pi);
            return;
          }
        }
      }
    }

    // 落地前再取消一次，确保只有本次目标会发出 timed
    this.abortInFlightSpeech();
    this.sentenceIndex = si;
    this.pendingPartIndex = pi;
    this.pendingStartMs = 0;
    // 有缓存走缓存；无缓存才紧急短句（连点已合并，最多一次 timed）
    this.preferShort = !this.hasSynthCacheFor(si, pi);
    void this.playCurrent();
  }

  /** 上一句：连点合并；优先段内 seek */
  prevSentence(): void {
    this.queueSkip(-1);
  }

  /** 下一句：连点合并；优先段内 seek */
  nextSentence(): void {
    this.queueSkip(1);
  }

  private async playNext(): Promise<void> {
    if (!this.sentences.length) return;
    // 续播禁止短句轨，统一走长片段 / 剩余长段
    this.preferShort = false;
    const unit = this.sentences[this.sentenceIndex];
    if (unit && this.clipKind === "part") {
      const parts = listenUnitParts(unit);
      if (this.clipPartIndex < parts.length - 1) {
        this.pendingPartIndex = this.clipPartIndex + 1;
        this.pendingStartMs = 0;
        await this.playCurrent();
        return;
      }
    }
    this.sentenceIndex += 1;
    if (this.sentenceIndex >= this.sentences.length) {
      this.onChapterEnd?.();
      return;
    }
    this.pendingPartIndex = 0;
    this.pendingStartMs = 0;
    await this.playCurrent();
  }

  private cacheKey(text: string): string {
    // 按实际合成 speed 缓存；2.x~3.x 共用 speed=2 的音频
    return `${this.voice}\0${this.synthSpeed()}\0${text}`;
  }

  private keepKeysFrom(index: number): Set<string> {
    const keep = new Set<string>();
    for (let i = 0; i <= PREFETCH_AHEAD; i += 1) {
      const s = this.sentences[index + i];
      if (!s) continue;
      if (s.text) keep.add(this.cacheKey(s.text));
      if (i === 0) {
        const parts = listenUnitParts(s);
        for (const p of parts) {
          if (p.text) keep.add(this.cacheKey(p.text));
        }
        // 剩余长段（不含已播短句）
        for (let p = 1; p < parts.length; p += 1) {
          const tail = listenUnitTailText(s, p);
          if (tail) keep.add(this.cacheKey(tail));
        }
      }
    }
    return keep;
  }

  private abortAllSpeech(): void {
    for (const job of this.jobs.values()) {
      job.req.abort();
    }
    this.jobs.clear();
    this.speechCache.clear();
    for (const path of this.fileCache.values()) {
      this.removeTemp(path);
    }
    this.fileCache.clear();
    // 顺带清历史随机名残留，避免下次一写就爆盘
    this.sweepOrphanTtsFiles(new Set());
  }

  /** 取消进行中的 timed（保留已完成缓存）；切句连点时先打断上一次 */
  private abortInFlightSpeech(): void {
    this.playGen += 1;
    this.clearPrefetchTimer();
    for (const job of this.jobs.values()) {
      job.req.abort();
    }
    this.jobs.clear();
  }

  private abortSpeechExcept(keepKeys: Set<string>): void {
    for (const [key, job] of [...this.jobs.entries()]) {
      if (keepKeys.has(key)) continue;
      job.req.abort();
      this.jobs.delete(key);
    }
    for (const key of [...this.speechCache.keys()]) {
      if (keepKeys.has(key)) continue;
      this.speechCache.delete(key);
    }
    for (const [key, path] of [...this.fileCache.entries()]) {
      if (keepKeys.has(key)) continue;
      this.fileCache.delete(key);
      if (path !== this.lastTempPath) this.removeTemp(path);
    }
  }

  /** 最近一次合成失败原因（供 UI toast，避免预取 throw 成 MiniProgramError） */
  private lastSynthError = "";

  private startSpeech(text: string): Promise<SpeechPayload | null> {
    const key = this.cacheKey(text);
    const cached = this.speechCache.get(key);
    if (cached) return Promise.resolve(cached);

    const existing = this.jobs.get(key);
    if (existing) return existing.promise;

    const req = synthesizeEdgeSpeechTimed(text, {
      voice: this.voice,
      speed: this.synthSpeed(),
    });
    const promise = req.promise
      .then((result) => {
        if (!result.audio?.byteLength) {
          this.lastSynthError = "语音合成失败：无音频";
          return null;
        }
        const payload: SpeechPayload = {
          audio: result.audio,
          boundaries: result.boundaries ?? [],
        };
        this.speechCache.set(key, payload);
        return payload;
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "语音合成失败";
        // 取消不覆盖真实错误，也不向上抛
        if (!/取消/.test(msg)) this.lastSynthError = msg;
        return null;
      })
      .finally(() => {
        const cur = this.jobs.get(key);
        if (cur?.promise === promise) this.jobs.delete(key);
      });
    this.jobs.set(key, { key, req, promise });
    return promise;
  }

  /**
   * 只预取「紧接着要播」的一段；完成后不链式打下一段。
   * 下一段的预取改在那一段真正开播时由 schedulePrefetch 触发。
   */
  private async prefetchAhead(fromIndex: number, gen = this.playGen): Promise<void> {
    if (gen !== this.playGen) return;
    const text = this.nextPrefetchText(fromIndex);
    if (!text) return;
    const key = this.cacheKey(text);
    if (this.fileCache.has(key) || this.speechCache.has(key)) return;
    await this.prepareFile(text, gen).catch(() => undefined);
  }

  private async takeSpeech(text: string, gen: number): Promise<SpeechPayload | null> {
    const key = this.cacheKey(text);
    const hit = await this.startSpeech(text);
    // 预取与续播 playGen 交错时，仍优先用已写入的缓存
    const cached = this.speechCache.get(key);
    if (cached?.audio.byteLength) return cached;
    if (gen !== this.playGen) return null;
    if (hit?.audio.byteLength) return hit;

    // 400/业务失败不重试，避免倍速切换时连打 timed
    if (this.lastSynthError && !/取消/.test(this.lastSynthError)) {
      return null;
    }

    this.speechCache.delete(key);
    if (this.jobs.has(key)) {
      if (gen !== this.playGen) return null;
      this.jobs.get(key)?.req.abort();
      this.jobs.delete(key);
    }

    if (gen !== this.playGen) return null;
    const again = await this.startSpeech(text);
    if (gen !== this.playGen) {
      return this.speechCache.get(key) ?? null;
    }
    return again?.audio.byteLength ? again : null;
  }

  private removeTemp(path: string): void {
    if (!path) return;
    try {
      uni.getFileSystemManager().unlinkSync(path);
    } catch {
      // ignore
    }
  }

  /** 扫掉 USER_DATA_PATH 里未在保活集合中的 tts-*.mp3（含历史随机名残留） */
  private sweepOrphanTtsFiles(keepPaths: Set<string>): void {
    const base = userDataPath();
    if (!base) return;
    const fs = uni.getFileSystemManager();
    let names: string[] = [];
    try {
      names = fs.readdirSync(base) as string[];
    } catch {
      return;
    }
    for (const name of names) {
      if (!/^tts-.*\.mp3$/i.test(name)) continue;
      const path = `${base}/${name}`;
      if (keepPaths.has(path)) continue;
      try {
        fs.unlinkSync(path);
      } catch {
        // ignore
      }
    }
  }

  /** 磁盘吃紧：丢掉未在播文件 + 扫孤儿；保留当前播放路径 */
  private reclaimTtsDisk(): void {
    const keep = new Set<string>();
    if (this.lastTempPath) keep.add(this.lastTempPath);
    for (const [key, path] of [...this.fileCache.entries()]) {
      if (path === this.lastTempPath) continue;
      this.fileCache.delete(key);
      this.speechCache.delete(key);
      this.removeTemp(path);
    }
    this.sweepOrphanTtsFiles(keep);
  }

  private evictFileCacheExcept(keepKey: string): void {
    if (this.fileCache.size < MAX_TTS_FILES) return;
    for (const [key, path] of [...this.fileCache.entries()]) {
      if (this.fileCache.size < MAX_TTS_FILES) break;
      if (key === keepKey || path === this.lastTempPath) continue;
      this.fileCache.delete(key);
      this.speechCache.delete(key);
      this.removeTemp(path);
    }
  }

  private writeTempMp3(buf: ArrayBuffer, key: string): string {
    const base = userDataPath();
    if (!base) throw new Error("无可用本地路径");
    const filePath = `${base}/${ttsFileNameForKey(key)}`;
    const fs = uni.getFileSystemManager();
    const write = () => fs.writeFileSync(filePath, buf);
    try {
      this.evictFileCacheExcept(key);
      write();
    } catch (err) {
      if (!isStorageFullError(err)) throw err;
      this.reclaimTtsDisk();
      try {
        write();
      } catch (retryErr) {
        if (isStorageFullError(retryErr)) {
          throw new Error("本地缓存已满，请清理微信小程序缓存后重试");
        }
        throw retryErr;
      }
    }
    return filePath;
  }

  /** 合成并写成本地文件；同时缓存 boundary；命中 fileCache 则直接返回 */
  private async prepareFile(
    text: string,
    gen: number,
  ): Promise<{ path: string; boundaries: EdgeTtsBoundary[] } | null> {
    const key = this.cacheKey(text);
    const speech = await this.takeSpeech(text, gen);
    if (!speech) return null;
    const hit = this.fileCache.get(key);
    if (hit) return { path: hit, boundaries: speech.boundaries };
    const filePath = this.writeTempMp3(speech.audio, key);
    this.fileCache.set(key, filePath);
    return { path: filePath, boundaries: speech.boundaries };
  }

  private async playCurrent(): Promise<void> {
    const stillAudible = this.isAudible();
    const gen = ++this.playGen;
    this.intent = "run";
    this.stopHighlightTick();
    const sentence = this.sentences[this.sentenceIndex];
    if (!sentence) {
      this.onChapterEnd?.();
      return;
    }

    const startMsRaw = Math.max(0, this.pendingStartMs);
    this.pendingStartMs = 0;
    const partIdxRaw = this.pendingPartIndex;
    this.pendingPartIndex = null;
    const partIdx = partIdxRaw ?? (startMsRaw > 0 ? 0 : this.clipPartIndex);
    const allowShort = this.preferShort;
    this.preferShort = false;

    const longKey = this.cacheKey(sentence.text);
    const longReady =
      this.fileCache.has(longKey) || this.speechCache.has(longKey) || this.jobs.has(longKey);
    const tail = partIdx > 0 ? listenUnitTail(sentence, partIdx) : null;
    const tailText = tail?.text ?? "";
    const tailKey = tailText ? this.cacheKey(tailText) : "";
    const tailReady =
      !!tailText &&
      (this.fileCache.has(tailKey) || this.speechCache.has(tailKey) || this.jobs.has(tailKey));

    // 紧急短句仅 allowShort；续播一律长段（整段或剩余，去掉已播句）
    let targetText: string;
    let kind: "part" | "unit";
    let mapUnit: ListenSentence | null = null;
    let partOffset = 0;

    if (startMsRaw > 0 || (longReady && !tailReady)) {
      const target = resolveListenSynthTarget(sentence, {
        partIndex: partIdx,
        useUnit: true,
      });
      targetText = target.text;
      kind = "unit";
      mapUnit = null;
      partOffset = 0;
    } else if (tailReady && tail) {
      targetText = tailText;
      kind = "unit";
      mapUnit = tail;
      partOffset = partIdx;
    } else if (allowShort && startMsRaw <= 0) {
      const target = resolveListenSynthTarget(sentence, {
        partIndex: partIdx,
        useUnit: false,
      });
      targetText = target.text;
      kind = target.kind;
      mapUnit = null;
      partOffset = 0;
    } else if (partIdx > 0 && tail) {
      targetText = tailText;
      kind = "unit";
      mapUnit = tail;
      partOffset = partIdx;
    } else {
      targetText = sentence.text;
      kind = "unit";
      mapUnit = null;
      partOffset = 0;
    }

    const targetKey = this.cacheKey(targetText);
    // 仅 file/speech 算可播；jobs 里进行中仍要 loading
    const hasLocal = this.fileCache.has(targetKey) || this.speechCache.has(targetKey);
    if (!hasLocal) {
      this.beginBuffering();
    } else {
      this.buffering = false;
      if (!stillAudible) {
        // 有缓存但当前没在出声（暂停后 seek 等）：先 loading，出声后再 playing
        this.expectingPlayback = false;
        this.onWaiting?.();
      }
    }

    this.clipKind = kind;
    this.clipPartIndex = partIdx;
    this.boundaryUnit = mapUnit;
    this.playPartOffset = partOffset;

    this.onClipTextChange?.(targetText);
    this.onSentenceChange?.(this.sentenceIndex, this.clipPartIndex);
    this.lastHighlightKey = "";
    this.activeBoundaries = [];
    this.emitHighlight(startMsRaw);

    const keep = this.keepKeysFrom(this.sentenceIndex);
    keep.add(this.cacheKey(targetText));
    // 保住即将/正在预取的下一段，切段时不要 abort 掉
    const nextText = this.nextPrefetchText(this.sentenceIndex);
    if (nextText) keep.add(this.cacheKey(nextText));
    this.abortSpeechExcept(keep);
    this.clearPrefetchTimer();

    const bgm = this.ensureBgm();
    if (!this.buffering) {
      this.expectingPlayback = false;
      this.clearPlayWatchdog();
    }

    try {
      this.lastSynthError = "";
      const prepared = await this.prepareFile(targetText, gen);
      if (gen !== this.playGen) return;
      if (this.intent !== "run") return;
      if (!prepared) {
        this.buffering = false;
        this.expectingPlayback = false;
        const msg = this.lastSynthError || "语音合成失败";
        if (!/取消/.test(msg)) this.onError?.(msg);
        return;
      }

      this.activeBoundaries = prepared.boundaries;
      if (kind === "unit" && !mapUnit) {
        this.rememberDuration(this.sentenceIndex, prepared.boundaries);
      }

      let startMs = 0;
      if (kind === "unit" && !mapUnit) {
        startMs = startMsRaw;
        if (partIdxRaw != null && partIdxRaw > 0 && startMsRaw <= 0) {
          startMs = listenPartStartOffsetMs(
            sentence,
            prepared.boundaries,
            partIdxRaw,
            this.durationAt(this.sentenceIndex),
          );
        }
      }
      this.clipOriginMs = startMs;
      this.lastTempPath = prepared.path;
      this.srcGen = gen;
      this.applyBgmMeta(targetText || this.chapterTitle || "听书");
      this.applyPlaybackBoost();
      // 先标 expecting，再清 buffering，避免中间态被旧事件误伤
      this.expectingPlayback = true;
      this.buffering = false;
      this.armPlayWatchdog(gen);
      try {
        bgm.startTime = startMs / 1000;
      } catch {
        // ignore
      }
      bgm.src = prepared.path;
      try {
        bgm.play();
      } catch {
        // 部分端设 src 后自动播
      }
      if (startMs > 0) {
        try {
          bgm.seek(startMs / 1000);
        } catch {
          // ignore
        }
      }
      this.emitHighlight(startMs);
    } catch (err) {
      if (gen !== this.playGen) return;
      this.buffering = false;
      this.expectingPlayback = false;
      const msg = err instanceof Error ? err.message : "";
      if (/取消/.test(msg)) return;
      this.onError?.(msg || this.lastSynthError || "语音合成失败");
    }
  }
}

export const ttsPlayer = new TtsPlayer();
