"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  LOGIN_FROM_401_KEY,
  clearLoginRedirectGuard,
} from "@/lib/api";
import {
  Mail,
  Lock,
  LogIn,
  LoaderCircle,
  AlertCircle,
  Receipt,
} from "lucide-react";

/** 只允许跳回站内业务页，禁止把鉴权页 / API 地址当回跳目标 */
function getSafeRedirect(): string {
  if (typeof window === "undefined") return "/";
  const raw = new URLSearchParams(window.location.search).get("redirectTo") || "/";
  if (
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.startsWith("/auth") ||
    raw.startsWith("/api")
  )
    return "/";
  return raw;
}

const AUTO_JUMP_KEY = "ai-ledger.login.autojump";

/**
 * 已登录误入登录页时回首页。
 * 若本次是被 /api/* 的 401 送来的，说明服务端不认当前会话，必须留在登录页，
 * 否则又会触发首页的 401，形成无限刷新。
 */
function autoJumpHome(): void {
  try {
    if (window.sessionStorage.getItem(LOGIN_FROM_401_KEY) === "1") return;
    const last = Number(window.sessionStorage.getItem(AUTO_JUMP_KEY) ?? 0);
    if (Date.now() - last < 10_000) return;
    window.sessionStorage.setItem(AUTO_JUMP_KEY, String(Date.now()));
  } catch {
    /* 隐私模式下 sessionStorage 不可用，仍允许跳转 */
  }
  window.location.replace("/");
}

/** 整页导航：带上刚写入的会话 cookie，绕开客户端路由的 RSC 重定向缓存 */
function goTo(path: string): void {
  try {
    window.sessionStorage.removeItem(AUTO_JUMP_KEY);
    window.sessionStorage.removeItem(LOGIN_FROM_401_KEY);
  } catch {
    /* ignore */
  }
  clearLoginRedirectGuard();
  window.location.replace(path);
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);

  // 已登录进入登录页：自动回首页（被 401 送来的除外）。
  // 整页导航 + 一次性标记，避免「登录页 ↔ 首页」无限循环。
  useEffect(() => {
    // 「由 401 送来」标记必须保留到登录成功（goTo 里清除），否则从首页
    // 被 307 回登录页时会丢失标记、再次自动跳首页，循环又重新开始。
    let from401 = false;
    try {
      from401 = window.sessionStorage.getItem(LOGIN_FROM_401_KEY) === "1";
    } catch {
      /* ignore */
    }

    // 会话在 cookie：由后端只读探测，避免前端直接请求 Supabase Auth
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const d = (await res.json()) as { signedIn: boolean; email: string | null };
        if (!active) return;
        if (!d.signedIn) {
          try {
            window.sessionStorage.removeItem(AUTO_JUMP_KEY);
          } catch {
            /* ignore */
          }
          return;
        }
        setExistingEmail(d.email);
        if (!from401) autoJumpHome();
      } catch {
        /* 探测失败时留在登录页 */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // 登录成功后回跳原页面（默认首页），整页导航确保 cookie 立即生效
      goTo(getSafeRedirect());
    } catch (error: unknown) {
      setError(translateAuthError(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#0B0D17] text-slate-100 antialiased">
      <div className="pointer-events-none fixed -left-20 -top-20 z-0 h-72 w-72 rounded-full bg-indigo-600/25 blur-[90px]" />
      <div className="pointer-events-none fixed -right-24 top-1/3 z-0 h-80 w-80 rounded-full bg-violet-600/20 blur-[90px]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[480px] flex-col border-x border-white/5 px-5 pb-10">
        {/* 品牌 */}
        <div className="flex flex-col items-center gap-3 pt-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/40">
            <Receipt className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-[20px] font-bold gtext">小账房</h1>
            <p className="mt-1 text-[12px] text-slate-400">欢迎回来，继续记账</p>
          </div>
        </div>

        {existingEmail && (
          <div className="glass mt-8 rounded-2xl p-4 text-center">
            <p className="text-[12px] text-slate-300">检测到已登录账号：{existingEmail}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              若会话已失效，请直接在下方重新登录。
            </p>
            <button
              type="button"
              onClick={() => goTo(getSafeRedirect())}
              className="mt-3 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[12px] font-semibold text-slate-200 transition hover:bg-white/10 active:scale-95"
            >
              返回应用
            </button>
          </div>
        )}

        {/* 表单 */}
        <form onSubmit={handleLogin} className="glass mt-8 rounded-2xl p-5">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] text-slate-400">邮箱</label>
              <div className="glass flex h-11 items-center gap-2 rounded-xl px-3">
                <Mail className="h-4 w-4 flex-none text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 bg-transparent text-[14px] text-slate-100 outline-none placeholder:text-slate-600"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[12px] text-slate-400">密码</label>
                <Link
                  href="/auth/forgot-password"
                  className="text-[11px] text-indigo-300 hover:underline"
                >
                  忘记密码？
                </Link>
              </div>
              <div className="glass flex h-11 items-center gap-2 rounded-xl px-3">
                <Lock className="h-4 w-4 flex-none text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex-1 bg-transparent text-[14px] text-slate-100 outline-none placeholder:text-slate-600"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-1.5 text-[12px] text-rose-400">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[14px] font-bold text-white shadow-lg shadow-indigo-500/40 transition hover:opacity-90 active:scale-95 disabled:opacity-60"
            >
              {isLoading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              登录
            </button>
          </div>
        </form>

        <p className="mt-5 text-center text-[13px] text-slate-400">
          还没有账号？{" "}
          <Link href="/auth/sign-up" className="font-semibold text-indigo-300 hover:underline">
            立即注册
          </Link>
        </p>
      </div>
    </div>
  );
}

// 把 Supabase 返回的英文鉴权错误映射成中文提示
function translateAuthError(error: unknown): string {
  const msg = error instanceof Error ? error.message : "";
  if (/invalid login credentials/i.test(msg)) return "邮箱或密码错误";
  if (/email not confirmed/i.test(msg)) return "邮箱尚未验证，请先查收验证邮件";
  if (/user already registered/i.test(msg)) return "该邮箱已注册，请直接登录";
  if (/forgot password|reset/i.test(msg)) return "请检查邮箱中的密码重置链接";
  return msg || "登录失败";
}
