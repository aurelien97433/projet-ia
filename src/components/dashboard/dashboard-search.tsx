"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SEARCH_QUERY_MAX_LENGTH } from "@/lib/schemas/search";
import { searchHref } from "@/lib/search-links";
import { texts } from "@/lib/texts";

import { DASHBOARD_SEARCH_FIELD_ID } from "./constants";

const t = texts.dashboard;

// Champ de Recherche du Tableau de bord (E3, story 4.1b) : libellé masqué, Entrée ou « Rechercher »
// ouvre /recherche?q=… ; une Requête vide ne fait rien. Le focus initial est donné par le titre de
// l'écran (PageTitle, focusTargetId) : jamais au premier chargement complet.
export function DashboardSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const fieldRef = useRef<HTMLInputElement>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const href = searchHref(value);
    if (href) router.push(href);
    else fieldRef.current?.focus();
  }

  return (
    <form role="search" onSubmit={submit} className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-1">
      <label htmlFor={DASHBOARD_SEARCH_FIELD_ID} className="sr-only">
        {t.searchLabel}
      </label>
      <input
        ref={fieldRef}
        id={DASHBOARD_SEARCH_FIELD_ID}
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t.searchPlaceholder}
        maxLength={SEARCH_QUERY_MAX_LENGTH}
        autoComplete="off"
        enterKeyHint="search"
        className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-[15px] text-foreground sm:flex-1"
      />
      <Button type="submit" variant="outline" className="h-10 w-full sm:w-auto">
        {t.searchSubmit}
      </Button>
    </form>
  );
}
