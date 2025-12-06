import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import { randomUUID } from 'node:crypto'

const dbPath = path.join(app.getPath('userData'), 'scribbleflow.db')

let db: Database.Database | null = null

export function initDB() {
  try {
    console.log('Initializing DB at:', dbPath)
    db = new Database(dbPath)
    // Ensure WAL for durability and enable foreign keys for cascade deletions
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    
    // Load Schema
    // Priority:
    // 1) database/schema.sql relative to process.cwd() (dev)
    // 2) database/schema.sql relative to __dirname (built electron app)
    // 3) resourcesPath/app.asar.unpacked/database/schema.sql (packaged and unpacked)
    // 4) fallback to embedded schema (ensures packaged app can initialize DB even if schema file missing)
    let schema: string | null = null
    const candidatePaths = [
      path.resolve(process.cwd(), 'database/schema.sql'),
      path.resolve(__dirname, '../database/schema.sql'),
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'database', 'schema.sql'),
      path.join(process.resourcesPath || '', 'app.asar', 'database', 'schema.sql'),
      path.join(app.getAppPath ? app.getAppPath() : '', 'database', 'schema.sql')
    ]

    for (const p of candidatePaths) {
      try {
        if (p && fs.existsSync(p)) {
          schema = fs.readFileSync(p, 'utf8')
          console.log('Loaded DB schema from', p)
          break
        }
      } catch (err) {
        // continue to next candidate
      }
    }

    // If still not found, use embedded schema string as a final fallback.
    if (!schema) {
      console.warn('Database schema file not found in candidate paths, using embedded schema fallback.')
      schema = `-- Embedded schema fallback\n\n-- Workspaces\nCREATE TABLE IF NOT EXISTS workspaces (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  description TEXT,\n  created_at INTEGER DEFAULT (unixepoch()),\n  updated_at INTEGER DEFAULT (unixepoch())\n);\n\n-- Cards\nCREATE TABLE IF NOT EXISTS cards (\n  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT DEFAULT 'Untitled', summary TEXT DEFAULT '', status TEXT CHECK(status IN ('todo','in_progress','done','archived')) DEFAULT 'todo', x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0, width REAL DEFAULT 300, height REAL DEFAULT 200, active_leaf_message_id TEXT, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()), FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE, FOREIGN KEY (active_leaf_message_id) REFERENCES messages(id) ON DELETE SET NULL\n);\n\n-- Connections\nCREATE TABLE IF NOT EXISTS connections (\n  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_card_id TEXT NOT NULL, target_card_id TEXT NOT NULL, type TEXT DEFAULT 'context_flow', path_data TEXT, created_at INTEGER DEFAULT (unixepoch()), FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE, FOREIGN KEY (source_card_id) REFERENCES cards(id) ON DELETE CASCADE, FOREIGN KEY (target_card_id) REFERENCES cards(id) ON DELETE CASCADE, UNIQUE(source_card_id, target_card_id)\n);\n\n-- Messages\nCREATE TABLE IF NOT EXISTS messages (\n  id TEXT PRIMARY KEY, card_id TEXT NOT NULL, parent_id TEXT, role TEXT CHECK(role IN ('user','assistant','system')) NOT NULL, content TEXT NOT NULL, model_provider TEXT, model_name TEXT, token_usage INTEGER, created_at INTEGER DEFAULT (unixepoch()), FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE, FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE CASCADE\n);\n\n-- Summaries\nCREATE TABLE IF NOT EXISTS summaries (\n  id TEXT PRIMARY KEY, card_id TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()), source TEXT CHECK(source IN ('ai_auto','user_edit')) DEFAULT 'ai_auto', FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE\n);\n\n-- Settings\nCREATE TABLE IF NOT EXISTS settings (\n  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER DEFAULT (unixepoch())\n);\n\n-- FTS & triggers (best-effort; older SQLite builds may not have fts5, so wrap in try/catch at runtime)\nBEGIN;\nCREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(title, summary, content='cards', content_rowid='rowid');\nCREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, content='messages', content_rowid='rowid');\nCREATE TRIGGER IF NOT EXISTS cards_ai AFTER INSERT ON cards BEGIN\n  INSERT INTO cards_fts(rowid, title, summary) VALUES (new.rowid, new.title, new.summary);\nEND;\nCREATE TRIGGER IF NOT EXISTS cards_ad AFTER DELETE ON cards BEGIN\n  INSERT INTO cards_fts(cards_fts, rowid, title, summary) VALUES('delete', old.rowid, old.title, old.summary);\nEND;\nCREATE TRIGGER IF NOT EXISTS cards_au AFTER UPDATE ON cards BEGIN\n  INSERT INTO cards_fts(cards_fts, rowid, title, summary) VALUES('delete', old.rowid, old.title, old.summary);\n  INSERT INTO cards_fts(rowid, title, summary) VALUES (new.rowid, new.title, new.summary);\nEND;\nCREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN\n  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);\nEND;\nCREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN\n  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);\nEND;\nCREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN\n  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);\n  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);\nEND;\nCOMMIT;`;
    }

    try {
      // Only apply the schema if the DB is fresh / missing the core 'workspaces' table
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'").get()
      if (!row) {
        db.exec(schema)
        console.log('Database schema applied successfully')
      } else {
        // Schema exists, try to still ensure FTS triggers exist — best-effort
        // No-op here; we assume versioning/migrations handled elsewhere
      }
    } catch (err) {
      console.error('Failed to apply DB schema:', err)
    }
    
    console.log('Database initialized successfully')
  } catch (err) {
    console.error('Failed to initialize database:', err)
  }
  return db
}

export function getDB() {
  if (!db) return initDB()
  return db
}

export function getDBPath() {
  return dbPath
}

export function closeDB() {
  try {
    if (db) {
      db.close()
      db = null
    }
  } catch (err) {
    console.warn('Failed to close DB:', err)
  }
}

// --- Repository Methods ---

// Types (Mirroring DB Schema)
export interface Card {
  id: string
  workspace_id: string
  title: string
  summary: string
  status: 'todo' | 'in_progress' | 'done' | 'archived'
  x: number
  y: number
  width: number
  height: number
  active_leaf_message_id?: string | null
}

export interface Connection {
  id: string
  workspace_id: string
  source_card_id: string
  target_card_id: string
  type: string
  path_data?: string
}

// Cards
export function getCards(workspaceId: string): Card[] {
  const stmt = getDB()!.prepare('SELECT * FROM cards WHERE workspace_id = ?')
  return stmt.all(workspaceId) as Card[]
}

export function createCard(card: Partial<Card> & { workspace_id: string, x: number, y: number }): Card {
  const newCard: Card = {
    id: card.id || randomUUID(),
    workspace_id: card.workspace_id,
    title: card.title || 'Untitled',
    summary: card.summary || '',
    status: card.status || 'todo',
    x: card.x,
    y: card.y,
    width: card.width || 300,
    height: card.height || 200,
    active_leaf_message_id: null
  }

  const stmt = getDB()!.prepare(`
    INSERT INTO cards (id, workspace_id, title, summary, status, x, y, width, height)
    VALUES (@id, @workspace_id, @title, @summary, @status, @x, @y, @width, @height)
  `)
  stmt.run(newCard)
  return newCard
}

export function updateCardPosition(id: string, x: number, y: number) {
  const stmt = getDB()!.prepare('UPDATE cards SET x = ?, y = ?, updated_at = unixepoch() WHERE id = ?')
  stmt.run(x, y, id)
}

export function updateCardTitle(id: string, title: string) {
  const stmt = getDB()!.prepare('UPDATE cards SET title = ?, updated_at = unixepoch() WHERE id = ?')
  stmt.run(title, id)
}

export function updateCardSummary(id: string, summary: string) {
  const stmt = getDB()!.prepare('UPDATE cards SET summary = ?, updated_at = unixepoch() WHERE id = ?')
  stmt.run(summary, id)
}

export function updateCardDimensions(id: string, width: number, height: number) {
  const stmt = getDB()!.prepare('UPDATE cards SET width = ?, height = ?, updated_at = unixepoch() WHERE id = ?')
  stmt.run(width, height, id)
}

export function deleteCard(id: string) {
  const database = getDB()!

  // Use a transaction to ensure all related entities are removed atomically
  const tx = database.transaction((cardId: string) => {
    // Remove explicit relationships (connections, messages, summaries) — schema has cascade but explicit deletes help keep behavior consistent
    database.prepare('DELETE FROM connections WHERE source_card_id = ? OR target_card_id = ?').run(cardId, cardId)
    database.prepare('DELETE FROM messages WHERE card_id = ?').run(cardId)
    database.prepare('DELETE FROM summaries WHERE card_id = ?').run(cardId)
    database.prepare('DELETE FROM cards WHERE id = ?').run(cardId)
  })

  tx(id)
}

// Connections
export function getConnections(workspaceId: string): Connection[] {
  const stmt = getDB()!.prepare('SELECT * FROM connections WHERE workspace_id = ?')
  return stmt.all(workspaceId) as Connection[]
}

export function createConnection(conn: { workspace_id: string, source_card_id: string, target_card_id: string }) {
  const newConn = {
    id: randomUUID(),
    workspace_id: conn.workspace_id,
    source_card_id: conn.source_card_id,
    target_card_id: conn.target_card_id,
    type: 'context_flow'
  }
  
  const stmt = getDB()!.prepare(`
    INSERT INTO connections (id, workspace_id, source_card_id, target_card_id, type)
    VALUES (@id, @workspace_id, @source_card_id, @target_card_id, @type)
  `)
  stmt.run(newConn)
  return newConn
}

export function deleteConnection(id: string) {
  const stmt = getDB()!.prepare('DELETE FROM connections WHERE id = ?')
  stmt.run(id)
}

// Messages
export interface Message {
  id: string
  card_id: string
  parent_id: string | null
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: number
}

export function getMessages(cardId: string): Message[] {
  // Return all messages for the card. The frontend will reconstruct the tree/thread.
  const stmt = getDB()!.prepare('SELECT * FROM messages WHERE card_id = ? ORDER BY created_at ASC')
  return stmt.all(cardId) as Message[]
}

export function createMessage(msg: { card_id: string, role: string, content: string, parent_id?: string | null }): Message {
  const newMessage: Message = {
    id: randomUUID(),
    card_id: msg.card_id,
    parent_id: msg.parent_id || null,
    role: msg.role as 'user' | 'assistant' | 'system',
    content: msg.content,
    created_at: Math.floor(Date.now() / 1000)
  }

  const stmt = getDB()!.prepare(`
    INSERT INTO messages (id, card_id, parent_id, role, content, created_at)
    VALUES (@id, @card_id, @parent_id, @role, @content, @created_at)
  `)
  stmt.run(newMessage)
  
  // Update card's active leaf if needed (simple logic for now: always update to latest)
  // In a real tree UI, this would depend on where the user is replying.
  const updateCard = getDB()!.prepare('UPDATE cards SET active_leaf_message_id = ? WHERE id = ?')
  updateCard.run(newMessage.id, msg.card_id)

  return newMessage
}

export function updateMessageContent(id: string, content: string) {
  // Note: messages table doesn't have an 'updated_at' column in current schema.
  // Update only the content so the streaming chunks persist.
  const stmt = getDB()!.prepare('UPDATE messages SET content = ? WHERE id = ?')
  stmt.run(content, id)
}

export function deleteMessage(id: string) {
  const stmt = getDB()!.prepare('DELETE FROM messages WHERE id = ?')
  stmt.run(id)
}

// Delete all messages that come after a specific message in a card (for re-send from edit)
export function deleteMessagesAfter(cardId: string, messageId: string): string[] {
  const db = getDB()!

  // Use a recursive CTE to find all descendants of the given message (children, grandchildren, ...)
  // We will return the list of deleted ids (excluding the root messageId) so callers can update UI/history.
  const descendantsStmt = db.prepare(`
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM messages WHERE id = ?
      UNION ALL
      SELECT m.id FROM messages m JOIN descendants d ON m.parent_id = d.id
    )
    SELECT id FROM descendants WHERE id != ?
  `)

  const toDelete = descendantsStmt.all(messageId, messageId) as { id: string }[]
  const deletedIds = toDelete.map(m => m.id)

  if (deletedIds.length > 0) {
    // Ensure we only delete messages belonging to this card (safe-guard)
    const placeholders = deletedIds.map(() => '?').join(',')
    db.prepare(`DELETE FROM messages WHERE id IN (${placeholders}) AND card_id = ?`).run(...deletedIds, cardId)
  }

  // Update card's active_leaf_message_id to the reference message (since everything after it is gone)
  db.prepare('UPDATE cards SET active_leaf_message_id = ? WHERE id = ?').run(messageId, cardId)

  return deletedIds
}

export function getCardSummary(cardId: string): { id: string, title: string, summary: string } | null {
  const stmt = getDB()!.prepare('SELECT id, title, summary FROM cards WHERE id = ?')
  return stmt.get(cardId) as { id: string, title: string, summary: string } | null
}

export function getAllCardsSummary(workspaceId: string): Array<{ id: string, title: string, summary: string }> {
  const stmt = getDB()!.prepare('SELECT id, title, summary FROM cards WHERE workspace_id = ?')
  return stmt.all(workspaceId) as Array<{ id: string, title: string, summary: string }>
}

// --- Export / Import helpers ---

export function exportWorkspace(workspaceId: string) {
  const database = getDB()!

  const workspace = getWorkspace(workspaceId)
  if (!workspace) throw new Error('Workspace not found')

  const cards = database.prepare('SELECT * FROM cards WHERE workspace_id = ?').all(workspaceId) as Card[]
  const connections = database.prepare('SELECT * FROM connections WHERE workspace_id = ?').all(workspaceId)

  // Gather messages and summaries for every card
  const messages: any[] = []
  const summaries: any[] = []

  for (const c of cards) {
    const cardMsgs = database.prepare('SELECT * FROM messages WHERE card_id = ? ORDER BY created_at ASC').all(c.id)
    for (const m of cardMsgs) messages.push(m)

    const cardSummaries = database.prepare('SELECT * FROM summaries WHERE card_id = ? ORDER BY created_at ASC').all(c.id)
    for (const s of cardSummaries) summaries.push(s)
  }

  const exportPayload = {
    version: 1,
    type: 'workspace-export',
    exported_at: Math.floor(Date.now() / 1000),
    workspace,
    cards,
    connections,
    messages,
    summaries
  }

  return exportPayload
}

// Import workspace data. Options: keepIds = try to keep incoming ids (if they don't conflict), overwrite = replace existing workspace with same id
export function importWorkspaceData(payload: any, options?: { keepIds?: boolean, overwrite?: boolean }) {
  const database = getDB()!
  let importedWorkspaceId: string | null = null
  const tx = database.transaction((p: any) => {
    if (!p || p.type !== 'workspace-export') throw new Error('Invalid import payload')

    const originalWorkspace = p.workspace
    if (!originalWorkspace) throw new Error('No workspace in payload')

    // If overwrite requested and workspace exists, delete it first
    const existing = database.prepare('SELECT id FROM workspaces WHERE id = ?').get(originalWorkspace.id)
    if (existing && options?.overwrite) {
      database.prepare('DELETE FROM workspaces WHERE id = ?').run(originalWorkspace.id)
    }

    // Determine new workspace id to use
    let targetWorkspaceId = originalWorkspace.id
    if (existing && !options?.overwrite) {
      // Conflict — generate new workspace id
      const { randomUUID } = require('node:crypto')
      targetWorkspaceId = randomUUID()
    }

    // Insert the workspace row
    database.prepare('INSERT INTO workspaces (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      targetWorkspaceId,
      options?.keepIds ? originalWorkspace.name : originalWorkspace.name,
      originalWorkspace.description || null,
      originalWorkspace.created_at || Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000)
    )

    // ID mappings for remapping references if IDs are changed
    const idMap: Record<string, string> = {}
    idMap[originalWorkspace.id] = targetWorkspaceId

    importedWorkspaceId = targetWorkspaceId

    // Cards
    for (const c of p.cards || []) {
      const newCardId = (options?.keepIds && !database.prepare('SELECT id FROM cards WHERE id = ?').get(c.id)) ? c.id : require('node:crypto').randomUUID()
      idMap[c.id] = newCardId
      database.prepare(`INSERT INTO cards (id, workspace_id, title, summary, status, x, y, width, height, active_leaf_message_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(newCardId, targetWorkspaceId, c.title || 'Untitled', c.summary || '', c.status || 'todo', c.x || 0, c.y || 0, c.width || 300, c.height || 200, null, c.created_at || Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000))
    }

    // Messages: insert messages with remapped card_id and parent_id
    for (const m of p.messages || []) {
      const newMsgId = (options?.keepIds && !database.prepare('SELECT id FROM messages WHERE id = ?').get(m.id)) ? m.id : require('node:crypto').randomUUID()
      idMap[m.id] = newMsgId
    }

    // Now insert messages in order (by created_at) using mapping
    const orderedMessages = (p.messages || []).slice().sort((a: any, b: any) => (a.created_at || 0) - (b.created_at || 0))
    for (const m of orderedMessages) {
      const mappedCardId = idMap[m.card_id] || m.card_id
      const mappedParentId = m.parent_id ? (idMap[m.parent_id] || m.parent_id) : null
      const mappedId = idMap[m.id]
      database.prepare(`INSERT INTO messages (id, card_id, parent_id, role, content, model_provider, model_name, token_usage, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(mappedId, mappedCardId, mappedParentId, m.role, m.content, m.model_provider || null, m.model_name || null, m.token_usage || null, m.created_at || Math.floor(Date.now() / 1000))
    }

    // Connections: insert with remapped card ids
    for (const c of p.connections || []) {
      const newConnId = (options?.keepIds && !database.prepare('SELECT id FROM connections WHERE id = ?').get(c.id)) ? c.id : require('node:crypto').randomUUID()
      const mappedSource = idMap[c.source_card_id] || c.source_card_id
      const mappedTarget = idMap[c.target_card_id] || c.target_card_id
      database.prepare(`INSERT INTO connections (id, workspace_id, source_card_id, target_card_id, type, path_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(newConnId, targetWorkspaceId, mappedSource, mappedTarget, c.type || 'context_flow', c.path_data || null, c.created_at || Math.floor(Date.now() / 1000))
    }

    // Summaries: remap card_id
    for (const s of p.summaries || []) {
      const newSumId = (options?.keepIds && !database.prepare('SELECT id FROM summaries WHERE id = ?').get(s.id)) ? s.id : require('node:crypto').randomUUID()
      const mappedCard = idMap[s.card_id] || s.card_id
      database.prepare(`INSERT INTO summaries (id, card_id, content, created_at, source) VALUES (?, ?, ?, ?, ?)`)
        .run(newSumId, mappedCard, s.content, s.created_at || Math.floor(Date.now() / 1000), s.source || 'ai_auto')
    }

  })

  tx(payload)

  return importedWorkspaceId
}

// --- Workspace (Knowledge Base) Methods ---

export interface Workspace {
  id: string
  name: string
  description: string | null
  created_at: number
  updated_at: number
}

// Get all workspaces
export function getWorkspaces(): Workspace[] {
  const stmt = getDB()!.prepare('SELECT * FROM workspaces ORDER BY updated_at DESC')
  return stmt.all() as Workspace[]
}

// Get a single workspace by ID
export function getWorkspace(id: string): Workspace | null {
  const stmt = getDB()!.prepare('SELECT * FROM workspaces WHERE id = ?')
  return (stmt.get(id) as Workspace) || null
}

// Create a new workspace
export function createWorkspace(data: { name: string, description?: string }): Workspace {
  const id = randomUUID()
  const stmt = getDB()!.prepare(`
    INSERT INTO workspaces (id, name, description)
    VALUES (?, ?, ?)
  `)
  stmt.run(id, data.name, data.description || null)
  return getWorkspace(id)!
}

// Update workspace
export function updateWorkspace(id: string, data: { name?: string, description?: string }) {
  const updates: string[] = []
  const params: any[] = []
  
  if (data.name !== undefined) {
    updates.push('name = ?')
    params.push(data.name)
  }
  if (data.description !== undefined) {
    updates.push('description = ?')
    params.push(data.description)
  }
  
  if (updates.length === 0) return
  
  updates.push('updated_at = unixepoch()')
  params.push(id)
  
  const stmt = getDB()!.prepare(`
    UPDATE workspaces SET ${updates.join(', ')} WHERE id = ?
  `)
  stmt.run(...params)
}

// Delete workspace (cascade will remove all cards, connections, messages)
export function deleteWorkspace(id: string) {
  const stmt = getDB()!.prepare('DELETE FROM workspaces WHERE id = ?')
  stmt.run(id)
}

// Workspaces (Simple helper for backwards compatibility)
export function getOrCreateDefaultWorkspace(): string {
  const db = getDB()!
  const stmt = db.prepare('SELECT id FROM workspaces LIMIT 1')
  const row = stmt.get() as { id: string } | undefined
  
  if (row) return row.id
  
  const id = randomUUID()
  db.prepare('INSERT INTO workspaces (id, name) VALUES (?, ?)').run(id, 'Default Universe')
  return id
}

// --- Settings Methods ---

export function getSetting(key: string): string | null {
  const stmt = getDB()!.prepare('SELECT value FROM settings WHERE key = ?')
  const row = stmt.get(key) as { value: string } | undefined
  return row ? row.value : null
}

export function saveSetting(key: string, value: string) {
  const stmt = getDB()!.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = unixepoch()
  `)
  stmt.run(key, value)
}

export function getAllSettings(): Record<string, string> {
  const stmt = getDB()!.prepare('SELECT key, value FROM settings')
  const rows = stmt.all() as { key: string, value: string }[]
  const settings: Record<string, string> = {}
  for (const row of rows) {
    settings[row.key] = row.value
  }
  return settings
}
