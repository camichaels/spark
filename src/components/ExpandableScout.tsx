'use client'

import { useState } from 'react'
import styles from './ExpandableScout.module.css'

type DeeperResult = {
  lens: string
  content: string
}

type Props = {
  title: string
  expanded?: string
  deeperResults?: DeeperResult[]
}

export default function ExpandableScout({ title, expanded, deeperResults }: Props) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const hasMore = !!expanded || (deeperResults && deeperResults.length > 0)

  return (
    <div className={styles.scout}>
      {/* Always show title */}
      <div className={styles.title}>{title}</div>
      
      {hasMore && (
        <>
          {isExpanded && (
            <div className={styles.details}>
              {/* Expanded context */}
              {expanded && (
                <div className={styles.expanded}>
                  {expanded.split('\n\n').map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              )}
              
              {/* Deeper results */}
              {deeperResults && deeperResults.length > 0 && (
                <div className={styles.deeperResults}>
                  {deeperResults.map((deeper, idx) => (
                    <div key={idx} className={styles.deeperItem}>
                      <div className={styles.deeperLabel}>⚡ {deeper.lens}</div>
                      <div className={styles.deeperContent}>
                        {deeper.content.split('\n\n').map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          <button 
            className={styles.toggle}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        </>
      )}
    </div>
  )
}