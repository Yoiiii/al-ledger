import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/require-user";
import { toHttpError } from "@/lib/api-validation";

const PROFILE_FIELDS = "email, nickname, avatar_url, currency, timezone";

type Profile = {
  email: string;
  nickname: string;
  avatar_url: string | null;
  currency: string;
  timezone: string;
};

/** 资料读取：网页端只访问 /api/profile，由 Next 后端访问 Supabase */
export async function GET() {
  try {
    const { supabase, userId, email: sessionEmail } = await requireUserId();
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_FIELDS)
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;

    const row = (data ?? null) as Profile | null;
    const email = row?.email ?? sessionEmail ?? "";

    const profile: Profile = {
      email,
      nickname: row?.nickname || email.split("@")[0] || "用户",
      avatar_url: row?.avatar_url ?? null,
      currency: row?.currency ?? "CNY",
      timezone: row?.timezone ?? "Asia/Shanghai",
    };
    return NextResponse.json({ profile });
  } catch (e) {
    const h = toHttpError(e);
    return NextResponse.json(
      { error: h?.message ?? "查询失败" },
      { status: h?.status ?? 500 },
    );
  }
}

/** 资料更新：只接受昵称，用户身份一律取服务端会话，不接受客户端传入 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (
      typeof body.nickname !== "string" ||
      !body.nickname.trim() ||
      body.nickname.length > 32
    )
      return NextResponse.json({ error: "昵称需为 1-32 字" }, { status: 400 });

    const { supabase, userId } = await requireUserId();
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, nickname: body.nickname.trim() }, { onConflict: "id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SyntaxError)
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    const h = toHttpError(e);
    return NextResponse.json(
      { error: h?.message ?? "保存失败" },
      { status: h?.status ?? 500 },
    );
  }
}
