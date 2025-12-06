import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface HistoryEntry {
  id: string
  timestamp: number
  type: 'message_edit' | 'message_delete' | 'message_branch' | 'summary_change'
  cardId: string
  data: {
    messageId?: string
    oldContent?: string
    newContent?: string
    deletedMessages?: string[]
    branchParentId?: string
  }
}

export interface CanvasHistoryEntry {
  id: string
  timestamp: number
  type:
    | 'node_add'
    | 'node_remove'
    | 'node_move'
    | 'node_resize'
    | 'node_title'
    | 'node_summary'
    | 'edge_add'
    | 'edge_remove'
  // node id or edge id could be stored in cardId for convenience
  cardId?: string
  data: any
}

export const useHistoryStore = defineStore('history', () => {
  // History stack per card
  const historyStacks = ref<Record<string, HistoryEntry[]>>({})
  const redoStacks = ref<Record<string, HistoryEntry[]>>({})
  
  // Maximum history entries per card
  const MAX_HISTORY = 50

  // Canvas-specific history (global for all canvas actions)
  const canvasHistory = ref<CanvasHistoryEntry[]>([])
  const canvasRedo = ref<CanvasHistoryEntry[]>([])
  const MAX_CANVAS_HISTORY = 300

  function pushCanvas(entry: Omit<CanvasHistoryEntry, 'id' | 'timestamp'>) {
    const newEntry: CanvasHistoryEntry = {
      ...entry,
      id: `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    }
    canvasHistory.value.push(newEntry)
    if (canvasHistory.value.length > MAX_CANVAS_HISTORY) canvasHistory.value.shift()
    // clear redo when new action performed
    canvasRedo.value = []
  }

  function canUndoCanvas(): boolean {
    return canvasHistory.value.length > 0
  }

  function canRedoCanvas(): boolean {
    return canvasRedo.value.length > 0
  }

  function popUndoCanvas(): CanvasHistoryEntry | undefined {
    const entry = canvasHistory.value.pop()
    if (entry) canvasRedo.value.push(entry)
    return entry
  }

  function popRedoCanvas(): CanvasHistoryEntry | undefined {
    const entry = canvasRedo.value.pop()
    if (entry) canvasHistory.value.push(entry)
    return entry
  }

  function clearCanvasHistory() {
    canvasHistory.value = []
    canvasRedo.value = []
  }

  function getCardHistory(cardId: string): HistoryEntry[] {
    if (!historyStacks.value[cardId]) {
      historyStacks.value[cardId] = []
    }
    return historyStacks.value[cardId]
  }

  function getCardRedo(cardId: string): HistoryEntry[] {
    if (!redoStacks.value[cardId]) {
      redoStacks.value[cardId] = []
    }
    return redoStacks.value[cardId]
  }

  function pushHistory(cardId: string, entry: Omit<HistoryEntry, 'id' | 'timestamp'>) {
    const history = getCardHistory(cardId)
    const newEntry: HistoryEntry = {
      ...entry,
      id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      cardId
    }
    
    history.push(newEntry)
    
    // Trim if exceeds max
    if (history.length > MAX_HISTORY) {
      history.shift()
    }
    
    // Clear redo stack when new action is performed
    redoStacks.value[cardId] = []
  }

  function canUndo(cardId: string): boolean {
    return getCardHistory(cardId).length > 0
  }

  function canRedo(cardId: string): boolean {
    return getCardRedo(cardId).length > 0
  }

  function popUndo(cardId: string): HistoryEntry | undefined {
    const history = getCardHistory(cardId)
    const entry = history.pop()
    if (entry) {
      getCardRedo(cardId).push(entry)
    }
    return entry
  }

  function popRedo(cardId: string): HistoryEntry | undefined {
    const redo = getCardRedo(cardId)
    const entry = redo.pop()
    if (entry) {
      getCardHistory(cardId).push(entry)
    }
    return entry
  }

  function clearHistory(cardId: string) {
    historyStacks.value[cardId] = []
    redoStacks.value[cardId] = []
  }

  return {
    historyStacks,
    redoStacks,
    pushHistory,
    canUndo,
    canRedo,
    popUndo,
    popRedo,
    clearHistory
    ,
    // Canvas-level history (for nodes/edges/moves etc)
    canvasHistory: canvasHistory,
    canvasRedo: canvasRedo,
    pushCanvas,
    canUndoCanvas,
    canRedoCanvas,
    popUndoCanvas,
    popRedoCanvas,
    clearCanvasHistory
  }
})
