import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Max file sizes for AI processing (to control costs)
const MAX_PDF_BYTES = 5 * 1024 * 1024   // 5MB (~20 pages)
const MAX_IMAGE_BYTES = 3 * 1024 * 1024  // 3MB

async function fetchAttachment(
  attachment: { url: string; type: string; file_type?: string; filename?: string }
): Promise<Anthropic.ContentBlockParam[] | null> {
  try {
    const res = await fetch(attachment.url)
    if (!res.ok) {
      console.error('[Spark] Failed to fetch attachment:', res.status)
      return null
    }

    const buffer = await res.arrayBuffer()
    const bytes = buffer.byteLength

    if (attachment.type === 'image') {
      if (bytes > MAX_IMAGE_BYTES) {
        console.log('[Spark] Image too large for AI:', bytes, 'bytes')
        return null
      }
      const base64 = Buffer.from(buffer).toString('base64')
      const mediaType = (attachment.file_type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      return [{
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      }]
    }

    if (attachment.type === 'file' && attachment.file_type === 'application/pdf') {
      if (bytes > MAX_PDF_BYTES) {
        console.log('[Spark] PDF too large for AI:', bytes, 'bytes')
        return null
      }
      const base64 = Buffer.from(buffer).toString('base64')
      return [{
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      }]
    }

    // Plain text files — read as text
    if (attachment.file_type?.startsWith('text/')) {
      if (bytes > MAX_PDF_BYTES) return null
      const text = new TextDecoder().decode(buffer)
      return [{
        type: 'text',
        text: `[File: ${attachment.filename || 'document'}]\n${text}`,
      }]
    }

    return null
  } catch (err) {
    console.error('[Spark] Error fetching attachment:', err)
    return null
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  const { createClient: createUserClient } = await import('@supabase/supabase-js')
  const userSupabase = createUserClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { ideaId, sparkType, customPrompt, attachment, drawerMode } = body

  // ── Drawer mode: mini-sparks without idea context ──
  if (drawerMode && (sparkType === 'mini' || sparkType === 'summarize' || sparkType === 'related')) {
    const systemPrompt = `You are Spark, an AI provocateur helping users develop their thinking. You challenge, connect, and expand ideas — you are not a generic assistant.

The user is reviewing an item from their Drawer — a holding area for thoughts, links, and files that haven't been assigned to a specific idea yet.

CRITICAL RULES:
- Be concise and specific. 1-2 sentences for mini-sparks.
- NEVER say you "cannot access URLs" or "cannot browse the internet." You have full context about the element provided.
- NEVER mention dates being in the future or question whether content is valid.
- When asked to summarize an article element, summarize based on its title and description. If only a URL is available, infer the topic from the URL path and domain.
- If a PDF or image is attached, analyze its actual content — do not just reference the filename.
- Use plain text only. No markdown headers, no bullet points with dashes.
- Do not start responses with "Based on..." or "Looking at..." — just state your insight directly.`

    const userPrompt = customPrompt || 'What do you think about this?'

    // Build message content — may include file attachments
    const messageContent: Anthropic.ContentBlockParam[] = []

    if (attachment) {
      const attachmentBlocks = await fetchAttachment(attachment)
      if (attachmentBlocks) {
        messageContent.push(...attachmentBlocks)
        messageContent.push({ type: 'text', text: userPrompt })
      } else {
        const sizeNote = `\n[Note: The attached file "${attachment.filename || 'file'}" could not be loaded for analysis. Work with whatever context is available.]`
        messageContent.push({ type: 'text', text: userPrompt + sizeNote })
      }
    } else {
      messageContent.push({ type: 'text', text: userPrompt })
    }

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: 'user', content: messageContent }],
      })

      const content = response.content[0].type === 'text'
        ? response.content[0].text
        : ''

      return NextResponse.json({ content })
    } catch (err) {
      console.error('Anthropic API error:', err)
      return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
    }
  }

  // ── Standard mode: requires ideaId ──
  if (!ideaId) {
    return NextResponse.json({ error: 'ideaId is required' }, { status: 400 })
  }

  // Load idea
  const { data: idea } = await supabaseAdmin
    .from('ideas')
    .select('*')
    .eq('id', ideaId)
    .eq('user_id', user.id)
    .single()

  if (!idea) {
    return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
  }

  // Load active elements
  const { data: elements } = await supabaseAdmin
    .from('elements')
    .select('*')
    .eq('idea_id', ideaId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })

  // Build elements summary — read with legacy fallback for older data
  const elementsSummary = (elements || []).map((el: { type: string; source: string; content: string | null; metadata: Record<string, unknown> }) => {
    const prefix = el.source === 'ai' ? '[Spark]' : `[${el.type}]`
    let content = el.content || ''
    if (el.metadata?.title) content = el.metadata.title as string
    if (el.metadata?.description) content += ` — ${el.metadata.description}`
    // Canonical: url; Legacy: public_url
    const elUrl = (el.metadata?.url || el.metadata?.public_url) as string | undefined
    if (elUrl && !content) content = elUrl
    // Canonical: filename; Legacy: file_name
    const elFilename = (el.metadata?.filename || el.metadata?.file_name) as string | undefined
    if (elFilename && !content) content = elFilename
    return `${prefix} ${content}`
  }).join('\n')

  const systemPrompt = `You are Spark, an AI provocateur helping users develop their thinking. You challenge, connect, and expand ideas — you are not a generic assistant.

The user is working on an idea called "${idea.title}".
${idea.current_thinking ? `\nTheir current thinking:\n${idea.current_thinking}` : ''}
${elementsSummary ? `\nTheir collected elements:\n${elementsSummary}` : ''}

CRITICAL RULES:
- Be concise and specific. 2-4 sentences max for standard sparks. 1-2 sentences for mini-sparks.
- NEVER say you "cannot access URLs" or "cannot browse the internet." You have full context about every element the user has saved — their titles, descriptions, and URLs are provided above.
- NEVER mention dates being in the future or question whether content is valid.
- NEVER be generic. Always reference their specific content, titles, and ideas.
- When asked to summarize an article element, summarize based on its title and description. If only a URL is available, infer the topic from the URL path and domain.
- If a PDF or image is attached, analyze its actual content — do not just reference the filename.
- Challenge their thinking, don't just validate it.
- Use plain text only. No markdown headers, no bullet points with dashes. Short paragraphs or numbered points if listing.
- Do not start responses with "Based on..." or "Looking at..." — just state your insight directly.`

  let userPrompt = ''
  switch (sparkType) {
    case 'synthesize':
      userPrompt = 'Look across all my elements and current thinking. What patterns or connections do you see? Synthesize the key threads into a coherent insight.'
      break
    case 'challenge':
      userPrompt = 'Challenge my current thinking. What assumptions am I making? What am I missing? Push back on something specific.'
      break
    case 'expand':
      userPrompt = 'Based on what I have so far, what adjacent territory should I explore? Suggest a specific direction I haven\'t considered.'
      break
    case 'custom':
    case 'mini':
    case 'summarize':
    case 'related':
      userPrompt = customPrompt || 'What do you think about my idea so far?'
      break
    default:
      userPrompt = 'What do you think about my idea so far?'
  }

  // Build message content — may include file attachments
  const messageContent: Anthropic.ContentBlockParam[] = []

  if (attachment) {
    const attachmentBlocks = await fetchAttachment(attachment)
    if (attachmentBlocks) {
      messageContent.push(...attachmentBlocks)
      messageContent.push({ type: 'text', text: userPrompt })
    } else {
      // Attachment too large or failed — fall back to text-only with note
      const sizeNote = `\n[Note: The attached file "${attachment.filename || 'file'}" could not be loaded for analysis. Work with whatever context is available above.]`
      messageContent.push({ type: 'text', text: userPrompt + sizeNote })
    }
  } else {
    messageContent.push({ type: 'text', text: userPrompt })
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
    })

    const content = response.content[0].type === 'text'
      ? response.content[0].text
      : ''

    // Mini-sparks return content directly
    if (sparkType === 'mini' || sparkType === 'summarize' || sparkType === 'related') {
      return NextResponse.json({ content })
    }

    // Regular sparks create a new timeline element
    const { error } = await supabaseAdmin
      .from('elements')
      .insert({
        idea_id: ideaId,
        user_id: user.id,
        type: 'spark',
        source: 'ai',
        content: content,
        metadata: {
          spark_type: sparkType === 'custom' ? 'custom' : sparkType,
          prompt: sparkType === 'custom' ? customPrompt : undefined,
        },
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, content })
  } catch (err) {
    console.error('Anthropic API error:', err)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}