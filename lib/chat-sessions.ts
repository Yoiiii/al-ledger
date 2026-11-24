import { requireUserId } from "@/lib/supabase/require-user";
import type { UIMessage } from "ai";

export type ChatSession = {
  id: string;
  user_id: string;
  ledger_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
};

/** 会话列表（最近更新在前） */
export async function listSessions(): Promise<ChatSession[]> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, user_id, ledger_id, title, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ChatSession[];
}

export async function createSession(ledgerId?: string | null): Promise<ChatSession> {
  const { supabase, userId } = await requireUserId();
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ user_id: userId, ledger_id: ledgerId ?? null })
    .select("id, user_id, ledger_id, title, created_at, updated_at")
    .single();
  if (error) throw error;
  return data as ChatSession;
}

/** 读取某会话的完整 UIMessage 历史（用于 useChat 的初始 messages） */
export async function getSessionMessages(sessionId: string): Promise<UIMessage[]> {
  const { supabase } = await requireUserId();
  const { data: session, error: sErr } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!session) throw new Error("NOT_FOUND");

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, parts")
    .eq("session_id", sessionId)
    .order("seq", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((r: Record<string, unknown>) => {
    const row = r as { id: string; role: string; parts: unknown };
    return {
      id: row.id,
      role: row.role as UIMessage["role"],
      parts: (Array.isArray(row.parts) ? row.parts : []) as UIMessage["parts"],
    } as UIMessage;
  });
}

/** 原子替换会话消息（服务端校验归属，一次调用完成删旧+写新） */
export async function saveSessionMessages(
  sessionId: string,
  messages: UIMessage[],
): Promise<void> {
  const { supabase } = await requireUserId();
  const payload = messages.map((m) => ({ role: m.role, parts: m.parts }));
  const { error } = await supabase.rpc("replace_chat_messages", {
    p_session_id: sessionId,
    p_messages: payload,
  });
  if (error) throw error;
}

export async function renameSession(id: string, title: string): Promise<void> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("chat_sessions")
    .update({ title })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND");
}

export async function deleteSession(id: string): Promise<void> {
  const { supabase } = await requireUserId();
  const { data, error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND");
}
