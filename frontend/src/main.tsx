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
import { Replay } from './pages/Replay'
import { Traces } from './pages/Traces'
import { Review } from './pages/Review'
import { NeedHelp } from './components/NeedHelp'
import './styles/index.css'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 45_000, refetchOnWindowFocus: false } } })

createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><Routes><Route path="/" element={<Landing />} /><Route path="/login" element={<Auth />} /><Route element={<ProtectedRoute />}><Route path="/app" element={<AppLayout />}><Route index element={<Playground />} /><Route path="dashboard" element={<Dashboard />} /><Route path="pipeline-replay" element={<Replay />} /><Route path="traces" element={<Traces />} /><Route path="review" element={<Review />} /></Route></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes><NeedHelp /></AuthProvider></BrowserRouter></QueryClientProvider></StrictMode>)
