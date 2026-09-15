# Claude Code Handoff Brief — Phase 3 (Backend / API)

**Status:** Phase 1 (data ingestion) is complete — Tasks 0-5 all merged, see
`docs/handoff/claude-code-brief.md`. Phase 2 (UI/UX design, Claude Design) is
starting in parallel — see `docs/handoff/phase-2-design-brief.md` — but per
`docs/process/ai-development-process.md`'s phase table, Phase 3 is blocked
only on Phase 1, not Phase 2 — the app-layer
schema (Decisions 1/2/3/8 below) gives enough shape to build against without
a visual design in hand. This brief defines the first two Phase 3 tasks,
numbered continuing from Phase 1 (Task 6, Task 7 — not restarting at 1).

**Read first:** `/CLAUDE.md` (especially "Hard rules" and "Scope"),
`docs/product/prd.md` (the 10 MVP features these tasks implement),
`docs/architecture/schema-decisions.md` Decisions 1 (blocks are copies), 2
(placeholder resolution keeps the placeholder), 3 (semantic position), and 8
(multi-program shape), and `db/schema.sql`'s `APP LAYER` section
(`profiles`, `flowcharts`, `flowchart_programs`, `flowchart_blocks`) — all
already exist and are RLS-enabled from Task 1's migration. **No schema
changes are expected for Task 6 or 7.**

Task 1's scaffold already has: email+password auth (`@supabase/ssr`),
`createFlowchart` (bare insert, no template) and `signOut` in
`src/app/flowcharts/actions.ts`, and a page that lists a user's own
flowcharts. Nothing beyond that exists yet — no catalog browsing, no block
CRUD, no template instantiation.

---

## Task ownership

Starting this phase, tasks are tagged **Owner: You (hands-on)**,
**Owner: Delegate**, or **Owner: Split**. Rationale for the split and the
handoff mechanics are in `docs/process/ai-development-process.md`'s "Task
ownership model" section — short version: hands-on tasks have real
state-transition logic or a non-obvious business rule worth being able to
explain in an interview; delegate tasks are CRUD/plumbing where the
interesting decision already got made in the schema. Hands-on tasks below
are written as full step-by-step specs (steps, suggested signatures, edge
cases, what to test) rather than the terser brief-prose the delegated tasks
get — Claude Code doesn't need that scaffolding to implement something, but
a developer picking up a new task does.

For a delegate task, Claude Code implements end-to-end and you review the
diff line by line, same as Phase 1. For a hands-on task, write the function
and its tests yourself, get them passing locally, then hand it back for
Claude Code to (a) scaffold the surrounding route/server-action wiring and
(b) run a review pass before the PR opens.

---

## Roadmap (all anticipated Phase 3 tasks, for context)

Mapped to the PRD's MVP feature list. Tasks 6, 7, and 9 are detailed below;
Task 8 and 10 have their ownership split noted but aren't fully step-by-step
specced yet — the shape of the whole phase is visible before starting on
the first slice either way.

- **Task 6 — Catalog read API** (features 1, 5: browse/search catalog, course detail) — **Owner: Delegate**
- **Task 7 — Flowchart instantiation from a template** (feature 2) — **Owner: You (hands-on)**
- **Task 8 — Block CRUD**: reorder, notes, completion state, custom blocks (features 3, 6, 7, 10) — **Owner: Split** (you write the reorder/`sort_order` logic; delegate notes/status/custom-block CRUD)
- **Task 9 — Placeholder resolution** (feature 8) — **Owner: You (hands-on)**
- **Task 10 — Multiple flowchart management**: list/rename/duplicate/archive (feature 9) — **Owner: Split** (you write `duplicate` if you want the extra practice — it's the one piece with real copy semantics; list/rename/archive are delegate)

Task 8 depends on 6 or 7 having produced blocks to act on (or on blank/custom
blocks alone). Task 9 depends on 6 (search) and 8 (block update). Suggested
order is numeric, but 8 and the "blank flowchart + custom blocks" slice of
10 don't strictly require 7 to exist first if it's more convenient to build
CRUD against hand-inserted test blocks initially.

---

## Task 6 — Catalog read API

**Owner: Delegate.** Straightforward query/route layer over already-open
data — no state transitions, no ambiguous business rule. Worth reading the
diff closely anyway: the decision of *how* to represent a low-confidence
availability claim in the API response (per the warn-only principle) is a
real design call, even though you're not the one writing the code for it.

Server-side read/search access to catalog data for a signed-in user:
browse/search `catalog_courses` and `catalog_programs`, and view a single
course's full detail (title, credits, description, prereq tree, availability).

**Note on RLS:** catalog tables are already world-readable —
`db/schema.sql` has `create policy "catalog readable" on ... for select
using (true)` for every `catalog_*` table. This task is the query/route
layer on top of already-open data, not an access change. Per CLAUDE.md,
app code may **read** `catalog_*` tables but must never write them — writes
stay service-role-ingestion-only.

Known data shape worth knowing before starting:
- `catalog_courses.code` (generated, e.g. `"CSCI-141"`) is the natural
  search/display key; `prereq_parse_status` tells you whether
  `catalog_course_prerequisites` is safe to show as structured data (only
  `'parsed'`) versus falling back to `prereq_text` alone.
- `catalog_course_availability` (Task 5) now has real rows for most
  courses — `confidence` and `source` are there if a course detail view
  wants to show "Typically offered: Fall, Spring" with some notion of how
  sure that is. Surfacing a low-confidence claim as if it were certain
  would violate the warn-only principle — check `docs/architecture/
  schema-decisions.md` Decision 7 before deciding how to render this.
- `catalog_programs` has `type` (major/minor/immersion/option/concentration/
  combined) — useful for letting a user filter "pick a major" vs "pick a
  minor" when starting a flowchart in Task 7.

**Acceptance:** a signed-in user can search for a course by code or title
fragment and see its credits/description/prereqs/availability; can list
programs filterable by `type`.

---

## Task 7 — Flowchart instantiation from a template

**Owner: You (hands-on).** This is the first place in the codebase where
"blocks are copies, not references" (Decision 1) becomes executable code —
get it wrong and a future RIT curriculum revision silently mutates a
student's saved plan. It's also a clean, self-contained unit with a cheap,
numeric acceptance check (126 credits), which makes it a good task to
actually own: one function in, one set of DB writes out, pass/fail is
unambiguous.

### Objective

Given an existing flowchart and a chosen `catalog_programs` row, materialize
that program's `catalog_requirement_slots` into `flowchart_blocks` — as
**copies**, never live references (Decision 1). Write one
`flowchart_programs` row linking the flowchart to the program
(`role = 'primary'` for v1 — Decision 8 says the multi-program shape exists
for future double-majors/BS-MS, but v1 only ever inserts one row).

### Before you start

- Re-skim `schema-decisions.md` Decisions 1, 2, 3, 8.
- Read `db/schema.sql`'s `flowchart_blocks` and `flowchart_programs` table
  definitions directly, end to end — know every column before you write the
  insert, not after a failed constraint tells you.
- Skim `src/app/flowcharts/actions.ts`'s existing `createFlowchart` for this
  project's conventions (how the Supabase client is threaded through a
  server action, how errors are surfaced) — not to copy structure, just to
  stay consistent with it.

### Step-by-step

1. **Function signature** — something like:
   ```ts
   async function instantiateFlowchart(
     supabase: SupabaseClient,
     flowchartId: string,
     programId: string,
   ): Promise<{ blocksCreated: number }>
   ```
   Adjust to match how `actions.ts` actually threads the client — check
   `createFlowchart` for the real pattern rather than assuming this shape.
2. Fetch all `catalog_requirement_slots` rows for `programId`, ordered by
   `year_number`, `season`, `sort_order`.
3. Map each slot to a `flowchart_blocks` insert row:
   - `year_number`, `sort_order`, `kind`, `course_id`, `label`,
     `required_attribute_id`, `category_hint` → copy straight across
   - `season` → **not a straight copy.** `catalog_requirement_slots.season`
     is nullable (`null` = "anytime that year"), but
     `flowchart_blocks.season` is `not null`. A slot with `season = null`
     will fail the insert if copied as-is. Decide and document the
     resolution here (e.g. default to `'fall'`, or split an "anytime" slot
     across a fixed pick, or some other explicit rule) — don't discover
     this from a constraint error at runtime. State the chosen rule in the
     PR per CLAUDE.md's "state assumptions explicitly."
   - slot's `credits` → block's **`credits_override`** — note the rename,
     it's easy to miss
   - `source_slot_id` = the originating slot's `id` (provenance for a
     future "template changed, re-sync?" feature — not building that
     feature now, just recording the pointer it'll need)
   - `is_user_modified = false`
   - leave `status` unset and let the column default (`'planned'`) apply —
     don't hardcode it redundantly
4. Batch-insert the mapped rows (one `insert()` call with an array, not a
   loop of single inserts). Check what Supabase does on partial failure
   mid-array and decide whether you need a transaction (Supabase-js doesn't
   give you one directly across `flowchart_blocks` + `flowchart_programs` —
   you may want a Postgres function/RPC, or you may decide the risk is
   acceptable for v1). Either way, **state the reasoning in the PR** per
   CLAUDE.md's "state assumptions explicitly."
5. Insert one `flowchart_programs` row: `{ flowchart_id, program_id, role: 'primary' }`.
6. Update `flowcharts.template_synced_at = now()` for the flowchart — that
   column exists specifically for this moment (see its comment in
   `db/schema.sql`); nothing reads it yet, but this is what should start
   populating it.
7. Return a count (or the created rows) so a caller/test can assert
   against it.

**Placeholders (Gen Ed, Immersion N, CS Elective, etc.) materialize as
ordinary blocks** — `kind='placeholder'`, `label` copied from the slot,
`course_id` left null. This is unaffected by the still-open
"immersions ingested as entities only" flag in `schema-decisions.md`: that
gap only matters when a *later* task tries to resolve an Immersion
placeholder to a specific course from that immersion's actual course list
(Task 9's problem). Instantiation itself doesn't need to know what's inside
an immersion — it just needs to place the generic "Immersion 1" block where
the template says it goes.

### Edge cases to think through (not just the happy path)

- `programId` resolves to zero requirement slots (bad id, or an immersion
  passed where a degree program was expected) — error out, or a documented
  no-op? Pick one and say why.
- The flowchart already has blocks (re-instantiating, or instantiating onto
  a flowchart that wasn't actually empty) — reject a non-empty flowchart,
  or allow it and let blocks accumulate? The brief doesn't require
  supporting a merge of "start blank" + "start from template" — if you
  scope that out, say so explicitly rather than silently.
- Partial insert failure (see step 4) — document your transaction/no-
  transaction decision either way.

### Tests to write

This is your "core logic" test-coverage obligation per CLAUDE.md.
- Instantiate CS BS (`computer-science-bs`) against seeded/fixture slots
  and assert: block count matches slot count, total `credits_override`
  sums to 126, every block's `source_slot_id` is set, `is_user_modified`
  is `false` on every row, co-op blocks land in the right season.
- At least one negative case covering whichever edge case decision you made
  above (empty slot set, or re-instantiation).
- Match the project's existing fixture conventions — see
  `tests/prereqs/fixtures/prereqs.ts` or
  `tests/ingest/programs-api/parse-course-detail.test.ts` for the pattern
  used elsewhere in this repo; `tests/fixtures/programs-api/computer-science-bs-curriculum.html`
  may be easier to seed slots from than hand-writing 43 fixture rows.

### Acceptance criteria

Instantiating a new flowchart from CS BS (`computer-science-bs`, already
ingested by Task 2) produces one block per `catalog_requirement_slots` row
for that program, with correct year/season/kind/course_id/label, every
block's `source_slot_id` set, and total credits summing to 126 — the number
Task 2's own acceptance test already established for this program, so this
is a cheap, concrete cross-check rather than a guess.

**Not this task:** "start blank" (a flowchart with zero programs/blocks)
already works via Task 1's existing `createFlowchart` — this task adds the
templated path alongside it, not a replacement.

### Handing this back

Once your function and its tests pass locally: ask Claude Code to (a) wire
it into a server action in `src/app/flowcharts/actions.ts` — pure
route/form-binding scaffolding, no business logic left to relitigate — and
(b) run `/code-review` against the diff before you open the PR. Treat that
review the way Task 5's pre-merge QA pass worked: a real second pass, not
a rubber stamp.

---

## Task 8 — Block CRUD (partial spec — reorder piece only)

**Owner: Split.** Notes, completion-state, and custom-block creation are
plain field updates/inserts on `flowchart_blocks` — delegate those. The
`sort_order` reorder logic (what happens to every other block in a
year/season column when one block moves) has real algorithmic edge cases —
worth doing yourself if you want the practice, since it's the kind of "here's
a list, here's a move, what do you update" problem that comes up in
interviews. Not fully step-by-step specced yet; when you pick this up,
think about: moving within a column (renumbering `sort_order` for the
blocks between old and new position) versus moving across columns (also
changing `year_number`/`season`), and whether to renumber every affected row
on every move or leave gaps and renumber lazily.

**New since this brief was written:** `flowchart_blocks` gained
`span_group_id` (schema-decisions.md, Decision 9) for multi-term blocks — a
year-long co-op stored as N linked rows sharing one `span_group_id`, not one
row with a range. Creating/editing a spanning block (keeping `flowchart_id`,
`kind`, and consecutive `(year_number, season)` consistent across every row
in the group) is not DB-enforced and has the same "real invariant, not a
plain field write" shape as the reorder logic above — bucket it with that
piece rather than the delegated plain-field work.

## Task 9 — Placeholder resolution

**Owner: You (hands-on).** This is the one place Decision 2 (resolving a
placeholder keeps the placeholder, it doesn't flatten to `kind='course'`) —
a genuinely counter-intuitive design choice — gets enforced in code. It also
likely needs a real validation call that isn't fully speced anywhere yet
(should a Gen Ed Artistic slot accept *any* course, or only one carrying a
matching `catalog_attributes` tag?) — a good opportunity to make and
document an actual engineering decision rather than transcribe one.

### Objective

Given a `flowchart_blocks` row with `kind = 'placeholder'` and a chosen
`catalog_courses.id`, resolve it: set `course_id` on the block while leaving
`kind = 'placeholder'` unchanged (Decision 2). Mark `is_user_modified =
true`. This is the block-update half of MVP feature 8 — Task 6 supplies the
"search for a course" half, Task 8 supplies generic block-update plumbing
this can reuse once it exists.

### Before you start

- Re-read `schema-decisions.md` Decision 2.
- Check `catalog_requirement_slots.required_attribute_id` and
  `category_hint` in `db/schema.sql` — these are what a placeholder block
  inherited from its source slot (via Task 7), and the closest thing to
  "what is this placeholder actually asking for."
- Confirm what's really in `catalog_course_attributes` before assuming you
  can validate against it — Task 3's live run wrote 350 tags from
  TigerCenter (`source = 'tigercenter'`), but the brief notes no writer for
  `source = 'programs_api'` exists yet. Don't assume full coverage; check.

### Step-by-step

1. Signature: something like
   `resolvePlaceholder(supabase, blockId, courseId): Promise<FlowchartBlock>`.
2. Fetch the block. Confirm `kind === 'placeholder'` — reject (don't
   silently no-op) if called on a `course`/`coop`/`custom` block; that's a
   caller bug, not a valid resolution.
3. **Make and document a validation-strictness decision** — this is the
   real judgment call in this task, and it connects directly to CLAUDE.md's
   warn-only principle (don't act on an inference you can't stand behind):
   - Hard-reject a course that doesn't match `required_attribute_id`?
   - Allow it but flag it somehow?
   - No validation in v1, resolved openly as a known gap (not a silent
     omission)?
   Any of these is defensible — pick one, write down why in the PR.
4. Update the block: `course_id = courseId`, `is_user_modified = true`.
   Leave `kind` untouched.
5. Return the updated block.

### Edge cases to think through

- Resolving an already-resolved placeholder (overwrite the existing
  `course_id`, or reject?).
- Resolving an Immersion placeholder specifically — there's no course list
  to validate against yet (the still-open "immersions ingested as entities
  only" schema flag), so this likely falls through to "no validation"
  regardless of your step-3 decision for Gen Ed slots. Say so explicitly
  rather than letting it happen by accident.

### Tests to write

- Resolve a Gen Ed placeholder with a matching-attribute course (success).
- Resolve with a non-matching course — assert whatever your step-3 decision
  said should happen.
- Attempt to resolve a non-placeholder block (should reject).
- Attempt to resolve an already-resolved placeholder — assert your decision
  from the edge cases above.

### Acceptance criteria

A placeholder block gains `course_id`, retains `kind = 'placeholder'`, and
`is_user_modified` flips to `true`; validation behavior matches whatever you
decided and documented in step 3.

### Handing this back

Ask Claude Code to wire the resolution action into the block-update route
(once Task 8's plumbing exists) and to update this brief's status once
merged.

## Task 10 — Multiple flowchart management (not detailed yet)

**Owner: Split.** List/rename/archive are plain CRUD — delegate. `duplicate`
(deep-copying a flowchart with all its blocks — new IDs, preserved relative
order, and a real question of whether `is_user_modified` should carry over
on the copy) has enough actual logic to be worth doing yourself if you want
more practice; otherwise it's fine to delegate too. Not step-by-step
specced yet — write it up the way Tasks 7/9 are above when you're ready to
start it.

## Scope reminders for all of Phase 3

- No section/meeting-time features (permanently out of scope, per CLAUDE.md
  and the PRD).
- No requirement-validation **UI** — Task 6 can *display* prereq/availability
  data that already exists, but building warning logic on top of it is v2.
- Any new user-data table would need RLS enabled in the same commit that
  creates it — not expected to be necessary for Task 6 or 7, since
  `flowcharts`/`flowchart_programs`/`flowchart_blocks` already exist with
  RLS from Task 1.
- Per the Phase 1 retrospective (`docs/process/ai-development-process.md`),
  a second-pass review before merge caught a real bug Task 5's own tests
  and clean `tsc`/`eslint` didn't — worth doing again here, especially for
  Task 7's materialization logic, which is real state-transition code, not
  a pure data pipeline.

---

## Reporting back

Same as Phase 1: PR with what you verified, what you assumed, what
surprised you. If anything here turns out to not match the live schema or
Task 1's actual code, flag it rather than working around it silently.
