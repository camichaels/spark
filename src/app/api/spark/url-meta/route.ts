import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { url } = await req.json()

  if (!url) {
    return NextResponse.json({ error: 'No URL provided' }, { status: 400 })
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    })

    const html = await response.text()

    // Extract title — try multiple patterns
    const ogTitleMatch = html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]+)"/i)
      || html.match(/<meta\s+content="([^"]+)"\s+(?:property|name)="og:title"/i)
    const twitterTitleMatch = html.match(/<meta\s+(?:property|name)="twitter:title"\s+content="([^"]+)"/i)
      || html.match(/<meta\s+content="([^"]+)"\s+(?:property|name)="twitter:title"/i)
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)

    // Extract description
    const ogDescMatch = html.match(/<meta\s+(?:property|name)="og:description"\s+content="([^"]+)"/i)
      || html.match(/<meta\s+content="([^"]+)"\s+(?:property|name)="og:description"/i)
    const twitterDescMatch = html.match(/<meta\s+(?:property|name)="twitter:description"\s+content="([^"]+)"/i)
      || html.match(/<meta\s+content="([^"]+)"\s+(?:property|name)="twitter:description"/i)
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
      || html.match(/<meta\s+content="([^"]+)"\s+name="description"/i)

    const title = ogTitleMatch?.[1] || twitterTitleMatch?.[1] || titleMatch?.[1] || null
    const description = ogDescMatch?.[1] || twitterDescMatch?.[1] || descMatch?.[1] || null

    // Clean up HTML entities
    const clean = (s: string | null) => {
      if (!s) return null
      return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&#x2F;/g, '/')
        .replace(/&#8217;/g, "'")
        .replace(/&#8216;/g, "'")
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&#8211;/g, '–')
        .replace(/&#8212;/g, '—')
        .trim()
    }

    return NextResponse.json({
      title: clean(title),
      description: clean(description),
    })
  } catch (err) {
    console.error('URL fetch error:', err)
    return NextResponse.json({ title: null, description: null })
  }
}