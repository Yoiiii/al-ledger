import { Suspense } from "react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;
  const msg =
    params?.error === "session_expired"
      ? "登录已过期，请重新登录。"
      : params?.error
        ? `出错了：${params.error}`
        : "发生未知错误，请重试。";
  return <p className="text-sm text-slate-400">{msg}</p>;
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  return (
    <div className="relative min-h-screen bg-[#0B0D17] text-slate-100 antialiased">
      <div className="pointer-events-none fixed -right-20 -top-20 z-0 h-72 w-72 rounded-full bg-rose-600/20 blur-[90px]" />
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="glass w-full max-w-sm rounded-2xl p-6">
          <h1 className="text-2xl font-bold">出错了</h1>
          <div className="mt-4">
            <Suspense>
              <ErrorContent searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
