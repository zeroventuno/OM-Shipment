import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { type Warranty, type InsertWarranty } from "../schema";
import PageHeader from "../PageHeader";
import WarrantyMetrics from "./WarrantyMetrics";
import WarrantyTable from "./WarrantyTable";
import WarrantyModal from "./WarrantyModal";
import { listWarranties, createWarranty, updateWarranty, deleteWarranty } from "./api";

const QUERY_KEY = ["warranties"];

export default function WarrantiesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Warranty | null>(null);
  const [search, setSearch] = useState("");

  const { data: warranties = [], isLoading, error } = useQuery({ queryKey: QUERY_KEY, queryFn: listWarranties });

  const onError = (error: Error) =>
    toast({ title: t("Error"), description: error.message, variant: "destructive" });

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const saveMutation = useMutation({
    mutationFn: (data: InsertWarranty) => (editing ? updateWarranty(editing, data) : createWarranty(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: t("Saved"), description: editing ? t("Warranty updated") : t("Warranty process added") });
      closeModal();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWarranty,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: t("Warranty deleted") });
    },
    onError,
  });

  const term = search.toLowerCase();
  const filtered = warranties.filter((w) =>
    [w.customerName, w.bikeModel, w.protocolNumber, w.serialNumber, w.agent]
      .some((value) => value?.toLowerCase().includes(term))
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Warranties")}
        search={search}
        onSearch={setSearch}
        actions={
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} data-testid="button-new-warranty">
            <Plus className="w-4 h-4 mr-2" />
            {t("New warranty")}
          </Button>
        }
      />

      <WarrantyMetrics warranties={warranties} />

      <div className="border rounded-lg overflow-x-auto bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">{t("Loading warranties...")}</div>
        ) : error ? (
          <div className="py-16 text-center text-destructive">{t("Could not load warranties")}: {(error as Error).message}</div>
        ) : (
          <WarrantyTable
            warranties={filtered}
            onEdit={(w) => { setEditing(w); setModalOpen(true); }}
            onDelete={(id) => {
              if (window.confirm(t("Delete this warranty?"))) deleteMutation.mutate(id);
            }}
          />
        )}
      </div>

      <WarrantyModal
        open={modalOpen}
        onClose={closeModal}
        warranty={editing}
        onSubmit={(data) => saveMutation.mutate(data)}
        isLoading={saveMutation.isPending}
      />
    </div>
  );
}
