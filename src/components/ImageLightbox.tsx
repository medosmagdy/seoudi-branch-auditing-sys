"use client"

import { useState } from "react"

type ImageLightboxProps = {
  src: string
  alt: string
  className?: string
  imageClassName?: string
}

export function ImageLightbox({ src, alt, className, imageClassName }: ImageLightboxProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative block overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className ?? ""}`}
        aria-label={`تكبير ${alt}`}
      >
        <img
          src={src}
          alt={alt}
          className={`transition-transform duration-200 group-hover:scale-105 ${imageClassName ?? ""}`}
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-center text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          اضغط للتكبير
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="عرض الصورة بالحجم الكامل"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-2 text-xl text-white hover:bg-white/25"
            aria-label="إغلاق الصورة"
          >
            ×
          </button>
          <img
            src={src}
            alt={alt}
            className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
