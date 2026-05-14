import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './client/error-boundary.tsx'
import { logger } from './client/logger.ts'
import { registerTestBridge } from './test-bridge'

if (import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_BRIDGE === "true") {
  registerTestBridge();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary
      onError={(error, info) => {
        logger.capture(error, "COMPONENT_RENDER_ERROR");
      }}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
