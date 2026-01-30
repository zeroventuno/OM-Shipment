import React, { useState } from 'react';
import { Camera, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { storageService } from '../../services/storage';
import { useTranslation } from 'react-i18next';

export function PhotoUpload({ photos = [], onPhotosChange }) {
    const { t } = useTranslation();
    const [uploading, setUploading] = useState(false);

    const handleFileChange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        if (photos.length + files.length > 5) {
            alert(t('Maximum 5 photos'));
            return;
        }

        setUploading(true);
        const newUrls = [...photos];

        try {
            for (const file of files) {
                const url = await storageService.uploadPhoto(file);
                newUrls.push(url);
            }
            onPhotosChange(newUrls);
        } catch (error) {
            console.error('Error uploading photos:', error);
            alert('Error uploading photos');
        } finally {
            setUploading(false);
        }
    };

    const removePhoto = (urlToRemove) => {
        onPhotosChange(photos.filter(url => url !== urlToRemove));
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
                {photos.map((url, index) => (
                    <div key={index} className="relative group w-24 h-24 rounded-lg overflow-hidden border border-gray-200">
                        <img src={url} alt={`Shipment ${index}`} className="w-full h-full object-cover" />
                        <button
                            type="button"
                            onClick={() => removePhoto(url)}
                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                ))}

                {photos.length < 5 && (
                    <label className="flex flex-col items-center justify-center w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            {uploading ? (
                                <Loader2 className="h-6 w-6 text-primary animate-spin" />
                            ) : (
                                <Camera className="h-6 w-6 text-gray-400" />
                            )}
                        </div>
                        <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            multiple
                            onChange={handleFileChange}
                            disabled={uploading}
                        />
                    </label>
                )}
            </div>
            <p className="text-xs text-gray-500 italic">
                {t('Maximum 5 photos')}
            </p>
        </div>
    );
}
