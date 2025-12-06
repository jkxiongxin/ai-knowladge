<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { computed, ref, watch, onMounted } from 'vue'
import { electronApi } from '@/api'
import SummaryEditor from './SummaryEditor.vue'
import ContextMenu, { type MenuItem } from './ContextMenu.vue'
import { useCanvasStore } from '@/stores/canvas'

const props = defineProps<{
  id: string
  data: {
    title: string
    summary: string
    status: 'todo' | 'in_progress' | 'done' | 'archived'
    width?: number
    height?: number
  }
  selected?: boolean
}>()

const store = useCanvasStore()

// title editing state (single copy)

watch(
  () => props.data.title,
  (v) => {
    if (!isEditingTitle.value) editingTitle.value = v
  }
)

const statusColor = computed(() => {
  switch (props.data.status) {
    case 'todo': return 'bg-chalk-gray'
    case 'in_progress': return 'bg-chalk-yellow'
    case 'done': return 'bg-chalk-green'
    case 'archived': return 'bg-gray-200'
    default: return 'bg-white'
  }
})

function handleOpenChat() {
  store.openChat(props.id)
}

const storeContextMode = ref('summary')

onMounted(async () => {
  try {
    const settings = await electronApi.getSettings()
    const mode = settings[`cardContextMode:${props.id}`]
    if (mode) storeContextMode.value = mode
  } catch (e) {
    // ignore
  }
})

// Resize handle implementation
let resizingHandle = false
let startX = 0
let startY = 0
let startW = 0
let startH = 0

function startResizeHandle(ev: MouseEvent) {
  ev.stopPropagation()
  resizingHandle = true
  startX = ev.clientX
  startY = ev.clientY
  startW = props.data.width || 250
  startH = props.data.height || 150
  document.addEventListener('mousemove', onHandleMove)
  document.addEventListener('mouseup', onHandleUp)
}

function onHandleMove(ev: MouseEvent) {
  if (!resizingHandle) return
  const dx = ev.clientX - startX
  const dy = ev.clientY - startY
  const newW = Math.max(200, Math.round(startW + dx))
  const newH = Math.max(120, Math.round(startH + dy))
  // Update via store (persisted as we drag but skip history until release)
  store.updateNodeSize(props.id, newW, newH, undefined, undefined, true)
}

function onHandleUp() {
  if (!resizingHandle) return
  resizingHandle = false
  document.removeEventListener('mousemove', onHandleMove)
  document.removeEventListener('mouseup', onHandleUp)
  // finalize size and push history entry (use start dimensions captured earlier)
  const finalW = props.data.width || 250
  const finalH = props.data.height || 150
  store.updateNodeSize(props.id, finalW, finalH, startW, startH, false)
}

const isEditingTitle = ref(false)
const editingTitle = ref(props.data.title)

const isEditingSummary = ref(false)
const editingSummary = ref(props.data.summary || '')

watch(
  () => props.data.summary,
  (v) => {
    if (!isEditingSummary.value) editingSummary.value = v
  }
)

function startEditTitle(ev?: MouseEvent) {
  ev?.stopPropagation()
  isEditingTitle.value = true
  editingTitle.value = props.data.title || ''
}

async function saveTitle() {
  const newTitle = editingTitle.value?.trim() || 'Untitled'
  if (newTitle === props.data.title) {
    isEditingTitle.value = false
    return
  }
  await store.updateNodeTitle(props.id, newTitle)
  isEditingTitle.value = false
}

function cancelEdit() {
  isEditingTitle.value = false
  editingTitle.value = props.data.title
}

function startEditSummary(ev?: MouseEvent) {
  ev?.stopPropagation()
  isEditingSummary.value = true
  editingSummary.value = props.data.summary || ''
}

async function saveSummary() {
  const newSummary = editingSummary.value || ''
  if (newSummary === props.data.summary) {
    isEditingSummary.value = false
    return
  }
  await store.updateNodeSummary(props.id, newSummary)
  isEditingSummary.value = false
}

function cancelEditSummary() {
  isEditingSummary.value = false
  editingSummary.value = props.data.summary || ''
}

async function onSummarySave(content: string) {
  editingSummary.value = content
  await saveSummary()
}

/* Duplicate title-edit handlers removed (kept single definitions above) */

async function handleDelete(ev?: MouseEvent) {
  ev?.stopPropagation()
  if (!confirm('确定要删除此卡片吗？此操作无法撤销。')) return
  try {
    await store.removeNode(props.id)
  } catch (err) {
    console.error('Failed to delete node', err)
  }
}

// Context menu handling
const contextMenuRef = ref<any | null>(null)
const menuItems = ref<MenuItem[]>([])

function buildMenuItems() {
  return [
    { id: 'open', label: '打开', icon: 'card' },
    { id: 'edit_summary', label: '编辑摘要', icon: 'note' },
    { id: 'divider-1', label: '-', divider: true },
    { id: 'use_summary', label: '使用摘要' },
    { id: 'use_all', label: '使用全部对话' },
    { id: 'use_selected', label: '使用选中的对话' },
    { id: 'divider-2', label: '-', divider: true },
    { id: 'rename', label: '重命名' },
    { id: 'delete', label: '删除', icon: 'paste' }
  ]
}

function onContextMenu(ev: MouseEvent) {
  ev.preventDefault()
  ev.stopPropagation()
  menuItems.value = buildMenuItems()
  contextMenuRef.value?.show(ev.clientX, ev.clientY)
}

function onMenuSelect(item: MenuItem) {
  // handle menu actions
  switch (item.id) {
    case 'open':
      handleOpenChat()
      break
    case 'edit_summary':
      startEditSummary()
      break
    case 'use_summary':
      store.updateNodeContextMode(props.id, 'summary' as any)
      break
    case 'use_all':
      store.updateNodeContextMode(props.id, 'all_messages' as any)
      break
    case 'use_selected':
      store.updateNodeContextMode(props.id, 'selected' as any)
      break
    case 'rename':
      startEditTitle()
      break
    case 'delete':
      handleDelete()
      break
  }
}
</script>

<template>
  <div 
    class="relative bg-paper border-scribble p-4 flex flex-col gap-2 transition-all duration-200 group"
    :style="{ width: (data.width || 250) + 'px', minHeight: (data.height || 150) + 'px' }"
    :class="[
      selected ? 'shadow-lg scale-105 border-ink' : 'shadow-sm border-gray-600',
      'hover:shadow-md'
    ]"
    @contextmenu.stop.prevent="onContextMenu"
  >
    <!-- Handles for connections -->
    <Handle type="target" :position="Position.Top" class="!w-3 !h-3 !bg-ink !border-none" />
    <Handle type="source" :position="Position.Bottom" class="!w-3 !h-3 !bg-ink !border-none" />

    <!-- Header - double click to edit title -->
    <div 
      class="flex items-center justify-between border-b border-gray-300 pb-2 border-dashed"
      @dblclick.stop="startEditTitle"
    >
      <h3 
        v-if="!isEditingTitle" 
        class="font-bold text-lg truncate cursor-pointer hover:text-ink" 
        :title="data.title"
      >
        {{ data.title }}
      </h3>
      <input
        v-else
        v-model="editingTitle"
        @blur="saveTitle"
        @keydown.enter="saveTitle"
        @keydown.esc="cancelEdit"
        @click.stop
        class="font-bold text-lg flex-1 border-b-2 border-ink focus:outline-none bg-transparent"
        autofocus
      />
      <div :class="['w-3 h-3 rounded-full border border-black flex-shrink-0 ml-2', statusColor]"></div>
    </div>

    <!-- Content Preview - double click to edit summary -->
    <div 
      class="flex-1 text-sm text-gray-600 overflow-hidden relative cursor-pointer"
      @dblclick.stop="startEditSummary"
    >
        <!-- Small inline editor removed. We'll open a larger modal for editing summaries -->
        <SummaryEditor
          v-model="isEditingSummary"
          :content="editingSummary"
          :title="props.data.title"
          @save="onSummarySave"
          @cancel="cancelEditSummary"
        />
        <div>
        <p v-if="data.summary" class="line-clamp-4">{{ data.summary }}</p>
        <p v-else class="italic text-gray-400">双击编辑摘要...</p>
      </div>
    </div>

    <!-- Footer with chat button -->
    <div class="flex items-center justify-end pt-2 border-t border-gray-200 border-dashed">
      <button
        @click.stop="handleOpenChat"
        class="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 hover:text-ink hover:bg-gray-100 rounded transition-colors"
        title="打开聊天"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span>聊天</span>
      </button>
    </div>

    <!-- Resize handle bottom-right -->
    <div
      @mousedown.stop.prevent="startResizeHandle"
      class="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize bg-gray-200 border-t border-l border-gray-300 rounded-tl-md"
    ></div>
  </div>

  <!-- Context Menu (teleported to body) -->
  <ContextMenu ref="contextMenuRef" :items="menuItems" @select="onMenuSelect" />
</template>

<style scoped>
/* Override VueFlow Handle styles if needed */
</style>
