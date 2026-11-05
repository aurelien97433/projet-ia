import { cn } from "@/lib/utils";

type TextAreaFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  textareaProps: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: React.Ref<HTMLTextAreaElement> };
};

// Zone de texte (EXPERIENCE.md, Formulaire) : mêmes règles que FormField (libellé visible, « * »,
// erreur liée par aria-describedby, aria-invalid).
export function TextAreaField({ id, label, required, error, textareaProps }: TextAreaFieldProps) {
  const errorId = error ? `${id}-erreur` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <textarea
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...textareaProps}
        className={cn(
          "min-h-60 w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] text-foreground",
          error && "border-destructive",
          textareaProps.className,
        )}
      />
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
