// Which browser origins may call the Edge Functions (student-api, teacher-api, join-class, resume: all through
// _shared/http.ts). A plain script, like points-server.js, so the Deno functions (http.ts imports it) and the Node
// tests (tests/backend-client.js) use the same list and the same rule.
// An origin is a scheme and host (and port) only, never a path: the old site's https://theogoescoding.github.io covers
// /pythonpractices/. The match is exact, so a look-alike such as https://pythonsandladders.uk.evil.example is refused.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Origins = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const ALLOWED_ORIGINS = Object.freeze([
    "https://pythonsandladders.uk",      // the site's address since 2026-11 (GitHub Pages custom domain)
    "https://www.pythonsandladders.uk",  // the same site with www
    "https://theogoescoding.github.io",  // the old address: kept while the site moves (it redirects to the new one)
    "http://localhost:8000",             // local development (python -m http.server 8000)
  ]);
  const allowed = (origin) => typeof origin === "string" && ALLOWED_ORIGINS.includes(origin);
  return { ALLOWED_ORIGINS, allowed };
});
