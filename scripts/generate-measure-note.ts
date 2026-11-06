// Génère le texte de la Note de mesure (story 2.4, NFR-3) : environ 60 000 caractères de français
// fictif, écrits hors du dépôt. Lancement : npx tsx scripts/generate-measure-note.ts
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SUBJECTS = [
  "La procédure de facturation",
  "Le suivi des demandes clients",
  "La gestion des congés",
  "Le contrôle qualité des livraisons",
  "La revue mensuelle des projets",
  "L'accueil des nouveaux collaborateurs",
];
const ACTIONS = [
  "doit être validé par le responsable d'équipe avant la fin de la semaine",
  "est consigné dans le registre partagé de NexaWorks",
  "fait l'objet d'un point de contrôle à chaque changement de version",
  "repose sur une liste de vérifications relue chaque trimestre",
  "est transmis au service concerné dans un délai de deux jours ouvrés",
];
const DETAILS = [
  "En cas de doute, le référent de l'équipe tranche et note sa décision.",
  "Toute exception est signalée au plus tôt, avec sa raison et sa date.",
  "Les documents associés restent disponibles dans la Base commune.",
  "Un rappel automatique est envoyé trois jours avant l'échéance.",
];

// Texte déterministe : la même mesure peut être rejouée à l'identique.
export function buildMeasureText(targetLength: number): string {
  const paragraphs: string[] = [];
  let length = 0;
  for (let index = 0; length < targetLength; index += 1) {
    const sentences = [0, 1, 2, 3, 4].map((offset) => {
      const position = index * 5 + offset;
      const subject = SUBJECTS[position % SUBJECTS.length];
      const action = ACTIONS[(position * 3) % ACTIONS.length];
      return `${subject} ${action}. ${DETAILS[position % DETAILS.length]}`;
    });
    const paragraph = `Section ${index + 1}. ${sentences.join(" ")}`;
    paragraphs.push(paragraph);
    length += paragraph.length + 2;
  }
  return paragraphs.join("\n\n").slice(0, targetLength);
}

function main(): void {
  const file = path.join(tmpdir(), "nexamind-mesure-60000.txt");
  const text = buildMeasureText(60_000);
  writeFileSync(file, text, "utf8");
  console.log(`Note de mesure : ${file} (${text.length} caractères)`);
}

// Exécuté seulement en ligne de commande ; casse de la lettre de lecteur ignorée sous Windows.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? invokedPath.toLowerCase() === modulePath.toLowerCase() : invokedPath === modulePath) {
  main();
}
