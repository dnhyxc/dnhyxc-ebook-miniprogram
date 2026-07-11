import { request } from "@/services/http";
import { clearToken, getToken, setToken } from "@/services/token";
import { encryptPassword } from "@/utils/crypto";

const BIND_TOKEN_KEY = "wechat_bind_token";
const USER_PROFILE_KEY = "auth_user_profile";

export { getToken, setToken, clearToken };

export type AuthPhase = "guest" | "need_bind" | "logged_in";

export interface UserProfile {
  username?: string;
  email?: string;
  web_linked?: boolean;
}

export class AuthNeedBindError extends Error {
  readonly bindToken: string;

  constructor(bindToken: string) {
    super("该微信尚未绑定账号");
    this.name = "AuthNeedBindError";
    this.bindToken = bindToken;
  }
}

interface WechatLoginResponse {
  access_token?: string;
  need_bind?: boolean;
  bind_token?: string;
  web_linked?: boolean;
  id?: number;
  username?: string;
  email?: string;
}

export function isPlaceholderProfile(profile?: UserProfile | null): boolean {
  if (!profile) return false;
  const email = profile.email?.toLowerCase() ?? "";
  const username = profile.username ?? "";
  return email.endsWith("@wx.local") || username.startsWith("wx_");
}

export function getStoredProfile(): UserProfile | null {
  const raw = uni.getStorageSync(USER_PROFILE_KEY);
  if (!raw || typeof raw !== "object") return null;
  return raw as UserProfile;
}

function saveProfile(profile: UserProfile) {
  uni.setStorageSync(USER_PROFILE_KEY, profile);
}

export function clearStoredProfile() {
  uni.removeStorageSync(USER_PROFILE_KEY);
}

export function getBindToken(): string {
  return (uni.getStorageSync(BIND_TOKEN_KEY) as string) || "";
}

export function setBindToken(token: string) {
  uni.setStorageSync(BIND_TOKEN_KEY, token);
}

export function clearBindToken() {
  uni.removeStorageSync(BIND_TOKEN_KEY);
}

/** 当前登录阶段（不发起网络请求） */
export function getAuthPhase(): AuthPhase {
  const token = getToken();
  if (!token) {
    return getBindToken() ? "need_bind" : "guest";
  }

  const profile = getStoredProfile();
  if (profile?.web_linked === true && !isPlaceholderProfile(profile)) {
    return "logged_in";
  }
  if (isPlaceholderProfile(profile)) {
    clearToken();
    clearStoredProfile();
    return getBindToken() ? "need_bind" : "guest";
  }

  // 有 token 但无 profile（旧缓存）：要求重新登录
  return "guest";
}

export function logout() {
  clearToken();
  clearBindToken();
  clearStoredProfile();
}

function applyLoginResponse(data: WechatLoginResponse): UserProfile {
  const profile: UserProfile = {
    username: data.username,
    email: data.email,
    web_linked: data.web_linked === true,
  };
  if (data.access_token) {
    setToken(data.access_token);
    saveProfile(profile);
    clearBindToken();
  }
  return profile;
}

export async function wxLogin(): Promise<UserProfile> {
  const loginRes = await new Promise<UniApp.LoginRes>((resolve, reject) => {
    uni.login({ provider: "weixin", success: resolve, fail: reject });
  });

  if (!loginRes.code) {
    throw new Error("微信授权失败");
  }

  const data = await request<WechatLoginResponse>({
    url: "/auth/wechat/login",
    method: "POST",
    data: { code: loginRes.code, scene: "mini_program" },
    auth: false,
  });

  if (data.need_bind || data.bind_token) {
    if (data.bind_token) setBindToken(data.bind_token);
    throw new AuthNeedBindError(data.bind_token ?? "");
  }

  if (data.access_token && data.web_linked !== false && !isPlaceholderProfile(data)) {
    return applyLoginResponse(data);
  }

  if (data.access_token) {
    clearToken();
  }
  if (data.bind_token) {
    setBindToken(data.bind_token);
    throw new AuthNeedBindError(data.bind_token);
  }

  throw new Error("登录失败，请稍后重试");
}

export async function ensureToken(): Promise<string | null> {
  if (getAuthPhase() !== "logged_in") return null;
  return getToken() || null;
}

/** 以服务端微信登录结果为准刷新本地态（Web 解绑后应回到未登录） */
export async function refreshAuthFromServer(): Promise<AuthPhase> {
  const local = getAuthPhase();
  if (local !== "logged_in") return local;

  try {
    await wxLogin();
    return "logged_in";
  } catch (err) {
    if (err instanceof AuthNeedBindError) {
      logout();
      return "guest";
    }
    return local;
  }
}

export interface WechatBindPayload {
  bind_token: string;
  link_code?: string;
  username?: string;
  password?: string;
}

interface WechatBindResponse {
  access_token: string;
  web_linked?: boolean;
  username?: string;
  email?: string;
}

/** 将微信身份关联到 Web 账号（关联码或用户名密码） */
export async function bindWechatAccount(payload: WechatBindPayload): Promise<UserProfile> {
  const data = await request<WechatBindResponse>({
    url: "/auth/wechat/bind",
    method: "POST",
    data: {
      ...payload,
      password: payload.password ? encryptPassword(payload.password) : undefined,
    },
    auth: false,
  });

  if (!data.access_token) {
    throw new Error("绑定失败");
  }

  return applyLoginResponse({ ...data, web_linked: true });
}
