const $ = selector => document.querySelector(selector);
const config = window.PAYLAS_CONFIG || {};
let tweets = [];
let accessToken = '';
let currentPhase = Math.floor(Date.now() / 300000);
let editingId = '';
let campaignSettings = { hashtags: '', replyUrl: '' };

function loadSharedTweetIds() {
  try { return new Set(JSON.parse(localStorage.getItem('paylas_shared_tweets') || '[]').map(String)); }
  catch { return new Set(); }
}
const sharedTweetIds = loadSharedTweetIds();

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
    const errorText = await response.text();
    let error = {};
    try { error = errorText ? JSON.parse(errorText) : {}; }
    catch { error = { message: errorText }; }
    throw new Error(error.msg || error.message || error.error_description || 'İşlem tamamlanamadı.');
  }
  if (response.status === 204) return null;
  const responseBody = await response.text();
  if (!responseBody) return null;
  try { return JSON.parse(responseBody); }
  catch (error) { console.error('Supabase yanıtı JSON olarak okunamadı:', responseBody, error); return null; }
}

function normaliseTweet(row) { return { ...row }; }

async function loadSettings() {
  const rows = await supabaseRequest('/rest/v1/campaign_settings?id=eq.1&select=*');
  const settings = rows[0] || {};
  campaignSettings = { hashtags: settings.hashtags || '', replyUrl: settings.reply_url || '' };
  $('#globalHashtags').value = campaignSettings.hashtags;
  $('#globalReplyUrl').value = campaignSettings.replyUrl;
}

async function loadTweets() {
  try {
    const rows = await supabaseRequest('/rest/v1/tweets?select=*&order=created_at.desc');
    tweets = shuffleTweets(rows.map(normaliseTweet), currentPhase);
    renderTweets();
  } catch (error) {
    tweets = [];
    renderTweets();
    $('#emptyState').hidden = false;
    $('#emptyState').querySelector('h3').textContent = 'Gönderiler yüklenemedi';
    $('#emptyState').querySelector('p').textContent = error.message;
  }
}

function fullText(tweet) { return [tweet.text, campaignSettings.hashtags, tweet.mentions].filter(Boolean).join(' '); }
function escapeHtml(value = '') { return value.replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]); }
function styledText(value) { return escapeHtml(value).replace(/(^|\s)([@#][\p{L}\p{N}_]+)/gu, '$1<span class="accent">$2</span>'); }

function renderTweets() {
  const usedLabels = new Set();
  $('#tweetGrid').innerHTML = tweets.map((tweet, index) => {
    const composed = fullText(tweet);
    let label = randomLabel(tweet.id);
    let attempts = 0;
    while (usedLabels.has(label) && attempts < 900) { label = label === 999 ? 100 : label + 1; attempts += 1; }
    usedLabels.add(label);
    const shared = sharedTweetIds.has(String(tweet.id));
    return `<article class="tweet-card${shared ? ' is-shared' : ''}"><div class="card-top"><span class="tweet-number">#${label}</span><p class="tweet-text">${styledText(composed)}</p><div class="tweet-meta"><span>${composed.length} karakter</span>${campaignSettings.replyUrl ? '<span>↩ Yanıt</span>' : '<span>Yeni gönderi</span>'}</div></div><button class="share-button" data-share="${tweet.id}" ${shared ? 'disabled' : ''}>${shared ? 'Paylaşıldı <span>✓</span>' : 'X\'te paylaş <span>↗</span>'}</button></article>`;
  }).join('');
  $('#emptyState').hidden = tweets.length > 0;
  $('#tweetCount').textContent = tweets.length;
  $('#manageTotal').textContent = `${tweets.length} mesaj`;
  $('#clearAll').disabled = tweets.length === 0;
  $('#manageItems').innerHTML = tweets.map((tweet, index) => `<div class="manage-item"><b>${String(index + 1).padStart(2, '0')}</b><p>${escapeHtml(tweet.text)}</p><button class="edit-btn" data-edit="${tweet.id}" type="button">Düzenle</button><button class="delete-btn" data-delete="${tweet.id}" type="button" aria-label="Gönderiyi sil">Sil</button></div>`).join('');
  renderMentionSuggestions();
}

function hashString(value) {
  return [...String(value)].reduce((score, character) => Math.imul(score ^ character.charCodeAt(0), 16777619) >>> 0, 2166136261);
}

function randomLabel(id) { return 100 + (hashString(id) % 900); }

function shuffleTweets(items, phase) {
  const result = [...items].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  let seed = hashString(`phase-${phase}`);
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function shuffleForPhase() {
  tweets = shuffleTweets(tweets, currentPhase);
  renderTweets();
  $('#tweetGrid').classList.remove('phase-shuffle');
  void $('#tweetGrid').offsetWidth;
  $('#tweetGrid').classList.add('phase-shuffle');
  $('#phaseNotice').classList.add('show');
  setTimeout(() => $('#phaseNotice').classList.remove('show'), 2600);
}

function updateCountdown() {
  const now = Date.now();
  const phase = Math.floor(now / 300000);
  const remaining = ((phase + 1) * 300000) - now;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  $('#countdown').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  if (phase !== currentPhase) {
    currentPhase = phase;
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
  const statusId = campaignSettings.replyUrl.match(/status\/(\d+)/)?.[1];
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
  const edit = event.target.closest('[data-edit]');
  if (edit) startEditing(edit.dataset.edit);
});

async function saveCampaignSettings(hashtags, replyUrl) {
  await supabaseRequest('/rest/v1/campaign_settings?on_conflict=id', {
    method: 'POST', authenticated: true,
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 1, hashtags, reply_url: replyUrl })
  });
  campaignSettings = { hashtags, replyUrl };
}

$('#mentionSuggestions').addEventListener('click', event => {
  const button = event.target.closest('button[data-mention]');
  if (!button) return;
  const input = $('#mentions');
  const values = input.value.trim().split(/\s+/).filter(Boolean);
  if (!values.includes(button.dataset.mention)) values.push(button.dataset.mention);
  input.value = values.join(' ');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
});

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
$('#adminClose').addEventListener('click', () => { accessToken = ''; $('#adminPanel').hidden = true; document.body.style.overflow = ''; history.replaceState(null, '', '/'); });

function updatePreview() {
  const draft = { text: $('#tweetText').value || 'Gönderi metniniz burada görünecek…', mentions: $('#mentions').value };
  $('#previewText').innerHTML = styledText(fullText(draft));
  $('#editorCount').textContent = fullText(draft).length;
}
['tweetText', 'mentions'].forEach(id => $(`#${id}`).addEventListener('input', updatePreview));

function startEditing(id) {
  const tweet = tweets.find(item => item.id === id);
  if (!tweet) return;
  editingId = id;
  $('#tweetText').value = tweet.text;
  $('#mentions').value = tweet.mentions;
  $('#editorTitle').textContent = 'Gönderiyi düzenle';
  $('#submitLabel').textContent = 'Değişiklikleri kaydet';
  $('#cancelEdit').hidden = false;
  updatePreview();
  $('#tweetText').focus();
  $('#tweetForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetEditor() {
  editingId = '';
  ['tweetText', 'mentions'].forEach(id => { $(`#${id}`).value = ''; });
  $('#editorTitle').textContent = 'Yeni gönderi';
  $('#submitLabel').textContent = 'Gönderiyi yayınla';
  $('#cancelEdit').hidden = true;
  $('#editorError').textContent = '';
  updatePreview();
}

$('#cancelEdit').addEventListener('click', resetEditor);

$('#tweetForm').addEventListener('submit', async event => {
  event.preventDefault();
  const draft = { text: $('#tweetText').value.trim(), mentions: $('#mentions').value.trim(), hashtags: '', reply_url: '' };
  const button = event.submitter;
  button.disabled = true;
  $('#editorError').textContent = '';
  const wasEditing = Boolean(editingId);
  const savedId = editingId;
  let savedRows;
  try {
    const path = wasEditing ? `/rest/v1/tweets?id=eq.${encodeURIComponent(savedId)}` : '/rest/v1/tweets';
    savedRows = await supabaseRequest(path, { method: wasEditing ? 'PATCH' : 'POST', authenticated: true, headers: { Prefer: 'return=representation' }, body: JSON.stringify(draft) });
  } catch (error) {
    $('#editorError').textContent = error.message;
    button.disabled = false;
    return;
  }
  const saved = normaliseTweet(savedRows?.[0] || { ...draft, id: savedId || `new-${Date.now()}` });
  if (wasEditing) tweets = tweets.map(tweet => tweet.id === savedId ? saved : tweet);
  else tweets.unshift(saved);
  resetEditor();
  renderTweets();
  showToast(wasEditing ? 'Gönderi güncellendi' : 'Gönderi yayınlandı');
  button.disabled = false;
});

$('#settingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  const hashtags = $('#globalHashtags').value.trim();
  const replyUrl = $('#globalReplyUrl').value.trim();
  if (replyUrl && !/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^\s/]+\/status\/\d+(?:[/?].*)?$/i.test(replyUrl)) {
    $('#settingsError').textContent = 'Geçerli bir X gönderi adresi girin.';
    return;
  }
  event.submitter.disabled = true;
  $('#settingsError').textContent = '';
  try {
    await saveCampaignSettings(hashtags, replyUrl);
    renderTweets(); updatePreview(); showToast('Genel ayarlar güncellendi');
  } catch (error) { $('#settingsError').textContent = error.message; }
  finally { event.submitter.disabled = false; }
});

$('#bulkForm').addEventListener('submit', async event => {
  event.preventDefault();
  const lines = $('#bulkTweets').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) { $('#bulkError').textContent = 'En az bir gönderi yazın.'; return; }
  const mentions = $('#bulkMentions').value.trim();
  const drafts = lines.map(text => ({ text, mentions, hashtags: '', reply_url: '' }));
  event.submitter.disabled = true; $('#bulkError').textContent = '';
  try {
    const savedRows = await supabaseRequest('/rest/v1/tweets', { method: 'POST', authenticated: true, headers: { Prefer: 'return=representation' }, body: JSON.stringify(drafts) });
    tweets = shuffleTweets([...savedRows.map(normaliseTweet), ...tweets], currentPhase);
    $('#bulkTweets').value = ''; $('#bulkMentions').value = '';
    renderTweets(); showToast(`${savedRows.length} gönderi yayınlandı`);
  } catch (error) { $('#bulkError').textContent = error.message; }
  finally { event.submitter.disabled = false; }
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
  $('#toastMessage').textContent = message;
  $('#toast').classList.add('show');
  setTimeout(() => $('#toast').classList.remove('show'), 2200);
}

async function initialiseApp() {
  const splashTimeout = setTimeout(() => $('#loadingScreen').classList.add('hidden'), 3500);
  try {
    const results = await Promise.allSettled([loadSettings(), loadTweets()]);
    const rejected = results.find(result => result.status === 'rejected');
    if (rejected) throw rejected.reason;
    renderTweets();
  } catch (error) {
    console.error('Başlangıç verileri yüklenemedi:', error);
    if (!tweets.length) {
      $('#emptyState').hidden = false;
      $('#emptyState').querySelector('h3').textContent = 'Veriler yüklenemedi';
      $('#emptyState').querySelector('p').textContent = error.message;
    }
  } finally {
    clearTimeout(splashTimeout);
    $('#loadingScreen').classList.add('hidden');
    setTimeout(() => $('#loadingScreen').remove(), 450);
  }
}

renderTweets();
if (window.location.pathname.replace(/\/+$/, '') === '/admin') $('#loginModal').hidden = false;
initialiseApp();
updateCountdown();
setInterval(updateCountdown, 1000);
