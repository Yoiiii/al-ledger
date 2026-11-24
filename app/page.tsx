"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  Bot,
  User,
  Sparkles,
  Undo2,
  Pencil,
  Receipt,
  Utensils,
  CarFront,
  ShoppingBag,
  Home as HomeIcon,
  Gamepad2,
  Pill,
  BookOpen,
  Gift,
  Smartphone,
  Package,
  LoaderCircle,
  PieChart,
  List,
  CalendarDays,
  Mic,
  Send,
  TriangleAlert,
  RotateCw,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomNav } from "@/components/bottom-nav";
import { apiFetch } from "@/lib/api";
import { useLedger } from "@/components/ledger-provider";
import { LedgerSwitcher } from "@/components/ledger-switcher";
import { ChatSessionDrawer } from "@/components/chat-session-drawer";
import { StatsQuickList } from "@/components/stats-quick-list";

type IconType = ComponentType<{ className?: string }>;

const CAT_META: Record<
  string,
  { Icon: IconType; grad: string; bg: string; fill: string; ic: string }
> = {
  餐饮: { Icon: Utensils, grad: "from-orange-500 to-amber-500", bg: "bg-orange-500/15", fill: "from-orange-400 to-amber-400", ic: "text-orange-300" },
  交通: { Icon: CarFront, grad: "from-blue-500 to-cyan-500", bg: "bg-blue-500/15", fill: "from-blue-400 to-cyan-400", ic: "text-blue-300" },
  购物: { Icon: ShoppingBag, grad: "from-violet-500 to-purple-500", bg: "bg-violet-500/15", fill: "from-violet-400 to-purple-400", ic: "text-violet-300" },
  居住: { Icon: HomeIcon, grad: "from-cyan-500 to-teal-500", bg: "bg-cyan-500/15", fill: "from-cyan-400 to-teal-400", ic: "text-cyan-300" },
  娱乐: { Icon: Gamepad2, grad: "from-pink-500 to-rose-500", bg: "bg-pink-500/15", fill: "from-pink-400 to-rose-400", ic: "text-pink-300" },
  医疗: { Icon: Pill, grad: "from-red-500 to-rose-500", bg: "bg-red-500/15", fill: "from-red-400 to-rose-400", ic: "text-red-300" },
  教育: { Icon: BookOpen, grad: "from-yellow-500 to-orange-500", bg: "bg-yellow-500/15", fill: "from-yellow-400 to-orange-400", ic: "text-yellow-300" },
  通讯: { Icon: Smartphone, grad: "from-emerald-500 to-teal-500", bg: "bg-emerald-500/15", fill: "from-emerald-400 to-teal-400", ic: "text-emerald-300" },
  人情: { Icon: Gift, grad: "from-amber-500 to-yellow-500", bg: "bg-amber-500/15", fill: "from-amber-400 to-yellow-400", ic: "text-amber-300" },
  其他: { Icon: Package, grad: "from-slate-500 to-slate-600", bg: "bg-slate-500/15", fill: "from-slate-400 to-slate-500", ic: "text-slate-300" },
};
const CATS_FALLBACK = CAT_META["其他"];

type Txn = {
  id: string;
  amount: number;
  type: "expense" | "income";
  category: string;
  payment_method: string;
  occurred_date: string;
  note: string | null;
};

type TInvocation = {
  toolName: string;
  toolCallId: string;
  state: string;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
};

type StatsResult = {
  total?: number;
  count?: number;
  byCategory?: { category: string; total: number; count: number }[];
};

function relDate(d?: string): string {
  if (!d) return "—";
  const t = new Date(d + "T00:00:00");
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((base.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff > 1 && diff < 7) return `周${"日一二三四五六"[t.getDay()]}`;
  return `${t.getMonth() + 1}月${t.getDate()}日`;
}

function fmtSign(t: Partial<Txn>): string {
  const sign = t.type === "income" ? "+" : "-";
  return `${sign}¥${(t.amount ?? 0).toFixed(2)}`;
}

type ChatView = {
  /** 切换会话时自增，强制重新挂载 Chat（useChat 的 messages 只在初始化生效） */
  key: number;
  sessionId: string | null;
  initialMessages: UIMessage[];
};

type MutableRef<T> = { current: T };

type ChatProps = {
  initialMessages: UIMessage[];
  sessionRef: MutableRef<string | null>;
  ledgerIdRef: MutableRef<string | null>;
  ledgerId: string | null;
  statsVersion: number;
  onSessionCreated: (id: string) => void;
  onMessagesSaved: () => void;
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { ledgerId } = useLedger();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [view, setView] = useState<ChatView>({
    key: 0,
    sessionId: null,
    initialMessages: [],
  });
  const sessionRef = useRef<string | null>(null);
  const ledgerIdRef = useRef<string | null>(null);

  useEffect(() => {
    ledgerIdRef.current = ledgerId;
  }, [ledgerId]);

  const newChat = useCallback(() => {
    sessionRef.current = null;
    setView((v) => ({ key: v.key + 1, sessionId: null, initialMessages: [] }));
    setDrawerOpen(false);
  }, []);

  const selectSession = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/chat/sessions/${id}`);
    const j = (await res.json()) as { messages?: UIMessage[]; error?: string };
    if (!res.ok) throw new Error(j.error ?? "读取会话失败");
    sessionRef.current = id;
    setView((v) => ({
      key: v.key + 1,
      sessionId: id,
      initialMessages: j.messages ?? [],
    }));
    setDrawerOpen(false);
  }, []);

  const onSessionCreated = useCallback((id: string) => {
    // 首次回复时惰性创建会话：只更新引用，不重新挂载，否则当前消息会丢失
    setView((v) => (v.sessionId === id ? v : { ...v, sessionId: id }));
    setHistoryVersion((n) => n + 1);
  }, []);

  const onMessagesSaved = useCallback(() => setHistoryVersion((n) => n + 1), []);

  return (
    <div className="relative min-h-screen bg-[#0B0D17] text-slate-100 antialiased">
      <div className="pointer-events-none fixed -left-20 -top-20 z-0 h-72 w-72 rounded-full bg-indigo-600/25 blur-[90px]" />
      <div className="pointer-events-none fixed -right-24 top-1/3 z-0 h-80 w-80 rounded-full bg-violet-600/20 blur-[90px]" />
      <div className="pointer-events-none fixed bottom-0 left-1/4 z-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-[90px]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[480px] flex-col border-x border-white/5 pb-52">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-white/5 bg-[#0B0D17]/70 px-4 py-3 backdrop-blur-xl">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/40">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1.5 text-[15px] font-bold">
              小账房 <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            </h1>
            <p className="truncate text-[11px] text-slate-400">一句话记账助手 · 在线</p>
          </div>
          <LedgerSwitcher />
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 active:scale-95"
            title="历史会话"
          >
            <History className="h-4 w-4" />
          </button>
        </header>

        {mounted ? (
          <Chat
            key={view.key}
            initialMessages={view.initialMessages}
            sessionRef={sessionRef}
            ledgerIdRef={ledgerIdRef}
            ledgerId={ledgerId}
            statsVersion={historyVersion}
            onSessionCreated={onSessionCreated}
            onMessagesSaved={onMessagesSaved}
          />
        ) : (
          <ChatPlaceholder />
        )}

        <ChatSessionDrawer
          open={drawerOpen}
          version={historyVersion}
          currentSessionId={view.sessionId}
          onClose={() => setDrawerOpen(false)}
          onNew={newChat}
          onSelect={selectSession}
        />

        <BottomNav active="chat" />
      </div>
    </div>
  );
}

function ChatPlaceholder() {
  return (
    <main className="flex-1 space-y-4 px-3 pt-4">
      <Row role="ai">
        <Bubble role="ai">
          你好，我是小账房 👋 跟我说一句话就能记账，也可以问我“最近花了多少”。
        </Bubble>
      </Row>
    </main>
  );
}

function Chat({
  initialMessages,
  sessionRef,
  ledgerIdRef,
  ledgerId,
  statsVersion,
  onSessionCreated,
  onMessagesSaved,
}: ChatProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  // 本次挂载时已有的消息 id：这些是历史消息，不允许显示「撤销」。
  // 新消息不在此集合中，撤销按钮保留到刷新或切换会话（组件重挂载）为止。
  const initialIds = useRef(new Set(initialMessages.map((m) => m.id)));

  /** 一轮回复结束后全量落库：首次回复时惰性创建会话 */
  const persist = useCallback(
    async (all: UIMessage[]) => {
      let sid = sessionRef.current;
      if (!sid) {
        const created = await apiFetch("/api/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ledger_id: ledgerIdRef.current }),
        });
        if (!created.ok) return;
        const cj = (await created.json()) as { session?: { id: string } };
        sid = cj.session?.id ?? null;
        if (!sid) return;
        sessionRef.current = sid;
        onSessionCreated(sid);
      }
      const saved = await apiFetch(`/api/chat/sessions/${sid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: all }),
      });
      if (saved.ok) onMessagesSaved();
    },
    [sessionRef, ledgerIdRef, onSessionCreated, onMessagesSaved],
  );

  const { messages, sendMessage, status, error, regenerate } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      fetch: apiFetch,
      // 每次请求都取最新账本 / 会话，切换账本无需重建 transport
      prepareSendMessagesRequest: ({ messages: msgs, body, id, trigger, messageId }) => ({
        body: {
          ...body,
          id,
          messages: msgs,
          trigger,
          messageId,
          ledgerId: ledgerIdRef.current,
          sessionId: sessionRef.current,
        },
      }),
    }),
    onFinish: ({ messages: all, isError, isDisconnect }) => {
      if (isError || isDisconnect) return;
      // 串行写入，避免快速连续回复时创建多个会话或后写覆盖先写
      saveQueue.current = saveQueue.current
        .then(() => persist(all))
        .catch(() => {});
    },
  });

  const recRef = useRef<{ start(): void; stop(): void } | null>(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, status]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || status === "submitted" || status === "streaming") return;

    // 登录态以服务端为准：页面本身由 proxy 守卫；会话中途失效时，
    // 请求返回 401，由 apiFetch 统一跳转登录页。
    // 不再用本地 getSession() 预判，避免「本地无会话但服务端可恢复」时被误踢走。
    setInput("");
    sendMessage({ text: t });
  };

  const startVoice = () => {
    const SR =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition;
    if (!SR) {
      submit("（当前浏览器不支持语音输入，请用文字）");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new (SR as new () => {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      start(): void;
      stop(): void;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
    })();
    rec.lang = "zh-CN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript ?? "";
      if (text.trim()) submit(text.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <>
      <main ref={scrollRef} className="flex-1 space-y-4 px-3 pt-4">
        {messages.length === 0 && (
          <Row role="ai">
            <Bubble role="ai">
              你好，我是小账房 👋 跟我说一句话就能记账，也可以问我“最近花了多少”。
            </Bubble>
          </Row>
        )}

        <StatsQuickList ledgerId={ledgerId} version={statsVersion} onQuery={submit} />

        {messages.map((m) => {
          const role = m.role === "user" ? "user" : "ai";
          const canUndo = !initialIds.current.has(m.id);
          // AI SDK 可能把同一段文字拆成多个连续 text part，合并后只渲染一个气泡
          const merged: typeof m.parts = [];
          for (const p of m.parts) {
            const last = merged[merged.length - 1];
            if (p.type === "text" && last?.type === "text") {
              merged[merged.length - 1] = { ...last, text: last.text + p.text } as typeof p;
            } else {
              merged.push(p);
            }
          }
          return (
            <Row key={m.id} role={role}>
              <div
                className={cn(
                  "flex min-w-0 flex-col gap-2",
                  role === "user" ? "max-w-[76%]" : "w-full max-w-[86%]",
                )}
              >
                {merged.map((part, i) => {
                  if (part.type === "text" && part.text) {
                    return (
                      <Bubble key={i} role={role}>
                        {part.text}
                      </Bubble>
                    );
                  }
                  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
                    // AI SDK v5 的 tool part 把工具名放在 type 里（tool-xxx），
                    // 没有 toolName 字段，需显式提取，否则 ToolCard 匹配不到。
                    const ti = {
                      ...(part as unknown as Omit<TInvocation, "toolName">),
                      toolName: part.type.slice(5),
                    } as TInvocation;
                    return <ToolCard key={i} ti={ti} canUndo={canUndo} />;
                  }
                  return null;
                })}
              </div>
            </Row>
          );
        })}

        {isBusy && (
          <Row role="ai">
            <div className="glass max-w-[76%] rounded-2xl rounded-bl-md px-4 py-3 text-[12px] text-slate-400">
              <LoaderCircle className="mr-1.5 inline h-3.5 w-3.5 animate-spin text-indigo-300" />
              小账房正在处理…
            </div>
          </Row>
        )}

        {status === "error" && (
          <Row role="ai">
            <div className="w-full rounded-2xl rounded-bl-md border border-rose-400/30 bg-rose-500/10 p-3.5">
              <div className="mb-2.5 flex items-center gap-2 text-[12px] text-rose-300">
                <TriangleAlert className="h-4 w-4 flex-none" />
                出错了：{error?.message ?? "网络或模型异常"}
              </div>
              <button
                onClick={() => regenerate()}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-4 py-1.5 text-[12px] font-semibold text-white shadow-lg shadow-rose-500/30 transition active:scale-95"
              >
                <RotateCw className="h-3 w-3" />
                重试
              </button>
            </div>
          </Row>
        )}
      </main>

      <div className="fixed bottom-[64px] left-1/2 z-20 w-full max-w-[480px] -translate-x-1/2 px-3 pb-3">
        <div className="glass rounded-2xl px-3 py-2.5 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="chips mb-2.5 flex gap-2 overflow-x-auto pb-1">
            <Chip icon={<PieChart className="h-3 w-3" />} label="本月花了多少" onClick={() => submit("本月花了多少")} />
            <Chip icon={<List className="h-3 w-3" />} label="最近5笔" onClick={() => submit("最近5笔")} />
            <Chip icon={<CalendarDays className="h-3 w-3" />} label="今天支出" onClick={() => submit("今天支出")} />
          </div>
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit(input);
              }}
              placeholder={listening ? "正在聆听，请说话…" : "跟我说一句话就能记账"}
              className="h-10 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-sm outline-none placeholder:text-slate-500 transition focus:border-indigo-400/60 focus:bg-white/10"
            />
            <button
              onPointerDown={startVoice}
              className={cn(
                "pulsering flex h-10 w-10 flex-none items-center justify-center rounded-full shadow-lg transition active:scale-95",
                listening
                  ? "animate-pulse bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/40"
                  : "bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/40",
              )}
              title={listening ? "正在聆听，点按停止" : "点按说话（语音记账）"}
            >
              <Mic className="h-4 w-4 text-white" />
            </button>
            <button
              onClick={() => submit(input)}
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/40 transition active:scale-95"
              title="发送"
            >
              <Send className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- 工具结果卡片 ---------- */

function ToolCard({ ti, canUndo }: { ti: TInvocation; canUndo: boolean }) {
  if (ti.state !== "output-available") {
    if (ti.state === "output-error") {
      return (
        <div className="glass w-full rounded-2xl rounded-bl-md p-3.5 text-[12px] text-rose-300">
          <TriangleAlert className="mr-1.5 inline h-3.5 w-3.5" />
          工具执行失败：{ti.errorText ?? "未知错误"}
        </div>
      );
    }
    const label =
      ti.toolName === "add_transaction"
        ? "记账"
        : ti.toolName === "list_transactions"
          ? "查账"
          : ti.toolName === "query_stats"
            ? "统计"
            : ti.toolName === "update_transaction"
              ? "修改"
              : "删除";
    return (
      <div className="glass w-full rounded-2xl rounded-bl-md p-3.5 text-[12px] text-slate-400">
        <LoaderCircle className="mr-1.5 inline h-3.5 w-3.5 animate-spin text-indigo-300" />
        {label}中…
      </div>
    );
  }

  switch (ti.toolName) {
    case "add_transaction":
      return <RecordCard txn={ti.output as Txn} status="已入账" tone="emerald" canUndo={canUndo} />;
    case "update_transaction": {
      const r = ti.output as Partial<Txn>;
      if (r.category && r.amount != null) {
        return <RecordCard txn={r} status="已修改" tone="indigo" />;
      }
      return <StatusCard text="已修改该笔账单" tone="indigo" />;
    }
    case "delete_transaction":
      return <StatusCard text="已删除该笔账单" tone="rose" />;
    case "list_transactions":
      return <BillListCard data={ti.output as { transactions: Txn[] }} />;
    case "query_stats":
      return <StatsCard data={ti.output as StatsResult} />;
    default:
      return null;
  }
}

function RecordCard({
  txn,
  status,
  tone,
  canUndo = false,
}: {
  txn: Partial<Txn>;
  status: string;
  tone: "emerald" | "indigo";
  canUndo?: boolean;
}) {
  const meta = CAT_META[txn.category ?? "其他"] ?? CATS_FALLBACK;
  const Icon = meta.Icon;
  return (
    <div className="glass w-full rounded-2xl rounded-bl-md p-3.5 shadow-xl shadow-black/20">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-gradient-to-br shadow-lg shadow-black/20", meta.grad)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{txn.category ?? "其他"}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            {txn.payment_method ?? "其他"} · {relDate(txn.occurred_date)}
          </div>
          {txn.note && <div className="truncate text-[11px] text-slate-500">{txn.note}</div>}
        </div>
        <div className="flex-none text-right">
          <div
            className={cn(
              "text-xl font-extrabold tabular-nums",
              txn.type === "income" ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {fmtSign(txn)}
          </div>
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
              tone === "emerald"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-indigo-400/30 bg-indigo-400/10 text-indigo-300",
            )}
          >
            {tone === "emerald" && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            )}
            {tone === "indigo" && <Pencil className="h-2.5 w-2.5" />}
            {status}
          </span>
        </div>
      </div>
      {tone === "emerald" && txn.id && canUndo && <RecordUndo id={txn.id} />}
    </div>
  );
}

function RecordUndo({ id }: { id: string }) {
  const [hidden, setHidden] = useState(false);

  const undo = async () => {
    try {
      // 统一走 apiFetch，未登录时也能自动跳登录（此前裸 fetch 会静默 401）
      await apiFetch(`/api/transactions/${id}`, { method: "DELETE" });
    } catch {
      /* 忽略 */
    } finally {
      setHidden(true);
    }
  };

  if (hidden) return null;
  return (
    <div className="mt-3 flex justify-end border-t border-dashed border-white/10 pt-2.5">
      <button
        onClick={undo}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-300 transition hover:bg-white/10 active:scale-95"
      >
        <Undo2 className="h-3 w-3" />
        撤销
      </button>
    </div>
  );
}

function StatusCard({ text, tone }: { text: string; tone: "rose" | "indigo" | "emerald" }) {
  return (
    <div
      className={cn(
        "glass w-full rounded-2xl rounded-bl-md p-3.5 text-sm",
        tone === "rose"
          ? "text-rose-300"
          : tone === "indigo"
            ? "text-indigo-300"
            : "text-emerald-300",
      )}
    >
      {text}
    </div>
  );
}

function BillListCard({ data }: { data: { transactions: Txn[] } }) {
  const list = data.transactions ?? [];
  const total = list.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
  return (
    <div className="glass w-full rounded-2xl rounded-bl-md p-3.5 shadow-xl shadow-black/20">
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5 font-medium text-slate-300">
          <Receipt className="h-3.5 w-3.5 text-indigo-300" />
          最近 {list.length} 笔账单
        </span>
        <span className="tabular-nums">
          {total < 0 ? "-" : "+"}¥{Math.abs(total).toFixed(2)}
        </span>
      </div>
      <div className="max-h-[260px] space-y-0 overflow-y-auto">
        {list.map((t) => {
          const meta = CAT_META[t.category] ?? CATS_FALLBACK;
          const Icon = meta.Icon;
          return (
            <BillRow
              key={t.id}
              icon={<Icon className="h-3.5 w-3.5 text-slate-300" />}
              iconBg={meta.bg}
              title={t.note || t.category}
              sub={`${t.payment_method} · ${relDate(t.occurred_date)}`}
              amount={fmtSign(t)}
            />
          );
        })}
      </div>
    </div>
  );
}

function StatsCard({ data }: { data: StatsResult }) {
  const byCat = data.byCategory ?? [];
  const total = data.total ?? 0;
  return (
    <div className="glass w-full rounded-2xl rounded-bl-md p-3.5 shadow-xl shadow-black/20">
      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5 font-medium text-slate-300">
          <PieChart className="h-3.5 w-3.5 text-indigo-300" />
          消费统计
        </span>
        <span>{data.count ?? 0} 笔</span>
      </div>
      <div className="mb-3 text-[26px] font-extrabold leading-tight tabular-nums gtext">
        ¥{total.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className="space-y-2.5">
        {byCat.map((c) => {
          const meta = CAT_META[c.category] ?? CATS_FALLBACK;
          const Icon = meta.Icon;
          const pct = Math.round((c.total / (total || 1)) * 100);
          return (
            <BarRow
              key={c.category}
              icon={<Icon className="h-3 w-3 text-slate-300" />}
              label={c.category}
              value={`¥${c.total.toFixed(0)} · ${pct}%`}
              width={`${pct}%`}
              fill={meta.fill}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ---------- 内部小组件 ---------- */

function Row({ role, children }: { role: "user" | "ai"; children: ReactNode }) {
  return (
    <div className={cn("flex items-end gap-2", role === "user" && "justify-end")}>
      {role === "ai" && <AvBot />}
      {children}
      {role === "user" && <AvUser />}
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "ai"; children: ReactNode }) {
  if (role === "user") {
    return (
      <div className="w-full rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-lg shadow-indigo-600/30">
        {children}
      </div>
    );
  }
  // AI 文字也用卡片呈现，与工具卡片视觉统一
  return (
    <div className="glass w-full overflow-hidden rounded-2xl rounded-bl-md border border-white/10 shadow-xl shadow-black/20">
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/5 px-3.5 py-2">
        <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
        <span className="text-[11px] font-medium text-slate-300">小账房</span>
      </div>
      <div className="px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-200">
        {children}
      </div>
    </div>
  );
}

function AvBot() {
  return (
    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/30">
      <Bot className="h-4 w-4 text-white" />
    </div>
  );
}

function AvUser() {
  return (
    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/10">
      <User className="h-4 w-4 text-slate-300" />
    </div>
  );
}

function Chip({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex flex-none items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-[12px] text-indigo-300 transition hover:bg-indigo-500/20"
    >
      {icon}
      {label}
    </button>
  );
}

function BillRow({
  icon,
  iconBg,
  title,
  sub,
  amount,
}: {
  icon: ReactNode;
  iconBg: string;
  title: string;
  sub: string;
  amount: string;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-white/5 py-2 last:border-0">
      <div className={cn("flex h-8 w-8 flex-none items-center justify-center rounded-lg", iconBg)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px]">{title}</div>
        <div className="text-[10px] text-slate-500">{sub}</div>
      </div>
      <div className="text-[13px] font-bold tabular-nums text-rose-400">{amount}</div>
    </div>
  );
}

function BarRow({
  icon,
  label,
  value,
  width,
  fill,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  width: string;
  fill: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12px]">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={cn("h-full rounded-full bg-gradient-to-r", fill)} style={{ width }} />
      </div>
    </div>
  );
}

