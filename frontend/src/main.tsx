import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerTestBridge } from './test-bridge'

if (import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_BRIDGE === "true") {
  registerTestBridge();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
