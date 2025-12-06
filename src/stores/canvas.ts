import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { 
  useVueFlow, 
  type Node, 
  type Edge, 
  type NodeChange, 
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection as FlowConnection
} from '@vue-flow/core'
import { electronApi, type Card, type Connection, type Message } from '@/api'
import { useHistoryStore } from './history'

export const useCanvasStore = defineStore('canvas', () => {
  const historyStore = useHistoryStore()
  
  const workspaceId = ref<string | null>(null)
  
  // We use useVueFlow to get helpers, but we manage the source of truth here
  // actually VueFlow manages its own state, we just need to sync with DB.
  // But for "Local First", we usually load from DB -> VueFlow.
  // And on change -> DB.
  
  const nodes = ref<Node[]>([])
  const edges = ref<Edge[]>([])
  
  const isLoading = ref(false)

  // --- Selection & Clipboard State ---
  const selectedNodeIds = ref<Set<string>>(new Set())
  const clipboard = ref<{ nodes: Node[], edges: Edge[] } | null>(null)

  // --- Chat State ---
  const activeCardId = ref<string | null>(null)
  const isChatOpen = ref(false)
  const messages = ref<Message[]>([])
  const isGenerating = ref(false)
  // Selected messages map per card (for context selection)
  const selectedMessages = ref<Record<string, Set<string>>>({})

  async function initWorkspace(wsId?: string) {
    isLoading.value = true
    try {
      // 1. Use provided workspace ID or get default
      if (wsId) {
        workspaceId.value = wsId
      } else {
        const id = await electronApi.getDefaultWorkspace()
        workspaceId.value = id
      }
      
      // 2. Load Cards & Connections
      await loadCanvas()
    } catch (err) {
      console.error('Failed to init workspace:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function loadCanvas() {
    if (!workspaceId.value) return
    
    const [cardsData, connectionsData] = await Promise.all([
      electronApi.getCards(workspaceId.value),
      electronApi.getConnections(workspaceId.value)
    ])

    // Map DB Cards to VueFlow Nodes
    nodes.value = cardsData.map(card => ({
      id: card.id,
      type: 'scribble', // Custom type we will create
      position: { x: card.x, y: card.y },
      data: { 
        title: card.title, 
        summary: card.summary, 
        status: card.status,
        width: card.width,
        height: card.height
      },
    }))

    // Map DB Connections to VueFlow Edges (directed — show arrow on the target)
    edges.value = connectionsData.map(conn => ({
      id: conn.id,
      source: conn.source_card_id,
      target: conn.target_card_id,
      type: 'default', // or custom
      animated: true,
      style: { stroke: '#2c3e50', strokeWidth: 2 },
      markerEnd: ({
        type: 'arrowclosed',
        color: '#2c3e50'
      } as any)
    }))
  }

  // --- Actions ---

  async function addCard(x: number, y: number, skipHistory = false) {
    console.log('addCard called with coordinates:', { x, y })
    if (!workspaceId.value) {
      console.log('No workspace ID, cannot add card')
      return
    }

    try {
      const newCard = await electronApi.createCard({
        workspace_id: workspaceId.value,
        x,
        y,
        title: 'New Idea',
        status: 'todo'
      })
      console.log('Card created:', newCard)

      const newNode: Node = {
        id: newCard.id,
        type: 'scribble',
        position: { x: newCard.x, y: newCard.y },
        data: { 
          title: newCard.title, 
          summary: newCard.summary, 
          status: newCard.status 
        },
      }
      
      // Optimistic UI update
      nodes.value.push(newNode)
      // Record in canvas history so the action can be undone
      if (!skipHistory) {
        historyStore.pushCanvas({ type: 'node_add', cardId: newCard.id, data: { node: newCard } })
      }
      console.log('Node added to VueFlow:', newNode)
    } catch (error) {
      console.error('Error creating card:', error)
    }
  }

  // Update a card title and persist to DB
  async function updateNodeTitle(id: string, title: string, skipHistory = false) {
    try {
      await electronApi.updateCardTitle(id, title)
      // Update local node data if present
      const node = nodes.value.find(n => n.id === id)
      if (!node) return
      const old = node.data.title
      if (!skipHistory && old !== title) {
        historyStore.pushCanvas({ type: 'node_title', cardId: id, data: { oldTitle: old, newTitle: title } })
      }
      if (node) node.data.title = title
    } catch (err) {
      console.error('Failed to update card title:', err)
    }
  }

  async function updateNodeSummary(id: string, summary: string, skipHistory = false) {
    try {
      await electronApi.updateCardSummary(id, summary)
      const node = nodes.value.find(n => n.id === id)
      if (!node) return
      const old = node.data.summary
      if (!skipHistory && old !== summary) {
        historyStore.pushCanvas({ type: 'node_summary', cardId: id, data: { oldSummary: old, newSummary: summary } })
      }
      if (node) node.data.summary = summary
    } catch (err) {
      console.error('Failed to update card summary:', err)
    }
  }

  async function updateNodeSize(id: string, width: number, height: number, prevWidth?: number, prevHeight?: number, skipHistory = false) {
    try {
      await electronApi.updateCardSize(id, width, height)
      const node = nodes.value.find(n => n.id === id)
      if (node) {
        const oldW = node.data.width || 250
        const oldH = node.data.height || 150
        node.data.width = width
        node.data.height = height

        // push history for resize
        if (!skipHistory) {
          historyStore.pushCanvas({
            type: 'node_resize',
            cardId: id,
            data: { from: { width: prevWidth ?? oldW, height: prevHeight ?? oldH }, to: { width, height } }
          })
        }
      }
    } catch (err) {
      console.error('Failed to update card size:', err)
    }
  }

  async function updateNodeContextMode(id: string, mode: 'summary' | 'all_messages' | 'selected') {
    try {
      await electronApi.saveSetting(`cardContextMode:${id}`, mode)
    } catch (err) {
      console.error('Failed to update card context mode:', err)
    }
  }

  function toggleSelectedMessage(cardId: string, messageId: string) {
    if (!selectedMessages.value[cardId]) selectedMessages.value[cardId] = new Set()
    const set = selectedMessages.value[cardId]
    if (set.has(messageId)) set.delete(messageId)
    else set.add(messageId)
  }

  async function saveSelectedMessagesForContext(cardId: string) {
    const set = selectedMessages.value[cardId] || new Set<string>()
    const arr = Array.from(set)
    try {
      await electronApi.saveSetting(`cardSelectedContext:${cardId}`, JSON.stringify(arr))
    } catch (err) {
      console.error('Failed to save selected context messages:', err)
    }
  }

  async function updateNodePosition(id: string, x: number, y: number, prevX?: number, prevY?: number, skipHistory = false) {
    // record history for movement
    const node = nodes.value.find(n => n.id === id)
    const oldPos = node ? { x: node.position.x, y: node.position.y } : { x: prevX ?? x, y: prevY ?? y }
    if (!skipHistory) {
      historyStore.pushCanvas({ type: 'node_move', cardId: id, data: { from: { x: prevX ?? oldPos.x, y: prevY ?? oldPos.y }, to: { x, y } } })
    }

    // DB Update
    await electronApi.updateCardPosition(id, x, y)

    // Update local cache to keep UI consistent
    if (node) {
      node.position.x = x
      node.position.y = y
    }
  }

  async function connectNodes(params: FlowConnection, skipHistory = false) {
    if (!workspaceId.value) return
    
    const { source, target } = params
    if (!source || !target) return

    // DB Insert
    const newConn = await electronApi.createConnection({
      workspace_id: workspaceId.value,
      source_card_id: source,
      target_card_id: target
    })

    // UI Update (directed)
    edges.value.push({
      id: newConn.id,
      source: newConn.source_card_id,
      target: newConn.target_card_id,
      animated: true,
      style: { stroke: '#2c3e50', strokeWidth: 2 },
      markerEnd: ({ type: 'arrowclosed', color: '#2c3e50' } as any)
    })
    if (!skipHistory) {
      historyStore.pushCanvas({ type: 'edge_add', cardId: newConn.id, data: { edge: newConn } })
    }
  }

  async function removeNode(id: string, skipHistory = false) {
    // stash node and edges for undo
    const node = nodes.value.find(n => n.id === id)
    const connected = edges.value.filter(e => e.source === id || e.target === id)
    if (!skipHistory && node) {
      historyStore.pushCanvas({ type: 'node_remove', cardId: id, data: { node: { id: node.id, position: node.position, data: node.data }, edges: connected } })
    }

    await electronApi.deleteCard(id)
    nodes.value = nodes.value.filter(n => n.id !== id)
    // Also remove connected edges locally (VueFlow might handle this, but good to be explicit)
    edges.value = edges.value.filter(e => e.source !== id && e.target !== id)
  }

  async function removeEdge(id: string, skipHistory = false) {
    const edge = edges.value.find(e => e.id === id)
    if (!skipHistory && edge) historyStore.pushCanvas({ type: 'edge_remove', cardId: id, data: { edge } })

    await electronApi.deleteConnection(id)
    edges.value = edges.value.filter(e => e.id !== id)
  }

  // --- Selection & Copy/Paste ---

  function selectNode(id: string, addToSelection = false) {
    if (!addToSelection) selectedNodeIds.value.clear()
    selectedNodeIds.value.add(id)
  }

  function deselectNode(id: string) {
    selectedNodeIds.value.delete(id)
  }

  function toggleNodeSelection(id: string) {
    if (selectedNodeIds.value.has(id)) selectedNodeIds.value.delete(id)
    else selectedNodeIds.value.add(id)
  }

  function clearSelection() {
    selectedNodeIds.value.clear()
  }

  function selectAll() {
    nodes.value.forEach(n => selectedNodeIds.value.add(n.id))
  }

  function copySelectedNodes() {
    if (selectedNodeIds.value.size === 0) return
    const ids = Array.from(selectedNodeIds.value)
    const nodesToCopy = nodes.value.filter(n => ids.includes(n.id))
    // Also copy edges between selected nodes
    const edgesToCopy = edges.value.filter(e => ids.includes(e.source) && ids.includes(e.target))
    clipboard.value = { nodes: JSON.parse(JSON.stringify(nodesToCopy)), edges: JSON.parse(JSON.stringify(edgesToCopy)) }
  }

  async function pasteNodes(offsetX = 50, offsetY = 50) {
    if (!clipboard.value || !workspaceId.value) return
    const { nodes: copiedNodes, edges: copiedEdges } = clipboard.value
    const idMap: Record<string, string> = {}

    // Create new cards from copied nodes
    for (const n of copiedNodes) {
      const newCard = await electronApi.createCard({
        workspace_id: workspaceId.value,
        x: n.position.x + offsetX,
        y: n.position.y + offsetY,
        title: n.data.title || 'Copy',
        summary: n.data.summary || '',
        status: n.data.status || 'todo'
      })
      idMap[n.id] = newCard.id
      const newNode: Node = {
        id: newCard.id,
        type: 'scribble',
        position: { x: newCard.x, y: newCard.y },
        data: { title: newCard.title, summary: newCard.summary, status: newCard.status, width: newCard.width, height: newCard.height }
      }
      nodes.value.push(newNode)
      historyStore.pushCanvas({ type: 'node_add', cardId: newCard.id, data: { node: newCard } })
    }

    // Create edges using new ids
    for (const e of copiedEdges) {
      const source = idMap[e.source]
      const target = idMap[e.target]
      if (!source || !target) continue
      const newConn = await electronApi.createConnection({ workspace_id: workspaceId.value, source_card_id: source, target_card_id: target })
      edges.value.push({ id: newConn.id, source: newConn.source_card_id, target: newConn.target_card_id, animated: true, style: { stroke: '#2c3e50', strokeWidth: 2 }, markerEnd: ({ type: 'arrowclosed', color: '#2c3e50' } as any) })
      historyStore.pushCanvas({ type: 'edge_add', cardId: newConn.id, data: { edge: newConn } })
    }

    // Select new nodes
    clearSelection()
    Object.values(idMap).forEach(id => selectedNodeIds.value.add(id))
  }

  async function deleteSelectedNodes() {
    const ids = Array.from(selectedNodeIds.value)
    for (const id of ids) {
      await removeNode(id)
    }
    clearSelection()
  }

  // --- Chat Actions ---

  async function openChat(cardId: string) {
    activeCardId.value = cardId
    isChatOpen.value = true
    messages.value = [] // Clear previous
    
    // Load messages
    messages.value = await electronApi.getMessages(cardId)
    // Load any previously saved selection for this card
    try {
      const settings = await electronApi.getSettings()
      const key = `cardSelectedContext:${cardId}`
      if (settings && settings[key]) {
        const ids: string[] = JSON.parse(settings[key])
        selectedMessages.value[cardId] = new Set(ids)
      }
    } catch (e) {
      // ignore
    }
  }

  function closeChat() {
    isChatOpen.value = false
    activeCardId.value = null
  }

  // Edit message content (both user and assistant messages)
  async function editMessageContent(messageId: string, newContent: string) {
    const msg = messages.value.find(m => m.id === messageId)
    if (!msg || !activeCardId.value) return
    
    // Save to history for undo
    historyStore.pushHistory(activeCardId.value, {
      type: 'message_edit',
      cardId: activeCardId.value,
      data: {
        messageId,
        oldContent: msg.content,
        newContent
      }
    })
    
    // Update in DB
    await electronApi.updateMessageContent(messageId, newContent)
    
    // Update local state
    msg.content = newContent
  }

  // Resend from a specific user message (deletes all subsequent messages)
  async function resendFromMessage(messageId: string, newContent?: string) {
    if (!activeCardId.value) return
    
    const msgIndex = messages.value.findIndex(m => m.id === messageId)
    if (msgIndex === -1) return
    
    const msg = messages.value[msgIndex]
    if (msg.role !== 'user') return
    
    // Save deleted messages for undo
    const deletedMessages = messages.value.slice(msgIndex + 1)
    historyStore.pushHistory(activeCardId.value, {
      type: 'message_branch',
      cardId: activeCardId.value,
      data: {
        messageId,
        oldContent: msg.content,
        newContent: newContent || msg.content,
        deletedMessages: deletedMessages.map(m => m.id),
        branchParentId: msg.parent_id || undefined
      }
    })
    
    // Delete subsequent messages from DB
    await electronApi.deleteMessagesAfter(activeCardId.value, messageId)
    
    // Update local messages list
    messages.value = messages.value.slice(0, msgIndex + 1)
    
    // If content changed, update it
    const content = newContent || msg.content
    if (newContent && newContent !== msg.content) {
      await electronApi.updateMessageContent(messageId, newContent)
      msg.content = newContent
    }
    
    // Re-generate AI response
    isGenerating.value = true
    
    try {
      const history = messages.value.slice(0, -1).map(m => ({
        id: m.id,
        card_id: m.card_id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        parent_id: m.parent_id
      }))
      
      const aiMsg = await electronApi.generateAIResponse({
        cardId: activeCardId.value,
        userMessage: content,
        history: history
      })
      
      const existingIndex = messages.value.findIndex(m => m.id === aiMsg.id)
      if (existingIndex >= 0) {
        messages.value[existingIndex] = { ...messages.value[existingIndex], ...aiMsg }
      } else {
        messages.value.push(aiMsg)
      }
    } catch (err) {
      console.error('AI Error', err)
      messages.value.push({
        id: 'err-' + Date.now(),
        card_id: activeCardId.value,
        role: 'assistant',
        content: 'Sorry, I encountered an error connecting to the AI brain.',
        created_at: Date.now() / 1000,
        parent_id: messageId
      })
      isGenerating.value = false
    }
  }

  // Insert card reference into chat context
  async function insertCardReference(cardId: string): Promise<string> {
    const card = await electronApi.getCardSummary(cardId)
    if (!card) return ''
    
    // Format: [Card: Title] Summary content
    return `[参考卡片: ${card.title}]\n${card.summary || '(无摘要)'}`
  }

  // Get all cards for reference picker
  async function getAvailableCards() {
    if (!workspaceId.value) return []
    return await electronApi.getAllCards(workspaceId.value)
  }

  async function sendMessage(content: string) {
    if (!activeCardId.value) return

    // 1. Save User Message
    // Find parent (last message) - simplified for now (linear)
    const lastMsg = messages.value[messages.value.length - 1]
    const parentId = lastMsg ? lastMsg.id : null

    const userMsg = await electronApi.createMessage({
      card_id: activeCardId.value,
      role: 'user',
      content,
      parent_id: parentId
    })
    messages.value.push(userMsg)

    // 2. Call AI (Real)
    isGenerating.value = true
    
    try {
      // Pass history (excluding the new user msg, or including? 
      // The backend logic we wrote expects history to build context.
      // Let's pass the current messages array (which includes the new user msg).
      // But wait, backend logic:
      // const messages = [system, ...history, userMessage]
      // If we pass history including userMessage, and also pass userMessage separately, it duplicates.
      // Let's pass history EXCLUDING the new user message.
      // Convert to plain objects to avoid IPC serialization issues with Vue reactive proxies
      const history = messages.value.slice(0, -1).map(m => ({
        id: m.id,
        card_id: m.card_id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        parent_id: m.parent_id
      }))
      
      const aiMsg = await electronApi.generateAIResponse({
        cardId: activeCardId.value,
        userMessage: content,
        history: history
      })
      
      // If streaming already created the assistant placeholder (via 'ai-response-chunk'), update it instead of pushing duplicate.
      const existingIndex = messages.value.findIndex(m => m.id === aiMsg.id)
      if (existingIndex >= 0) {
        // Merge but don't overwrite content with empty string (streaming may have set it already)
        const existing = messages.value[existingIndex]
        messages.value[existingIndex] = { 
          ...existing, 
          ...aiMsg,
          // Keep existing content if aiMsg.content is empty (defensive)
          content: aiMsg.content || existing.content
        }
      } else {
        messages.value.push(aiMsg)
      }
      // Stay in generating state until final 'done' chunk arrives (handler manages isGenerating)
    } catch (err) {
      console.error('AI Error', err)
      // Add error message locally
      messages.value.push({
        id: 'err-' + Date.now(),
        card_id: activeCardId.value,
        role: 'assistant',
        content: 'Sorry, I encountered an error connecting to the AI brain.',
        created_at: Date.now() / 1000,
        parent_id: userMsg.id
      })
      isGenerating.value = false
    }
  }

  // --- Event Listeners ---
  
  // Listen for summary updates from backend
  if (window.ipcRenderer) {
    // Summary updates
    window.ipcRenderer.on('card-summary-updated', (_: any, data: { id: string, summary: string }) => {
      const node = nodes.value.find(n => n.id === data.id)
      if (node) {
        node.data.summary = data.summary
      }
    })

    // Streaming AI response chunks — update message content progressively
    window.ipcRenderer.on('ai-response-chunk', (_: any, payload: { cardId: string, id: string, chunk: string, done: boolean, content: string }) => {
      // Ensure we are working on the correct card view
      if (!activeCardId.value || activeCardId.value !== payload.cardId) return

      // Find message by id
      const idx = messages.value.findIndex(m => m.id === payload.id)
      if (idx === -1) {
        // If message not found yet, push placeholder (shouldn't happen often)
        messages.value.push({ id: payload.id, card_id: payload.cardId, parent_id: null, role: 'assistant', content: payload.content, created_at: Math.floor(Date.now() / 1000), isStreaming: !payload.done })
      } else {
        // Update content and mark streaming state
        messages.value[idx].content = payload.content
        ;(messages.value[idx] as any).isStreaming = !payload.done
      }

      if (payload.done) {
        // Streaming finished
        isGenerating.value = false
      } else {
        isGenerating.value = true
      }
    })
  }

  // --- Event Handlers for VueFlow ---
  
  function onNodesChange(changes: NodeChange[]) {
    // Apply changes to local state
    nodes.value = applyNodeChanges(changes, nodes.value as any) as any
    
    // Handle specific changes like 'position' dragging end
    // Note: applyNodeChanges handles the immediate visual update.
    // We need to detect when drag ends to save to DB.
    // Usually we listen to @node-drag-stop in the view.
  }

  function onEdgesChange(changes: EdgeChange[]) {
    edges.value = applyEdgeChanges(changes, edges.value as any) as any
  }

  // Canvas-level undo/redo: apply the inverse of the most recent canvas action
  async function undoCanvasAction() {
    const entry = historyStore.popUndoCanvas()
    if (!entry) return

    try {
      switch (entry.type) {
        case 'node_add': {
          const nodeId = entry.cardId || entry.data?.node?.id
          if (nodeId) await removeNode(nodeId, true)
          break
        }
        case 'node_remove': {
          const payload = entry.data || {}
          const nodePayload = payload.node
          if (!nodePayload || !workspaceId.value) break

          // recreate card (note: new id will be created)
          const restored = await electronApi.createCard({
            workspace_id: workspaceId.value,
            x: nodePayload.position.x,
            y: nodePayload.position.y,
            title: nodePayload.data.title,
            summary: nodePayload.data.summary,
            status: nodePayload.data.status
          })

          nodes.value.push({
            id: restored.id,
            type: 'scribble',
            position: { x: restored.x, y: restored.y },
            data: {
              title: restored.title,
              summary: restored.summary,
              status: restored.status,
              width: restored.width,
              height: restored.height
            }
          })

          // restore edges, replacing references to original id with new id
          const oldId = nodePayload.id
          const createdId = restored.id
          const edgesToRestore = payload.edges || []
          for (const e of edgesToRestore) {
            const source = e.source === oldId ? createdId : e.source
            const target = e.target === oldId ? createdId : e.target
            const newConn = await electronApi.createConnection({ workspace_id: workspaceId.value, source_card_id: source, target_card_id: target })
            edges.value.push({ id: newConn.id, source: newConn.source_card_id, target: newConn.target_card_id, animated: true, style: { stroke: '#2c3e50', strokeWidth: 2 }, markerEnd: ({ type: 'arrowclosed', color: '#2c3e50' } as any) })
          }
          break
        }
        case 'node_move': {
          const id = entry.cardId
          const from = entry.data?.from
          if (id && from) await updateNodePosition(id, from.x, from.y, entry.data?.to?.x, entry.data?.to?.y, true)
          break
        }
        case 'node_resize': {
          const id = entry.cardId
          const from = entry.data?.from
          if (id && from) await updateNodeSize(id, from.width, from.height, entry.data?.to?.width, entry.data?.to?.height, true)
          break
        }
        case 'node_title': {
          const id = entry.cardId
          const oldTitle = entry.data?.oldTitle
          if (id) await updateNodeTitle(id, oldTitle, true)
          break
        }
        case 'node_summary': {
          const id = entry.cardId
          const oldSummary = entry.data?.oldSummary
          if (id) await updateNodeSummary(id, oldSummary, true)
          break
        }
        case 'edge_add': {
          const id = entry.cardId || entry.data?.edge?.id
          if (id) await removeEdge(id, true)
          break
        }
        case 'edge_remove': {
          const e = entry.data?.edge
          if (e && workspaceId.value) {
            const newConn = await electronApi.createConnection({ workspace_id: workspaceId.value, source_card_id: e.source, target_card_id: e.target })
            edges.value.push({ id: newConn.id, source: newConn.source_card_id, target: newConn.target_card_id, animated: true, style: { stroke: '#2c3e50', strokeWidth: 2 }, markerEnd: ({ type: 'arrowclosed', color: '#2c3e50' } as any) })
          }
          break
        }
      }
    } catch (err) {
      console.error('Error applying undo canvas action', err)
    }
  }

  async function redoCanvasAction() {
    const entry = historyStore.popRedoCanvas()
    if (!entry) return

    try {
      switch (entry.type) {
        case 'node_add': {
          const node = entry.data?.node
          if (node && workspaceId.value) {
            // Recreate the card and add to canvas (don't push extra history; popRedoCanvas already moved it)
            const created = await electronApi.createCard({
              workspace_id: workspaceId.value,
              x: node.x ?? node.position?.x ?? 0,
              y: node.y ?? node.position?.y ?? 0,
              title: node.title ?? node.data?.title ?? 'New Idea',
              summary: node.summary ?? node.data?.summary ?? '',
              status: node.status ?? node.data?.status ?? 'todo'
            })
            nodes.value.push({
              id: created.id,
              type: 'scribble',
              position: { x: created.x, y: created.y },
              data: { title: created.title, summary: created.summary, status: created.status, width: created.width, height: created.height }
            })
            // Update entry data so future undo/redo works with new id
            entry.cardId = created.id
            entry.data.node = created
          }
          break
        }
        case 'node_remove': {
          const original = entry.data?.node
          if (original) {
            // best-effort find by position & title
            const found = nodes.value.find(n => n.data.title === original.data.title && n.position.x === original.position.x && n.position.y === original.position.y)
            if (found) await removeNode(found.id, true)
          }
          break
        }
        case 'node_move': {
          const id = entry.cardId
          const to = entry.data?.to
          if (id && to) await updateNodePosition(id, to.x, to.y, entry.data?.from?.x, entry.data?.from?.y, true)
          break
        }
        case 'node_resize': {
          const id = entry.cardId
          const to = entry.data?.to
          if (id && to) await updateNodeSize(id, to.width, to.height, entry.data?.from?.width, entry.data?.from?.height, true)
          break
        }
        case 'node_title': {
          const id = entry.cardId
          const newTitle = entry.data?.newTitle
          if (id) await updateNodeTitle(id, newTitle, true)
          break
        }
        case 'node_summary': {
          const id = entry.cardId
          const newSummary = entry.data?.newSummary
          if (id) await updateNodeSummary(id, newSummary, true)
          break
        }
        case 'edge_add': {
          const e = entry.data?.edge
          if (e && workspaceId.value) {
            const source = e.source_card_id ?? e.source
            const target = e.target_card_id ?? e.target
            const created = await electronApi.createConnection({ workspace_id: workspaceId.value, source_card_id: source, target_card_id: target })
            edges.value.push({ id: created.id, source: created.source_card_id, target: created.target_card_id, animated: true, style: { stroke: '#2c3e50', strokeWidth: 2 }, markerEnd: ({ type: 'arrowclosed', color: '#2c3e50' } as any) })
            // Update entry data with new ids
            entry.cardId = created.id
            entry.data.edge = created
          }
          break
        }
        case 'edge_remove': {
          const id = entry.cardId || entry.data?.edge?.id
          if (id) await removeEdge(id, true)
          break
        }
      }
    } catch (err) {
      console.error('Error applying redo canvas action', err)
    }
  }

  return {
    workspaceId,
    nodes,
    edges,
    isLoading,
    initWorkspace,
    addCard,
    updateNodePosition,
    updateNodeTitle,
    updateNodeSummary,
    updateNodeSize,
    updateNodeContextMode,
    toggleSelectedMessage,
    saveSelectedMessagesForContext,
    connectNodes,
    removeNode,
    removeEdge,
    onNodesChange,
    onEdgesChange,
    // canvas undo/redo
    undoCanvasAction,
    redoCanvasAction,
    canUndoCanvas: historyStore.canUndoCanvas,
    canRedoCanvas: historyStore.canRedoCanvas,
    // Selection & Copy/Paste
    selectedNodeIds,
    clipboard,
    selectNode,
    deselectNode,
    toggleNodeSelection,
    clearSelection,
    selectAll,
    copySelectedNodes,
    pasteNodes,
    deleteSelectedNodes,
    // Chat
    activeCardId,
    isChatOpen,
    messages,
    isGenerating,
    selectedMessages,
    openChat,
    closeChat,
    sendMessage,
    editMessageContent,
    resendFromMessage,
    insertCardReference,
    getAvailableCards
  }
})
