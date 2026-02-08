import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// System prompt for scout generation
const SCOUT_SYSTEM_PROMPT = `You are a scout for interesting ideas, trends, and provocations. Your job is to surface thought-provoking observations that make people want to dig deeper, build something new, or challenge the status quo.

You're looking for:
- Interesting tensions or contradictions in how people behave
- Emerging patterns that aren't obvious yet
- Contrarian takes on accepted wisdom
- Surprising research or cultural shifts
- Questions that don't have easy answers
- Opportunities hiding in plain sight
- Things that feel broken or ready for reinvention

Your tone is:
- Provocative but not clickbait
- Specific, not vague
- Curious, not preachy
- Concise — every word matters

Format your provocations as short, punchy statements that invite exploration. They should feel like the start of something — a conversation, an investigation, or a new venture.`

export async function POST(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const body = await req.json()
  const { action, zones, scout, lens } = body

  try {
    if (action === 'generate') {
      // Generate 4-5 scout cards
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SCOUT_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Generate 5 thought-provoking provocations across these topics: ${zones}

For each provocation:
- One punchy sentence (under 20 words ideally)
- Should make someone think "there's something deeper here worth exploring"
- Could spark a new product, a piece of writing, a research question, or a business idea
- Should feel like the beginning of something, not a conclusion

Avoid these patterns:
- "It's not X, it's Y" constructions
- Starting with "The most..." or "The real..." or "We don't..."
- Anything that sounds like a TED talk title or LinkedIn post
- Generic observations that apply to everything
- Truisms dressed up as insights

Return as JSON array with this format:
[
  { "title": "The provocation text", "zone": "Which topic area" },
  ...
]

Only return the JSON array, no other text.`
        }]
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        return NextResponse.json({ error: 'Unexpected response type' }, { status: 500 })
      }

      // Parse JSON from response
      let scouts
      try {
        // Clean up response — sometimes Claude adds backticks
        const cleaned = content.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        scouts = JSON.parse(cleaned)
        // Add IDs
        scouts = scouts.map((s: { title: string; zone: string }, i: number) => ({
          ...s,
          id: `scout-${Date.now()}-${i}`
        }))
      } catch {
        console.error('Failed to parse scouts JSON:', content.text)
        return NextResponse.json({ error: 'Failed to parse response' }, { status: 500 })
      }

      return NextResponse.json({ scouts })
    }

    if (action === 'expand') {
      // Expand a scout with more context
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: SCOUT_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Expand on this provocation with 2-3 paragraphs of context:

"${scout.title}"
(Topic: ${scout.zone})

Explain:
- What's happening that makes this interesting
- Why it matters or what it reveals
- The tension or question at the heart of it

Write in a thoughtful, exploratory tone. Don't be preachy or prescriptive. End with something that invites further thinking, not a neat conclusion.

Return only the paragraphs, no headers or formatting.`
        }]
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        return NextResponse.json({ error: 'Unexpected response type' }, { status: 500 })
      }

      return NextResponse.json({ expanded: content.text })
    }

    if (action === 'deeper') {
      // Go deeper with a specific lens
      const lensPrompts: Record<string, string> = {
        contrarian: `Take a contrarian view on this. What's the opposite take? What would someone who disagrees say? Push back on the premise.`,
        who: `Who is actually exploring or working on this? What companies, researchers, communities, or movements are engaged with this tension? Be specific if you can.`,
        why_now: `Why is this happening now? What changed recently — technologically, culturally, economically — that makes this relevant today in a way it wasn't before?`,
        tension: `What's the core tension here? What are the competing forces or values? Why is this hard to resolve?`,
        sources: `What real articles, research, books, or thinkers have explored this topic? Suggest 2-3 specific sources someone could look up to go deeper. Include names, titles, or publication names where possible.`,
      }

      const lensPrompt = lensPrompts[lens] || lensPrompts.tension

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: SCOUT_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Original provocation: "${scout.title}"

Context: ${scout.expanded}

Now go deeper with this lens:
${lensPrompt}

Write 2-3 paragraphs. Be specific and substantive. Return only the paragraphs, no headers.`
        }]
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        return NextResponse.json({ error: 'Unexpected response type' }, { status: 500 })
      }

      return NextResponse.json({ content: content.text })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  } catch (error) {
    console.error('Scouts API error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}