import { requireUserId } from "@/lib/supabase/require-user";
import type { TxnType } from "@/lib/transactions";

export type BudgetPeriod = "week" | "month" | "year" | "custom";

export type Budget = {
  id: string;
  user_id: string;
  ledger_id: string | null;
  kind: TxnType;
  category: string | null;
  period: BudgetPeriod;
  start_date: string;
  end_date: string | null;
  amount: number;
  alert_threshold: number;
  is_active: boolean;
};

export type BudgetUsage = {
  spent: number;
  remaining: number;
  ratio: number;
};

export type BudgetWithUsage = Budget & {
  usage: BudgetUsage;
  /** exceeded=已超支, warning=达提醒阈值, ok=正常 */
  level: "exceeded" | "warning" | "ok";
};

export type BudgetInput = {
  ledger_id?: string | null;
  kind?: TxnType;
  category?: string | null;
  period?: BudgetPeriod;
  start_date: string;
  end_date?: string | null;
  amount: number;
  alert_threshold?: number;
};

const toNumber = (v: unknown) => (typeof v === "string" ? Number(v) : (v as number));

function levelOf(ratio: number, threshold: number): BudgetWithUsage["level"] {
  if (ratio >= 1) return "exceeded";
  if (ratio >= threshold) return "warning";
  return "ok";
}

/** 列出预算并附带执行进度（聚合在 DB 的 budget_usage 内完成） */
export async function listBudgets(ledgerId?: string): Promise<BudgetWithUsage[]> {
  const { supabase } = await requireUserId();
  let q = supabase
    .from("budgets")
    .select(
      "id, user_id, ledger_id, kind, category, period, start_date, end_date, amount, alert_threshold, is_active",
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (ledgerId) q = q.eq("ledger_id", ledgerId);
  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []).map((r: Record<string, unknown>) => ({
    ...(r as Omit<Budget, "amount" | "alert_threshold">),
    amount: toNumber((r as { amount: unknown }).amount),
    alert_threshold: toNumber((r as { alert_threshold: unknown }).alert_threshold),
  })) as Budget[];

  const out: BudgetWithUsage[] = [];
  for (const b of rows) {
    const { data: usageRows } = await supabase.rpc("budget_usage", {
      p_budget_id: b.id,
    });
    const u = (usageRows?.[0] ?? {}) as {
      spent?: unknown;
      remaining?: unknown;
      ratio?: unknown;
    };
    const usage: BudgetUsage = {
      spent: toNumber(u.spent ?? 0),
      remaining: toNumber(u.remaining ?? 0),
      ratio: toNumber(u.ratio ?? 0),
    };
    out.push({ ...b, usage, level: levelOf(usage.ratio, b.alert_threshold) });
  }
  return out;
}

export async function createBudget(input: BudgetInput): Promise<Budget> {
  const { supabase, userId } = await requireUserId();
  const { data, error } = await supabase
    .from("budgets")
    .insert({
      user_id: userId,
      ledger_id: input.ledger_id ?? null,
      kind: input.kind ?? "expense",
      category: input.category ?? null,
      period: input.period ?? "month",
      start_date: input.start_date,
      end_date: input.end_date ?? null,
      amount: input.amount,
      alert_threshold: input.alert_threshold ?? 0.8,
    })
    .select(
      "id, user_id, ledger_id, kind, category, period, start_date, end_date, amount, alert_threshold, is_active",
    )
    .single();
  if (error) throw error;
  const r = data as Omit<Budget, "amount" | "alert_threshold"> & {
    amount: unknown;
    alert_threshold: unknown;
  };
  return { ...r, amount: toNumber(r.amount), alert_threshold: toNumber(r.alert_threshold) };
}

export async function updateBudget(
  id: string,
  patch: Partial<BudgetInput> & { is_active?: boolean },
): Promise<Budget> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("budgets")
    .update({
      ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.start_date !== undefined ? { start_date: patch.start_date } : {}),
      ...(patch.end_date !== undefined ? { end_date: patch.end_date } : {}),
      ...(patch.period !== undefined ? { period: patch.period } : {}),
      ...(patch.alert_threshold !== undefined
        ? { alert_threshold: patch.alert_threshold }
        : {}),
      ...(patch.ledger_id !== undefined ? { ledger_id: patch.ledger_id } : {}),
      ...(patch.is_active !== undefined ? { is_active: patch.is_active } : {}),
    })
    .eq("id", id)
    .select(
      "id, user_id, ledger_id, kind, category, period, start_date, end_date, amount, alert_threshold, is_active",
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND");
  const r = data as Omit<Budget, "amount" | "alert_threshold"> & {
    amount: unknown;
    alert_threshold: unknown;
  };
  return { ...r, amount: toNumber(r.amount), alert_threshold: toNumber(r.alert_threshold) };
}

export async function deleteBudget(id: string): Promise<void> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("budgets")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND");
}
