<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useModelStore } from '@/stores/models'
import { type ProviderType, type ProviderConfig, PROVIDER_DEFINITIONS } from '@/types/models'

const router = useRouter()
const modelStore = useModelStore()
import { electronApi } from '@/api'

// Currently selected provider for editing
const selectedProviderId = ref<ProviderType>('ollama')

const selectedProvider = computed(() => {
  return modelStore.providers[selectedProviderId.value]
})

// Form state for editing
const editForm = ref({
  apiKey: '',
  baseUrl: '',
  temperature: 0.7,
  maxTokens: 4096,
  topP: 0.9
})

// Custom model form
const showAddModel = ref(false)
const newModel = ref({
  id: '',
  name: ''
})

// Model management
const isFetchingModels = ref(false)
const fetchError = ref('')
const availableRemoteModels = ref<Array<{ id: string; name: string; provider: string }>>([])
const showModelSelector = ref(false)
const searchTerm = ref('')
// Toggle to show/hide API key input
const showApiKey = ref(false)

const filteredRemoteModels = computed(() => {
  const q = searchTerm.value.trim().toLowerCase()
  if (!q) return availableRemoteModels.value
  return availableRemoteModels.value.filter(m => {
    const id = (m.id || '').toLowerCase()
    const name = (m.name || '').toLowerCase()
    return id.includes(q) || name.includes(q)
  })
})

// Load provider data into form when selection changes
function selectProvider(providerId: ProviderType) {
  selectedProviderId.value = providerId
  // Reset the key visibility whenever provider changes for safety
  showApiKey.value = false
  const provider = modelStore.providers[providerId]
  if (provider) {
    editForm.value = {
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      temperature: provider.temperature,
      maxTokens: provider.maxTokens,
      topP: provider.topP
    }
  }
}

// Save current provider settings
function saveProviderSettings() {
  modelStore.updateProvider(selectedProviderId.value, {
    apiKey: editForm.value.apiKey,
    baseUrl: editForm.value.baseUrl,
    temperature: editForm.value.temperature,
    maxTokens: editForm.value.maxTokens,
    topP: editForm.value.topP
  })
}

// Toggle provider enabled state
function toggleProvider(providerId: ProviderType) {
  const provider = modelStore.providers[providerId]
  if (provider) {
    modelStore.updateProvider(providerId, { enabled: !provider.enabled })
  }
}

// Add custom model
function addModel() {
  if (newModel.value.id && newModel.value.name) {
    modelStore.addCustomModel(selectedProviderId.value, {
      id: newModel.value.id,
      name: newModel.value.name,
      provider: selectedProviderId.value
    })
    newModel.value = { id: '', name: '' }
    showAddModel.value = false
  }
}

// Remove model
function removeModel(modelId: string) {
  modelStore.removeCustomModel(selectedProviderId.value, modelId)
}

// Fetch models from remote provider
async function fetchModels() {
  const provider = selectedProvider.value
  if (!provider) {
    fetchError.value = '请先选择提供商'
    return
  }

  // Check if required credentials are available
  if (selectedProviderId.value !== 'ollama' && !provider.apiKey) {
    fetchError.value = '请先配置 API Key'
    return
  }

  isFetchingModels.value = true
  fetchError.value = ''
  searchTerm.value = '' // Clear search when fetching new models
  
  try {
    const config: any = {
      baseUrl: provider.baseUrl
    }
    
    if (selectedProviderId.value !== 'ollama') {
      config.apiKey = provider.apiKey
    }
    
    const models = await modelStore.fetchModelsFromProvider(selectedProviderId.value, config)
    availableRemoteModels.value = models
    showModelSelector.value = true
  } catch (error: any) {
    fetchError.value = error.message || '获取模型列表失败'
    console.error('Failed to fetch models:', error)
  } finally {
    isFetchingModels.value = false
  }
}

// Sync models with remote
async function syncModels() {
  const provider = selectedProvider.value
  if (!provider) {
    fetchError.value = '请先选择提供商'
    return
  }

  // Check if required credentials are available
  if (selectedProviderId.value !== 'ollama' && !provider.apiKey) {
    fetchError.value = '请先配置 API Key'
    return
  }
  
  isFetchingModels.value = true
  fetchError.value = ''
  
  try {
    await modelStore.syncProviderModels(selectedProviderId.value)
    // Refresh the current provider data
    selectProvider(selectedProviderId.value)
    showModelSelector.value = false
  } catch (error: any) {
    fetchError.value = error.message || '同步模型失败'
    console.error('Failed to sync models:', error)
  } finally {
    isFetchingModels.value = false
  }
}

// Add model from remote list
function addRemoteModel(model: any) {
  modelStore.addCustomModel(selectedProviderId.value, model)
  // Remove from available list
  availableRemoteModels.value = availableRemoteModels.value.filter(m => m.id !== model.id)
}

// Check if model is already added
function isModelAdded(modelId: string) {
  return selectedProvider.value?.models.some(m => m.id === modelId)
}

// Go back to canvas
function goBack() {
  router.push('/')
}

onMounted(() => {
  modelStore.loadSettings()
  selectProvider('ollama')
})

async function exportDatabase() {
  try {
    const res = await electronApi.exportDatabase()
    if (res?.success) window.alert('数据库已导出到：' + res.filePath)
  } catch (err: any) {
    window.alert('导出数据库失败：' + (err.message || err))
  }
}

async function importDatabase() {
  try {
    const res = await electronApi.importDatabase()
    if (res?.success) window.alert('数据库已替换 (备份在)：' + (res.backup || 'unknown'))
  } catch (err: any) {
    window.alert('导入数据库失败：' + (err.message || err))
  }
}
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-50">
    <!-- Header -->
    <header class="h-14 bg-white border-b border-gray-200 flex items-center px-6 shrink-0">
      <button @click="goBack" class="mr-4 p-2 hover:bg-gray-100 rounded-lg transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </button>
      <h1 class="text-xl font-semibold text-gray-800">模型设置</h1>
    </header>

    <div class="flex-1 flex overflow-hidden">
      <!-- Left Sidebar - Provider List -->
      <aside class="w-64 bg-white border-r border-gray-200 overflow-y-auto">
        <div class="p-4">
          <h2 class="text-sm font-medium text-gray-500 mb-3">模型提供商</h2>
          <div class="space-y-1">
            <button
              v-for="(def, key) in PROVIDER_DEFINITIONS"
              :key="key"
              @click="selectProvider(key)"
              :class="[
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left',
                selectedProviderId === key 
                  ? 'bg-blue-50 text-blue-700' 
                  : 'hover:bg-gray-50 text-gray-700'
              ]"
            >
              <span class="text-xl">{{ def.icon }}</span>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">{{ def.name }}</div>
                <div class="text-xs text-gray-500 truncate">{{ def.description }}</div>
              </div>
              <!-- Enabled indicator -->
              <div 
                v-if="modelStore.providers[key]?.enabled"
                class="w-2 h-2 bg-green-500 rounded-full"
              ></div>
            </button>
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 overflow-y-auto p-6">
        <div v-if="selectedProvider" class="max-w-2xl">
          <!-- Provider Header -->
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <span class="text-3xl">{{ selectedProvider.icon }}</span>
              <div>
                <h2 class="text-2xl font-bold text-gray-900">{{ selectedProvider.name }}</h2>
                <p class="text-gray-500">{{ selectedProvider.description }}</p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                :checked="selectedProvider.enabled"
                @change="toggleProvider(selectedProviderId)"
                class="sr-only peer"
              >
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              <span class="ms-3 text-sm font-medium text-gray-700">{{ selectedProvider.enabled ? '已启用' : '未启用' }}</span>
            </label>
          </div>

          <!-- API Configuration -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">API 配置</h3>
            
            <!-- API Key -->
            <div class="mb-4" v-if="selectedProviderId !== 'ollama'">
              <label class="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <div class="relative">
                <input
                  v-model="editForm.apiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  @blur="saveProviderSettings"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                    :placeholder="selectedProviderId === 'dashscope' ? 'ModelScope token (x-modelscope-token)' : 'sk...'"
                />
                <button
                  type="button"
                  @click="showApiKey = !showApiKey"
                  class="absolute right-2 top-2 p-1 text-gray-400 hover:text-gray-600"
                  :aria-label="showApiKey ? 'Hide API key' : 'Show API key'"
                >
                  <svg v-if="!showApiKey" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.269-2.943-9.543-7a10.05 10.05 0 012.155-3.412M6.232 6.232A10.05 10.05 0 0112 5c4.477 0 8.268 2.943 9.542 7a10.05 10.05 0 01-1.197 2.459M3 3l18 18" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Base URL -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-1">API 地址</label>
              <input
                v-model="editForm.baseUrl"
                type="text"
                @blur="saveProviderSettings"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="https://api.example.com/v1"
              />
              <p class="text-xs text-gray-500 mt-1">默认：{{ PROVIDER_DEFINITIONS[selectedProviderId].baseUrl || '未设置' }}</p>
            </div>
          </div>

          <!-- Generation Settings -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">生成参数</h3>
            
            <!-- Temperature -->
            <div class="mb-6">
              <div class="flex justify-between mb-1">
                <label class="text-sm font-medium text-gray-700">Temperature (温度)</label>
                <span class="text-sm text-gray-500">{{ editForm.temperature.toFixed(2) }}</span>
              </div>
              <input
                v-model.number="editForm.temperature"
                type="range"
                min="0"
                max="2"
                step="0.1"
                @change="saveProviderSettings"
                class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div class="flex justify-between text-xs text-gray-400 mt-1">
                <span>精确</span>
                <span>创意</span>
              </div>
            </div>

            <!-- Max Tokens -->
            <div class="mb-6">
              <div class="flex justify-between mb-1">
                <label class="text-sm font-medium text-gray-700">Max Tokens (最大输出)</label>
                <span class="text-sm text-gray-500">{{ editForm.maxTokens }}</span>
              </div>
              <input
                v-model.number="editForm.maxTokens"
                type="range"
                min="256"
                max="32768"
                step="256"
                @change="saveProviderSettings"
                class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div class="flex justify-between text-xs text-gray-400 mt-1">
                <span>256</span>
                <span>32768</span>
              </div>
            </div>

            <!-- Top P -->
            <div>
              <div class="flex justify-between mb-1">
                <label class="text-sm font-medium text-gray-700">Top P (核采样)</label>
                <span class="text-sm text-gray-500">{{ editForm.topP.toFixed(2) }}</span>
              </div>
              <input
                v-model.number="editForm.topP"
                type="range"
                min="0"
                max="1"
                step="0.05"
                @change="saveProviderSettings"
                class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          <!-- Available Models -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-gray-900">可用模型</h3>
              <div class="flex gap-2">
                <button 
                  @click="fetchModels"
                  :disabled="isFetchingModels"
                  class="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                >
                  {{ isFetchingModels ? '获取中...' : '获取模型列表' }}
                </button>
                <button 
                  v-if="selectedProviderId === 'custom' || selectedProviderId === 'ollama'"
                  @click="showAddModel = true"
                  class="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  + 添加模型
                </button>
              </div>
            </div>

            <!-- Fetch Error -->
            <div v-if="fetchError" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p class="text-sm text-red-600">{{ fetchError }}</p>
            </div>

            <!-- Add Model Form -->
            <div v-if="showAddModel" class="mb-4 p-4 bg-gray-50 rounded-lg">
              <div class="flex gap-3">
                <input
                  v-model="newModel.id"
                  type="text"
                  placeholder="模型 ID (如 gpt-4)"
                  class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <input
                  v-model="newModel.name"
                  type="text"
                  placeholder="显示名称"
                  class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <button 
                  @click="addModel"
                  class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  添加
                </button>
                <button 
                  @click="showAddModel = false"
                  class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                >
                  取消
                </button>
              </div>
            </div>

            <!-- Remote Models Selector -->
            <div v-if="showModelSelector && availableRemoteModels.length > 0" class="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 class="text-sm font-medium text-blue-900 mb-3">发现以下模型，点击添加到可用列表：</h4>
              <div class="space-y-2 max-h-48 overflow-y-auto">
                <div
                  v-for="model in availableRemoteModels"
                  :key="model.id"
                  class="flex items-center justify-between p-2 bg-white rounded border border-blue-200"
                >
                  <div class="flex-1">
                    <div class="font-medium text-gray-900">{{ model.name }}</div>
                    <div class="text-xs text-gray-500">{{ model.id }}</div>
                  </div>
                  <button
                    @click="addRemoteModel(model)"
                    :disabled="isModelAdded(model.id)"
                    class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {{ isModelAdded(model.id) ? '已添加' : '添加' }}
                  </button>
                </div>
              </div>
              <div class="mt-3 flex gap-2">
                <button
                  @click="syncModels"
                  :disabled="isFetchingModels"
                  class="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                >
                  {{ isFetchingModels ? '同步中...' : '一键同步所有模型' }}
                </button>
                <button
                  @click="showModelSelector = false"
                  class="text-sm text-gray-600 hover:text-gray-700"
                >
                  关闭
                </button>
              </div>
            </div>

            <!-- Model List -->
            <div class="space-y-2">
              <div
                v-for="model in selectedProvider.models"
                :key="model.id"
                class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <div class="font-medium text-gray-900">{{ model.name }}</div>
                  <div class="text-sm text-gray-500">{{ model.id }}</div>
                </div>
                <div class="flex items-center gap-3">
                  <span v-if="model.contextLength" class="text-xs text-gray-400">
                    {{ (model.contextLength / 1000).toFixed(0) }}K context
                  </span>
                  <button
                    v-if="selectedProviderId === 'custom' || selectedProviderId === 'ollama'"
                    @click="removeModel(model.id)"
                    class="text-red-500 hover:text-red-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <p v-if="selectedProvider.models.length === 0" class="text-gray-500 text-center py-4">
              暂无模型，请添加
            </p>
          </div>

          <!-- Backup & Restore -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-gray-900">备份 & 恢复</h3>
              <div class="text-sm text-gray-500">防止升级或迁移时丢失数据</div>
            </div>

            <div class="flex gap-3">
              <button @click="exportDatabase" class="px-4 py-2 bg-ink text-white rounded-lg hover:bg-ink/80">导出数据库</button>
              <button @click="importDatabase" class="px-4 py-2 border rounded-lg hover:bg-gray-50">从文件导入数据库</button>
            </div>
            <p class="text-xs text-gray-400 mt-3">提示：导出将把当前 SQLite 数据库文件保存到本地磁盘；导入将替换当前数据库（会尝试备份旧数据库）。</p>
          </div>
        </div>
      </main>
    </div>
  </div>

<!-- Model Selector Modal -->
<teleport to="body">
  <div v-if="showModelSelector" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="bg-white w-[600px] max-h-[80vh] rounded-lg shadow-xl overflow-hidden">
      <!-- Header -->
      <div class="p-6 border-b border-gray-200">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">
            {{ selectedProvider ? selectedProvider.name : '' }} - 可用模型
          </h3>
          <button 
            @click="showModelSelector = false"
            class="text-gray-400 hover:text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="p-6 overflow-y-auto max-h-[50vh]">
        <!-- Error Message -->
        <div v-if="fetchError" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p class="text-sm text-red-600">{{ fetchError }}</p>
        </div>

        <!-- Search Box - Always show when there are models or search term -->
        <div v-if="availableRemoteModels.length > 0 || searchTerm" class="mb-4">
          <div class="relative">
            <input 
              v-model="searchTerm" 
              placeholder="搜索模型（ID 或 名称）" 
              class="w-full px-3 py-2 pl-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ink text-sm"
            />
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 absolute left-3 top-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <!-- Search result count -->
          <div v-if="searchTerm" class="mt-2 text-xs text-gray-500">
            找到 {{ filteredRemoteModels.length }} 个匹配的模型
          </div>
        </div>

        <!-- Model List -->
        <div v-if="filteredRemoteModels.length > 0" class="space-y-2">
          <div
            v-for="model in filteredRemoteModels"
            :key="model.id"
            class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div class="flex-1">
              <div class="font-medium text-gray-900">{{ model.name }}</div>
              <div class="text-sm text-gray-500">{{ model.id }}</div>
              <div v-if="model.contextLength" class="text-xs text-gray-400">
                {{ (model.contextLength / 1000).toFixed(0) }}K context
              </div>
            </div>
            <button
              @click="addRemoteModel(model)"
              :disabled="isModelAdded(model.id)"
              class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {{ isModelAdded(model.id) ? '已添加' : '添加' }}
            </button>
          </div>
        </div>

        <!-- Empty States -->
        <div v-else-if="!fetchError" class="text-center py-8">
          <!-- No search results -->
          <div v-if="searchTerm">
            <div class="text-gray-400 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p class="text-gray-500 mb-2">未找到匹配 "{{ searchTerm }}" 的模型</p>
            <button 
              @click="searchTerm = ''"
              class="text-sm text-blue-600 hover:text-blue-700"
            >
              清除搜索
            </button>
          </div>
          <!-- No models at all -->
          <div v-else>
            <div class="text-gray-400 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <p class="text-gray-500">未找到可用模型</p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="p-6 border-t border-gray-200 bg-gray-50">
        <div class="flex justify-between">
          <button
            @click="syncModels"
            :disabled="isFetchingModels"
            class="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
          >
            {{ isFetchingModels ? '同步中...' : '一键同步所有模型' }}
          </button>
          <button
            @click="showModelSelector = false"
            class="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </div>
  </teleport>

</template>

<style scoped>
/* Custom range slider thumb */
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
}

input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: none;
}
</style>
