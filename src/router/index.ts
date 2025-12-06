import { createRouter, createWebHashHistory } from 'vue-router'
import WorkspaceListView from '@/views/WorkspaceListView.vue'
import CanvasView from '@/views/CanvasView.vue'
import SettingsView from '@/views/SettingsView.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: WorkspaceListView
  },
  {
    path: '/workspace/:workspaceId',
    name: 'canvas',
    component: CanvasView,
    props: true
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
