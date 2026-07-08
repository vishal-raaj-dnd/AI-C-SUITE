import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const hasApiKey = openRouterApiKey && openRouterApiKey.trim().length > 0;

if (!hasApiKey) {
  console.warn('WARNING: OPENROUTER_API_KEY is not defined in .env. OpenRouter completions will fail.');
}

// Zod Schemas
export const ConfidenceSchema = z.enum(['Grounded', 'Partial', 'Speculation']);

export const ClaimSchema = z.object({
  text: z.string(),
  evidence: z.object({
    type: z.enum(['chunk', 'web', 'dr', 'calculation', 'speculation']),
    ref: z.string().optional(),
  }),
});

export const IntakeResultSchema = z.object({
  classification: z.string(),
  entities: z.array(z.string()),
  time_horizon: z.string().optional(),
});

export const InitialBriefSchema = z.object({
  verdict: z.string(),
  summary: z.string(),
  key_findings: z.array(z.string()),
  assumptions: z.array(z.string()),
});

export const CardOutputSchema = z.object({
  verdict: z.string().max(160),
  body_md: z.string(),
  claims: z.array(ClaimSchema),
  assumptions: z.array(z.string()),
  confidence: ConfidenceSchema,
});

export const ContrarianCardOutputSchema = z.object({
  verdict: z.string().max(160),
  body_md: z.string(),
  claims: z.array(ClaimSchema),
  assumptions: z.array(z.string()),
  confidence: ConfidenceSchema,
  challenges: z.array(
    z.object({
      target_advisor: z.string(),
      target_claim: z.string(),
      severity: z.enum(['high', 'medium', 'low']),
      attack: z.string(),
    })
  ),
  the_unasked_question: z.string(),
});

export type CallLLMOpts = {
  model: 'small' | 'main';
  system?: string;
  prompt: string;
  schema?: z.ZodType<any>;
  maxTokens?: number;
};

export type LLMResult = {
  text: string;
  parsed?: any;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
};

export async function callLLM(opts: CallLLMOpts): Promise<LLMResult> {
  const modelName = process.env.OPENROUTER_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct:free';
  const startTime = Date.now();

  if (!hasApiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured in .env.');
  }

  try {
    const messages = [];
    if (opts.system) {
      messages.push({ role: 'system', content: opts.system });
    }
    messages.push({ role: 'user', content: opts.prompt });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openRouterApiKey}`,
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Quorum Board Decision Platform'
    };

    const body: any = {
      model: modelName,
      messages,
      temperature: 0.2
    };

    if (opts.maxTokens) {
      body.max_tokens = opts.maxTokens;
    }

    if (opts.schema) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const resJson = await response.json();
    const text = resJson.choices?.[0]?.message?.content || '';
    
    const endTime = Date.now();
    const latencyMs = endTime - startTime;

    const tokensIn = resJson.usage?.prompt_tokens || 0;
    const tokensOut = resJson.usage?.completion_tokens || 0;
    const costUsd = 0; // free tier model has 0 cost

    let parsed: any = undefined;
    if (opts.schema && text.trim().length > 0) {
      try {
        let cleanText = text.trim();
        if (cleanText.startsWith('```json')) {
          cleanText = cleanText.substring(7);
        }
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.substring(3);
        }
        if (cleanText.endsWith('```')) {
          cleanText = cleanText.substring(0, cleanText.length - 3);
        }
        cleanText = cleanText.trim();

        const json = JSON.parse(cleanText);
        parsed = opts.schema.parse(json);
      } catch (err: any) {
        console.warn(`Validation failed, retrying with error logs...`, err);
        const repairPrompt = `${opts.prompt}\n\nYour previous output failed validation: ${err.message || err}. Please repair it and produce a JSON response adhering EXACTLY to the schema.`;
        return await callLLM({
          ...opts,
          prompt: repairPrompt,
        });
      }
    }

    return {
      text,
      parsed,
      tokensIn,
      tokensOut,
      costUsd,
      latencyMs,
    };
  } catch (error) {
    console.error(`LLM Call Failed for ${modelName}:`, error);
    throw error;
  }
}
