# BoothGenius — Claude Code Project Context

## Skill Usage
Do not apply the saas-platform-builder skill on this project.
Match existing patterns already in the codebase — Tailwind utility classes,
the hand-rolled component library in src/components/ui/, and the existing
page architecture. Do not introduce inline styles, new component abstractions,
or structural changes unless explicitly requested.

## Workflow
After completing any task or bug fix:
1. Update CHANGELOG.md with a new versioned entry before committing.
2. Stage and commit the changes (no confirmation needed — proceed automatically).
3. Deploy to production with `vercel --prod` (no confirmation needed — proceed automatically).
4. Once a user-facing feature is live, keep the product roadmap (Super Admin → Reports → Roadmap) in step:
   mark its item shipped, or add one if it isn't there, e.g.
   `node --env-file=.env scripts/dev-roadmap.mjs update <id> --status shipped --version "BoothGen 2.x.y"` or
   `... add "Title" --summary "One line" --area boothgen --status shipped --version "BoothGen 2.x.y"`.
   `list` shows the ids. Skip small fixes and internal tools. See docs/REPORTS-DEV.md (Roadmap).
