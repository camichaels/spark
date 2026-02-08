'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import styles from './scouts.module.css'

const INTEREST_OPTIONS = [
  { id: 'tech_behavior', label: 'Tech & behavior' },
  { id: 'work_creativity', label: 'Work & creativity' },
  { id: 'relationships', label: 'Relationships & connection' },
  { id: 'cities_spaces', label: 'Cities & spaces' },
  { id: 'health_habits', label: 'Health & habits' },
  { id: 'culture_trends', label: 'Culture & trends' },
  { id: 'money_markets', label: 'Money & markets' },
]

const DEEPER_LENSES = [
  { id: 'contrarian', label: 'Contrarian take' },
  { id: 'who', label: "Who's exploring this?" },
  { id: 'why_now', label: 'Why now?' },
  { id: 'tension', label: "What's the tension?" },
  { id: 'sources', label: 'Find real sources' },
]

type Scout = {
  id: string
  title: string
  zone: string
  expanded?: string
  deeper?: {
    lens: string
    content: string
  }
}

type Idea = {
  id: string
  title: string
}

export default function ScoutsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [interests, setInterests] = useState<string[]>([])
  const [showTopics, setShowTopics] = useState(false)
  const [scouts, setScouts] = useState<Scout[]>([])
  const [generating, setGenerating] = useState(false)
  
  // Expanded scout view
  const [expandedScout, setExpandedScout] = useState<Scout | null>(null)
  const [expandingId, setExpandingId] = useState<string | null>(null)
  
  // Go deeper
  const [showLenses, setShowLenses] = useState(false)
  const [deepeningLens, setDeepeningLens] = useState<string | null>(null)
  
  // Start Idea modal
  const [showStartIdea, setShowStartIdea] = useState(false)
  const [ideaTitle, setIdeaTitle] = useState('')
  const [ideaThinking, setIdeaThinking] = useState('')
  const [ideas, setIdeas] = useState<Idea[]>([])
  
  // Toast
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadSettings()
    loadIdeas()
  }, [])

  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }

  async function loadSettings() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('user_settings')
      .select('scout_interests')
      .eq('user_id', session.user.id)
      .single()

    if (data?.scout_interests?.length) {
      setInterests(data.scout_interests)
    }
    setLoading(false)
  }

  async function loadIdeas() {
    const { data } = await supabase
      .from('ideas')
      .select('id, title')
      .eq('status', 'active')
      .order('title', { ascending: true })
    if (data) setIdeas(data)
  }

  async function saveInterests(newInterests: string[]) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    // Upsert settings
    await supabase
      .from('user_settings')
      .upsert({
        user_id: session.user.id,
        scout_interests: newInterests,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })
  }

  function toggleInterest(id: string) {
    let newInterests: string[]
    if (interests.includes(id)) {
      // Don't allow removing if only 1 selected
      if (interests.length <= 1) return
      newInterests = interests.filter(i => i !== id)
    } else {
      // Don't allow more than 5
      if (interests.length >= 5) return
      newInterests = [...interests, id]
    }
    setInterests(newInterests)
    saveInterests(newInterests)
  }

  async function generateScouts() {
    if (interests.length === 0) {
      setShowTopics(true)
      return
    }

    setGenerating(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setGenerating(false)
      return
    }

    const selectedZones = interests
      .map(id => INTEREST_OPTIONS.find(o => o.id === id)?.label)
      .filter(Boolean)
      .join(', ')

    try {
      const res = await fetch('/api/scouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          action: 'generate',
          zones: selectedZones,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setScouts(data.scouts || [])
      }
    } catch (err) {
      console.error('Generate scouts error:', err)
    } finally {
      setGenerating(false)
    }
  }

  async function expandScout(scout: Scout) {
    if (scout.expanded) {
      setExpandedScout(scout)
      return
    }

    setExpandingId(scout.id)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setExpandingId(null)
      return
    }

    try {
      const res = await fetch('/api/scouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          action: 'expand',
          scout: { title: scout.title, zone: scout.zone },
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const updatedScout = { ...scout, expanded: data.expanded }
        setScouts(prev => prev.map(s => s.id === scout.id ? updatedScout : s))
        setExpandedScout(updatedScout)
      }
    } catch (err) {
      console.error('Expand scout error:', err)
    } finally {
      setExpandingId(null)
    }
  }

  async function goDeeper(lens: string) {
    if (!expandedScout) return
    
    setDeepeningLens(lens)
    setShowLenses(false)
    
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setDeepeningLens(null)
      return
    }

    try {
      const res = await fetch('/api/scouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          action: 'deeper',
          scout: { 
            title: expandedScout.title, 
            zone: expandedScout.zone,
            expanded: expandedScout.expanded,
          },
          lens,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const lensLabel = DEEPER_LENSES.find(l => l.id === lens)?.label || lens
        const updatedScout = { 
          ...expandedScout, 
          deeper: { lens: lensLabel, content: data.content }
        }
        setScouts(prev => prev.map(s => s.id === expandedScout.id ? updatedScout : s))
        setExpandedScout(updatedScout)
      }
    } catch (err) {
      console.error('Go deeper error:', err)
    } finally {
      setDeepeningLens(null)
    }
  }

  async function saveToJots() {
    if (!expandedScout) return

    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return

    // Build content from scout
    let content = expandedScout.title
    const metadata: Record<string, unknown> = {
      source: 'scout',
      zone: expandedScout.zone,
    }
    
    if (expandedScout.expanded) {
      metadata.expanded = expandedScout.expanded
    }
    if (expandedScout.deeper) {
      metadata.deeper_lens = expandedScout.deeper.lens
      metadata.deeper_content = expandedScout.deeper.content
    }

    const { error } = await supabase.from('elements').insert({
      user_id: userId,
      idea_id: null,
      type: 'scout',
      source: 'ai',
      content,
      metadata,
      is_archived: false,
    })

    if (!error) {
      showToast('Saved to Jots')
      setExpandedScout(null)
    }
  }

  function openStartIdea() {
    if (!expandedScout) return
    
    // Pre-fill with scout content
    const titleWords = expandedScout.title.split(' ').slice(0, 6).join(' ')
    setIdeaTitle(titleWords.length < expandedScout.title.length ? titleWords + '...' : titleWords)
    
    let thinking = expandedScout.title
    if (expandedScout.deeper) {
      thinking += '\n\n' + expandedScout.deeper.content
    }
    setIdeaThinking(thinking)
    setShowStartIdea(true)
  }

  async function createIdea() {
    if (!ideaTitle.trim()) return

    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return

    const { data, error } = await supabase
      .from('ideas')
      .insert({
        user_id: userId,
        title: ideaTitle.trim(),
        current_thinking: ideaThinking.trim() || null,
        status: 'active',
      })
      .select()
      .single()

    if (!error && data) {
      router.push(`/idea/${data.id}`)
    }
  }

  function closeExpanded() {
    setExpandedScout(null)
    setShowLenses(false)
  }

  // First time — no interests selected
  const isFirstTime = !loading && interests.length === 0

  if (loading) {
    return (
      <div className={styles.page}>
        <nav className={styles.nav}>
          <button onClick={() => router.push('/')} className={styles.backBtn}>← Home</button>
        </nav>
        <div className={styles.center}><p className={styles.muted}></p></div>
      </div>
    )
  }

  // Expanded view
  if (expandedScout) {
    return (
      <div className={styles.page}>
        <nav className={styles.nav}>
          <button onClick={closeExpanded} className={styles.backBtn}>← Back</button>
        </nav>

        <main className={styles.container}>
          <div className={styles.expandedCard}>
            <h2 className={styles.expandedTitle}>{expandedScout.title}</h2>
            <span className={styles.expandedZone}>{expandedScout.zone}</span>
            
            {expandedScout.expanded && (
              <div className={styles.expandedBody}>
                {expandedScout.expanded.split('\n\n').map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )}

            {/* Deeper result */}
            {expandedScout.deeper && (
              <div className={styles.deeperResult}>
                <div className={styles.deeperLabel}>⚡ {expandedScout.deeper.lens}</div>
                <div className={styles.deeperContent}>
                  {expandedScout.deeper.content.split('\n\n').map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Lenses picker */}
          {showLenses && !expandedScout.deeper && (
            <div className={styles.lensesCard}>
              <h3 className={styles.lensesTitle}>Go deeper on this:</h3>
              <div className={styles.lensesList}>
                {DEEPER_LENSES.map(lens => (
                  <button
                    key={lens.id}
                    className={styles.lensBtn}
                    onClick={() => goDeeper(lens.id)}
                    disabled={deepeningLens !== null}
                  >
                    {lens.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading state for deepening */}
          {deepeningLens && (
            <div className={styles.thinkingState}>
              <span className={styles.thinkingText}>Thinking...</span>
            </div>
          )}

          {/* Actions */}
          <div className={styles.actionRow}>
            {!expandedScout.deeper && !showLenses && !deepeningLens && (
              <button 
                className={styles.actionBtnSecondary}
                onClick={() => setShowLenses(true)}
              >
                ⚡ Go deeper
              </button>
            )}
            <button 
              className={styles.actionBtnTertiary}
              onClick={saveToJots}
            >
              Save to Jots
            </button>
            <button 
              className={styles.actionBtnPrimary}
              onClick={openStartIdea}
            >
              Start Idea
            </button>
          </div>
        </main>

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <button onClick={() => router.push('/')} className={styles.backBtn}>← Home</button>
      </nav>

      <main className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Scouts</h1>
        </header>

        {/* Topics toggle */}
        {!isFirstTime && (
          <button 
            className={styles.topicsToggle}
            onClick={() => setShowTopics(!showTopics)}
          >
            Topics ({interests.length}) {showTopics ? '▴' : '▾'}
          </button>
        )}

        {/* Topics list — expanded or first time */}
        {(showTopics || isFirstTime) && (
          <div className={styles.topicsList}>
            {isFirstTime && (
              <p className={styles.topicsIntro}>
                Pick 3-5 topics for your scouts to explore:
              </p>
            )}
            {INTEREST_OPTIONS.map(option => (
              <label key={option.id} className={styles.topicItem}>
                <input
                  type="checkbox"
                  checked={interests.includes(option.id)}
                  onChange={() => toggleInterest(option.id)}
                  className={styles.topicCheckbox}
                />
                <span className={styles.topicLabel}>{option.label}</span>
              </label>
            ))}
            {interests.length >= 5 && (
              <p className={styles.topicsHint}>Maximum 5 topics selected</p>
            )}
          </div>
        )}

        {/* Generate button */}
        <button
          className={styles.generateBtn}
          onClick={generateScouts}
          disabled={generating || interests.length === 0}
        >
          {generating ? 'Scouting...' : '⚡ Send out scouts'}
        </button>

        {/* Scout cards */}
        {scouts.length > 0 && (
          <div className={styles.scoutsList}>
            {scouts.map(scout => (
              <button
                key={scout.id}
                className={styles.scoutCard}
                onClick={() => expandScout(scout)}
                disabled={expandingId !== null}
              >
                {expandingId === scout.id ? (
                  <p className={styles.scoutText}>Loading...</p>
                ) : (
                  <>
                    <p className={styles.scoutText}>{scout.title}</p>
                    <span className={styles.scoutZone}>{scout.zone}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Generate more */}
        {scouts.length > 0 && !generating && (
          <button
            className={styles.generateMore}
            onClick={generateScouts}
          >
            Generate more
          </button>
        )}

        {/* Empty state — after setup but no scouts yet */}
        {!isFirstTime && scouts.length === 0 && !generating && (
          <div className={styles.emptyState}>
            <p>Tap the button above to send out your scouts.</p>
          </div>
        )}
      </main>

      {/* Start Idea Modal */}
      {showStartIdea && (
        <>
          <div className={styles.overlay} onClick={() => setShowStartIdea(false)} />
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Start Idea</span>
              <button onClick={() => setShowStartIdea(false)} className={styles.closeBtn}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Idea title</label>
                <input
                  type="text"
                  value={ideaTitle}
                  onChange={(e) => setIdeaTitle(e.target.value)}
                  className={styles.fieldInput}
                  placeholder="Give your idea a name..."
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Current Thinking</label>
                <textarea
                  value={ideaThinking}
                  onChange={(e) => setIdeaThinking(e.target.value)}
                  className={styles.fieldTextarea}
                  placeholder="Your starting thesis..."
                  rows={5}
                />
                <p className={styles.fieldHint}>This is your starting thesis. You'll refine it as you develop the idea.</p>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button onClick={() => setShowStartIdea(false)} className={styles.modalCancel}>Cancel</button>
              <button 
                onClick={createIdea} 
                className={styles.modalConfirm}
                disabled={!ideaTitle.trim()}
              >
                Create Idea
              </button>
            </div>
          </div>
        </>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}