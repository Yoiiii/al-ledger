"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, redirectToLogin } from "@/lib/api";
import {
  User as UserIcon,
  Mail,
  Pencil,
  Save,
  LogOut,
  LogIn,
  UserPlus,
  KeyRound,
  ShieldCheck,
  ChevronRight,
  LoaderCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomNav } from "@/components/bottom-nav";

type Profile = {
  email: string;
  nickname: string;
  avatar_url: string | null;
  currency: string;
  timezone: string;
};

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Profile | null>(null);
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // 资料与登录态都由后端 API 给出，网页端不再直接访问 Supabase
    void (async () => {
      try {
        const res = await apiFetch("/api/profile", { skipAuthRedirect: true });
        if (!active) return;
        // 401 才是未登录；503 等服务端故障要展示错误，不能误显示「未登录」
        if (res.status === 401) {
          setUser(null);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          setErr(j?.error ?? "资料加载失败");
          setLoading(false);
          return;
        }
        const j = (await res.json()) as { profile?: Profile };
        if (!j.profile || !active) {
          setLoading(false);
          return;
        }
        setUser(j.profile);
        setNickname(j.profile.nickname);
        setLoading(false);
      } catch {
        if (!active) return;
        setErr("资料加载失败");
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      // 身份由后端会话决定，401 由 apiFetch 统一跳登录页
      const res = await apiFetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      if (res.status === 401) return;
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setErr(j?.error ?? "保存失败");
        return;
      }
      setMsg("已保存");
      setUser((prev) => (prev ? { ...prev, nickname } : prev));
    } catch {
      setErr("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    // 本地登出即可清掉会话 cookie，不需要再请求 Supabase Auth
    await createClient()
      .auth.signOut({ scope: "local" })
      .catch(() => {});
    setUser(null);
    setNickname("");
    // 登出后直接回到登录页，不留「未登录但停在业务页」的中间态
    void redirectToLogin("/");
  };

  const initial = user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="relative min-h-screen bg-[#0B0D17] text-slate-100 antialiased">
      {/* 背景光斑 */}
      <div className="pointer-events-none fixed -right-20 -top-20 z-0 h-72 w-72 rounded-full bg-violet-600/25 blur-[90px]" />
      <div className="pointer-events-none fixed -left-24 bottom-1/4 z-0 h-80 w-80 rounded-full bg-indigo-600/15 blur-[90px]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[480px] flex-col border-x border-white/5 pb-28">
        {/* 顶栏 */}
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-white/5 bg-[#0B0D17]/70 px-4 py-3 backdrop-blur-xl">
          <UserIcon className="h-5 w-5 text-indigo-300" />
          <h1 className="text-[17px] font-bold">我的</h1>
        </header>

        <div className="flex-1 px-3 pt-4">
          {err && !user && !loading && (
            <p className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
              {err}
            </p>
          )}
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <LoaderCircle className="h-6 w-6 animate-spin text-indigo-300" />
            </div>
          ) : !user ? (
            /* 未登录 */
            <div className="glass mt-6 rounded-2xl p-6 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/40">
                <UserIcon className="h-9 w-9 text-white" />
              </div>
              <h2 className="text-[16px] font-bold">未登录</h2>
              <p className="mt-1 text-[12px] text-slate-400">
                登录后即可同步账单、在多设备查看
              </p>
              <div className="mt-5 flex gap-3">
                <Link
                  href="/auth/login?redirectTo=/profile"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 py-3 text-[14px] font-bold text-white shadow-lg shadow-indigo-500/40 transition active:scale-95"
                >
                  <LogIn className="h-4 w-4" /> 登录
                </Link>
                <Link
                  href="/auth/sign-up?redirectTo=/profile"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 py-3 text-[14px] font-semibold text-slate-200 transition active:scale-95"
                >
                  <UserPlus className="h-4 w-4" /> 注册
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* 用户信息头 */}
              <div className="glass flex items-center gap-4 rounded-2xl p-5">
                <div className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[26px] font-extrabold text-white shadow-lg shadow-indigo-500/40">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[18px] font-bold">{nickname}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-400">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    已通过邮箱验证
                  </div>
                </div>
              </div>

              {/* 基础信息设置 */}
              <section className="glass mt-4 rounded-2xl p-4">
                <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
                  <Pencil className="h-4 w-4 text-indigo-300" /> 基础信息设置
                </h2>

                <label className="mb-1.5 block text-[12px] text-slate-400">昵称</label>
                <div className="glass mb-3 flex h-11 items-center gap-2 rounded-xl px-3">
                  <UserIcon className="h-4 w-4 flex-none text-slate-400" />
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="昵称"
                    className="flex-1 bg-transparent text-[14px] text-slate-100 outline-none"
                  />
                </div>

                <label className="mb-1.5 block text-[12px] text-slate-400">邮箱</label>
                <div className="glass mb-3 flex h-11 items-center gap-2 rounded-xl px-3">
                  <Mail className="h-4 w-4 flex-none text-slate-400" />
                  <input
                    value={user.email}
                    readOnly
                    className="flex-1 bg-transparent text-[14px] text-slate-400 outline-none"
                  />
                </div>

                {msg && <p className="mb-2 text-[12px] text-emerald-400">{msg}</p>}
                {err && <p className="mb-2 text-[12px] text-rose-400">{err}</p>}

                <button
                  onClick={save}
                  disabled={saving}
                  className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[14px] font-bold text-white shadow-lg shadow-indigo-500/40 transition hover:opacity-90 active:scale-95 disabled:opacity-60"
                >
                  {saving ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  保存修改
                </button>
              </section>

              {/* 账户安全 */}
              <section className="glass mt-4 rounded-2xl p-2">
                <Link
                  href="/auth/update-password"
                  className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-white/5"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5">
                    <KeyRound className="h-4 w-4 text-slate-300" />
                  </div>
                  <span className="flex-1 text-[14px]">修改密码</span>
                  <ChevronRight className="h-4 w-4 text-slate-600" />
                </Link>
              </section>

              {/* 退出登录 */}
              <button
                onClick={logout}
                className="mt-4 flex h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-rose-400/40 bg-rose-500/10 text-[14px] font-semibold text-rose-300 transition hover:bg-rose-500/20 active:scale-95"
              >
                <LogOut className="h-4 w-4" /> 退出登录
              </button>
            </>
          )}
        </div>

        <BottomNav active="profile" />
      </div>
    </div>
  );
}
