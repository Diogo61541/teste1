import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isGithubActions = process.env.GITHUB_ACTIONS === 'true'

export default defineConfig({
  // Relative base in CI avoids broken asset URLs on GitHub Pages.
  base: isGithubActions ? './' : '/evolucao/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
})
