# Mesure : traitement d'un Document d'environ 60 000 caractères

Exigence NFR-3 : un Document de 20 pages (environ 60 000 caractères) est traité en moins d'une minute. Mesure réalisée en production, seule étape de cette story avec un vrai appel à OpenAI, qui prouve aussi la clé distante.

**Protocole.**
1. Générer le texte : `npx tsx scripts/generate-measure-note.ts`.
2. Le copier, en UTF-8 (sans cette option, PowerShell 5.1 abîme les accents) : `Get-Content "$env:TEMP\nexamind-mesure-60000.txt" -Raw -Encoding UTF8 | Set-Clipboard`.
3. Le coller dans une nouvelle Note sur Vercel, puis enregistrer.
4. Relever `duration_ms`, `embed_ms`, `complete_ms` et `passages` de l'événement `process_document_work_done`, dans les journaux de la fonction `process-document` sur Supabase.

`duration_ms` couvre le travail d'arrière-plan, de la lecture du texte à la fin de `complete_processing`. La durée complète depuis l'enregistrement s'obtient dans l'éditeur SQL de Supabase : `select updated_at - processing_started_at from documents order by created_at desc limit 1`.

**Coût estimé.** Environ 15 000 tokens à 0,02 $ pour 1 million de tokens, soit environ 0,0003 $ (tarif vérifié le 2026-11-03, à revérifier avant la démonstration).

| Date | Environnement | Caractères | Passages | `embed_ms` | `complete_ms` | `duration_ms` | Durée complète | Résultat |
|---|---|---|---|---|---|---|---|---|
| À compléter après le déploiement | Production | 60 000 | | | | | | |
