import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'aashir-schedule-extractinator-3000.loca.lt' // your LocalTunnel URL
    ]
  }
})
