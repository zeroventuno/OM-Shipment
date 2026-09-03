import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import Layout from './components/layout/Layout'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'

// Carregadas sob demanda: tiram recharts e xlsx do bundle inicial.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const NewShipment = lazy(() => import('./pages/NewShipment'))
const Reports = lazy(() => import('./pages/Reports'))

function PageFallback() {
    return (
        <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
    )
}

function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <Layout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
                <Route path="new-shipment" element={<Suspense fallback={<PageFallback />}><NewShipment /></Suspense>} />
                <Route path="new-shipment/:id" element={<Suspense fallback={<PageFallback />}><NewShipment /></Suspense>} />
                <Route path="reports" element={<Suspense fallback={<PageFallback />}><Reports /></Suspense>} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    )
}

export default App
