import type { Paper, Workflow, WorkflowNode } from "./projectTypes.js";

const DAY_WIDTH = 36;
const TRACK_Y = {
  framing: 0,
  planning: 160,
  prep: 320,
  execution: 480,
  analysis: 640,
} as const;

type Track = keyof typeof TRACK_Y;

type WorkflowNodeData = WorkflowNode["data"];
type WorkflowNodeDraft = Omit<WorkflowNode, "data"> & {
  data: Omit<WorkflowNodeData, "childrenIds">;
};

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function citationLabels(papers: Paper[]): string[] {
  return papers.slice(0, 4).map((paper) =>
    paper.url ? `${paper.title} (${paper.url})` : paper.title,
  );
}

function expertLabels(papers: Paper[]): string[] {
  const names = papers.flatMap((paper) => paper.authors).slice(0, 6);
  return names.length > 0
    ? Array.from(new Set(names))
    : ["Principal investigator", "Senior bench scientist"];
}

function makeNode(input: {
  id: string;
  stepName: string;
  offsetDays: number;
  track: Track;
  people: string[];
  equipment: string[];
  materials: string[];
  timeEstimate: string;
  price: string;
  experts: string[];
  citationsToPaper: string[];
  procedure: string;
  validationCriteria: string[];
  startDate: string;
  parentIds?: string[];
  status?: WorkflowNodeData["status"];
  icon?: string;
}): WorkflowNodeDraft {
  return {
    id: input.id,
    position: {
      x: input.offsetDays * DAY_WIDTH,
      y: TRACK_Y[input.track],
    },
    data: {
      id: input.id,
      stepName: input.stepName,
      people: input.people,
      equipment: input.equipment,
      materials: input.materials,
      timeEstimate: input.timeEstimate,
      price: input.price,
      experts: input.experts,
      citationsToPaper: input.citationsToPaper,
      procedure: input.procedure,
      validationCriteria: input.validationCriteria,
      startDate: input.startDate,
      parentIds: input.parentIds ?? [],
      status: input.status,
      icon: input.icon,
    },
  };
}

function finishWorkflow(nodes: WorkflowNodeDraft[]): Workflow {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    for (const parentId of node.data.parentIds) {
      const children = childrenByParent.get(parentId) ?? [];
      children.push(node.id);
      childrenByParent.set(parentId, children);
    }
  }

  const finishedNodes: WorkflowNode[] = nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      childrenIds: childrenByParent.get(node.id) ?? [],
    },
  }));

  return {
    nodes: finishedNodes,
    edges: finishedNodes.flatMap((node) =>
      node.data.childrenIds.map((childId) => ({
        id: `e:${node.id}-${childId}`,
        source: node.id,
        target: childId,
      })),
    ),
  };
}

/**
 * Returns the seed workflow attached by the generation endpoint.
 *
 * The generator still uses deterministic seed steps, but the node payload now
 * matches the MVP workflow model: resources, cost, experts, citations,
 * procedure, validation, dates, and graph relationship IDs.
 */
export function generateWorkflow(
  _prompt: string,
  papers: Paper[] = [],
  startDate = new Date(),
): Workflow {
  const base = new Date(Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  ));
  const citations = citationLabels(papers);
  const experts = expertLabels(papers);
  const d = (offsetDays: number) => formatIsoDate(addDays(base, offsetDays));

  return finishWorkflow([
    makeNode({
      id: "hypothesis",
      stepName: "Frame the hypothesis",
      offsetDays: 0,
      track: "framing",
      people: ["Principal investigator"],
      equipment: ["Project notebook"],
      materials: ["Original research question"],
      timeEstimate: "1 day",
      price: "$0",
      experts: experts.slice(0, 2),
      citationsToPaper: citations.slice(0, 2),
      procedure:
        "Write the factor, model system, expected outcome, and success metric in one falsifiable statement.",
      validationCriteria: [
        "Hypothesis identifies the independent variable",
        "Outcome and expected direction are explicit",
      ],
      startDate: d(0),
      status: "done",
      icon: "lightbulb",
    }),
    makeNode({
      id: "literature",
      stepName: "Literature review",
      offsetDays: 1,
      track: "planning",
      people: ["Graduate researcher", "Principal investigator"],
      equipment: ["Reference manager", "Paper database access"],
      materials: ["Search keywords", "Related work exports"],
      timeEstimate: "5 days",
      price: "$250",
      experts: experts.slice(0, 4),
      citationsToPaper: citations,
      procedure:
        "Screen related papers, extract protocols and limitations, and write a short gap analysis.",
      validationCriteria: [
        "At least 10 relevant papers reviewed",
        "Protocol constraints and unresolved gaps are summarized",
      ],
      startDate: d(1),
      parentIds: ["hypothesis"],
      status: "done",
      icon: "book",
    }),
    makeNode({
      id: "design",
      stepName: "Experimental design",
      offsetDays: 6,
      track: "planning",
      people: ["Principal investigator", "Postdoctoral fellow", "Statistician"],
      equipment: ["Power analysis worksheet"],
      materials: ["Assay options", "Control matrix"],
      timeEstimate: "5 days",
      price: "$600",
      experts: experts.slice(0, 3),
      citationsToPaper: citations.slice(0, 3),
      procedure:
        "Choose assays, controls, sample size, randomization, and the primary analysis plan.",
      validationCriteria: [
        "Primary readout and controls are documented",
        "Sample size rationale is recorded",
      ],
      startDate: d(6),
      parentIds: ["literature"],
      status: "active",
      icon: "clipboard",
    }),
    makeNode({
      id: "reagents",
      stepName: "Order reagents and consumables",
      offsetDays: 11,
      track: "prep",
      people: ["Lab manager", "Research assistant"],
      equipment: ["Procurement system", "Cold storage"],
      materials: ["Antibodies", "Primers", "Media", "Plasticware"],
      timeEstimate: "7 days",
      price: "$11,400",
      experts: ["Lab manager", ...experts.slice(0, 1)],
      citationsToPaper: citations.slice(0, 2),
      procedure:
        "Create an itemized order list, confirm catalog numbers, place orders, and track lead times.",
      validationCriteria: [
        "All critical reagents have vendor and lot information",
        "Expected arrival dates are recorded",
      ],
      startDate: d(11),
      parentIds: ["design"],
      status: "upcoming",
      icon: "package",
    }),
    makeNode({
      id: "protocol",
      stepName: "Draft the protocol",
      offsetDays: 11,
      track: "planning",
      people: ["Postdoctoral fellow", "Lead experimentalist"],
      equipment: ["SOP template", "Bench layout"],
      materials: ["Experimental design memo", "Safety requirements"],
      timeEstimate: "4 days",
      price: "$1,200",
      experts: experts.slice(0, 2),
      citationsToPaper: citations.slice(0, 3),
      procedure:
        "Translate the design into a step-by-step SOP with timings, volumes, safety notes, and review owners.",
      validationCriteria: [
        "Each procedure step has timing and acceptance notes",
        "PI or senior scientist review is complete",
      ],
      startDate: d(11),
      parentIds: ["design"],
      status: "upcoming",
      icon: "pencil",
    }),
    makeNode({
      id: "controls",
      stepName: "Plan controls and approvals",
      offsetDays: 11,
      track: "framing",
      people: ["Principal investigator", "Compliance reviewer"],
      equipment: ["Approval portal"],
      materials: ["Control samples", "Ethics forms"],
      timeEstimate: "5 days",
      price: "$980",
      experts: ["Compliance reviewer", ...experts.slice(0, 1)],
      citationsToPaper: citations.slice(0, 2),
      procedure:
        "Define positive, negative, and vehicle controls, then submit required IRB/IACUC or biosafety paperwork.",
      validationCriteria: [
        "Control matrix rules out major confounds",
        "Required approvals are submitted or confirmed unnecessary",
      ],
      startDate: d(11),
      parentIds: ["design"],
      status: "upcoming",
      icon: "shield",
    }),
    makeNode({
      id: "pilot",
      stepName: "Pilot run",
      offsetDays: 18,
      track: "execution",
      people: ["Lead experimentalist", "Research assistant"],
      equipment: ["Bench setup", "Plate reader or microscope"],
      materials: ["Pilot aliquots", "Prepared controls"],
      timeEstimate: "3 days",
      price: "$2,400",
      experts: experts.slice(0, 2),
      citationsToPaper: citations.slice(0, 2),
      procedure:
        "Run the SOP at reduced scale, time each step, capture failure modes, and confirm the readout is in range.",
      validationCriteria: [
        "Readout signal is measurable and within dynamic range",
        "Protocol issues are captured in an issue log",
      ],
      startDate: d(18),
      parentIds: ["reagents", "protocol", "controls"],
      status: "upcoming",
      icon: "beaker",
    }),
    makeNode({
      id: "refine",
      stepName: "Refine the protocol",
      offsetDays: 21,
      track: "planning",
      people: ["Postdoctoral fellow", "Lead experimentalist"],
      equipment: ["Versioned SOP"],
      materials: ["Pilot issue log", "Pilot data"],
      timeEstimate: "3 days",
      price: "$900",
      experts: experts.slice(0, 2),
      citationsToPaper: citations.slice(0, 2),
      procedure:
        "Resolve pilot issues, adjust timings or concentrations, and freeze the SOP version for the main run.",
      validationCriteria: [
        "Every pilot issue has a disposition",
        "Final SOP version is tagged and shared",
      ],
      startDate: d(21),
      parentIds: ["pilot"],
      status: "upcoming",
      icon: "clipboard-check",
    }),
    makeNode({
      id: "main",
      stepName: "Main experiment",
      offsetDays: 24,
      track: "execution",
      people: ["Lead experimentalist", "Research assistant"],
      equipment: ["Final assay setup", "Data capture workstation"],
      materials: ["Full reagent set", "Experimental samples", "Controls"],
      timeEstimate: "15 days",
      price: "$9,800",
      experts: experts.slice(0, 3),
      citationsToPaper: citations.slice(0, 3),
      procedure:
        "Execute the frozen SOP across planned replicates, log metadata, and back up raw data daily.",
      validationCriteria: [
        "Planned replicate count is complete",
        "Metadata and raw files pass daily completeness checks",
      ],
      startDate: d(24),
      parentIds: ["refine"],
      status: "upcoming",
      icon: "microscope",
    }),
    makeNode({
      id: "analysis",
      stepName: "Data analysis",
      offsetDays: 39,
      track: "analysis",
      people: ["Bioinformatician", "Statistician"],
      equipment: ["Analysis workstation", "Versioned notebook"],
      materials: ["Raw data", "Analysis plan"],
      timeEstimate: "5 days",
      price: "$3,200",
      experts: experts.slice(0, 3),
      citationsToPaper: citations.slice(0, 3),
      procedure:
        "Clean the data, run the pre-specified tests, estimate effect sizes, and generate figures reproducibly.",
      validationCriteria: [
        "Analysis follows the pre-specified plan",
        "Effect sizes and confidence intervals are reported",
      ],
      startDate: d(39),
      parentIds: ["main"],
      status: "upcoming",
      icon: "flask",
    }),
    makeNode({
      id: "manuscript",
      stepName: "Manuscript draft",
      offsetDays: 44,
      track: "analysis",
      people: ["Principal investigator", "First author"],
      equipment: ["Manuscript workspace", "Figure export pipeline"],
      materials: ["Final figures", "Methods SOP", "Analysis outputs"],
      timeEstimate: "7 days",
      price: "$1,500",
      experts: experts.slice(0, 4),
      citationsToPaper: citations,
      procedure:
        "Draft methods and results from the finalized SOP and figures, then circulate for internal review.",
      validationCriteria: [
        "Methods are reproducible from the SOP",
        "All claims cite supporting results or literature",
      ],
      startDate: d(44),
      parentIds: ["analysis"],
      status: "upcoming",
      icon: "filetext",
    }),
  ]);
}
