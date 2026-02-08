'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import styles from './jots.module.css'
import ImageThumbnail from '@/components/ImageThumbnail'
import ExpandableText from '@/components/ExpandableText'
import ExpandableScout from '@/components/ExpandableScout'
import { buildMiniSparkPrompt, buildElementContext } from '@/lib/prompts'

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

export default function JotsPage() {
  const router = useRouter()
  const [elements, setElements] = useState<Element[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)

  // Quick add
  const [quickAdd, setQuickAdd] = useState('')
  const quickAddRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // ••• modal for quick add
  const [showAddOptions, setShowAddOptions] = useState(false)
  const addOptionsRef = useRef<HTMLDivElement>(null)

  // Element action menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [sendPickerFor, setSendPickerFor] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Content editing (for user thoughts)
  const [editingContentId, setEditingContentId] = useState<string | null>(null)
  const [contentDraft, setContentDraft] = useState('')

  // Note editing
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  // Mini-sparks
  const [miniSparkLoading, setMiniSparkLoading] = useState<string | null>(null)

  // Toast
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
  }, [])

  useEffect(() => {
    loadJots()
    loadIdeas()
  }, [])

  // Close element ••• menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (openMenuId && !(e.target as HTMLElement).closest(`.${styles.menuWrapper}`)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [openMenuId])

  // Close add options ••• menu when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addOptionsRef.current && !addOptionsRef.current.contains(e.target as Node)) {
        setShowAddOptions(false)
      }
    }
    if (showAddOptions) document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showAddOptions])

  async function loadJots() {
    // Load ALL elements without an idea_id (no more drawer flag distinction)
    const { data } = await supabase
      .from('elements')
      .select('*')
      .is('idea_id', null)
      .eq('is_archived', false)
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

  async function handleQuickAdd() {
    if (!quickAdd.trim()) return
    const { data: session } = await supabase.auth.getSession()
    const userId = session?.session?.user?.id
    if (!userId) return

    const content = quickAdd.trim()
    const urlPattern = /^(https?:\/\/|www\.)/i
    const isUrl = urlPattern.test(content)

    const { error } = await supabase.from('elements').insert({
      user_id: userId,
      idea_id: null,
      type: isUrl ? 'article' : 'thought',
      source: 'user',
      content,
      metadata: isUrl ? { url: content } : {},
      is_archived: false,
    })

    if (!error) {
      setQuickAdd('')
      if (quickAddRef.current) quickAddRef.current.style.height = 'auto'
      loadJots()
      showToast('Added to Jots')
    }
  }

  // ••• modal: file selected
  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setShowAddOptions(false)

    const { data: session } = await supabase.auth.getSession()
    const userId = session?.session?.user?.id
    if (!userId) return

    const isImage = file.type.startsWith('image/')
    const bucket = isImage ? 'images' : 'files'
    const filePath = `${userId}/${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file)
    if (uploadError) { showToast('Upload failed'); e.target.value = ''; return }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath)

    const { error } = await supabase.from('elements').insert({
      user_id: userId,
      idea_id: null,
      type: isImage ? 'image' : 'file',
      source: 'user',
      content: file.name,
      metadata: {
        bucket,
        filename: file.name,
        file_size: file.size,
        file_type: file.type,
        storage_path: filePath,
        url: urlData.publicUrl,
      },
      is_archived: false,
    })

    if (!error) { loadJots(); showToast('Added to Jots') }
    e.target.value = ''
  }

  // Clipboard paste on input
  async function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault()
        const file = items[i].getAsFile()
        if (!file) return

        const { data: session } = await supabase.auth.getSession()
        const userId = session?.session?.user?.id
        if (!userId) return

        const named = new File([file], `pasted-image-${Date.now()}.png`, { type: file.type })
        const filePath = `${userId}/${Date.now()}-${named.name}`

        const { error: uploadError } = await supabase.storage.from('images').upload(filePath, named)
        if (uploadError) { showToast('Upload failed'); return }

        const { data: urlData } = supabase.storage.from('images').getPublicUrl(filePath)

        const { error } = await supabase.from('elements').insert({
          user_id: userId,
          idea_id: null,
          type: 'image',
          source: 'user',
          content: named.name,
          metadata: {
            bucket: 'images',
            filename: named.name,
            file_size: named.size,
            file_type: named.type,
            storage_path: filePath,
            url: urlData.publicUrl,
          },
          is_archived: false,
        })

        if (!error) { loadJots(); showToast('Image added to Jots') }
        return
      }
    }
  }

  // ── Mini-spark (summarize only) ──
  async function fireMiniSpark(el: Element) {
    setMiniSparkLoading(`summarize-${el.id}`)
    const { data: session } = await supabase.auth.getSession()
    const token = session?.session?.access_token
    if (!token) { setMiniSparkLoading(null); return }

    const meta = el.metadata || {}
    const elUrl = metaUrl(meta)
    const isFile = el.type === 'file'
    const isImage = el.type === 'image'
    const elFilename = metaFilename(meta)

    // Use centralized helpers
    const elementContext = buildElementContext(
      { content: el.content, type: el.type, metadata: meta },
      elUrl,
      elFilename
    )
    const prompt = buildMiniSparkPrompt('summarize', elementContext, false)

    const requestBody: Record<string, unknown> = {
      sparkType: 'mini',
      customPrompt: prompt,
      drawerMode: true, // No idea context
    }

    if ((isFile || isImage) && elUrl) {
      requestBody.attachment = {
        url: elUrl,
        type: isImage ? 'image' : 'file',
        file_type: meta.file_type,
        filename: elFilename,
      }
    }

    try {
      const res = await fetch('/api/spark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(requestBody),
      })

      if (res.ok) {
        const data = await res.json()
        const updatedMetadata = { ...el.metadata, summary: data.content }
        await supabase.from('elements').update({ metadata: updatedMetadata }).eq('id', el.id)
        loadJots()
      }
    } catch (err) { console.error('Mini spark error:', err) }
    finally { setMiniSparkLoading(null) }
  }

  // ── Content editing (for user thoughts) ──
  function startEditContent(el: Element) {
    setEditingContentId(el.id)
    setContentDraft(el.content || '')
  }

  async function saveContent(el: Element) {
    if (!contentDraft.trim()) return
    await supabase.from('elements').update({ content: contentDraft.trim() }).eq('id', el.id)
    setEditingContentId(null)
    setContentDraft('')
    loadJots()
  }

  function cancelEditContent() {
    setEditingContentId(null)
    setContentDraft('')
  }

  // ── Notes ──
  function startEditNote(el: Element) {
    setEditingNoteId(el.id)
    setNoteDraft((el.metadata?.note as string) || '')
  }

  async function saveNote(el: Element) {
    const updatedMetadata = { ...el.metadata }
    if (noteDraft.trim()) { updatedMetadata.note = noteDraft.trim() }
    else { delete updatedMetadata.note }
    await supabase.from('elements').update({ metadata: updatedMetadata }).eq('id', el.id)
    setEditingNoteId(null)
    setNoteDraft('')
    loadJots()
  }

  function cancelEditNote() {
    setEditingNoteId(null)
    setNoteDraft('')
  }

  // ── Send to Idea ──
  async function sendToIdea(elementId: string, ideaId: string) {
    const ideaTitle = ideas.find(i => i.id === ideaId)?.title || 'Idea'
    await supabase.from('elements').update({ idea_id: ideaId }).eq('id', elementId)
    setElements(prev => prev.filter(e => e.id !== elementId))
    setSendPickerFor(null)
    setOpenMenuId(null)
    showToast(`Sent to "${ideaTitle}"`)
  }

  // ── Delete ──
  async function deleteElement(elementId: string) {
    await supabase.from('elements').delete().eq('id', elementId)
    setElements(prev => prev.filter(e => e.id !== elementId))
    setConfirmDeleteId(null)
    showToast('Deleted')
  }

  // ── Render helpers ──
  function getMetaString(el: Element): string {
    const meta = el.metadata || {}
    const parts: string[] = []
    
    // Check if it's a scout
    if (el.type === 'scout') {
      parts.push('SCOUT')
      if (meta.zone) parts.push(String(meta.zone))
    } else {
      parts.push(el.type.toUpperCase())
      const elUrl = metaUrl(meta)
      if (el.type === 'article' && elUrl) {
        try { parts.push(new URL(elUrl).hostname.replace('www.', '')) } catch { /* skip */ }
      }
      if (el.type === 'file') parts.push(metaFilename(meta))
    }
    
    const d = new Date(el.created_at)
    parts.push(`${d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()} ${d.getDate()}`)
    return parts.join(' · ')
  }

  function renderElementContent(el: Element) {
    const meta = el.metadata || {}
    const elUrl = metaUrl(meta)

    // Scout content (from Scouts page)
    if (el.type === 'scout') {
      const deeperResults = meta.deeper_results as Array<{ lens: string; content: string }> | undefined
      return (
        <ExpandableScout 
          title={el.content || ''}
          expanded={meta.expanded as string | undefined}
          deeperResults={deeperResults}
        />
      )
    }

    if (el.type === 'article') {
      const title = (meta.title as string) || el.content
      return (
        <>
          {title && (
            <div className={styles.articleTitle}>
              {elUrl ? <a href={elUrl} target="_blank" rel="noopener noreferrer" className={styles.articleLink}>{title}</a> : title}
            </div>
          )}
          {meta.description && <ExpandableText text={String(meta.description)} className={styles.articleDesc} lines={3} />}
          {!meta.title && el.content && elUrl && <div className={styles.articleUrl}>{el.content}</div>}
        </>
      )
    }

    if (el.type === 'image') {
      const imageUrl = meta.storage_path
        ? supabase.storage.from('images').getPublicUrl(meta.storage_path as string).data.publicUrl
        : metaUrl(meta)
      
      if (imageUrl) {
        return <ImageThumbnail src={imageUrl} alt={el.content || 'Image'} caption={el.content || undefined} />
      }
      return <div className={styles.imagePlaceholder}>Image</div>
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

    return el.content ? <ExpandableText text={el.content} className={styles.thoughtText} lines={4} /> : null
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
          <h1 className={styles.title}>Jots</h1>
          <span className={styles.count}>{elements.length} {elements.length === 1 ? 'item' : 'items'}</span>
        </header>

        {/* Quick Add */}
        <div className={styles.quickAdd}>
          <input
            ref={quickAddRef}
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleQuickAdd() } }}
            onPaste={handlePaste}
            placeholder="Add a thought, link..."
            className={styles.quickAddInput}
          />
          <div className={styles.quickAddActions}>
            {quickAdd.trim() && (
              <button onClick={handleQuickAdd} className={styles.postBtn}>Post</button>
            )}
            <div className={styles.menuWrapper} ref={addOptionsRef}>
              <button className={styles.moreBtn} onClick={() => setShowAddOptions(!showAddOptions)}>•••</button>
              {showAddOptions && (
                <div className={styles.dropMenu}>
                  {isMobile && (
                    <button className={styles.dropMenuItem} onClick={() => { setShowAddOptions(false); cameraInputRef.current?.click() }}>Take Photo</button>
                  )}
                  <button className={styles.dropMenuItem} onClick={() => { setShowAddOptions(false); imageInputRef.current?.click() }}>Add Image</button>
                  <button className={styles.dropMenuItem} onClick={() => { setShowAddOptions(false); fileInputRef.current?.click() }}>Add File</button>
                </div>
              )}
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.csv,.ppt,.pptx,.zip" style={{ display: 'none' }} onChange={handleFileSelected} />
          <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelected} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileSelected} />
        </div>

        {elements.length === 0 ? (
          <div className={styles.empty}>
            <p>Nothing here yet.</p>
            <p className={styles.muted}>Drop in thoughts, links, images — anything that catches your eye.</p>
          </div>
        ) : (
          <div className={styles.elementList}>
            {elements.map((el) => (
              <div key={el.id} className={styles.element}>
                <div className={styles.elementMeta}>{getMetaString(el)}</div>
                
                {/* Content - show editor or content */}
                {editingContentId === el.id ? (
                  <div className={styles.contentEditor}>
                    <textarea
                      value={contentDraft}
                      onChange={(e) => setContentDraft(e.target.value)}
                      className={styles.contentTextarea}
                      autoFocus
                    />
                    <div className={styles.contentActions}>
                      <button onClick={cancelEditContent} className={styles.cancelBtn}>Cancel</button>
                      <button onClick={() => saveContent(el)} className={styles.saveBtn}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.elementContent}>{renderElementContent(el)}</div>
                )}

                {/* Note display */}
                {typeof el.metadata?.note === 'string' && editingNoteId !== el.id && editingContentId !== el.id && (
                  <div className={styles.noteDisplay}>
                    {el.metadata.note}
                  </div>
                )}

                {/* Note editing */}
                {editingNoteId === el.id && (
                  <div className={styles.noteEditor}>
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Add a note..."
                      className={styles.noteTextarea}
                      autoFocus
                    />
                    <div className={styles.noteActions}>
                      <button onClick={cancelEditNote} className={styles.cancelBtn}>Cancel</button>
                      <button onClick={() => saveNote(el)} className={styles.saveBtn}>Save</button>
                    </div>
                  </div>
                )}

                {/* Mini-spark results */}
                {typeof el.metadata?.summary === 'string' && (
                  <div className={styles.miniSparkResult}>
                    <div className={styles.miniSparkLabel}>⚡ Summary</div>
                    <div className={styles.miniSparkContent}>{el.metadata.summary}</div>
                  </div>
                )}

                {/* Action bar — hidden when editing */}
                {editingNoteId !== el.id && editingContentId !== el.id && (
                  <div className={styles.actionBar}>
                    <div className={styles.actionBarLeft}>
                      <button onClick={() => startEditNote(el)} className={styles.actionBtn}>
                        {el.metadata?.note ? 'Edit note' : '+ Add note'}
                      </button>
                      {(el.source !== 'ai' || el.type === 'scout') && !el.metadata?.summary && (
                        <button 
                          onClick={() => fireMiniSpark(el)} 
                          disabled={miniSparkLoading !== null}
                          className={`${styles.actionBtn} ${styles.miniSparkBtn}`}
                        >
                          {miniSparkLoading === `summarize-${el.id}` ? <span className={styles.miniSparkThinking}>Thinking...</span> : '⚡ Summarize'}
                        </button>
                      )}
                    </div>
                    <div className={styles.menuWrapper}>
                      <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === el.id ? null : el.id) }} className={styles.moreBtn}>•••</button>
                      {openMenuId === el.id && (
                        <div className={styles.dropMenu}>
                          {el.type === 'thought' && el.source === 'user' && (
                            <button className={styles.dropMenuItem} onClick={() => { setOpenMenuId(null); startEditContent(el) }}>Edit</button>
                          )}
                          <button className={styles.dropMenuItem} onClick={() => setSendPickerFor(el.id)}>Send to Idea</button>
                          <div className={styles.dropMenuDivider} />
                          <button className={`${styles.dropMenuItem} ${styles.dangerItem}`} onClick={() => setConfirmDeleteId(el.id)}>Delete</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ===== SEND TO IDEA MODAL ===== */}
      {sendPickerFor && (
        <>
          <div className={styles.overlay} onClick={() => { setSendPickerFor(null); setOpenMenuId(null) }} />
          <div className={styles.destModal}>
            <div className={styles.destModalHeader}>
              <span className={styles.destModalTitle}>Send to Idea</span>
              <button onClick={() => { setSendPickerFor(null); setOpenMenuId(null) }} className={styles.closeBtn}>✕</button>
            </div>
            <div className={styles.destList}>
              {ideas.length === 0 ? (
                <p className={styles.muted} style={{ padding: '20px', textAlign: 'center' }}>No active ideas. Create one first.</p>
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

      {/* Delete Confirm */}
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

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}