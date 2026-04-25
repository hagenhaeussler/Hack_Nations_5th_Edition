import type { LucideIcon } from "lucide-react";
import { Beaker, Cpu, Microscope, ShieldCheck, Syringe } from "lucide-react";

import { EXAMPLE_NODES } from "@/components/timeline/exampleWorkflow";
import type { WorkflowStatus } from "@/components/timeline/WorkflowNode";
import { getSimilarPapers, type Paper } from "@/lib/papers";

/**
 * Aggregated, read-only statistics shown on the project dashboard tab.
 *
 * Where possible we derive numbers from the workflow + similar-papers data
 * already in the app (so adding a step to the timeline shifts the totals
 * here too). Anything that doesn't yet have a real source — budget,
 * roster, validation criteria — is provided as a single seed below so the
 * UI has plausible content while the backend wiring catches up.
 */

// ---------- Schedule -------------------------------------------------------

export interface ProjectTime {
  totalWeeks: number;
  startLabel: string;
  endLabel: string;
  taskCount: number;
}

/** Parses a schedule label like "Week 2", "Week 3–4", or "Day 0". */
function parseScheduleEnd(label: string | undefined): number {
  if (!label) return 0;
  if (/day\s*0/i.test(label)) return 0;
  const matches = label.match(/\d+/g);
  if (!matches?.length) return 0;
  return Math.max(...matches.map((n) => Number.parseInt(n, 10)));
}

export function getProjectTime(): ProjectTime {
  const ends = EXAMPLE_NODES.map((n) => parseScheduleEnd(n.data.schedule));
  const totalWeeks = Math.max(...ends, 0);
  const first = EXAMPLE_NODES[0]?.data.schedule ?? "Day 0";
  const last =
    EXAMPLE_NODES[EXAMPLE_NODES.length - 1]?.data.schedule ?? `Week ${totalWeeks}`;
  return {
    totalWeeks,
    startLabel: first,
    endLabel: last,
    taskCount: EXAMPLE_NODES.length,
  };
}

// ---------- Budget ---------------------------------------------------------

export interface BudgetLine {
  label: string;
  amount: number;
  icon: LucideIcon;
}

export interface ProjectBudget {
  total: number;
  currency: "USD";
  lines: BudgetLine[];
}

const BUDGET_LINES: BudgetLine[] = [
  { label: "Reagents & antibodies", amount: 11_400, icon: Syringe },
  { label: "Consumables & plasticware", amount: 6_200, icon: Beaker },
  { label: "Sequencing & imaging", amount: 4_800, icon: Microscope },
  { label: "Compute & storage", amount: 1_200, icon: Cpu },
  { label: "IRB / overhead", amount: 980, icon: ShieldCheck },
];

export function getProjectBudget(): ProjectBudget {
  return {
    total: BUDGET_LINES.reduce((sum, l) => sum + l.amount, 0),
    currency: "USD",
    lines: BUDGET_LINES,
  };
}

export function formatUSD(amount: number, opts?: { compact?: boolean }): string {
  if (opts?.compact && amount >= 1000) {
    const k = amount / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

// ---------- Team -----------------------------------------------------------

export interface TeamMember {
  name: string;
  initials: string;
  role: string;
  focus: string;
}

const TEAM: TeamMember[] = [
  {
    name: "Dr. Lena Park",
    initials: "LP",
    role: "Principal investigator",
    focus: "Hypothesis & manuscript",
  },
  {
    name: "Mateo Ruiz",
    initials: "MR",
    role: "Postdoctoral fellow",
    focus: "Experimental design",
  },
  {
    name: "Aisha Khoury",
    initials: "AK",
    role: "PhD candidate",
    focus: "Lead experimentalist",
  },
  {
    name: "Hugo Lindqvist",
    initials: "HL",
    role: "Research assistant",
    focus: "Reagent prep & controls",
  },
  {
    name: "Priya Mehta",
    initials: "PM",
    role: "Bioinformatics",
    focus: "Analysis & figures",
  },
  {
    name: "Sam Tanaka",
    initials: "ST",
    role: "Lab manager",
    focus: "Procurement & approvals",
  },
];

export function getTeam(): TeamMember[] {
  return TEAM;
}

// ---------- Tasks ----------------------------------------------------------

export interface ProjectTask {
  id: string;
  title: string;
  schedule?: string;
  status: WorkflowStatus;
}

export function getProjectTasks(): ProjectTask[] {
  return EXAMPLE_NODES.map((n) => ({
    id: n.id,
    title: n.data.title,
    schedule: n.data.schedule,
    status: n.data.status,
  }));
}

// ---------- Validation criteria -------------------------------------------

export interface ValidationCriterion {
  label: string;
  detail: string;
}

const VALIDATION: ValidationCriterion[] = [
  {
    label: "Pre-registered effect size",
    detail: "Standardised effect ≥ 0.5 between treated and control arms.",
  },
  {
    label: "Replication structure",
    detail: "≥ 2 biological replicates × 3 technical replicates per condition.",
  },
  {
    label: "Statistical threshold",
    detail: "Adjusted p < 0.05 after Benjamini–Hochberg correction.",
  },
  {
    label: "Negative control",
    detail: "Vehicle-only condition shows no signal above assay background.",
  },
  {
    label: "Orthogonal confirmation",
    detail: "Result reproduces in a second assay (e.g. qPCR confirms RNA-seq).",
  },
];

export function getValidationCriteria(): ValidationCriterion[] {
  return VALIDATION;
}

// ---------- Domain experts (from related papers) -------------------------

export interface DomainExpert {
  name: string;
  initials: string;
  paperCount: number;
  topVenue: string;
  topPaperTitle: string;
  averageSimilarity: number;
}

function initialsFromAuthor(author: string): string {
  // Authors are stored as "Surname, X." — take the surname's first letter and
  // the given-name initial when present.
  const [surname, given] = author.split(",").map((s) => s.trim());
  const a = surname?.[0] ?? "";
  const b = given?.replace(/[^A-Za-z]/g, "")?.[0] ?? "";
  return (a + b).toUpperCase() || surname.slice(0, 2).toUpperCase();
}

/**
 * Aggregates authors across the most similar papers to surface the
 * researchers most likely to be useful domain contacts.
 */
export function getDomainExperts(prompt: string, limit = 5): DomainExpert[] {
  const papers = getSimilarPapers(prompt, 8);
  const byAuthor = new Map<
    string,
    { papers: Paper[]; similaritySum: number }
  >();

  for (const paper of papers) {
    for (const author of paper.authors) {
      const entry = byAuthor.get(author) ?? { papers: [], similaritySum: 0 };
      entry.papers.push(paper);
      entry.similaritySum += paper.similarity;
      byAuthor.set(author, entry);
    }
  }

  const ranked: DomainExpert[] = Array.from(byAuthor.entries()).map(
    ([author, { papers: ps, similaritySum }]) => {
      const top = [...ps].sort((a, b) => b.similarity - a.similarity)[0];
      return {
        name: author,
        initials: initialsFromAuthor(author),
        paperCount: ps.length,
        topVenue: top.venue,
        topPaperTitle: top.title,
        averageSimilarity: similaritySum / ps.length,
      };
    },
  );

  return ranked
    .sort((a, b) => {
      if (b.paperCount !== a.paperCount) return b.paperCount - a.paperCount;
      return b.averageSimilarity - a.averageSimilarity;
    })
    .slice(0, limit);
}
