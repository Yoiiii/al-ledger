"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Receipt,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Utensils,
  CarFront,
  ShoppingBag,
  Home,
  Gamepad2,
  Pill,
  BookOpen,
  Smartphone,
  Gift,
  Package,
  MessageCircle,
  Wallet,
  CreditCard,
  Banknote,
  MoreHorizontal,
  Pencil,
  Trash2,
  CalendarDays,
  Plus,
  LoaderCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomNav } from "@/components/bottom-nav";
import { apiFetch } from "@/lib/api";
import { useLedger } from "@/components/ledger-provider";
import { LedgerSwitcher } from "@/components/ledger-switcher";
import type { Transaction, TxnCategory, TxnPayment } from "@/lib/transactions";

type IconType = ComponentType<{ className?: string }>;

const CAT_META: Record<
  string,
  { Icon: IconType; grad: string; bg: string; ic: string }
> = {
  餐饮: { Icon: Utensils, grad: "from-orange-500 to-amber-500", bg: "bg-orange-500/15", ic: "text-orange-300" },
  交通: { Icon: CarFront, grad: "from-blue-500 to-cyan-500", bg: "bg-blue-500/15", ic: "text-blue-300" },
  购物: { Icon: ShoppingBag, grad: "from-violet-500 to-purple-500", bg: "bg-violet-500/15", ic: "text-violet-300" },
  居住: { Icon: Home, grad: "from-cyan-500 to-teal-500", bg: "bg-cyan-500/15", ic: "text-cyan-300" },
  娱乐: { Icon: Gamepad2, grad: "from-pink-500 to-rose-500", bg: "bg-pink-500/15", ic: "text-pink-300" },
  医疗: { Icon: Pill, grad: "from-red-500 to-rose-500", bg: "bg-red-500/15", ic: "text-red-300" },
  教育: { Icon: BookOpen, grad: "from-yellow-500 to-orange-500", bg: "bg-yellow-500/15", ic: "text-yellow-300" },
  通讯: { Icon: Smartphone, grad: "from-emerald-500 to-teal-500", bg: "bg-emerald-500/15", ic: "text-emerald-300" },
  人情: { Icon: Gift, grad: "from-amber-500 to-yellow-500", bg: "bg-amber-500/15", ic: "text-amber-300" },
  其他: { Icon: Package, grad: "from-slate-500 to-slate-600", bg: "bg-slate-500/15", ic: "text-slate-300" },
};

const CATS = Object.keys(CAT_META);
const PAY_META: Record<string, IconType> = {
  微信: MessageCircle,
  支付宝: Wallet,
  银行卡: CreditCard,
  现金: Banknote,
  其他: MoreHorizontal,
};
const PAYS = Object.keys(PAY_META);

const todayStr = () => new Date().toISOString().slice(0, 10);

function dateTitle(d: string, now: Date | null): string {
  const t = new Date(d + "T00:00:00");
  if (!now) return `${t.getMonth() + 1}月${t.getDate()}日`;
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((base.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  return `${t.getMonth() + 1}月${t.getDate()}日`;
}

function fmtAmount(t: Transaction) {
  return `${t.type === "income" ? "+" : "-"}${t.amount.toFixed(2)}`;
}

function weekStart(d: Date) {
  const x = new Date(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - day + 1);
  return x;
}

export default function BillsPage() {
  const { ledgerId, loading: ledgerLoading } = useLedger();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState("全部");
  const [range, setRange] = useState("全部");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<{
    id?: string;
    amount: string;
    category: string;
    payment: string;
    date: string;
    note: string;
    isNew: boolean;
  }>({ amount: "", category: "餐饮", payment: "其他", date: "", note: "", isNew: true });

  const [now, setNow] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const qs = ledgerId ? `?ledgerId=${encodeURIComponent(ledgerId)}` : "";
      const res = await apiFetch(`/api/transactions${qs}`);
      const json = await res.json();
      if (json.transactions) setTxns(json.transactions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setNow(new Date());
    if (ledgerLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerId, ledgerLoading]);

  const filtered = useMemo(() => {
    return txns.filter((t) => {
      if (catFilter !== "全部" && t.category !== catFilter) return false;
      if (range === "全部") return true;
      if (!now) return false;
      const d = new Date(t.occurred_date + "T00:00:00");
      if (range === "今天") return d.toDateString() === now.toDateString();
      if (range === "本周") {
        const ws = weekStart(now);
        return d >= ws;
      }
      if (range === "本月")
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      return true;
    });
  }, [txns, catFilter, range, now]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const arr = map.get(t.occurred_date) ?? [];
      arr.push(t);
      map.set(t.occurred_date, arr);
    }
    return [...map.keys()]
      .sort((a, b) => b.localeCompare(a))
      .map((date) => {
        const rows = map.get(date)!;
        const sum = rows.reduce(
          (s, r) => s + (r.type === "income" ? r.amount : -r.amount),
          0,
        );
        return {
          date,
          title: dateTitle(date, now),
          rows,
          sub: `${sum < 0 ? "-" : "+"}¥${Math.abs(sum).toFixed(2)}`,
        };
      });
  }, [filtered, now]);

  const monthExpense = useMemo(
    () =>
      txns
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + t.amount, 0),
    [txns],
  );
  const monthIncome = useMemo(
    () =>
      txns
        .filter((t) => t.type === "income")
        .reduce((s, t) => s + t.amount, 0),
    [txns],
  );

  const openSheet = (t: Transaction) => {
    setForm({
      id: t.id,
      amount: String(t.amount),
      category: t.category,
      payment: t.payment_method,
      date: t.occurred_date,
      note: t.note ?? "",
      isNew: false,
    });
    setErr(null);
    setOpen(true);
  };

  const openNew = () => {
    setForm({ amount: "", category: "餐饮", payment: "其他", date: todayStr(), note: "", isNew: true });
    setErr(null);
    setOpen(true);
  };

  const save = async () => {
    const amt = Number(form.amount);
    if (!(amt > 0)) {
      setErr("金额需大于 0");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        amount: amt,
        category: form.category as TxnCategory,
        payment_method: form.payment as TxnPayment,
        occurred_date: form.date,
        note: form.note,
        // 仅新增时指定账本；编辑不改归属，避免把共享账本里的记录挪走
        ...(form.isNew && ledgerId ? { ledger_id: ledgerId } : {}),
      };
      const res = form.isNew
        ? await apiFetch("/api/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await apiFetch(`/api/transactions/${form.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) throw new Error("保存失败");
      setOpen(false);
      await load();
    } catch {
      setErr("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!form.id) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/transactions/${form.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      setOpen(false);
      await load();
    } catch {
      setErr("删除失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const CatI = CAT_META[form.category]?.Icon ?? Package;

  return (
    <div className="relative min-h-screen bg-[#0B0D17] text-slate-100 antialiased">
      <div className="pointer-events-none fixed -right-20 -top-20 z-0 h-72 w-72 rounded-full bg-violet-600/25 blur-[90px]" />
      <div className="pointer-events-none fixed -left-24 bottom-1/4 z-0 h-80 w-80 rounded-full bg-indigo-600/15 blur-[90px]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[480px] flex-col border-x border-white/5 pb-28">
        <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0B0D17]/70 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-[17px] font-bold">
              <Receipt className="h-5 w-5 text-indigo-300" />
              账单
            </h1>
            <div className="flex items-center gap-2">
              <LedgerSwitcher />
              <button
                onClick={openNew}
                className="glass flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95"
                title="新增账单"
              >
                <Plus className="h-4 w-4 text-indigo-300" />
              </button>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="glass h-8 flex-1 rounded-lg bg-transparent px-3 text-[12px] text-slate-300 outline-none"
            >
              <option className="bg-[#111528]" value="全部">全部分类</option>
              {CATS.map((c) => (
                <option key={c} className="bg-[#111528]" value={c}>{c}</option>
              ))}
            </select>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="glass h-8 flex-1 rounded-lg bg-transparent px-3 text-[12px] text-slate-300 outline-none"
            >
              <option className="bg-[#111528]" value="全部">全部时间</option>
              <option className="bg-[#111528]" value="本月">本月</option>
              <option className="bg-[#111528]" value="本周">本周</option>
              <option className="bg-[#111528]" value="今天">今天</option>
            </select>
          </div>
        </header>

        <div className="flex-1 px-3 pt-3">
          <div className="glass mb-3 flex items-center justify-between rounded-2xl px-4 py-3 text-[12px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
              支出 <span className="num tabular-nums text-[14px] font-bold text-rose-400">¥{monthExpense.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              收入 <span className="num tabular-nums text-[14px] font-bold text-emerald-400">¥{monthIncome.toFixed(2)}</span>
            </div>
            <div>
              共 <span className="num tabular-nums text-[14px] font-bold text-slate-200">{txns.length}</span> 笔
            </div>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <LoaderCircle className="h-6 w-6 animate-spin text-indigo-300" />
            </div>
          ) : txns.length === 0 ? (
            <p className="mt-10 text-center text-[12px] text-slate-500">
              还没有账单，点右上角 + 记一笔，或去首页用一句话记账～
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.date} className="glass mb-3 overflow-hidden rounded-2xl">
                <div className="flex items-baseline justify-between border-b border-white/5 px-4 pb-2 pt-3">
                  <span className="flex items-center gap-1.5 text-[13px] font-bold">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,.9)]" />
                    {g.title}
                  </span>
                  <span className="num tabular-nums text-[11px] text-slate-500">小计 {g.sub}</span>
                </div>
                {g.rows.map((t) => {
                  const m = CAT_META[t.category] ?? CAT_META["其他"];
                  const C = m.Icon;
                  const P = PAY_META[t.payment_method] ?? MoreHorizontal;
                  return (
                    <button
                      key={t.id}
                      onClick={() => openSheet(t)}
                      className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left transition hover:bg-white/5 active:bg-white/10"
                    >
                      <div className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gradient-to-br shadow-md", m.grad, "shadow-black/20")}>
                        <C className="h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px]">{t.note || t.category}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                          <P className="h-3 w-3" />
                          {t.payment_method} · {t.occurred_date.slice(5)}
                        </div>
                      </div>
                      <div className={cn("text-[15px] font-bold tabular-nums", t.type === "income" ? "text-emerald-400" : "text-rose-400")}>
                        {fmtAmount(t)}
                      </div>
                      <ChevronRight className="h-4 w-4 flex-none text-slate-600" />
                    </button>
                  );
                })}
              </section>
            ))
          )}

          {!loading && txns.length > 0 && (
            <p className="mb-4 text-center text-[11px] text-slate-600">点击任意一行 → 打开底部编辑抽屉</p>
          )}
        </div>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed bottom-0 left-1/2 z-40 max-h-[82vh] w-full max-w-[480px] -translate-x-1/2 overflow-y-auto rounded-t-3xl border-x border-t border-white/10 bg-[#111528]/95 px-4 pb-6 pt-2 shadow-[0_-8px_40px_rgba(0,0,0,.6)] backdrop-blur-2xl">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" />
            <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold">
              <Pencil className="h-4 w-4 text-indigo-300" />
              {form.isNew ? "新增账单" : "编辑账单"}
            </h2>

            <div className="mb-4">
              <label className="mb-1.5 block text-[12px] text-slate-400">金额</label>
              <div className="glass flex h-12 items-center gap-2 rounded-xl px-4">
                <span className="text-[18px] font-bold text-slate-400">¥</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="flex-1 bg-transparent text-[20px] font-extrabold tabular-nums text-rose-400 outline-none"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-[12px] text-slate-400">分类</label>
              <div className="grid grid-cols-5 gap-2">
                {CATS.map((c) => {
                  const Icon = CAT_META[c].Icon;
                  const on = form.category === c;
                  return (
                    <button
                      key={c}
                      onClick={() => setForm({ ...form, category: c })}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border py-2 transition",
                        on ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-300" : "border-white/10 text-slate-400 hover:bg-white/5",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-[10px]">{c}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-[12px] text-slate-400">支付方式</label>
              <div className="flex flex-wrap gap-2">
                {PAYS.map((p) => {
                  const Icon = PAY_META[p];
                  const on = form.payment === p;
                  return (
                    <button
                      key={p}
                      onClick={() => setForm({ ...form, payment: p })}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] transition",
                        on ? "border-indigo-400/50 bg-indigo-500/15 font-semibold text-indigo-300" : "border-white/10 text-slate-400 hover:bg-white/5",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-[12px] text-slate-400">日期</label>
              <div className="glass flex h-11 items-center gap-2 rounded-xl px-4">
                <CalendarDays className="h-4 w-4 flex-none text-slate-400" />
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="flex-1 bg-transparent text-[14px] text-slate-200 outline-none [color-scheme:dark]"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-[12px] text-slate-400">备注</label>
              <div className="glass flex h-11 items-center rounded-xl px-4">
                <input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="如：午饭、打车去机场"
                  className="flex-1 bg-transparent text-[14px] text-slate-200 outline-none"
                />
              </div>
            </div>

            {err && <p className="mb-2 text-[12px] text-rose-400">{err}</p>}

            <div className="flex gap-3">
              {!form.isNew && (
                <button
                  onClick={remove}
                  disabled={saving}
                  className="inline-flex h-11 w-[88px] flex-none items-center justify-center gap-1.5 rounded-xl border border-rose-400/40 bg-rose-500/10 text-[14px] font-semibold text-rose-300 transition hover:bg-rose-500/20 active:scale-95 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  删除
                </button>
              )}
              <button
                onClick={save}
                disabled={saving}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[14px] font-bold text-white shadow-lg shadow-indigo-500/40 transition hover:opacity-90 active:scale-95 disabled:opacity-60"
              >
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CatI className="h-4 w-4" />}
                保存
              </button>
            </div>
          </div>
        </>
      )}

      <BottomNav active="bills" />
    </div>
  );
}
