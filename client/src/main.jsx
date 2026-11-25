import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { createQueryClient } from './lib/queries.js'
import { ToastProvider } from './components/ui.jsx'
import { AppLayout, RootLayout } from './components/Layout.jsx'
import NotFound from './pages/NotFound.jsx'
import Auth from './pages/Auth.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Group from './pages/Group.jsx'
import './index.css'

const Landing = lazy(() => import('./pages/Landing.jsx'))

const queryClient = createQueryClient()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Under prefers-reduced-motion, Motion skips transform/layout animation everywhere. */}
    <MotionConfig reducedMotion="user">
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
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/groups/:id" element={<Group />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
)
