-- Mevcut projelerde yöneticilerin gönderileri düzenleyebilmesini sağlar.
create policy "Admins can update tweets" on public.tweets
for update to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()))
with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
