import { NextRequest, NextResponse } from "next/server";
import {
  createTransaction,
  listTransactions,
  MAX_AMOUNT,
  type TxnSource,
} from "@/lib/transactions";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCES = new Set<TxnSource>([
  "ai",
  "voice",
  "manual",
  "ocr",
  "recurring",
  "import",
]);

/** 把数据库约束错误映射成可读的 400，而不是笼统 500 */
function dbError(e: unknown): NextResponse | null {
  const code = (e as { code?: string })?.code;
  if (code === "23503")
    return NextResponse.json(
      { error: "分类或支付方式不存在，请先在字典中创建" },
      { status: 400 },
    );
  if (code === "23514")
    return NextResponse.json({ error: "数据不符合约束" }, { status: 400 });
  if (code === "22P02")
    return NextResponse.json({ error: "ID 格式不合法" }, { status: 400 });
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const rawLimit = sp.get("limit");
    let limit: number | undefined;
    if (rawLimit) {
      const n = Number(rawLimit);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ error: "limit 必须为正数" }, { status: 400 });
      }
      limit = Math.min(Math.floor(n), 200);
    }
    const ledgerId = sp.get("ledgerId") ?? undefined;
    if (ledgerId && !UUID.test(ledgerId)) {
      return NextResponse.json({ error: "ledgerId 不是合法 UUID" }, { status: 400 });
    }
    const list = await listTransactions({
      limit,
      startDate: sp.get("startDate") ?? undefined,
      endDate: sp.get("endDate") ?? undefined,
      category: sp.get("category") ?? undefined,
      type: (sp.get("type") as "expense" | "income") ?? undefined,
      orderBy:
        (sp.get("orderBy") as "date_desc" | "date_asc") ?? "date_desc",
      ledgerId,
    });
    return NextResponse.json({ transactions: list });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    return dbError(e) ?? NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (
      typeof body.amount !== "number" ||
      body.amount <= 0 ||
      body.amount >= MAX_AMOUNT
    )
      return NextResponse.json({ error: "金额不合法" }, { status: 400 });
    if (typeof body.category !== "string" || !body.category.trim())
      return NextResponse.json({ error: "分类不合法" }, { status: 400 });
    if (
      body.payment_method !== undefined &&
      (typeof body.payment_method !== "string" || !body.payment_method.trim())
    )
      return NextResponse.json({ error: "支付方式不合法" }, { status: 400 });
    if (
      body.type !== undefined &&
      body.type !== "expense" &&
      body.type !== "income"
    )
      return NextResponse.json({ error: "类型不合法" }, { status: 400 });
    if (typeof body.occurred_date !== "string" || !ISO_DATE.test(body.occurred_date))
      return NextResponse.json({ error: "日期格式应为 YYYY-MM-DD" }, { status: 400 });
    if (body.note != null && (typeof body.note !== "string" || body.note.length > 500))
      return NextResponse.json({ error: "备注过长" }, { status: 400 });
    if (body.ledger_id && !UUID.test(body.ledger_id))
      return NextResponse.json({ error: "ledger_id 不是合法 UUID" }, { status: 400 });
    if (body.client_request_id && !UUID.test(body.client_request_id))
      return NextResponse.json(
        { error: "client_request_id 不是合法 UUID" },
        { status: 400 },
      );
    if (body.source && !SOURCES.has(body.source))
      return NextResponse.json({ error: "来源不合法" }, { status: 400 });

    const txn = await createTransaction({
      amount: body.amount,
      type: body.type === "income" ? "income" : "expense",
      category: body.category,
      payment_method: body.payment_method ?? "其他",
      occurred_date: body.occurred_date,
      note: body.note ?? null,
      source: body.source ?? "manual",
      raw_text: typeof body.raw_text === "string" ? body.raw_text : null,
      ...(body.ledger_id ? { ledger_id: body.ledger_id } : {}),
      ...(body.client_request_id
        ? { client_request_id: body.client_request_id }
        : {}),
    });
    return NextResponse.json({ transaction: txn }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (e instanceof SyntaxError)
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    return dbError(e) ?? NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
