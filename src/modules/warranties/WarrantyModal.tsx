import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import WarrantyForm from "./WarrantyForm";
import { useTranslation } from "react-i18next";
import { type Warranty, type InsertWarranty } from "../schema";
import { ScrollArea } from "@/components/ui/scroll-area";

interface WarrantyModalProps {
    open: boolean;
    onClose: () => void;
    warranty: Warranty | null;
    onSubmit: (data: InsertWarranty) => void;
    isLoading?: boolean;
}

export default function WarrantyModal({
    open,
    onClose,
    warranty,
    onSubmit,
    isLoading,
}: WarrantyModalProps) {
    const { t } = useTranslation();
    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, var(--font-sans)' }}>
                        {warranty ? t("Edit warranty") : t("New warranty process")}
                    </DialogTitle>
                    <DialogDescription>
                        {warranty
                            ? t("Update the details for protocol {{protocol}}", { protocol: warranty.protocolNumber })
                            : t("Fill in the data to start a new warranty process.")}
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-full max-h-[calc(90vh-120px)] p-6 pt-2">
                    <WarrantyForm
                        onSubmit={onSubmit}
                        onCancel={onClose}
                        defaultValues={warranty || undefined}
                        isLoading={isLoading}
                    />
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
