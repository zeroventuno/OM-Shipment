import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Camera, X, ImageIcon, ZoomIn, Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { uploadWarrantyImage } from "./api";
import imageCompression from "browser-image-compression";

interface ImageUploadGalleryProps {
    value?: string[];
    onChange: (value: string[]) => void;
    isLoading?: boolean;
}

export default function ImageUploadGallery({ value = [], onChange, isLoading }: ImageUploadGalleryProps) {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [isConverting, setIsConverting] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setIsConverting(true);
        const newImages = [...value];

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileExt = file.name.split('.').pop() || 'jpg';

                // Comprime antes de enviar para economizar banda e espaço.
                let fileToUpload: File = file;
                try {
                    fileToUpload = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true });
                } catch (error) {
                    console.error("Compression failed, uploading original:", error);
                }

                try {
                    newImages.push(await uploadWarrantyImage(fileToUpload, fileExt));
                } catch (error) {
                    console.error('Supabase upload error:', error);
                    toast({
                        title: t("Upload failed"),
                        description: `${file.name}: ${(error as Error).message}`,
                        variant: "destructive",
                    });
                }
            }

            onChange(newImages);
        } catch (error) {
            console.error("Error processing images:", error);
            toast({ title: t("Error processing images"), variant: "destructive" });
        } finally {
            setIsConverting(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const removeImage = (index: number) => {
        const newImages = [...value];
        newImages.splice(index, 1);
        onChange(newImages);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center gap-2">
                    <Camera className="w-4 h-4" />
                    {t("Bike photos")}
                </Label>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isConverting || isLoading}
                >
                    {isConverting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                        <ImageIcon className="w-3 h-3" />
                    )}
                    {t("Add photos")}
                </Button>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*,.heic,.heif"
                    multiple
                    onChange={handleFileChange}
                />
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {value.map((image, index) => (
                    <div key={index} className="group relative aspect-square rounded-md border overflow-hidden bg-muted transition-all hover:ring-2 hover:ring-primary/20">
                        <img
                            src={image}
                            alt={`Bike preview ${index + 1}`}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setSelectedImage(image)}
                        />
                        <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute top-1 right-1 p-1 bg-background/80 rounded-full text-destructive transition-opacity opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-white"
                        >
                            <X className="w-3 h-3" />
                        </button>
                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none transition-opacity">
                            <ZoomIn className="w-4 h-4 text-white drop-shadow" />
                        </div>
                    </div>
                ))}
            </div>

            {value.length === 0 && !isConverting && (
                <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
                    <ImageIcon className="w-8 h-8 mb-2 opacity-20" />
                    <p className="text-xs">{t("No photos uploaded")}</p>
                </div>
            )}

            {isConverting && (
                <div className="border border-primary/20 bg-primary/5 rounded-lg p-4 flex items-center gap-3 animate-pulse">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <p className="text-xs font-medium text-primary">{t("Processing images...")}</p>
                </div>
            )}

            <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
                <DialogContent className="max-w-4xl p-0 overflow-hidden bg-transparent border-none shadow-2xl backdrop-blur-md">
                    <DialogHeader className="sr-only">
                        <DialogTitle>{t("Photo gallery")}</DialogTitle>
                    </DialogHeader>
                    <div className="relative w-full h-[80vh] flex items-center justify-center p-4">
                        <img
                            src={selectedImage || ""}
                            alt="Full size preview"
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-4 right-4 text-white hover:bg-white/20"
                            onClick={() => setSelectedImage(null)}
                        >
                            <X className="w-6 h-6" />
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
