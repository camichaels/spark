'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import styles from './scouts.module.css'

const INTEREST_OPTIONS = [
  { id: 'technology', label: 'Technology' },
  { id: 'science', label: 'Science & research' },
  { id: 'work_creativity', label: 'Work & creativity' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'cities_spaces', label: 'Cities & spaces' },
  { id: 'health', label: 'Health & wellness' },
  { id: 'culture', label: 'Culture & media' },
  { id: 'business', label: 'Business & economy' },
]

const DEEPER_LENSES = [
  { id: 'contrarian', label: 'Contrarian take' },
  { id: 'who', label: "Who's exploring this?" },
  { id: 'why_now', label: 'Why now?' },
  { id: 'tension', label: "What's the tension?" },
  { id: 'sources', label: 'Find real sources' },
]

type DeeperResult = {
  lens: string
  lensId: string
  content: string
}

type Scout = {
  id: string
  title: string
  zone: string
  expanded?: string
  deeperResults?: DeeperResult[]  // Multiple go-deeper results
  savedToJots?: boolean  // Track if already saved
}

type Idea = {
  id: string
  title: string
}

const SCOUTS_STORAGE_KEY = 'spark-scouts-session'

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
    loadScoutsFromSession()
  }, [])

  // Save scouts to sessionStorage when they change
  useEffect(() => {
    if (scouts.length > 0) {
      sessionStorage.setItem(SCOUTS_STORAGE_KEY, JSON.stringify(scouts))
    }
  }, [scouts])

  function loadScoutsFromSession() {
    try {
      const saved = sessionStorage.getItem(SCOUTS_STORAGE_KEY)
      if (saved) {
        setScouts(JSON.parse(saved))
      }
    } catch {
      // Ignore parse errors
    }
  }

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

    // Collapse topics when generating
    setShowTopics(false)
    setGenerating(true)
    
    // Clear previous scouts from session
    sessionStorage.removeItem(SCOUTS_STORAGE_KEY)
    
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

    // Build context from all previous deeper results
    let fullContext = expandedScout.expanded || ''
    if (expandedScout.deeperResults?.length) {
      fullContext += '\n\nPrevious explorations:\n'
      expandedScout.deeperResults.forEach(d => {
        fullContext += `\n${d.lens}:\n${d.content}\n`
      })
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
            expanded: fullContext,
          },
          lens,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const lensLabel = DEEPER_LENSES.find(l => l.id === lens)?.label || lens
        const newDeeperResult: DeeperResult = {
          lens: lensLabel,
          lensId: lens,
          content: data.content
        }
        const updatedScout = { 
          ...expandedScout, 
          deeperResults: [...(expandedScout.deeperResults || []), newDeeperResult]
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

  // Get lenses that haven't been used yet on this scout
  function getAvailableLenses(): typeof DEEPER_LENSES {
    if (!expandedScout?.deeperResults?.length) return DEEPER_LENSES
    const usedLensIds = expandedScout.deeperResults.map(d => d.lensId)
    return DEEPER_LENSES.filter(l => !usedLensIds.includes(l.id))
  }

  async function saveToJots() {
    if (!expandedScout) return
    if (expandedScout.savedToJots) {
      showToast('Already saved to Jots')
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) {
      showToast('Not logged in')
      return
    }

    // Build content from scout
    const content = expandedScout.title
    const metadata: Record<string, unknown> = {
      source: 'scout',
      zone: expandedScout.zone,
    }
    
    if (expandedScout.expanded) {
      metadata.expanded = expandedScout.expanded
    }
    if (expandedScout.deeperResults?.length) {
      metadata.deeper_results = expandedScout.deeperResults
    }

    // Use 'thought' type for compatibility, mark as scout in metadata
    const { error } = await supabase.from('elements').insert({
      user_id: session.user.id,
      idea_id: null,
      type: 'thought',
      source: 'ai',
      content,
      metadata,
      is_archived: false,
    })

    if (error) {
      console.error('Save to jots error:', error)
      showToast('Failed to save: ' + error.message)
      return
    }

    // Mark as saved
    const updatedScout = { ...expandedScout, savedToJots: true }
    setScouts(prev => prev.map(s => s.id === expandedScout.id ? updatedScout : s))
    setExpandedScout(updatedScout)
    showToast('Saved to Jots')
  }

  function openStartIdea() {
    if (!expandedScout) return
    
    // Pre-fill title with short version
    const titleWords = expandedScout.title.split(' ').slice(0, 5).join(' ')
    setIdeaTitle(titleWords.length < expandedScout.title.length ? titleWords + '...' : expandedScout.title)
    
    // Leave current thinking blank — scout content becomes first element
    setIdeaThinking('')
    setShowStartIdea(true)
  }

  async function createIdea() {
    if (!ideaTitle.trim() || !expandedScout) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) {
      showToast('Not logged in')
      return
    }

    // Create the idea
    const { data: ideaData, error: ideaError } = await supabase
      .from('ideas')
      .insert({
        user_id: session.user.id,
        title: ideaTitle.trim(),
        current_thinking: ideaThinking.trim() || null,
        status: 'active',
      })
      .select()
      .single()

    if (ideaError || !ideaData) {
      showToast('Failed to create idea')
      return
    }

    // Save scout content as first element (use 'thought' type for compatibility)
    const metadata: Record<string, unknown> = {
      source: 'scout',
      zone: expandedScout.zone,
    }
    if (expandedScout.expanded) {
      metadata.expanded = expandedScout.expanded
    }
    if (expandedScout.deeperResults?.length) {
      metadata.deeper_results = expandedScout.deeperResults
    }

    await supabase.from('elements').insert({
      user_id: session.user.id,
      idea_id: ideaData.id,
      type: 'thought',
      source: 'ai',
      content: expandedScout.title,
      metadata,
      is_archived: false,
    })

    // Stay on current view, just close modal and show toast
    setShowStartIdea(false)
    showToast(`Idea "${ideaTitle.trim()}" created!`)
    loadIdeas() // Refresh ideas list
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
  if (expandedScout && !showStartIdea) {
    const availableLenses = getAvailableLenses()
    const hasMoreLenses = availableLenses.length > 0

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

            {/* All deeper results */}
            {expandedScout.deeperResults?.map((deeper, idx) => (
              <div key={idx} className={styles.deeperResult}>
                <div className={styles.deeperLabel}>⚡ {deeper.lens}</div>
                <div className={styles.deeperContent}>
                  {deeper.content.split('\n\n').map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Lenses picker */}
          {showLenses && hasMoreLenses && (
            <div className={styles.lensesCard}>
              <h3 className={styles.lensesTitle}>Go deeper on this:</h3>
              <div className={styles.lensesList}>
                {availableLenses.map(lens => (
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
              <span className={styles.thinkingText}>⚡ Thinking...</span>
            </div>
          )}

          {/* Actions */}
          <div className={styles.actionRow}>
            {hasMoreLenses && !showLenses && !deepeningLens && (
              <button 
                className={styles.actionBtnSecondary}
                onClick={() => setShowLenses(true)}
              >
                ⚡ Go deeper
              </button>
            )}
            <button 
              className={`${styles.actionBtnTertiary} ${expandedScout.savedToJots ? styles.actionBtnDisabled : ''}`}
              onClick={saveToJots}
              disabled={expandedScout.savedToJots}
            >
              {expandedScout.savedToJots ? 'Saved ✓' : 'Save to Jots'}
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
                  <p className={styles.scoutTextLoading}>⚡ Expanding...</p>
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
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
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
                  autoComplete="off"
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Current Thinking (optional)</label>
                <textarea
                  value={ideaThinking}
                  onChange={(e) => setIdeaThinking(e.target.value)}
                  className={styles.fieldTextarea}
                  placeholder="What's your initial thesis? You can add this later..."
                  rows={3}
                />
                <p className={styles.fieldHint}>The scout content will be saved as your first element.</p>
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