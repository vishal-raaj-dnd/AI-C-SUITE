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
  retryCount?: number;
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
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  const startTime = Date.now();

  let text = '';
  let tokensIn = 0;
  let tokensOut = 0;
  const costUsd = 0;

  try {
    const modelLower = modelName.toLowerCase();
    const isGeminiModel = modelLower.includes('gemini') || modelLower.includes('google');
    const isGroqModel = modelLower.includes('llama') || modelLower.includes('mixtral') || modelLower.includes('groq');

    if (isGeminiModel && geminiApiKey && geminiApiKey.trim().length > 0) {
      // Direct Google Gemini SDK execution
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const cleanModel = modelName.includes('/') ? modelName.split('/').pop()! : modelName;
        console.log(`[LLM] Direct Gemini SDK execution for model: ${cleanModel}`);

        const response = await ai.models.generateContent({
          model: cleanModel,
          contents: opts.prompt,
          config: {
            systemInstruction: opts.system,
            responseMimeType: opts.schema ? 'application/json' : 'text/plain',
            maxOutputTokens: opts.maxTokens,
            temperature: 0.2
          }
        });
        text = response.text || '';
      } catch (error: any) {
        if (error.status === 429 || (error.message && error.message.includes('429')) || (error.message && error.message.includes('RESOURCE_EXHAUSTED'))) {
          const waitTime = 15;
          console.warn(`[LLM] Gemini Rate limit hit (429). Retrying after ${waitTime}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
          return callLLM(opts);
        }
        throw error;
      }
    } else if (isGroqModel && groqApiKey && groqApiKey.trim().length > 0) {
      // Direct Groq API execution (OpenAI-compatible)
      const cleanModel = modelName.includes('/') ? modelName.split('/').pop()! : modelName;
      console.log(`[LLM] Direct Groq API execution for model: ${cleanModel}`);
      const messages = [];
      if (opts.system) {
        messages.push({ role: 'system', content: opts.system });
      }
      
      let prompt = opts.prompt;
      if (opts.schema && !prompt.toLowerCase().includes('json') && !(opts.system && opts.system.toLowerCase().includes('json'))) {
        prompt += "\n\nResponse must be a valid JSON object.";
      }
      messages.push({ role: 'user', content: prompt });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`
      };

      const body: any = {
        model: cleanModel || 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.2
      };

      if (opts.maxTokens) {
        body.max_tokens = opts.maxTokens;
      }

      if (opts.schema) {
        body.response_format = { type: 'json_object' };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429 || errorText.includes('rate_limit_exceeded') || errorText.includes('429')) {
          let retryAfterSeconds = 5;
          try {
            const errJson = JSON.parse(errorText);
            const msg = errJson.error?.message || '';
            const match = msg.match(/try again in ([\d.]+)\s*s/i);
            if (match) {
              retryAfterSeconds = Math.ceil(parseFloat(match[1])) + 1;
            }
          } catch (e) {}

          console.warn(`[LLM] Groq Rate limit hit (429). Retrying after ${retryAfterSeconds}s...`);
          await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000));
          return callLLM(opts);
        }
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
      }

      const resJson = await response.json();
      text = resJson.choices?.[0]?.message?.content || '';
      tokensIn = resJson.usage?.prompt_tokens || 0;
      tokensOut = resJson.usage?.completion_tokens || 0;
    } else if (geminiApiKey && geminiApiKey.trim().length > 0) {
      // Default fallback if key matches
      console.log("[LLM] Direct Gemini SDK execution fallback (gemini-2.5-flash)");
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: opts.prompt,
          config: {
            systemInstruction: opts.system,
            responseMimeType: opts.schema ? 'application/json' : 'text/plain',
            maxOutputTokens: opts.maxTokens,
            temperature: 0.2
          }
        });
        text = response.text || '';
      } catch (error: any) {
        if (error.status === 429 || (error.message && error.message.includes('429')) || (error.message && error.message.includes('RESOURCE_EXHAUSTED'))) {
          const waitTime = 15;
          console.warn(`[LLM] Gemini Rate limit hit (429). Retrying after ${waitTime}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
          return callLLM(opts);
        }
        throw error;
      }
    } else if (groqApiKey && groqApiKey.trim().length > 0) {
      // Default fallback if key matches
      console.log("[LLM] Direct Groq API execution fallback (llama-3.3-70b-versatile)");
      const messages = [];
      if (opts.system) {
        messages.push({ role: 'system', content: opts.system });
      }
      
      let prompt = opts.prompt;
      if (opts.schema && !prompt.toLowerCase().includes('json') && !(opts.system && opts.system.toLowerCase().includes('json'))) {
        prompt += "\n\nResponse must be a valid JSON object.";
      }
      messages.push({ role: 'user', content: prompt });

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqApiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          temperature: 0.2,
          max_tokens: opts.maxTokens,
          response_format: opts.schema ? { type: 'json_object' } : undefined
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429 || errorText.includes('rate_limit_exceeded') || errorText.includes('429')) {
          let retryAfterSeconds = 5;
          try {
            const errJson = JSON.parse(errorText);
            const msg = errJson.error?.message || '';
            const match = msg.match(/try again in ([\d.]+)\s*s/i);
            if (match) {
              retryAfterSeconds = Math.ceil(parseFloat(match[1])) + 1;
            }
          } catch (e) {}

          console.warn(`[LLM] Groq Rate limit hit (429). Retrying after ${retryAfterSeconds}s...`);
          await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000));
          return callLLM(opts);
        }
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
      }

      const resJson = await response.json();
      text = resJson.choices?.[0]?.message?.content || '';
    } else {
      // OpenRouter API execution fallback
      if (!hasApiKey) {
        throw new Error('OPENROUTER_API_KEY is not configured in .env.');
      }
      console.log(`[LLM] OpenRouter API execution fallback for model: ${modelName}`);
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

      // Abort after 30s to prevent pipeline hangs
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
      }

      const resJson = await response.json();
      text = resJson.choices?.[0]?.message?.content || '';
      tokensIn = resJson.usage?.prompt_tokens || 0;
      tokensOut = resJson.usage?.completion_tokens || 0;
    }

    const endTime = Date.now();
    const latencyMs = endTime - startTime;
    const currentRetryCount = opts.retryCount || 0;

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
        if (currentRetryCount < 2) {
          console.warn(`Validation failed, retrying with error logs... (Attempt ${currentRetryCount + 1}): ${err.message || err}`);
          const repairPrompt = `${opts.prompt}\n\nYour previous output failed validation: ${err.message || err}. Please repair it and produce a JSON response adhering EXACTLY to the schema.`;
          return await callLLM({
            ...opts,
            prompt: repairPrompt,
            retryCount: currentRetryCount + 1
          });
        } else {
          console.error(`Validation failed after max retries. Compiling fallback JSON for schema parsing...`);
          try {
            // Build fallback objects to prevent crashes
            if (opts.schema === CardOutputSchema) {
              parsed = {
                verdict: "Compromise Pending",
                body_md: "Analysis was completed but could not be parsed into the target schema format.",
                claims: [],
                assumptions: ["Undergoing structural formatting"],
                confidence: "Partial"
              };
            } else if (opts.schema === IntakeResultSchema) {
              parsed = {
                classification: "General Query",
                entities: [],
                time_horizon: "short-term"
              };
            } else if (opts.schema === InitialBriefSchema) {
              parsed = {
                verdict: "Requires Analysis",
                summary: "Initial assessment brief generated with fallback parameters.",
                key_findings: [],
                assumptions: []
              };
            } else {
              const matches = text.match(/\{[\s\S]*\}/);
              if (matches) {
                parsed = JSON.parse(matches[0]);
              } else {
                throw new Error("No JSON substring found");
              }
            }
          } catch (salvageErr) {
            throw new Error(`Model output validation failed repeatedly: ${err.message || err}`);
          }
        }
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
  } catch (error: any) {
    console.error(`LLM Call Failed for ${modelName}: ${error.message || error}`);
    throw error;
  }
}
