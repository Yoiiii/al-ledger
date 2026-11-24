import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readCookieSession } from "@/lib/supabase/cookie-session";

/** 登录态探测：只读 cookie 里的本地会话，不访问 Supabase Auth */
export async function GET() {
  const session = readCookieSession(await cookies());
  return NextResponse.json(
    { signedIn: Boolean(session), email: session?.email ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
