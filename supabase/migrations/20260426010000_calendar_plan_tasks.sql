-- Calendar-first plan storage for LabPilot.
-- Keeps legacy plan_nodes/plan_edges in place, but new code should write plan_tasks.

alter table if exists plans
  add column if not exists plan_start_date date,
  add column if not exists plan_end_date date,
  add column if not exists plan_type text not null default 'calendar';

create table if not exists plan_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete cascade,
  task_key text,
  title text,
  description text,
  step_type text,
  procedure text,
  scheduled_date date,
  day_offset int,
  week_index int,
  day_index int,
  duration_hours numeric,
  duration_days numeric,
  estimated_cost numeric,
  people_required jsonb not null default '[]'::jsonb,
  equipment_required jsonb not null default '[]'::jsonb,
  materials_required jsonb not null default '[]'::jsonb,
  missing_resources jsonb not null default '[]'::jsonb,
  items_to_buy jsonb not null default '[]'::jsonb,
  validation_criteria jsonb not null default '[]'::jsonb,
  milestone text,
  risks jsonb not null default '[]'::jsonb,
  status text,
  citations jsonb not null default '[]'::jsonb,
  domain_experts jsonb not null default '[]'::jsonb,
  source_references jsonb not null default '[]'::jsonb,
  related_lesson_ids jsonb not null default '[]'::jsonb,
  uncertainty_notes jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plan_tasks_plan_id_date_idx
  on plan_tasks (plan_id, scheduled_date, day_offset);

comment on table plan_edges is
  'Deprecated compatibility table. Calendar plans use plan_tasks and calendar_layout instead of graph edges.';
