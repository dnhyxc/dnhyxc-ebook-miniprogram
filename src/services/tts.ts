import { API_BASE_URL } from "@/config/api";
import { ApiError } from "@/services/http";
import { getToken } from "@/services/token";

/** 与 Web 默认 Edge 音色一致 */
export const DEFAULT_EDGE_TTS_VOICE = "zh-CN-XiaoxiaoNeural";

export type EdgeSpeechOptions = {
  voice?: string;
  /** 合成语速 0.5–2；听书倍速走此字段，避免 playbackRate 变调 */
  speed?: number;
  vol?: number;
  pitch?: number;
};

export type EdgeSpeechRequest = {
  promise: Promise<ArrayBuffer>;
  /** 取消进行中的 uni.request（切句/停止时务必调用，否则会堆 pending） */
  abort: () => void;
};

const SPEECH_TIMEOUT_MS = 45000;

/** Edge TTS 整段合成，返回可 abort 的请求句柄（不走 JSON unwrap） */
export function synthesizeEdgeSpeech(
  text: string,
  options: EdgeSpeechOptions = {},
): EdgeSpeechRequest {
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

  const promise = new Promise<ArrayBuffer>((resolve, reject) => {
    rejectFn = reject;
    task = uni.request({
      url: `${API_BASE_URL}/speech-transcription/edge/speech`,
      method: "POST",
      header,
      data: {
        text: trimmed,
        voice: options.voice ?? DEFAULT_EDGE_TTS_VOICE,
        speed: options.speed ?? 1,
        vol: options.vol ?? 5,
        pitch: options.pitch ?? 0,
      },
      responseType: "arraybuffer",
      timeout: SPEECH_TIMEOUT_MS,
      success: (res) => {
        finish(() => {
          if (res.statusCode === 401) {
            reject(new ApiError(401, "未登录或登录已过期"));
            return;
          }
          if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
            resolve(res.data as ArrayBuffer);
            return;
          }
          reject(new ApiError(res.statusCode || 0, "语音合成失败"));
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
