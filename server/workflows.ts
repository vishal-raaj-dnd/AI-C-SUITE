import { callLLM, InitialBriefSchema, CardOutputSchema, ContrarianCardOutputSchema } from './llm';
import { retrieveKb } from './db';
import { webSearch, tableQuery, drLookup } from './tools';

const activeModel = process.env.OPENROUTER_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct:free';

export type InitialBrief = {
  advisor_id: string;
  verdict: string;
  summary: string;
  key_findings: string[];
  assumptions: string[];
};

export type AdvisorCardOutput = {
  advisor_id: string;
  verdict: string;
  body_md: string;
  claims: any[];
  assumptions: string[];
  confidence: string;
  challenges?: any[];
  the_unasked_question?: string;
  trace: any[];
};

// Phase 1: Initial Investigation (reads scoped files and generates initial briefs)
export async function runPhase1(
  advisorId: string,
  scopeTag: string,
  question: string,
  intakeClassification: string,
  traceCollector: any[],
  userId?: string
): Promise<InitialBrief> {
  const startTime = Date.now();

  // 1. Retrieve Scoped KB files
  const chunks = await retrieveKb(question, [scopeTag], userId);
  const chunksText = chunks.map(c => `[ID: ${c.id}]\n${c.text}`).join('\n\n');

  // 2. Lookup past decisions
  const pastDrs = await drLookup(question);
  const drText = pastDrs
    .map(dr => `[ID: DR_${dr.id}] Past Question: ${dr.question}\nChosen Option: ${dr.chosen_option}\nRationale: ${dr.rationale_md}`)
    .join('\n\n');

  const system = `You are the Chief ${advisorId.toUpperCase()} Officer of the company. 
Your goal is to perform a Phase 1: Initial Investigation on the user's question, using ONLY your scoped knowledge base files and past Decision Records.
Do not assume facts not in the data. Provide an Initial Brief containing your verdict, a summary, key findings, and assumptions.`;

  const prompt = `User Question: "${question}"
Intake Classification: ${intakeClassification}

Your Scoped Knowledge Base Chunks:
${chunksText || 'No specific files found in your category.'}

Past Decision Records Found:
${drText || 'No past decisions found.'}

Produce a structured JSON response matching this schema:
{
  "verdict": "Initial stance (e.g. Strongly support, Support with conditions, High risk)",
  "summary": "1-2 sentence summary of your perspective based on the documents.",
  "key_findings": ["Finding 1 (cite source)", "Finding 2"],
  "assumptions": ["Assumption 1"]
}`;

  const res = await callLLM({
    model: 'small',
    system,
    prompt,
    schema: InitialBriefSchema,
    maxTokens: 400,
  });

  const latencyMs = Date.now() - startTime;
  traceCollector.push({
    step_name: 'phase_1_investigation',
    input: { question, scopeTag },
    output: res.parsed,
    model: activeModel,
    tokens_in: res.tokensIn,
    tokens_out: res.tokensOut,
    cost_usd: res.costUsd,
    latency_ms: latencyMs,
  });

  return {
    advisor_id: advisorId,
    verdict: res.parsed.verdict,
    summary: res.parsed.summary,
    key_findings: res.parsed.key_findings,
    assumptions: res.parsed.assumptions,
  };
}

// Phase 2: Coordinated Synthesis (reads user prompt + tools + sharing briefs of other advisors)
export async function runPhase2(
  advisorId: string,
  scopeTag: string,
  question: string,
  initialBriefs: InitialBrief[],
  traceCollector: any[],
  userId?: string
): Promise<AdvisorCardOutput> {
  const startTime = Date.now();

  // 1. Format the shared briefs for context
  const briefsText = initialBriefs
    .map(
      b => `Adviser: Chief ${b.advisor_id.toUpperCase()} Officer
Initial Verdict: ${b.verdict}
Summary: ${b.summary}
Key Findings: ${b.key_findings.join(', ')}
Assumptions: ${b.assumptions.join(', ')}`
    )
    .join('\n\n');

  // 2. Trigger Specialized Tools based on role
  let toolOutput = '';
  let toolCallsUsed: string[] = [];

  if (advisorId === 'cfo') {
    // CFO runs table calculation over P&L CSV
    const cfoChunks = await retrieveKb('P&L data spreadsheet', ['finance'], userId);
    const csvContent = cfoChunks.map(c => c.text).join('\n');
    toolCallsUsed.push('table_query');
    const calcResult = await tableQuery(
      `Calculate margins, cost/revenue impact, or projections for: ${question}`,
      csvContent
    );
    toolOutput = `CFO Calculator Tool Calculation:
Value: ${calcResult.value}
Breakdown: ${calcResult.breakdown}
Source Cited: ${calcResult.sourceRef}`;
  } else if (advisorId === 'cmo') {
    // CMO runs web search for competitors
    toolCallsUsed.push('web_search');
    const searchResult = await webSearch(`${question} marketing strategy competitor conversion benchmarks`);
    toolOutput = `CMO Competitor Search Results:\n` + searchResult.map(r => `[Title: ${r.title}] (URL: ${r.url})\nSnippet: ${r.snippet}`).join('\n\n');
  } else if (advisorId === 'cto') {
    // CTO runs web search for system scaling & feature gating tech
    toolCallsUsed.push('web_search');
    const searchResult = await webSearch(`${question} engineering design gating caching requirements`);
    toolOutput = `CTO Technology Research:\n` + searchResult.map(r => `[Title: ${r.title}] (URL: ${r.url})\nSnippet: ${r.snippet}`).join('\n\n');
  } else {
    toolOutput = 'No specialized tool executed (operations analysis relies on local team capacity data).';
  }

  // 3. Retrieve KB context again for synthesis
  const chunks = await retrieveKb(question, [scopeTag], userId);
  const chunksText = chunks.map(c => `[ID: ${c.id}]\n${c.text}`).join('\n\n');

  const system = `You are the Chief ${advisorId.toUpperCase()} Officer. 
Your goal is Phase 2: Coordinated Synthesis. You have access to your local KB chunks, your specialized tool output, and the Phase 1 Initial Briefs of the other C-level advisors.
Analyze all constraints. For example, if the CTO warns of high engineering complexity or the COO warns of support capacity limits, you MUST reflect that in your final card.
You must compile a CardOutput that contains your final verdict, body (markdown formatted with sections, e.g. ### 1. Analysis, ### 2. Recommendation, ### 3. Risks), claims (with citations referencing exact chunk IDs, web search URLs, or calculations), assumptions, and confidence.`;

  const prompt = `User Question: "${question}"

Phase 1 Shared Briefs from Peer Advisors:
${briefsText}

Your Local Scoped Chunks:
${chunksText}

Tool Executed Output:
${toolOutput}

Generate a final Card Output in JSON:
{
  "verdict": "Bold 1-sentence final decision stance.",
  "body_md": "### 1. Strategic Alignment\\n...\\n### 2. Constraints & Trade-offs\\n...\\n### 3. Recommended Path\\n...",
  "claims": [
    {
      "text": "The claim text citing a source",
      "evidence": { "type": "chunk", "ref": "marketing-strategy.md#chunk_0" }
    }
  ],
  "assumptions": ["We assume support hiring takes 30 days."],
  "confidence": "Grounded"
}`;

  const res = await callLLM({
    model: 'main',
    system,
    prompt,
    schema: CardOutputSchema,
    maxTokens: 800,
  });

  const latencyMs = Date.now() - startTime;
  traceCollector.push({
    step_name: 'phase_2_coordinated_synthesis',
    input: { question, toolCalls: toolCallsUsed },
    output: res.parsed,
    model: activeModel,
    tokens_in: res.tokensIn,
    tokens_out: res.tokensOut,
    cost_usd: res.costUsd,
    latency_ms: latencyMs,
    tool_calls: toolCallsUsed,
  });

  return {
    advisor_id: advisorId,
    verdict: res.parsed.verdict,
    body_md: res.parsed.body_md,
    claims: res.parsed.claims,
    assumptions: res.parsed.assumptions,
    confidence: res.parsed.confidence,
    trace: traceCollector,
  };
}

// Phase 3: Contrarian Devil's Advocate Workflow (Waits for all 4 peer cards, identifies consensus, and critiques)
export async function runContrarian(
  question: string,
  peerCards: AdvisorCardOutput[],
  traceCollector: any[]
): Promise<AdvisorCardOutput> {
  const startTime = Date.now();

  const peerCardsText = peerCards
    .map(
      c => `Advisor: Chief ${c.advisor_id.toUpperCase()} Officer
Verdict: ${c.verdict}
Summary claims: ${c.claims.map(cl => cl.text).join('; ')}
Assumptions: ${c.assumptions.join(', ')}`
    )
    .join('\n\n');

  // Contrarian web searches for failure patterns of the initiative
  const searchResult = await webSearch(`${question} startup failure postmortem common pitfalls mistakes`);
  const toolOutput = `Contrarian Failure Pattern Search:\n` + searchResult.map(r => `[Title: ${r.title}] (URL: ${r.url})\nSnippet: ${r.snippet}`).join('\n\n');

  const system = `You are the CONTRARIAN (Devil's Advocate) member of the board.
Your ONLY job is to disagree, construct the steelmanned counter-case, and attack the emerging consensus of the other 4 advisors.
You are contractually forbidden to agree. Read their compiled final cards, target their weak assumptions and claims, and outline the scenarios where their plans break.
Identify "the unasked question" that could derail the entire project.`;

  const prompt = `User Question: "${question}"

Peer Final Advisor Cards:
${peerCardsText}

Failure Patterns Research:
${toolOutput}

Generate a final Contrarian Card Output in JSON:
{
  "verdict": "Bold 1-sentence counter-objection.",
  "body_md": "### 1. The Core Consensus Blindspot\\n...\\n### 2. Breakdown of Shared Assumptions\\n...\\n### 3. Failure Analogy Cases\\n...\\n### 4. Project Pre-Mortem\\n...",
  "claims": [
    {
      "text": "Acme is risking a 15-22% cannibalization rate without feature gates",
      "evidence": { "type": "web", "ref": "https://..." }
    }
  ],
  "assumptions": ["We assume competitors will match our free offering quickly."],
  "confidence": "Grounded",
  "challenges": [
    {
      "target_advisor": "cfo",
      "target_claim": "The payback period is manageable",
      "severity": "high",
      "attack": "CFO ignores support scaling costs of $45,000 / year."
    }
  ],
  "the_unasked_question": "What happens if our hosting bill triples before we hit positive unit economics?"
}`;

  const res = await callLLM({
    model: 'main',
    system,
    prompt,
    schema: ContrarianCardOutputSchema,
    maxTokens: 1200,
  });

  const latencyMs = Date.now() - startTime;
  traceCollector.push({
    step_name: 'phase_3_contrarian_critique',
    input: { question },
    output: res.parsed,
    model: activeModel,
    tokens_in: res.tokensIn,
    tokens_out: res.tokensOut,
    cost_usd: res.costUsd,
    latency_ms: latencyMs,
  });

  return {
    advisor_id: 'contrarian',
    verdict: res.parsed.verdict,
    body_md: res.parsed.body_md,
    claims: res.parsed.claims,
    assumptions: res.parsed.assumptions,
    confidence: res.parsed.confidence,
    challenges: res.parsed.challenges,
    the_unasked_question: res.parsed.the_unasked_question,
    trace: traceCollector,
  };
}
