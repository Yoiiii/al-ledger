import { NextRequest, NextResponse } from "next/server";
import { listMembers, inviteMember, removeMember } from "@/lib/ledgers";
import { isUuid, toHttpError } from "@/lib/api-validation";

type Ctx = { params: Promise<{ id: string }> };

function fail(e: unknown, fallback: string) {
  const h = toHttpError(e);
  return NextResponse.json(
    { error: h?.message ?? fallback },
    { status: h?.status ?? 500 },
  );
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: "ID 格式不合法" }, { status: 400 });
    return NextResponse.json({ members: await listMembers(id) });
  } catch (e) {
    return fail(e, "查询失败");
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: "ID 格式不合法" }, { status: 400 });
    const body = await req.json();
    if (typeof body.email !== "string" || !/^\S+@\S+\.\S+$/.test(body.email))
      return NextResponse.json({ error: "邮箱格式不合法" }, { status: 400 });
    const role = body.role === "viewer" ? "viewer" : "editor";
    await inviteMember(id, body.email.trim(), role);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SyntaxError)
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    return fail(e, "邀请失败");
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: "ID 格式不合法" }, { status: 400 });
    const userId = new URL(req.url).searchParams.get("userId");
    if (!isUuid(userId))
      return NextResponse.json({ error: "userId 不是合法 UUID" }, { status: 400 });
    await removeMember(id, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "移除失败");
  }
}
