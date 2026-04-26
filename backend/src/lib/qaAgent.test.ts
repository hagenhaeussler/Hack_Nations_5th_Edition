import assert from "node:assert/strict";
import test from "node:test";

import { answerPlanQuestion } from "./qaAgent.js";
import type {
  FinalExperimentPlan,
  FinalPlanNode,
  FinalPlanResource,
  LessonCard,
  Project,
  Workflow,
} from "./projectTypes.js";

const resource = (
  name: string,
  availability: FinalPlanResource["availability"] = "available",
): FinalPlanResource => ({ name, availability });

function sampleNode(overrides: Partial<FinalPlanNode>): FinalPlanNode {
  const nodeId = overrides.node_id ?? "node";
  return {
    node_id: nodeId,
    step_name: "Untitled step",
    step_purpose: "complete the experiment",
    detailed_procedure: "Follow the lab protocol.",
    people_required: { count: 1, roles: ["Research associate"] },
    assigned_people_if_known: [],
    equipment_required: [],
    equipment_available: [],
    equipment_missing: [],
    materials_required: [],
    materials_available: [],
    materials_to_buy: [],
    estimated_duration: {
      value: 1,
      unit: "days",
      confidence: "medium",
      basis: "source protocol estimate",
    },
    estimated_price: {
      value: 100,
      currency: "USD",
      confidence: "medium",
      basis: "source protocol estimate",
    },
    domain_experts: [],
    source_citations: [],
    source_preplan_node_ids: [],
    related_lesson_ids: [],
    validation_criteria: ["Record usable output"],
    milestone: null,
    risks: [],
    uncertainty_notes: [],
    start: { type: "relative", relative_day: 1, date: null },
    end: { type: "relative", relative_day: 1, date: null },
    calendar_position: {
      week_index: 1,
      day_index: 1,
      x: 0,
      y: 0,
      width: 180,
      lane: 0,
    },
    parent_ids: [],
    child_ids: [],
    status: "upcoming",
    ...overrides,
  };
}

function samplePlan(): FinalExperimentPlan {
  const nodes: FinalPlanNode[] = [
    sampleNode({
      node_id: "prep",
      step_name: "Sample preparation",
      step_purpose: "prepare samples for imaging",
      equipment_required: [resource("shared incubator", "available")],
      equipment_available: ["shared incubator"],
      materials_required: [resource("sterile culture plates", "missing")],
      materials_to_buy: [resource("sterile culture plates", "missing")],
      estimated_duration: {
        value: 2,
        unit: "days",
        confidence: "medium",
        basis: "paper protocol estimate",
      },
      estimated_price: {
        value: 300,
        currency: "USD",
        confidence: "medium",
        basis: "sum of plates and reagents",
      },
      source_citations: [
        {
          document_id: "doc_prep",
          location: "Methods",
          quote_or_evidence: "Samples were prepared before imaging.",
        },
      ],
      related_lesson_ids: ["lesson_007"],
      validation_criteria: ["Cells remain viable after preparation"],
      child_ids: ["imaging"],
      end: { type: "relative", relative_day: 2, date: null },
    }),
    sampleNode({
      node_id: "imaging",
      step_name: "Image samples",
      step_purpose: "capture fluorescence images",
      equipment_required: [resource("fluorescence microscope", "missing")],
      equipment_missing: ["fluorescence microscope"],
      estimated_price: {
        value: 1200,
        currency: "USD",
        confidence: "medium",
        basis: "microscope access estimate",
      },
      source_citations: [
        {
          document_id: "doc_imaging",
          location: "Figure 2 protocol",
          quote_or_evidence: "Fluorescence imaging was used for readout.",
        },
      ],
      risks: [
        {
          risk_id: "risk_001",
          description: "Microscope access may be unavailable.",
          severity: "high",
          mitigation: "Reserve microscope time before starting.",
          source: "lab_inventory",
        },
      ],
      parent_ids: ["prep"],
      child_ids: ["analysis"],
      start: { type: "relative", relative_day: 3, date: null },
      end: { type: "relative", relative_day: 4, date: null },
    }),
    sampleNode({
      node_id: "analysis",
      step_name: "Analyze image data",
      step_purpose: "quantify image signal",
      source_citations: [],
      parent_ids: ["imaging"],
      start: { type: "relative", relative_day: 5, date: null },
      end: { type: "relative", relative_day: 5, date: null },
    }),
  ];

  return {
    plan_id: "plan_123",
    user_input_id: "project_123",
    hypothesis: "Test fluorescence response.",
    experiment_title: "Fluorescence response test",
    experiment_goal: "Measure whether treatment changes fluorescence.",
    domain: "cell biology",
    experiment_type: "imaging",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    source_preplan_ids: ["pre_001"],
    source_document_ids: ["doc_prep", "doc_imaging"],
    source_lesson_ids: ["lesson_007"],
    source_previous_experiment_ids: [],
    nodes,
    edges: [
      {
        edge_id: "e-prep-imaging",
        from_node_id: "prep",
        to_node_id: "imaging",
        dependency_type: "must_finish_before_start",
        reason: "Images require prepared samples.",
        is_critical_path_dependency: true,
        confidence: "high",
      },
      {
        edge_id: "e-imaging-analysis",
        from_node_id: "imaging",
        to_node_id: "analysis",
        dependency_type: "must_finish_before_start",
        reason: "Analysis requires image files.",
        is_critical_path_dependency: true,
        confidence: "high",
      },
    ],
    calendar_layout: {
      timeline_start_date: null,
      timeline_end_date: null,
      total_days: 5,
      total_weeks: 1,
      week_groups: [],
      day_groups: [],
      node_positions: {},
      critical_path_node_ids: ["prep", "imaging", "analysis"],
    },
    stats_report: {
      report_id: "report_123",
      plan_id: "plan_123",
      hypothesis: "Test fluorescence response.",
      experiment_goal: "Measure whether treatment changes fluorescence.",
      summary: "Three-step imaging plan.",
      total_estimated_duration: {
        value: 5,
        unit: "days",
        confidence: "medium",
        basis: "computed from DAG",
      },
      total_estimated_budget: {
        value: 1600,
        currency: "USD",
        confidence: "medium",
        basis: "sum of node estimates",
      },
      people_summary: ["Research associate"],
      equipment_summary: {
        required: ["shared incubator", "fluorescence microscope"],
        available: ["shared incubator"],
        missing: ["fluorescence microscope"],
        unknown: [],
      },
      materials_summary: {
        required: ["sterile culture plates"],
        available: [],
        missing: ["sterile culture plates"],
        unknown: [],
      },
      purchase_list: [resource("sterile culture plates", "missing")],
      task_summary: nodes.map((node) => ({
        node_id: node.node_id,
        step_name: node.step_name,
        start_day: node.start.relative_day,
        end_day: node.end.relative_day,
        status: node.status,
      })),
      validation_criteria_summary: ["Cells remain viable after preparation"],
      milestone_summary: [],
      risk_summary: nodes.flatMap((node) => node.risks),
      domain_expert_summary: [],
      citation_summary: nodes.flatMap((node) => node.source_citations),
      learning_memory_summary: ["Applied lesson cards: lesson_007."],
      open_questions: ["Confirm microscope booking."],
      confidence_summary: "Medium confidence with explicit resource gaps.",
    },
    confidence: "medium",
    open_questions: ["Confirm microscope booking."],
    agent_notes: ["Test plan."],
    creator_explanation: "Creator Agent assembled the DAG from cited steps.",
  };
}

function sampleWorkflow(): Workflow {
  return {
    nodes: samplePlan().nodes.map((node) => ({
      id: node.node_id,
      position: { x: node.calendar_position.x, y: node.calendar_position.y },
      data: {
        id: node.node_id,
        stepName: node.step_name,
        people: node.people_required.roles,
        equipment: node.equipment_required.map((item) => item.name),
        materials: node.materials_required.map((item) => item.name),
        timeEstimate:
          node.node_id === "prep" ? "5 days" : `${node.estimated_duration.value ?? 1} days`,
        price: `$${node.estimated_price.value ?? 0}`,
        experts: [],
        citationsToPaper: node.source_citations.map((citation) => citation.document_id),
        procedure: node.detailed_procedure,
        validationCriteria: node.validation_criteria,
        startDate: `Day ${node.start.relative_day}`,
        parentIds: node.parent_ids,
        childrenIds: node.child_ids,
        status: node.status,
      },
    })),
    edges: [
      { id: "e-prep-imaging", source: "prep", target: "imaging" },
      { id: "e-imaging-analysis", source: "imaging", target: "analysis" },
    ],
  };
}

function sampleProject(): Project {
  return {
    id: "project_123",
    hypothesis: "Test fluorescence response.",
    title: "Fluorescence response test",
    status: "ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    finalPlan: samplePlan(),
    workflow: sampleWorkflow(),
  };
}

const lesson: LessonCard = {
  lesson_id: "lesson_007",
  source_change_event_ids: ["change_001"],
  source_plan_id: "plan_123",
  source_node_ids: ["prep"],
  lesson_type: "timeline_adjustment",
  lesson_title: "Shared incubator extends sample prep",
  lesson_summary: "Sample preparation should use a 5-day estimate when incubator access is shared.",
  domain: "cell biology",
  experiment_type: "imaging",
  step_type: "sample preparation",
  applicability_conditions: {},
  original_agent_assumption: "Sample preparation takes 2 days.",
  scientist_correction: "Use 5 days because the incubator is shared.",
  recommended_future_adjustment: "Use 5 days for shared-incubator sample preparation.",
  affected_fields: ["estimated_duration"],
  confidence: 0.9,
  scope: "lab_specific",
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  created_by: "feedback_learning_service",
  related_citations: [],
  embedding_text: "sample preparation incubator shared 5 days timeline",
};

test("answers a selected node question using the current edited workflow", async () => {
  const response = await answerPlanQuestion({
    project: sampleProject(),
    question: "Why does this step take 5 days?",
    selected_node_id: "prep",
    lessons: [lesson],
  });

  assert.match(response.answer, /Sample preparation/);
  assert.match(response.answer, /5 days/);
  assert.deepEqual(response.used_context.node_ids.includes("prep"), true);
  assert.equal(response.suggested_actions[0]?.type, "open_node");
});

test("answers budget questions from current node costs and stats", async () => {
  const response = await answerPlanQuestion({
    project: sampleProject(),
    question: "What is the most expensive part of the experiment?",
  });

  assert.match(response.answer, /Image samples/);
  assert.match(response.answer, /\$1,200/);
  assert.deepEqual(response.used_context.source_types.includes("stats_report"), true);
});

test("answers dependency questions using DAG edges", async () => {
  const response = await answerPlanQuestion({
    project: sampleProject(),
    question: "Which steps depend on sample preparation?",
    selected_node_id: "prep",
  });

  assert.match(response.answer, /Image samples/);
  assert.deepEqual(response.used_context.edge_ids.includes("e-prep-imaging"), true);
});

test("answers equipment questions using missing resources", async () => {
  const response = await answerPlanQuestion({
    project: sampleProject(),
    question: "Which equipment do we still need?",
  });

  assert.match(response.answer, /fluorescence microscope/);
});

test("answers citation and learning-memory questions from linked sources", async () => {
  const citationResponse = await answerPlanQuestion({
    project: sampleProject(),
    question: "Which papers support imaging?",
    selected_node_id: "imaging",
  });
  const lessonResponse = await answerPlanQuestion({
    project: sampleProject(),
    question: "What previous lessons influenced this plan?",
    selected_node_id: "prep",
    lessons: [lesson],
  });

  assert.match(citationResponse.answer, /doc_imaging/);
  assert.match(lessonResponse.answer, /5-day estimate/);
  assert.deepEqual(lessonResponse.used_context.lesson_ids, ["lesson_007"]);
});

test("does not invent citation information when context is missing", async () => {
  const response = await answerPlanQuestion({
    project: sampleProject(),
    question: "Which papers support this procedure?",
    selected_node_id: "analysis",
  });

  assert.match(response.answer, /do not see source citations/i);
  assert.equal(response.confidence, "medium");
});
