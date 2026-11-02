// Backend settings for the website (the trial project, python-practice-trial). These two values are safe to publish:
// the project URL and the publishable (public) key can't read or write any data on their own, because row-level
// security protects every table. Students go through the Edge Functions, and teachers see only their own classes.
// Never put the secret / service-role key or the Edge Function secrets (CODE_KEY, LOOKUP_KEY, SESSION_KEY) here.
// With BACKEND_ENABLED false the site runs in local mode instead: everything stays in the browser.
self.APP_CONFIG = {
  BACKEND_ENABLED: true,
  SUPABASE_URL: "https://bkcvigaqhawwaxtxyzec.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_NP3LjwHY1BzcEJRPNDtbgg_4U2W0sgR",
};