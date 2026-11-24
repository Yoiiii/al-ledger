import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * 标准的 Supabase SSR 服务端客户端：能读写会话 cookie。
 *
 * 关键：调用 auth.getUser() 时，SDK 会在 access token 过期后用 refresh token
 * 自动续期，并通过 setAll 把新 cookie 写回浏览器。这是会话能长期保持的原因。
 *
 * 提供两种 cookie 源：
 * - 请求对象（proxy 中间件用）：刷新后的 cookie 写进响应
 * - next/headers cookies()（Route Handler / Server Component 用）
 */
export function createSSRClient(options: {
  getAll: () => { name: string; value: string }[];
  setAll: (cookiesToSet: CookieToSet[]) => void;
}) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return options.getAll();
        },
        setAll(cookiesToSet) {
          options.setAll(cookiesToSet);
        },
      },
    },
  );
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/** Route Handler / Server Component 用的 SSR 客户端（cookie 写入 next/headers） */
export async function createAuthClient() {
  return createAuthClientSync(await cookies());
}

/** 用已取得的 cookieStore 同步构造 SSR 客户端 */
export function createAuthClientSync(cookieStore: CookieStore) {
  return createSSRClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      } catch {
        // Server Component 中不可写 cookie，proxy 会负责同步
      }
    },
  });
}

/** 带超时的用户校验：网络不通时不让请求卡住 */
export async function getUserWithTimeout(
  supabase: ReturnType<typeof createSSRClient>,
  accessToken?: string,
  ms = 8000,
) {
  const getUser = accessToken
    ? supabase.auth.getUser(accessToken)
    : supabase.auth.getUser();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
  return Promise.race([getUser, timeout]);
}
