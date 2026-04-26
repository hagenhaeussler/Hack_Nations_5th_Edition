-- Benchmark Evaluation System.
-- Stores researcher grades separately from normal project and plan data.

do $$
begin
  create extension if not exists pgcrypto;
exception when others then
  raise notice 'pgcrypto extension unavailable; configure UUID defaults manually if needed.';
end $$;

do $$
begin
  create extension if not exists vector;
exception when others then
  raise notice 'pgvector extension unavailable; embedding columns can remain null and keyword fallback will be used.';
end $$;

create table if not exists benchmark_evaluations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  -- LabPilot's current plan ids are app-level strings (for example plan_<uuid>).
  -- Keep this text so benchmark storage works with existing calendar plans.
  plan_id text,
  project_title text,
  plan_title text,
  hypothesis text,
  domain text,
  experiment_type text,
  generation_mode text,
  model_name text,
  overall_score numeric not null,
  timing_estimate_accuracy numeric not null,
  sequential_scheduling_logic numeric not null,
  procedure_correctness numeric not null,
  budget_estimate_accuracy numeric not null,
  equipment_personnel_accuracy numeric not null,
  citation_quality numeric not null,
  validation_criteria_quality numeric not null,
  written_feedback text,
  scores_json jsonb default '{}',
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists benchmark_evaluations_created_at_idx
  on benchmark_evaluations (created_at asc);

create index if not exists benchmark_evaluations_plan_id_idx
  on benchmark_evaluations (plan_id, created_at desc);

create table if not exists benchmark_insights (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid references benchmark_evaluations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  plan_id text,
  domain text,
  experiment_type text,
  insight_text text,
  structured_insight jsonb default '{}',
  category_tags jsonb default '[]',
  applies_to text,
  confidence numeric,
  embedding vector(1536) nullable,
  created_at timestamptz default now()
);

create index if not exists benchmark_insights_relevance_idx
  on benchmark_insights (domain, experiment_type, created_at desc);
