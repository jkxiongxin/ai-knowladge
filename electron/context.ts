import { getDB, getMessages, getSetting } from './db'

interface ContextNode {
  id: string
  title: string
  summary: string
  distance: number
}

/**
 * Retrieves the upstream context for a given card.
 * It traverses the connection graph backwards to find ancestors.
 * 
 * IMPORTANT: Each ancestor card is only included ONCE, even if reachable
 * through multiple paths. This prevents token waste from duplicate context.
 * 
 * @param cardId The current card ID
 * @param maxDepth Maximum depth to traverse (default 3 to prevent too much context)
 * @returns List of ancestor cards with their summaries (deduplicated)
 */
export function getUpstreamContext(cardId: string, maxDepth = 3): ContextNode[] {
  const db = getDB()!
  const visited = new Set<string>()
  const contextNodes: ContextNode[] = []
  
  // Queue for BFS: [currentCardId, depth]
  const queue: { id: string, depth: number }[] = []
  
  // Find immediate parents first
  const parents = db.prepare('SELECT source_card_id FROM connections WHERE target_card_id = ?').all(cardId) as { source_card_id: string }[]
  
  for (const p of parents) {
    // Only queue if not yet visited (handles diamond inheritance patterns)
    if (!visited.has(p.source_card_id)) {
      queue.push({ id: p.source_card_id, depth: 1 })
      visited.add(p.source_card_id) // Mark visited when queued to prevent re-queuing
    }
  }
  
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    
    // Note: visited check was done before queuing, so no need to check again
    
    // Get Card Details
    const card = db.prepare('SELECT id, title, summary FROM cards WHERE id = ?').get(id) as { id: string, title: string, summary: string }
    
    if (card) {
      // Prefer existing summary, fall back to assembling context from recent messages
      let nodeSummary = card.summary || ''

      if (!nodeSummary) {
        // Try to gather recent messages as context (last few messages)
        try {
          // Determine per-card context mode (summary | all_messages | selected)
          // Default to using recent messages when no summary exists
          const modeKey = `cardContextMode:${card.id}`
          const rawMode = getSetting(modeKey)
          const mode = (rawMode as string) || 'summary'

          // If the user explicitly chose 'all_messages' or 'selected', prefer that
          if (mode === 'all_messages') {
            const msgs = getMessages(card.id)
            if (msgs && msgs.length > 0) {
              const recent = msgs.map(m => `${m.role}: ${m.content}`).join('\n')
              nodeSummary = recent.slice(0, 2000)
            }
          } else if (mode === 'selected') {
            // load selected message ids from settings
            try {
              const selKey = `cardSelectedContext:${card.id}`
              const raw = getSetting(selKey)
              if (raw) {
                const ids: string[] = JSON.parse(raw)
                if (ids.length > 0) {
                  const all = getMessages(card.id)
                  const sel = all.filter(m => ids.includes(m.id))
                  if (sel.length > 0) {
                    nodeSummary = sel.map(m => `${m.role}: ${m.content}`).join('\n').slice(0, 2000)
                  }
                }
              }
            } catch (e) {
              // fall back
            }
          } else {
            const msgs = getMessages(card.id)
            if (msgs && msgs.length > 0) {
              // Combine up to the last 5 messages from this card
              const recent = msgs.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')
              nodeSummary = recent.slice(0, 1000) // cap length
            }
          }
        
        } catch (e) {
          // ignore
        }
      }

      // If we have any non-empty summary/title, include as context
      if (nodeSummary || card.title) {
        contextNodes.push({
          id: card.id,
          title: card.title,
          summary: nodeSummary || card.title,
          distance: depth
        })
      }
    }
    
    // If not at max depth, find parents of this node
    if (depth < maxDepth) {
      const grandParents = db.prepare('SELECT source_card_id FROM connections WHERE target_card_id = ?').all(id) as { source_card_id: string }[]
      for (const gp of grandParents) {
        // Only queue unvisited nodes (ensures deduplication across multiple paths)
        if (!visited.has(gp.source_card_id)) {
          queue.push({ id: gp.source_card_id, depth: depth + 1 })
          visited.add(gp.source_card_id)
        }
      }
    }
  }
  
  // Sort by distance (closer nodes might be more relevant, or reverse?)
  // Usually, we want the "Foundation" (farthest) first, then "Specifics" (closest).
  // So sort by distance DESC.
  return contextNodes.sort((a, b) => b.distance - a.distance)
}

/**
 * Assembles the System Prompt based on context.
 */
export function buildSystemPrompt(contextNodes: ContextNode[]): string {
  if (contextNodes.length === 0) {
    return "You are a helpful creative assistant. You are helping the user develop ideas in a knowledge graph."
  }

  let prompt = "You are a helpful creative assistant. You are currently in a specific node of a knowledge graph.\n"
  prompt += "Here is the context from upstream nodes (ancestors), which informs the current topic:\n\n"
  
  contextNodes.forEach((node, index) => {
    prompt += `--- Context ${index + 1} (from "${node.title}") ---\n`
    prompt += `${node.summary}\n\n`
  })
  
  prompt += "Please use the above context to answer the user's request in the current node. Maintain continuity with the established facts/ideas."
  
  return prompt
}
