import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let DatabaseClass: any = null;
try {
  // Only load native sqlite3 bindings when not running in Vercel/serverless environments
  if (!process.env.VERCEL) {
    DatabaseClass = require('sqlite3').Database;
  }
} catch (e) {
  console.warn('SQLite3 driver failed to load. Operating in Cloud-only Supabase REST mode.');
}

async function querySupabaseRest(method: string, path: string, body?: any): Promise<any> {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const headers: Record<string, string> = {
    'apikey': process.env.SUPABASE_ANON_KEY || '',
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' && path.includes('on_conflict')
      ? 'return=representation,resolution=merge-duplicates'
      : 'return=representation'
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase REST failed: ${res.status} - ${txt}`);
  }
  if (method === 'DELETE' || res.status === 204) return [];
  return res.json();
}

async function translateSqlToRest(sql: string, params: any[]): Promise<any> {
  const cleanSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  // 1. SELECT COUNT
  if (cleanSql.includes('select count(*)')) {
    const table = cleanSql.match(/from\s+(\w+)/)?.[1];
    const data = await querySupabaseRest('GET', `${table}?select=id`);
    return { count: data.length };
  }

  // 2. SELECT WHERE
  if (cleanSql.startsWith('select')) {
    const table = cleanSql.match(/from\s+(\w+)/)?.[1];
    
    if (cleanSql.includes('select chunks.id, chunks.text, chunks.scope_tag')) {
      const scopes = params.slice(0, params.length - 1);
      const uId = params[params.length - 1];
      const scopesCsv = scopes.map(s => encodeURIComponent(s)).join(',');
      
      const path = `chunks?select=id,text,scope_tag,documents!inner(user_id)&scope_tag=in.(${scopesCsv})&or=(documents.user_id.eq.${uId},documents.user_id.eq.default_user,documents.user_id.eq.can_seed,documents.user_id.is.null)`;
      
      const results = await querySupabaseRest('GET', path);
      return results.map((r: any) => ({
        id: r.id,
        text: r.text,
        scope_tag: r.scope_tag
      }));
    }

    let queryParams = '';
    
    if (cleanSql.includes('email = ? and password = ?')) {
      queryParams = `email=eq.${encodeURIComponent(params[0])}&password=eq.${encodeURIComponent(params[1])}`;
    } else if (cleanSql.includes('debate_id = ?')) {
      queryParams = `debate_id=eq.${params[0]}`;
    } else if (cleanSql.includes('user_id = ? or user_id = \'default_user\'')) {
      queryParams = `or=(user_id.eq.${params[0]},user_id.eq.default_user,user_id.eq.can_seed)`;
    } else if (cleanSql.includes('user_id = ?')) {
      queryParams = `user_id=eq.${params[0]}`;
    } else if (cleanSql.includes('id = ? and user_id = ?')) {
      queryParams = `id=eq.${params[0]}&user_id=eq.${params[1]}`;
    } else if (cleanSql.includes('id = ?')) {
      queryParams = `id=eq.${params[0]}`;
    } else if (cleanSql.includes('document_id = ?')) {
      queryParams = `document_id=eq.${params[0]}`;
    }

    let selectParam = '*';
    if (cleanSql.includes('select content from')) {
      selectParam = 'content';
    } else if (cleanSql.includes('select filename, scope_tag from')) {
      selectParam = 'filename,scope_tag';
    } else if (cleanSql.includes('select id, filename, scope_tag, created_at from')) {
      selectParam = 'id,filename,scope_tag,created_at';
    }

    const path = queryParams ? `${table}?select=${selectParam}&${queryParams}` : `${table}?select=${selectParam}`;
    const results = await querySupabaseRest('GET', path);
    return results;
  }

  // 3. INSERT / REPLACE
  if (cleanSql.startsWith('insert')) {
    const isUpsert = cleanSql.includes('or replace') || cleanSql.includes('or ignore');
    const table = sql.match(/insert\s+(?:or\s+replace\s+)?(?:or\s+ignore\s+)?into\s+(\w+)/i)?.[1];
    const columnsStr = sql.match(/\(([^)]+)\)/)?.[1];
    if (table && columnsStr) {
      const columns = columnsStr.split(',').map(c => c.trim());
      const body: Record<string, any> = {};
      columns.forEach((col, idx) => {
        body[col] = params[idx];
      });
      // Use upsert header for INSERT OR REPLACE
      const upsertPath = isUpsert ? `${table}?on_conflict=id` : table;
      const res = await querySupabaseRest('POST', upsertPath, body);
      return res;
    }
  }

  // 4. UPDATE
  if (cleanSql.startsWith('update')) {
    const table = sql.match(/update\s+(\w+)/i)?.[1];
    if (table) {
      const setPart = sql.match(/set\s+([\s\S]+?)\s+where/i)?.[1];
      const wherePart = sql.match(/where\s+([\s\S]+)$/i)?.[1];
      if (setPart && wherePart) {
        const columns = setPart.split(',').map(part => part.split('=')[0].trim());
        const body: Record<string, any> = {};
        columns.forEach((col, idx) => {
          body[col] = params[idx];
        });
        
        const filterVal = params[params.length - 1];
        const filterCol = wherePart.split('=')[0].trim();
        const queryParams = `${filterCol}=eq.${filterVal}`;
        return await querySupabaseRest('PATCH', `${table}?${queryParams}`, body);
      }
    }
  }

  // 5. DELETE
  if (cleanSql.startsWith('delete')) {
    const table = sql.match(/from\s+(\w+)/i)?.[1];
    const wherePart = sql.match(/where\s+([\s\S]+)$/i)?.[1];
    if (table && wherePart) {
      let queryParams = '';
      if (cleanSql.includes('id = ? and user_id = ?')) {
        queryParams = `id=eq.${params[0]}&user_id=eq.${params[1]}`;
      } else if (cleanSql.includes('id = ?')) {
        queryParams = `id=eq.${params[0]}`;
      } else if (cleanSql.includes('document_id = ?')) {
        queryParams = `document_id=eq.${params[0]}`;
      } else if (cleanSql.includes('debate_id = ?')) {
        queryParams = `debate_id=eq.${params[0]}`;
      }
      return await querySupabaseRest('DELETE', `${table}?${queryParams}`);
    }
  }

  return [];
}

export class DBConnection {
  private db: any = null;
  private isServerless: boolean = false;

  constructor(dbPath: string) {
    if (DatabaseClass) {
      try {
        this.db = new DatabaseClass(dbPath);
      } catch (e) {
        console.warn('Could not instantiate SQLite DB, switching to Serverless mode:', e);
        this.isServerless = true;
      }
    } else {
      this.isServerless = true;
    }
  }

  run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    if (this.isServerless) {
      const cleanSql = sql.trim().toLowerCase();
      if (cleanSql.startsWith('create') || cleanSql.startsWith('alter')) {
        return Promise.resolve({ lastID: 0, changes: 0 });
      }
      return translateSqlToRest(sql, params).then(() => ({ lastID: 0, changes: 1 }));
    }

    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err: any) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  all(sql: string, params: any[] = []): Promise<any[]> {
    if (this.isServerless) {
      return translateSqlToRest(sql, params);
    }

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err: any, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  get(sql: string, params: any[] = []): Promise<any> {
    if (this.isServerless) {
      return translateSqlToRest(sql, params).then(rows => (rows && rows.length > 0 ? rows[0] : null));
    }

    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err: any, row: any) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  close(): Promise<void> {
    if (this.isServerless || !this.db) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.db.close((err: any) => {
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
  try {
    const docCount = await db.get(`SELECT COUNT(*) as count FROM documents`);
    if (!docCount || docCount.count === 0) {
      console.log('Database documents table is empty. Seeding initial fixtures on the fly...');
      await seedFixtures();
    }
  } catch (seedErr: any) {
    console.warn('Seeding check failed, continuing anyway:', seedErr.message || seedErr);
  }

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
