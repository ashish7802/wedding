// Vercel Serverless Function for RSVP management
let memoryRsvps = [
  { id: '1', name: 'Dr. Anand Kumar', attending: 'yes', count: 2, message: 'Heartiest congratulations! Looking forward to attending the celebration.', createdAt: new Date().toISOString() },
  { id: '2', name: 'Pooja Verma', attending: 'yes', count: 2, message: 'Excited to attend the wedding in Lucknow!', createdAt: new Date().toISOString() }
];

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json(memoryRsvps);
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const newItem = {
      id: body.id || 'rsvp-' + Date.now(),
      name: body.name || 'Anonymous Guest',
      attending: body.attending || 'yes',
      count: parseInt(body.count) || 1,
      message: body.message || '',
      createdAt: new Date().toISOString()
    };
    memoryRsvps.unshift(newItem);
    return res.status(201).json({ success: true, item: newItem });
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (id) {
      memoryRsvps = memoryRsvps.filter(r => r.id !== id);
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
