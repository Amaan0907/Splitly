import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-xl font-extrabold tracking-tight text-ink">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect width="22" height="22" rx="6" fill="#1C2238" />
        <rect x="5" y="12" width="5" height="3.5" rx="1" fill="#B23A3F" />
        <rect x="12" y="6.5" width="5" height="3.5" rx="1" fill="#0E7A5C" />
        <rect x="10.25" y="4" width="1.5" height="14" rx=".75" fill="#FFFFFF" />
      </svg>
      Splitly
    </span>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <main className="grid min-h-svh place-items-center bg-paper">
      <Wordmark />
    </main>
  </StrictMode>,
)
