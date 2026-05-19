# ReelSnap — Instagram Video & Reel Downloader

A production-ready Instagram video downloader with a premium dark glassmorphism UI and a real Express.js backend.

---

## Features

- **Real Instagram video extraction** using `instagram-url-direct` with multiple scraping fallbacks
- **HD video downloads** via server-side proxy (no CORS issues)
- **Thumbnail preview** with download metadata
- **Download history** stored in localStorage (up to 30 entries)
- **Auto clipboard paste detection** on input focus
- **Progress loader** with animated progress bar
- **Toast notifications** for success and error states
- **URL validation** before any API call
- **Mobile-responsive** layout for all screen sizes
- **Sticky navbar** with active section highlighting
- **FAQ section** and "How It Works" guide
- **Animated gradient background** with glassmorphism cards
- **Neon glow buttons** and smooth hover effects

---

## Tech Stack

| Layer    | Technology              |
|----------|------------------------|
| Frontend | HTML5, CSS3, Vanilla JS |
| Backend  | Node.js + Express.js   |
| HTTP     | Axios                  |
| Scraping | instagram-url-direct   |

---

## Quick Start

### Prerequisites
- Node.js >= 16.0.0
- npm >= 8.0.0

### Installation

```bash
# 1. Navigate to the project folder
cd reelsnap

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

The server starts on **http://localhost:3000**.

Open your browser and go to **http://localhost:3000** — the frontend is served automatically.

### Development (auto-restart)
```bash
npm run dev
```

---

## API Reference

### `POST /download`

Extracts the download URL for an Instagram video or reel.

**Request:**
```json
{
  "url": "https://www.instagram.com/reel/SHORTCODE/"
}
```

**Success Response (200):**
```json
{
  "status": true,
  "download": "https://...cdn...mp4",
  "downloadSD": "https://...cdn...mp4",
  "thumbnail": "https://...cdn...jpg",
  "quality": "HD",
  "title": "Instagram Video",
  "author": "username"
}
```

**Error Response (400/422):**
```json
{
  "status": false,
  "message": "Error description"
}
```

---

### `GET /proxy-download`

Proxies a video download from Instagram CDN, adding proper headers to trigger browser save-as dialog.

**Query Parameters:**
- `url` — The Instagram CDN video URL (from `/download` response)
- `filename` — (optional) Desired output filename

**Example:**
```
GET /proxy-download?url=https://cdn...&filename=myvideo.mp4
```

---

### `GET /health`

Returns server status.

```json
{ "status": "ok", "version": "1.0.0", "timestamp": "2025-01-01T00:00:00Z" }
```

---

## Supported URL Formats

| Format        | Example |
|--------------|---------|
| Reels        | `https://www.instagram.com/reel/ABC123/` |
| Posts        | `https://www.instagram.com/p/ABC123/` |
| IGTV         | `https://www.instagram.com/tv/ABC123/` |

> **Note:** Only **public** posts can be downloaded. Private accounts are not supported.

---

## Optional: RapidAPI Key

For a more reliable fallback, add a RapidAPI key for the Instagram Downloader API:

```bash
RAPIDAPI_KEY=your_key_here node server.js
```

Get a free key at [rapidapi.com](https://rapidapi.com/ytjar/api/instagram-downloader-download-instagram-videos-stories1).

---

## Project Structure

```
reelsnap/
├── index.html      # Frontend — markup
├── style.css       # Frontend — premium dark UI styles
├── script.js       # Frontend — interactions, history, API calls
├── server.js       # Backend  — Express API server
├── package.json    # Dependencies & scripts
└── README.md       # This file
```

---

## Legal Notice

ReelSnap is not affiliated with Instagram or Meta Platforms. This tool is intended for personal use only. Always respect the intellectual property rights of content creators.

---

## License

MIT © 2025 ReelSnap
