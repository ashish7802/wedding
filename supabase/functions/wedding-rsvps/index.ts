const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const encoder = new TextEncoder();
const SESSION_TTL_SECONDS = 8 * 60 * 60;
function base64Url(bytes: Uint8Array): string { let binary = ""; bytes.forEach((byte) => binary += String.fromCharCode(byte)); return btoa(binary).replace(/[+]/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function fromBase64Url(value: string): Uint8Array { const normalized = value.replace(/-/g, "+").replace(/_/g, "/"); const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
async function hmacKey(secret: string) { return await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
async function issueSession(secret: string): Promise<string> { const payload = base64Url(encoder.encode(JSON.stringify({ role: "admin", exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }))); const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload))); return payload + "." + base64Url(signature); }
async function isAdmin(req: Request, secret: string): Promise<boolean> { const authorization = req.headers.get("authorization") || ""; if (!authorization.startsWith("Bearer ")) return false; const parts = authorization.slice(7).split("."); if (parts.length !== 2) return false; try { const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0]))); if (payload.role !== "admin" || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000) return false; return await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64Url(parts[1]), encoder.encode(parts[0])); } catch { return false; } }
function mapRow(row: Record<string, unknown>) { return { id: String(row.id), name: row.name, attending: row.attending, count: row.guest_count, message: row.message, createdAt: row.created_at }; }
async function databaseRequest(path: string, init: RequestInit = {}) { const url = Deno.env.get("SUPABASE_URL"); const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); const key = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); const isNewSecretKey = Boolean(secretKeys.default); if (!url || !key) throw new Error("Supabase server credentials are not configured."); const authHeaders: Record<string, string> = { apikey: key, "Content-Type": "application/json" }; if (!isNewSecretKey) authHeaders.Authorization = "Bearer " + key; const response = await fetch(url + "/rest/v1/" + path, { ...init, headers: { ...authHeaders, ...(init.headers || {}) } }); const text = await response.text(); if (!response.ok) { console.error("Supabase database request failed", response.status, text); throw new Error("Database request failed."); } return text ? JSON.parse(text) : null; }
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const secret = Deno.env.get("WEDDING_SESSION_SECRET") || "";
    const adminUser = Deno.env.get("WEDDING_ADMIN_USERNAME") || "";
    const adminPass = Deno.env.get("WEDDING_ADMIN_PASSWORD") || "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.action === "login") {
        if (secret.length < 32 || !adminUser || !adminPass) return json({ error: "Admin login is not configured. Add WEDDING_ADMIN_USERNAME, WEDDING_ADMIN_PASSWORD and WEDDING_SESSION_SECRET in Supabase Edge Function secrets." }, 503);
        if (body.username !== adminUser || body.password !== adminPass) return json({ error: "Invalid username or password." }, 401);
        return json({ success: true, token: await issueSession(secret) });
      }
      if (body.admin === true && (secret.length < 32 || !await isAdmin(req, secret))) return json({ error: "Admin session expired. Please log in again." }, 401);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const attending = body.attending === "yes" || body.attending === "no" ? body.attending : "";
      const count = attending === "yes" ? Number.parseInt(String(body.count), 10) : 0;
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!name || name.length > 120 || !attending || message.length > 1000) return json({ error: "Please provide a valid name, RSVP status and message." }, 400);
      if (attending === "yes" && (!Number.isInteger(count) || count < 1 || count > 30)) return json({ error: "Guest count must be between 1 and 30." }, 400);
      const inserted = await databaseRequest("wedding_rsvps?select=id,name,attending,guest_count,message,created_at", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ name, attending, guest_count: count, message }) });
      return json({ success: true, item: mapRow(inserted[0]) }, 201);
    }
    if (req.method === "GET") {
      if (secret.length < 32 || !await isAdmin(req, secret)) return json({ error: "Admin login required." }, 401);
      const rows = await databaseRequest("wedding_rsvps?select=id,name,attending,guest_count,message,created_at&order=created_at.desc");
      return json(rows.map(mapRow));
    }
    if (req.method === "DELETE") {
      if (secret.length < 32 || !await isAdmin(req, secret)) return json({ error: "Admin login required." }, 401);
      const id = url.searchParams.get("id");
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "A valid RSVP id is required." }, 400);
      const deleted = await databaseRequest("wedding_rsvps?id=eq." + encodeURIComponent(id) + "&select=id", { method: "DELETE", headers: { Prefer: "return=representation" } });
      if (!Array.isArray(deleted) || deleted.length === 0) return json({ error: "RSVP entry was not found." }, 404);
      return json({ success: true });
    }
    return json({ error: "Method not allowed." }, 405);
  } catch (error) { console.error("Wedding RSVP function error:", error); return json({ error: "RSVP service temporarily unavailable. Please try again." }, 500); }
});
