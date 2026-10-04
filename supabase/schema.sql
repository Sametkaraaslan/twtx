-- Bu dosyayı Supabase SQL Editor'da bir kez çalıştırın.
create extension if not exists pgcrypto;

create table if not exists public.tweets (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) >= 1),
  mentions text not null default '',
  hashtags text not null default '',
  reply_url text not null default '',
  created_at timestamptz not null default now()
);

-- Önceki 240 karakterlik kurulumu da güvenle günceller.
alter table public.tweets alter column text type text;
alter table public.tweets drop constraint if exists complete_tweet_length;
alter table public.tweets add constraint complete_tweet_length check (
  char_length(concat_ws(' ', text, nullif(hashtags, ''), nullif(mentions, ''))) <= 280
);

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.tweets enable row level security;
alter table public.app_admins enable row level security;

create policy "Admins can verify own membership" on public.app_admins
for select to authenticated
using (user_id = auth.uid());

create policy "Tweets are publicly readable" on public.tweets
for select to anon, authenticated using (true);

create policy "Admins can insert tweets" on public.tweets
for insert to authenticated
with check (exists (select 1 from public.app_admins where user_id = auth.uid()));

create policy "Admins can delete tweets" on public.tweets
for delete to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()));

-- İlk yöneticiyi Authentication > Users bölümünden oluşturduktan sonra UUID'sini ekleyin:
-- insert into public.app_admins (user_id) values ('KULLANICI-UUID-BURAYA');
