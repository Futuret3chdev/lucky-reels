import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    nodePolyfills({
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true,
      // We specifically need Buffer for @solana/web3.js and @solana/spl-token
      include: ['buffer'],
    }),
  ],
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
  define: {
    'global.Buffer': 'globalThis.Buffer',
  },
})
