// Request handling shared by every Edge Function: CORS, POST-only JSON, size limit and generic errors.
// Error messages never say more than the user needs; details go to the function log only.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

// Only these origins may call the functions from a browser (the GitHub Pages site and the local dev server).
const ALLOWED_ORIGINS = ["https://theogoescoding.github.io", "http://localhost:8000"];
const MAX_BODY_BYTES = 1_000_000;

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export const GENERIC_ERROR = "Something went wrong. Please try again.";

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { "Vary": "Origin" };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "authorization, x-client-info, apikey, content-type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

function reply(origin: string | null, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export type Body = Record<string, unknown>;

// Runs handler(body, req) for POST requests and turns what it returns (or throws) into a JSON response.
// Requests from a browser on any other origin are refused. Requests without an Origin (tests, curl) are allowed:
// CORS only protects browsers, and every function checks its own credentials anyway.
export function serve(handler: (body: Body, req: Request) => Promise<unknown>) {
  Deno.serve(async (req) => {
    const origin = req.headers.get("Origin");
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return reply(null, 403, { error: "This site may not use this service." });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (req.method !== "POST") return reply(origin, 405, { error: GENERIC_ERROR });
    try {
      const text = await req.text();
      if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "That was too much to send at once.");
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw new HttpError(400, GENERIC_ERROR); }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, GENERIC_ERROR);
      return reply(origin, 200, (await handler(body as Body, req)) ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return reply(origin, e.status, { error: e.message, ...e.extra });
      console.error(e instanceof Error ? e.message : e);
      return reply(origin, 500, { error: GENERIC_ERROR });
    }
  });
}

// The service-role client. Only ever used inside the Edge Functions.
let client: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!client) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

// Throws on a database error, logging only its code and message.
export function check<T>(r: { data: T; error: { code?: string; message: string } | null }, what: string): T {
  if (r.error) throw new Error(what + ": " + (r.error.code || "") + " " + r.error.message);
  return r.data;
}

// The caller's IP address, as the Supabase gateway passes it on.
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") || "unknown").trim();
}
