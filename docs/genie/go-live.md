# Genie go-live runbook (BoothGen production)

Prepared 2026-11-10 on branch `claude/genie-api-ef545d` at `780c46d5` (local `main` merged in).
Nothing in this list has been run against production yet. **G gives the final go.**

Legend: 🌐 = G in a browser · 💻 = terminal (Claude can run it once G says go) · ⏱ = rough time

## What production gets

- Merge state: GitHub `main` (d37ec70e) is already in the branch. Local `main` is 42 commits ahead of GitHub
  (unpushed) and those commits are merged into the branch too, including the 2 since the branch started:
  - `cb082eee` fix(middleware): exact-match '/' to restore auth redirect
  - `01b21a3b` feat(settings): country setting drives address field labels (adds a column — see below)
- Merge conflict resolved in `src/middleware.ts`: main's version, plus `/api/genie` as public (device bearer token
  checked in each route), prefixes matched on whole path segments (`/g` no longer makes `/gallery` or `/genie`
  public), and `/genie` added to the tenant-only and admin-only lists.
- Checks on the merged branch: tsc clean, `next build` passes, 117/117 tests pass.

## Schema changes

How this repo changes the production schema: there are no migration files. `npm run db`
(`prisma generate && prisma db push`) is run with `DATABASE_URL` pointing at the production Neon database.
The build (`prisma generate && next build`) does not touch the schema.

SQL that `db push` will run: [`go-live-schema.sql`](go-live-schema.sql) (diff of main's schema → this branch).
It assumes production matches main's `schema.prisma`; `db push` re-checks the live database itself and stops
before anything that loses data (never pass `--accept-data-loss`).

- **Destructive:** none. No DROP, no type changes, no new NOT NULL column without a default.
- **New columns on existing tables:** `tenants` (genieEnabled default false, genieEnabledAt, genieAttendantPinHash),
  `gallery_assets` (clientId, genieKind, genieSessionId), `booth_design_templates` (layout, alternateLayout,
  genieThumbnail). Constant defaults → metadata-only on Postgres 11+. (Main's own `tenant_brandings.country`
  column from `01b21a3b` is not in this file; if production doesn't have it yet, `db push` adds it too.)
- **New tables:** 9 `genie_*` / `event_genie_*` tables, empty.
- **Locking:** `CREATE UNIQUE INDEX gallery_assets(galleryId, clientId)` and the `gallery_assets.genieSessionId`
  index/foreign key lock writes to `gallery_assets` while they build. Every existing row has NULLs there, so no
  duplicate risk; time depends on the table size (seconds for tens of thousands of rows). Foreign keys to
  `tenants`, `events` and `galleries` take brief locks on those tables. Do it when no one is uploading.

## Environment (Vercel → boothgen → Production)

Compared by name only (values never read).

| Variable | Status | Who |
|---|---|---|
| `SECRETS_ENCRYPTION_KEY` | **Missing — required** (tenant Twilio/Resend/SMTP secrets are encrypted with it; Settings → Genie fails without it) | G creates: `openssl rand -base64 32`, add as Sensitive. Or Claude runs `openssl rand -base64 32 \| vercel env add SECRETS_ENCRYPTION_KEY production` (value never shown). **Never change it later** — saved tenant secrets would become unreadable. |
| `GENIE_MIN_APP_VERSION` | Missing — optional, defaults to `1.0.0` | Set it to the iPad build you ship (e.g. `0.2.0`). With the default, iPads on 0.x report "update required" (`DeviceLink.updateRequired`). Claude can set it. |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Set | — (Genie shares and gallery crons run through Inngest; re-sync the app after deploy, step 9) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | Set | — (values not checked; see Storage) |
| `NEXT_PUBLIC_APP_URL` | Set | G confirms it's `https://www.boothgen.com` (or the canonical host): guest links, QR codes, bundle URLs and the Twilio status callback are built from it |
| `NEXTAUTH_SECRET`, `EMAIL_FROM`, `RESEND_*` | Set | — |
| Twilio status callback | No variable | Built per tenant as `NEXT_PUBLIC_APP_URL/api/webhooks/twilio/genie/<tenantId>` and sent with each text; nothing to set in Twilio. |
| `INNGEST_DEV` | Must **not** be set in production | — |

## Storage (R2)

I could not read production's `R2_PUBLIC_URL` (pulling production values was blocked), so G checks it:
🌐 Vercel → boothgen → Settings → Environment Variables → `R2_PUBLIC_URL`.

- If it's a custom domain (e.g. `https://media.boothgen.com`): nothing to do.
- If it's `https://pub-….r2.dev`: Cloudflare rate-limits r2.dev and says it isn't for production, and some
  networks block it (it failed on G's hotspot). Recommended, but **not required for go-live**:
  1. 🌐 Cloudflare → R2 → the production bucket → Settings → Custom Domains → Connect Domain → e.g.
     `photos.boothgen.com` (boothgen.com must be on Cloudflare DNS; it adds the record) ⏱ 5 min + DNS.
  2. Keep "Public access via r2.dev" **on**: existing gallery, logo and design URLs are stored as full r2.dev
     URLs in the database and keep working.
  3. **Before** changing `R2_PUBLIC_URL`: a small code change is needed. Deletion (`r2KeyFromUrl`) strips the
     *current* `R2_PUBLIC_URL` from stored URLs, so after a switch, files uploaded under the old address would no
     longer be deleted (gallery expiry, asset delete, tenant cleanup), and the Genie template proxy wouldn't
     recognise them. Fix: accept a list of old public URLs (e.g. `R2_LEGACY_PUBLIC_URLS`). Ask Claude for it.

**CORS** (needed for the template designer's uploads; G approved dev + production): the R2 keys in `.env` can't
read or change bucket settings (403 AccessDenied), so G sets it in the dashboard:
🌐 Cloudflare → R2 → bucket → Settings → CORS Policy → Edit, **keep the existing entries**, and add:

```json
{
  "AllowedOrigins": ["http://localhost:3000", "http://172.20.10.2:3000"],
  "AllowedMethods": ["PUT", "GET", "HEAD"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}
```

on **boothgen-dev**, and on the **production** bucket the same rule with
`["https://boothgen.com", "https://www.boothgen.com"]` (plus any other host production actually serves; check
Vercel → Domains). ⏱ 5 min. Avoid `/api/super-admin/r2-cors`: it replaces the whole rule.

## Runbook (in order)

| # | Step | Who | ⏱ |
|---|---|---|---|
| 1 | Check `R2_PUBLIC_URL` and `NEXT_PUBLIC_APP_URL` in Vercel production (see above). | 🌐 G | 2 min |
| 2 | Add CORS rules to boothgen-dev and the production bucket. | 🌐 G | 5 min |
| 3 | Add `SECRETS_ENCRYPTION_KEY` (and `GENIE_MIN_APP_VERSION`) to Vercel production. | 🌐 G or 💻 Claude | 3 min |
| 4 | **Backup:** Neon console → project → Branches → create branch `pre-genie-2026-11-xx` from production (instant snapshot). Optionally also `pg_dump "$PROD_DATABASE_URL" -Fc -f boothgen-pre-genie.dump`. | 🌐 G (💻 for pg_dump) | 2–10 min |
| 5 | Merge the branch into local `main` (fast-forward is possible: main is already merged into the branch) and push to GitHub. | 💻 Claude, on G's go | 2 min |
| 6 | Apply the schema: from the main checkout with the production `DATABASE_URL`, `npx prisma db push` (no `--accept-data-loss`). Check its summary matches `go-live-schema.sql`; it must report no data loss. | 💻 Claude, on G's go | 2 min |
| 7 | Deploy: `vercel --prod` from the main checkout (this repo's documented flow). | 💻 Claude, on G's go | 3–5 min |
| 8 | Turn Genie on for G's test tenant only: there's no super-admin toggle yet, so `UPDATE tenants SET "genieEnabled" = true, "genieEnabledAt" = now() WHERE slug = '<G test tenant slug>';` (Claude can add a super-admin toggle instead; ask). | 💻 Claude, on G's go | 1 min |
| 9 | Inngest: Inngest dashboard → Apps → boothgen → Sync (or confirm the Vercel integration auto-synced). New functions: `send-genie-share`, and the updated gallery expiry/delete crons. | 🌐 G | 2 min |
| 10 | Smoke checks (below). | 🌐 G + iPad | 15 min |

### Smoke checks (production, G's test tenant)

1. Settings → Genie: save Twilio and email (From on G's own Resend-verified domain), **Send test** on both → both arrive.
2. Genie → iPads: **Create Pairing Code** → pair the iPad → it appears with model, app version and "last seen just now".
3. Genie → Templates: create a template, upload a background and an overlay, save → thumbnail shows (proves CORS).
4. An event → **Genie**: Set Up Genie, add the template, save → Bundle JSON shows `bundleVersion`, templates, `photosHiddenAt`.
5. iPad: load the event (takes 1 of 2 spots), run a session, print if a printer is attached.
6. Guest page: scan the QR → "Uploading your photos…" → the gallery copy fades in, then the shots.
7. Share by text and by email → Event → Genie → Guest Texts & Emails shows Sent → Delivered.
8. Logged-out check: `/genie/devices` redirects to sign-in; `/api/genie/config` without a token returns 401.

## Rollback

- **App:** Vercel → Deployments → previous production deployment → Promote (or `vercel rollback`). ⏱ 1 min.
  The schema is additive, so the previous build runs fine on the new schema; no database rollback is needed.
- **Genie off without redeploying:** `UPDATE tenants SET "genieEnabled" = false;` (all Genie routes return 403).
- **Database (only if something went badly wrong):** restore from the Neon branch made in step 4 (Neon → branch →
  Restore / reset production from it), or `pg_restore` the dump. This loses anything written after step 4.
- Dropping the Genie tables is never needed for a rollback.

## Known gaps to decide before inviting other tenants

- No super-admin toggle for `genieEnabled` (spec asked for one until billing exists).
- Template thumbnails create a new R2 object on every save (old ones aren't deleted).
- "Booth offline" on the guest page assumes the iPad contacts BoothGen at least once a minute while running.
