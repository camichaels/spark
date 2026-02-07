import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import {
  getSystemPromptWithIdea,
  SYSTEM_PROMPT_DRAWER,
  SPARK_PROMPTS,
  buildElementsSummary,
} from '@/lib/prompts'

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
  if (drawerMode && sparkType === 'mini') {
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
        system: SYSTEM_PROMPT_DRAWER,
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

  const elementsList = elements || []
  
  // Build elements summary using centralized helper (with smart truncation)
  const elementsSummary = buildElementsSummary(elementsList)

  // Build system prompt with idea context and element count
  const systemPrompt = getSystemPromptWithIdea(
    idea.title,
    idea.current_thinking,
    elementsSummary,
    elementsList.length
  )

  // Get the appropriate user prompt
  let userPrompt = ''
  switch (sparkType) {
    case 'synthesize':
      userPrompt = SPARK_PROMPTS.synthesize
      break
    case 'challenge':
      userPrompt = SPARK_PROMPTS.challenge
      break
    case 'expand':
      userPrompt = SPARK_PROMPTS.expand
      break
    case 'soWhat':
      userPrompt = SPARK_PROMPTS.soWhat
      break
    case 'custom':
    case 'mini':
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
      max_tokens: 500, // Slightly more room for question at end
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
    })

    const content = response.content[0].type === 'text'
      ? response.content[0].text
      : ''

    // Mini-sparks return content directly
    if (sparkType === 'mini') {
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