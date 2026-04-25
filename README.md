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

## Roadmap (next milestones)

- [ ] Wire `/api/chat` to a model with streaming responses
- [ ] Add a real conversation thread view (assistant prose without bubbles, per §6.1)
- [ ] Reference search tool (PubMed / Semantic Scholar)
- [ ] Experiment timeline builder
- [ ] Reagent budgeting calculator
- [ ] Theme toggle (light / dark)
- [ ] Lab and personal settings pages
