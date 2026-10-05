# Tests

Integration tests: the real Express app + a **real Postgres** (your local Supabase DB), with Supabase *Auth/Storage*
replaced by an in-memory fake (`tests/helpers/fakeSupabase.js`). No emails are sent, no Auth container is needed.

## Run
```powershell
npx supabase start        # local DB must be up (and `npm run seed` already applied once)
npm test
```
The DB comes from `TEST_DB_URL`, or `SUPABASE_DB_URL` in `.env`.
**Safety:** the run is refused unless the host is `127.0.0.1`/`localhost`.

Everything the tests create is tagged (`@kw-test.local` emails, `kwtest_` skills) and removed before and after the run;
your own accounts and demo data are never touched.

## Covered
auth · registration & role-injection · profile · admin access (auto-discovers every `/admin` route × anonymous / normal user, plus a role matrix) ·
listings & proposals · connections & chat privacy · exchange lifecycle & reviews · reports · jobs ownership/moderation.
