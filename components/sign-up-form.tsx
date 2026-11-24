"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  Mail,
  Lock,
  UserPlus,
  LoaderCircle,
  AlertCircle,
  Receipt,
  ShieldCheck,
} from "lucide-react";

export function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    if (password.length < 6) {
      setError("密码至少需要 6 位");
      setIsLoading(false);
      return;
    }
    if (password !== repeatPassword) {
      setError("两次输入的密码不一致");
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/profile`,
        },
      });
      if (error) throw error;
      router.push("/auth/sign-up-success");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "注册失败");
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
            <h1 className="text-[20px] font-bold gtext">创建账号</h1>
            <p className="mt-1 text-[12px] text-slate-400">用邮箱注册，开启智能记账</p>
          </div>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSignUp} className="glass mt-8 rounded-2xl p-5">
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
              <label className="mb-1.5 block text-[12px] text-slate-400">密码</label>
              <div className="glass flex h-11 items-center gap-2 rounded-xl px-3">
                <Lock className="h-4 w-4 flex-none text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                  className="flex-1 bg-transparent text-[14px] text-slate-100 outline-none placeholder:text-slate-600"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] text-slate-400">确认密码</label>
              <div className="glass flex h-11 items-center gap-2 rounded-xl px-3">
                <Lock className="h-4 w-4 flex-none text-slate-400" />
                <input
                  type="password"
                  required
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                  placeholder="再次输入密码"
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
                <UserPlus className="h-4 w-4" />
              )}
              注册
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              邮箱注册，数据加密存储
            </div>
          </div>
        </form>

        <p className="mt-5 text-center text-[13px] text-slate-400">
          已有账号？{" "}
          <Link href="/auth/login" className="font-semibold text-indigo-300 hover:underline">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
