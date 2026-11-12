---
title: 'Story 2.6b : Lire le texte des fichiers importés'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: 'd400241e666d4a0081841d86a5ac5fc451a8edf8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `process-document` décode les fichiers importés en UTF-8 non strict (2.6a) : un `.txt` Windows-1252 devient *prêt* avec des « � », un binaire renommé `.txt` devient *prêt* avec du texte illisible, et un texte converti de plus de 1 000 000 octets échoue en erreur temporaire relançable sans fin.

**Approach:** `_shared/rag/extract.ts` lit le fichier en UTF-8 strict (BOM retiré), se replie sur Windows-1252 en cas d'échec, refuse un résultat contenant des caractères de contrôle, et `process-document` contrôle la taille du texte canonique avant `complete_processing` ; chaque refus est une erreur `no_text` définitive, sans relance.

## Boundaries & Constraints

**Always:**
- **Décodage** (`extract.ts`, fonction pure) : `TextDecoder('utf-8', { fatal: true })` (BOM retiré) ; en cas d'échec, `TextDecoder('windows-1252')`. Résultat : `{ ok: true, text }` ou `{ ok: false, reason: 'encoding' }`.
- **Caractères de contrôle** : après le décodage (UTF-8 comme Windows-1252), tout caractère de catégorie `Cc` autre que tabulation, saut de ligne et retour chariot (U+0000–U+0008, U+000B, U+000C, U+000E–U+001F, U+007F, U+0080–U+009F) → `reason: 'encoding'`. Le retour chariot est accepté avant la normalisation des fins de ligne.
- **Messages** (codes en dur dans l'Edge Function, identiques au catalogue) : encodage → « Le texte de ce fichier n'a pas pu être lu (encodage non pris en charge). » ; vide ou fait d'espaces (aucun Passage) → « Ce fichier ne contient aucun texte exploitable. Il ne peut pas être interrogé. » (inchangé). Tous deux en `no_text` par `fail_processing`, donc sans relance (2.5).
- **Taille après conversion** : texte canonique (`normalizeText`) mesuré en octets UTF-8 avant `complete_processing` ; au-delà de 1 000 000 → `no_text` avec le message de Q1 ; jamais d'erreur temporaire.
- Les Notes ne passent pas par le décodage ; leur traitement est inchangé.
- **Fichiers de test réels** dans `tests/fixtures/files/` (petits, versionnés) : `utf8.txt`, `utf8-bom.md`, `windows-1252.txt`, `vide.txt`, `espaces.txt`, `binaire.txt` ; générés une fois par un script versionné et documenté. Le cas de près de 1 Mo est généré à l'exécution du test, jamais versionné.
- **Tests** : unitaires (`extract.ts`, sur les fichiers de test et des octets ciblés) ; intégration sur Supabase local (dépôt réel, import, traitement par la fonction locale : prêt avec accents, `no_text` et messages, taille après conversion) ; e2e (binaire importé : message affiché, aucune relance proposée).

**Décisions du 2026-11-12 :**
- **Q1 = A.** Texte canonique de plus de 1 000 000 octets après conversion : erreur définitive `no_text`, sans relance, avec « Une fois converti, le texte de ce fichier dépasse 1 Mo, la taille maximale. Il ne peut pas être interrogé. » La limite de 1 000 000 octets reste unique (aucune migration).
- Story gardée entière.
- **Limites connues, consignées** : (1) un fichier dans un encodage proche de Windows-1252 (ISO-8859-15, Mac Roman…) sans caractère de contrôle est lu comme Windows-1252 : quelques caractères peuvent être faux, sans refus ; (2) un fichier binaire sans aucun octet de contrôle (cas extrêmement rare) n'est pas détecté et devient *prêt* avec un texte illisible.
- Le message d'encodage doit être distinct, à l'écran, du message « aucun texte exploitable » (test).
- Le test de la limite après conversion utilise un fichier généré pendant le test, jamais versionné.

**Never:** changement de la limite de 1 000 000 octets du bucket ou du contrôle avant envoi ; détection d'autres encodages (UTF-16, ISO-8859-15…) ; Markdown interprété ; bouton « Supprimer » (3.4) ; story 2.7 ; suppression de `procedure-test.md` en production ; commit, push ou `deploy:supabase` sans validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| UTF-8 | `utf8.txt` (« Procédure congés ») | *prêt*, accents corrects | — |
| UTF-8 avec BOM | `utf8-bom.md` | *prêt*, BOM absent du texte et des positions | — |
| Windows-1252 | `windows-1252.txt` (« é », « à », « € », « œ ») | *prêt*, accents corrects | — |
| Vide / espaces | `vide.txt`, `espaces.txt`, BOM seul | *en erreur* `no_text`, message « aucun texte exploitable » | aucune relance |
| Binaire | `binaire.txt` (octets nuls, en-tête PNG) | *en erreur* `no_text`, message d'encodage | aucune relance |
| Contrôle en UTF-8 valide | texte UTF-8 contenant U+0000 ou U+001B | *en erreur* `no_text`, message d'encodage | aucune relance |
| Trop long converti | Windows-1252 de 1 000 000 octets riche en accents (> 1 000 000 octets en UTF-8) | *en erreur* `no_text`, message de Q1 | aucune relance |
| Limite exacte | texte canonique de 1 000 000 octets | *prêt* | — |

</frozen-after-approval>

## Code Map

- `supabase/functions/_shared/rag/extract.ts` -- aujourd'hui `decodeFileText` (UTF-8 non strict, 2.6a) : à remplacer par le décodage complet.
- `supabase/functions/_shared/processing.ts:88-93` -- `readDocumentText` appelle `decodeFileText` pour un fichier : renvoyer aussi le refus d'encodage (le décodage ne lève pas d'exception).
- `supabase/functions/process-document/index.ts:22,32-45` -- `NO_TEXT_MESSAGE`, chemin `no_text` existant (`failProcessing(attempt, "no_text", …)`), à étendre : refus d'encodage et taille après conversion.
- `supabase/functions/_shared/rag/normalize.ts` -- `normalizeText` (texte canonique mesuré).
- `supabase/migrations/20261105105410_documents.sql` -- contrainte `documents_content_size` (1 000 000 octets), à modifier seulement si Q1 = B.
- `src/lib/texts.ts` -- `documentStatus` : vérifier que le message d'encodage et celui de Q1 y figurent (catalogue unique pour l'interface et les tests).
- `tests/unit/processing-file.test.ts`, `tests/unit/process-document.test.ts` -- à étendre ; `tests/integration/file-import.test.ts` -- modèle de dépôt réel et d'appel de `process-document` local ; `tests/e2e/ajouter-fichier.spec.ts` -- modèle d'import par l'interface.
- `StatusBanner` (2.5) : `no_text` affiche le message, sans relance ; « Supprimer » arrive en 3.4.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/generate-file-fixtures.ts`, `tests/fixtures/files/*` -- fichiers de test réels.
- [x] `supabase/functions/_shared/rag/extract.ts` -- décodage strict, repli, contrôle.
- [x] `supabase/functions/_shared/processing.ts`, `supabase/functions/process-document/index.ts` -- refus d'encodage et taille après conversion en `no_text`.
- [x] `src/lib/texts.ts` -- messages du catalogue.
- [x] `tests/unit/extract.test.ts`, `tests/unit/processing-file.test.ts`, `tests/unit/process-document.test.ts` -- matrice.
- [x] `tests/integration/file-decoding.test.ts` -- fichiers réels déposés et traités par la fonction locale.
- [x] `tests/e2e/ajouter-fichier.spec.ts` -- binaire importé : message, aucune relance.

**Acceptance Criteria:**
- Given un fichier *en erreur* `no_text`, when l'Auteur ouvre sa page, then le message s'affiche sans « Relancer le traitement » (« Supprimer » arrive avec 3.4).
- Given `npm test` et `build:ci`, when ils se terminent, then aucun n'appelle OpenAI et aucun secret n'apparaît.

## Spec Change Log

## Review Triage Log

Revue ciblée faite dans la session, sans les trois relecteurs (demande de l'utilisateur) : décodage et cas limites.

| Constat | Verdict | Suite |
| --- | --- | --- |
| BOM UTF-8 suivi d'octets invalides : le repli Windows-1252 affichait « ï»¿ » en tête. | low | patch : BOM retiré avant le repli ; test. |
| Octet nul ou U+001B valides en UTF-8 : sans contrôle après le décodage UTF-8, un binaire « UTF-8 valide » devenait *prêt*. | medium | patch dès l'écriture : contrôle appliqué aux deux décodages ; tests. |
| Octets non attribués de Windows-1252 (0x81, 0x8D, 0x8F, 0x90, 0x9D) : décodés en caractères C1. | low | refusés par le contrôle (C1 inclus) ; test. |
| Texte de 1 000 000 octets exactement après conversion. | false | accepté (test unitaire : 500 000 « é » → *prêt* jusqu'au bout). |
| Fichier UTF-8 avec un seul octet invalide : tout le fichier est relu en Windows-1252, les accents s'affichent « Ã© ». | low | limite connue, consignée (conforme à AD-8 : repli global, pas de correction octet par octet). |
| Le paragraphe `no_text` commence par un « ▲ » décoratif : correspondance exacte impossible en e2e. | false | test ajusté (correspondance partielle) ; affichage correct. |
| Fichiers de test convertis par git (`core.autocrlf = true`) : octets modifiés au commit. | medium | patch : `.gitattributes` (`tests/fixtures/files/** binary`) ; test d'égalité octet par octet avec le script. |

## Verification

**Commands:**
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run test:e2e` -- expected : tout vert.

## Implementation Notes

- **Décodage** : `extract.ts` renvoie `{ ok, text, encoding }` ou `{ ok: false, reason: "encoding" }` ; contrôle `Cc` hors `	`, `
`, `` après les deux décodages ; BOM retiré (UTF-8 strict, et avant le repli).
- **Traitement** : `readDocumentText` signale `unreadable: "encoding"` sans exception ; `process-document` enregistre trois causes `no_text` (encodage, trop long une fois converti, vide), toutes définitives, avec des messages identiques au catalogue (`noText`, `noTextEncoding`, `noTextTooLarge`, test). Contrôle de taille avant `complete_processing` (texte canonique, 1 000 000 octets).
- **Fichiers de test** : `scripts/generate-file-fixtures.ts` → `tests/fixtures/files/` (6 fichiers, 0 à 97 octets) ; `.gitattributes` les protège de la conversion des fins de ligne. Le fichier de 1 000 000 octets est généré pendant le test d'intégration.
- **Limites connues** (décisions du 2026-11-12) : encodages proches de Windows-1252 lus comme Windows-1252 ; binaire sans octet de contrôle non détecté ; fichier UTF-8 avec un octet invalide relu entièrement en Windows-1252.
- Pas de migration ; `process-document` à redéployer (`deploy:supabase`).
