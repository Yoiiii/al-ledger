import { NextRequest, NextResponse } from "next/server";
import { updateLedger } from "@/lib/ledgers";
import { isUuid, toHttpError } from "@/lib/api-validation";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: "ID 格式不合法" }, { status: 400 });
    const body = await req.json();
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 40)
        return NextResponse.json({ error: "账本名称需为 1-40 字" }, { status: 400 });
    }
    if (body.currency !== undefined && !/^[A-Z]{3}$/.test(body.currency))
      return NextResponse.json({ error: "币种需为 3 位大写字母" }, { status: 400 });

    const ledger = await updateLedger(id, {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
      ...(body.archived !== undefined ? { archived: !!body.archived } : {}),
    });
    return NextResponse.json({ ledger });
  } catch (e) {
    if (e instanceof SyntaxError)
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    const h = toHttpError(e);
    return NextResponse.json(
      { error: h?.message ?? "更新失败" },
      { status: h?.status ?? 500 },
    );
  }
}
