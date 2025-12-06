<script setup lang="ts">
import { computed, ref } from 'vue'
import { marked } from 'marked'
import type { Message } from '@/api'
import { ChevronDown, ChevronRight, Pencil, RotateCcw, Check, X } from 'lucide-vue-next'

const props = defineProps<{
  message: Message
  canResend?: boolean
}>()

const emit = defineEmits<{
  (e: 'edit', content: string): void
  (e: 'resend', content: string): void
}>()

const isUser = computed(() => props.message.role === 'user')
const thinkExpanded = ref(false)
const isEditing = ref(false)
const editContent = ref('')

function startEdit() {
  editContent.value = props.message.content
  isEditing.value = true
}

function cancelEdit() {
  isEditing.value = false
  editContent.value = ''
}

function saveEdit() {
  if (editContent.value.trim() && editContent.value !== props.message.content) {
    emit('edit', editContent.value)
  }
  isEditing.value = false
}

function handleResend() {
  if (isUser.value) {
    emit('resend', editContent.value || props.message.content)
  }
  isEditing.value = false
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface ParsedContent {
  thinkContent: string
  mainContent: string
  isThinking: boolean
}

function parseThinkTags(raw: string): ParsedContent {
  const thinkOpenRegex = /<think>/gi
  const thinkCloseRegex = /<\/think>/gi
  
  const openMatch = thinkOpenRegex.exec(raw)
  const closeMatch = thinkCloseRegex.exec(raw)
  
  if (!openMatch) {
    return { thinkContent: '', mainContent: raw, isThinking: false }
  }
  
  const openIndex = openMatch.index + openMatch[0].length
  
  if (!closeMatch) {
    return {
      thinkContent: raw.substring(openIndex),
      mainContent: '',
      isThinking: true
    }
  }
  
  const closeIndex = closeMatch.index
  
  return {
    thinkContent: raw.substring(openIndex, closeIndex),
    mainContent: raw.substring(0, openMatch.index) + raw.substring(closeIndex + closeMatch[0].length),
    isThinking: false
  }
}

const parsedContent = computed(() => {
  const raw = props.message.content || ''
  return parseThinkTags(raw)
})

const renderedThink = computed(() => {
  const content = parsedContent.value.thinkContent
  if (!content) return ''
  
  try {
    if ((props.message as any).isStreaming || parsedContent.value.isThinking) {
      return escapeHtml(content).replace(/\n/g, '<br/>')
    }
    return marked.parse(content)
  } catch (e) {
    return escapeHtml(content).replace(/\n/g, '<br/>')
  }
})

const renderedMain = computed(() => {
  const content = parsedContent.value.mainContent
  
  // 如果没有主内容
  if (!content) {
    // 只有在正在思考中（标签未闭合）时才返回空
    if (parsedContent.value.isThinking && (props.message as any).isStreaming) {
      return ''
    }
    // 否则返回空内容（避免显示空白）
    return content
  }
  
  try {
    if ((props.message as any).isStreaming) {
      return escapeHtml(content).replace(/\n/g, '<br/>')
    }
    return marked.parse(content)
  } catch (e) {
    return escapeHtml(content).replace(/\n/g, '<br/>')
  }
})

const hasThinkContent = computed(() => {
  return parsedContent.value.thinkContent.length > 0
})
</script>

<template>
  <div class="flex w-full mb-4" :class="isUser ? 'justify-end' : 'justify-start'">
    <div 
      class="max-w-[80%] p-3 rounded-2xl text-sm relative shadow-sm group"
      :class="[
        isUser ? 'bg-ink text-white rounded-tr-none' : 'bg-white border border-gray-200 rounded-tl-none text-ink'
      ]"
    >
      <!-- Avatar Placeholder (Optional) -->
      <div v-if="!isUser" class="absolute -left-8 top-0 w-6 h-6 rounded-full bg-chalk-blue border border-ink flex items-center justify-center text-[10px]">
        AI
      </div>

      <!-- Edit/Action buttons -->
      <div 
        v-if="!isEditing && !(message as any).isStreaming" 
        class="absolute -top-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1"
      >
        <button 
          @click.stop="startEdit"
          class="p-1 bg-white border border-gray-200 rounded shadow-sm hover:bg-gray-50"
          :title="isUser ? '编辑并重发' : '编辑回复'"
        >
          <Pencil class="w-3 h-3 text-gray-600" />
        </button>
        <button 
          v-if="isUser && canResend"
          @click.stop="handleResend"
          class="p-1 bg-white border border-gray-200 rounded shadow-sm hover:bg-gray-50"
          title="从此处重新生成"
        >
          <RotateCcw class="w-3 h-3 text-gray-600" />
        </button>
      </div>

      <!-- Editing Mode -->
      <div v-if="isEditing" class="min-w-[200px]">
        <textarea
          v-model="editContent"
          @keydown.esc="cancelEdit"
          @keydown.ctrl.enter="saveEdit"
          @keydown.meta.enter="saveEdit"
          class="w-full min-h-[60px] p-2 rounded border border-gray-300 text-ink bg-white resize-y text-sm"
          autofocus
        ></textarea>
        <div class="flex justify-end gap-2 mt-2">
          <button 
            @click="cancelEdit"
            class="p-1 px-2 text-xs bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
          >
            <X class="w-3 h-3" />
            取消
          </button>
          <button 
            @click="saveEdit"
            class="p-1 px-2 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded flex items-center gap-1"
          >
            <Check class="w-3 h-3" />
            保存
          </button>
          <button 
            v-if="isUser"
            @click="handleResend"
            class="p-1 px-2 text-xs bg-green-500 hover:bg-green-600 text-white rounded flex items-center gap-1"
          >
            <RotateCcw class="w-3 h-3" />
            重发
          </button>
        </div>
      </div>

      <!-- Normal Display Mode -->
      <div v-else class="whitespace-pre-wrap font-sans">
        <!-- Think Section -->
        <div v-if="hasThinkContent && !isUser" class="mb-3 border-l-2 border-gray-300 pl-3">
          <button 
            @click="thinkExpanded = !thinkExpanded"
            class="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-1"
          >
            <ChevronRight v-if="!thinkExpanded" class="w-3 h-3" />
            <ChevronDown v-else class="w-3 h-3" />
            <span>思考过程</span>
            <span v-if="parsedContent.isThinking" class="animate-pulse">...</span>
          </button>
          <div v-if="thinkExpanded" class="text-xs text-gray-600 bg-gray-50 p-2 rounded">
            <div v-html="renderedThink" />
          </div>
        </div>

        <!-- Main Content -->
        <div v-if="renderedMain" v-html="renderedMain" />
        <div v-else-if="parsedContent.isThinking && !isUser" class="text-gray-400 text-xs italic">
          正在思考中...
        </div>
      </div>
    </div>
  </div>
</template>
