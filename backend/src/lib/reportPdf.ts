import type { FinalExperimentPlan, ProjectStatsReport } from "./projectTypes.js";

interface PdfLine {
  text: string;
  size: number;
  font: "regular" | "bold";
  indent: number;
  gapBefore?: number;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 54;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;

function estimateLabel(estimate: ProjectStatsReport["total_estimated_duration"]): string {
  return estimate.value === null
    ? `Unknown ${estimate.unit}`
    : `${estimate.value} ${estimate.unit}`;
}

function priceLabel(price: ProjectStatsReport["total_estimated_budget"]): string {
  return price.value === null
    ? "Unknown"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: price.currency,
        maximumFractionDigits: 0,
      }).format(price.value);
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text: string, size: number, indent: number): string[] {
  const maxChars = Math.max(36, Math.floor((PAGE_WIDTH - MARGIN_X * 2 - indent) / (size * 0.52)));
  const words = cleanText(text).split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function addHeading(lines: PdfLine[], text: string): void {
  lines.push({ text, size: 14, font: "bold", indent: 0, gapBefore: 14 });
}

function addParagraph(lines: PdfLine[], text: string, options: Partial<PdfLine> = {}): void {
  for (const wrapped of wrapText(text, options.size ?? 10.5, options.indent ?? 0)) {
    lines.push({
      text: wrapped,
      size: options.size ?? 10.5,
      font: options.font ?? "regular",
      indent: options.indent ?? 0,
      gapBefore: options.gapBefore,
    });
  }
}

function addList(lines: PdfLine[], items: string[], empty = "None supplied."): void {
  if (items.length === 0) {
    addParagraph(lines, empty, { indent: 12 });
    return;
  }
  for (const item of items) {
    addParagraph(lines, `- ${item}`, { indent: 12 });
  }
}

function resourceName(resource: { name: string; availability?: string; estimated_price?: number | null }): string {
  const price =
    typeof resource.estimated_price === "number" ? `, ~$${resource.estimated_price}` : "";
  return `${resource.name}${resource.availability ? ` (${resource.availability}${price})` : price}`;
}

function buildReportLines(plan: FinalExperimentPlan, exportedAt: string): PdfLine[] {
  const report = plan.stats_report;
  const weekBreakdown = plan.calendar_layout.week_groups.map(
    (week) =>
      `Week ${week.week_index + 1} (${week.start_date ?? "start"} to ${week.end_date ?? "end"}): ${week.days.reduce((sum, day) => sum + (day.task_ids ?? day.node_ids).length, 0)} task(s)`,
  );
  const lines: PdfLine[] = [
    { text: "LabPilot Project Report", size: 19, font: "bold", indent: 0 },
    { text: plan.experiment_title, size: 15, font: "bold", indent: 0, gapBefore: 4 },
    {
      text: `Exported ${new Date(exportedAt).toLocaleString("en-US")} · Plan ID: ${plan.plan_id}`,
      size: 9,
      font: "regular",
      indent: 0,
      gapBefore: 5,
    },
  ];

  addHeading(lines, "Overview");
  addParagraph(lines, `Original hypothesis: ${report.hypothesis}`);
  addParagraph(lines, `Experiment goal: ${report.experiment_goal}`);
  addParagraph(lines, report.summary);
  addParagraph(lines, `Total estimated duration: ${estimateLabel(report.total_estimated_duration)}. ${report.total_estimated_duration.basis}`);
  addParagraph(lines, `Total estimated budget: ${priceLabel(report.total_estimated_budget)}. ${report.total_estimated_budget.basis}`);

  addHeading(lines, "People Involved");
  addList(lines, report.people_summary);

  addHeading(lines, "Equipment");
  addParagraph(lines, "Required equipment", { font: "bold" });
  addList(lines, report.equipment_summary.required);
  addParagraph(lines, "Available equipment", { font: "bold", gapBefore: 8 });
  addList(lines, report.equipment_summary.available);
  addParagraph(lines, "Missing or unknown equipment", { font: "bold", gapBefore: 8 });
  addList(lines, [...report.equipment_summary.missing, ...report.equipment_summary.unknown]);

  addHeading(lines, "Materials");
  addParagraph(lines, "Required materials", { font: "bold" });
  addList(lines, report.materials_summary.required);
  addParagraph(lines, "Available materials", { font: "bold", gapBefore: 8 });
  addList(lines, report.materials_summary.available);
  addParagraph(lines, "Materials to buy or verify", { font: "bold", gapBefore: 8 });
  addList(lines, report.purchase_list.map(resourceName));

  addHeading(lines, "Experiment Calendar");
  addParagraph(lines, `Plan start: ${plan.plan_start_date ?? plan.calendar_layout.plan_start_date ?? plan.calendar_layout.timeline_start_date ?? "unknown"}`);
  addParagraph(lines, `Plan end: ${plan.plan_end_date ?? plan.calendar_layout.plan_end_date ?? plan.calendar_layout.timeline_end_date ?? "unknown"}`);
  addParagraph(lines, `Total weeks: ${plan.calendar_layout.total_weeks}. Total tasks: ${plan.nodes.length}.`);
  addList(lines, weekBreakdown);

  addHeading(lines, "Tasks by Day");
  addList(
    lines,
    report.task_summary.map(
      (task) =>
        `${task.step_name} (${task.status}) · day ${task.start_day} to ${task.end_day}`,
    ),
  );

  addHeading(lines, "Milestones");
  addList(
    lines,
    report.milestone_summary.map((milestone) => `${milestone.node_id}: ${milestone.milestone}`),
  );

  addHeading(lines, "Validation Criteria");
  addList(lines, report.validation_criteria_summary);

  addHeading(lines, "Risks and Schedule Concerns");
  addParagraph(lines, "Risks", { font: "bold" });
  addList(
    lines,
    report.risk_summary.map(
      (risk) => `${risk.severity}: ${risk.description} Mitigation: ${risk.mitigation}`,
    ),
  );
  addParagraph(lines, "Busy days", { font: "bold", gapBefore: 8 });
  addList(
    lines,
    plan.calendar_layout.day_groups
      .filter((day) => (day.task_ids ?? day.node_ids).length > 1)
      .map((day) => `${day.date ?? `Day ${day.day_index + 1}`}: ${(day.task_ids ?? day.node_ids).length} scheduled tasks`),
    "No overloaded day buckets supplied.",
  );

  addHeading(lines, "Domain Experts");
  addList(
    lines,
    report.domain_expert_summary.map(
      (expert) => `${expert.name} (${expert.affiliation}) · ${expert.reason_relevant}`,
    ),
  );

  addHeading(lines, "Citations");
  addList(
    lines,
    report.citation_summary.map(
      (citation) =>
        `${citation.document_id} · ${citation.location}: ${citation.quote_or_evidence}`,
    ),
  );

  addHeading(lines, "Learning Memory");
  addList(lines, report.learning_memory_summary);

  addHeading(lines, "Open Questions");
  addList(lines, report.open_questions);

  addHeading(lines, "Confidence and Uncertainty");
  addParagraph(lines, report.confidence_summary || `Overall Creator Agent confidence: ${plan.confidence}`);
  const uncertaintyNotes = plan.nodes.flatMap((node) =>
    node.uncertainty_notes.map((note) => `${node.step_name}: ${note}`),
  );
  addList(lines, uncertaintyNotes, "No task-level uncertainty notes supplied.");

  return lines;
}

function paginate(lines: PdfLine[]): PdfLine[][] {
  const pages: PdfLine[][] = [[]];
  let y = PAGE_HEIGHT - MARGIN_TOP;
  for (const line of lines) {
    const gap = line.gapBefore ?? 2;
    const needed = line.size + gap + 3;
    if (y - needed < MARGIN_BOTTOM) {
      pages.push([]);
      y = PAGE_HEIGHT - MARGIN_TOP;
    }
    pages[pages.length - 1]!.push(line);
    y -= needed;
  }
  return pages;
}

function pageContent(lines: PdfLine[], pageNumber: number, pageCount: number): string {
  let y = PAGE_HEIGHT - MARGIN_TOP;
  const commands: string[] = [];
  for (const line of lines) {
    y -= line.gapBefore ?? 2;
    const font = line.font === "bold" ? "F2" : "F1";
    commands.push(
      `BT /${font} ${line.size} Tf ${MARGIN_X + line.indent} ${y.toFixed(2)} Td (${escapePdfText(line.text)}) Tj ET`,
    );
    y -= line.size + 3;
  }
  commands.push(
    `BT /F1 8 Tf ${MARGIN_X} 32 Td (${escapePdfText(`Page ${pageNumber} of ${pageCount}`)}) Tj ET`,
  );
  return commands.join("\n");
}

function pdfObject(id: number, content: string): string {
  return `${id} 0 obj\n${content}\nendobj\n`;
}

export function createReportPdf(plan: FinalExperimentPlan, exportedAt = new Date().toISOString()): Buffer {
  const pages = paginate(buildReportLines(plan, exportedAt));
  const objects: string[] = [];
  const pageObjectIds: number[] = [];

  objects[0] = pdfObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects[1] = "";
  objects[2] = pdfObject(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects[3] = pdfObject(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  let nextObjectId = 5;
  pages.forEach((page, index) => {
    const pageObjectId = nextObjectId++;
    const contentObjectId = nextObjectId++;
    pageObjectIds.push(pageObjectId);
    const stream = pageContent(page, index + 1, pages.length);
    objects.push(
      pdfObject(
        pageObjectId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      ),
    );
    objects.push(
      pdfObject(
        contentObjectId,
        `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
      ),
    );
  });

  objects[1] = pdfObject(
    2,
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`,
  );

  const objectById = new Map<number, string>();
  for (const object of objects) {
    const match = object.match(/^(\d+) 0 obj/);
    if (match?.[1]) objectById.set(Number(match[1]), object);
  }

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < nextObjectId; id += 1) {
    const object = objectById.get(id);
    if (!object) continue;
    offsets[id] = Buffer.byteLength(pdf, "latin1");
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${nextObjectId}\n`;
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id < nextObjectId; id += 1) {
    pdf += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${nextObjectId} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
