import { randomUUID } from "node:crypto";

import { applyCalendarSchedule } from "./creatorAgentSchedule.js";
import { tasksFromPlanNodes } from "./calendarLayout.js";
import { validateFinalExperimentPlan } from "./creatorAgentValidation.js";
import type {
  FinalExperimentPlan,
  FinalPlanCitation,
  FinalPlanEdge,
  FinalPlanEstimate,
  FinalPlanNode,
  FinalPlanPrice,
  FinalPlanResource,
  FinalPlanRisk,
  PrePlan,
  PrePlanNode,
  ProjectStatsReport,
  ResourceAvailability,
  Workflow,
} from "./projectTypes.js";

export interface LabInventoryInput {
  equipment?: string[];
  materials?: string[];
  people?: string[];
}

export interface LessonCardInput {
  lesson_id: string;
  title: string;
  summary: string;
  keywords?: string[];
  duration_multiplier?: number;
  cost_multiplier?: number;
  risk?: string;
}

export interface PreviousExperimentInput {
  experiment_id: string;
  title: string;
  summary: string;
  bottlenecks?: string[];
  lessons?: string[];
}

export interface CreatorAgentRunInput {
  user_input_id: string;
  hypothesis: string;
  prePlans: PrePlan[];
  labInventory?: LabInventoryInput;
  labProtocols?: string[];
  previousExperiments?: PreviousExperimentInput[];
  lessonCards?: LessonCardInput[];
  createdAt?: Date;
}

interface CandidateNode {
  prePlanId: string;
  node: PrePlanNode;
  score: number;
  reason: string;
}

const DEFAULT_CALENDAR_POSITION = {
  week_index: 0,
  day_index: 0,
  x: 0,
  y: 0,
  width: 180,
  lane: 0,
};

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3),
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeResource(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hasInventoryMatch(name: string, inventory: string[] | undefined): ResourceAvailability {
  if (!inventory || inventory.length === 0) return "unknown";
  const normalized = normalizeResource(name);
  const match = inventory.some((item) => {
    const normalizedItem = normalizeResource(item);
    return normalizedItem.includes(normalized) || normalized.includes(normalizedItem);
  });
  return match ? "available" : "missing";
}

function titleFromHypothesis(hypothesis: string): string {
  const cleaned = cleanText(hypothesis);
  if (cleaned.length <= 72) return cleaned || "Untitled experiment";
  const cut = cleaned.slice(0, 72);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 36 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

function inferDomain(prePlans: PrePlan[], hypothesis: string): string {
  const fromPrePlans = prePlans.map((plan) => plan.experiment_summary.domain).find(Boolean);
  if (fromPrePlans) return fromPrePlans;
  const text = hypothesis.toLowerCase();
  if (/crispr|cas9|gene|rna|cell/.test(text)) return "Molecular biology";
  if (/organoid|imaging|screen/.test(text)) return "Cell biology";
  return "Life sciences";
}

function inferExperimentType(prePlans: PrePlan[], hypothesis: string): string {
  const fromPrePlans = prePlans
    .map((plan) => plan.experiment_summary.experiment_type)
    .find(Boolean);
  if (fromPrePlans) return fromPrePlans;
  return /screen|assay/.test(hypothesis.toLowerCase())
    ? "Assay-based experiment"
    : "Lab experiment";
}

function scorePrePlanNode(hypothesis: string, prePlan: PrePlan, node: PrePlanNode): CandidateNode {
  const hypothesisTokens = tokenize(hypothesis);
  const nodeText = `${node.step_name} ${node.step_purpose} ${node.procedure}`;
  const nodeTokens = tokenize(nodeText);
  let overlap = 0;
  for (const token of hypothesisTokens) {
    if (nodeTokens.has(token)) overlap += 1;
  }

  const citationBoost = Math.min(0.25, node.source_citations.length * 0.05);
  const confidenceBoost =
    prePlan.experiment_summary.reconstruction_confidence === "high"
      ? 0.2
      : prePlan.experiment_summary.reconstruction_confidence === "medium"
        ? 0.1
        : 0;
  const score = overlap / Math.max(1, hypothesisTokens.size) + citationBoost + confidenceBoost;

  return {
    prePlanId: prePlan.pre_plan_id,
    node,
    score,
    reason:
      overlap > 0
        ? `Matched ${overlap} hypothesis term${overlap === 1 ? "" : "s"} and preserved cited procedure evidence.`
        : "Included as part of a related reusable pre-plan DAG.",
  };
}

function stepKey(node: PrePlanNode): string {
  const text = `${node.step_name} ${node.step_purpose}`.toLowerCase();
  if (/design|hypothesis|guide|select|control|approval/.test(text)) return "design";
  if (/order|buy|reagent|material|prepare|sample|cell/.test(text)) return "prepare";
  if (/deliver|run|stimulate|apply|experiment|assay|measure|culture/.test(text)) return "execute";
  if (/analy|sequence|data|result|validate/.test(text)) return "analyze";
  return normalizeResource(node.step_name);
}

function durationToDays(step: PrePlanNode): FinalPlanEstimate {
  const { value, unit, confidence, basis } = step.estimated_duration;
  const normalized = unit.toLowerCase();
  if (value !== null) {
    const days = normalized.includes("hour")
      ? Math.max(1, Math.ceil(value / 24))
      : normalized.includes("week")
        ? Math.max(1, Math.ceil(value * 7))
        : normalized.includes("month")
          ? Math.max(1, Math.ceil(value * 30))
          : Math.max(1, Math.ceil(value));
    return {
      value: days,
      unit: "days",
      confidence,
      basis,
    };
  }

  const key = stepKey(step);
  const fallback = key === "prepare" ? 4 : key === "execute" ? 3 : key === "analyze" ? 4 : 2;
  return {
    value: fallback,
    unit: "days",
    confidence: "low",
    basis: `inferred by Creator Agent because source only stated "${basis || "unknown"}"`,
  };
}

function priceFromPrePlan(step: PrePlanNode): FinalPlanPrice {
  return {
    value: step.estimated_price.value,
    currency: "USD",
    confidence: step.estimated_price.confidence,
    basis: step.estimated_price.basis,
  };
}

function resourceList(
  names: string[],
  inventory: string[] | undefined,
  typeLabel: "equipment" | "material",
): FinalPlanResource[] {
  return unique(names).map((name) => {
    const availability = hasInventoryMatch(name, inventory);
    return {
      name,
      quantity: "unknown",
      unit: "unknown",
      availability,
      reason:
        availability === "available"
          ? `Matched against lab ${typeLabel} inventory.`
          : availability === "missing"
            ? `Not found in supplied lab ${typeLabel} inventory.`
            : `No lab ${typeLabel} inventory was supplied.`,
      estimated_price: null,
    };
  });
}

function citationsForCandidate(candidate: CandidateNode): FinalPlanCitation[] {
  return candidate.node.source_citations.map((citation) => ({
    document_id: citation.document_id,
    location: citation.location,
    quote_or_evidence: citation.quote_or_evidence,
    source_preplan_id: candidate.prePlanId,
  }));
}

function applyLessons(
  base: FinalPlanNode,
  lessons: LessonCardInput[],
  previousExperiments: PreviousExperimentInput[],
): FinalPlanNode {
  const text = `${base.step_name} ${base.step_purpose} ${base.detailed_procedure}`.toLowerCase();
  const matchingLessons = lessons.filter((lesson) =>
    (lesson.keywords ?? [lesson.title]).some((keyword) =>
      text.includes(keyword.toLowerCase()),
    ),
  );
  const matchingExperiments = previousExperiments.filter((experiment) =>
    [experiment.title, ...(experiment.bottlenecks ?? [])].some((keyword) =>
      text.includes(keyword.toLowerCase()),
    ),
  );

  let duration = base.estimated_duration.value;
  let price = base.estimated_price.value;
  const risks: FinalPlanRisk[] = [...base.risks];
  const relatedLessonIds: string[] = [...base.related_lesson_ids];
  const uncertaintyNotes = [...base.uncertainty_notes];

  for (const lesson of matchingLessons) {
    relatedLessonIds.push(lesson.lesson_id);
    if (duration !== null && lesson.duration_multiplier) {
      duration = Math.max(1, Math.ceil(duration * lesson.duration_multiplier));
    }
    if (price !== null && lesson.cost_multiplier) {
      price = Math.ceil(price * lesson.cost_multiplier);
    }
    if (lesson.risk) {
      risks.push({
        risk_id: `risk_${lesson.lesson_id}`,
        description: lesson.risk,
        severity: "medium",
        mitigation: lesson.summary,
        source: lesson.lesson_id,
      });
    }
  }

  for (const experiment of matchingExperiments) {
    risks.push({
      risk_id: `risk_${experiment.experiment_id}`,
      description: `Previous related experiment reported bottlenecks: ${(experiment.bottlenecks ?? ["unknown"]).join(", ")}.`,
      severity: "medium",
      mitigation: "Review previous run notes before starting this step.",
      source: experiment.experiment_id,
    });
  }

  if (matchingLessons.length > 0) {
    uncertaintyNotes.push("Timing and/or cost were adjusted using matching lesson cards.");
  }

  return {
    ...base,
    estimated_duration: {
      ...base.estimated_duration,
      value: duration,
      basis:
        matchingLessons.length > 0
          ? `${base.estimated_duration.basis}; adjusted by learning memory`
          : base.estimated_duration.basis,
    },
    estimated_price: {
      ...base.estimated_price,
      value: price,
      basis:
        matchingLessons.length > 0
          ? `${base.estimated_price.basis}; adjusted by learning memory`
          : base.estimated_price.basis,
    },
    related_lesson_ids: unique(relatedLessonIds),
    risks,
    uncertainty_notes: unique(uncertaintyNotes),
  };
}

function buildFinalNode(
  nodeId: string,
  group: CandidateNode[],
  inventory: LabInventoryInput | undefined,
  lessons: LessonCardInput[],
  previousExperiments: PreviousExperimentInput[],
): FinalPlanNode {
  const primary = group.sort((a, b) => b.score - a.score)[0]!;
  const sourceNodes = group.map((item) => item.node);
  const equipment = resourceList(
    sourceNodes.flatMap((node) => node.equipment_required.map((item) => item.name)),
    inventory?.equipment,
    "equipment",
  );
  const materials = resourceList(
    sourceNodes.flatMap((node) => node.materials_required.map((item) => item.name)),
    inventory?.materials,
    "material",
  );
  const peopleRoles = unique(sourceNodes.flatMap((node) => node.people_required.roles));
  const duration = durationToDays(primary.node);
  const price = priceFromPrePlan(primary.node);

  const base: FinalPlanNode = {
    node_id: nodeId,
    step_name: primary.node.step_name,
    step_purpose: `${primary.node.step_purpose} Adapted for the current hypothesis.`,
    detailed_procedure: primary.node.procedure,
    people_required: {
      count: primary.node.people_required.count ?? 1,
      roles: peopleRoles.length > 0 ? peopleRoles : ["Research team"],
    },
    assigned_people_if_known: inventory?.people ?? [],
    equipment_required: equipment,
    equipment_available: equipment.filter((item) => item.availability === "available").map((item) => item.name),
    equipment_missing: equipment.filter((item) => item.availability === "missing").map((item) => item.name),
    materials_required: materials,
    materials_available: materials.filter((item) => item.availability === "available").map((item) => item.name),
    materials_to_buy: materials.filter((item) => item.availability !== "available"),
    estimated_duration: duration,
    estimated_price: price,
    domain_experts: sourceNodes.flatMap((node) => node.domain_experts).slice(0, 6),
    source_citations: group.flatMap(citationsForCandidate),
    source_preplan_node_ids: group.map((item) => `${item.prePlanId}:${item.node.node_id}`),
    related_lesson_ids: [],
    validation_criteria: unique(sourceNodes.flatMap((node) => node.validation_criteria)),
    milestone: /analy|result|validate|main|run|measure/.test(primary.node.step_name.toLowerCase())
      ? primary.node.step_name
      : null,
    risks: [
      ...equipment
        .filter((item) => item.availability === "missing")
        .map<FinalPlanRisk>((item) => ({
          risk_id: `risk_${nodeId}_${normalizeResource(item.name).replace(/\s+/g, "_")}`,
          description: `${item.name} is missing from supplied lab inventory.`,
          severity: "high",
          mitigation: "Confirm availability or source before this step starts.",
          source: "lab_inventory",
        })),
    ],
    uncertainty_notes: unique(sourceNodes.flatMap((node) => node.uncertainties)),
    start: { type: "relative", relative_day: 0, date: null },
    end: { type: "relative", relative_day: 1, date: null },
    calendar_position: DEFAULT_CALENDAR_POSITION,
    parent_ids: [],
    child_ids: [],
    status: "upcoming",
  };

  return applyLessons(base, lessons, previousExperiments);
}

function fallbackCandidates(hypothesis: string): CandidateNode[] {
  const make = (node_id: string, step_name: string, step_purpose: string, parent_ids: string[]): CandidateNode => ({
    prePlanId: "creator_fallback",
    score: 0.1,
    reason: "Added by Creator Agent because no reusable pre-plan nodes were available.",
    node: {
      node_id,
      step_name,
      step_purpose,
      people_required: { count: 1, roles: ["Research team"] },
      equipment_required: [{ name: "Equipment to be confirmed", required: true, availability_assumption: "unknown" }],
      materials_required: [{ name: "Materials to be confirmed", quantity: "unknown", unit: "unknown" }],
      estimated_duration: { value: null, unit: "days", confidence: "low", basis: "not supplied" },
      estimated_price: { value: null, currency: "USD", confidence: "low", basis: "not supplied" },
      items_to_buy: [],
      domain_experts: [],
      source_citations: [],
      procedure: `Define and execute this step for: ${hypothesis}`,
      validation_criteria: ["Completion criteria to be confirmed by the scientist."],
      start: { type: "relative", value: parent_ids[0] ? `after ${parent_ids[0]}` : "project start", date: null },
      parent_ids,
      child_ids: [],
      uncertainties: ["No pre-plan DAG was supplied for this step."],
    },
  });

  return [
    make("step_001", "Frame final experiment objective", "Turn the hypothesis into a measurable objective.", []),
    make("step_002", "Design executable protocol", "Choose controls, readouts, and acceptance criteria.", ["step_001"]),
    make("step_003", "Prepare resources and samples", "Confirm equipment, materials, and sample readiness.", ["step_002"]),
    make("step_004", "Run experiment", "Execute the main experimental procedure.", ["step_003"]),
    make("step_005", "Analyze and validate results", "Analyze data and check validation criteria.", ["step_004"]),
  ];
}

function selectAndMergeCandidates(hypothesis: string, prePlans: PrePlan[]): CandidateNode[][] {
  const candidates = prePlans.flatMap((prePlan) =>
    prePlan.dag.nodes.map((node) => scorePrePlanNode(hypothesis, prePlan, node)),
  );
  const selected = candidates.length > 0
    ? candidates.sort((a, b) => b.score - a.score).slice(0, Math.max(5, Math.min(10, candidates.length)))
    : fallbackCandidates(hypothesis);

  const groups = new Map<string, CandidateNode[]>();
  for (const candidate of selected) {
    const key = stepKey(candidate.node);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  return Array.from(groups.values());
}

function constructEdges(_nodes: FinalPlanNode[], _groups: CandidateNode[][]): FinalPlanEdge[] {
  return [];
}

function attachRelationships(nodes: FinalPlanNode[], edges: FinalPlanEdge[]): FinalPlanNode[] {
  void edges;
  return nodes.map((node) => ({
    ...node,
    parent_ids: [],
    child_ids: [],
  }));
}

function buildStatsReport(
  planId: string,
  hypothesis: string,
  experimentGoal: string,
  nodes: FinalPlanNode[],
  sourceLessonIds: string[],
  openQuestions: string[],
): ProjectStatsReport {
  const requiredEquipment = unique(nodes.flatMap((node) => node.equipment_required.map((item) => item.name)));
  const availableEquipment = unique(nodes.flatMap((node) => node.equipment_available));
  const missingEquipment = unique(nodes.flatMap((node) => node.equipment_missing));
  const requiredMaterials = unique(nodes.flatMap((node) => node.materials_required.map((item) => item.name)));
  const availableMaterials = unique(nodes.flatMap((node) => node.materials_available));
  const materialsToBuy = nodes.flatMap((node) => node.materials_to_buy);
  const budgetValues = nodes
    .map((node) => node.estimated_price.value)
    .filter((value): value is number => value !== null);
  const endDay = Math.max(1, ...nodes.map((node) => node.end.relative_day));

  return {
    report_id: `report_${randomUUID()}`,
    plan_id: planId,
    hypothesis,
    experiment_goal: experimentGoal,
    summary: `Creator Agent synthesized ${nodes.length} executable tasks across ${Math.ceil(endDay / 7)} week${Math.ceil(endDay / 7) === 1 ? "" : "s"}.`,
    total_estimated_duration: {
      value: endDay,
      unit: "days",
      confidence: "medium",
      basis: "computed from scheduled calendar task durations",
    },
    total_estimated_budget: {
      value: budgetValues.length > 0 ? budgetValues.reduce((sum, value) => sum + value, 0) : null,
      currency: "USD",
      confidence: budgetValues.length > 0 ? "medium" : "low",
      basis: budgetValues.length > 0 ? "sum of node estimates" : "costs not stated in source material",
    },
    people_summary: unique(nodes.flatMap((node) => node.people_required.roles)),
    equipment_summary: {
      required: requiredEquipment,
      available: availableEquipment,
      missing: missingEquipment,
      unknown: requiredEquipment.filter(
        (item) => !availableEquipment.includes(item) && !missingEquipment.includes(item),
      ),
    },
    materials_summary: {
      required: requiredMaterials,
      available: availableMaterials,
      missing: unique(materialsToBuy.filter((item) => item.availability === "missing").map((item) => item.name)),
      unknown: unique(materialsToBuy.filter((item) => item.availability === "unknown").map((item) => item.name)),
    },
    purchase_list: materialsToBuy,
    task_summary: nodes.map((node) => ({
      node_id: node.node_id,
      step_name: node.step_name,
      start_day: node.start.relative_day,
      end_day: node.end.relative_day,
      status: node.status,
    })),
    validation_criteria_summary: unique(nodes.flatMap((node) => node.validation_criteria)),
    milestone_summary: nodes
      .filter((node) => node.milestone)
      .map((node) => ({ node_id: node.node_id, milestone: node.milestone! })),
    risk_summary: nodes.flatMap((node) => node.risks),
    domain_expert_summary: nodes.flatMap((node) => node.domain_experts).slice(0, 10),
    citation_summary: nodes.flatMap((node) => node.source_citations).slice(0, 12),
    learning_memory_summary:
      sourceLessonIds.length > 0
        ? [`Applied lesson cards: ${sourceLessonIds.join(", ")}.`]
        : ["No lab-specific lesson cards were supplied; estimates remain source-driven or low-confidence where inferred."],
    open_questions: openQuestions,
    confidence_summary:
      "Medium where source pre-plan citations and lab inventory supported the step; low where timing, cost, or availability had to be inferred.",
  };
}

export function runCreatorAgent(input: CreatorAgentRunInput): FinalExperimentPlan {
  const now = input.createdAt ?? new Date();
  const hypothesis = cleanText(input.hypothesis);
  const prePlans = input.prePlans;
  const groups = selectAndMergeCandidates(hypothesis, prePlans);
  const draftNodes = groups.map((group, index) =>
    buildFinalNode(
      `final_step_${String(index + 1).padStart(3, "0")}`,
      group,
      input.labInventory,
      input.lessonCards ?? [],
      input.previousExperiments ?? [],
    ),
  );
  const draftEdges = constructEdges(draftNodes, groups);
  const relatedNodes = attachRelationships(draftNodes, draftEdges);
  const scheduled = applyCalendarSchedule(relatedNodes, [], now);

  const sourceLessonIds = unique(scheduled.nodes.flatMap((node) => node.related_lesson_ids));
  const sourcePreviousExperimentIds = unique(
    scheduled.nodes.flatMap((node) =>
      node.risks
        .filter((risk) => risk.source.startsWith("prev_") || risk.source.includes("experiment"))
        .map((risk) => risk.source),
    ),
  );
  const openQuestions = unique([
    ...prePlans.flatMap((plan) => plan.open_questions),
    ...scheduled.nodes.flatMap((node) => node.uncertainty_notes),
  ]).slice(0, 12);
  const planId = `plan_${randomUUID()}`;
  const experimentGoal =
    prePlans[0]?.experiment_summary.goal ?? `Test the hypothesis: ${hypothesis}`;
  const statsReport = buildStatsReport(
    planId,
    hypothesis,
    experimentGoal,
    scheduled.nodes,
    sourceLessonIds,
    openQuestions,
  );

  const plan: FinalExperimentPlan = {
    plan_id: planId,
    user_input_id: input.user_input_id,
    hypothesis,
    experiment_title: titleFromHypothesis(hypothesis),
    experiment_goal: experimentGoal,
    domain: inferDomain(prePlans, hypothesis),
    experiment_type: inferExperimentType(prePlans, hypothesis),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    source_preplan_ids: unique(prePlans.map((plan) => plan.pre_plan_id)),
    source_document_ids: unique(prePlans.flatMap((plan) => plan.source_documents.map((doc) => doc.document_id))),
    source_lesson_ids: sourceLessonIds,
    source_previous_experiment_ids: sourcePreviousExperimentIds,
    plan_type: "calendar",
    plan_start_date: scheduled.calendarLayout.plan_start_date ?? scheduled.calendarLayout.timeline_start_date,
    plan_end_date: scheduled.calendarLayout.plan_end_date ?? scheduled.calendarLayout.timeline_end_date,
    tasks: tasksFromPlanNodes(scheduled.nodes),
    nodes: scheduled.nodes,
    edges: [],
    calendar_layout: scheduled.calendarLayout,
    stats_report: statsReport,
    confidence: prePlans.length > 0 ? "medium" : "low",
    open_questions: openQuestions,
    agent_notes: [
      "Pipeline: intake normalization -> relevance scoring -> task merge -> resource grounding -> learning adjustment -> calendar scheduling -> stats report.",
      prePlans.length > 0
        ? `Synthesized from ${prePlans.length} reusable pre-plan procedure template${prePlans.length === 1 ? "" : "s"}.`
        : "No pre-plan procedure schedules supplied; used a low-confidence fallback experiment structure.",
      input.labInventory
        ? "Lab inventory supplied; available and missing resources were marked at node level."
        : "No lab inventory supplied; resource availability is marked unknown.",
    ],
    creator_explanation:
      `The Creator Agent selected relevant source-procedure steps, merged equivalent preparation/execution/analysis tasks, grounded resources against lab inventory, and scheduled the resulting calendar plan across ${scheduled.calendarLayout.total_weeks} week${scheduled.calendarLayout.total_weeks === 1 ? "" : "s"}. ` +
      (sourceLessonIds.length > 0
        ? `Lesson cards influenced these nodes: ${sourceLessonIds.join(", ")}.`
        : "No lesson cards were supplied, so inferred timing and cost remain low-confidence where sources were incomplete."),
  };

  const validation = validateFinalExperimentPlan(plan);
  if (!validation.ok) {
    throw new Error(`Creator Agent produced invalid plan: ${validation.errors.join("; ")}`);
  }

  return plan;
}

function priceLabel(price: FinalPlanPrice): string {
  if (price.value === null) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency,
    maximumFractionDigits: 0,
  }).format(price.value);
}

function iconForNode(node: FinalPlanNode): string {
  const text = `${node.step_name} ${node.step_purpose}`.toLowerCase();
  if (/literature|source|paper|review/.test(text)) return "book";
  if (/order|buy|reagent|material|purchase/.test(text)) return "package";
  if (/control|approval|validate|quality|risk/.test(text)) return "shield";
  if (/analy|sequence|data|statistic|result/.test(text)) return "flask";
  if (/protocol|design|select|prepare/.test(text)) return "clipboard";
  if (/image|measure|microscope|assay|experiment/.test(text)) return "microscope";
  return "beaker";
}

export function finalPlanToWorkflow(plan: FinalExperimentPlan): Workflow {
  return {
    nodes: plan.nodes.map((node) => ({
      id: node.node_id,
      position: {
        x: node.calendar_position.x,
        y: node.calendar_position.y,
      },
      data: {
        id: node.node_id,
        stepName: node.step_name,
        people: node.people_required.roles,
        equipment: node.equipment_required.map((item) => item.name),
        materials: node.materials_required.map((item) => item.name),
        timeEstimate:
          node.estimated_duration.value === null
            ? `Unknown ${node.estimated_duration.unit}`
            : `${node.estimated_duration.value} ${node.estimated_duration.unit}`,
        price: priceLabel(node.estimated_price),
        experts: node.domain_experts.map((expert) =>
          expert.affiliation && expert.affiliation !== "unknown"
            ? `${expert.name}, ${expert.affiliation}`
            : expert.name,
        ),
        citationsToPaper: node.source_citations.map((citation) =>
          `${citation.document_id}: ${citation.quote_or_evidence}`,
        ),
        procedure:
          `${node.detailed_procedure}\n\nWhy included: ${node.source_preplan_node_ids.length > 0 ? `adapted from ${node.source_preplan_node_ids.join(", ")}` : "Creator Agent fallback structure"}.` +
          (node.risks.length > 0
            ? `\n\nRisks: ${node.risks.map((risk) => `${risk.description} Mitigation: ${risk.mitigation}`).join(" ")}`
            : ""),
        validationCriteria: node.validation_criteria,
        startDate: node.start.date ?? `Day ${node.start.relative_day}`,
        parentIds: node.parent_ids,
        childrenIds: node.child_ids,
        status: node.status,
        icon: iconForNode(node),
      },
    })),
    edges: plan.edges.map((edge) => ({
      id: edge.edge_id,
      source: edge.from_node_id,
      target: edge.to_node_id,
    })),
  };
}
