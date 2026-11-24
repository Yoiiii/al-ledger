import { tool } from "ai";
import { z } from "zod";
import {
  createTransaction,
  listTransactions,
  updateTransaction,
  deleteTransaction,
  getStats,
  MAX_AMOUNT,
  type TransactionInput,
} from "@/lib/transactions";

const CATEGORIES = [
  "餐饮",
  "交通",
  "购物",
  "居住",
  "娱乐",
  "医疗",
  "教育",
  "通讯",
  "人情",
  "其他",
] as const;
const PAYMENTS = ["微信", "支付宝", "银行卡", "现金", "其他"] as const;
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "格式应为 YYYY-MM-DD");
const UUID = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "应为 UUID",
);

/**
 * 按当前账本构建工具集。账本由服务端从请求上下文注入，不暴露给模型，
 * 避免模型自行传入 ledgerId 造成跨账本写入。
 */
export function createTools(ledgerId?: string | null) {
  const scope = ledgerId ?? undefined;

  return {
    add_transaction: tool({
      description: "记录一笔收入或支出，自动写入当前账本。金额一律为正数，单位元。",
      inputSchema: z.object({
        // 与 DB 的 check (amount < 1000000) 一致，避免边界值被 DB 拒绝后报 500
        amount: z.number().positive().lt(MAX_AMOUNT),
        type: z.enum(["expense", "income"]).default("expense"),
        category: z.enum(CATEGORIES),
        paymentMethod: z.enum(PAYMENTS).default("其他"),
        date: DATE,
        note: z.string().max(500).optional(),
      }),
      execute: async ({ amount, type, category, paymentMethod, date, note }) => {
        const t = await createTransaction({
          amount,
          type,
          category,
          payment_method: paymentMethod,
          occurred_date: date,
          note: note ?? null,
          source: "ai",
          ...(scope ? { ledger_id: scope } : {}),
        });
        return {
          ok: true,
          id: t.id,
          amount: t.amount,
          type: t.type,
          category: t.category,
          payment_method: t.payment_method,
          occurred_date: t.occurred_date,
          note: t.note,
        };
      },
    }),

    list_transactions: tool({
      description: "按条件查询当前账本的账单列表，默认最近在前。",
      inputSchema: z.object({
        limit: z.number().int().positive().max(100).default(10),
        startDate: DATE.optional(),
        endDate: DATE.optional(),
        category: z.enum(CATEGORIES).optional(),
        orderBy: z.enum(["date_desc", "date_asc"]).default("date_desc"),
      }),
      execute: async (args) => {
        const list = await listTransactions({ ...args, ledgerId: scope });
        return {
          count: list.length,
          transactions: list.map((t) => ({
            id: t.id,
            amount: t.amount,
            type: t.type,
            category: t.category,
            payment_method: t.payment_method,
            occurred_date: t.occurred_date,
            note: t.note,
          })),
        };
      },
    }),

    query_stats: tool({
      description: "按时间段汇总当前账本的消费，返回总额与分类分解。",
      inputSchema: z.object({
        period: z.enum(["today", "week", "month", "custom"]),
        startDate: DATE.optional(),
        endDate: DATE.optional(),
        type: z.enum(["expense", "income"]).default("expense"),
      }),
      execute: async (args) => await getStats({ ...args, ledgerId: scope }),
    }),

    update_transaction: tool({
      description: "按 id 修改一笔账单（金额/分类/支付方式/日期/备注）。",
      inputSchema: z.object({
        id: UUID,
        amount: z.number().positive().lt(MAX_AMOUNT).optional(),
        type: z.enum(["expense", "income"]).optional(),
        category: z.enum(CATEGORIES).optional(),
        paymentMethod: z.enum(PAYMENTS).optional(),
        date: DATE.optional(),
        note: z.string().max(500).optional(),
      }),
      execute: async ({ id, ...rest }) => {
        const patch: Partial<TransactionInput> = {};
        if (rest.amount !== undefined) patch.amount = rest.amount;
        if (rest.type !== undefined) patch.type = rest.type;
        if (rest.category !== undefined) patch.category = rest.category;
        if (rest.paymentMethod !== undefined) patch.payment_method = rest.paymentMethod;
        if (rest.date !== undefined) patch.occurred_date = rest.date;
        if (rest.note !== undefined) patch.note = rest.note;
        const t = await updateTransaction(id, patch);
        return { ok: true, id: t.id, ...patch };
      },
    }),

    delete_transaction: tool({
      description: "按 id 删除一笔账单（软删除，可恢复）。",
      inputSchema: z.object({ id: UUID }),
      execute: async ({ id }) => {
        await deleteTransaction(id);
        return { ok: true, id };
      },
    }),
  };
}

/** 不带账本作用域的工具集（兼容旧调用；新代码请用 createTools(ledgerId)） */
export const tools = createTools();
