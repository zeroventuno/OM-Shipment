import { useState } from 'react';
import { FileText, FileImage, X, Loader2, Upload, ExternalLink } from 'lucide-react';
import { storageService } from '../../services/storage';
import { useTranslation } from 'react-i18next';

const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024; // igual ao limite do bucket
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Nome legível a partir do caminho no storage (pods/<uuid>.pdf). */
function fileLabel(path) {
    const name = path.split('/').pop() || path;
    const ext = name.split('.').pop()?.toUpperCase() || '';
    return { ext, isPdf: ext === 'PDF' };
}

export function PodUpload({ files = [], onFilesChange }) {
    const { t } = useTranslation();
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [opening, setOpening] = useState(null);

    const handleFileChange = async (e) => {
        const chosen = Array.from(e.target.files);
        e.target.value = ''; // permite reescolher o mesmo arquivo depois de remover
        if (chosen.length === 0) return;

        setError('');

        if (files.length + chosen.length > MAX_FILES) {
            setError(t('Maximum {{count}} files', { count: MAX_FILES }));
            return;
        }
        const tooBig = chosen.find(f => f.size > MAX_BYTES);
        if (tooBig) {
            setError(t('File is too large (max 10 MB)'));
            return;
        }
        const wrongType = chosen.find(f => !ACCEPTED.includes(f.type));
        if (wrongType) {
            setError(t('Only PDF or image files'));
            return;
        }

        setUploading(true);
        try {
            const uploaded = [];
            for (const file of chosen) {
                uploaded.push(await storageService.uploadPod(file));
            }
            onFilesChange([...files, ...uploaded]);
        } catch (err) {
            console.error('POD upload failed:', err);
            setError(err.message || t('Unexpected error'));
        } finally {
            setUploading(false);
        }
    };

    // O bucket é privado: a URL é gerada no clique e vale 5 minutos.
    const openFile = async (path) => {
        setOpening(path);
        setError('');
        try {
            const url = await storageService.getPodUrl(path);
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            console.error('Could not open POD:', err);
            setError(err.message || t('Unexpected error'));
        } finally {
            setOpening(null);
        }
    };

    const removeFile = async (path) => {
        if (!window.confirm(t('Remove this proof of delivery?'))) return;
        onFilesChange(files.filter(f => f !== path));
        try {
            await storageService.deletePod(path);
        } catch (err) {
            // O arquivo já saiu do envio; sobra um órfão no bucket, o que é
            // preferível a travar a remoção por causa disso.
            console.error('Could not delete POD file from storage:', err);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-2">
                {files.map((path) => {
                    const { ext, isPdf } = fileLabel(path);
                    const Icon = isPdf ? FileText : FileImage;
                    return (
                        <div
                            key={path}
                            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                        >
                            <Icon className={`h-5 w-5 shrink-0 ${isPdf ? 'text-red-500' : 'text-blue-500'}`} />
                            <button
                                type="button"
                                onClick={() => openFile(path)}
                                className="flex-1 min-w-0 text-left text-sm text-primary hover:underline flex items-center gap-1.5"
                            >
                                <span className="truncate">{t('Proof of delivery')} ({ext})</span>
                                {opening === path
                                    ? <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                                    : <ExternalLink className="h-3 w-3 shrink-0" />}
                            </button>
                            <button
                                type="button"
                                onClick={() => removeFile(path)}
                                className="p-1 text-gray-400 hover:text-error transition-colors shrink-0"
                                title={t('Delete')}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    );
                })}
            </div>

            {files.length < MAX_FILES && (
                <label className="flex items-center justify-center gap-2 h-11 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary hover:bg-primary/5 transition-all text-sm text-gray-500">
                    {uploading ? (
                        <>
                            <Loader2 className="h-4 w-4 text-primary animate-spin" />
                            {t('Uploading...')}
                        </>
                    ) : (
                        <>
                            <Upload className="h-4 w-4" />
                            {t('Attach proof of delivery')}
                        </>
                    )}
                    <input
                        type="file"
                        className="hidden"
                        accept=".pdf,image/jpeg,image/png,image/webp"
                        multiple
                        onChange={handleFileChange}
                        disabled={uploading}
                    />
                </label>
            )}

            {error && <p className="text-xs text-error">{error}</p>}

            <p className="text-xs text-gray-500 italic">
                {t('PDF or image, up to 10 MB. Visible only to signed-in users.')}
            </p>
        </div>
    );
}
