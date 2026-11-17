import { Suspense, lazy, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import Layout from '@/components/layout/Layout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import Login from '@/pages/Login'
import ResetPassword from '@/pages/ResetPassword'

// Carregadas sob demanda: cada área só baixa o próprio código.
const ShipmentsDashboard = lazy(() => import('@/modules/shipments/pages/Dashboard'))
const NewShipment = lazy(() => import('@/modules/shipments/pages/NewShipment'))
const Reports = lazy(() => import('@/modules/shipments/pages/Reports'))
const AssistancePage = lazy(() => import('@/modules/assistance/AssistancePage'))
const WarrantiesPage = lazy(() => import('@/modules/warranties/WarrantiesPage'))
const TicketDetailPage = lazy(() => import('@/modules/assistance/TicketDetailPage'))
const WarrantyDetailPage = lazy(() => import('@/modules/warranties/WarrantyDetailPage'))
const RequestsPage = lazy(() => import('@/modules/requests/RequestsPage'))
const CustomersPage = lazy(() => import('@/modules/customers/CustomersPage'))
const CustomerDetailPage = lazy(() => import('@/modules/customers/CustomerDetailPage'))
const ContactsPage = lazy(() => import('@/modules/contacts/ContactsPage'))
// Relatório anual: página inteira (sem menu), feita para imprimir/salvar em PDF.
const ReportPage = lazy(() => import('@/modules/report/ReportPage'))
// Formulário público de pedido de envio: fora do login (link com token).
const RequestFormPage = lazy(() => import('@/modules/requests/RequestFormPage'))

function PageFallback() {
    return (
        <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
    )
}

const page = (element: ReactNode) => <Suspense fallback={<PageFallback />}>{element}</Suspense>

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/pedido/:token" element={page(<RequestFormPage />)} />
            <Route path="/report" element={<ProtectedRoute>{page(<ReportPage />)}</ProtectedRoute>} />

            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <Layout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<Navigate to="/shipments" replace />} />

                <Route path="shipments" element={page(<ShipmentsDashboard />)} />
                <Route path="shipments/new" element={page(<NewShipment />)} />
                <Route path="shipments/reports" element={page(<Reports />)} />
                <Route path="shipments/requests" element={page(<RequestsPage />)} />
                <Route path="shipments/:id" element={page(<NewShipment />)} />

                <Route path="assistance" element={page(<AssistancePage />)} />
                <Route path="assistance/:id" element={page(<TicketDetailPage />)} />
                <Route path="warranties" element={page(<WarrantiesPage />)} />
                <Route path="warranties/:id" element={page(<WarrantyDetailPage />)} />

                <Route path="customers" element={page(<CustomersPage />)} />
                <Route path="customers/:id" element={page(<CustomerDetailPage />)} />
                <Route path="contacts" element={page(<ContactsPage />)} />

                {/* Endereços antigos do OM-Shipment, para favoritos continuarem funcionando */}
                <Route path="dashboard" element={<Navigate to="/shipments" replace />} />
                <Route path="new-shipment" element={<Navigate to="/shipments/new" replace />} />
                <Route path="reports" element={<Navigate to="/shipments/reports" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}
