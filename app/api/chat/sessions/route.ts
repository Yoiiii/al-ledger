import { NextRequest, NextResponse } from "next/server";
import { listSessions, createSession } from "@/lib/chat-sessions";
import { isUuid, toHttpError } from "@/lib/api-validation";

function fail(e: unknown, fallback: string) {
  const h = toHttpError(e);
  return NextResponse.json(
    { error: h?.message ?? fallback },
    { status: h?.status ?? 500 },
  );
}

export async function GET() {
  try {
    return NextResponse.json({ sessions: await listSessions() });
  } catch (e) {
    return fail(e, "查询失败");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ledgerId = typeof body.ledger_id === "string" ? body.ledger_id : undefined;
    if (ledgerId && !isUuid(ledgerId))
      return NextResponse.json({ error: "ledger_id 不是合法 UUID" }, { status: 400 });
    return NextResponse.json(
      { session: await createSession(ledgerId ?? null) },
      { status: 201 },
    );
  } catch (e) {
    return fail(e, "创建失败");
  }
}
