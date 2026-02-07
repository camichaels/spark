'use client'

import { useEffect } from 'react'

export default function ThemeInitializer() {
  useEffect(() => {
    const savedTheme = localStorage.getItem('spark-theme') || 'default'
    const savedDark = localStorage.getItem('spark-dark') === 'true'
    if (savedDark) document.documentElement.setAttribute('data-mode', 'dark')
    if (savedTheme !== 'default') document.documentElement.setAttribute('data-theme', savedTheme)
  }, [])

  return null
}