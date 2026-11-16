# Reports assigned to Dev

In **Super Admin → Reports**, tick **Assign to Dev** on a bug or suggestion to queue it for a Claude Code session.
The session reads the queue through the Dev API, fixes the issue in this repo, and updates the report. The
reporter and everyone who voted or follows it get the usual emails.

## Setup (once)

1. A long random key, `REPORTS_DEV_TOKEN`, is set in Vercel (Production) and in the repo's local `.env`
   (not committed). With no key, the Dev API is off.
2. Nothing else: `scripts/dev-reports.mjs` uses that key against https://www.boothgen.com (override with `BOOTHGEN_URL`).

## How it flows

1. G ticks **Assign to Dev**. The scheduled Dev run (every 3 hours, 7 AM to 10 PM) picks it up.
2. Dev prepares the fix in its own worktree and sets the report to **Waiting on you** (`dev_review`) with an
   internal note: what the fix does in plain words, how G can check it, and anything G should decide.
   Questions for G work the same way.
3. In Super Admin → Reports, G either clicks **Approve & ship** (status **Approved, shipping**, `dev_approved`) or
   replies with an internal note, which hands the report back to Dev (`in_progress`).
4. The next Dev run ships approved fixes (commit, version, deploy), then sets **Fix ready** with a short public
   note. G checks it and marks it **Fixed**.

Reporters and followers see "In progress" for Waiting on you and Approved, and aren't emailed when those
change. They only ever see short, plain updates signed **BoothGen**.

## Working on assigned reports (for a Claude Code session)

1. `node --env-file=.env scripts/dev-reports.mjs list` shows the queue (oldest assignment first). Each report
   shows `>>> APPROVED TO SHIP`, `(waiting on G)`, and `>>> G replied: …` for G's notes since Dev last wrote.
   `show <#> --download <scratch folder>` saves screenshots / videos to look at.
2. Notes are **internal by default** (Super Admins only). Add `--public` for a note testers see and are emailed
   about: one or two plain sentences, no technical or AI wording (the API refuses words like branch, commit,
   deploy, API, Claude). Put causes, files and branches in internal notes.
3. Prepared a fix or need a decision: `update <#> --status dev_review --note "<plain summary + how to check>"`.
   Never set `dev_approved` (only G approves; the API refuses it) or `fixed` (only G closes a report).
4. Approved (`dev_approved`): ship it following the repo's workflow (CHANGELOG entry, version bump, commit,
   deploy), then after it's live:
   `update <#> --status fix_ready --fixed-in <version> --note "<what changed, in plain words>" --public`
   (`--attach before.png,after.png` adds screenshots).
5. Needs the reporter's input: `update <#> --status need_info --note "<question>" --public`.
   Already exists: `update <#> --status exists --how-to-find "Steps" --how-to-find-url /path`.
   `--unassign` hands it back.

Notes from the Dev API appear as "BoothGen" to users and "Dev" in Super Admin. The API never returns
people's email addresses.
