-- 和み夏合宿 LP 共有ストレージ
-- Supabase SQL Editor でこのファイルを実行してください。

create table if not exists public.nagomi_kv (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text default ''
);

alter table public.nagomi_kv enable row level security;

-- 仲間LP向け: anon でも読み書き可（URLを知る人だけがアクセスする前提）
drop policy if exists "nagomi_kv_select_anon" on public.nagomi_kv;
create policy "nagomi_kv_select_anon"
  on public.nagomi_kv for select
  to anon, authenticated
  using (true);

drop policy if exists "nagomi_kv_insert_anon" on public.nagomi_kv;
create policy "nagomi_kv_insert_anon"
  on public.nagomi_kv for insert
  to anon, authenticated
  with check (true);

drop policy if exists "nagomi_kv_update_anon" on public.nagomi_kv;
create policy "nagomi_kv_update_anon"
  on public.nagomi_kv for update
  to anon, authenticated
  using (true)
  with check (true);

-- Realtime で自動配信（すでに追加済みならスキップ）
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'nagomi_kv'
  ) then
    alter publication supabase_realtime add table public.nagomi_kv;
  end if;
end $$;
