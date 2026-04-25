/**
 * Mock corpus of "similar papers" returned for a given prompt.
 *
 * The backend reference-search isn't wired up yet (see roadmap in README.md);
 * until then, we synthesise a deterministic-but-plausible result set so the
 * Similar Papers panel feels grounded. When the real endpoint exists, replace
 * `getSimilarPapers` with a fetch — the shape is intentionally narrow.
 */

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  venue: string;
  /** 0–1 cosine-style similarity to the user's prompt. */
  similarity: number;
  abstract: string;
  url?: string;
}

const CORPUS: Omit<Paper, "similarity">[] = [
  {
    id: "p-001",
    title:
      "Optimizing CRISPR-Cas9 knockout efficiency in primary T cells via electroporation",
    authors: ["Nguyen, L.", "Park, S.", "Hassan, R."],
    year: 2024,
    venue: "Nature Methods",
    abstract:
      "We benchmark guide RNA delivery formats across donor T-cell pools and find ribonucleoprotein electroporation outperforms lentiviral delivery on both editing efficiency and cell viability.",
    url: "https://example.com/papers/p-001",
  },
  {
    id: "p-002",
    title:
      "Single-cell RNA-seq of dendritic cell subsets following LPS stimulation",
    authors: ["Okafor, T.", "Liu, Y.", "Bergström, J."],
    year: 2023,
    venue: "Cell Reports",
    abstract:
      "Time-resolved scRNA-seq reveals two transient activation states in monocyte-derived dendritic cells absent from prior bulk profiles.",
    url: "https://example.com/papers/p-002",
  },
  {
    id: "p-003",
    title:
      "Reproducibility of organoid-based drug screens: a multi-site study",
    authors: ["Costa, M.", "Wu, F.", "Alvarez, P.", "Rao, S."],
    year: 2024,
    venue: "Nature Biotechnology",
    abstract:
      "Across six labs, screen reproducibility hinges on Matrigel batch and seeding density rather than imaging pipeline; we publish a normalised protocol.",
    url: "https://example.com/papers/p-003",
  },
  {
    id: "p-004",
    title:
      "Bench-marking long-read assemblies for repetitive plant genomes",
    authors: ["Ito, K.", "Brennan, A."],
    year: 2022,
    venue: "Genome Research",
    abstract:
      "Comparing PacBio HiFi and ONT R10 across three Solanum cultivars, HiFi yields fewer mis-joins but ONT resolves more centromeric repeats.",
  },
  {
    id: "p-005",
    title:
      "A simplified protocol for iPSC-derived cortical organoid differentiation",
    authors: ["Sharma, D.", "Mendes, R.", "Khoury, J."],
    year: 2025,
    venue: "Stem Cell Reports",
    abstract:
      "We collapse a 60-day differentiation into 38 days while preserving cytoarchitectural markers; downstream transcriptomes match published references at r = 0.92.",
  },
  {
    id: "p-006",
    title:
      "Quantifying batch effects in high-content imaging assays",
    authors: ["Lindholm, E.", "Patel, V."],
    year: 2023,
    venue: "Bioinformatics",
    abstract:
      "Plate-position artefacts dominate cell-painting variance; ComBat plus randomized seeding reduces nuisance variance by 41% without erasing biological signal.",
  },
  {
    id: "p-007",
    title:
      "AAV serotype tropism in adult mouse striatum: a head-to-head comparison",
    authors: ["Yamamoto, H.", "Cole, B.", "Antonio, R."],
    year: 2024,
    venue: "Molecular Therapy",
    abstract:
      "AAV-PHP.eB outperforms AAV9 for striatal neuron transduction at matched dose, with comparable off-target hepatic exposure.",
  },
  {
    id: "p-008",
    title:
      "Designing inducible degron systems for endogenous proteins",
    authors: ["Becker, A.", "Tan, M.", "Olsen, K."],
    year: 2022,
    venue: "ACS Chemical Biology",
    abstract:
      "We compare auxin-, FKBP- and ligand-induced degron tags on six endogenous targets and provide a decision tree for picking a system per use-case.",
  },
];

/**
 * Deterministic 32-bit string hash → small int. Used to seed similarity
 * scores so the same prompt always yields the same ranked list.
 */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Returns up to `limit` papers, ranked by a synthesised similarity score
 * derived from the prompt. Scores are stable across renders for the same
 * prompt and span a believable 0.45–0.95 range.
 */
export function getSimilarPapers(prompt: string, limit = 8): Paper[] {
  const seed = hashString(prompt.toLowerCase().trim() || "labpilot");

  const scored = CORPUS.map((paper, idx) => {
    const noise = ((seed >>> (idx * 3)) & 0xff) / 255; // 0–1
    const positional = 1 - idx * 0.06; // light bias toward earlier corpus entries
    const similarity = Math.max(
      0.45,
      Math.min(0.95, 0.55 + noise * 0.35 + (positional - 0.7) * 0.2),
    );
    return { ...paper, similarity: Number(similarity.toFixed(2)) };
  });

  return scored
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export function similarityLabel(score: number): string {
  if (score >= 0.85) return "Very similar";
  if (score >= 0.7) return "Similar";
  if (score >= 0.55) return "Related";
  return "Loosely related";
}
