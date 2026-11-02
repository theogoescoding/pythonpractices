// A blank copy of config.js, for setting up another project (see README.md, "Backend mode").
// Only the project URL and the public anon key belong here: they are safe to publish because row-level security
// protects the data. Never put the service-role key or any of the Edge Function secrets (docs/SECRETS.md) here.
// With BACKEND_ENABLED false, or without config.js, the app runs in local mode: everything stays in this browser.
self.APP_CONFIG = {
  BACKEND_ENABLED: false,
  SUPABASE_URL: "https://<project-ref>.supabase.co",
  SUPABASE_ANON_KEY: "<the project's anon (public) key>",
};
