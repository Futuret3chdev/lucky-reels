import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Buffer } from 'buffer'

// Make Buffer available globally for Solana libraries
;(window as any).Buffer = Buffer
;(globalThis as any).Buffer = Buffer

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
