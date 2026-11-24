import { NextRequest, NextResponse } from "next/server";
import { updateBudget, deleteBudget } from "@/lib/budgets";
import { isIsoDate, isUuid, toHttpError } from "@/lib/api-validation";

type Ctx = { params: Promise<{ id: string }> };

function fail(e: unknown, fallback: string) {
  const h = toHttpError(e);
  return NextResponse.json(
    { error: h?.message ?? fallback },
    { status: h?.status ?? 500 },
  );
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: "ID 格式不合法" }, { status: 400 });
    const body = await req.json();
    if (body.amount !== undefined && (typeof body.amount !== "number" || body.amount <= 0))
      return NextResponse.json({ error: "预算金额需为正数" }, { status: 400 });
    if (body.start_date !== undefined && !isIsoDate(body.start_date))
      return NextResponse.json({ error: "start_date 格式应为 YYYY-MM-DD" }, { status: 400 });
    if (body.end_date != null && !isIsoDate(body.end_date))
      return NextResponse.json({ error: "end_date 格式应为 YYYY-MM-DD" }, { status: 400 });
    if (
      body.alert_threshold !== undefined &&
      (typeof body.alert_threshold !== "number" ||
        body.alert_threshold < 0 ||
        body.alert_threshold > 1)
    )
      return NextResponse.json({ error: "提醒阈值需在 0-1 之间" }, { status: 400 });

    const budget = await updateBudget(id, {
      ...(body.amount !== undefined ? { amount: body.amount } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.start_date !== undefined ? { start_date: body.start_date } : {}),
      ...(body.end_date !== undefined ? { end_date: body.end_date } : {}),
      ...(body.period !== undefined ? { period: body.period } : {}),
      ...(body.alert_threshold !== undefined
        ? { alert_threshold: body.alert_threshold }
        : {}),
      ...(body.is_active !== undefined ? { is_active: !!body.is_active } : {}),
    });
    return NextResponse.json({ budget });
  } catch (e) {
    if (e instanceof SyntaxError)
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    return fail(e, "更新失败");
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: "ID 格式不合法" }, { status: 400 });
    await deleteBudget(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "删除失败");
  }
}
