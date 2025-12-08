import { net } from 'electron'
import { getSetting } from './db'

// Simple LLM Interface
// In a real app, we might use 'openai' npm package, but 'net' is built-in Electron and works for simple REST calls.
// This avoids adding more dependencies for now.

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ProviderConfig {
  apiKey: string
  baseUrl: string
  temperature: number
  maxTokens: number
  topP: number
}

interface ActiveModel {
  provider: string
  modelId: string
}

function getProviderConfig(providerId: string): ProviderConfig | null {
  const providersJson = getSetting('providers')
  console.log('Raw providers JSON from DB:', providersJson)
  if (!providersJson) return null
  
  try {
    const providers = JSON.parse(providersJson)
    console.log('Parsed providers:', JSON.stringify(providers, null, 2))
    console.log(`Provider config for '${providerId}':`, providers[providerId])
    return providers[providerId] || null
  } catch (e) {
    console.error('Failed to parse providers JSON:', e)
    return null
  }
}

function getActiveModel(): ActiveModel {
  const activeModelJson = getSetting('activeModel')
  if (activeModelJson) {
    try {
      return JSON.parse(activeModelJson)
    } catch {
      // fall through to default
    }
  }
  return { provider: 'ollama', modelId: 'llama3' }
}

// Default base URLs for providers
const DEFAULT_BASE_URLS: Record<string, string> = {
  ollama: 'http://localhost:11434',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  dashscope: 'https://api-inference.modelscope.cn/v1',
  openrouter: 'https://openrouter.ai/api/v1',
}

export async function callLLM(
  messages: ChatMessage[],
  onProgress?: (chunk: string) => void,
  options?: { provider?: string, modelId?: string, providerConfig?: ProviderConfig }
): Promise<string> {
  // Load active model and provider config
  // Allow overrides (from UI) or fall back to saved active model
  const activeModel = options?.provider || options?.modelId ?
    { provider: options?.provider || getActiveModel().provider, modelId: options?.modelId || getActiveModel().modelId } :
    getActiveModel()

  const providerConfig = options?.providerConfig ?? getProviderConfig(activeModel.provider)

  const provider = activeModel.provider
  const model = activeModel.modelId
  const baseUrl = providerConfig?.baseUrl || DEFAULT_BASE_URLS[provider] || 'http://localhost:11434'
  const apiKey = providerConfig?.apiKey || ''
  const temperature = providerConfig?.temperature ?? 0.7
  const maxTokens = providerConfig?.maxTokens ?? 4096
  const topP = providerConfig?.topP ?? 0.9

  // Build API endpoint
  let apiEndpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  
  // Ollama uses /v1/chat/completions, most others use /chat/completions
  if (provider === 'ollama') {
    apiEndpoint = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`
  }

  console.log(`Calling LLM (${provider}/${model}) at ${apiEndpoint} with ${messages.length} messages...`)
  console.log(`Settings: temperature=${temperature}, maxTokens=${maxTokens}, topP=${topP}`)

  // Validate API key when provider requires it (local Ollama usually doesn't need a remote key)
  const providersRequiringKey = ['openai', 'deepseek', 'anthropic', 'cerebras', 'dashscope', 'openrouter']
  if (providersRequiringKey.includes(provider) && !apiKey) {
    throw new Error(`No API key configured for provider '${provider}'. Please configure an API key in Settings.`)
  }

  // Handle Anthropic separately (different API format)
  if (provider === 'anthropic') {
    return callAnthropicLLM(messages, model, apiKey, baseUrl, temperature, maxTokens, topP)
  }

  const MAX_RETRIES = 2
  const RETRY_DELAY_MS = 350

  function isConnectionRefusedErr(err: any) {
    if (!err) return false
    const msg = String(err.message || err)
    return msg.includes('ECONNREFUSED') || msg.includes('ERR_CONNECTION_REFUSED') || msg.includes('connect ECONNREFUSED')
  }

  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'POST',
      url: apiEndpoint,
    })

    request.setHeader('Content-Type', 'application/json')
    if (apiKey) request.setHeader('Authorization', `Bearer ${apiKey}`)

    // ModelScope (dashscope) accepts tokens via a dedicated header in some deployments.
    // Send both forms to maximize compatibility: Authorization + x-modelscope-token
    if (provider === 'dashscope' && apiKey) {
      request.setHeader('x-modelscope-token', apiKey)
    }

    const body = JSON.stringify({
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens,
      top_p: topP,
      stream: true
    })

    request.write(body)

    request.on('response', (response) => {
      // Check if the response is an SSE/text stream
      const contentType = response.headers['content-type'] || ''
      const isEventStream = typeof contentType === 'string' && contentType.includes('text/event-stream')

      if (isEventStream && onProgress) {
        // SSE-style streaming (OpenAI-like) -- parse data: ... events
        let buffer = ''
        let accumulated = ''

        response.on('data', (chunk) => {
          const s = chunk.toString()
          buffer += s

          // Process any complete event blocks separated by \n\n
          let idx
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const part = buffer.slice(0, idx).trim()
            buffer = buffer.slice(idx + 2)

            if (!part) continue
            // Expect lines starting with 'data:'
            const lines = part.split('\n')
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed.startsWith('data:')) continue
              const payload = trimmed.replace(/^data:\s*/, '')
              if (payload === '[DONE]') {
                // finished
                // nothing to do here — finalization handled on 'end'
                continue
              }

              try {
                const json = JSON.parse(payload)
                // OpenAI-like object: choices[0].delta.content
                const delta = json.choices?.[0]?.delta
                const content = delta?.content || json.choices?.[0]?.text || ''
                if (content) {
                  accumulated += content
                  // forward small chunk to the caller
                  onProgress(content)
                }
              } catch (e) {
                // fallback: send raw payload
                onProgress(payload)
              }
            }
          }
        })

        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`LLM stream ended with status ${response.statusCode}`))
            return
          }
          resolve(accumulated)
        })

        response.on('error', (err: any) => {
          reject(err)
        })

        return
      }

      // Non-streaming / JSON response -- but some providers send SSE-like text even
      // when Content-Type isn't set to text/event-stream. Detect SSE payloads and
      // parse them as a fallback so we don't try to JSON.parse raw "data: {...}" text.
      let data = ''
      
      response.on('data', (chunk) => {
        data += chunk.toString()
      })
      
      response.on('end', () => {
        if (response.statusCode !== 200) {
          console.error('LLM Error:', data)

          // Try to parse structured error info
          let details = data
          try {
            const json = JSON.parse(data)
            if (json.error || json.errors || json.message) {
              details = JSON.stringify(json.error || json.errors || json.message)
            }
          } catch (e) {
            // keep raw data
          }

          if (response.statusCode === 401) {
            reject(new Error(`Authentication failed for provider '${provider}': ${details}`))
            return
          }

          reject(new Error(`LLM API Error (${response.statusCode}): ${details}`))
          return
        }
        
        try {
          // If the body looks like SSE (starts with "data:" or contains blocks),
          // parse it into an accumulated text output instead of direct JSON.parse.
          const looksLikeSSE = data.trim().startsWith('data:') || data.includes('\n\ndata:') || data.includes('\ndata:')

          let content = ''

          if (looksLikeSSE) {
            // Parse SSE-style payloads (blocks separated by double newlines)
            const blocks = data.split(/\n\n+/)
            for (const block of blocks) {
              const lines = block.split(/\n+/)
              for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed) continue
                if (!trimmed.startsWith('data:')) continue
                const payload = trimmed.replace(/^data:\s*/, '')
                if (payload === '[DONE]') continue
                try {
                  const json = JSON.parse(payload)
                  const delta = json.choices?.[0]?.delta
                  const piece = delta?.content || json.choices?.[0]?.text || ''
                  if (piece) content += piece
                } catch (e) {
                  // not JSON — append raw payload
                  content += payload
                }
              }
            }
          } else {
            const json = JSON.parse(data)
            content = json.choices?.[0]?.message?.content || json.choices?.[0]?.text || ''
          }
          // If an onProgress callback exists but no event-stream available, we can optionally flush the final content in chunks
          if (onProgress && content) {
            // Very small chunk size to give a streaming feel while still waiting for full response
            const CHUNK = 120
            for (let i = 0; i < content.length; i += CHUNK) {
              const c = content.slice(i, i + CHUNK)
              onProgress(c)
            }
          }

          // If an onProgress callback exists, send the final content in chunks
          if (onProgress && content) {
            const CHUNK = 120
            for (let i = 0; i < content.length; i += CHUNK) {
              const c = content.slice(i, i + CHUNK)
              onProgress(c)
            }
          }

          resolve(content)
        } catch (e) {
          reject(e)
        }
      })
    })

    request.on('error', (error) => {
      // Provide actionable error messages for common network failures
            if (isConnectionRefusedErr(error)) {
        const hint = `Cannot connect to LLM provider '${provider}' at ${baseUrl}. Is the service running or the base URL/API key configured correctly? (Original: ${error.message})`
        // If this is recoverable we can attempt a few retries
        let attempts = 0
        ;(function tryRetry() {
          if (attempts >= MAX_RETRIES) {
            reject(new Error(hint))
            return
          }
          attempts++
          setTimeout(() => {
            const retryReq = net.request({ method: 'POST', url: apiEndpoint })
            retryReq.setHeader('Content-Type', 'application/json')
            if (apiKey) retryReq.setHeader('Authorization', `Bearer ${apiKey}`)
            retryReq.write(body)
            retryReq.on('response', (resp) => {
              // We'll let normal processing continue by reusing the same 'response' handlers — here simply resolve by reading all.
              let data = ''
              resp.on('data', (chunk) => { data += chunk.toString() })
              resp.on('end', () => {
                if (resp.statusCode === 200) {
                  resolve(data)
                } else {
                  tryRetry()
                }
              })
            })
            retryReq.on('error', (err) => {
              if (isConnectionRefusedErr(err)) tryRetry()
              else reject(err)
            })
            retryReq.end()
          }, RETRY_DELAY_MS)
        })()
        return
      }

      // For other errors, propagate
      reject(error)
    })

    request.end()
  })
}

// Anthropic has a different API format
async function callAnthropicLLM(
  messages: ChatMessage[], 
  model: string, 
  apiKey: string,
  baseUrl: string,
  temperature: number,
  maxTokens: number,
  topP: number
): Promise<string> {
  const apiEndpoint = `${baseUrl.replace(/\/$/, '')}/messages`
  
  // Convert messages format for Anthropic
  // Anthropic uses a different structure: system is separate, messages array only has user/assistant
  const systemMessage = messages.find(m => m.role === 'system')?.content || ''
  const anthropicMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role,
      content: m.content
    }))

  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'POST',
      url: apiEndpoint,
    })

    request.setHeader('Content-Type', 'application/json')
    request.setHeader('x-api-key', apiKey)
    request.setHeader('anthropic-version', '2023-06-01')

    const body = JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      temperature: temperature,
      top_p: topP,
      system: systemMessage,
      messages: anthropicMessages
    })

    request.write(body)

    request.on('response', (response) => {
      let data = ''
      
      response.on('data', (chunk) => {
        data += chunk.toString()
      })
      
      response.on('end', () => {
        if (response.statusCode !== 200) {
          console.error('Anthropic Error:', data)
          reject(new Error(`Anthropic API Error (${response.statusCode}): ${data}`))
          return
        }
        
        try {
          const json = JSON.parse(data)
          const content = json.content?.[0]?.text || ''
          resolve(content)
        } catch (e) {
          reject(e)
        }
      })
    })

    request.on('error', (error) => {
      reject(error)
    })

    request.end()
  })
}

export async function generateSummary(history: ChatMessage[]): Promise<string> {
  // We only need the last few messages to update the summary, or the whole history?
  // Ideally, we ask the AI to "Update the summary based on new information".
  // For simplicity, we send the whole history and ask for a concise summary.
  
  const summaryPrompt = `
    Analyze the following conversation and provide a concise summary (max 3 sentences) of the key concepts, decisions, or facts established. 
    This summary will be used as context for future conversations.
    不要解释，不要描述。
    返回格式使用txt文本，不要使用任何Markdown代码块或其他格式。
    Focus on the "Knowledge" generated in this node.
  `
  
  const messages: ChatMessage[] = [
    { role: 'system', content: summaryPrompt },
    ...history.slice(-10) // Limit to last 10 messages to save tokens
  ]
  
  const raw = await callLLM(messages)

  // Remove any <think>...</think> blocks (and variants) from the model output.
  // Some models include internal deliberation tags like <think>...<\/think> — we want
  // the visible summary to exclude those sections.
  // Use a forgiving regex that strips any opening <think...> to matching </think>.
  try {
    const cleaned = raw.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
      .replace(/\s+/g, ' ') // squash excessive whitespace
      .trim()

    return cleaned
  } catch (e) {
    // Fallback: if something goes wrong with the regex, return raw summary
    return raw
  }
}

/**
 * Generates a tree structure for a new workspace based on user description.
 * Returns an array of cards with parent-child relationships.
 */
export interface GeneratedTreeNode {
  title: string
  summary: string
  children?: GeneratedTreeNode[]
}

/**
 * Generates child nodes (sub-cards) for an existing card based on its summary.
 * Returns an array of child cards with title and summary.
 */
export interface GeneratedChildNode {
  title: string
  summary: string
}

export async function generateChildNodes(parentTitle: string, parentSummary: string, options?: { provider?: string, modelId?: string }): Promise<GeneratedChildNode[]> {
  const systemPrompt = `You are a knowledge architect. Based on the parent card's title and summary, generate 2-5 child nodes that break down the topic into subtopics or related concepts.

Each child node should:
- Have a clear, concise title (3-8 words)
- Have a brief summary (1-2 sentences) describing what this subtopic covers
- Be logically related to the parent topic
- Together, the children should provide a comprehensive breakdown of the parent topic

Output a JSON array of child nodes. Each node has:
- "title": string (short, descriptive title)
- "summary": string (1-2 sentence description)

IMPORTANT: Output ONLY valid JSON, no markdown code blocks, no explanations. Just the raw JSON array.`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Parent card title: ${parentTitle}\n\nParent card summary: ${parentSummary || '(empty summary)'}\n\nGenerate child nodes for this topic.` }
  ]

  // Preflight: check provider availability
  const activeModel = options?.provider || options?.modelId ? { provider: options?.provider || getActiveModel().provider, modelId: options?.modelId || getActiveModel().modelId } : getActiveModel()
  const providerConfig = getProviderConfig(activeModel.provider)
  const provider = activeModel.provider
  const baseUrl = providerConfig?.baseUrl || DEFAULT_BASE_URLS[provider] || 'http://localhost:11434'

  // Simple availability probe
  try {
    await new Promise<void>((resolve, reject) => {
      const url = baseUrl.replace(/\/$/, '')
      const probeUrl = provider === 'ollama' ? `${url}/v1` : url
      const req = net.request({ method: 'GET', url: probeUrl })
      req.on('response', (resp) => {
        resp.on('data', () => {})
        resp.on('end', () => resolve())
      })
      req.on('error', (err) => reject(err))
      req.end()
    })
  } catch (err: any) {
    console.error('Provider availability check failed for', provider, baseUrl, err)
    throw new Error(`无法连接到 LLM 提供商 '${provider}' (${baseUrl}): ${err.message || err}. 请检查提供商地址或在设置中选择其他模型。`)
  }

  const raw = await callLLM(messages, undefined, options)

  // Clean and parse response
  try {
    let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    cleaned = cleaned.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '').trim()
    
    const startIdx = cleaned.indexOf('[')
    const endIdx = cleaned.lastIndexOf(']')
    if (startIdx !== -1 && endIdx !== -1) {
      cleaned = cleaned.slice(startIdx, endIdx + 1)
    }
    
    const children = JSON.parse(cleaned)
    return children as GeneratedChildNode[]
  } catch (e) {
    console.error('Failed to parse child nodes response:', e, raw)
    throw new Error('AI返回的格式无法解析，请重试')
  }
}

export async function generateWorkspaceTree(description: string, options?: { provider?: string, modelId?: string }): Promise<GeneratedTreeNode[]> {
  const systemPrompt = `You are a knowledge architect. Based on the user's description of a topic or project, generate a hierarchical tree structure of knowledge cards. Each card should have a title and a brief summary.

Output a JSON array of nodes. Each node has:
- "title": string (short, descriptive title)
- "summary": string (1-2 sentence description of what this node covers)
- "children": optional array of child nodes (same structure)

Generate 3-7 top-level nodes, each with 0-3 children as appropriate. Keep it balanced and useful.

IMPORTANT: Output ONLY valid JSON, no markdown code blocks, no explanations. Just the raw JSON array.`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Create a knowledge tree structure for: ${description}` }
  ]

  // Preflight: check provider availability quickly to return a friendly message
  const activeModel = options?.provider || options?.modelId ? { provider: options?.provider || getActiveModel().provider, modelId: options?.modelId || getActiveModel().modelId } : getActiveModel()
  const providerConfig = getProviderConfig(activeModel.provider)
  const provider = activeModel.provider
  const baseUrl = providerConfig?.baseUrl || DEFAULT_BASE_URLS[provider] || 'http://localhost:11434'

  // Simple availability probe
  try {
    await new Promise<void>((resolve, reject) => {
      const url = baseUrl.replace(/\/$/, '')
      const probeUrl = provider === 'ollama' ? `${url}/v1` : url
      const req = net.request({ method: 'GET', url: probeUrl })
      req.on('response', (resp) => {
        // Treat any reachable response as success — we only need a connection
        resp.on('data', () => {})
        resp.on('end', () => resolve())
      })
      req.on('error', (err) => reject(err))
      req.end()
    })
  } catch (err: any) {
    console.error('Provider availability check failed for', provider, baseUrl, err)
    throw new Error(`无法连接到 LLM 提供商 '${provider}' (${baseUrl}): ${err.message || err}. 请检查提供商地址或在设置中选择其他模型。`)
  }

  const raw = await callLLM(messages, undefined, options)

  // Clean and parse response
  try {
    // Remove any markdown code blocks if present
    let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    // Remove think tags
    cleaned = cleaned.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '').trim()
    
    // Try to find JSON array in the response
    const startIdx = cleaned.indexOf('[')
    const endIdx = cleaned.lastIndexOf(']')
    if (startIdx !== -1 && endIdx !== -1) {
      cleaned = cleaned.slice(startIdx, endIdx + 1)
    }
    
    const tree = JSON.parse(cleaned)
    return tree as GeneratedTreeNode[]
  } catch (e) {
    console.error('Failed to parse tree generation response:', e, raw)
    throw new Error('AI返回的格式无法解析，请重试')
  }
}
