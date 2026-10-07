import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mba-desk/i18n/browser'
import '@mba-desk/web-shared/styles.css'
import { App } from './App'
import { ThemeProvider } from '@mba-desk/ui'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element not found')
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
