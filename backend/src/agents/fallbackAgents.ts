import type {
  ExperimentPlan,
  HypothesisExtraction,
  LessonDraft,
  NoveltyAnalysis,
  PlanPatchDraft,
  ResearchSource,
} from "../schemas/agentSchemas.js";
import type { FinalExperimentPlan } from "../lib/projectTypes.js";

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function titleFromHypothesis(hypothesis: string): string {
  const cleaned = clean(hypothesis);
  if (cleaned.length <= 72) return cleaned || "Fallback experiment plan";
  const cut = cleaned.slice(0, 72);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 36 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

function inferDomain(hypothesis: string): string {
  const text = hypothesis.toLowerCase();
  if (/crispr|cas9|gene|rna|dna|cell|assay|protein|organoid/.test(text)) {
    return "Life sciences";
  }
  if (/battery|polymer|catalyst|material/.test(text)) return "Materials science";
  return "Experimental science";
}

function inferExperimentType(hypothesis: string): string {
  const text = hypothesis.toLowerCase();
  if (/screen|assay/.test(text)) return "Assay-based experiment";
  if (/compare|comparison/.test(text)) return "Comparative experiment";
  return "Lab experiment";
}

export function fallbackExtractHypothesis(hypothesis: string): HypothesisExtraction {
  const title = titleFromHypothesis(hypothesis);
  return {
    title,
    domain: inferDomain(hypothesis),
    experiment_type: inferExperimentType(hypothesis),
    independent_variables: ["Primary condition or intervention from the hypothesis"],
    dependent_variables: ["Measured outcome defined during planning"],
    methods: ["Literature review", "Pilot experiment", "Controlled measurement"],
    search_queries: [
      `${title} experimental protocol`,
      `${title} related work`,
      `${inferDomain(hypothesis)} ${inferExperimentType(hypothesis)} validation`,
    ],
    safety_notes: ["Fallback/demo extraction: confirm biosafety, approvals, and handling requirements before running wet-lab work."],
    missing_context_questions: [
      "What model system, sample type, and control conditions should be used?",
      "What success metric should determine whether the hypothesis is supported?",
    ],
  };
}

export function fallbackResearchSources(
  hypothesis: string,
  domain = inferDomain(hypothesis),
): ResearchSource[] {
  const title = titleFromHypothesis(hypothesis);
  return [
    {
      title: `Demo source: planning context for ${title}`,
      abstract:
        "Fallback/demo source generated because no external research API is configured. Use it only to exercise the LabPilot workflow; it is not a real citation.",
      url: null,
      year: null,
      authors: ["LabPilot demo mode"],
      external_id: "demo-source-001",
      metadata: { domain, fallback_reason: "research_api_missing" },
      relevance_score: 0.62,
      novelty_relation: "demo_context_only",
      is_fallback: true,
    },
    {
      title: `Demo source: controls and validation considerations for ${domain}`,
      abstract:
        "Fallback/demo source summarizing generic control, validation, replication, and resource-planning considerations. It does not claim to represent published work.",
      url: null,
      year: null,
      authors: ["LabPilot demo mode"],
      external_id: "demo-source-002",
      metadata: { domain, fallback_reason: "research_api_missing" },
      relevance_score: 0.55,
      novelty_relation: "demo_context_only",
      is_fallback: true,
    },
  ];
}

export function fallbackNoveltyAnalysis(
  hypothesis: string,
  sources: ResearchSource[],
): NoveltyAnalysis {
  void hypothesis;
  const fallbackCount = sources.filter((source) => source.is_fallback).length;
  return {
    novelty_score: fallbackCount === sources.length ? 0.5 : 0.62,
    verdict: fallbackCount === sources.length ? "insufficient_context" : "partially_novel",
    summary:
      fallbackCount === sources.length
        ? "Fallback/demo novelty check: no real research provider was available, so LabPilot cannot make a real novelty claim."
        : `Structured novelty check found ${sources.length} normalized source(s); confirm details before treating the idea as novel.`,
    closest_matches: sources.slice(0, 3).map((source) => ({
      title: source.title,
      relation: source.is_fallback ? "Demo source, not a real match" : (source.novelty_relation ?? "related"),
      similarity: source.relevance_score ?? 0.5,
      source_id: source.external_id ?? undefined,
    })),
    recommended_next_step:
      "Review the source list, add lab constraints, and generate a cautious pilot plan with explicit validation criteria.",
    warnings: fallbackCount > 0 ? ["Fallback/demo sources cannot establish scientific novelty."] : [],
  };
}

export function fallbackExperimentPlan(
  hypothesis: string,
  domain = inferDomain(hypothesis),
  sources: ResearchSource[] = [],
  labContext?: unknown,
): ExperimentPlan {
  void labContext;
  const novelty = fallbackNoveltyAnalysis(hypothesis, sources);
  const steps: Array<[string, number]> = [
    ["Clarify hypothesis and success criteria", 0],
    ["Review related work", 1],
    ["Define experimental variables", 1],
    ["Prepare materials and equipment", 2],
    ["Run pilot experiment", 3],
    ["Collect data", 4],
    ["Analyze results", 5],
    ["Validate hypothesis", 6],
    ["Prepare report", 7],
  ];

  return {
    title: titleFromHypothesis(hypothesis),
    summary:
      "Fallback/demo plan generated locally because OpenAI was unavailable or returned invalid structured output. Treat details as a planning scaffold, not scientific advice.",
    novelty,
    stats: {
      generation_mode: "fallback_demo",
      estimated_total_hours: 96,
      source_count: sources.length,
    },
    tasks: steps.map(([title, dayOffset], index) => ({
      task_key: `fallback_task_${String(index + 1).padStart(3, "0")}`,
      title,
      description:
        index === 0
          ? `Translate the hypothesis into measurable criteria: ${clean(hypothesis)}`
          : `Fallback/demo scheduled task for ${domain.toLowerCase()} planning: ${title.toLowerCase()}.`,
      step_type: "experiment_task",
      procedure: `Complete "${title}" and document decisions, outputs, risks, and next-day handoffs.`,
      scheduled_date: null,
      day_offset: dayOffset,
      week_index: Math.floor(dayOffset / 7),
      day_index: dayOffset % 7,
      duration_hours: index === 4 ? 24 : index === 6 ? 16 : 8,
      duration_days: index === 4 ? 1 : null,
      estimated_cost: index === 3 ? 500 : null,
      people_required: ["Research lead"],
      equipment_required: index === 3 || index === 4 ? ["Lab equipment to be confirmed"] : [],
      materials_required: index === 3 || index === 4 ? ["Materials to be confirmed"] : [],
      missing_resources: ["Specific protocol details need confirmation"],
      items_to_buy: index === 3 ? ["Experiment materials to be confirmed"] : [],
      validation_criteria: [`${title} has documented inputs, outputs, and acceptance criteria.`],
      milestone: index === steps.length - 1 ? "Report-ready experiment plan" : null,
      risks: index === 3 ? ["Resource availability may delay the schedule."] : [],
      status: index === 0 ? "active" : "upcoming",
      citations: [],
      domain_experts: [],
      source_references: [],
      related_lesson_ids: [],
      uncertainty_notes: ["Fallback/demo task: confirm protocol-specific details before execution."],
      metadata: { fallback_demo: true },
    })),
    calendar_layout: {},
    setup_warnings: ["Fallback/demo plan: OpenAI-backed Creator Agent was not used."],
  };
}

export function fallbackQA(question: string, plan: FinalExperimentPlan | null) {
  const planLabel = plan?.experiment_title ?? "the current plan";
  return {
    answer:
      `Fallback/demo answer about ${planLabel}: I can inspect the saved plan structure, but OpenAI is unavailable. ` +
      `For "${clean(question)}", review the relevant scheduled task details, calendar week, stats report, and risk panel before acting.`,
    used_context: {
      plan_id: plan?.plan_id ?? "unknown",
      task_ids: plan?.nodes.slice(0, 3).map((node) => node.node_id) ?? [],
      node_ids: plan?.nodes.slice(0, 3).map((node) => node.node_id) ?? [],
      edge_ids: [],
      citation_ids: [],
      lesson_ids: plan?.source_lesson_ids ?? [],
      source_types: ["fallback_demo_plan"],
    },
    suggested_actions: [
      { type: "open_report_section", label: "Review the report summary" },
      { type: "open_risk_summary", label: "Analyze plan risks" },
    ],
    confidence: "low" as const,
    warnings: ["Fallback/demo QA: OpenAI was not used."],
  };
}

export function fallbackEditorPatch(instruction: string): PlanPatchDraft {
  return {
    intent_summary: `Fallback/demo patch interpretation for: ${clean(instruction)}`,
    operations: [],
    expected_effects: ["No automatic edit was generated in fallback mode."],
    requires_confirmation: true,
    safety_notes: [
      "Fallback editor avoids destructive calendar changes unless the user edits fields through existing UI controls.",
    ],
    warnings: ["Fallback/demo editor: OpenAI patch generation was not used."],
  };
}

export function fallbackRiskAnalysis(plan: FinalExperimentPlan) {
  return {
    overall_risk_level: "medium" as const,
    risks: plan.nodes
      .filter((node) => node.equipment_missing.length > 0 || node.uncertainty_notes.length > 0)
      .slice(0, 5)
      .map((node) => ({
        title: `Unconfirmed resources or assumptions for ${node.step_name}`,
        severity: "medium" as const,
        probability: "unknown" as const,
        impact: "medium" as const,
        explanation: "Fallback/demo risk generated from missing resources and uncertainty notes.",
        affected_nodes: [node.node_id],
        recommended_mitigation: ["Confirm resources, timing, safety constraints, and validation criteria before execution."],
      })),
    missing_information: plan.open_questions,
    recommended_actions: ["Run deterministic risk analyzer and confirm missing resource assumptions."],
    warnings: ["Fallback/demo risk explanation: OpenAI was not used."],
  };
}

export function fallbackLesson(feedback: string): LessonDraft {
  return {
    lesson_type: "general_planning_preference",
    domain: "unknown",
    lesson_text: `Fallback/demo lesson candidate from feedback: ${clean(feedback)}`,
    structured_rule: { fallback_demo: true },
    applicability_conditions: {},
    confidence: 0.3,
    embedding_text: clean(feedback),
  };
}
