-- ============================================================
-- 「一句话记账」AI Agent — Supabase 全量表结构（多用户 / 多账本版）
--
-- 用法：Supabase 控制台 → SQL Editor 全选执行，或 `supabase db push`。
-- 本脚本【可重复执行】：开头按依赖清理本脚本管理的对象，再全量重建。
-- ⚠ 会清空 public 下的业务表数据（auth.users 不受影响）。全新库直接执行即可；
--   已有库会重建业务表，但脚本末尾会为已存在的用户回填 profile/账本/字典。
--
-- 覆盖需求：多用户、多账本与共享协作、账单 CRUD/软删/审计、自定义分类与支付方式、
--   标签、预算与超支提醒、定期记账、小票 OCR、报表导出、AI 会话历史、统计聚合。
-- ============================================================

-- 0) 幂等清理 -------------------------------------------------
-- 先删函数（用 oid 签名，避免引用将被删除的参数类型）
do $do$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'tx_stats', 'tx_daily_trend', 'budget_usage',
        'is_ledger_member', 'is_ledger_admin', 'can_access_transaction',
        'setup_user_defaults', 'handle_new_user', 'set_updated_at',
        'set_transaction_defaults', 'log_transaction_revision',
        'invite_ledger_member', 'remove_ledger_member',
        'replace_chat_messages'
      )
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end
$do$;

drop view if exists public.v_transactions_active cascade;

drop table if exists
  public.transaction_tags,
  public.transaction_revisions,
  public.chat_messages,
  public.chat_sessions,
  public.exports,
  public.notifications,
  public.budgets,
  public.transactions,
  public.recurring_rules,
  public.receipts,
  public.tags,
  public.payment_methods,
  public.categories,
  public.ledger_members,
  public.ledgers,
  public.profiles
cascade;

do $do$
declare r record;
begin
  for r in
    select t.typname
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e'
      and t.typname in (
        'transaction_type', 'ledger_role', 'budget_period', 'txn_source',
        'export_format', 'export_status', 'ocr_status',
        'recurring_frequency', 'notification_kind'
      )
  loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;
end
$do$;

-- 1) 枚举（只保留稳定的英文枚举；中文分类/支付方式改字典表）----
create type public.transaction_type   as enum ('expense', 'income');
create type public.ledger_role        as enum ('owner', 'editor', 'viewer');
create type public.budget_period      as enum ('week', 'month', 'year', 'custom');
create type public.txn_source         as enum ('ai', 'voice', 'manual', 'ocr', 'recurring', 'import');
create type public.export_format      as enum ('csv', 'xlsx', 'pdf', 'png');
create type public.export_status      as enum ('pending', 'running', 'done', 'failed');
create type public.ocr_status         as enum ('pending', 'running', 'done', 'failed');
create type public.recurring_frequency as enum ('daily', 'weekly', 'monthly', 'yearly');
create type public.notification_kind as enum ('budget_alert', 'system');

-- 2) profiles：用户资料与偏好（与 auth.users 1:1）--------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  nickname            text,
  email               text,
  avatar_url          text,
  currency            char(3)  not null default 'CNY',
  timezone            text     not null default 'Asia/Shanghai',
  week_start          smallint not null default 1 check (week_start between 1 and 7),
  default_ledger_id   uuid,   -- 不加 FK：避免与 ledgers 循环依赖，由 setup_user_defaults 维护
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 3) ledgers：账本（每个用户至少一个个人默认账本，可共享）------
create table public.ledgers (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  name          text not null default '默认账本',
  currency      char(3) not null default 'CNY',
  is_personal   boolean not null default true,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ledgers_name_len check (char_length(name) between 1 and 40),
  constraint ledgers_currency check (currency ~ '^[A-Z]{3}$')
);
create index idx_ledgers_owner on public.ledgers (owner_id);

-- 4) ledger_members：账本成员 / 共享协作 ----------------------
create table public.ledger_members (
  ledger_id   uuid not null references public.ledgers (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.ledger_role not null default 'editor',
  invited_by  uuid references auth.users (id) on delete set null,
  joined_at   timestamptz not null default now(),
  primary key (ledger_id, user_id)
);
create index idx_ledger_members_user on public.ledger_members (user_id);

-- 5) categories：分类字典（每个用户一套，支出/收入可各自独立）----
create table public.categories (
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         public.transaction_type not null,
  name         text not null,
  icon         text,
  color        text,
  sort_order   smallint not null default 0,
  is_system    boolean not null default false,   -- 系统预设（注册时 seed）
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, kind, name),
  constraint categories_name_len check (char_length(name) between 1 and 24)
);

-- 6) payment_methods：支付方式字典 ---------------------------
create table public.payment_methods (
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  icon         text,
  sort_order   smallint not null default 0,
  is_system    boolean not null default false,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, name),
  constraint payment_methods_name_len check (char_length(name) between 1 and 24)
);

-- 7) tags：用户自定义标签 ------------------------------------
create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- 8) receipts：小票 OCR（文件放 Storage，元数据入库）----------
create table public.receipts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  ledger_id       uuid references public.ledgers (id) on delete set null,
  storage_bucket  text not null default 'receipts',
  storage_path    text not null,
  mime_type       text,
  byte_size       bigint check (byte_size is null or byte_size >= 0),
  ocr_status      public.ocr_status not null default 'pending',
  ocr_text        text,
  ocr_result      jsonb,
  ocr_error       text,
  transaction_id  uuid,  -- FK 在 transactions 建好后补，避免循环依赖
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 9) recurring_rules：定期记账模板 ---------------------------
create table public.recurring_rules (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  ledger_id       uuid not null references public.ledgers (id) on delete cascade,
  kind            public.transaction_type not null default 'expense',
  amount          numeric(12, 2) not null check (amount > 0 and amount < 1000000),
  currency        char(3) not null default 'CNY',
  category        text not null,
  payment_method  text not null default '其他',
  note            text,
  frequency       public.recurring_frequency not null default 'monthly',
  interval_n      smallint not null default 1 check (interval_n between 1 and 31),
  day_of_month    smallint check (day_of_month between 1 and 31),
  next_run_date   date not null,
  last_run_date   date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint recurring_category_fk foreign key (user_id, kind, category)
    references public.categories (user_id, kind, name),
  constraint recurring_payment_fk foreign key (user_id, payment_method)
    references public.payment_methods (user_id, name) 
);

-- 10) transactions：记账流水（核心表）------------------------
-- 对外契约保持兼容：amount / type / category / payment_method / occurred_date / note
create table public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  ledger_id          uuid not null references public.ledgers (id) on delete cascade,
  amount             numeric(12, 2) not null check (amount > 0 and amount < 1000000),
  currency           char(3) not null default 'CNY',
  type               public.transaction_type not null default 'expense',
  category           text not null,
  payment_method     text not null default '其他',
  occurred_date      date not null,
  note               text,
  raw_text           text,                         -- 用户原话，便于重解析/审计
  source             public.txn_source not null default 'manual',
  client_request_id  uuid,                        -- 幂等键：防 LLM 重试重复记账
  recurring_rule_id  uuid references public.recurring_rules (id) on delete set null,
  created_by         uuid not null references auth.users (id) on delete cascade,
  deleted_at         timestamptz,                 -- 软删（撤销可恢复）
  deleted_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- 分类/支付方式必须存在于该用户的字典里（替代旧的 PG 中文 enum，可自由扩展）
  constraint txn_category_fk foreign key (user_id, type, category)
    references public.categories (user_id, kind, name),
  constraint txn_payment_fk foreign key (user_id, payment_method)
    references public.payment_methods (user_id, name),
  constraint txn_currency    check (currency ~ '^[A-Z]{3}$'),
  constraint txn_note_len    check (note is null or char_length(note) <= 500),
  constraint txn_date_range  check (occurred_date between date '2000-01-01' and date '2100-12-31')
);

alter table public.receipts
  add constraint receipts_transaction_fk
  foreign key (transaction_id) references public.transactions (id) on delete set null;

-- 索引：列表、统计、分类、软删过滤、幂等
create index idx_txn_user_date        on public.transactions (user_id, occurred_date desc, created_at desc) where deleted_at is null;
create index idx_txn_ledger_date      on public.transactions (ledger_id, occurred_date desc) where deleted_at is null;
create index idx_txn_user_type_date   on public.transactions (user_id, type, occurred_date desc) where deleted_at is null;
create index idx_txn_user_cat_date    on public.transactions (user_id, category, occurred_date desc) where deleted_at is null;
create index idx_txn_recurring        on public.transactions (recurring_rule_id) where recurring_rule_id is not null;
create unique index uq_txn_client_request
  on public.transactions (user_id, client_request_id) where client_request_id is not null;

-- 11) transaction_tags：账单 ↔ 标签 --------------------------
create table public.transaction_tags (
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  tag_id         uuid not null references public.tags (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (transaction_id, tag_id)
);

-- 12) transaction_revisions：改前/改后审计（PRD §3.3）---------
-- 刻意不设 txn_id 外键：物理删除账单后审计历史仍需保留（否则 after delete 触发器
-- 也会因父行已删而违反外键）。改用冗余 owner_id 做归属与 RLS 隔离。
create table public.transaction_revisions (
  id          bigserial primary key,
  txn_id      uuid not null,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  operation   text not null check (operation in ('insert', 'update', 'delete', 'restore')),
  snapshot    jsonb not null,
  changed_by  uuid references auth.users (id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index idx_txn_revisions_txn on public.transaction_revisions (txn_id, changed_at desc);

-- 13) budgets：预算与超支提醒 -------------------------------
create table public.budgets (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  ledger_id        uuid references public.ledgers (id) on delete cascade,
  kind             public.transaction_type not null default 'expense',
  category         text,                       -- null = 账本总预算
  period           public.budget_period not null default 'month',
  start_date       date not null,
  end_date         date,
  amount           numeric(12, 2) not null check (amount > 0),
  alert_threshold  numeric(4, 3) not null default 0.800 check (alert_threshold between 0 and 1),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint budgets_range check (end_date is null or end_date >= start_date),
  constraint budgets_category_fk foreign key (user_id, kind, category)
    references public.categories (user_id, kind, name)
);
create index idx_budgets_user on public.budgets (user_id, is_active);

-- 14) notifications：提醒（预算超支 / 系统）-------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        public.notification_kind not null default 'budget_alert',
  title       text not null,
  body        text,
  data        jsonb,
  budget_id   uuid references public.budgets (id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index idx_notifications_user on public.notifications (user_id, read_at, created_at desc);

-- 15) exports：月度报表导出任务 ------------------------------
create table public.exports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  ledger_id       uuid references public.ledgers (id) on delete set null,
  format          public.export_format not null default 'xlsx',
  status          public.export_status not null default 'pending',
  period_start    date not null,
  period_end      date not null,
  storage_bucket  text default 'exports',
  storage_path    text,
  error           text,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz,
  constraint exports_range check (period_end >= period_start)
);

-- 16) chat_sessions / chat_messages：AI 会话持久化（刷新不丢历史）-
create table public.chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  ledger_id   uuid references public.ledgers (id) on delete set null,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_chat_sessions_user on public.chat_sessions (user_id, updated_at desc);

create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.chat_sessions (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system', 'tool')),
  parts           jsonb not null default '[]'::jsonb,  -- UIMessage parts
  seq             integer not null default 0,          -- 会话内的消息顺序（同一事务内 created_at 相同）
  tool_invocations jsonb,
  input_tokens    integer,
  output_tokens   integer,
  created_at      timestamptz not null default now()
);
create index idx_chat_messages_session on public.chat_messages (session_id, seq);

-- 17) 视图：活跃账单（供报表/BI 使用，保留 RLS）---------------
-- security_invoker 需要 PG 15+（Supabase 现行版本均支持）。用异常兜底，
-- 避免旧版 PG 因视图语法失败而中断整个建表脚本；程序本身不依赖该视图
-- （数据层统一用 deleted_at is null 显式过滤）。
do $do$
begin
  execute 'create view public.v_transactions_active with (security_invoker = true) '
       || 'as select * from public.transactions where deleted_at is null';
exception when others then
  raise notice '跳过 v_transactions_active（需 PG 15+）: %', sqlerrm;
end
$do$;

-- 18) 基础函数 -----------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- 账本访问权限：security definer 绕过 RLS，避免策略互相递归
create or replace function public.is_ledger_member(p_ledger_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from public.ledger_members m
    where m.ledger_id = p_ledger_id and m.user_id = auth.uid()
  );
$fn$;

create or replace function public.is_ledger_admin(p_ledger_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from public.ledger_members m
    where m.ledger_id = p_ledger_id and m.user_id = auth.uid()
      and m.role in ('owner'::public.ledger_role, 'editor'::public.ledger_role)
  );
$fn$;

create or replace function public.can_access_transaction(p_txn_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from public.transactions t
    where t.id = p_txn_id
      and (t.user_id = auth.uid() or public.is_ledger_member(t.ledger_id))
  );
$fn$;

-- 新用户 / 存量用户：建 profile、默认账本、owner 成员、系统字典
create or replace function public.setup_user_defaults(
  p_user_id uuid, p_email text, p_meta jsonb
) returns void language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_ledger uuid;
  v_nick   text;
begin
  v_nick := coalesce(
    nullif(p_meta ->> 'nickname', ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    '用户'
  );

  insert into public.profiles (id, nickname, email)
  values (p_user_id, v_nick, p_email)
  on conflict (id) do nothing;

  select id into v_ledger from public.ledgers
   where owner_id = p_user_id and is_personal
   order by created_at asc limit 1;

  if v_ledger is null then
    insert into public.ledgers (owner_id, name, is_personal)
    values (p_user_id, '默认账本', true)
    returning id into v_ledger;
  end if;

  update public.profiles
     set default_ledger_id = coalesce(default_ledger_id, v_ledger)
   where id = p_user_id;

  insert into public.ledger_members (ledger_id, user_id, role)
  values (v_ledger, p_user_id, 'owner')
  on conflict (ledger_id, user_id) do nothing;

  -- 支出/收入各自一套分类；收入额外提供工资/奖金等（新增分类只需插字典表）
  insert into public.categories (user_id, kind, name, sort_order, is_system)
  select p_user_id, k.kind, c.name, c.ord::smallint, true
  from (values
    ('expense'::public.transaction_type),
    ('income'::public.transaction_type)
  ) as k(kind)
  cross join (values
    ('餐饮', 1), ('交通', 2), ('购物', 3), ('居住', 4), ('娱乐', 5),
    ('医疗', 6), ('教育', 7), ('通讯', 8), ('人情', 9), ('其他', 10),
    ('工资', 11), ('奖金', 12), ('红包', 13), ('理财', 14), ('其他收入', 15)
  ) as c(name, ord)
  on conflict (user_id, kind, name) do nothing;

  insert into public.payment_methods (user_id, name, sort_order, is_system)
  select p_user_id, m.name, m.ord::smallint, true
  from (values ('微信', 1), ('支付宝', 2), ('银行卡', 3), ('现金', 4), ('其他', 5)) as m(name, ord)
  on conflict (user_id, name) do nothing;
end;
$fn$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  perform public.setup_user_defaults(new.id, new.email, new.raw_user_meta_data);
  return new;
end;
$fn$;

-- 写入前补齐账本/币种/创建人，并在软删时记录操作人
create or replace function public.set_transaction_defaults()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_currency char(3);
  v_ledger   uuid;
begin
  if tg_op = 'INSERT' then
    if new.ledger_id is null then
      select default_ledger_id into v_ledger
      from public.profiles where id = new.user_id;
      new.ledger_id := v_ledger;
    end if;
    if new.ledger_id is null then
      select id into v_ledger from public.ledgers
       where owner_id = new.user_id order by created_at asc limit 1;
      new.ledger_id := v_ledger;
    end if;
    if new.created_by is null then new.created_by := new.user_id; end if;
    select currency into v_currency from public.ledgers where id = new.ledger_id;
    if v_currency is not null and new.currency = 'CNY' then
      new.currency := v_currency;
    end if;
  else
    -- 软删/恢复时不允许客户端伪造 deleted_by
    if new.deleted_at is distinct from old.deleted_at then
      new.deleted_by := case when new.deleted_at is null then null else auth.uid() end;
    end if;
  end if;
  return new;
end;
$fn$;

-- 自动写改前快照（PRD §3.3「先查出旧记录一并返回」）
create or replace function public.log_transaction_revision()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if tg_op = 'DELETE' then
    insert into public.transaction_revisions (txn_id, owner_id, operation, snapshot, changed_by)
    values (old.id, old.user_id, 'delete', to_jsonb(old), auth.uid());
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.transaction_revisions (txn_id, owner_id, operation, snapshot, changed_by)
    values (
      new.id,
      new.user_id,
      case
        when new.deleted_at is not null and old.deleted_at is null then 'delete'
        when new.deleted_at is null and old.deleted_at is not null then 'restore'
        else 'update'
      end,
      to_jsonb(old), auth.uid()
    );
    return new;
  else
    insert into public.transaction_revisions (txn_id, owner_id, operation, snapshot, changed_by)
    values (new.id, new.user_id, 'insert', to_jsonb(new), auth.uid());
    return new;
  end if;
end;
$fn$;

-- 19) 聚合 RPC：统计在数据库层完成（PRD §3.3 / §7）------------
create or replace function public.tx_stats(
  p_start  date,
  p_end    date,
  p_type   public.transaction_type default 'expense',
  p_ledger uuid default null
) returns table (category text, total numeric, cnt bigint)
language sql stable security invoker
set search_path = public, pg_temp as $fn$
  select t.category,
         sum(t.amount)::numeric(14, 2) as total,
         count(*)::bigint as cnt
  from public.transactions t
  where t.deleted_at is null
    and (t.user_id = auth.uid() or public.is_ledger_member(t.ledger_id))
    and t.type = p_type
    and t.occurred_date between p_start and p_end
    and (p_ledger is null or t.ledger_id = p_ledger)
  group by t.category
  order by total desc;
$fn$;

create or replace function public.tx_daily_trend(
  p_days   integer default 7,
  p_type   public.transaction_type default 'expense',
  p_ledger uuid default null
) returns table (d date, total numeric)
language sql stable security invoker
set search_path = public, pg_temp as $fn$
  select t.occurred_date as d, sum(t.amount)::numeric(14, 2) as total
  from public.transactions t
  where t.deleted_at is null
    and (t.user_id = auth.uid() or public.is_ledger_member(t.ledger_id))
    and t.type = p_type
    and t.occurred_date between
        ((now() at time zone 'Asia/Shanghai')::date - (greatest(p_days, 1) - 1))
        and (now() at time zone 'Asia/Shanghai')::date
    and (p_ledger is null or t.ledger_id = p_ledger)
  group by t.occurred_date
  order by d;
$fn$;

-- 预算执行进度（供前端与提醒任务共用同一口径）
create or replace function public.budget_usage(p_budget_id uuid)
returns table (spent numeric, remaining numeric, ratio numeric)
language sql stable security invoker
set search_path = public, pg_temp as $fn$
  select coalesce(sum(t.amount), 0)::numeric(14, 2),
         (b.amount - coalesce(sum(t.amount), 0))::numeric(14, 2),
         (coalesce(sum(t.amount), 0) / b.amount)::numeric(8, 4)
  from public.budgets b
  left join public.transactions t
    on t.user_id = b.user_id
   and t.deleted_at is null
   and t.type = b.kind
   and t.occurred_date between b.start_date
       and coalesce(b.end_date, (now() at time zone 'Asia/Shanghai')::date)
   and (b.category is null or t.category = b.category)
   and (b.ledger_id is null or t.ledger_id = b.ledger_id)
  where b.id = p_budget_id and b.user_id = auth.uid()
  group by b.amount;
$fn$;

-- 19.5) 账本成员管理：需跨用户查 profiles，普通 RLS 不允许，
--        用 security definer 且先显式校验调用者的管理权限。
create or replace function public.invite_ledger_member(
  p_ledger_id uuid,
  p_email     text,
  p_role      public.ledger_role default 'editor'
) returns uuid language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare v_user_id uuid;
begin
  if not public.is_ledger_admin(p_ledger_id) then
    raise exception '无权管理该账本成员';
  end if;
  select id into v_user_id from public.profiles
   where lower(coalesce(email, '')) = lower(trim(p_email))
   limit 1;
  if v_user_id is null then
    raise exception '未找到该邮箱对应的用户';
  end if;
  insert into public.ledger_members (ledger_id, user_id, role, invited_by)
  values (p_ledger_id, v_user_id, p_role, auth.uid())
  on conflict (ledger_id, user_id) do update
    set role = excluded.role, invited_by = excluded.invited_by;
  return v_user_id;
end;
$fn$;

create or replace function public.remove_ledger_member(
  p_ledger_id uuid,
  p_user_id   uuid
) returns void language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_ledger_admin(p_ledger_id) then
    raise exception '无权管理该账本成员';
  end if;
  -- 不允许移除账本 owner
  if exists (select 1 from public.ledgers l
             where l.id = p_ledger_id and l.owner_id = p_user_id) then
    raise exception '不能移除账本所有者';
  end if;
  delete from public.ledger_members
   where ledger_id = p_ledger_id and user_id = p_user_id;
end;
$fn$;

-- 19.6) 会话消息原子替换：一次调用内完成「校验归属 → 删旧 → 写新」，
--        避免客户端多次请求中途失败导致历史丢失。
create or replace function public.replace_chat_messages(
  p_session_id uuid,
  p_messages   jsonb
) returns void language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare m jsonb;
  v_seq integer := 0;
begin
  if not exists (
    select 1 from public.chat_sessions s
    where s.id = p_session_id and s.user_id = auth.uid()
  ) then
    raise exception '会话不存在或无权访问';
  end if;

  delete from public.chat_messages where session_id = p_session_id;

  -- 同一事务内 now() 相同，必须用显式序号保证恢复历史时顺序不变
  for m in select value from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) loop
    insert into public.chat_messages (session_id, user_id, role, parts, seq)
    values (
      p_session_id,
      auth.uid(),
      case when m ->> 'role' in ('user', 'assistant', 'system', 'tool')
           then m ->> 'role' else 'user' end,
      coalesce(m -> 'parts', '[]'::jsonb),
      v_seq
    );
    v_seq := v_seq + 1;
  end loop;

  update public.chat_sessions set title = coalesce(
    title,
    nullif(
      (select left(p.value ->> 'text', 40)
       from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) m
       cross join lateral jsonb_array_elements(coalesce(m.value -> 'parts', '[]'::jsonb)) p
       where m.value ->> 'role' = 'user' and p.value ->> 'type' = 'text'
       limit 1),
      ''
    )
  ) where id = p_session_id;
end;
$fn$;

-- 20) 触发器 -------------------------------------------------
-- auth.users 不在本脚本的 drop table 清单里，旧触发器不会随 public 表被删除，
-- 重复执行前需显式清理，避免 "trigger already exists"。
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger trg_transactions_defaults
  before insert or update on public.transactions
  for each row execute function public.set_transaction_defaults();

create trigger trg_transactions_revision
  after insert or update or delete on public.transactions
  for each row execute function public.log_transaction_revision();

do $do$
declare t text;
begin
  foreach t in array array[
    'profiles', 'ledgers', 'categories', 'payment_methods', 'tags',
    'transactions', 'recurring_rules', 'budgets', 'receipts', 'chat_sessions'
  ] loop
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I '
      || 'for each row execute function public.set_updated_at()', t, t);
  end loop;
end
$do$;

-- 21) RLS：全部表启用（security definer 函数绕过递归）---------
do $do$
declare t text;
begin
  foreach t in array array[
    'profiles', 'ledgers', 'ledger_members', 'categories', 'payment_methods',
    'tags', 'receipts', 'recurring_rules', 'transactions', 'transaction_tags',
    'transaction_revisions', 'budgets', 'notifications', 'exports',
    'chat_sessions', 'chat_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$do$;

-- 纯个人数据表：一条 FOR ALL 策略覆盖增删改查（含 with check，防 user_id 被改写）
do $do$
declare t text;
begin
  foreach t in array array[
    'categories', 'payment_methods', 'tags', 'receipts', 'recurring_rules',
    'budgets', 'notifications', 'exports', 'chat_sessions', 'chat_messages'
  ] loop
    execute format(
      'create policy own_rows on public.%I for all '
      || 'using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end
$do$;

create policy "profiles_all_own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "ledgers_select" on public.ledgers
  for select using (owner_id = auth.uid() or public.is_ledger_member(id));
create policy "ledgers_insert" on public.ledgers
  for insert with check (owner_id = auth.uid());
create policy "ledgers_update" on public.ledgers
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "ledgers_delete" on public.ledgers
  for delete using (owner_id = auth.uid());

create policy "members_select" on public.ledger_members
  for select using (user_id = auth.uid() or public.is_ledger_admin(ledger_id));
create policy "members_insert" on public.ledger_members
  for insert with check (public.is_ledger_admin(ledger_id));
create policy "members_update" on public.ledger_members
  for update using (public.is_ledger_admin(ledger_id))
  with check (public.is_ledger_admin(ledger_id));
create policy "members_delete" on public.ledger_members
  for delete using (public.is_ledger_admin(ledger_id));

-- 共享账本成员可读同一账本；写入只能是自己的记录且必须是账本成员
create policy "txns_select" on public.transactions
  for select using (user_id = auth.uid() or public.is_ledger_member(ledger_id));
create policy "txns_insert" on public.transactions
  for insert with check (user_id = auth.uid() and public.is_ledger_member(ledger_id));
create policy "txns_update" on public.transactions
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_ledger_member(ledger_id));
create policy "txns_delete" on public.transactions
  for delete using (user_id = auth.uid());

create policy "txn_tags_all" on public.transaction_tags
  for all using (public.can_access_transaction(transaction_id))
  with check (public.can_access_transaction(transaction_id));

create policy "txn_revisions_select" on public.transaction_revisions
  for select using (owner_id = auth.uid());
create policy "txn_revisions_insert" on public.transaction_revisions
  for insert with check (owner_id = auth.uid());

-- 22) 权限（Supabase 角色）-----------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;

-- 23) 存量用户回填（全新库无 auth.users 时自动跳过）------------
do $do$
declare u record;
begin
  for u in select id, email, raw_user_meta_data from auth.users loop
    perform public.setup_user_defaults(u.id, u.email, u.raw_user_meta_data);
  end loop;
end
$do$;
