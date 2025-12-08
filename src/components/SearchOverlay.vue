<template>
  <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/40" @click="close" />
    <div class="relative w-[min(820px,90%)] bg-white rounded-lg shadow-lg p-4 z-10">
      <div class="flex items-center gap-2 mb-3">
        <input
          ref="inputRef"
          v-model="query"
          @keydown.enter.prevent="onEnter"
          @keydown.esc.prevent="close"
          class="w-full p-2 border rounded"
          placeholder="搜索卡片标题或摘要... (按 Enter 定位)"
        />
        <button @click="close" class="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200">关闭</button>
      </div>
      <div class="max-h-64 overflow-auto">
        <ul>
          <li
            v-for="node in filteredNodes"
            :key="node.id"
            @click="selectNode(node.id)"
            class="p-2 cursor-pointer hover:bg-gray-50 border-b last:border-b-0"
          >
            <div class="font-semibold">{{ node.data.title }}</div>
            <div class="text-sm text-gray-600 truncate">{{ node.data.summary }}</div>
          </li>
        </ul>
        <p v-if="filteredNodes.length === 0" class="text-sm text-gray-500">未找到匹配项</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useCanvasStore } from '@/stores/canvas'

const props = defineProps<{ visible: boolean }>()
const emits = defineEmits(['close', 'select'])

const store = useCanvasStore()
const query = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const filteredNodes = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return store.nodes
  return store.nodes.filter(n => (n.data.title || '').toLowerCase().includes(q) || (n.data.summary || '').toLowerCase().includes(q))
})

function close() {
  emits('close')
  query.value = ''
}

function selectNode(id: string) {
  emits('select', id)
  close()
}

function onEnter() {
  if (filteredNodes.value.length > 0) {
    selectNode(filteredNodes.value[0].id)
  }
}

onMounted(() => {
  watch(() => props.visible, (v) => {
    if (v && inputRef.value) {
      setTimeout(() => inputRef.value?.focus(), 50)
    }
  })
})
</script>

<style scoped>
/* simple overlay */
</style>
