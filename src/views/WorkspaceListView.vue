<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Workspace } from '@/api'

const router = useRouter()
const store = useWorkspaceStore()

// Dialog state
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showDeleteConfirm = ref(false)
const editingWorkspace = ref<Workspace | null>(null)

// Form data
const newWorkspaceName = ref('')
const newWorkspaceDescription = ref('')
const editName = ref('')
const editDescription = ref('')
const useAIGenerate = ref(false)
const aiGenerating = ref(false)
const aiDescription = ref('')
// Model selection for AI generation
import { useModelStore } from '@/stores/models'
const modelStore = useModelStore()
const showModelSelector = ref(false)
const selectedProviderId = ref<string | null>(null)
const selectedModelId = ref<string | null>(null)

onMounted(() => {
  modelStore.loadSettings()
})

// When dialog is shown, default-select the first model if available
watch(() => showCreateDialog.value, (val) => {
  if (!val) return
  // Prefill selection to first available model if any
  const providers = modelStore.enabledProviders
  let pickedProvider: string | null = null
  let pickedModel: string | null = null
  for (const p of providers) {
    if (p.models && p.models.length > 0) {
      pickedProvider = p.id
      pickedModel = p.models[0].id
      break
    }
  }
  selectedProviderId.value = pickedProvider
  selectedModelId.value = pickedModel
})

function selectModel(providerId: string, modelId: string) {
  selectedProviderId.value = providerId
  selectedModelId.value = modelId
  showModelSelector.value = false
}

function getSelectedModelLabel() {
  if (!selectedProviderId.value || !selectedModelId.value) return null
  const p = modelStore.enabledProviders.find(x => x.id === selectedProviderId.value)
  if (!p) return selectedModelId.value
  const m = p.models.find(x => x.id === selectedModelId.value)
  return m ? m.name : selectedModelId.value
}

function hasAnyModels(): boolean {
  for (const p of modelStore.enabledProviders) {
    if (p.models && p.models.length > 0) return true
  }
  return false
}

onMounted(() => {
  store.loadWorkspaces()
})

// Format timestamp
function formatDate(timestamp: number) {
  const date = new Date(timestamp * 1000)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Create workspace
async function handleCreate() {
  if (!newWorkspaceName.value.trim()) return
  
  try {
    let workspace
    
    if (useAIGenerate.value && aiDescription.value.trim()) {
      // AI generate tree structure
      aiGenerating.value = true
      try {
        // require user to select a provider/model when using AI generation
        const provider = selectedProviderId.value || undefined
        const modelId = selectedModelId.value || undefined
        const tree = await store.generateWorkspaceTree(aiDescription.value.trim(), provider, modelId)
        workspace = await store.createWorkspaceWithTree(
          newWorkspaceName.value.trim(),
          newWorkspaceDescription.value.trim() || undefined,
          tree
        )
      } finally {
        aiGenerating.value = false
      }
    } else {
      // Normal create
      workspace = await store.createWorkspace(
        newWorkspaceName.value.trim(),
        newWorkspaceDescription.value.trim() || undefined
      )
    }
    
    showCreateDialog.value = false
    newWorkspaceName.value = ''
    newWorkspaceDescription.value = ''
    useAIGenerate.value = false
    aiDescription.value = ''
    // Enter the new workspace
    if (workspace) {
      enterWorkspace(workspace.id)
    }
  } catch (err) {
    aiGenerating.value = false
    // Error is handled in store
  }
}

// Enter workspace
function enterWorkspace(id: string) {
  store.selectWorkspace(id)
  router.push({ name: 'canvas', params: { workspaceId: id } })
}

// Edit workspace
function openEditDialog(workspace: Workspace) {
  editingWorkspace.value = workspace
  editName.value = workspace.name
  editDescription.value = workspace.description || ''
  showEditDialog.value = true
}

async function handleEdit() {
  if (!editingWorkspace.value || !editName.value.trim()) return
  
  try {
    await store.updateWorkspace(editingWorkspace.value.id, {
      name: editName.value.trim(),
      description: editDescription.value.trim() || undefined
    })
    showEditDialog.value = false
    editingWorkspace.value = null
  } catch (err) {
    // Error is handled in store
  }
}

// Delete workspace
function openDeleteConfirm(workspace: Workspace) {
  editingWorkspace.value = workspace
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!editingWorkspace.value) return
  
  try {
    await store.deleteWorkspace(editingWorkspace.value.id)
    showDeleteConfirm.value = false
    editingWorkspace.value = null
  } catch (err) {
    // Error is handled in store
  }
}

// Go to settings
function goToSettings() {
  router.push({ name: 'settings' })
}

async function handleExport(workspace: Workspace) {
  try {
    const res = await store.exportWorkspaceToFile(workspace.id)
    if (res?.success) {
      window.alert('已导出到：' + res.filePath)
    }
  } catch (err: any) {
    window.alert('导出失败：' + (err.message || err))
  }
}

async function handleImport() {
  try {
    const res = await store.importWorkspaceFromFile()
    if (res?.success) {
      window.alert('导入成功')
    }
  } catch (err: any) {
    window.alert('导入失败：' + (err.message || err))
  }
}
</script>

<template>
  <div class="w-full h-full bg-paper overflow-auto">
    <div class="max-w-4xl mx-auto p-8">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-3xl font-bold text-ink mb-2">我的知识库</h1>
          <p class="text-ink/60">选择一个知识库开始探索，或创建新的知识库</p>
        </div>
        <div class="flex gap-3">
          <button
            @click="goToSettings"
            class="px-4 py-2 border-2 border-ink rounded-lg hover:bg-ink/5 transition-colors"
          >
            ⚙️ 设置
          </button>
          <button
            @click="handleImport"
            class="px-4 py-2 border-2 border-ink rounded-lg hover:bg-ink/5 transition-colors"
          >
            ⬆️ 导入
          </button>
          <button
            @click="showCreateDialog = true"
            class="px-4 py-2 bg-ink text-paper rounded-lg hover:bg-ink/80 transition-colors"
          >
            ✨ 新建知识库
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="store.isLoading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-ink border-t-transparent"></div>
        <p class="mt-4 text-ink/60">加载中...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="store.error" class="text-center py-12">
        <p class="text-red-500">{{ store.error }}</p>
        <button @click="store.loadWorkspaces" class="mt-4 px-4 py-2 border-2 border-ink rounded-lg">
          重试
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="store.workspaces.length === 0" class="text-center py-16">
        <div class="text-6xl mb-4">📚</div>
        <h2 class="text-xl font-semibold text-ink mb-2">还没有知识库</h2>
        <p class="text-ink/60 mb-6">创建你的第一个知识库，开始记录和整理你的想法</p>
        <button
          @click="showCreateDialog = true"
          class="px-6 py-3 bg-ink text-paper rounded-lg hover:bg-ink/80 transition-colors"
        >
          ✨ 创建第一个知识库
        </button>
      </div>

      <!-- Workspace List -->
      <div v-else class="grid gap-4 md:grid-cols-2">
        <div
          v-for="workspace in store.sortedWorkspaces"
          :key="workspace.id"
          class="group relative bg-white border-2 border-ink/20 rounded-xl p-6 hover:border-ink/40 hover:shadow-lg transition-all cursor-pointer"
          @click="enterWorkspace(workspace.id)"
        >
          <!-- Workspace Icon -->
          <div class="text-3xl mb-3">🧠</div>
          
          <!-- Workspace Info -->
          <h3 class="text-lg font-semibold text-ink mb-2 group-hover:underline">
            {{ workspace.name }}
          </h3>
          <p v-if="workspace.description" class="text-sm text-ink/60 mb-4 line-clamp-2">
            {{ workspace.description }}
          </p>
          
          <!-- Timestamp -->
          <p class="text-xs text-ink/40">
            更新于 {{ formatDate(workspace.updated_at) }}
          </p>

          <!-- Action Buttons -->
          <div 
            class="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
            @click.stop
          >
            <button
              @click="handleExport(workspace)"
              class="p-2 bg-paper border-2 border-ink/20 rounded-lg hover:border-ink/40 hover:bg-ink/5 transition-colors"
              title="导出"
            >
              ⤓
            </button>
            <button
              @click="openEditDialog(workspace)"
              class="p-2 bg-paper border-2 border-ink/20 rounded-lg hover:border-ink/40 hover:bg-ink/5 transition-colors"
              title="编辑"
            >
              ✏️
            </button>
            <button
              @click="openDeleteConfirm(workspace)"
              class="p-2 bg-paper border-2 border-red-300 rounded-lg hover:border-red-500 hover:bg-red-50 transition-colors"
              title="删除"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <Teleport to="body">
      <div v-if="showCreateDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-paper rounded-xl p-6 w-full max-w-md shadow-xl border-2 border-ink" @click.stop>
          <h2 class="text-xl font-bold text-ink mb-4">创建新知识库</h2>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-ink mb-1">名称 *</label>
              <input
                v-model="newWorkspaceName"
                type="text"
                placeholder="例如：学习笔记、项目文档..."
                class="w-full px-3 py-2 border-2 border-ink/20 rounded-lg focus:border-ink focus:outline-none"
                @keyup.enter="handleCreate"
              />
            </div>
            
            <div>
              <label class="block text-sm font-medium text-ink mb-1">描述</label>
              <textarea
                v-model="newWorkspaceDescription"
                placeholder="简单描述这个知识库的用途..."
                rows="3"
                class="w-full px-3 py-2 border-2 border-ink/20 rounded-lg focus:border-ink focus:outline-none resize-none"
              ></textarea>
            </div>

            <!-- AI Generate Option -->
            <div class="border-t border-ink/10 pt-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="useAIGenerate"
                  type="checkbox"
                  class="w-4 h-4 rounded border-ink/20 text-ink focus:ring-ink"
                />
                <span class="text-sm font-medium text-ink">🤖 使用 AI 生成基础结构</span>
              </label>
              
              <div v-if="useAIGenerate" class="mt-3">
                <label class="block text-sm font-medium text-ink mb-1">描述你想要的知识树结构</label>
                <textarea
                  v-model="aiDescription"
                  placeholder="例如：一个关于 Vue.js 学习的知识库，包含基础语法、组件、状态管理、路由等主题..."
                  rows="4"
                  class="w-full px-3 py-2 border-2 border-ink/20 rounded-lg focus:border-ink focus:outline-none resize-none"
                ></textarea>
                <!-- Model selector (mimic Chat Drawer selector) -->
                <div class="mt-3">
                  <label class="block text-sm font-medium text-ink mb-1">选择模型</label>
                  <div class="relative">
                    <button
                      @click="showModelSelector = !showModelSelector"
                      class="flex items-center gap-2 px-3 py-2 bg-white border border-ink/20 rounded-lg hover:bg-gray-50 text-sm w-full justify-between"
                    >
                      <span class="flex items-center gap-2">
                        <span v-if="selectedProviderId && selectedModelId">
                          <!-- Show selected model name -->
                          <span class="font-medium text-ink">{{ getSelectedModelLabel() }}</span>
                        </span>
                        <span v-else class="text-gray-400">请选择模型</span>
                      </span>
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clip-rule="evenodd" />
                      </svg>
                    </button>

                    <div v-if="showModelSelector" class="absolute top-full left-0 right-0 mt-1 bg-white border border-ink/20 rounded-lg shadow-lg z-50 max-h-56 overflow-y-auto">
                      <div v-for="provider in modelStore.enabledProviders" :key="provider.id" class="border-b border-ink/10 last:border-0">
                        <div class="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50">
                          {{ provider.icon }} {{ provider.name }}
                        </div>
                        <button
                          v-for="model in provider.models"
                          :key="model.id"
                            @click="selectModel(provider.id, model.id)"
                          :class="[
                            'w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors',
                            selectedProviderId === provider.id && selectedModelId === model.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                          ]"
                        >
                          {{ model.name }}
                        </button>
                      </div>
                      <div v-if="modelStore.enabledProviders.length === 0" class="px-3 py-4 text-sm text-gray-500 text-center">
                        暂无可用模型，请先在设置中启用
                      </div>
                    </div>

                    <!-- click outside overlay -->
                    <div v-if="showModelSelector" @click="showModelSelector = false" class="fixed inset-0 z-40"></div>
                  </div>
                </div>
                <p class="text-xs text-ink/60 mt-1">AI 将根据描述生成一个初始的卡片树结构</p>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-3 mt-6">
            <button
              @click="showCreateDialog = false"
              :disabled="aiGenerating"
              class="px-4 py-2 border-2 border-ink/20 rounded-lg hover:border-ink/40 transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              @click="handleCreate"
              :disabled="!newWorkspaceName.trim() || aiGenerating || (useAIGenerate && !aiDescription.trim()) || (useAIGenerate && hasAnyModels() && !selectedModelId)"
              class="px-4 py-2 bg-ink text-paper rounded-lg hover:bg-ink/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span v-if="aiGenerating" class="animate-spin">⏳</span>
              {{ aiGenerating ? 'AI 生成中...' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Edit Dialog -->
    <Teleport to="body">
      <div v-if="showEditDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-paper rounded-xl p-6 w-full max-w-md shadow-xl border-2 border-ink" @click.stop>
          <h2 class="text-xl font-bold text-ink mb-4">编辑知识库</h2>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-ink mb-1">名称 *</label>
              <input
                v-model="editName"
                type="text"
                class="w-full px-3 py-2 border-2 border-ink/20 rounded-lg focus:border-ink focus:outline-none"
                @keyup.enter="handleEdit"
              />
            </div>
            
            <div>
              <label class="block text-sm font-medium text-ink mb-1">描述</label>
              <textarea
                v-model="editDescription"
                rows="3"
                class="w-full px-3 py-2 border-2 border-ink/20 rounded-lg focus:border-ink focus:outline-none resize-none"
              ></textarea>
            </div>
          </div>

          <div class="flex justify-end gap-3 mt-6">
            <button
              @click="showEditDialog = false"
              class="px-4 py-2 border-2 border-ink/20 rounded-lg hover:border-ink/40 transition-colors"
            >
              取消
            </button>
            <button
              @click="handleEdit"
              :disabled="!editName.trim()"
              class="px-4 py-2 bg-ink text-paper rounded-lg hover:bg-ink/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete Confirm Dialog -->
    <Teleport to="body">
      <div v-if="showDeleteConfirm" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-paper rounded-xl p-6 w-full max-w-md shadow-xl border-2 border-red-500" @click.stop>
          <h2 class="text-xl font-bold text-red-600 mb-4">⚠️ 确认删除</h2>
          
          <p class="text-ink mb-2">
            确定要删除知识库 <strong>"{{ editingWorkspace?.name }}"</strong> 吗？
          </p>
          <p class="text-ink/60 text-sm mb-6">
            此操作将永久删除该知识库中的所有卡片、连接和对话记录，且无法恢复。
          </p>

          <div class="flex justify-end gap-3">
            <button
              @click="showDeleteConfirm = false"
              class="px-4 py-2 border-2 border-ink/20 rounded-lg hover:border-ink/40 transition-colors"
            >
              取消
            </button>
            <button
              @click="handleDelete"
              class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              确认删除
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.line-clamp-2 {
line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

}
</style>
