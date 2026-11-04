import { cn } from "@/lib/utils";

type FormFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  // Contenu affiché sous le message d'erreur (ex. lien « Se connecter »).
  errorAction?: React.ReactNode;
  // Élément placé à droite du champ (ex. bouton « Afficher le mot de passe »).
  trailing?: React.ReactNode;
  inputProps: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> };
};

// Champ de formulaire (EXPERIENCE.md, Formulaire) : libellé visible, « * » si obligatoire,
// aide et erreur liées par aria-describedby, aria-invalid en cas d'erreur.
export function FormField({ id, label, required, help, error, errorAction, trailing, inputProps }: FormFieldProps) {
  const helpId = help ? `${id}-aide` : undefined;
  const errorId = error ? `${id}-erreur` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...inputProps}
          className={cn(
            "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-[15px] text-foreground",
            error && "border-destructive",
            inputProps.className,
          )}
        />
        {trailing}
      </div>
      {help ? (
        <p id={helpId} className="text-xs font-medium text-muted-foreground">
          {help}
        </p>
      ) : null}
      {error ? (
        <div id={errorId} className="text-sm text-destructive">
          <p>{error}</p>
          {errorAction}
        </div>
      ) : null}
    </div>
  );
}
