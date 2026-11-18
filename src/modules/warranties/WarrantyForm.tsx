import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { insertWarrantySchema, type InsertWarranty, type Warranty, WARRANTY_STATUSES, PROCESS_TYPES } from "../schema";
import { WARRANTY_STATUS_LABELS, PROCESS_TYPE_LABELS, SOLUTION_LABELS } from "../labels";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, ClipboardList, Info, Factory, Wrench } from "lucide-react";

import ImageUploadGallery from "./ImageUploadGallery";

interface WarrantyFormProps {
    onSubmit: (data: InsertWarranty) => void;
    onCancel?: () => void;
    defaultValues?: Partial<Warranty>;
    /** Dados iniciais de um processo novo (ex.: pedido de cliente). */
    prefill?: Partial<InsertWarranty>;
    isLoading?: boolean;
}

const PRODUCERS = [
    "Barra",
    "Pedemonte",
    "Barra + Pedemonte",
    "Univer",
    "Univer + Barra",
    "Sita",
    "Sita + Barra",
    "Carbon Tech",
    "Carbon Tech + Barra",
    "Barco",
    "Barco + Barra"
];

const SOLUTIONS = [
    "Pintura",
    "Reparação + Pintura",
    "Substituição"
];

/** Registro salvo → valores do formulário (datas em AAAA-MM-DD, nulos em ""). */
function toFormValues(w: Partial<Warranty>): InsertWarranty {
    const text = (v: string | null | undefined) => v ?? "";
    const start = w.startDate ? new Date(w.startDate) : new Date();
    return {
        startDate: start.toISOString().split("T")[0],
        customerName: text(w.customerName),
        email: text(w.email),
        agent: text(w.agent),
        serialNumber: text(w.serialNumber),
        bikeModel: text(w.bikeModel),
        size: text(w.size),
        problem: text(w.problem),
        observation: text(w.observation),
        paintDetails: text(w.paintDetails),
        componentsDescription: text(w.componentsDescription),
        status: w.status ?? "In attesa",
        solution: text(w.solution),
        producer: text(w.producer),
        newSerialNumber: text(w.newSerialNumber),
        processType: w.processType ?? "Garantia",
        orderNumber: text(w.orderNumber),
        value: text(w.value),
        invoice: text(w.invoice),
        images: w.images ?? [],
    };
}

export default function WarrantyForm({ onSubmit, onCancel, defaultValues, prefill, isLoading }: WarrantyFormProps) {
    const { t } = useTranslation();
    const form = useForm<InsertWarranty>({
        resolver: zodResolver(insertWarrantySchema),
        defaultValues: defaultValues ? toFormValues(defaultValues) : {
            startDate: new Date().toISOString().split('T')[0],
            customerName: "",
            email: "",
            agent: "",
            serialNumber: "",
            bikeModel: "",
            size: "",
            problem: "",
            observation: "",
            paintDetails: "",
            componentsDescription: "",
            status: "In attesa",
            solution: "",
            producer: "",
            newSerialNumber: "",
            processType: "Garantia",
            orderNumber: "",
            value: "",
            invoice: "",
            images: [],
            ...prefill,
        },
    });

    const watchSolution = form.watch("solution");

    useEffect(() => {
        if (watchSolution !== "Substituição") {
            form.setValue("newSerialNumber", "");
        }
    }, [watchSolution, form]);

    const handleSubmit = (data: InsertWarranty) => {
        // Ensure dates are strings for the API
        const formattedData = {
            ...data,
            startDate: data.startDate instanceof Date ? data.startDate.toISOString() : data.startDate,
        };
        onSubmit(formattedData);
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                <div className="space-y-8">
                    {/* Sezione Informazioni Generali */}
                    <Card className="border-muted/40 shadow-sm overflow-hidden">
                        <div className="bg-muted/30 px-4 py-2 border-b flex items-center gap-2">
                            <Info className="w-4 h-4 text-primary" />
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("General information")}</h3>
                        </div>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField
                                    control={form.control}
                                    name="startDate"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-2 text-sm font-medium">
                                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                                {t("Start date")} *
                                            </FormLabel>
                                            <FormControl>
                                                <Input type="date" {...field} value={field.value as string || ""} className="bg-background border-muted/20 focus:ring-2 focus:ring-primary/20 transition-all" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="agent"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-2 text-sm font-medium">
                                                <User className="w-4 h-4 text-muted-foreground" />
                                                {t("Agent")} *
                                            </FormLabel>
                                            <FormControl>
                                                <Input placeholder={t("Agent name")} {...field} className="bg-background border-muted/20 focus:ring-2 focus:ring-primary/20 transition-all" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="customerName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-medium">{t("Customer")} *</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Mario Rossi" {...field} className="bg-background border-muted/20 focus:ring-2 focus:ring-primary/20 transition-all" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-medium">{t("Email")} *</FormLabel>
                                            <FormControl>
                                                <Input type="email" placeholder="mario@email.com" {...field} className="bg-background border-muted/20 focus:ring-2 focus:ring-primary/20 transition-all" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="processType"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-semibold">{t("Process type")}</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="bg-background border-muted/20 focus:ring-primary/30">
                                                        <SelectValue placeholder={t("Select type")} />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {PROCESS_TYPES.map((p) => (
                                                        <SelectItem key={p} value={p}>{t(PROCESS_TYPE_LABELS[p])}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sezione Dettagli Bicicletta */}
                    <Card className="border-muted/40 shadow-sm overflow-hidden">
                        <div className="bg-muted/30 px-4 py-2 border-b flex items-center gap-2">
                            <ClipboardList className="w-4 h-4 text-primary" />
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("Bike details")}</h3>
                        </div>
                        <CardContent className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <FormField
                                    control={form.control}
                                    name="serialNumber"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-medium">{t("Serial number")} *</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Serial #" {...field} className="bg-background border-muted/20 focus:ring-2 focus:ring-primary/20 transition-all" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="bikeModel"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-medium">{t("Model")} *</FormLabel>
                                            <FormControl>
                                                <Input placeholder={t("e.g. F12, Dogma...")} {...field} className="bg-background border-muted/20 focus:ring-2 focus:ring-primary/20 transition-all" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="size"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-medium">{t("Size")} *</FormLabel>
                                            <FormControl>
                                                <Input placeholder={t("e.g. 54, L")} {...field} className="bg-background border-muted/20 focus:ring-2 focus:ring-primary/20 transition-all" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="problem"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-medium">{t("Problem description")} *</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder={t("Describe the problem in detail...")}
                                                className="min-h-[100px] bg-background border-muted/20 focus:ring-2 focus:ring-primary/20 transition-all"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField
                                    control={form.control}
                                    name="paintDetails"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-medium">{t("Paint details")}</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder={t("Colour code, finish...")}
                                                    className="min-h-[80px] bg-background border-muted/20 focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                                    {...field}
                                                    value={field.value || ""}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="componentsDescription"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-medium">{t("Mounted components")}</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder={t("Groupset, wheels, saddle...")}
                                                    className="min-h-[80px] bg-background border-muted/20 focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                                    {...field}
                                                    value={field.value || ""}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField
                                    control={form.control}
                                    name="observation"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-medium">{t("Additional notes")}</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder={t("Extra notes...")}
                                                    className="min-h-[140px] bg-background border-muted/20 focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                                    {...field}
                                                    value={field.value || ""}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="images"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <ImageUploadGallery
                                                    value={(field.value as string[]) || []}
                                                    onChange={field.onChange}
                                                    isLoading={isLoading}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sezione Aggiornamento Processo */}
                    <Card className="border-primary/20 bg-primary/5 shadow-sm overflow-hidden">
                        <div className="bg-primary/10 px-4 py-2 border-b border-primary/20 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Wrench className="w-4 h-4 text-primary" />
                                <h3 className="text-sm font-bold uppercase tracking-wider text-primary">{t("Process update")}</h3>
                            </div>
                            <Badge variant="outline" className="bg-background/80 border-primary/30 text-primary">
                                {t(WARRANTY_STATUS_LABELS[form.watch("status") ?? ""] ?? form.watch("status") ?? "")}
                            </Badge>
                        </div>
                        <CardContent className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField
                                    control={form.control}
                                    name="status"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-semibold">{t("Current status")}</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="bg-background border-primary/20 focus:ring-primary/30">
                                                        <SelectValue placeholder={t("Select the status")} />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {WARRANTY_STATUSES.map((s) => (
                                                        <SelectItem key={s} value={s}>{t(WARRANTY_STATUS_LABELS[s])}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="solution"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-semibold">{t("Proposed solution")}</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value || undefined}>
                                                <FormControl>
                                                    <SelectTrigger className="bg-background border-muted/20">
                                                        <SelectValue placeholder={t("Select a solution")} />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {SOLUTIONS.map(s => (
                                                        <SelectItem key={s} value={s}>{t(SOLUTION_LABELS[s])}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="producer"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-semibold flex items-center gap-2">
                                                <Factory className="w-4 h-4 text-muted-foreground" />
                                                {t("Producer involved")}
                                            </FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value || undefined}>
                                                <FormControl>
                                                    <SelectTrigger className="bg-background border-muted/20">
                                                        <SelectValue placeholder={t("Select a producer")} />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {PRODUCERS.map(p => (
                                                        <SelectItem key={p} value={p}>{p}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {watchSolution === "Substituição" && (
                                    <FormField
                                        control={form.control}
                                        name="newSerialNumber"
                                        render={({ field }) => (
                                            <FormItem className="animate-in fade-in slide-in-from-left-2 duration-300">
                                                <FormLabel className="font-semibold text-primary">{t("New serial number")} *</FormLabel>
                                                <FormControl>
                                                    <Input placeholder={t("New serial #")} {...field} value={field.value || ""} className="bg-background border-primary/30 ring-primary/10 ring-2" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sezione Finanziario / Amministrativo */}
                    <Card className="border-muted/40 shadow-sm overflow-hidden">
                        <div className="bg-muted/30 px-4 py-2 border-b flex items-center gap-2">
                            <Info className="w-4 h-4 text-primary" />
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("Finance / administration")}</h3>
                        </div>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <FormField
                                    control={form.control}
                                    name="orderNumber"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-medium">{t("Order no.")}</FormLabel>
                                            <FormControl>
                                                <Input placeholder={t("Order no.")} {...field} value={field.value || ""} className="bg-background border-muted/20 focus:ring-2 focus:ring-primary/20 transition-all" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="value"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-medium">{t("Value")}</FormLabel>
                                            <FormControl>
                                                <Input placeholder={t("Value")} {...field} value={field.value || ""} className="bg-background border-muted/20 focus:ring-2 focus:ring-primary/20 transition-all" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="invoice"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-medium">{t("Invoice")}</FormLabel>
                                            <FormControl>
                                                <Input placeholder={t("Invoice")} {...field} value={field.value || ""} className="bg-background border-muted/20 focus:ring-2 focus:ring-primary/20 transition-all" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    {onCancel && (
                        <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading}>
                            {t("Cancel")}
                        </Button>
                    )}
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? t("Saving...") : defaultValues ? t("Update") : t("Add process")}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
