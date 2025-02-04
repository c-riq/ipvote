import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

const isAnalyze = process.env.ANALYZE === 'true'

export default defineConfig({
  plugins: [
    react(),
    isAnalyze && visualizer({
      filename: 'dist/stats.html', // Output file
      open: true,                  // Automatically open stats page after build
      gzipSize: true,             // Show gzip sizes
      brotliSize: true,           // Show brotli sizes
      template: 'treemap'         // Use treemap visualization (alternatives: 'sunburst', 'network')
    })
  ].filter(Boolean), // Filter out false values
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', '@mui/material', 'mapbox-gl'],
        }
      }
    }
  }
})
