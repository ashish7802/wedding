// Vercel proxy for the Supabase RSVP Edge Function.
// This contains only a publishable key; the service-role key remains inside Supabase.
const SUPABASE_URL = 'https://wlafthdxxloueokfqjvu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ec5TaTTISoZzgZ3sl-Igzg_8Xx77BJB';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Vary', 'Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const queryIndex = (req.url || '').indexOf('?');
  const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
  const target = SUPABASE_URL + '/functions/v1/wedding-rsvps' + query;
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  let body;
  if (req.method === 'POST' && req.body !== undefined) body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  try {
    const upstream = await fetch(target, { method: req.method, headers, body });
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.status(upstream.status).send(await upstream.text());
  } catch (error) {
    console.error('RSVP upstream request failed:', error);
    return res.status(502).json({ error: 'RSVP service temporarily unavailable. Please try again.' });
  }
};
