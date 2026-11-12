const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const UPSTREAM = 'https://chungdoi.com';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4'
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(urlObj.pathname);
  const isOpen = urlObj.searchParams.get('open') === '1';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // Shared Supabase RSVP API for local development and Vercel parity.
  if (pathname === '/api/rsvps' || pathname === '/api/rsvp' || pathname.startsWith('/api/rsvps/') || pathname.startsWith('/api/rsvp/')) {
    let query = urlObj.search;
    if (!query && (pathname.startsWith('/api/rsvp/') || pathname.startsWith('/api/rsvps/'))) {
      const id = pathname.replace(/^\/api\/rsvps?\//, '');
      if (id) query = '?id=' + encodeURIComponent(id);
    }
    let rawBody = '';
    if (req.method === 'POST') {
      req.on('data', chunk => { rawBody += chunk; });
      req.on('end', async () => { await forwardRsvpRequest(req, res, query, rawBody); });
      return;
    }
    if (req.method === 'GET' || req.method === 'DELETE') {
      await forwardRsvpRequest(req, res, query);
      return;
    }
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  async function forwardRsvpRequest(request, response, query, body) {
    const supabaseUrl = 'https://wlafthdxxloueokfqjvu.supabase.co';
    const publishableKey = 'sb_publishable_ec5TaTTISoZzgZ3sl-Igzg_8Xx77BJB';
    const headers = { apikey: publishableKey, 'Content-Type': 'application/json' };
    if (request.headers.authorization) headers.Authorization = request.headers.authorization;
    try {
      const upstream = await fetch(supabaseUrl + '/functions/v1/wedding-rsvps' + (query || ''), { method: request.method, headers, body });
      const text = await upstream.text();
      response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
      response.end(text);
    } catch (error) {
      console.error('RSVP upstream request failed:', error);
      response.writeHead(502, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'RSVP service temporarily unavailable. Please try again.' }));
    }
  }
  // 2. Root / Invitation HTML paths
  if (
    pathname === '/' ||
    pathname === '/index.html' ||
    pathname === '/open' ||
    pathname === '/open.html' ||
    pathname === '/i/drshubhanil-drnidhi-love'
  ) {
    const fileToServe = (isOpen || pathname === '/open' || pathname === '/open.html') ? 'open.html' : 'index.html';
    const filePath = path.join(__dirname, fileToServe);

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Error loading invitation file: ' + err.message);
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(content);
    });
    return;
  }

  // 3. Local static files with CORRECT MIME TYPES and Range support
  const safeRelPath = pathname.replace(/^\/+/, '');
  const localPath = path.join(__dirname, safeRelPath);
  if (localPath.startsWith(__dirname) && fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    const ext = path.extname(localPath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    const stat = fs.statSync(localPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(localPath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType,
        'Access-Control-Allow-Origin': '*'
      });
      file.pipe(res);
      return;
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(localPath).pipe(res);
      return;
    }
  }

  // 4. Proxy Next.js assets to upstream ChungDoi as fallback
  const proxyUrl = new URL(req.url, UPSTREAM);
  const options = {
    hostname: proxyUrl.hostname,
    port: 443,
    path: proxyUrl.pathname + proxyUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: proxyUrl.hostname,
      referer: 'https://chungdoi.com/i/drshubhanil-drnidhi-love',
      origin: 'https://chungdoi.com'
    }
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`Proxy error for ${req.url}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway: ' + err.message);
    }
  });

  if (req.method === 'POST' || req.method === 'PUT') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`Wedding invitation server running at:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`👉 http://localhost:${PORT}/open  (Direct to opened card)`);
  console.log(`=======================================================`);
});

