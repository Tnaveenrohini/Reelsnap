/* ═══════════════════════════════════════════════════════════
   ReelSnap — Express.js Backend Server
   Instagram Video Downloader API

   Primary:  instagram-downloader-v2-scraper-reels-igtv-posts-stories.p.rapidapi.com (RapidAPI)
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
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─── RapidAPI credentials (from .env or fallback) ─── */
const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'instagram-downloader-v2-scraper-reels-igtv-posts-stories.p.rapidapi.com';
const RAPIDAPI_URL  = process.env.RAPIDAPI_URL || 'https://instagram-downloader-v2-scraper-reels-igtv-posts-stories.p.rapidapi.com/get-post';

if (!RAPIDAPI_KEY) {
  console.warn('⚠️  WARNING: RAPIDAPI_KEY not found in environment variables!');
  console.warn('Please set RAPIDAPI_KEY in your .env file');
}

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
 * Normalise an Instagram URL — ensure trailing slash, strip query params
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

/**
 * Extracts the shortcode from an Instagram URL
 * @param {string} url
 * @returns {string|null}
 */
function extractShortcode(url) {
  const match = url.match(/\/(reel|p|tv)\/([A-Za-z0-9_\-]+)/);
  return match ? match[2] : null;
}

/* ═══════════════════════════════════════════════════════════
   PRIMARY: instagram-downloader-v2-scraper RapidAPI
═══════════════════════════════════════════════════════════ */

/**
 * Call the RapidAPI endpoint to fetch Instagram media.
 * Sends { url } as query parameter and handles response.
 *
 * @param {string} instagramUrl
 * @returns {Promise<Object>}
 */
async function fetchViaRapidAPI(instagramUrl) {
  if (!RAPIDAPI_KEY) {
    throw new Error('RapidAPI key not configured. Please set RAPIDAPI_KEY in .env');
  }

  const normUrl = normaliseURL(instagramUrl);
  console.log(`[RapidAPI] Requesting: ${normUrl}`);

  const apiRes = await axios.get(RAPIDAPI_URL, {
    params: { url: normUrl },
    headers: {
      'Content-Type':    'application/json',
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key':  RAPIDAPI_KEY
    },
    timeout: 20000
  });

  const d = apiRes.data;
  console.log('[RapidAPI] raw response:', JSON.stringify(d).slice(0, 600));

  /* ── Parse response and extract video data ── */
  if (d && typeof d === 'object') {
    
    // Direct download URL in response
    if (d.download_url || d.video_url || d.url) {
      return {
        status:     true,
        download:   d.download_url || d.video_url || d.url,
        downloadSD: d.download_url_sd || d.video_url_sd || null,
        thumbnail:  d.thumbnail_url || d.thumbnail || d.image_url || '',
        quality:    d.quality || 'HD',
        title:      d.title || d.caption || 'Instagram Video',
        author:     d.author || d.username || d.user?.username || ''
      };
    }

    // Wrapped in data object
    if (d.data && typeof d.data === 'object') {
      const media = d.data;
      return {
        status:     true,
        download:   media.download_url || media.video_url || media.url || '',
        downloadSD: media.download_url_sd || null,
        thumbnail:  media.thumbnail_url || media.thumbnail || media.image_url || '',
        quality:    media.quality || 'HD',
        title:      media.title || media.caption || 'Instagram Video',
        author:     media.author || media.username || ''
      };
    }

    // Array of URLs
    if (Array.isArray(d) && d.length > 0) {
      const first = d[0];
      return {
        status:     true,
        download:   first.url || first.download_url || first,
        downloadSD: null,
        thumbnail:  first.thumbnail || '',
        quality:    'HD',
        title:      first.title || 'Instagram Video',
        author:     first.author || ''
      };
    }
  }

  throw new Error(
    'RapidAPI returned an unrecognised response shape. ' +
    'The post may be private, deleted, or the API subscription may have expired.\n' +
    'Raw: ' + JSON.stringify(d).slice(0, 300)
  );
}

/* ═══════════════════════════════════════════════════════════
   FALLBACK: page-scrape for video URL
═══════════════════════════════════════════════════════════ */

/**
 * Scrapes the Instagram page source and extracts a video URL.
 * @param {string} url — normalised Instagram URL
 * @returns {Promise<string>}
 */
async function scrapeVideoUrl(url) {
  const userAgents = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];

  for (const ua of userAgents) {
    try {
      const res = await axios.get(url, {
        timeout: 18000,
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Referer': 'https://www.instagram.com/',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none'
        },
        maxRedirects: 10,
        validateStatus: () => true
      });

      const html = res.data;

      const patterns = [
        /"video_url":"(https:[^"]+\.mp4[^"]*)"/,
        /video_url\\?":"(https:[^"\\]+\.mp4[^"\\]*)"/,
        /"contentUrl":"(https:[^"]+\.mp4[^"]*)"/,
        /property="og:video"\s+content="([^"]+)"/,
        /og:video:url"\s+content="([^"]+)"/,
        /src="(https:\/\/[^"]+\.mp4[^"]*)"/
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
    } catch (err) {
      console.warn(`[scrape] User-Agent failed: ${ua.slice(0, 50)}...`);
    }
  }

  throw new Error(
    'Could not locate video URL in page source. ' +
    'The post may be private or require login.'
  );
}

/**
 * Fetch Instagram oEmbed metadata (title, author, thumbnail).
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
          'Accept': 'application/json'
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
 * @param {string} rawUrl — user-supplied URL
 * @returns {Promise<Object>}
 */
async function fetchInstagramData(rawUrl) {
  const normUrl = normaliseURL(rawUrl);

  /* ── Method 1: RapidAPI (primary) ── */
  try {
    console.log(`[Method 1] RapidAPI → ${normUrl}`);
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
  res.json({ status: 'ok', version: '2.1.0', timestamp: new Date().toISOString() });
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

/* ── GET /proxy-download ── */
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
  console.log('║          ReelSnap  v2.1  🎬              ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Server  →  http://localhost:${PORT}         ║`);
  console.log('║  POST /download       — extract video    ║');
  console.log('║  GET  /proxy-download — stream download  ║');
  console.log('║  GET  /health         — health check     ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log(`  RapidAPI host: ${RAPIDAPI_HOST}`);
  console.log(`  RapidAPI key:  ${RAPIDAPI_KEY ? RAPIDAPI_KEY.slice(0, 8) + '...' + RAPIDAPI_KEY.slice(-4) : 'NOT SET'}\n`);
});

module.exports = app;
