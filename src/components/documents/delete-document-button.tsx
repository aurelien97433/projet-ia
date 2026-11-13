"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteDocumentAction } from "@/app/(app)/documents/[id]/actions";
import { useDocumentStatus } from "@/components/documents/document-status-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { texts } from "@/lib/texts";

const LIBRARY_HREF = "/bibliotheque";

const t = texts.deleteDocument;

// « Supprimer » (Auteur seul, story 3.4) : confirmation par AlertDialog, focus par défaut sur
// « Annuler » (Radix). Succès : notification et retour à la Bibliothèque. Document déjà supprimé :
// état « supprimé » de la page. Refus ou panne : notification d'erreur, rien ne change.
export function DeleteDocumentButton({ documentId, title, describedBy }: { documentId: string; title: string; describedBy?: string }) {
  const router = useRouter();
  const { markDeleted } = useDocumentStatus();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirm() {
    if (deleting) return;
    setDeleting(true);
    try {
      const result = await deleteDocumentAction(documentId);
      if (result.status === "ok") {
        toast(t.done);
        router.push(LIBRARY_HREF);
        // Reste occupé jusqu'au changement d'écran : un second clic n'a plus d'objet.
        return;
      }
      if (result.error.code === "NOT_FOUND") markDeleted();
      else if (result.error.code === "UNAUTHENTICATED") router.refresh();
      else toast.error(result.error.message);
    } catch {
      toast.error(t.failed);
    }
    setDeleting(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {/* Déclencheur Radix : le focus lui revient à la fermeture du dialogue. Occupé : aucune ouverture. */}
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-disabled={deleting || undefined}
          aria-describedby={describedBy}
          className={deleting ? "cursor-not-allowed opacity-70" : undefined}
          onClick={(event) => {
            if (deleting) event.preventDefault();
          }}
        >
          {deleting ? t.deleting : t.action}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{t.title(title)}</AlertDialogTitle>
        <AlertDialogDescription>{t.text}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={confirm}>
            {t.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
