# Reports assigned to Dev

In **Super Admin → Reports**, tick **Assign to Dev** on a bug or suggestion to queue it for a Claude Code session.
The session reads the queue through the Dev API, fixes the issue in this repo, and updates the report. The
reporter and everyone who voted or follows it get the usual emails.

## Setup (once)

1. A long random key, `REPORTS_DEV_TOKEN`, is set in Vercel (Production) and in the repo's local `.env`
   (not committed). With no key, the Dev API is off.
2. Nothing else: `scripts/dev-reports.mjs` uses that key against https://www.boothgen.com (override with `BOOTHGEN_URL`).

## Working on assigned reports (for a Claude Code session)

When asked to "work on the reports assigned to Dev":

1. `node --env-file=.env scripts/dev-reports.mjs list` to see the queue (oldest assignment first).
   `show <#> --download <scratch folder>` saves screenshots / videos to look at.
2. Optional: tell the reporter it's being worked on:
   `update <#> --status in_progress`
3. Fix it on a branch with tests, following the project's usual workflow (CHANGELOG entry, version bump in
   `src/lib/version.ts`, commit). Database changes still need the user to run SQL in Neon first.
4. **Only after the fix is deployed** to boothgen.com, close it out:
   `update <#> --status fixed --fixed-in <version> --note "<what changed, in plain words>"`
5. If it can't be reproduced or needs a decision: `update <#> --status need_info --note "<question>"`
   (the reporter is emailed and can reply on the report). For something BoothGen already does:
   `update <#> --status exists --how-to-find "Steps" --how-to-find-url /path`.
   Use `--internal` for notes only Super Admins should see, and `--unassign` to hand it back.

Notes from the Dev API appear as "Booth Genius" to users and "Dev" in Super Admin. The API never returns
people's email addresses.
