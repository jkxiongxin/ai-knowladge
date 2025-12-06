<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { marked } from 'marked'

const props = defineProps<{
  modelValue: boolean
  content: string
  title?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save', content: string): void
  (e: 'cancel'): void
}>()

const visible = ref(props.modelValue)
const editor = ref(props.content || '')
const preview = ref(false)

watch(() => props.modelValue, (v) => visible.value = v)
watch(() => props.content, (v) => { if (!visible.value) editor.value = v })

function close() {
  emit('update:modelValue', false)
  emit('cancel')
}

async function save() {
  emit('save', editor.value)
  emit('update:modelValue', false)
  // give renderer a moment before ending
  await nextTick()
}

const rendered = () => marked.parse(editor.value || '')
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div class="absolute inset-0 bg-black/40" @click="close"></div>

      <div class="relative w-full max-w-4xl h-[80vh] bg-white rounded-xl shadow-2xl z-60 flex flex-col overflow-hidden">
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <div class="flex items-center gap-3">
            <h3 class="font-semibold text-lg">编辑摘要</h3>
            <div class="text-sm text-gray-500">{{ props.title }}</div>
          </div>
          <div class="flex items-center gap-2">
            <button @click="preview = !preview" class="px-3 py-1 border rounded text-sm">{{ preview ? '编辑' : '预览' }}</button>
            <button @click="save" class="px-4 py-2 bg-ink text-white rounded">保存</button>
            <button @click="close" class="px-3 py-2 text-sm">取消</button>
          </div>
        </div>

        <div class="flex-1 flex overflow-hidden">
          <div v-if="!preview" class="flex-1 p-4">
            <textarea v-model="editor" class="w-full h-full resize-none p-4 border rounded text-sm font-sans" />
          </div>
          <div v-else class="flex-1 p-6 overflow-auto prose max-w-none">
            <div v-html="rendered()" />
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.prose a { color: #2b6cb0; }
</style>
