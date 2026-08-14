import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        }
      }
    },
    minify: 'esbuild',
    sourcemap: false,
  }
<<<<<<< HEAD
})
=======
})
>>>>>>> c5d06c8 (perf: optimize build config)
