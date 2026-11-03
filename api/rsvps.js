// Vercel Serverless Function for RSVP management
const fs = require('fs');
const path = require('path');

const TMP_RSVPS_FILE = '/tmp/wedding_rsvps.json';
const SEED_RSVPS_FILE = path.join(process.cwd(), 'rsvps.json');

const DEFAULT_SEED = [
  {
    id: '1',
    name: 'Dr. Rajesh & Family',
    attending: 'yes',
    count: 4,
    message: 'Heartiest congratulations to Dr. Shubhanil & Dr. Nidhi!',
    createdAt: '2026-11-01T10:00:00.000Z'
  },
  {
    id: '2',
    name: 'Pooja Verma',
    attending: 'yes',
    count: 2,
    message: 'Excited to attend the wedding in Lucknow!',
    createdAt: '2026-11-01T11:30:00.000Z'
  }
];

let memoryRsvps = null;

function loadRsvps() {
  if (Array.isArray(memoryRsvps)) {
    return memoryRsvps;
  }
  try {
    if (fs.existsSync(TMP_RSVPS_FILE)) {
      memoryRsvps = JSON.parse(fs.readFileSync(TMP_RSVPS_FILE, 'utf8'));
      if (Array.isArray(memoryRsvps)) return memoryRsvps;
    }
  } catch (e) {}

  try {
    if (fs.existsSync(SEED_RSVPS_FILE)) {
      memoryRsvps = JSON.parse(fs.readFileSync(SEED_RSVPS_FILE, 'utf8'));
      if (Array.isArray(memoryRsvps)) {
        saveRsvps(memoryRsvps);
        return memoryRsvps;
      }
    }
  } catch (e) {}

  memoryRsvps = [...DEFAULT_SEED];
  saveRsvps(memoryRsvps);
  return memoryRsvps;
}

function saveRsvps(list) {
  memoryRsvps = list;
  try {
    fs.writeFileSync(TMP_RSVPS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {}
  try {
    if (fs.existsSync(SEED_RSVPS_FILE)) {
      fs.writeFileSync(SEED_RSVPS_FILE, JSON.stringify(list, null, 2), 'utf8');
    }
  } catch (e) {}
}

function parseRequestBody(req) {
  return new Promise((resolve) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'string') {
        try {
          return resolve(JSON.parse(req.body));
        } catch (e) {
          return resolve({});
        }
      }
      if (typeof req.body === 'object') {
        return resolve(req.body);
      }
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const list = loadRsvps();

  if (req.method === 'GET') {
    return res.status(200).json(list);
  }

  if (req.method === 'POST') {
    const body = await parseRequestBody(req);
    const newItem = {
      id: body.id || 'rsvp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      name: (body.name || 'Anonymous Guest').toString().trim(),
      attending: body.attending === 'no' ? 'no' : 'yes',
      count: body.attending === 'no' ? 0 : Math.max(1, parseInt(body.count, 10) || 1),
      message: (body.message || '').toString().trim(),
      createdAt: body.createdAt || new Date().toISOString()
    };

    const existingIdx = list.findIndex((r) => r.id === newItem.id);
    if (existingIdx !== -1) {
      list[existingIdx] = newItem;
    } else {
      list.unshift(newItem);
    }
    saveRsvps(list);
    return res.status(201).json({ success: true, item: newItem, list });
  }

  if (req.method === 'DELETE') {
    let id = req.query && req.query.id;
    if (!id && req.url) {
      try {
        const u = new URL(req.url, 'http://localhost');
        id = u.searchParams.get('id');
        if (!id && u.pathname.startsWith('/api/rsvp/')) {
          id = decodeURIComponent(u.pathname.replace('/api/rsvp/', ''));
        } else if (!id && u.pathname.startsWith('/api/rsvps/')) {
          id = decodeURIComponent(u.pathname.replace('/api/rsvps/', ''));
        }
      } catch (e) {}
    }
    if (!id) {
      const body = await parseRequestBody(req);
      id = body && body.id;
    }

    if (id) {
      const updated = list.filter((r) => String(r.id) !== String(id));
      saveRsvps(updated);
      return res.status(200).json({ success: true, list: updated });
    }
    return res.status(400).json({ error: 'Missing RSVP id' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};


