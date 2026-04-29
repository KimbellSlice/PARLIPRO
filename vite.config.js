import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { htmlPrerender } from 'vite-plugin-html-prerender'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    htmlPrerender({
      staticDir: path.join(__dirname, 'dist'),
      routes: ['/'],
    })
  ],
})
