const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const UPSTREAM = 'https://chungdoi.com';
const RSVPS_FILE = path.join(__dirname, 'rsvps.json');

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

function getRsvps() {
  try {
    if (fs.existsSync(RSVPS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(RSVPS_FILE, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error reading rsvps.json:', e);
  }
  return [];
}

function saveRsvps(data) {
  try {
    fs.writeFileSync(RSVPS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing rsvps.json:', e);
  }
}

const server = http.createServer((req, res) => {
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

  // 1. API Routes for RSVP Management
  if ((pathname === '/api/rsvps' || pathname === '/api/rsvp') && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.end(JSON.stringify(getRsvps()));
    return;
  }

  if ((pathname === '/api/rsvp' || pathname === '/api/rsvps') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const item = {
          id: parsed.id || ('rsvp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6)),
          name: (parsed.name || 'Anonymous Guest').toString().trim(),
          attending: parsed.attending === 'no' ? 'no' : 'yes',
          count: parsed.attending === 'no' ? 0 : Math.max(1, parseInt(parsed.count, 10) || 1),
          message: (parsed.message || '').toString().trim(),
          createdAt: parsed.createdAt || new Date().toISOString()
        };
        const list = getRsvps();
        const existingIdx = list.findIndex(r => String(r.id) === String(item.id));
        if (existingIdx !== -1) {
          list[existingIdx] = item;
        } else {
          list.unshift(item);
        }
        saveRsvps(list);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, item, list }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (
    (pathname.startsWith('/api/rsvp/') || pathname.startsWith('/api/rsvps/') || pathname === '/api/rsvp' || pathname === '/api/rsvps') &&
    req.method === 'DELETE'
  ) {
    let id = urlObj.searchParams.get('id');
    if (!id && pathname.startsWith('/api/rsvp/')) {
      id = pathname.replace('/api/rsvp/', '');
    } else if (!id && pathname.startsWith('/api/rsvps/')) {
      id = pathname.replace('/api/rsvps/', '');
    }
    let list = getRsvps();
    if (id) {
      list = list.filter(r => String(r.id) !== String(id));
      saveRsvps(list);
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, list }));
    return;
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

  // 3. Local static files with CORRECT MIME TYPES
  const safeRelPath = pathname.replace(/^\/+/, '');
  const localPath = path.join(__dirname, safeRelPath);
  if (localPath.startsWith(__dirname) && fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    const ext = path.extname(localPath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=31536000'
    });
    fs.createReadStream(localPath).pipe(res);
    return;
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
  console.log(`Admin credentials: user 'admin' | pass 'adminsanjeev##'`);
  console.log(`=======================================================`);
});

