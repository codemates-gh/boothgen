# Move boothgen.com DNS to Cloudflare (then photos.boothgen.com)

Cloudflare account: **geoffrey@nolasco.us** (it holds the production R2 bucket; an R2 custom domain must be in the
same account). DNS today: GoDaddy (`ns57/ns58.domaincontrol.com`). DNSSEC: off (nothing to undo).

Two separate jobs: **(A) DNS move** (nameservers) — needed for photos.boothgen.com, done in hours. **(B) Registration
transfer** — optional, after (A) is Active; takes up to 5–7 days; site and email keep working throughout.

## Records boothgen.com has (public snapshot, 2026-11-11)

Check against GoDaddy → boothgen.com → DNS, which is the full list (some records aren't visible from outside).

| Name | Type | Value | Proxy | For |
|---|---|---|---|---|
| `@` (boothgen.com) | A | `76.76.21.21` | DNS only | website (Vercel) |
| `www` | CNAME | `cname.vercel-dns.com` | DNS only | website |
| `*` | A | `76.76.21.21` | DNS only | every other subdomain (app., tenant subdomains) → Vercel |
| `@` | MX | `10 inbound-smtp.us-east-1.amazonaws.com` | — | incoming email (Resend inbound) |
| `@` | TXT | `v=spf1 include:amazonses.com ip4:46.225.223.194 ~all` | — | SPF |
| `send` | MX | `10 feedback-smtp.us-east-1.amazonses.com` | — | Resend sending |
| `send` | TXT | `v=spf1 include:amazonses.com ip4:46.225.223.194 ~all` | — | Resend sending |
| `resend._domainkey` | TXT | `p=MIGfMA0GCSqGSIb3DQEB…` (copy the full value from GoDaddy) | — | Resend DKIM |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | — | DMARC |

`app`, `inbound`, `reply`, `mail` all resolve to `76.76.21.21` — most likely through the `*` wildcard. If GoDaddy
lists them as their own records, copy them too.

## A. DNS move (~30 min + wait)

1. GoDaddy: open boothgen.com → **DNS**; keep the tab open.
2. Cloudflare (geoffrey@nolasco.us): **Add a domain** → `boothgen.com` → **Free**. Let it scan and import.
3. Compare Cloudflare's list with GoDaddy's. Add anything missing. Set every A/CNAME above to **DNS only**
   (grey cloud) — Vercel issues its own certificates and expects unproxied records. Don't add records for
   photos.boothgen.com; step 7 does that.
4. Cloudflare shows two nameservers (`…ns.cloudflare.com`). GoDaddy → boothgen.com → **Nameservers** → Change →
   **I'll use my own nameservers** → enter both → Save.
5. Wait for Cloudflare's "boothgen.com is now active" email (minutes to a few hours).
6. Check (Claude can run these): `dig +short NS boothgen.com` shows Cloudflare; https://www.boothgen.com loads;
   `dig +short MX boothgen.com` and the Resend TXT records match the table; Resend → Domains still shows verified;
   send yourself a Genie test email from Settings → Genie.

## Photos domain (after A is Active)

7. Cloudflare → R2 → the production bucket → **Settings** → **Custom Domains** → **Connect Domain** →
   `photos.boothgen.com` → Connect. Keep **Public access via r2.dev** ON (old URLs in the database use it).
8. Wait until the custom domain shows **Active**, then check `https://photos.boothgen.com/<an existing key>` loads.
9. Vercel (Production): set `R2_PUBLIC_URL` = `https://photos.boothgen.com` and add
   `R2_LEGACY_PUBLIC_URLS` = `https://pub-ac11134f36364096933cfcf4ef46b611.r2.dev`, then redeploy.
   The code already reads both (commit b40200cb): new uploads use photos.boothgen.com; deletion and the Genie
   template checks still recognise files stored under the r2.dev address.
10. CORS: the production bucket's rule already allows https://boothgen.com and https://www.boothgen.com (PUT, GET,
    HEAD) — no change. Upload a template background on boothgen.com to confirm.

Rollback for the photos switch: set `R2_PUBLIC_URL` back to the r2.dev address and redeploy (nothing is moved or
deleted; both addresses serve the same bucket).

## B. Registration transfer (optional, after A)

GoDaddy: unlock boothgen.com, get the **authorization code**. Cloudflare → **Domain Registration** → **Transfer
Domains** → select boothgen.com → enter the code → pay (at cost, adds one year). Approve GoDaddy's confirmation email
to speed it up. Not possible within 60 days of registering or transferring the domain. Same order for other
domains: DNS move first (checking each one's email records), then transfer.
