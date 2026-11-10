import { cn } from "@/lib/utils";

type SelectFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  // Libellé d'invite non sélectionnable ; sans lui, la première option est la valeur par défaut.
  placeholder?: string;
  options: readonly { value: string; label: string }[];
  selectProps: React.SelectHTMLAttributes<HTMLSelectElement> & { ref?: React.Ref<HTMLSelectElement> };
};

// Liste de choix native (clavier et lecteurs d'écran natifs), stylée comme les champs. Avec
// `placeholder`, aucune valeur par défaut : la première option est le libellé d'invite, non sélectionnable.
export function SelectField({ id, label, required, error, placeholder, options, selectProps }: SelectFieldProps) {
  const errorId = error ? `${id}-erreur` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...selectProps}
        className={cn(
          "h-10 w-full rounded-md border border-input bg-background px-3 text-[15px] text-foreground sm:max-w-xs",
          error && "border-destructive",
          selectProps.className,
        )}
      >
        {placeholder !== undefined ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
