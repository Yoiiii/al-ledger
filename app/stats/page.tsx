"use client";

import { useEffect, useState } from "react";
import {
  PieChart,
  TrendingDown,
  TrendingUp,
  Hash,
  Utensils,
  CarFront,
  ShoppingBag,
  Home,
  Package,
  Activity,
  ListOrdered,
  ChartPie,
  CalendarDays,
  LoaderCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomNav } from "@/components/bottom-nav";
import { apiFetch } from "@/lib/api";
import { useLedger } from "@/components/ledger-provider";
import { LedgerSwitcher } from "@/components/ledger-switcher";
import { BudgetPanel } from "@/components/budget-panel";
import type { StatsResult } from "@/lib/transactions";

const CAT_COLOR: Record<string, string> = {
  餐饮: "#FB923C",
  交通: "#60A5FA",
  购物: "#A78BFA",
  居住: "#22D3EE",
  娱乐: "#F472B6",
  医疗: "#FB7185",
  教育: "#FBBF24",
  通讯: "#34D399",
  人情: "#FCD34D",
  其他: "#94A3B8",
};

const CAT_ICON: Record<string, typeof Utensils> = {
  餐饮: Utensils,
  交通: CarFront,
  购物: ShoppingBag,
  居住: Home,
  其他: Package,
};

type Period = "week" | "month" | "custom";

export default function StatsPage() {
  const { ledgerId, loading: ledgerLoading } = useLedger();
  const [period, setPeriod] = useState<Period>("month");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [expense, setExpense] = useState<StatsResult | null>(null);
  const [income, setIncome] = useState<StatsResult | null>(null);
  const [trend, setTrend] = useState<{ date: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ledgerLoading) return;
    let active = true;
    setLoading(true);
    const qs = new URLSearchParams({ period });
    if (period === "custom") {
      if (start) qs.set("startDate", start);
      if (end) qs.set("endDate", end);
    }
    if (ledgerId) qs.set("ledgerId", ledgerId);
    apiFetch(`/api/stats?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        setExpense(j.expense);
        setIncome(j.income);
        setTrend(j.trend ?? []);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [period, start, end, ledgerId, ledgerLoading]);

  const expTotal = expense?.total ?? 0;
  const incTotal = income?.total ?? 0;
  const count = (expense?.count ?? 0) + (income?.count ?? 0);

  const ringSegs =
    expense && expTotal > 0
      ? expense.byCategory
          .reduce(
            (acc, c, i) => {
              const startPct = i === 0 ? 0 : acc.end;
              const endPct = startPct + (c.total / expTotal) * 100;
              acc.segs.push(`${CAT_COLOR[c.category] ?? "#94A3B8"} ${startPct}% ${endPct}%`);
              acc.end = endPct;
              return acc;
            },
            { segs: [] as string[], end: 0 },
          )
          .segs.join(", ")
      : "";

  const maxCat = expense?.byCategory[0]?.total ?? 1;
  const maxTrend = Math.max(1, ...trend.map((t) => t.total));
  const weekday = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    const names = ["日", "一", "二", "三", "四", "五", "六"];
    return names[dt.getDay()];
  };

  return (
    <div className="relative min-h-screen bg-[#0B0D17] text-slate-100 antialiased">
      <div className="pointer-events-none fixed -left-20 -top-24 z-0 h-80 w-80 rounded-full bg-indigo-600/25 blur-[90px]" />
      <div className="pointer-events-none fixed -right-20 bottom-0 z-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-[90px]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[480px] flex-col border-x border-white/5 pb-28">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-white/5 bg-[#0B0D17]/70 px-4 py-3 backdrop-blur-xl">
          <PieChart className="h-5 w-5 text-indigo-300" />
          <h1 className="flex-1 text-[17px] font-bold">统计</h1>
          <LedgerSwitcher />
        </header>

        <div className="flex-1 space-y-3.5 px-3 pt-4">
          <div className="glass flex rounded-xl p-1">
            {([["week", "本周"], ["month", "本月"], ["custom", "自定义"]] as [Period, string][]).map(
              ([p, label]) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "flex-1 rounded-lg py-2 text-[13px] transition",
                    period === p
                      ? "bg-gradient-to-r from-indigo-500 to-violet-600 font-bold text-white shadow-lg shadow-indigo-500/30"
                      : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  {label}
                </button>
              ),
            )}
          </div>

          {period === "custom" && (
            <div className="flex gap-2">
              <div className="glass flex h-10 flex-1 items-center gap-2 rounded-xl px-3">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="flex-1 bg-transparent text-[13px] text-slate-200 outline-none [color-scheme:dark]"
                />
              </div>
              <div className="glass flex h-10 flex-1 items-center gap-2 rounded-xl px-3">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="flex-1 bg-transparent text-[13px] text-slate-200 outline-none [color-scheme:dark]"
                />
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex h-60 items-center justify-center">
              <LoaderCircle className="h-6 w-6 animate-spin text-indigo-300" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="glass relative overflow-hidden rounded-2xl p-3 text-center">
                  <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-rose-500/20 blur-2xl" />
                  <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400">
                    <TrendingDown className="h-3.5 w-3.5 text-rose-400" />总支出
                  </div>
                  <div className="num mt-1.5 text-[16px] font-extrabold tabular-nums text-rose-400">¥{expTotal.toFixed(2)}</div>
                </div>
                <div className="glass relative overflow-hidden rounded-2xl p-3 text-center">
                  <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-emerald-500/20 blur-2xl" />
                  <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />总收入
                  </div>
                  <div className="num mt-1.5 text-[16px] font-extrabold tabular-nums text-emerald-400">¥{incTotal.toFixed(2)}</div>
                </div>
                <div className="glass relative overflow-hidden rounded-2xl p-3 text-center">
                  <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-indigo-500/20 blur-2xl" />
                  <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400">
                    <Hash className="h-3.5 w-3.5 text-indigo-300" />笔数
                  </div>
                  <div className="num mt-1.5 text-[16px] font-extrabold tabular-nums gtext">{count} 笔</div>
                </div>
              </div>

              <BudgetPanel ledgerId={ledgerId} />

              <section className="glass rounded-2xl p-4">
                <h2 className="mb-4 flex items-center gap-2 text-[14px] font-bold">
                  <ChartPie className="h-4 w-4 text-indigo-300" />分类占比（支出）
                </h2>
                <div className="flex items-center gap-4">
                  <div
                    className="relative h-[130px] w-[130px] flex-none rounded-full shadow-[0_0_30px_rgba(99,102,241,.35)]"
                    style={{
                      background: ringSegs
                        ? `conic-gradient(${ringSegs})`
                        : "conic-gradient(#334155 0 100%)",
                    }}
                  >
                    <div className="absolute inset-[20px] rounded-full border border-white/10 bg-[#111528]" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[10px] text-slate-400">支出</span>
                      <span className="num text-[15px] font-extrabold tabular-nums">¥{expTotal.toFixed(0)}</span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2.5">
                    {expense && expense.byCategory.length > 0 ? (
                      expense.byCategory.map((c) => (
                        <div key={c.category} className="flex items-center gap-2 text-[12px]">
                          <span
                            className="h-2.5 w-2.5 flex-none rounded-[4px]"
                            style={{ background: CAT_COLOR[c.category] ?? "#94A3B8" }}
                          />
                          <span className="flex-1 truncate">{c.category}</span>
                          <span className="num font-semibold tabular-nums">¥{c.total.toFixed(0)}</span>
                          <span className="num w-9 text-right text-slate-500 tabular-nums">
                            {Math.round((c.total / expTotal) * 100)}%
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[12px] text-slate-500">本期暂无支出数据</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="glass rounded-2xl p-4">
                <h2 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
                  <Activity className="h-4 w-4 text-indigo-300" />每日趋势（近 7 天）
                </h2>
                <div className="flex h-[140px] items-end justify-between pt-4">
                  {trend.map((t, i) => {
                    const isToday = i === trend.length - 1;
                    const h = `${Math.max(8, (t.total / maxTrend) * 120)}px`;
                    return (
                      <div key={t.date} className="flex flex-1 flex-col items-center gap-1.5">
                        <span className={cn("text-[9px] tabular-nums", isToday ? "font-bold text-indigo-300" : "text-slate-500")}>
                          {t.total > 0 ? `¥${t.total.toFixed(0)}` : "—"}
                        </span>
                        <div
                          className={cn(
                            "w-5 rounded-t-md bg-gradient-to-t",
                            isToday ? "from-violet-500/40 to-fuchsia-400/90 shadow-[0_0_12px_rgba(34,211,238,.5)]" : "from-indigo-500/40 to-indigo-400/80",
                          )}
                          style={{ height: h }}
                        />
                        <span className={cn("text-[10px]", isToday ? "font-bold text-indigo-300" : "text-slate-500")}>
                          {weekday(t.date)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="glass rounded-2xl p-4">
                <h2 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
                  <ListOrdered className="h-4 w-4 text-indigo-300" />分类排行
                </h2>
                {expense && expense.byCategory.length > 0 ? (
                  expense.byCategory.map((c, i) => {
                    const Ic = CAT_ICON[c.category] ?? Package;
                    return (
                      <div
                        key={c.category}
                        className={cn(
                          "flex items-center gap-3 py-2.5",
                          i !== expense.byCategory.length - 1 && "border-b border-white/5",
                        )}
                      >
                        <span className="w-5 text-center text-[12px] font-extrabold text-slate-400">{i + 1}</span>
                        <div className={cn("flex h-8 w-8 flex-none items-center justify-center rounded-lg", CAT_COLOR[c.category] ? "bg-white/5" : "bg-slate-500/15")}>
                          <Ic className="h-4 w-4 text-slate-300" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold">{c.category}</div>
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(4, (c.total / maxCat) * 100)}%`,
                                background: CAT_COLOR[c.category] ?? "#94A3B8",
                              }}
                            />
                          </div>
                        </div>
                        <div className="flex-none text-right">
                          <div className="num text-[13px] font-bold tabular-nums">¥{c.total.toFixed(0)}</div>
                          <div className="num text-[10px] text-slate-500 tabular-nums">{c.count} 笔</div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-[12px] text-slate-500">本期暂无支出数据</p>
                )}
              </section>
            </>
          )}
        </div>

        <BottomNav active="stats" />
      </div>
    </div>
  );
}
