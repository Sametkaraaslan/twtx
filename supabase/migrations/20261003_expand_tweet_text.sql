-- Mevcut projelerde 240 karakterlik text sütununu ve eski birleşim kuralını günceller.
alter table public.tweets alter column text type text;
alter table public.tweets drop constraint if exists complete_tweet_length;
alter table public.tweets add constraint complete_tweet_length check (
  char_length(concat_ws(' ', text, nullif(hashtags, ''), nullif(mentions, ''))) <= 280
);
