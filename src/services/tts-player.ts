import { DEFAULT_EDGE_TTS_VOICE } from "@/constants/edgeTts";
import { synthesizeEdgeSpeech, type EdgeSpeechRequest } from "@/services/tts";
import type { ListenSentence } from "@/utils/listen-text";

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
  onChapterEnd?: () => void;
  onError?: (message: string) => void;
  /** 真正开始出声时回调（用于把 UI 从 loading/paused 切到 playing） */
  onPlay?: () => void;
  /** 锁屏/控制中心暂停时同步 UI */
  onPause?: () => void;
};

type SpeechJob = {
  key: string;
  req: EdgeSpeechRequest;
  promise: Promise<ArrayBuffer | null>;
};

type ApplyOpts = {
  /** 为 false 时只改参数，不开播（起播前设音色/倍速用） */
  play?: boolean;
};

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
  private jobs = new Map<string, SpeechJob>();
  private bookTitle = "";
  private chapterTitle = "";
  private coverUrl = "";
  private onSentenceChange?: (index: number) => void;
  private onChapterEnd?: () => void;
  private onError?: (message: string) => void;
  private onPlay?: () => void;
  private onPause?: () => void;

  private clearPlayWatchdog(): void {
    if (this.playWatchdogTimer == null) return;
    clearTimeout(this.playWatchdogTimer);
    this.playWatchdogTimer = null;
  }

  private markPlaying(gen: number): void {
    if (gen !== this.playGen) return;
    if (this.playedGen === gen) return;
    this.playedGen = gen;
    this.expectingPlayback = false;
    this.clearPlayWatchdog();
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
        void this.playNext();
      });
      bgm.onPlay(() => {
        if (!this.expectingPlayback) return;
        this.markPlaying(this.playGen);
      });
      bgm.onPause(() => {
        this.expectingPlayback = false;
        this.clearPlayWatchdog();
        this.onPause?.();
      });
      bgm.onStop(() => {
        this.expectingPlayback = false;
        this.clearPlayWatchdog();
      });
      // 锁屏/控制中心切句
      bgm.onPrev(() => {
        this.prevSentence();
      });
      bgm.onNext(() => {
        this.nextSentence();
      });
      // BGM onError 亦常误报，不据此 toast
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
      // 赋值 src 即开播；静音片仅用于解锁
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
    this.onChapterEnd = opts.onChapterEnd;
    this.onError = opts.onError;
    this.onPlay = opts.onPlay;
    this.onPause = opts.onPause;
    this.sentenceIndex = 0;
    this.abortAllSpeech();
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
    await this.playCurrent();
  }

  pause(): void {
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
    } catch {
      // ignore
    }
  }

  stop(): void {
    this.playGen += 1;
    this.abortAllSpeech();
    this.expectingPlayback = false;
    this.clearPlayWatchdog();
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
    // BackgroundAudioManager 是单例，不能 destroy；监听只绑一次
  }

  prevSentence(): void {
    if (this.sentenceIndex <= 0) return;
    this.sentenceIndex -= 1;
    void this.playCurrent();
  }

  nextSentence(): void {
    if (this.sentenceIndex >= this.sentences.length - 1) {
      this.onChapterEnd?.();
      return;
    }
    this.sentenceIndex += 1;
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

  private abortAllSpeech(): void {
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
  }

  private startSpeech(text: string): Promise<ArrayBuffer | null> {
    const key = this.cacheKey(text);
    const existing = this.jobs.get(key);
    if (existing) return existing.promise;

    const req = synthesizeEdgeSpeech(text, { voice: this.voice, speed: this.rate });
    const promise = req.promise
      .then((buf) => buf)
      .catch(() => null)
      .finally(() => {
        const cur = this.jobs.get(key);
        if (cur?.promise === promise) this.jobs.delete(key);
      });
    this.jobs.set(key, { key, req, promise });
    return promise;
  }

  private prefetchNext(fromIndex: number): void {
    const next = this.sentences[fromIndex + 1];
    if (!next?.text) return;
    void this.startSpeech(next.text);
  }

  private async takeBuffer(text: string): Promise<ArrayBuffer> {
    const buf = await this.startSpeech(text);
    if (buf) return buf;
    const key = this.cacheKey(text);
    this.jobs.get(key)?.req.abort();
    this.jobs.delete(key);
    const again = await this.startSpeech(text);
    if (!again) throw new Error("语音合成失败");
    return again;
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

  private async playCurrent(): Promise<void> {
    const gen = ++this.playGen;
    const sentence = this.sentences[this.sentenceIndex];
    if (!sentence) {
      this.onChapterEnd?.();
      return;
    }

    this.onSentenceChange?.(this.sentenceIndex);

    const curKey = this.cacheKey(sentence.text);
    this.abortSpeechExcept(new Set([curKey]));

    const bgm = this.ensureBgm();
    this.expectingPlayback = false;
    this.clearPlayWatchdog();

    try {
      const buf = await this.takeBuffer(sentence.text);
      if (gen !== this.playGen) return;
      if (!buf.byteLength) throw new Error("语音合成失败");

      const prev = this.lastTempPath;
      const filePath = this.writeTempMp3(buf);
      this.lastTempPath = filePath;

      this.applyBgmMeta(sentence.text || this.chapterTitle || "听书");
      this.expectingPlayback = true;
      this.armPlayWatchdog(gen);
      // 赋值 src 后自动播放，支持锁屏/后台
      bgm.src = filePath;

      this.removeTemp(prev);

      if (gen === this.playGen) {
        this.prefetchNext(this.sentenceIndex);
      }
    } catch {
      if (gen === this.playGen) {
        this.onError?.("语音合成失败");
      }
    }
  }
}

export const ttsPlayer = new TtsPlayer();
