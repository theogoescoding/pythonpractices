// Backend settings for the website. These two values are safe to publish: the project URL and the anon (public) key
// can't read or write any data on their own, because row-level security protects every table. Students go through
// the Edge Functions, and teachers see only their own classes.
// Never put the service-role key or the Edge Function secrets (CODE_KEY, LOOKUP_KEY, SESSION_KEY) here.
// BACKEND_ENABLED stays false until the backend has been deployed to this project and tested; until then the site
// runs in local mode.
self.APP_CONFIG = {
  BACKEND_ENABLED: false,
  SUPABASE_URL: "https://qiggrpwzfowhhcjrlauq.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpZ2dycHd6Zm93aGhjanJsYXVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MzQ0NzksImV4cCI6MjEwOTIxMDQ3OX0.9piWgzefCJhsNWfRVrm212uaBRlAXojtHTfJ0DAbHv8",
};