import { Button } from "@/components/ui/button";

type SubmitButtonProps = {
  busy: boolean;
  label: string;
  busyLabel: string;
  // Inactif sans être occupé (ex. « Importer » pendant le dépôt du fichier) : même rendu aria-disabled,
  // libellé inchangé.
  inactive?: boolean;
};

// Bouton d'envoi (EXPERIENCE.md, Bouton d'envoi) : état occupé dès la première activation,
// libellé d'attente, aria-disabled (jamais disabled, pour ne pas perdre le focus).
// La seconde activation est ignorée par le formulaire, qui vérifie l'état avant d'envoyer.
export function SubmitButton({ busy, label, busyLabel, inactive = false }: SubmitButtonProps) {
  return (
    <Button type="submit" aria-disabled={busy || inactive || undefined} className="h-10 w-full aria-disabled:opacity-80">
      {busy ? busyLabel : label}
    </Button>
  );
}
