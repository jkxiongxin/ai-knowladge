import { defineStore } from 'pinia'
import { ref, onMounted, onUnmounted } from 'vue'

export interface Shortcut {
  id: string
  keys: string[] // e.g., ['Ctrl', 'Z'] or ['Meta', 'Z']
  description: string
  action: () => void
  context?: 'global' | 'chat' | 'canvas'
}

export const useShortcutsStore = defineStore('shortcuts', () => {
  const shortcuts = ref<Shortcut[]>([])
  const isEnabled = ref(true)

  function normalizeKey(key: string): string {
    const keyMap: Record<string, string> = {
      'control': 'ctrl',
      'command': 'meta',
      'cmd': 'meta',
      'option': 'alt',
      'escape': 'esc'
    }
    return keyMap[key.toLowerCase()] || key.toLowerCase()
  }

  function getModifiers(e: KeyboardEvent): string[] {
    const mods: string[] = []
    if (e.ctrlKey) mods.push('ctrl')
    if (e.metaKey) mods.push('meta')
    if (e.altKey) mods.push('alt')
    if (e.shiftKey) mods.push('shift')
    return mods
  }

  function matchesShortcut(e: KeyboardEvent, shortcut: Shortcut): boolean {
    const pressedMods = getModifiers(e)
    const pressedKey = normalizeKey(e.key)
    
    const shortcutKeys = shortcut.keys.map(normalizeKey)
    const shortcutMods = shortcutKeys.filter(k => ['ctrl', 'meta', 'alt', 'shift'].includes(k))
    const shortcutMainKeys = shortcutKeys.filter(k => !['ctrl', 'meta', 'alt', 'shift'].includes(k))
    
    // Check modifiers match
    if (shortcutMods.length !== pressedMods.length) return false
    for (const mod of shortcutMods) {
      if (!pressedMods.includes(mod)) return false
    }
    
    // Check main key matches
    return shortcutMainKeys.includes(pressedKey)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isEnabled.value) return
    
    // Don't trigger shortcuts when typing in inputs
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Only allow specific shortcuts like Escape
      if (e.key !== 'Escape') return
    }
    
    for (const shortcut of shortcuts.value) {
      if (matchesShortcut(e, shortcut)) {
        e.preventDefault()
        e.stopPropagation()
        shortcut.action()
        return
      }
    }
  }

  function registerShortcut(shortcut: Shortcut) {
    // Remove existing shortcut with same ID
    shortcuts.value = shortcuts.value.filter(s => s.id !== shortcut.id)
    shortcuts.value.push(shortcut)
  }

  function unregisterShortcut(id: string) {
    shortcuts.value = shortcuts.value.filter(s => s.id !== id)
  }

  function registerShortcuts(newShortcuts: Shortcut[]) {
    for (const shortcut of newShortcuts) {
      registerShortcut(shortcut)
    }
  }

  function enable() {
    isEnabled.value = true
  }

  function disable() {
    isEnabled.value = false
  }

  // Format shortcut for display
  function formatShortcut(keys: string[]): string {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    
    return keys.map(key => {
      const k = normalizeKey(key)
      if (k === 'meta') return isMac ? '⌘' : 'Win'
      if (k === 'ctrl') return isMac ? '⌃' : 'Ctrl'
      if (k === 'alt') return isMac ? '⌥' : 'Alt'
      if (k === 'shift') return '⇧'
      if (k === 'esc') return 'Esc'
      if (k === 'enter') return '↵'
      if (k === 'backspace') return '⌫'
      if (k === 'delete') return 'Del'
      if (k === 'arrowup') return '↑'
      if (k === 'arrowdown') return '↓'
      if (k === 'arrowleft') return '←'
      if (k === 'arrowright') return '→'
      return key.toUpperCase()
    }).join(isMac ? '' : '+')
  }

  function init() {
    window.addEventListener('keydown', handleKeyDown)
  }

  function destroy() {
    window.removeEventListener('keydown', handleKeyDown)
  }

  return {
    shortcuts,
    isEnabled,
    registerShortcut,
    unregisterShortcut,
    registerShortcuts,
    enable,
    disable,
    formatShortcut,
    init,
    destroy
  }
})
