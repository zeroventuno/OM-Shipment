import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function ProtectedRoute({ children }) {
    const { session, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
        );
    }

    if (!session) {
        // Guarda a rota pretendida para voltar a ela depois do login.
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
}
