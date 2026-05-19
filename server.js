/* ═══════════════════════════════════════════════════════════
   ReelSnap — Express.js Backend Server
   Instagram Video Downloader API
   
   Endpoints:
     POST /download         — Extract Instagram video/reel download URL
     GET  /proxy-download   — Proxy video download (handles CORS)
     GET  /health           — Server health check
═══════════════════════════════════════════════════════════ */

'use strict';

const express  = require('express');
const cors     = require('cors');
const axios    = require('axios');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─── MIDDLEWARE ─── */
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ─── Serve static frontend files ─── */
app.use(express.static(path.join(__dirname)));

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */

/**
 * Validates an Instagram URL
 * @param {string} url
 * @returns {boolean}
 */
function isValidInstagramURL(url) {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace('www.', '');
    if (host !== 'instagram.com') return false;
    return /^\/(reel|p|tv)\//i.test(u.pathname);
  } catch {
    return false;
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

/**
 * Fetches Instagram post data using the public oEmbed API + direct scraping fallback
 * @param {string} url
 * @returns {Promise<Object>}
 */
async function fetchInstagramData(url) {
  const cleanUrl = url.split('?')[0].replace(/\/$/, '');
  const shortcode = extractShortcode(cleanUrl);
  
  if (!shortcode) throw new Error('Could not parse Instagram URL shortcode');

  /* ── Method 1: instagram-url-direct package ── */
  try {
    const igDirect = require('instagram-url-direct');
    const result   = await igDirect(cleanUrl);

    if (result && result.url_list && result.url_list.length > 0) {
      return {
        status:    true,
        download:  result.url_list[0],
        downloadSD: result.url_list[1] || null,
        thumbnail: result.thumbnail_url || result.url_list[0].replace(/\.mp4.*/, '.jpg'),
        quality:   'HD',
        title:     result.title || 'Instagram Video',
        author:    result.author_name || ''
      };
    }
  } catch (err) {
    console.warn('[Method 1] instagram-url-direct failed:', err.message);
  }

  /* ── Method 2: Public Instagram oEmbed API for metadata ── */
  try {
    const oembedUrl = `https://www.instagram.com/oembed/?url=${encodeURIComponent(cleanUrl)}&maxwidth=640`;
    const oembedRes = await axios.get(oembedUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; bot/1.0)',
        'Accept': 'application/json'
      }
    });

    const oembed   = oembedRes.data;
    const thumb    = oembed.thumbnail_url || '';
    const author   = oembed.author_name  || '';
    const title    = oembed.title        || 'Instagram Video';

    /* ── Method 3: Scrape the media page for video URL ── */
    const mediaUrl = await scrapeVideoUrl(cleanUrl, shortcode);

    return {
      status:    true,
      download:  mediaUrl,
      downloadSD: null,
      thumbnail: thumb,
      quality:   'HD',
      title,
      author
    };
  } catch (err) {
    console.warn('[Method 2/3] oEmbed + scrape failed:', err.message);
  }

  /* ── Method 4: Fallback via third-party API ── */
  return await fetchViaFallbackAPI(cleanUrl, shortcode);
}

/**
 * Scrapes Instagram page to extract video src URL
 * @param {string} url
 * @param {string} shortcode
 * @returns {Promise<string>}
 */
async function scrapeVideoUrl(url, shortcode) {
  const fetchUrl = url.endsWith('/') ? url : url + '/';
  const res = await axios.get(fetchUrl, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Referer': 'https://www.instagram.com/'
    },
    maxRedirects: 5
  });

  const html = res.data;

  // Search for video_url in the page JSON data
  const patterns = [
    /"video_url":"([^"]+)"/,
    /video_url":"(https:\/\/[^"]+\.mp4[^"]*)"/,
    /"contentUrl":"([^"]+\.mp4[^"]*)"/,
    /property="og:video" content="([^"]+)"/,
    /og:video:url" content="([^"]+)"/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
    }
  }

  throw new Error('Video URL not found in page source');
}

/**
 * Fallback: use a public downloader API
 * @param {string} url
 * @param {string} shortcode
 * @returns {Promise<Object>}
 */
async function fetchViaFallbackAPI(url, shortcode) {
  // Try RapidAPI-style public endpoint
  const endpoints = [
    {
      url: `https://instagram-downloader-download-instagram-videos-stories1.p.rapidapi.com/get-info-rapidapi?url=${encodeURIComponent(url)}`,
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || '',
        'X-RapidAPI-Host': 'instagram-downloader-download-instagram-videos-stories1.p.rapidapi.com'
      }
    }
  ];

  for (const ep of endpoints) {
    try {
      if (!ep.headers['X-RapidAPI-Key']) continue;
      const res  = await axios.get(ep.url, { headers: ep.headers, timeout: 10000 });
      const data = res.data;
      if (data && (data.video_url || data.url)) {
        return {
          status:    true,
          download:  data.video_url || data.url,
          downloadSD: data.video_url_sd || null,
          thumbnail: data.thumbnail || data.cover || '',
          quality:   'HD',
          title:     data.title || 'Instagram Video',
          author:    data.username || data.author || ''
        };
      }
    } catch (err) {
      console.warn('[Fallback API] failed:', err.message);
    }
  }

  throw new Error(
    'Unable to extract video. The post may be private, age-restricted, or Instagram has changed their API. ' +
    'Try again in a few seconds or use a different post URL.'
  );
}

/* ═══════════════════════════════════════════════════════════
   ROUTES
═══════════════════════════════════════════════════════════ */

/* ── Health check ── */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

/* ── POST /download — Main download endpoint ── */
app.post('/download', async (req, res) => {
  const { url } = req.body;

  // ─ Input validation ─
  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      status:  false,
      message: 'Missing or invalid "url" field in request body'
    });
  }

  const cleanUrl = url.trim();

  if (!isValidInstagramURL(cleanUrl)) {
    return res.status(400).json({
      status:  false,
      message: 'Invalid Instagram URL. Must be a reel, post, or TV link. Example: https://www.instagram.com/reel/SHORTCODE/'
    });
  }

  console.log(`[download] Processing: ${cleanUrl}`);

  try {
    const data = await fetchInstagramData(cleanUrl);
    console.log(`[download] ✓ Success for: ${cleanUrl}`);
    return res.json(data);

  } catch (err) {
    console.error(`[download] ✗ Error: ${err.message}`);
    return res.status(422).json({
      status:  false,
      message: err.message || 'Failed to extract video. Please ensure the post is public and try again.'
    });
  }
});

/* ── GET /proxy-download — Proxy video download to handle CORS ── */
app.get('/proxy-download', async (req, res) => {
  const { url, filename } = req.query;

  if (!url) {
    return res.status(400).json({ status: false, message: 'Missing url parameter' });
  }

  // Only allow instagram CDN URLs for security
  const allowedHosts = ['instagram.com', 'cdninstagram.com', 'scontent', 'fbcdn.net'];
  let isAllowed = false;
  try {
    const parsed = new URL(url);
    isAllowed = allowedHosts.some(h => parsed.hostname.includes(h));
  } catch { /* invalid url */ }

  if (!isAllowed) {
    return res.status(403).json({ status: false, message: 'URL not allowed' });
  }

  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent':  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':     'https://www.instagram.com/',
        'Origin':      'https://www.instagram.com'
      }
    });

    const safeFilename = (filename || `reelsnap_${Date.now()}.mp4`).replace(/[^a-zA-Z0-9._\-]/g, '_');
    const contentType  = response.headers['content-type'] || 'video/mp4';
    const contentLen   = response.headers['content-length'];

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    if (contentLen) res.setHeader('Content-Length', contentLen);
    res.setHeader('Cache-Control', 'no-cache');

    response.data.pipe(res);

    response.data.on('error', (err) => {
      console.error('[proxy] stream error:', err.message);
      if (!res.headersSent) res.status(500).end();
    });

  } catch (err) {
    console.error('[proxy] failed:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ status: false, message: 'Proxy download failed: ' + err.message });
    }
  }
});

/* ── 404 handler ── */
app.use((req, res) => {
  res.status(404).json({ status: false, message: 'Route not found' });
});

/* ── Global error handler ── */
app.use((err, req, res, next) => {
  console.error('[server error]', err);
  res.status(500).json({ status: false, message: 'Internal server error' });
});

/* ═══════════════════════════════════════════════════════════
   START SERVER
═══════════════════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`\n  ██████╗ ███████╗███████╗██╗     ███████╗███╗   ██╗ █████╗ ██████╗ `);
  console.log(`  ██╔══██╗██╔════╝██╔════╝██║     ██╔════╝████╗  ██║██╔══██╗██╔══██╗`);
  console.log(`  ██████╔╝█████╗  █████╗  ██║     ███████╗██╔██╗ ██║███████║██████╔╝`);
  console.log(`  ██╔══██╗██╔══╝  ██╔══╝  ██║     ╚════██║██║╚██╗██║██╔══██║██╔═══╝ `);
  console.log(`  ██║  ██║███████╗███████╗███████╗███████║██║ ╚████║██║  ██║██║     `);
  console.log(`  ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝     `);
  console.log(`\n  🚀 Server running at http://localhost:${PORT}`);
  console.log(`  📦 POST /download       — Extract Instagram video`);
  console.log(`  📥 GET  /proxy-download — Proxy video download`);
  console.log(`  💚 GET  /health         — Health check\n`);
});

module.exports = app;
