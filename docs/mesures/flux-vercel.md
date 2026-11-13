# Flux sur Vercel — essai léger (story 5.0)

Rapport de l'essai du flux Edge Function → Route Handler Next.js → navigateur sur un déploiement de **prévisualisation** Vercel Hobby (branche `probe/5-0-stream`, commit `b0da814`), avant toute story Assistant (AD-16). La story 5.5 complétera ce fichier avec la mesure du vrai flux de `chat`.

## Conditions

- Fonction `stream-probe` (Supabase, projet distant `eu-central-1`) : 20 morceaux SSE factices, un toutes les 250 ms, sans IA ni base ; session de Collaborateur exigée.
- Relais `POST /api/stream-probe` (runtime Node, `maxDuration = 60` ; Vercel Hobby autorise jusqu'à 300 s) : variante de base (`text/event-stream`, `Cache-Control: no-cache, no-transform`, corps amont relayé tel quel) ; variante B1 préparée (`?variante=b1` : recopie du flux, `X-Accel-Buffering: no`, `Content-Encoding: identity`), non utilisée.
- Mesure dans le navigateur de l'utilisateur (Chrome, Windows), depuis La Réunion, sur son réseau, le 2026-11-13 vers 06:45 UTC : page `/essai-flux`, un essai de chauffe non compté puis 10 essais.
- Critères par essai : premier morceau < 2 000 ms ; arrivée progressive (20 morceaux, écart médian ≥ 150 ms, au moins 4 000 ms entre le premier et le dernier). Plan B seulement si le flux est mis en tampon ou si la médiane du premier morceau dépasse 5 s (décision Q2 = A).
- Région : tirée de `x-vercel-id` de chaque réponse (attendu : `fra1`).
- Protection Vercel Authentication laissée active ; aucun script, aucun jeton copié.

## Résultats

Résultat copié depuis la page d'essai par l'utilisateur, reproduit tel quel :

## Essai du flux — variante base (2026-11-13T06:44:51.930Z)

- Navigateur : Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36
- Verdict : réussite : 10 essais conformes
- Premier morceau : médiane 760 ms, max 1061 ms

| Essai | HTTP | Morceaux | Premier (ms) | Dernier (ms) | Écart médian (ms) | Étalement reçu (ms) | Étalement émis (ms) | Région | Conforme |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chauffe | 200 | 20 | 1550 | 6414 | 260 | 4864 | 4781 | fra1 | oui |
| 1 | 200 | 20 | 724 | 5484 | 249 | 4760 | 4776 | fra1 | oui |
| 2 | 200 | 20 | 852 | 5536 | 248 | 4684 | 4782 | fra1 | oui |
| 3 | 200 | 20 | 732 | 5489 | 249 | 4757 | 4774 | fra1 | oui |
| 4 | 200 | 20 | 753 | 5885 | 249 | 5132 | 4772 | fra1 | oui |
| 5 | 200 | 20 | 1061 | 5805 | 249 | 4744 | 4774 | fra1 | oui |
| 6 | 200 | 20 | 861 | 5642 | 248 | 4781 | 4779 | fra1 | oui |
| 7 | 200 | 20 | 631 | 5388 | 248 | 4757 | 4775 | fra1 | oui |
| 8 | 200 | 20 | 904 | 5534 | 247 | 4630 | 4772 | fra1 | oui |
| 9 | 200 | 20 | 767 | 5522 | 248 | 4755 | 4776 | fra1 | oui |
| 10 | 200 | 20 | 710 | 5510 | 248 | 4800 | 4775 | fra1 | oui |

Délais de réception de chaque morceau (ms depuis l'envoi) :

- chauffe : 1550, 1781, 2122, 2277, 2537, 2783, 3047, 3359, 3528, 3796, 4045, 4385, 4539, 4895, 5053, 5407, 5547, 5917, 6057, 6414
- 1 : 724, 959, 1211, 1550, 1722, 2063, 2217, 2573, 2731, 3061, 3228, 3477, 3803, 3986, 4311, 4482, 4823, 4993, 5334, 5484
- 2 : 852, 1010, 1364, 1519, 1767, 2015, 2279, 2619, 2789, 3100, 3287, 3643, 3782, 4170, 4294, 4665, 4791, 5039, 5290, 5536
- 3 : 732, 982, 1276, 1492, 1725, 1975, 2303, 2491, 2817, 3001, 3327, 3485, 3745, 3993, 4242, 4491, 4866, 4990, 5258, 5489
- 4 : 753, 983, 1235, 1484, 1732, 2028, 2351, 2491, 2754, 3000, 3371, 3494, 3745, 3993, 4288, 5256, 5271, 5271, 5722, 5885
- 5 : 1061, 1295, 1681, 1804, 2036, 2409, 2548, 2909, 3048, 3418, 3557, 3808, 4055, 4443, 4553, 4804, 5065, 5314, 5563, 5805
- 6 : 861, 1070, 1318, 1563, 1830, 2078, 2403, 2573, 2944, 3072, 3445, 3586, 3833, 4081, 4341, 4591, 4840, 5086, 5395, 5642
- 7 : 631, 876, 1126, 1374, 1688, 1884, 2133, 2381, 2692, 2877, 3141, 3389, 3637, 3947, 4133, 4397, 4643, 4894, 5142, 5388
- 8 : 904, 1041, 1276, 1522, 1769, 2020, 2348, 2534, 2859, 3029, 3277, 3587, 3790, 4114, 4285, 4533, 4918, 5041, 5292, 5534
- 9 : 767, 1001, 1267, 1515, 1763, 2013, 2260, 2523, 2771, 3019, 3267, 3517, 3767, 4030, 4402, 4525, 4773, 5036, 5286, 5522
- 10 : 710, 922, 1169, 1465, 1682, 2039, 2179, 2427, 2675, 2956, 3175, 3426, 3689, 3936, 4199, 4434, 4683, 4930, 5195, 5510

## Analyse

- **Premier morceau** : médiane 760 ms, maximum 1 061 ms sur les 10 essais comptés, tous sous 2 s. La chauffe (1 550 ms) est notée à part (décision Q1 = A) ; elle reste elle aussi sous 2 s.
- **Pas de mise en tampon** : écart médian de 247 à 249 ms entre deux morceaux (émis toutes les 250 ms) ; étalement reçu (4 630 à 4 800 ms, hors essai 4) du même ordre que l'étalement émis (4 772 à 4 782 ms).
- **Région** : `fra1` pour la chauffe et les 10 essais, comme en production.
- **Irrégularité de l'essai 4** : trou de 968 ms entre les morceaux 15 et 16 (4 288 puis 5 256 ms), puis les morceaux 16 à 18 reçus groupés (5 256, 5 271 et 5 271 ms). La fonction a émis sans trou (étalement émis 4 772 ms) et l'écart médian de l'essai reste à 249 ms : **probable variation du réseau**, sans effet sur le verdict.

## Conclusion

**Réussite : 10 essais conformes sur 10.** Vercel Hobby relaie le flux morceau par morceau avec la variante de base, en `fra1`. Ni B1 ni B3 ; B2, impossible avec Cache Components (Next.js 16), n'a pas eu à être tranché.

Pour la story 5.5 : reprendre les réglages de la variante de base (`text/event-stream`, `Cache-Control: no-cache, no-transform`, corps relayé tel quel, runtime Node) pour `app/api/chat`. Le flux factice ne mesure ni la Recherche ni le premier jeton du modèle : le critère de 5.5 (premier affichage < 5 s en médiane) reste à mesurer sur le vrai flux.

## Retrait (2026-11-13)

- `stream-probe` supprimée du projet distant par l'utilisateur (`npx supabase functions delete stream-probe --remote=<réf>`) ; `functions list` n'affiche plus que `process-document` et `semantic-search`.
- Branche distante `probe/5-0-stream` supprimée ; aucun code de l'essai sur `main` (relais, page, fonction, configuration et tests restés sur la branche).
- Le déploiement de prévisualisation reste protégé par Vercel Authentication ; sa page d'essai ne fonctionne plus sans la fonction.
