import { NextRequest, NextResponse } from "next/server";
import {
  getSessionMessages,
  saveSessionMessages,
  renameSession,
  deleteSession,
} from "@/lib/chat-sessions";
import { isUuid, toHttpError } from "@/lib/api-validation";
import type { UIMessage } from "ai";

type Ctx = { params: Promise<{ id: string }> };

function fail(e: unknown, fallback: string) {
  const h = toHttpError(e);
  return NextResponse.json(
    { error: h?.message ?? fallback },
    { status: h?.status ?? 500 },
  );
}

/** 读取会话历史（useChat 的初始 messages） */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: "ID 格式不合法" }, { status: 400 });
    return NextResponse.json({ messages: await getSessionMessages(id) });
  } catch (e) {
    return fail(e, "查询失败");
  }
}

/** 全量保存会话消息（原子替换） */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: "ID 格式不合法" }, { status: 400 });
    const body = await req.json();
    if (!Array.isArray(body.messages))
      return NextResponse.json({ error: "messages 必须是数组" }, { status: 400 });
    if (body.messages.length > 200)
      return NextResponse.json({ error: "消息数量过多" }, { status: 400 });
    for (const m of body.messages) {
      if (!m || typeof m !== "object" || !Array.isArray(m.parts) || typeof m.role !== "string")
        return NextResponse.json({ error: "消息格式不合法" }, { status: 400 });
    }
    await saveSessionMessages(id, body.messages as UIMessage[]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SyntaxError)
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    return fail(e, "保存失败");
  }
}

/** 重命名 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: "ID 格式不合法" }, { status: 400 });
    const body = await req.json();
    if (typeof body.title !== "string" || body.title.length > 80)
      return NextResponse.json({ error: "标题需为 0-80 字" }, { status: 400 });
    await renameSession(id, body.title);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SyntaxError)
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    return fail(e, "重命名失败");
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: "ID 格式不合法" }, { status: 400 });
    await deleteSession(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "删除失败");
  }
}
