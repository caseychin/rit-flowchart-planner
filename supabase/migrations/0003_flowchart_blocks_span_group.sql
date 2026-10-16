-- See flowchart_blocks.span_group_id comment in db/schema.sql and Decision 9
-- in docs/architecture/schema-decisions.md for the full rationale. No RLS
-- change: this is a column on an existing RLS-covered table.

alter table flowchart_blocks
  add column span_group_id uuid;

create index on flowchart_blocks (flowchart_id, span_group_id)
  where span_group_id is not null;
