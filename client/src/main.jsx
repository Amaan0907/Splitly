import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from './lib/queries.js'
import { ToastProvider } from './components/ui.jsx'
import { RootLayout } from './components/Layout.jsx'
import NotFound from './pages/NotFound.jsx'
import Auth from './pages/Auth.jsx'
import './index.css'

const Landing = lazy(() => import('./pages/Landing.jsx'))

const queryClient = createQueryClient()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<RootLayout />}>
              <Route
                index
                element={
                  <Suspense fallback={null}>
                    <Landing />
                  </Suspense>
                }
              />
              <Route path="/login" element={<Auth mode="login" />} />
              <Route path="/register" element={<Auth mode="register" />} />
              {/* App routes are added in the next stages. */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
