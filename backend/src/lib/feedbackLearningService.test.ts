import assert from "node:assert/strict";
import test from "node:test";

import {
  FeedbackLearningError,
  FeedbackLearningService,
} from "./feedbackLearningService.js";
import { createMemoryLearningRepo } from "./learningRepo.js";
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
    this.project = { ...this.project, finalPlan, workflow, status: "ready" };
    return this.project;
  }

  async attachWorkflow(_id: string, workflow: Workflow): Promise<Project | null> {
    this.project = { ...this.project, workflow, status: "ready" };
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

function sampleWorkflow(): Workflow {
  return {
    nodes: [
      {
        id: "prep",
        position: { x: 0, y: 0 },
        data: {
          id: "prep",
          stepName: "Cell culture preparation",
          people: ["Research assistant"],
          equipment: ["incubator"],
          materials: ["media"],
          timeEstimate: "2 days",
          price: "$100",
          experts: [],
          citationsToPaper: ["paper_001"],
          procedure: "Prepare cells.",
          validationCriteria: ["Cells are viable"],
          startDate: "2026-04-25",
          parentIds: [],
          childrenIds: ["image"],
          status: "active",
        },
      },
      {
        id: "image",
        position: { x: 72, y: 160 },
        data: {
          id: "image",
          stepName: "Imaging",
          people: ["Microscopy specialist"],
          equipment: ["plate reader"],
          materials: ["stain"],
          timeEstimate: "1 day",
          price: "$200",
          experts: [],
          citationsToPaper: ["paper_002"],
          procedure: "Image cells.",
          validationCriteria: ["Images pass QC"],
          startDate: "2026-04-27",
          parentIds: ["prep"],
          childrenIds: [],
          status: "upcoming",
        },
      },
    ],
    edges: [{ id: "e:prep-image", source: "prep", target: "image" }],
  };
}

function sampleProject(): Project {
  return {
    id: "project_001",
    hypothesis: "Test fluorescence-based cell growth in culture.",
    title: "Cell growth assay",
    description: "Test fluorescence-based cell growth in culture.",
    status: "ready",
    createdAt: "2026-04-25T00:00:00.000Z",
    updatedAt: "2026-04-25T00:00:00.000Z",
    workflow: sampleWorkflow(),
  };
}

function serviceFixture(): {
  service: FeedbackLearningService;
  learningRepo: ReturnType<typeof createMemoryLearningRepo>;
} {
  const learningRepo = createMemoryLearningRepo();
  return {
    service: new FeedbackLearningService(
      new TestProjectsRepo(sampleProject()),
      learningRepo,
    ),
    learningRepo,
  };
}

test("creates a PlanChangeEvent and LessonCard from a duration edit", async () => {
  const { service } = serviceFixture();
  const result = await service.applyPlanEdit("project_001", {
    change_source: "frontend_graph_edit",
    target_type: "node",
    target_id: "prep",
    field_changed: "estimated_duration",
    new_value: { value: 5, unit: "days" },
    raw_user_comment: "The shared incubator creates delays.",
  });

  assert.equal(result.change_event.change_type, "duration_changed");
  assert.deepEqual(result.change_event.old_value, { value: 2, unit: "days" });
  assert.equal(result.generated_lesson_cards.length, 1);
  assert.equal(result.generated_lesson_cards[0]?.lesson_type, "timeline_adjustment");
  assert.equal(
    result.updated_plan.nodes.find((node) => node.id === "prep")?.data.timeEstimate,
    "5 days",
  );
  assert.equal(
    result.updated_plan.nodes.find((node) => node.id === "image")?.data.startDate,
    "2026-04-30",
  );
});

test("creates an equipment lesson and recalculates stats", async () => {
  const { service } = serviceFixture();
  const result = await service.applyPlanEdit("project_001", {
    change_source: "frontend_graph_edit",
    target_type: "node",
    target_id: "image",
    field_changed: "equipment_required",
    new_value: ["plate reader", "fluorescence microscope"],
    raw_user_comment: "Fluorescence readout requires microscopy.",
  });

  assert.equal(result.change_event.change_type, "equipment_added");
  assert.equal(result.generated_lesson_cards[0]?.lesson_type, "equipment_requirement");
  assert.ok(
    result.updated_stats_report.equipment_summary.required.includes(
      "fluorescence microscope",
    ),
  );
});

test("logs dependency edits as immutable PlanChangeEvents", async () => {
  const { service, learningRepo } = serviceFixture();
  const result = await service.applyPlanEdit("project_001", {
    change_source: "frontend_graph_edit",
    target_type: "edge",
    target_id: "e:prep-image",
    field_changed: "dependency",
    change_type: "dependency_removed",
    new_value: { source: "prep", target: "image" },
  });

  assert.equal(result.change_event.change_type, "dependency_removed");
  assert.equal(result.updated_plan.edges.length, 0);
  await assert.rejects(
    () => learningRepo.appendPlanChangeEvent(result.change_event),
    /already exists/,
  );
});

test("rejects dependency edits that create cycles", async () => {
  const { service } = serviceFixture();
  await assert.rejects(
    () =>
      service.applyPlanEdit("project_001", {
        change_source: "frontend_graph_edit",
        target_type: "edge",
        target_id: "e:image-prep",
        field_changed: "dependency",
        change_type: "dependency_added",
        new_value: { source: "image", target: "prep" },
      }),
    (err) =>
      err instanceof FeedbackLearningError &&
      /cycle/i.test(err.message),
  );
});

test("preserves the original creator-generated plan version", async () => {
  const { service } = serviceFixture();
  await service.applyPlanEdit("project_001", {
    change_source: "frontend_graph_edit",
    target_type: "node",
    target_id: "prep",
    field_changed: "estimated_duration",
    new_value: { value: 5, unit: "days" },
  });

  const versions = await service.listPlanVersions("project_001");
  assert.equal(versions.length, 2);
  assert.equal(versions[0]?.version_type, "creator_generated");
  const original = versions[0]?.graph_snapshot as Workflow | undefined;
  assert.equal(
    original?.nodes.find((node) => node.id === "prep")?.data.timeEstimate,
    "2 days",
  );
});

test("retrieves relevant lessons for a future Creator Agent run", async () => {
  const { service } = serviceFixture();
  await service.applyPlanEdit("project_001", {
    change_source: "frontend_graph_edit",
    target_type: "node",
    target_id: "prep",
    field_changed: "estimated_duration",
    new_value: { value: 5, unit: "days" },
    raw_user_comment: "The shared incubator creates delays.",
  });

  const lessons = await service.getRelevantLessons({
    hypothesis: "Plan a cell culture assay with a shared incubator.",
  });
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0]?.lesson_type, "timeline_adjustment");
});
