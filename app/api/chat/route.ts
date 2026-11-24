import { createOpenAI } from "@ai-sdk/openai";
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from "ai";
import { createTools } from "@/lib/tools";
import { requireUserId } from "@/lib/supabase/require-user";
import { assertLedgerAccess } from "@/lib/ledgers";
import { isUuid } from "@/lib/api-validation";

export const maxDuration = 30;

const SYSTEM = `你是「小账房」，一个个人记账助手。用户会用自然语言记账或询问消费情况。

## 记账规则
1. 用户表达记账意图时，必须调用 add_transaction 工具，禁止只口头确认不落库。
2. 金额一律为正数，单位元；支出 type=expense，收入（工资、红包等）type=income。
3. 日期规则：用户说"今天/昨天/前天/上周五/3号"时，换算为 YYYY-MM-DD。当前时间：{{currentTime}}。用户未提及日期时默认今天。
4. 分类只能从以下选择：餐饮、交通、购物、居住、娱乐、医疗、教育、通讯、人情、其他。无法判断时选"其他"，并明确告知用户。
5. 支付方式只能从以下选择：微信、支付宝、银行卡、现金、其他。未提及默认"其他"。
6. 备注存原话中的关键信息（如"午饭""打车去机场"），不要自行扩写。

## 查询与统计规则
7. 涉及账单查询必须调用 list_transactions，涉及汇总必须调用 query_stats。基于工具返回的数据回答，严禁编造或心算大数。
8. 查询结果由卡片展示，文字只给一句简短结论（如"这是最近的账单"或"本月餐饮最多"），不要在文字里罗列金额明细。

## 交互规则
9. 记账成功后，文字只回复一句简短确认（如"已记好"），不要复述金额、分类、支付方式、日期——这些数据已由卡片展示，重复会显得啰嗦。
10. 用户说"刚才那笔错了/改成…"时，先调 list_transactions 确认是哪笔，再调 update_transaction 或 delete_transaction。
11. 回答简洁直白，不要寒暄，不要重复用户原话。金额格式 ¥xx.xx。
12. 用户输入与记账无关的内容时，礼貌拉回："我是记账助手，跟我说一句话就能记账～"`;

export async function POST(req: Request) {
  // 登录校验必须放在最前面：否则未配置模型 key 时，未登录请求会拿到 200。
  try {
    await requireUserId();
  } catch {
    return new Response("未登录，请先登录后再记账", { status: 401 });
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return new Response(
      "未配置 DEEPSEEK_API_KEY，无法调用大模型。请在 .env.local 中配置后重启。",
      { status: 200 },
    );
  }

  let messages: UIMessage[];
  let ledgerId: string | undefined;
  try {
    const json = (await req.json()) as {
      messages?: unknown;
      ledgerId?: unknown;
      sessionId?: unknown;
    };
    if (!Array.isArray(json.messages) || json.messages.length === 0) {
      return new Response("messages 不能为空", { status: 400 });
    }
    messages = json.messages as UIMessage[];
    // sessionId 仅用于前端保存历史，服务端不需要读取；账本必须校验格式与归属
    if (json.ledgerId !== undefined && json.ledgerId !== null) {
      if (!isUuid(json.ledgerId))
        return new Response("ledgerId 不是合法 UUID", { status: 400 });
      ledgerId = json.ledgerId;
    }
  } catch {
    return new Response("请求体不是合法 JSON", { status: 400 });
  }

  // 账本由请求上下文注入，工具层不信任模型传参
  if (ledgerId) {
    try {
      await assertLedgerAccess(ledgerId);
    } catch {
      return new Response("无权访问该账本", { status: 403 });
    }
  }

  try {
    const deepseek = createOpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    });

    const result = streamText({
      model: deepseek("deepseek-chat"),
      system: SYSTEM.replace(
        "{{currentTime}}",
        new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
      ),
      messages: await convertToModelMessages(messages),
      tools: createTools(ledgerId),
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse();
  } catch {
    return new Response("模型调用失败，请稍后重试", { status: 500 });
  }
}
