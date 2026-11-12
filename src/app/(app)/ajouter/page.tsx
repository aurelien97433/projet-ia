import type { Metadata } from "next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { texts } from "@/lib/texts";
import { FileForm } from "./file-form";
import { NoteForm } from "./note-form";

export const metadata: Metadata = {
  title: `${texts.titles.addDocument} · ${texts.app.name}`,
};

// E8 · Ajouter (FR-4, FR-5). Onglets « Note » (par défaut) et « Fichier » (story 2.6a). Le titre ne
// prend pas le focus : à l'ouverture, il va sur « Titre » (EXPERIENCE.md).
export default function AddDocumentPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl leading-tight font-[650] text-foreground">{texts.titles.addDocument}</h1>
      <p className="text-xs font-medium text-muted-foreground">{texts.common.requiredLegend}</p>
      <Tabs defaultValue="note">
        <TabsList aria-label={texts.titles.addDocument}>
          <TabsTrigger value="note">{texts.addDocument.noteTab}</TabsTrigger>
          <TabsTrigger value="file">{texts.addDocument.fileTab}</TabsTrigger>
        </TabsList>
        {/* Onglets toujours montés (masqués quand inactifs) : changer d'onglet ne perd ni la saisie ni le
            fichier déposé, et n'interrompt pas un dépôt en cours. */}
        <TabsContent value="note" forceMount className="data-[state=inactive]:hidden">
          <NoteForm />
        </TabsContent>
        <TabsContent value="file" forceMount className="data-[state=inactive]:hidden">
          <FileForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
