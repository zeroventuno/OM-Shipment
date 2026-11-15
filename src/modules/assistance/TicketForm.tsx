import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { insertTicketSchema, type InsertTicket, TICKET_PHASES, APPROVAL_STATUSES } from "../schema";
import { PHASE_LABELS, APPROVAL_LABELS } from "../labels";
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

interface TicketFormProps {
  onSubmit: (data: InsertTicket) => void;
  onCancel?: () => void;
  defaultValues?: Partial<InsertTicket>;
  isLoading?: boolean;
}

export default function TicketForm({ onSubmit, onCancel, defaultValues, isLoading }: TicketFormProps) {
  const { t } = useTranslation();
  const form = useForm<InsertTicket>({
    resolver: zodResolver(insertTicketSchema),
    defaultValues: defaultValues || {
      clientName: "",
      clientEmail: "",
      component: "",
      brand: "",
      serialNumber: "",
      problem: "",
      protocolNumber: "",
      approvalStatus: undefined,
      phase: "Ingresso",
      shippingDate: "",
      trackingNumber: "",
      shippingCompany: "",
      completionDate: "",
    },
  });

  const watchPhase = form.watch("phase");

  useEffect(() => {
    if (watchPhase !== "Spedito") {
      form.setValue("shippingDate", "");
      form.setValue("trackingNumber", "");
      form.setValue("shippingCompany", "");
    }
    if (watchPhase !== "Completato") {
      form.setValue("completionDate", "");
      form.setValue("approvalStatus", undefined);
    }
  }, [watchPhase, form]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="clientName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Customer name")} *</FormLabel>
                <FormControl>
                  <Input placeholder="Mario Rossi" {...field} data-testid="input-client-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="clientEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Customer email")} *</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="mario@email.com" {...field} data-testid="input-client-email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="component"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Component")} *</FormLabel>
                <FormControl>
                  <Input placeholder={t("e.g. Hydraulic brake")} {...field} data-testid="input-component" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="brand"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Brand")} *</FormLabel>
                <FormControl>
                  <Input placeholder="Shimano" {...field} data-testid="input-brand" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="serialNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Serial number")}</FormLabel>
                <FormControl>
                  <Input placeholder="SH-2024-001234" {...field} value={field.value || ""} data-testid="input-serial-number" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="protocolNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Protocol no.")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("Provided by the producer")} {...field} value={field.value || ""} data-testid="input-protocol-number" />
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
              <FormLabel>{t("What is the problem")}</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder={t("Describe the problem in detail...")}
                  className="min-h-[100px]"
                  {...field}
                  value={field.value || ""}
                  data-testid="input-problem"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="phase"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Phase")} *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} data-testid="select-phase">
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t("Select the phase")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TICKET_PHASES.map((p) => (
                      <SelectItem key={p} value={p}>{t(PHASE_LABELS[p])}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {watchPhase === "Completato" && (
            <FormField
              control={form.control}
              name="approvalStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Approval status")} *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || undefined} data-testid="select-approval-status">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("Select the status")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {APPROVAL_STATUSES.map((a) => (
                        <SelectItem key={a} value={a}>{t(APPROVAL_LABELS[a])}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {watchPhase === "Spedito" && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
            <h3 className="font-medium text-sm">{t("Shipping information")}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="shippingDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Shipping date")}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ""} data-testid="input-shipping-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="trackingNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Tracking")}</FormLabel>
                    <FormControl>
                      <Input placeholder="IT123456789" {...field} value={field.value || ""} data-testid="input-tracking-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="shippingCompany"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Courier")}</FormLabel>
                    <FormControl>
                      <Input placeholder="DHL" {...field} value={field.value || ""} data-testid="input-shipping-company" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}

        {watchPhase === "Completato" && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
            <h3 className="font-medium text-sm">{t("Completion information")}</h3>
            <FormField
              control={form.control}
              name="completionDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Completion date")}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value || ""} data-testid="input-completion-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading} data-testid="button-cancel">
              {t("Cancel")}
            </Button>
          )}
          <Button type="submit" disabled={isLoading} data-testid="button-submit">
            {isLoading ? t("Saving...") : defaultValues ? t("Update") : t("Create ticket")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
