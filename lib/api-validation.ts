export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && UUID_RE.test(v);

export const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && ISO_DATE_RE.test(v);

/** 把数据层异常转成 {status, message}；未识别的返回 null 交由调用方兜底 500 */
export function toHttpError(e: unknown): { status: number; message: string } | null {
  // PostgREST / Auth 的错误常是普通对象而非 Error 实例，不能只认 instanceof
  const err = (e ?? null) as {
    message?: unknown;
    code?: string;
    cause?: { code?: string; message?: string };
  } | null;
  const message = typeof err?.message === "string" ? err.message : "";
  if (!message && !(e instanceof Error)) return null;

  if (message === "UNAUTHENTICATED") return { status: 401, message: "未登录" };
  // 本地判定不再刷新 token；过期时由 PostgREST 返回，前端据此重新登录
  if (/jwt expired|invalid jwt|token is expired|expired token/i.test(message))
    return { status: 401, message: "登录已过期，请重新登录" };
  if (message === "NOT_FOUND") return { status: 404, message: "记录不存在" };
  if (message === "FORBIDDEN") return { status: 403, message: "无权操作" };
  const code = err?.code;
  if (code === "23503") return { status: 400, message: "关联数据不存在" };
  if (code === "23505") return { status: 409, message: "记录已存在" };
  if (code === "23514") return { status: 400, message: "数据不符合约束" };
  if (code === "22P02") return { status: 400, message: "ID 格式不合法" };
  // PostgREST / PLpgSQL 抛出的业务异常
  if (/无权|不存在|不能移除|未找到|邮箱/.test(message))
    return { status: 400, message };
  // 服务端出站被阻断（TLS 重置 / DNS / 代理不可用）：给出可排查的提示，
  // 不要伪装成 401，否则前端会误判为未登录并反复跳登录页。
  const net = `${message} ${err?.cause?.code ?? ""} ${err?.cause?.message ?? ""}`;
  if (
    /fetch failed|failed to fetch|ECONNRESET|ENOTFOUND|EAI_AGAIN|UND_ERR|SSL|TLS|socket hang up/i.test(
      net,
    )
  )
    return {
      status: 503,
      message: "服务端无法连接 Supabase，请检查服务器网络或 HTTPS_PROXY 代理配置",
    };
  return null;
}
