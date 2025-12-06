<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { useModelStore } from '@/stores/models'
import { useHistoryStore } from '@/stores/history'
import { useShortcutsStore } from '@/stores/shortcuts'
import MessageBubble from './MessageBubble.vue'
import CardReferencePicker from './CardReferencePicker.vue'
import { electronApi } from '@/api'
import { X, ChevronDown, FileText, Undo2, Redo2 } from 'lucide-vue-next'

const store = useCanvasStore()
const modelStore = useModelStore()
const historyStore = useHistoryStore()
const shortcutsStore = useShortcutsStore()
const inputContent = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const showModelSelector = ref(false)
const selectionMode = ref(false)
const showCardPicker = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
// Should current card summary be included when building context? default true
const includeCurrentSummary = ref(true)

// computed helper: whether there are messages for the current card
const hasHistory = computed(() => store.messages.length > 0)

// whether there are selected messages for the current card
const selectedCount = computed(() => {
  const cid = store.activeCardId
  if (!cid) return 0
  const map = store.selectedMessages as any
  const set = map[cid]
  return set ? set.size : 0
})

// Computed for undo/redo availability
const canUndo = computed(() => store.activeCardId ? historyStore.canUndo(store.activeCardId) : false)
const canRedo = computed(() => store.activeCardId ? historyStore.canRedo(store.activeCardId) : false)

// Window state for draggable/resizable chat drawer
const pos = ref({ x: window.innerWidth - 420, y: 48 })
const size = ref({ width: 400, height: Math.max(window.innerHeight - 100, 320) })
const dragging = ref(false)
const resizing = ref(false)
const maximized = ref(false)
let dragStart = { x: 0, y: 0 }
let initialPos = { x: 0, y: 0 }
let initialSize = { width: 0, height: 0 }

function onWindowResize() {
  if (pos.value.x + size.value.width > window.innerWidth) {
    pos.value.x = Math.max(window.innerWidth - size.value.width - 20, 20)
  }
  if (pos.value.y + size.value.height > window.innerHeight) {
    size.value.height = Math.max(window.innerHeight - pos.value.y - 20, 200)
  }
}

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
})

onMounted(() => {
  modelStore.loadSettings()
})

function isMessageSelected(msgId: string) {
  const cid = store.activeCardId
  if (!cid) return false
  const map = store.selectedMessages as any
  const set = map[cid]
  return set ? set.has(msgId) : false
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(() => store.messages.length, scrollToBottom)
watch(() => store.isChatOpen, (val) => {
  if (val) scrollToBottom()
})

function handleSend() {
  if (!inputContent.value.trim() || store.isGenerating) return
  store.sendMessage(inputContent.value)
  inputContent.value = ''
}

function handleClose() {
  store.closeChat()
}

// Handle message edit
async function handleMessageEdit(messageId: string, newContent: string) {
  await store.editMessageContent(messageId, newContent)
}

// Handle resend from a message
async function handleResend(messageId: string, content: string) {
  await store.resendFromMessage(messageId, content)
}

// Insert card reference
function insertCardReference(reference: string) {
  // Insert at cursor position or append
  if (textareaRef.value) {
    const start = textareaRef.value.selectionStart
    const end = textareaRef.value.selectionEnd
    const text = inputContent.value
    inputContent.value = text.slice(0, start) + reference + text.slice(end)
    // Move cursor after inserted text
    nextTick(() => {
      if (textareaRef.value) {
        textareaRef.value.selectionStart = textareaRef.value.selectionEnd = start + reference.length
        textareaRef.value.focus()
      }
    })
  } else {
    inputContent.value += reference
  }
}

// Undo/Redo handlers
async function handleUndo() {
  if (!store.activeCardId || !canUndo.value) return
  const entry = historyStore.popUndo(store.activeCardId)
  if (!entry) return
  
  // Apply undo based on type
  if (entry.type === 'message_edit' && entry.data.messageId && entry.data.oldContent !== undefined) {
    await electronApi.updateMessageContent(entry.data.messageId, entry.data.oldContent)
    const msg = store.messages.find(m => m.id === entry.data.messageId)
    if (msg) msg.content = entry.data.oldContent
  }
}

async function handleRedo() {
  if (!store.activeCardId || !canRedo.value) return
  const entry = historyStore.popRedo(store.activeCardId)
  if (!entry) return
  
  // Apply redo based on type
  if (entry.type === 'message_edit' && entry.data.messageId && entry.data.newContent !== undefined) {
    await electronApi.updateMessageContent(entry.data.messageId, entry.data.newContent)
    const msg = store.messages.find(m => m.id === entry.data.messageId)
    if (msg) msg.content = entry.data.newContent
  }
}

function selectModel(providerId: string, modelId: string) {
  modelStore.setActiveModel(providerId as any, modelId)
  showModelSelector.value = false
}

async function generateSummary() {
  if (!store.activeCardId) return
  try {
    const summary = await electronApi.generateCardSummary(store.activeCardId)
    // update UI (store will receive card-summary-updated via IPC)
    await store.updateNodeSummary(store.activeCardId, summary)
  } catch (err: any) {
    console.error('Failed to generate summary:', err)
    alert('生成摘要失败：' + (err?.message || err))
  }
}

// Load per-card setting for including current card summary when active card changes
watch(() => store.activeCardId, async (id: string | null) => {
  if (!id) return
  try {
    const settings = await electronApi.getSettings()
    const key = `cardIncludeSummaryInContext:${id}`
    const raw = settings ? settings[key] : null
    includeCurrentSummary.value = raw === null || raw === undefined ? true : (raw === 'true')
  } catch (e) {
    // ignore and keep default
  }
})

async function toggleIncludeCurrentSummary() {
  if (!store.activeCardId) return
  const key = `cardIncludeSummaryInContext:${store.activeCardId}`
  try {
    await electronApi.saveSetting(key, includeCurrentSummary.value ? 'true' : 'false')
  } catch (e) {
    console.error('Failed saving setting', e)
  }
}

function toggleMessageSelection(msgId: string) {
  if (!store.activeCardId) return
  store.toggleSelectedMessage(store.activeCardId, msgId)
}

async function saveSelectedContext() {
  if (!store.activeCardId) return
  await store.saveSelectedMessagesForContext(store.activeCardId)
  // set card mode to selected
  await store.updateNodeContextMode(store.activeCardId, 'selected')
  selectionMode.value = false
}

function startDrag(ev: MouseEvent) {
  if (maximized.value) return
  dragging.value = true
  dragStart = { x: ev.clientX, y: ev.clientY }
  initialPos = { x: pos.value.x, y: pos.value.y }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}

function onDragMove(ev: MouseEvent) {
  if (!dragging.value) return
  const dx = ev.clientX - dragStart.x
  const dy = ev.clientY - dragStart.y
  pos.value.x = Math.max(10, initialPos.x + dx)
  pos.value.y = Math.max(10, initialPos.y + dy)
}

function onDragEnd() {
  dragging.value = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

function startResize(ev: MouseEvent) {
  resizing.value = true
  dragStart = { x: ev.clientX, y: ev.clientY }
  initialSize = { width: size.value.width, height: size.value.height }
  // capture current position so we can move the left edge (change left + width)
  initialPos = { x: pos.value.x, y: pos.value.y }
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(ev: MouseEvent) {
  if (!resizing.value) return
  // compute change in mouse X from the start
  const dx = ev.clientX - dragStart.x

  // New width when dragging left edge is initialWidth - dx
  const minW = 300
  let newWidth = Math.round(initialSize.width - dx)
  let newLeft = Math.round(initialPos.x + dx)

  // Clamp min width
  if (newWidth < minW) {
    newWidth = minW
    // recompute left so that right edge stays fixed
    newLeft = initialPos.x + (initialSize.width - minW)
  }

  // Clamp so left edge doesn't go off-screen
  const minLeft = 10
  if (newLeft < minLeft) {
    // when left is clamped, expand width accordingly
    const delta = minLeft - newLeft
    newLeft = minLeft
    newWidth = Math.round(newWidth - delta)
    if (newWidth < minW) newWidth = minW
  }

  pos.value.x = newLeft
  size.value.width = newWidth
}

function onResizeEnd() {
  resizing.value = false
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

function toggleMaximize() {
  maximized.value = !maximized.value
  if (maximized.value) {
    pos.value.x = 20
    pos.value.y = 20
    size.value.width = Math.min(window.innerWidth - 40, 1000)
    size.value.height = Math.min(window.innerHeight - 40, 1000)
  } else {
    // restore default
    size.value.width = 400
    size.value.height = Math.max(window.innerHeight - 100, 320)
    pos.value.x = Math.max(window.innerWidth - size.value.width - 20, 20)
    pos.value.y = 48
  }
}
</script>

<template>
  <div 
    v-if="store.isChatOpen"
    class="fixed bg-paper border-l-2 border-ink shadow-2xl z-40 flex flex-col transition-transform duration-200"
    :style="{
      left: pos.x + 'px',
      top: pos.y + 'px',
      width: size.width + 'px',
      height: size.height + 'px'
    }"
  >
    <!-- Header -->
    <div
      class="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-white/50 backdrop-blur-sm cursor-move"
      @mousedown.prevent="startDrag"
    >
      <div class="flex items-center gap-2">
        <h2 class="font-bold text-lg">对话</h2>
      </div>
      <div class="flex items-center gap-2">
        <!-- Undo/Redo buttons -->
        <button 
          @click="handleUndo" 
          :disabled="!canUndo"
          class="p-1 hover:bg-gray-200 rounded-full disabled:opacity-30 disabled:cursor-not-allowed" 
          title="撤销 (⌘Z)"
        >
          <Undo2 class="w-4 h-4" />
        </button>
        <button 
          @click="handleRedo" 
          :disabled="!canRedo"
          class="p-1 hover:bg-gray-200 rounded-full disabled:opacity-30 disabled:cursor-not-allowed" 
          title="重做 (⌘⇧Z)"
        >
          <Redo2 class="w-4 h-4" />
        </button>
        <button @click="toggleMaximize" class="p-1 hover:bg-gray-200 rounded-full" title="切换大小">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
      <button @click="handleClose" class="p-1 hover:bg-gray-200 rounded-full">
        <X class="w-5 h-5" />
      </button>
    </div>
    
    <!-- Model Selector -->
    <div class="px-4 py-2 border-b border-gray-100 bg-gray-50">
      <div class="relative">
        <button 
          @click="showModelSelector = !showModelSelector"
          class="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm w-full justify-between"
        >
          <span class="flex items-center gap-2">
            <span v-if="modelStore.currentModel">
              {{ modelStore.currentModel.provider.icon }}
              {{ modelStore.currentModel.name }}
            </span>
            <span v-else class="text-gray-400">选择模型</span>
          </span>
          <ChevronDown class="w-4 h-4 text-gray-400" />
        </button>
        
        <!-- Dropdown -->
        <div 
          v-if="showModelSelector"
          class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto"
        >
          <div v-for="provider in modelStore.enabledProviders" :key="provider.id" class="border-b border-gray-100 last:border-0">
            <div class="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50">
              {{ provider.icon }} {{ provider.name }}
            </div>
            <button
              v-for="model in provider.models"
              :key="model.id"
              @click="selectModel(provider.id, model.id)"
              :class="[
                'w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors',
                modelStore.activeModel.provider === provider.id && modelStore.activeModel.modelId === model.id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700'
              ]"
            >
              {{ model.name }}
            </button>
          </div>
          <div v-if="modelStore.enabledProviders.length === 0" class="px-3 py-4 text-sm text-gray-500 text-center">
            暂无可用模型，请先在设置中启用
          </div>
      </div>
    </div>
      <div class="mt-2 flex flex-col gap-2">
        <div class="flex items-center gap-3">
          <button
            @click="generateSummary"
            :disabled="!hasHistory"
            class="px-3 py-1 bg-ink text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >生成摘要</button>

          <button
            @click="selectionMode = !selectionMode"
            :disabled="!hasHistory"
            :class="['px-3 py-1 rounded text-sm', selectionMode ? 'bg-blue-50 text-blue-700' : 'bg-white border', !hasHistory ? 'opacity-40 cursor-not-allowed' : '']"
          >选择对话作为上下文</button>

          <button
            v-if="selectionMode"
            @click="saveSelectedContext"
            :disabled="selectedCount === 0"
            class="px-3 py-1 bg-ink text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >保存选中为上下文</button>
        </div>

        <!-- include current card summary toggle -->
        <div class="flex items-center gap-2 text-sm text-ink/80">
          <input
            type="checkbox"
            id="include-summary"
            class="w-4 h-4 rounded border-ink/20 text-ink"
            v-model="includeCurrentSummary"
            @change="toggleIncludeCurrentSummary"
            :disabled="!store.activeCardId"
          />
          <label for="include-summary" class="select-none">上下文包含当前卡片摘要</label>
        </div>
      </div>
    </div>

    <!-- Messages Area -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 bg-paper">
      <div v-if="store.messages.length === 0" class="h-full flex flex-col items-center justify-center text-gray-400 text-center">
        <p>暂无消息。</p>
        <p class="text-sm">开始输入来头脑风暴吧！</p>
      </div>
      
      <div v-for="(msg, index) in store.messages" :key="msg.id" class="mb-3 flex items-start gap-3">
        <input v-if="selectionMode" type="checkbox" class="mt-2" :checked="isMessageSelected(msg.id)" @change="toggleMessageSelection(msg.id)" />
        <MessageBubble 
          :message="msg" 
          :can-resend="msg.role === 'user'"
          @edit="(content: string) => handleMessageEdit(msg.id, content)"
          @resend="(content: string) => handleResend(msg.id, content)"
        />
      </div>
      
      <div v-if="store.isGenerating" class="flex justify-start mb-4">
        <div class="bg-gray-100 p-3 rounded-2xl rounded-tl-none text-gray-500 text-sm animate-pulse">
          思考中...
        </div>
      </div>
    </div>

    <!-- Input Area -->
    <div class="p-4 border-t border-gray-200 bg-white">
      <div class="relative">
        <!-- Insert card reference button -->
        <button 
          @click="showCardPicker = true"
          class="absolute top-2 left-2 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          title="插入卡片引用"
        >
          <FileText class="w-4 h-4" />
        </button>
        <textarea
          ref="textareaRef"
          v-model="inputContent"
          @keydown.enter.prevent="handleSend"
          placeholder="输入消息... (Enter 发送，点击 📄 添加卡片引用)"
          class="w-full h-24 p-3 pl-10 pr-10 rounded-xl border-2 border-gray-300 focus:border-ink focus:outline-none resize-none bg-gray-50 font-sans text-sm"
        ></textarea>
        <button 
          @click="handleSend"
          :disabled="!inputContent.trim() || store.isGenerating"
          class="absolute bottom-3 right-3 p-2 bg-ink text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
    </div>
    <!-- Resize handle (left edge) -->
    <div 
      @mousedown.prevent="startResize"
      class="absolute left-0 top-0 h-full w-2 cursor-ew-resize"
      style="transform: translateX(-50%);"
    ></div>

    <!-- Drag/size overlays are handled in script -->
  </div>
  
  <!-- Card Reference Picker -->
  <CardReferencePicker 
    v-model="showCardPicker" 
    @select="insertCardReference" 
  />
  
  <!-- Click outside to close model selector -->
  <div 
    v-if="showModelSelector" 
    @click="showModelSelector = false" 
    class="fixed inset-0 z-30"
  ></div>
</template>
