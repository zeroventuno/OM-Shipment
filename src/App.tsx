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
const ImportDocs = lazy(() => import('@/modules/shipments/pages/ImportDocs'))
const AssistancePage = lazy(() => import('@/modules/assistance/AssistancePage'))
const WarrantiesPage = lazy(() => import('@/modules/warranties/WarrantiesPage'))
const TicketDetailPage = lazy(() => import('@/modules/assistance/TicketDetailPage'))
const WarrantyDetailPage = lazy(() => import('@/modules/warranties/WarrantyDetailPage'))
const RequestsPage = lazy(() => import('@/modules/requests/RequestsPage'))
const CustomersPage = lazy(() => import('@/modules/customers/CustomersPage'))
const CustomerDetailPage = lazy(() => import('@/modules/customers/CustomerDetailPage'))
const ContactsPage = lazy(() => import('@/modules/contacts/ContactsPage'))
const DuplicatesPage = lazy(() => import('@/modules/customers/DuplicatesPage'))
// Relatório anual: página inteira (sem menu), feita para imprimir/salvar em PDF.
const ReportPage = lazy(() => import('@/modules/report/ReportPage'))
// Formulário público de pedido de envio: fora do login (link com token).
const RequestFormPage = lazy(() => import('@/modules/requests/RequestFormPage'))
// Formulário público de garantia/assistência, para clientes finais.
const ServiceFormPage = lazy(() => import('@/modules/service/ServiceFormPage'))
const ServiceRequestsPage = lazy(() => import('@/modules/service/ServiceRequestsPage'))
// Chips NFC (piloto): cartão do atleta, sem login, e painel da equipe.
const NfcProfilePage = lazy(() => import('@/modules/nfc/NfcProfilePage'))
const NfcAdminPage = lazy(() => import('@/modules/nfc/NfcAdminPage'))
// Pedido de retirada para lojas e parceiros externos: só envia, sem login.
const PickupFormPage = lazy(() => import('@/modules/pickups/PickupFormPage'))
const PickupRequestsPage = lazy(() => import('@/modules/pickups/PickupRequestsPage'))
// Férias e agenda: página do escritório e link pessoal do funcionário (sem login).
const FeriePage = lazy(() => import('@/modules/ferie/FeriePage'))
const EntriesPage = lazy(() => import('@/modules/entries/EntriesPage'))
const EntryCheckPage = lazy(() => import('@/modules/entries/EntryCheckPage'))
const EntryPrintPage = lazy(() => import('@/modules/entries/EntryPrintPage'))
const FerieFormPage = lazy(() => import('@/modules/ferie/FerieFormPage'))
// Painel de acessos por login (só administrador).
const AccessPage = lazy(() => import('@/modules/access/AccessPage'))
const ReportGate = lazy(() => import('@/modules/access/ReportGate'))
// To Do em tela cheia para o celular (vira app na tela de início).
const TodoPage = lazy(() => import('@/modules/todos/TodoPage'))

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
            <Route path="/spedizione/:token" element={page(<RequestFormPage />)} />
            <Route path="/assistenza/:token" element={page(<ServiceFormPage />)} />
            <Route path="/ritiro/:token" element={page(<PickupFormPage />)} />
            <Route path="/ferie/:token" element={page(<FerieFormPage />)} />
            {/* /t/<code> é a página leve tag.html (vercel.json); estas são as do atleta */}
            <Route path="/t/:code/registra" element={page(<NfcProfilePage key="claim" />)} />
            <Route path="/nfc/profilo" element={page(<NfcProfilePage key="edit" />)} />
            <Route path="/todo" element={<ProtectedRoute>{page(<TodoPage />)}</ProtectedRoute>} />
            <Route path="/entries/:id/print" element={<ProtectedRoute>{page(<EntryPrintPage />)}</ProtectedRoute>} />
            <Route path="/report" element={<ProtectedRoute>{page(<ReportGate><ReportPage /></ReportGate>)}</ProtectedRoute>} />

            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <Layout />
                    </ProtectedRoute>
                }
            >
                <Route index element={null} />
                <Route path="no-access" element={null} />

                <Route path="shipments" element={page(<ShipmentsDashboard />)} />
                <Route path="shipments/new" element={page(<NewShipment />)} />
                <Route path="shipments/reports" element={page(<Reports />)} />
                <Route path="shipments/requests" element={page(<RequestsPage />)} />
                <Route path="shipments/import-docs" element={page(<ImportDocs />)} />
                <Route path="shipments/pickups" element={page(<PickupRequestsPage />)} />
                <Route path="shipments/:id" element={page(<NewShipment />)} />

                <Route path="assistance" element={page(<AssistancePage />)} />
                <Route path="assistance/:id" element={page(<TicketDetailPage />)} />
                <Route path="warranties" element={page(<WarrantiesPage />)} />
                <Route path="warranties/:id" element={page(<WarrantyDetailPage />)} />

                <Route path="service-requests" element={page(<ServiceRequestsPage />)} />
                <Route path="nfc" element={page(<NfcAdminPage />)} />

                <Route path="customers" element={page(<CustomersPage />)} />
                <Route path="customers/duplicates" element={page(<DuplicatesPage />)} />
                <Route path="customers/:id" element={page(<CustomerDetailPage />)} />
                <Route path="contacts" element={page(<ContactsPage />)} />
                <Route path="entries" element={page(<EntriesPage />)} />
                <Route path="entries/:id" element={page(<EntryCheckPage />)} />
                <Route path="ferie" element={page(<FeriePage />)} />
                <Route path="access" element={page(<AccessPage />)} />

                {/* Endereços antigos do OM-Shipment, para favoritos continuarem funcionando */}
                <Route path="dashboard" element={<Navigate to="/shipments" replace />} />
                <Route path="new-shipment" element={<Navigate to="/shipments/new" replace />} />
                <Route path="reports" element={<Navigate to="/shipments/reports" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}
