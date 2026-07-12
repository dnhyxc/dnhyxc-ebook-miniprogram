import { API_BASE_URL } from "@/config/api";
import { getToken } from "@/services/token";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface RequestOptions {
  url: string;
  method?: HttpMethod;
  data?: unknown;
  /** 默认 true，带 Bearer */
  auth?: boolean;
  /** 毫秒；章节解析等长请求可延长 */
  timeout?: number;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

function unwrapBody<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body && "success" in body) {
    return (body as ApiEnvelope<T>).data as T;
  }
  return body as T;
}

export function request<T>(options: RequestOptions): Promise<T> {
  if (!API_BASE_URL) {
    return Promise.reject(new ApiError(0, "未配置 VITE_API_BASE_URL"));
  }

  const header: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.auth !== false) {
    const token = getToken();
    if (token) header.Authorization = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    uni.request({
      url: `${API_BASE_URL}${options.url}`,
      method: options.method ?? "GET",
      data: options.data as UniApp.RequestOptions["data"],
      timeout: options.timeout ?? 60000,
      header,
      success: (res) => {
        const status = res.statusCode;
        if (status === 401) {
          reject(new ApiError(401, "未登录或登录已过期", res.data));
          return;
        }
        if (status >= 200 && status < 300) {
          resolve(unwrapBody<T>(res.data));
          return;
        }
        const raw = res.data;
        const msg =
          typeof raw === "object" && raw && "message" in raw
            ? String((raw as { message: unknown }).message)
            : `请求失败 (${status})`;
        reject(new ApiError(status, msg, raw));
      },
      fail: (err) => reject(new ApiError(0, err.errMsg ?? "网络错误")),
    });
  });
}
