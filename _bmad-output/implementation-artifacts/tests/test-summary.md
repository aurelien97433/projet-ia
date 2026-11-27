# Test Automation Summary — bmad-qa-generate-e2e-tests (2026-11-27)

Framework : Playwright (existant). Exécution : pile locale seulement (`npx playwright test tests/e2e/shell.spec.ts`), aucun test en production.

## Périmètre

Focus après le menu mobile (375 px) : correctifs R11 et R73-F13 de l'audit de sécurité (story 7.8), couverts jusqu'ici par des tests unitaires seulement. Choisi avec l'utilisateur parce que peu couvert ; les exemples envisagés d'abord (suppression, Recherche sans résultat) avaient déjà 6 et 2 tests e2e.

## Generated Tests

### API Tests
- Aucun : périmètre sans API (comportement du navigateur).

### E2E Tests
- [x] tests/e2e/shell.spec.ts — « menu : l'entrée de l'écran courant ferme le menu sans naviguer ; l'écran suivant reçoit le focus de changement d'écran » : réussi ; échoue avec le code d'avant le correctif (`7fa6440`, fichiers du shell remis ensuite).
- [x] tests/e2e/shell.spec.ts — « menu : après une navigation par le menu (focus sur ☰), l'écran suivant reçoit de nouveau le focus » : réussi.
- [x] tests/e2e/shell.spec.ts — « D87 (défaut connu) : retour sur l'écran du premier chargement » : échec attendu (`test.fail`).

## Résultat

`shell.spec.ts`, deux largeurs : 25 réussis (dont D87 en échec attendu), 9 ignorés par conception (tests propres à une largeur), 0 échec.

## Défaut trouvé

**D87** (basse, accessibilité, antérieur à la 7.8) : revenir sur l'écran du premier chargement (ex. Bibliothèque → Tableau de bord → Bibliothèque) ne lui donne pas le focus de changement d'écran, sur ordinateur comme à 375 px (confirmé par un test temporaire sur ordinateur, supprimé ensuite). Cause probable : Next 16 garde l'écran déjà affiché et `PageTitle` y conserve sa décision « premier chargement » (`useRef`). Décision de l'utilisateur : consigné, non corrigé avant le rendu.

## Correction d'un test, pas de l'application

Premier jet : focus attendu sur le titre du Tableau de bord. Faux : cet écran confie le focus à son champ de Recherche (`focusTargetId`). Attente corrigée.

## Coverage

- Focus après le menu mobile : 3 cas e2e (écran courant, écran suivant, retour sur l'écran du premier chargement).

## Next Steps

- Corriger D87 après le rendu ; le test D87 échouera alors (échec attendu non tenu) et devra perdre son `test.fail`.
