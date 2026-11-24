"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Check,
  Plus,
  Users,
  X,
  LoaderCircle,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { useLedger } from "@/components/ledger-provider";
import type { LedgerMember } from "@/lib/ledgers";

type Panel = "list" | "create" | "members";

export function LedgerSwitcher() {
  const { ledgers, ledgerId, current, loading, select, refresh } = useLedger();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("list");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [members, setMembers] = useState<LedgerMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    if (!open) {
      setPanel("list");
      setErr(null);
      setName("");
      setInviteEmail("");
    }
  }, [open]);

  const loadMembers = async () => {
    if (!ledgerId) return;
    const res = await apiFetch(`/api/ledgers/${ledgerId}/members`);
    const j = (await res.json()) as { members?: LedgerMember[]; error?: string };
    if (!res.ok) throw new Error(j.error ?? "加载成员失败");
    setMembers(j.members ?? []);
  };

  const openMembers = async () => {
    setBusy(true);
    setErr(null);
    try {
      await loadMembers();
      setPanel("members");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载成员失败");
    } finally {
      setBusy(false);
    }
  };

  const createLedger = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/ledgers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      const j = (await res.json()) as { ledger?: { id: string }; error?: string };
      if (!res.ok) throw new Error(j.error ?? "创建失败");
      await refresh();
      if (j.ledger) select(j.ledger.id);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    if (!ledgerId || !inviteEmail.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch(`/api/ledgers/${ledgerId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: "editor" }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "邀请失败");
      setInviteEmail("");
      await loadMembers();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "邀请失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (userId: string) => {
    if (!ledgerId) return;
    setBusy(true);
    try {
      const res = await apiFetch(
        `/api/ledgers/${ledgerId}/members?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "移除失败");
      await loadMembers();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "移除失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex max-w-[150px] items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:bg-white/10 active:scale-95"
        title="切换账本"
      >
        <BookOpen className="h-3.5 w-3.5 flex-none text-indigo-300" />
        <span className="truncate">{loading ? "加载中" : current?.name ?? "默认账本"}</span>
        <ChevronDown className="h-3 w-3 flex-none text-slate-500" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85dvh] w-full max-w-[480px] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-white/10 bg-[#111528] p-5 pb-8 shadow-2xl sm:max-h-[80vh] sm:rounded-3xl sm:border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[15px] font-bold">
                <BookOpen className="h-4 w-4 text-indigo-300" />
                {panel === "create"
                  ? "新建账本"
                  : panel === "members"
                    ? "账本成员"
                    : "切换账本"}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {panel === "list" && (
              <>
                <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
                  {ledgers.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => {
                        select(l.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                        l.id === ledgerId
                          ? "border-indigo-400/40 bg-indigo-500/10"
                          : "border-white/5 bg-white/5 hover:bg-white/10",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold">{l.name}</div>
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {l.role === "owner" ? "我创建的" : l.role === "editor" ? "可编辑" : "只读"} ·{" "}
                          {l.member_count > 1 ? `${l.member_count} 人共享` : "仅自己"} · {l.currency}
                        </div>
                      </div>
                      {l.id === ledgerId && <Check className="h-4 w-4 flex-none text-indigo-300" />}
                    </button>
                  ))}
                  {ledgers.length === 0 && !loading && (
                    <p className="py-6 text-center text-[12px] text-slate-500">暂无账本</p>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setPanel("create")}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 py-2.5 text-[13px] font-bold text-white active:scale-95"
                  >
                    <Plus className="h-4 w-4" /> 新建账本
                  </button>
                  <button
                    onClick={openMembers}
                    disabled={!ledgerId || busy}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 py-2.5 text-[13px] font-semibold text-slate-200 active:scale-95 disabled:opacity-50"
                  >
                    <Users className="h-4 w-4" /> 成员
                  </button>
                </div>
              </>
            )}

            {panel === "create" && (
              <div className="space-y-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createLedger()}
                  placeholder="账本名称，如：家庭账本、旅行"
                  maxLength={40}
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-[14px] outline-none placeholder:text-slate-600 focus:border-indigo-400/60"
                />
                <p className="text-[11px] text-slate-500">
                  新建后可邀请其他用户共享记账（对方需已注册）。
                </p>
                <button
                  onClick={createLedger}
                  disabled={busy || !name.trim()}
                  className="h-11 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[14px] font-bold text-white active:scale-95 disabled:opacity-50"
                >
                  {busy ? <LoaderCircle className="inline h-4 w-4 animate-spin" /> : "创建并切换"}
                </button>
                <button
                  onClick={() => setPanel("list")}
                  className="w-full py-1 text-[12px] text-slate-400 hover:text-slate-200"
                >
                  返回
                </button>
              </div>
            )}

            {panel === "members" && (
              <div className="space-y-3">
                <div className="max-h-[35vh] space-y-1.5 overflow-y-auto">
                  {members.map((m) => (
                    <div
                      key={m.user_id}
                      className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-semibold">
                          {m.nickname ?? m.email ?? m.user_id.slice(0, 8)}
                        </div>
                        <div className="truncate text-[10px] text-slate-500">{m.email}</div>
                      </div>
                      <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
                        {m.role === "owner" && <ShieldCheck className="h-3 w-3 text-amber-300" />}
                        {m.role === "owner" ? "所有者" : m.role === "editor" ? "可编辑" : "只读"}
                      </span>
                      {m.role !== "owner" && (
                        <button
                          onClick={() => remove(m.user_id)}
                          disabled={busy}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                          title="移除成员"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && invite()}
                    placeholder="对方注册邮箱"
                    type="email"
                    className="h-10 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-[13px] outline-none placeholder:text-slate-600 focus:border-indigo-400/60"
                  />
                  <button
                    onClick={invite}
                    disabled={busy || !inviteEmail.trim()}
                    className="rounded-xl bg-indigo-500/80 px-4 text-[13px] font-bold text-white active:scale-95 disabled:opacity-50"
                  >
                    邀请
                  </button>
                </div>
                <button
                  onClick={() => setPanel("list")}
                  className="w-full py-1 text-[12px] text-slate-400 hover:text-slate-200"
                >
                  返回
                </button>
              </div>
            )}

            {err && <p className="mt-3 text-[12px] text-rose-400">{err}</p>}
          </div>
        </div>
      )}
    </>
  );
}
