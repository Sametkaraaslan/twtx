-- Kampanya görsellerini Supabase Storage'da tutar; site bundle'ını büyütmez.
alter table public.campaign_settings add column if not exists image_urls jsonb not null default '[]'::jsonb;
insert into storage.buckets (id, name, public) values ('campaign-media', 'campaign-media', true)
on conflict (id) do update set public = true;
create policy "Campaign media is publicly readable" on storage.objects for select to public using (bucket_id = 'campaign-media');
create policy "Admins can upload campaign media" on storage.objects for insert to authenticated with check (bucket_id = 'campaign-media' and exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can delete campaign media" on storage.objects for delete to authenticated using (bucket_id = 'campaign-media' and exists (select 1 from public.app_admins where user_id = auth.uid()));
