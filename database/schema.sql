-- ScribbleFlow SQLite Schema
-- Based on requirements: Local-First, Infinite Canvas, AI Context Inheritance, Message Branching

-- Enable Foreign Keys
PRAGMA foreign_keys = ON;

-- 1. Workspaces
-- Supports multiple isolated projects (e.g., "Novel A", "Python Study")
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,                 -- UUID
    name TEXT NOT NULL,
    description TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

-- 2. Cards (Nodes)
-- The core entity on the canvas.
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,                 -- UUID
    workspace_id TEXT NOT NULL,
    title TEXT DEFAULT 'Untitled',
    
    -- The "Knowledge Summary" used for context inheritance.
    -- Updated by AI after conversations, or manually by user.
    summary TEXT DEFAULT '',
    
    -- Status for visual marking
    status TEXT CHECK(status IN ('todo', 'in_progress', 'done', 'archived')) DEFAULT 'todo',
    
    -- Canvas Coordinates & Dimensions
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    width REAL DEFAULT 300,
    height REAL DEFAULT 200,
    
    -- Navigation to the active conversation branch.
    -- Points to the *last* message (leaf) of the currently displayed thread.
    -- If NULL, the card has no conversation yet.
    active_leaf_message_id TEXT,
    
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (active_leaf_message_id) REFERENCES messages(id) ON DELETE SET NULL
);

-- 3. Connections (Edges)
-- Represents the flow of context/knowledge (A -> B).
CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,                 -- UUID
    workspace_id TEXT NOT NULL,
    source_card_id TEXT NOT NULL,
    target_card_id TEXT NOT NULL,
    
    -- Type of connection (default is context flow, could be 'reference' later)
    type TEXT DEFAULT 'context_flow',
    
    -- Control points for Bezier curves (JSON string: {cp1: {x,y}, cp2: {x,y}})
    path_data TEXT, 
    
    created_at INTEGER DEFAULT (unixepoch()),
    
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (source_card_id) REFERENCES cards(id) ON DELETE CASCADE,
    FOREIGN KEY (target_card_id) REFERENCES cards(id) ON DELETE CASCADE,
    
    -- Prevent duplicate links between same nodes
    UNIQUE(source_card_id, target_card_id)
);

-- 4. Messages (Chat History)
-- Uses a Tree Structure (Adjacency List) to support branching, editing, and undo.
-- Each message points to its parent. A conversation is a path from Root -> Leaf.
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,                 -- UUID
    card_id TEXT NOT NULL,
    
    -- Parent Message ID. NULL for the start of a conversation.
    -- This enables the "Tree" structure for branching conversations.
    parent_id TEXT,
    
    role TEXT CHECK(role IN ('user', 'assistant', 'system')) NOT NULL,
    content TEXT NOT NULL,
    
    -- Metadata for AI generation
    model_provider TEXT,                 -- e.g., 'openai', 'ollama'
    model_name TEXT,                     -- e.g., 'gpt-4', 'llama2'
    token_usage INTEGER,
    
    created_at INTEGER DEFAULT (unixepoch()),
    
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- 5. Summaries (History/Versions)
-- Stores historical versions of summaries for rollback or comparison.
CREATE TABLE IF NOT EXISTS summaries (
    id TEXT PRIMARY KEY,                 -- UUID
    card_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    
    -- Was this summary automatically generated or manually edited?
    source TEXT CHECK(source IN ('ai_auto', 'user_edit')) DEFAULT 'ai_auto',
    
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

-- 6. Full Text Search (FTS5)
-- Virtual tables for high-performance searching.

-- FTS for Cards
CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
    title, 
    summary, 
    content='cards', 
    content_rowid='rowid'
);

-- FTS for Messages
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content, 
    content='messages', 
    content_rowid='rowid'
);

-- Triggers to keep FTS index in sync with main tables

-- Cards Triggers
CREATE TRIGGER IF NOT EXISTS cards_ai AFTER INSERT ON cards BEGIN
  INSERT INTO cards_fts(rowid, title, summary) VALUES (new.rowid, new.title, new.summary);
END;
CREATE TRIGGER IF NOT EXISTS cards_ad AFTER DELETE ON cards BEGIN
  INSERT INTO cards_fts(cards_fts, rowid, title, summary) VALUES('delete', old.rowid, old.title, old.summary);
END;
CREATE TRIGGER IF NOT EXISTS cards_au AFTER UPDATE ON cards BEGIN
  INSERT INTO cards_fts(cards_fts, rowid, title, summary) VALUES('delete', old.rowid, old.title, old.summary);
  INSERT INTO cards_fts(rowid, title, summary) VALUES (new.rowid, new.title, new.summary);
END;

-- Messages Triggers
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- 7. Settings
-- Key-value store for application configuration
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
);
