import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { WARRANTY_STATUSES, type Warranty, type InsertWarranty } from "../schema";
import { WARRANTY_STATUS_LABELS, SOLUTION_LABELS } from "../labels";
import { PageHeader, SearchBox } from "../common/PageHeader";
import { StageBoard, AgeChip, Tag, ViewToggle, StaleBanner, useViewMode } from "../common/StageBoard";
import WarrantyTable from "./WarrantyTable";
import WarrantyModal from "./WarrantyModal";
import { warrantiesQuery, WARRANTIES_QUERY_KEY, createWarranty, deleteWarranty, warrantyAge } from "./api";

export default function WarrantiesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyStale, setOnlyStale] = useState(false);
  const [view, setView] = useViewMode("om-view-warranties");

  const { data: warranties = [], isLoading, error } = useQuery(warrantiesQuery);

  const onError = (error: Error) =>
    toast({ title: t("Error"), description: error.message, variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: (data: InsertWarranty) => createWarranty(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: WARRANTIES_QUERY_KEY });
      toast({ title: t("Saved"), description: t("Warranty process added") });
      setModalOpen(false);
      navigate(`/warranties/${created.id}`);
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWarranty,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WARRANTIES_QUERY_KEY });
      toast({ title: t("Warranty deleted") });
    },
    onError,
  });

  const withAge = useMemo(() => warranties.map((w) => ({ w, age: warrantyAge(w) })), [warranties]);
  const stale = withAge.filter((x) => x.age.stale);

  const term = search.trim().toLowerCase();
  const filtered = withAge
    .filter((x) => !onlyStale || x.age.stale)
    .filter(({ w }) =>
      !term ||
      [w.customerName, w.bikeModel, w.protocolNumber, w.serialNumber, w.agent, w.producer]
        .some((value) => value?.toLowerCase().includes(term))
    );

  const columns = WARRANTY_STATUSES.map((status) => {
    const items = filtered.filter((x) => x.w.status === status);
    // Na coluna de concluídas, as mais recentes primeiro; nas outras, as mais paradas primeiro.
    items.sort((a, b) => (status === "Completato" ? b.age.since.getTime() - a.age.since.getTime() : b.age.days - a.age.days));
    return { key: status, title: t(WARRANTY_STATUS_LABELS[status]), items };
  });

  const card = ({ w, age }: (typeof withAge)[number]) => (
    <Link
      to={`/warranties/${w.id}`}
      className="flex flex-col gap-3 p-4 bg-card border border-border rounded-lg hover:border-foreground transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold tracking-[0.04em]">{w.protocolNumber}</span>
        {w.status === "Completato" ? (
          <AgeChip days={0} stale={false} label={t("Closed {{date}}", { date: format(age.since, "dd/MM") })} />
        ) : (
          <AgeChip days={age.days} stale={age.stale} />
        )}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[17px] font-semibold tracking-tight truncate">{w.customerName}</span>
        <span className="text-[13px] text-muted-foreground truncate">
          {[w.bikeModel, w.size, w.serialNumber].filter(Boolean).join(" · ")}
        </span>
      </div>
      {(w.solution || w.producer) && (
        <div className="flex flex-wrap gap-1.5 pt-2.5 border-t border-muted">
          {w.solution && <Tag>{t(SOLUTION_LABELS[w.solution] ?? w.solution)}</Tag>}
          {w.producer && <Tag>{w.producer}</Tag>}
        </div>
      )}
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("{{count}} warranty processes", { count: warranties.length })}
        title={t("Warranties")}
        actions={
          <>
            <ViewToggle value={view} onChange={setView} />
            <SearchBox value={search} onChange={setSearch} placeholder={t("Customer, protocol, serial…")} />
            <Button onClick={() => setModalOpen(true)} data-testid="button-new-warranty">
              <Plus /> {t("New warranty")}
            </Button>
          </>
        }
      />

      <StaleBanner
        items={stale.map((x) => x.w.protocolNumber ?? x.w.customerName)}
        active={onlyStale}
        onToggle={() => setOnlyStale((v) => !v)}
      />

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">{t("Loading warranties...")}</div>
      ) : error ? (
        <div className="py-16 text-center text-destructive">{t("Could not load warranties")}: {(error as Error).message}</div>
      ) : view === "board" ? (
        <StageBoard columns={columns} renderCard={card} getKey={(x) => x.w.id} collapse={{ Completato: 6 }} />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <WarrantyTable
            warranties={filtered.map((x) => x.w)}
            onEdit={(w: Warranty) => navigate(`/warranties/${w.id}`)}
            onDelete={(id) => {
              if (window.confirm(t("Delete this warranty?"))) deleteMutation.mutate(id);
            }}
          />
        </div>
      )}

      <WarrantyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        warranty={null}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      />
    </div>
  );
}
