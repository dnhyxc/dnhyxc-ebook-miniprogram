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
  locateSpeechOffset,
  pickListenPartByTime,
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

function clampRate(rate: number): number {
  return Math.min(2, Math.max(0.5, rate));
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
  onSentenceChange?: (index: number) => void;
  /** 段内句级高亮（由 WordBoundary 时间戳驱动） */
  onHighlightChange?: (span: ListenTextSpan) => void;
  onChapterEnd?: () => void;
  onError?: (message: string) => void;
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

/** 预取段数：起播只打当前句 timed；成功后再预取 1 段，避免一上来连打 3 次 */
const PREFETCH_AHEAD = 1;
/** 当前句开播后再预取，错开首包 */
const PREFETCH_DELAY_MS = 320;
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
  private expectingPlayback = false;
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
  private onSentenceChange?: (index: number) => void;
  private onHighlightChange?: (span: ListenTextSpan) => void;
  private onChapterEnd?: () => void;
  private onError?: (message: string) => void;
  private onPlay?: () => void;
  private onPause?: () => void;
  /** 各句实测/估算时长（ms）；倍速变更后重估 */
  private sentenceDurMs: number[] = [];
  /** playCurrent 时句内起播偏移（seek 用） */
  private pendingStartMs = 0;
  /** 当前句高亮时钟起点（句内 offset） */
  private clipOriginMs = 0;
  /** 串行化 ±/拖拽 seek，避免连点打断合成后误报失败 */
  private seekQueue: Promise<void> = Promise.resolve();
  private prefetchTimer: ReturnType<typeof setTimeout> | null = null;

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

  /** 当前句合成成功后再预取，避免起播瞬间并行打满 timed */
  private schedulePrefetch(fromIndex: number): void {
    this.clearPrefetchTimer();
    const gen = this.playGen;
    this.prefetchTimer = setTimeout(() => {
      this.prefetchTimer = null;
      if (gen !== this.playGen) return;
      this.prefetchAhead(fromIndex);
    }, PREFETCH_DELAY_MS);
  }

  private stopHighlightTick(): void {
    if (this.highlightTimer == null) return;
    clearInterval(this.highlightTimer);
    this.highlightTimer = null;
  }

  private emitHighlight(timeMs: number): void {
    const unit = this.sentences[this.sentenceIndex];
    if (!unit || !this.onHighlightChange) return;
    const span = pickListenPartByTime(unit, this.activeBoundaries, timeMs);
    const key = `${this.sentenceIndex}:${span.start}:${span.end}`;
    if (key === this.lastHighlightKey) return;
    this.lastHighlightKey = key;
    this.onHighlightChange(span);
  }

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
    if (this.playedGen === gen) return;
    this.playedGen = gen;
    this.expectingPlayback = false;
    this.clearPlayWatchdog();
    this.startHighlightTick(true);
    this.onPlay?.();
  }

  private armPlayWatchdog(gen: number): void {
    this.clearPlayWatchdog();
    this.playWatchdogTimer = setTimeout(() => {
      this.playWatchdogTimer = null;
      if (gen !== this.playGen) return;
      if (this.playedGen === gen) return;
      this.markPlaying(gen);
    }, 800);
  }

  private ensureBgm(): UniApp.BackgroundAudioManager {
    if (this.bgm) return this.bgm;
    const bgm = uni.getBackgroundAudioManager();
    if (!this.bgmBound) {
      bgm.onEnded(() => {
        this.stopHighlightTick();
        void this.playNext();
      });
      bgm.onPlay(() => {
        if (this.expectingPlayback) this.markPlaying(this.playGen);
        else if (this.sentences[this.sentenceIndex] && this.highlightTimer == null) {
          this.startHighlightTick(false);
        }
      });
      bgm.onPause(() => {
        this.expectingPlayback = false;
        this.clearPlayWatchdog();
        this.pauseHighlightTick();
        this.onPause?.();
      });
      bgm.onStop(() => {
        this.expectingPlayback = false;
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
    this.onChapterEnd = opts.onChapterEnd;
    this.onError = opts.onError;
    this.onPlay = opts.onPlay;
    this.onPause = opts.onPause;
    this.sentenceIndex = 0;
    this.activeBoundaries = [];
    this.lastHighlightKey = "";
    this.pendingStartMs = 0;
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

  /** 章内播放进度（估算总时长 + 当前句内时间） */
  getProgress(): { positionMs: number; durationMs: number } {
    let durationMs = 0;
    for (let i = 0; i < this.sentences.length; i += 1) durationMs += this.durationAt(i);
    let positionMs = 0;
    for (let i = 0; i < this.sentenceIndex; i += 1) positionMs += this.durationAt(i);
    positionMs += this.resolvePlaybackTimeMs();
    if (durationMs > 0) positionMs = Math.min(positionMs, durationMs);
    return { positionMs, durationMs };
  }

  /** ±毫秒快进/快退（跨句）；连点排队，用最新进度累加 */
  seekBy(deltaMs: number): void {
    void this.enqueueSeek(async () => {
      const { positionMs } = this.getProgress();
      await this.seekToUnlocked(positionMs + deltaMs);
    });
  }

  /** 跳到章内绝对时间 */
  seekTo(positionMs: number): Promise<void> {
    return this.enqueueSeek(() => this.seekToUnlocked(positionMs));
  }

  private enqueueSeek(task: () => Promise<void>): Promise<void> {
    const run = this.seekQueue.then(task, task);
    this.seekQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async seekToUnlocked(positionMs: number): Promise<void> {
    if (!this.sentences.length) return;
    const durs = this.sentences.map((_, i) => this.durationAt(i));
    const total = durs.reduce((a, b) => a + b, 0);
    const target = Math.max(0, Math.min(positionMs, Math.max(total - 1, 0)));
    const { index, offsetMs } = locateSpeechOffset(durs, target);
    const sameClip = index === this.sentenceIndex;

    // 同句内优先 bgm.seek，避免重合成；偏移已近句末则落到下一句
    if (sameClip && this.bgm && this.lastTempPath) {
      const clipDur = Math.max(this.durationAt(index), 1);
      if (offsetMs < clipDur - 80) {
        try {
          this.bgm.seek(offsetMs / 1000);
          this.clipOriginMs = offsetMs;
          this.highlightStartedAt = Date.now() - offsetMs;
          this.highlightPausedMs = 0;
          this.highlightPauseAt = 0;
          this.emitHighlight(offsetMs);
          return;
        } catch {
          // fall through：部分机型 seek 失败则重开播
        }
      }
    }

    this.sentenceIndex = index;
    this.pendingStartMs = offsetMs;
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

  setRate(rate: number, opts: ApplyOpts = {}): void {
    const next = clampRate(rate);
    if (next === this.rate) return;
    this.rate = next;
    this.abortAllSpeech();
    this.reestimateDurations();
    if (opts.play !== false && this.sentences.length) {
      void this.playCurrent();
    }
  }

  setVoice(voice: string, opts: ApplyOpts = {}): void {
    const next = voice.trim() || DEFAULT_EDGE_TTS_VOICE;
    if (next === this.voice) return;
    this.voice = next;
    this.abortAllSpeech();
    if (opts.play !== false && this.sentences.length) {
      void this.playCurrent();
    }
  }

  async playFrom(index = 0): Promise<void> {
    this.ensureBgm();
    if (!this.sentences.length) {
      this.onChapterEnd?.();
      return;
    }
    this.sentenceIndex = Math.max(0, Math.min(index, this.sentences.length - 1));
    this.pendingStartMs = 0;
    await this.playCurrent();
  }

  pause(): void {
    this.pauseHighlightTick();
    try {
      this.ensureBgm().pause();
    } catch {
      // ignore
    }
  }

  resume(): void {
    try {
      this.expectingPlayback = true;
      this.ensureBgm().play();
      this.startHighlightTick(false);
    } catch {
      // ignore
    }
  }

  stop(): void {
    this.playGen += 1;
    this.abortAllSpeech();
    this.expectingPlayback = false;
    this.clearPlayWatchdog();
    this.clearPrefetchTimer();
    this.stopHighlightTick();
    this.activeBoundaries = [];
    this.lastHighlightKey = "";
    this.pendingStartMs = 0;
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

  /** 上一句：换合成单元（一句一片），不再段内 seek */
  prevSentence(): void {
    if (this.sentenceIndex <= 0) return;
    this.sentenceIndex -= 1;
    this.pendingStartMs = 0;
    void this.playCurrent();
  }

  /** 下一句：换合成单元（一句一片） */
  nextSentence(): void {
    if (this.sentenceIndex >= this.sentences.length - 1) {
      this.onChapterEnd?.();
      return;
    }
    this.sentenceIndex += 1;
    this.pendingStartMs = 0;
    void this.playCurrent();
  }

  private async playNext(): Promise<void> {
    this.sentenceIndex += 1;
    if (this.sentenceIndex >= this.sentences.length) {
      this.onChapterEnd?.();
      return;
    }
    await this.playCurrent();
  }

  private cacheKey(text: string): string {
    return `${this.voice}\0${this.rate}\0${text}`;
  }

  private keepKeysFrom(index: number): Set<string> {
    const keep = new Set<string>();
    for (let i = 0; i <= PREFETCH_AHEAD; i += 1) {
      const s = this.sentences[index + i];
      if (s?.text) keep.add(this.cacheKey(s.text));
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

    const req = synthesizeEdgeSpeechTimed(text, { voice: this.voice, speed: this.rate });
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

  private prefetchAhead(fromIndex: number): void {
    const gen = this.playGen;
    for (let i = 1; i <= PREFETCH_AHEAD; i += 1) {
      const s = this.sentences[fromIndex + i];
      if (!s?.text) continue;
      void this.prepareFile(s.text, gen).catch(() => undefined);
    }
  }

  private async takeSpeech(text: string, gen: number): Promise<SpeechPayload | null> {
    const hit = await this.startSpeech(text);
    if (gen !== this.playGen) return null;
    if (hit?.audio.byteLength) return hit;

    const key = this.cacheKey(text);
    // 仅清失败缓存，勿 abort 同 key 上可能已被新 playGen 复用的任务
    this.speechCache.delete(key);
    if (!this.jobs.has(key)) {
      // 旧 job 已结束；再开一轮
    } else {
      // job 仍在：多半是被取消，等 playGen 判定后退出，避免误杀新请求
      if (gen !== this.playGen) return null;
      this.jobs.get(key)?.req.abort();
      this.jobs.delete(key);
    }

    if (gen !== this.playGen) return null;
    const again = await this.startSpeech(text);
    if (gen !== this.playGen) return null;
    // ponytail: 失败返回 null，由 playCurrent 弹 lastSynthError；预取路径不再 throw
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

  private writeTempMp3(buf: ArrayBuffer): string {
    const base = userDataPath();
    if (!base) throw new Error("无可用本地路径");
    const filePath = `${base}/tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    uni.getFileSystemManager().writeFileSync(filePath, buf);
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
    const filePath = this.writeTempMp3(speech.audio);
    this.fileCache.set(key, filePath);
    return { path: filePath, boundaries: speech.boundaries };
  }

  private async playCurrent(): Promise<void> {
    const gen = ++this.playGen;
    this.stopHighlightTick();
    const sentence = this.sentences[this.sentenceIndex];
    if (!sentence) {
      this.onChapterEnd?.();
      return;
    }

    const startMs = Math.max(0, this.pendingStartMs);
    this.pendingStartMs = 0;
    this.clipOriginMs = startMs;

    this.onSentenceChange?.(this.sentenceIndex);
    // 切段瞬间先高亮首句（boundary 到位后由 tick 推进）
    this.lastHighlightKey = "";
    this.activeBoundaries = [];
    this.emitHighlight(startMs);

    const keep = this.keepKeysFrom(this.sentenceIndex);
    this.abortSpeechExcept(keep);
    this.clearPrefetchTimer();

    const bgm = this.ensureBgm();
    this.expectingPlayback = false;
    this.clearPlayWatchdog();

    try {
      this.lastSynthError = "";
      // 先只合成当前句；预取延后，避免起播连打 3 次 timed
      const prepared = await this.prepareFile(sentence.text, gen);
      if (gen !== this.playGen) return;
      if (!prepared) {
        const msg = this.lastSynthError || "语音合成失败";
        if (!/取消/.test(msg)) this.onError?.(msg);
        return;
      }

      this.activeBoundaries = prepared.boundaries;
      this.rememberDuration(this.sentenceIndex, prepared.boundaries);
      this.lastTempPath = prepared.path;
      this.applyBgmMeta(sentence.text || this.chapterTitle || "听书");
      this.expectingPlayback = true;
      this.armPlayWatchdog(gen);
      // 句内 seek：先 startTime 再赋 src；播放后再 seek 兜底
      try {
        bgm.startTime = startMs / 1000;
      } catch {
        // ignore
      }
      bgm.src = prepared.path;
      if (startMs > 0) {
        try {
          bgm.seek(startMs / 1000);
        } catch {
          // ignore
        }
      }

      if (gen === this.playGen) {
        this.schedulePrefetch(this.sentenceIndex);
      }
    } catch (err) {
      if (gen !== this.playGen) return;
      const msg = err instanceof Error ? err.message : "";
      // 被更新的 seek/切段取消时不弹失败
      if (/取消/.test(msg)) return;
      this.onError?.(msg || this.lastSynthError || "语音合成失败");
    }
  }
}

export const ttsPlayer = new TtsPlayer();
