'use client'

import { useState, useEffect, useRef, use } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import styles from './idea.module.css'
import ImageThumbnail from '@/components/ImageThumbnail'
import ExpandableText from '@/components/ExpandableText'
import { buildMiniSparkPrompt, buildElementContext } from '@/lib/prompts'

type Idea = {
  id: string
  title: string
  current_thinking: string | null
  current_thinking_updated_at: string | null
  status: string
  created_at: string
  updated_at: string
}

type Element = {
  id: string
  type: string
  source: string
  content: string | null
  metadata: Record<string, unknown>
  is_archived: boolean
  created_at: string
}

type ConfirmDialog = {
  message: string
  subtext?: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
} | null

// ── Helpers: read metadata with legacy fallback ──
// Canonical keys: url, filename
// Legacy keys (from older data): public_url, file_name
function metaUrl(meta: Record<string, unknown>): string | undefined {
  return (meta?.url || meta?.public_url) as string | undefined
}

function metaFilename(meta: Record<string, unknown>): string {
  return (meta?.filename || meta?.file_name || 'File') as string
}

function getDomain(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace('www.', '')
  } catch {
    return url
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

function titleFromUrlPath(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/$/, '').split('/').pop() || ''
    if (!path || path === '') return getDomain(url)
    // Strip common file extensions
    const cleaned = path.replace(/\.(html|htm|php|asp|aspx|shtml)$/i, '')
    // Replace hyphens/underscores with spaces, title case each word
    const words = cleaned.replace(/[-_]/g, ' ').split(/\s+/)
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  } catch {
    return url
  }
}

export default function IdeaView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [idea, setIdea] = useState<Idea | null>(null)
  const [elements, setElements] = useState<Element[]>([])
  const [archivedElements, setArchivedElements] = useState<Element[]>([])
  const [loading, setLoading] = useState(true)

  // Quick Add
  const [quickAdd, setQuickAdd] = useState('')
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [pastedImage, setPastedImage] = useState<File | null>(null)
  const [pastedImagePreview, setPastedImagePreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Current Thinking editing
  const [editingThinking, setEditingThinking] = useState(false)
  const [thinkingDraft, setThinkingDraft] = useState('')

  // Idea header menu
  const [showIdeaMenu, setShowIdeaMenu] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  // Sparks
  const [sparkLoading, setSparkLoading] = useState<string | null>(null)
  const [showCustom, setShowCustom] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')

  // Notes
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  // Content editing (for user thoughts)
  const [editingContentId, setEditingContentId] = useState<string | null>(null)
  const [contentDraft, setContentDraft] = useState('')

  // Element ••• menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // Mini-spark loading
  const [miniSparkLoading, setMiniSparkLoading] = useState<string | null>(null)

  // Archive section
  const [showArchive, setShowArchive] = useState(false)

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null)

  // Mobile detection
  const [mobile, setMobile] = useState(false)
  useEffect(() => { setMobile(isMobile()) }, [])

  useEffect(() => {
    loadIdea()
    loadElements()
    loadArchivedElements()
  }, [id])

  // Close menus on outside click
  useEffect(() => {
    function handleOutsideClick(e: Event) {
      const target = e.target as HTMLElement
      if (!target.closest(`.${styles.menuWrapper}`)) {
        setShowAddMenu(false)
        setOpenMenuId(null)
        setShowIdeaMenu(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('touchstart', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('touchstart', handleOutsideClick)
    }
  }, [])

  async function loadIdea() {
    const { data } = await supabase
      .from('ideas')
      .select('*')
      .eq('id', id)
      .single()

    if (data) {
      setIdea(data)
      setThinkingDraft(data.current_thinking || '')
      setTitleDraft(data.title)
    }
    setLoading(false)
  }

  async function loadElements() {
    const { data } = await supabase
      .from('elements')
      .select('*')
      .eq('idea_id', id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    if (data) setElements(data)
  }

  async function loadArchivedElements() {
    const { data } = await supabase
      .from('elements')
      .select('*')
      .eq('idea_id', id)
      .eq('is_archived', true)
      .order('created_at', { ascending: false })
    if (data) setArchivedElements(data)
  }

  async function saveThinking() {
    if (!idea) return
    const now = new Date().toISOString()
    await supabase
      .from('ideas')
      .update({ current_thinking: thinkingDraft, current_thinking_updated_at: now })
      .eq('id', idea.id)
    setIdea({ ...idea, current_thinking: thinkingDraft, current_thinking_updated_at: now })
    setEditingThinking(false)
  }

  async function saveTitle() {
    if (!idea || !titleDraft.trim()) return
    await supabase.from('ideas').update({ title: titleDraft.trim() }).eq('id', idea.id)
    setIdea({ ...idea, title: titleDraft.trim() })
    setEditingTitle(false)
  }

  const isArchived = idea?.status === 'archived'

  async function unarchiveIdea() {
    if (!idea) return
    // Check active count
    const { count } = await supabase
      .from('ideas')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')

    if ((count || 0) >= 5) {
      alert('You already have 5 active Ideas. Archive one first to make room.')
      return
    }

    await supabase.from('ideas').update({ status: 'active' }).eq('id', idea.id)
    setIdea({ ...idea, status: 'active' })
  }

  async function archiveIdea() {
    if (!idea) return
    setConfirmDialog({
      message: 'Archive this idea?',
      subtext: 'You can find it later in your archived ideas.',
      confirmLabel: 'Archive',
      onConfirm: async () => {
        await supabase.from('ideas').update({ status: 'archived' }).eq('id', idea.id)
        setConfirmDialog(null)
        router.push('/')
      },
    })
  }

  async function deleteIdea() {
    if (!idea) return
    setConfirmDialog({
      message: 'Delete this idea?',
      subtext: 'This will delete all elements and cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        await supabase.from('elements').delete().eq('idea_id', idea.id)
        await supabase.from('ideas').delete().eq('id', idea.id)
        setConfirmDialog(null)
        router.push('/')
      },
    })
  }

  async function getUserId() {
    const { data: session } = await supabase.auth.getSession()
    return session?.session?.user?.id || null
  }

  async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || null
  }

  async function handleQuickAdd() {
    if (!idea) return

    // If there's a pasted image, post that
    if (pastedImage) {
      await uploadFile(pastedImage)
      cancelPastedImage()
      return
    }

    if (!quickAdd.trim()) return
    const userId = await getUserId()
    if (!userId) return

    const content = quickAdd.trim()
    const urlPattern = /^(https?:\/\/|www\.)/i
    const isUrl = urlPattern.test(content)

    if (isUrl) {
      const url = content.startsWith('http') ? content : `https://${content}`
      const domain = getDomain(content)

      const { data: el, error } = await supabase
        .from('elements')
        .insert({
          idea_id: idea.id, user_id: userId,
          type: 'article', source: 'user', content: null,
          metadata: { url, domain },
        })
        .select().single()

      if (!error && el) {
        setQuickAdd('')
        loadElements()

        // Fetch metadata in background
        try {
          const res = await fetch('/api/url-meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          })
          const meta = await res.json()
          if (meta.title || meta.description) {
            await supabase
              .from('elements')
              .update({ metadata: { url, domain, title: meta.title, description: meta.description } })
              .eq('id', el.id)
            loadElements()
          }
        } catch { /* metadata fetch failed */ }
      }
    } else {
      const { error } = await supabase
        .from('elements')
        .insert({
          idea_id: idea.id, user_id: userId,
          type: 'thought', source: 'user',
          content: content, metadata: {},
        })
      if (!error) { setQuickAdd(''); loadElements() }
    }
  }

  async function uploadFile(file: File) {
    if (!idea) return
    const userId = await getUserId()
    if (!userId) return

    const filePath = `${userId}/${idea.id}/${Date.now()}-${file.name}`

    const isImage = file.type.startsWith('image/')
    // UNIFIED: non-image bucket is 'files' (not 'documents')
    const bucket = isImage ? 'images' : 'files'

    console.log('[Spark] Uploading file:', file.name, 'type:', file.type, 'size:', file.size, 'bucket:', bucket)

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('[Spark] Upload error:', uploadError)
      alert(`Upload failed: ${uploadError.message}. Check that your Supabase "${bucket}" storage bucket exists and allows this file type.`)
      return
    }

    console.log('[Spark] Upload successful:', bucket, filePath)

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath)

    const elType = isImage ? 'image' : 'file'

    // UNIFIED: canonical keys — url, filename, bucket
    const { error } = await supabase
      .from('elements')
      .insert({
        idea_id: idea.id, user_id: userId,
        type: elType, source: 'user', content: null,
        metadata: {
          bucket,
          storage_path: filePath,
          url: urlData.publicUrl,
          filename: file.name,
          file_type: file.type,
        },
      })

    if (error) {
      console.error('[Spark] Element insert error:', error.message, error.details, error.hint, error.code)
    } else {
      console.log('[Spark] Element created, type:', elType)
      loadElements()
    }
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) await uploadFile(file)
    e.target.value = ''
    setShowAddMenu(false)
  }

  // Handle paste events for images from clipboard
  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          const namedFile = new File([file], `pasted-${Date.now()}.png`, { type: file.type })
          // Show preview instead of uploading immediately
          setPastedImage(namedFile)
          const previewUrl = URL.createObjectURL(namedFile)
          setPastedImagePreview(previewUrl)
        }
        return
      }
    }
    // If no image in clipboard, let the default paste happen (text)
  }

  function cancelPastedImage() {
    if (pastedImagePreview) URL.revokeObjectURL(pastedImagePreview)
    setPastedImage(null)
    setPastedImagePreview(null)
  }

  async function fireSpark(type: string, prompt?: string) {
    if (!idea) return
    setSparkLoading(type)
    const token = await getAccessToken()
    if (!token) return

    try {
      const res = await fetch('/api/spark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ideaId: idea.id, sparkType: type, customPrompt: prompt }),
      })
      if (res.ok) { setCustomPrompt(''); setShowCustom(false); loadElements() }
    } catch (err) { console.error('Spark error:', err) }
    finally { setSparkLoading(null) }
  }

  async function fireMiniSpark(el: Element, type: 'summarize') {
    if (!idea) return
    const loadingKey = `${type}-${el.id}`
    setMiniSparkLoading(loadingKey)
    const token = await getAccessToken()
    if (!token) return

    const hasBody = !!el.content
    const hasDescription = !!el.metadata?.description
    const isArticle = el.type === 'article'
    const isFile = el.type === 'file'
    const isImage = el.type === 'image'

    // Determine what context we actually have
    const hasLimitedContext = isArticle && !hasBody && !hasDescription

    // Read with legacy fallback helpers
    const elUrl = metaUrl(el.metadata)
    const elFilename = metaFilename(el.metadata)

    // Use centralized helpers
    const elementContext = buildElementContext(
      { content: el.content, type: el.type, metadata: el.metadata },
      elUrl,
      elFilename
    )
    const prompt = buildMiniSparkPrompt(type, elementContext, hasLimitedContext)

    // Build request — include attachment info for files and images
    const requestBody: Record<string, unknown> = {
      ideaId: idea.id,
      sparkType: 'mini',
      customPrompt: prompt,
    }

    if ((isFile || isImage) && elUrl) {
      requestBody.attachment = {
        url: elUrl,
        type: isImage ? 'image' : 'file',
        file_type: el.metadata.file_type,
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
        const updatedMetadata = { ...el.metadata }
        if (type === 'summarize') {
          updatedMetadata.summary = data.content
        } else {
          updatedMetadata.related = data.content
        }
        await supabase.from('elements').update({ metadata: updatedMetadata }).eq('id', el.id)
        loadElements()
      }
    } catch (err) { console.error('Mini spark error:', err) }
    finally { setMiniSparkLoading(null) }
  }

  function startEditNote(el: Element) {
    setEditingNoteId(el.id)
    setNoteDraft((el.metadata?.note as string) || '')
  }

  async function saveNote(el: Element) {
    const updatedMetadata = { ...el.metadata }
    if (noteDraft.trim()) { updatedMetadata.note = noteDraft.trim() }
    else { delete updatedMetadata.note }
    await supabase.from('elements').update({ metadata: updatedMetadata }).eq('id', el.id)
    setEditingNoteId(null); setNoteDraft(''); loadElements()
  }

  function startEditContent(el: Element) {
    setEditingContentId(el.id)
    setContentDraft(el.content || '')
  }

  async function saveContent(el: Element) {
    if (!contentDraft.trim()) return
    await supabase.from('elements').update({ content: contentDraft.trim() }).eq('id', el.id)
    setEditingContentId(null)
    setContentDraft('')
    loadElements()
  }

  function cancelEditContent() {
    setEditingContentId(null)
    setContentDraft('')
  }

  async function archiveElement(el: Element) {
    await supabase.from('elements').update({ is_archived: true }).eq('id', el.id)
    setOpenMenuId(null); loadElements(); loadArchivedElements()
  }

  async function unarchiveElement(el: Element) {
    await supabase.from('elements').update({ is_archived: false }).eq('id', el.id)
    loadElements(); loadArchivedElements()
  }

  async function deleteElement(el: Element) {
    setConfirmDialog({
      message: 'Delete this element?',
      subtext: 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        await supabase.from('elements').delete().eq('id', el.id)
        setOpenMenuId(null); setConfirmDialog(null)
        loadElements(); loadArchivedElements()
      },
    })
  }

  function getArticleDisplayTitle(el: Element): string {
    // Use fetched title if available
    if (el.metadata?.title) return el.metadata.title as string
    // Fall back to cleaned-up URL path
    const url = metaUrl(el.metadata)
    if (!url) return 'Untitled article'
    return titleFromUrlPath(url)
  }

  function renderElementContent(el: Element) {
    // Read URLs and filenames with legacy fallback
    const elUrl = metaUrl(el.metadata)
    const elFilename = metaFilename(el.metadata)

    if (el.type === 'article' && elUrl) {
      const title = getArticleDisplayTitle(el)
      const description = el.metadata.description as string | null
      return (
        <div>
          <a href={elUrl} target="_blank" rel="noopener noreferrer" className={styles.articleTitleLink}>
            {title}
          </a>
          {description && <ExpandableText text={description} className={styles.articleDescription} lines={3} />}
        </div>
      )
    }

    if (el.type === 'image') {
      let imageUrl = elUrl
      // Fallback: try to reconstruct from storage_path
      if (!imageUrl && el.metadata?.storage_path) {
        const bucket = (el.metadata.bucket as string) || 'images'
        imageUrl = supabase.storage.from(bucket).getPublicUrl(el.metadata.storage_path as string).data.publicUrl
      }
      if (imageUrl) {
        return <ImageThumbnail src={imageUrl} alt="" />
      }
    }

    if (el.type === 'file') {
      let fileUrl = elUrl
      // Fallback: reconstruct URL from storage_path
      if (!fileUrl && el.metadata?.storage_path) {
        const bucket = (el.metadata.bucket as string) || 'files'
        fileUrl = supabase.storage.from(bucket).getPublicUrl(el.metadata.storage_path as string).data.publicUrl
      }
      if (fileUrl) {
        return (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className={styles.fileCard}>
            <span className={styles.fileIcon}>📄</span>
            <span className={styles.fileName}>{elFilename}</span>
            <span className={styles.fileAction}>Open ↗</span>
          </a>
        )
      }
    }

    // Scout content (from Scouts page)
    if (el.type === 'scout') {
      const meta = el.metadata || {}
      const deeperResults = meta.deeper_results as Array<{ lens: string; content: string }> | undefined
      const scoutTitle = el.content ?? ''
      return (
        <>
          {/* Main provocation */}
          <div className={styles.scoutTitle}>{scoutTitle}</div>
          
          {/* Expanded context */}
          {meta.expanded && (
            <div className={styles.scoutExpanded}>
              {String(meta.expanded).split('\n\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
          
          {/* Deeper results */}
          {deeperResults && deeperResults.length > 0 && (
            <div className={styles.scoutDeeperResults}>
              {deeperResults.map((deeper, idx) => (
                <div key={idx} className={styles.scoutDeeperItem}>
                  <div className={styles.scoutDeeperLabel}>⚡ {deeper.lens}</div>
                  <div className={styles.scoutDeeperContent}>
                    {deeper.content.split('\n\n').map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )
    }

    // Default: thought text with expandable
    return el.content ? <ExpandableText text={el.content} className={styles.elementContent} lines={4} /> : null
  }

  function renderSparkLabel(el: Element): string {
    const sparkType = (el.metadata?.spark_type as string || 'response').replace(/^\w/, c => c.toUpperCase())
    return `⚡ Spark · ${sparkType}`
  }

  if (loading) return <div className={styles.loading}></div>
  if (!idea) return <div className={styles.loading}>Idea not found</div>

  const isSparkBusy = sparkLoading !== null

  return (
    <div className={styles.page}>
      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className={styles.overlay} onClick={() => setConfirmDialog(null)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <p className={styles.dialogMessage}>{confirmDialog.message}</p>
            {confirmDialog.subtext && <p className={styles.dialogSubtext}>{confirmDialog.subtext}</p>}
            <div className={styles.dialogActions}>
              <button onClick={() => setConfirmDialog(null)} className={styles.dialogCancel}>Cancel</button>
              <button
                onClick={confirmDialog.onConfirm}
                className={confirmDialog.danger ? styles.dialogDanger : styles.dialogConfirm}
              >{confirmDialog.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className={styles.nav}>
        <button onClick={() => router.push('/')} className={styles.backBtn}>← Home</button>
        {isArchived ? (
          <div className={styles.archivedNavActions}>
            <span className={styles.archivedBadge}>Archived</span>
            <div className={styles.menuWrapper}>
              <button onClick={(e) => { e.stopPropagation(); setShowIdeaMenu(!showIdeaMenu) }} className={styles.moreBtn}>•••</button>
              {showIdeaMenu && (
                <div className={styles.dropMenu}>
                  <button className={styles.dropMenuItem} onClick={() => { setShowIdeaMenu(false); unarchiveIdea() }}>Restore idea</button>
                  <div className={styles.dropMenuDivider} />
                  <button className={`${styles.dropMenuItem} ${styles.dangerItem}`} onClick={() => { setShowIdeaMenu(false); deleteIdea() }}>Delete idea</button>
                </div>
              )}
            </div>
          </div>
        ) : (
        <div className={styles.menuWrapper}>
          <button onClick={(e) => { e.stopPropagation(); setShowIdeaMenu(!showIdeaMenu) }} className={styles.moreBtn}>•••</button>
          {showIdeaMenu && (
            <div className={styles.dropMenu}>
              <button className={styles.dropMenuItem} onClick={() => { setShowIdeaMenu(false); setEditingTitle(true) }}>Edit title</button>
              <button className={styles.dropMenuItem} onClick={() => { setShowIdeaMenu(false); archiveIdea() }}>Archive idea</button>
              <div className={styles.dropMenuDivider} />
              <button className={`${styles.dropMenuItem} ${styles.dangerItem}`} onClick={() => { setShowIdeaMenu(false); deleteIdea() }}>Delete idea</button>
            </div>
          )}
        </div>
        )}
      </nav>

      <main className={styles.container}>
        {/* Header */}
        <header className={styles.header}>
          {editingTitle ? (
            <div className={styles.titleEdit}>
              <input type="text" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                className={styles.titleInput} autoFocus />
              <div className={styles.editActions}>
                <button onClick={() => { setEditingTitle(false); setTitleDraft(idea.title) }} className={styles.cancelBtn}>Cancel</button>
                <button onClick={saveTitle} className={styles.saveBtn}>Save</button>
              </div>
            </div>
          ) : (
            <h1 className={styles.title}>{idea.title}</h1>
          )}
          <div className={styles.headerMeta}>
            Started {formatDate(idea.created_at)} · {elements.length} element{elements.length !== 1 ? 's' : ''}
          </div>
        </header>

        {/* Current Thinking */}
        <section className={styles.thinking}>
          <div className={styles.thinkingHeader}>
            <span className={styles.sectionLabel}>
              Current Thinking
              {idea.current_thinking_updated_at && (
                <span className={styles.updatedAt}> · Updated {formatDate(idea.current_thinking_updated_at)}</span>
              )}
            </span>
          </div>
          {editingThinking ? (
            <div>
              <textarea value={thinkingDraft} onChange={(e) => setThinkingDraft(e.target.value)}
                className={styles.thinkingTextarea} autoFocus placeholder="What's your current thinking on this idea?" />
              <div className={styles.editActions}>
                <button onClick={() => { setEditingThinking(false); setThinkingDraft(idea.current_thinking || '') }} className={styles.cancelBtn}>Cancel</button>
                <button onClick={saveThinking} className={styles.saveBtn}>Save</button>
              </div>
            </div>
          ) : (
            <div onClick={() => setEditingThinking(true)} className={styles.thinkingContent}>
              {idea.current_thinking ? (
                idea.current_thinking.split('\n\n').map((p, i) => <p key={i}>{p}</p>)
              ) : (
                <p className={styles.placeholder}>Tap to add your current thinking...</p>
              )}
            </div>
          )}
        </section>

        {/* Spark Bar */}
        <div className={styles.sparkBar}>
          <div className={styles.sparkLabel}>⚡ Spark It</div>
          <div className={styles.sparkButtons}>
            <button onClick={() => fireSpark('synthesize')} disabled={isSparkBusy} className={styles.sparkBtn}>Synthesize</button>
            <button onClick={() => fireSpark('challenge')} disabled={isSparkBusy} className={styles.sparkBtn}>Challenge me</button>
            <button onClick={() => fireSpark('expand')} disabled={isSparkBusy} className={styles.sparkBtn}>Expand</button>
            <button onClick={() => setShowCustom(!showCustom)} disabled={isSparkBusy}
              className={`${styles.sparkBtn} ${showCustom ? styles.sparkBtnActive : ''}`}>Ask anything</button>
          </div>
          {showCustom && (
            <div className={styles.customSpark}>
              <input type="text" value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && customPrompt.trim() && fireSpark('custom', customPrompt)}
                placeholder="What do you want to explore?" className={styles.customInput} autoFocus />
              <button onClick={() => fireSpark('custom', customPrompt)} disabled={!customPrompt.trim()} className={styles.customSend}>⚡</button>
            </div>
          )}
          {isSparkBusy && (
            <div className={styles.sparkThinking}><span className={styles.sparkThinkingDot}>⚡</span> Thinking...</div>
          )}
        </div>

        {/* Quick Add */}
        <div className={styles.quickAdd}>
          <input
            type="text"
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickAdd() } }}
            onPaste={handlePaste}
            placeholder={pastedImage ? '' : 'Add a thought, link...'}
            className={styles.quickAddInput}
          />
          {(quickAdd.trim() || pastedImage) && (
            <button onClick={handleQuickAdd} className={styles.postBtn}>Post</button>
          )}
          <div className={styles.menuWrapper}>
            <button onClick={(e) => { e.stopPropagation(); setShowAddMenu(!showAddMenu) }} className={styles.moreBtn}>•••</button>
            {showAddMenu && (
              <div className={styles.dropMenu}>
                {mobile && (
                  <button className={styles.dropMenuItem} onClick={() => { cameraInputRef.current?.click(); setShowAddMenu(false) }}>
                    Take Photo
                  </button>
                )}
                <button className={styles.dropMenuItem} onClick={() => { photoInputRef.current?.click(); setShowAddMenu(false) }}>
                  Add Image
                </button>
                <button className={styles.dropMenuItem} onClick={() => { fileInputRef.current?.click(); setShowAddMenu(false) }}>
                  Add File
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Pasted image preview */}
        {pastedImagePreview && (
          <div className={styles.pastedPreview}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pastedImagePreview} alt="Pasted" className={styles.pastedImage} />
            <button onClick={cancelPastedImage} className={styles.pastedRemove}>✕</button>
          </div>
        )}
        <input ref={photoInputRef} type="file" accept="image/*" onChange={handleFileInput} style={{ display: 'none' }} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileInput} style={{ display: 'none' }} />
        <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.csv,.ppt,.pptx,.zip" onChange={handleFileInput} style={{ display: 'none' }} />

        {/* Timeline */}
        {elements.length > 0 && (
          <section>
            <div className={styles.timelineHeader}><span className={styles.sectionLabel}>Timeline</span></div>
            <div className={styles.timeline}>
              {elements.map((el) => (
                <div key={el.id} className={`${styles.element} ${el.source === 'ai' ? styles.sparkElement : ''}`}>
                  <div className={styles.elementMeta}>
                    <span className={el.source === 'ai' ? styles.sparkType : styles.elType}>
                      {el.source === 'ai' ? renderSparkLabel(el) : el.type.charAt(0).toUpperCase() + el.type.slice(1)}
                    </span>
                    {el.type === 'article' && !!el.metadata?.domain && (
                      <><span className={styles.metaDot}>·</span><span>{String(el.metadata.domain)}</span></>
                    )}
                    {el.type === 'scout' && !!el.metadata?.zone && (
                      <><span className={styles.metaDot}>·</span><span>{String(el.metadata.zone)}</span></>
                    )}
                    <span className={styles.metaDot}>·</span>
                    <span>{formatDate(el.created_at)}</span>
                  </div>

                  {el.source === 'ai' && !!el.metadata?.prompt && (
                    <div className={styles.customPromptDisplay}>&ldquo;{String(el.metadata.prompt)}&rdquo;</div>
                  )}

                  {/* Content - editable for user thoughts */}
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

                  {!!el.metadata?.summary && (
                    <div className={styles.miniSparkResult}>
                      <div className={styles.miniSparkLabel}>⚡ Summary</div>
                      <div className={styles.miniSparkText}>{String(el.metadata.summary)}</div>
                    </div>
                  )}

                  {!!el.metadata?.related && (
                    <div className={styles.miniSparkResult}>
                      <div className={styles.miniSparkLabel}>⚡ Related</div>
                      <div className={styles.miniSparkText}>{String(el.metadata.related)}</div>
                    </div>
                  )}

                  {!!el.metadata?.note && editingNoteId !== el.id && (
                    <div className={styles.noteDisplay}>
                      {String(el.metadata.note)}
                    </div>
                  )}

                  {editingNoteId === el.id && (
                    <div className={styles.noteEditor}>
                      <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
                        className={styles.noteTextarea} placeholder="What do you think about this?" autoFocus />
                      <div className={styles.noteActions}>
                        <button onClick={() => { setEditingNoteId(null); setNoteDraft('') }} className={styles.cancelBtn}>Cancel</button>
                        <button onClick={() => saveNote(el)} className={styles.saveBtn}>Save</button>
                      </div>
                    </div>
                  )}

                  {editingNoteId !== el.id && editingContentId !== el.id && (
                    <div className={styles.actionBar}>
                      <div className={styles.actionBarLeft}>
                        <button onClick={() => startEditNote(el)} className={styles.actionBtn}>
                          {!!el.metadata?.note ? 'Edit note' : '+ Add note'}
                        </button>
                        {el.source !== 'ai' && (
                          <>
                            {!el.metadata?.summary && (
                              <button onClick={() => fireMiniSpark(el, 'summarize')} disabled={miniSparkLoading !== null}
                                className={`${styles.actionBtn} ${styles.miniSparkBtn}`}>
                                {miniSparkLoading === `summarize-${el.id}` ? <span className={styles.miniSparkThinking}>Thinking...</span> : '⚡ Summarize'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <div className={styles.menuWrapper}>
                        <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === el.id ? null : el.id) }} className={styles.moreBtn}>•••</button>
                        {openMenuId === el.id && (
                          <div className={styles.dropMenu}>
                            {el.type === 'thought' && el.source === 'user' && (
                              <button className={styles.dropMenuItem} onClick={() => { setOpenMenuId(null); startEditContent(el) }}>Edit</button>
                            )}
                            <button className={styles.dropMenuItem} onClick={() => archiveElement(el)}>Archive</button>
                            <div className={styles.dropMenuDivider} />
                            <button className={`${styles.dropMenuItem} ${styles.dangerItem}`} onClick={() => deleteElement(el)}>Delete</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Archive */}
        {archivedElements.length > 0 && (
          <section className={styles.archiveSection}>
            <button onClick={() => setShowArchive(!showArchive)} className={styles.archiveToggle}>
              <span className={`${styles.archiveChevron} ${showArchive ? styles.archiveChevronOpen : ''}`}>▸</span>
              {' '}Archived ({archivedElements.length})
            </button>
            {showArchive && (
              <div className={styles.archiveList}>
                {archivedElements.map((el) => (
                  <div key={el.id} className={styles.archivedElement}>
                    <div className={styles.elementMeta}>
                      <span className={el.source === 'ai' ? styles.sparkType : styles.elType}>
                        {el.source === 'ai' ? renderSparkLabel(el) : el.type.charAt(0).toUpperCase() + el.type.slice(1)}
                      </span>
                      {el.type === 'article' && !!el.metadata?.domain && (
                        <><span className={styles.metaDot}>·</span><span>{String(el.metadata.domain)}</span></>
                      )}
                      {el.type === 'scout' && !!el.metadata?.zone && (
                        <><span className={styles.metaDot}>·</span><span>{String(el.metadata.zone)}</span></>
                      )}
                      <span className={styles.metaDot}>·</span>
                      <span>{formatDate(el.created_at)}</span>
                    </div>
                    <div className={styles.elementContent}>{renderElementContent(el)}</div>
                    {!!el.metadata?.note && <div className={styles.noteDisplay}>{String(el.metadata.note)}</div>}
                    <div className={styles.archiveActions}>
                      <button onClick={() => unarchiveElement(el)} className={styles.actionBtn}>Restore to idea</button>
                      <button onClick={() => deleteElement(el)} className={`${styles.actionBtn} ${styles.dangerAction}`}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}