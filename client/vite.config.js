import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const DEPLOYED_API = 'https://splitly-0qy4.onrender.com'

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Dev proxy target: the deployed API by default; set API_PROXY_TARGET=http://localhost:4000 for a local server.
  const target = env.API_PROXY_TARGET || DEPLOYED_API

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: true,
          // The production API sets `Secure; SameSite=None` cookies. Through the proxy the
          // browser sees http://localhost, so relax them to a normal first-party cookie.
          configure: (proxy) => {
            proxy.on('proxyRes', (res) => {
              const cookies = res.headers['set-cookie']
              if (!cookies) return
              res.headers['set-cookie'] = cookies.map((c) =>
                c.replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=None/gi, '; SameSite=Lax'),
              )
            })
          },
        },
      },
    },
    build: {
      rollupOptions: {
        output: { manualChunks: chunkFor },
      },
    },
  }
})
