/**
 * Recent-projects data layer.
 *
 * Today this returns hard-coded sample data so the landing page has something
 * to render. The shape is intentionally narrow so the swap to a real backend
 * is mechanical — you only need to replace the body of `listRecentProjects()`
 * (e.g. with `fetch("/api/projects").then(r => r.json())`) without touching
 * any call sites or component code.
 *
 * To wire up a database later:
 *   1. Add a backend route, e.g. `GET /api/projects` returning `Project[]`.
 *   2. Replace `listRecentProjects()` below with a fetch and update its
 *      return type to `Promise<Project[]>` if you want to go async; callers
 *      can move to a `useEffect`-driven loader in one place.
 */

export type ProjectStage =
  | "planning"
  | "in-progress"
  | "analysis"
  | "completed"
  | "archived";

export interface Project {
  /** Stable identifier — will be the database PK once persisted. */
  id: string;
  title: string;
  /** The hypothesis that anchors the project. */
  hypothesis: string;
  stage: ProjectStage;
  /** ISO timestamp of last activity. */
  updatedAt: string;
  /** Approximate completion, 0–1. Optional. */
  progress?: number;
  /** Display names or initials of collaborators. Optional. */
  collaborators?: string[];
  /** Short status / focus line. Optional. */
  summary?: string;
}

export const STAGE_LABEL: Record<ProjectStage, string> = {
  planning: "Planning",
  "in-progress": "In progress",
  analysis: "Analysis",
  completed: "Completed",
  archived: "Archived",
};

/**
 * Stages where the user is actively driving the project — used by the card
 * to surface a terracotta accent rather than the neutral grey treatment.
 */
export function isActiveStage(stage: ProjectStage): boolean {
  return (
    stage === "in-progress" || stage === "analysis"
  );
}

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const SAMPLE_PROJECTS: Project[] = [
  {
    id: "proj-tau-glp1",
    title: "GLP-1R activation & tau pathology",
    hypothesis:
      "GLP-1 receptor activation in cortical neurons reduces tau hyperphosphorylation in mouse brain slices.",
    stage: "in-progress",
    updatedAt: new Date(NOW - 3 * HOUR).toISOString(),
    progress: 0.45,
    collaborators: ["AM", "RH", "JK"],
    summary: "Pilot run scheduled for week 4; reagents in transit.",
  },
  {
    id: "proj-crispr-tcell",
    title: "CRISPR knockout efficiency in primary T cells",
    hypothesis:
      "RNP electroporation outperforms lentiviral delivery for guide RNA in donor-matched primary T cells.",
    stage: "analysis",
    updatedAt: new Date(NOW - 1 * DAY - 2 * HOUR).toISOString(),
    progress: 0.78,
    collaborators: ["LN", "SP"],
    summary: "Replicate 3 done; figures drafted.",
  },
  {
    id: "proj-organoid-screen",
    title: "Organoid drug-screen reproducibility",
    hypothesis:
      "Matrigel batch and seeding density drive cross-site variance more than imaging pipeline.",
    stage: "in-progress",
    updatedAt: new Date(NOW - 4 * DAY).toISOString(),
    progress: 0.32,
    collaborators: ["MC", "FW"],
    summary: "Multi-site protocol draft in review.",
  },
  {
    id: "proj-scrna-dc",
    title: "scRNA-seq of LPS-stimulated dendritic cells",
    hypothesis:
      "Two transient activation states emerge in monocyte-derived DCs that bulk profiling collapses.",
    stage: "completed",
    updatedAt: new Date(NOW - 12 * DAY).toISOString(),
    progress: 1,
    collaborators: ["TO", "YL", "JB"],
    summary: "Manuscript submitted to Cell Reports.",
  },
  {
    id: "proj-microbiome-gf",
    title: "Microbiome transfer in germ-free mice",
    hypothesis:
      "FMT from high-fiber donors restores SCFA production within 14 days of colonisation.",
    stage: "planning",
    updatedAt: new Date(NOW - 2 * DAY - 6 * HOUR).toISOString(),
    progress: 0.08,
    collaborators: ["AM", "DW"],
    summary: "IACUC submission this week.",
  },
  {
    id: "proj-cardiac-patch",
    title: "Cardiac patch electrical coupling",
    hypothesis:
      "Aligned-fibre PCL scaffolds improve gap-junction density in iPSC-derived cardiomyocytes.",
    stage: "in-progress",
    updatedAt: new Date(NOW - 9 * HOUR).toISOString(),
    progress: 0.55,
    collaborators: ["RK", "SH"],
    summary: "Cx43 staining underway.",
  },
  {
    id: "proj-long-read",
    title: "Long-read assemblies for repetitive plant genomes",
    hypothesis:
      "PacBio HiFi recovers tandem-repeat regions missed by Illumina + Nanopore hybrid pipelines.",
    stage: "analysis",
    updatedAt: new Date(NOW - 6 * DAY).toISOString(),
    progress: 0.62,
    collaborators: ["KI", "AB"],
    summary: "Comparing N50 across three cultivars.",
  },
  {
    id: "proj-glia-aging",
    title: "Glial inflammation in aged hippocampus",
    hypothesis:
      "Microglia in 18-mo C57BL/6 mice show elevated IL-6 secretion versus 3-mo controls.",
    stage: "planning",
    updatedAt: new Date(NOW - 8 * DAY).toISOString(),
    progress: 0.05,
    collaborators: ["AM"],
    summary: "Designing cohort + power analysis.",
  },
  {
    id: "proj-eeg-sleep",
    title: "Closed-loop tACS during NREM sleep",
    hypothesis:
      "Phase-locked tACS at slow-oscillation troughs enhances overnight memory consolidation.",
    stage: "completed",
    updatedAt: new Date(NOW - 27 * DAY).toISOString(),
    progress: 1,
    collaborators: ["EM", "TJ"],
    summary: "Preprint posted on bioRxiv.",
  },
  {
    id: "proj-cancer-metab",
    title: "Glutamine dependency in TNBC organoids",
    hypothesis:
      "GLS1 inhibition selectively reduces viability in MYC-amplified triple-negative breast organoids.",
    stage: "archived",
    updatedAt: new Date(NOW - 84 * DAY).toISOString(),
    progress: 0.4,
    collaborators: ["NV"],
    summary: "Paused — awaiting reagent restock.",
  },
];

/**
 * Returns the user's recent projects, most-recently-updated first.
 * Replace the body with a real fetch when the backend is ready.
 */
export function listRecentProjects(): Project[] {
  return [...SAMPLE_PROJECTS].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

/**
 * Compact, locale-light relative time formatting (e.g. "3 h ago", "2 d ago").
 * Stays under 6 characters so it fits in card metadata rows.
 */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  if (Number.isNaN(diffMs)) return "—";
  const diffMin = Math.round(diffMs / (60 * 1000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 14) return `${diffDay} d ago`;
  const diffWk = Math.round(diffDay / 7);
  if (diffWk < 8) return `${diffWk} w ago`;
  const diffMo = Math.round(diffDay / 30);
  return `${diffMo} mo ago`;
}
