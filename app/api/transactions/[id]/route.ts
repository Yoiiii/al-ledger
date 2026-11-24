import { NextRequest, NextResponse } from "next/server";
import {
  updateTransaction,
  deleteTransaction,
  getTransaction,
  MAX_AMOUNT,
  type TransactionInput,
} from "@/lib/transactions";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!UUID.test(id))
      return NextResponse.json({ error: "ID 格式不合法" }, { status: 400 });

    const body = await req.json().catch(() => {
      throw new SyntaxError("invalid json");
    });
    const patch: Partial<TransactionInput> = {};

    if (body.amount !== undefined) {
      if (
        typeof body.amount !== "number" ||
        body.amount <= 0 ||
        body.amount >= MAX_AMOUNT
      )
        return NextResponse.json({ error: "金额不合法" }, { status: 400 });
      patch.amount = body.amount;
    }
    if (body.type !== undefined) {
      if (body.type !== "expense" && body.type !== "income")
        return NextResponse.json({ error: "类型不合法" }, { status: 400 });
      patch.type = body.type;
    }
    if (body.category !== undefined) {
      if (typeof body.category !== "string" || !body.category.trim())
        return NextResponse.json({ error: "分类不合法" }, { status: 400 });
      patch.category = body.category;
    }
    if (body.payment_method !== undefined) {
      if (
        typeof body.payment_method !== "string" ||
        !body.payment_method.trim()
      )
        return NextResponse.json({ error: "支付方式不合法" }, { status: 400 });
      patch.payment_method = body.payment_method;
    }
    if (body.occurred_date !== undefined) {
      if (typeof body.occurred_date !== "string" || !ISO_DATE.test(body.occurred_date))
        return NextResponse.json(
          { error: "日期格式应为 YYYY-MM-DD" },
          { status: 400 },
        );
      patch.occurred_date = body.occurred_date;
    }
    if (body.note !== undefined) {
      if (body.note != null && (typeof body.note !== "string" || body.note.length > 500))
        return NextResponse.json({ error: "备注过长" }, { status: 400 });
      patch.note = body.note;
    }
    if (body.ledger_id !== undefined) {
      if (!UUID.test(body.ledger_id))
        return NextResponse.json({ error: "ledger_id 不是合法 UUID" }, { status: 400 });
      patch.ledger_id = body.ledger_id;
    }

    if (Object.keys(patch).length === 0)
      return NextResponse.json({ error: "没有需要修改的字段" }, { status: 400 });

    // 改前记录一并返回，供前端展示「改前 → 改后」（PRD §3.3）
    const before = await getTransaction(id);
    const txn = await updateTransaction(id, patch);
    return NextResponse.json({ transaction: txn, before });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (e instanceof Error && e.message === "NOT_FOUND")
      return NextResponse.json({ error: "账单不存在或已删除" }, { status: 404 });
    if (e instanceof SyntaxError)
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    return dbError(e) ?? NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!UUID.test(id))
      return NextResponse.json({ error: "ID 格式不合法" }, { status: 400 });
    // 软删除：写 deleted_at，可经 restoreTransaction 恢复
    await deleteTransaction(id);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (e instanceof Error && e.message === "NOT_FOUND")
      return NextResponse.json({ error: "账单不存在或已删除" }, { status: 404 });
    return dbError(e) ?? NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
