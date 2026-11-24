import { NextRequest, NextResponse } from "next/server";
import { listLedgers, createLedger } from "@/lib/ledgers";
import { toHttpError } from "@/lib/api-validation";

export async function GET() {
  try {
    return NextResponse.json({ ledgers: await listLedgers() });
  } catch (e) {
    const h = toHttpError(e);
    return NextResponse.json(
      { error: h?.message ?? "查询失败" },
      { status: h?.status ?? 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 40)
      return NextResponse.json({ error: "账本名称需为 1-40 字" }, { status: 400 });
    if (body.currency !== undefined && !/^[A-Z]{3}$/.test(body.currency))
      return NextResponse.json({ error: "币种需为 3 位大写字母" }, { status: 400 });

    const ledger = await createLedger({
      name: body.name.trim(),
      currency: body.currency,
      is_personal: body.is_personal === true,
    });
    return NextResponse.json({ ledger }, { status: 201 });
  } catch (e) {
    if (e instanceof SyntaxError)
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    const h = toHttpError(e);
    return NextResponse.json(
      { error: h?.message ?? "创建失败" },
      { status: h?.status ?? 500 },
    );
  }
}
