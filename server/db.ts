import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

export class DBConnection {
  private db: sqlite3.Database;

  constructor(dbPath: string) {
    this.db = new sqlite3.Database(dbPath);
  }

  run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  all(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  get(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export const db = new DBConnection(path.join(process.cwd(), 'foil.db'));

export async function initDatabase() {
  // Create tables
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password TEXT,
      created_at TEXT
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      filename TEXT,
      scope_tag TEXT,
      content TEXT,
      created_at TEXT
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT,
      scope_tag TEXT,
      text TEXT,
      chunk_index INTEGER,
      FOREIGN KEY(document_id) REFERENCES documents(id)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS debates (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      question TEXT,
      status TEXT,
      cost_usd REAL,
      created_at TEXT
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      debate_id TEXT,
      advisor_id TEXT,
      verdict TEXT,
      body_md TEXT,
      claims_json TEXT,
      assumptions_json TEXT,
      confidence TEXT,
      created_at TEXT,
      FOREIGN KEY(debate_id) REFERENCES debates(id)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      card_ids_json TEXT,
      created_at TEXT
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS cross_chats (
      id TEXT PRIMARY KEY,
      connection_id TEXT,
      user_prompt TEXT,
      transcript_json TEXT,
      merged_card_id TEXT,
      created_at TEXT,
      FOREIGN KEY(connection_id) REFERENCES connections(id)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS decision_records (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      debate_id TEXT,
      question TEXT,
      chosen_option TEXT,
      rationale_md TEXT,
      dissents_json TEXT,
      assumptions_json TEXT,
      created_at TEXT,
      FOREIGN KEY(debate_id) REFERENCES debates(id)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS canvases (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT,
      question TEXT,
      created_at TEXT
    )
  `);

  // Migrate existing tables
  const migrateTable = async (tableName: string, columnName: string, type: string) => {
    try {
      await db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${type}`);
    } catch (e) {
      // Column already exists or table doesn't exist yet
    }
  };
  await migrateTable('documents', 'user_id', 'TEXT');
  await migrateTable('debates', 'user_id', 'TEXT');
  await migrateTable('decision_records', 'user_id', 'TEXT');
  await migrateTable('canvases', 'user_id', 'TEXT');
  await migrateTable('cards', 'trace_json', 'TEXT');
  await migrateTable('debates', 'merged_card_json', 'TEXT');
  await migrateTable('debates', 'cross_chat_transcript_json', 'TEXT');

  await seedFixtures();
}

async function seedFixtures() {
  const fixturesDir = path.join(process.cwd(), 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    console.log('Fixtures folder does not exist.');
    return;
  }

  const scopes = ['marketing', 'finance', 'tech', 'ops'];

  for (const scope of scopes) {
    const scopeDir = path.join(fixturesDir, scope);
    if (!fs.existsSync(scopeDir)) continue;

    const files = fs.readdirSync(scopeDir);
    for (const file of files) {
      const filePath = path.join(scopeDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      await indexDocument(file, content, scope);
    }
  }

  // Seed canvases
  const canvasCount = await db.get(`SELECT COUNT(*) as count FROM canvases`);
  if (canvasCount.count === 0) {
    await db.run(`INSERT INTO canvases (id, title, question, created_at) VALUES ('can_1', 'Freemium Launch Decision', 'Should we launch a freemium tier?', ?)`, [new Date().toISOString()]);
    await db.run(`INSERT INTO canvases (id, title, question, created_at) VALUES ('can_2', 'Q2 Pricing Strategy', 'How should we adjust pricing for enterprise tiers?', ?)`, [new Date(Date.now() - 172800000).toISOString()]);
  }

  console.log('Fixtures seeded successfully.');
}

export async function indexDocument(file: string, content: string, scope: string, userId?: string) {
  const docId = `${scope}_${file}`;

  // Insert or replace document
  await db.run(
    `INSERT OR REPLACE INTO documents (id, user_id, filename, scope_tag, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [docId, userId || 'default_user', file, scope, content, new Date().toISOString()]
  );

  // Simple paragraph-based chunker (~150-200 words per chunk)
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
  let chunkIndex = 0;
  let currentChunk = '';

  const insertChunk = async (text: string, index: number) => {
    const chunkId = `${file}#chunk_${index}`;
    await db.run(
      `INSERT OR REPLACE INTO chunks (id, document_id, scope_tag, text, chunk_index) VALUES (?, ?, ?, ?, ?)`,
      [chunkId, docId, scope, text.trim(), index]
    );
  };

  for (const p of paragraphs) {
    if ((currentChunk + '\n\n' + p).split(/\s+/).length > 200) {
      if (currentChunk.trim().length > 0) {
        await insertChunk(currentChunk, chunkIndex++);
      }
      currentChunk = p;
    } else {
      currentChunk = currentChunk.length === 0 ? p : currentChunk + '\n\n' + p;
    }
  }

  if (currentChunk.trim().length > 0) {
    await insertChunk(currentChunk, chunkIndex++);
  }
}

// Simple keyword search helper to retrieve relevant chunks by query and tags
export async function retrieveKb(query: string, scopeTags: string[], userId?: string): Promise<{ id: string; text: string; scope: string }[]> {
  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);

  const scopePlaceholder = scopeTags.map(() => '?').join(',');
  const sql = `
    SELECT chunks.id, chunks.text, chunks.scope_tag 
    FROM chunks 
    JOIN documents ON chunks.document_id = documents.id
    WHERE chunks.scope_tag IN (${scopePlaceholder})
      AND (documents.user_id = ? OR documents.user_id = 'default_user' OR documents.user_id = 'can_seed' OR documents.user_id IS NULL)
  `;

  const rows = await db.all(sql, [...scopeTags, userId || 'default_user']);

  if (queryTerms.length === 0) {
    // If no query terms, return first 5 chunks in scope
    return rows.slice(0, 5).map(r => ({ id: r.id, text: r.text, scope: r.scope_tag }));
  }

  // Simple BM25-like overlap scorer in JS
  const scored = rows.map(row => {
    const textLower = row.text.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (textLower.includes(term)) {
        score += 1;
        // Boost exact matches or boundary matches
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        if (regex.test(row.text)) {
          score += 2;
        }
      }
    }
    return { ...row, score };
  });

  return scored
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(r => ({ id: r.id, text: r.text, scope: r.scope_tag }));
}
