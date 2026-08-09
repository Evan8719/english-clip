-- 英语剪贴本 · Supabase schema
-- 可与「小积分」共用同一个 Supabase 项目（表名不冲突）
-- 在 SQL Editor 中整段执行一次

create table if not exists public.entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null,
  payload jsonb not null
);

create index if not exists entries_user_id_idx on public.entries (user_id);
create index if not exists entries_updated_at_idx on public.entries (updated_at);

alter table public.entries enable row level security;

drop policy if exists "Users manage own entries" on public.entries;
create policy "Users manage own entries"
  on public.entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Authentication → Providers：开启 Email
-- Authentication → URL Configuration：填上 Vercel 线上地址（部署后设置）
