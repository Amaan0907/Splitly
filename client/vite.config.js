import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const CHUNKS = {
  react: ['react', 'react-dom', 'react-router', 'scheduler'],
  query: ['@tanstack'],
  motion: ['motion', 'framer-motion', 'motion-dom', 'motion-utils'],
  scroll: ['gsap', '@gsap', 'lenis'],
}

function chunkFor(id) {
  if (!id.includes('node_modules')) return undefined
  const path = id.split('node_modules/').pop()
  const pkg = path.split('/')[0] // scoped packages match on their scope, e.g. '@tanstack'
  for (const [chunk, pkgs] of Object.entries(CHUNKS)) {
    if (pkgs.includes(pkg)) return chunk
  }
  return undefined
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: chunkFor },
    },
  },
})
