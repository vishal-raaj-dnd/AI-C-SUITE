import { callLLM, IntakeResultSchema } from './llm';
import { runPhase1, runPhase2, runContrarian, InitialBrief, AdvisorCardOutput } from './workflows';
import { db } from './db';
import EventEmitter from 'events';

export class DebateOrchestrator extends EventEmitter {
  private debateId: string;
  private question: string;
  private userId: string;
  private totalCostUsd: number = 0;

  constructor(debateId: string, question: string, userId?: string) {
    super();
    this.debateId = debateId;
    this.question = question;
    this.userId = userId || 'default_user';
  }

  async run() {
    try {
      this.emit('status', { step: 'intake', message: 'Classifying decision and extracting entities...' });
      
      // 1. Shared Intake
      const intakeStartTime = Date.now();
      const intakeRes = await callLLM({
        model: 'small',
        system: `You are an intake coordinator. Parse the user's business query.
Extract the classification (e.g. Freemium Strategy, Pricing Strategy, Hiring), any key entities (company names, tools, concepts), and the time horizon if mentioned.`,
        prompt: `Parse this question: "${this.question}"`,
        schema: IntakeResultSchema,
      });
      this.totalCostUsd += intakeRes.costUsd;
      const intake = intakeRes.parsed;
      
      this.emit('status', { step: 'intake_done', data: intake });
      await db.run(
        `UPDATE debates SET status = 'running', cost_usd = ? WHERE id = ?`,
        [this.totalCostUsd, this.debateId]
      );

      // Save initial trace node
      const intakeTrace = {
        step_name: 'shared_intake',
        input: { question: this.question },
        output: intake,
        model: 'gemini-2.5-flash',
        tokens_in: intakeRes.tokensIn,
        tokens_out: intakeRes.tokensOut,
        cost_usd: intakeRes.costUsd,
        latency_ms: Date.now() - intakeStartTime,
      };

      // 2. Run Phase 1 Parallel Investigation (CMO, CFO, CTO, COO)
      this.emit('status', { step: 'phase1_start', message: 'Advisors conducting independent research...' });

      const parallelAdvisors = [
        { id: 'cmo', tag: 'marketing' },
        { id: 'cfo', tag: 'finance' },
        { id: 'cto', tag: 'tech' },
        { id: 'coo', tag: 'ops' },
      ];

      const phase1Traces: Record<string, any[]> = { cmo: [intakeTrace], cfo: [intakeTrace], cto: [intakeTrace], coo: [intakeTrace] };
      
      const phase1Promises = parallelAdvisors.map(async (adv) => {
        try {
          this.emit('status', { step: `phase1_${adv.id}_running`, message: `Chief ${adv.id.toUpperCase()} Officer reading KB files...` });
          const brief = await runPhase1(
            adv.id,
            adv.tag,
            this.question,
            intake.classification,
            phase1Traces[adv.id],
            this.userId
          );
          this.emit('status', { step: `phase1_${adv.id}_done`, brief });
          return brief;
        } catch (err) {
          console.error(`Advisor ${adv.id} failed in Phase 1:`, err);
          return {
            advisor_id: adv.id,
            verdict: 'Error',
            summary: `Failed to compile initial brief due to an LLM/KB error.`,
            key_findings: [],
            assumptions: [],
          };
        }
      });

      const initialBriefs = await Promise.all(phase1Promises);
      this.emit('status', { step: 'phase1_complete', briefs: initialBriefs });

      // Update debate cost
      const phase1Cost = phase1Traces.cmo.concat(phase1Traces.cfo, phase1Traces.cto, phase1Traces.coo)
        .reduce((sum, node) => sum + (node.cost_usd || 0), 0);
      this.totalCostUsd += phase1Cost;
      await db.run(`UPDATE debates SET cost_usd = ? WHERE id = ?`, [this.totalCostUsd, this.debateId]);

      // 3. Run Phase 2 Coordinated Synthesis (CMO, CFO, CTO, COO in parallel)
      this.emit('status', { step: 'phase2_start', message: 'Advisors coordinating perspectives and executing tools...' });

      const phase2Promises = parallelAdvisors.map(async (adv) => {
        try {
          // CFO runs calculator tool, others run web search or local review
          const actionText = adv.id === 'cfo' ? 'calculating margins' : adv.id === 'coo' ? 'mapping ops dependencies' : 'searching web';
          this.emit('status', { step: `phase2_${adv.id}_running`, message: `Chief ${adv.id.toUpperCase()} Officer ${actionText}...` });

          const finalCard = await runPhase2(
            adv.id,
            adv.tag,
            this.question,
            initialBriefs.filter(b => b.advisor_id !== adv.id), // Pass briefs of the OTHER 3 advisors
            phase1Traces[adv.id],
            this.userId
          );
          
          this.emit('status', { step: `phase2_${adv.id}_done`, card: finalCard });
          return finalCard;
        } catch (err) {
          console.error(`Advisor ${adv.id} failed in Phase 2:`, err);
          return {
            advisor_id: adv.id,
            verdict: 'Technical Error',
            body_md: `### Analysis\nAn error occurred during coordinated synthesis.`,
            claims: [],
            assumptions: [],
            confidence: 'Speculation',
            trace: phase1Traces[adv.id],
          };
        }
      });

      const peerCards = await Promise.all(phase2Promises);
      
      // Update debate cost
      const phase2Cost = peerCards.reduce((sum, c) => sum + c.trace.reduce((s, n) => s + (n.cost_usd || 0), 0), 0) - phase1Cost;
      this.totalCostUsd += phase2Cost;
      await db.run(`UPDATE debates SET cost_usd = ? WHERE id = ?`, [this.totalCostUsd, this.debateId]);

      // Save peer cards into DB
      for (const card of peerCards) {
        await db.run(`
          INSERT INTO cards (id, debate_id, advisor_id, verdict, body_md, claims_json, assumptions_json, confidence, trace_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `${this.debateId}_${card.advisor_id}`,
          this.debateId,
          card.advisor_id,
          card.verdict,
          card.body_md,
          JSON.stringify(card.claims),
          JSON.stringify(card.assumptions),
          card.confidence,
          JSON.stringify(card.trace),
          new Date().toISOString()
        ]);
      }

      // 4. Run Contrarian (Devil's Advocate)
      this.emit('status', { step: 'contrarian_start', message: 'Contrarian analyzing final consensus & compiling critique...' });
      const contrarianTrace: any[] = [intakeTrace];
      const contrarianCard = await runContrarian(this.question, peerCards, contrarianTrace);
      
      const contrarianCost = contrarianTrace.reduce((sum, n) => sum + (n.cost_usd || 0), 0);
      this.totalCostUsd += contrarianCost;

      // Save Contrarian card
      await db.run(`
        INSERT INTO cards (id, debate_id, advisor_id, verdict, body_md, claims_json, assumptions_json, confidence, trace_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        `${this.debateId}_contrarian`,
        this.debateId,
        'contrarian',
        contrarianCard.verdict,
        contrarianCard.body_md,
        JSON.stringify(contrarianCard.claims),
        JSON.stringify(contrarianCard.assumptions),
        contrarianCard.confidence,
        JSON.stringify(contrarianCard.trace),
        new Date().toISOString()
      ]);

      // Save all advisor traces in a single global trace record in the DB
      const finalTraces = [...peerCards, contrarianCard].map(c => ({
        advisor_id: c.advisor_id,
        steps: c.trace
      }));

      await db.run(`
        UPDATE debates 
        SET status = 'complete', cost_usd = ? 
        WHERE id = ?
      `, [this.totalCostUsd, this.debateId]);

      // Write traces into a JSON file or trace table if we want, or just emit it
      this.emit('status', { 
        step: 'debate_complete', 
        cards: [...peerCards, contrarianCard],
        traces: finalTraces,
        total_cost: this.totalCostUsd 
      });

    } catch (err: any) {
      console.error('Debate run crashed:', err);
      await db.run(`UPDATE debates SET status = 'failed' WHERE id = ?`, [this.debateId]);
      this.emit('status', { step: 'failed', error: err.message || err });
    }
  }
}
