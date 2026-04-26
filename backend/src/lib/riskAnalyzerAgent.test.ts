import assert from "node:assert/strict";
import test from "node:test";

import { createReportPdf } from "./reportPdf.js";
import { analyzeProjectRisks } from "./riskAnalyzerAgent.js";
import { getCurrentPlan } from "./qaAgent.js";
import type {
  FinalExperimentPlan,
  FinalPlanNode,
  LessonCard,
  Project,
  Workflow,
} from "./projectTypes.js";

function node(overrides: Partial<FinalPlanNode> = {}): FinalPlanNode {
  return {
    node_id: "node_001",
    step_name: "Prepare samples",
    step_purpose: "prepare samples",
    detailed_procedure: "Prepare samples according to the protocol.",
    people_required: { count: 1, roles: ["Research assistant"] },
    assigned_people_if_known: [],
    equipment_required: [
      { name: "centrifuge", availability: "available" },
      { name: "fluorescence microscope", availability: "missing" },
    ],
    equipment_available: ["centrifuge"],
    equipment_missing: ["fluorescence microscope"],
    materials_required: [{ name: "stain", availability: "missing" }],
    materials_available: [],
    materials_to_buy: [{ name: "stain", availability: "missing", estimated_price: 120 }],
    estimated_duration: {
      value: 1,
      unit: "days",
      confidence: "low",
      basis: "inferred from similar plans",
    },
    estimated_price: {
      value: 250,
      currency: "USD",
      confidence: "medium",
      basis: "rough vendor estimate",
    },
    domain_experts: [],
    source_citations: [],
    source_preplan_node_ids: [],
    related_lesson_ids: [],
    validation_criteria: ["Sample concentration passes QC"],
    milestone: "Samples ready",
    risks: [],
    uncertainty_notes: [],
    start: { type: "relative", relative_day: 1, date: null },
    end: { type: "relative", relative_day: 2, date: null },
    calendar_position: { week_index: 0, day_index: 1, x: 0, y: 0, width: 160, lane: 0 },
    parent_ids: [],
    child_ids: ["node_002"],
    status: "upcoming",
    ...overrides,
  };
}

function samplePlan(overrides: Partial<FinalExperimentPlan> = {}): FinalExperimentPlan {
  const first = node();
  const second = node({
    node_id: "node_002",
    step_name: "Analyze images",
    step_purpose: "analyze image data",
    equipment_required: [{ name: "workstation", availability: "available" }],
    equipment_available: ["workstation"],
    equipment_missing: [],
    materials_required: [],
    materials_to_buy: [],
    estimated_duration: {
      value: 2,
      unit: "days",
      confidence: "high",
      basis: "standard analysis time",
    },
    validation_criteria: ["Signal is above threshold"],
    parent_ids: ["node_001"],
    child_ids: [],
    source_citations: [
      {
        document_id: "paper_001",
        location: "Methods",
        quote_or_evidence: "Images were analyzed with thresholding.",
      },
    ],
  });

  return {
    plan_id: "plan_123",
    user_input_id: "project_123",
    hypothesis: "Fluorescence marks viable cells.",
    experiment_title: "Fluorescence viability assay",
    experiment_goal: "Measure viable cells with fluorescence imaging.",
    domain: "cell biology",
    experiment_type: "imaging",
    created_at: "2026-04-25T00:00:00.000Z",
    updated_at: "2026-04-25T00:00:00.000Z",
    source_preplan_ids: [],
    source_document_ids: ["paper_001"],
    source_lesson_ids: [],
    source_previous_experiment_ids: [],
    nodes: [first, second],
    edges: [
      {
        edge_id: "edge_001_002",
        from_node_id: "node_001",
        to_node_id: "node_002",
        dependency_type: "must_finish_before_start",
        reason: "Samples must be prepared before imaging analysis.",
        is_critical_path_dependency: true,
        confidence: "medium",
      },
    ],
    calendar_layout: {
      timeline_start_date: null,
      timeline_end_date: null,
      total_days: 3,
      total_weeks: 1,
      week_groups: [],
      day_groups: [],
      node_positions: {},
      critical_path_node_ids: ["node_001", "node_002"],
    },
    stats_report: {
      report_id: "report_123",
      plan_id: "plan_123",
      hypothesis: "Fluorescence marks viable cells.",
      experiment_goal: "Measure viable cells with fluorescence imaging.",
      summary: "Two-step viability assay.",
      total_estimated_duration: {
        value: 3,
        unit: "days",
        confidence: "medium",
        basis: "critical path",
      },
      total_estimated_budget: {
        value: 370,
        currency: "USD",
        confidence: "medium",
        basis: "sum of node costs",
      },
      people_summary: ["Research assistant"],
      equipment_summary: {
        required: ["centrifuge", "fluorescence microscope", "workstation"],
        available: ["centrifuge", "workstation"],
        missing: ["fluorescence microscope"],
        unknown: [],
      },
      materials_summary: {
        required: ["stain"],
        available: [],
        missing: ["stain"],
        unknown: [],
      },
      purchase_list: [{ name: "stain", availability: "missing", estimated_price: 120 }],
      task_summary: [
        { node_id: "node_001", step_name: "Prepare samples", start_day: 1, end_day: 2, status: "upcoming" },
        { node_id: "node_002", step_name: "Analyze images", start_day: 2, end_day: 3, status: "upcoming" },
      ],
      validation_criteria_summary: [
        "Sample concentration passes QC",
        "Signal is above threshold",
      ],
      milestone_summary: [{ node_id: "node_001", milestone: "Samples ready" }],
      risk_summary: [],
      domain_expert_summary: [],
      citation_summary: [
        {
          document_id: "paper_001",
          location: "Methods",
          quote_or_evidence: "Images were analyzed with thresholding.",
        },
      ],
      learning_memory_summary: [],
      open_questions: [],
      confidence_summary: "Some estimates are low confidence.",
    },
    confidence: "medium",
    open_questions: [],
    agent_notes: [],
    creator_explanation: "Deterministic test plan.",
    ...overrides,
  };
}

function lessonCard(): LessonCard {
  return {
    lesson_id: "lesson_001",
    source_change_event_ids: ["change_001"],
    source_plan_id: "plan_old",
    source_node_ids: ["node_001"],
    lesson_type: "risk_pattern",
    lesson_title: "Microscopy tasks often need extra buffer",
    lesson_summary: "Previous microscopy runs were delayed by shared equipment access.",
    domain: "cell biology",
    experiment_type: "imaging",
    step_type: "imaging",
    applicability_conditions: {},
    original_agent_assumption: "Microscope access is immediate.",
    scientist_correction: "Reserve the shared microscope ahead of time.",
    recommended_future_adjustment: "Add a schedule buffer and reserve microscope time.",
    affected_fields: ["estimated_duration", "equipment_required"],
    confidence: 0.9,
    scope: "lab_specific",
    status: "active",
    created_at: "2026-04-25T00:00:00.000Z",
    updated_at: "2026-04-25T00:00:00.000Z",
    created_by: "feedback_learning_service",
    related_citations: [],
    embedding_text: "microscopy shared equipment delay buffer",
  };
}

test("PDF utility returns a valid PDF download payload", () => {
  const pdf = createReportPdf(samplePlan(), "2026-04-25T12:00:00.000Z");
  assert.equal(pdf.subarray(0, 4).toString("latin1"), "%PDF");
  assert.ok(pdf.byteLength > 500);
});

test("Risk Analyzer returns risks sorted by descending score", () => {
  const analysis = analyzeProjectRisks({ plan: samplePlan(), lessons: [] });
  assert.ok(analysis.top_risks.length > 0);
  const scores = analysis.top_risks.map((risk) => risk.risk_score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

test("missing equipment creates an equipment risk", () => {
  const analysis = analyzeProjectRisks({ plan: samplePlan(), lessons: [] });
  assert.ok(
    analysis.top_risks.some(
      (risk) =>
        risk.category === "equipment_risk" &&
        risk.affected_resources.includes("fluorescence microscope"),
    ),
  );
});

test("missing material creates a material risk", () => {
  const analysis = analyzeProjectRisks({ plan: samplePlan(), lessons: [] });
  assert.ok(
    analysis.top_risks.some(
      (risk) => risk.category === "material_risk" && risk.affected_resources.includes("stain"),
    ),
  );
});

test("low-confidence duration creates a timeline risk", () => {
  const analysis = analyzeProjectRisks({ plan: samplePlan(), lessons: [] });
  assert.ok(
    analysis.top_risks.some(
      (risk) =>
        risk.category === "timeline_risk" &&
        risk.title.includes("Low-confidence duration"),
    ),
  );
});

test("missing validation criteria creates a validation risk", () => {
  const plan = samplePlan({
    nodes: [node({ validation_criteria: [] })],
    edges: [],
    calendar_layout: {
      ...samplePlan().calendar_layout,
      critical_path_node_ids: ["node_001"],
    },
    stats_report: {
      ...samplePlan().stats_report,
      validation_criteria_summary: [],
    },
  });
  const analysis = analyzeProjectRisks({ plan, lessons: [] });
  assert.ok(analysis.top_risks.some((risk) => risk.category === "validation_risk"));
});

test("critical path involvement increases risk score", () => {
  const criticalPlan = samplePlan();
  const nonCriticalPlan = samplePlan({
    calendar_layout: { ...samplePlan().calendar_layout, critical_path_node_ids: [] },
    edges: [{ ...samplePlan().edges[0]!, is_critical_path_dependency: false }],
  });
  const criticalScore = analyzeProjectRisks({ plan: criticalPlan, lessons: [] }).top_risks.find(
    (risk) => risk.category === "equipment_risk",
  )?.risk_score;
  const nonCriticalScore = analyzeProjectRisks({ plan: nonCriticalPlan, lessons: [] }).top_risks.find(
    (risk) => risk.category === "equipment_risk",
  )?.risk_score;
  assert.ok((criticalScore ?? 0) > (nonCriticalScore ?? 0));
});

test("lesson card warning increases risk score", () => {
  const withoutLesson = analyzeProjectRisks({ plan: samplePlan(), lessons: [] });
  const withLesson = analyzeProjectRisks({ plan: samplePlan(), lessons: [lessonCard()] });
  assert.ok(withLesson.top_risks[0]!.risk_score >= withoutLesson.top_risks[0]!.risk_score);
  assert.ok(withLesson.top_risks.some((risk) => risk.category === "learning_memory_risk"));
});

test("overall risk level is computed from top score", () => {
  const analysis = analyzeProjectRisks({ plan: samplePlan(), lessons: [] });
  assert.equal(analysis.overall_risk_level, "critical");
});

test("current edited workflow data is used instead of stale final plan data", () => {
  const stalePlan = samplePlan({
    nodes: [
      node({
        equipment_required: [{ name: "centrifuge", availability: "available" }],
        equipment_missing: [],
      }),
    ],
    edges: [],
  });
  const workflow: Workflow = {
    nodes: [
      {
        id: "node_001",
        position: { x: 0, y: 0 },
        data: {
          id: "node_001",
          stepName: "Prepare samples",
          people: ["Research assistant"],
          equipment: ["centrifuge", "new microscope"],
          materials: ["stain"],
          timeEstimate: "1 day",
          price: "$250",
          experts: [],
          citationsToPaper: [],
          procedure: "Prepare samples.",
          validationCriteria: ["Sample concentration passes QC"],
          startDate: "2026-04-25",
          parentIds: [],
          childrenIds: [],
          status: "upcoming",
        },
      },
    ],
    edges: [],
  };
  const project: Project = {
    id: "project_123",
    hypothesis: stalePlan.hypothesis,
    title: stalePlan.experiment_title,
    status: "ready",
    createdAt: stalePlan.created_at,
    updatedAt: stalePlan.updated_at,
    finalPlan: stalePlan,
    workflow,
  };
  const currentPlan = getCurrentPlan(project);
  assert.ok(currentPlan);
  const analysis = analyzeProjectRisks({ plan: currentPlan, lessons: [] });
  assert.ok(
    analysis.top_risks.some((risk) => risk.affected_resources.includes("new microscope")),
  );
});
