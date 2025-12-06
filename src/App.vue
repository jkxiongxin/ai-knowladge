<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useCanvasStore } from '@/stores/canvas'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useHistoryStore } from '@/stores/history'
import ShortcutsHelp from '@/components/ShortcutsHelp.vue'
import { electronApi } from '@/api'

const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspaceStore()
const canvasStore = useCanvasStore()
const shortcutsStore = useShortcutsStore()
const historyStore = useHistoryStore()

const showHeader = computed(() => route.name === 'canvas')
const currentWorkspaceName = computed(() => workspaceStore.currentWorkspace?.name || '知识库')
const showShortcutsHelp = ref(false)

function goBack() {
  workspaceStore.clearSelection()
  router.push({ name: 'home' })
}

// Register global shortcuts
function registerGlobalShortcuts() {
  shortcutsStore.registerShortcuts([
    {
      id: 'show-shortcuts',
      keys: ['Meta', '/'],
      description: '显示快捷键帮助',
      context: 'global',
      action: () => { showShortcutsHelp.value = true }
    },
    {
      id: 'show-shortcuts-alt',
      keys: ['Ctrl', '/'],
      description: '显示快捷键帮助',
      context: 'global',
      action: () => { showShortcutsHelp.value = true }
    },
    {
      id: 'close-chat',
      keys: ['Escape'],
      description: '关闭对话窗口',
      context: 'chat',
      action: () => {
        if (canvasStore.isChatOpen) {
          canvasStore.closeChat()
        } else if (showShortcutsHelp.value) {
          showShortcutsHelp.value = false
        }
      }
    },
    {
      id: 'undo',
      keys: ['Meta', 'z'],
      description: '撤销',
      context: 'chat',
      action: async () => {
        if (!canvasStore.activeCardId) return
        const entry = historyStore.popUndo(canvasStore.activeCardId)
        if (!entry) return
        if (entry.type === 'message_edit' && entry.data.messageId && entry.data.oldContent !== undefined) {
          await electronApi.updateMessageContent(entry.data.messageId, entry.data.oldContent)
          const msg = canvasStore.messages.find(m => m.id === entry.data.messageId)
          if (msg) msg.content = entry.data.oldContent
        }
      }
    },
    {
      id: 'undo-alt',
      keys: ['Ctrl', 'z'],
      description: '撤销',
      context: 'chat',
      action: async () => {
        if (!canvasStore.activeCardId) return
        const entry = historyStore.popUndo(canvasStore.activeCardId)
        if (!entry) return
        if (entry.type === 'message_edit' && entry.data.messageId && entry.data.oldContent !== undefined) {
          await electronApi.updateMessageContent(entry.data.messageId, entry.data.oldContent)
          const msg = canvasStore.messages.find(m => m.id === entry.data.messageId)
          if (msg) msg.content = entry.data.oldContent
        }
      }
    },
    {
      id: 'redo',
      keys: ['Meta', 'Shift', 'z'],
      description: '重做',
      context: 'chat',
      action: async () => {
        if (!canvasStore.activeCardId) return
        const entry = historyStore.popRedo(canvasStore.activeCardId)
        if (!entry) return
        if (entry.type === 'message_edit' && entry.data.messageId && entry.data.newContent !== undefined) {
          await electronApi.updateMessageContent(entry.data.messageId, entry.data.newContent)
          const msg = canvasStore.messages.find(m => m.id === entry.data.messageId)
          if (msg) msg.content = entry.data.newContent
        }
      }
    },
    {
      id: 'redo-alt',
      keys: ['Ctrl', 'Shift', 'z'],
      description: '重做',
      context: 'chat',
      action: async () => {
        if (!canvasStore.activeCardId) return
        const entry = historyStore.popRedo(canvasStore.activeCardId)
        if (!entry) return
        if (entry.type === 'message_edit' && entry.data.messageId && entry.data.newContent !== undefined) {
          await electronApi.updateMessageContent(entry.data.messageId, entry.data.newContent)
          const msg = canvasStore.messages.find(m => m.id === entry.data.messageId)
          if (msg) msg.content = entry.data.newContent
        }
      }
    },
    {
      id: 'new-card',
      keys: ['Meta', 'n'],
      description: '新建卡片',
      context: 'canvas',
      action: () => {
        if (route.name === 'canvas') {
          // Add a new card at a default position
          canvasStore.addCard(100 + Math.random() * 200, 100 + Math.random() * 200)
        }
      }
    },
    {
      id: 'new-card-alt',
      keys: ['Ctrl', 'n'],
      description: '新建卡片',
      context: 'canvas',
      action: () => {
        if (route.name === 'canvas') {
          canvasStore.addCard(100 + Math.random() * 200, 100 + Math.random() * 200)
        }
      }
    }
  ])
}

onMounted(() => {
  shortcutsStore.init()
  registerGlobalShortcuts()
})

onUnmounted(() => {
  shortcutsStore.destroy()
})
</script>

<template>
  <div class="w-screen h-screen flex flex-col">
    <!-- Top Bar (Only on Canvas) -->
    <header v-if="showHeader" class="h-12 border-b-2 border-ink flex items-center px-4 bg-paper z-10 select-none">
      <button 
        @click="goBack" 
        class="mr-3 p-1 hover:bg-ink/10 rounded transition-colors"
        title="返回知识库列表"
      >
        ←
      </button>
      <h1 class="text-xl font-bold">{{ currentWorkspaceName }}</h1>
      <div class="flex-1"></div>
      <button 
        @click="showShortcutsHelp = true"
        class="p-1 hover:bg-ink/10 rounded transition-colors text-sm text-gray-500"
        title="快捷键帮助"
      >
        ⌘/
      </button>
    </header>

    <!-- Main Content Area -->
    <main class="flex-1 relative overflow-hidden">
      <router-view />
    </main>
    
    <!-- Shortcuts Help Panel -->
    <ShortcutsHelp v-model="showShortcutsHelp" />
  </div>
</template>

<style scoped>
</style>
