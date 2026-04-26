import assert from "node:assert/strict";
import test from "node:test";

import { FeedbackLearningService } from "./feedbackLearningService.js";
import { createMemoryLearningRepo } from "./learningRepo.js";
import {
  applyEditorPatch,
  buildEditorPatch,
  classifyEditorIntent,
} from "./planEditorAgent.js";
import type { ProjectsRepo } from "./projectsRepo.js";
import type {
  FinalExperimentPlan,
  Paper,
  PrePlan,
  Project,
  ProjectStatus,
  Workflow,
} from "./projectTypes.js";

class TestProjectsRepo implements ProjectsRepo {
  constructor(private project: Project) {}

  async create(): Promise<Project> {
    return this.project;
  }

  async attachPapers(_id: string, papers: Paper[]): Promise<Project | null> {
    this.project = { ...this.project, papers };
    return this.project;
  }

  async attachResearchResults(
    _id: string,
    papers: Paper[],
    prePlan: PrePlan,
  ): Promise<Project | null> {
    this.project = { ...this.project, papers, prePlan };
    return this.project;
  }

  async attachFinalPlan(
    _id: string,
    finalPlan: FinalExperimentPlan,
    workflow: Workflow,
  ): Promise<Project | null> {
    this.project = { ...this.project, finalPlan, workflow };
    return this.project;
  }

  async attachWorkflow(_id: string, workflow: Workflow): Promise<Project | null> {
    this.project = { ...this.project, workflow };
    return this.project;
  }

  async setStatus(_id: string, status: ProjectStatus): Promise<Project | null> {
    this.project = { ...this.project, status };
    return this.project;
  }

  async get(id: string): Promise<Project | null> {
    return this.project.id === id ? this.project : null;
  }

  async getByPlanId(planId: string): Promise<Project | null> {
    return this.project.finalPlan?.plan_id === planId ? this.project : null;
  }

  async list(): Promise<Project[]> {
    return [this.project];
  }
}

function workflow(): Workflow {
  return {
    nodes: [
      {
        id: "staining",
        position: { x: 0, y: 0 },
        data: {
          id: "staining",
          stepName: "Staining",
          people: ["Research assistant"],
          equipment: ["incubator"],
          materials: ["stain"],
          timeEstimate: "2 days",
          price: "$100",
          experts: [],
          citationsToPaper: [],
          procedure: "Stain samples.",
          validationCriteria: [],
          startDate: "2026-04-25",
          parentIds: [],
          childrenIds: [],
          status: "active",
        },
      },
      {
        id: "imaging",
        position: { x: 72, y: 160 },
        data: {
          id: "imaging",
          stepName: "Imaging",
          people: ["Microscopy specialist"],
          equipment: ["plate reader"],
          materials: ["coverslips"],
          timeEstimate: "1 day",
          price: "$200",
          experts: [],
          citationsToPaper: [],
          procedure: "Image samples.",
          validationCriteria: ["Images pass QC"],
          startDate: "2026-04-27",
          parentIds: [],
          childrenIds: ["analysis"],
          status: "upcoming",
        },
      },
      {
        id: "analysis",
        position: { x: 108, y: 320 },
        data: {
          id: "analysis",
          stepName: "Analysis",
          people: ["Statistician"],
          equipment: ["workstation"],
          materials: ["image files"],
          timeEstimate: "2 days",
          price: "$300",
          experts: [],
          citationsToPaper: [],
          procedure: "Analyze images.",
          validationCriteria: [],
          startDate: "2026-04-28",
          parentIds: ["imaging"],
          childrenIds: [],
          status: "upcoming",
        },
      },
    ],
    edges: [{ id: "e:imaging-analysis", source: "imaging", target: "analysis" }],
  };
}

function project(): Project {
  return {
    id: "project_001",
    hypothesis: "Run an imaging experiment.",
    title: "Imaging experiment",
    status: "ready",
    createdAt: "2026-04-25T00:00:00.000Z",
    updatedAt: "2026-04-25T00:00:00.000Z",
    finalPlan: { plan_id: "plan_001" } as FinalExperimentPlan,
    workflow: workflow(),
  };
}

test("classifies question vs edit", () => {
  assert.equal(classifyEditorIntent("Why does imaging take 1 day?").intent_type, "question");
  assert.equal(classifyEditorIntent("Make this step take 5 days.").intent_type, "edit");
});

test("creates duration and equipment patches", () => {
  const duration = buildEditorPatch(project(), {
    plan_id: "plan_001",
    user_message: "Make this step take 5 days.",
    selected_node_id: "imaging",
  });
  const equipment = buildEditorPatch(project(), {
    plan_id: "plan_001",
    user_message: "Add fluorescence microscope to imaging equipment.",
  });

  assert.equal(duration.patch?.operations[0]?.operation_type, "update_duration");
  assert.equal(equipment.patch?.operations[0]?.operation_type, "add_equipment");
  assert.equal(equipment.validation?.is_valid, true);
});

test("creates and validates dependency patches", () => {
  const safe = buildEditorPatch(project(), {
    plan_id: "plan_001",
    user_message: "Staining needs to happen before imaging.",
  });
  const cycle = buildEditorPatch(project(), {
    plan_id: "plan_001",
    user_message: "Analysis needs to happen before imaging.",
  });

  assert.equal(safe.patch?.operations[0]?.operation_type, "add_edge");
  assert.equal(safe.validation?.is_valid, true);
  assert.equal(cycle.validation?.is_valid, false);
  assert.match(cycle.validation?.errors.join(" ") ?? "", /cycle/i);
});

test("rejects protected-data edits and broad schedule changes require confirmation", () => {
  const protectedRequest = buildEditorPatch(project(), {
    plan_id: "plan_001",
    user_message: "Update the lesson card database with this rule.",
  });
  const broad = buildEditorPatch(project(), {
    plan_id: "plan_001",
    user_message: "Push everything after imaging back by 3 days.",
  });

  assert.equal(protectedRequest.intent.intent_type, "ambiguous");
  assert.equal(broad.validation?.requires_confirmation, true);
  assert.equal(broad.validation?.estimated_blast_radius, "medium");
});

test("applies patches through feedback learning and creates audit events", async () => {
  const repo = new TestProjectsRepo(project());
  const service = new FeedbackLearningService(repo, createMemoryLearningRepo());
  const build = buildEditorPatch(project(), {
    plan_id: "plan_001",
    user_message: "Add fluorescence microscope to imaging equipment.",
  });

  assert.ok(build.patch);
  const result = await applyEditorPatch(project(), build.patch, service);

  assert.equal(result.response_type, "applied_patch");
  assert.equal(result.generated_change_events[0]?.change_type, "equipment_added");
  assert.equal(result.generated_lesson_cards[0]?.lesson_type, "equipment_requirement");
  assert.ok(
    result.updated_stats_report?.equipment_summary.required.includes(
      "fluorescence microscope",
    ),
  );
});
