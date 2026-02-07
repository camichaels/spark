'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import styles from './scouts.module.css'

export default function ScoutsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [hasInterests, setHasInterests] = useState(false)

  useEffect(() => {
    checkSetup()
  }, [])

  async function checkSetup() {
    // TODO: Check if user has set up interests
    // For now, always show setup
    setHasInterests(false)
    setLoading(false)
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
          <h1 className={styles.title}>Scouts</h1>
        </header>

        <div className={styles.placeholder}>
          <p className={styles.placeholderTitle}>Coming soon</p>
          <p className={styles.placeholderDesc}>
            Scouts will surface interesting provocations and trends for you to explore — 
            helping you discover ideas worth developing.
          </p>
        </div>
      </main>
    </div>
  )
}