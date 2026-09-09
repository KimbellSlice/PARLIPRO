import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Separate from vite.config.js (which currently has an unrelated broken
// dependency — vite-plugin-html-prerender is referenced but not installed)
// so `npm run test` doesn't depend on that being fixed to run at all.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
})
