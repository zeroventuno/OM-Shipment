import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
}

/** Rótulo pequeno + título grande + ações à direita (padrão de todas as páginas). */
export function PageHeader({ eyebrow, title, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="page-title">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Campo de busca em pílula. */
export function SearchBox({ value, onChange, placeholder }: SearchBoxProps) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center gap-2 h-11 px-4 rounded-full bg-card border border-border min-w-0 w-full sm:w-72 focus-within:ring-2 focus-within:ring-ring">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t("Search")}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t("Type to search...")}
        className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}
