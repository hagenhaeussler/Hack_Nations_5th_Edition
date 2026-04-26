import { randomUUID } from "node:crypto";

import { finalPlanToWorkflow } from "../lib/creatorAgent.js";
import { applyCalendarSchedule } from "../lib/creatorAgentSchedule.js";
import { getSetupWarnings } from "../lib/config.js";
import { validateExperimentPlanGraph, validateFinalPlanGraph } from "../lib/graphValidation.js";
import { tasksFromPlanNodes } from "../lib/calendarLayout.js";
import type {
  FinalExperimentPlan,
  FinalPlanCitation,
  FinalPlanEdge,
  FinalPlanNode,
  FinalPlanResource,
  Paper,
  PrePlan,
  Project,
  ProjectStatsReport,
  Workflow,
} from "../lib/projectTypes.js";
import type { LessonCard } from "../lib/projectTypes.js";
import {
  ExperimentPlanSchema,
  type ExperimentPlan,
  type HypothesisExtraction,
  type NoveltyAnalysis,
  type ResearchSource,
} from "../schemas/agentSchemas.js";
import { searchExternalResearch } from "../services/researchProvider.js";
import {
  fallbackExperimentPlan,
  fallbackExtractHypothesis,
  fallbackNoveltyAnalysis,
  fallbackQA,
} from "./fallbackAgents.js";
import {
  analyzeNoveltyWithOpenAI,
  answerQAWithOpenAI,
  extractHypothesisWithOpenAI,
  generatePlanWithOpenAI,
} from "./openaiAgents.js";

export interface ResearchAgentResult {
  extraction: HypothesisExtraction;
  sources: ResearchSource[];
  papers: Paper[];
  novelty: NoveltyAnalysis;
  warnings: string[];
  mode: "openai" | "fallback" | "partial";
}

export interface CreatorAgentResult {
  plan: FinalExperimentPlan;
  workflow: Workflow;
  calendar: { tasks: NonNullable<FinalExperimentPlan["tasks"]>; calendar_layout: FinalExperimentPlan["calendar_layout"] };
  stats: ProjectStatsReport;
  warnings: string[];
  generation_mode: "openai" | "fallback";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function sourceToPaper(source: ResearchSource, index: number): Paper {
  return {
    id: source.external_id ?? `source_${String(index + 1).padStart(3, "0")}`,
    title: source.title,
    authors: source.authors,
    year: source.year ?? new Date().getFullYear(),
    venue: source.is_fallback ? "LabPilot demo source" : String(source.metadata.provider ?? "External research"),
    similarity: source.relevance_score ?? 0.55,
    abstract: source.abstract,
    url: source.url ?? undefined,
    is_fallback: source.is_fallback,
    provider: source.is_fallback ? "demo" : String(source.metadata.provider ?? "generic"),
    novelty_relation: source.novelty_relation,
  };
}

export function paperToResearchSource(paper: Paper): ResearchSource {
  return {
    title: paper.title,
    abstract: paper.abstract,
    url: paper.url ?? null,
    year: paper.year,
    authors: paper.authors,
    external_id: paper.id,
    metadata: { venue: paper.venue, provider: paper.provider ?? "project_papers" },
    relevance_score: paper.similarity,
    novelty_relation: paper.novelty_relation,
    is_fallback: paper.is_fallback ?? false,
  };
}

export async function runResearchAgents(hypothesis: string): Promise<ResearchAgentResult> {
  const warnings = [...getSetupWarnings()];
  const extractionRun = await extractHypothesisWithOpenAI({
    hypothesis,
    fallbackFn: () => fallbackExtractHypothesis(hypothesis),
  });
  warnings.push(...extractionRun.warnings);

  const research = await searchExternalResearch({
    hypothesis,
    domain: extractionRun.data.domain,
    queries: extractionRun.data.search_queries,
  });
  warnings.push(...research.warnings);

  const noveltyRun = await analyzeNoveltyWithOpenAI({
    hypothesis,
    extraction: extractionRun.data,
    sources: research.sources,
    fallbackFn: () => fallbackNoveltyAnalysis(hypothesis, research.sources),
  });
  warnings.push(...noveltyRun.warnings);

  const mode =
    extractionRun.mode === "openai" && noveltyRun.mode === "openai"
      ? research.mode === "external"
        ? "openai"
        : "partial"
      : "fallback";

  return {
    extraction: extractionRun.data,
    sources: research.sources,
    papers: research.sources.map(sourceToPaper),
    novelty: noveltyRun.data,
    warnings: unique(warnings),
    mode,
  };
}

function resource(name: string, missing: boolean): FinalPlanResource {
  return {
    name,
    availability: missing ? "missing" : "unknown",
    reason: missing ? "Marked missing by structured agent output." : "No inventory confirmation was supplied.",
    estimated_price: null,
  };
}

function citationForSource(source: ResearchSource, index: number): FinalPlanCitation {
  return {
    document_id: source.external_id ?? `source_${index + 1}`,
    location: source.is_fallback ? "demo fallback source" : "normalized research source",
    quote_or_evidence: source.is_fallback
      ? "Demo source only; not a real paper or citation."
      : source.abstract.slice(0, 280),
  };
}

function buildStatsReport(args: {
  planId: string;
  hypothesis: string;
  summary: string;
  nodes: FinalPlanNode[];
  sourceLessonIds: string[];
  openQuestions: string[];
}): ProjectStatsReport {
  const budgetValues = args.nodes
    .map((node) => node.estimated_price.value)
    .filter((value): value is number => value !== null);
  const endDay = Math.max(1, ...args.nodes.map((node) => node.end.relative_day));
  return {
    report_id: `report_${randomUUID()}`,
    plan_id: args.planId,
    hypothesis: args.hypothesis,
    experiment_goal: args.summary,
    summary: args.summary,
    total_estimated_duration: {
      value: endDay,
      unit: "days",
      confidence: "medium",
      basis: "computed from structured agent plan",
    },
    total_estimated_budget: {
      value: budgetValues.length > 0 ? budgetValues.reduce((sum, value) => sum + value, 0) : null,
      currency: "USD",
      confidence: budgetValues.length > 0 ? "medium" : "low",
      basis: budgetValues.length > 0 ? "sum of node cost estimates" : "costs missing or unknown",
    },
    people_summary: unique(args.nodes.flatMap((node) => node.people_required.roles)),
    equipment_summary: {
      required: unique(args.nodes.flatMap((node) => node.equipment_required.map((item) => item.name))),
      available: unique(args.nodes.flatMap((node) => node.equipment_available)),
      missing: unique(args.nodes.flatMap((node) => node.equipment_missing)),
      unknown: unique(args.nodes.flatMap((node) => node.equipment_required.map((item) => item.name))),
    },
    materials_summary: {
      required: unique(args.nodes.flatMap((node) => node.materials_required.map((item) => item.name))),
      available: unique(args.nodes.flatMap((node) => node.materials_available)),
      missing: unique(args.nodes.flatMap((node) => node.materials_to_buy.map((item) => item.name))),
      unknown: [],
    },
    purchase_list: args.nodes.flatMap((node) => [...node.materials_to_buy, ...node.equipment_required.filter((item) => item.availability === "missing")]),
    task_summary: args.nodes.map((node) => ({
      node_id: node.node_id,
      step_name: node.step_name,
      start_day: node.start.relative_day,
      end_day: node.end.relative_day,
      status: node.status,
    })),
    validation_criteria_summary: unique(args.nodes.flatMap((node) => node.validation_criteria)),
    milestone_summary: args.nodes
      .filter((node) => node.milestone)
      .map((node) => ({ node_id: node.node_id, milestone: node.milestone! })),
    risk_summary: args.nodes.flatMap((node) => node.risks),
    domain_expert_summary: [],
    citation_summary: args.nodes.flatMap((node) => node.source_citations).slice(0, 12),
    learning_memory_summary:
      args.sourceLessonIds.length > 0
        ? [`Applied lesson cards: ${args.sourceLessonIds.join(", ")}.`]
        : ["No persisted lesson cards were applied."],
    open_questions: args.openQuestions,
    confidence_summary: "Structured agent output was validated before saving; estimates remain provisional until lab details are confirmed.",
  };
}

export function experimentPlanToFinalPlan(args: {
  project: Project;
  extraction: HypothesisExtraction;
  experimentPlan: ExperimentPlan;
  sources: ResearchSource[];
  lessons: LessonCard[];
  generationMode: "openai" | "fallback";
}): FinalExperimentPlan {
  const parsed = ExperimentPlanSchema.parse(args.experimentPlan);
  const scheduleValidation = validateExperimentPlanGraph(parsed);
  if (!scheduleValidation.ok) {
    throw new Error(`Structured experiment calendar failed validation: ${scheduleValidation.errors.join("; ")}`);
  }

  const planId = `plan_${randomUUID()}`;
  const sourceCitations = args.sources.slice(0, 5).map(citationForSource);
  const nodes: FinalPlanNode[] = parsed.tasks.map((task, index) => {
    const missingSet = new Set(task.missing_resources.map((item) => item.toLowerCase()));
    const equipment = task.equipment_required.map((item) => resource(item, missingSet.has(item.toLowerCase())));
    const materials = task.materials_required.map((item) => resource(item, missingSet.has(item.toLowerCase())));
    const durationDays = Math.max(1, Math.ceil(task.duration_hours / 24));
    return {
      node_id: task.task_key,
      step_name: task.title,
      step_purpose: task.description,
      detailed_procedure: task.procedure ?? task.description,
      people_required: {
        count: task.people_required.length > 0 ? task.people_required.length : null,
        roles: task.people_required,
      },
      assigned_people_if_known: [],
      equipment_required: equipment,
      equipment_available: [],
      equipment_missing: task.missing_resources.filter((item) =>
        task.equipment_required.some((equipmentName) => equipmentName.toLowerCase() === item.toLowerCase()),
      ),
      materials_required: materials,
      materials_available: [],
      materials_to_buy: [
        ...materials.filter((item) => item.availability === "missing"),
        ...task.items_to_buy.map((item) => ({ name: item, availability: "missing" as const })),
      ],
      estimated_duration: {
        value: durationDays,
        unit: "days",
        confidence: args.generationMode === "openai" ? "medium" : "low",
        basis: `Structured ${args.generationMode} agent estimate from ${task.duration_hours} hours.`,
      },
      estimated_price: {
        value: asNumber(task.estimated_cost),
        currency: "USD",
        confidence: task.estimated_cost === null ? "low" : "medium",
        basis: task.estimated_cost === null ? "No cost estimate supplied." : "Structured agent task cost estimate.",
      },
      domain_experts: [],
      source_citations: sourceCitations,
      source_preplan_node_ids: [],
      related_lesson_ids: unique([...args.lessons.map((lesson) => lesson.lesson_id), ...task.related_lesson_ids]),
      validation_criteria: task.validation_criteria,
      milestone: task.milestone,
      risks: task.missing_resources.length > 0
        ? [{
            risk_id: `risk_${task.task_key}`,
            description: `Missing or unconfirmed resources: ${task.missing_resources.join(", ")}`,
            severity: "medium",
            mitigation: "Confirm availability before this task starts.",
            source: args.generationMode,
          }]
        : [],
      uncertainty_notes: unique([...parsed.setup_warnings, ...task.uncertainty_notes]),
      start: { type: "relative", relative_day: task.day_offset, date: task.scheduled_date ?? null },
      end: { type: "relative", relative_day: task.day_offset + durationDays, date: null },
      calendar_position: {
        week_index: task.week_index ?? Math.floor(task.day_offset / 7),
        day_index: task.day_index ?? task.day_offset % 7,
        x: task.day_offset * 36,
        y: (index % 5) * 160,
        width: 180,
        lane: index % 5,
      },
      parent_ids: [],
      child_ids: [],
      status: task.status,
    };
  });

  const edges: FinalPlanEdge[] = [];
  const scheduled = applyCalendarSchedule(nodes, edges);
  const sourceLessonIds = unique(args.lessons.map((lesson) => lesson.lesson_id));
  const openQuestions = unique([
    ...args.extraction.missing_context_questions,
    ...parsed.setup_warnings,
  ]).slice(0, 12);
  const statsReport = buildStatsReport({
    planId,
    hypothesis: args.project.hypothesis,
    summary: parsed.summary,
    nodes: scheduled.nodes,
    sourceLessonIds,
    openQuestions,
  });

  const finalPlan: FinalExperimentPlan = {
    plan_id: planId,
    user_input_id: args.project.id,
    hypothesis: args.project.hypothesis,
    experiment_title: parsed.title,
    experiment_goal: parsed.summary,
    domain: args.extraction.domain,
    experiment_type: args.extraction.experiment_type,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source_preplan_ids: args.project.prePlan ? [args.project.prePlan.pre_plan_id] : [],
    source_document_ids: unique(args.sources.map((source) => source.external_id ?? source.title)),
    source_lesson_ids: sourceLessonIds,
    source_previous_experiment_ids: [],
    plan_type: "calendar",
    plan_start_date: scheduled.calendarLayout.plan_start_date ?? scheduled.calendarLayout.timeline_start_date,
    plan_end_date: scheduled.calendarLayout.plan_end_date ?? scheduled.calendarLayout.timeline_end_date,
    tasks: tasksFromPlanNodes(scheduled.nodes),
    nodes: scheduled.nodes,
    edges: [],
    calendar_layout: scheduled.calendarLayout,
    stats_report: statsReport,
    confidence: args.generationMode === "openai" ? "medium" : "low",
    open_questions: openQuestions,
    agent_notes: [
      args.generationMode === "openai"
        ? "Generated by OpenAI-backed Creator Agent as a calendar task schedule and validated before save."
        : "Fallback/demo calendar plan generated locally because OpenAI was unavailable or invalid.",
      ...parsed.setup_warnings,
    ],
    creator_explanation: parsed.summary,
  };

  const finalValidation = validateFinalPlanGraph(finalPlan);
  if (!finalValidation.ok) {
    throw new Error(`Final calendar plan failed validation: ${finalValidation.errors.join("; ")}`);
  }
  return finalPlan;
}

export async function runCreatorPlanAgents(args: {
  project: Project;
  prePlan: PrePlan | null;
  lessons: LessonCard[];
  labContext?: unknown;
}): Promise<CreatorAgentResult> {
  const warnings = [...getSetupWarnings()];
  const sources = (args.project.papers ?? []).map(paperToResearchSource);
  const extraction = fallbackExtractHypothesis(args.project.hypothesis);
  const novelty = fallbackNoveltyAnalysis(args.project.hypothesis, sources);
  const fallbackPlan = () =>
    fallbackExperimentPlan(args.project.hypothesis, extraction.domain, sources, args.labContext);

  let planRun = await generatePlanWithOpenAI({
    hypothesis: args.project.hypothesis,
    extraction,
    sources,
    novelty,
    labContext: args.labContext,
    prePlan: args.prePlan,
    chunks: [],
    lessons: args.lessons,
    previousPlan: args.project.finalPlan ?? null,
    fallbackFn: fallbackPlan,
  });
  warnings.push(...planRun.warnings);

  let generationMode = planRun.mode;
  let finalPlan: FinalExperimentPlan;
  try {
    finalPlan = experimentPlanToFinalPlan({
      project: args.project,
      extraction,
      experimentPlan: planRun.data,
      sources,
      lessons: args.lessons,
      generationMode,
    });
  } catch (err) {
    warnings.push(
      err instanceof Error ? err.message : "OpenAI calendar conversion failed.",
      "OpenAI returned invalid structured output. Used local fallback.",
    );
    planRun = { data: fallbackPlan(), mode: "fallback", warnings };
    generationMode = "fallback";
    finalPlan = experimentPlanToFinalPlan({
      project: args.project,
      extraction,
      experimentPlan: planRun.data,
      sources,
      lessons: args.lessons,
      generationMode,
    });
  }

  const workflow = finalPlanToWorkflow(finalPlan);
  return {
    plan: finalPlan,
    workflow,
    calendar: { tasks: finalPlan.tasks ?? [], calendar_layout: finalPlan.calendar_layout },
    stats: finalPlan.stats_report,
    warnings: unique(warnings),
    generation_mode: generationMode,
  };
}

export async function runQAAgent(args: {
  question: string;
  plan: FinalExperimentPlan;
  context: unknown;
}) {
  return answerQAWithOpenAI({
    question: args.question,
    plan: args.plan,
    context: args.context,
    fallbackFn: () => fallbackQA(args.question, args.plan),
  });
}
