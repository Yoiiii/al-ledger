import { NextRequest, NextResponse } from "next/server";
import { getStats, getDailyTrend } from "@/lib/transactions";
import { toHttpError } from "@/lib/api-validation";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const period = (sp.get("period") as "today" | "week" | "month" | "custom") ?? "month";
    const startDate = sp.get("startDate") ?? undefined;
    const endDate = sp.get("endDate") ?? undefined;
    const ledgerId = sp.get("ledgerId") ?? undefined;
    if (ledgerId && !UUID.test(ledgerId)) {
      return NextResponse.json({ error: "ledgerId 不是合法 UUID" }, { status: 400 });
    }

    // 聚合在数据库 RPC 内完成，按 Asia/Shanghai 口径，与 /api/chat 注入时间一致
    const [expense, income, trend] = await Promise.all([
      getStats({ period, startDate, endDate, type: "expense", ledgerId }),
      getStats({ period, startDate, endDate, type: "income", ledgerId }),
      getDailyTrend(7, ledgerId),
    ]);
    return NextResponse.json({ expense, income, trend });
  } catch (e) {
    const h = toHttpError(e);
    if (h) return NextResponse.json({ error: h.message }, { status: h.status });
    // 开发环境返回底层错误，方便定位 RPC 未创建 / 权限等问题；生产脱敏
    const detail =
      process.env.NODE_ENV === "development" && e instanceof Error
        ? e.message
        : "查询失败";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
