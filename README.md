# RIT Course Flowchart Planner

A web app for RIT students to plan their **entire degree** as an interactive,
drag-and-drop flowchart, modeled on RIT's official department flowcharts but
personalized, editable, and saved per user. It answers "will I satisfy every
requirement before I graduate?" It is not a semester scheduler.

**Stack:** Next.js (App Router) + TypeScript, Supabase (Postgres + Auth, RLS on
every user table), Vitest.

## How it works

- **Ingestion:** Pulls live curriculum data from two RIT sources (the Programs
  API and TigerCenter) into Postgres: 400+ courses, program requirement
  templates, and prerequisite text parsed into AND/OR trees. Raw payloads are
  stored before parsing, so data can be re-normalized without re-fetching.
- **Provenance:** Course-availability signals come from several sources that
  can disagree. A confidence-weighted model reconciles them, prefers
  authoritative data over inferred data, and stays silent rather than guessing
  when confidence is low.
- **Flowcharts:** A user's plan is a materialized copy of a program template,
  so curriculum changes never silently rewrite someone's plan.

## Status

- Phase 1 (data ingestion): complete
- Phase 2 (UI/UX design) and Phase 3 (backend/API): in progress
- Not deployed yet

Built with an AI-assisted workflow: written acceptance criteria, small
reviewable PRs, and tests on core logic. See
[`docs/process/ai-development-process.md`](docs/process/ai-development-process.md).

## Getting started

```bash
npm install
cp .env.example .env   # fill in NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY
                        # for rit-flowchart-dev — via the Supabase dashboard
                        # or `get_project_url` / `get_publishable_keys` (MCP)
npm run dev             # http://localhost:3000
```

To run the RLS cross-user isolation test (`tests/rls-cross-user.test.ts`),
"Confirm email" must be off in `rit-flowchart-dev`'s Auth settings (Dashboard
→ Authentication → Sign In / Providers → Email) — already set as of Task 1.
Then:

```bash
npm run test:rls
```

Schema changes are numbered migrations in `supabase/migrations/`, applied via
the Supabase MCP `apply_migration` tool — `db/schema.sql` stays the
consolidated, human-readable definition and is never hand-edited to reflect a
DB change. The initial schema (`0001`) was applied to both `rit-flowchart-dev`
and `rit-flowchart-prod` immediately; later migrations may land on dev first
and prod once verified, so the two can briefly diverge — check
`supabase/migrations/` against each project's applied migration list (Supabase
MCP `list_migrations`) rather than assuming they match.

## Documentation

| Document | Purpose |
|---|---|
| [`docs/product/prd.md`](docs/product/prd.md) | Product requirements, MVP scope, phases |
| [`docs/architecture/data-sources.md`](docs/architecture/data-sources.md) | RIT API reference, findings, open questions |
| [`docs/architecture/schema-decisions.md`](docs/architecture/schema-decisions.md) | Rationale behind `db/schema.sql` |
| [`docs/handoff/claude-code-brief.md`](docs/handoff/claude-code-brief.md) | Phase 1 implementation brief (complete) |
| [`docs/handoff/phase-2-design-brief.md`](docs/handoff/phase-2-design-brief.md) | Phase 2 UI/UX design brief |
| [`docs/handoff/phase-3-backend-brief.md`](docs/handoff/phase-3-backend-brief.md) | Phase 3 implementation brief, with per-task ownership tags |
| [`docs/process/ai-development-process.md`](docs/process/ai-development-process.md) | How this project is built using AI tools |
| [`CLAUDE.md`](CLAUDE.md) | Conventions and guardrails for Claude Code |
| [`db/schema.sql`](db/schema.sql) | Database schema — source of truth |

These docs are mirrored to Google Drive. **The repo copy is authoritative.**
