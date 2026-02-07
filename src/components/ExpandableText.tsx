'use client'

import { useState, useRef, useEffect } from 'react'
import styles from './ExpandableText.module.css'

type ExpandableTextProps = {
  text: string
  lines?: number
  className?: string
}

export default function ExpandableText({ text, lines = 4, className = '' }: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isTruncated, setIsTruncated] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = textRef.current
    if (!el) return

    // Check if text is actually truncated
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight)
    const maxHeight = lineHeight * lines
    setIsTruncated(el.scrollHeight > maxHeight + 2) // +2 for rounding tolerance
  }, [text, lines])

  return (
    <div className={styles.wrapper}>
      <div
        ref={textRef}
        className={`${className} ${styles.text} ${!isExpanded && isTruncated ? styles.truncated : ''}`}
        style={!isExpanded && isTruncated ? { WebkitLineClamp: lines } : undefined}
      >
        {text}
      </div>
      {isTruncated && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={styles.toggle}
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
