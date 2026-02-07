/**
 * Centralized AI Prompts for Spark
 * 
 * All AI instruction text lives here for easy maintenance and iteration.
 * 
 * DESIGN PRINCIPLES:
 * 1. Every response ends with a question back to the user
 * 2. Concise and focused — one insight, not a list
 * 3. Warm provocateur tone — direct but not harsh
 * 4. Reference specific content, never be generic
 * 5. Make the user think, don't think for them
 */

// ============================================
// SYSTEM PROMPTS
// ============================================

export const SYSTEM_PROMPT_BASE = `You are Spark, a thinking partner who helps users develop their ideas. You're not a generic assistant — you're a warm provocateur who pushes people to think harder and clearer.

YOUR ROLE:
- Make the user think, don't think for them
- Challenge assumptions without being harsh
- Ask genuine questions, not rhetorical ones
- Reference their specific content, never be generic
- Keep the ball in their court

YOUR TONE:
- Direct but warm — like a smart friend who genuinely wants to help
- Curious and engaged — you find their ideas interesting
- Concise — say what matters, skip the filler
- NOT sycophantic ("Great idea!"), NOT harsh ("This is flawed"), NOT corporate ("Based on my analysis")

CRITICAL RULES:
- EVERY response must end with a genuine question back to the user
- Be concise: 2-5 sentences max, then your question
- One focused insight per response, not a list of observations
- NEVER say you "cannot access URLs" — you have the context provided
- NEVER use markdown headers, bullets, or formatting — plain prose only
- NEVER start with "Based on..." or "Looking at..." — just state your insight
- Reference their actual words, titles, and content — be specific`

export function getSystemPromptWithIdea(
  ideaTitle: string, 
  currentThinking: string | null, 
  elementsSummary: string,
  elementCount: number
): string {
  const maturityNote = elementCount <= 3 
    ? `This is an early-stage idea with only ${elementCount} elements — focus on helping them clarify what they're actually exploring.`
    : elementCount >= 15
    ? `This idea has ${elementCount} elements — there's substantial material to synthesize and patterns to surface.`
    : ''

  return `${SYSTEM_PROMPT_BASE}

CONTEXT:
The user is developing an idea called "${ideaTitle}".
${currentThinking ? `\nTheir current thinking:\n"${currentThinking}"` : '\nThey haven\'t written their current thinking yet.'}
${elementsSummary ? `\nTheir collected elements:\n${elementsSummary}` : '\nNo elements collected yet.'}
${maturityNote ? `\n${maturityNote}` : ''}`
}

export const SYSTEM_PROMPT_DRAWER = `${SYSTEM_PROMPT_BASE}

CONTEXT:
The user is reviewing an item in their Drawer — a holding area for thoughts and content that haven't been assigned to a specific idea yet. Help them see what's interesting or useful about this item.`

// ============================================
// BIG SPARK PROMPTS (Idea-level)
// ============================================

export const SPARK_PROMPTS = {
  synthesize: `Look at my current thinking and the elements I've collected. What's the through-line? Surface a pattern or connection I might not be seeing.

Be specific — reference actual elements. Then ask me a question that helps me clarify or refine my thesis.`,
  
  challenge: `Push back on my current thinking. What assumption am I making that might be wrong? What's the weakest part of my reasoning? What am I avoiding or not addressing?

Pick ONE thing to challenge — don't give me a list. Be direct but constructive. Then ask me a question that forces me to defend or revise my position.`,
  
  expand: `Based on my current thinking and elements, suggest ONE adjacent territory I should explore. This could be a different angle, an implication I haven't considered, or a connection to something outside what I've collected.

Be specific and concrete — not "consider other perspectives" but an actual direction. Then ask me whether this direction is worth pursuing and why.`,

  soWhat: `Given everything here — my current thinking and all these elements — what's the implication? If my thinking is right, what follows from it? What decision or action does this point toward?

Don't tell me what to do. Surface the "so what" and then ask me what I think the next step should be.`,
}

// ============================================
// MINI SPARK PROMPTS (Element-level)
// ============================================

export const MINI_SPARK_PROMPTS = {
  summarize: `Summarize this in 2-3 sentences. Capture the core insight or argument, not a comprehensive overview.

Then ask: does this element support, complicate, or change my current thinking on this idea?`,
}

/**
 * Get the mini-spark prompt with optional context warning for limited info
 */
export function getMiniSparkPrompt(
  type: 'summarize',
  hasLimitedContext: boolean
): string {
  const basePrompt = MINI_SPARK_PROMPTS[type]
  
  if (hasLimitedContext) {
    return `You only have the title and URL — you haven't read the full content. Acknowledge this briefly, then infer what you can from the title.

${basePrompt}`
  }
  
  return basePrompt
}

/**
 * Build the full mini-spark request prompt with element context
 */
export function buildMiniSparkPrompt(
  type: 'summarize',
  elementContext: string,
  hasLimitedContext: boolean
): string {
  const taskPrompt = getMiniSparkPrompt(type, hasLimitedContext)
  return `[Element]\n${elementContext}\n\n[Task]\n${taskPrompt}`
}

// ============================================
// HELPER: Build element context string
// ============================================

export function buildElementContext(element: {
  content: string | null
  type: string
  metadata: Record<string, unknown>
}, metaUrl: string | undefined, metaFilename: string): string {
  const isFile = element.type === 'file'
  const isImage = element.type === 'image'
  
  return [
    element.content || '',
    metaUrl ? `URL: ${metaUrl}` : '',
    element.metadata?.title ? `Title: ${element.metadata.title}` : '',
    element.metadata?.description ? `Description: ${element.metadata.description}` : '',
    (isFile || isImage) ? `File: ${metaFilename}` : '',
  ].filter(Boolean).join('\n')
}

// ============================================
// HELPER: Build elements summary for idea context
// With smart truncation for large ideas
// ============================================

const MAX_RECENT_ELEMENTS = 10
const MAX_CONTENT_LENGTH = 300

export function buildElementsSummary(elements: Array<{
  type: string
  source: string
  content: string | null
  metadata: Record<string, unknown>
  created_at?: string
}>): string {
  if (!elements.length) return ''
  
  // Sort by created_at descending (most recent first) if available
  const sorted = [...elements].sort((a, b) => {
    if (!a.created_at || !b.created_at) return 0
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
  
  const lines: string[] = []
  
  sorted.forEach((el, index) => {
    const prefix = el.source === 'ai' ? '[spark]' : `[${el.type}]`
    let content = ''
    
    // Build content string
    if (el.metadata?.title) {
      content = el.metadata.title as string
    } else if (el.content) {
      content = el.content
    }
    
    if (el.metadata?.description && !content.includes(el.metadata.description as string)) {
      content += content ? ` — ${el.metadata.description}` : el.metadata.description as string
    }
    
    // Canonical: url; Legacy: public_url
    const elUrl = (el.metadata?.url || el.metadata?.public_url) as string | undefined
    if (!content && elUrl) content = elUrl
    
    // Canonical: filename; Legacy: file_name
    const elFilename = (el.metadata?.filename || el.metadata?.file_name) as string | undefined
    if (!content && elFilename) content = elFilename
    
    // Apply truncation for older elements
    if (index >= MAX_RECENT_ELEMENTS) {
      // Older elements: truncate content
      if (content.length > 80) {
        content = content.slice(0, 80) + '...'
      }
    } else if (content.length > MAX_CONTENT_LENGTH) {
      // Recent elements: allow more but still cap
      content = content.slice(0, MAX_CONTENT_LENGTH) + '...'
    }
    
    // Add user's note if present (important context)
    const note = el.metadata?.note as string | undefined
    if (note) {
      const truncatedNote = note.length > 100 ? note.slice(0, 100) + '...' : note
      content += ` [user note: "${truncatedNote}"]`
    }
    
    lines.push(`${prefix} ${content}`)
  })
  
  // Add indicator if truncated
  if (elements.length > MAX_RECENT_ELEMENTS) {
    const olderCount = elements.length - MAX_RECENT_ELEMENTS
    lines.splice(MAX_RECENT_ELEMENTS, 0, `\n[...${olderCount} earlier elements, summarized...]`)
  }
  
  return lines.join('\n')
}