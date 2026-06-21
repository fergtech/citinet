import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'icons/*.svg', 'favicon.ico'],

      manifest: {
        name: 'citinet - Local Mesh Network',
        short_name: 'citinet',
        description: 'Community-owned mesh network platform. Decentralized, local, secure.',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],

        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'citinet-pages-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7
              }
            }
          },
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'citinet-external-images-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'citinet-google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'citinet-google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\.(?:js|css|woff2?)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'citinet-static-resources',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ],

        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true
      },

      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    port: 3001,
    host: '0.0.0.0',
    strictPort: false,
    allowedHosts: true,
    // Pre-transform key source files at startup so the first page hit is instant.
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/app/App.tsx',
        './src/app/context/HubContext.tsx',
        './src/app/services/hubService.ts',
        './src/app/components/Dashboard.tsx',
        './src/app/components/WelcomeScreen.tsx',
      ],
    },
  },
  optimizeDeps: {
    // Pre-bundle ALL production deps at dev-server startup.
    // Without this, Vite discovers and bundles each package lazily on first
    // import — this creates hundreds of sequential HTTP requests and stalls
    // the browser for 20-40 s on first load (especially bad over LAN).
    include: [
      // React core
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',

      // Radix UI (used throughout — every primitive is a separate package)
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',

      // TipTap rich-text editor (8 packages; @tiptap/pm excluded — no top-level export)
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/extension-image',
      '@tiptap/extension-link',
      '@tiptap/extension-placeholder',
      '@tiptap/extension-task-item',
      '@tiptap/extension-task-list',
      '@tiptap/extension-underline',
      '@tiptap/extension-youtube',

      // MUI + Emotion (heaviest chunk — must be pre-bundled)
      '@mui/material',
      '@mui/icons-material',
      '@emotion/react',
      '@emotion/styled',

      // Map
      'leaflet',
      'react-leaflet',

      // Charts
      'recharts',

      // Icons
      'lucide-react',

      // Animation
      'motion',

      // Carousel / drag-and-drop
      'react-slick',
      'embla-carousel-react',
      'react-dnd',
      'react-dnd-html5-backend',

      // UI utilities
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
      'cmdk',
      'sonner',
      'vaul',
      'next-themes',
      'input-otp',
      'react-resizable-panels',
      'react-popper',
      '@popperjs/core',
      'react-responsive-masonry',

      // Forms / dates
      'react-hook-form',
      'react-day-picker',
      'date-fns',

      // QR
      'qrcode.react',
    ],
    // slick-carousel has a CJS UMD wrapper that requires jQuery at bundle-time.
    // Excluding it lets Vite skip pre-bundling; react-slick handles it fine at runtime.
    exclude: ['slick-carousel'],
  },
})
