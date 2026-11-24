"use client";

import { createClient } from "@/lib/supabase/client";

/** 后台自动请求（如全局账本初始化）401 时只返回响应，不驱动整页跳转 */
export type ApiFetchInit = RequestInit & { skipAuthRedirect?: boolean };

/** 登录页据此判断「是被 401 送来的」，此时不再自动回跳首页 */
export const LOGIN_FROM_401_KEY = "ai-ledger.login-from-401";

let redirecting = false;
const JUMP_KEY = "ai-ledger.last-login-redirect";

/** 登录成功后解除防重入，避免紧接着的主动登出被 5 秒窗口拦住 */
export function clearLoginRedirectGuard(): void {
  try {
    window.sessionStorage.removeItem(JUMP_KEY);
  } catch {
    /* ignore */
  }
  redirecting = false;
}

/** 统一跳转入口：已在鉴权页 / 短时间内已触发过，都不再导航 */
export async function redirectToLogin(from?: string): Promise<void> {
  if (typeof window === "undefined") return;
  const path = from ?? window.location.pathname + window.location.search;
  if (redirecting || path.startsWith("/auth")) return;

  // 5 秒窗口兜底；同时标记来源，登录页据此停止自动回跳
  try {
    const last = Number(window.sessionStorage.getItem(JUMP_KEY) ?? 0);
    if (Date.now() - last < 5000) return;
    window.sessionStorage.setItem(JUMP_KEY, String(Date.now()));
    window.sessionStorage.setItem(LOGIN_FROM_401_KEY, "1");
  } catch {
    /* 隐私模式下 sessionStorage 不可用，仍允许跳转 */
  }
  redirecting = true;

  // 只接受站内业务页；/auth 与 /api 都不能作为回跳目标
  const safe =
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/auth") &&
    !path.startsWith("/api")
      ? path
      : "/";

  // 只清本地会话（不打 /logout），让浏览器与 proxy 对「未登录」达成一致
  try {
    await createClient().auth.signOut({ scope: "local" });
  } catch {
    /* 清理失败也继续跳登录页 */
  }
  window.location.replace(`/auth/login?redirectTo=${encodeURIComponent(safe)}`);
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: ApiFetchInit,
): Promise<Response> {
  const { skipAuthRedirect, ...fetchInit } = init ?? {};
  // cookie 会自动随同源请求发送，无需手动附加 Authorization
  const res = await fetch(input, fetchInit);
  if (res.status === 401 && !skipAuthRedirect) await redirectToLogin();
  return res;
}
