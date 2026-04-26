import { z } from "zod";

const stringArray = z.array(z.string()).default([]);
const recordSchema = z.record(z.string(), z.unknown()).default({});
const nullableString = z.string().nullable().default(null);

export const HypothesisOntologySchema = z.object({
  intervention: nullableString,
  control: nullableString,
  biological_system: nullableString,
  endpoint: nullableString,
  mechanism: nullableString,
  success_threshold: nullableString,
}).default({
  intervention: null,
  control: null,
  biological_system: null,
  endpoint: null,
  mechanism: null,
  success_threshold: null,
});

export const HypothesisExtractionSchema = z.object({
  title: z.string(),
  domain: z.string(),
  experiment_type: z.string(),
  scientific_ontology: HypothesisOntologySchema,
  independent_variables: stringArray,
  dependent_variables: stringArray,
  methods: stringArray,
  search_queries: stringArray,
  safety_notes: stringArray,
  missing_context_questions: stringArray,
});

export const ResearchSourceSchema = z.object({
  title: z.string(),
  abstract: z.string(),
  url: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  authors: stringArray,
  external_id: z.string().nullable().optional(),
  metadata: recordSchema,
  relevance_score: z.number().min(0).max(1).optional(),
  novelty_relation: z.string().optional(),
  is_fallback: z.boolean().default(false),
});

export const NoveltyAnalysisSchema = z.object({
  novelty_score: z.number().min(0).max(1),
  verdict: z.enum(["novel", "partially_novel", "redundant", "insufficient_context"]),
  summary: z.string(),
  closest_matches: z.array(z.object({
    title: z.string(),
    relation: z.string(),
    similarity: z.number().min(0).max(1),
    source_id: z.string().optional(),
  })).default([]),
  recommended_next_step: z.string(),
  warnings: stringArray,
});

export const PlanTaskSchema = z.object({
  task_key: z.string(),
  title: z.string(),
  description: z.string(),
  step_type: z.string().default("experiment_task"),
  procedure: z.string().optional(),
  scheduled_date: z.string().nullable().optional(),
  day_offset: z.number().int().min(0),
  week_index: z.number().int().min(0).optional(),
  day_index: z.number().int().min(0).max(6).optional(),
  duration_hours: z.number().positive(),
  duration_days: z.number().positive().nullable().optional(),
  estimated_cost: z.number().min(0).nullable().default(null),
  people_required: stringArray,
  equipment_required: stringArray,
  materials_required: stringArray,
  missing_resources: stringArray,
  items_to_buy: stringArray,
  validation_criteria: stringArray,
  milestone: z.string().nullable().default(null),
  risks: stringArray,
  status: z.enum(["done", "active", "upcoming"]).default("upcoming"),
  citations: stringArray,
  domain_experts: stringArray,
  source_references: stringArray,
  related_lesson_ids: stringArray,
  uncertainty_notes: stringArray,
  metadata: recordSchema,
});

export const CalendarDaySchema = z.object({
  date: z.string(),
  day_index: z.number().int().min(0),
  label: z.string(),
  weekday: z.string(),
  task_ids: stringArray,
});

export const CalendarWeekSchema = z.object({
  week_index: z.number().int().min(0),
  start_date: z.string(),
  end_date: z.string(),
  days: z.array(CalendarDaySchema).default([]),
});

export const CalendarLayoutSchema = z.object({
  plan_start_date: z.string(),
  plan_end_date: z.string(),
  total_days: z.number().int().min(1),
  total_weeks: z.number().int().min(1),
  weeks: z.array(CalendarWeekSchema).default([]),
});

export const ExperimentPlanSchema = z.object({
  title: z.string(),
  summary: z.string(),
  novelty: NoveltyAnalysisSchema,
  plan_start_date: z.string().nullable().optional(),
  plan_end_date: z.string().nullable().optional(),
  stats: recordSchema,
  tasks: z.array(PlanTaskSchema).min(1),
  calendar_layout: CalendarLayoutSchema.or(recordSchema).optional(),
  setup_warnings: stringArray,
});

export const QASchema = z.object({
  answer: z.string(),
  used_context: z.object({
    plan_id: z.string(),
    task_ids: stringArray,
    node_ids: stringArray,
    edge_ids: stringArray,
    citation_ids: stringArray,
    lesson_ids: stringArray,
    source_types: stringArray,
  }),
  suggested_actions: z.array(z.object({
    type: z.string(),
    target_id: z.string().optional(),
    label: z.string(),
  })).default([]),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  warnings: stringArray,
});

export const PatchOperationSchema = z.object({
  operation_type: z.string(),
  target_type: z.enum(["task", "plan", "schedule", "report_section"]),
  target_id: z.string(),
  field_path: z.string(),
  old_value: z.unknown().optional(),
  new_value: z.unknown(),
  reason: z.string(),
  requires_recalculation: z.array(z.enum(["schedule", "stats_report"])).default([]),
  risk_level: z.enum(["low", "medium", "high", "blocked"]).default("medium"),
});

export const PlanPatchSchema = z.object({
  intent_summary: z.string(),
  operations: z.array(PatchOperationSchema).default([]),
  expected_effects: stringArray,
  requires_confirmation: z.boolean().default(true),
  safety_notes: stringArray,
  warnings: stringArray,
});

export const RiskAnalysisSchema = z.object({
  overall_risk_level: z.enum(["critical", "high", "medium", "low"]),
  risks: z.array(z.object({
    title: z.string(),
    severity: z.enum(["critical", "high", "medium", "low"]),
    probability: z.enum(["high", "medium", "low", "unknown"]),
    impact: z.enum(["high", "medium", "low"]),
    explanation: z.string(),
    affected_tasks: stringArray,
    affected_nodes: stringArray,
    recommended_mitigation: stringArray,
  })).default([]),
  missing_information: stringArray,
  recommended_actions: stringArray,
  warnings: stringArray,
});

export const LessonSchema = z.object({
  lesson_type: z.string(),
  domain: z.string(),
  experiment_type: z.string().optional(),
  step_type: z.string().optional(),
  lesson_text: z.string(),
  structured_rule: recordSchema,
  applicability_conditions: recordSchema,
  confidence: z.number().min(0).max(1),
  embedding_text: z.string(),
});

export type HypothesisExtraction = z.infer<typeof HypothesisExtractionSchema>;
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;
export type NoveltyAnalysis = z.infer<typeof NoveltyAnalysisSchema>;
export type ExperimentPlan = z.infer<typeof ExperimentPlanSchema>;
export type PlanTask = z.infer<typeof PlanTaskSchema>;
export type PlanPatchDraft = z.infer<typeof PlanPatchSchema>;
export type LessonDraft = z.infer<typeof LessonSchema>;
