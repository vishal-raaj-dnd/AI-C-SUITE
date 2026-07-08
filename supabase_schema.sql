-- Supabase Tables Setup Script for Quorum AI Workspace
-- Copy and run this script in your Supabase SQL Editor (Dashboard > SQL Editor > New query).

-- 1. Create Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TEXT
);

ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY "Allow all public read/write" ON users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. Create Debates Table
CREATE TABLE IF NOT EXISTS debates (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  question TEXT,
  status TEXT,
  cost_usd REAL,
  merged_card_json TEXT,
  cross_chat_transcript_json TEXT,
  created_at TEXT
);

ALTER TABLE debates FORCE ROW LEVEL SECURITY;
CREATE POLICY "Allow all public read/write" ON debates FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. Create Cards Table
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  debate_id TEXT,
  advisor_id TEXT,
  verdict TEXT,
  body_md TEXT,
  claims_json TEXT,
  assumptions_json TEXT,
  confidence TEXT,
  trace_json TEXT,
  created_at TEXT
);

ALTER TABLE cards FORCE ROW LEVEL SECURITY;
CREATE POLICY "Allow all public read/write" ON cards FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. Create Canvases Table
CREATE TABLE IF NOT EXISTS canvases (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT,
  question TEXT,
  created_at TEXT
);

ALTER TABLE canvases FORCE ROW LEVEL SECURITY;
CREATE POLICY "Allow all public read/write" ON canvases FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. Create Documents Table
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  filename TEXT,
  scope_tag TEXT,
  content TEXT,
  created_at TEXT
);

ALTER TABLE documents FORCE ROW LEVEL SECURITY;
CREATE POLICY "Allow all public read/write" ON documents FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 6. Create Chunks Table
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT,
  scope_tag TEXT,
  text TEXT,
  chunk_index INTEGER
);

ALTER TABLE chunks FORCE ROW LEVEL SECURITY;
CREATE POLICY "Allow all public read/write" ON chunks FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 7. Create Decision Records Table
CREATE TABLE IF NOT EXISTS decision_records (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  debate_id TEXT,
  question TEXT,
  chosen_option TEXT,
  rationale_md TEXT,
  dissents_json TEXT,
  assumptions_json TEXT,
  created_at TEXT
);

ALTER TABLE decision_records FORCE ROW LEVEL SECURITY;
CREATE POLICY "Allow all public read/write" ON decision_records FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
