import { forwardRef, useId } from "react";

type ErrorAlertProps = {
  title: string;
  children?: React.ReactNode;
  // Bouton « Réessayer » ou autre action, quand l'écran en prévoit une.
  action?: React.ReactNode;
  // false : alerte affichée sans être annoncée (sans role="alert"), ex. panne ancienne d'un fil.
  live?: boolean;
  // Story 5.10 (Q3 = A, alertes lues deux fois) : true quand l'écran déplace le focus sur l'alerte dès
  // son apparition. Le focus suffit alors à la faire lire : pas de role="alert" (sinon elle est
  // annoncée deux fois), mais un groupe nommé par son titre et décrit par son texte.
  focused?: boolean;
};

// Alerte d'erreur (DESIGN.md, error-alert) : fond destructive-soft, titre en destructive,
// texte courant en foreground, role="alert" pour être annoncée immédiatement, sauf si elle reçoit le
// focus (focused) ou n'est pas annoncée (live = false).
export const ErrorAlert = forwardRef<HTMLDivElement, ErrorAlertProps>(function ErrorAlert(
  { title, children, action, live = true, focused = false },
  ref,
) {
  const id = useId();
  const titleId = `${id}-titre`;
  const textId = `${id}-texte`;
  const role = focused ? "group" : live ? "alert" : undefined;
  return (
    <div
      ref={ref}
      data-error-alert
      role={role}
      aria-labelledby={focused ? titleId : undefined}
      aria-describedby={focused && children ? textId : undefined}
      tabIndex={-1}
      className="rounded-lg border border-destructive-line bg-destructive-soft p-4 text-sm text-foreground"
    >
      <p id={titleId} className="font-semibold text-destructive">
        {title}
      </p>
      {children ? (
        <div id={textId} className="mt-1">
          {children}
        </div>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
});
