# LabPilot

> An AI co-pilot for planning biology lab experiments — references, timelines, budgets, and protocols, all in one calm workspace.

This repo is an **npm workspaces** monorepo with two packages:

| Package | Stack | Port |
|---|---|---|
| `frontend` | React 18 · TypeScript · Vite · Tailwind CSS · shadcn-style primitives · lucide-react | `5173` |
| `backend`  | Node.js · TypeScript · Express · Multer (uploads) | `4000` |

The visual design follows [`design_guide.md`](./design_guide.md) — Claude.ai's "warm minimalism" aesthetic mapped to CSS variables in `frontend/src/index.css` and exposed to Tailwind via `frontend/tailwind.config.ts`.

---

## Quick start

```bash
# from the repo root
npm install

# copy the backend env template (optional — defaults are sane)
cp backend/.env.example backend/.env

# start frontend + backend together
npm run dev
```

- Frontend → http://localhost:5173
- Backend  → http://localhost:4000

The Vite dev server proxies `/api/*` to the backend, so the frontend can call `/api/chat` directly with no CORS friction.

---

## Agent Integration Modes

LabPilot now runs with missing-service fallbacks so the hackathon demo does not break:

- **Full mode**: `OPENAI_API_KEY` and `DATABASE_URL` are configured, Supabase is available, and an optional generic research API can be used. Agent reasoning uses server-side OpenAI calls with schema validation, then persists project and plan data when the database is available.
- **Partial mode**: OpenAI and the database are configured, but `GENERIC_RESEARCH_API_URL` / `GENERIC_RESEARCH_API_KEY` are missing. Agent reasoning still uses OpenAI, while research sources are clearly labeled demo sources.
- **Local fallback mode**: OpenAI or external services are missing or failing. Deterministic local fallback agents generate extraction, novelty, plan, QA, editor, and risk responses with warnings.
- **In-memory dev mode**: `DATABASE_URL` is missing. Projects are stored in memory and reset on server restart.

Every JSON endpoint returns relevant `warnings`. The frontend shows these as a small non-blocking banner, and fallback research entries are labeled as demo sources.

### Backend Environment

Server-only secrets belong in `backend/.env` or Vercel server environment variables. Do not prefix server secrets with `VITE_`.

```bash
OPENAI_API_KEY=sk-...
OPENAI_HIGH_MODEL=gpt-5.5
OPENAI_MEDIUM_MODEL=gpt-5.4-mini
OPENAI_SMALL_MODEL=gpt-5.4-nano
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

DATABASE_URL=postgres://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

GENERIC_RESEARCH_API_URL=https://your-normalized-provider/search
GENERIC_RESEARCH_API_KEY=...
TAVILY_API_KEY=tvly-...
FRONTEND_URL=http://localhost:5173
```

Frontend deployment can set:

```bash
VITE_API_BASE_URL=https://your-backend-or-vercel-domain
```

Leave it empty for same-origin `/api` calls.

### Supabase Setup

1. Create a Supabase project.
2. Copy the pooled Postgres connection string into `DATABASE_URL`.
3. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for optional Storage support.
4. Run the SQL migration in `supabase/migrations/20260426000000_labpilot_service_layer.sql`.
5. If `pgvector` is unavailable, keep embedding columns null; LabPilot uses keyword retrieval fallback.
6. Supabase Storage is optional. If configured, use a private bucket named `labpilot-files`.

### Demo Checklist

1. Install dependencies with `npm install`.
2. Create `backend/.env`.
3. Add an OpenAI key if available.
4. Create a Supabase project if persistent DB is desired.
5. Run migrations.
6. Add env vars to Vercel.
7. Deploy.
8. Test `GET /api/health`.
9. Submit a demo hypothesis.
10. Generate the graph.
11. Test QA.
12. Test editor patch preview and apply.
13. Test risk analyzer.
14. Test PDF export.

### Run them separately

```bash
npm run dev:frontend   # vite
npm run dev:backend    # tsx watch
```

### Production build

```bash
npm run build           # builds both
npm --workspace backend run start   # runs compiled backend
npm --workspace frontend run preview
```

### Vercel Deployment

`vercel.json` builds the Vite frontend and routes `/api/*` to the Express serverless wrapper in `api/index.ts`. Add server-only variables (`OPENAI_API_KEY`, `DATABASE_URL`, Supabase keys, research API key) in Vercel project settings without the `VITE_` prefix. Set `VITE_API_BASE_URL` only when the frontend needs to call a separate backend origin.

---

## Project layout

```
Hack_Nations_5th_Edition/
├── package.json                  # workspaces root, dev:all script
├── design_guide.md               # design specification (source of truth)
├── frontend/
│   ├── index.html
│   ├── tailwind.config.ts        # tokens wired to CSS variables
│   ├── vite.config.ts            # /api proxy → :4000
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── index.css             # design tokens (:root + [data-theme="dark"])
│       ├── lib/
│       │   ├── api.ts            # sendPrompt() — multipart fetch
│       │   ├── utils.ts          # cn(), formatBytes()
│       │   └── useAutoResizeTextarea.ts
│       ├── components/
│       │   ├── LogoMark.tsx
│       │   ├── SidebarRail.tsx   # implicit sidebar (top-left brand + bottom-left settings)
│       │   ├── PromptInput.tsx   # textarea + paperclip attach + send
│       │   ├── SuggestionChips.tsx
│       │   └── ui/
│       │       └── textarea.tsx  # shadcn primitive
│       └── pages/
│           └── LandingPage.tsx
└── backend/
    ├── tsconfig.json
    ├── .env.example              # PORT, UPLOAD_DIR, MAX_UPLOAD_MB
    └── src/
        ├── index.ts              # Express bootstrap
        ├── env.ts
        ├── lib/uploads.ts        # multer disk storage
        └── routes/
            ├── health.ts         # GET  /api/health
            └── chat.ts           # POST /api/chat (multipart)
```

---

## API

### `GET /api/health`

```json
{ "ok": true, "service": "labpilot-backend", "uptime": 12.34 }
```

### `POST /api/chat`

Multipart form-data:

| Field   | Type        | Required | Notes |
|---------|-------------|----------|-------|
| `text`  | string      | yes¹     | The prompt body. |
| `files` | File[]      | no       | Up to 10 attachments, default ≤ 25 MB each. |

¹ Required when no `files` are attached.

Response (`202 Accepted`):

```json
{
  "ok": true,
  "conversationId": "uuid",
  "receivedAt": "ISO-8601",
  "message": "<original text>",
  "attachments": [{ "id": "uuid", "name": "protocol.pdf", "size": 12345 }]
}
```

> The chat handler is intentionally a stub — it accepts the prompt + files and returns an opaque conversation id. Wiring it to a model (Claude / Bedrock / etc.) is the next step.

---

## Design tokens

All visual tokens come from `design_guide.md` §14 and live as CSS variables in `frontend/src/index.css`. Tailwind reads them via `tailwind.config.ts`:

```tsx
<div className="bg-bg-primary text-text-primary border border-[color:var(--border-default)]">…</div>
```

### Dark mode

```html
<html data-theme="dark">…</html>
```

The token set automatically swaps. No component changes required.

### Accent rules

The terracotta `--accent` (`#C96442`) is used **sparingly** — primary CTAs, the logo mark, and focus rings only. Per design-guide §13.4, never as a page background or decorative gradient.

---

## File attachments (frontend)

The paperclip button in `PromptInput.tsx` opens a hidden `<input type="file" multiple>`. Selected files render as removable chips above the textarea, then ride along with the prompt as part of a single `multipart/form-data` POST.

Supported MIME types out of the box: `pdf, doc, docx, txt, md, csv, tsv, xlsx, xls, json, png, jpg, jpeg, gif, webp`. Adjust the `accept` attribute in `PromptInput.tsx` if you need more.

---

## Creator Agent

The Creator Agent is the central planning engine of LabPilot. It takes the user’s hypothesis and combines it with related papers, lab protocols, internal documents, lab inventory, previous experiments, and feedback-based learnings.

The Creator Agent now produces an Experiment Calendar Plan: a scheduled list of rich experiment tasks placed into day buckets and weeks. It evaluates which previous procedures are relevant, adapts them to the current lab context, applies lessons from past experiments, checks resources, identifies missing materials or equipment, estimates time and cost, and assigns each task a `scheduled_date` or `day_offset`.

The final output is a calendar-based schedule with `tasks`, `calendar_layout`, and a stats report. The frontend displays one week at a time with seven day columns. Each day column shows the date and task cards for that day. New generated plans do not require parent IDs, child IDs, or edges.

The Creator Agent also generates a project stats report. This report summarizes the total project duration, estimated budget, required people, equipment, materials, purchase list, tasks, milestones, validation criteria, risks, domain experts, citations, and relevant learnings from previous experiments.

This makes the Creator Agent the main bridge between research knowledge and executable experiment planning. It turns unstructured scientific context and reusable paper-based pre-plans into a practical, visual, lab-specific project plan.

Implementation entry points:

- `backend/src/lib/creatorAgent.ts` contains the deterministic Creator Agent pipeline and compatibility adapter.
- `backend/src/lib/calendarLayout.ts` builds week/day buckets and task positions.
- `backend/src/lib/calendarValidation.ts` validates scheduled tasks and calendar layout.
- `backend/src/lib/creatorAgentSchedule.ts` assigns relative days, dates, and week groups.
- `POST /api/creator-agent/run` runs the agent directly; `POST /api/projects/:id/generate` runs it for a researched project.
- `GET /api/plans/:plan_id`, `/stats`, and `/calendar` expose the final plan, report, and calendar task data.

---

## Question-Answer Agent

The Question-Answer Agent is a contextual assistant embedded in the Experiment Calendar. It appears as a toggleable right sidebar that allows scientists to ask natural-language questions about the current plan.

The agent has access to the current calendar plan, scheduled tasks, calendar layout, stats report, relevant citations, lab inventory, lab protocols, previous experiments, and feedback-based lesson cards. It answers questions about dates, weeks, resources, budget, risks, validation criteria, citations, and why tasks are scheduled on particular days.

Unlike the Creator Agent, the Question-Answer Agent does not create the final experiment plan. Its role is to explain and inspect the current schedule. If the scientist asks why a task takes a certain amount of time, what happens in week 2, which equipment is missing before Thursday, or which paper supports a step, the agent retrieves the relevant context and answers in natural language.

This makes the calendar view more interactive and useful. Instead of manually inspecting every task card, the scientist can ask direct questions and receive grounded explanations based on the schedule and supporting data.

---

## Risk Analyzer Agent

The Risk Analyzer Agent reviews the current experiment calendar and identifies the biggest threats to successful execution. It analyzes scheduled tasks, day/week placement, calendar layout, project stats report, lab inventory, previous experiments, citations, and feedback-based lesson cards.

The agent looks for risks such as overloaded days or weeks, missing equipment, missing materials, underestimated timelines, budget uncertainty, people bottlenecks, weak validation criteria, long tasks without buffer, and warnings learned from previous scientist feedback. It ranks these risks from most dangerous to least dangerous and explains why each one matters.

The Risk Analyzer Agent is accessible from both the calendar view and the report view through an “Analyze Risks” button. When triggered, it opens a closeable overlay popup that summarizes the overall project risk level and lists the ranked risks with explanations, affected tasks, possible consequences, and mitigation suggestions.

This feature helps scientists quickly understand where the experiment is most likely to fail, be delayed, exceed budget, or require additional resources before they start execution.

Implementation entry points:

- `POST /api/plans/:plan_id/risk-analysis` returns a ranked `RiskAnalysisResult` for the current edited plan.
- `backend/src/lib/riskAnalyzerAgent.ts` contains deterministic risk detection, scoring, ranking, and mitigation generation.
- `frontend/src/components/risk/RiskAnalyzerModal.tsx` renders the shared calendar/report overlay.

---

## Feedback Learning Mechanism

The Feedback Learning Mechanism allows LabPilot to improve from scientist corrections. After the Creator Agent generates an experiment calendar, the scientist can edit scheduled tasks, move tasks to different dates, adjust duration, resources, budget, validation criteria, or risks. Every meaningful edit is logged as a structured Plan Change Event. The system stores the original AI-generated value, the corrected user value, the affected task or schedule field, and the reason for the change when available.

These raw changes are then converted into reusable Lesson Cards. A Lesson Card generalizes the correction so it can be used in future similar experiments. For example, if a scientist changes a task duration from two days to five days because a shared incubator creates delays, LabPilot stores that as a lab-specific timeline adjustment. The next time the Creator Agent plans a similar experiment, it can retrieve that lesson and produce a more realistic timeline.

This mechanism makes learning auditable and practical. The system does not need to retrain the underlying language model after every edit. Instead, it builds a structured memory of corrections, scheduling constraints, bottlenecks, missing resources, and improved planning rules. The Creator Agent then retrieves and applies this memory during future planning.

The result is a feedback loop: the Creator Agent creates a plan, the scientist corrects the plan, LabPilot stores the correction as reusable knowledge, and future plans become more accurate.

---

## Benchmark Evaluation System

The Benchmark Evaluation System allows researchers to grade the quality of generated experiment plans. After the Creator Agent creates a calendar-based plan, the researcher can open an evaluation popup from the Calendar View and score the plan from 0 to 100 across multiple categories: timing estimate accuracy, task scheduling logic, procedure correctness, budget accuracy, equipment and personnel accuracy, citation quality, and validation criteria quality.

The system stores both the overall average benchmark score and the individual category scores. The researcher can also submit written feedback describing what was good, wrong, missing, unrealistic, or useful. This written feedback is stored as benchmark insight data and can be retrieved by the Creator Agent during future planning.

A separate Benchmark Dashboard shows all evaluation results over time as a bar chart. The x-axis represents trial order or time, and the y-axis represents the overall score from 0 to 100. Clicking a bar opens the evaluation details and links back to the report for the plan that was graded.

This creates a measurable improvement loop: the Creator Agent generates a plan, the researcher grades it, the benchmark score is stored, feedback is converted into reusable insight, and future Creator Agent runs can use those insights to produce better plans.

Implementation entry points:

- `POST /api/plans/:plan_id/evaluations` saves a benchmark evaluation for the current calendar plan.
- `GET /api/benchmark/evaluations` returns evaluations in chronological order.
- `GET /api/benchmark/summary` returns aggregate benchmark performance metrics.
- `GET /api/benchmark/insights/relevant` returns reusable benchmark insights for Creator Agent context.
- `frontend/src/components/benchmark/BenchmarkEvaluationModal.tsx` renders the Calendar View evaluation popup.
- `frontend/src/pages/BenchmarkDashboardPage.tsx` renders the benchmark dashboard.

---

## Plan Editor Agent

The Plan Editor Agent is a contextual editing assistant inside the Experiment Calendar. It uses the same right-side chat interface as the Question-Answer Agent, but unlike the Q&A Agent, it can safely modify the current experiment plan.

When a scientist gives an instruction such as moving a task to Friday, changing a task duration, adding equipment, increasing the budget, adding validation criteria, splitting a task, or pushing a week’s work back, the Editor Agent interprets the request and converts it into a small structured plan patch. The patch specifies exactly which task, schedule field, resource, or report section will change.

The Editor Agent is designed to be conservative. It does not regenerate or overwrite the entire plan. It only applies targeted edits that match the scientist’s request. Before applying risky changes, such as deleting tasks or shifting many scheduled steps, it asks for confirmation. It validates task targets, dates, costs, durations, and whether the edit stays within the current plan.

Every meaningful edit is passed into the Feedback Learning Mechanism. This means the system logs the old value, the new value, the affected task, and the reason for the change when available. These edits can become Lesson Cards, allowing the Creator Agent to avoid similar mistakes in future experiment plans.

The Plan Editor Agent therefore turns natural-language scientist feedback into safe, auditable, structured plan updates.

---

## Roadmap (next milestones)

- [ ] Wire `/api/chat` to a model with streaming responses
- [ ] Add a real conversation thread view (assistant prose without bubbles, per §6.1)
- [ ] Reference search tool (PubMed / Semantic Scholar)
- [ ] Experiment timeline builder
- [ ] Reagent budgeting calculator
- [ ] Theme toggle (light / dark)
- [ ] Lab and personal settings pages
