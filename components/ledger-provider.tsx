"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch } from "@/lib/api";
import type { Ledger } from "@/lib/ledgers";

const STORAGE_KEY = "ai-ledger.current-ledger";

type LedgerContextValue = {
  ledgers: Ledger[];
  ledgerId: string | null;
  current: Ledger | null;
  loading: boolean;
  /** 切换账本（持久化到 localStorage） */
  select: (id: string | null) => void;
  refresh: () => Promise<void>;
};

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      // 全局挂载时的后台初始化请求：401 只表示账本列表拿不到，
      // 不能驱动整页跳转（否则登录页会被反复弹回首页并无限刷新）。
      const res = await apiFetch("/api/ledgers", { skipAuthRedirect: true });
      if (!res.ok) return;
      const j = (await res.json()) as { ledgers?: Ledger[] };
      const list = j.ledgers ?? [];
      setLedgers(list);
      setLedgerId((prev) => {
        // 记住的选择若已失效（账本被归档/移除），回退到默认账本
        if (prev && list.some((l) => l.id === prev)) return prev;
        const fallback =
          list.find((l) => l.is_personal)?.id ?? list[0]?.id ?? null;
        if (typeof window !== "undefined") {
          if (fallback) window.localStorage.setItem(STORAGE_KEY, fallback);
          else window.localStorage.removeItem(STORAGE_KEY);
        }
        return fallback;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setLedgerId(saved);
    void refresh();
  }, [refresh]);

  const select = useCallback((id: string | null) => {
    setLedgerId(id);
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const value = useMemo<LedgerContextValue>(
    () => ({
      ledgers,
      ledgerId,
      current: ledgers.find((l) => l.id === ledgerId) ?? null,
      loading,
      select,
      refresh,
    }),
    [ledgers, ledgerId, loading, select, refresh],
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error("useLedger 必须在 LedgerProvider 内使用");
  return ctx;
}
