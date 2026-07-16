import { API_BASE_URL } from "@/config/api";
import { DEFAULT_EDGE_TTS_VOICE } from "@/constants/edgeTts";
import { ApiError } from "@/services/http";
import { getToken } from "@/services/token";

export { DEFAULT_EDGE_TTS_VOICE };

export type EdgeSpeechOptions = {
  voice?: string;
  /** 合成语速 0.5–2；听书倍速走此字段，避免 playbackRate 变调 */
  speed?: number;
  vol?: number;
  pitch?: number;
};

/** Edge WordBoundary（毫秒，与后端 /edge/speech/timed 对齐） */
export type EdgeTtsBoundary = {
  text: string;
  offsetMs: number;
  durationMs: number;
};

export type EdgeSpeechTimedResult = {
  audio: ArrayBuffer;
  boundaries: EdgeTtsBoundary[];
};

export type EdgeSpeechTimedRequest = {
  promise: Promise<EdgeSpeechTimedResult>;
  /** 取消进行中的 uni.request（切段/停止时务必调用） */
  abort: () => void;
};

const SPEECH_TIMEOUT_MS = 45000;

type TimedApiPayload = {
  audioBase64?: string;
  contentType?: string;
  boundaries?: EdgeTtsBoundary[];
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

function unwrapBody<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body && "success" in body) {
    return (body as ApiEnvelope<T>).data as T;
  }
  return body as T;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  if (typeof uni.base64ToArrayBuffer === "function") {
    return uni.base64ToArrayBuffer(b64);
  }
  // 极少环境无 uni helper：用 atob 兜底
  const binary = globalThis.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function normalizeBoundaries(raw: unknown): EdgeTtsBoundary[] {
  if (!Array.isArray(raw)) return [];
  const out: EdgeTtsBoundary[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const text = String((item as { text?: unknown }).text ?? "");
    const offsetMs = Number((item as { offsetMs?: unknown }).offsetMs ?? 0);
    const durationMs = Number((item as { durationMs?: unknown }).durationMs ?? 0);
    if (!Number.isFinite(offsetMs) || !Number.isFinite(durationMs)) continue;
    out.push({ text, offsetMs, durationMs });
  }
  return out;
}

/**
 * Edge TTS 整段合成 + WordBoundary 时间戳。
 * 走 /edge/speech/timed（JSON），旧二进制 /edge/speech 留给 Web。
 */
export function synthesizeEdgeSpeechTimed(
  text: string,
  options: EdgeSpeechOptions = {},
): EdgeSpeechTimedRequest {
  if (!API_BASE_URL) {
    return {
      promise: Promise.reject(new ApiError(0, "未配置 VITE_API_BASE_URL")),
      abort: () => undefined,
    };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      promise: Promise.reject(new ApiError(0, "朗读文本为空")),
      abort: () => undefined,
    };
  }

  const header: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getToken();
  if (token) header.Authorization = `Bearer ${token}`;

  let settled = false;
  let task: UniApp.RequestTask | null = null;
  let rejectFn: ((err: ApiError) => void) | null = null;

  const finish = (fn: () => void) => {
    if (settled) return;
    settled = true;
    fn();
  };

  const promise = new Promise<EdgeSpeechTimedResult>((resolve, reject) => {
    rejectFn = reject;
    task = uni.request({
      url: `${API_BASE_URL}/speech-transcription/edge/speech/timed`,
      method: "POST",
      header,
      data: {
        text: trimmed,
        voice: options.voice ?? DEFAULT_EDGE_TTS_VOICE,
        speed: options.speed ?? 1,
        vol: options.vol ?? 5,
        pitch: options.pitch ?? 0,
      },
      timeout: SPEECH_TIMEOUT_MS,
      success: (res) => {
        finish(() => {
          if (res.statusCode === 401) {
            reject(new ApiError(401, "未登录或登录已过期"));
            return;
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new ApiError(res.statusCode || 0, "语音合成失败"));
            return;
          }
          const payload = unwrapBody<TimedApiPayload>(res.data);
          const b64 = payload?.audioBase64;
          if (!b64) {
            reject(new ApiError(0, "语音合成失败：无音频"));
            return;
          }
          try {
            resolve({
              audio: base64ToArrayBuffer(b64),
              boundaries: normalizeBoundaries(payload.boundaries),
            });
          } catch {
            reject(new ApiError(0, "语音合成失败：音频解码错误"));
          }
        });
      },
      fail: (err) => {
        finish(() => {
          const msg = err.errMsg ?? "网络错误";
          if (/abort/i.test(msg)) {
            reject(new ApiError(0, "语音合成已取消"));
            return;
          }
          reject(new ApiError(0, msg));
        });
      },
    });

    setTimeout(() => {
      finish(() => {
        try {
          task?.abort();
        } catch {
          // ignore
        }
        reject(new ApiError(0, "语音合成超时"));
      });
    }, SPEECH_TIMEOUT_MS);
  });

  return {
    promise,
    abort: () => {
      finish(() => {
        try {
          task?.abort();
        } catch {
          // ignore
        }
        rejectFn?.(new ApiError(0, "语音合成已取消"));
      });
    },
  };
}

/** @deprecated 听书请用 synthesizeEdgeSpeechTimed；保留别名以免外部误用旧二进制路径 */
export function synthesizeEdgeSpeech(
  text: string,
  options: EdgeSpeechOptions = {},
): { promise: Promise<ArrayBuffer>; abort: () => void } {
  const timed = synthesizeEdgeSpeechTimed(text, options);
  return {
    promise: timed.promise.then((r) => r.audio),
    abort: timed.abort,
  };
}
