"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Target,
  TriangleAlert,
  Plus,
  Trash2,
  LoaderCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

export type BudgetRow = {
  id: string;
  category: string | null;
  period: string;
  start_date: string;
  end_date: string | null;
  amount: number;
  alert_threshold: number;
  usage: { spent: number; remaining: number; ratio: number };
  level: "exceeded" | "warning" | "ok";
};

export type BudgetAlert = {
  budgetId: string;
  level: "exceeded" | "warning";
  category: string | null;
  title: string;
  body: string;
};

const CATS = ["餐饮", "交通", "购物", "居住", "娱乐", "医疗", "教育", "通讯", "人情", "其他"];
const todayStr = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

export function BudgetPanel({ ledgerId }: { ledgerId: string | null }) {
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = ledgerId ? `?ledgerId=${encodeURIComponent(ledgerId)}` : "";
      const res = await apiFetch(`/api/budgets${qs}`);
      const j = (await res.json()) as {
        budgets?: BudgetRow[];
        alerts?: BudgetAlert[];
      };
      if (res.ok) {
        setBudgets(j.budgets ?? []);
        setAlerts(j.alerts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [ledgerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) {
      setErr("请输入有效的预算金额");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category || null,
          amount: amt,
          period: "month",
          start_date: firstOfMonth(),
          end_date: todayStr(),
          ...(ledgerId ? { ledger_id: ledgerId } : {}),
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "创建失败");
      setAdding(false);
      setAmount("");
      setCategory("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/budgets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? "删除失败");
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[14px] font-bold">
          <Target className="h-4 w-4 text-indigo-300" />预算与提醒
        </h2>
        <button
          onClick={() => {
            setAdding((v) => !v);
            setErr(null);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-indigo-300 hover:bg-white/10"
          title="新增预算"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {alerts.length > 0 && (
        <div className="mb-3 space-y-2">
          {alerts.map((a) => (
            <div
              key={a.budgetId}
              className={cn(
                "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12px]",
                a.level === "exceeded"
                  ? "border-rose-400/30 bg-rose-500/10 text-rose-300"
                  : "border-amber-400/30 bg-amber-500/10 text-amber-300",
              )}
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 flex-none" />
              <div>
                <div className="font-semibold">{a.title}</div>
                <div className="mt-0.5 text-[11px] opacity-80">{a.body}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mb-3 space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 flex-1 rounded-lg border border-white/10 bg-[#111528] px-2 text-[12px] text-slate-200 outline-none"
            >
              <option value="">总预算（全部分类）</option>
              {CATS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              type="number"
              min="0"
              placeholder="金额"
              className="h-9 w-24 rounded-lg border border-white/10 bg-white/5 px-2 text-[12px] tabular-nums outline-none focus:border-indigo-400/60"
            />
          </div>
          <p className="text-[10px] text-slate-500">周期：本月至今日；达 80% 提醒、超支高亮。</p>
          <button
            onClick={add}
            disabled={busy}
            className="h-9 w-full rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-[12px] font-bold text-white active:scale-95 disabled:opacity-50"
          >
            {busy ? <LoaderCircle className="inline h-3.5 w-3.5 animate-spin" /> : "保存预算"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex h-16 items-center justify-center">
          <LoaderCircle className="h-5 w-5 animate-spin text-indigo-300" />
        </div>
      ) : budgets.length === 0 ? (
        <div className="flex items-center gap-2 py-3 text-[12px] text-slate-500">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          暂无预算，点右上角 + 设置一个月度预算
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map((b) => {
            const pct = Math.min(100, Math.round(b.usage.ratio * 100));
            return (
              <div key={b.id} className="rounded-xl border border-white/5 bg-white/5 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[13px] font-semibold">
                    {b.category ?? "总预算"}
                  </span>
                  <span
                    className={cn(
                      "num text-[12px] font-bold tabular-nums",
                      b.level === "exceeded"
                        ? "text-rose-400"
                        : b.level === "warning"
                          ? "text-amber-300"
                          : "text-slate-300",
                    )}
                  >
                    ¥{b.usage.spent.toFixed(0)} / ¥{b.amount.toFixed(0)}
                  </span>
                  <button
                    onClick={() => remove(b.id)}
                    disabled={busy}
                    className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                    title="删除预算"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      b.level === "exceeded"
                        ? "bg-gradient-to-r from-rose-500 to-red-500"
                        : b.level === "warning"
                          ? "bg-gradient-to-r from-amber-500 to-orange-500"
                          : "bg-gradient-to-r from-indigo-500 to-violet-500",
                    )}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
                  <span>
                    {b.level === "exceeded"
                      ? `超支 ¥${Math.abs(b.usage.remaining).toFixed(0)}`
                      : `剩余 ¥${b.usage.remaining.toFixed(0)}`}
                  </span>
                  <span className="num tabular-nums">{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {err && <p className="mt-2 text-[12px] text-rose-400">{err}</p>}
    </section>
  );
}
