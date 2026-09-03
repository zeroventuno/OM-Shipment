import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2, LogIn, AlertCircle, MailCheck, ArrowLeft } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseClient';
import { useTranslation } from 'react-i18next';

export default function Login() {
    const { t, i18n } = useTranslation();
    const { session, loading, signIn, resetPassword } = useAuth();
    const location = useLocation();

    const [mode, setMode] = useState('login'); // 'login' | 'forgot'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
        );
    }

    if (session) {
        return <Navigate to={location.state?.from?.pathname || '/dashboard'} replace />;
    }

    const translateError = (err) => {
        const message = err?.message || '';
        if (/invalid login credentials/i.test(message)) return 'Invalid email or password';
        if (/email not confirmed/i.test(message)) return 'Email not confirmed';
        if (/rate limit|too many/i.test(message)) return 'Too many attempts. Try again later.';
        return message || 'Unexpected error';
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            await signIn(email.trim(), password);
            // O redirecionamento acontece sozinho quando a sessão muda.
        } catch (err) {
            setError(translateError(err));
        } finally {
            setSubmitting(false);
        }
    };

    const handleForgot = async (e) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            await resetPassword(email.trim());
            setSent(true);
        } catch (err) {
            setError(translateError(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
            <div className="w-full max-w-md">
                <div className="bg-surface rounded-xl shadow-lg border border-gray-200 p-8">
                    <div className="flex flex-col items-center mb-8">
                        <img src="/logo.png" alt="Officine Mattio" className="h-12 w-auto mb-4" />
                        <h1 className="text-xl font-semibold text-gray-900">{t('Shipment Management')}</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            {mode === 'login' ? t('Sign in to continue') : t('Recover your password')}
                        </p>
                    </div>

                    {!supabase && (
                        <div className="flex items-start gap-2 text-sm text-error bg-error/10 border border-error/20 rounded-md p-3 mb-6">
                            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>{t('Supabase is not configured. Check the environment variables.')}</span>
                        </div>
                    )}

                    {mode === 'login' ? (
                        <form onSubmit={handleLogin} className="space-y-4">
                            <Input
                                label={t('Email')}
                                type="email"
                                autoComplete="username"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="nome@officinemattio.com"
                            />
                            <Input
                                label={t('Password')}
                                type="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                            />

                            {error && (
                                <div className="flex items-start gap-2 text-sm text-error bg-error/10 border border-error/20 rounded-md p-3">
                                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>{t(error)}</span>
                                </div>
                            )}

                            <Button type="submit" className="w-full" size="lg" disabled={submitting || !supabase}>
                                {submitting
                                    ? <Loader2 className="h-5 w-5 animate-spin" />
                                    : <><LogIn className="mr-2 h-5 w-5" /> {t('Sign In')}</>}
                            </Button>

                            <button
                                type="button"
                                onClick={() => { setMode('forgot'); setError(''); }}
                                className="w-full text-center text-sm text-primary hover:underline pt-2"
                            >
                                {t('Forgot your password?')}
                            </button>
                        </form>
                    ) : sent ? (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-md p-3">
                                <MailCheck className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>{t('If this email is registered, a reset link has been sent.')}</span>
                            </div>
                            <Button
                                variant="outlined"
                                className="w-full"
                                onClick={() => { setMode('login'); setSent(false); }}
                            >
                                <ArrowLeft className="mr-2 h-4 w-4" /> {t('Back to sign in')}
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleForgot} className="space-y-4">
                            <Input
                                label={t('Email')}
                                type="email"
                                autoComplete="username"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="nome@officinemattio.com"
                            />

                            {error && (
                                <div className="flex items-start gap-2 text-sm text-error bg-error/10 border border-error/20 rounded-md p-3">
                                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>{t(error)}</span>
                                </div>
                            )}

                            <Button type="submit" className="w-full" size="lg" disabled={submitting || !supabase}>
                                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : t('Send reset link')}
                            </Button>

                            <button
                                type="button"
                                onClick={() => { setMode('login'); setError(''); }}
                                className="w-full text-center text-sm text-primary hover:underline pt-2"
                            >
                                {t('Back to sign in')}
                            </button>
                        </form>
                    )}
                </div>

                <div className="flex items-center justify-center gap-4 mt-6">
                    <button
                        onClick={() => i18n.changeLanguage('pt')}
                        className={`text-2xl hover:scale-110 transition-transform ${i18n.language === 'pt' ? 'opacity-100' : 'opacity-40'}`}
                        title="Português"
                    >
                        🇧🇷
                    </button>
                    <div className="h-4 w-[1px] bg-gray-300" />
                    <button
                        onClick={() => i18n.changeLanguage('it')}
                        className={`text-2xl hover:scale-110 transition-transform ${i18n.language === 'it' ? 'opacity-100' : 'opacity-40'}`}
                        title="Italiano"
                    >
                        🇮🇹
                    </button>
                </div>

                <p className="text-center text-xs text-gray-400 mt-6">
                    Copyright © {new Date().getFullYear()} Ventuno
                </p>
            </div>
        </div>
    );
}
