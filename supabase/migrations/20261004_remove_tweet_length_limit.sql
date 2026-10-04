-- Mevcut projelerde birleşik 280 karakter sınırını kaldırır.
alter table public.tweets alter column text type text;
alter table public.tweets drop constraint if exists complete_tweet_length;
