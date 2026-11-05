import type { Metadata } from "next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { texts } from "@/lib/texts";
import { NoteForm } from "./note-form";

export const metadata: Metadata = {
  title: `${texts.titles.addDocument} · ${texts.app.name}`,
};

// E8 · Ajouter (FR-4). Onglet « Fichier » ajouté avec l'import de fichiers (story 2.6a, décision du
// 2026-11-05). Le titre ne prend pas le focus : à l'ouverture, il va sur « Titre » (EXPERIENCE.md).
export default function AddDocumentPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl leading-tight font-[650] text-foreground">{texts.titles.addDocument}</h1>
      <p className="text-xs font-medium text-muted-foreground">{texts.common.requiredLegend}</p>
      <Tabs defaultValue="note">
        <TabsList aria-label={texts.titles.addDocument}>
          <TabsTrigger value="note">{texts.addDocument.noteTab}</TabsTrigger>
        </TabsList>
        <TabsContent value="note">
          <NoteForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
