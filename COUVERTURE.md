# Journal de couverture des tests

Ce journal trace, livraison par livraison, ce que le filet de sécurité couvre — et ce
qu'il ne couvre pas encore. Il rend visible, à chaque zip, si les tests suivent le
rythme des évolutions de l'app (voir le **contrat de livraison** dans `README.md`).

Règle : à chaque livraison qui touche un calcul, on ajoute une ligne ici. Si une
livraison ajoute une fonction sans test, on l'écrit **explicitement** dans « angles
morts » — un angle mort déclaré est surveillable ; un angle mort tu est un piège.

---

## 2026-07-08 — Première passe SWEEPER : suppression du code mort « Le Fil »

**Nature** : nettoyage, pas ajout de test. Première modification applicative depuis la
mise en place du filet (v1274 → **v1275**).

**Retiré** :
- `renderAccueil` + 8 helpers `_accueil*` + variable `_accueilSlide` (~282 lignes de JS) ;
- les styles CSS `.acc-*` associés (~35 lignes d'index.html).

**Pourquoi c'était sûr** : le module « Le Fil » (écran d'accueil expérimental) était
entièrement dormant — débranché du routeur (`accueil → renderDash`, inchangé), appelé
nulle part, sans aucune dépendance externe (vérifié : seules références = un commentaire).

**Garde-fous appliqués** : bornes de coupe vérifiées à la ligne près ; `node --check` OK ;
zéro référence résiduelle (`acc-*`, `_accueil*`, `renderAccueil`) ; balises `<style>`
équilibrées ; **suite de tests (282 assertions) verte avant ET après** ; diff confirmé
chirurgical (uniquement Le Fil + bump de version).

**Rôle du filet ici** : garantir qu'aucun calcul métier n'a bougé pendant la coupe. Il a
joué son rôle — c'est exactement ce pour quoi on l'a bâti avant de nettoyer.

---

## 2026-07-08 — Vague 11 : impôt sur le revenu & net en poche

**Ajouté** (`net-poche.test.js`, 23 assertions) :
- `computeNetPoche` — sommet de la chaîne financière. Base imposable (abattement 71/50 +
  minimum légal), impôt = base × taux marginal, net = CA − cotisations − impôt − charges.
  Charges réelles réduisant la poche mais pas l'imposable (ventilation invest/récurrent),
  taux de ponction/net, robustesse tranche 0 % et année vide. Agrège computeMonthlyBilan
  (vague 4) via faux Dexie (orders, markets, charges).

**Total couvert** : 282 assertions.

**Jalon** : tout le CŒUR FINANCIER est désormais sous filet — de la vente jusqu'au net en
poche, en passant par le coût de revient FIFO, les marges, les cotisations URSSAF et l'IR.

**Angles morts connus (déclarés) :**
- `computeOrderMargins` complet (agrégation ~15 helpers + caches ; briques figées vagues 5-6)

---

## 2026-07-08 — Vague 10 : coûts marché (marge nette terrain)

**Ajouté** (`market-costs.test.js`, 28 assertions) :
- `computeDeliveryCost` — carburant A/R + temps de route A/R au taux horaire (conso réelle prioritaire)
- `marketLineSummary` — vendu = sortie − retour − don − perte (plancher 0, incohérence signalée)
- `marketPackagingCost` — emballage réel (before − after)
- `marketTotals` — CA net (fond déduit, plancher 0), coûts (matière/emballage/stand/déplacement),
  marge brute, charges sociales marchandise, marge nette, taux invendus/perte
Toutes pures (données + settings stubbés, `_embEstRatioMarches = null`).

**Total couvert** : 259 assertions.

**Angles morts connus (déclarés) :**
- `computeOrderMargins` complet (briques figées vagues 5-6)
- impôt sur le revenu (`computeSeuilsFiscaux`, section IR)

---

## 2026-07-08 — Vague 9 : prix de vente moyen (computeAvgSellPrice)

**Ajouté** (`avg-sell-price.test.js`, 23 assertions) :
- `prixParPiece` — prix/pièce d'un format (exact, plus proche, repli unitaire)
- `marketFormatBreakdown` — coffrets vendus (before − after), CA théorique, exclusion vides
- `computeAvgSellPrice` — moyenne pondérée CA/pièces : coffrets, marchés clos combinés,
  exclusion lignes non-coffret et marchés non clos, repli grille sans vente
Toutes pures (données passées en argument).

**Total couvert** : 231 assertions.

**Angles morts connus (déclarés) :**
- `computeOrderMargins` complet (briques figées vagues 5-6)
- coûts marché de bout en bout (`marketTotals`, `computeDeliveryCost`)
- impôt sur le revenu (`computeSeuilsFiscaux`, section IR)

---

## 2026-07-08 — Vague 8 : décrément transactionnel d'assemblage (enquête chantilly)

**Contexte** : vérification demandée du décrément à l'assemblage (soupçon de non-
décrémentation de la chantache). **Relecture ligne par ligne de `prodAssembleSave`** +
test d'exécution.

**Verdict** : décrément **correct**. Coques (×2), garniture (×1) et chantache (×1/macaron)
sont tous décomptés, dans une transaction `rw` saine (toutes les tables écrites sont
déclarées), avec validation stricte par `throw` (pas de décrément partiel silencieux).
**Aucune correction nécessaire — `app.js` inchangé.** Le « confirmé v1266 » des notes
correspondait à un fix déjà appliqué, pas à un bug ouvert.

**Ajouté** (`assembly-decrement.test.js`, 13 assertions) : reconstitution de la séquence
de décrément (vrai `subQty`, vrai `COQUES_PAR_MACARON`) contre un faux Dexie
transactionnel — cas nominal, unitaire, sans 3e composant, décimales.

**Limite honnête** : `prodAssembleSave` lit le DOM et ouvre des modales → non exécutable
hors navigateur. Le test reconstitue la séquence de décrément d'après le source ; il ne
rejoue pas la fonction entière. Combiné à la relecture, le verdict reste solide.

**Total couvert** : 208 assertions.

**Angles morts connus (déclarés) :**
- `computeOrderMargins` complet (briques figées vagues 5-6)
- `computeAvgSellPrice`, coûts marché (`marketTotals`)
- impôt sur le revenu (`computeSeuilsFiscaux`, section IR)

---

## 2026-07-08 — Vague 7 : assemblage chantilly (potentiel)

**Ajouté** (`assembly.test.js`, 17 assertions) :
- `computeStockPotentiel` — potentiel de macarons : finis + assemblables. Fige le cœur
  `min(coques ÷ 2, ganache)` (le ratio du bug d'audit), l'arrondi bas, le no-mélange de
  parfums, la séparation classique/GF, l'exclusion des sous-lots non terminés, et la
  mutualisation des coques par couleur. Fonction pure (prods passés en argument).

**Note d'audit** : la logique de capacité/ratio du grand format 3-composants (chantache)
est ainsi figée. Le décrément transactionnel de `prodAssembleSave` (écritures Dexie)
reste un angle mort déclaré (demande un faux Dexie transactionnel).

**Total couvert** : 195 assertions.

**Angles morts connus (déclarés) :**
- décrément transactionnel `prodAssembleSave` (écritures Dexie rw)
- `computeOrderMargins` complet (briques figées vagues 5-6)
- `computeAvgSellPrice`, coûts marché (`marketTotals`)
- impôt sur le revenu (`computeSeuilsFiscaux`, section IR)

---

## 2026-07-08 — Vague 6 : prix de vente des lignes (CA commande)

**Ajouté** (`order-pricing.test.js`, 26 assertions) :
- `lineTotalStored` par type — coffret (surcharge parfums, prix appliqué, remise %),
  prestation (remise €/%, plancher 0), don (0), grand, vrac (pro/non-pro)
- `eventUnitPrice`, pyramide louée/vendue (`pyraTotalLigne`, `pyraCoutLigne`)
- `accessoireDecoTotal`, `bigPrice`, `vracPrixMacaron`
Extraits avec leurs vraies constantes de prix (BOX_PRICES, EVENT_PRICE, EQUIP_PRICE…).

**Total couvert** : 178 assertions.

**Angles morts connus (déclarés) :**
- `computeOrderMargins` complet (agrégation coût+marge : ~15 helpers + caches globaux) —
  ses briques sont figées (coût FIFO vague 5, prix de vente vague 6), pas l'agrégation
- décréments d'assemblage (chantilly 3 composants)
- `computeAvgSellPrice`, coûts marché (`marketTotals`)
- impôt sur le revenu (`computeSeuilsFiscaux`, section IR)

---

## 2026-07-08 — Vague 5 : FIFO stock & coût réel

**Ajouté** (`fifo-stock.test.js`, 27 assertions) :
- `lotFifoCompare` — ordre de consommation (reprise → DLC proche → réception ancienne)
- `lotPU` — prix unitaire d'un lot (inventaire = 0, POINT H)
- `prixCourant` — repli sur dernier lot chiffré, ou prix indicatif converti g/kg
- `coutMatiereFifoReel` — consommation valorisée au prix réel des lots, repli honnête,
  modes restant/initial, exclusion inventaire
- `coutRecetteFifoReel` — somme par ingrédient
Toutes pures (lots passés en argument, pas de Dexie).

**Total couvert** : 152 assertions.

**Angles morts connus (déclarés) :**
- décréments d'assemblage (composants multi-parts, chantilly 3 composants)
- `computeOrderMargins`, `computeAvgSellPrice`
- coûts marché de bout en bout (`marketTotals`, `computeDeliveryCost`)
- impôt sur le revenu (`computeSeuilsFiscaux`, section IR)

---

## 2026-07-08 — Vague 4 : bilan mensuel URSSAF (computeMonthlyBilan)

**Ajouté** (`monthly-bilan.test.js`, 28 assertions) :
- `computeMonthlyBilan` — via faux Dexie (orders + markets) et `getSettings` stubbé aux
  taux réels (12,3 % marchandise / 25,6 % service). Fige : ventilation marchandise vs
  service (pure, mixte au prorata, prorata sur encaissé partiel), exclusion hors-mois,
  marché clos = marchandise, reprise histo → 100 % goods traçée (A11), cotisations aux
  deux taux + total.

**Total couvert** : 125 assertions.

**Angles morts connus (déclarés) :**
- coûts de bout en bout (`estimateOrderMaterialCost`, `marketTotals`, `computeDeliveryCost`)
- FIFO stock + décréments d'assemblage (chantilly 3 composants)
- `computeOrderMargins`, `computeAvgSellPrice`
- impôt sur le revenu (`computeSeuilsFiscaux`, section IR)

---

## 2026-07-08 — Vague 3 : cœur comptable (computeAccounting)

**Ajouté** (`accounting.test.js`, 32 assertions) :
- `computeAccounting` — via faux Dexie en mémoire (8 tables), coûts matière neutralisés
  (`recipes = []`) pour isoler le CA. Fige : encaissements par mois/méthode, CA facturé
  vs encaissé, exclusion des reprises (A4), créances, marchés clos (fond de caisse
  déduit), filtre par période, base vide.

**Infrastructure** : `extractFunction` capture désormais le mot-clé `async` (sans quoi
une fonction async extraite contiendrait `await` sans `async`). Non-régression vérifiée
sur vagues 1 et 2.

**Total couvert** : 97 assertions.

**Angles morts connus (déclarés) :**
- `computeMonthlyBilan` (ventilation marchandise/service, cotisations URSSAF, IR)
- coûts de bout en bout (`estimateOrderMaterialCost`, `marketTotals`) — neutralisés ici
- FIFO stock + décréments d'assemblage (chantilly 3 composants)
- `computeOrderMargins`, `computeAvgSellPrice`

---

## 2026-07-08 — Vague 2 : famille « commande »

**Ajouté** (`order.test.js`, 27 assertions) :
- `paiementsDe` — registre des paiements, legacy « Payé », héritage du moyen (A7, A10)
- `orderPaid`, `orderBalance`, `orderPayStatus` — encaissé, solde, statut dérivé
- `estReprise` + `orderToLines` — reprises exclues du CA URSSAF (A4)

**Infrastructure** : extracteur factorisé (`_extract.js`), lanceur agrégé (`run-all.js`).

**Total couvert** : 65 assertions.

**Angles morts connus (à couvrir plus tard, déclarés volontairement) :**
- `computeAccounting` complet (série mensuelle, résultat, CA encaissé vs facturé)
- `computeMonthlyBilan` (ventilation marchandise/service, cotisations URSSAF, IR)
- FIFO stock + décréments d'assemblage (dont chantilly 3 composants)
- `computeOrderMargins`, `computeAvgSellPrice`, `marketTotals`

---

## 2026-07-07 — Vague 1 : briques de calcul pures

**Ajouté** (`characterization.test.js`, 38 assertions) :
- `money2`, `round3` — arrondis (garde isFinite, A19)
- `today`, `ymdLocal`, `ymOf`, `monthKey` — dates locales anti-décalage UTC (A1, A12)
- `isFreezer`, `computeDlc` — DLC frigo/congélateur
- `peekFactureNumero` — aperçu numéro de facture sans consommation

**Total couvert** : 38 assertions.

---

## Modèle pour la prochaine entrée

```
## AAAA-MM-JJ — <titre de la livraison>

**Ajouté** (`<fichier>.test.js`, N assertions) :
- <fonction> — <ce qui est vérifié>

**Comportement modifié** (le cas échéant) :
- <fonction> — ancienne règle → nouvelle règle, test mis à jour en conséquence

**Total couvert** : X assertions.

**Angles morts connus :** <liste, ou « aucun nouveau »>
```
