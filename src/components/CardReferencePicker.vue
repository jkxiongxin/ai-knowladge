<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { Search, FileText, X } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'select', reference: string): void
}>()

const store = useCanvasStore()
const searchQuery = ref('')
const cards = ref<Array<{ id: string, title: string, summary: string }>>([])
const isLoading = ref(false)

const filteredCards = computed(() => {
  if (!searchQuery.value.trim()) return cards.value
  const query = searchQuery.value.toLowerCase()
  return cards.value.filter(card => 
    card.title.toLowerCase().includes(query) ||
    card.summary.toLowerCase().includes(query)
  )
})

async function loadCards() {
  isLoading.value = true
  try {
    cards.value = await store.getAvailableCards()
    // Exclude current card if chat is open
    if (store.activeCardId) {
      cards.value = cards.value.filter(c => c.id !== store.activeCardId)
    }
  } catch (err) {
    console.error('Failed to load cards:', err)
  } finally {
    isLoading.value = false
  }
}

watch(() => props.modelValue, (val) => {
  if (val) {
    loadCards()
    searchQuery.value = ''
  }
})

async function selectCard(card: { id: string, title: string, summary: string }) {
  const reference = `[参考卡片: ${card.title}]\n${card.summary || '(无摘要)'}\n`
  emit('select', reference)
  emit('update:modelValue', false)
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
      <div class="bg-white rounded-xl shadow-2xl w-[500px] max-h-[70vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 class="font-bold text-lg">插入卡片引用</h3>
          <button @click="close" class="p-1 hover:bg-gray-100 rounded">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Search -->
        <div class="px-4 py-3 border-b border-gray-100">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索卡片..."
              class="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
              autofocus
            />
          </div>
        </div>

        <!-- Cards List -->
        <div class="flex-1 overflow-y-auto px-2 py-2">
          <div v-if="isLoading" class="text-center py-8 text-gray-400">
            加载中...
          </div>
          <div v-else-if="filteredCards.length === 0" class="text-center py-8 text-gray-400">
            {{ searchQuery ? '未找到匹配的卡片' : '暂无其他卡片' }}
          </div>
          <button
            v-else
            v-for="card in filteredCards"
            :key="card.id"
            @click="selectCard(card)"
            class="w-full text-left p-3 rounded-lg hover:bg-blue-50 transition-colors flex items-start gap-3 mb-1"
          >
            <FileText class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <div class="font-medium text-gray-900 truncate">{{ card.title }}</div>
              <div class="text-sm text-gray-500 line-clamp-2 mt-0.5">
                {{ card.summary || '(无摘要)' }}
              </div>
            </div>
          </button>
        </div>

        <!-- Footer -->
        <div class="px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
          选择卡片后，其摘要将作为引用插入到对话中
        </div>
      </div>
    </div>
  </Teleport>
</template>
