# Tests de caractérisation — Sensations Macarons

---

## ⚖️ CONTRAT DE LIVRAISON — la règle qui garde le filet vivant

> **Toute évolution du comportement de l'app s'accompagne de la mise à jour de ses
> tests, DANS LA MÊME LIVRAISON (le même zip).** Jamais après, jamais « plus tard ».

C'est la seule règle qui empêche le filet de se périmer. Un filet qui ne suit pas les
évolutions du code finit par tester une version fantôme, échoue pour de mauvaises
raisons, et on apprend à ignorer ses alertes — le jour d'une vraie régression, on ne
la voit plus. Un test qu'on n'écoute plus est pire que pas de test.

**Trois réflexes à chaque livraison :**

1. **Nouvelle fonction de calcul ?** → on lui écrit son test dans le même zip.
   (Le filet ne surveille que ce qu'on lui a appris ; une fonction sans test est un
   angle mort silencieux.)
2. **Changement d'une règle métier existante ?** → on met à jour l'assertion qui la
   fige, dans le même zip, pour verrouiller la **nouvelle** règle voulue.
3. **Avant tout envoi sur GitHub** → `node tests/run-all.js` doit être **vert**.

**Pourquoi ça marche techniquement :** le filet ne contient AUCUNE copie figée du code.
À chaque exécution, `_extract.js` relit `app.js` **en direct** et teste la version
actuelle de chaque fonction. Ce qui est figé, ce n'est pas le code — c'est le
**comportement attendu**. Donc un refactor qui ne change pas le résultat passe au vert
tout seul, sans qu'on touche au test. Seul un changement de comportement fait réagir le
filet — et c'est exactement à ce moment qu'on veut être prévenu.

**Ce qu'un test vert garantit — et ne garantit pas :**
- ✅ « Ce qui est couvert ne s'est pas mis à régresser. »
- ❌ PAS « toute l'app est correcte » : seule la couverture qu'on a écrite est surveillée.
  Étendre cette couverture à chaque nouveauté est notre travail, pas celui du filet.

---

## À quoi ça sert

Ce dossier contient un **filet de sécurité** pour le refactoring à venir. Avant de
nettoyer, découper ou optimiser le monolithe `app.js` (~60 000 lignes), on a besoin
de garantir qu'aucune modification ne change silencieusement un calcul métier.

Un *test de caractérisation* ne juge pas si un calcul est « juste » dans l'absolu :
il **photographie le comportement actuel** de l'app et le fige. Si un futur changement
altère ce comportement, le test échoue immédiatement — on sait qu'on a introduit une
régression, avant même de livrer.

C'est la première brique posée volontairement : on installe le filet **avant** de
toucher à la structure. Découper le code d'abord, sans filet, serait l'inverse de la
prudence.

## Ce qui est couvert

### Vague 1 — briques de calcul pures (`characterization.test.js`, 38 assertions)

Fonctions pures et déterministes, réutilisées partout — une régression y ferait le
plus de dégâts :

- `money2`, `round3` — arrondis monétaires et de stock (garde `isFinite`, audit A19)
- `today`, `ymdLocal`, `ymOf` — dates en heure **locale** (anti-décalage UTC, audits A1/A12)
- `monthKey` — clé de mois `YYYY-MM`, y compris pour les dates ISO horodatées
- `isFreezer` — distinction frigo / congélateur (table `EMPLACEMENTS`)
- `computeDlc` — DLC : +7 j au frigo, +4 mois au congélateur, en local (audit A12)
- `peekFactureNumero` — aperçu du prochain numéro de facture, sans le consommer

### Vague 2 — famille « commande » (`order.test.js`, 27 assertions)

Les helpers qui lisent une commande et en déduisent l'encaissement. Ils alimentent
**toute la comptabilité** (CA encaissé, cotisations, créances) :

- `paiementsDe` — registre des paiements, y compris legacy « Payé » et héritage du
  moyen de règlement (audits A7, A10)
- `orderPaid`, `orderBalance` — montant encaissé et solde restant
- `orderPayStatus` — statut dérivé (Payé / Partiel / En attente), tolérance d'arrondi
- `estReprise` (+ `orderToLines`) — détection des reprises d'historique, **exclues du
  CA** pour ne pas double-déclarer à l'URSSAF (audit A4)

**Total : 65 assertions.**

### Vague 3 — cœur comptable (`accounting.test.js`, 32 assertions)

`computeAccounting`, le calcul qui pilote la **base de déclaration URSSAF** (comptabilité
de trésorerie). Testé via un **faux Dexie en mémoire** (8 tables) avec coûts matière
neutralisés (`recipes = []`), pour figer au centime :
- l'agrégation des encaissements par mois (cash basis) et par mode de paiement ;
- le CA facturé (à la date de commande) vs encaissé (à la date de paiement) ;
- l'**exclusion des reprises d'historique** du CA et des cotisations (anti double-
  déclaration URSSAF, audit A4) ;
- les créances clients (soldes restants) ;
- l'intégration des ventes de marché clôturées (fond de caisse déduit, ventilation
  Espèces/Carte), et l'ignorance des marchés non clos ;
- le filtre par période (un paiement hors période n'est pas compté) ;
- la robustesse sur base vide.

**Total : 97 assertions.**

### Vague 4 — bilan mensuel URSSAF (`monthly-bilan.test.js`, 28 assertions)

`computeMonthlyBilan`, qui ventile le CA encaissé du mois entre **marchandise** (macarons,
coffrets, marchés) et **prestation de service** (ateliers/coaching), puis calcule les
**cotisations URSSAF aux deux taux distincts**. Testé via faux Dexie + `getSettings`
stubbé aux taux réels (12,3 % / 25,6 %). Fige :
- ventilation d'une commande pure marchandise, pure service, et **mixte au prorata** ;
- prorata appliqué sur l'**encaissé du mois** (pas le montant total) en cas de paiement
  partiel ;
- exclusion des paiements hors du mois demandé ;
- marché clos = marchandise (fond de caisse déduit) ;
- reprise histo sans lignes → 100 % marchandise, **traçée comme hypothèse** (A11) ;
- les deux cotisations et leur total.

**Total : 125 assertions.**

### Vague 5 — FIFO stock & coût réel (`fifo-stock.test.js`, 27 assertions)

Le noyau du **coût de revient matière**, entièrement pur (les lots sont passés en
argument, pas de Dexie) :
- `lotFifoCompare` — l'**ordre de consommation** : reprise d'abord, puis DLC la plus
  proche, puis réception la plus ancienne ;
- `lotPU` — prix unitaire d'un lot (les lots d'**inventaire**/régularisation valent 0) ;
- `prixCourant` — prix de repli (dernier lot reçu chiffré, ou prix indicatif converti
  selon l'unité g/kg) ;
- `coutMatiereFifoReel` — simule la consommation FIFO d'une quantité et la valorise au
  **prix réel de chaque lot consommé**, avec repli honnête sur la part non couverte,
  modes `restant` (stock actuel) vs `initial` (plein stock), exclusion des lots
  d'inventaire ;
- `coutRecetteFifoReel` — somme ingrédient par ingrédient d'une recette.

**Total : 152 assertions.**

### Vague 6 — prix de vente des lignes (`order-pricing.test.js`, 26 assertions)

Les helpers qui calculent le **CA d'une commande**, briques de `computeOrderMargins` :
- `lineTotalStored` pour chaque type de ligne — coffret (prix de base + **surcharge par
  parfum** au-delà de la limite incluse, prix unitaire appliqué, remise %), prestation
  (remise € ou %, plancher à 0), don (toujours gratuit), grand format, vrac (pro/non-pro) ;
- `eventUnitPrice` — prix au macaron (événement simple vs pyramide) ;
- pyramide **louée vs vendue** (`pyraTotalLigne`, `pyraCoutLigne`) ;
- `accessoireDecoTotal` — option déco (location par pyramide, 0 sans pyramide) ;
- `bigPrice`, `vracPrixMacaron` — tarifs grand format et vrac.

Extraits avec leurs **vraies constantes de prix** (BOX_PRICES, EVENT_PRICE, etc.).

**Total : 178 assertions.**

### Vague 7 — assemblage chantilly (`assembly.test.js`, 17 assertions)

`computeStockPotentiel`, le potentiel de macarons assemblables — même modèle que le
décrément 3-composants du grand format (chantache) signalé par l'audit. Fige le point
exact où une erreur de ratio se verrait :
- le cœur **`min(coques ÷ 2, ganache)`** : 5 coques + 10 ganaches ne font que 2 macarons,
  pas 10 (coques limitantes) ;
- l'arrondi bas (7 coques → 3 macarons) ;
- **pas de mélange de parfums** (chaque parfum s'assemble avec le sien) ;
- séparation classique / grand format ;
- finis + assemblables = total ;
- exclusion des sous-lots non terminés ;
- mutualisation des coques par **couleur** (chemin avancé).

**Total : 195 assertions.**

### Vague 8 — décrément transactionnel d'assemblage (`assembly-decrement.test.js`, 13 assertions)

Vérifie que l'assemblage d'un grand format **décrémente réellement les trois composants** :
coques (2/macaron), garniture (1/macaron) et **chantache (1 dose/macaron)**. Reconstitue
la séquence de décrément exacte du code (mêmes formules, vrai `subQty`, vrai
`COQUES_PAR_MACARON`) exécutée contre un **faux Dexie transactionnel**, et contrôle l'état
des stocks après coup (cas nominal, unitaire, sans 3e composant, décimales).

Conclusion : **le 3e composant (chantache) est bien décompté**. Le commentaire v1248 du
code confirme qu'un défaut passé — le *journal de stock* qui n'enregistrait pas la sortie
de chantache — a déjà été corrigé (le stock réel, lui, était décompté).

**Total : 208 assertions.**

### Vague 9 — prix de vente moyen (`avg-sell-price.test.js`, 23 assertions)

`computeAvgSellPrice`, le prix de vente moyen par macaron qui alimente la rentabilité.
Fige : le prix par pièce d'un format (`prixParPiece` : exact, plus proche, repli
unitaire), le comptage des coffrets vendus d'un marché (`marketFormatBreakdown` :
before − after, exclusion des lignes sans vente), et la moyenne pondérée CA/pièces —
commandes coffret seules, commandes + marchés combinés, exclusion des lignes non-coffret
et des marchés non clos, repli sur la moyenne de la grille tarifaire sans vente.

**Total : 231 assertions.**

### Vague 10 — coûts marché (`market-costs.test.js`, 28 assertions)

La **marge nette par marché**, volet rentabilité terrain :
- `computeDeliveryCost` — coût du déplacement : carburant aller-retour (distance ×2 ×
  conso/100 × prix litre, conso réelle prioritaire sur le réglage) + temps de route
  aller-retour au taux horaire ;
- `marketLineSummary` — vendu par parfum = sortie − retour − don − perte (plancher 0,
  incohérence signalée si négatif) ;
- `marketPackagingCost` — coût emballage réel (comptage before − after) ;
- `marketTotals` — CA net (fond de caisse déduit des espèces, plancher 0), coûts
  (matière des vendus, emballage, stand + déplacement), marge brute, charges sociales
  marchandise, marge nette, taux d'invendus et de perte.

**Total : 259 assertions.**

### Vague 11 — impôt sur le revenu & net en poche (`net-poche.test.js`, 23 assertions)

`computeNetPoche`, le **sommet de la chaîne** : de ton CA jusqu'à ce qui te reste.
- base imposable = CA après abattement micro (71 % vente / 50 % service), avec plafond
  du minimum légal ;
- impôt sur le revenu = base × taux marginal (tranche du foyer) ;
- net en poche = CA − cotisations URSSAF − impôt − charges réelles ;
- charges réelles qui réduisent la poche mais PAS l'imposable, ventilées invest/récurrent ;
- taux de ponction et taux net ; robustesse tranche 0 % et année sans activité.

Exercé en mode annuel via faux Dexie (orders, markets, charges), agrège
`computeMonthlyBilan` (vague 4) + le calcul IR.

**Total : 282 assertions.**

### Périmètre : ce qui n'est PAS encore couvert

Honnêteté sur les limites. Ne sont pas (encore) testés :

- le **décrément transactionnel** de `prodAssembleSave` lui-même (écritures Dexie dans
  une transaction rw) : on a figé la logique de **capacité/ratio** qui le gouverne
  (`computeStockPotentiel`), pas les écritures transactionnelles — celles-ci demandent
  un faux Dexie transactionnel, cran de complexité supplémentaire
- `computeOrderMargins` complet (agrégation coût+marge) — briques figées vagues 5-6

Ces fonctions seront abordées une par une.

## Principe technique (important)

Le harnais **ne modifie jamais `app.js`** et ne le charge pas en entier (ce qui
exigerait de simuler tout le DOM, IndexedDB, etc. — fragile). À la place, il **extrait
le code source exact** de chaque fonction ciblée depuis `app.js` (repérage par
signature, nettoyage des commentaires, comptage d'accolades) et l'évalue en isolation
avec des stubs minimaux.

Conséquence : si quelqu'un édite une de ces fonctions dans `app.js`, le test ré-extrait
automatiquement la nouvelle version et signale tout changement de comportement.

L'extraction est factorisée dans `_extract.js` (repérage par signature, nettoyage des
commentaires, comptage d'accolades). Les fichiers de test l'importent.

## Lancer les tests

Toute la suite d'un coup (recommandé après chaque modification de `app.js`) :

```bash
node tests/run-all.js
```

Ou une famille isolée :

```bash
node tests/characterization.test.js   # vague 1
node tests/order.test.js              # vague 2
```

- Code de sortie **0** : tout est conforme, aucune régression.
- Code de sortie **1** : au moins un comportement figé a changé.

## Si un test échoue

Deux cas, jamais un troisième :

1. **Régression involontaire** — tu ne voulais pas changer ce comportement. Le filet
   vient de t'éviter un bug en production. Corrige le code jusqu'au vert. **Ne déploie
   pas tant que c'est rouge.**

2. **Changement volontaire** — tu as délibérément modifié une règle (nouvelle logique
   métier, correction d'un vrai bug d'origine). Alors, et seulement alors, mets à jour
   l'assertion concernée (dans le fichier `*.test.js` correspondant) pour figer la
   **nouvelle** règle voulue — dans la même livraison.

⚠️ **Ne modifie jamais un test « juste pour le faire passer »** sans avoir tranché entre
ces deux cas. Faire taire un test rouge sans comprendre pourquoi, c'est saborder le
filet : la prochaine régression passera inaperçue.

> Note sur les bugs d'origine : un test fige le comportement **actuel**, défauts
> compris. Si un calcul avait un défaut dès le départ, le test le protège tel quel —
> c'est voulu, ça empêche un refactor de le modifier à ton insu. Corriger ce défaut est
> une décision séparée, prise en connaissance de cause, et qui met le test à jour exprès
> (cas 2 ci-dessus).

## Ce dossier ne fait pas partie de l'app

`tests/` est un outil de développement. Il n'est pas inclus dans le bundle PWA livré
(`app.js`, `index.html`, `service-worker.js`) et n'est jamais chargé sur l'iPhone.
