// Helpers for the backend integration tests. They only run when TEST_BACKEND=1, and only against:
//   - the local stack (npx supabase start + npx supabase functions serve), the default; keys come from `supabase status`
//   - the test project, if tests/backend/config.local.json (git-ignored) names it: { "url", "anonKey", "serviceRoleKey" }
// Any other project is refused. Keys are kept in memory and never printed.

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const TEST_PROJECT_REF = "qiggrpwzfowhhcjrlauq";
const ROOT = path.join(__dirname, "..", "..");

function target() {
  const file = path.join(__dirname, "config.local.json");
  if (process.env.TEST_BACKEND_TARGET === "test-project") {
    if (!fs.existsSync(file)) throw new Error("tests/backend/config.local.json is missing");
    const c = JSON.parse(fs.readFileSync(file, "utf8"));
    if (new URL(c.url).hostname !== TEST_PROJECT_REF + ".supabase.co") throw new Error("Refusing: config.local.json is not the test project");
    return { kind: "test-project", url: c.url.replace(/\/$/, ""), anonKey: c.anonKey, serviceKey: c.serviceRoleKey };
  }
  const s = JSON.parse(execSync("npx supabase status -o json", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(s.API_URL)) throw new Error("Refusing: local status isn't on localhost");
  return { kind: "local", url: s.API_URL, anonKey: s.ANON_KEY, serviceKey: s.SERVICE_ROLE_KEY };
}

const T = target();

// Runs SQL in the local database container as postgres (local only: used to reset rate-limit counters between tests).
function localSql(sql) {
  if (T.kind !== "local") return null;
  const config = fs.readFileSync(path.join(ROOT, "supabase", "config.toml"), "utf8");
  const id = config.match(/^project_id\s*=\s*"([^"]+)"/m)[1];
  const r = spawnSync("docker", ["exec", "-i", "supabase_db_" + id, "psql", "-X", "-q", "-t", "-A", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8" });
  if (r.status !== 0) throw new Error("local SQL failed: " + r.stderr);
  return r.stdout.trim();
}

async function call(pathname, { method = "POST", key = T.anonKey, bearer, body, headers = {} } = {}) {
  const res = await fetch(T.url + pathname, {
    method,
    headers: Object.assign({ apikey: key, Authorization: "Bearer " + (bearer || key), "Content-Type": "application/json" }, headers),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

const fn = (name, body, opts = {}) => call("/functions/v1/" + name, Object.assign({ body }, opts));
const service = (pathname, opts = {}) => call(pathname, Object.assign({ key: T.serviceKey }, opts));

// A confirmed teacher with a teachers row, signed in. Returns { id, email, jwt }.
async function makeTeacher(label) {
  const email = "test-" + label + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6) + "@example.test";
  const password = "pw-" + Math.random().toString(36).slice(2) + "A1!";
  const made = await service("/auth/v1/admin/users", { body: { email, password, email_confirm: true } });
  if (made.status !== 200) throw new Error("couldn't make teacher: " + made.status);
  const signin = await call("/auth/v1/token?grant_type=password", { body: { email, password } });
  if (signin.status !== 200) throw new Error("couldn't sign in teacher: " + signin.status);
  const t = { id: made.body.id, email, jwt: signin.body.access_token };
  const row = await rest("/rest/v1/teachers", t, { body: { id: t.id, name: "Teacher " + label } });
  if (row.status !== 201) throw new Error("couldn't add teachers row: " + row.status);
  return t;
}

// The REST API as a signed-in teacher (RLS applies).
const rest = (pathname, teacher, opts = {}) =>
  call(pathname, Object.assign({ bearer: teacher.jwt, headers: { Prefer: "return=representation" } }, opts));

async function makeClass(teacher, name, extra = {}) {
  const r = await rest("/rest/v1/classes", teacher, { body: Object.assign({ name }, extra) });
  if (r.status !== 201) throw new Error("couldn't make class: " + r.status + " " + JSON.stringify(r.body));
  return r.body[0];
}

// Resets the per-IP counters, so the tests aren't stopped by the rate limit (it has its own test).
const clearRateLimits = () => service("/rest/v1/rpc/reset_rate_limits", { body: {} });

async function join(cls, nickname) {
  await clearRateLimits();
  const r = await fn("join-class", { class_code: cls.class_code, nickname });
  if (r.status !== 200) throw new Error("join failed: " + r.status + " " + JSON.stringify(r.body));
  return r.body;
}

async function deleteTeacher(t) {
  await service("/auth/v1/admin/users/" + t.id, { method: "DELETE" });
}

// ---------- A tiny test runner ----------
const results = [];
async function test(name, f) {
  try { await f(); results.push([true, name]); console.log("  PASS " + name); }
  catch (e) { results.push([false, name]); console.log("  FAIL " + name + "\n       " + (e && e.message)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(msg + "\n       expected " + b + "\n       got      " + a);
}

module.exports = { T, call, fn, service, rest, makeTeacher, makeClass, join, deleteTeacher, clearRateLimits, localSql,
  test, assert, eq, results, ROOT };
