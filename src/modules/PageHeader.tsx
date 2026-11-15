import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";

interface PageHeaderProps {
  title: string;
  search: string;
  onSearch: (value: string) => void;
  actions?: ReactNode;
}

/** Título da página, busca e botão de ação — comum a Assistências e Garantias. */
export default function PageHeader({ title, search, onSearch, actions }: PageHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <div className="flex items-center gap-3 flex-1 sm:justify-end">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("Type to search...")}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
        {actions}
      </div>
    </div>
  );
}
