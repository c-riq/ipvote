import { defineConfig } from 'vite'
import * as path from 'path'
import type { Connect } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  publicDir: 'public',
  root: '.',
  plugins: [{
    name: 'spa-fallback',
    configureServer(server) {
      server.middlewares.use((req: Connect.IncomingMessage, res, next) => {
        if (req.url?.includes('.')) {
          return next()
        }
        req.url = '/index.html'
        next()
      })
    }
  }]
}) 