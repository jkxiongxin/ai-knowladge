import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { electronApi, type Workspace, type GeneratedTreeNode } from '@/api'

export const useWorkspaceStore = defineStore('workspace', () => {
  // State
  const workspaces = ref<Workspace[]>([])
  const currentWorkspaceId = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const currentWorkspace = computed(() => {
    if (!currentWorkspaceId.value) return null
    return workspaces.value.find(w => w.id === currentWorkspaceId.value) || null
  })

  const sortedWorkspaces = computed(() => {
    return [...workspaces.value].sort((a, b) => b.updated_at - a.updated_at)
  })

  // Actions
  async function loadWorkspaces() {
    isLoading.value = true
    error.value = null
    try {
      workspaces.value = await electronApi.getWorkspaces()
    } catch (err: any) {
      console.error('Failed to load workspaces:', err)
      error.value = err.message || '加载知识库失败'
    } finally {
      isLoading.value = false
    }
  }

  async function createWorkspace(name: string, description?: string) {
    isLoading.value = true
    error.value = null
    try {
      const newWorkspace = await electronApi.createWorkspace({ name, description })
      workspaces.value.push(newWorkspace)
      return newWorkspace
    } catch (err: any) {
      console.error('Failed to create workspace:', err)
      error.value = err.message || '创建知识库失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function generateWorkspaceTree(description: string, provider?: string, modelId?: string) {
    isLoading.value = true
    error.value = null
    try {
      const result = await electronApi.generateWorkspaceTree(description, provider, modelId)
      return result.tree
    } catch (err: any) {
      console.error('Failed to generate workspace tree:', err)
      error.value = err.message || '生成知识树失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function createWorkspaceWithTree(name: string, description: string | undefined, tree: GeneratedTreeNode[]) {
    isLoading.value = true
    error.value = null
    try {
      const result = await electronApi.createWorkspaceWithTree({ name, description, tree })
      workspaces.value.push(result.workspace)
      return result.workspace
    } catch (err: any) {
      console.error('Failed to create workspace with tree:', err)
      error.value = err.message || '创建知识库失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function updateWorkspace(id: string, data: { name?: string, description?: string }) {
    error.value = null
    try {
      await electronApi.updateWorkspace(id, data)
      // Update local state
      const index = workspaces.value.findIndex(w => w.id === id)
      if (index !== -1) {
        workspaces.value[index] = {
          ...workspaces.value[index],
          ...data,
          updated_at: Math.floor(Date.now() / 1000)
        }
      }
    } catch (err: any) {
      console.error('Failed to update workspace:', err)
      error.value = err.message || '更新知识库失败'
      throw err
    }
  }

  async function deleteWorkspace(id: string) {
    error.value = null
    try {
      await electronApi.deleteWorkspace(id)
      workspaces.value = workspaces.value.filter(w => w.id !== id)
      // If current workspace is deleted, clear it
      if (currentWorkspaceId.value === id) {
        currentWorkspaceId.value = null
      }
    } catch (err: any) {
      console.error('Failed to delete workspace:', err)
      error.value = err.message || '删除知识库失败'
      throw err
    }
  }

  async function exportWorkspaceToFile(id: string) {
    try {
      return await electronApi.exportWorkspace(id)
    } catch (err: any) {
      console.error('Failed to export workspace:', err)
      throw err
    }
  }

  async function importWorkspaceFromFile(opts?: { filePath?: string, keepIds?: boolean, overwrite?: boolean }) {
    try {
      const result = await electronApi.importWorkspace(opts)
      // Refresh list after successful import
      if (result?.success) await loadWorkspaces()
      return result
    } catch (err: any) {
      console.error('Failed to import workspace:', err)
      throw err
    }
  }

  function selectWorkspace(id: string) {
    currentWorkspaceId.value = id
  }

  function clearSelection() {
    currentWorkspaceId.value = null
  }

  return {
    // State
    workspaces,
    currentWorkspaceId,
    isLoading,
    error,
    // Computed
    currentWorkspace,
    sortedWorkspaces,
    // Actions
    loadWorkspaces,
    createWorkspace,
    generateWorkspaceTree,
    createWorkspaceWithTree,
    updateWorkspace,
    deleteWorkspace,
    selectWorkspace,
    clearSelection
    , exportWorkspaceToFile, importWorkspaceFromFile
  }
})
