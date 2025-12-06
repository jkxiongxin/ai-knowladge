// Shared Types (Should match Electron types)
// In a real project, we'd share these via a shared package or file.
// For now, we duplicate for simplicity in this prototype.

export interface GeneratedTreeNode {
  title: string
  summary: string
  children?: GeneratedTreeNode[]
}

export interface Workspace {
  id: string
  name: string
  description: string | null
  created_at: number
  updated_at: number
}

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

// API Wrapper
export const electronApi = {
  // Workspaces (Knowledge Bases)
  getDefaultWorkspace: (): Promise<string> => {
    console.log('window.ipcRenderer:', window.ipcRenderer)
    if (!window.ipcRenderer) {
      console.error('ipcRenderer is not available on window object')
      return Promise.reject(new Error('ipcRenderer not available'))
    }
    return window.ipcRenderer.invoke('get-default-workspace')
  },

  getWorkspaces: (): Promise<Workspace[]> => {
    return window.ipcRenderer.invoke('get-workspaces')
  },

  getWorkspace: (id: string): Promise<Workspace | null> => {
    return window.ipcRenderer.invoke('get-workspace', id)
  },

  createWorkspace: (data: { name: string, description?: string }): Promise<Workspace> => {
    return window.ipcRenderer.invoke('create-workspace', data)
  },

  // Generate AI tree structure for workspace
  generateWorkspaceTree: (description: string, provider?: string, modelId?: string): Promise<{ success: boolean, tree: GeneratedTreeNode[] }> => {
    return window.ipcRenderer.invoke('generate-workspace-tree', { description, provider, modelId })
  },

  // Create workspace with AI-generated tree
  createWorkspaceWithTree: (data: { name: string, description?: string, tree: GeneratedTreeNode[] }): Promise<{ success: boolean, workspace: Workspace }> => {
    return window.ipcRenderer.invoke('create-workspace-with-tree', data)
  },

  updateWorkspace: (id: string, data: { name?: string, description?: string }): Promise<void> => {
    return window.ipcRenderer.invoke('update-workspace', { id, data })
  },

  deleteWorkspace: (id: string): Promise<void> => {
    return window.ipcRenderer.invoke('delete-workspace', id)
  },

  // Cards
  getCards: (workspaceId: string): Promise<Card[]> => {
    return window.ipcRenderer.invoke('get-cards', workspaceId)
  },

  createCard: (card: Partial<Card> & { workspace_id: string, x: number, y: number }): Promise<Card> => {
    return window.ipcRenderer.invoke('create-card', card)
  },

  updateCardPosition: (id: string, x: number, y: number): Promise<void> => {
    return window.ipcRenderer.invoke('update-card-position', { id, x, y })
  },

  updateCardTitle: (id: string, title: string): Promise<void> => {
    return window.ipcRenderer.invoke('update-card-title', { id, title })
  },

  updateCardSummary: (id: string, summary: string): Promise<void> => {
    return window.ipcRenderer.invoke('update-card-summary', { id, summary })
  },

  deleteCard: (id: string): Promise<void> => {
    return window.ipcRenderer.invoke('delete-card', id)
  },

  // Connections
  getConnections: (workspaceId: string): Promise<Connection[]> => {
    return window.ipcRenderer.invoke('get-connections', workspaceId)
  },

  createConnection: (conn: { workspace_id: string, source_card_id: string, target_card_id: string }): Promise<Connection> => {
    return window.ipcRenderer.invoke('create-connection', conn)
  },

  deleteConnection: (id: string): Promise<void> => {
    return window.ipcRenderer.invoke('delete-connection', id)
  },

  // Messages
  getMessages: (cardId: string): Promise<Message[]> => {
    return window.ipcRenderer.invoke('get-messages', cardId)
  },

  createMessage: (msg: { card_id: string, role: string, content: string, parent_id?: string | null }): Promise<any> => {
    return window.ipcRenderer.invoke('create-message', msg)
  },

  // Settings
  getSettings: (): Promise<Record<string, string>> => {
    return window.ipcRenderer.invoke('get-settings')
  },

  saveSetting: (key: string, value: string): Promise<void> => {
    return window.ipcRenderer.invoke('save-setting', { key, value })
  },

  generateAIResponse: (params: { cardId: string, userMessage: string, history: Message[] }): Promise<Message> => {
    return window.ipcRenderer.invoke('generate-ai-response', params)
  },

  generateCardSummary: (cardId: string): Promise<string> => {
    return window.ipcRenderer.invoke('generate-card-summary', { cardId })
  },

  // Model Management
  getOllamaModels: (baseUrl?: string): Promise<Array<{ name: string; size: number; modified_at: string }>> => {
    return window.ipcRenderer.invoke('get-ollama-models', baseUrl)
  },

  getOpenAIModels: (apiKey: string, baseUrl?: string): Promise<Array<{ id: string; object: string; created: number; owned_by: string }>> => {
    return window.ipcRenderer.invoke('get-openai-models', { apiKey, baseUrl })
  },

  getDeepSeekModels: (apiKey: string): Promise<Array<{ id: string; object: string; created: number; owned_by: string }>> => {
    return window.ipcRenderer.invoke('get-deepseek-models', { apiKey })
  },

  getAnthropicModels: (apiKey: string): Promise<Array<{ id: string; object: string; created: number; owned_by: string }>> => {
    return window.ipcRenderer.invoke('get-anthropic-models', { apiKey })
  },

  getCerebrasModels: (apiKey: string): Promise<Array<{ id: string; object: string; created: number; owned_by: string }>> => {
    return window.ipcRenderer.invoke('get-cerebras-models', { apiKey })
  },

  getDashScopeModels: (apiKey: string): Promise<Array<{ id: string; object: string; created: number; owned_by: string }>> => {
    return window.ipcRenderer.invoke('get-dashscope-models', { apiKey })
  }

  ,
  updateCardSize: (id: string, width: number, height: number): Promise<void> => {
    return window.ipcRenderer.invoke('update-card-size', { id, width, height })
  },

  // Message editing
  updateMessageContent: (id: string, content: string): Promise<void> => {
    return window.ipcRenderer.invoke('update-message-content', { id, content })
  },

  deleteMessage: (id: string): Promise<void> => {
    return window.ipcRenderer.invoke('delete-message', id)
  },

  deleteMessagesAfter: (cardId: string, messageId: string): Promise<string[]> => {
    return window.ipcRenderer.invoke('delete-messages-after', { cardId, messageId })
  },

  // Card reference for chat context
  getCardSummary: (cardId: string): Promise<{ id: string, title: string, summary: string } | null> => {
    return window.ipcRenderer.invoke('get-card-summary', cardId)
  },

  // Get all cards for reference picker
  getAllCards: (workspaceId: string): Promise<Array<{ id: string, title: string, summary: string }>> => {
    return window.ipcRenderer.invoke('get-all-cards-summary', workspaceId)
  }

  ,

  // Export / Import (Backup & Restore)
  exportWorkspace: (workspaceId: string): Promise<{ success?: boolean, canceled?: boolean, filePath?: string }> => {
    return window.ipcRenderer.invoke('export-workspace', { workspaceId })
  },

  importWorkspace: (opts?: { filePath?: string, keepIds?: boolean, overwrite?: boolean }): Promise<{ success?: boolean, canceled?: boolean, workspaceId?: string }> => {
    return window.ipcRenderer.invoke('import-workspace', opts || {})
  },

  exportDatabase: (): Promise<{ success?: boolean, canceled?: boolean, filePath?: string }> => {
    return window.ipcRenderer.invoke('export-db-file')
  },

  importDatabase: (): Promise<{ success?: boolean, canceled?: boolean, filePath?: string, backup?: string }> => {
    return window.ipcRenderer.invoke('import-db-file')
  }
}

export interface Message {
  id: string
  card_id: string
  parent_id: string | null
  role: 'user' | 'assistant' | 'system'
  content: string
  // Local-only flag used by renderer to indicate the message is still streaming
  isStreaming?: boolean
  created_at: number
}
