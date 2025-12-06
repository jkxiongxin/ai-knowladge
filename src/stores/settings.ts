import { defineStore } from 'pinia'
import { ref } from 'vue'
import { electronApi } from '@/api'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Record<string, string>>({})
  const isLoading = ref(false)

  // Default values
  const defaults = {
    llmProvider: 'ollama',
    ollamaUrl: 'http://localhost:11434',
    openaiKey: '',
    anthropicKey: ''
  }

  async function loadSettings() {
    isLoading.value = true
    try {
      const loaded = await electronApi.getSettings()
      settings.value = { ...defaults, ...loaded }
    } catch (error) {
      console.error('Failed to load settings:', error)
      settings.value = { ...defaults }
    } finally {
      isLoading.value = false
    }
  }

  async function saveSetting(key: string, value: string) {
    try {
      await electronApi.saveSetting(key, value)
      settings.value[key] = value
    } catch (error) {
      console.error(`Failed to save setting ${key}:`, error)
    }
  }

  return {
    settings,
    isLoading,
    loadSettings,
    saveSetting
  }
})
