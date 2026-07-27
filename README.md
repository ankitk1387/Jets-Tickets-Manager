# Jets Gatekeeper — self-hosted deploy guide

This package turns the Claude artifact into a real, independently-hosted
website with its own database. No Claude account or claude.ai involved —
this is a normal static site + serverless API + database, running entirely
on Cloudflare's free tier.

## What's in this folder

```
jets-gatekeeper/
├── public/
│   └── index.html          ← the app (same UI/logic as before)
├── functions/
│   └── api/
│       └── kv/
│           └── [key].js    ← serverless API (Cloudflare Pages Function)
├── schema.sql               ← database table definition
├── wrangler.toml             ← optional, only needed for local dev
└── README.md                ← this file
```

`index.html` no longer uses `window.storage` (that only exists inside
Claude). It now calls `/api/kv/<key>` instead, which is handled by
`functions/api/kv/[key].js`, which reads/writes a Cloudflare D1
database (`kv_store` table — one row per key, same keys as before:
`roster`, `games`, `admin-pin`, `responses:<gameId>`).

---

## Step 1 — Push this folder to GitHub

From inside this folder:

```bash
git init
git add .
git commit -m "Jets Gatekeeper - initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/jets-gatekeeper.git
git push -u origin main
```

(Create the empty `jets-gatekeeper` repo on GitHub first if you haven't —
github.com → New repository → don't initialize with a README, since
you already have one.)

## Step 2 — Connect the repo to Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**
2. Select your `jets-gatekeeper` repo
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **public**
4. Click **Save and Deploy**

Cloudflare will give you a live URL immediately, something like
`jets-gatekeeper.pages.dev`. It won't work yet — no database is
connected — but the deploy itself should succeed.

## Step 3 — Create the D1 database

1. Cloudflare dashboard → **Workers & Pages** → **D1** → **Create database**
2. Name it `jets-gatekeeper-db` → **Create**
3. Open the new database → **Console** tab
4. Paste the contents of `schema.sql` (the `CREATE TABLE` statement) and run it

This creates the one table the app needs. That's the entire schema —
no migrations, no ORM.

## Step 4 — Bind the database to your Pages project

1. Go back to **Workers & Pages** → your `jets-gatekeeper` project → **Settings** → **Functions**
2. Under **D1 database bindings**, click **Add binding**
3. **Variable name:** `DB` (must be exactly this — it matches `env.DB` in the code)
4. **D1 database:** select `jets-gatekeeper-db`
5. **Save**

## Step 5 — Redeploy

Bindings only take effect on a new deployment. Easiest way: go to
**Deployments** tab → **⋯** on the latest deployment → **Retry deployment**.
(Or just push any small commit — even editing this README — and it'll
redeploy automatically.)

## Step 6 — Test it

Visit your `*.pages.dev` URL. You should see the normal "Your crew /
Home games / Admin PIN" setup screen — and this time, filling it out
and refreshing the page will actually keep the data, because it's
sitting in a real database now, not a Claude-only sandbox.

Do the full setup here for real: add your friends with their last-4
digits, load the schedule, set your admin PIN.

## Optional — custom domain

Pages project → **Custom domains** → **Set up a domain**. If the domain
is already on Cloudflare, this is a couple of clicks and a few minutes
for DNS to propagate.

## A note on "publishing" going forward

Unlike the Claude artifact, **this setup has no reset-on-republish
problem.** The database lives in D1, completely separate from your
code. You can push code changes to GitHub any time (new features, style
tweaks, bug fixes) and Cloudflare Pages will redeploy automatically —
your roster, schedule, responses, and assignments stay exactly as they
are, because they're not part of the deployment at all.

## Security note

The last-4-digit check and admin PIN are the same lightweight
client-side checks as before — fine for a trusted friend group, not
real authentication. If you ever want to harden this (e.g. rate-limit
PIN attempts, or move the PIN check into the API layer instead of the
browser), that's a reasonable next step but not required to get this
running.
