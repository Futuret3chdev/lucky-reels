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
      protocolImports: true,
      // Polyfill everything needed for Solana libraries
      include: ['buffer', 'process', 'util'],
    }),
  ],
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
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
    'global.process': 'process',
    'global': 'globalThis',
  },
})
