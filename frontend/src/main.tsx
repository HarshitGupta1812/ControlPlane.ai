import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/context'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { Landing } from './pages/Landing'
import { Auth } from './pages/Auth'
import { AppLayout } from './pages/AppLayout'
import { Playground } from './pages/Playground'
import { Dashboard } from './pages/Dashboard'
import { LivePipeline } from './pages/LivePipeline'
import { Replay } from './pages/Replay'
import { Policies } from './pages/Policies'
import { Traces } from './pages/Traces'
import { Review } from './pages/Review'
import { Settings } from './pages/Settings'
import './styles/index.css'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 45_000, refetchOnWindowFocus: false } } })

createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><Routes><Route path="/" element={<Landing />} /><Route path="/login" element={<Auth />} /><Route element={<ProtectedRoute />}><Route path="/app" element={<AppLayout />}><Route index element={<Playground />} /><Route path="dashboard" element={<Dashboard />} /><Route path="pipeline" element={<LivePipeline />} /><Route path="replay" element={<Replay />} /><Route path="policies" element={<Policies />} /><Route path="traces" element={<Traces />} /><Route path="review" element={<Review />} /><Route path="settings" element={<Settings />} /></Route></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes></AuthProvider></BrowserRouter></QueryClientProvider></StrictMode>)
