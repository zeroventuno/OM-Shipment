import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthContextValue {
    session: Session | null;
    user: User | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
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

    const signIn = async (email: string, password: string) => {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    };

    const signOut = async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
    };

    const resetPassword = async (email: string) => {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`
        });
        if (error) throw error;
    };

    const updatePassword = async (password: string) => {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
    };

    const value: AuthContextValue = {
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
