import type { Workflow } from "./projectTypes.js";

/**
 * Mock workflow returned by the generation endpoint.
 *
 * This is the same DAG the frontend used to ship as `EXAMPLE_NODES` /
 * `EXAMPLE_EDGES`. Living on the backend now means the project page reads
 * its workflow from the persisted record instead of always rendering the
 * built-in example. When the real generator lands, replace this with the
 * model output — the wire shape (`Workflow`) is intentionally narrow.
 */
const COL = {
  hypothesis: 0,
  literature: 280,
  design: 560,
  prep: 840,
  pilot: 1120,
  refine: 1400,
  main: 1680,
  analysis: 1960,
  manuscript: 2240,
} as const;

const ROW = { top: -150, middle: 0, bottom: 150 } as const;

const TEMPLATE: Workflow = {
  nodes: [
    {
      id: "hypothesis",
      position: { x: COL.hypothesis, y: ROW.middle },
      data: {
        title: "Frame the hypothesis",
        schedule: "Day 0",
        detail:
          "State the question, the model system, and the predicted effect.",
        status: "done",
        icon: "lightbulb",
        effort: "Half a day",
        description:
          "Crisp hypotheses make every later step easier. State the factor, the outcome, the model system, and the direction you expect — then sanity-check it against existing intuition before committing time and reagents.",
        deliverables: [
          "Hypothesis statement (one sentence)",
          "Predicted direction & effect size",
        ],
        checklist: [
          "Identify the factor and the outcome",
          "Specify the model system",
          "State the predicted direction explicitly",
          "Flag any ethical considerations early",
        ],
      },
    },
    {
      id: "literature",
      position: { x: COL.literature, y: ROW.middle },
      data: {
        title: "Literature review",
        schedule: "Week 1",
        detail: "Survey related work and identify the gap your study fills.",
        status: "done",
        icon: "book",
        effort: "3–5 days",
        description:
          "Build a concise picture of what has been tried, what worked, and what is still open. Use the gap you identify here as the framing for your introduction later.",
        deliverables: [
          "Annotated bibliography (15–30 papers)",
          "One-paragraph gap analysis",
        ],
        checklist: [
          "Run keyword + author searches",
          "Skim 30+ abstracts; deep-read the top 10",
          "Extract methods, results, and limitations",
          "Note what is still unanswered",
        ],
      },
    },
    {
      id: "design",
      position: { x: COL.design, y: ROW.middle },
      data: {
        title: "Experimental design",
        schedule: "Week 2",
        detail: "Pick assays, sample size, controls, and the readout.",
        status: "active",
        icon: "clipboard",
        effort: "1 week",
        description:
          "Translate the hypothesis into a falsifiable design. Decide what you will measure, how many replicates you need to detect the effect, and which controls rule out the obvious confounds.",
        deliverables: [
          "Study design memo",
          "Sample-size justification",
          "Pre-registration draft",
        ],
        checklist: [
          "Choose assays and primary readout",
          "Power-analysis to set n",
          "Specify positive / negative / vehicle controls",
          "Decide blinding and randomisation",
          "Pre-specify analysis plan",
        ],
      },
    },
    {
      id: "reagents",
      position: { x: COL.prep, y: ROW.top },
      data: {
        title: "Order reagents & consumables",
        schedule: "Week 2–3",
        detail:
          "Antibodies, primers, media, plasticware. Confirm lead times.",
        status: "upcoming",
        icon: "package",
        effort: "2–10 day lead times",
        description:
          "Get orders in early — biological reagents often have multi-week lead times and can become the critical path if left until the last minute.",
        deliverables: [
          "Itemised order list with vendors and catalog numbers",
          "Lead-time tracker",
        ],
        checklist: [
          "List every antibody, primer, plasmid, media component",
          "Confirm catalog numbers + lot consistency",
          "Place orders + record PO numbers",
          "Schedule a check-in for arrivals & QC",
        ],
      },
    },
    {
      id: "protocol",
      position: { x: COL.prep, y: ROW.middle },
      data: {
        title: "Draft the protocol",
        schedule: "Week 2–3",
        detail: "Write step-by-step SOP; circulate for lab review.",
        status: "upcoming",
        icon: "pencil",
        effort: "3–4 days drafting",
        description:
          "A precise SOP makes the experiment reproducible and turns silent assumptions into explicit choices. Circulate it for review before anyone touches a pipette.",
        deliverables: [
          "Step-by-step SOP (versioned)",
          "Equipment + bench layout",
        ],
        checklist: [
          "Write each step with timings + volumes",
          "Add safety notes + waste handling",
          "Circulate to PI + senior bench scientist",
          "Iterate on review feedback",
        ],
      },
    },
    {
      id: "controls",
      position: { x: COL.prep, y: ROW.bottom },
      data: {
        title: "Plan controls & approvals",
        schedule: "Week 2–3",
        detail: "Positive / negative controls, IRB / IACUC if required.",
        status: "upcoming",
        icon: "shield",
        effort: "1 day planning + approval lead time",
        description:
          "Controls are what turn an observation into evidence. Approval applications can take weeks — submit as soon as the design is firm.",
        deliverables: [
          "Control matrix",
          "IRB / IACUC approval letter (if applicable)",
        ],
        checklist: [
          "Plan positive controls (known effect)",
          "Plan negative / vehicle controls",
          "Identify potential confounds and how each is ruled out",
          "Submit IRB / IACUC paperwork if applicable",
        ],
      },
    },
    {
      id: "pilot",
      position: { x: COL.pilot, y: ROW.middle },
      data: {
        title: "Pilot run",
        schedule: "Week 4",
        detail: "Small-scale dry run to surface protocol issues.",
        status: "upcoming",
        icon: "beaker",
        effort: "2–3 days",
        description:
          "Run the protocol end-to-end at a fraction of the planned scale. The goal is not to test the hypothesis — it is to test the protocol.",
        deliverables: ["Pilot data (1–2 replicates)", "Issue log"],
        checklist: [
          "Execute SOP at small scale",
          "Time each step in practice",
          "Verify the readout is in-range",
          "Capture every issue you hit",
        ],
      },
    },
    {
      id: "refine",
      position: { x: COL.refine, y: ROW.middle },
      data: {
        title: "Refine the protocol",
        schedule: "Week 5",
        detail: "Adjust timings, concentrations, and handling steps.",
        status: "upcoming",
        icon: "clipboard-check",
        effort: "2–3 days",
        description:
          "Address the issues surfaced by the pilot. Lock the SOP version you will use for the main run and resist the urge to keep tweaking after that point.",
        deliverables: ["v2 SOP (frozen)", "Revised timing chart"],
        checklist: [
          "Address each issue from the pilot log",
          "Adjust concentrations / incubation times",
          "Re-circulate for a quick second review",
          "Tag the SOP version",
        ],
      },
    },
    {
      id: "main",
      position: { x: COL.main, y: ROW.middle },
      data: {
        title: "Main experiment",
        schedule: "Week 6–8",
        detail: "Run replicates with the finalised protocol.",
        status: "upcoming",
        icon: "microscope",
        effort: "3 weeks",
        description:
          "Execute the full design with the frozen SOP. Stay strict on conditions and metadata logging — this is the data your conclusions rest on.",
        deliverables: ["Raw data files", "Lab notebook entries"],
        checklist: [
          "Run the planned replicates",
          "Log conditions, timestamps, operator",
          "Backup data daily to lab storage",
          "Flag anomalies but do not discard data ad-hoc",
        ],
      },
    },
    {
      id: "analysis",
      position: { x: COL.analysis, y: ROW.middle },
      data: {
        title: "Data analysis",
        schedule: "Week 9",
        detail: "Statistics, figures, and effect-size estimates.",
        status: "upcoming",
        icon: "flask",
        effort: "1 week",
        description:
          "Run the pre-specified analysis plan first; only then explore. Report effect sizes with uncertainty — not just p-values.",
        deliverables: ["Statistics output", "Publication-quality figures"],
        checklist: [
          "Clean and merge data",
          "Run pre-specified tests",
          "Estimate effect sizes + confidence intervals",
          "Produce figures from a reproducible script",
        ],
      },
    },
    {
      id: "manuscript",
      position: { x: COL.manuscript, y: ROW.middle },
      data: {
        title: "Manuscript draft",
        schedule: "Week 10",
        detail: "Methods, results, and figures ready for review.",
        status: "upcoming",
        icon: "filetext",
        effort: "1–2 weeks",
        description:
          "Methods + results first while the experiment is fresh; introduction and discussion come last. Send for internal review before any external submission.",
        deliverables: ["Methods + Results draft", "Final figure set"],
        checklist: [
          "Draft Methods (mirror the SOP)",
          "Draft Results around the figures",
          "Polish figures for clarity, not decoration",
          "Send to co-authors for internal review",
        ],
      },
    },
  ],
  edges: [
    { id: "e:hypothesis-literature", source: "hypothesis", target: "literature" },
    { id: "e:literature-design", source: "literature", target: "design" },
    { id: "e:design-reagents", source: "design", target: "reagents" },
    { id: "e:design-protocol", source: "design", target: "protocol" },
    { id: "e:design-controls", source: "design", target: "controls" },
    { id: "e:reagents-pilot", source: "reagents", target: "pilot" },
    { id: "e:protocol-pilot", source: "protocol", target: "pilot" },
    { id: "e:controls-pilot", source: "controls", target: "pilot" },
    { id: "e:pilot-refine", source: "pilot", target: "refine" },
    { id: "e:refine-main", source: "refine", target: "main" },
    { id: "e:main-analysis", source: "main", target: "analysis" },
    { id: "e:analysis-manuscript", source: "analysis", target: "manuscript" },
  ],
};

/** Returns the mock workflow. Stable across calls; ignores the prompt for now. */
export function generateWorkflow(_prompt: string): Workflow {
  // Deep-clone so callers can mutate without bleeding into the template.
  return JSON.parse(JSON.stringify(TEMPLATE)) as Workflow;
}
