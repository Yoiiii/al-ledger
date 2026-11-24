/**
 * 可选的服务端出站代理。
 *
 * 架构本来就是「网页端 -> Next API 路由 -> Supabase」，业务数据全部由服务端
 * 访问 Supabase。浏览器里能通、Node 进程却被 TLS 重置时，说明出站路径不同
 * （浏览器走 ECH / 代理扩展，服务端直连）。在 .env.local 配置代理即可让
 * Node 进程的 fetch 走同一出口：
 *
 *   HTTPS_PROXY=http://127.0.0.1:7890
 *   NO_PROXY=localhost,127.0.0.1
 *
 * 未配置代理时本文件不做任何事，不影响正常直连环境。
 * 只在代理软件确实运行时配置，否则服务端请求会全部打到不存在的端口。
 *
 * 注意：不要在顶层 import node:* 模块，否则 Edge Runtime 编译时会报警告。
 * 这里用 process.getBuiltinModule 在 register() 内按需获取，且只在 Node.js
 * runtime 执行。
 */
type UndiciProxy = {
  EnvHttpProxyAgent: new () => unknown;
  setGlobalDispatcher: (dispatcher: unknown) => void;
};

type RequireFn = ((id: string) => unknown) & { resolve: (id: string) => string };
type NodeModuleApi = { createRequire: (path: string) => RequireFn };

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const proxy =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy ??
    process.env.ALL_PROXY ??
    process.env.all_proxy;
  if (!proxy) {
    console.info("[proxy] 服务端出站：直连（未配置 HTTPS_PROXY）");
    return;
  }
  if (/^socks/i.test(proxy)) {
    console.warn("[proxy] 仅支持 HTTP/HTTPS 代理；SOCKS 请使用 http 端口或全局 TUN 模式");
    return;
  }
  // 本地回环请求（Next 内部请求 / localhost API）不能被代理接管
  for (const key of ["NO_PROXY", "no_proxy"]) {
    if (!process.env[key]) process.env[key] = "localhost,127.0.0.1,::1";
  }

  try {
    const getBuiltinModule = (
      process as unknown as { getBuiltinModule?: (id: string) => NodeModuleApi | undefined }
    ).getBuiltinModule;
    const nodeModule = getBuiltinModule?.("node:module");
    if (!nodeModule) {
      console.warn("[proxy] 当前 Node 版本不支持 getBuiltinModule，跳过代理配置");
      return;
    }
    // 复用 Next 自带的 undici，避免新增依赖、避免重装整个依赖树
    const rootRequire = nodeModule.createRequire(process.cwd() + "/package.json");
    const nextPackage = rootRequire.resolve("next/package.json");
    const undici = nodeModule.createRequire(nextPackage)("undici") as UndiciProxy;
    undici.setGlobalDispatcher(new undici.EnvHttpProxyAgent());
    console.info(`[proxy] 服务端出站请求已启用代理：${proxy}`);
  } catch (e) {
    console.warn("[proxy] 服务端代理启用失败，将继续尝试直连：", e);
  }
}
