import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type Warranty } from "../schema";
import { WARRANTY_STATUS_LABELS, SOLUTION_LABELS } from "../labels";
import TicketHistory from "../assistance/TicketHistory";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatDate } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface WarrantyTableProps {
    warranties: Warranty[];
    onEdit: (warranty: Warranty) => void;
    onDelete: (id: string) => void;
}

export default function WarrantyTable({ warranties, onEdit, onDelete }: WarrantyTableProps) {
    const { t } = useTranslation();
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const getStatusBadge = (status: string) => {
        const label = WARRANTY_STATUS_LABELS[status] ? t(WARRANTY_STATUS_LABELS[status]) : status;
        switch (status) {
            case "In attesa":
                return <Badge variant="outline">{label}</Badge>;
            case "In lavorazione":
                return <Badge variant="secondary">{label}</Badge>;
            case "Completato":
                return <Badge>{label}</Badge>;
            default:
                return <Badge variant="outline">{label}</Badge>;
        }
    };

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="w-[120px]">{t("Protocol")}</TableHead>
                    <TableHead className="w-[100px]">{t("Date")}</TableHead>
                    <TableHead>{t("Customer")}</TableHead>
                    <TableHead>{t("Agent")}</TableHead>
                    <TableHead>{t("Model")}</TableHead>
                    <TableHead>{t("Serial #")}</TableHead>
                    <TableHead>{t("Solution")}</TableHead>
                    <TableHead>{t("Producer")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead className="text-right">{t("Actions")}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {warranties.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                            {t("No warranties found.")}
                        </TableCell>
                    </TableRow>
                ) : (
                    warranties.map((warranty) => (
                        <Fragment key={warranty.id}>
                        <TableRow>
                            <TableCell className="px-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setExpandedId(expandedId === warranty.id ? null : warranty.id)}
                                    aria-label={t("History")}
                                >
                                    {expandedId === warranty.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </Button>
                            </TableCell>
                            <TableCell className="font-mono text-xs font-bold">{warranty.protocolNumber}</TableCell>
                            <TableCell className="text-xs">
                                {formatDate(new Date(warranty.startDate), "dd/MM/yy")}
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col">
                                    <span className="font-medium">{warranty.customerName}</span>
                                    <span className="text-xs text-muted-foreground">{warranty.email}</span>
                                </div>
                            </TableCell>
                            <TableCell className="text-sm">{warranty.agent}</TableCell>
                            <TableCell className="text-sm">
                                <div className="flex flex-col">
                                    <span>{warranty.bikeModel}</span>
                                    <span className="text-xs text-muted-foreground">{t("Size")}: {warranty.size}</span>
                                </div>
                            </TableCell>
                            <TableCell className="text-xs font-mono">{warranty.serialNumber}</TableCell>
                            <TableCell className="text-sm">{warranty.solution ? t(SOLUTION_LABELS[warranty.solution] ?? warranty.solution) : "-"}</TableCell>
                            <TableCell className="text-sm">{warranty.producer || "-"}</TableCell>
                            <TableCell>{getStatusBadge(warranty.status)}</TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onEdit(warranty)}
                                        className="h-8 w-8"
                                    >
                                        <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onDelete(warranty.id)}
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                        {expandedId === warranty.id && (
                            <TableRow>
                                <TableCell colSpan={11} className="bg-muted/30 px-8 py-2">
                                    <TicketHistory history={warranty.history} createdLabel="Warranty created" />
                                </TableCell>
                            </TableRow>
                        )}
                        </Fragment>
                    ))
                )}
            </TableBody>
        </Table>
    );
}
