"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock, LoaderCircle, AlertCircle, CheckCircle2, KeyRound } from "lucide-react";

export function UpdatePasswordForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    if (password.length < 6) {
      setError("密码至少需要 6 位");
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => router.push("/profile"), 1200);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "修改失败");
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
            <h1 className="text-[20px] font-bold gtext">设置新密码</h1>
            <p className="mt-1 text-[12px] text-slate-400">请输入你的新密码</p>
          </div>
        </div>

        {success ? (
          <div className="glass mt-8 rounded-2xl p-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <p className="mt-3 text-[14px] font-semibold">密码已更新</p>
            <p className="mt-1 text-[12px] text-slate-400">正在跳转到「我的」…</p>
          </div>
        ) : (
          <form onSubmit={handleUpdate} className="glass mt-8 rounded-2xl p-5">
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[12px] text-slate-400">新密码</label>
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
                  <Lock className="h-4 w-4" />
                )}
                保存新密码
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
