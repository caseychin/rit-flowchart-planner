-- A block that spans multiple consecutive terms (a year-long co-op running
-- Fall/Spring/Summer, say) is stored as one flowchart_blocks row PER TERM it
-- occupies, not as a single row with a start/end range. span_group_id links
-- those rows so the UI/API can merge them into one rendered block.
--
-- Why not widen position to a range instead: (year_number, season,
-- sort_order) staying a single concrete value per row is what makes
-- "what's in Fall of Year 3" a plain equality query (Decision 3). A range
-- would turn every position-scoped query into an overlap check, for a case
-- that's rare and, being co-op, contributes 0 credits either way.
--
-- Grouped rows are expected (not DB-enforced) to share flowchart_id and
-- kind, and to sit on consecutive (year_number, season) positions — the
-- API layer owns validating that on write, same as block_shape's sibling
-- invariants aren't all enforced in SQL either.
--
-- See docs/architecture/schema-decisions.md, Decision 9. No RLS change:
-- this is a column on an existing RLS-covered table (flowchart_blocks'
-- "own blocks" policy already scopes every column via flowchart_id).

alter table flowchart_blocks
  add column span_group_id uuid;

create index on flowchart_blocks (flowchart_id, span_group_id)
  where span_group_id is not null;
