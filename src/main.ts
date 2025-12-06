import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import './style.css'
import App from './App.vue'

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)

// Global runtime error handlers so packaged apps don't show blank pages silently.
function showFatalErrorOverlay(title: string, details: string) {
	try {
		const existing = document.getElementById('fatal-error-overlay')
		if (existing) existing.remove()

		const overlay = document.createElement('div')
		overlay.id = 'fatal-error-overlay'
		overlay.style.position = 'fixed'
		overlay.style.left = '0'
		overlay.style.top = '0'
		overlay.style.right = '0'
		overlay.style.bottom = '0'
		overlay.style.background = 'linear-gradient(180deg, rgba(0,0,0,0.7), rgba(255,255,255,0.9))'
		overlay.style.zIndex = '99999'
		overlay.style.display = 'flex'
		overlay.style.alignItems = 'center'
		overlay.style.justifyContent = 'center'
		overlay.style.padding = '24px'
		overlay.style.boxSizing = 'border-box'

		const box = document.createElement('div')
		box.style.background = 'white'
		box.style.borderRadius = '8px'
		box.style.padding = '18px'
		box.style.maxWidth = '880px'
		box.style.width = '100%'
		box.style.boxShadow = '0 10px 40px rgba(0,0,0,0.3)'
		box.style.color = '#1f2937'
		box.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial'

		const h = document.createElement('h2')
		h.textContent = title
		h.style.margin = '0 0 8px 0'
		h.style.fontSize = '18px'
		h.style.fontWeight = '700'

		const p = document.createElement('pre')
		p.textContent = details
		p.style.whiteSpace = 'pre-wrap'
		p.style.maxHeight = '360px'
		p.style.overflow = 'auto'
		p.style.margin = '8px 0 12px 0'
		p.style.fontSize = '12px'
		p.style.background = '#f9fafb'
		p.style.padding = '8px'
		p.style.borderRadius = '6px'

		const actions = document.createElement('div')
		actions.style.display = 'flex'
		actions.style.gap = '8px'

		const devtoolsBtn = document.createElement('button')
		devtoolsBtn.textContent = '打开开发者工具 (DevTools)'
		devtoolsBtn.onclick = () => {
			try { ;(window as any).ipcRenderer?.send('open-devtools') } catch (e) { console.error(e) }
		}
		devtoolsBtn.style.padding = '8px 12px'
		devtoolsBtn.style.borderRadius = '6px'
		devtoolsBtn.style.border = '1px solid #e5e7eb'

		const copyBtn = document.createElement('button')
		copyBtn.textContent = '复制错误到剪贴板'
		copyBtn.onclick = () => {
			try { navigator.clipboard.writeText(details) } catch (e) { console.error(e) }
		}
		copyBtn.style.padding = '8px 12px'
		copyBtn.style.borderRadius = '6px'
		copyBtn.style.border = '1px solid #e5e7eb'

		const closeBtn = document.createElement('button')
		closeBtn.textContent = '关闭'
		closeBtn.onclick = () => overlay.remove()
		closeBtn.style.padding = '8px 12px'
		closeBtn.style.borderRadius = '6px'
		closeBtn.style.border = '1px solid #e5e7eb'

		actions.appendChild(devtoolsBtn)
		actions.appendChild(copyBtn)
		actions.appendChild(closeBtn)

		box.appendChild(h)
		box.appendChild(p)
		box.appendChild(actions)
		overlay.appendChild(box)
		document.body.appendChild(overlay)
	} catch (e) {
		// ignore overlay errors
		console.error('Failed to render fatal overlay', e)
	}
}

// Global catches
window.addEventListener('error', (ev) => {
	const msg = `${ev.message} — ${ev.filename}:${ev.lineno}:${ev.colno}\n${ev.error?.stack ?? ''}`
	showFatalErrorOverlay('应用加载失败 — 渲染进程崩溃', msg)
	try { ;(window as any).ipcRenderer?.send('renderer-error', { type: 'error', message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno, stack: ev.error?.stack }) } catch (e) {
		console.error('Failed to send renderer-error:', e)
	}
})

window.addEventListener('unhandledrejection', (evt) => {
	const reason = evt.reason instanceof Error ? `${evt.reason.message}\n${evt.reason.stack}` : String(evt.reason)
	showFatalErrorOverlay('未处理的 Promise 异常', reason)
	try { ;(window as any).ipcRenderer?.send('renderer-error', { type: 'unhandledrejection', reason }) } catch (e) { console.error('Failed to send renderer-error:', e) }
})

app.mount('#app')
