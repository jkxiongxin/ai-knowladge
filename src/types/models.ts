// Model Provider Types and Configurations

export type ProviderType = 'ollama' | 'openai' | 'deepseek' | 'anthropic' | 'cerebras' | 'dashscope' | 'openrouter' | 'custom'

export interface ModelConfig {
  id: string
  name: string
  provider: ProviderType
  contextLength?: number
  maxOutputTokens?: number
}

export interface ProviderConfig {
  id: ProviderType
  name: string
  description: string
  icon: string
  baseUrl: string
  apiKey: string
  enabled: boolean
  models: ModelConfig[]
  // Generation settings
  temperature: number
  maxTokens: number
  topP: number
}

// Built-in provider definitions
export const PROVIDER_DEFINITIONS: Record<ProviderType, Omit<ProviderConfig, 'apiKey' | 'enabled'>> = {
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    description: '本地运行的开源大模型',
    icon: '🦙',
    baseUrl: 'http://localhost:11434',
    models: [
      { id: 'llama3', name: 'Llama 3', provider: 'ollama', contextLength: 8192 },
      { id: 'llama3.1', name: 'Llama 3.1', provider: 'ollama', contextLength: 128000 },
      { id: 'qwen2.5', name: 'Qwen 2.5', provider: 'ollama', contextLength: 32768 },
      { id: 'deepseek-r1', name: 'DeepSeek R1', provider: 'ollama', contextLength: 64000 },
      { id: 'mistral', name: 'Mistral', provider: 'ollama', contextLength: 32768 },
      { id: 'gemma2', name: 'Gemma 2', provider: 'ollama', contextLength: 8192 },
    ],
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT 系列模型',
    icon: '🤖',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextLength: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextLength: 128000 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', contextLength: 128000 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', contextLength: 16385 },
    ],
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1.0
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'OpenRouter — 公共路由服务，代理多个模型提供商',
    icon: '🧭',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o (via OpenRouter)', provider: 'openrouter', contextLength: 128000 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (via OpenRouter)', provider: 'openrouter', contextLength: 16385 }
    ],
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1.0
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: '深度求索 - 国产高性能模型',
    icon: '🔮',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', contextLength: 64000 },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', provider: 'deepseek', contextLength: 64000 },
    ],
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 系列模型',
    icon: '🎭',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', contextLength: 200000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', contextLength: 200000 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', contextLength: 200000 },
    ],
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9
  },
  cerebras: {
    id: 'cerebras',
    name: 'Cerebras',
    description: '超快推理速度',
    icon: '⚡',
    baseUrl: 'https://api.cerebras.ai/v1',
    models: [
      { id: 'llama3.1-8b', name: 'Llama 3.1 8B', provider: 'cerebras', contextLength: 8192 },
      { id: 'llama3.1-70b', name: 'Llama 3.1 70B', provider: 'cerebras', contextLength: 8192 },
    ],
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9
  },
  dashscope: {
    id: 'dashscope',
    name: '魔搭 (DashScope)',
    description: '阿里云模型服务 — 使用 ModelScope token (在请求头 x-modelscope-token 中传递)',
    icon: '🎨',
    baseUrl: 'https://api-inference.modelscope.cn/v1',
    models: [
      { id: 'qwen-turbo', name: 'Qwen Turbo', provider: 'dashscope', contextLength: 8000 },
      { id: 'qwen-plus', name: 'Qwen Plus', provider: 'dashscope', contextLength: 32000 },
      { id: 'qwen-max', name: 'Qwen Max', provider: 'dashscope', contextLength: 32000 },
      { id: 'qwen-long', name: 'Qwen Long', provider: 'dashscope', contextLength: 1000000 },
    ],
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9
  },
  custom: {
    id: 'custom',
    name: '自定义',
    description: 'OpenAI 兼容 API',
    icon: '🔧',
    baseUrl: '',
    models: [],
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9
  }
}

// Active model selection
export interface ActiveModel {
  provider: ProviderType
  modelId: string
}
