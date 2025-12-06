import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { dialog } from 'electron'
import { 
  initDB, 
  getCards, 
  createCard, 
  updateCardPosition, 
  updateCardTitle, 
  updateCardSummary,
  deleteCard,
  getConnections,
  createConnection,
  deleteConnection,
  getOrCreateDefaultWorkspace,
  getWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getMessages,
  createMessage,
  updateMessageContent,
  updateCardDimensions,
  getAllSettings,
  getSetting,
  exportWorkspace,
  importWorkspaceData,
  getDBPath,
  closeDB,
  saveSetting,
  deleteMessage,
  deleteMessagesAfter,
  getCardSummary,
  getAllCardsSummary
} from './db'
import { getUpstreamContext, buildSystemPrompt } from './context'
import { callLLM, generateSummary, generateWorkspaceTree, type GeneratedTreeNode } from './llm'

// The built directory structure
//
// ├─┬─ dist
// │ ├─ index.html
// │ ├─ assets
// │ └─ ...
// ├─┬─ dist-electron
// │ ├─ main.js
// │ └─ preload.js
//
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')

let win: BrowserWindow | null
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js')
  console.log('Preload path:', preloadPath)
  
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Scribble Style: maybe transparent or frame-less later?
    // frame: false, 
    backgroundColor: '#fdfbf7', // Match our "paper" color
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    // Dev server (during development)
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // Packaged app — try to load an unpacked copy of the built renderer
    // Files inside `app.asar` are not accessible via `file://` in the renderer, so
    // we prefer the unpacked location (app.asar.unpacked) when available.
    const packagedIndex = path.join(process.env.DIST || '', 'index.html')

    // app.isPackaged apps usually place unpacked files under `resources/app.asar.unpacked`
    const unpackedIndex = path.join(app.getAppPath().replace(/app\.asar(\/|$)/, ''), 'app.asar.unpacked', 'dist', 'index.html')

    // Try unpacked first (works when build uses asarUnpack for dist)
    if (fs.existsSync(unpackedIndex)) {
      win.loadFile(unpackedIndex)
    } else if (fs.existsSync(packagedIndex)) {
      // fallback: try the path derived from process.env.DIST (may point inside app.asar)
      try {
        win.loadFile(packagedIndex)
      } catch (e) {
        console.error('Failed to load packaged index via loadFile:', packagedIndex, e)
        // show readable error in renderer via fallback URL with file:// so it's explicit
        const url = `file://${packagedIndex}`
        win.loadURL(url)
      }
    } else {
      // Final fallback: attempt to load from resources directory
      const resourcesIndex = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'index.html')
      if (fs.existsSync(resourcesIndex)) {
        win.loadFile(resourcesIndex)
      } else {
        console.error('Cannot find index.html to load. Paths tried:', { unpackedIndex, packagedIndex, resourcesIndex })
        // Open devtools so users can inspect, and load a minimal content explaining error
        win.loadURL('data:text/html,Error: cannot find index.html in packaged app. Check packaging settings (asarUnpack).')
      }
    }
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  initDB()
  createWindow()

  // --- IPC Handlers ---
  
  // Workspaces
  ipcMain.handle('get-default-workspace', () => {
    return getOrCreateDefaultWorkspace()
  })

  ipcMain.handle('get-workspaces', () => {
    return getWorkspaces()
  })

  // --- Export / Import (Backup & Restore) ---
  ipcMain.handle('export-workspace', async (_, { workspaceId }: { workspaceId: string }) => {
    try {
      const payload = exportWorkspace(workspaceId)
      const ws = payload.workspace || { name: 'workspace' }
      const opts = {
        defaultPath: `${ws.name || 'workspace'}.scribbleflow.kb.json`,
        buttonLabel: '导出'
      }
      const res = await dialog.showSaveDialog(win!, opts as any)
      if (res.canceled || !res.filePath) return { canceled: true }
      fs.writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf-8')
      return { success: true, filePath: res.filePath }
    } catch (err: any) {
      console.error('Export workspace failed:', err)
      throw new Error(`导出失败: ${err.message}`)
    }
  })

  ipcMain.handle('import-workspace', async (_, opts: { filePath?: string, keepIds?: boolean, overwrite?: boolean }) => {
    try {
      let fileToImport = opts.filePath
      if (!fileToImport) {
        const res = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'ScribbleFlow JSON', extensions: ['json'] }] })
        if (res.canceled || !res.filePaths || res.filePaths.length === 0) return { canceled: true }
        fileToImport = res.filePaths[0]
      }

      const raw = fs.readFileSync(fileToImport, 'utf-8')
      const payload = JSON.parse(raw)

      const newWorkspaceId = importWorkspaceData(payload, { keepIds: !!opts.keepIds, overwrite: !!opts.overwrite })
      return { success: true, workspaceId: newWorkspaceId }
    } catch (err: any) {
      console.error('Import workspace failed:', err)
      throw new Error(`导入失败: ${err.message}`)
    }
  })

  ipcMain.handle('export-db-file', async () => {
    try {
      const sourcePath = getDBPath()
      const res = await dialog.showSaveDialog(win!, { defaultPath: 'scribbleflow.db', buttonLabel: '导出数据库' } as any)
      if (res.canceled || !res.filePath) return { canceled: true }
      fs.copyFileSync(sourcePath, res.filePath)
      return { success: true, filePath: res.filePath }
    } catch (err: any) {
      console.error('Export DB failed:', err)
      throw new Error(`导出数据库失败: ${err.message}`)
    }
  })

  ipcMain.handle('import-db-file', async () => {
    try {
      const res = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }] })
      if (res.canceled || !res.filePaths || res.filePaths.length === 0) return { canceled: true }
      const src = res.filePaths[0]

      // Backup current DB
      const dest = getDBPath()
      const backupPath = `${dest}.bak.${Date.now()}`
      try {
        await fs.promises.copyFile(dest, backupPath)
      } catch (e) {
        console.warn('DB backup failed, continuing:', e)
      }

      // Close, replace and re-init
      closeDB()
      await fs.promises.copyFile(src, dest)
      initDB()

      return { success: true, filePath: dest, backup: backupPath }
    } catch (err: any) {
      console.error('Import DB failed:', err)
      throw new Error(`导入数据库失败: ${err.message}`)
    }
  })

  ipcMain.handle('get-workspace', (_, id: string) => {
    return getWorkspace(id)
  })

  ipcMain.handle('create-workspace', (_, data: { name: string, description?: string }) => {
    return createWorkspace(data)
  })

  // Generate AI tree structure for new workspace
  ipcMain.handle('generate-workspace-tree', async (_, { description, provider, modelId }: { description: string, provider?: string, modelId?: string }) => {
    try {
      const tree = await generateWorkspaceTree(description, { provider, modelId })
      return { success: true, tree }
    } catch (err: any) {
      console.error('Failed to generate workspace tree:', err)
      throw new Error(`生成知识树失败: ${err.message}`)
    }
  })

  // Create workspace with AI-generated tree structure
  ipcMain.handle('create-workspace-with-tree', async (_, data: { name: string, description?: string, tree: GeneratedTreeNode[] }) => {
    try {
      // 1. Create workspace
      const workspace = createWorkspace({ name: data.name, description: data.description })
      
      // 2. Create cards from tree recursively
      const cardIdMap: Record<string, string> = {}
      let xOffset = 0
      const ySpacing = 250
      const xSpacing = 350
      
      async function createCardsFromTree(nodes: GeneratedTreeNode[], parentId: string | null, depth: number, yBase: number): Promise<void> {
        let y = yBase
        for (const node of nodes) {
          const x = depth * xSpacing + 100
          const card = createCard({
            workspace_id: workspace.id,
            x,
            y,
            title: node.title,
            summary: node.summary,
            status: 'todo'
          })
          cardIdMap[node.title] = card.id
          
          // Connect to parent if exists
          if (parentId) {
            createConnection({
              workspace_id: workspace.id,
              source_card_id: parentId,
              target_card_id: card.id
            })
          }
          
          // Process children
          if (node.children && node.children.length > 0) {
            await createCardsFromTree(node.children, card.id, depth + 1, y)
          }
          
          y += ySpacing
        }
      }
      
      await createCardsFromTree(data.tree, null, 0, 100)
      
      return { success: true, workspace }
    } catch (err: any) {
      console.error('Failed to create workspace with tree:', err)
      throw new Error(`创建知识库失败: ${err.message}`)
    }
  })

  ipcMain.handle('update-workspace', (_, { id, data }) => {
    return updateWorkspace(id, data)
  })

  ipcMain.handle('delete-workspace', (_, id: string) => {
    return deleteWorkspace(id)
  })

  // Cards
  ipcMain.handle('get-cards', (_, workspaceId: string) => {
    return getCards(workspaceId)
  })

  ipcMain.handle('create-card', (_, cardData) => {
    return createCard(cardData)
  })

  ipcMain.handle('update-card-position', (_, { id, x, y }) => {
    return updateCardPosition(id, x, y)
  })

  ipcMain.handle('update-card-title', (_, { id, title }) => {
    return updateCardTitle(id, title)
  })

  ipcMain.handle('delete-card', (_, id) => {
    return deleteCard(id)
  })

  // Connections
  ipcMain.handle('get-connections', (_, workspaceId: string) => {
    return getConnections(workspaceId)
  })

  ipcMain.handle('create-connection', (_, connData) => {
    return createConnection(connData)
  })

  ipcMain.handle('delete-connection', (_, id) => {
    return deleteConnection(id)
  })

  // Messages
  ipcMain.handle('get-messages', (_, cardId: string) => {
    return getMessages(cardId)
  })

  ipcMain.handle('create-message', (_, msgData) => {
    return createMessage(msgData)
  })

  ipcMain.handle('update-message-content', (_, { id, content }) => {
    return updateMessageContent(id, content)
  })

  ipcMain.handle('delete-message', (_, id) => {
    return deleteMessage(id)
  })

  ipcMain.handle('delete-messages-after', (_, { cardId, messageId }) => {
    return deleteMessagesAfter(cardId, messageId)
  })

  ipcMain.handle('get-card-summary', (_, cardId) => {
    return getCardSummary(cardId)
  })

  ipcMain.handle('get-all-cards-summary', (_, workspaceId) => {
    return getAllCardsSummary(workspaceId)
  })

  ipcMain.handle('update-card-summary', (_, { id, summary }) => {
    return updateCardSummary(id, summary)
  })

  // Manual summary generation for a card
  ipcMain.handle('generate-card-summary', async (_, { cardId }) => {
    try {
      const fullHistory = getMessages(cardId)
      const summary = await generateSummary(fullHistory as any)
      updateCardSummary(cardId, summary)
      return summary
    } catch (err: any) {
      console.error('Summary generation failed:', err)
      throw err
    }
  })

  // Update card dimensions (width/height) after user resize
  ipcMain.handle('update-card-size', (_, { id, width, height }) => {
    return updateCardDimensions(id, width, height)
  })

  // Model Management
  ipcMain.handle('get-ollama-models', async (_, baseUrl) => {
    try {
      const defaultUrl = 'http://localhost:11434'
      const targetUrl = baseUrl || defaultUrl
      
      const response = await fetch(`${targetUrl}/api/tags`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.models || []
    } catch (error: any) {
      console.error('Failed to fetch Ollama models:', error)
      throw new Error(`获取 Ollama 模型失败: ${error.message}`)
    }
  })

  ipcMain.handle('get-openai-models', async (_, { apiKey, baseUrl }) => {
    try {
      const targetUrl = baseUrl || 'https://api.openai.com/v1'
      
      const response = await fetch(`${targetUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.data || []
    } catch (error: any) {
      console.error('Failed to fetch OpenAI models:', error)
      throw new Error(`获取 OpenAI 模型失败: ${error.message}`)
    }
  })

  ipcMain.handle('get-deepseek-models', async (_, { apiKey }) => {
    try {
      const response = await fetch('https://api.deepseek.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.data || []
    } catch (error: any) {
      console.error('Failed to fetch DeepSeek models:', error)
      throw new Error(`获取 DeepSeek 模型失败: ${error.message}`)
    }
  })

  ipcMain.handle('get-anthropic-models', async (_, { apiKey }) => {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'test' }]
        })
      })
      
      // Anthropic doesn't have a models endpoint, so we return known models
      return [
        { id: 'claude-3-5-sonnet-20241022', object: 'model', created: 1728393600, owned_by: 'anthropic' },
        { id: 'claude-3-5-haiku-20241022', object: 'model', created: 1728393600, owned_by: 'anthropic' },
        { id: 'claude-3-opus-20240229', object: 'model', created: 1708406400, owned_by: 'anthropic' }
      ]
    } catch (error: any) {
      console.error('Failed to fetch Anthropic models:', error)
      throw new Error(`获取 Anthropic 模型失败: ${error.message}`)
    }
  })

  ipcMain.handle('get-cerebras-models', async (_, { apiKey }) => {
    try {
      const response = await fetch('https://api.cerebras.ai/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.data || []
    } catch (error: any) {
      console.error('Failed to fetch Cerebras models:', error)
      throw new Error(`获取 Cerebras 模型失败: ${error.message}`)
    }
  })

  ipcMain.handle('get-dashscope-models', async (_, { apiKey }) => {
    try {
      const response = await fetch('https://api-inference.modelscope.cn/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          // ModelScope / DashScope accepts token in 'x-modelscope-token' header in some setups.
          'x-modelscope-token': apiKey
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.data || []
    } catch (error: any) {
      console.error('Failed to fetch DashScope models:', error)
      throw new Error(`获取 DashScope 模型失败: ${error.message}`)
    }
  })

  // AI Generation
  ipcMain.handle('generate-ai-response', async (_, { cardId, userMessage, history }) => {
    try {
          // 1. Get Context
          const contextNodes = getUpstreamContext(cardId)
          let systemPrompt = buildSystemPrompt(contextNodes)

          // Respect per-card setting: whether we should include the current card's summary
          try {
            const includeKey = `cardIncludeSummaryInContext:${cardId}`
            const raw = getSetting(includeKey)
            // default to true if not set
            const includeCurrent = raw === null || raw === undefined ? true : (raw === 'true')
            if (includeCurrent) {
              const current = getCardSummary(cardId)
              if (current && (current.summary || current.title)) {
                // Prepend the current card summary so the assistant knows the current node facts
                const heading = `--- 当前卡片 (${current.title}) 摘要 ---\n`
                systemPrompt = `${heading}${current.summary || current.title}\n\n` + systemPrompt
              }
            }
          } catch (e) {
            // Non-fatal — if settings or DB read fails, continue with upstream context only
            console.error('Failed to evaluate include-current-summary setting:', e)
          }
      
      // 2. Build Messages Array
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.map((m: any) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ]
      
      // 3. Create an empty assistant message in DB so frontend has an ID to update while streaming
      const lastMsg = getMessages(cardId).pop()
      const aiMsg = createMessage({
        card_id: cardId,
        role: 'assistant',
        content: '',
        parent_id: lastMsg ? lastMsg.id : null
      })

      // 4. Call LLM with a streaming callback. If provider supports streaming we'll get chunks
      //    as the model produces them; otherwise callLLM will still call onProgress with chunked
      //    content to simulate streaming.
      let finalContent = ''
      let sentSoFar = ''

      finalContent = await callLLM(messages as any, async (chunk: string) => {
        try {
          // persist incremental content and notify renderer
          sentSoFar += chunk
          updateMessageContent(aiMsg.id, sentSoFar)
          win?.webContents.send('ai-response-chunk', { cardId, id: aiMsg.id, chunk, done: false, content: sentSoFar })
        } catch (e) {
          console.error('Failed to persist/forward chunk:', e)
        }
      })

      // Ensure final content is persisted and we send the 'done' event
      const responseContent = finalContent || sentSoFar
      updateMessageContent(aiMsg.id, responseContent)
      win?.webContents.send('ai-response-chunk', { cardId, id: aiMsg.id, chunk: '', done: true, content: responseContent })

      // NOTE: We removed auto-summarization here — summaries should be generated manually via the UI.
      
      // Return the message with final content (not the initially empty one)
      return { ...aiMsg, content: responseContent }
    } catch (error: any) {
      console.error('AI Generation Failed:', error)
      // Provide helpful feedback to the front-end. Many errors are provider/auth related.
      const shortMessage = error?.message || 'Unknown LLM error'
      return { 
        id: 'error', 
        role: 'assistant', 
        content: `Error contacting model provider: ${shortMessage}. Check provider settings / API key in Settings.`,
        created_at: Date.now()
      }
    }
  })

  // Receive renderer-side fatal errors so we can persist logs for installed apps
  ipcMain.on('renderer-error', (_, payload: any) => {
    try {
      console.error('[renderer-error]', payload)
      const logDir = app.getPath('userData')
      const out = path.join(logDir, 'renderer-errors.log')
      const line = `[${new Date().toISOString()}] ${JSON.stringify(payload)}\n`
      fs.appendFileSync(out, line)
    } catch (e) {
      console.error('Failed writing renderer error log', e)
    }
  })

  ipcMain.on('open-devtools', () => {
    try {
      win?.webContents.openDevTools({ mode: 'detach' })
    } catch (e) {
      console.error('Failed to open devtools', e)
    }
  })

  // Settings
  ipcMain.handle('get-settings', () => {
    return getAllSettings()
  })

  ipcMain.handle('save-setting', (_, { key, value }) => {
    return saveSetting(key, value)
  })
})
