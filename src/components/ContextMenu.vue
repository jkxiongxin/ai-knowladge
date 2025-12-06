<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

export interface MenuItem {
  id: string
  label: string
  icon?: string
  divider?: boolean
  disabled?: boolean
}

const props = defineProps<{
  items: MenuItem[]
}>()

const emit = defineEmits<{
  (e: 'select', item: MenuItem): void
  (e: 'close'): void
}>()

const menuRef = ref<HTMLElement | null>(null)
const position = ref({ x: 0, y: 0 })
const isVisible = ref(false)

function show(x: number, y: number) {
  position.value = { x, y }
  isVisible.value = true
  
  // Adjust position if menu goes off screen
  setTimeout(() => {
    if (menuRef.value) {
      const rect = menuRef.value.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      
      if (rect.right > viewportWidth) {
        position.value.x = viewportWidth - rect.width - 10
      }
      if (rect.bottom > viewportHeight) {
        position.value.y = viewportHeight - rect.height - 10
      }
    }
  }, 0)
}

function hide() {
  isVisible.value = false
  emit('close')
}

function selectItem(item: MenuItem) {
  if (item.disabled || item.divider) return
  emit('select', item)
  hide()
}

function handleClickOutside(event: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    hide()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('contextmenu', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('contextmenu', handleClickOutside)
})

defineExpose({
  show,
  hide,
  isVisible
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isVisible"
      ref="menuRef"
      class="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-[160px]"
      :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    >
      <template v-for="item in items" :key="item.id">
        <!-- Divider -->
        <div v-if="item.divider" class="border-t border-gray-200 my-1"></div>
        
        <!-- Menu Item -->
        <button
          v-else
          @click="selectItem(item)"
          :disabled="item.disabled"
          :class="[
            'w-full px-4 py-2 text-left text-sm flex items-center gap-3 transition-colors',
            item.disabled 
              ? 'text-gray-400 cursor-not-allowed' 
              : 'text-gray-700 hover:bg-gray-100'
          ]"
        >
          <!-- Card Icon -->
          <svg v-if="item.icon === 'card'" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          
          <!-- Note Icon -->
          <svg v-else-if="item.icon === 'note'" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          
          <!-- Image Icon -->
          <svg v-else-if="item.icon === 'image'" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          
          <!-- Paste Icon -->
          <svg v-else-if="item.icon === 'paste'" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          
          <span v-else class="w-4"></span>
          
          {{ item.label }}
        </button>
      </template>
    </div>
  </Teleport>
</template>
