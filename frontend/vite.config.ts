import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        // Conserva /api y el Origin del navegador para la comprobación CSRF.
        changeOrigin: false,
      },
    },
  },
})
