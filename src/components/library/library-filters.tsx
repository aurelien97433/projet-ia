"use client";

import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { DOCUMENT_CATEGORIES } from "@/lib/documents";
import {
  ALL_CATEGORIES,
  LIBRARY_SORTS,
  MAX_SEARCH_LENGTH,
  type LibraryCategory,
  type LibraryFilters as Filters,
  type LibrarySort,
} from "@/lib/schemas/library";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

const t = texts.library;

const CATEGORY_OPTIONS = [
  { value: ALL_CATEGORIES, label: t.allCategories },
  ...DOCUMENT_CATEGORIES.map((value) => ({ value, label: texts.categories[value] })),
];
const SORT_LABELS: Record<LibrarySort, string> = { recent: t.sortRecent, oldest: t.sortOldest };
const SORT_OPTIONS = LIBRARY_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }));

type LibraryFiltersProps = {
  filters: Filters;
  categoryRef: React.Ref<HTMLSelectElement>;
  onCategoryChange: (category: LibraryCategory) => void;
  onMineChange: (mine: boolean) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: LibrarySort) => void;
};

// Barre de filtres de la Bibliothèque (E6) : listes natives, interrupteur « Mes Documents » et
// recherche par titre. Les filtres se cumulent ; le tri passe par sa liste, jamais par les en-têtes.
export function LibraryFilters({
  filters,
  categoryRef,
  onCategoryChange,
  onMineChange,
  onSearchChange,
  onSortChange,
}: LibraryFiltersProps) {
  return (
    <div role="group" aria-label={t.filtersLabel} className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
      <div className="min-w-0 md:w-52">
        <SelectField
          id="library-category"
          label={t.categoryLabel}
          options={CATEGORY_OPTIONS}
          selectProps={{
            ref: categoryRef,
            value: filters.category,
            onChange: (event) => onCategoryChange(event.target.value as LibraryCategory),
          }}
        />
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={filters.mine}
        onClick={() => onMineChange(!filters.mine)}
        className="inline-flex h-10 items-center gap-2 self-start rounded-md text-sm font-medium text-foreground md:self-end"
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 transition-colors",
            filters.mine ? "border-primary bg-primary" : "border-input bg-background",
          )}
        >
          <span
            className={cn(
              "size-3 rounded-full transition-transform",
              filters.mine ? "translate-x-4 bg-primary-foreground" : "translate-x-0.5 bg-input",
            )}
          />
        </span>
        {t.mine}
      </button>
      <div className="min-w-0 md:flex-1">
        <FormField
          id="library-search"
          label={t.searchLabel}
          inputProps={{
            type: "search",
            autoComplete: "off",
            maxLength: MAX_SEARCH_LENGTH,
            value: filters.search,
            onChange: (event) => onSearchChange(event.target.value),
          }}
        />
      </div>
      <div className="min-w-0 md:w-52">
        <SelectField
          id="library-sort"
          label={t.sortLabel}
          options={SORT_OPTIONS}
          selectProps={{ value: filters.sort, onChange: (event) => onSortChange(event.target.value as LibrarySort) }}
        />
      </div>
    </div>
  );
}
