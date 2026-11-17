import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Contact, Download, Loader2, Mail, Pencil, Phone, Plus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { downloadText } from "@/modules/customers/api";
import { key as nameKey } from "@/modules/customers/importer.js";
import { PageHeader, SearchBox } from "../common/PageHeader";
import {
  archiveContact, buildContactsCsv, buildVCards, CATEGORY_SUGGESTIONS, CONTACTS_KEY, listContacts, saveContact,
  type PartnerContact, type PartnerContactInput,
} from "./api";

const EMPTY: PartnerContactInput = { company: "", category: "", name: "", role: "", phone: "", mobile: "", email: "", notes: "" };

export default function ContactsPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{ id: string | null; form: PartnerContactInput } | null>(null);
  const lang = i18n.language || "it";

  const { data: contacts = [], isLoading, error } = useQuery({ queryKey: CONTACTS_KEY, queryFn: listContacts });

  const filtered = useMemo(() => {
    const term = nameKey(q);
    const digits = q.replace(/\D/g, "");
    if (!term) return contacts;
    return contacts.filter((c) =>
      [c.company, c.category, c.name, c.role, c.email, c.notes].some((v) => v && nameKey(v).includes(term))
      || (digits.length >= 4 && [c.phone, c.mobile].some((p) => p && p.replace(/\D/g, "").includes(digits))));
  }, [contacts, q]);

  // Agrupado por empresa, em ordem alfabética.
  const groups = useMemo(() => {
    const m = new Map<string, PartnerContact[]>();
    for (const c of filtered) m.set(c.company, [...(m.get(c.company) ?? []), c]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, lang));
  }, [filtered, lang]);

  const companies = useMemo(() => [...new Set(contacts.map((c) => c.company))].sort((a, b) => a.localeCompare(b, lang)), [contacts, lang]);
  const categories = useMemo(() => [...new Set([...CATEGORY_SUGGESTIONS, ...contacts.map((c) => c.category).filter(Boolean) as string[]])], [contacts]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
  const save = useMutation({
    mutationFn: () => saveContact(editing!.id, editing!.form),
    onSuccess: () => { refresh(); setEditing(null); toast({ title: t("contacts.saved") }); },
    onError: (e) => toast({ title: t("Error"), description: (e as Error).message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => archiveContact(id),
    onSuccess: () => { refresh(); setEditing(null); toast({ title: t("contacts.removed") }); },
    onError: (e) => toast({ title: t("Error"), description: (e as Error).message, variant: "destructive" }),
  });

  const stamp = format(new Date(), "yyyy-MM-dd");
  const exportVcf = () => downloadText(`referenti-${stamp}.vcf`, buildVCards(filtered), "text/vcard;charset=utf-8");
  const exportCsv = () => downloadText(`referenti-${stamp}.csv`, buildContactsCsv(filtered));

  const set = (k: keyof PartnerContactInput) => (e: { target: { value: string } }) =>
    setEditing((cur) => cur && { ...cur, form: { ...cur.form, [k]: e.target.value } });
  const open = (c?: PartnerContact) => setEditing(c
    ? { id: c.id, form: { company: c.company, category: c.category ?? "", name: c.name, role: c.role ?? "", phone: c.phone ?? "", mobile: c.mobile ?? "", email: c.email ?? "", notes: c.notes ?? "" } }
    : { id: null, form: { ...EMPTY } });
  const canSave = !!editing && editing.form.company.trim() !== "" && editing.form.name.trim() !== "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("nav.contacts")}
        title={t("contacts.title")}
        actions={
          <>
            <Button variant="outline" onClick={exportVcf} disabled={filtered.length === 0} title={t("contacts.vcfHint")}>
              <Contact /> {t("contacts.exportVcf")}
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}><Download /> CSV</Button>
            <Button onClick={() => open()}><Plus /> {t("contacts.new")}</Button>
          </>
        }
      />
      <p className="text-sm text-muted-foreground -mt-2 max-w-2xl">{t("contacts.intro")}</p>

      <SearchBox value={q} onChange={setQ} placeholder={t("contacts.search")} />

      {isLoading ? (
        <p className="py-16 text-center text-muted-foreground"><Loader2 className="inline h-6 w-6 animate-spin" /></p>
      ) : error ? (
        <p className="py-16 text-center text-destructive">{(error as Error).message}</p>
      ) : groups.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-4">
          <p>{contacts.length === 0 ? t("contacts.empty") : t("contacts.none")}</p>
          {contacts.length === 0 && <Button onClick={() => open()}><Plus /> {t("contacts.new")}</Button>}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map(([company, people]) => (
            <section key={company} className="bg-card border border-border rounded-lg overflow-hidden">
              <header className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-3">
                <h2 className="font-semibold text-[17px] tracking-tight break-words">{company}</h2>
                {people[0].category && <span className="eyebrow shrink-0">{people[0].category}</span>}
              </header>
              <ul>
                {people.map((c) => (
                  <li key={c.id} className="px-4 py-3 border-b border-muted last:border-0 flex gap-3">
                    <div className="min-w-0 flex-1 flex flex-col gap-1">
                      <p className="font-medium break-words">{c.name}{c.role && <span className="text-muted-foreground font-normal"> · {c.role}</span>}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:underline underline-offset-4"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{c.phone}</a>}
                        {c.mobile && <a href={`tel:${c.mobile.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:underline underline-offset-4"><Smartphone className="h-3.5 w-3.5 text-muted-foreground" />{c.mobile}</a>}
                        {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:underline underline-offset-4 break-all"><Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{c.email}</a>}
                      </div>
                      {c.notes && <p className="text-sm text-muted-foreground whitespace-pre-line">{c.notes}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => open(c)} aria-label={t("contacts.edit")} title={t("contacts.edit")}>
                      <Pencil />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold tracking-tight">{editing?.id ? t("contacts.edit") : t("contacts.new")}</DialogTitle>
            <DialogDescription>{t("contacts.formHint")}</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              id="contact-form"
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => { e.preventDefault(); if (canSave) save.mutate(); }}
            >
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="pc-company">{t("contacts.company")} *</Label>
                <Input id="pc-company" list="pc-companies" value={editing.form.company} onChange={set("company")} placeholder="DHL Express Italy" required />
                <datalist id="pc-companies">{companies.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pc-name">{t("contacts.name")} *</Label>
                <Input id="pc-name" value={editing.form.name} onChange={set("name")} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pc-role">{t("contacts.role")}</Label>
                <Input id="pc-role" value={editing.form.role ?? ""} onChange={set("role")} placeholder="Account manager" />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="pc-category">{t("contacts.category")}</Label>
                <Input id="pc-category" list="pc-categories" value={editing.form.category ?? ""} onChange={set("category")} />
                <datalist id="pc-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pc-phone">{t("contacts.phone")}</Label>
                <Input id="pc-phone" type="tel" value={editing.form.phone ?? ""} onChange={set("phone")} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pc-mobile">{t("contacts.mobile")}</Label>
                <Input id="pc-mobile" type="tel" value={editing.form.mobile ?? ""} onChange={set("mobile")} />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="pc-email">E-mail</Label>
                <Input id="pc-email" type="email" value={editing.form.email ?? ""} onChange={set("email")} />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="pc-notes">{t("contacts.notes")}</Label>
                <Textarea id="pc-notes" rows={3} value={editing.form.notes ?? ""} onChange={set("notes")} placeholder={t("contacts.notesHint")} />
              </div>
            </form>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {editing?.id ? (
              <Button variant="ghost" className="text-destructive" disabled={remove.isPending}
                onClick={() => { if (window.confirm(t("contacts.confirmRemove", { name: editing.form.name }))) remove.mutate(editing.id!); }}>
                {t("contacts.remove")}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>{t("Cancel")}</Button>
              <Button type="submit" form="contact-form" disabled={!canSave || save.isPending}>
                {save.isPending && <Loader2 className="animate-spin" />} {t("Save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
