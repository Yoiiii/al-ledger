import { NextRequest, NextResponse } from "next/server";
import { listBudgets, createBudget } from "@/lib/budgets";
import { isIsoDate, isUuid, toHttpError } from "@/lib/api-validation";

function fail(e: unknown, fallback: string) {
  const h = toHttpError(e);
  return NextResponse.json(
    { error: h?.message ?? fallback },
    { status: h?.status ?? 500 },
  );
}

export async function GET(req: NextRequest) {
  try {
    const ledgerId = req.nextUrl.searchParams.get("ledgerId") ?? undefined;
    if (ledgerId && !isUuid(ledgerId))
      return NextResponse.json({ error: "ledgerId 不是合法 UUID" }, { status: 400 });
    const budgets = await listBudgets(ledgerId);
    const alerts = budgets
      .filter((b) => b.level !== "ok")
      .map((b) => ({
        budgetId: b.id,
        level: b.level,
        category: b.category,
        spent: b.usage.spent,
        amount: b.amount,
        ratio: b.usage.ratio,
        title:
          b.level === "exceeded"
            ? `${b.category ?? "总预算"}已超支`
            : `${b.category ?? "总预算"}接近预算上限`,
        body:
          b.level === "exceeded"
            ? `已用 ¥${b.usage.spent.toFixed(2)}，超出预算 ¥${Math.abs(b.usage.remaining).toFixed(2)}`
            : `已用 ¥${b.usage.spent.toFixed(2)}，占预算 ${Math.round(b.usage.ratio * 100)}%`,
      }));
    return NextResponse.json({ budgets, alerts });
  } catch (e) {
    return fail(e, "查询失败");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.amount !== "number" || body.amount <= 0)
      return NextResponse.json({ error: "预算金额需为正数" }, { status: 400 });
    if (!isIsoDate(body.start_date))
      return NextResponse.json({ error: "start_date 格式应为 YYYY-MM-DD" }, { status: 400 });
    if (body.end_date != null && !isIsoDate(body.end_date))
      return NextResponse.json({ error: "end_date 格式应为 YYYY-MM-DD" }, { status: 400 });
    if (body.ledger_id != null && !isUuid(body.ledger_id))
      return NextResponse.json({ error: "ledger_id 不是合法 UUID" }, { status: 400 });
    if (body.kind != null && body.kind !== "expense" && body.kind !== "income")
      return NextResponse.json({ error: "类型不合法" }, { status: 400 });
    if (
      body.period != null &&
      !["week", "month", "year", "custom"].includes(body.period)
    )
      return NextResponse.json({ error: "周期不合法" }, { status: 400 });
    if (
      body.alert_threshold != null &&
      (typeof body.alert_threshold !== "number" ||
        body.alert_threshold < 0 ||
        body.alert_threshold > 1)
    )
      return NextResponse.json({ error: "提醒阈值需在 0-1 之间" }, { status: 400 });
    if (
      body.category != null &&
      (typeof body.category !== "string" || body.category.length > 24)
    )
      return NextResponse.json({ error: "分类不合法" }, { status: 400 });

    const budget = await createBudget({
      ledger_id: body.ledger_id ?? null,
      kind: body.kind ?? "expense",
      category: body.category ?? null,
      period: body.period ?? "month",
      start_date: body.start_date,
      end_date: body.end_date ?? null,
      amount: body.amount,
      alert_threshold: body.alert_threshold ?? 0.8,
    });
    return NextResponse.json({ budget }, { status: 201 });
  } catch (e) {
    if (e instanceof SyntaxError)
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    return fail(e, "创建失败");
  }
}
