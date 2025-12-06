<script setup lang="ts">
import { ref, computed } from 'vue'
import { useShortcutsStore } from '@/stores/shortcuts'
import { X, Keyboard } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const shortcutsStore = useShortcutsStore()

const groupedShortcuts = computed(() => {
  const groups: Record<string, typeof shortcutsStore.shortcuts> = {
    global: [],
    chat: [],
    canvas: []
  }
  
  for (const shortcut of shortcutsStore.shortcuts) {
    const context = shortcut.context || 'global'
    if (!groups[context]) groups[context] = []
    groups[context].push(shortcut)
  }
  
  return groups
})

const contextLabels: Record<string, string> = {
  global: '全局快捷键',
  chat: '对话快捷键',
  canvas: '画布快捷键'
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @click.self="close"
    >
      <div class="bg-white rounded-xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div class="flex items-center gap-3">
            <Keyboard class="w-6 h-6 text-gray-600" />
            <h3 class="font-bold text-xl">快捷键</h3>
          </div>
          <button @click="close" class="p-1 hover:bg-gray-100 rounded">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Shortcuts List -->
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <div v-for="(shortcuts, context) in groupedShortcuts" :key="context" class="mb-6 last:mb-0">
            <h4 v-if="shortcuts.length > 0" class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {{ contextLabels[context] || context }}
            </h4>
            <div class="space-y-2">
              <div 
                v-for="shortcut in shortcuts" 
                :key="shortcut.id"
                class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50"
              >
                <span class="text-gray-700">{{ shortcut.description }}</span>
                <kbd class="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-sm font-mono text-gray-600">
                  {{ shortcutsStore.formatShortcut(shortcut.keys) }}
                </kbd>
              </div>
            </div>
          </div>

          <div v-if="shortcutsStore.shortcuts.length === 0" class="text-center py-8 text-gray-400">
            暂无已注册的快捷键
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-200 text-sm text-gray-500">
          按 <kbd class="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">?</kbd> 或 
          <kbd class="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">⌘/Ctrl + /</kbd> 打开此面板
        </div>
      </div>
    </div>
  </Teleport>
</template>
