import { API_BASE_URL } from "@/config/api";

/** 后端 uploads 相对路径 → 小程序 image 可用的绝对 URL（走 /api/upload/serve，与 API 同域） */
export function resolveUploadFileUrl(path?: string | null): string {
  if (!path?.trim()) return "";
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const storage = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (!API_BASE_URL) return storage;

  return `${API_BASE_URL}/upload/serve?path=${encodeURIComponent(storage)}`;
}
