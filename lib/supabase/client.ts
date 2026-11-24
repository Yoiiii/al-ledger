import { createBrowserClient } from "@supabase/ssr";

/**
 * 浏览器端 Supabase 客户端：会话写入 cookie（@supabase/ssr 默认行为），
 * 服务端 proxy / Route Handler 可以直接读取，页面守卫因此在服务端完成。
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
