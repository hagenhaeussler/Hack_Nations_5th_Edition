-- LabPilot hackathon MVP persistence schema.
-- No auth, ownership, organizations, or RLS requirements are introduced here.

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

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  title text,
  hypothesis text,
  domain text,
  experiment_type text,
  status text,
  setup_warnings jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  storage_path text,
  file_name text,
  mime_type text,
  extracted_text text,
  created_at timestamptz default now()
);

create table if not exists research_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  provider text,
  external_id text,
  title text,
  abstract text,
  url text,
  year int,
  authors jsonb default '[]',
  metadata jsonb default '{}',
  relevance_score numeric,
  novelty_relation text,
  is_fallback boolean default false,
  created_at timestamptz default now()
);

create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  source_id uuid references research_sources(id) on delete set null,
  file_id uuid references project_files(id) on delete set null,
  chunk_text text,
  chunk_index int,
  embedding vector(1536) null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text,
  summary text,
  novelty jsonb default '{}',
  stats jsonb default '{}',
  risk_analysis jsonb default '{}',
  calendar_layout jsonb default '{}',
  generation_mode text,
  setup_warnings jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists plan_nodes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete cascade,
  node_key text,
  title text,
  description text,
  day_offset int,
  duration_hours numeric,
  cost_estimate numeric,
  people jsonb default '[]',
  equipment jsonb default '[]',
  materials jsonb default '[]',
  missing_resources jsonb default '[]',
  validation_criteria jsonb default '[]',
  milestone text,
  status text,
  position jsonb default '{}',
  metadata jsonb default '{}'
);

create table if not exists plan_edges (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete cascade,
  source_node_key text,
  target_node_key text,
  label text,
  dependency_type text,
  metadata jsonb default '{}'
);

create table if not exists plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete cascade,
  version_number int,
  version_type text,
  snapshot jsonb,
  created_at timestamptz default now()
);

create table if not exists plan_change_log (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete cascade,
  actor text,
  change_type text,
  description text,
  patch jsonb,
  created_at timestamptz default now()
);

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  plan_id uuid references plans(id) on delete set null,
  lesson_type text,
  domain text,
  experiment_type text,
  step_type text,
  lesson_text text,
  structured_rule jsonb default '{}',
  applicability_conditions jsonb default '{}',
  confidence numeric,
  embedding vector(1536) null,
  created_at timestamptz default now()
);

create table if not exists job_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  job_type text,
  status text,
  progress int,
  error text,
  warnings jsonb default '[]',
  result jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
