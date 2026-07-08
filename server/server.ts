import express from 'express';
import { db, initDatabase, indexDocument } from './db.js';
import fs from 'fs';
import path from 'path';
import { DebateOrchestrator } from './orchestrator.js';
import { callLLM, CardOutputSchema } from './llm.js';
import { z } from 'zod';

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

// CORS for Vercel
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-user-id');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Initialize DB on boot (skip heavy init on Vercel — tables are in Supabase)
if (!process.env.VERCEL) {
  initDatabase().catch(err => {
    console.error('Failed to initialize database:', err);
  });
}

// Supabase replication service using service role credentials
async function syncToSupabase(table: string, payload: any) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    const response = await fetch(`${url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const text = await response.text();
      console.error(`Supabase replication failed for ${table}:`, text);
    } else {
      console.log(`Supabase replication success for ${table}`);
    }
  } catch (err) {
    console.error(`Supabase sync error for ${table}:`, err);
  }
}

// User signup
app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const userId = `usr_${Date.now()}`;
  try {
    await db.run(
      `INSERT INTO users (id, email, password, created_at) VALUES (?, ?, ?, ?)`,
      [userId, email, password, new Date().toISOString()]
    );
    
    // Sync to Supabase users table
    await syncToSupabase('users', { id: userId, email, password, created_at: new Date().toISOString() });

    // Seed initial default canvases for new users so canvas is not empty
    const canvasId1 = `can_${Date.now()}_1`;
    const canvasId2 = `can_${Date.now()}_2`;
    await db.run(`INSERT INTO canvases (id, user_id, title, question, created_at) VALUES (?, ?, 'Freemium Launch Decision', 'Should we launch a freemium tier?', ?)`, [canvasId1, userId, new Date().toISOString()]);
    await db.run(`INSERT INTO canvases (id, user_id, title, question, created_at) VALUES (?, ?, 'Q2 Pricing Strategy', 'How should we adjust pricing for enterprise tiers?', ?)`, [canvasId2, userId, new Date(Date.now() - 172800000).toISOString()]);

    await syncToSupabase('canvases', { id: canvasId1, user_id: userId, title: 'Freemium Launch Decision', question: 'Should we launch a freemium tier?', created_at: new Date().toISOString() });
    await syncToSupabase('canvases', { id: canvasId2, user_id: userId, title: 'Q2 Pricing Strategy', question: 'How should we adjust pricing for enterprise tiers?', created_at: new Date(Date.now() - 172800000).toISOString() });

    res.json({ success: true, userId, email });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: err.message || err });
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    const user = await db.get(`SELECT id, email FROM users WHERE email = ? AND password = ?`, [email, password]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ success: true, userId: user.id, email: user.email });
  } catch (err: any) {
    res.status(500).json({ error: err.message || err });
  }
});

// Upload a file and index it in the scoped folder
app.post('/api/kb/upload', async (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'default_user';
  const { filename, content, scope } = req.body;

  if (!filename || !content || !scope) {
    return res.status(400).json({ error: 'filename, content, and scope are required' });
  }

  const allowedScopes = ['marketing', 'finance', 'tech', 'ops', 'general'];
  if (!allowedScopes.includes(scope)) {
    return res.status(400).json({ error: 'Invalid scope tag. Must be marketing, finance, tech, ops, or general.' });
  }

  try {
    const targetDir = path.join(process.cwd(), 'fixtures', scope);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const filePath = path.join(targetDir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');

    await indexDocument(filename, content, scope, userId);

    // Sync to Supabase
    await syncToSupabase('documents', {
      id: `${scope}_${filename}_${userId}`,
      user_id: userId,
      filename,
      scope_tag: scope,
      content,
      created_at: new Date().toISOString()
    });

    res.json({ success: true, message: `File ${filename} uploaded and indexed successfully in folder 'fixtures/${scope}/'` });
  } catch (err: any) {
    console.error('File upload failed:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// Start a new debate
app.post('/api/debates', async (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'default_user';
  const { question, canvasId } = req.body;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Question is required' });
  }

  const debateId = canvasId ? `deb_${canvasId}` : `deb_${Date.now()}`;
  try {
    // Clear previous runs of this canvas to prevent duplicate keys
    await db.run(`DELETE FROM debates WHERE id = ?`, [debateId]);
    await db.run(`DELETE FROM cards WHERE debate_id = ?`, [debateId]);

    await db.run(
      `INSERT INTO debates (id, user_id, question, status, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [debateId, userId, question, 'pending', 0, new Date().toISOString()]
    );

    // Sync to Supabase
    await syncToSupabase('debates', {
      id: debateId,
      user_id: userId,
      question,
      status: 'pending',
      cost_usd: 0,
      created_at: new Date().toISOString()
    });

    // On Vercel, fire-and-forget the debate immediately since SSE won't work
    if (process.env.VERCEL) {
      const orchestrator = new DebateOrchestrator(debateId, question, userId);
      orchestrator.run().catch(err => {
        console.error('Background debate failed:', err.message || err);
      });
      res.json({ debate_id: debateId, mode: 'async' });
    } else {
      res.json({ debate_id: debateId, mode: 'stream' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || err });
  }
});

// Fetch debate result (fallback/polling/reload)
app.get('/api/debates/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const debate = await db.get(`SELECT * FROM debates WHERE id = ?`, [id]);
    if (!debate) {
      return res.status(404).json({ error: 'Debate not found' });
    }
    const cards = await db.all(`SELECT * FROM cards WHERE debate_id = ?`, [id]);
    const formattedCards = cards.map(c => ({
      advisor_id: c.advisor_id,
      verdict: c.verdict,
      body_md: c.body_md,
      claims: JSON.parse(c.claims_json),
      assumptions: JSON.parse(c.assumptions_json),
      confidence: c.confidence,
      trace: c.trace_json ? JSON.parse(c.trace_json) : []
    }));
    res.json({ 
      ...debate, 
      cards: formattedCards,
      merged_card: debate.merged_card_json ? JSON.parse(debate.merged_card_json) : null,
      cross_chat_transcript: debate.cross_chat_transcript_json ? JSON.parse(debate.cross_chat_transcript_json) : []
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || err });
  }
});

// SSE Streaming debate progress (local) or async fire-and-forget (Vercel)
app.get('/api/debates/:id/stream', async (req, res) => {
  const { id } = req.params;
  const userId = (req.query.userId as string) || (req.headers['x-user-id'] as string) || 'default_user';

  const debate = await db.get(`SELECT * FROM debates WHERE id = ?`, [id]);
  if (!debate) {
    return res.status(404).json({ error: 'Debate not found' });
  }

  // On Vercel: run debate asynchronously and return immediately
  if (process.env.VERCEL) {
    const orchestrator = new DebateOrchestrator(id, debate.question, userId);
    // Fire and forget - the debate will run and save results to DB
    orchestrator.run().catch(err => {
      console.error('Background debate failed:', err.message || err);
    });
    return res.json({ mode: 'async', message: 'Debate started. Poll /api/debates/:id for results.' });
  }

  // Local: use SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let connectionOpen = true;
  const orchestrator = new DebateOrchestrator(id, debate.question, userId);

  orchestrator.on('status', (event) => {
    if (connectionOpen) {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (writeErr) {
        connectionOpen = false;
      }
    }
  });

  req.on('close', () => {
    connectionOpen = false;
    console.log(`Connection closed for stream: ${id}`);
    orchestrator.removeAllListeners();
  });

  await orchestrator.run();
  if (connectionOpen) {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// Multi-turn Cross-Chat debate between 2 C-level advisors
app.post('/api/cross-chat', async (req, res) => {
  const { card_ids, user_prompt } = req.body;
  if (!card_ids || !Array.isArray(card_ids) || card_ids.length < 2) {
    return res.status(400).json({ error: 'At least two card IDs are required' });
  }

  try {
    let cards = req.body.cards;
    if (!cards || !Array.isArray(cards) || cards.length < 2) {
      const cardIdPlaceholders = card_ids.map(() => '?').join(',');
      const dbCards = await db.all(`
        SELECT * FROM cards WHERE id IN (${cardIdPlaceholders})
      `, card_ids);

      if (dbCards.length < 2) {
        return res.status(404).json({ error: 'Cards not found' });
      }
      cards = dbCards.map(c => ({
        advisor_id: c.advisor_id,
        verdict: c.verdict,
        body_md: c.body_md
      }));
    }

    const transcript: { advisor_id: string; turn: number; text: string }[] = [];
    const maxTurns = 6;

    for (let i = 0; i < maxTurns; i++) {
      const currentCard = cards[i % cards.length];
      const speakerId = currentCard.advisor_id.toUpperCase();

      const contextText = cards
        .map(
          c => `Advisor: Chief ${c.advisor_id.toUpperCase()} Officer
Verdict: ${c.verdict}
Analysis Body: ${c.body_md}`
        )
        .join('\n\n');

      const chatHistoryText = transcript
        .map(t => `${t.advisor_id.toUpperCase()} Officer: ${t.text}`)
        .join('\n\n');

      const system = `You are the Chief ${speakerId} Officer of the company.
You are in a live cross-advisor debate. Respond to the user's question and coordinate/disagree with the other advisors present.
Do not repeat yourself. Cite documents or calculations if relevant. Keep your response under 150 words.`;

      const prompt = `Debate Context:
${contextText}

Previous Chat History:
${chatHistoryText || 'No comments made yet.'}

Current Question to Address: "${user_prompt}"

Provide your short, professional response in this turn:`;

      const reply = await callLLM({
        model: 'main',
        system,
        prompt,
        maxTokens: 200,
      });

      transcript.push({
        advisor_id: currentCard.advisor_id,
        turn: i,
        text: reply.text.trim(),
      });
    }

    const debateId = card_ids[0].startsWith('deb_') ? card_ids[0].split('_').slice(0, 3).join('_') : null;
    if (debateId) {
      await db.run(`UPDATE debates SET cross_chat_transcript_json = ? WHERE id = ?`, [JSON.stringify(transcript), debateId]);
    }

    res.json({ transcript });
  } catch (err: any) {
    res.status(500).json({ error: err.message || err });
  }
});

// Synthesize Cross-Chat transcript into a Merged Card
app.post('/api/cross-chat/merge', async (req, res) => {
  const { card_ids, transcript } = req.body;
  if (!card_ids || !transcript || !Array.isArray(transcript)) {
    return res.status(400).json({ error: 'Card IDs and transcript are required' });
  }

  try {
    let cards = req.body.cards;
    if (!cards || !Array.isArray(cards) || cards.length < 2) {
      const cardIdPlaceholders = card_ids.map(() => '?').join(',');
      const dbCards = await db.all(`
        SELECT * FROM cards WHERE id IN (${cardIdPlaceholders})
      `, card_ids);
      cards = dbCards.map(c => ({
        advisor_id: c.advisor_id,
        verdict: c.verdict,
        body_md: c.body_md
      }));
    }

    const contextText = cards
      .map(
        (c: any) => `Advisor: Chief ${c.advisor_id.toUpperCase()} Officer
Verdict: ${c.verdict}`
      )
      .join('\n\n');

    const transcriptText = transcript
      .map((t: any) => `Turn ${t.turn} - ${t.advisor_id.toUpperCase()} Officer: ${t.text}`)
      .join('\n');

    const system = `You are the board coordinator. Synthesize the debate transcript between these advisors into a single Merged Card that represents the final compromise, unresolved conflict, or trade-off. 
Provide a verdict (bold 1-sentence), body (markdown analysis), claims (with citations if possible), assumptions, and confidence.`;

    const prompt = `Parent Cards Stances:
${contextText}

Live Debate Transcript:
${transcriptText}

Generate the final merged card output in JSON:`;

    const resLLM = await callLLM({
      model: 'main',
      system,
      prompt,
      schema: CardOutputSchema,
    });

    const debateId = card_ids[0].startsWith('deb_') ? card_ids[0].split('_').slice(0, 3).join('_') : null;
    if (debateId) {
      await db.run(`UPDATE debates SET merged_card_json = ? WHERE id = ?`, [JSON.stringify(resLLM.parsed), debateId]);
    }

    res.json(resLLM.parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message || err });
  }
});

// Save a Decision Record and index it into the Knowledge Base
app.post('/api/decision-records', async (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'default_user';
  const { debate_id, question, chosen_option, rationale_md, dissents_json, assumptions_json } = req.body;

  if (!debate_id || !question || !chosen_option || !rationale_md) {
    return res.status(400).json({ error: 'Missing required Decision Record fields' });
  }

  const drId = `dr_${Date.now()}`;
  try {
    await db.run(`
      INSERT INTO decision_records (id, user_id, debate_id, question, chosen_option, rationale_md, dissents_json, assumptions_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      drId,
      userId,
      debate_id,
      question,
      chosen_option,
      rationale_md,
      JSON.stringify(dissents_json || []),
      JSON.stringify(assumptions_json || []),
      new Date().toISOString()
    ]);

    // Sync to Supabase
    await syncToSupabase('decision_records', {
      id: drId,
      user_id: userId,
      debate_id,
      question,
      chosen_option,
      rationale_md,
      dissents_json: JSON.stringify(dissents_json || []),
      assumptions_json: JSON.stringify(assumptions_json || []),
      created_at: new Date().toISOString()
    });

    // Feed back into KB chunks under 'decisions' tag so future debates cite this DR
    const chunkText = `Past Company Decision Record ID [${drId}]:
Question Debated: ${question}
Chosen Option: ${chosen_option}
Rationale: ${rationale_md}
Key Assumptions made: ${(assumptions_json || []).join(', ')}`;

    await db.run(`
      INSERT INTO chunks (id, document_id, scope_tag, text, chunk_index)
      VALUES (?, ?, ?, ?, ?)
    `, [
      `dr_${drId}#chunk_0`,
      `dr_${drId}`,
      'decisions',
      chunkText,
      0
    ]);

    // Keep documents sync'd too
    await db.run(`
      INSERT INTO documents (id, user_id, filename, scope_tag, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      `dr_${drId}`,
      userId,
      `decision_${drId}.md`,
      'decisions',
      chunkText,
      new Date().toISOString()
    ]);

    await syncToSupabase('documents', {
      id: `dr_${drId}`,
      user_id: userId,
      filename: `decision_${drId}.md`,
      scope_tag: 'decisions',
      content: chunkText,
      created_at: new Date().toISOString()
    });

    res.json({ success: true, id: drId });
  } catch (err: any) {
    res.status(500).json({ error: err.message || err });
  }
});

// List all Decision Records
app.get('/api/decision-records', async (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'default_user';
  try {
    const rows = await db.all(`SELECT * FROM decision_records WHERE user_id = ? ORDER BY created_at DESC`, [userId]);
    const formatted = rows.map(r => ({
      ...r,
      dissents: JSON.parse(r.dissents_json),
      assumptions: JSON.parse(r.assumptions_json),
    }));
    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: err.message || err });
  }
});

// List all documents in the Knowledge Base
app.get('/api/kb/documents', async (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'default_user';
  try {
    const rows = await db.all(`SELECT id, filename, scope_tag, created_at FROM documents WHERE user_id = ? OR user_id = 'default_user' OR user_id = 'can_seed' ORDER BY created_at DESC`, [userId]);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message || err });
  }
});

// Get single document content
app.get('/api/kb/documents/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const doc = await db.get(`SELECT content FROM documents WHERE id = ?`, [id]);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message || err });
  }
});

// DELETE a document from Knowledge Base
app.delete('/api/kb/documents/:id', async (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'default_user';
  const { id } = req.params;
  try {
    const doc = await db.get(`SELECT filename, scope_tag FROM documents WHERE id = ? AND user_id = ?`, [id, userId]);
    if (doc) {
      const filePath = path.join(process.cwd(), 'fixtures', doc.scope_tag, doc.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      await db.run(`DELETE FROM documents WHERE id = ?`, [id]);
      await db.run(`DELETE FROM chunks WHERE document_id = ?`, [id]);
      res.json({ success: true, message: 'Document deleted successfully' });
    } else {
      res.status(403).json({ error: 'Permission denied or document not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || err });
  }
});

// GET all canvases
app.get('/api/canvases', async (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'default_user';
  try {
    const rows = await db.all(`SELECT * FROM canvases WHERE user_id = ? ORDER BY created_at DESC`, [userId]);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message || err });
  }
});

// POST create canvas
app.post('/api/canvases', async (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'default_user';
  const { title, question } = req.body;
  const canvasId = `can_${Date.now()}`;
  try {
    await db.run(
      `INSERT INTO canvases (id, user_id, title, question, created_at) VALUES (?, ?, ?, ?, ?)`,
      [canvasId, userId, title || 'New Workspace Canvas', question || 'What decision are we making today?', new Date().toISOString()]
    );

    // Sync to Supabase
    await syncToSupabase('canvases', {
      id: canvasId,
      user_id: userId,
      title: title || 'New Workspace Canvas',
      question: question || 'What decision are we making today?',
      created_at: new Date().toISOString()
    });

    res.json({ success: true, id: canvasId });
  } catch (err: any) {
    res.status(500).json({ error: err.message || err });
  }
});

// DELETE canvas
app.delete('/api/canvases/:id', async (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'default_user';
  const { id } = req.params;
  try {
    await db.run(`DELETE FROM canvases WHERE id = ? AND user_id = ?`, [id, userId]);
    res.json({ success: true, message: 'Canvas deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || err });
  }
});

export default app;

// Global error handler — always return JSON, never raw text
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}
