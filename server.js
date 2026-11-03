const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const UPSTREAM = 'https://chungdoi.com';

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = urlObj.pathname;
  const isOpen = urlObj.searchParams.get('open') === '1';

  // 1. Root / Invitation HTML paths
  if (pathname === '/' || pathname === '/index.html' || pathname === '/i/drshubhanil-drnidhi-love') {
    const fileToServe = isOpen ? 'open.html' : 'index.html';
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

  // 2. Check if file exists locally
  const localPath = path.join(__dirname, pathname);
  if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    fs.createReadStream(localPath).pipe(res);
    return;
  }

  // 3. Proxy all Next.js assets, CSS, JS chunks, fonts, images to upstream ChungDoi
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

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`Wedding invitation server running at:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`👉 http://localhost:${PORT}/?open=1  (Direct to opened card)`);
  console.log(`Proxying all Next.js chunks, fonts, and assets to ${UPSTREAM}`);
  console.log(`=======================================================`);
});
