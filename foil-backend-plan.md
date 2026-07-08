# Foil — Backend Implementation Plan (Hackathon)

> Companion doc to the Hackathon Build Brief. This covers only the **backend**: orchestrator, data model, tools, and API contract. Frontend (canvas, cross-chat UI) is a separate doc.

---

## 1. Scope for This Plan

Backend must deliver, in order of priority:

1. A working LLM provider wrapper with structured-output validation
2. KB ingest + hybrid retrieval (keyword + vector)
3. Five Advisor workflow pipelines, each as a real sequence of steps (not one prompt)
4. An orchestrator that runs CMO/CFO/CTO/COO in parallel, then Contrarian after
5. Three tools: `web_search`, `table_query`, `dr_lookup`
6. SSE streaming so the frontend can show live progress + token-by-token card text
7. Cross-chat endpoint (multi-turn between 2–3 Advisors)
8. Decision Record save + recall
9. Cost/budget tracking per debate

Everything here is scoped to run **locally** (SQLite, no hosted infra) so it works on a laptop with no setup beyond `.env` keys.

---

## 2. Stack Recap

| Layer | Choice |
|---|---|
| Runtime | Node 20+ / TypeScript |
| Server | Fastify (or Hono) |
| DB | SQLite + Drizzle ORM + FTS5 (keyword) + sqlite-vec (vector) |
| Validation | Zod (shared schemas, imported by both engine and server) |
| LLM | Anthropic API (primary), OpenAI-compatible fallback via base URL swap |
| Web search | Serper or Tavily (pick whichever key you can get fastest) |
| Streaming | Server-Sent Events (SSE) |

---

## 3. Project Structure

```
foil/
├── apps/
│   └── server/
│       ├── routes/
│       │   ├── debates.ts        # POST /debates, GET /debates/:id/stream
│       │   ├── cross-chat.ts     # POST /cross-chat
│       │   ├── canvases.ts       # canvas CRUD
│       │   ├── decision-records.ts
│       │   └── kb.ts             # file upload + ingest
│       ├── services/
│       │   ├── debate-runner.ts  # wires orchestrator -> SSE
│       │   └── kb-ingest.ts
│       └── index.ts
├── packages/
│   ├── shared-types/
│   │   └── schemas.ts            # ALL zod schemas — single source of truth
│   └── engine/
│       ├── providers/
│       │   └── anthropic.ts
│       ├── steps/
│       │   ├── retrieve-kb.ts
│       │   ├── web-search.ts
│       │   ├── table-query.ts
│       │   ├── llm-analyze.ts
│       │   └── compile-card.ts
│       ├── workflows/
│       │   ├── cmo.ts
│       │   ├── cfo.ts
│       │   ├── cto.ts
│       │   ├── coo.ts
│       │   └── contrarian.ts
│       ├── orchestrator.ts
│       └── tracing.ts
├── fixtures/
│   └── demo-company/
│       ├── pl-spreadsheet.csv
│       ├── marketing-strategy.md
│       ├── team-ops.md
│       └── product-roadmap.md
└── foil.db
```

Build `packages/shared-types` and `packages/engine` **first** — the server is a thin layer on top of the engine. This lets you unit-test workflows without a running server.

---

## 4. Data Model (SQLite / Drizzle)

Only the tables the demo actually touches. Skip `card_groups`, multi-tenant fields, and anything cloud-only.

```ts
// workspaces — one row for the whole hackathon demo, hardcode id="demo"
workspaces: { id, name, created_at }

// documents + chunks — the KB
documents: { id, workspace_id, filename, mime, scope_tags: string[], status, created_at }
chunks: { id, document_id, workspace_id, text, embedding: float[], scope_tags: string[], token_count }

// advisors — seed 5 rows at boot from workflows/*.ts, don't build CRUD UI yet
advisors: { id, name, color, workflow_steps_json, rubric, data_scope: string[], tools: string[], enabled }

// canvases — one demo canvas is enough; save/resume is "should have"
canvases: { id, workspace_id, title, layout_json, is_active, updated_at }

// debates — one per user question
debates: { id, workspace_id, canvas_id, question, intake_json, status, cost_usd, created_at }

// cards — one per advisor per debate
cards: {
  id, debate_id, canvas_id, advisor_id,
  verdict, body_md,
  claims_json,        // [{ text, evidence: {type: 'chunk'|'web'|'dr'|'calc'|'speculation', ref} }]
  assumptions_json,   // string[]
  confidence,         // 'grounded' | 'partial' | 'speculation'
  workflow_trace_id,
  position_x, position_y, state, created_at
}

// connections + cross_chats
connections: { id, canvas_id, card_ids: string[], created_at }
cross_chats: {
  id, connection_id, canvas_id, user_prompt,
  transcript_json,    // [{ advisor_id, turn, text }]
  merged_card_id, created_at
}

// decision_records
decision_records: {
  id, workspace_id, debate_id, canvas_id, question,
  chosen_option, rationale_md, dissents_json, assumptions_json,
  review_date, created_at
}

// workflow_traces — the "prove it's real" artifact
workflow_traces: {
  id, debate_id, advisor_id,
  steps_json: [{ step_name, input, output, model, tokens_in, tokens_out, cost_usd, latency_ms, tool_calls: [] }],
  total_cost_usd, total_latency_ms, created_at
}
```

**Seed on boot:** insert the 5 default advisors from static config, and ingest `fixtures/demo-company/*` into the KB with correct `scope_tags` so the demo has data from second one.

---

## 5. Shared Types (the contract everything else depends on)

Build this before anything else touches the DB or the LLM.

```ts
// packages/shared-types/schemas.ts
import { z } from "zod";

export const Confidence = z.enum(["grounded", "partial", "speculation"]);

export const Claim = z.object({
  text: z.string(),
  evidence: z.object({
    type: z.enum(["chunk", "web", "dr", "calculation", "speculation"]),
    ref: z.string().optional(),      // chunk_id / url / dr_id / calc_id
  }),
});

export const CardOutput = z.object({
  verdict: z.string().max(160),
  body_md: z.string(),
  claims: z.array(Claim),
  assumptions: z.array(z.string()),
  confidence: Confidence,
});

export const IntakeResult = z.object({
  classification: z.string(),
  entities: z.array(z.string()),
  time_horizon: z.string().optional(),
});

export const WorkflowStepTrace = z.object({
  step_name: z.string(),
  input: z.unknown(),
  output: z.unknown(),
  model: z.string().optional(),
  tokens_in: z.number().optional(),
  tokens_out: z.number().optional(),
  cost_usd: z.number().optional(),
  latency_ms: z.number(),
  tool_calls: z.array(z.string()).optional(),
});

export const CrossChatTurn = z.object({
  advisor_id: z.string(),
  turn: z.number(),
  text: z.string(),
});
```

`CardOutput` is the contract every Advisor's `compile` step must return. Validate it with `.safeParse()`; on failure, do **one** auto-repair retry (re-prompt the model with the validation error), then fail the card gracefully rather than crashing the debate.

---

## 6. LLM Provider Wrapper

Single function every step calls. Keep it boring and centralized so cost tracking is automatic.

```ts
// packages/engine/providers/anthropic.ts
type CallOpts = {
  model: "small" | "main";     // map to actual model strings in config
  system?: string;
  prompt: string;
  schema?: z.ZodType;          // if set, force structured JSON output + validate
  maxTokens?: number;
};

async function callLLM(opts: CallOpts): Promise<{
  text: string;
  parsed?: unknown;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
}> { /* ... */ }
```

- Use a **cheap/small model** for steps 1 (intake extraction) across all Advisors — these are simple extraction tasks.
- Use the **main model** for analysis + compile steps where reasoning quality matters.
- Every call's cost gets added to `debates.cost_usd` immediately — this is what powers the budget cap and the cost meter (if you build it).
- Hard cap: if `debates.cost_usd` exceeds the configured limit mid-run, stop starting new steps and mark the debate `status: 'budget_exceeded'`.

---

## 7. Tools

### `web_search(query: string) -> SearchResult[]`
Thin wrapper around Serper/Tavily. Returns top 3–5 results as `{ title, snippet, url }`. Cache identical queries within a single debate run (CMO and Contrarian may generate overlapping queries).

### `table_query(question: string, csvChunkRef: string) -> { value, breakdown, sourceRef }`
For the CFO's calculator step. Simplest viable version for a hackathon:
1. Load the referenced CSV chunk (already parsed into rows during ingest).
2. Send the question + a compact JSON representation of the rows to the LLM with an explicit instruction: *"Return only a JSON object with `calculation`, `result`, and `assumptions_used`. Do not guess numbers not present in the data."*
3. Do **not** build a full sandboxed pandas evaluator under time pressure — an LLM-computed-and-shown-its-work approach is good enough for a demo and much faster to build. Upgrade to real computation only if time allows (Should/Stretch tier).

### `dr_lookup(scopeTags: string[], query: string) -> DecisionRecord[]`
Just a KB retrieval scoped to `decisions` tag, reusing the same hybrid retrieval function as `retrieve_kb`. Not a separate system.

All three tools log their raw output into `workflow_traces.steps_json[].tool_calls` — this is what you point at when a judge asks "prove this isn't fake."

---

## 8. Retrieval (KB)

Keep it simple:

1. **Ingest:** on file upload, chunk into ~800 tokens / 15% overlap, embed each chunk, store in `chunks` with `scope_tags`.
2. **Retrieve:** given a query + scope filter, run:
   - FTS5 keyword search (BM25) restricted to matching `scope_tags`
   - Vector cosine similarity search, same restriction
   - Merge with reciprocal rank fusion, return top 5–8 chunks
3. Every chunk returned carries its `id` so cards can cite `chunk_id`.

Don't over-engineer this — a single `retrieveKb(query, scopeTags)` function used by every Advisor's step 2 is enough.

---

## 9. Workflow Definition Format

Every Advisor is a plain array of step objects executed in order. This is what makes "it's a real workflow, not a persona" literally true and inspectable.

```ts
// packages/engine/workflows/cfo.ts
export const cfoWorkflow: WorkflowStep[] = [
  {
    name: "extract_financial_dimensions",
    run: async (ctx) => callLLM({ model: "small", prompt: buildExtractPrompt(ctx.userPrompt), schema: FinancialBrief }),
  },
  {
    name: "retrieve_company_financials",
    run: async (ctx) => retrieveKb(ctx.stepOutput("extract_financial_dimensions"), ["finance", "general"]),
  },
  {
    name: "quantitative_analysis",
    run: async (ctx) => tableQuery(ctx.userPrompt, ctx.findCsvChunk()),
  },
  {
    name: "risk_and_scenario_analysis",
    run: async (ctx) => callLLM({ model: "main", prompt: buildRiskPrompt(ctx.allPriorOutputs()) }),
  },
  {
    name: "compile_card",
    run: async (ctx) => callLLM({ model: "main", prompt: buildCompilePrompt(ctx.allPriorOutputs()), schema: CardOutput }),
  },
];
```

`ctx` gives each step read access to prior step outputs and the shared intake result. This is the reusable shape for all 5 Advisors — CMO/CTO/COO/Contrarian follow the same pattern with different prompts and tool choices per the PRD (§5.1–5.5).

**Build order recommendation:** implement CFO first (it exercises the calculator tool, the hardest path), then clone the pattern.

---

## 10. Orchestrator

```ts
// packages/engine/orchestrator.ts
async function runDebate(debateId: string, question: string, emit: EventEmitter) {
  const intake = await runIntake(question);           // shared, once
  emit("intake_complete", intake);

  const parallelAdvisors = ["cmo", "cfo", "cto", "coo"];
  const cardPromises = parallelAdvisors.map(id =>
    runWorkflow(id, workflows[id], { question, intake }, emit)
  );
  const peerCards = await Promise.all(cardPromises);   // each resolves + emits as it finishes

  const contrarianCard = await runWorkflow("contrarian", workflows.contrarian,
    { question, intake, peerCards }, emit);

  emit("debate_complete", { cards: [...peerCards, contrarianCard] });
}
```

Key behaviors:
- `runWorkflow` emits a `step_progress` event before each step and a `card_streaming` event (token-by-token) during the `compile_card` step only — intermediate steps are logged to `workflow_traces` but not streamed to the UI.
- Advisors resolve independently — CMO might finish before CTO. Emit each card the moment it's ready; don't wait for all four to batch them.
- Contrarian's `run` call literally takes `peerCards` as input — enforce this in code, not just in the prompt, so it structurally cannot start early.

---

## 11. API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/kb/upload` | Upload + ingest a file into the KB |
| `POST` | `/debates` | Start a debate: `{ question, canvas_id }` → returns `debate_id` immediately |
| `GET` | `/debates/:id/stream` | SSE stream of `step_progress`, `card_streaming`, `card_complete`, `debate_complete` events |
| `GET` | `/debates/:id` | Fetch final state (all cards + traces) — used on reload |
| `POST` | `/cross-chat` | `{ card_ids: string[], user_prompt: string }` → runs the multi-turn exchange, returns transcript |
| `POST` | `/cross-chat/:id/merge` | Generate the merged card from a cross-chat transcript |
| `POST` | `/decision-records` | Save a Decision Record (pre-filled from a debate, user-edited) |
| `GET` | `/decision-records` | List, for the recall demo beat |
| `GET` / `POST` | `/canvases`, `/canvases/:id` | Canvas save/resume (Should-Have tier) |

SSE event payloads should validate against `shared-types` schemas so the frontend never gets a shape surprise mid-demo.

---

## 12. Cross-Chat Endpoint Logic

```ts
async function runCrossChat(cardIds: string[], userPrompt: string) {
  const cards = await loadCards(cardIds);              // 2 or 3 parent cards, full context
  const transcript: CrossChatTurn[] = [];
  const maxTurns = 6;

  for (let i = 0; i < maxTurns; i++) {
    const speaker = cards[i % cards.length];
    const reply = await callLLM({
      model: "main",
      system: buildCrossChatSystemPrompt(speaker, cards, userPrompt),
      prompt: buildTurnPrompt(transcript, userPrompt),
    });
    transcript.push({ advisor_id: speaker.advisor_id, turn: i, text: reply.text });
  }

  return transcript;
}
```

Rules to enforce in code, not just prompt text (per PRD §6.3):
- Hard cap at 6 turns — loop bound, not a suggestion to the model.
- Round-robin order for 3-way chats: A → B → C → A → B → C.
- Every turn must still cite evidence — reuse the same `Claim` schema; reject/retry a turn with zero citations if you have time to enforce it, otherwise just prompt for it.

---

## 13. Decision Record Flow

1. After a debate (or a cross-chat merge), expose a "Generate Decision Record" action.
2. A synthesizer call reads all cards + any cross-chat transcripts, and produces a pre-filled `{ chosen_option, rationale_md, dissents, assumptions, review_date }`.
3. User can edit before saving (skip the edit UI for hackathon speed if needed — auto-save is fine for a demo).
4. On save: embed the DR into the KB under `scope_tags: ["decisions"]` so future debates' `retrieve_company_context` steps pick it up automatically. **This is the callback moment** — run a second debate live and show an Advisor citing the DR from the first.

---

## 14. Build Order Checklist (backend only)

```
[ ] shared-types schemas compile
[ ] SQLite schema + Drizzle migrations run
[ ] KB ingest: upload -> chunk -> embed -> store, with fixture docs pre-loaded
[ ] retrieveKb() returns real chunks for a scoped query
[ ] LLM provider wrapper: structured output + cost tracking working
[ ] CFO workflow end-to-end (hardest path) -> produces valid CardOutput
[ ] CMO, CTO, COO workflows cloned from CFO pattern
[ ] Contrarian workflow, gated on peerCards
[ ] Orchestrator runs all 5, emits SSE events in order
[ ] /debates + /debates/:id/stream wired end-to-end
[ ] Cross-chat endpoint: 2-way, 6-turn cap, citations present
[ ] Merged card generation from cross-chat
[ ] Decision Record save + embed into KB
[ ] Second debate demonstrably cites the first DR
[ ] Budget cap: debate halts cleanly if cost_usd exceeds limit
```

Stop and verify each checked box produces real output (open the DB, read the trace) before moving to the next — don't let the "it streams tokens in the UI" excitement hide a workflow that's secretly one LLM call.

---

## 15. Things to Deliberately Cut for Time

- Real sandboxed calculator (`table_query`) — LLM-computed-with-shown-work is fine
- Multi-tenant / auth — single hardcoded `workspace_id = "demo"`
- Postgres path, BullMQ, connectors — cloud-only, not in scope at all
- Card grouping, pin, feed-view — frontend concerns anyway, not backend
- Full retry/backoff infrastructure on LLM calls — one retry on validation failure is enough

Keep the corner-cutting here, not in the five workflows or the citation requirement — those are the whole pitch.
