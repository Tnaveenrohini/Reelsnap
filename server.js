/* ═══════════════════════════════════════════════════════════
   ReelSnap — Express.js Backend Server
   Instagram Video Downloader API

   Primary:  instagram-reels-downloader-api (RapidAPI)
   Fallback: Page scraping via axios

   Endpoints:
     POST /download         — Extract Instagram video/reel download URL
     GET  /proxy-download   — Proxy video download (handles CORS + forces save)
     GET  /health           — Server health check
═══════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─── RapidAPI credentials ─── */
const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY  || 'e1a114cc67msh944af74a26bd9edp1735d9jsn28ed5df7737f';
const RAPIDAPI_HOST = 'instagram-reels-downloader-api.p.rapidapi.com';
const RAPIDAPI_URL  = 'https://instagram-reels-downloader-api.p.rapidapi.com/download';

/* ═══════════════════════════════════════════════════════════
   MIDDLEWARE
═══════════════════════════════════════════════════════════ */
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ─── Serve static frontend files from the same directory ─── */
app.use(express.static(path.join(__dirname)));

/* ═══════════════════════════════════════════════════════════
   VALIDATION HELPERS
═══════════════════════════════════════════════════════════ */

/**
 * Validates that a string is a public Instagram reel/post/tv URL
 * @param {string} url
 * @returns {boolean}
 */
function isValidInstagramURL(url) {
  try {
    const u    = new URL(url.trim());
    const host = u.hostname.replace('www.', '');
    if (host !== 'instagram.com') return false;
    return /^\/(reel|p|tv)\//i.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Normalise an Instagram URL — ensure trailing slash, keep query params for RapidAPI
 * @param {string} url
 * @returns {string}
 */
function normaliseURL(url) {
  try {
    const u = new URL(url.trim());
    let clean = `${u.origin}${u.pathname}`;
    if (!clean.endsWith('/')) clean += '/';
    return clean;
  } catch {
    return url.trim();
  }
}

/* ═══════════════════════════════════════════════════════════
   PRIMARY: instagram-reels-downloader-api (RapidAPI)
═══════════════════════════════════════════════════════════ */

/**
 * Call the RapidAPI Instagram Reels Downloader endpoint.
 * Handles multiple response shapes returned by this API.
 *
 * @param {string} instagramUrl  — user-supplied URL (with or without query params)
 * @returns {Promise<Object>}
 */
async function fetchViaRapidAPI(instagramUrl) {
  const apiRes = await axios.get(RAPIDAPI_URL, {
    params: { url: instagramUrl },
    headers: {
      'Content-Type':    'application/json',
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key':  RAPIDAPI_KEY
    },
    timeout: 20000
  });

  const d = apiRes.data;
  console.log('[RapidAPI] raw response:', JSON.stringify(d).slice(0, 500));

  /* ── Shape A: { data: { download_url, thumbnail_url, ... } } ── */
  if (d && d.data && (d.data.download_url || d.data.url)) {
    return {
      status:     true,
      download:   d.data.download_url || d.data.url,
      downloadSD: d.data.download_url_sd || d.data.url_sd || null,
      thumbnail:  d.data.thumbnail_url || d.data.thumbnail || '',
      quality:    'HD',
      title:      d.data.title    || 'Instagram Video',
      author:     d.data.author   || d.data.username || ''
    };
  }

  /* ── Shape B: { urls: [{ url, quality }], thumbnail } ── */
  if (d && Array.isArray(d.urls) && d.urls.length > 0) {
    const hd = d.urls.find(u => /hd/i.test(u.quality || '')) || d.urls[0];
    const sd = d.urls.find(u => /sd/i.test(u.quality || '')) || null;
    return {
      status:     true,
      download:   hd.url || hd.download_url,
      downloadSD: sd ? (sd.url || sd.download_url) : null,
      thumbnail:  d.thumbnail || d.thumbnail_url || '',
      quality:    'HD',
      title:      d.title  || 'Instagram Video',
      author:     d.author || d.username || ''
    };
  }

  /* ── Shape C: flat { url / download_url / video_url, thumbnail } ── */
  if (d && (d.download_url || d.url || d.video_url)) {
    return {
      status:     true,
      download:   d.download_url || d.url || d.video_url,
      downloadSD: d.download_url_sd || d.url_sd || null,
      thumbnail:  d.thumbnail || d.thumbnail_url || d.cover || '',
      quality:    'HD',
      title:      d.title   || 'Instagram Video',
      author:     d.author  || d.username || ''
    };
  }

  /* ── Shape D: { result: { ... } } ── */
  if (d && d.result) {
    const r = d.result;
    return {
      status:     true,
      download:   r.download_url || r.url || r.video_url,
      downloadSD: r.download_url_sd || null,
      thumbnail:  r.thumbnail || r.thumbnail_url || '',
      quality:    'HD',
      title:      r.title  || 'Instagram Video',
      author:     r.author || r.username || ''
    };
  }

  /* ── Shape E: direct array ── */
  if (Array.isArray(d) && d.length > 0) {
    const hd = d.find(u => /hd/i.test(u.quality || '')) || d[0];
    return {
      status:     true,
      download:   hd.url || hd.download_url,
      downloadSD: null,
      thumbnail:  hd.thumbnail || '',
      quality:    'HD',
      title:      hd.title || 'Instagram Video',
      author:     hd.author || ''
    };
  }

  throw new Error(
    'RapidAPI returned an unrecognised response shape. ' +
    'The post may be private, deleted, or the API subscription may have expired.'
  );
}

/* ═══════════════════════════════════════════════════════════
   FALLBACK: page-scrape for video URL
═══════════════════════════════════════════════════════════ */

/**
 * Scrapes the Instagram page source and extracts a video URL.
 * Used only when the RapidAPI call fails.
 * @param {string} url — normalised Instagram URL (no query params)
 * @returns {Promise<string>}
 */
async function scrapeVideoUrl(url) {
  const res = await axios.get(url, {
    timeout: 18000,
    headers: {
      'User-Agent':      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control':   'no-cache',
      'Referer':         'https://www.instagram.com/'
    },
    maxRedirects: 5
  });

  const html = res.data;

  const patterns = [
    /"video_url":"(https:[^"]+\.mp4[^"]*)"/,
    /video_url\\?":"(https:[^"\\]+\.mp4[^"\\]*)"/,
    /"contentUrl":"(https:[^"]+\.mp4[^"]*)"/,
    /property="og:video"\s+content="([^"]+)"/,
    /og:video:url"\s+content="([^"]+)"/
  ];

  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) {
      return m[1]
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/')
        .replace(/\\/g, '');
    }
  }

  throw new Error(
    'Could not locate video URL in page source. ' +
    'The post may be private or require login.'
  );
}

/**
 * Fetch Instagram oEmbed metadata (title, author, thumbnail).
 * Public, no auth required. Used alongside the scrape fallback.
 * @param {string} url
 * @returns {Promise<{title:string, author:string, thumbnail:string}>}
 */
async function fetchOEmbedMeta(url) {
  try {
    const r = await axios.get(
      `https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}&maxwidth=640`,
      {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; bot/1.0)',
          'Accept':     'application/json'
        }
      }
    );
    return {
      title:     r.data.title         || 'Instagram Video',
      author:    r.data.author_name   || '',
      thumbnail: r.data.thumbnail_url || ''
    };
  } catch {
    return { title: 'Instagram Video', author: '', thumbnail: '' };
  }
}

/* ═══════════════════════════════════════════════════════════
   ORCHESTRATOR — primary RapidAPI → fallback scrape
═══════════════════════════════════════════════════════════ */

/**
 * Main entry: tries RapidAPI first, falls back to scraping.
 * @param {string} rawUrl — user-supplied URL (may contain query params)
 * @returns {Promise<Object>}
 */
async function fetchInstagramData(rawUrl) {
  const normUrl = normaliseURL(rawUrl);

  /* ── Method 1: RapidAPI (primary) ── */
  try {
    console.log(`[Method 1] RapidAPI → ${rawUrl}`);
    const result = await fetchViaRapidAPI(rawUrl);
    if (result && result.download) return result;
  } catch (err) {
    console.warn(`[Method 1] failed: ${err.message}`);
  }

  /* ── Method 2: Page scrape + oEmbed meta ── */
  try {
    console.log(`[Method 2] Scraping → ${normUrl}`);
    const [videoUrl, meta] = await Promise.all([
      scrapeVideoUrl(normUrl),
      fetchOEmbedMeta(normUrl)
    ]);
    return {
      status:     true,
      download:   videoUrl,
      downloadSD: null,
      thumbnail:  meta.thumbnail,
      quality:    'HD',
      title:      meta.title,
      author:     meta.author
    };
  } catch (err) {
    console.warn(`[Method 2] failed: ${err.message}`);
  }

  throw new Error(
    'Unable to extract this video. Please check:\n' +
    '• The post is publicly visible (not private/restricted)\n' +
    '• The URL is a reel, post, or TV link\n' +
    '• Your RapidAPI subscription is active\n\n' +
    'If the problem persists, try a different URL.'
  );
}

/* ═══════════════════════════════════════════════════════════
   ROUTES
═══════════════════════════════════════════════════════════ */

/* ── GET /health ── */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

/* ── POST /download ── */
app.post('/download', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      status:  false,
      message: 'Missing or invalid "url" in request body.'
    });
  }

  const rawUrl = url.trim();

  if (!isValidInstagramURL(rawUrl)) {
    return res.status(400).json({
      status:  false,
      message: 'Invalid Instagram URL. Supported formats: /reel/, /p/, /tv/. Example: https://www.instagram.com/reel/ABC123/'
    });
  }

  console.log(`\n[/download] ▶ ${rawUrl}`);

  try {
    const data = await fetchInstagramData(rawUrl);
    console.log(`[/download] ✓ download URL: ${String(data.download).slice(0, 80)}...`);
    return res.json(data);
  } catch (err) {
    console.error(`[/download] ✗ ${err.message}`);
    return res.status(422).json({ status: false, message: err.message });
  }
});

/* ── GET /proxy-download — streams the video through the server so the
       browser triggers a Save-As dialog instead of playing inline ── */
app.get('/proxy-download', async (req, res) => {
  const { url, filename } = req.query;

  if (!url) {
    return res.status(400).json({ status: false, message: 'Missing "url" query parameter.' });
  }

  /* Security: only proxy Instagram / Facebook CDN URLs */
  const ALLOWED_HOSTS = ['cdninstagram.com', 'instagram.com', 'fbcdn.net', 'scontent'];
  let allowed = false;
  try {
    const parsed = new URL(url);
    allowed = ALLOWED_HOSTS.some(h => parsed.hostname.includes(h));
  } catch { /* malformed URL */ }

  if (!allowed) {
    return res.status(403).json({ status: false, message: 'URL host not permitted for proxying.' });
  }

  try {
    const upstream = await axios({
      method:       'get',
      url,
      responseType: 'stream',
      timeout:      60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Referer':    'https://www.instagram.com/',
        'Origin':     'https://www.instagram.com'
      }
    });

    const safe = (filename || `reelsnap_${Date.now()}.mp4`).replace(/[^a-zA-Z0-9._\-]/g, '_');
    const ct   = upstream.headers['content-type']   || 'video/mp4';
    const cl   = upstream.headers['content-length'];

    res.setHeader('Content-Type',        ct);
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.setHeader('Cache-Control',       'no-cache');
    if (cl) res.setHeader('Content-Length', cl);

    upstream.data.pipe(res);
    upstream.data.on('error', err => {
      console.error('[proxy] stream error:', err.message);
      if (!res.headersSent) res.status(500).end();
    });

  } catch (err) {
    console.error('[proxy] error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ status: false, message: 'Upstream fetch failed: ' + err.message });
    }
  }
});

/* ── 404 ── */
app.use((_req, res) => {
  res.status(404).json({ status: false, message: 'Route not found.' });
});

/* ── Global error handler ── */
app.use((err, _req, res, _next) => {
  console.error('[uncaught]', err);
  res.status(500).json({ status: false, message: 'Internal server error.' });
});

/* ═══════════════════════════════════════════════════════════
   START
═══════════════════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║          ReelSnap  v2.0  🎬              ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Server  →  http://localhost:${PORT}         ║`);
  console.log('║  POST /download       — extract video    ║');
  console.log('║  GET  /proxy-download — stream download  ║');
  console.log('║  GET  /health         — health check     ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log(`  RapidAPI key: ${RAPIDAPI_KEY.slice(0, 8)}...${RAPIDAPI_KEY.slice(-4)}\n`);
});

module.exports = app;
