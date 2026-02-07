'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import styles from './home.module.css'

const MAX_ACTIVE_IDEAS = 5

type Idea = {
  id: string
  title: string
  status: string
  created_at: string
  updated_at: string
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [ideasLoaded, setIdeasLoaded] = useState(false)
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [archivedIdeas, setArchivedIdeas] = useState<Idea[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [inboxCount, setInboxCount] = useState(0)
  const [drawerCount, setDrawerCount] = useState(0)
  const router = useRouter()

  // ••• Menu
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Modals
  const [showAbout, setShowAbout] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  // Settings state
  const [currentTheme, setCurrentTheme] = useState('default')
  const [darkMode, setDarkMode] = useState(false)

  // Auth
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [authError, setAuthError] = useState('')

  // Quick Capture
  const [captureText, setCaptureText] = useState('')
  const captureRef = useRef<HTMLTextAreaElement>(null)
  const [showAddOptions, setShowAddOptions] = useState(false)
  const captureFileRef = useRef<HTMLInputElement>(null)
  const captureImageRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Staged file (image or file attached but not yet posted)
  const [stagedFile, setStagedFile] = useState<{ file: File; previewUrl?: string; type: 'image' | 'file' } | null>(null)

  // Mobile detection (for "Take photo" option)
  const [isMobile, setIsMobile] = useState(false)

  // Destination modal (post-tap)
  const [showDestPicker, setShowDestPicker] = useState(false)
  const [pendingCapture, setPendingCapture] = useState<{
    content: string
    type: string
    metadata: Record<string, unknown>
    file?: File
  } | null>(null)

  // Toast
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }

  // Close header ••• menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    if (showMenu) document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showMenu])

  // Detect mobile/touch device for "Take photo" option
  useEffect(() => {
    const check = () => setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('spark-theme') || 'default'
    const savedDark = localStorage.getItem('spark-dark') === 'true'
    setCurrentTheme(savedTheme)
    setDarkMode(savedDark)
    if (savedDark) document.documentElement.setAttribute('data-mode', 'dark')
    if (savedTheme !== 'default') document.documentElement.setAttribute('data-theme', savedTheme)
  }, [])

  function switchTheme(themeId: string) {
    setCurrentTheme(themeId)
    localStorage.setItem('spark-theme', themeId)
    if (themeId === 'default') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', themeId)
    }
  }

  function toggleDarkMode() {
    const next = !darkMode
    setDarkMode(next)
    localStorage.setItem('spark-dark', String(next))
    if (next) {
      document.documentElement.setAttribute('data-mode', 'dark')
    } else {
      document.documentElement.removeAttribute('data-mode')
    }
  }

  // Auth check + load
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) {
      loadIdeas()
      loadArchivedIdeas()
      loadCounts()
    }
  }, [user])

  async function loadIdeas() {
    const { data } = await supabase
      .from('ideas')
      .select('*')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .order('sort_order', { ascending: true })
    if (data) setIdeas(data)
    setIdeasLoaded(true)
  }

  async function loadArchivedIdeas() {
    const { data } = await supabase
      .from('ideas')
      .select('*')
      .eq('user_id', user!.id)
      .eq('status', 'archived')
      .order('updated_at', { ascending: false })
    if (data) setArchivedIdeas(data)
  }

  async function loadCounts() {
    const { count: inbox } = await supabase
      .from('elements')
      .select('*', { count: 'exact', head: true })
      .is('idea_id', null)
      .eq('is_archived', false)
      .or('metadata->>drawer.is.null,metadata->>drawer.neq.true')
    setInboxCount(inbox || 0)

    const { count: drawer } = await supabase
      .from('elements')
      .select('*', { count: 'exact', head: true })
      .is('idea_id', null)
      .eq('is_archived', false)
      .eq('metadata->>drawer', 'true')
    setDrawerCount(drawer || 0)
  }

  // Sorted ideas for the destination picker: alphabetized by title
  function getSortedIdeas(): Idea[] {
    return [...ideas].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    )
  }

  // Truncate idea title for the picker
  function truncateTitle(title: string, max = 30): string {
    if (title.length <= max) return title
    return title.slice(0, max).trimEnd() + '…'
  }

  // Quick capture: hit Post → open destination picker modal
  function handlePostTap() {
    if (!user) return

    // If a file/image is staged, use that
    if (stagedFile) {
      setPendingCapture({
        content: stagedFile.file.name,
        type: stagedFile.type,
        metadata: {},
        file: stagedFile.file,
      })
      // Clean up preview URL
      if (stagedFile.previewUrl) URL.revokeObjectURL(stagedFile.previewUrl)
      setStagedFile(null)
      setShowDestPicker(true)
      return
    }

    // Otherwise need text
    if (!captureText.trim()) return

    const content = captureText.trim()
    const urlPattern = /^(https?:\/\/|www\.)/i
    const isUrl = urlPattern.test(content)

    setPendingCapture({
      content,
      type: isUrl ? 'article' : 'thought',
      metadata: isUrl ? { url: content } : {},
    })
    setShowDestPicker(true)
  }

  // Actually send to chosen destination
  async function sendToDestination(target: string) {
    if (!pendingCapture || !user) return

    const elementData: Record<string, unknown> = {
      user_id: user.id,
      type: pendingCapture.type,
      source: 'user',
      content: pendingCapture.content,
      metadata: { ...pendingCapture.metadata },
      is_archived: false,
    }

    if (target === 'drawer') {
      elementData.idea_id = null
      elementData.metadata = { ...(elementData.metadata as object), drawer: 'true' }
    } else if (target === 'inbox') {
      elementData.idea_id = null
      // Inbox items have no drawer flag and no idea_id
    } else {
      elementData.idea_id = target
    }

    // Handle file/image uploads
    if (pendingCapture.file) {
      const file = pendingCapture.file
      const filePath = `${user.id}/${Date.now()}-${file.name}`
      const bucket = pendingCapture.type === 'image' ? 'images' : 'files'

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file)

      if (uploadError) {
        showToast('Upload failed')
        return
      }

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath)

      // UNIFIED: canonical keys — url, filename, bucket
      elementData.metadata = {
        ...(elementData.metadata as object),
        bucket,
        filename: file.name,
        file_size: file.size,
        file_type: file.type,
        storage_path: filePath,
        url: urlData.publicUrl,
      }
      elementData.content = file.name
    }

    const { error } = await supabase.from('elements').insert(elementData)

    if (!error) {
      let targetName: string
      if (target === 'drawer') {
        targetName = 'Drawer'
      } else if (target === 'inbox') {
        targetName = 'Inbox'
      } else {
        targetName = ideas.find(i => i.id === target)?.title || 'Idea'
      }

      setCaptureText('')
      setPendingCapture(null)
      setShowDestPicker(false)
      if (captureRef.current) {
        captureRef.current.style.height = 'auto'
      }
      showToast(`Added to ${truncateTitle(targetName)}`)
      loadCounts()
    }
  }

  function cancelDestPicker() {
    setShowDestPicker(false)
    setPendingCapture(null)
  }

  function clearStagedFile() {
    if (stagedFile?.previewUrl) URL.revokeObjectURL(stagedFile.previewUrl)
    setStagedFile(null)
  }

  // ••• menu: file upload — stage file for review before posting
  function handleCaptureFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setShowAddOptions(false)

    const isImage = file.type.startsWith('image/')
    const previewUrl = isImage ? URL.createObjectURL(file) : undefined

    // Clean up old preview
    if (stagedFile?.previewUrl) URL.revokeObjectURL(stagedFile.previewUrl)
    setStagedFile({ file, previewUrl, type: isImage ? 'image' : 'file' })

    // Reset file input
    e.target.value = ''
  }

  // ••• menu: image upload — stage image for review before posting
  function handleCaptureImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setShowAddOptions(false)

    const previewUrl = URL.createObjectURL(file)

    // Clean up old preview
    if (stagedFile?.previewUrl) URL.revokeObjectURL(stagedFile.previewUrl)
    setStagedFile({ file, previewUrl, type: 'image' })

    e.target.value = ''
  }

  // Clipboard paste handler
  function handleCapturePaste(e: React.ClipboardEvent) {
    // Check for pasted images — stage them for review, don't auto-post
    const items = e.clipboardData?.items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault()
          const file = items[i].getAsFile()
          if (file) {
            const named = new File([file], `pasted-image-${Date.now()}.png`, { type: file.type })
            const previewUrl = URL.createObjectURL(named)

            // Clean up old preview
            if (stagedFile?.previewUrl) URL.revokeObjectURL(stagedFile.previewUrl)
            setStagedFile({ file: named, previewUrl, type: 'image' })
          }
          return
        }
      }
    }

    // Text paste: let it go through normally, URL detection happens on Post
  }

  // ••• menu: Paste link from clipboard
  async function handlePasteLinkOption() {
    setShowAddOptions(false)
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setCaptureText(text)
        if (captureRef.current) {
          captureRef.current.focus()
          captureRef.current.style.height = 'auto'
          captureRef.current.style.height = captureRef.current.scrollHeight + 'px'
        }
      }
    } catch {
      // Clipboard permission denied — focus the textarea so user can Ctrl+V
      captureRef.current?.focus()
    }
  }

  async function deleteAccount() {
    if (!confirm('This will permanently delete your account and all data. This cannot be undone. Are you sure?')) return
    await supabase.auth.signOut()
    alert('To complete account deletion, please contact hello@sparkit.app. You have been signed out.')
  }

  async function createIdea() {
    if (!newTitle.trim() || !user) return
    if (ideas.length >= MAX_ACTIVE_IDEAS) {
      alert(`You can have up to ${MAX_ACTIVE_IDEAS} active Ideas. Archive one to make room.`)
      return
    }
    const { data, error } = await supabase
      .from('ideas')
      .insert({ title: newTitle.trim(), user_id: user.id })
      .select()
      .single()
    if (data) {
      setNewTitle('')
      setShowNew(false)
      router.push(`/idea/${data.id}`)
    }
    if (error) console.error(error)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setAuthError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setAuthError(error.message)
    else setSent(true)
  }

  // Loading
  if (loading) {
    return <div className={styles.center}><p className={styles.muted}></p></div>
  }

  // Sign in
  if (!user) {
    if (sent) {
      return (
        <div className={styles.center}>
          <h2>Check your email</h2>
          <p className={styles.muted}>We sent a magic link to <strong>{email}</strong></p>
        </div>
      )
    }
    return (
      <div className={styles.auth}>
        <h1 className={styles.logo}>⚡ Spark</h1>
        <p className={styles.muted}>Sign in with your email</p>
        <form onSubmit={handleLogin} className={styles.form}>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={styles.input}
          />
          <button type="submit" className={styles.primaryBtn}>
            Send magic link
          </button>
        </form>
        {authError && <p className={styles.error}>{authError}</p>}
      </div>
    )
  }

  // Still loading ideas
  if (!ideasLoaded) {
    return <div className={styles.center}><p className={styles.muted}></p></div>
  }

  // Home screen
  return (
    <div className={styles.container}>
      {/* Header: ⚡ Spark ... ••• */}
      <header className={styles.header}>
        <h1 className={styles.appTitle}>⚡ Spark</h1>
        <div className={styles.menuWrapper} ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
            className={styles.menuBtn}
          >•••</button>
          {showMenu && (
            <div className={styles.dropMenu}>
              <button className={styles.dropMenuItem} onClick={() => { setShowMenu(false); setShowAbout(true) }}>About</button>
              <button className={styles.dropMenuItem} onClick={() => { setShowMenu(false); setShowSettingsModal(true) }}>Settings</button>
              <div className={styles.dropMenuDivider} />
              <button className={styles.dropMenuItem} onClick={() => { setShowMenu(false); setShowSignOutConfirm(true) }}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      {/* Ideas — title + count + new on same row */}
      <div className={styles.ideasHeader}>
        <h2 className={styles.sectionTitle}>Ideas</h2>
        <div className={styles.ideasActions}>
          <span className={styles.count}>{ideas.length}/{MAX_ACTIVE_IDEAS}</span>
          <button
            onClick={() => setShowNew(true)}
            className={styles.newBtn}
            disabled={ideas.length >= MAX_ACTIVE_IDEAS}
          >+ New</button>
        </div>
      </div>

      {showNew && (
        <div className={styles.newIdea}>
          <input
            type="text"
            placeholder="What are you thinking about?"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createIdea()}
            autoFocus
            className={styles.newIdeaInput}
          />
          <div className={styles.newIdeaActions}>
            <button onClick={() => { setShowNew(false); setNewTitle('') }} className={styles.cancelBtn}>Cancel</button>
            <button onClick={createIdea} className={styles.createBtn}>Create</button>
          </div>
        </div>
      )}

      {ideas.length === 0 && !showNew ? (
        <div className={styles.empty}>
          <p>No ideas yet.</p>
          <p className={styles.muted}>Start by creating your first Idea — a question or topic you want to develop.</p>
        </div>
      ) : (
        <div className={styles.ideaList}>
          {ideas.map((idea) => (
            <div
              key={idea.id}
              className={styles.ideaCard}
              onClick={() => router.push(`/idea/${idea.id}`)}
            >
              <h3 className={styles.ideaTitle}>{idea.title}</h3>
              <span className={styles.ideaDate}>
                {new Date(idea.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Quick Capture — below Ideas, above nav buttons */}
      <div className={styles.capture}>
        {/* Staged file preview */}
        {stagedFile && (
          <div className={styles.stagedPreview}>
            {stagedFile.type === 'image' && stagedFile.previewUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={stagedFile.previewUrl} alt="Preview" className={styles.stagedImage} />
            ) : (
              <div className={styles.stagedFileCard}>
                <span className={styles.stagedFileExt}>
                  {stagedFile.file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                </span>
                <span className={styles.stagedFileName}>{stagedFile.file.name}</span>
              </div>
            )}
            <button onClick={clearStagedFile} className={styles.stagedRemove}>✕</button>
          </div>
        )}
        <textarea
          ref={captureRef}
          value={captureText}
          onChange={(e) => {
            setCaptureText(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handlePostTap()
            }
          }}
          onPaste={handleCapturePaste}
          placeholder={stagedFile ? "Add a caption (optional)..." : "Capture a thought, paste a link..."}
          className={styles.captureInput}
          rows={1}
        />
        <div className={styles.captureActions}>
          {(captureText.trim() || stagedFile) && (
            <button onClick={handlePostTap} className={styles.capturePost}>Post</button>
          )}
          <button
            onClick={() => setShowAddOptions(true)}
            className={styles.captureMore}
            title="Attach file or image"
          >•••</button>
        </div>
        {/* Hidden file inputs */}
        <input
          ref={captureFileRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleCaptureFileSelect}
        />
        <input
          ref={captureImageRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleCaptureImageSelect}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleCaptureImageSelect}
        />
      </div>

      {/* ••• Add Options Modal — centered overlay, text-only */}
      {showAddOptions && (
        <>
          <div className={styles.overlay} onClick={() => setShowAddOptions(false)} />
          <div className={styles.addOptionsModal}>
            <button className={styles.addOption} onClick={() => { setShowAddOptions(false); captureImageRef.current?.click() }}>Choose image</button>
            <button className={styles.addOption} onClick={() => { setShowAddOptions(false); captureFileRef.current?.click() }}>Add file</button>
            <button className={styles.addOption} onClick={handlePasteLinkOption}>Paste link</button>
            {isMobile && (
              <button className={styles.addOption} onClick={() => { setShowAddOptions(false); cameraInputRef.current?.click() }}>Take photo</button>
            )}
            <button className={styles.addOptionCancel} onClick={() => setShowAddOptions(false)}>Cancel</button>
          </div>
        </>
      )}

      {/* Inbox · Drawer — outlined pill buttons */}
      <div className={styles.secondaryNav}>
        <button className={styles.pillBtn} onClick={() => router.push('/inbox')}>
          Inbox{inboxCount > 0 && <span className={styles.pillCountMuted}>{inboxCount}</span>}
        </button>
        <button className={styles.pillBtn} onClick={() => router.push('/drawer')}>
          Drawer{drawerCount > 0 && <span className={styles.pillCountMuted}>{drawerCount}</span>}
        </button>
      </div>

      {/* Archived Ideas — simplified: just clickable cards, no inline actions */}
      {archivedIdeas.length > 0 && (
        <div className={styles.archiveSection}>
          <button
            className={styles.archiveToggle}
            onClick={() => setShowArchived(!showArchived)}
          >
            <span className={styles.archiveLabel}>
              <span className={`${styles.chevron} ${showArchived ? styles.chevronOpen : ''}`}>▶</span>
              Archived ({archivedIdeas.length})
            </span>
          </button>
          {showArchived && (
            <div className={styles.archivedList}>
              {archivedIdeas.map((idea) => (
                <div
                  key={idea.id}
                  className={styles.archivedCard}
                  onClick={() => router.push(`/idea/${idea.id}`)}
                >
                  <span className={styles.archivedTitle}>{idea.title}</span>
                  <span className={styles.archivedDate}>
                    {new Date(idea.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== DESTINATION PICKER MODAL ===== */}
      {showDestPicker && (
        <>
          <div className={styles.overlay} onClick={cancelDestPicker} />
          <div className={styles.destModal}>
            <div className={styles.destModalHeader}>
              <span className={styles.destModalTitle}>Where does this go?</span>
              <button onClick={cancelDestPicker} className={styles.closeBtn}>✕</button>
            </div>
            <div className={styles.destList}>
              {getSortedIdeas().map((idea) => (
                <button
                  key={idea.id}
                  className={styles.destItem}
                  onClick={() => sendToDestination(idea.id)}
                >
                  {truncateTitle(idea.title)}
                </button>
              ))}
              <div className={styles.destDivider} />
              <button
                className={styles.destItem}
                onClick={() => sendToDestination('inbox')}
              >
                Inbox
              </button>
              <button
                className={styles.destItem}
                onClick={() => sendToDestination('drawer')}
              >
                Drawer
              </button>
            </div>
          </div>
        </>
      )}

      {/* ===== MODALS ===== */}

      {/* About Modal */}
      {showAbout && (
        <>
          <div className={styles.overlay} onClick={() => setShowAbout(false)} />
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>About Spark</h2>
              <button onClick={() => setShowAbout(false)} className={styles.closeBtn}>✕</button>
            </div>
            <div className={styles.aboutBody}>
              <p className={styles.aboutDesc}>
                Spark is a tool for developing your thinking. It's not a notebook. Not a chatbot. 
                It's a partner that helps challenge, connect, and expand your ideas.
              </p>
              <p className={styles.aboutSubhead}>How to use Spark</p>
              <p className={styles.aboutDesc}>
                Start with a question or idea you want to develop. Write your current thinking at 
                the top — this is your evolving thesis, in your words.
              </p>
              <p className={styles.aboutDesc}>
                Add elements below: thoughts, links, images, PDFs. These are inputs that inform 
                your thinking, not an exhaustive collection.
              </p>
              <p className={styles.aboutDesc}>
                When you're ready, spark it. AI will challenge your assumptions, surface patterns, 
                or suggest new directions — but it won't give you answers. Every response ends 
                with a question back to you.
              </p>
              <p className={styles.aboutDesc}>
                The goal isn't AI-generated insight. It's your insight, sharpened by friction.
              </p>
            </div>
            <button onClick={() => setShowAbout(false)} className={styles.gotItBtn}>Got it</button>
          </div>
        </>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <>
          <div className={styles.overlay} onClick={() => setShowSettingsModal(false)} />
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Settings</h2>
              <button onClick={() => setShowSettingsModal(false)} className={styles.closeBtn}>✕</button>
            </div>

            <div className={styles.settingsGroup}>
              <label className={styles.settingsLabel}>Theme</label>
              <div className={styles.themeOptions}>
                {[
                  { id: 'default', name: 'Ember', color: '#D97B0D' },
                  { id: 'sage', name: 'Sage', color: '#3D7A5F' },
                  { id: 'dusk', name: 'Dusk', color: '#7B5A9E' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => switchTheme(t.id)}
                    className={`${styles.themeBtn} ${currentTheme === t.id ? styles.themeBtnActive : ''}`}
                  >
                    <span className={styles.themeDot} style={{ background: t.color }} />
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.settingsGroup}>
              <div className={styles.settingsRow}>
                <label className={styles.settingsLabel}>Dark mode</label>
                <button
                  onClick={toggleDarkMode}
                  className={`${styles.toggle} ${darkMode ? styles.toggleOn : ''}`}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
            </div>

            <div className={styles.settingsGroup}>
              <label className={styles.settingsLabel}>Account</label>
              <p className={styles.accountEmail}>{user?.email}</p>
              <button onClick={deleteAccount} className={styles.dangerLink}>Delete account</button>
            </div>
          </div>
        </>
      )}

      {/* Sign Out Confirm */}
      {showSignOutConfirm && (
        <>
          <div className={styles.overlay} onClick={() => setShowSignOutConfirm(false)} />
          <div className={styles.dialog}>
            <p className={styles.dialogMessage}>Sign out?</p>
            <p className={styles.dialogSubtext}>You can sign back in anytime with your email.</p>
            <div className={styles.dialogActions}>
              <button onClick={() => setShowSignOutConfirm(false)} className={styles.dialogCancel}>Cancel</button>
              <button onClick={() => supabase.auth.signOut()} className={styles.dialogConfirm}>Sign out</button>
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