/** 后端根地址，开发环境在 `.env.development` 配置 VITE_API_BASE_URL */
export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
