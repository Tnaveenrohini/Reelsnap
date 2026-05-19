/* ═══════════════════════════════════════════════════════════
   ReelSnap — Frontend JavaScript
   Handles: URL validation, API calls, history, UI interactions
═══════════════════════════════════════════════════════════ */

'use strict';

/* ─── CONFIG ─── */
const API_BASE = 'https://reelsnap-production-1805.up.railway.app';

/* ─── DOM REFERENCES ─── */
const urlInput      = document.getElementById('urlInput');
const downloadBtn   = document.getElementById('downloadBtn');
const pasteBtn      = document.getElementById('pasteBtn');
const copyBtn       = document.getElementById('copyBtn');
const clearBtn      = document.getElementById('clearBtn');
const progressWrap  = document.getElementById('progressWrap');
const progressFill  = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const resultArea    = document.getElementById('resultArea');
const errorArea     = document.getElementById('errorArea');
const errorMsg      = document.getElementById('errorMsg');
const thumbImg      = document.getElementById('thumbImg');
const dlLink        = document.getElementById('dlLink');
const dlLinkSD      = document.getElementById('dlLinkSD');
const qualityBadge  = document.getElementById('qualityBadge');
const resultTitle   = document.getElementById('resultTitle');
const resultSub     = document.getElementById('resultSub');
const historyList   = document.getElementById('historyList');
const historyEmpty  = document.getElementById('historyEmpty');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const scrollTopBtn  = document.getElementById('scrollTop');
const hamburger     = document.getElementById('hamburger');
const mobileMenu    = document.getElementById('mobileMenu');

/* ─── STATS TICKER ─── */
let statBase = 2400000;
const statEl = document.getElementById('statDownloads');
setInterval(() => {
  statBase += Math.floor(Math.random() * 3 + 1);
  statEl.innerText = (statBase / 1000000).toFixed(1) + 'M+';
}, 4000);

/* ═══════════════════════════════════════════════════════════
   URL VALIDATION
═══════════════════════════════════════════════════════════ */
/**
 * Validates an Instagram URL (reels, videos, posts, tv)
 * @param {string} url
 * @returns {boolean}
 */
function isValidInstagramURL(url) {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace('www.', '');
    if (host !== 'instagram.com') return false;
    // Must be a reel, video post, or tv content
    return /^\/(reel|p|tv)\//i.test(u.pathname);
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════
   PROGRESS BAR HELPERS
═══════════════════════════════════════════════════════════ */
let progressInterval = null;

function startProgress(label = 'Fetching video info...') {
  progressWrap.style.display = 'block';
  progressFill.style.width = '0%';
  progressLabel.textContent = label;
  let pct = 0;
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    // Animate to ~85% organically, wait for real response
    pct += (85 - pct) * 0.07;
    progressFill.style.width = Math.min(pct, 84).toFixed(1) + '%';
  }, 150);
}

function finishProgress(success = true) {
  clearInterval(progressInterval);
  progressFill.style.width = '100%';
  setTimeout(() => {
    progressWrap.style.display = 'none';
    progressFill.style.width = '0%';
  }, 400);
}

/* ═══════════════════════════════════════════════════════════
   UI STATE HELPERS
═══════════════════════════════════════════════════════════ */
function showResult(data) {
  resultArea.style.display = 'block';
  errorArea.style.display = 'none';

  // Thumbnail
  if (data.thumbnail) {
    thumbImg.src = data.thumbnail;
    thumbImg.onerror = () => {
      thumbImg.src = '';
      thumbImg.parentElement.style.background = 'rgba(255,45,85,0.1)';
    };
  }

  // Quality badge
  qualityBadge.textContent = data.quality || 'HD';

  // Title / subtitle
  resultTitle.textContent = data.title || 'Instagram Video';
  resultSub.textContent   = data.author ? `@${data.author}` : 'Ready to download';

  // Primary download link
  dlLink.href = `/proxy-download?url=${encodeURIComponent(data.download)}&filename=reelsnap_${Date.now()}.mp4`;
  dlLink.setAttribute('download', `reelsnap_${Date.now()}.mp4`);

  // SD quality if available
  if (data.downloadSD) {
    dlLinkSD.href = `/proxy-download?url=${encodeURIComponent(data.downloadSD)}&filename=reelsnap_sd_${Date.now()}.mp4`;
    dlLinkSD.style.display = 'inline-flex';
  } else {
    dlLinkSD.style.display = 'none';
  }
}

function showError(msg) {
  errorArea.style.display = 'flex';
  resultArea.style.display = 'none';
  errorMsg.textContent = msg || 'Something went wrong. Please try again.';
}

function clearResult() {
  resultArea.style.display = 'none';
  errorArea.style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════
   TOAST NOTIFICATION
═══════════════════════════════════════════════════════════ */
let toastTimer = null;
const toastEl = document.getElementById('toast');

function showToast(msg, duration = 3000) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
}

/* ═══════════════════════════════════════════════════════════
   CORE DOWNLOAD FUNCTION
═══════════════════════════════════════════════════════════ */
async function fetchDownload() {
  const url = urlInput.value.trim();

  // Validate URL first
  if (!url) {
    showToast('⚠️ Please paste an Instagram URL first');
    urlInput.focus();
    return;
  }
  if (!isValidInstagramURL(url)) {
    showError('Invalid Instagram URL. Please paste a valid reel, video, or post link (e.g. https://www.instagram.com/reel/...)');
    showToast('❌ Invalid URL — must be an Instagram reel, post, or video link');
    return;
  }

  // Reset UI
  clearResult();
  downloadBtn.disabled = true;

  // Progress
  startProgress('Fetching video info...');

  try {
    const res = await fetch(`${API_BASE}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();

    finishProgress();

    if (!res.ok || !data.status) {
      const errText = data.message || data.error || 'Could not extract video. Make sure the post is public.';
      showError(errText);
      showToast('❌ ' + errText);
    } else {
      showResult(data);
      showToast('✅ Video ready! Click Download HD to save.');
      saveToHistory(url, data);
    }
  } catch (err) {
    finishProgress(false);
    // Server offline fallback message
    const msg = err.message.includes('fetch') || err.message.includes('Failed')
      ? 'Cannot connect to server. Make sure the backend (node server.js) is running on port 3000.'
      : 'An unexpected error occurred. Please try again.';
    showError(msg);
    showToast('❌ Connection failed — is the server running?');
  } finally {
    downloadBtn.disabled = false;
  }
}

/* ═══════════════════════════════════════════════════════════
   CLIPBOARD: PASTE & COPY
═══════════════════════════════════════════════════════════ */
pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.startsWith('http')) {
      urlInput.value = text;
      clearBtn.style.display = '';
      clearResult();
      showToast('📋 URL pasted!');
      // Auto-trigger if valid
      if (isValidInstagramURL(text)) fetchDownload();
    } else {
      showToast('⚠️ Clipboard does not contain a valid URL');
    }
  } catch {
    showToast('⚠️ Clipboard access denied — please paste manually');
    urlInput.focus();
  }
});

copyBtn.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (!url) { showToast('⚠️ Nothing to copy'); return; }
  navigator.clipboard.writeText(url)
    .then(() => showToast('🔗 URL copied to clipboard!'))
    .catch(() => showToast('⚠️ Could not copy — try manually'));
});

/* ─── Auto-detect clipboard on focus ─── */
urlInput.addEventListener('focus', async () => {
  if (urlInput.value) return; // already has content
  try {
    const text = await navigator.clipboard.readText();
    if (text && isValidInstagramURL(text)) {
      urlInput.value = text;
      clearBtn.style.display = '';
      showToast('📋 Instagram URL detected and pasted!');
    }
  } catch { /* permission not granted — silent */ }
});

/* ─── Clear button ─── */
clearBtn.addEventListener('click', () => {
  urlInput.value = '';
  clearBtn.style.display = 'none';
  clearResult();
  urlInput.focus();
});

urlInput.addEventListener('input', () => {
  clearBtn.style.display = urlInput.value ? '' : 'none';
  if (!urlInput.value) clearResult();
});

/* ─── Trigger download on Enter ─── */
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchDownload();
});

downloadBtn.addEventListener('click', fetchDownload);

/* ═══════════════════════════════════════════════════════════
   DOWNLOAD HISTORY (localStorage)
═══════════════════════════════════════════════════════════ */
const HISTORY_KEY = 'reelsnap_history';

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function setHistory(arr) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, 30)));
}

/**
 * Save a successfully processed URL to history
 * @param {string} url
 * @param {Object} data - API response data
 */
function saveToHistory(url, data) {
  const history = getHistory();
  // Remove if already exists (move to top)
  const idx = history.findIndex(h => h.url === url);
  if (idx > -1) history.splice(idx, 1);
  history.unshift({
    url,
    title: data.title || 'Instagram Video',
    quality: data.quality || 'HD',
    thumbnail: data.thumbnail || '',
    downloadUrl: data.download || '',
    date: Date.now()
  });
  setHistory(history);
  renderHistory();
}

/**
 * Render history list to DOM
 */
function renderHistory() {
  const history = getHistory();
  clearHistoryBtn.style.display = history.length ? '' : 'none';

  if (!history.length) {
    historyEmpty.style.display = 'block';
    historyList.innerHTML = '';
    return;
  }

  historyEmpty.style.display = 'none';

  historyList.innerHTML = history.map((h, i) => {
    const shortUrl = h.url
      .replace('https://www.instagram.com/', 'instagram.com/')
      .replace('https://instagram.com/', 'instagram.com/');
    const timeAgo = formatTimeAgo(h.date);

    return `<div class="history-item" id="hi${i}">
      <span class="h-type">${h.quality || 'HD'}</span>
      <span class="h-url" title="${escapeAttr(h.url)}" onclick="loadFromHistory(${i})">${escapeHtml(shortUrl)}</span>
      <span class="h-time">${timeAgo}</span>
      <button class="h-del" onclick="deleteHistory(${i})" title="Remove from history">×</button>
    </div>`;
  }).join('');
}

function loadFromHistory(i) {
  const history = getHistory();
  if (!history[i]) return;
  urlInput.value = history[i].url;
  clearBtn.style.display = '';
  clearResult();
  showToast('✅ URL loaded — click "Get Download Link"!');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteHistory(i) {
  const history = getHistory();
  history.splice(i, 1);
  setHistory(history);
  renderHistory();
  showToast('🗑️ Removed from history');
}

clearHistoryBtn.addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  showToast('🗑️ History cleared');
});

/* ─── Time ago helper ─── */
function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const min  = Math.floor(diff / 60000);
  const hr   = Math.floor(diff / 3600000);
  const day  = Math.floor(diff / 86400000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  if (hr  < 24) return `${hr}h ago`;
  return `${day}d ago`;
}

/* ─── XSS safe helpers ─── */
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ═══════════════════════════════════════════════════════════
   FAQ
═══════════════════════════════════════════════════════════ */
const FAQS = [
  {
    q: 'What types of Instagram content can I download?',
    a: 'ReelSnap supports downloading Instagram Reels and video posts. The post must be publicly accessible — private accounts cannot be downloaded.'
  },
  {
    q: 'Is ReelSnap completely free to use?',
    a: 'Yes! ReelSnap is 100% free with no hidden fees, no account required, and no usage limits. Simply paste the link and download.'
  },
  {
    q: 'Does the downloaded video have a watermark?',
    a: 'No. ReelSnap downloads the original video file directly from Instagram\'s CDN — no watermarks are added.'
  },
  {
    q: 'Why is my download link not working?',
    a: 'Instagram CDN links expire after a few minutes. If a link fails, simply paste the URL again and generate a fresh download link.'
  },
  {
    q: 'Can I download videos from private Instagram accounts?',
    a: 'No. ReelSnap can only access publicly available content. Private videos require the account owner\'s explicit permission to download.'
  },
  {
    q: 'Is it legal to download Instagram videos?',
    a: 'Downloading for personal use is generally accepted, but redistribution or commercial use of downloaded content without the creator\'s permission may violate copyright law. Always respect content creators\' rights.'
  },
  {
    q: 'Does ReelSnap work on mobile?',
    a: 'Yes! ReelSnap is fully optimized for mobile browsers on both iOS and Android. Copy the link from the Instagram app, then paste it into ReelSnap.'
  },
  {
    q: 'How do I copy an Instagram reel link?',
    a: 'Open the reel in Instagram, tap the three-dot menu (⋯) or the share arrow, then tap "Copy Link". Then paste that link into ReelSnap.'
  }
];

(function buildFAQ() {
  const list = document.getElementById('faqList');
  list.innerHTML = FAQS.map((f, i) => `
    <div class="faq-item" id="faq${i}">
      <button class="faq-q" onclick="toggleFAQ(${i})">
        ${escapeHtml(f.q)}
        <svg class="faq-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="faq-a"><div class="faq-a-inner">${f.a}</div></div>
    </div>
  `).join('');
})();

function toggleFAQ(i) {
  const item = document.getElementById(`faq${i}`);
  const wasOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('open'));
  if (!wasOpen) item.classList.add('open');
}

/* ═══════════════════════════════════════════════════════════
   NAVBAR / HAMBURGER
═══════════════════════════════════════════════════════════ */
hamburger.addEventListener('click', () => {
  mobileMenu.classList.toggle('open');
});

// Close mobile menu on link click
document.querySelectorAll('.mobile-menu a').forEach(a => {
  a.addEventListener('click', () => mobileMenu.classList.remove('open'));
});

/* ─── Sticky navbar highlight ─── */
const sections = ['downloader', 'history-section', 'how-it-works', 'faq'];
window.addEventListener('scroll', () => {
  const y = window.scrollY + 100;
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const link = document.querySelector(`.nav-link[href="#${id}"]`);
    if (!link) return;
    const inView = el.offsetTop <= y && (el.offsetTop + el.offsetHeight) > y;
    link.classList.toggle('active', inView);
  });

  // Scroll-to-top button
  scrollTopBtn.classList.toggle('show', window.scrollY > 500);
}, { passive: true });

/* ─── Smooth scroll for anchor links ─── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth' }); }
  });
});

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
renderHistory();
