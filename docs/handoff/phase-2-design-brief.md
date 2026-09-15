# Phase 2 Brief — UI/UX Design

**Status:** starting. **Owner: Claude Design, directed and critiqued by
Casey** — this phase is naturally design-tool-heavy rather than code-heavy,
so "hands-on" here means driving requirements and iterating on the output,
not writing markup by hand. See `docs/process/ai-development-process.md`'s
"Task ownership model" for how this compares to the Phase 3 split.

**Read first:** `docs/product/prd.md` (the 10 MVP features this needs to
cover), `CLAUDE.md`'s "Visual reference" note, `db/schema.sql`'s
`flowchart_blocks` table (the design has to represent every real state this
table can hold — not an idealized subset).

---

## Why Phase 2 doesn't need to wait on Phase 3

Design depends on the *schema* (what a block/flowchart can be), not on
ingested data or a working API. The schema has been stable since Task 1 and
isn't expected to change for Phase 3. Building Phase 2 and Phase 3 in
parallel is safe.

---

## Ground truth: every state the design has to represent

Pulled directly from `db/schema.sql`, not reconstructed from memory —
check this list against the live schema if it's been a while since you
last read it.

**`block_kind`** (`db/schema.sql:32`): `course`, `placeholder`, `coop`, `custom`

**`block_status`** (`db/schema.sql:37`): `planned`, `in_progress`,
`completed`, `transferred`, `waived`
- `transferred` = credit granted from elsewhere (AP, another institution)
- `waived` = requirement removed without credit (substitution, exemption)
- both carry a free-text origin note (e.g. "AP Calculus BC (5)")

**A block also carries:** `label` (placeholder/custom display name),
`course_id` (→ course code/title once resolved), `notes` (free text),
`credits_override`, `is_user_modified`, `year_number`/`season`/`sort_order`
(position — semantic, not pixels; see Decision 3 in `schema-decisions.md`).

**A resolved placeholder is `kind='placeholder'` *and* has a `course_id`**
(Decision 2) — it is not the same visual state as `kind='course'`, even
though it now points at a real course. The design needs a state for this
specifically: "this is a Gen Ed Artistic slot, filled with ARTH-135" reads
differently from a plain course block, and differently from an unresolved
placeholder.

---

## Visual reference

`CSUndergradFlowChart.pdf` (RIT's official CS BS flowchart) is the pattern
to carry forward, not copy verbatim — this is a personalized/editable tool,
not a static PDF reproduction:

- Grid: years as rows, terms (seasons) as columns
- Color-coded categories: CS/SWE (orange), Math (navy), Gen Ed (olive),
  Science (maroon), Open Elective (purple), Wellness (yellow), Co-op (light
  blue), First Year Requirement (red) — `category_hint` on a block is the
  likely source for this mapping; confirm it covers all the categories
  above once Task 6 (catalog read API) is available to check real data
  against, but don't block starting the design on that.
- Course blocks show code + title + prereqs in parentheses
- Placeholder blocks show a category name plus a blank line for the chosen
  course — the resolved-placeholder state above is the "blank line filled
  in" version of this
- Co-op terms render as full-width bars spanning the term column

---

## Screens to design

1. **Flowchart list / dashboard** — a signed-in user's named flowcharts
   (feature 9: multiple flowcharts per user — drafts, what-ifs, active
   plan). Empty state (first-time user, zero flowcharts) and populated
   state. Entry point to "new flowchart."
2. **New flowchart flow** — blank vs. start-from-template choice; if
   template, browse/pick a program filterable by `type`
   (major/minor/immersion/etc., per `catalog_programs.type` — feature 2).
3. **Main flowchart canvas** — the core screen. Year × term grid populated
   with blocks in every `block_kind`/`block_status` combination that's
   realistic (a completed course, a planned course, a waived requirement
   with its note visible, an unresolved placeholder, a resolved
   placeholder, a co-op full-width bar, a custom block), plus a per-term
   credit total (feature 3; co-op per feature 4).
4. **Block detail panel/modal** — opens on click (feature 5): course
   description/credits/prereqs for a `course`-kind block, the notes field
   (feature 6) and completion-state selector (feature 7) for any block,
   and the "resolve this placeholder" entry point for a `placeholder`-kind
   block.
5. **Placeholder resolution flow** — search/browse courses (feeds off Task
   6's catalog read API), pick one, confirm (feature 8). Needs a visible
   distinction between "any course accepted" and "must match this Gen Ed
   attribute" if Task 9 ends up enforcing that — check in with whatever
   Task 9 decided before finalizing this screen's copy, since that's a
   real backend decision this UI needs to reflect accurately, not guess at.
6. **Custom block creation** — minimal form: label, term placement, credits,
   notes (feature 10 — study abroad, research, extracurriculars).

---

## What "hands-on" means for you in this phase

You're not writing markup, but you are the one who has to catch two kinds
of gaps before they reach Phase 4:
- **Data-shape gaps** — a mockup that doesn't have a slot for `notes`, or
  that conflates "unresolved placeholder" and "resolved placeholder" into
  one visual, is a design that Phase 4 can't actually implement against the
  real schema. Check every screen against the "ground truth" list above.
- **Scope creep** — nothing here should imply section/meeting-time features
  (permanently out of scope, see `CLAUDE.md`). A design that shows seat
  counts or a weekly calendar view is out of scope no matter how good it
  looks.

---

## How to kick this off

Use the `design` skill to produce a multi-artboard canvas covering the six
screens above. A reasonable first prompt:

> Design the RIT flowchart planner's core screens per
> `docs/handoff/phase-2-design-brief.md`: flowchart list/dashboard, new-
> flowchart flow, the main year×term flowchart canvas (the centerpiece —
> spend the most effort here), block detail panel, placeholder resolution
> flow, and custom block creation. Follow the color/category system and
> grid pattern described in the brief's "Visual reference" section, and
> make sure every `block_kind`/`block_status` combination in "Ground truth"
> has a distinct visual representation on the canvas screen.

Start with the canvas screen alone if you'd rather review one screen deeply
before generating the rest — it's the highest-stakes screen (most complex,
most reused pattern) and the one worth the most iteration.
