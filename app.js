const $ = selector => document.querySelector(selector);
const config = window.PAYLAS_CONFIG || {};
let tweets = [];
let accessToken = '';
let currentPhase = 0;
let nextPhaseAt = Date.now() + 300000;

function isConfigured() {
  return /^https:\/\/.+\.supabase\.co$/.test(config.supabaseUrl || '') && Boolean(config.supabaseAnonKey);
}

async function supabaseRequest(path, options = {}) {
  if (!isConfigured()) throw new Error('Supabase bağlantısı henüz yapılandırılmadı.');
  const { authenticated = false, headers: extraHeaders = {}, ...fetchOptions } = options;
  const headers = {
    apikey: config.supabaseAnonKey,
    'Content-Type': 'application/json',
    ...extraHeaders
  };
  // Yeni sb_publishable_* anahtarları JWT değildir. Authorization başlığına
  // yalnızca Supabase Auth tarafından döndürülen kullanıcı JWT'si yazılmalıdır.
  if (authenticated && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  // URL constructor bazı iOS tarayıcılarında geçerli Supabase adreslerinde dahi
  // "expected pattern" DOMException üretebildiği için doğrulanmış taban adresi
  // doğrudan güvenli API yolu ile birleştiriyoruz.
  const requestUrl = `${config.supabaseUrl.replace(/\/+$/, '')}${path}`;
  let response;
  try {
    response = await fetch(requestUrl, {
    ...fetchOptions,
    headers
    });
  } catch (error) {
    console.error('Supabase isteği başlatılamadı:', { requestUrl, error });
    throw new Error('Supabase bağlantısı kurulamadı. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.msg || error.message || error.error_description || 'İşlem tamamlanamadı.');
  }
  if (response.status === 204) return null;
  return response.json();
}

function normaliseTweet(row) { return { ...row, replyUrl: row.reply_url || '' }; }

async function loadTweets() {
  try {
    const rows = await supabaseRequest('/rest/v1/tweets?select=*&order=created_at.desc');
    tweets = rows.map(normaliseTweet).sort((first, second) => phaseScore(first.id, currentPhase) - phaseScore(second.id, currentPhase));
    renderTweets();
  } catch (error) {
    tweets = [];
    renderTweets();
    $('#emptyState').hidden = false;
    $('#emptyState').querySelector('h3').textContent = 'Gönderiler yüklenemedi';
    $('#emptyState').querySelector('p').textContent = error.message;
  }
}

function fullText(tweet) { return [tweet.text, tweet.hashtags, tweet.mentions].filter(Boolean).join(' '); }
function escapeHtml(value = '') { return value.replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]); }
function styledText(value) { return escapeHtml(value).replace(/(^|\s)([@#][\p{L}\p{N}_]+)/gu, '$1<span class="accent">$2</span>'); }

function renderTweets() {
  $('#tweetGrid').innerHTML = tweets.map((tweet, index) => {
    const composed = fullText(tweet);
    return `<article class="tweet-card"><div class="card-top"><span class="tweet-number">MESAJ ${String(index + 1).padStart(2, '0')}</span><p class="tweet-text">${styledText(composed)}</p><div class="tweet-meta"><span>${composed.length} / 280 karakter</span>${tweet.replyUrl ? '<span>↩ Yanıt</span>' : '<span>Yeni gönderi</span>'}</div></div><button class="share-button" data-share="${tweet.id}">X'te paylaş <span>↗</span></button></article>`;
  }).join('');
  $('#emptyState').hidden = tweets.length > 0;
  $('#tweetCount').textContent = tweets.length;
  $('#publicTweetCount').textContent = tweets.length;
  $('#manageTotal').textContent = `${tweets.length} mesaj`;
  $('#clearAll').disabled = tweets.length === 0;
  $('#manageItems').innerHTML = tweets.map((tweet, index) => `<div class="manage-item"><b>${String(index + 1).padStart(2, '0')}</b><p>${escapeHtml(tweet.text)}</p><button class="delete-btn" data-delete="${tweet.id}" aria-label="Gönderiyi sil">Sil</button></div>`).join('');
  renderMentionSuggestions();
}

function phaseScore(id, phase) {
  return [...`${id}:${phase}`].reduce((score, character) => ((score * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
}

function shuffleForPhase() {
  tweets.sort((first, second) => phaseScore(first.id, currentPhase) - phaseScore(second.id, currentPhase));
  renderTweets();
  $('#tweetGrid').classList.remove('phase-shuffle');
  void $('#tweetGrid').offsetWidth;
  $('#tweetGrid').classList.add('phase-shuffle');
  $('#phaseNotice').classList.add('show');
  setTimeout(() => $('#phaseNotice').classList.remove('show'), 2600);
}

function updateCountdown() {
  const now = Date.now();
  const remaining = Math.max(0, nextPhaseAt - now);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  $('#countdown').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  if (remaining === 0) {
    currentPhase += 1;
    nextPhaseAt = now + 300000;
    shuffleForPhase();
  }
}

function renderMentionSuggestions() {
  const mentions = [...new Set(tweets.flatMap(tweet => (tweet.mentions.match(/@[\p{L}\p{N}_]+/gu) || [])))];
  $('#mentionSuggestions').innerHTML = mentions.length
    ? `<small>Önceden eklenenler:</small> ${mentions.map(mention => `<button type="button" data-mention="${escapeHtml(mention)}">${escapeHtml(mention)}</button>`).join('<span>,</span>')}`
    : '';
}

function shareTweet(tweet) {
  let url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(fullText(tweet))}`;
  const statusId = tweet.replyUrl.match(/status\/(\d+)/)?.[1];
  if (statusId) url += `&in_reply_to=${statusId}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function deleteTweet(id) {
  await supabaseRequest(`/rest/v1/tweets?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', authenticated: true });
  await loadTweets();
}

document.addEventListener('click', async event => {
  const share = event.target.closest('[data-share]');
  if (share) shareTweet(tweets.find(tweet => tweet.id === share.dataset.share));
  const remove = event.target.closest('[data-delete]');
  if (remove && confirm('Bu gönderiyi kalıcı olarak silmek istediğinize emin misiniz?')) {
    try { await deleteTweet(remove.dataset.delete); showToast('Gönderi silindi'); }
    catch (error) { alert(error.message); }
  }
  const close = event.target.closest('[data-close]');
  if (close) $(`#${close.dataset.close}`).hidden = true;
});

$('#adminOpen').addEventListener('click', () => $('#loginModal').hidden = false);
$('#loginModal').addEventListener('click', event => { if (event.target === $('#loginModal')) $('#loginModal').hidden = true; });
$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $('#loginError').textContent = '';
  try {
    const session = await supabaseRequest('/auth/v1/token?grant_type=password', {
      method: 'POST', body: JSON.stringify({ email: $('#email').value.trim(), password: $('#password').value })
    });
    accessToken = session.access_token;
    const membership = await supabaseRequest(`/rest/v1/app_admins?user_id=eq.${encodeURIComponent(session.user.id)}&select=user_id`, { authenticated: true });
    if (!membership.length) { accessToken = ''; throw new Error('Bu hesabın yönetici yetkisi bulunmuyor.'); }
    $('#loginModal').hidden = true;
    $('#adminPanel').hidden = false;
    document.body.style.overflow = 'hidden';
  } catch (error) { $('#loginError').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#adminClose').addEventListener('click', () => { accessToken = ''; $('#adminPanel').hidden = true; document.body.style.overflow = ''; });

function updatePreview() {
  const draft = { text: $('#tweetText').value || 'Gönderi metniniz burada görünecek…', mentions: $('#mentions').value, hashtags: $('#hashtags').value };
  $('#previewText').innerHTML = styledText(fullText(draft));
  $('#editorCount').textContent = fullText(draft).length;
}
['tweetText', 'mentions', 'hashtags'].forEach(id => $(`#${id}`).addEventListener('input', updatePreview));

$('#tweetForm').addEventListener('submit', async event => {
  event.preventDefault();
  const draft = { text: $('#tweetText').value.trim(), mentions: $('#mentions').value.trim(), hashtags: $('#hashtags').value.trim(), reply_url: $('#replyUrl').value.trim() };
  const displayDraft = normaliseTweet(draft);
  if (fullText(displayDraft).length > 280) { $('#editorError').textContent = `Toplam metin ${fullText(displayDraft).length} karakter. X sınırı için 280 veya altına indirin.`; return; }
  if (draft.reply_url && !/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^\s/]+\/status\/\d+(?:[/?].*)?$/i.test(draft.reply_url)) {
    $('#editorError').textContent = 'Yanıt bağlantısı geçerli bir X gönderi adresi olmalıdır.';
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  $('#editorError').textContent = '';
  try {
    await supabaseRequest('/rest/v1/tweets', { method: 'POST', authenticated: true, headers: { Prefer: 'return=minimal' }, body: JSON.stringify(draft) });
    event.target.reset(); updatePreview(); await loadTweets(); showToast('Gönderi yayınlandı');
  } catch (error) { $('#editorError').textContent = error.message; }
  finally { button.disabled = false; }
});

$('#clearAll').addEventListener('click', async () => {
  if (!tweets.length || !confirm(`${tweets.length} gönderinin tamamı veritabanından kalıcı olarak silinecek. Devam edilsin mi?`)) return;
  const button = $('#clearAll');
  button.disabled = true;
  try {
    await supabaseRequest('/rest/v1/tweets?id=not.is.null', { method: 'DELETE', authenticated: true });
    await loadTweets(); showToast('Tüm gönderiler temizlendi');
  } catch (error) { alert(error.message); }
  finally { button.disabled = false; }
});

function showToast(message) {
  $('#toast').firstChild.textContent = `${message} `;
  $('#toast').classList.add('show');
  setTimeout(() => $('#toast').classList.remove('show'), 2200);
}

renderTweets();
loadTweets();
updateCountdown();
setInterval(updateCountdown, 1000);
