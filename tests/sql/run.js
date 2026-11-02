// Runs the SQL tests in tests/sql against the LOCAL Supabase database only (npx supabase start).
// Each file is piped into psql inside the local database container, so no password or project URL is needed.
//   node tests/sql/run.js            all *.sql files here
//   node tests/sql/run.js rls.sql    one file

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..", "..");
const config = fs.readFileSync(path.join(root, "supabase", "config.toml"), "utf8");
const projectId = (config.match(/^project_id\s*=\s*"([^"]+)"/m) || [])[1];
if (!projectId) { console.error("No project_id in supabase/config.toml"); process.exit(1); }
const container = "supabase_db_" + projectId;

const files = process.argv.length > 2
  ? process.argv.slice(2)
  : fs.readdirSync(__dirname).filter((f) => f.endsWith(".sql")).sort();

let failed = 0;
for (const f of files) {
  const sql = fs.readFileSync(path.join(__dirname, f), "utf8");
  const r = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8" });
  if (r.error) { console.error("Couldn't run docker: " + r.error.message + " (is `npx supabase start` running?)"); process.exit(1); }
  const lines = (r.stdout + r.stderr).split(/\r?\n/).filter((l) => /PASS|FAIL|ERROR/.test(l));
  console.log("== " + f);
  lines.forEach((l) => console.log("  " + l.replace(/^(psql:[^:]*:\d+: )?(NOTICE|ERROR):\s*/, "")));
  if (r.status !== 0) { failed++; console.log("  -> failed (exit " + r.status + ")"); }
}
console.log(failed ? failed + " file(s) failed" : "All SQL tests passed");
process.exit(failed ? 1 : 0);
