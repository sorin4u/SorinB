import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.jsx'

// Register the service worker only for production builds (preview/real deployment).
// In dev, a previously-installed SW can cause confusing caching/port errors.
if (import.meta.env.PROD) {
  registerSW({
    immediate: true,
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,





)

