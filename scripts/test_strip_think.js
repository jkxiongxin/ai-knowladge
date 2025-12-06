const examples = [
  'This is a summary. <think>internal debate: maybe not good</think> End of summary.',
  '<think>meta thoughts</think>Final summary sentence.',
  'No think tags here. Just summary.',
  'Multiple <think>first</think> content <think>second</think> real summary.'
]

function stripThink(raw) {
  return raw.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '').replace(/\s+/g,' ').trim()
}

examples.forEach(e => {
  console.log('---')
  console.log('Before: ', e)
  console.log('After : ', stripThink(e))
})
