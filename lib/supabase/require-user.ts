import {
  createAuthClient,
  createAuthClientSync,
  getUserWithTimeout,
} from "@/lib/supabase/server";
import { readCookieSession } from "./cookie-session";

/**
 * 从 cookie 会话取当前用户，构造服务端 Supabase 客户端。
 *
 * 标准路径：用 SSR 客户端调用 getUser()——access token 过期时 SDK 会用
 * refresh token 续期并写回新 cookie，解决「过一段时间 API 变 401」的问题。
 * 兜底：网络异常/超时（服务端连不上 Supabase Auth）时，回退到本地 cookie
 * 判定，数据权限仍由 PostgREST + RLS 用 token 校验，不会误判成未登录。
 */
export async function requireUserId() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const session = readCookieSession(cookieStore);

  // proxy 中间件已在每次请求前刷新过会话：token 未过期时直接用，避免每个
  // 数据函数重复请求 Supabase Auth（/api/stats 一次会调多个数据函数）。
  if (session && (!session.expiresAt || session.expiresAt * 1000 > Date.now())) {
    return {
      supabase: createAuthClientSync(cookieStore),
      userId: session.userId,
      email: session.email,
    };
  }

  // token 已过期：走 SSR getUser 触发刷新并写回新 cookie
  const supabase = await createAuthClient();
  const { data, error } = (await getUserWithTimeout(supabase)) ?? { data: null, error: null };
  const user = !error ? data?.user : null;
  if (user) return { supabase, userId: user.id, email: user.email ?? null };

  // getUser 失败/超时：回退本地 cookie 判定，不无差别 401
  if (!session) throw new Error("UNAUTHENTICATED");
  return { supabase, userId: session.userId, email: session.email };
}

/** 把数据层异常映射成 HTTP 状态码与提示 */
export function errorStatus(e: unknown): { status: number; message: string } | null {
  if (!(e instanceof Error)) return null;
  if (e.message === "UNAUTHENTICATED") return { status: 401, message: "未登录" };
  if (e.message === "NOT_FOUND") return { status: 404, message: "记录不存在" };
  if (e.message === "FORBIDDEN") return { status: 403, message: "无权操作" };
  const code = (e as { code?: string }).code;
  if (code === "23503") return { status: 400, message: "关联数据不存在" };
  if (code === "23505") return { status: 409, message: "记录已存在" };
  if (code === "23514") return { status: 400, message: "数据不符合约束" };
  if (code === "22P02") return { status: 400, message: "ID 格式不合法" };
  return null;
}
