import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";

// Au-delà de 10 s de chargement : message et rechargement complet de la page (EXPERIENCE.md).
// Volontairement sans JavaScript : à l'ouverture directe d'une URL, React n'hydrate pas le contenu de
// repli d'une frontière Suspense encore en attente, un minuteur client n'y démarrerait jamais. Le délai
// est donc porté par le CSS (.slow-loading-notice) et le rechargement par un lien vers l'URL courante.
export function SlowLoadingNotice() {
  return (
    // Zone toujours présente, seul son contenu apparaît à 10 s : un lecteur d'écran n'annonce que les
    // changements d'une zone déjà là.
    <div role="status">
      <div className="slow-loading-notice flex flex-col items-start gap-3 text-sm text-foreground">
        <p>{texts.document.loadingSlow}</p>
        <Button asChild variant="outline">
          <a href="">{texts.document.loadingRetry}</a>
        </Button>
      </div>
    </div>
  );
}
