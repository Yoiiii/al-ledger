import { createAuthClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next") ?? "/";

  // 仅允许站内相对路径，避免开放重定向
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (token_hash && type) {
    const supabase = await createAuthClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect(next);
    redirect(`/auth/error?error=${error.message}`);
  }

  redirect(`/auth/error?error=No token hash or type`);
}
