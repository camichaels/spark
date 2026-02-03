'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import styles from './inbox.module.css'

type Element = {
  id: string
  type: string
  source: string
  content: string | null
  metadata: Record<string, unknown>
  is_archived: boolean
  created_at: string
}

type Idea = {
  id: string
  title: string
}

// ── Helpers: read metadata with legacy fallback ──
function metaUrl(meta: Record<string, unknown>): string | undefined {
  return (meta?.url || meta?.public_url) as string | undefined
}

function metaFilename(meta: Record<string, unknown>): string {
  return (meta?.filename || meta?.file_name || 'File') as string
}

export default function InboxPage() {
  const router = useRouter()
  const [elements, setElements] = useState<Element[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)

  // Triage state
  const [sendPickerFor, setSendPickerFor] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Toast
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadInbox()
    loadIdeas()
  }, [])

  async function loadInbox() {
    const { data } = await supabase
      .from('elements')
      .select('*')
      .is('idea_id', null)
      .eq('is_archived', false)
      .or('metadata->>drawer.is.null,metadata->>drawer.neq.true')
      .order('created_at', { ascending: false })

    if (data) setElements(data)
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

  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }

  async function sendToIdea(elementId: string, ideaId: string) {
    const ideaTitle = ideas.find(i => i.id === ideaId)?.title || 'Idea'
    await supabase
      .from('elements')
      .update({ idea_id: ideaId })
      .eq('id', elementId)

    setElements(prev => prev.filter(e => e.id !== elementId))
    setSendPickerFor(null)
    showToast(`Sent to "${ideaTitle}"`)
  }

  async function moveToDrawer(elementId: string) {
    const el = elements.find(e => e.id === elementId)
    const currentMeta = (el?.metadata || {}) as Record<string, unknown>
    await supabase
      .from('elements')
      .update({ metadata: { ...currentMeta, drawer: 'true' } })
      .eq('id', elementId)

    setElements(prev => prev.filter(e => e.id !== elementId))
    showToast('Moved to Drawer')
  }

  async function deleteElement(elementId: string) {
    await supabase
      .from('elements')
      .delete()
      .eq('id', elementId)

    setElements(prev => prev.filter(e => e.id !== elementId))
    setConfirmDeleteId(null)
    showToast('Deleted')
  }

  // Render helpers
  function getMetaString(el: Element): string {
    const meta = el.metadata || {}
    const parts: string[] = []

    parts.push(el.type.toUpperCase())

    const elUrl = metaUrl(meta)
    if (el.type === 'article' && elUrl) {
      try {
        const domain = new URL(elUrl).hostname.replace('www.', '')
        parts.push(domain)
      } catch { /* skip */ }
    }

    if (el.type === 'file') {
      parts.push(metaFilename(meta))
    }

    const d = new Date(el.created_at)
    const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
    const day = d.getDate()
    parts.push(`${month} ${day}`)

    return parts.join(' · ')
  }

  function renderElementContent(el: Element) {
    const meta = el.metadata || {}
    const elUrl = metaUrl(meta)

    if (el.type === 'article') {
      const title = (meta.title as string) || el.content
      const displayUrl = elUrl ? elUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null
      return (
        <>
          {title && (
            <div className={styles.articleTitle}>
              {elUrl ? (
                <a href={elUrl} target="_blank" rel="noopener noreferrer" className={styles.articleLink}>
                  {meta.title ? title : displayUrl}
                </a>
              ) : title}
            </div>
          )}
          {meta.description && (
            <div className={styles.articleDesc}>{String(meta.description)}</div>
          )}
        </>
      )
    }

    if (el.type === 'image') {
      const imageUrl = meta.storage_path
        ? supabase.storage.from('images').getPublicUrl(meta.storage_path as string).data.publicUrl
        : null
      return (
        <>
          {imageUrl ? (
            <div className={styles.imageWrapper}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={el.content || 'Image'} className={styles.image} />
            </div>
          ) : (
            <div className={styles.imagePlaceholder}>Image</div>
          )}
          {el.content && <div className={styles.caption}>{el.content}</div>}
        </>
      )
    }

    if (el.type === 'file') {
      const fileName = metaFilename(meta)
      const fileExt = fileName.split('.').pop()?.toUpperCase() || 'FILE'
      return (
        <div className={styles.fileCard}>
          <span className={styles.fileIcon}>{fileExt}</span>
          <span className={styles.fileName}>{fileName}</span>
        </div>
      )
    }

    return el.content ? (
      <div className={styles.thoughtText}>{el.content}</div>
    ) : null
  }

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

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <button onClick={() => router.push('/')} className={styles.backBtn}>← Home</button>
      </nav>

      <main className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Inbox</h1>
          <span className={styles.count}>{elements.length} {elements.length === 1 ? 'item' : 'items'}</span>
        </header>

        {elements.length === 0 ? (
          <div className={styles.empty}>
            <p>Inbox is empty.</p>
            <p className={styles.muted}>
              Items added without an Idea land here for triage.
            </p>
          </div>
        ) : (
          <div className={styles.elementList}>
            {elements.map((el) => (
              <div key={el.id} className={styles.element}>
                <div className={styles.elementMeta}>{getMetaString(el)}</div>
                <div className={styles.elementContent}>
                  {renderElementContent(el)}
                </div>

                {/* Simple triage action bar */}
                <div className={styles.triageBar}>
                  <button
  className={styles.triageBtn}
  onClick={() => {
    console.log('Setting sendPickerFor to:', el.id)
    setSendPickerFor(el.id)
  }}
>
  Send to Idea
</button>
                  <button 
                    className={styles.triageBtn} 
                    onClick={() => moveToDrawer(el.id)}
                  >
                    Drawer
                  </button>
                  <button
                    className={`${styles.triageBtn} ${styles.triageBtnDanger}`}
                    onClick={() => setConfirmDeleteId(el.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ===== SEND TO IDEA MODAL ===== */}
      {sendPickerFor && (
        <>
          <div className={styles.overlay} onClick={() => setSendPickerFor(null)} />
          <div className={styles.destModal}>
            <div className={styles.destModalHeader}>
              <span className={styles.destModalTitle}>Where does this go?</span>
              <button onClick={() => setSendPickerFor(null)} className={styles.closeBtn}>✕</button>
            </div>
            <div className={styles.destList}>
              {ideas.length === 0 ? (
                <p className={styles.muted} style={{ padding: '20px', textAlign: 'center' }}>
                  No active ideas. Create one first.
                </p>
              ) : (
                ideas.map((idea) => (
                  <button
                    key={idea.id}
                    className={styles.destItem}
                    onClick={() => sendToIdea(sendPickerFor, idea.id)}
                  >
                    {idea.title}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Delete Confirm Dialog */}
      {confirmDeleteId && (
        <>
          <div className={styles.overlay} onClick={() => setConfirmDeleteId(null)} />
          <div className={styles.dialog}>
            <p className={styles.dialogMessage}>Delete this item?</p>
            <p className={styles.dialogSubtext}>This cannot be undone.</p>
            <div className={styles.dialogActions}>
              <button onClick={() => setConfirmDeleteId(null)} className={styles.dialogCancel}>Cancel</button>
              <button onClick={() => deleteElement(confirmDeleteId)} className={styles.dialogConfirm}>Delete</button>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className={styles.toast}>{toast}</div>
      )}
    </div>
  )
}