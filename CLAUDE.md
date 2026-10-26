# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Conventions and guardrails for this repository. Read this before making changes.

---

## What this project is

A web app for RIT students to plan their **entire degree** as an interactive,
drag-and-drop flowchart — modelled on RIT's official department flowcharts
(see `docs/product/prd.md` and the reference PDF).

**Scope discipline matters here.** This plans *whole curricula*: "will I satisfy
every requirement before I graduate?" It is **not** a semester scheduler. We do
not care about specific sections, professors, meeting times, or seat counts.
If a proposed feature involves picking a section or building a weekly schedule,
it is out of scope — say so rather than building it.

---

## Stack

- **Database / Auth:** Supabase (Postgres 15+, email+password auth, RLS enforced)
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS, `@supabase/ssr`
  for auth. Chosen in Task 1 — see PR #2 for the full rationale. Route handlers
  live in `src/app/`; Supabase client helpers in `src/lib/supabase/`. Note:
  Next.js 16 renamed the `middleware.ts` convention to `proxy.ts` — that's
  `src/proxy.ts`, not a stray file. **Don't delete `AGENTS.md`:** `next dev`/
  `next build` auto-write an agent-rules block into it, or into this file if
  `AGENTS.md` doesn't exist — keeping `AGENTS.md` present is what stops Next's
  tooling from editing this file.
- **Repo:** this one
- **Schema:** `db/schema.sql` is the source of truth
- **Design:** produced in Claude Design, specs land in `docs/`

---

## Commands

```bash
npm run dev                 # Next.js dev server, http://localhost:3000
npm run build
npm run lint                # eslint
npx tsc --noEmit            # typecheck (no dedicated script)

npx vitest run <path>       # run one test file, e.g. tests/prereqs/parse-prereq-text.test.ts
npx vitest run -t "<name>"  # run tests matching a name
npm run test:rls            # RLS cross-user isolation test
```

There is no `npm test` script, and a bare `npx vitest run` also runs the
live-database tests. Test suites fall into three groups, each with different
prerequisites:

- **Pure parser tests** (`tests/ingest/**`, `tests/prereqs/**`,
  `tests/availability/confidence.test.ts`) run offline against saved raw
  payloads in `tests/fixtures/{programs-api,tigercenter}/` (via
  `tests/fixtures/load.ts`). Add a fixture rather than fetching live.
- **Availability waterfall tests** (`manual-override`, `priority-waterfall`)
  hit the **dev** Supabase DB with the service-role key from `.env.ingest`,
  and need ingested `catalog_courses` rows. There's no mocking on purpose:
  they exercise a DB conflict guard.
- **`tests/rls-cross-user.test.ts`** hits dev with the publishable key from
  `.env` (loaded by `tests/setup.ts`). It needs "Confirm email" turned off in
  dev's Auth settings, which is already done.

Ingestion scripts run against whatever `.env.ingest` points at (dev only for
now). They must run in this order because each step reads what the previous
one wrote:

```bash
npm run ingest:programs     # Programs API: curricula, slots, stub courses, immersions
npm run ingest:tigercenter  # TigerCenter: terms, attributes, course facts, offerings
npm run parse:prereqs       # DB->DB: prereq_text -> catalog_course_prerequisites (CSCI/MATH)
npm run seed:availability   # catalog_text fetch, then DB->DB plan_of_study/observed derivation
```

Two env files are kept apart on purpose. `.env` holds the public URL and
publishable key and is used by the app and the RLS test. `.env.ingest` holds
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` and is loaded explicitly by
`scripts/*` and the DB-backed availability tests. Never let app code import
`src/ingest/service-client.ts`.

Migrations in `supabase/migrations/` are applied through the Supabase MCP
`apply_migration` tool, not a CLI. After every migration, regenerate
`src/types/supabase.ts` (MCP `generate_typescript_types`), because nothing
enforces it. Dev and prod can briefly diverge, so check `list_migrations`
for each project instead of assuming they match.

---

## Code architecture

The path alias `@/*` maps to `src/*` in both tsconfig and vitest. Scripts
under `scripts/` use relative imports.

**Ingestion pipeline (`src/ingest/`).** Each source follows the same pattern,
split by responsibility:

```
client.ts  (fetch via shared rate-limited fetcher)
  -> documents.ts persistDocument/fetchAndPersist (raw body -> ingest_documents, content_hash dedup)
  -> parse-*.ts  (raw HTML/JSON -> IR in src/ingest/types.ts; pure, fixture-tested)
  -> write-*.ts  (IR -> catalog_* rows via service client)
```

- `http.ts` is the only throttle: a serial fetcher with a 750ms delay, shared
  by both sources. Don't add a second one, and don't parallelize requests.
- `runs.ts` (`startRun`/`finishRun`) brackets runs that fetch from outside.
  Pure DB-to-DB transforms (`parse:prereqs`, and the second and third
  availability steps) intentionally skip `ingest_runs` and `ingest_documents`,
  because the `ingest_source` enum covers only `programs_api` and `tigercenter`.
- The two adapters (`sources/programs-api/`, `sources/tigercenter/`) have
  separate IRs, because one models curriculum structure and the other models
  course facts. They reconcile on courses by the `(subject_code,
  catalog_number)` business key (Decision 4 in `schema-decisions.md`).
  Programs API creates **stub** `catalog_courses` rows that TigerCenter
  enriches later. Shared helpers live in `src/ingest/catalog-courses.ts` and
  `src/ingest/season.ts`.
- supabase-js `upsert()` can't express a conditional or partial-index
  conflict. Several writers (`write-course-attributes.ts`,
  `upsert-availability-claim.ts`) therefore select first and then branch.
  Follow that pattern instead of forcing `upsert()`.

**Prereq parser (`src/prereqs/`).** `tokenize.ts` normalizes the text and
splits it into sections. `parse-prereq-text` then produces an AND/OR tree of `CourseLeaf | UnparsedLeaf | GroupNode` along with a
`parse_status`. `resolve-courses` maps course codes to `catalog_courses.id`,
and `write-prereq-tree` writes the tree. Text that can't be parsed becomes
an `UnparsedLeaf` that keeps the raw fragment. It is never dropped. Its
presence makes the status `partial`, or `failed` if nothing at all was
recognized.

**Availability (`src/availability/`).** `catalog_course_availability` is
filled by a **strict priority waterfall**, not a max-confidence merge:
`catalog_text` (0.9) > `plan_of_study` (0.2) > `observed` (0.3 plus 0.2 per
extra term, capped at 0.7). `manual` always wins and is never written by
code. Every write goes through `upsert-availability-claim.ts`. A source can
refresh its own row but can never overwrite a higher-priority source. A
single observed term must never produce confidence above 0.5, which
`confidence.test.ts` guards.

**App (`src/app/`, `src/lib/supabase/`).** Currently minimal: login, a
flowcharts list, and a server action that creates a flowchart. Server code
uses `createClient()` from `src/lib/supabase/server.ts` and takes `user_id`
from the server session, never from client input. RLS is the real access
boundary. `src/proxy.ts` refreshes the auth session on every request.
Phase 3 API work (catalog read API, template→flowchart instantiation, block
CRUD, placeholder resolution) is specified in
`docs/handoff/phase-3-backend-brief.md`, and each task there has an owner tag.

---

## The four domain concepts you must not get wrong

### 1. Slots are templates. Blocks are copies.

`catalog_requirement_slots` describes what a *program* requires.
`flowchart_blocks` is what a *user* actually planned.

When a user starts a flowchart from a program, blocks are **materialized copies**
of slots — not foreign-key references to them. If RIT revises the CS curriculum,
existing user flowcharts must not silently mutate.

`flowchart_blocks.source_slot_id` preserves provenance so a future "the template
changed — sync?" feature is possible. `is_user_modified` marks blocks the user
has edited so a sync never clobbers their work.

**Never** make a user's flowchart render by joining live to `catalog_requirement_slots`.

### 2. Resolving a placeholder keeps the placeholder.

A Gen Ed slot filled with a real course keeps `kind = 'placeholder'` and *gains*
a `course_id`. It does not become `kind = 'course'`.

This preserves "this was a Gen Ed Artistic slot, filled with ARTH-135" — needed
for requirement validation later. Flattening it loses information permanently.

### 3. Position is semantic, never pixels.

Blocks are positioned by `(year_number, season, sort_order)`. Drag-and-drop
reorders within that grid. Do **not** introduce `x`/`y` pixel coordinates —
credit-per-term totals and prerequisite ordering checks depend on semantic
position being queryable.

### 4. Validation is warn-only. Never warn from an inference you can't stand behind.

This applies to both prerequisite checking and term availability.

- Prereqs: only reason about courses where `prereq_parse_status = 'parsed'`.
  Courses that are `partial`/`failed`/`unparsed` produce **silence**, not guesses.
  Even in a `parsed` tree, an OR group with **any** `unparsed` child counts as
  satisfied. That child may be a phrase ("or equivalent course") or a code we
  never ingested (`CSEC-124`), and the student may have met it. Checking only
  the known alternatives would falsely warn them. At least 69 dev courses have
  this shape.
- Availability: only warn above a confidence threshold. Low-confidence
  availability produces **silence**.

A false warning is far worse than a missing one. Users will stop trusting the
tool after one wrong flag.

---

## Data sources

Two sources, different roles. See `docs/architecture/data-sources.md` for full detail.

| Source | Role | Volatility |
|---|---|---|
| **Programs API / CourseLeaf** | Canonical curriculum structure, degree requirements, immersions | Stable |
| **TigerCenter** | Current-term course data, Gen Ed attributes, prereq text, credits | One term only, volatile |

Build flowcharts from the first. Enrich with the second.

**Keep them as separate, swappable adapters behind one interface.** A TigerCenter
outage must degrade enrichment without breaking flowcharts. Both APIs are
undocumented and may change without notice.

### Ingestion rules

- **Persist raw payloads** to `ingest_documents` *before* parsing. Re-normalizing
  must never require re-fetching.
- **Rate-limit.** These are university servers and we are uninvited guests. Serial
  requests with a delay, not parallel bursts.
- **Cache aggressively.** Use `content_hash` to skip unchanged documents.
- **Bootstrap sessions at runtime.** Never hardcode cookies (see Secrets below).
- **Fail gracefully.** Check `/tigerCenterApi/tc/maintenance` before bulk runs.
- **Review RIT's terms of use** before any bulk ingestion run. If unclear, ask
  rather than proceeding.

---

## Hard rules

### Secrets

- **Never commit cookies, session tokens, API keys, or `.env` files.**
  `TC_SESSIONID` / `INGRESSID` values appear in exploratory notes — they are live
  session tokens and must never enter the repo or any doc.
- Supabase **service role key** is used only by ingestion scripts, never by app
  code, never client-side.

### Database

- `catalog_*` and `ingest_*` tables are written **only** by ingestion scripts
  running with the service role. Application code reads catalog, and reads/writes
  only `profiles`, `flowcharts`, `flowchart_programs`, `flowchart_blocks`.
- **RLS is not optional.** Any new user-data table gets RLS enabled and a policy
  scoped to `auth.uid()` in the same commit that creates it.
- Schema changes go in numbered migration files. Never edit `db/schema.sql`
  in place to mean "the DB has changed" — it is the consolidated definition.

### Scope

- Do not build section/meeting-time features (see "What this project is").
- Do not build requirement *validation UI* without checking `docs/product/prd.md` —
  it is deliberately v2. Parsing and data capture are v1; the UI is not.

---

## Working style

- **Small, reviewable PRs**, one feature slice each, reviewed line-by-line
  before merge — a 2,000-line PR cannot be meaningfully reviewed. **As of
  Phase 3**, the project owner hand-implements core logic for designated
  "hands-on" tasks (see `docs/process/ai-development-process.md`'s Task
  ownership model and the per-task owner tags in
  `docs/handoff/phase-3-backend-brief.md`) — Claude Code scaffolds the
  surrounding routes/wiring and reviews the finished code rather than
  writing it. For tasks tagged "delegate," Claude Code implements
  end-to-end as in Phase 1, with the owner reviewing the diff.
- **Write tests for core logic**: prereq parsing, availability inference,
  template→flowchart instantiation, credit totals. Tests are the review proxy.
  UI polish does not need exhaustive tests.
- **State assumptions explicitly.** If a requirement is ambiguous, ask rather
  than picking silently — the cost of a wrong guess compounds here.
- **Update `docs/` when behavior changes.** Docs are mirrored to Google Drive;
  the repo copy is authoritative.

---

## Open questions

Phase 1 (data ingestion, Tasks 0-5) is complete — all of its verification
questions are resolved; see `docs/handoff/claude-code-brief.md`. What's
actually still open, tracked in `docs/architecture/schema-decisions.md`:

- Immersions are ingested as lightweight entities only; their internal
  required/elective course-list structure isn't parsed (needs a schema
  decision — nullable `year_number` vs. a separate table — before it can
  be). This blocks *resolving* an immersion placeholder to a specific
  course, not instantiating a flowchart in the first place.
- No confirmed example of RIT's inline degree-option-cluster shape
  (`catalog_requirement_groups`) has been found yet; the write path exists
  but is untested against real data.

Phase 3 (backend/API) is next — brief at
`docs/handoff/phase-3-backend-brief.md`.

---

## Agent skills

### Issue tracker

Issues live in GitHub Issues for this repo (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/` (created lazily); existing decisions in `docs/architecture/schema-decisions.md`. See `docs/agents/domain.md`.
