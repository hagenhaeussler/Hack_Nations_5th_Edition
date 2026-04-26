import { randomUUID } from "node:crypto";

import type {
  Paper,
  PrePlan,
  PrePlanCitation,
  PrePlanDomainExpert,
  PrePlanEdge,
  PrePlanNode,
  PrePlanSourceDocument,
} from "./projectTypes.js";

export const PRE_PLAN_MAKER_SYSTEM_PROMPT = `
You are the Pre-Plan Maker Agent for LabPilot.

Your task is to read scientific papers, protocols, lab notes, and related
experiment context, then reconstruct the experimental procedure described or
implied by those sources. You do not create the final new experiment plan.
Instead, extract and structure the procedure used in existing related work so
another agent can later create a new customized experiment plan.

Return a valid JSON object. The output must be a directed acyclic graph (DAG):
each node is one concrete experimental subtask, and each edge is a meaningful
dependency where the parent must finish before the child can begin.

For every node extract or infer: node_id, step_name, step_purpose,
people_required, equipment_required, materials_required, estimated_duration,
estimated_price, items_to_buy, useful domain experts, source_citations,
detailed procedure, validation_criteria, start date or relative start timing,
parent_ids, child_ids, and uncertainties.

Rules:
- Do not create the final new experiment plan.
- Only reconstruct the procedure from provided sources.
- Do not invent unsupported details.
- Use null or "unknown" when information is missing.
- Mark inferred information clearly.
- Link important claims to source citations whenever possible.
- Ensure the graph has no cycles.
`.trim();

export interface PrePlanInputDocument {
  id: string;
  title: string;
  sourceType: PrePlanSourceDocument["source_type"];
  fileName?: string;
  url?: string;
}

interface GeneratePrePlanInput {
  hypothesis: string;
  papers: Paper[];
  documents?: PrePlanInputDocument[];
}

interface ProcedureProfile {
  title: string;
  domain: string;
  experimentType: string;
  mainMethod: string;
  steps: Array<{
    name: string;
    purpose: string;
    procedure: string;
    equipment: string[];
    materials: string[];
    durationValue: number | null;
    durationUnit: string;
    validation: string[];
    uncertainties: string[];
  }>;
}

const DEFAULT_ROLES = ["Research assistant", "Domain expert"];

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function paperCitation(paper: Paper): string {
  const firstAuthor = paper.authors[0] ?? "Unknown author";
  return `${firstAuthor}${paper.authors.length > 1 ? " et al." : ""} (${paper.year}). ${paper.title}. ${paper.venue}.`;
}

function paperToSourceDocument(paper: Paper, index: number): PrePlanSourceDocument {
  return {
    document_id: `paper_${String(index + 1).padStart(3, "0")}`,
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    source_type: "paper",
    url: paper.url,
    citation: paperCitation(paper),
  };
}

function documentToSourceDocument(
  doc: PrePlanInputDocument,
  index: number,
): PrePlanSourceDocument {
  return {
    document_id: doc.id || `doc_${String(index + 1).padStart(3, "0")}`,
    title: doc.title,
    authors: [],
    year: "unknown",
    source_type: doc.sourceType,
    file_name: doc.fileName,
    url: doc.url,
    citation: doc.url ?? doc.fileName ?? doc.title,
  };
}

function inferProfile(hypothesis: string, papers: Paper[]): ProcedureProfile {
  const corpus = `${hypothesis} ${papers.map((p) => `${p.title} ${p.abstract}`).join(" ")}`.toLowerCase();

  if (/\bcrispr\b|\bcas9\b|knockout|guide rna|electroporation/.test(corpus)) {
    return {
      title: "Reconstructed CRISPR-Cas9 editing workflow",
      domain: "Molecular biology",
      experimentType: "Gene-editing assay",
      mainMethod: "CRISPR-Cas9 ribonucleoprotein electroporation",
      steps: [
        {
          name: "Select target and design guide RNAs",
          purpose: "Define the genomic target and choose candidate guides before wet-lab work begins.",
          procedure:
            "Identify the target locus, choose candidate guide RNAs, and screen for specificity using the method criteria described or implied by the related paper.",
          equipment: ["Guide RNA design software", "Reference genome database"],
          materials: ["Target gene sequence", "Candidate guide RNA list"],
          durationValue: null,
          durationUnit: "days",
          validation: ["Candidate guides are documented with target coordinates and off-target review."],
          uncertainties: ["Guide selection criteria are inferred because exact design parameters are not stated in the available metadata."],
        },
        {
          name: "Prepare cells and CRISPR reagents",
          purpose: "Bring the biological sample and editing reagents into a state suitable for delivery.",
          procedure:
            "Prepare primary cells or the relevant model system, assemble Cas9 and guide RNA reagents, and confirm reagent identity before delivery.",
          equipment: ["Biosafety cabinet", "Cell culture incubator", "Centrifuge"],
          materials: ["Cells", "Cas9 protein", "Guide RNA", "Culture media"],
          durationValue: null,
          durationUnit: "hours",
          validation: ["Cells are viable and editing reagents are ready for delivery."],
          uncertainties: ["Cell source, reagent quantities, and incubation timings are unknown."],
        },
        {
          name: "Deliver CRISPR reagents by electroporation",
          purpose: "Introduce editing reagents into the cells using the source method's delivery approach.",
          procedure:
            "Combine prepared cells with CRISPR reagents and perform electroporation under the source method's optimized conditions.",
          equipment: ["Electroporator", "Electroporation cuvettes or plates"],
          materials: ["Prepared cells", "CRISPR ribonucleoprotein mix", "Recovery media"],
          durationValue: null,
          durationUnit: "hours",
          validation: ["Cells recover after delivery and can be moved into culture."],
          uncertainties: ["Voltage, pulse program, cell number, and reagent dose are not available from the current source metadata."],
        },
        {
          name: "Culture cells and measure editing outcomes",
          purpose: "Allow editing to occur and quantify both editing efficiency and viability.",
          procedure:
            "Culture edited cells for the stated or typical recovery window, then assay editing efficiency and viability as reported by the source paper.",
          equipment: ["Cell culture incubator", "Flow cytometer or sequencing instrument"],
          materials: ["Edited cells", "Viability reagent", "Genotyping reagents"],
          durationValue: null,
          durationUnit: "days",
          validation: ["Editing efficiency and cell viability are measured and recorded."],
          uncertainties: ["Exact culture duration and assay format are inferred from the abstract-level source evidence."],
        },
      ],
    };
  }

  if (/single-cell|scrna|rna-seq|transcriptom|lps|dendritic/.test(corpus)) {
    return {
      title: "Reconstructed single-cell stimulation workflow",
      domain: "Immunology / genomics",
      experimentType: "Time-resolved single-cell transcriptomics",
      mainMethod: "Single-cell RNA sequencing after stimulation",
      steps: [
        {
          name: "Prepare cell populations and stimulation conditions",
          purpose: "Create the biological conditions needed to observe source-reported activation states.",
          procedure:
            "Prepare the relevant cell population, assign stimulated and control conditions, and document planned time points.",
          equipment: ["Biosafety cabinet", "Cell culture incubator"],
          materials: ["Cells", "Stimulant", "Culture media"],
          durationValue: null,
          durationUnit: "hours",
          validation: ["Conditions and time points are labeled before stimulation starts."],
          uncertainties: ["Cell origin, stimulant dose, and replicate count are not stated in the available metadata."],
        },
        {
          name: "Stimulate and collect time-resolved samples",
          purpose: "Capture transient cellular responses described in the related work.",
          procedure:
            "Apply stimulation, harvest cells at the defined time points, and preserve single-cell suspensions for library preparation.",
          equipment: ["Pipettes", "Centrifuge", "Cell counter"],
          materials: ["Stimulated cells", "Control cells", "Collection buffers"],
          durationValue: null,
          durationUnit: "hours",
          validation: ["Viable single-cell suspensions are collected for each condition and time point."],
          uncertainties: ["Exact time points and viability thresholds are unknown."],
        },
        {
          name: "Prepare and sequence single-cell libraries",
          purpose: "Generate expression profiles for each captured cell.",
          procedure:
            "Prepare single-cell RNA-seq libraries according to the platform protocol and sequence to the depth needed for subset analysis.",
          equipment: ["Single-cell capture instrument", "Sequencer"],
          materials: ["Single-cell suspensions", "Library preparation reagents"],
          durationValue: null,
          durationUnit: "days",
          validation: ["Libraries pass quality control and sequencing data are produced."],
          uncertainties: ["Platform, chemistry, and sequencing depth are not provided."],
        },
        {
          name: "Analyze activation states",
          purpose: "Recover the cellular states or expression differences reported by the source procedure.",
          procedure:
            "Process reads, filter low-quality cells, cluster profiles, and compare stimulated versus control/time-point populations.",
          equipment: ["Compute workstation"],
          materials: ["Sequencing FASTQ files", "Metadata table"],
          durationValue: null,
          durationUnit: "days",
          validation: ["Quality-controlled clusters and activation-state annotations are available."],
          uncertainties: ["Exact analysis pipeline and thresholds are inferred."],
        },
      ],
    };
  }

  if (/organoid|drug screen|high-content|imaging|cell-painting/.test(corpus)) {
    return {
      title: "Reconstructed organoid or imaging-screen workflow",
      domain: "Cell biology",
      experimentType: "Phenotypic screening assay",
      mainMethod: "Organoid culture with high-content measurement",
      steps: [
        {
          name: "Establish biological model and plate layout",
          purpose: "Create comparable experimental units before perturbation.",
          procedure:
            "Prepare organoids or cells, define the plate map, randomize conditions, and record batch information called out by the related work.",
          equipment: ["Biosafety cabinet", "Incubator", "Plate reader or imager"],
          materials: ["Organoids or cells", "Matrix or culture substrate", "Assay plates"],
          durationValue: null,
          durationUnit: "days",
          validation: ["Experimental units are seeded with a documented plate map and batch metadata."],
          uncertainties: ["Seeding density, matrix lot, and culture duration are not fully specified."],
        },
        {
          name: "Apply perturbations or assay conditions",
          purpose: "Expose samples to the conditions tested in the source experiment.",
          procedure:
            "Add compounds, controls, or other perturbations according to the screen design and maintain consistent timing across plates.",
          equipment: ["Pipettes or liquid handler"],
          materials: ["Compounds or perturbagens", "Positive controls", "Negative controls"],
          durationValue: null,
          durationUnit: "hours",
          validation: ["All planned conditions and controls are applied to the correct wells."],
          uncertainties: ["Compound identities, concentrations, and exposure times are unknown."],
        },
        {
          name: "Acquire assay readouts",
          purpose: "Measure phenotypes needed to compare conditions.",
          procedure:
            "Collect imaging, viability, or other high-content readouts using the source method's measurement approach.",
          equipment: ["High-content imaging system", "Plate reader"],
          materials: ["Staining reagents or readout kit"],
          durationValue: null,
          durationUnit: "hours",
          validation: ["Raw images or assay measurements are captured for all wells."],
          uncertainties: ["Imaging channels, exposure settings, and readout kit are not stated."],
        },
        {
          name: "Normalize and analyze screen results",
          purpose: "Reduce batch effects and identify source-reported phenotype differences.",
          procedure:
            "Normalize measurements, check plate-position effects, compare conditions, and produce quality-control summaries.",
          equipment: ["Compute workstation"],
          materials: ["Raw readout files", "Plate metadata"],
          durationValue: null,
          durationUnit: "days",
          validation: ["Normalized results and QC plots are available."],
          uncertainties: ["The exact analysis model is inferred from abstract-level evidence."],
        },
      ],
    };
  }

  return {
    title: "Reconstructed experimental procedure from related work",
    domain: "Life sciences",
    experimentType: "Experimental procedure reconstruction",
    mainMethod: "Method inferred from related papers and provided context",
    steps: [
      {
        name: "Identify source procedure and experimental goal",
        purpose: "Determine what existing work attempted to test before extracting operational steps.",
        procedure:
          "Review source titles, abstracts, and any attached context to identify the relevant procedure, model system, controls, and readouts.",
        equipment: ["Literature database"],
        materials: ["Source papers", "Protocol or lab context, if provided"],
        durationValue: null,
        durationUnit: "hours",
        validation: ["The source procedure and intended readout are summarized."],
        uncertainties: ["Only metadata-level source text is available in the current implementation."],
      },
      {
        name: "Prepare experimental samples",
        purpose: "Create the samples required for the source method's main measurement.",
        procedure:
          "Prepare the biological samples, reagents, and controls described or implied by the related source material.",
        equipment: ["Standard lab bench equipment"],
        materials: ["Experimental samples", "Reagents", "Controls"],
        durationValue: null,
        durationUnit: "hours",
        validation: ["Samples and controls are ready for measurement."],
        uncertainties: ["Sample counts, quantities, and timings are not directly stated."],
      },
      {
        name: "Run main experimental method",
        purpose: "Execute the key method used by the source experiment.",
        procedure:
          "Perform the central assay or intervention using the method implied by the highest-ranked related papers.",
        equipment: ["Method-specific equipment"],
        materials: ["Prepared samples", "Assay reagents"],
        durationValue: null,
        durationUnit: "hours",
        validation: ["The main procedure has completed and raw observations are available."],
        uncertainties: ["Specific operating parameters are unknown."],
      },
      {
        name: "Validate and analyze results",
        purpose: "Check whether the procedure produced usable data and source-comparable outputs.",
        procedure:
          "Assess quality criteria, compare controls, and analyze the readout using the source paper's stated or implied validation approach.",
        equipment: ["Compute workstation"],
        materials: ["Raw data", "Experiment metadata"],
        durationValue: null,
        durationUnit: "days",
        validation: ["Quality-controlled results and a summary of findings are produced."],
        uncertainties: ["Statistical tests and acceptance thresholds are not stated."],
      },
    ],
  };
}

function citationsForStep(
  sourceDocuments: PrePlanSourceDocument[],
  papers: Paper[],
  stepName: string,
): PrePlanCitation[] {
  const primary = sourceDocuments[0];
  if (!primary) {
    return [
      {
        document_id: "unknown",
        location: "not available",
        quote_or_evidence: `No source document was available for "${stepName}".`,
      },
    ];
  }

  const paper = papers[0];
  return [
    {
      document_id: primary.document_id,
      location: paper ? "Title and abstract metadata" : "Attached source metadata",
      quote_or_evidence: paper
        ? `${paper.title}: ${paper.abstract}`
        : `Attached source "${primary.title}" was provided, but text extraction is not implemented yet.`,
    },
  ];
}

function expertsFromSources(
  sourceDocuments: PrePlanSourceDocument[],
): PrePlanDomainExpert[] {
  return sourceDocuments
    .flatMap((doc) =>
      doc.authors.slice(0, 2).map((author) => ({
        name: author,
        affiliation: "unknown",
        reason_relevant: "Author connected to a source procedure used for reconstruction.",
        source: doc.document_id,
      })),
    )
    .slice(0, 4);
}

function buildNodes(
  profile: ProcedureProfile,
  sourceDocuments: PrePlanSourceDocument[],
  papers: Paper[],
): PrePlanNode[] {
  const experts = expertsFromSources(sourceDocuments);

  const nodes = profile.steps.map<PrePlanNode>((step, index) => {
    const nodeId = `step_${String(index + 1).padStart(3, "0")}`;
    const parentId = index === 0 ? null : `step_${String(index).padStart(3, "0")}`;
    const childId =
      index === profile.steps.length - 1
        ? null
        : `step_${String(index + 2).padStart(3, "0")}`;

    return {
      node_id: nodeId,
      step_name: step.name,
      step_purpose: step.purpose,
      people_required: {
        count: 1,
        roles: DEFAULT_ROLES,
      },
      equipment_required: step.equipment.map((name) => ({
        name,
        required: true,
        availability_assumption: "unknown",
      })),
      materials_required: step.materials.map((name) => ({
        name,
        quantity: "unknown",
        unit: "unknown",
      })),
      estimated_duration: {
        value: step.durationValue,
        unit: step.durationUnit,
        confidence: "low",
        basis: "not directly stated in source; inferred from procedure category",
      },
      estimated_price: {
        value: null,
        currency: "USD",
        confidence: "low",
        basis: "not stated in source",
      },
      items_to_buy: step.materials.slice(0, 3).map((name) => ({
        name,
        reason: `Needed for ${step.name}.`,
        estimated_price: null,
      })),
      domain_experts: experts,
      source_citations: citationsForStep(sourceDocuments, papers, step.name),
      procedure: step.procedure,
      validation_criteria: step.validation,
      start: {
        type: "relative",
        value: parentId ? `after ${parentId}` : "project start",
        date: null,
      },
      parent_ids: parentId ? [parentId] : [],
      child_ids: childId ? [childId] : [],
      uncertainties: step.uncertainties,
    };
  });

  return nodes;
}

function buildEdges(nodes: PrePlanNode[]): PrePlanEdge[] {
  return nodes.flatMap((node) =>
    node.child_ids.map((childId) => ({
      from: node.node_id,
      to: childId,
      dependency_type: "must_finish_before_start" as const,
      reason: `${node.step_name} must be completed before ${nodes.find((n) => n.node_id === childId)?.step_name ?? childId} can begin.`,
    })),
  );
}

export function generatePrePlan({
  hypothesis,
  papers,
  documents = [],
}: GeneratePrePlanInput): PrePlan {
  const paperDocuments = papers.map(paperToSourceDocument);
  const uploadedDocuments = documents.map((doc, index) =>
    documentToSourceDocument(doc, paperDocuments.length + index),
  );
  const sourceDocuments = [...paperDocuments, ...uploadedDocuments];
  const profile = inferProfile(hypothesis, papers);
  const nodes = buildNodes(profile, sourceDocuments, papers);
  const edges = buildEdges(nodes);

  const equipment = [...new Set(nodes.flatMap((n) => n.equipment_required.map((e) => e.name)))];
  const materials = [...new Set(nodes.flatMap((n) => n.materials_required.map((m) => m.name)))];
  const itemsToBuy = [...new Set(nodes.flatMap((n) => n.items_to_buy.map((item) => item.name)))];
  const people = [...new Set(nodes.flatMap((n) => n.people_required.roles))];

  const hasPaperEvidence = papers.length > 0;
  const hasTextExtractionGap = documents.length > 0;

  return {
    pre_plan_id: `preplan_${randomUUID()}`,
    source_documents: sourceDocuments,
    experiment_summary: {
      title: profile.title,
      goal: cleanText(hypothesis),
      domain: profile.domain,
      experiment_type: profile.experimentType,
      main_method: profile.mainMethod,
      reconstruction_confidence: hasPaperEvidence ? "medium" : "low",
    },
    dag: {
      nodes,
      edges,
    },
    global_resources: {
      people,
      equipment,
      materials,
      items_to_buy: itemsToBuy,
      estimated_total_cost: {
        value: null,
        currency: "USD",
        confidence: "low",
        basis: "line-item prices are not stated in the source material",
      },
      estimated_total_duration: {
        value: null,
        unit: "days",
        confidence: "low",
        basis: "durations are not directly stated in the available source metadata",
      },
    },
    open_questions: [
      "What exact quantities, concentrations, replicate counts, and acceptance thresholds did the source protocol use?",
      "Which source passages should be treated as authoritative if full-text papers or lab notes disagree?",
      ...(hasTextExtractionGap
        ? ["Attached documents are recorded as sources, but full text extraction is not implemented in this mock agent."]
        : []),
    ],
    agent_notes: [
      `System prompt contract: ${PRE_PLAN_MAKER_SYSTEM_PROMPT.split("\n")[0]}`,
      "This implementation returns deterministic structured JSON so the product can exercise the pre-plan flow before an LLM backend is connected.",
      "Every generated edge is linear and forward-only, so the returned graph is acyclic by construction.",
    ],
    summary: `${profile.title}: reconstructed ${nodes.length} source-procedure steps from ${sourceDocuments.length} source document${sourceDocuments.length === 1 ? "" : "s"}. Unknown quantities, prices, and precise timings are left null or marked as inferred.`,
  };
}
