import { forwardRef } from "react";

type ErrorAlertProps = {
  title: string;
  children?: React.ReactNode;
  // Bouton « Réessayer » ou autre action, quand l'écran en prévoit une.
  action?: React.ReactNode;
};

// Alerte d'erreur (DESIGN.md, error-alert) : fond destructive-soft, titre en destructive,
// texte courant en foreground, role="alert" pour être annoncée immédiatement.
export const ErrorAlert = forwardRef<HTMLDivElement, ErrorAlertProps>(function ErrorAlert(
  { title, children, action },
  ref,
) {
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-lg border border-destructive-line bg-destructive-soft p-4 text-sm text-foreground"
    >
      <p className="font-semibold text-destructive">{title}</p>
      {children ? <div className="mt-1">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
});
