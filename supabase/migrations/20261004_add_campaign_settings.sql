-- Hashtag ve yanıt hedefini tüm gönderiler için tek merkezden yönetir.
create table if not exists public.campaign_settings (
  id smallint primary key default 1 check (id = 1),
  hashtags text not null default '',
  reply_url text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.campaign_settings (id) values (1) on conflict (id) do nothing;
alter table public.campaign_settings enable row level security;
create policy "Settings are publicly readable" on public.campaign_settings for select to anon, authenticated using (true);
create policy "Admins can insert settings" on public.campaign_settings for insert to authenticated with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can update settings" on public.campaign_settings for update to authenticated using (exists (select 1 from public.app_admins where user_id = auth.uid())) with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
