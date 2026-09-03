import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!supabase) {
            // Sem Supabase configurado não há como autenticar. Layout mostra o aviso.
            setLoading(false);
            return;
        }

        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const signIn = async (email, password) => {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    };

    const signOut = async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
    };

    const resetPassword = async (email) => {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`
        });
        if (error) throw error;
    };

    const updatePassword = async (password) => {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
    };

    const value = {
        session,
        user: session?.user ?? null,
        loading,
        signIn,
        signOut,
        resetPassword,
        updatePassword
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === null) {
        throw new Error('useAuth precisa estar dentro de <AuthProvider>');
    }
    return context;
}
