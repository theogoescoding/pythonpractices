# Edge Function secrets

The Edge Functions need three secrets. Their values are never written into any file in this project, never put in
`config.js` or any browser code, and never printed by the tests.

| Name | What it does | If it is changed |
|---|---|---|
| `LOOKUP_KEY` | HMAC-SHA256 key. Finds a student from their 8-digit code (`students.login_lookup`), fingerprints program code (`attempts.code_hash`) and keys the per-IP rate limit. Each use has its own prefix, so the hashes can't be mixed up. | **Every student's code stops working** (their lookups no longer match) and code hashes change. Don't change it during a school year. |
| `CODE_KEY` | AES-256-GCM key. Encrypts each student's 8-digit code (`students.login_code_enc`) so "Show codes" can show it to their teacher. | "Show codes" can no longer decrypt existing codes. Students can still sign in. |
| `SESSION_KEY` | HMAC-SHA256 key that signs student session tokens (valid for 8 hours). | Every student is signed out and has to sign in again with their code and PIN. Nothing is lost. |

Each one is 32 random bytes, written in base64. Use a different value for each key, and different values for the test
project and the trial project.

## Making the values

Make a file **outside this project folder** (for example in your Documents folder), so it can never be committed:

```powershell
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$lines = foreach ($n in 'CODE_KEY','LOOKUP_KEY','SESSION_KEY') { $b = New-Object byte[] 32; $rng.GetBytes($b); "$n=" + [Convert]::ToBase64String($b) }
[IO.File]::WriteAllLines("$HOME\Documents\python-practice-test.env", $lines)
```

Keep a copy somewhere safe (for example the school's password manager). Losing `LOOKUP_KEY` means every student needs a
new code.

## Setting them on a project

```powershell
npx supabase secrets set --project-ref <project ref> --env-file "$HOME\Documents\python-practice-test.env"
npx supabase secrets list --project-ref <project ref>
```

`secrets list` shows the names and a digest, not the values. Passing the file (rather than `NAME=value` on the command
line) keeps the values out of your PowerShell history.

## Local testing

`npx supabase functions serve --env-file <that file>` gives the values to the functions running on your computer. The
backend tests can sign an expired token to test it when `FUNCTIONS_ENV_FILE` is set to the same file; they read only
`SESSION_KEY` and never print it.

## Other keys

- The **anon (public) key** and the project URL go in `config.js`. They are meant to be public: row-level security
  stops the anon key reading or writing any table.
- The **service-role key** must never be in browser code or committed. The Edge Functions get it from Supabase
  automatically. The backend tests need it only when run against the test project, in
  `tests/backend/config.local.json`, which is git-ignored.
