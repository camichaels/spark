'use client'

import { useState } from 'react'
import styles from './ImageThumbnail.module.css'

type ImageThumbnailProps = {
  src: string
  alt?: string
  caption?: string
}

export default function ImageThumbnail({ src, alt = '', caption }: ImageThumbnailProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Thumbnail */}
      <div className={styles.thumbnailWrapper} onClick={() => setIsOpen(true)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={styles.thumbnail} />
        <div className={styles.expandHint}>Click to expand</div>
      </div>
      {caption && <div className={styles.caption}>{caption}</div>}

      {/* Lightbox */}
      {isOpen && (
        <div className={styles.lightbox} onClick={() => setIsOpen(false)}>
          <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>✕</button>
          <div className={styles.imageContainer} onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className={styles.fullImage} />
          </div>
        </div>
      )}
    </>
  )
}
