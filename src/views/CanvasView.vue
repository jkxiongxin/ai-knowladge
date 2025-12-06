<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useCanvasStore } from '@/stores/canvas'
import { useWorkspaceStore } from '@/stores/workspace'
import ScribbleCard from '@/components/ScribbleCard.vue'
import ChatDrawer from '@/components/ChatDrawer.vue'
// ToolBar removed as per UX decision
import ContextMenu, { type MenuItem } from '@/components/ContextMenu.vue'

// Import default styles
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'

// Props from route
const props = defineProps<{
  workspaceId: string
}>()

const router = useRouter()
const route = useRoute()
const store = useCanvasStore()
const workspaceStore = useWorkspaceStore()
const { onNodeDragStop, onConnect, addEdges, screenToFlowCoordinate, onPaneClick } = useVueFlow()

// Tool state (kept for behavior but toolbar UI removed)
type ToolType = 'select' | 'card' | 'note' | 'image'
const activeTool = ref<ToolType>('select')
const contextMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null)
const pendingContextPosition = ref<{ x: number, y: number } | null>(null)

// Context menu items - computed so paste can reflect clipboard state
const contextMenuItems = computed<MenuItem[]>(() => [
  { id: 'card', label: '新建卡片', icon: 'card' },
  { id: 'note', label: '新建便签', icon: 'note' },
  { id: 'image', label: '插入图片', icon: 'image', disabled: true },
  { id: 'divider-1', label: '', divider: true },
  { id: 'copy', label: '复制 (⌘C)', icon: 'copy', disabled: store.selectedNodeIds.size === 0 },
  { id: 'paste', label: '粘贴 (⌘V)', icon: 'paste', disabled: !store.clipboard },
  { id: 'divider-2', label: '', divider: true },
  { id: 'selectAll', label: '全选 (⌘A)', icon: 'select' },
])

const canUndo = computed(() => store.canUndoCanvas ? store.canUndoCanvas() : false)
const canRedo = computed(() => store.canRedoCanvas ? store.canRedoCanvas() : false)

// Computed: cursor style based on active tool
const canvasCursor = computed(() => {
  if (store.isLoading) return 'wait'
  switch (activeTool.value) {
    case 'card':
    case 'note':
      return 'crosshair'
    case 'image':
      return 'copy'
    default:
      return 'grab'
  }
})

onMounted(() => {
  // Load workspace info if needed
  if (!workspaceStore.currentWorkspace) {
    workspaceStore.selectWorkspace(props.workspaceId)
    workspaceStore.loadWorkspaces()
  }
  
  // Initialize canvas with the workspace ID from route
  store.initWorkspace(props.workspaceId)

  // Keyboard shortcuts for undo/redo/copy/paste/delete
  const onKey = (ev: KeyboardEvent) => {
    const isInput = (ev.target as HTMLElement)?.tagName === 'INPUT' || (ev.target as HTMLElement)?.tagName === 'TEXTAREA' || (ev.target as HTMLElement)?.isContentEditable
    if (isInput) return

    // handle Cmd/Ctrl + Z for undo, Cmd/Ctrl + Shift + Z or Ctrl+Y for redo
    const zKey = ev.key.toLowerCase() === 'z'
    const yKey = ev.key.toLowerCase() === 'y'
    const cKey = ev.key.toLowerCase() === 'c'
    const vKey = ev.key.toLowerCase() === 'v'
    const aKey = ev.key.toLowerCase() === 'a'
    const isDelete = ev.key === 'Delete' || ev.key === 'Backspace'

    if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && zKey) {
      ev.preventDefault()
      store.undoCanvasAction()
    }
    if ((ev.metaKey || ev.ctrlKey) && ((ev.shiftKey && zKey) || yKey)) {
      ev.preventDefault()
      store.redoCanvasAction()
    }
    // Cmd/Ctrl+C = copy
    if ((ev.metaKey || ev.ctrlKey) && cKey) {
      ev.preventDefault()
      store.copySelectedNodes()
    }
    // Cmd/Ctrl+V = paste
    if ((ev.metaKey || ev.ctrlKey) && vKey) {
      ev.preventDefault()
      store.pasteNodes()
    }
    // Cmd/Ctrl+A = select all
    if ((ev.metaKey || ev.ctrlKey) && aKey) {
      ev.preventDefault()
      store.selectAll()
    }
    // Delete/Backspace = delete selected
    if (isDelete && store.selectedNodeIds.size > 0) {
      ev.preventDefault()
      store.deleteSelectedNodes()
    }
  }

  window.addEventListener('keydown', onKey)
  // remove listener when unmounted
  onUnmounted(() => window.removeEventListener('keydown', onKey))
})

// Watch for node/edge removals performed by VueFlow (e.g., via Delete/Backspace)
// and ensure they are persisted by calling the store delete handlers.
let isInitialized = false

watch(
  () => store.nodes.map(n => n.id),
  (newIds: string[], oldIds: string[] | undefined) => {
    if (!oldIds || oldIds.length === 0) {
      isInitialized = true
      return
    }
    if (!isInitialized) return
    
    const removed = oldIds.filter((id: string) => !newIds.includes(id))
    for (const id of removed) {
      // If VueFlow removed it locally (keyboard), ensure DB delete is invoked
      // call store.removeNode which will call electronApi.deleteCard
      store.removeNode(id).catch(err => console.error('Failed to persist deleted node', id, err))
    }
  }
)

watch(
  () => store.edges.map(e => e.id),
  (newIds: string[], oldIds: string[] | undefined) => {
    if (!oldIds || oldIds.length === 0) return
    if (!isInitialized) return
    
    const removed = oldIds.filter((id: string) => !newIds.includes(id))
    for (const id of removed) {
      store.removeEdge(id).catch(err => console.error('Failed to persist deleted edge', id, err))
    }
  }
)

// Event Handlers
const dragStartPositions = new Map<string, { x: number, y: number }>()

function onDragStart(event: any) {
  try {
    const { id, position } = event.node
    dragStartPositions.set(id, { x: position.x, y: position.y })
  } catch (err) {
    // ignore
  }
}

function onDragStop(event: any) {
  const { id, position } = event.node
  const prev = dragStartPositions.get(id)
  store.updateNodePosition(id, position.x, position.y, prev?.x, prev?.y)
  dragStartPositions.delete(id)
}

function onConnectHandler(params: any) {
  store.connectNodes(params)
}

let isCreatingCard = false
let lastClickTime = 0
const DOUBLE_CLICK_THRESHOLD = 300 // ms

// Use onPaneClick to detect double-click since pane-dbl-click event doesn't exist in VueFlow
onPaneClick((event: MouseEvent) => {
  const now = Date.now()
  if (now - lastClickTime < DOUBLE_CLICK_THRESHOLD) {
    // Double click detected
    handlePaneDoubleClick(event)
  }
  lastClickTime = now
})

function handlePaneDoubleClick(event: MouseEvent) {
  if (isCreatingCard) {
    return
  }
  
  isCreatingCard = true
  
  try {
    const { x, y } = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
    store.addCard(x, y)
  } catch (error) {
    console.error('Error in handlePaneDoubleClick:', error)
  } finally {
    setTimeout(() => {
      isCreatingCard = false
    }, 500)
  }
}



function onPaneContextMenu(event: any) {
  const mouseEvent = event.event || event
  if (mouseEvent?.preventDefault) {
    mouseEvent.preventDefault()
  }
  
  // Store the canvas position for later use
  const { x, y } = screenToFlowCoordinate({ x: mouseEvent.clientX, y: mouseEvent.clientY })
  pendingContextPosition.value = { x, y }
  
  // Show context menu at mouse position
  contextMenuRef.value?.show(mouseEvent.clientX, mouseEvent.clientY)
}

function onContextMenuSelect(item: MenuItem) {
  if (!pendingContextPosition.value) return
  
  const { x, y } = pendingContextPosition.value
  
  switch (item.id) {
    case 'card':
    case 'note':
      store.addCard(x, y)
      break
    case 'image':
      // TODO: Implement image insertion
      break
    case 'copy':
      store.copySelectedNodes()
      break
    case 'paste':
      store.pasteNodes(x, y)
      break
    case 'selectAll':
      store.selectAll()
      break
  }
  
  pendingContextPosition.value = null
}

function onToolChange(tool: ToolType) {
  activeTool.value = tool
}
</script>

<template>
  <div class="w-full h-full bg-paper relative">
    <VueFlow
      v-model:nodes="store.nodes"
      v-model:edges="store.edges"
      :class="[`cursor-${canvasCursor}`]"
      :zoom-on-double-click="false"
      :pan-on-drag="activeTool === 'select'"
      :delete-key-code="null"
      @node-drag-start="onDragStart"
      @node-drag-stop="onDragStop"
      @connect="onConnectHandler"
      @pane-context-menu="onPaneContextMenu"
    >
      <!-- Custom Node Types -->
      <template #node-scribble="props">
        <ScribbleCard v-bind="props" />
      </template>

      <!-- Background -->
      <Background pattern-color="#d5d8dc" :gap="20" />

      <!-- Controls -->
      <Controls />
      
    </VueFlow>
    
    <!-- Bottom Toolbar removed (buttons were not useful) -->
    
    <!-- Context Menu -->
    <ContextMenu 
      ref="contextMenuRef" 
      :items="contextMenuItems" 
      @select="onContextMenuSelect"
    />
    
    <!-- Undo/Redo Buttons -->
    <div class="absolute top-4 right-20 z-10 flex gap-2">
      <button
        @click.stop="store.undoCanvasAction()"
        :disabled="!canUndo"
        :class="['p-2 bg-white rounded-full shadow-md hover:bg-gray-50 transition-colors', !canUndo ? 'opacity-50 cursor-not-allowed' : '']"
        title="撤销 (Cmd/Ctrl+Z)"
      >
        <!-- Undo Icon -->
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10v6h6"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 10-9 9v-3"/></svg>
      </button>
      <button
        @click.stop="store.redoCanvasAction()"
        :disabled="!canRedo"
        :class="['p-2 bg-white rounded-full shadow-md hover:bg-gray-50 transition-colors', !canRedo ? 'opacity-50 cursor-not-allowed' : '']"
        title="重做 (Cmd/Ctrl+Shift+Z / Ctrl+Y)"
      >
        <!-- Redo Icon -->
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10v6h-6"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12a9 9 0 1012-8.485"/></svg>
      </button>
    </div>

    <!-- Settings Button -->
    <button 
      @click="router.push('/settings')"
      class="absolute top-4 right-4 z-10 p-2 bg-white rounded-full shadow-md hover:bg-gray-50 transition-colors"
      title="设置"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826-3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </button>

    <!-- Chat Drawer -->
    <ChatDrawer />

    

    <!-- Loading Overlay -->
    <div v-if="store.isLoading" class="absolute inset-0 flex items-center justify-center bg-white/50 z-50">
      <span class="text-xl font-scribble animate-pulse">正在加载你的知识宇宙...</span>
    </div>
  </div>
</template>

<style>
/* Global overrides for VueFlow to match Scribble style */
.vue-flow__edge-path {
  stroke: #2c3e50;
  stroke-width: 2px;
}

.vue-flow__handle {
  width: 10px;
  height: 10px;
  background: #2c3e50;
  border: none;
}

/* Cursor styles */
.cursor-grab {
  cursor: grab;
}
.cursor-grab:active {
  cursor: grabbing;
}
.cursor-crosshair {
  cursor: crosshair;
}
.cursor-copy {
  cursor: copy;
}
.cursor-wait {
  cursor: wait;
}
</style>
