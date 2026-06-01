import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('framer-motion')) return 'vendor-framer';
          if (id.includes('@solana/web3.js')) return 'vendor-solana';
          if (id.includes('sonner') || id.includes('lucide-react') || id.includes('canvas-confetti')) {
            return 'vendor-ui';
          }
        },
      },
    },
  },
})
