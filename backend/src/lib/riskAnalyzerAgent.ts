import type {
  AnalyzedRisk,
  FinalExperimentPlan,
  FinalPlanConfidence,
  FinalPlanNode,
  LessonCard,
  RiskAnalysisResult,
  RiskCategory,
  RiskImpact,
  RiskProbability,
  RiskSeverity,
} from "./projectTypes.js";

export interface RiskAnalyzerOptions {
  include_lessons?: boolean;
  include_previous_experiments?: boolean;
  include_citations?: boolean;
}

export interface RiskAnalyzerContext {
  plan: FinalExperimentPlan;
  lessons: LessonCard[];
  options?: RiskAnalyzerOptions;
}

interface RiskDraft {
  title: string;
  category: RiskCategory;
  severity: RiskSeverity;
  probability: RiskProbability;
  impact: RiskImpact;
  affected_nodes: string[];
  affected_edges?: string[];
  affected_resources?: string[];
  explanation: string;
  evidence: string[];
  possible_consequences: string[];
  suggested_mitigation: string[];
  confidence: FinalPlanConfidence;
  report_sections: string[];
  score_factors?: {
    overloadedDay?: boolean;
    missingResource?: boolean;
    lessonWarning?: boolean;
    lowConfidence?: boolean;
    missingCitation?: boolean;
  };
}

const SEVERITY_BASE: Record<RiskSeverity, number> = {
  critical: 90,
  high: 75,
  medium: 50,
  low: 25,
};

const PROBABILITY_ADJUSTMENT: Record<RiskProbability, number> = {
  high: 8,
  medium: 4,
  low: -4,
  unknown: 2,
};

const IMPACT_ADJUSTMENT: Record<RiskImpact, number> = {
  high: 7,
  medium: 3,
  low: -2,
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function nodeName(plan: FinalExperimentPlan, nodeId: string): string {
  return plan.nodes.find((node) => node.node_id === nodeId)?.step_name ?? nodeId;
}

function nodeNames(plan: FinalExperimentPlan, nodeIds: string[]): string {
  return nodeIds.map((nodeId) => nodeName(plan, nodeId)).join(", ");
}

function isEarlyOrLongTask(plan: FinalExperimentPlan, nodeId: string): boolean {
  const node = plan.nodes.find((item) => item.node_id === nodeId);
  return Boolean(node && (node.start.relative_day <= 1 || (node.estimated_duration.value ?? 0) >= 4));
}

function scoreRisk(draft: RiskDraft): number {
  let score =
    SEVERITY_BASE[draft.severity] +
    PROBABILITY_ADJUSTMENT[draft.probability] +
    IMPACT_ADJUSTMENT[draft.impact];
  if (draft.score_factors?.overloadedDay) score += 8;
  if (draft.score_factors?.missingResource) score += 8;
  if (draft.score_factors?.lessonWarning) score += 10;
  if (draft.score_factors?.lowConfidence) score += 7;
  if (draft.score_factors?.missingCitation) score += 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function riskId(index: number, category: RiskCategory): string {
  return `risk_${String(index + 1).padStart(3, "0")}_${category}`;
}

function toAnalyzedRisk(
  draft: RiskDraft,
  plan: FinalExperimentPlan,
  index: number,
): AnalyzedRisk {
  return {
    risk_id: riskId(index, draft.category),
    title: draft.title,
    category: draft.category,
    severity: draft.severity,
    probability: draft.probability,
    impact: draft.impact,
    risk_score: scoreRisk(draft),
    affected_nodes: unique(draft.affected_nodes),
    affected_edges: [],
    affected_resources: unique(draft.affected_resources ?? []),
    explanation: draft.explanation,
    evidence: unique(draft.evidence),
    possible_consequences: unique(draft.possible_consequences),
    suggested_mitigation: unique(draft.suggested_mitigation),
    confidence: draft.confidence,
    source_context: {
      node_ids: unique(draft.affected_nodes),
      lesson_ids: unique(
        draft.affected_nodes.flatMap(
          (nodeId) =>
            plan.nodes.find((node) => node.node_id === nodeId)?.related_lesson_ids ?? [],
        ),
      ),
      citation_ids: unique(
        draft.affected_nodes.flatMap(
          (nodeId) =>
            plan.nodes
              .find((node) => node.node_id === nodeId)
              ?.source_citations.map((citation) => citation.document_id) ?? [],
        ),
      ),
      report_sections: unique(draft.report_sections),
    },
  };
}

function groupNodesByResource(
  nodes: FinalPlanNode[],
  resourceNames: (node: FinalPlanNode) => string[],
): Map<string, { displayName: string; nodeIds: string[] }> {
  const groups = new Map<string, { displayName: string; nodeIds: string[] }>();
  for (const node of nodes) {
    for (const resource of resourceNames(node)) {
      const key = normalize(resource);
      if (!key) continue;
      const group = groups.get(key) ?? { displayName: resource.trim(), nodeIds: [] };
      group.nodeIds = unique([...group.nodeIds, node.node_id]);
      groups.set(key, group);
    }
  }
  return groups;
}

function detectMissingEquipmentRisks(plan: FinalExperimentPlan): RiskDraft[] {
  const groups = groupNodesByResource(plan.nodes, (node) => {
    const missingOrUnknown = node.equipment_required
      .filter(
        (resource) =>
          resource.availability !== "available" ||
          node.equipment_missing.some((name) => normalize(name) === normalize(resource.name)),
      )
      .map((resource) => resource.name);
    return unique([...missingOrUnknown, ...node.equipment_missing]);
  });

  return [...groups.values()].map((group) => {
    const earlyOrLong = group.nodeIds.some((nodeId) => isEarlyOrLongTask(plan, nodeId));
    return {
      title: `Missing or unconfirmed ${group.displayName} may block ${group.nodeIds.length} task${group.nodeIds.length === 1 ? "" : "s"}`,
      category: "equipment_risk",
      severity: earlyOrLong ? "critical" : "high",
      probability: "medium",
      impact: "high",
      affected_nodes: group.nodeIds,
      affected_resources: [group.displayName],
      explanation: `${group.displayName} is required by ${nodeNames(plan, group.nodeIds)}, but the current plan does not confirm that this equipment is available.`,
      evidence: [
        `${group.displayName} appears in required or missing equipment`,
        earlyOrLong ? "At least one affected task is early or long-running" : "Affected scheduled tasks require this equipment before they can run",
      ],
      possible_consequences: [
        "The affected task may be delayed or skipped",
        "Later calendar work may need to move if this resource is unavailable",
        "The project may need external facility access or rental budget",
      ],
      suggested_mitigation: [
        "Confirm equipment availability before the experiment starts",
        "Reserve equipment time early",
        "Add an external facility or rental backup if availability is uncertain",
      ],
      confidence: "high",
      report_sections: ["equipment_summary", "critical_path"],
      score_factors: {
        missingResource: true,
      },
    } satisfies RiskDraft;
  });
}

function detectMissingMaterialRisks(plan: FinalExperimentPlan): RiskDraft[] {
  const groups = groupNodesByResource(plan.nodes, (node) => {
    const missingOrUnknown = node.materials_required
      .filter((resource) => resource.availability !== "available")
      .map((resource) => resource.name);
    return unique([
      ...missingOrUnknown,
      ...node.materials_to_buy.map((resource) => resource.name),
    ]);
  });

  return [...groups.values()].map((group) => {
    const earlyOrLong = group.nodeIds.some((nodeId) => isEarlyOrLongTask(plan, nodeId));
    return {
      title: `${group.displayName} procurement may delay the plan`,
      category: "material_risk",
      severity: earlyOrLong ? "high" : "medium",
      probability: "medium",
      impact: earlyOrLong ? "high" : "medium",
      affected_nodes: group.nodeIds,
      affected_resources: [group.displayName],
      explanation: `${group.displayName} is missing, unknown, or listed for purchase for ${nodeNames(plan, group.nodeIds)}.`,
      evidence: [
        `${group.displayName} appears in the materials-to-buy or missing materials list`,
        earlyOrLong ? "The material is needed by an early or long-running task" : "The material is needed by scheduled work",
      ],
      possible_consequences: [
        "Procurement lead time may push back later scheduled tasks",
        "Budget may increase if expedited ordering is needed",
      ],
      suggested_mitigation: [
        "Move procurement earlier in the schedule",
        "Confirm vendor lead time and unit cost",
        "Identify a backup material or supplier",
      ],
      confidence: "high",
      report_sections: ["materials_summary", "purchase_list"],
      score_factors: {
        missingResource: true,
      },
    } satisfies RiskDraft;
  });
}

function detectLowConfidenceEstimateRisks(plan: FinalExperimentPlan): RiskDraft[] {
  const drafts: RiskDraft[] = [];
  for (const node of plan.nodes) {
    const earlyOrLong = isEarlyOrLongTask(plan, node.node_id);
    if (node.estimated_duration.confidence === "low" || node.estimated_duration.value === null) {
      drafts.push({
        title: `Low-confidence duration for ${node.step_name}`,
        category: "timeline_risk",
        severity: earlyOrLong ? "high" : "medium",
        probability: node.estimated_duration.value === null ? "unknown" : "medium",
        impact: earlyOrLong ? "high" : "medium",
        affected_nodes: [node.node_id],
        explanation: `${node.step_name} has a ${node.estimated_duration.confidence}-confidence duration estimate, so schedule buffers may be too tight.`,
        evidence: [
          `Duration estimate: ${node.estimated_duration.value ?? "unknown"} ${node.estimated_duration.unit}`,
          `Basis: ${node.estimated_duration.basis}`,
        ],
        possible_consequences: [
          "The task may take longer than planned",
          "Later scheduled tasks may need to move",
          "The total project duration may increase",
        ],
        suggested_mitigation: [
          "Add buffer time before later tasks",
          "Ask a domain expert to review the estimate",
          "Split the task into smaller measurable subtasks",
        ],
        confidence: "medium",
        report_sections: ["task_summary", "confidence_summary"],
        score_factors: {
          lowConfidence: true,
        },
      });
    }

    if (node.estimated_price.confidence === "low" || node.estimated_price.value === null) {
      drafts.push({
        title: `Budget uncertainty for ${node.step_name}`,
        category: "budget_risk",
        severity: "medium",
        probability: node.estimated_price.value === null ? "unknown" : "medium",
        impact: "medium",
        affected_nodes: [node.node_id],
        explanation: `${node.step_name} has a ${node.estimated_price.confidence}-confidence cost estimate, which can hide cost overruns.`,
        evidence: [
          `Cost estimate: ${node.estimated_price.value === null ? "unknown" : `$${node.estimated_price.value}`}`,
          `Basis: ${node.estimated_price.basis}`,
        ],
        possible_consequences: [
          "The project budget may be underestimated",
          "Purchasing decisions may be delayed while costs are clarified",
        ],
        suggested_mitigation: [
          "Confirm supplier or core-facility pricing",
          "Add a budget contingency for this task",
        ],
        confidence: "medium",
        report_sections: ["total_estimated_budget", "confidence_summary"],
        score_factors: { lowConfidence: true },
      });
    }
  }
  return drafts;
}

function detectOverloadedDayRisks(plan: FinalExperimentPlan): RiskDraft[] {
  return plan.calendar_layout.day_groups
    .filter((day) => (day.task_ids ?? day.node_ids).length >= 3)
    .map((day) => {
      const affected = day.task_ids ?? day.node_ids;
      return {
        title: `${day.label ?? `Day ${day.day_index + 1}`} is overloaded`,
        category: "scheduling_risk",
        severity: affected.length >= 5 ? "high" : "medium",
        probability: "medium",
        impact: affected.length >= 5 ? "high" : "medium",
        affected_nodes: affected,
        explanation: `${day.date ?? "This day"} has ${affected.length} scheduled tasks, which may exceed realistic lab capacity.`,
        evidence: [`${affected.length} tasks scheduled in the same day bucket`],
        possible_consequences: [
          "People, equipment, or materials may not be available for all same-day work",
          "Tasks may slip into later calendar days without buffer",
        ],
        suggested_mitigation: [
          "Move lower-priority tasks to another day",
          "Confirm staffing and equipment reservations for the overloaded day",
          "Add a buffer day before milestone or validation work",
        ],
        confidence: "high",
        report_sections: ["task_summary", "calendar_layout"],
        score_factors: { overloadedDay: true },
      } satisfies RiskDraft;
    });
}

function detectValidationRisks(plan: FinalExperimentPlan): RiskDraft[] {
  const nodes = plan.nodes.filter((node) => node.validation_criteria.length === 0);
  if (nodes.length === 0 && plan.stats_report.validation_criteria_summary.length > 0) {
    return [];
  }
  const affected = nodes.length > 0 ? nodes.map((node) => node.node_id) : plan.nodes.map((node) => node.node_id);
  return [
    {
      title: "Validation criteria are missing or incomplete",
      category: "validation_risk",
      severity: "high",
      probability: "medium",
      impact: "high",
      affected_nodes: affected,
      explanation: "One or more tasks do not clearly define how success will be measured.",
      evidence: [
        nodes.length > 0
          ? `${nodes.length} task${nodes.length === 1 ? "" : "s"} have no validation criteria`
          : "The report validation summary is empty",
      ],
      possible_consequences: [
        "The experiment may be hard to interpret",
        "A failed or ambiguous result may not be caught until late in the project",
      ],
      suggested_mitigation: [
        "Add concrete validation criteria before running the experiment",
        "Define measurement thresholds and QC checks",
        "Ask a domain expert to review the success criteria",
      ],
      confidence: "high",
      report_sections: ["validation_criteria_summary"],
      score_factors: {
        overloadedDay: affected.length > 3,
      },
    },
  ];
}

function detectCitationSupportRisks(plan: FinalExperimentPlan): RiskDraft[] {
  return plan.nodes
    .filter((node) => node.source_citations.length === 0)
    .slice(0, 6)
    .map((node) => ({
      title: `Weak citation support for ${node.step_name}`,
      category: "citation_support_risk",
      severity: isEarlyOrLongTask(plan, node.node_id) ? "high" : "medium",
      probability: "unknown",
      impact: "medium",
      affected_nodes: [node.node_id],
      explanation: `${node.step_name} has no citation linked in the current plan, so the procedure or estimate may be inferred.`,
      evidence: ["No source citations are attached to this task"],
      possible_consequences: [
        "The procedure may not match the intended protocol",
        "Time, cost, or validation assumptions may be weakly grounded",
      ],
      suggested_mitigation: [
        "Attach a citation or protocol reference",
        "Ask a domain expert to verify the step",
      ],
      confidence: "medium",
      report_sections: ["citation_summary"],
      score_factors: {
        missingCitation: true,
      },
    }));
}

function detectUncertaintyRisks(plan: FinalExperimentPlan): RiskDraft[] {
  return plan.nodes
    .filter((node) => node.uncertainty_notes.length > 0)
    .slice(0, 6)
    .map((node) => ({
      title: `Unresolved uncertainty in ${node.step_name}`,
      category: "uncertainty_risk",
      severity: isEarlyOrLongTask(plan, node.node_id) ? "high" : "medium",
      probability: "unknown",
      impact: "medium",
      affected_nodes: [node.node_id],
      explanation: `${node.step_name} carries unresolved uncertainty: ${node.uncertainty_notes.join(" ")}`,
      evidence: node.uncertainty_notes,
      possible_consequences: [
        "The step may need redesign during execution",
        "Schedule or resource estimates may change after clarification",
      ],
      suggested_mitigation: [
        "Resolve the open question before starting this task",
        "Add a decision checkpoint and fallback protocol",
      ],
      confidence: "medium",
      report_sections: ["open_questions", "confidence_summary"],
      score_factors: {
        lowConfidence: true,
      },
    }));
}

function detectLessonCardRisks(plan: FinalExperimentPlan, lessons: LessonCard[]): RiskDraft[] {
  const activeLessons = lessons.filter((lesson) => lesson.status !== "rejected" && lesson.status !== "archived");
  return activeLessons
    .filter(
      (lesson) =>
        lesson.lesson_type.includes("adjustment") ||
        lesson.lesson_type.includes("requirement") ||
        lesson.lesson_type.includes("risk") ||
        lesson.lesson_type.includes("constraint"),
    )
    .slice(0, 8)
    .map((lesson) => {
      const nodeIds = unique(
        lesson.source_node_ids.filter((nodeId) =>
          plan.nodes.some((node) => node.node_id === nodeId),
        ),
      );
      const affected = nodeIds.length > 0 ? nodeIds : plan.nodes.slice(0, 3).map((node) => node.node_id);
      return {
        title: `Learning memory warns: ${lesson.lesson_title}`,
        category: "learning_memory_risk",
        severity: lesson.confidence >= 0.8 ? "high" : "medium",
        probability: "medium",
        impact: "medium",
        affected_nodes: affected,
        explanation: lesson.lesson_summary,
        evidence: [
          lesson.scientist_correction,
          lesson.recommended_future_adjustment,
        ],
        possible_consequences: [
          "The plan may repeat a previously corrected assumption",
          "Time, cost, equipment, or dependency requirements may be underestimated",
        ],
        suggested_mitigation: [
          lesson.recommended_future_adjustment,
          "Review the related step before execution",
        ],
        confidence: lesson.confidence >= 0.75 ? "high" : "medium",
        report_sections: ["learning_memory_summary"],
        score_factors: {
          overloadedDay: affected.length > 3,
          lessonWarning: true,
        },
      } satisfies RiskDraft;
    });
}

function detectRiskCandidates(context: RiskAnalyzerContext): RiskDraft[] {
  const drafts = [
    ...detectMissingEquipmentRisks(context.plan),
    ...detectMissingMaterialRisks(context.plan),
    ...detectLowConfidenceEstimateRisks(context.plan),
    ...detectOverloadedDayRisks(context.plan),
    ...detectValidationRisks(context.plan),
    ...detectCitationSupportRisks(context.plan),
    ...detectUncertaintyRisks(context.plan),
  ];
  if (context.options?.include_lessons !== false) {
    drafts.push(...detectLessonCardRisks(context.plan, context.lessons));
  }
  return drafts;
}

function mergeDuplicateRisks(drafts: RiskDraft[]): RiskDraft[] {
  const merged = new Map<string, RiskDraft>();
  for (const draft of drafts) {
    const resourceKey = (draft.affected_resources ?? []).map(normalize).join(",");
    const key = `${draft.category}:${resourceKey || draft.title}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, draft);
      continue;
    }
    merged.set(key, {
      ...existing,
      affected_nodes: unique([...existing.affected_nodes, ...draft.affected_nodes]),
      affected_edges: unique([...(existing.affected_edges ?? []), ...(draft.affected_edges ?? [])]),
      evidence: unique([...existing.evidence, ...draft.evidence]),
      possible_consequences: unique([
        ...existing.possible_consequences,
        ...draft.possible_consequences,
      ]),
      suggested_mitigation: unique([
        ...existing.suggested_mitigation,
        ...draft.suggested_mitigation,
      ]),
    });
  }
  return [...merged.values()];
}

function overallRiskLevel(risks: AnalyzedRisk[]): RiskSeverity {
  const top = risks[0]?.risk_score ?? 0;
  if (top >= 90) return "critical";
  if (top >= 75) return "high";
  if (top >= 50) return "medium";
  return "low";
}

function riskCounts(risks: AnalyzedRisk[]): Record<RiskSeverity, number> {
  return risks.reduce<Record<RiskSeverity, number>>(
    (counts, risk) => {
      counts[risk.severity] += 1;
      return counts;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );
}

function affectedNodesRanked(risks: AnalyzedRisk[]): RiskAnalysisResult["affected_nodes_ranked"] {
  const byNode = new Map<string, { node_id: string; risk_score: number; risk_count: number }>();
  for (const risk of risks) {
    for (const nodeId of risk.affected_nodes) {
      const existing = byNode.get(nodeId) ?? {
        node_id: nodeId,
        risk_score: 0,
        risk_count: 0,
      };
      existing.risk_score = Math.max(existing.risk_score, risk.risk_score);
      existing.risk_count += 1;
      byNode.set(nodeId, existing);
    }
  }
  return [...byNode.values()]
    .sort((a, b) => b.risk_score - a.risk_score || b.risk_count - a.risk_count)
    .slice(0, 10);
}

function nextActions(risks: AnalyzedRisk[]): string[] {
  const actions = risks.flatMap((risk) => risk.suggested_mitigation.slice(0, 1));
  return unique(actions).slice(0, 5);
}

function summaryFor(risks: AnalyzedRisk[], level: RiskSeverity): string {
  if (risks.length === 0) {
    return "No major risks were detected from the current plan context.";
  }
  const topCategories = unique(risks.slice(0, 3).map((risk) => risk.category.replace(/_/g, " ")));
  return `Overall project risk is ${level}. The top concerns are ${topCategories.join(", ")}.`;
}

export function analyzeProjectRisks(context: RiskAnalyzerContext): RiskAnalysisResult {
  const drafts = mergeDuplicateRisks(detectRiskCandidates(context));
  const risks = drafts
    .map((draft, index) => toAnalyzedRisk(draft, context.plan, index))
    .sort((left, right) => right.risk_score - left.risk_score)
    .map((risk, index) => ({ ...risk, risk_id: riskId(index, risk.category) }));
  const level = overallRiskLevel(risks);

  return {
    analysis_id: `risk_analysis_${Date.now()}`,
    plan_id: context.plan.plan_id,
    created_at: new Date().toISOString(),
    overall_risk_level: level,
    summary: summaryFor(risks, level),
    top_risks: risks,
    risk_counts: riskCounts(risks),
    affected_nodes_ranked: affectedNodesRanked(risks),
    recommended_next_actions: nextActions(risks),
  };
}
