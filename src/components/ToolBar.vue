<script setup lang="ts">
import { ref, computed } from 'vue'

export type ToolType = 'select' | 'card' | 'note' | 'image'

const emit = defineEmits<{
  (e: 'tool-change', tool: ToolType): void
}>()

const props = defineProps<{
  activeTool: ToolType
}>()

const tools = [
  { id: 'select' as ToolType, name: '选择', icon: 'cursor' },
  { id: 'card' as ToolType, name: '卡片', icon: 'card' },
  { id: 'note' as ToolType, name: '便签', icon: 'note' },
  { id: 'image' as ToolType, name: '图片', icon: 'image' },
]

function selectTool(toolId: ToolType) {
  emit('tool-change', toolId)
}
</script>

<template>
  <div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
    <div class="flex items-center gap-2 bg-white rounded-full shadow-lg px-4 py-2 border border-gray-200">
      <button
        v-for="tool in tools"
        :key="tool.id"
        @click="selectTool(tool.id)"
        :class="[
          'flex flex-col items-center justify-center w-14 h-14 rounded-lg transition-all',
          activeTool === tool.id 
            ? 'bg-ink text-white shadow-md' 
            : 'hover:bg-gray-100 text-gray-600'
        ]"
        :title="tool.name"
      >
        <!-- Cursor/Select Icon -->
        <svg v-if="tool.icon === 'cursor'" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
        
        <!-- Card Icon -->
        <svg v-else-if="tool.icon === 'card'" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        
        <!-- Note/Sticky Icon -->
        <svg v-else-if="tool.icon === 'note'" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        
        <!-- Image Icon -->
        <svg v-else-if="tool.icon === 'image'" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        
        <span class="text-xs mt-1">{{ tool.name }}</span>
      </button>
    </div>
  </div>
</template>
