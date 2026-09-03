import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPassword() {
    const { t } = useTranslation();
    const { session, loading, updatePassword } = useAuth();
    const navigate = useNavigate();

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password.length < MIN_PASSWORD_LENGTH) {
            setError('Password must be at least 8 characters');
            return;
        }
        if (password !== confirm) {
            setError('Passwords do not match');
            return;
        }

        setSubmitting(true);
        try {
            await updatePassword(password);
            setDone(true);
            setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
        } catch (err) {
            setError(err?.message || 'Unexpected error');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
            <div className="w-full max-w-md">
                <div className="bg-surface rounded-xl shadow-lg border border-gray-200 p-8">
                    <div className="flex flex-col items-center mb-8">
                        <img src="/logo.png" alt="Officine Mattio" className="h-12 w-auto mb-4" />
                        <h1 className="text-xl font-semibold text-gray-900">{t('Set a new password')}</h1>
                    </div>

                    {done ? (
                        <div className="flex items-start gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-md p-3">
                            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>{t('Password updated. Redirecting...')}</span>
                        </div>
                    ) : !session ? (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2 text-sm text-error bg-error/10 border border-error/20 rounded-md p-3">
                                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>{t('This reset link is invalid or has expired.')}</span>
                            </div>
                            <Button variant="outlined" className="w-full" onClick={() => navigate('/login')}>
                                {t('Back to sign in')}
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <Input
                                label={t('New password')}
                                type="password"
                                autoComplete="new-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                            <Input
                                label={t('Confirm new password')}
                                type="password"
                                autoComplete="new-password"
                                required
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                placeholder="••••••••"
                            />

                            {error && (
                                <div className="flex items-start gap-2 text-sm text-error bg-error/10 border border-error/20 rounded-md p-3">
                                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>{t(error)}</span>
                                </div>
                            )}

                            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                                {submitting
                                    ? <Loader2 className="h-5 w-5 animate-spin" />
                                    : <><KeyRound className="mr-2 h-5 w-5" /> {t('Update password')}</>}
                            </Button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
