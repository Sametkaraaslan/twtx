# Paylaş

X için hazır gönderiler sunan, verileri Supabase üzerinden tüm ziyaretçilerle paylaşan kampanya arayüzü.

## Supabase kurulumu

1. Supabase'de yeni bir proje oluşturun.
2. `supabase/schema.sql` dosyasını projenin **SQL Editor** bölümünde çalıştırın. Mevcut kurulumlarda ayrıca `supabase/migrations/20261003_expand_tweet_text.sql`, `supabase/migrations/20261004_allow_tweet_updates.sql` ve son olarak `supabase/migrations/20261004_remove_tweet_length_limit.sql` dosyalarını sırasıyla çalıştırın.
3. **Authentication > Users** bölümünde e-posta/şifre ile bir yönetici oluşturun.
4. Oluşan kullanıcının UUID değerini SQL Editor'da yönetici tablosuna ekleyin:
   ```sql
   insert into public.app_admins (user_id) values ('KULLANICI-UUID-BURAYA');
   ```
5. `config.js`, bu proje için sağlanan Project URL ve `sb_publishable_*` anahtarıyla yapılandırılmıştır. Farklı bir Supabase projesine geçerken bu iki alanı güncelleyin. `sb_secret_*` veya eski `service_role` anahtarını hiçbir zaman tarayıcı koduna koymayın.

Anon kullanıcılar yalnızca gönderileri okuyabilir. Ekleme, tekil silme ve **Tümünü temizle** işlemleri, Supabase Auth ile giriş yapan ve `app_admins` tablosunda bulunan kullanıcılara açıktır. Bu güvenlik Row Level Security politikalarıyla veritabanı tarafında uygulanır.

## Çalıştırma

```bash
python3 -m http.server 4173
```

Ardından `http://localhost:4173` adresini açın. Yönetici paneline Supabase'de oluşturduğunuz hesabın e-posta ve şifresiyle giriş yapın. Yönetici tarafından eklenen veya silinen gönderiler veritabanına yansır ve sayfayı açan tüm kullanıcılar güncel listeyi görür.

## Vercel'e yayınlama

1. Bu klasörü bir GitHub reposuna gönderin.
2. Vercel'de **Add New > Project** üzerinden repoyu içe aktarın.
3. Framework Preset için **Other**, Root Directory için `./` seçin; build ve output alanlarını boş bırakın.
4. **Deploy** düğmesine basın. `vercel.json`, statik dosyaları ve Supabase bağlantısını destekleyen güvenlik başlıklarını otomatik uygular.

Bu repository'de henüz bir Git remote tanımlı değilse önce GitHub'da boş bir repo oluşturup aşağıdaki komutları çalıştırın:

```bash
git remote add origin https://github.com/KULLANICI/REPO.git
git push -u origin work
```
