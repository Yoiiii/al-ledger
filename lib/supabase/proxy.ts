import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasEnvVars } from "../utils";
import { readCookieSession } from "./cookie-session";

/**
 * 全站登录态守卫 + Supabase 会话刷新（Next `proxy.ts` 调用）：
 * - 每次页面请求调用 auth.getUser()，access token 过期时 SDK 自动用 refresh
 *   token 续期，并把新 cookie 写回响应（标准 SSR 做法）。
 * - 页面导航：未登录一律 307 到 /auth/login（含首页）
 * - /api/* 的 fetch：不做 302，由路由返回 401，客户端 apiFetch 统一跳登录
 * - /auth/*：始终放行；不做「已登录访问登录页 302 回首页」，避免 401 循环
 * - getUser() 加超时：服务端网络不通时不拖慢请求，回退本地 cookie 判定
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!hasEnvVars) return response;

  // 用请求 cookie 建客户端，刷新出的新 cookie 写回响应
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 触发刷新：过期 token 会在此续期并写回新 cookie
  let user: { id: string } | null = null;
  try {
    const getUser = supabase.auth.getUser();
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 8000));
    const result = await Promise.race([getUser, timeout]);
    user = result?.data?.user ? { id: result.data.user.id } : null;
  } catch {
    /* 网络异常时回退本地 cookie 判定 */
  }
  const signedIn = Boolean(user) || Boolean(readCookieSession(request.cookies));

  const pathname = request.nextUrl.pathname;
  const isAuthPath = pathname === "/auth" || pathname.startsWith("/auth/");
  const isApi = pathname.startsWith("/api");
  const wantsHtml = request.headers.get("accept")?.includes("text/html") ?? false;

  if (!signedIn && !isAuthPath && (!isApi || wantsHtml)) {
    const from = pathname + request.nextUrl.search;
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = "";
    url.searchParams.set(
      "redirectTo",
      from.startsWith("/auth") || from.startsWith("/api") ? "/" : from,
    );
    const redirect = NextResponse.redirect(url);
    // 把可能刷新出的 cookie 也带到重定向响应
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c.name, c.value, c));
    return redirect;
  }

  return response;
}
