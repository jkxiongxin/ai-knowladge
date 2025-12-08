import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { electronApi } from '@/api'
import { 
  type ProviderType,
  type BuiltInProviderType,
  type ProviderConfig, 
  type ActiveModel,
  type ModelConfig,
  PROVIDER_DEFINITIONS 
} from '@/types/models'

export const useModelStore = defineStore('models', () => {
  // Provider configurations (keyed by provider id, supports both built-in and custom)
  const providers = ref<Record<ProviderType, ProviderConfig>>({} as Record<ProviderType, ProviderConfig>)
  
  // Currently active model for chat
  const activeModel = ref<ActiveModel>({
    provider: 'ollama',
    modelId: 'llama3'
  })
  
  const isLoading = ref(false)

  // Initialize providers with defaults
  function initProviders() {
    const defaultProviders: Record<ProviderType, ProviderConfig> = {} as Record<ProviderType, ProviderConfig>
    
    // Initialize built-in providers
    for (const [key, def] of Object.entries(PROVIDER_DEFINITIONS)) {
      defaultProviders[key as ProviderType] = {
        // Use provider metadata (name/baseUrl/etc) but do not pre-populate models — user should add or sync explicitly
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        baseUrl: def.baseUrl,
        models: [],
        temperature: def.temperature,
        maxTokens: def.maxTokens,
        topP: def.topP,
        apiKey: '',
        enabled: key === 'ollama', // Ollama still enabled by default for dev convenience
        providerType: 'builtin'
      }
    }
    
    providers.value = defaultProviders
  }

  // Get all enabled providers
  const enabledProviders = computed(() => {
    return Object.values(providers.value).filter(p => p.enabled)
  })

  // Get all available models from enabled providers
  const availableModels = computed(() => {
    const models: (ModelConfig & { providerName: string })[] = []
    for (const provider of enabledProviders.value) {
      for (const model of provider.models) {
        models.push({
          ...model,
          providerName: provider.name
        })
      }
    }
    return models
  })

  // Get current active model details
  const currentModel = computed(() => {
    const provider = providers.value[activeModel.value.provider]
    if (!provider) return null
    const model = provider.models.find(m => m.id === activeModel.value.modelId)
    return model ? { ...model, provider } : null
  })

  // Load settings from storage
  async function loadSettings() {
    isLoading.value = true
    try {
      const saved = await electronApi.getSettings()
      
      // Initialize with defaults first
      initProviders()
      
      // Load saved provider configs (including persisted model lists, if any)
      if (saved.providers) {
        try {
          const savedProviders = JSON.parse(saved.providers)
          for (const [key, config] of Object.entries(savedProviders)) {
            const parsed = config as Partial<ProviderConfig>
            
            // If it's a built-in provider, merge with defaults
            if (providers.value[key as ProviderType]) {
              providers.value[key as ProviderType] = {
                ...providers.value[key as ProviderType],
                apiKey: parsed.apiKey ?? providers.value[key as ProviderType].apiKey,
                baseUrl: parsed.baseUrl ?? providers.value[key as ProviderType].baseUrl,
                enabled: parsed.enabled ?? providers.value[key as ProviderType].enabled,
                temperature: parsed.temperature ?? providers.value[key as ProviderType].temperature,
                maxTokens: parsed.maxTokens ?? providers.value[key as ProviderType].maxTokens,
                topP: parsed.topP ?? providers.value[key as ProviderType].topP,
                // If stored, restore the models array (backwards compatible)
                models: parsed.models ?? providers.value[key as ProviderType].models
              }
            } else {
              // It's a custom provider, restore it completely
              if (parsed.providerType === 'custom') {
                providers.value[key] = {
                  id: key,
                  name: parsed.name || '自定义',
                  description: parsed.description || 'OpenAI 兼容 API',
                  icon: parsed.icon || '🔧',
                  baseUrl: parsed.baseUrl || '',
                  apiKey: parsed.apiKey || '',
                  enabled: parsed.enabled ?? false,
                  models: parsed.models || [],
                  temperature: parsed.temperature ?? 0.7,
                  maxTokens: parsed.maxTokens ?? 4096,
                  topP: parsed.topP ?? 0.9,
                  providerType: 'custom'
                }
              }
            }
          }
        } catch (e) {
          console.error('Failed to parse saved providers:', e)
        }
      }
      
      // Load active model
      if (saved.activeModel) {
        try {
          activeModel.value = JSON.parse(saved.activeModel)
        } catch (e) {
          console.error('Failed to parse active model:', e)
        }
      }
    } catch (error) {
      console.error('Failed to load model settings:', error)
      initProviders()
    } finally {
      isLoading.value = false
    }
  }

  // Save all settings
  async function saveSettings() {
    try {
      // Save providers (include models so user-added/synced models persist)
      const providersToSave: Record<string, Partial<ProviderConfig>> = {}
      for (const [key, config] of Object.entries(providers.value)) {
        providersToSave[key] = {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          enabled: config.enabled,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          topP: config.topP,
          // Persist models so they survive restarts (keeps custom added models and latest sync snapshot)
          models: config.models || [],
          // For custom providers, also save name, description, icon, providerType
          ...(config.providerType === 'custom' && {
            name: config.name,
            description: config.description,
            icon: config.icon,
            providerType: config.providerType
          })
        }
      }
      await electronApi.saveSetting('providers', JSON.stringify(providersToSave))
      await electronApi.saveSetting('activeModel', JSON.stringify(activeModel.value))
    } catch (error) {
      console.error('Failed to save model settings:', error)
    }
  }

  // Update a specific provider
  function updateProvider(providerId: ProviderType, updates: Partial<ProviderConfig>) {
    if (providers.value[providerId]) {
      providers.value[providerId] = {
        ...providers.value[providerId],
        ...updates
      }
      saveSettings()
    }
  }

  // Set active model
  function setActiveModel(provider: ProviderType, modelId: string) {
    activeModel.value = { provider, modelId }
    saveSettings()
  }

  // Add custom model to a provider
  function addCustomModel(providerId: ProviderType, model: ModelConfig) {
    if (providers.value[providerId]) {
      providers.value[providerId].models.push(model)
      saveSettings()
    }
  }

  // Remove custom model
  function removeCustomModel(providerId: ProviderType, modelId: string) {
    if (providers.value[providerId]) {
      providers.value[providerId].models = providers.value[providerId].models.filter(
        m => m.id !== modelId
      )
      saveSettings()
    }
  }

  // Fetch available models from different providers
  async function fetchModelsFromProvider(providerId: ProviderType, config?: any) {
    try {
      let models: any[] = []
      
      // Check if this is a custom provider
      const provider = providers.value[providerId]
      const isCustomProvider = provider?.providerType === 'custom'
      
      if (isCustomProvider) {
        // Custom provider: treat as OpenAI-compatible endpoint
        const customModels = await electronApi.getOpenAIModels(config?.apiKey, config?.baseUrl)
        models = customModels.map((model: any) => ({
          id: model.id,
          name: model.id.replace(/-/g, ' ').replace(/_/g, ' ').split(' ').map((word: string) => 
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' '),
          provider: providerId,
          contextLength: getModelContextLength(model.id)
        }))
        return models
      }
      
      // Handle built-in providers
      switch (providerId) {
        case 'ollama':
          const ollamaModels = await electronApi.getOllamaModels(config?.baseUrl)
          models = ollamaModels.map((model: any) => ({
            id: model.name,
            name: model.name.replace(/:/g, ' ').replace(/_/g, ' ').split(' ').map((word: string) => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' '),
            provider: 'ollama' as ProviderType,
            contextLength: 32768
          }))
          break
          
        case 'openai':
          const openaiModels = await electronApi.getOpenAIModels(config?.apiKey, config?.baseUrl)
          models = openaiModels.map((model: any) => ({
            id: model.id,
            name: model.id.replace(/-/g, ' ').replace(/_/g, ' ').split(' ').map((word: string) => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' '),
            provider: 'openai' as ProviderType,
            contextLength: getModelContextLength(model.id)
          }))
          break
          
        case 'deepseek':
          const deepseekModels = await electronApi.getDeepSeekModels(config?.apiKey)
          models = deepseekModels.map((model: any) => ({
            id: model.id,
            name: model.id.replace(/-/g, ' ').replace(/_/g, ' ').split(' ').map((word: string) => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' '),
            provider: 'deepseek' as ProviderType,
            contextLength: getModelContextLength(model.id)
          }))
          break
          
        case 'anthropic':
          const anthropicModels = await electronApi.getAnthropicModels(config?.apiKey)
          models = anthropicModels.map((model: any) => ({
            id: model.id,
            name: model.id.replace(/-/g, ' ').replace(/_/g, ' ').split(' ').map((word: string) => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' '),
            provider: 'anthropic' as ProviderType,
            contextLength: getModelContextLength(model.id)
          }))
          break
          
        case 'cerebras':
          const cerebrasModels = await electronApi.getCerebrasModels(config?.apiKey)
          models = cerebrasModels.map((model: any) => ({
            id: model.id,
            name: model.id.replace(/-/g, ' ').replace(/_/g, ' ').split(' ').map((word: string) => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' '),
            provider: 'cerebras' as ProviderType,
            contextLength: getModelContextLength(model.id)
          }))
          break
          
        case 'dashscope':
          const dashscopeModels = await electronApi.getDashScopeModels(config?.apiKey)
          models = dashscopeModels.map((model: any) => ({
            id: model.id,
            name: model.id.replace(/-/g, ' ').replace(/_/g, ' ').split(' ').map((word: string) => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' '),
            provider: 'dashscope' as ProviderType,
            contextLength: getModelContextLength(model.id)
          }))
          break
          
        default:
          throw new Error(`Unsupported provider: ${providerId}`)
      }
      
      return models
    } catch (error) {
      console.error(`Failed to fetch ${providerId} models:`, error)
      throw error
    }
  }

  // Get context length for known models
  function getModelContextLength(modelId: string): number {
    const contextLengths: Record<string, number> = {
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'gpt-4-turbo': 128000,
      'gpt-3.5-turbo': 16385,
      'deepseek-chat': 64000,
      'deepseek-reasoner': 64000,
      'claude-3-5-sonnet-20241022': 200000,
      'claude-3-5-haiku-20241022': 200000,
      'claude-3-opus-20240229': 200000,
      'qwen-turbo': 8000,
      'qwen-plus': 32000,
      'qwen-max': 32000,
      'qwen-long': 1000000
    }
    
    return contextLengths[modelId] || 4096 // Default fallback
  }

  // Sync models with remote provider
  async function syncProviderModels(providerId: ProviderType) {
    try {
      const provider = providers.value[providerId]
      if (!provider) {
        throw new Error(`Provider ${providerId} not found`)
      }
      
      // Prepare config based on provider type
      const config: any = {
        baseUrl: provider.baseUrl
      }
      
      if (providerId !== 'ollama') {
        config.apiKey = provider.apiKey
      }
      
      const remoteModels = await fetchModelsFromProvider(providerId, config)
      
      // Get current model IDs
      const currentModelIds = new Set(provider.models.map(m => m.id))
      
      // Add new models
      for (const model of remoteModels) {
        if (!currentModelIds.has(model.id)) {
          addCustomModel(providerId, model)
        }
      }
      
      // Remove models that no longer exist remotely (keep custom added models)
      const remoteModelIds = new Set(remoteModels.map(m => m.id))
      providers.value[providerId].models = provider.models.filter(
        m => remoteModelIds.has(m.id) || m.id.startsWith('custom:')
      )
      
      saveSettings()
      return remoteModels
    } catch (error) {
      console.error(`Failed to sync ${providerId} models:`, error)
      throw error
    }
  }

  // Add a new custom provider
  function addCustomProvider(name: string, baseUrl: string, apiKey: string = '') {
    // Generate a unique ID
    let customId = 1
    while (providers.value[`custom-${customId}`]) {
      customId++
    }
    
    const newProviderId = `custom-${customId}`
    
    providers.value[newProviderId] = {
      id: newProviderId,
      name: name || '自定义提供商',
      description: 'OpenAI 兼容 API',
      icon: '🔧',
      baseUrl: baseUrl,
      apiKey: apiKey,
      enabled: true,
      models: [],
      temperature: 0.7,
      maxTokens: 4096,
      topP: 0.9,
      providerType: 'custom'
    }
    
    saveSettings()
    return newProviderId
  }

  // Delete a custom provider
  function deleteCustomProvider(providerId: ProviderType) {
    const provider = providers.value[providerId]
    if (provider && provider.providerType === 'custom') {
      delete providers.value[providerId]
      
      // If the active model was from this provider, reset to default
      if (activeModel.value.provider === providerId) {
        activeModel.value = {
          provider: 'ollama',
          modelId: 'llama3'
        }
      }
      
      saveSettings()
    }
  }

  return {
    providers,
    activeModel,
    isLoading,
    enabledProviders,
    availableModels,
    currentModel,
    initProviders,
    loadSettings,
    saveSettings,
    updateProvider,
    setActiveModel,
    addCustomModel,
    removeCustomModel,
    fetchModelsFromProvider,
    syncProviderModels,
    addCustomProvider,
    deleteCustomProvider
  }
})
