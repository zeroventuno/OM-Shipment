import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import NewShipment from './pages/NewShipment'
import Reports from './pages/Reports'

function App() {
    return (
        <Routes>
            <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="new-shipment" element={<NewShipment />} />
                <Route path="new-shipment/:id" element={<NewShipment />} />
                <Route path="reports" element={<Reports />} />
            </Route>
        </Routes>
    )
}

export default App
