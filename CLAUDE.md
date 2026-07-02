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
