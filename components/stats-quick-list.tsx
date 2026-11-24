"use client";

import { useEffect, useState } from "react";
import { CalendarDays, PieChart, TrendingUp, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";

type StatsResult = { total?: number; count?: number };
type Period = "today" | "month";

type RowData = {
  key: string;
  label: string;
  period: Period;
  type: "expense" | "income";
  Icon: typeof CalendarDays;
  color: string;
  query: string;
};

const ROWS: RowData[] = [
  {
    key: "today-expense",
    label: "今日支出",
    period: "today",
    type: "expense",
    Icon: CalendarDays,
    color: "text-rose-400",
    query: "今天支出",
  },
  {
    key: "month-expense",
    label: "本月支出",
    period: "month",
    type: "expense",
    Icon: PieChart,
    color: "text-amber-300",
    query: "本月花了多少",
  },
  {
    key: "month-income",
    label: "本月收入",
    period: "month",
    type: "income",
    Icon: TrendingUp,
    color: "text-emerald-400",
    query: "本月收入多少",
  },
];

/**
 * 统计快览列表：直接读 /api/stats 展示金额，比横向 chip 更易读。
 * 点任一行仍把对应问句发给 AI 获取分类明细。
 */
export function StatsQuickList({
  ledgerId,
  version,
  onQuery,
}: {
  ledgerId: string | null;
  version: number;
  onQuery: (text: string) => void;
}) {
  const [totals, setTotals] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let active = true;
    const load = async (period: Period, type: "expense" | "income", key: string) => {
      const qs = new URLSearchParams({ period });
      if (ledgerId) qs.set("ledgerId", ledgerId);
      try {
        const res = await apiFetch(`/api/stats?${qs.toString()}`, { skipAuthRedirect: true });
        if (!res.ok) throw new Error();
        const j = (await res.json()) as Record<string, StatsResult>;
        const value = j[type]?.total ?? 0;
        if (active) setTotals((t) => ({ ...t, [key]: value }));
      } catch {
        if (active) setTotals((t) => ({ ...t, [key]: null }));
      }
    };
    void Promise.all([
      load("today", "expense", "today-expense"),
      load("month", "expense", "month-expense"),
      load("month", "income", "month-income"),
    ]);
    return () => {
      active = false;
    };
  }, [ledgerId, version]);

  return (
    <div className="glass rounded-2xl px-3 py-1.5">
      {ROWS.map((row, i) => {
        const value = totals[row.key];
        const { Icon } = row;
        return (
          <button
            key={row.key}
            onClick={() => onQuery(row.query)}
            className={`flex w-full items-center gap-2.5 py-2 text-left transition active:opacity-70 ${
              i > 0 ? "border-t border-white/5" : ""
            }`}
          >
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-white/5">
              <Icon className={`h-4 w-4 ${row.color}`} />
            </span>
            <span className="flex-1 text-[13px] text-slate-300">{row.label}</span>
            <span className={`text-[14px] font-bold tabular-nums ${row.color}`}>
              {value === null ? "—" : value === undefined ? "…" : `¥${value.toFixed(2)}`}
            </span>
            <ChevronRight className="h-3.5 w-3.5 flex-none text-slate-600" />
          </button>
        );
      })}
    </div>
  );
}
