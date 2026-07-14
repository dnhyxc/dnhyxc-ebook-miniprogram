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

/** 清掉可能残留的系统后台音频条（此前误用 BackgroundAudioManager） */
function silenceBackgroundAudioBar(): void {
  try {
    const bgm = uni.getBackgroundAudioManager();
    bgm.stop();
  } catch {
    // ignore
  }
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
};

type SpeechJob = {
  key: string;
  req: EdgeSpeechRequest;
  promise: Promise<ArrayBuffer | null>;
};

/**
 * ponytail: 用 InnerAudioContext 而非 BackgroundAudioManager。
 * BGM 会强制弹出微信原生「音频播放」底栏，盖住自定义迷你条；听书播控以页面 UI 为准。
 * 代价：切后台/锁屏可能被系统暂停，若以后要锁屏续播再评估 BGM + 抬高自定义条双轨。
 */
class TtsPlayer {
  private audio: UniApp.InnerAudioContext | null = null;
  private sentences: ListenSentence[] = [];
  private sentenceIndex = 0;
  private rate = 1;
  private playGen = 0;
  private lastTempPath = "";
  /** 进行中的 speech；切句必须 abort，否则 Network 里会堆 pending */
  private jobs = new Map<string, SpeechJob>();
  private onSentenceChange?: (index: number) => void;
  private onChapterEnd?: () => void;
  private onError?: (message: string) => void;

  private ensureAudio(): UniApp.InnerAudioContext {
    if (this.audio) return this.audio;
    silenceBackgroundAudioBar();
    const audio = uni.createInnerAudioContext();
    audio.obeyMuteSwitch = false;
    audio.onEnded(() => {
      void this.playNext();
    });
    audio.onError(() => {
      this.onError?.("音频播放失败");
    });
    this.audio = audio;
    return audio;
  }

  configure(opts: TtsPlayerConfigure): void {
    this.ensureAudio();
    this.sentences = opts.sentences;
    this.onSentenceChange = opts.onSentenceChange;
    this.onChapterEnd = opts.onChapterEnd;
    this.onError = opts.onError;
    this.sentenceIndex = 0;
    this.abortAllSpeech();
  }

  getSentenceIndex(): number {
    return this.sentenceIndex;
  }

  getRate(): number {
    return this.rate;
  }

  setRate(rate: number): void {
    const next = clampRate(rate);
    if (next === this.rate) return;
    this.rate = next;
    // playbackRate 会连音调一起变；倍速改走 Edge TTS speed 重合成
    this.abortAllSpeech();
    if (this.audio) {
      try {
        this.audio.playbackRate = 1;
      } catch {
        // ignore
      }
    }
    if (this.sentences.length) {
      void this.playCurrent();
    }
  }

  async playFrom(index = 0): Promise<void> {
    this.ensureAudio();
    if (!this.sentences.length) {
      this.onChapterEnd?.();
      return;
    }
    this.sentenceIndex = Math.max(0, Math.min(index, this.sentences.length - 1));
    await this.playCurrent();
  }

  pause(): void {
    this.audio?.pause();
  }

  resume(): void {
    this.audio?.play();
  }

  stop(): void {
    this.playGen += 1;
    this.abortAllSpeech();
    if (this.audio) {
      try {
        this.audio.stop();
      } catch {
        // ignore
      }
    }
    this.removeTemp(this.lastTempPath);
    this.lastTempPath = "";
    silenceBackgroundAudioBar();
  }

  destroy(): void {
    this.stop();
    if (this.audio) {
      this.audio.destroy();
      this.audio = null;
    }
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
    return `${this.rate}\0${text}`;
  }

  private abortAllSpeech(): void {
    for (const job of this.jobs.values()) {
      job.req.abort();
    }
    this.jobs.clear();
  }

  /** 只保留 keepKeys；其余 abort。用于切句时丢掉过期预取 */
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

    const req = synthesizeEdgeSpeech(text, { speed: this.rate });
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
    // 预取失败/被取消：清掉坏 job 再合成一次
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
    uni.getFileSystemManager().writeFileSync(filePath, buf, "binary");
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

    // 只保留当前句已有预取；开播前不拉下一句，避免「下一句 200、当前句还 pending」
    const curKey = this.cacheKey(sentence.text);
    this.abortSpeechExcept(new Set([curKey]));

    const audio = this.ensureAudio();
    try {
      audio.stop();
    } catch {
      // ignore
    }

    try {
      const buf = await this.takeBuffer(sentence.text);
      if (gen !== this.playGen) return;

      const prev = this.lastTempPath;
      const filePath = this.writeTempMp3(buf);
      this.lastTempPath = filePath;

      // 语速已在合成时写入；播放端固定 1，避免变调
      try {
        audio.playbackRate = 1;
      } catch {
        // ignore
      }
      audio.src = filePath;
      audio.play();

      this.removeTemp(prev);

      // 当前句真正开播后再预取下一句
      if (gen === this.playGen) {
        this.prefetchNext(this.sentenceIndex);
      }
    } catch {
      if (gen !== this.playGen) return;
      this.onError?.("语音合成失败");
    }
  }
}

export const ttsPlayer = new TtsPlayer();
