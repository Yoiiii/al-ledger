"use client";

import { useCallback, useEffect, useState } from "react";
import { History, LoaderCircle, MessageSquare, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

type Session = {
  id: string;
  title: string | null;
  updated_at: string;
  ledger_id: string | null;
};

type Props = {
  open: boolean;
  /** 每次消息保存 / 新建会话后自增，用于刷新列表 */
  version: number;
  currentSessionId: string | null;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => Promise<void>;
};

function fmtTime(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatSessionDrawer({
  open,
  version,
  currentSessionId,
  onClose,
  onNew,
  onSelect,
}: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/chat/sessions");
      const j = (await res.json()) as { sessions?: Session[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "加载会话失败");
      setSessions(j.sessions ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载会话失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, version, load]);

  const choose = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      await onSelect(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "读取会话失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("删除该会话及其全部消息？")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "删除失败");
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (id === currentSessionId) onNew();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-t-3xl border-t border-white/10 bg-[#111528] p-5 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <History className="h-4 w-4 text-indigo-300" />
            历史会话
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={onNew}
          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 py-2.5 text-[13px] font-bold text-white active:scale-95"
        >
          <Plus className="h-4 w-4" /> 新对话
        </button>

        <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
          {loading && (
            <p className="py-6 text-center text-[12px] text-slate-500">
              <LoaderCircle className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />
              加载中…
            </p>
          )}
          {!loading &&
            sessions.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 transition",
                  s.id === currentSessionId
                    ? "border-indigo-400/40 bg-indigo-500/10"
                    : "border-white/5 bg-white/5 hover:bg-white/10",
                )}
              >
                <button
                  onClick={() => choose(s.id)}
                  disabled={busy}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <MessageSquare className="h-4 w-4 flex-none text-slate-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {s.title ?? "新对话"}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-slate-500">
                      {fmtTime(s.updated_at)}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => remove(s.id)}
                  disabled={busy}
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                  title="删除会话"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          {!loading && sessions.length === 0 && (
            <p className="py-6 text-center text-[12px] text-slate-500">
              还没有历史会话，聊一句就会自动保存
            </p>
          )}
        </div>

        {err && <p className="mt-3 text-[12px] text-rose-400">{err}</p>}
      </div>
    </div>
  );
}
