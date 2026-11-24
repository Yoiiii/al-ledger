export type CookieSession = {
  userId: string;
  email: string | null;
  accessToken: string;
  expiresAt: number | null;
};

type CookieLike = { name: string; value: string };
type CookieStoreLike = { getAll(): CookieLike[] };

function decodeCookieValue(raw: string): string {
  if (!raw.startsWith("base64-")) return raw;
  const base64 = raw.slice(7).replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

/**
 * 只读 cookie 里的会话，不调用 getSession()/getUser()。
 * 这两个方法在 access token 过期时会访问 Supabase Auth，服务端网络不通时
 * 会重试几十秒并抛 AuthRetryableFetchError，让每个页面/API 请求都变慢。
 * token 是否有效最终由 Supabase Auth / PostgREST + RLS 校验。
 */
export function readCookieSession(cookies: CookieStoreLike): CookieSession | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;

  let ref: string;
  try {
    ref = new URL(url).hostname.split(".")[0];
  } catch {
    return null;
  }

  const prefix = `sb-${ref}-auth-token`;
  const all = cookies.getAll();
  let raw = all.find((c) => c.name === prefix)?.value;

  // @supabase/ssr 会把大 cookie 拆成 .0/.1/...
  if (!raw) {
    const chunks = all
      .filter((c) => c.name.startsWith(`${prefix}.`))
      .sort((a, b) => {
        const ai = Number(a.name.slice(prefix.length + 1));
        const bi = Number(b.name.slice(prefix.length + 1));
        return ai - bi;
      });
    if (chunks.length) raw = chunks.map((c) => c.value).join("");
  }
  if (!raw) return null;

  try {
    const session = JSON.parse(decodeCookieValue(raw)) as {
      access_token?: string;
      expires_at?: number;
      user?: { id?: string; email?: string };
    };
    if (!session.access_token || !session.user?.id) return null;
    return {
      userId: session.user.id,
      email: session.user.email ?? null,
      accessToken: session.access_token,
      expiresAt: typeof session.expires_at === "number" ? session.expires_at : null,
    };
  } catch {
    return null;
  }
}
