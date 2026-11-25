import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from './lib/queries.js'
import { ToastProvider } from './components/ui.jsx'
import { RootLayout } from './components/Layout.jsx'
import NotFound from './pages/NotFound.jsx'
import './index.css'

const queryClient = createQueryClient()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<RootLayout />}>
              {/* Landing, auth and app routes are added in the next stages. */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
