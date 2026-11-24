import { requireUserId } from "@/lib/supabase/require-user";

export type LedgerRole = "owner" | "editor" | "viewer";

export type Ledger = {
  id: string;
  owner_id: string;
  name: string;
  currency: string;
  is_personal: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  role: LedgerRole;
  member_count: number;
};

export type LedgerMember = {
  ledger_id: string;
  user_id: string;
  role: LedgerRole;
  joined_at: string;
  email: string | null;
  nickname: string | null;
};

export type LedgerInput = {
  name: string;
  currency?: string;
  is_personal?: boolean;
};

/** 列出我拥有或被邀请加入的账本（RLS 已过滤，含共享账本） */
export async function listLedgers(): Promise<Ledger[]> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("ledgers")
    .select("id, owner_id, name, currency, is_personal, archived_at, created_at, updated_at")
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as Omit<Ledger, "role" | "member_count">[];
  const { data: memberRows } = await supabase
    .from("ledger_members")
    .select("ledger_id, role");
  const myRoles = new Map<string, LedgerRole>();
  for (const m of (memberRows ?? []) as { ledger_id: string; role: LedgerRole }[]) {
    myRoles.set(m.ledger_id, m.role);
  }

  const { data: countRows } = await supabase
    .from("ledger_members")
    .select("ledger_id");
  const counts = new Map<string, number>();
  for (const m of (countRows ?? []) as { ledger_id: string }[]) {
    counts.set(m.ledger_id, (counts.get(m.ledger_id) ?? 0) + 1);
  }

  return rows.map((r) => ({
    ...r,
    role: myRoles.get(r.id) ?? (r.owner_id ? "owner" : "viewer"),
    member_count: counts.get(r.id) ?? 0,
  }));
}

export async function createLedger(input: LedgerInput): Promise<Ledger> {
  const { supabase, userId } = await requireUserId();
  const { data, error } = await supabase
    .from("ledgers")
    .insert({
      owner_id: userId,
      name: input.name,
      currency: input.currency ?? "CNY",
      is_personal: input.is_personal ?? false,
    })
    .select("id, owner_id, name, currency, is_personal, archived_at, created_at, updated_at")
    .single();
  if (error) throw error;
  // owner 成员行由 RLS 允许本人插入
  await supabase
    .from("ledger_members")
    .upsert(
      { ledger_id: (data as { id: string }).id, user_id: userId, role: "owner" },
      { onConflict: "ledger_id,user_id" },
    );
  return { ...(data as Omit<Ledger, "role" | "member_count">), role: "owner", member_count: 1 };
}

export async function updateLedger(
  id: string,
  patch: { name?: string; currency?: string; archived?: boolean },
): Promise<Ledger> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("ledgers")
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.archived !== undefined
        ? { archived_at: patch.archived ? new Date().toISOString() : null }
        : {}),
    })
    .eq("id", id)
    .select("id, owner_id, name, currency, is_personal, archived_at, created_at, updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND");
  return { ...(data as Omit<Ledger, "role" | "member_count">), role: "owner", member_count: 0 };
}

/** 校验当前用户是否可访问该账本（共享账本成员亦可） */
export async function assertLedgerAccess(ledgerId: string): Promise<void> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase.rpc("is_ledger_member", {
    p_ledger_id: ledgerId,
  });
  if (error) throw error;
  if (!data) throw new Error("FORBIDDEN");
}

export async function listMembers(ledgerId: string): Promise<LedgerMember[]> {
  const { supabase } = await requireUserId();
  await assertLedgerAccess(ledgerId);
  const { data: members, error } = await supabase
    .from("ledger_members")
    .select("ledger_id, user_id, role, joined_at")
    .eq("ledger_id", ledgerId)
    .order("joined_at", { ascending: true });
  if (error) throw error;

  const rows = (members ?? []) as Omit<LedgerMember, "email" | "nickname">[];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, nickname");
  const byId = new Map(
    ((profiles ?? []) as { id: string; email: string | null; nickname: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );
  return rows.map((m) => ({
    ...m,
    email: byId.get(m.user_id)?.email ?? null,
    nickname: byId.get(m.user_id)?.nickname ?? null,
  }));
}

export async function inviteMember(
  ledgerId: string,
  email: string,
  role: LedgerRole = "editor",
): Promise<void> {
  const { supabase } = await requireUserId();
  const { error } = await supabase.rpc("invite_ledger_member", {
    p_ledger_id: ledgerId,
    p_email: email,
    p_role: role,
  });
  if (error) throw error;
}

export async function removeMember(ledgerId: string, userId: string): Promise<void> {
  const { supabase } = await requireUserId();
  const { error } = await supabase.rpc("remove_ledger_member", {
    p_ledger_id: ledgerId,
    p_user_id: userId,
  });
  if (error) throw error;
}
