import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.jpg'],
      manifest: {
        name: 'Aperitivo Manager',
        short_name: 'Aperitivo',
        description: 'Gestione operativa tavoli e prenotazioni',
        theme_color: '#ffffff',
        // Usa il logo esistente come icona finché non si generano i PNG dedicati.
        icons: [
          {
            src: 'logo.jpg',
            sizes: '192x192',
            type: 'image/jpeg'
          },
          {
            src: 'logo.jpg',
            sizes: '512x512',
            type: 'image/jpeg'
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
})
