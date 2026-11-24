"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import Link from "next/link";
import { Mail, LoaderCircle, AlertCircle, CheckCircle2, KeyRound } from "lucide-react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });
      if (error) throw error;
      setSuccess(true);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "发送失败");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#0B0D17] text-slate-100 antialiased">
      <div className="pointer-events-none fixed -left-20 -top-20 z-0 h-72 w-72 rounded-full bg-indigo-600/25 blur-[90px]" />
      <div className="pointer-events-none fixed -right-24 top-1/3 z-0 h-80 w-80 rounded-full bg-violet-600/20 blur-[90px]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[480px] flex-col border-x border-white/5 px-5 pb-10">
        <div className="flex flex-col items-center gap-3 pt-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/40">
            <KeyRound className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-[20px] font-bold gtext">找回密码</h1>
            <p className="mt-1 text-[12px] text-slate-400">输入邮箱，我们会发送重置链接</p>
          </div>
        </div>

        {success ? (
          <div className="glass mt-8 rounded-2xl p-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <p className="mt-3 text-[14px] font-semibold">邮件已发送</p>
            <p className="mt-1 text-[12px] text-slate-400">
              请查收 <span className="text-slate-200">{email}</span> 的密码重置邮件
            </p>
            <Link
              href="/auth/login"
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 text-[14px] font-semibold text-slate-200 transition active:scale-95"
            >
              返回登录
            </Link>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="glass mt-8 rounded-2xl p-5">
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
                  <Mail className="h-4 w-4" />
                )}
                发送重置邮件
              </button>

              <Link
                href="/auth/login"
                className="block text-center text-[13px] text-slate-400 hover:underline"
              >
                返回登录
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
