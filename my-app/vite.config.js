import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'


export default defineConfig({
  plugins: [react()],
  base: '/schedule-extractor/',
  server: {
    allowedHosts: [
      'aashir-schedule-extractinator-3000.loca.lt' 
    ]
  }
})
