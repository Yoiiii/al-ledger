import Link from "next/link";
import { CheckCircle2, Mail, LogIn } from "lucide-react";

export default function Page() {
  return (
    <div className="relative min-h-screen bg-[#0B0D17] text-slate-100 antialiased">
      <div className="pointer-events-none fixed -left-20 -top-20 z-0 h-72 w-72 rounded-full bg-indigo-600/25 blur-[90px]" />
      <div className="pointer-events-none fixed -right-24 top-1/3 z-0 h-80 w-80 rounded-full bg-violet-600/20 blur-[90px]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[480px] flex-col items-center justify-center border-x border-white/5 px-5 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30">
          <CheckCircle2 className="h-8 w-8 text-white" />
        </div>
        <h1 className="mt-5 text-[20px] font-bold gtext">注册成功</h1>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-slate-400">
          <Mail className="h-4 w-4" /> 请查收邮件完成验证
        </p>

        <div className="glass mt-7 w-full rounded-2xl p-5">
          <p className="text-[13px] leading-relaxed text-slate-300">
            我们已向你的邮箱发送了一封验证邮件，点击其中的链接即可激活账号并自动登录。
          </p>
        </div>

        <Link
          href="/auth/login"
          className="mt-6 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[14px] font-bold text-white shadow-lg shadow-indigo-500/40 transition active:scale-95"
        >
          <LogIn className="h-4 w-4" /> 前往登录
        </Link>
      </div>
    </div>
  );
}
