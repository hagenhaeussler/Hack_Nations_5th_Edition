import type {
  FinalExperimentPlan,
  FinalPlanCitation,
  FinalPlanConfidence,
  FinalPlanEdge,
  FinalPlanEstimate,
  FinalPlanNode,
  FinalPlanPrice,
  FinalPlanResource,
  LessonCard,
  Project,
  ProjectStatsReport,
  Workflow,
  WorkflowNode,
} from "./projectTypes.js";
import { buildCalendarLayout, tasksFromPlanNodes } from "./calendarLayout.js";

export type QAIntent =
  | "task_explanation"
  | "schedule_question"
  | "budget_question"
  | "equipment_question"
  | "materials_question"
  | "people_question"
  | "risk_question"
  | "validation_question"
  | "citation_question"
  | "learning_memory_question"
  | "feasibility_question"
  | "uncertainty_question"
  | "summary_question"
  | "comparison_question"
  | "impact_analysis_question"
  | "general_plan_question";

export interface QAChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface QARequest {
  question: string;
  selected_node_id?: string | null;
  selected_edge_id?: string | null;
  chat_history?: QAChatMessage[];
  options?: {
    include_sources?: boolean;
    include_suggested_actions?: boolean;
  };
}

export interface QAUsedContext {
  plan_id: string;
  task_ids: string[];
  node_ids: string[];
  edge_ids: string[];
  citation_ids: string[];
  lesson_ids: string[];
  source_types: string[];
}

export interface QASuggestedAction {
  type:
    | "open_node"
    | "highlight_node"
    | "highlight_edge"
    | "open_report_section"
    | "open_citation"
    | "suggest_plan_edit"
    | "open_purchase_list"
    | "open_risk_summary";
  target_id?: string;
  label: string;
}

export interface QAResponse {
  answer: string;
  used_context: QAUsedContext;
  suggested_actions: QASuggestedAction[];
  confidence: FinalPlanConfidence;
}

interface AnswerPlanQuestionInput extends QARequest {
  project: Project;
  lessons?: LessonCard[];
}

interface QAStatsSections {
  total_estimated_duration?: FinalPlanEstimate;
  total_estimated_budget?: FinalPlanPrice;
  people_summary?: string[];
  equipment_summary?: ProjectStatsReport["equipment_summary"];
  materials_summary?: ProjectStatsReport["materials_summary"];
  purchase_list?: FinalPlanResource[];
  task_summary?: ProjectStatsReport["task_summary"];
  validation_criteria_summary?: string[];
  milestone_summary?: ProjectStatsReport["milestone_summary"];
  risk_summary?: ProjectStatsReport["risk_summary"];
  citation_summary?: FinalPlanCitation[];
  learning_memory_summary?: string[];
  open_questions?: string[];
  confidence_summary?: string;
}

interface QAContextPackage {
  system_prompt: string;
  plan: Pick<
    FinalExperimentPlan,
    | "plan_id"
    | "hypothesis"
    | "experiment_title"
    | "experiment_goal"
    | "domain"
    | "experiment_type"
    | "confidence"
    | "open_questions"
    | "agent_notes"
    | "creator_explanation"
  >;
  intent: QAIntent;
  selected_node_id: string | null;
  selected_edge_id: string | null;
  relevant_nodes: FinalPlanNode[];
  relevant_edges: FinalPlanEdge[];
  stats_sections: QAStatsSections;
  citations: FinalPlanCitation[];
  lessons: LessonCard[];
  chat_history: QAChatMessage[];
}

const QA_SYSTEM_PROMPT =
  "You are the LabPilot Question-Answer Agent. You answer questions about a calendar-based experiment plan, including tasks, dates, weeks, resources, costs, risks, validation criteria, and citations. Do not refer to graph dependencies. Ground every answer in the provided calendar plan, task list, schedule, stats report, citations, lab context, and lesson cards. Do not invent facts or modify the plan directly.";

const STOP_WORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "before",
  "can",
  "do",
  "does",
  "for",
  "from",
  "happen",
  "how",
  "i",
  "in",
  "is",
  "it",
  "need",
  "of",
  "on",
  "or",
  "plan",
  "step",
  "task",
  "that",
  "the",
  "this",
  "to",
  "we",
  "what",
  "which",
  "why",
  "will",
  "with",
]);

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function cleanQuestion(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 2000);
}

function tokenize(value: string): string[] {
  return unique(
    value
      .toLowerCase()
      .replace(/[^a-z0-9_\-\s]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

function includesAny(text: string, terms: string[]): boolean {
  const haystack = text.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function estimateLabel(estimate: FinalPlanEstimate): string {
  if (estimate.value === null) return `unknown ${estimate.unit}`;
  return `${estimate.value} ${estimate.unit}`;
}

function priceLabel(price: FinalPlanPrice): string {
  if (price.value === null) return "unknown cost";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency,
    maximumFractionDigits: 0,
  }).format(price.value);
}

function dayLabel(node: FinalPlanNode): string {
  const date = node.start.date ? ` (${node.start.date})` : "";
  return `day ${node.start.relative_day}${date}`;
}

function resourceFromName(
  name: string,
  previous: FinalPlanResource[],
): FinalPlanResource {
  return (
    previous.find((item) => item.name.toLowerCase() === name.toLowerCase()) ?? {
      name,
      availability: "unknown",
      reason: "Resource came from the current editable workflow.",
    }
  );
}

function parseDurationLabel(
  value: string | undefined,
  fallback: FinalPlanEstimate,
): FinalPlanEstimate {
  if (!value) return fallback;
  const match = value.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/);
  if (!match?.[1]) {
    return {
      ...fallback,
      basis: `Current workflow label: ${value}`,
    };
  }
  const rawUnit = match[2]?.toLowerCase() ?? fallback.unit;
  const unit = rawUnit.startsWith("week")
    ? "weeks"
    : rawUnit.startsWith("hour")
      ? "hours"
      : rawUnit.startsWith("month")
        ? "months"
        : "days";
  return {
    value: Number(match[1]),
    unit,
    confidence: fallback.confidence,
    basis: `Current workflow label: ${value}`,
  };
}

function parsePriceLabel(
  value: string | undefined,
  fallback: FinalPlanPrice,
): FinalPlanPrice {
  if (!value) return fallback;
  const amount = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ...fallback,
      basis: `Current workflow label: ${value}`,
    };
  }
  return {
    value: amount,
    currency: fallback.currency,
    confidence: fallback.confidence,
    basis: `Current workflow label: ${value}`,
  };
}

function parseStartDate(
  value: string | undefined,
  fallback: FinalPlanNode["start"],
): FinalPlanNode["start"] {
  if (!value) return fallback;
  const dayMatch = value.match(/day\s*(\d+)/i);
  if (dayMatch?.[1]) {
    return {
      type: "relative",
      relative_day: Number(dayMatch[1]),
      date: fallback.date,
    };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return {
      type: "absolute",
      relative_day: fallback.relative_day,
      date: value,
    };
  }
  return fallback;
}

function workflowNodeToFinalNode(
  node: FinalPlanNode,
  workflowNode: WorkflowNode | undefined,
): FinalPlanNode {
  if (!workflowNode) return node;
  const data = workflowNode.data;
  const equipmentNames = data.equipment ?? [];
  const materialNames = data.materials ?? [];
  const start = parseStartDate(data.startDate, node.start);

  return {
    ...node,
    step_name: data.stepName ?? node.step_name,
    detailed_procedure: data.procedure ?? node.detailed_procedure,
    people_required: {
      ...node.people_required,
      roles: data.people ?? node.people_required.roles,
    },
    equipment_required: equipmentNames.map((name) =>
      resourceFromName(name, node.equipment_required),
    ),
    equipment_available: equipmentNames.filter((name) =>
      node.equipment_available.some(
        (available) => available.toLowerCase() === name.toLowerCase(),
      ),
    ),
    equipment_missing: equipmentNames.filter((name) =>
      node.equipment_missing.some(
        (missing) => missing.toLowerCase() === name.toLowerCase(),
      ),
    ),
    materials_required: materialNames.map((name) =>
      resourceFromName(name, node.materials_required),
    ),
    materials_available: materialNames.filter((name) =>
      node.materials_available.some(
        (available) => available.toLowerCase() === name.toLowerCase(),
      ),
    ),
    materials_to_buy: materialNames
      .map((name) => resourceFromName(name, node.materials_to_buy))
      .filter((item) => item.availability === "missing"),
    estimated_duration: parseDurationLabel(data.timeEstimate, node.estimated_duration),
    estimated_price: parsePriceLabel(data.price, node.estimated_price),
    validation_criteria: data.validationCriteria ?? node.validation_criteria,
    start,
    calendar_position: {
      ...node.calendar_position,
      x: workflowNode.position.x,
      y: workflowNode.position.y,
    },
    parent_ids: data.parentIds ?? node.parent_ids,
    child_ids: data.childrenIds ?? node.child_ids,
    status: data.status ?? node.status,
  };
}

function workflowEdgesToFinalEdges(
  planEdges: FinalPlanEdge[],
  workflow: Workflow | undefined,
): FinalPlanEdge[] {
  if (!workflow) return planEdges;
  return workflow.edges.map((edge) => {
    const existing = planEdges.find(
      (item) =>
        item.edge_id === edge.id ||
        (item.from_node_id === edge.source && item.to_node_id === edge.target),
    );
    return (
      existing ?? {
        edge_id: edge.id,
        from_node_id: edge.source,
        to_node_id: edge.target,
        dependency_type: "must_finish_before_start",
        reason: "Current workflow dependency from the edited graph.",
        is_critical_path_dependency: false,
        confidence: "medium",
      }
    );
  });
}

export function getCurrentPlan(project: Project): FinalExperimentPlan | null {
  if (!project.finalPlan) return null;
  const workflowNodes = new Map(
    (project.workflow?.nodes ?? []).map((node) => [node.id, node]),
  );
  const nodes = project.finalPlan.nodes.map((node) =>
    workflowNodeToFinalNode(node, workflowNodes.get(node.node_id)),
  );
  const edges = workflowEdgesToFinalEdges(project.finalPlan.edges, project.workflow);
  return {
    ...project.finalPlan,
    nodes,
    edges,
    tasks: tasksFromPlanNodes(nodes),
    calendar_layout: buildCalendarLayout(nodes, project.finalPlan.plan_start_date ?? project.finalPlan.calendar_layout.plan_start_date ?? project.finalPlan.calendar_layout.timeline_start_date ?? undefined),
    stats_report: deriveStatsReport(project.finalPlan.stats_report, nodes),
  };
}

export function deriveStatsReport(
  report: ProjectStatsReport,
  nodes: FinalPlanNode[],
): ProjectStatsReport {
  const totalBudget = nodes
    .map((node) => node.estimated_price.value)
    .filter((value): value is number => value !== null)
    .reduce((sum, value) => sum + value, 0);
  const endDay = Math.max(1, ...nodes.map((node) => node.end.relative_day));
  const equipmentRequired = unique(
    nodes.flatMap((node) => node.equipment_required.map((item) => item.name)),
  );
  const materialsRequired = unique(
    nodes.flatMap((node) => node.materials_required.map((item) => item.name)),
  );

  return {
    ...report,
    total_estimated_duration: {
      ...report.total_estimated_duration,
      value: endDay,
      basis: "computed from the current calendar task schedule",
    },
    total_estimated_budget: {
      ...report.total_estimated_budget,
      value: totalBudget > 0 ? totalBudget : null,
      basis: totalBudget > 0 ? "sum of current task cost estimates" : report.total_estimated_budget.basis,
    },
    people_summary: unique(nodes.flatMap((node) => node.people_required.roles)),
    equipment_summary: {
      required: equipmentRequired,
      available: unique(nodes.flatMap((node) => node.equipment_available)),
      missing: unique(nodes.flatMap((node) => node.equipment_missing)),
      unknown: equipmentRequired.filter(
        (item) =>
          !nodes.some((node) => node.equipment_available.includes(item)) &&
          !nodes.some((node) => node.equipment_missing.includes(item)),
      ),
    },
    materials_summary: {
      required: materialsRequired,
      available: unique(nodes.flatMap((node) => node.materials_available)),
      missing: unique(
        nodes.flatMap((node) => node.materials_to_buy.map((item) => item.name)),
      ),
      unknown: report.materials_summary.unknown,
    },
    purchase_list: nodes.flatMap((node) => node.materials_to_buy),
    task_summary: nodes.map((node) => ({
      node_id: node.node_id,
      step_name: node.step_name,
      start_day: node.start.relative_day,
      end_day: node.end.relative_day,
      status: node.status,
    })),
    validation_criteria_summary: unique(
      nodes.flatMap((node) => node.validation_criteria),
    ),
    risk_summary: nodes.flatMap((node) => node.risks),
    citation_summary: nodes.flatMap((node) => node.source_citations).slice(0, 12),
  };
}

export function classifyQuestionIntent(question: string): QAIntent {
  const q = question.toLowerCase();
  if (includesAny(q, ["task", "step", "explain", "procedure"])) {
    return "task_explanation";
  }
  if (includesAny(q, ["delay", "impact", "critical path", "critical"])) {
    return "impact_analysis_question";
  }
  if (includesAny(q, ["schedule", "scheduled", "day", "date", "duration", "take", "time", "timeline"])) {
    return "schedule_question";
  }
  if (includesAny(q, ["budget", "cost", "price", "expensive", "estimate come from"])) {
    return "budget_question";
  }
  if (includesAny(q, ["equipment", "instrument", "microscope", "machine"])) {
    return "equipment_question";
  }
  if (includesAny(q, ["material", "reagent", "buy", "purchase", "inventory", "stock"])) {
    return "materials_question";
  }
  if (includesAny(q, ["who", "people", "person", "role", "assigned", "lab member"])) {
    return "people_question";
  }
  if (includesAny(q, ["risk", "risky", "failure", "mitigation"])) {
    return "risk_question";
  }
  if (includesAny(q, ["validation", "criteria", "worked", "success", "decide"])) {
    return "validation_question";
  }
  if (includesAny(q, ["paper", "citation", "source", "support", "reference"])) {
    return "citation_question";
  }
  if (includesAny(q, ["lesson", "learning", "previous", "memory", "influenced"])) {
    return "learning_memory_question";
  }
  if (includesAny(q, ["feasible", "current inventory", "can we do", "available"])) {
    return "feasibility_question";
  }
  if (includesAny(q, ["uncertain", "unknown", "missing", "not known", "open question"])) {
    return "uncertainty_question";
  }
  if (includesAny(q, ["compare", "versus", "vs", "most", "least"])) {
    return "comparison_question";
  }
  if (includesAny(q, ["summarize", "summary", "overview", "check before starting"])) {
    return "summary_question";
  }
  if (includesAny(q, ["why", "explain", "what does", "what is this", "why is this here"])) {
    return "task_explanation";
  }
  return "general_plan_question";
}

function nodeSearchText(node: FinalPlanNode): string {
  return [
    node.node_id,
    node.step_name,
    node.step_purpose,
    node.detailed_procedure,
    ...node.people_required.roles,
    ...node.assigned_people_if_known,
    ...node.equipment_required.map((item) => item.name),
    ...node.materials_required.map((item) => item.name),
    ...node.validation_criteria,
    ...node.risks.map((risk) => risk.description),
    ...node.uncertainty_notes,
  ].join(" ");
}

function matchingNodes(plan: FinalExperimentPlan, question: string): FinalPlanNode[] {
  const terms = tokenize(question);
  if (terms.length === 0) return [];
  return plan.nodes.filter((node) => {
    const haystack = nodeSearchText(node).toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });
}

export function selectRelevantNodes(
  plan: FinalExperimentPlan,
  question: string,
  selectedNodeId: string | null,
  intent: QAIntent,
): FinalPlanNode[] {
  const selected = selectedNodeId
    ? plan.nodes.find((node) => node.node_id === selectedNodeId)
    : undefined;
  const nodes = new Map<string, FinalPlanNode>();
  if (selected) nodes.set(selected.node_id, selected);

  for (const node of matchingNodes(plan, question)) nodes.set(node.node_id, node);

  if (intent === "budget_question" || intent === "comparison_question") {
    [...plan.nodes]
      .sort((a, b) => (b.estimated_price.value ?? -1) - (a.estimated_price.value ?? -1))
      .slice(0, 5)
      .forEach((node) => nodes.set(node.node_id, node));
  }

  if (intent === "equipment_question" || intent === "feasibility_question") {
    plan.nodes
      .filter((node) => node.equipment_required.length > 0 || node.equipment_missing.length > 0)
      .slice(0, 8)
      .forEach((node) => nodes.set(node.node_id, node));
  }

  if (intent === "materials_question" || intent === "feasibility_question") {
    plan.nodes
      .filter((node) => node.materials_required.length > 0 || node.materials_to_buy.length > 0)
      .slice(0, 8)
      .forEach((node) => nodes.set(node.node_id, node));
  }

  if (intent === "risk_question") {
    plan.nodes
      .filter((node) => node.risks.length > 0)
      .slice(0, 8)
      .forEach((node) => nodes.set(node.node_id, node));
  }

  if (intent === "validation_question") {
    plan.nodes
      .filter((node) => node.validation_criteria.length > 0)
      .slice(0, 8)
      .forEach((node) => nodes.set(node.node_id, node));
  }

  if (!selected && intent === "citation_question") {
    plan.nodes
      .filter((node) => node.source_citations.length > 0)
      .slice(0, 8)
      .forEach((node) => nodes.set(node.node_id, node));
  }

  if (intent === "learning_memory_question") {
    plan.nodes
      .filter((node) => node.related_lesson_ids.length > 0)
      .slice(0, 8)
      .forEach((node) => nodes.set(node.node_id, node));
  }

  if (intent === "uncertainty_question") {
    plan.nodes
      .filter((node) => node.uncertainty_notes.length > 0)
      .slice(0, 8)
      .forEach((node) => nodes.set(node.node_id, node));
  }

  if (nodes.size === 0 && intent !== "general_plan_question") {
    plan.nodes.slice(0, 6).forEach((node) => nodes.set(node.node_id, node));
  }

  return [...nodes.values()].slice(0, 10);
}

export function selectRelevantEdges(
  plan: FinalExperimentPlan,
  selectedEdgeId: string | null,
  relevantNodeIds: string[],
  intent: QAIntent,
): FinalPlanEdge[] {
  const edges = new Map<string, FinalPlanEdge>();
  if (selectedEdgeId) {
    const selected = plan.edges.find((edge) => edge.edge_id === selectedEdgeId);
    if (selected) edges.set(selected.edge_id, selected);
  }
  const nodeIdSet = new Set(relevantNodeIds);
  void nodeIdSet;
  if (intent === "schedule_question") {
    plan.edges
      .filter((edge) => edge.is_critical_path_dependency)
      .slice(0, 8)
      .forEach((edge) => edges.set(edge.edge_id, edge));
  }
  return [...edges.values()].slice(0, 12);
}

export function selectRelevantStatsSections(
  report: ProjectStatsReport,
  intent: QAIntent,
): QAStatsSections {
  const base: QAStatsSections = {
    confidence_summary: report.confidence_summary,
    open_questions: report.open_questions,
  };
  if (intent === "schedule_question" || intent === "summary_question") {
    base.total_estimated_duration = report.total_estimated_duration;
    base.task_summary = report.task_summary;
    base.milestone_summary = report.milestone_summary;
  }
  if (intent === "budget_question" || intent === "comparison_question") {
    base.total_estimated_budget = report.total_estimated_budget;
    base.purchase_list = report.purchase_list;
  }
  if (intent === "equipment_question" || intent === "feasibility_question") {
    base.equipment_summary = report.equipment_summary;
  }
  if (intent === "materials_question" || intent === "feasibility_question") {
    base.materials_summary = report.materials_summary;
    base.purchase_list = report.purchase_list;
  }
  if (intent === "people_question") base.people_summary = report.people_summary;
  if (intent === "risk_question") base.risk_summary = report.risk_summary;
  if (intent === "validation_question") {
    base.validation_criteria_summary = report.validation_criteria_summary;
  }
  if (intent === "citation_question") base.citation_summary = report.citation_summary;
  if (intent === "learning_memory_question") {
    base.learning_memory_summary = report.learning_memory_summary;
  }
  return base;
}

export function selectRelevantLessons(
  question: string,
  nodeIds: string[],
  lessonIds: string[],
  lessons: LessonCard[],
): LessonCard[] {
  const terms = tokenize(question);
  const nodeSet = new Set(nodeIds);
  const lessonSet = new Set(lessonIds);
  return lessons
    .filter(
      (lesson) =>
        lessonSet.has(lesson.lesson_id) ||
        lesson.source_node_ids.some((id) => nodeSet.has(id)) ||
        terms.some((term) => lesson.embedding_text.toLowerCase().includes(term)),
    )
    .slice(0, 6);
}

export function selectRelevantCitations(
  question: string,
  nodeIds: string[],
  citationIds: string[],
  plan: FinalExperimentPlan,
): FinalPlanCitation[] {
  const terms = tokenize(question);
  const nodeSet = new Set(nodeIds);
  const citationSet = new Set(citationIds);
  const scopedCitations = plan.nodes
    .filter((node) => nodeSet.has(node.node_id))
    .flatMap((node) => node.source_citations);
  const candidateCitations =
    citationSet.size > 0 || nodeIds.length > 0
      ? scopedCitations
      : plan.stats_report.citation_summary;
  return candidateCitations
    .filter(
      (citation) =>
        citationSet.has(citation.document_id) ||
        terms.some((term) =>
          `${citation.document_id} ${citation.location} ${citation.quote_or_evidence}`
            .toLowerCase()
            .includes(term),
        ),
    )
    .filter(
      (citation, index, all) =>
        all.findIndex(
          (item) =>
            item.document_id === citation.document_id &&
            item.location === citation.location,
        ) === index,
    )
    .slice(0, 8);
}

export function buildQAContextPackage(
  plan: FinalExperimentPlan,
  intent: QAIntent,
  question: string,
  selectedNodeId: string | null,
  selectedEdgeId: string | null,
  lessons: LessonCard[],
  chatHistory: QAChatMessage[],
): QAContextPackage {
  const relevantNodes = selectRelevantNodes(plan, question, selectedNodeId, intent);
  const nodeIds = relevantNodes.map((node) => node.node_id);
  const relevantEdges = selectRelevantEdges(plan, selectedEdgeId, nodeIds, intent);
  const lessonIds = unique(relevantNodes.flatMap((node) => node.related_lesson_ids));
  const citationIds = unique(
    relevantNodes.flatMap((node) =>
      node.source_citations.map((citation) => citation.document_id),
    ),
  );

  return {
    system_prompt: QA_SYSTEM_PROMPT,
    plan: {
      plan_id: plan.plan_id,
      hypothesis: plan.hypothesis,
      experiment_title: plan.experiment_title,
      experiment_goal: plan.experiment_goal,
      domain: plan.domain,
      experiment_type: plan.experiment_type,
      confidence: plan.confidence,
      open_questions: plan.open_questions,
      agent_notes: plan.agent_notes,
      creator_explanation: plan.creator_explanation,
    },
    intent,
    selected_node_id: selectedNodeId,
    selected_edge_id: selectedEdgeId,
    relevant_nodes: relevantNodes,
    relevant_edges: relevantEdges,
    stats_sections: selectRelevantStatsSections(plan.stats_report, intent),
    citations: selectRelevantCitations(question, nodeIds, citationIds, plan),
    lessons: selectRelevantLessons(question, nodeIds, lessonIds, lessons),
    chat_history: chatHistory.slice(-8),
  };
}

function nodeName(planNodes: FinalPlanNode[], nodeId: string): string {
  return planNodes.find((node) => node.node_id === nodeId)?.step_name ?? nodeId;
}

function explainNode(node: FinalPlanNode, edges: FinalPlanEdge[], allNodes: FinalPlanNode[]): string {
  const parents = edges
    .filter((edge) => edge.to_node_id === node.node_id)
    .map((edge) => `${nodeName(allNodes, edge.from_node_id)} (${edge.reason})`);
  const children = edges
    .filter((edge) => edge.from_node_id === node.node_id)
    .map((edge) => `${nodeName(allNodes, edge.to_node_id)} (${edge.reason})`);
  const lines = [
    `${node.step_name} is included to ${node.step_purpose.toLowerCase()}. It is scheduled for ${dayLabel(node)} and is estimated to take ${estimateLabel(node.estimated_duration)}.`,
    `The duration basis is: ${node.estimated_duration.basis}.`,
  ];
  if (parents.length > 0) lines.push(`It waits on ${parents.join("; ")}.`);
  if (children.length > 0) lines.push(`Downstream steps include ${children.join("; ")}.`);
  if (node.related_lesson_ids.length > 0) {
    lines.push(`Learning-memory links on this node: ${node.related_lesson_ids.join(", ")}.`);
  }
  if (node.source_citations.length > 0) {
    lines.push(`Citation support includes ${node.source_citations.map((citation) => citation.document_id).join(", ")}.`);
  }
  if (node.uncertainty_notes.length > 0) {
    lines.push(`Uncertainty noted by the plan: ${node.uncertainty_notes.join(" ")}`);
  }
  return lines.join(" ");
}

function answerDependencies(context: QAContextPackage, plan: FinalExperimentPlan): string {
  if (context.relevant_edges.length === 0) {
    return "I do not see dependency edges in the selected context. The plan may still have steps, but this question needs graph edges or a specific node to answer precisely.";
  }
  const lines = context.relevant_edges.map((edge) => {
    const critical = edge.is_critical_path_dependency ? " Critical path dependency." : "";
    return `${nodeName(plan.nodes, edge.from_node_id)} -> ${nodeName(plan.nodes, edge.to_node_id)}: ${edge.reason}.${critical}`;
  });
  return `The calendar plan does not use dependency edges. Relevant tasks in this context are: ${lines.join(" ")}`;
}

function answerBudget(context: QAContextPackage): string {
  const nodesWithCosts = context.relevant_nodes
    .filter((node) => node.estimated_price.value !== null)
    .sort((a, b) => (b.estimated_price.value ?? 0) - (a.estimated_price.value ?? 0));
  const total = context.stats_sections.total_estimated_budget;
  if (!total && nodesWithCosts.length === 0) {
    return "The current plan does not contain enough cost information to answer that. Node prices and the stats report budget are missing or unknown.";
  }
  const parts: string[] = [];
  if (total) {
    parts.push(`The current estimated total budget is ${priceLabel(total)}; basis: ${total.basis}.`);
  }
  if (nodesWithCosts[0]) {
    parts.push(`The most expensive visible step is ${nodesWithCosts[0].step_name} at ${priceLabel(nodesWithCosts[0].estimated_price)}; basis: ${nodesWithCosts[0].estimated_price.basis}.`);
  }
  const purchases = context.stats_sections.purchase_list ?? [];
  if (purchases.length > 0) {
    parts.push(`The purchase list includes ${purchases.map((item) => item.name).join(", ")}.`);
  }
  return parts.join(" ");
}

function answerResources(
  context: QAContextPackage,
  kind: "equipment" | "materials",
): string {
  const summary =
    kind === "equipment"
      ? context.stats_sections.equipment_summary
      : context.stats_sections.materials_summary;
  if (!summary) {
    return `The current context does not include a ${kind} summary.`;
  }
  const missing = summary.missing.length > 0 ? summary.missing.join(", ") : "none listed";
  const unknown = summary.unknown.length > 0 ? summary.unknown.join(", ") : "none listed";
  const available = summary.available.length > 0 ? summary.available.join(", ") : "none listed";
  return `For ${kind}, the plan marks available items as ${available}. Missing items are ${missing}. Unknown availability is ${unknown}.`;
}

function answerRisks(context: QAContextPackage): string {
  const risks = context.relevant_nodes.flatMap((node) =>
    node.risks.map((risk) => ({ ...risk, nodeName: node.step_name })),
  );
  if (risks.length === 0) {
    return "I do not see risks attached to the selected context. If risks exist elsewhere in the plan, ask about the whole risk summary.";
  }
  const ordered = risks.sort((a, b) => {
    const weight = { high: 3, medium: 2, low: 1 };
    return weight[b.severity] - weight[a.severity];
  });
  return `The biggest risks in the current context are ${ordered
    .slice(0, 5)
    .map((risk) => `${risk.nodeName}: ${risk.description} (${risk.severity}; mitigation: ${risk.mitigation})`)
    .join("; ")}.`;
}

function answerValidation(context: QAContextPackage): string {
  const criteria = unique(
    context.relevant_nodes.flatMap((node) => node.validation_criteria),
  );
  if (criteria.length === 0) {
    return "The selected context does not include validation criteria, so I cannot say what decides success from the available plan data.";
  }
  return `The plan's validation criteria in this context are: ${criteria.join("; ")}.`;
}

function answerCitations(context: QAContextPackage): string {
  if (context.citations.length === 0) {
    return "I do not see source citations in the selected context. The plan may have inferred this from structure, lab memory, or low-confidence fallback logic rather than a cited paper.";
  }
  return `Citation support in this context comes from ${context.citations
    .map((citation) => `${citation.document_id} (${citation.location}: ${citation.quote_or_evidence})`)
    .join("; ")}.`;
}

function answerLessons(context: QAContextPackage): string {
  if (context.lessons.length > 0) {
    return `Relevant learning-memory records are ${context.lessons
      .map((lesson) => `${lesson.lesson_id}: ${lesson.lesson_summary}`)
      .join("; ")}.`;
  }
  const summary = context.stats_sections.learning_memory_summary ?? [];
  if (summary.length > 0) return summary.join(" ");
  return "I do not see lesson cards linked to the selected context. The current answer can only use the plan structure and source citations.";
}

function answerUncertainty(context: QAContextPackage, plan: FinalExperimentPlan): string {
  const notes = unique([
    ...context.relevant_nodes.flatMap((node) => node.uncertainty_notes),
    ...plan.open_questions,
    ...(context.stats_sections.open_questions ?? []),
  ]);
  if (notes.length === 0) {
    return "I do not see explicit uncertainty notes or open questions in the selected context.";
  }
  return `The plan flags these uncertainties or open questions: ${notes.slice(0, 8).join("; ")}.`;
}

function answerSchedule(context: QAContextPackage, _plan: FinalExperimentPlan): string {
  if (context.relevant_nodes.length === 0) {
    const duration = context.stats_sections.total_estimated_duration;
    if (!duration) return "I do not have enough schedule context to answer that.";
    return `The full plan is estimated at ${estimateLabel(duration)}; basis: ${duration.basis}.`;
  }
  return context.relevant_nodes
    .slice(0, 5)
    .map(
      (node) =>
        `${node.step_name} starts on ${dayLabel(node)} and runs until day ${node.end.relative_day}. Duration estimate: ${estimateLabel(node.estimated_duration)} (${node.estimated_duration.basis}).`,
    )
    .join(" ");
}

function answerPeople(context: QAContextPackage): string {
  const people = unique(
    context.relevant_nodes.flatMap((node) => [
      ...node.people_required.roles,
      ...node.assigned_people_if_known,
    ]),
  );
  if (people.length === 0) {
    return "The selected context does not name required people or assigned lab members.";
  }
  return `The plan needs these people or roles in this context: ${people.join(", ")}.`;
}

function answerSummary(_context: QAContextPackage, plan: FinalExperimentPlan): string {
  const duration = plan.stats_report.total_estimated_duration;
  const budget = plan.stats_report.total_estimated_budget;
  return `${plan.experiment_title} tests: ${plan.experiment_goal}. The current calendar plan has ${plan.nodes.length} scheduled tasks across ${plan.calendar_layout.total_weeks} week${plan.calendar_layout.total_weeks === 1 ? "" : "s"}, with an estimated duration of ${estimateLabel(duration)} and budget of ${priceLabel(budget)}. Before starting, check overloaded days, missing resources, high-severity risks, validation criteria, and open questions.`;
}

export function generateQAAnswer(
  context: QAContextPackage,
  question: string,
  plan: FinalExperimentPlan,
): string {
  const selectedNode = context.selected_node_id
    ? context.relevant_nodes.find((node) => node.node_id === context.selected_node_id)
    : undefined;
  switch (context.intent) {
    case "task_explanation":
      return selectedNode
        ? explainNode(selectedNode, plan.edges, plan.nodes)
        : context.relevant_nodes[0]
          ? explainNode(context.relevant_nodes[0], plan.edges, plan.nodes)
          : "I need a selected node or a step name to explain that part of the plan.";
    case "impact_analysis_question":
      return answerDependencies(context, plan);
    case "schedule_question":
      return answerSchedule(context, plan);
    case "budget_question":
    case "comparison_question":
      return answerBudget(context);
    case "equipment_question":
      return answerResources(context, "equipment");
    case "materials_question":
    case "feasibility_question":
      return answerResources(context, "materials");
    case "people_question":
      return answerPeople(context);
    case "risk_question":
      return answerRisks(context);
    case "validation_question":
      return answerValidation(context);
    case "citation_question":
      return answerCitations(context);
    case "learning_memory_question":
      return answerLessons(context);
    case "uncertainty_question":
      return answerUncertainty(context, plan);
    case "summary_question":
      return answerSummary(context, plan);
    case "general_plan_question": {
      const firstRelevantNode = context.relevant_nodes[0];
      return firstRelevantNode
        ? explainNode(firstRelevantNode, plan.edges, plan.nodes)
        : answerSummary(context, plan);
    }
    default:
      return `I can answer from the current calendar plan, but I could not classify the question precisely: "${question}". Try asking about a week, date, task, resource, risk, validation criterion, citation, or budget.`;
  }
}

export function formatQASources(
  plan: FinalExperimentPlan,
  context: QAContextPackage,
): QAUsedContext {
  const sourceTypes = ["final_plan"];
  if (context.relevant_nodes.length > 0) sourceTypes.push("final_plan_node");
  if (context.relevant_edges.length > 0) sourceTypes.push("final_plan_edge");
  if (Object.keys(context.stats_sections).length > 0) sourceTypes.push("stats_report");
  if (context.citations.length > 0) sourceTypes.push("citation");
  if (context.lessons.length > 0) sourceTypes.push("lesson_card");
  return {
    plan_id: plan.plan_id,
    task_ids: context.relevant_nodes.map((node) => node.node_id),
    node_ids: context.relevant_nodes.map((node) => node.node_id),
    edge_ids: [],
    citation_ids: unique(context.citations.map((citation) => citation.document_id)),
    lesson_ids: context.lessons.map((lesson) => lesson.lesson_id),
    source_types: unique(sourceTypes),
  };
}

function suggestedActions(
  context: QAContextPackage,
  includeSuggestedActions: boolean,
): QASuggestedAction[] {
  if (!includeSuggestedActions) return [];
  const actions: QASuggestedAction[] = [];
  const firstNode = context.relevant_nodes[0];
  if (firstNode) {
    actions.push({
      type: context.selected_node_id ? "open_node" : "highlight_node",
      target_id: firstNode.node_id,
      label: context.selected_node_id ? "Open selected task" : `Highlight ${firstNode.step_name}`,
    });
  }
  const firstEdge = context.relevant_edges[0];
  void firstEdge;
  if (["budget_question", "risk_question", "validation_question"].includes(context.intent)) {
    actions.push({
      type: "open_report_section",
      target_id: context.intent.replace("_question", ""),
      label: "Open stats report",
    });
  }
  return actions.slice(0, 3);
}

function confidenceForContext(context: QAContextPackage): FinalPlanConfidence {
  if (context.relevant_nodes.some((node) => node.uncertainty_notes.length > 0)) {
    return "medium";
  }
  if (
    context.relevant_nodes.length === 0 &&
    context.relevant_edges.length === 0 &&
    context.citations.length === 0
  ) {
    return "low";
  }
  return context.plan.confidence;
}

export async function answerPlanQuestion({
  project,
  question,
  selected_node_id,
  selected_edge_id,
  chat_history,
  options,
  lessons = [],
}: AnswerPlanQuestionInput): Promise<QAResponse> {
  const cleanedQuestion = cleanQuestion(question);
  const plan = getCurrentPlan(project);
  if (!plan) {
    return {
      answer: "This project does not have a final experiment plan yet, so I cannot answer plan-specific questions.",
      used_context: {
        plan_id: project.id,
        task_ids: [],
        node_ids: [],
        edge_ids: [],
        citation_ids: [],
        lesson_ids: [],
        source_types: [],
      },
      suggested_actions: [],
      confidence: "low",
    };
  }

  const validNodeId = plan.nodes.some((node) => node.node_id === selected_node_id)
    ? selected_node_id ?? null
    : null;
  const validEdgeId = plan.edges.some((edge) => edge.edge_id === selected_edge_id)
    ? selected_edge_id ?? null
    : null;
  const intent = classifyQuestionIntent(cleanedQuestion);
  const context = buildQAContextPackage(
    plan,
    intent,
    cleanedQuestion,
    validNodeId,
    validEdgeId,
    lessons,
    chat_history ?? [],
  );

  return {
    answer: generateQAAnswer(context, cleanedQuestion, plan),
    used_context: formatQASources(plan, context),
    suggested_actions: suggestedActions(
      context,
      options?.include_suggested_actions ?? true,
    ),
    confidence: confidenceForContext(context),
  };
}
