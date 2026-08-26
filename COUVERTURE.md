# Journal de couverture des tests

Ce journal trace, livraison par livraison, ce que le filet de sécurité couvre — et ce
qu'il ne couvre pas encore. Il rend visible, à chaque zip, si les tests suivent le
rythme des évolutions de l'app (voir le **contrat de livraison** dans `README.md`).

Règle : à chaque livraison qui touche un calcul, on ajoute une ligne ici. Si une
livraison ajoute une fonction sans test, on l'écrit **explicitement** dans « angles
morts » — un angle mort déclaré est surveillable ; un angle mort tu est un piège.

---

## 2026-07-13 — Vague 62 : LE MONTAGE PYRAMIDE, SANS OUVRIR « MODIFIER »  (v1340 → **v1341**)

**Demandé par Benjamin** :
> « Dans le cas d'un événement avec pyramide, visualiser dans le résumé de commande, sans avoir à
> aller dans Modifier : le nombre de pyramides, le type, et le nombre d'étages. »

### La difficulté, et il faut la dire
**Le nombre d'étages n'est PAS stocké** sur la commande. Seuls le nombre de pyramides (`equip`) et
le nombre de macarons (`evQte`) le sont. Les étages se **déduisent** des modèles de présentoirs :
chaque modèle a ses plateaux, donc ses **paliers cumulés** (pour la pyramide transparente :
`[4,7,10,13,16,19]` → 4, 11, 21, 34, 50, **69** = pyramide entière).

### On ne devine pas — on déduit, et on dit ce qu'on sait
| Situation | Comportement |
|---|---|
| **Un seul** modèle correspond | on l'affiche, avec ses étages et la mention « pyramide entière » |
| **Plusieurs** correspondent | on les **liste tous** — trancher en silence reviendrait à décider à la place de Benjamin |
| **Aucun** ne correspond | « montage sur mesure », **sans arrondir** au palier voisin |
| Répartition **non entière** | on signale que les pyramides ne seront **pas identiques** |
| **Bloc plat** (non sécable) | **aucun étage affiché** — le mot n'aurait aucun sens |

### La règle figée
> **UN NOMBRE D'ÉTAGES INVENTÉ SERAIT PIRE QU'UNE ABSENCE** — il enverrait Benjamin monter le
> **mauvais présentoir le jour J, devant son client**.
> Une donnée **manquante** coûte un aller-retour dans « Modifier ». Une donnée **fausse** coûte un
> événement raté. **Le silence est le moindre mal ; le mensonge, jamais.**

**Ajouté** (`pyramide-montage.test.js`, 40 assertions) :
- **A** — le cas courant : 21 macarons → 3 étages ; 2 × 69 → pyramide **entière** (6 étages).
- **C** — **l'ambiguïté**, là où on pourrait mentir : 34 macarons = 4 étages sur un modèle **et**
  3 sur un autre. Les deux sont listés.
- **D** — le **sur-mesure** : 40 macarons ne correspond à aucun palier. **D5** prouve la retenue :
  les paliers 34 et 50 **existent** — arrondir aurait été **facile, et faux**.
- **E** — 100 macarons sur 3 pyramides → 33,33 chacune, affiché **tel quel**, sans arrondi trompeur.
- **G** — aucun modèle enregistré → **aucun étage inventé**, mais les macarons par pyramide restent
  affichés (c'est un **fait**, lui).

**Total couvert** : 1397 → **1437 assertions**.

**Angles morts connus (déclarés)** :
- **La cause racine reste** : le modèle et les étages choisis à la saisie ne sont **pas persistés**
  sur la ligne. La déduction est un **contournement honnête**, pas un correctif. Les persister
  rendrait l'affichage **certain** dans tous les cas — c'est le vrai chantier.
- Les modèles vivent dans **localStorage** (`sm_pyraModels`), pas dans IndexedDB : ils ne suivent
  pas une restauration de sauvegarde. Un modèle perdu rend tous les montages passés « sur mesure ».
- La déduction suppose des pyramides **identiques** (même modèle, même hauteur). Une commande
  montée avec deux modèles **différents** (le suggesteur sait le proposer, cas « combinaison »)
  serait signalée « sur mesure » — c'est prudent, mais imprécis.

---

## 2026-07-13 — Vague 61 : LE TOTAL *ET* LE RESTE DÛ  (v1339 → **v1340**)

**Demandé par Benjamin** :
> « Dans ma liste de commandes à venir je veux avoir affiché clairement le montant total de
> l'ensemble des commandes mais aussi le restant dû, car bien souvent il y a une partie payée à
> l'avance. »

L'encart « À venir » n'affichait que le **montant total** (« 5 · 1 022,40 € »). Or une partie est
souvent déjà encaissée en acompte : ce total **ne dit pas** ce qu'il reste à percevoir — *le seul
chiffre qui compte pour la trésorerie*.

Symétriquement, « À encaisser » affichait le **reste dû** sans jamais dire **de quel montant total**
il provenait : impossible de savoir si 139 € de reste portaient sur 150 € ou sur 3 000 € de
commandes.

### Les règles figées

**A — Les trois chiffres se recomposent** : `total = déjà encaissé + reste dû`, **au centime**.
> Un encart où les nombres ne se recomposent pas oblige Benjamin à vérifier à la calculette — et
> **un chiffre qu'on doit vérifier est un chiffre auquel on ne fait plus confiance.**

**B — UN TROP-PERÇU NE PAIE PAS LA COMMANDE D'À CÔTÉ.** *(le cœur de la vague)*
Un client verse 120 € pour une commande de 100 € ; un autre doit 200 €. La somme **naïve**
(Σ montant − Σ encaissé = 300 − 120) annoncerait **180 €** de reste : les 20 € en trop du premier
viendraient **payer** le second. C'est faux, et ça **sous-estime** ce que Benjamin doit réclamer.
*Correctif* : plafonnement **commande par commande** (`min(payé, montant)`), et le **trop-perçu est
exposé à part**. Tests B1–B7, dont la preuve par l'absurde.

**C — Une seule fonction** (`cmdTotauxLot`) pour les **trois** endroits : « À venir », les
séparateurs de **semaine**, et « À encaisser ». *Deux calculs séparés finissent toujours par
diverger* — leçon de toute cette série. F4/F5 vérifient que les sommes artisanales ont **disparu**.

**Cas legacy** (D1/D2) : une commande marquée « Payé » **sans registre** de paiements compte pour son
montant entier — sinon on réclamerait de l'argent **déjà perçu**.

**Pas de bruit inutile** (C5) : le bandeau détaillé n'apparaît **que** s'il y a eu des acomptes.
Sans acompte, l'affichage est **exactement** celui d'avant.

**Ajouté** (`reste-du.test.js`, 31 assertions).

**Total couvert** : 1366 → **1397 assertions**.

**Angles morts connus (déclarés)** :
- Les totaux portent sur les commandes **affichées** (après filtres, tags, recherche) et sur la
  limite de **300 lignes** de la liste. Au-delà de 300 commandes dans une section, le total ne
  refléterait que les 300 premières — **non signalé à l'écran**. Cas inatteignable aujourd'hui, mais
  c'est précisément le genre de silence qui devient un mensonge en grandissant.
- La section « semaine courante » (cartes complètes) n'a **pas** de total : seule « À venir » et
  « À encaisser » en ont un.

---

## 2026-07-13 — Vague 60 : LE TOTAL EST LA SOMME DU DÉTAIL + L'ÉTAT « EN COURS »  (v1338 → **v1339**)

Deux chantiers, tous deux demandés par Benjamin.

### 1. Le « CA total » contredisait ses propres mois  *(angle mort déclaré depuis la vague 57)*
La vue globale affichait `R.global.caTotal` — **computeStats** : commandes **seules**, date de
**commande**, montant **total**. Juste **en dessous**, la liste mensuelle affichait la vérité
comptable (encaissement, **marchés compris**).

**Le total et le détail se contredisaient SUR LE MÊME ÉCRAN**, et rien ne permettait de savoir
lequel croire.

> **UN TOTAL QUI N'EST PAS LA SOMME DE SON DÉTAIL N'EST PAS UN TOTAL — c'est un TROISIÈME chiffre,
> et il finit toujours par contredire les deux autres.**

*Correctif* : `serieMensuelleEncaisse` expose désormais des `totaux` qui **découlent** des mois.
Test **A1** : le total **EST** la somme des mois, **au centime**.
**L'incertitude s'agrège** (B2–B5) : si un seul marché a encaissé sans quantités saisies, le total
de macarons est déclaré **incomplet** — taire une incomplétude reviendrait à présenter un total
partiel comme un total complet.
*Garde-fou* : `R.global.caTotal` et `R.global.macaronsStd` ne sont plus affichés **nulle part**.

### 2. L'état « en cours » d'un lot — un vrai câblage *(choix de Benjamin : STOCKÉ en base)*
La vague 59 avait supprimé cette branche : le statut `'en_cours'` était **testé mais jamais écrit**.
Benjamin a tranché : il veut cet état, et il le veut **stocké** (explicite, interrogeable).

**Le risque, regardé en face** : un statut stocké **peut mentir**. Écrit une fois puis jamais
revérifié, il finit par contredire la réalité — *précisément le mal que la vague 59 soignait*.
> **UN STATUT FAUX EST PIRE QU'UN STATUT ABSENT : on lui fait confiance.**

*D'où la RÉCONCILIATION*, ajoutée sans qu'il l'ait demandée :
- **`'clos'` et `'ouvert'` sont des DÉCISIONS** ; **`'en_cours'` est un FAIT** (des articles sont
  affectés au lot via `orderItems.batchId`).
- **On ne devine que le fait, jamais les décisions** : un lot clos le reste, même vidé de ses
  articles (D4/D5).
- Le statut est **ÉCRIT** au premier prélèvement, et **RECALÉ** à chaque affichage s'il a divergé
  (F1 : « en cours » sans article → il mentait ; F2 : les lots créés **avant** la v1339 se recalent
  seuls). La réconciliation est **idempotente** : elle n'écrit que si ça a divergé.
- **G3** : le statut n'est écrit qu'**à UN SEUL endroit** — *deux sources d'écriture finissent
  toujours par diverger* (leçon de toute cette série).
- Le tag affiche la **progression réelle** (« en cours · 20 prélevés »).

**Ajouté** (`total-et-lots.test.js`, 34 assertions).

**Total couvert** : 1332 → **1366 assertions**.

**Angles morts connus (déclarés)** :
- `computeStats().global` reste utilisé pour le **panier moyen**, le **top parfum** et le **volume de
  production** (base « date de commande »). C'est la **bonne** base pour ces questions (comportement
  d'achat, cf. vague 56) — mais rien ne l'**écrit à l'écran** : un lecteur pressé peut croire à une
  incohérence avec le CA. À étiqueter.
- La réconciliation des lots tourne à **chaque rendu** de l'écran picking et lit **tous** les
  `orderItems`. Sans effet à cette échelle ; à surveiller si l'historique grossit.
- Un lot **clos** puis rouvert manuellement (pas d'UI pour ça aujourd'hui) repasserait « en cours » :
  non testé, car le cas n'existe pas encore.

---

## 2026-07-13 — Vague 59 : L'AUDIT DE VOCABULAIRE  (v1337 → **v1338**)

**Nature** : solde de l'angle mort déclaré en vague 58 —
*« le même bug de vocabulaire peut exister ailleurs : aucun audit systématique n'a été fait. »*

### Le principe
Une valeur qu'on **TESTE** mais qu'on n'**ÉCRIT** jamais est une **branche morte** : un `if` qui ne
se déclenchera jamais, et **personne ne le saura**. C'est **mécaniquement détectable** — il suffit
de comparer les deux ensembles.

### Le résultat : une vraie branche morte
`b.statut === 'en_cours'` sur les **lots de picking**. Ce statut n'est **jamais écrit** : un lot naît
`'ouvert'` (l. 41720) et meurt `'clos'` (l. 42216). Le tag « en cours » **ne s'est jamais affiché**.
L'intention existait ; le câblage n'a jamais suivi.

*Code mort supprimé.* **Une branche qui promet un état inexistant est un mensonge dans le code** :
elle laisse croire que la fonctionnalité existe, et elle **survit à toutes les relectures parce
qu'elle a l'air juste**.
*(Si un état « en cours » est souhaité, c'est une **fonctionnalité à câbler**, pas un bug à corriger.)*

### Écrire cet audit a coûté TROIS essais — et c'est le plus instructif

**1er essai — l'audit n'a PAS détecté le bug fondateur, réintroduit exprès.**
Cause : le compteur d'occurrences incluait les **commentaires**, et le mot « embarque » apparaît
désormais dans la prose qui *explique* le bug. La valeur ne paraissait donc plus fantôme.
> **Un audit qui ne détecte pas le bug connu ne vaut RIEN.**

**2e essai — j'ai écrit mon propre dépouilleur de commentaires.**
Il supprimait des **blocs entiers** dès qu'un `/*` apparaissait **dans une chaîne**, effaçant les
lignes mêmes qui écrivaient les valeurs → **fausses alertes** en série.
Or un dépouilleur durci **existait déjà** (`stripComments`, vague 47).
> **J'ai reproduit très exactement la maladie que cette série traque : la duplication non prouvée.**

**3e essai (livré)** — on réutilise `stripComments`. **Une seule fonction sait dépouiller du JS.**

### La règle, enfin juste
Premières versions : je cherchais les écritures **littérales** (`champ: 'valeur'`). Deux échecs :
- `statut: orderPayStatus(o)` — la valeur vient d'une **fonction** (`return 'Partiel'`) ;
- `type` posé dans une **variable** puis versé dans l'objet.

Un détecteur qui ne voit que les littéraux **crie au loup sur du code sain** — et une alerte
injustifiée finit **toujours** par être ignorée, *y compris le jour où elle a raison*.

**La bonne règle est la signature exacte du bug fondateur** :
> une valeur **fantôme** est une valeur qui n'apparaît **nulle part ailleurs** que dans la comparaison.

`'embarque'` n'existait que là. `'Partiel'`, `'rupture'`, `'reassort'` apparaissent ailleurs
(returns, tables d'énumération, `<option>`) : ils sont bel et bien produits quelque part.
**Résultat : la liste blanche est VIDE** — et c'est le meilleur des signes.

### Les limites, déclarées
L'audit raisonne par **nom de champ**, pas par **entité**. Le `.type` d'un client n'est pas celui
d'un mouvement de marché. (Le `<select>` client n'a pas d'attribut `value` : c'est le **texte** de
l'option qui est stocké — d'où `'Pro'` avec une majuscule, parfaitement correct.)
C'est un **générateur de candidats**, pas un oracle : chaque trouvaille demande une vérification à
la main.

**Ajouté** (`vocabulaire.test.js`, 9 assertions) :
- **A** — l'audit sait détecter le bug **connu** (assertion la plus importante : le 1er essai
  échouait précisément ici).
- **B** — le dépouilleur : le littéral `'embarque'` disparaît du code dépouillé, mais la **variable**
  `embarque` de `marketTotals` reste légitime (un audit qui confond variable et donnée crie au loup).
- **C — CLIQUET** : aucune comparaison contre une valeur inexistante. *Éprouvé* : bug réintroduit →
  il mord, avec le **nom exact** de la valeur fantôme.
- **D** — la liste blanche doit rester **courte et justifiée** : *une liste blanche non justifiée
  n'est qu'une façon polie de faire taire l'audit.*

**Total couvert** : 1323 → **1332 assertions**.

**Angles morts connus (déclarés)** :
- L'audit ne couvre que les champs **énumératifs** listés (`type`, `statut`, `paiement`…) et les
  comparaisons `===`/`!==` **directes**. Un `switch(mv.type)` ou un `includes()` lui échappe.
- Il ne détecte **pas l'inverse** : une valeur **écrite** mais jamais **testée** (donnée morte).
- Le raisonnement par nom de champ produit des faux positifs entre entités — assumé, documenté.
- `computeStats().global.ca` reste sur la base « commandes uniquement » : **non résolu depuis la
  vague 57**.

---

## 2026-07-13 — Vague 58 : ZÉRO N'EST PAS UNE MESURE  (v1336 → **v1337**)

**Nature** : BUG signalé par **Benjamin**, et **il l'a vu avant nous** :

> « Si seul le CA est entré, on retourne une vente de macarons à zéro même avec un CA. »

Exact. Et en creusant, **c'était encore pire**.

### La vraie cause : un type de mouvement INVENTÉ
En v1336, `caMarchesDuMois` **parsait les mouvements elle-même** et testait `mv.type === 'embarque'`.
**Ce type n'existe nulle part dans la base.** Le type réellement stocké est **`'sortie'`**.

**Les macarons des marchés valaient donc TOUJOURS zéro** — avec ou sans mouvements saisis.
Et **le test partageait la même erreur** (ses fixtures utilisaient `'embarque'`), donc **il passait
au vert**.

> **UN TEST QUI PARTAGE L'ERREUR DU CODE NE VAUT RIEN : il ne valide que sa propre cohérence.**

C'était **précisément la duplication non prouvée** que la vague 52 s'interdisait (bloc E) — et que
nous avions **nous-mêmes déclarée en angle mort** à la vague 57. Déclarer un angle mort ne le
neutralise pas.

*Correctif* : on ne re-parse plus rien. `caMarchesDuMois` passe par **`marketLineSummary`** — **le
même résumeur que `marketTotals`**. Une seule fonction sait lire un mouvement de marché ; les deux
chemins ne peuvent plus diverger.
(On n'appelle pas `marketTotals` directement : elle traîne toute la chaîne des coûts — FIFO,
emballage, déplacement — dont ce calcul n'a aucun besoin, et qui le rendrait intestable.)

*Angle mort levé* : `marketTotals` **déduit bien** le fond de caisse — vérifié. Les trois chemins
(compta, marketTotals, `caMarcheEncaisse`) appliquent désormais la même règle.

### Le cas de Benjamin : zéro n'est pas « je ne sais pas »
Les quantités vendues se déduisent du **delta** (sorti − retours − dons − pertes). Sans mouvements
saisis, le sorti vaut 0… et la vente aussi.

> **ZÉRO N'EST PAS UNE MESURE — C'EST UNE AFFIRMATION.** Dire « 0 macaron » quand 516 € ont été
> encaissés ne dit pas *« je ne sais pas »*, mais *« tu n'as rien vendu »*.
> C'est le **même mensonge** que le « 50 € / 0 macaron » de la v1331, réapparu dans **l'autre canal**.

*Correctif* : un marché avec du CA mais **aucun mouvement** est marqué **NON MESURÉ**.
- La quantité vaut **`null`** (inconnue), **jamais 0**.
- `macaronsComplets: false`, `nbNonMesures`, `caNonMesure` : l'incertitude est **chiffrée en euros**.
- **Elle REMONTE** jusqu'au chiffre du copilote (`caMoisEncaisse`) : taire l'incomplétude reviendrait
  à présenter un total partiel comme un total complet — *le plus discret des mensonges, et le plus
  tenace*.
- L'écran le dit : « ce total est **incomplet** — 1 marché a encaissé 516 € sans quantités saisies.
  Je connais l'argent, pas les macarons. Saisis le **sorti** et le **rentré** : le delta donne la
  vente au macaron près. »

Le **CA reste juste** : l'argent est connu, ce sont les macarons qui ne le sont pas.

**Ajouté** (`canal-oublie.test.js` : 30 → **52 assertions**) :
- **G** — le cas signalé : CA sans mouvements → 0 macaron ajouté, `null` dans le détail,
  `macaronsComplets: false`, et l'incertitude **remonte** jusqu'à `caMoisEncaisse`.
- **H — le vocabulaire des mouvements.** **H3** prouve que le type `'embarque'` inventé ne remonte
  **rien** (les macarons valaient toujours 0). **H4/H5** : `caMarchesDuMois` passe par
  `marketLineSummary` et **ne teste plus aucun type elle-même**.

**Total couvert** : 1301 → **1323 assertions**.

**Angles morts connus (déclarés)** :
- `computeStats().global.ca` (le « CA total » de la vue globale) reste sur la base « commandes
  uniquement, date de commande, montant total » : le **total** ne coïncide toujours pas avec la somme
  des mois. **Non résolu depuis la vague 57.**
- Aucune **estimation** des macarons non mesurés n'est proposée (on pourrait diviser le CA par un
  prix moyen). Choix délibéré : un chiffre estimé présenté à côté d'un chiffre mesuré finit toujours
  par être lu comme mesuré. Mieux vaut le vide que le plausible.
- Le même bug de vocabulaire peut exister ailleurs : **aucun audit systématique** des `mv.type ===`
  n'a été fait dans le reste du fichier.

---

## 2026-07-13 — Vague 57 : LE CANAL OUBLIÉ  (v1335 → **v1336**)

**Nature** : BUG DE PRODUCTION, remonté par Benjamin (deux captures).
Copilote : **« CA de juin = 552,00 € »**. Compta, **même période** (01 → 30 juin) :
**« CA encaissé = 1 068,00 € »**.

**Deux chiffres pour le même mois.** Or **la v1331 devait précisément éliminer ça**. Ma correction
était donc **incomplète** — et c'est le pire des aveuglements : *celui qui se croit guéri*.

### Bug 1 — les marchés n'étaient comptés NULLE PART
`caEncaisseParMois(orders)` n'itérait que sur les **commandes**. Or les ventes de marché ne passent
**jamais** par la table `orders` : elles sont encaissées en direct, à la caisse.
**Tout un canal de vente manquait** — les 516 € d'écart, c'était exactement ça. Et le graphe
« Coûts & prix » lit la même fonction : sa **marge brute** était sous-estimée d'autant.

> **LA LEÇON, et elle est rude** : j'avais fondé ma « vérité unique » (v1331) sur une fonction qui
> **oubliait elle-même un canal**.
> **Une source unique qui est incomplète reste une source unique — et reste fausse.**
> **Unifier n'est pas vérifier.**

### Bug 2 — le fond de caisse était compté comme du chiffre d'affaires
`computeAccounting` retire depuis toujours le **fond de caisse** des espèces : c'est l'argent que
Benjamin met **lui-même** dans la caisse le matin pour rendre la monnaie. **Ce n'est pas une vente.**
Mais `revenuHoraireData` sommait les espèces **brutes** → il comptait la monnaie de Benjamin comme
du CA, et **surestimait son revenu de l'heure**.

*Correctif* : la règle du CA d'un marché n'est plus écrite qu'**à un seul endroit**
(`caMarcheEncaisse`) : *(espèces − fond de caisse, borné à 0) + carte + autre*, marchés **CLOS**
uniquement. **Une règle écrite à deux endroits finit toujours par diverger** — c'est très exactement
ce qui s'est passé.

**Ajouté** (`canal-oublie.test.js`, 30 assertions) :
- **A** — le fond de caisse retiré ; GARDE-FOU : espèces < fond → CA de **0**, jamais négatif
  (ça, c'est une perte, pas un CA négatif).
- **B** — seuls les marchés **clos** comptent : un marché en cours n'a pas de caisse arrêtée.
- **C** — **la reconstitution exacte du cas de Benjamin** : 552 (commandes) + 516 (marché) = **1 068 €**.
  Sans les marchés, on retombe sur les **552 €** qu'il voyait. Les macarons du marché remontent aussi
  (150 embarqués − 30 retours − 5 pertes = 115), sinon on recréerait le symptôme « CA sans macarons »
  de la v1331.
- **D — LE TEST QUI AURAIT DÛ EXISTER.** La vague 52 comparait déjà le copilote à la compta… **mais
  son jeu de données ne contenait AUCUN marché**. Elle validait donc une **égalité partielle**, et
  c'est pour ça qu'elle n'a rien vu.
  > **Un test qui ne contient pas le cas ne le protège pas : il donne seulement l'illusion qu'il le fait.**
  Désormais : copilote = compta = **courbes**, marchés compris, au centime.
  **D5** : un mois **sans commande mais avec un marché** existe enfin (avant, il **disparaissait**
  entièrement de la série).
- **E** — **aucun prorata** sur un marché (encaissé le jour même), contrairement aux commandes.
- **F** — non-régression : les anciens appelants qui ne passent pas `markets` ne cassent pas.

**Wrapper `serieMensuelleEncaisseDb`** ajouté : les 4 appelants devaient charger les marchés à la
main — *il suffisait d'en oublier UN pour que la divergence renaisse*. C'est exactement comme ça que
ce bug est né.

**Total couvert** : 1271 → **1301 assertions**.

**Angles morts connus (déclarés)** :
- `computeStats().global.ca` (le « CA total » de la vue globale du copilote) est **toujours** sur la
  base « commandes uniquement, date de commande, montant total ». Le **total** affiché ne coïncide
  donc pas avec la somme des mois. À trancher.
- Les macarons vendus au marché sont recalculés ici (`embarqué − retours − dons − pertes`) alors que
  `marketTotals` fait déjà ce calcul. **Duplication non prouvée** — exactement ce que la vague 52
  s'interdisait (bloc E). À unifier, ou à assertir l'une contre l'autre.
- Le fond de caisse n'est pas déduit dans `marketTotals` non plus : à vérifier.

---

## 2026-07-12 — Vague 56 : « DEPUIS » N'EST PAS « EN »  (v1334 → **v1335**)

**Nature** : suite de la vague 55. Il restait **cinq** compétences qui avouaient. **Deux le
méritaient** (top parfum, panier moyen) ; **trois ne le méritaient pas** — et c'est dit franchement.

### Le bug de fond : le parseur ne savait dire que « DEPUIS »
`_aiParsePeriode` renvoyait `{depuis, label}` — un intervalle **ouvert**. Il pouvait exprimer
« depuis 3 mois », **jamais « EN mai »**.

> **« En mai » n'est pas « depuis mai ».** Sans **borne haute**, « mon meilleur parfum en mai »
> aurait renvoyé **mai + juin + juillet** : un chiffre parfaitement juste… pour une période que
> Benjamin n'a jamais demandée.

Même mal que la v1330 (bon routage, mauvais paramètre), **à un cran plus subtil** : ici, ce n'était
pas le paramètre qui se perdait, c'était sa **borne**.

*Correctif* : `jusqu` ajouté, et le **dernier jour du mois CALCULÉ** — pas supposé (avril finit le
30 ; **février 2024 le 29**, test A9).

### La collision de types, désamorcée
`params.periode` était une **CHAÎNE** (`'AAAA-MM'`) pour les compétences câblées en v1333/34, mais
un **OBJET** `{depuis, label}` pour le top parfum. **Deux types pour un même champ : une mine.**
Corrigé à la **racine** — `_aiParsePeriode` comprend désormais le mois nommé lui-même.

### La bonne base temporelle — et elle est ÉCRITE
Un panier moyen et un classement de parfums décrivent un **COMPORTEMENT D'ACHAT** : la date de
**COMMANDE** est la bonne règle. La date d'**encaissement** — la bonne pour le CA depuis la v1331 —
serait ici **FAUSSE** : elle rangerait une commande de mai dans le mois où le chèque a été déposé.
**Deux questions différentes, deux bases différentes**, et c'est écrit dans le code : sinon le
prochain lecteur « corrigera » l'une vers l'autre en croyant bien faire.

**Ajouté** (`depuis-nest-pas-en.test.js`, 32 assertions) :
- **A** — la borne haute, les mois courts/longs, février bissextile. **A5b/A5c** : la `refDate` est
  *réellement* honorée (sans cette assertion, le garde-fou anti-calendrier serait **décoratif** — il
  passerait aujourd'hui par pure coïncidence).
- **B** — non-régression : « depuis 3 mois » et « tout l'historique » gardent `jusqu: null`.
- **C** — les faux positifs (« jaMAIs », « MAIson ») **re-prouvés sur ce chemin** : `_aiParsePeriode`
  appelle maintenant `_aiMoisNomme`, donc un déclenchement à tort enverrait **toutes** les
  compétences à période sur un mois fantaisiste.
- **D** — la priorité : « du mois de **mai** » → mai ; « du mois » seul → ce mois-ci.
- **E/F/G** — les justifications sont **dans le code** (voir ci-dessous).

**`refDate` ajoutée à `_aiParsePeriode`** : un test qui dépend du calendrier est un **piège à
retardement** — il passe aujourd'hui et casse en janvier. (Défaut repéré dans notre propre test,
corrigé avant livraison.)

### Ce qui avoue encore — et pourquoi ce n'est PAS de la paresse
- **`query_rentabilite`** : croise commandes **ET** marchés **ET** mouvements, sur une base de coûts
  **FIFO elle-même temporelle**. Ne filtrer que les commandes produirait un chiffre **PLAUSIBLE ET
  FAUX** — *exactement ce que cette série traque*.
- **`query_seuil_rentabilite`** et **`query_revenu_horaire`** : calculs sur **fenêtre glissante**
  (90 j, moyennes pondérées). Les « filtrer par mois » n'a pas de sens tel quel : il faudrait
  d'abord **repenser leur période de référence**. Ajouter un filtre par-dessus serait un **placage**.

> **Livrer un chiffre faux vaut moins qu'avouer.** Le bloc G assert que ces justifications sont
> écrites : sans elles, le prochain lecteur croira à un oubli et « corrigera » en fabriquant
> précisément le chiffre plausible et faux.

**CLIQUET** (E8/E9) : le nombre de compétences qui **savent** ne peut que croître (≥ 8), celui des
**aveux** que décroître (≤ 3). Une régression vers l'aveu casse la suite.

**Total couvert** : 1237 → **1271 assertions**.

**Angles morts connus (déclarés)** :
- Toujours **aucune plage** : « de mars à juin », « le 1er trimestre », « l'an dernier ».
  Le socle existe pourtant maintenant (`depuis` + `jusqu`) — c'est devenu du travail de parseur,
  plus d'architecture.
- Le bilan marché d'un mois à plusieurs marchés montre le plus récent et signale les autres, mais
  ne sait pas les **agréger**.
- `_aiParsePeriode` ne gère qu'**un seul** mois : « compare mars et juin » n'en retient qu'un.

---

## 2026-07-12 — Vague 55 : CELLES QUI AVOUAIENT SAVENT MAINTENANT  (v1333 → **v1334**)

**Nature** : solde de l'angle mort déclaré en vague 54.

La v1333 a posé la règle : *« une compétence qui ne sait pas filtrer par mois le DIT, au lieu
d'ignorer le paramètre en silence »*. C'était honnête — **mais ce n'était pas résolu**, et nous
l'avions écrit noir sur blanc dans nos propres angles morts.

> **L'AVEU N'EST QU'UNE ÉTAPE, PAS UNE DESTINATION.**

Les trois compétences qui avouaient apprennent ici à faire :

| Compétence | Le bug |
|---|---|
| `aiQueryCharges` | le mois était **codé en dur** (le mois courant) |
| `aiQueryGaspillage` | agrégeait **tous** les marchés depuis toujours, sans notion de période |
| `aiQueryBilanMarche` | prenait **toujours** le dernier marché, quel que soit le mois demandé |

**Ajouté** (`mois-partout.test.js`, 39 assertions) :
- `marcheDate` — la date d'un marché, **règle unique** (elle était recopiée à deux endroits).
- `marchesDuMois` / `gaspillageMarches` — pures.

**RÈGLES FIGÉES** :
- **A — un mouvement de marché (don, perte, retour) n'a pas de date propre** : il est daté par le
  **marché** auquel il appartient. Dater autrement inventerait une chronologie.
- **B — LA DISTINCTION CAPITALE, cœur de la vague** : *« aucun marché ce mois-là » n'est PAS « aucun
  gaspillage »*. Le premier est une **absence de données**, le second une **performance**. Les
  confondre reviendrait à afficher « aucun gaspillage, bravo ! » pour un mois où Benjamin n'a
  simplement **rien vendu**.
  Le test D5 le prouve : les deux cas donnent le **même total (0)** — seul `nbMarches` les
  distingue. **Sans ce compteur, ils seraient indiscernables.**
- **C — un RETOUR n'est PAS du gaspillage** : l'invendu est récupéré, il repart au stock. Seuls les
  dons et les pertes sortent définitivement.
- **D — si plusieurs marchés ont eu lieu dans le mois demandé, on le DIT.** Ne pas signaler qu'on a
  choisi, c'est laisser croire qu'il n'y avait rien d'autre : **un mensonge par omission.**

**Autres vérifications** : le gros don de juin **ne fuit pas** dans le bilan de mai (C7 — c'est tout
l'objet du filtrage) ; traçabilité mai + juin = l'historique complet (C11) ; sans mois, le
comportement d'origine est **intact** (C9).

**INVARIANT ÉTENDU** (la vague 54 le vérifiait sur 3 intentions, il porte maintenant sur **toutes**) :
aucune compétence ne peut être à la fois dans `AI_INTENTS_MOIS` et dans `AI_INTENTS_MOIS_ATTENDU` —
*elle sait, ou elle avoue. Pas les deux.*
**Six** compétences honorent désormais un mois nommé, contre trois.

**Total couvert** : 1198 → **1237 assertions**.

**Angles morts connus (déclarés)** :
- Il reste **cinq** compétences qui avouent : rentabilité, top parfum, panier moyen, seuil de
  rentabilité, revenu horaire. Les trois dernières sont des **calculs sur fenêtre glissante** — les
  filtrer par mois demanderait de repenser leur période de référence, pas juste d'ajouter un filtre.
- Toujours **aucune plage** : « de mars à juin », « le 1er trimestre », « l'an dernier ».
- Le bilan marché d'un mois à plusieurs marchés montre le **plus récent** et signale les autres,
  mais ne sait pas encore les **agréger** (« mon bilan marché de mai » = les deux marchés cumulés).

---

## 2026-07-12 — Vague 54 : UNE SEULE VÉRITÉ, ET AUCUN PARAMÈTRE PERDU  (v1332 → **v1333**)

**Nature** : deux dettes soldées — toutes deux **déclarées par nous-mêmes** aux vagues précédentes.
Une dette qu'on s'inflige soi-même est la plus urgente à payer.

### Dette 1 — les graphiques contredisaient le copilote  *(angle mort déclaré en vague 52)*
La v1331 a basculé le copilote sur la **vérité comptable** (le mois où l'argent rentre). Mais les
**courbes** des écrans stats sont restées sur l'ancienne base (mois de la **commande**, montant
**total**). L'app affichait donc **deux CA différents pour le même mois, sur deux écrans**.
On avait corrigé un écran et laissé l'autre le contredire — **exactement la maladie qu'on prétend
soigner**.

*Correctif* : `serieMensuelleEncaisse`, bâtie sur `caMoisEncaisse` (v1331, déjà testée).
**On ne recrée SURTOUT PAS une troisième vérité — on réutilise celle qui existe.** C'est tout le
principe, et le bloc B l'assert : la courbe doit coïncider **au centime** avec le copilote *et* avec
la compta.
Basculés : les **courbes** (CA + macarons), la **détection d'anomalies** (un mois « atypique »
calculé sur la mauvaise base signalerait de fausses alertes et en raterait de vraies), et la
**comparaison mois vs mois**.

*Non basculé, mais ÉTIQUETÉ* : le graphe « macarons **par client** ». La date de **commande** y est
la **bonne** base — c'est un comportement d'ACHAT, pas de la trésorerie. Il porte désormais son
libellé explicite (« par date de commande ») : *un chiffre juste sur une base non dite finit
toujours par ressembler à une erreur.*

### Dette 2 — le paramètre perdu en silence  *(angle mort déclaré en vague 51)*
La v1330 a appris le mois nommé au CA… **et à lui seul**. « Mon net en poche en mai » renvoyait
**juillet** : `aiQueryNetPoche` codait `monthKey(today())` **en dur** et ignorait purement ses
paramètres. Même bug, même gravité que la v1330 : l'intention est BONNE, le **paramètre** se perd,
et l'app affiche un chiffre juste **à une autre question**.

**DEUX RÈGLES FIGÉES** :
1. Le mois nommé est **injecté** dans toutes les compétences qui savent le traiter
   (`AI_INTENTS_MOIS` : CA, net en poche, URSSAF — les deux dernières câblées ici).
2. Celles qui **ne savent pas** le traiter ne l'ignorent plus en silence : elles le **DISENT**
   (`AI_INTENTS_MOIS_ATTENDU`). *Un paramètre donné par Benjamin et jeté sans un mot, c'est le pire
   des deux mondes.*

Le **stock** est délibérément absent des **deux** listes : c'est une **photo du présent**. Prétendre
pouvoir le filtrer par mois — ou s'en excuser — serait une autre forme de mensonge.

**Ajouté** (`une-seule-verite.test.js`, 26 assertions) :
- **A** — la série mensuelle : les mois affichés sont ceux où l'**argent est rentré**. Macarons au
  **même prorata** que les euros (sinon les deux courbes d'un même graphique raconteraient deux
  histoires). Traçabilité : la somme des mois = tout l'encaissement, ni plus ni moins.
- **B** — **une seule source** : la courbe = le copilote = la compta, au centime, mois par mois.
- **C — GARDE-FOU STRUCTUREL** : interdit le **motif** — toute lecture d'un CA mensuel depuis
  `computeStats` (base « date de commande ») dans du code d'affichage fait échouer la suite,
  y compris celles pas encore écrites. Les **écritures** (`+=`, construction des tables) restent
  légitimes : ce qu'on interdit, c'est de **lire** cette base pour afficher un CA.
  *Éprouvé* : l'ancienne base réintroduite → le garde-fou mord, avec le numéro de ligne exact.
- **D** — les deux tables de routage. **INVARIANT** : une compétence ne peut pas être dans les deux
  (elle sait, ou elle avoue — pas les deux).
- **E** — `aiQueryNetPoche` lit enfin `params.periode` ; `aiQueryUrssaf` affiche le mois demandé.

**Total couvert** : 1172 → **1198 assertions**.

**Angles morts connus (déclarés)** :
- `AI_INTENTS_MOIS` ne compte que **3 compétences**. Les autres (charges, gaspillage, bilan marché,
  rentabilité…) **avouent** ne pas savoir filtrer par mois — c'est honnête, mais ce n'est pas
  résolu. Chacune demande un vrai travail de filtrage temporel.
- Toujours **aucune plage** : « de mars à juin », « le 1er trimestre », « l'an dernier ».
- La série mensuelle **recalcule** `caMoisEncaisse` pour chaque mois : correct, mais O(mois ×
  commandes). Sans effet à cette échelle ; à surveiller si l'historique grossit beaucoup.

---

## 2026-07-12 — Vague 53 : « PRÉSENT » N'EST PAS « PLAUSIBLE »  (v1331 → **v1332**)

**Nature** : BUG DE PRODUCTION + bug de RÉDACTION, remontés par Benjamin :
*« c'est marqué 78 macarons à vendre par mois minimum, puis plus bas le vrai chiffre est
47 macarons plus haut. On n'y comprend rien. »*

### 1. L'explication était incompréhensible — et c'est notre faute
Le bandeau affichait : *« l'app t'annonçait **31 macarons**. Le vrai chiffre est **47 macarons plus
haut**. »* Les nombres étaient **justes** (31 + 47 = 78, le chiffre affiché en haut), mais :
- il fallait faire **l'addition de tête** ;
- « le vrai chiffre est **47** … » se lit comme si 47 *était* le résultat.

Trois nombres, dont un **écart** formulé comme un résultat. **Une explication qui exige un calcul
mental a raté sa mission.** Réécrit : *« Avant, l'app t'annonçait 31. **La réalité, c'est 78** (soit
47 de plus). »*

### 2. Le vrai problème : le point mort est SOUS-ESTIMÉ
Le coût de structure de Benjamin ne compte que **40,60 €/mois** de temps hors-atelier, soit
**~3 h 20 par mois** — pour TOUT l'administratif, les courses, les déplacements, la prospection et
la prépa marché **réunis**. Moins de 50 minutes par semaine : manifestement sous-pointé.

Or `coutTempsHorsProdMensuel` déclarait `fiable:true` **dès qu'UNE SEULE session existait**. Le
point mort se présentait donc comme « tout payé » en reposant sur presque rien.

> **Un chiffre bâti sur une mesure dérisoire n'est pas FIABLE — il est juste PRÉSENT.**
> Confondre les deux, c'est fabriquer exactement la fausse confiance que cette série traque.

*Correctif* : `plausible` distingue désormais la **présence** de la **crédibilité**
(`SEUIL_HEURES_HORS_ATELIER = 8 h/mois` — déjà 2 h/semaine pour tout le hors-atelier, un plancher
généreux). En dessous : alerte explicite, « ton point mort réel est PLUS HAUT ».

### 3. Le taux de sensibilité — l'inconnue devient exploitable
Plutôt que de **subir** l'incertitude, on la **chiffre** :

    macarons escamotés par heure NON pointée  =  taux horaire ÷ marge de contribution

Chez Benjamin : 12 €/h ÷ 1,07 € ≈ **12 macarons par heure oubliée**. S'il passe réellement 15 h/mois
au lieu des 3 h 20 pointées, son point mort tourne autour de **220**, pas 78.

**Ce n'est pas un chiffre inventé : c'est un TAUX exact.** L'app donne le taux ; **l'estimation des
heures n'appartient qu'à Benjamin**, et l'écran le dit explicitement.

**Ajouté** (`point-mort-verite.test.js` : 58 → **72 assertions**) :
- **F** — `plausible` : 20 h/mois → plausible ; **le cas réel de Benjamin (~3,4 h/mois) → fiable mais
  PAS plausible**, avec alerte. Seuil figé comme frontière nette (8 h → plausible ; 7,9 h → alerte).
  `fiable:false` sur zéro pointage reste intact (non-régression v1324).
- **G** — `macaronsParHeureHorsAtelier` : 12 € ÷ 0,58 € = **21** (arrondi au supérieur). Sans taux
  horaire → `null` (**on n'invente pas**). Marge de contribution **négative** → `null` aussi : une
  division par un nombre négatif n'aurait aucun sens ici.

**Total couvert** : 1158 → **1172 assertions**.

**Angles morts connus (déclarés)** :
- Le seuil de 8 h/mois est un **jugement**, pas une mesure. Il est volontairement bas (donc
  conservateur : il n'alerte que sur les cas flagrants). Un artisan qui pointerait *réellement*
  6 h/mois serait averti à tort.
- La projection « si tu passes 15 h » utilise **15 h en dur** comme illustration. C'est un exemple,
  pas une estimation de Benjamin — l'écran le précise, mais l'idéal serait de lui **demander** son
  estimation plutôt que de la supposer.
- Le taux de sensibilité suppose la **marge de contribution constante**. Vendre davantage à prix
  et coûts inchangés : vrai. Changer le mix produit : faux.

---

## 2026-07-12 — Vague 52 : LE CA D'UN MOIS AVAIT DEUX VÉRITÉS  (v1330 → **v1331**)

**Nature** : BUG DE PRODUCTION, remonté par Benjamin — *« le chiffre est totalement faux »*.
« Mon chiffre d'affaires de mai » → **50,00 €** … et **0 macaron écoulé**. L'incohérence était
visible à l'œil nu : 50 € pour zéro macaron.

### Deux sources divergentes

| | Source | Mois retenu | Montant compté |
|---|---|---|---|
| **A — la vérité comptable** (tableau de bord, compta) | `caEncaisseParMois()` | date du **PAIEMENT** | ce qui est **réellement encaissé** |
| **B — ce que lisait le copilote** | `computeStats().global.parMois` | date de la **COMMANDE** | le **TOTAL** de la commande |

Une commande passée en mai et payée en juillet comptait donc **intégralement en mai** — de
l'argent pas encore rentré. Et le copilote annonçait « CA des commandes **payées** sur la
période » : sa « période » était la date de commande. **Le libellé mentait.**

### Le correctif
**UNE SEULE VÉRITÉ : l'ENCAISSEMENT.** Celle de la compta, de l'URSSAF et du tableau de bord.
*Deux écrans ne doivent jamais donner deux CA pour le même mois.* Même discipline qu'en v1325
(`partServiceCommande`) : une règle, un seul endroit.
La **liste mensuelle** de la vue globale utilisait la même règle fausse → corrigée aussi, sinon le
total et le détail racontaient deux histoires **sur le même écran**.

**LES MACARONS SUIVENT L'ENCAISSEMENT AU PRORATA** — même règle que l'emballage (v1326). Une
commande encaissée à moitié en mai n'apporte que la moitié de ses macarons à mai. Sans cela, les
euros seraient sur une base et les macarons sur une autre : **c'est exactement ce qui produisait
« 50 € / 0 macaron »**.

**Ajouté** (`ca-deux-verites.test.js`, 38 assertions) :
- `macaronsDeCommande` — pure, le compte de macarons d'UNE commande.
- `caMoisEncaisse` — pure : CA encaissé du mois, macarons au prorata, détail par commande,
  **et l'ancien chiffre + l'écart** (on ne remplace jamais un nombre en silence — règle v1324).
- **A** — le bug exact : commande de mai payée en juillet → 0 € en mai (ancien : 100 €), 100 € en
  juillet (ancien : rien — le mois était vide **à tort**).
- **B** — paiement en deux fois : acompte mai 50 € / solde juin 150 €. Le prorata des macarons
  suit (10 puis 30 sur 40). **Traçabilité** : mai + juin = la commande entière, aucun euro ni
  macaron perdu ou dupliqué.
- **C** — le « X € / 0 macaron » **légitime** : une prestation vend du temps. Ce n'est pas un bug,
  mais l'app doit l'**expliquer**, pas laisser Benjamin deviner. Le montant est isolé (`caPrestation`).
- **D** — garde-fous : commande non payée, **trop-perçu borné à 1** (jamais 130 % des macarons),
  reprises historiques exclues (**même règle** que `caEncaisseParMois`), robustesse.
- **E — ANTI-DIVERGENCE, l'assertion capitale.** `macaronsDeCommande` **duplique** la lecture des
  lignes de `computeStats`. Une duplication non prouvée, c'est la divergence de demain — *celle-là
  même que cette vague corrige*. E1–E3 l'assertent **contre `computeStats`**, sur les mêmes
  commandes : macarons standards, grands formats et total doivent coïncider à l'unité.
- **F** — le copilote et `caEncaisseParMois` doivent annoncer **le même CA au centime**, mois par
  mois. C'est le but de toute la vague.

**Total couvert** : 1120 → **1158 assertions**.

**Angles morts connus (déclarés)** :
- `computeStats().global.parMois` reste sur la base « date de commande » et alimente encore les
  **graphiques** (écrans stats, lignes 23083 et 23816). Ces courbes gardent donc l'ancienne base :
  elles ne mentent pas *en soi* (c'est une vue « par commande »), mais elles **ne coïncident pas**
  avec le CA du copilote. À trancher : soit les basculer, soit les intituler explicitement
  « par date de commande ».
- Le prorata des macarons **arrondit** à l'unité par commande (`Math.round`). Sur un paiement en
  trois fois, la somme peut donc dévier d'un macaron du total de la commande. Assumé.
- `caPrestation` détecte « un encaissement sans aucun macaron ». Une commande **mixte**
  (coffret + atelier) n'est pas ventilée : ses euros de prestation ne sont pas isolés.

---

## 2026-07-12 — Vague 51 : LE COPILOTE NE SAVAIT PAS LIRE UN MOIS  (v1329 → **v1330**)

**Nature** : BUG DE PRODUCTION, remonté par Benjamin (capture d'écran).
« Quel est mon ca du mois » → **497,60 €**, juste. Puis « Et le ca de mai » → **vue GLOBALE**
(3 561,95 €, tout l'historique) au lieu du CA de mai (**50,00 €**).

### La cause
`parseIntent` ne connaissait que **deux** périodes : `moisCourant` et `moisDernier`. Un mois
**nommé** — le repère le plus naturel qui soit — n'était pas prévu. `periode` retombait à `null`,
et `aiQueryRevenue` basculait alors en vue globale.

### Pourquoi c'est grave
Le copilote **ne disait pas** qu'il n'avait pas compris. Il affichait un chiffre **parfaitement
juste… à une autre question**. Même famille que les « détournements » de la vague 48 — mais que la
désambiguïsation **ne pouvait pas attraper** : l'intention était BONNE (`query_revenue`), seul le
**paramètre** se perdait en route.

> **Leçon : un routage correct ne garantit pas une réponse correcte.** La vague 48 protège le choix
> de la compétence ; rien ne protégeait ses paramètres.

### Le piège de l'ordre — c'est LUI le correctif
« du mois de **mai** » contient « **du mois** ». La règle générique l'aurait donc capté comme
« ce mois-ci ». **Le mois nommé est désormais testé EN PREMIER.** L'ordre n'est pas un détail de
style : c'est le correctif.

**Ajouté** (`mois-nomme.test.js`, 44 assertions) :
- `_aiMoisNomme(t, refDate)` — **pure**. La date de référence est un paramètre : sans elle, un test
  écrit en juillet casserait en septembre.
- **A** — le bug exact de la capture : « Et le ca de mai » → `2026-05` (avant : `null`).
- **B** — LE PIÈGE DE L'ORDRE : « du mois de mai » → mai ; mais « du mois » **seul** reste le mois
  courant, et « le mois dernier » reste le mois dernier (aucune régression).
- **C** — **RÈGLE D'ANNÉE FIGÉE** : sans année explicite, un mois désigne sa dernière occurrence
  **révolue ou en cours**. En juillet 2026 : « mai » → 2026-05 ; « août » → **2025**-08 (août 2026
  n'a pas eu lieu, on ne l'invente pas). Année explicite (« mars 2025 ») → elle prime toujours,
  même dans le futur. C9 vérifie que la date de référence est réellement prise en compte (sinon le
  test serait vide de sens).
- **D — LES FAUX POSITIFS, le vrai danger.** Un mois détecté à tort détournerait une requête
  parfaitement claire vers une période fantaisiste. « ja**MAI**s », « **MAI**son », « dé**MAR**rer »,
  « surt**OUT** » : testés un par un. Les frontières de mot (`\b`) sont ce qui protège — le bloc le
  **prouve** au lieu de l'espérer.
- **E** — les **douze** mois, un par un, accentués ou non (le texte est normalisé : « août » →
  « aout »). Un seul nom mal transcrit dans la table = un mois muet pour toujours.
- **F** — format de sortie `AAAA-MM` avec `padStart` (janvier → `2026-01`, jamais `2026-1`, sinon la
  clé ne matcherait jamais `R.global.parMois`).

**Comportement modifié** :
- Mois **vide** : le copilote le dit franchement (« le mois existe, il est simplement vide — ce n'est
  pas une erreur de ma part ») au lieu de basculer en douce sur le total.
- `_aiMoisNomme` applique `escapeRe` bien que `nom` vienne d'une table codée en dur : **une règle
  qu'on applique « sauf quand c'est sûr » est une règle qu'on n'applique pas** (vague 49).

**Effet de bord constaté** : deux harnais de test (`copilote-comprehension`, `donnees-pas-code`)
n'extrayaient pas la nouvelle dépendance de `parseIntent` → ils ont **échoué immédiatement**. C'est
le rôle du filet : une dépendance ajoutée sans mettre à jour les modules de test se voit tout de
suite.

**Total couvert** : 1076 → **1120 assertions**.

**Angles morts connus (déclarés)** :
- Seul `query_revenue` bénéficie du mois nommé. Les autres compétences à période (net en poche,
  charges, gaspillage, bilan marché…) ne comprennent **toujours pas** « en mai ». C'est le même
  bug, ailleurs — à généraliser.
- Aucune plage : « de mars à juin », « le 1er trimestre », « l'an dernier » ne sont pas reconnus.
- Si deux mois sont cités (« compare mars et juin »), seul le **premier trouvé dans l'ordre de la
  table** est retenu — silencieusement. C'est une limite assumée, pas une intention.

---

## 2026-07-12 — Vague 50 : L'APOSTROPHE TUAIT LES BOUTONS  (v1328 → **v1329**)

**Nature** : audit de l'angle mort déclaré en vague 49. Même faille (« les données ne sont pas du
code »), **autre langage** : côté regex en v1328, côté **JavaScript des attributs inline** ici.

### Le piège

    onclick="maFonction('${nom}')"

C'est l'**apostrophe** qui délimite la chaîne JS. Or :
- `esc()` échappe `& < > "` … mais **pas** l'apostrophe (inoffensive en HTML, fatale en JS) ;
- `encodeURIComponent()` **ne l'encode pas non plus** — idée reçue tenace :
  `encodeURIComponent("Fleur d'oranger")` → `Fleur%20d'oranger` ← **elle survit**.

En pâtisserie française, l'apostrophe est la **norme** : « Fleur d'oranger », « Crème d'amande »,
« L'Épi d'Or ». Ce n'est pas un cas tordu, c'est le quotidien.

**9 sites corrigés** : boutons « valider un parfum », « dévalider », « appliquer la suggestion »,
« appliquer la composition du coffret », « valider & figer les parfums », ajout d'item grand format,
reports de planning (×2), et un **nom de client/marché injecté brut en HTML** (ligne 45083).

### Cinq variantes artisanales, dont deux fausses
L'audit a trouvé **cinq** façons d'échapper l'apostrophe cohabitant dans le fichier :

| # | Variante | Verdict |
|---|---|---|
| 1 | `esc(x).replace(/'/g,"\\'")` (×17) | marche, mais ignore l'antislash et le saut de ligne |
| 2 | `String(x).replace(/'/g,"\\'")` | idem |
| 3 | `x.replace(/\\/g,'\\\\').replace(/'/g,"\\'")` | **le seul complet** — un endroit sur cinq |
| 4 | `String(x).replace(/'/g,'')` | **DESTRUCTIF** : supprimait l'apostrophe du nom |
| 5 | `esc(x).replace(/'/g,'&#39;')` | **FAUX** : le navigateur **redécode** `&#39;` en apostrophe **avant** de compiler le JS de l'attribut → le bouton casse quand même |

> Une protection qui ne protège rien est **pire** que pas de protection : elle rassure.

*Corrigé* : un helper unique, `escJs()`. **L'ORDRE y est critique** — antislash **d'abord** (sinon
on échappe ses propres échappements), puis apostrophe, puis sauts de ligne, puis `esc()` pour
l'attribut. Les 22 échappements artisanaux ont été migrés ; il n'en reste **aucun**.

### L'erreur que j'ai commise en chemin (figée dans les tests)
Ma **première correction** remplaçait `encodeURIComponent` par `escJs`. **Elle était fausse** : la
fonction réceptrice fait un `decodeURIComponent`, et retirer l'encodage de **transport** casse
l'aller-retour — un parfum « Chocolat 70% » aurait levé une **URIError**.
Il faut **les deux couches, dans cet ordre** : `escJs(encodeURIComponent(x))`.
Bloc **D-bis** : teste l'aller-retour COMPLET (handler compilé comme le navigateur le fait,
entités HTML décodées, puis `decodeURIComponent`) et prouve que **chaque couche seule est
insuffisante** (Dbis5 : sans escJs → ne compile pas ; Dbis6 : sans encodeURIComponent → URIError).

**Ajouté** (`apostrophe-boutons.test.js`, 40 assertions) :
- **A** — la démonstration que `encodeURIComponent` et `esc()` ne protègent PAS.
- **B** — `escJs` et son ordre critique (B4 : inverser antislash/apostrophe produit un échappement
  silencieusement faux).
- **C** — **la seule preuve qui vaille** : le handler est reconstruit *tel que le navigateur le
  compile* (entités décodées) et **évalué**. 8 noms réels ; la fonction doit recevoir le nom EXACT,
  non mutilé.
- **D** — rejoue les anciennes variantes pour figer **pourquoi** elles étaient fausses.
- **E1/E2** — garde-fous structurels.

### Le garde-fou a d'abord été aveugle — et c'était prévu
Première version d'E2 : scan **ligne par ligne**. Bug réintroduit volontairement → **il n'a rien
vu**. La variable est affectée ligne 17433 et utilisée ligne 17436.
C'était **exactement** l'angle mort déclaré en fin de vague 49 (« une construction en plusieurs
étapes lui échapperait »). Il a mordu **dès la vague suivante**.
E2 **suit désormais la donnée** à travers le fichier : variables affectées depuis `escJs(` → sûres ;
depuis `encodeURIComponent(` nu → dangereuses ; aucune dangereuse ne doit atterrir dans un handler.
Re-vérifié : le bug réintroduit est maintenant **attrapé avec les numéros de ligne exacts**.

**Total couvert** : 1036 → **1076 assertions**.

**Angles morts connus (déclarés)** :
- E2 ne suit la donnée que sur **une affectation directe**. `const a = encodeURIComponent(x); const b = a;`
  puis `'${b}'` lui échapperait encore.
- L'audit a couvert les handlers **inline** (`onclick=`, `oninput=`…) et les injections HTML des
  champs `.nom/.libelle/.parfum`. Les **notes libres** et **libellés de charges** injectés ailleurs
  n'ont pas tous été revus.
- `esc()` reste volontairement **sans** échappement d'apostrophe : c'est correct pour du contenu
  HTML, et le corriger « par prudence » polluerait tout l'affichage (`&#39;` visible partout).
  La séparation esc/escJs est le bon découpage — encore faut-il choisir le bon des deux.

---

## 2026-07-12 — Vague 49 : UN NOM DE CLIENT TUAIT LE COPILOTE  (v1327 → **v1328**)

**Nature** : BUG DE PRODUCTION, remonté par Benjamin (capture d'écran) — *« Invalid regular
expression: unmatched parentheses »*, sur toutes ses questions. Il précisait : **« plus rien ne
fonctionne, et ça date d'il y a un certain temps »**. Il avait raison sur les deux points.

### La cause
`aiFindClient` construisait ses expressions régulières **à partir du nom du client**, sans échapper :

    new RegExp('\\b' + last + '\\b')          ← `last` = un mot du nom du client

Un client nommé « Boulangerie Martin (Le Mans) » produisait donc `/\bmans)\b/` : parenthèse non
fermée → SyntaxError.

### L'ampleur
`aiFindClient` est appelée **depuis `parseIntent`**. Donc **toutes** les requêtes plantaient — pas
seulement celles parlant d'un client. Même « bonjour » était condamné. Le copilote était
**intégralement mort**, depuis le jour de création de ce client. Et il affichait *« réessaie ou
reformule ta demande »* : Benjamin pouvait croire que le problème venait de SA façon d'écrire.

Il suffisait d'**un seul** nom contenant `( ) + * ? [ ] |` pour tout condamner, en silence.

### La leçon
`escapeRe()` **existait déjà** dans app.js (ligne 14756), et était **utilisée ailleurs**
(`aiFindMaterial` scoring). Elle avait simplement été oubliée ici.
**Le danger n'est pas d'ignorer la règle : c'est de la connaître et de l'appliquer à 90 %.**

*Corrigé aussi, par le même audit* : les regex bâties sur les **codes de lot** (×2) et sur les
**noms d'emballage** — mêmes données, même faille latente.

**Ajouté** (`donnees-pas-code.test.js`, 26 assertions) :
- **A** — la requête exacte de la capture d'écran ; puis « mes commandes », « mon stock », et même
  « bonjour » : la démonstration que le bug n'avait **rien à voir avec la phrase tapée**.
- **B** — les **12 métacaractères**, un par un (`( ) [ ] + % * ? | { } ^ $ \ .`). La parenthèse est
  celle qui a mordu ; un nom de client est du texte libre, il peut contenir n'importe quoi.
- **C** — la réparation n'a pas cassé la recherche : nom de famille, prénom, et le client parenthésé
  est bien **trouvé** (pas seulement « non fatal »). Échapper ≠ neutraliser le sens.
- **E1 — LE GARDE-FOU STRUCTUREL.** Ne teste pas un cas : **scanne app.js et interdit le MOTIF**.
  Toute `new RegExp('…' + variable + '…')` qui ne passe pas par `escapeRe` fait échouer les tests —
  **y compris celles qui ne sont pas encore écrites**. Seules les tables codées en dur dans app.js
  (jours, allergènes, corrections orthographiques) sont exemptées.

### Le filet a été mis à l'épreuve
Un garde-fou qui passe peut passer **pour de mauvaises raisons**. Le bug a donc été **réintroduit
volontairement** : **9 assertions se déclenchent**, dont E1. (Première tentative de vérification :
mon propre script d'échappement Python n'avait rien remplacé — le test « passait » sans avoir été
éprouvé. Un faux vert de vérification vaut zéro.)
Les appels de test ont par ailleurs été **protégés** : un test qui *plante* est un signal, pas un
diagnostic — on veut un rapport lisible même quand le bug est là.

**RÈGLE FIGÉE : LES DONNÉES DE BENJAMIN NE SONT PAS DU CODE.**

**Total couvert** : 1010 → **1036 assertions**.

**Angles morts connus (déclarés)** :
- `aiNormalize` **ne retire pas** la ponctuation : les parenthèses survivent à la normalisation.
  On a choisi d'échapper à la construction de la regex (correction à la racine) plutôt que de
  filtrer en amont, qui aurait changé le comportement d'autres fonctions.
- Le garde-fou E1 est **syntaxique** : il détecte `new RegExp('…'+var)`. Une regex construite en
  plusieurs étapes (`const p = '\\b'+nom; new RegExp(p)`) lui échapperait.
- Les autres champs de texte libre (notes, libellés de charges) ne sont pas encore audités pour
  d'autres usages dangereux (injection HTML dans `innerHTML`, par exemple).

---

## 2026-07-12 — Vague 48 : LE COPILOTE DEMANDE AU LIEU DE RÉPONDRE À CÔTÉ  (v1326 → **v1327**)

**Nature** : correction du danger mesuré en vague 47 — les **15,7 % de détournements** (réponse
confiante à la mauvaise question).

### Ce qu'on n'a PAS fait, et pourquoi
On n'a **pas** écrit de re-classeur qui devinerait « la bonne » intention à la place de
`parseIntent`. Les signatures auraient été calées sur un corpus de 51 phrases *inventées* : on
n'aurait fait que corriger un chiffre qu'on a soi-même fabriqué (**surapprentissage**), et déplacé
les erreurs au lieu de les supprimer. C'est très exactement le reproche fait à l'idée du LLM
embarqué — il aurait été absurde de le reproduire à la main.

### Ce qu'on a fait
On **détecte l'ambiguïté** et on **demande**. Convertir une réponse fausse et confiante en une
question inoffensive, c'est déjà tout le gain — pour **0 Mo** et **100 % hors-ligne**.

**Règle de déclenchement, délibérément CONSERVATRICE** :
> on ne demande QUE si l'intention retenue ne porte **aucune signature propre** dans le texte,
> **alors qu'**une intention rivale, elle, en porte une.

Conséquence structurelle : une requête qui contient déjà la signature de sa propre compétence
**n'est jamais dérangée**. C'est ce qui rend les faux positifs quasi impossibles — et c'est testé.

**Ajouté / modifié** (`copilote-comprehension.test.js` : 4 → **8 assertions**) :
- `AI_MARQUEURS` — table déclarative des signatures, écrite d'après **ce que chaque compétence
  mesure** (le CA = ce qui entre ; le net en poche = ce qui reste ; le revenu horaire = rapporté au
  temps ; le point mort = un volume minimum ; les charges = ce qui sort ; le coût de revient = un
  produit), et non d'après les phrases qui échouaient.
- `aiIntentAmbigu(t, intent)` — pure. Renvoie `{ambigu, rivaux}` et **jamais** une intention de
  remplacement : on ne prétend pas savoir mieux que `parseIntent`, on constate qu'on ne peut pas
  trancher.
- `aiDemanderPrecision` — expose l'intention que `parseIntent` avait retenue **en premier**
  (transparence), puis les rivales. Aucune n'est présentée comme « la bonne ».
- `aiForcerIntent` — le choix de Benjamin court-circuite `parseIntent` (qui vient d'hésiter) :
  aucune ré-analyse du texte, sinon on retomberait dans le même détournement.
- Écarté du mécanisme : les **actions critiques** (créer une commande, lancer une prod), qui ont
  déjà leur double confirmation, et `unknown`, qui a déjà son repli sur suggestions.

**Résultat mesuré** : **8 détournements sur 8 rattrapés**, **0 faux positif** sur les 41 requêtes
déjà comprises.

### Le garde-fou contre nous-mêmes : le corpus de VALIDATION (holdout)
8/8 avec 0 faux positif, c'est trop beau — et les signatures ont été écrites **en connaissant** les
8 cas fautifs. Un corpus de **15 phrases jamais vues** lors de leur conception a donc été ajouté.
Le chiffre qui compte n'est pas le taux de succès mais le nombre de **faux positifs** : un détecteur
qui dérange des requêtes déjà bien comprises est nuisible, peu importe ses succès ailleurs.
**Résultat : 15/15 comprises sans être dérangées, 0 faux positif.**

Assertion figée : *si un faux positif apparaît, la désambiguïsation est devenue plus nuisible
qu'utile et doit être retirée.*

### Le journal des VRAIES requêtes
`aiUsageLog` ne conservait qu'**une** requête par compétence (la dernière) : impossible de rejouer
l'historique. Le banc de la vague 47 a donc dû se rabattre sur 51 phrases *plausibles* — honnêtes,
mais **inventées**, donc discutables.
Ajouté : `aiJournalAjoute` / `aiJournalCharge` (anneau borné à 200 entrées, rien ne quitte le
téléphone) et `aiAuditJournal` (pure) + la compétence **« audit copilote »**, qui mesure sur les
**vraies formulations de Benjamin** : compris directement / a dû faire préciser / pas compris.
L'écran dit explicitement qu'« *a dû faire préciser* » n'est **pas** un échec : c'est une réponse
fausse évitée.

**Total couvert** : 1006 → **1010 assertions**.

**Angles morts connus (déclarés)** :
- `AI_MARQUEURS` ne couvre que **15 compétences** sur ~85 — celles du cluster financier/marché, où
  le recouvrement est le plus dangereux. Les autres ne sont pas protégées.
- La règle conservatrice a un **coût assumé** : une requête où l'intention retenue porte sa propre
  signature *et* celle d'une rivale (« mes charges par macaron ») n'est pas détectée comme ambiguë.
  Choix délibéré — zéro faux positif prime sur l'exhaustivité.
- La mesure de référence reste celle d'un corpus **inventé**. Le journal la remplacera par une
  mesure **observée** dès que Benjamin aura utilisé le copilote quelques jours. C'est cette
  mesure-là qui devra trancher la question du LLM embarqué.

---

## 2026-07-12 — Vague 47 : LE CERVEAU DU COPILOTE ÉTAIT INTESTABLE  (outillage — app.js inchangé)

**Origine** : Benjamin envisageait d'embarquer un LLM on-device (AI Edge Gallery / FunctionGemma)
pour que le copilote comprenne mieux ses demandes. Avant de supposer, **mesurer**. Impossible :
`parseIntent` — la fonction qui comprend le langage naturel — n'était pas extractible.

### Le bug de fondation : `_extract.js` était aveugle aux littéraux de regex
Le stripper de commentaires ET l'équilibreur d'accolades ne connaissaient que trois délimiteurs de
chaîne (`"` `'` `` ` ``). Sur une ligne comme :

    if(/\b(prod|fournee)\b.{0,18}\b(de|d')\b/.test(t))     ← parseIntent, ligne 33022

l'apostrophe de « d' » ouvrait une **fausse chaîne** : tout le code jusqu'à l'apostrophe suivante
était avalé, les accolades se déséquilibraient, l'extraction s'arrêtait beaucoup trop tôt.

**Mesure** : `parseIntent` (769 lignes) était extraite… **sur 66 lignes**, en JS invalide.
Le CERVEAU du copilote était donc **littéralement intestable**. Ce n'est pas un hasard si la
vague 36 n'avait pu couvrir que `_aiDispatch` (l'aiguillage — un simple `switch`) et jamais la
compréhension elle-même.

L'échec était **bruyant** (SyntaxError), donc aucun test n'est passé au vert à tort — le filet n'a
jamais menti. Mais **un angle mort qui se défend en refusant d'être testé reste un angle mort**.

*Correctif* : détection des littéraux de regex (`regexPeutCommencerAt` + `finDeRegex`, scan arrière
en O(1) — app.js fait 5,5 Mo), partagée par le stripper et l'équilibreur. Les classes `[...]` sont
suivies, les quantificateurs `.{0,18}` ne sont plus comptés comme des accolades.
*Preuve de neutralité* : les **1002 assertions** existantes restent vertes sans qu'aucune attente
n'ait été modifiée. `parseIntent` s'extrait désormais sur 768 lignes, valide.

### Le résultat de la mesure — et il contredit l'intuition
Corpus de **51 formulations** réalistes sur 12 compétences (canonique + reformulations, familiarités,
tournures orales) :

| | | |
|---|---|---|
| ✅ **Comprises** | 41 / 51 | **80,4 %** |
| ❌ **Non comprises** (« je n'ai pas compris ») | 2 / 51 | **3,9 %** |
| ⚠️ **DÉTOURNÉES** (répond à côté, avec assurance) | 8 / 51 | **15,7 %** |

**Formulation canonique : 12/12.** Le dispatcher n'est pas cassé.

**LE CONSTAT CENTRAL** : le copilote ne « comprend pas mal » — il **tranche mal entre des
compétences qui se recouvrent**. Les 8 détournements opposent tous des intentions
**sémantiquement voisines** (revenu horaire vs CA, seuil vs rentabilité vs URSSAF, charges vs coût
de revient, gaspillage vs stock, prochaine livraison vs commandes). Un garde-fou l'assert
explicitement : **aucun égarement total**.

Or `parseIntent` est une cascade de `if`-`return` : **le premier qui matche gagne**. Une compétence
déclarée tôt vole donc les requêtes d'une compétence déclarée plus tard (« combien je jette » est
capté par `query_stock` avant d'atteindre `query_gaspillage`).

**Conséquence pour la décision LLM** : un modèle plus gros ne supprimerait pas ce recouvrement — il
changerait seulement *lesquelles* il rate. Le problème est dans la **taxonomie des compétences** et
dans le **premier-arrivé-premier-servi**, pas dans la puissance du parseur. Et le vrai danger n'est
pas les 3,9 % de « je n'ai pas compris » (honnêtes, inoffensifs) : ce sont les **15,7 % de réponses
confiantes à la mauvaise question** — Benjamin repart avec le bon écran… pour la mauvaise demande.

**Ajouté** (`copilote-comprehension.test.js`, 4 assertions + rapport chiffré) :
- CLIQUET : compréhension ≥ 41/51, détournements ≤ 8/51. Toute évolution du copilote qui dégraderait
  l'un ou l'autre casse ici.
- Les 12 canoniques doivent toujours passer (sinon une compétence est devenue **inaccessible**).
- INVARIANT : tous les détournements restent entre compétences voisines.

**Total couvert** : 1002 → **1006 assertions** (le banc produit surtout un *rapport*, pas des
assertions en masse : sa valeur est le chiffre, pas le compte).

**Piste recommandée (non implémentée — décision de Benjamin)** : remplacer le premier-arrivé-
premier-servi par un **score de candidats**, et, en cas de quasi-égalité, **demander** (« tu veux
dire ton revenu horaire, ou ton chiffre d'affaires ? ») au lieu de trancher en silence. Coût : 0 Mo,
100 % hors-ligne, entièrement testable — et cela convertit 15,7 % de détournements dangereux en
désambiguïsations inoffensives.

**Angles morts connus (déclarés)** :
- Le corpus (51 formulations, 12 compétences sur ~85) est un **échantillon**, pas un recensement.
  Le taux réel sur l'ensemble des compétences peut différer.
- Les formulations sont *plausibles*, pas *observées* : `aiUsageLog` enregistre les vraies requêtes
  de Benjamin — les rejouer donnerait un chiffre bien plus solide que mes suppositions.

---

## 2026-07-12 — Vague 46 : L'EMBALLAGE ÉTAIT GRATUIT  (v1325 → **v1326**)

**Nature** : comblement de l'angle mort déclaré en vague 45.

**Le bug** : dans `revenuHoraireCalcul`, `coutEmballages` était initialisé à 0… et **jamais
calculé**. À l'endroit du calcul, il n'y avait que ce commentaire :

    // emballages : estimés via coût d'emballage moyen par macaron vendu (table packaging)
    // approche prudente : si non calculable finement, laissé à 0 (n'invente pas).

**Mettre 0 n'est pas s'abstenir.** C'est affirmer que l'emballage ne coûte rien. Chaque coffret,
ruban et sachet sortait gratuit du numérateur → revenu horaire **surestimé**. « N'invente pas »
servait de justification à un chiffre inventé : zéro.

Le plus frustrant : l'app **sait** chiffrer un emballage — `computeOrderMargins.coutEmb` (FIFO
réel + ratio d'estimation pour les reprises) et `marketTotals.coutEmb` (stock avant − après). Le
revenu horaire ne le lui avait jamais demandé.

**Ajouté** (`emballage-gratuit.test.js`, 41 assertions) :
- `coutEmballagesFenetre` — pure (rien lu en base, tout passé en argument).
- **RÈGLE CLÉ figée — l'emballage suit l'ENCAISSEMENT**, comme le CA. Le revenu horaire raisonne en
  trésorerie : une commande payée à 50 % n'apporte que 50 % de son CA, donc 50 % de son carton.
  Lui opposer 100 % de l'emballage fabriquerait une **fausse perte** (tests B1–B4, avec la preuve
  par l'absurde : le prorata conserve le ratio emballage/CA).
- Marché clos → **aucun prorata** (encaissé le jour même, règle B).
- GARDE-FOU : part encaissée bornée à 1 — un trop-perçu ne fait jamais compter 130 % d'un carton.
- **MESURÉ vs ESTIMÉ** : `mesure + estime = total` au centime, `partEstimee` en %, marquage ligne
  par ligne. L'estimation suit le même prorata que le reste (sinon l'égalité casse — test D8–D11).
  Faire passer une estimation pour une mesure serait un mensonge de plus.
- Robustesse : entrées nulles, commandes non encaissées, montant 0, encaissement négatif → écartées
  proprement, aucun NaN, aucune ligne parasite à 0 €.
- **Signature du bug** (F7) : l'écart de revenu horaire vaut exactement le coût d'emballage rapporté
  aux heures. 80 € de carton sur 20 h pointées = **4 €/h qui n'existaient pas**.

**Comportement modifié** :
- `revenuHoraireData` expose désormais `untilStr` (la borne haute de la fenêtre n'était pas
  remontée) : l'emballage doit filtrer sur **exactement** la même période que le CA.
- Écran « Mon revenu horaire » : la ligne Emballages était masquée tant qu'elle valait 0 — donc
  **elle n'avait jamais été affichée**. Elle est maintenant toujours visible, dépliable, avec le
  détail par commande/marché et le % estimé.
- `revenuHoraireAudit` : nouveau contrôle « Coût des emballages ». Si aucun coût n'est détecté alors
  que Benjamin emballe bien ses macarons, l'audit dit franchement que les coffrets ne sont pas
  paramétrés et que le revenu horaire est donc **surestimé**.

**Total couvert** : 961 → **1002 assertions**.

**Angles morts connus (déclarés)** :
- Le prorata matières (`ratio = caEncaisse / caTotalAnalyse`) reste une approximation : il suppose
  un mix produit stable. L'emballage, lui, est désormais calculé **commande par commande** — les
  deux postes du numérateur n'ont donc pas la même précision. À harmoniser un jour.
- `revenuHoraireData` / `revenuHoraireAudit` (garde-fous `calculable`, `raisonsAbstention`,
  couverture temporelle) restent testés **indirectement** seulement.

---

## 2026-07-12 — Vague 45 : LE REVENU HORAIRE MENTAIT DANS LES DEUX SENS  (v1324 → **v1325**)

**Nature** : comblement de l'angle mort déclaré en vague 44 (`revenuHoraireCalcul` n'avait AUCUN
test) — et, ce faisant, découverte de **trois bugs**. Deux se compensaient partiellement : c'est
précisément pour cela que personne ne les avait vus. Un chiffre faux mais *plausible* ne déclenche
aucune alerte. C'est la leçon centrale de cette vague.

### Bug 1 — le double comptage de la main-d'œuvre (il SOUS-PAYAIT)
L'en-tête de `revenuHoraireCalcul` promettait : « la main-d'œuvre N'est PAS déduite : c'est
justement ce qu'on cherche à rémunérer ». **Faux.**

    coutMatieres ← coutVentes = piècesVendues × coutRevientUnit
    coutRevientUnit = matières + consommables + coutMODUnit   ← la MO d'atelier !

L'app soustrayait la paie de Benjamin du numérateur, **puis divisait par les heures qu'elle venait
de payer**. L'écart vaut *exactement* son taux horaire d'atelier — signature du bug (test B7).

### Bug 2 — le taux de cotisation unique (il SUR-PAYAIT)
`cotisations = caEncaisse × socialGoods` : taux **marchandise** (12,3 %) appliqué à **tout** le CA,
prestations comprises — alors qu'elles cotisent à 25,6 %. Sur un mois 100 % ateliers, l'écart
dépasse le **double** (test C8). La règle de ventilation existait pourtant… enfermée dans
`computeMonthlyBilan`, et nulle part ailleurs.

### Bug 3 — l'impôt absent (il SUR-PAYAIT)
Aucune déduction d'IR. « Ce que tu peux te verser » était un montant **avant impôt** — un revenu
jamais touché. Même oubli que le point mort (corrigé en v1324).

**Refactor structurel** : la règle de ventilation service/marchandise est **extraite en fonction
pure partagée** (`partServiceCommande`), utilisée par `computeMonthlyBilan` (base URSSAF) ET le
revenu horaire. Une seule vérité par commande. Dupliquer la règle, c'est fabriquer la divergence de
demain — le projet en a déjà corrigé une (CA détail vs synthèse).
*Preuve de neutralité* : les 42 assertions de `monthly-bilan` et celles de `net-poche` restent
vertes sans qu'aucune attente n'ait été modifiée. Le filet a d'ailleurs **immédiatement** signalé
l'extraction (fonction absente du module de test) — exactement son rôle.

**Ajouté** (`revenu-horaire.test.js`, 44 assertions) :
- `partServiceCommande` — pure. 100 % marchandise / 100 % prestation / mixte au prorata, remise de
  ligne appliquée avant le prorata, GARDE-FOU part bornée à 1 (remise globale > lignes), robustesse
  (commande nulle, vide, montant 0 → jamais de NaN ni de division par zéro).
- **Numérateur** — la MO est RENDUE ; traçabilité : matières + main-d'œuvre = coût de revient
  complet, au centime. Cas `laborEnabled=false` : le fix est **neutre** (test B10).
- **Prélèvements** — deux taux sur la ventilation réelle ; cas 100 % marchandise → identique à
  l'ancien calcul (non-régression du cas courant, test C10) ; impôt à base forfaitaire micro-BIC ;
  tranche 0 % → pas d'impôt mais cotisations toujours dues.
- **MONOTONIE des 3 paliers** : avant prélèvements ≥ après cotisations ≥ net. Un palier qui
  remonterait signalerait un prélèvement compté au mauvais signe (test D8).
- **Section E — « les deux sens »** : rejoue l'ancien calcul complet (13,85 €/h) contre le vrai
  (15,58 €/h). Les erreurs se compensaient à moins de 2 €/h, alors qu'**aucun** nombre intermédiaire
  n'était juste (numérateur 400 au lieu de 600 ; cotisations 123 au lieu de 176,20).

**Comportement modifié** :
- Écran « Mon revenu horaire » : deux cartes → **trois paliers**, le net d'impôt mis en avant
  (seul comparable à un salaire). Chaîne traçable : la main-d'œuvre rendue est explicitement
  montrée, les cotisations sont ventilées aux deux taux, l'impôt apparaît.
- Copilote (`aiQueryRevenuHoraire`) : annonçait « ce que tu peux te verser » avec le chiffre
  **avant impôt** — il aurait désormais contredit l'écran. Recalé sur le **net**.

**Total couvert** : 917 → **961 assertions**.

**Angles morts connus (déclarés)** :
- `coutEmballages` est **toujours à 0** dans le revenu horaire (« n'invente pas », depuis l'origine).
  Le numérateur est donc encore *légèrement surestimé*. Angle mort assumé et désormais écrit.
- `revenuHoraireData` / `revenuHoraireAudit` (garde-fous de couverture temporelle, `calculable`,
  `raisonsAbstention`) restent non couverts : ils sont testés indirectement, pas directement.
- Le prorata `ratio = caEncaisse / caTotalAnalyse` qui rapporte les coûts à la fenêtre reste une
  approximation (il suppose un mix produit stable sur la période).

---

## 2026-07-12 — Vague 44 : LE POINT MORT DISAIT LA MOITIÉ DE LA VÉRITÉ  (v1323 → **v1324**)

**Nature** : correction d'un BUG de calcul + comblement de deux angles morts. Suite directe de
la vague 43.

**Le bug** : le point mort de v1323 divisait les charges fixes par `margeUnit`. Or, dans
`analyzeFlavorProfitability` :

    margeUnit = prixVenteMoyen − coutRevientUnit
    coutRevientUnit = matières + consommables + main-d'œuvre D'ATELIER

Les **charges sociales n'y étaient donc PAS déduites** — alors que le texte de traçabilité
affiché à l'écran affirmait explicitement qu'elles l'étaient. Chiffre **sous-estimé** ET
justification **fausse** : le pire des deux mondes pour un nombre censé être refaisable à la main.

**Les trois coûts oubliés** (tous payés par Benjamin, aucun compté) :
1. **Charges sociales URSSAF** — prélevées sur *chaque euro encaissé* → coût VARIABLE, sa place
   est dans la marge de contribution.
2. **Impôt sur le revenu** — en micro-BIC, base = CA × (1 − abattement), × tranche marginale.
   Donc **proportionnel au CA** → variable lui aussi.
3. **Heures hors-atelier** — administratif, courses, déplacements, prospection, prépa marché.
   Mesurées par la pointeuse (`workSessions`), payées **nulle part** : ni dans le coût de revient
   (qui ne compte que l'atelier), ni dans les charges fixes. Littéralement du bénévolat.

**Ajouté** (`point-mort-verite.test.js`, 58 assertions) :
- `margeContributionUnitaire` — les trois déductions et leur **somme vérifiable** (coût + social
  + impôt + marge = prix), bornes (taux négatif, abattement > 100 %), tranche 0 %.
- `coutTempsHorsProdMensuel` — pure (sessions passées en argument). Heures/coût mensuels, taux de
  la session prioritaire sur celui des réglages, ventilation par activité qui **somme au total**.
  GARDE-FOU d'extrapolation : fenêtre plancher à 1 mois (2 jours pointés ne deviennent pas
  150 h/mois). N'INVENTE JAMAIS : sans pointage → `fiable:false`, jamais 0 € (0 € serait un
  mensonge : ces heures existent, elles ne sont pas mesurées).
- `computePointMortVerite` — la **CASCADE** de 4 marches. MONOTONIE figée : ajouter un oubli ne
  peut que faire MONTER le point mort (un oubli qui le ferait baisser serait un bug de signe).
- **GARDE-FOU CRITIQUE ÉTENDU** (le cœur de la vague) : une marge **brute positive** peut devenir
  une marge de **contribution négative** une fois l'URSSAF et l'impôt payés. v1323 affichait alors
  un point mort *rassurant et faux* ; l'app refuse désormais d'afficher un volume. Test D1–D9.
- **NON-RÉGRESSION du moteur** : `computePointMort` (v1323) n'est PAS modifiée. La marche 1 de la
  cascade doit être *exactement* un appel direct au moteur — preuve qu'on n'a pas réécrit l'ancien
  chiffre en douce (test E4). Ses 25 assertions de la vague 43 restent vertes.

**Comportement modifié** :
- Écran « Analyse de rentabilité » — le point mort n'affiche plus un chiffre unique, mais la
  cascade des 4 marches, chacune attribuant son écart en macarons. L'ancien chiffre reste exposé
  (on ne remplace jamais un chiffre en silence).

**Exemple figé** (2 € le macaron, 1 € de coût, URSSAF 12,3 %, abattement 71 %, tranche 30 %,
300 € de charges fixes, 120 € de temps hors-atelier) :
`300 → 400 (URSSAF) → 518 (impôt) → 725 (heures hors-atelier)` — **425 macarons/mois** que l'app
oubliait de demander.

**Total couvert** : 859 → **917 assertions**.

**Angles morts connus (déclarés)** :
- `revenuHoraireCalcul` / `revenuHoraireData` / `revenuHoraireAudit` — non couverts. Chaîne
  importante (revenu horaire réel + garde-fous de couverture temporelle), candidate naturelle
  pour la vague 45.
- Le point mort suppose un **mix produit constant** (moyennes pondérées par les ventes passées).
  Un changement brutal de mix le déplace ; non modélisé.

---

## RATTRAPAGE DE JOURNAL — vagues 12 à 43

**Dette de documentation constatée le 2026-07-12** : le journal s'était arrêté à la vague 11
(282 assertions) alors que la suite comptait déjà 43 vagues / 859 assertions. Contraire au
contrat de livraison (`README.md`), qui exige une ligne ici à chaque livraison touchant un calcul.

Le détail de chaque vague est en tête de son fichier de test (bloc de commentaire : lacune comblée,
règles figées). Récapitulatif :

| Vague | Fichier | Objet |
|---|---|---|
| 12 | `batch-picking.test.js` | batch picking (agrégation besoins, résolution parfum) |
| 13 | `tresorerie.test.js` | `computeTresorerie` (projection J+30/60/90) |
| 14 | `scenario-prix.test.js` | `computeScenarioPrix` (module scénarios de prix) |
| 15 | `panier-moyen.test.js` | ventilation du panier moyen par type dominant |
| 16 | `fifo-materiel.test.js` | FIFO matières (décrément / restock) |
| 17 | `allocate-batches.test.js` | `allocateBatches` (moteur picking FIFO/zone) |
| 18 | `numerotation-legale.test.js` | numérotation légale factures/avoirs (art. 242 nonies A CGI) |
| 19 | `seuils-fiscaux.test.js` | `computeSeuilsFiscaux` (jauges TVA/micro, projection) |
| 20 | `pilotage-ca.test.js` | `computePilotageCA` (leviers stratégiques) |
| 21 | `pilotage-strategic.test.js` | `computeStrategic` (panier, marges, clients actifs) |
| 22 | `prevision-revenu.test.js` | `computePrevisionRevenu` (tendance + carnet) |
| 23 | `rd-pont-creatif.test.js` | `rdSuggestMaterial` (Pont Créatif R&D → Production) |
| 24 | `order-margins.test.js` | `computeOrderMargins` (marge par commande) |
| 25 | `dlc-anti-recongel.test.js` | `computeDlcFromHistory` (DLC anti-recongélation, sanitaire) |
| 26 | `compute-stats.test.js` | `computeStats` (agrégation ventes globale/client) |
| 27 | `sales-velocity.test.js` | `computeSalesVelocity` (vélocité, rupture de stock) |
| 28 | `forecast.test.js` | `computeForecast` (projection réservations datées) |
| 29 | `market-selection.test.js` | `computeMarketSelection` (score composite, classement) |
| 30 | `market-channel.test.js` | `computeMarketChannelAnalysis` (taux d'écoulement) |
| 31 | `material-needs.test.js` | `computeMaterialNeeds` (besoins matières production) |
| 32 | `gaspillage.test.js` | `computeGaspillage` (coût du gaspillage marché) |
| 33 | `temps-decompo.test.js` | `_tempsDecompoParParfum` (le détail doit sommer au total) |
| 34 | `batch-comptable.test.js` | `_estBatchComptable` (dénominateur : un composant n'est pas un batch) |
| 35 | `temps-par-macaron.test.js` | temps par macaron / par batch standard de 60 |
| 36 | `copilote-routage.test.js` | routage du copilote (aucune compétence fantôme) |
| 37 | `produits-rentabilite.test.js` | rentabilité par produit (marge réelle, pas le CA) |
| 38 | `comparaison-periode.test.js` | comparaisons à périmètre comparable (prorata du temps écoulé) |
| 39 | `cout-temps-marge.test.js` | le coût du TEMPS dans les marges |
| 40 | `marche-temps.test.js` | rentabilité des marchés rapportée au temps sur place |
| 41 | `prestation-temps.test.js` | la prestation vend du TEMPS (coût des heures vendues) |
| 42 | `pertes-visibles.test.js` | les pertes ne doivent jamais être cachées (marge négative visible) |
| 43 | `point-mort.test.js` | le point mort (combien vendre pour couvrir les charges fixes) |

**Leçon** : un journal en retard est un angle mort de second ordre — on ne sait plus ce qu'on ne
teste pas. Le rattrapage vaut moins qu'une ligne écrite à temps.

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

---

## Vague 63 — v1342 : le mois ET la semaine
`tests/v1342-periodes.test.js` — **19 tests, verts.** Fonctions extraites de `app.js`, jamais recopiées.

### Ce que la vague livre
- **Semaines ISO 8601** : « semaine 39 », « S40 », « la semaine dernière », « semaine 39 2025 ».
- **La période devient un INTERVALLE** `{depuis, jusqu}`. Le mois n'en est qu'un cas particulier
  (celui qui remplit `ym`). Les 8 compétences existantes sont **inchangées** sur un mois.
- **Point mort hebdo** : charges fixes proratisées (convention de Ben), **affichée** à l'écran.
- **Gel du coût matière** à l'encaissement (`coutMatFige`) — on éteint la dette pour l'avenir.

### Les bugs que les tests empêchent de revenir (réintroduits, détectés, restaurés)
| Bug | Pourquoi il serait passé inaperçu |
|---|---|
| Une semaine reçoit un `ym` | Elle serait lue comme un mois. Une S39 (22→28 sept) deviendrait « septembre entier ». |
| Prorata « mois du lundi » | **70 € au lieu de 120 € — 42 % d'erreur**, sur un chiffre parfaitement plausible. |
| S53 inexistante | Glisserait en silence sur la S1 de l'année suivante. Décalage invisible à l'œil, faux à 100 %. |
| Année ISO = année civile | Le 1er janvier 2027 est en **S53-2026**. Un bug qui dort onze mois. |
| `monthLabel()` sur un intervalle | Afficherait « [object Object] » — seulement quand la semaine est vide. |

### Ce que la vague NE fait PAS, et pourquoi
**La rentabilité passée continue de confesser — et ce n'est pas une lacune passagère.**
`coutMatiereFifoReel()` filtre les lots sur `qteRestante > 0` : la quantité restante **aujourd'hui**.
Un lot acheté en décembre 2025 et consommé depuis a `qteRestante = 0` — il est filtré, il a **disparu**.
Reconstituer décembre donnerait un chiffre **troué**, affiché à côté de chiffres mesurés.

> **RÈGLE GRAVÉE (v1342) — UN CHIFFRE RECONSTITUÉ À TROUS, AFFICHÉ À CÔTÉ D'UN CHIFFRE MESURÉ,
> FINIT TOUJOURS PAR ÊTRE LU COMME MESURÉ.** C'est la v1337 (« zéro n'est pas une mesure »)
> appliquée au temps. Mieux vaut un aveu daté qu'une rentabilité passée inventée.

### Garde G1 — la capacité se juge par TYPE DE PÉRIODE, pas par intention
`query_seuil_rentabilite` sait faire une **semaine** (prorata) mais **pas** un **mois passé**
(fenêtre glissante de 90 j). Il est donc dans `AI_INTENTS_SEMAINE` **et** dans `AI_INTENTS_MOIS_ATTENDU`.
Sans cette garde, « point mort de la semaine 39 » aurait **avoué son impuissance juste au-dessus du
prorata qu'il venait de calculer correctement** : un aveu FAUX à côté d'un chiffre JUSTE. Plus
destructeur qu'un bug — ça apprend à Ben à ne plus croire les aveux, alors que les aveux sont tout
ce qui reste quand le chiffre manque.

### Le motif, encore : la règle existait déjà, appliquée à 90 %
`computeAccounting()` acceptait **déjà** `{periodeStart, periodeEnd}` et filtrait en cash basis.
Le moteur borné **existait** — il n'était simplement pas branché sur le copilote. Comme `escapeRe()`
en v1328, comme le strip-commentaires en v1339.
*(Et en écrivant l'audit anti-`[object Object]`, j'ai d'abord compté les COMMENTAIRES — reproduisant
exactement l'échec n°1 de la vague 59. La maladie que je traque, je l'attrape encore.)*

### Angles morts déclarés
- Les **plages** (« de mars à juin », « 1er trimestre ») ne sont toujours pas parsées — mais
  l'intervalle `{depuis, jusqu}` est désormais le format natif : c'est du parsing, plus de l'architecture.
- Le **gel du coût matière** ne vaut que pour les encaissements **à partir de maintenant**. Les
  commandes déjà encaissées n'ont pas de `coutMatFige` et n'en auront jamais.
- `query_revenu_horaire` et `query_rentabilite` ne savent toujours pas la **semaine** (fenêtre glissante).

---

## Vague 64 — v1343 : ce que les clients associent
`tests/v1343-associations.test.js` — **13 tests, verts.** Fonctions extraites de `app.js`.

### LA CORRECTION QUE JE DOIS À BEN
Le document de cadrage annonçait un **« data gap »** : la composition des coffrets ne serait pas
stockée. **Je l'ai répété à Ben sans vérifier. C'ÉTAIT FAUX.**
- `o.lignes[].parfums` est **déjà** un tableau `[{nom, qte}]` — JSON structuré, par ligne.
- `marketMoves.parfum` trace **déjà** chaque mouvement de marché.
- `flavorRecommendations()` fait **déjà** la matrice BCG (médiane volume × médiane marge, 4 quadrants).

**Rien n'était perdu. Rien ne l'a jamais été.** J'ai affirmé une règle sans la confronter au code —
exactement le péché que ces 64 vagues traquent. Le document décrivait une app générique, pas celle de Ben.

### LE VRAI PIÈGE (invisible, lui)
`sansParfum` compte les macarons que **Ben** compose (mode assortiment), pas ceux que le client choisit.

> **RÈGLE GRAVÉE (v1343) — UNE DONNÉE PRODUITE PAR BEN NE DOIT JAMAIS LUI REVENIR
> DÉGUISÉE EN DONNÉE PRODUITE PAR SES CLIENTS.**
> Sinon l'app lui confirme ses propres choix en les présentant comme des découvertes. C'est la v1341
> (les pyramides) au carré : une boucle où le miroir se fait passer pour une fenêtre.

### LE BUG QUE LE LIFT EMPÊCHE — chiffré par le test
Caramel est dans **tous** les paniers. Café+Praliné et Caramel+Café pèsent **le même nombre de paniers (3)**.
Sans le **lift**, ils sembleraient **identiques**.

| Paire | Paniers | Lift | Vérité |
|---|---|---|---|
| Café + Praliné | 3 | **×2** | Ils s'**attirent** vraiment |
| Caramel + Café | 3 | **×1** | **Indépendants** — le caramel est juste partout |

Sans lui, Ben aurait « découvert » que son caramel se marie avec tout, et **changé sa gamme sur sa
propre popularité**. C'est le piège classique du market basket — et le faux insight le plus coûteux.

### Les autres exclusions, chacune justifiée
| Exclu | Pourquoi |
|---|---|
| `sansParfum` | Choix de Ben, pas du client (sa consigne explicite) |
| Mono-parfum | Une association exige **deux** parfums |
| Dons (0 €) | Le client n'a rien arbitré |
| Reprises `histo` | Données d'avant l'app |
| **Les marchés** | `marketMoves` dit ce qui **sort du stock**, pas **qui a acheté quoi ensemble**. Les traiter en paniers dirait « tout ce qui s'est vendu ce jour-là va ensemble » : une association fabriquée par le **calendrier**. La v1336 a appris à ne pas **oublier** les marchés ; celle-ci apprend à ne pas les **faire parler** là où ils sont muets. |

### Honnêteté statistique — en tête, pas en note de bas de page
Avec ~9 mois d'historique, **l'effectif est le chiffre le plus important de l'écran**. Un « 68 % » sur
4 paniers a l'air d'une loi et n'est qu'un hasard. Les paires sous le seuil sont **marquées**, jamais
**supprimées** (cacher le faible, c'est nier son existence — v1337).

### L'ordre EST le correctif (encore)
La règle « associations » est placée **avant** « top parfum ». Sans ça, « quels parfums se vendent le
plus **ensemble** » partait vers le **classement** : un chiffre juste, à une **autre question**.

### Angles morts déclarés
- **La saisonnalité reste hors de portée** : un seul Noël dans l'historique. Ça ne se code pas, ça s'attend.
- La matrice volume × marge existe mais s'appuie sur les **lots d'aujourd'hui** (même limite temporelle qu'en v1342).
- Les marchés ne contribuent pas aux associations (voir ci-dessus) — donc les paniers ne couvrent que les **commandes**.

---

## v1344 — Décision de Ben, gravée : les non-payées comptent

**Question de Ben :** « le moteur prend-il les commandes non payées ou seulement les soldées ? »

**Réponse mesurée :** toutes. Le seul filtre monétaire est `montant <= 0` (les dons).

**Décision de Ben, et elle est plus juste que ma proposition :**
> *« Ce sont deux notions bien distinctes qui ne doivent pas s'annuler l'une l'autre. »*

Un **choix de parfum** et un **encaissement** mesurent deux réalités différentes. Le client qui a
composé « Café + Praliné » a exprimé cette préférence, que sa facture soit réglée ou non. Filtrer sur
le paiement laisserait la **comptabilité corrompre une mesure comportementale**.

J'avais proposé d'« afficher la divergence » à l'écran. **Ben a eu raison de refuser** : signaler
« attention, des impayés sont inclus » laisserait croire que le chiffre est **dégradé** par eux, alors
qu'il n'a simplement **rien à voir** avec eux. *Une inquiétude injustifiée est aussi trompeuse qu'un
chiffre faux.*

> **RÈGLE GRAVÉE (v1344) — DEUX MESURES DE NATURES DIFFÉRENTES NE DOIVENT PAS S'ANNULER L'UNE
> L'AUTRE.** Aligner par réflexe de cohérence, c'est détruire l'une au nom de l'autre.

**Le test-garde mord** : ajouter `if(o.paiement !== 'Payé') return;` — une « correction » parfaitement
plausible, qu'un futur relecteur (moi) ferait au nom de la cohérence avec le cash basis — fait
**échouer 6 tests immédiatement**. Le commentaire explique ; le test protège.

### ⚠️ ET LE HARNAIS LUI-MÊME ÉTAIT CASSÉ — la leçon la plus importante de la session
En vérifiant ce test-garde, l'injection du bug faisait **crasher le fichier de tests** avant même
d'atteindre l'assertion. Mon `grep` sur « ✗ » ne trouvait rien, et j'ai lu ce silence comme un succès.

> **L'ABSENCE D'ÉCHEC SE LISAIT COMME UN SUCCÈS.**

C'est la vague 59 dans sa forme la plus pure : **un audit qui ne détecte pas ce qu'il prétend
protéger**. Pire qu'un test absent — un test absent n'endort personne.

**Correctif :** chaque assertion est désormais **enveloppée** (évaluation paresseuse + `try/catch`).
Une exception devient un **échec bruyant**, jamais un silence. Et le protocole de vérification ne se
contente plus de chercher des échecs : il vérifie que le test a **terminé**.

---

## v1345 — LE BUG DE BEN : « quels parfums ensemble ? » → des idées de parfums pour l'été

**Ce que Ben a tapé (v1343) :** *« Quels parfums sont souvent commandés ensemble »*
**Ce que l'app a répondu :** Yuzu, Passion, Cassis… — des **suggestions R&D pour l'été**.

Une **mesure du comportement client** transformée en **idées de création**. Deux sujets sans rapport,
aucun avertissement. **Le bug canonique de cette série : UN CHIFFRE JUSTE, À UNE AUTRE QUESTION.**

### La cause : j'ai vérifié l'ordre d'un seul côté
Ma règle v1343 était placée juste avant `query_top_parfum` — j'avais vérifié ce qui venait **APRÈS**
elle. Mais `query_suggestion_parfum` se trouve **250 lignes AVANT**, et sa toute première alternative
est `\b(quels parfums)\b`. La phrase de Ben commence par « Quels parfums ». **Ma règle ne pouvait
JAMAIS gagner.** Sa liste d'exclusions (`rapporte|rentable|se vend`…) n'avait jamais prévu « ensemble ».

> **RÈGLE GRAVÉE (v1345) — VÉRIFIER L'ORDRE D'UNE RÈGLE, C'EST REGARDER DES DEUX CÔTÉS.**
> Une cascade de 800 lignes n'a pas de « bon endroit » — elle n'a que des **amonts**.

### Le trou que ma propre garde a creusé
En excluant `propose|suggere|invente…` des associations, j'ai créé un **angle mort** : « propose-moi
une **association** de parfums pour l'été » n'était plus attrapé par les associations (correct) **ni**
par la R&D (dont la regex exigeait `parfum` collé à `propose`). La phrase tombait dans le vide.
Comblé côté R&D — **on élargit la règle légitime, on n'affaiblit pas la garde**.

### Trois questions, trois réponses (`tests/v1345-routage.test.js`, 12 verts)
| Question | Intent |
|---|---|
| « quels parfums sont souvent commandés ensemble » | **MESURE** (associations) |
| « quel parfum lancer pour l'été » | **CRÉATION** (R&D) |
| « propose-moi une association de parfums » | **CRÉATION** — c'est une idée, pas une mesure |
| « le parfum le plus vendu » | **CLASSEMENT** (top parfum) |

### ⚠️ Et le test a d'abord menti — j'ai enfreint la règle que je venais d'écrire
Premier jet : j'avais **recopié** les regex dans le test en les simplifiant. Il « échouait » sur deux
phrases que le vrai code gère **parfaitement**. Je testais **ma paraphrase**, pas l'app de Ben.
C'est exactement la règle de la v1337 — *un test qui recopie le code qu'il teste ne valide que sa
propre cohérence* — enfreinte par celui qui l'a écrite. Le harnais **extrait** désormais les conditions
réelles du fichier via `new Function()`. Et c'est seulement une fois fidèle qu'il a révélé le **vrai**
trou ci-dessus.

---

## v1346 — LE SALON DE THÉ : quand un lift ×4,58 ne veut rien dire

**Ben, en lisant ses associations :** *« Myrtille framboise et mangue passion et chocolat ne comptent
pas, ce sont les grands formats commandés exclusivement par le salon de thé. »*

Il a repéré **à l'œil nu** ce que le moteur n'avait aucun moyen de voir. Ces trois paires trônaient en
tête avec des lifts de ×4,58, ×4,44, ×4,41 — **statistiquement irréfutables, et humainement vides de
sens**. Elles ne mesuraient pas une affinité de goût : elles mesuraient **la routine d'un client
unique**, répétée 17 fois.

### L'angle mort du lift
Le lift corrige la **popularité d'un parfum** (v1343). Il est **totalement aveugle à la concentration
sur un client**. Un acheteur fidèle qui répète sa commande fabrique des paires en béton — et plus il
est fidèle, plus le faux signal est fort. *Le garde-fou de la vague précédente avait lui-même un angle
mort, et il a fallu l'œil de Ben pour le voir.*

### Le piège que Ben a failli me faire tomber (et qu'il a signalé lui-même)
Il demande d'exclure les pros, puis précise : *« c'est à 98 % des commandes pro… **mais ça va changer
prochainement** »*.

**Filtrer sur le FORMAT (`grand`) aurait été le piège.** La règle serait devenue fausse le jour où un
particulier commande un grand format — et fausse **en silence**, en jetant de vrais choix clients hors
de l'analyse sans rien signaler. Une règle vraie « à 98 % aujourd'hui » est une règle qui **pourrira à
une date inconnue**.

> **RÈGLE GRAVÉE (v1346) — FILTRER SUR LA CAUSE, JAMAIS SUR SON SYMPTÔME DU MOMENT.**
> Le symptôme (le grand format) change ; la cause (un acheteur pro qui répète sa commande) reste.

On filtre donc sur **`client.type` contient 'pro'** — qui existait déjà (ligne 16007).
*Encore une règle écrite à 90 %, jamais branchée.*

### Deux garde-fous INDÉPENDANTS (ceinture et bretelles)
| Mécanisme | Ce qu'il attrape |
|---|---|
| **Exclusion des clients pro** | Le salon de thé, nommément |
| **Comptage des clients distincts** | Le rattrape **même si Ben oublie de le typer pro** — et attrape aussi le *particulier* fidèle qui répète |

Une paire portée par **moins de 3 clients différents** est **déclassée** (jamais supprimée — v1337) et
le nombre de clients est **affiché à côté du lift**. « 17 paniers, 1 client » se lit désormais d'un coup d'œil.

**Test sur le cas réel de Ben (23 verts) :** 17 commandes du salon → 0 panier retenu. Même **non typé
pro**, la paire est marquée `monoClient` et déclassée **malgré son lift écrasant**. Une paire vue chez
**3 clients** passe.

### Ce qui reste, et qui est vrai
Une fois le salon écarté : **Café + Coco citron vert (×4,2)**, **Nocciolata + Cannelle noisette
(×2,88)**, **Nocciolata + Chocolat passion (×2,26)**. Nocciolata revient deux fois — un **pivot** de
gamme. C'est une information exploitable ; les trois premières ne l'étaient pas.

---

## v1347 — « J'ai 110 commandes, le calcul se fait sur 63. Pourquoi ? »

Question de Ben, et il avait raison de la poser : **43 % de ses données disparaissaient sans un mot.**

L'app **comptait** déjà ses rejets (`rejets.pro`, `monoParfum`, `assortimentPur`, `dons`, `histo`) —
elle ne les **montrait pas**. Ben ne pouvait pas savoir si le chiffre qu'il lisait reposait sur ses
données ou sur un tiers d'entre elles.

> **RÈGLE GRAVÉE (v1347) — UN FILTRE SILENCIEUX EST UN MENSONGE PAR OMISSION.**
> Tout ce qui est écarté doit être **compté, nommé et montré**. Un moteur qui jette 43 % des données
> sans dire lesquelles ni pourquoi demande une confiance qu'il n'a pas méritée.

**Ajouté :** `commandesVues` / `commandesRetenues`, et un **journal des exclusions** affiché à l'écran,
ligne par ligne. Le cas « aucun panier » est celui qui l'explique **le plus** — sans ça, Ben croirait
que ses clients ne choisissent pas leurs parfums, alors que c'est peut-être **un filtre qui les mange**.

Le message se termine par : *« Si ce total te surprend, dis-le-moi : c'est **le filtre** qu'il faut
corriger, pas le chiffre. »*

---

## v1348 — LE JOURNAL AVAIT LUI-MÊME UN TROU

Ben a additionné les chiffres de son propre journal (v1347) : `42+5+6+14+18 = 85`, `85+48 = 133`,
pour **128** commandes vues affichées. **Écart de 5.** Le garde-fou censé garantir l'exhaustivité
ne l'était pas — et c'est Ben qui l'a vérifié à la main, pas le code.

### La cause
`orderToLines()` renvoie `[]` pour une commande sans `o.lignes`, sans `type` reconnu et sans `taille`.
Une telle commande n'a **aucune ligne à parcourir** : elle ne peut matcher ni un motif de rejet, ni un
panier retenu. Elle sortait de la boucle **sans laisser de trace** — invisible au sens strict, ni comptée
ni expliquée.

> **La règle gravée en v1347 (« tout ce qui est écarté doit être compté ») n'était pas tenue jusqu'au
> bout. Un principe qu'on grave et qu'on n'applique qu'à 90 % vaut le principe qu'on n'a pas gravé.**

### Le correctif, en deux parties
1. **Le motif manquant est nommé** : `rejets.sansLigne` — « commande(s) sans format reconnu ».
2. **Le journal se vérifie lui-même.** Un journal qui prétend garantir l'exhaustivité et qui ne
   contrôle pas sa propre arithmétique peut mentir avec la même assurance que le chiffre qu'il
   corrigeait. Une identité est désormais calculée à chaque appel :

   `rejets(pro+mono+assortiment+dons+histo+sansLigne) + retenues == vues`

   Si elle est fausse, un bloc `🐞` s'affiche **avant** le reste : *« Mon propre décompte ne tombe
   pas juste… ne fais pas confiance à ce journal, préviens-moi. »* — testé en réintroduisant le bug :
   l'alerte se déclenche.

### Ce que ça dit, au-delà du bug
Ben a détecté ce trou en additionnant cinq nombres à la main. **C'est la bonne réaction** face à un
journal qui prétend tout expliquer : le vérifier, pas le croire sur parole — exactement ce que le
journal lui-même dit de faire avec le chiffre qu'il corrige. Le principe s'applique à lui aussi.

---

## v1349 — J'AI RÉPARÉ LE MAUVAIS TROU

Le journal (v1348) affichait toujours `42+5+6+14+18=85`, `85+48=133`, pour **128** vues. Le motif
`sansLigne` que je venais d'ajouter valait **0**. **Mon diagnostic de la v1348 était faux.**

### L'erreur, nommée
J'avais vu un écart de 5 et supposé un **manque** (des commandes invisibles au journal). J'ai ajouté
un motif — réel, mais qui ne concernait aucune des commandes de Ben. **Le signe de l'écart était
l'indice que j'ai ignoré** : `133 > 128`, c'est un **surplus**, pas un trou. Un surplus et un manque
ne sont jamais la même famille de bug, même de même magnitude — j'ai réparé le premier défaut visible
au lieu de celui que le signe désignait.

> **LEÇON (v1349) : LE SIGNE D'UN ÉCART DÉSIGNE LA FAMILLE DE BUG. Un excès et un déficit ne se
> soignent jamais par le même correctif — même quand ils partagent un nombre.**

### La vraie cause
`dons`, `monoParfum`, `assortimentPur` comptaient des **LIGNES**. `commandesVues` /
`commandesRetenues` comptent des **COMMANDES**. Une commande à plusieurs lignes tombant deux fois
dans le même motif de rejet (ex. deux lignes à 0 €) incrémentait ce motif **deux fois pour une seule
commande vue** — d'où le surplus.

**Correctif :** chaque commande n'est comptée **qu'une fois** dans le journal — retenue dès qu'une
ligne est exploitable, sinon sur le **premier** motif de rejet rencontré parmi ses lignes.

### La régression que j'ai moi-même introduite, et rattrapée avant livraison
Mon premier jet du correctif ajoutait un garde `if(_retenue) return;` **trop tôt** dans la boucle —
il coupait aussi l'accumulation de `rejets.sansParfum` (un **total de macarons**, pas un verdict de
commande) pour toute ligne suivant une ligne déjà retenue. Un **sous-comptage neuf**, introduit en
réparant le surplus. Testé et détecté **avant** livraison — pas par Ben cette fois, par le test écrit
pour ce cas précis.

> **RÈGLE : deux compteurs de granularités différentes (un verdict par commande, un total de pièces)
> ne partagent JAMAIS le même `return`.**

### Ce que Ben a fait, deux fois de suite
Il a vérifié le journal à la main la première fois (v1347→v1348), puis a **relancé la question après
correction** et constaté que le motif ajouté n'apparaissait toujours nulle part (v1348→v1349). C'est
la seule façon dont ce bug pouvait être trouvé : **aucun test que j'avais écrit ne le couvrait**, parce
que je ne l'avais pas encore identifié comme un bug distinct. Le garde-fou le plus fiable de cette
série reste, et restera, Ben qui relit ce que l'app lui affiche.

---

## v1350 — VAGUE 65 : LE GÉNÉRATEUR DE COFFRETS

Trois briques déjà mesurées (associations v1343-1349, rentabilité par parfum, temps de production
mesuré par recette) — combinées en un **outil de scoring**, jamais un algorithme qui décide seul.

### Ce que Ben a demandé, tenu au mot
> *« Les deux, avec confirmation avant création. »* *« Je dois être capable de choisir un critère ou
> deux ou trois. Combinés ou séparés. »*

- **Suggestion d'abord, création jamais automatique** : `aiQueryGenererCoffret` propose ;
  `aiConfirmerCreationCoffret` demande confirmation ; `aiExecuterCreationCoffret` n'écrit dans le
  catalogue qu'après un second clic explicite. Trois étapes, jamais une seule.
- **Critères modulables** : `{association, rentabilite, production}`, chacun activable/désactivable.
  Un critère à `null` n'entre ni dans le score ni dans le calcul — et son absence est nommée à l'écran
  (`criteresUtilises`), jamais silencieuse.

### Le principe qui rend les poids de Ben SIGNIFIANTS
Un lift de ×4 et une marge de 0,80 € ne sont pas comparables en valeur brute. Chaque critère est
**normalisé sur [0,1]** avant combinaison, et les poids fournis sont **renormalisés pour sommer à 1**
— Ben peut donner `{1,1}` ou `{50,50}`, seul le **ratio** compte (testé : score identique).

### Le piège que v1337 avait déjà nommé, retrouvé ici
Un parfum sans mesure de temps **fiable** (`mesureParRec[id].fiable === false`) est **exclu** du
critère production — jamais noté à 0 (ce qui l'aurait fait passer pour « ultra-rapide à produire »).
Le score se recalcule sur les critères où une donnée existe réellement, et se renormalise sur la
**couverture effective** plutôt que de pénaliser une absence de mesure comme une mauvaise mesure.

### Les gardes héritées, jamais relâchées
- Seules les paires **significatives** (v1346 : seuil paniers ET clients) entrent dans le générateur.
  Zéro paire significative + critère association actif → **erreur explicite**, jamais une liste vide
  qui laisserait croire à une absence de goût client plutôt qu'à un manque de données.
- Tous critères à 0 → erreur immédiate (« choisis au moins un critère »), pas un résultat vide muet.

### L'ordre, encore (v1330, v1345, maintenant v1350)
La règle de reconnaissance est placée **avant** associations et R&D. « Propose-moi un coffret
rentable » contient « propose » (qui route vers la R&D en v1345) — sans cette priorité, la même
capture qui a piégé Ben en v1343 se reproduisait, sous une forme nouvelle. Testé explicitement :
12/12, dont la non-régression des deux autres intents.

---

## v1351 — VAGUE 66 : LE BUG QUE J'AI TROUVÉ EN ME RELISANT, ET CELUI QUE ÇA A RÉVÉLÉ EN CASCADE

Ben : *« ça a échoué / erreur »* sur le générateur de coffrets. Avant même sa capture, en relisant
mon propre module v1350 pour préparer le correctif, j'ai trouvé :

```js
const [recipes, recipeItems, lots] = await Promise.all([
  db.recipes.toArray(), db.recipeItems.toArray(), db.lots.toArray()   // ← db.lots N'EXISTE PAS
]);
```

**Il n'y a pas de table `lots` dans le schéma Dexie.** La vraie table s'appelle `materialLots`
(ligne 300, `db.version(1).stores`). `db.lots.toArray()` lève une exception Dexie à chaque appel.

### Le plus grave n'était pas dans le générateur
En cherchant d'autres occurrences de la même faute, j'ai trouvé **`figerCoutMatiere`** (v1342) —
la fonction censée figer le coût matière à chaque encaissement, dont le commentaire disait
*« on éteint la dette pour l'avenir »*. Elle contenait **exactement la même erreur** :

```js
const [recipes, recipeItems, lots] = await Promise.all([
  db.recipes.toArray(), db.recipeItems.toArray(), db.lots.toArray()   // même faute
]);
```

Avalée par un `catch(e){ swallow(e,'figerCoutMatiere'); return o; }` — **aucun symptôme visible**.

> **AUCUNE COMMANDE ENCAISSÉE DEPUIS LA v1342 N'A JAMAIS EU SON COÛT MATIÈRE FIGÉ.** Le principe
> gravé deux vagues plus tôt n'a jamais été appliqué en pratique. Il a fallu que la MÊME faute de
> frappe réapparaisse ailleurs, dans un contexte où elle était plus facile à repérer, pour que
> celle-ci soit vue.

### Le second bug, trouvé par relecture du même module
`mesureParRec` était déclaré `let mesureParRec = null;` et **jamais réassigné**. Le critère
PRODUCTION du générateur ne pouvait produire aucune donnée, quels que soient les poids choisis par
Ben — pas à cause du garde-fou v1337 (mesure non fiable → exclue), mais parce que la source n'était
jamais branchée. La vraie source, `prodTempsParParfum(90)`, n'est utilisée que si
`settings.laborSource==='mesure'` est actif. Corrigé, avec un message explicite si ce mode n'est
pas activé : *« Le critère production a besoin du mode "temps mesuré"… »* plutôt qu'un critère
silencieusement vide.

### Le garde-fou ajouté : un test de PLOMBERIE, pas de logique métier
`tests/v1351-schema-dexie.test.js` extrait **toutes** les tables déclarées dans le schéma Dexie et
**toutes** les tables référencées par `db.xxx.method()` dans le code, et vérifie que la seconde
liste est un sous-ensemble de la première. Ce n'est pas un test qui vérifie un calcul — c'est un
test qui vérifie que **le code peut seulement s'exécuter**. Réintroduit le bug pour preuve : il mord.

> **LEÇON (v1351) : une faute de frappe sur un nom de table ne casse rien à la LECTURE du code —
> seulement à l'EXÉCUTION, et souvent avalée par un catch bien intentionné. Ce genre d'erreur ne
> se détecte pas en relisant la logique ; il se détecte en vérifiant la PLOMBERIE mécaniquement.**

### Ce que ça dit sur la relecture
Ce bug n'a pas été trouvé par Ben qui aurait cherché — il l'a signalé (« erreur ») sans savoir
laquelle. Il n'a pas non plus été trouvé par un test — aucun test de la vague 65 ne couvrait le
schéma. Il a été trouvé parce qu'écrire un nouveau module a forcé une relecture du code voisin, et
que la même erreur, commise deux fois à deux semaines d'intervalle, a fini par être reconnue. Le
test qui en résulte rend cette reconnaissance permanente au lieu de dépendre d'une coïncidence de
relecture.

---

## v1352 — LE `case` MANQUANT : trois heures dans la mauvaise direction

Ben, deux fois de suite, sur deux versions différentes : *« Génère moi un coffret »* →
**« Je n'ai pas bien compris »**. Même après avoir corrigé `db.lots` et `mesureParRec` en v1351.

### Ce que j'ai cru, et qui était faux à chaque fois
1. **« C'est la regex »** → testée en exécution réelle : elle retourne bien `query_generer_coffret`.
2. **« C'est le cache PWA »** → vérifié : le cache est bien bumpé à chaque livraison.
3. **« C'est la saisie / l'autocorrection »** → Ben confirme la phrase exacte.
4. **« C'est un des bugs Dexie »** → non : une exception afficherait *« Une erreur est survenue »*.

### La vraie cause
`parseIntent` retournait **correctement** `query_generer_coffret`. Le bug était en **AVAL** :

```js
case 'query_associations': return aiQueryAssociations(r.params);
// case 'query_generer_coffret'  ← AVAIT DISPARU
default: /* « Je n'ai pas bien compris » */
```

Le `case` ajouté en v1350 avait été **écrasé par une de mes éditions Python en cascade**. L'intent
était reconnu, mais **non câblé** — il tombait dans le `default:` du switch.

> **LEÇON (v1352) : DEUX CAUSES TRÈS DIFFÉRENTES (intent non reconnu / intent non câblé)
> PRODUISAIENT LE MÊME MESSAGE.** Un message de repli qui ne distingue pas ses causes envoie
> l'utilisateur reformuler une phrase parfaitement valide — et celui qui débugge chercher un bug
> de regex qui n'existe pas. **Il a l'air d'une réponse alors que c'est un symptôme.**

### Les deux correctifs
1. **Le `case` est remis** — et le test `v1352-cablage.test.js` vérifie désormais que **chaque**
   intent produit par `parseIntent` (88 au total) possède un `case` dans le dispatch. Aucun autre
   orphelin trouvé — mais il aurait pu y en avoir, et je ne l'aurais pas su.
2. **Le message de repli distingue ses causes.** Si l'intent est reconnu mais non routé, l'app dit
   maintenant : *« J'ai bien compris ta demande, mais elle n'est pas branchée de mon côté — c'est
   un bug chez moi, pas une erreur de ta part. Inutile de reformuler : la phrase est bonne. »*

### Ce que ça dit sur ma méthode
J'ai passé quatre hypothèses avant de simplement **chercher d'où venait le texte affiché**
(`grep "pas bien compris"`) — ce qui m'a donné la réponse en une commande. J'ai cherché la cause là
où je pensais l'avoir mise, au lieu de partir du **symptôme observable**. Le message trompeur y est
pour beaucoup ; ma méthode aussi.

C'est le deuxième test de **plomberie** de la session (après le schéma Dexie). Les deux vérifient la
même chose sous deux angles : *le code peut-il seulement s'exécuter comme prévu ?* — une question
distincte de *le calcul est-il juste ?*, et qu'aucun test métier ne pose.

---

## v1353 — LE GARDE-FOU QUI PUNISSAIT BEN POUR UNE DÉCISION QU'IL N'AVAIT PAS PRISE

Le générateur est enfin **branché et fonctionnel** (v1352). Premier essai réel de Ben :
« Génère moi un coffret » → **refus complet**, au motif que le critère « production » est indisponible.

**Ben n'avait jamais demandé le critère production.** Il n'a précisé aucun critère.

### La mécanique du bug
```js
const criteres = params.criteres || { association:1, rentabilite:1, production:1 };  // ← défaut
if(productionIndisponible && criteres.production > 0) return REFUS;                  // ← bloque tout
```
Le code met les trois critères **par défaut**, puis se bloque lui-même sur l'un des trois. Une
génération parfaitement faisable sur **deux critères solides** (associations mesurées + rentabilité)
était refusée à cause d'un troisième que Ben n'avait jamais réclamé.

> **RÈGLE GRAVÉE (v1353) : UN GARDE-FOU NE DOIT JAMAIS PUNIR L'UTILISATEUR POUR UNE DÉCISION QUE LE
> CODE A PRISE À SA PLACE.** Le garde-fou était **juste** ; sa **portée** était fausse. Un défaut
> implicite n'a pas la même valeur qu'un choix explicite — et les confondre transforme une aide en
> obstacle.

### Le correctif : dégradation gracieuse, jamais silencieuse
| Situation | Comportement |
|---|---|
| Aucun critère précisé + production indispo | **Génère** sur les 2 critères disponibles, et **le dit** |
| Production demandée **explicitement** + indispo | **Refuse** — générer en ignorant sa demande serait répondre à côté |
| Mode « temps mesuré » actif | Les 3 critères tournent |

Le retrait du critère est **affiché** (« Ces propositions reposent donc uniquement sur… ») : remplacer
un blocage bruyant par une **omission silencieuse** aurait été pire que le bug d'origine — Ben aurait
cru que ses coffrets tenaient compte du temps de production. C'est la règle v1347 appliquée ici :
*un filtre silencieux est un mensonge par omission*.

### Ce que ça dit sur les garde-fous
Cette session en a produit beaucoup (seuil de signifiance, exclusion des pros, mesure non fiable,
auto-vérification du journal…). Tous partagent le même risque : **être justes dans leur principe et
faux dans leur portée**. Un garde-fou trop large ne protège plus, il empêche — et c'est d'autant plus
insidieux qu'il a l'air d'un message sensé, pas d'un bug.

---

## v1354 — LES TENDANCES PAR PARFUM : ce que je ne montrais pas

Ben : *« L'outil ne semble pas donner toutes les tendances par parfums. À côté des associations j'ai
besoin de savoir ce qui se vend le mieux pour composer au mieux ma nouvelle offre. Oublie pas que
j'ai 15 parfums en standard… »*

**Il a raison, et c'est un manque grave.** Je lui donnais des associations sans jamais lui dire
**quels parfums se vendent**. Un parfum peut avoir un lift magnifique et ne quasiment jamais partir :
le mettre en gamme sur cette seule base serait une erreur commerciale.

### Pire : les données existaient déjà
`analyzeFlavorProfitability` calcule `piecesVendues`, `ca`, `margeUnit`, `tauxMarge` **par parfum**.
Le générateur les utilisait **en interne pour scorer** — sans jamais les **montrer**. Ben devait faire
confiance à un score de `0.38` sans voir ce qu'il y avait derrière.

> **RÈGLE GRAVÉE (v1354) : UN SCORE QU'ON NE PEUT PAS DÉCOMPOSER EST UN SCORE QU'ON NE PEUT PAS
> CONTESTER.** Montrer les composantes n'est pas un luxe d'affichage — c'est ce qui permet à Ben de
> voir que je me trompe. Il l'a fait pour « Coco Rafaello en Fraîcheur » : il a corrigé une erreur
> que mes chiffres seuls n'auraient jamais révélée.

### Et `query_top_parfum` tronquait à 10
Ben a **15 parfums**. Une gamme se compose sur **tous** ses parfums — et les 5 derniers sont
précisément ceux qu'il faut décider de **garder ou de sortir**. Les cacher, c'est décider à sa place.

### Ce que la nouvelle vue affiche
Les 15 parfums, classés en **quatre quadrants** (seuils = médianes de sa propre gamme, jamais des
valeurs absolues) :

| Quadrant | Sens |
|---|---|
| **PILIERS** | fort volume + forte marge — le cœur de la gamme |
| **LOCOMOTIVES** | fort volume, marge faible — ils attirent, ils n'enrichissent pas |
| **PÉPITES** | faible volume, forte marge — à mettre en avant |
| **À QUESTIONNER** | faible volume ET faible marge |
| **JAMAIS VENDUS** | aucune vente — un candidat à la sortie **est une information de gamme** |

Chaque ligne porte : volume + part % + marge unitaire + **meilleure association mesurée**.

### Le routage : « quels parfums se vendent le mieux » n'est PAS un top-10
Premier test : cette phrase — **celle que Ben a posée** — partait vers `query_top_parfum` (volume
seul, tronqué à 10). C'est une question de **composition de gamme**, pas un classement. Règle élargie,
sans voler `le parfum le plus vendu` ni `mon meilleur parfum` (non-régression vérifiée).

---

## v1355 — « 0 pièces vendues » sur 128 commandes

Ben lance le tableau de bord v1354 : **« 0 pièces vendues au total »**, ses 15 parfums tous rangés
dans **« JAMAIS VENDUS »**. Il a 128 commandes et 48 paniers exploitables.

### Bug 1 — la mauvaise clé
`computeStats()` retourne `{global, parClient, nbValides}`. Les volumes sont dans
**`R.global.parfums`** — j'ai lu **`R.parfums`**. Toujours `undefined`, donc toujours 0.

### Bug 2 — le filtre `paiement === 'Payé'`
`computeStats` ne compte **que les commandes soldées**. Or Ben a tranché en v1344 :
> *« Ce sont deux notions bien distinctes qui ne doivent pas s'annuler l'une l'autre. »*

Un macaron **vendu** est vendu, réglé ou non : **le volume mesure ce qui SORT, pas ce qui RENTRE**.
Les associations comptaient déjà les impayées — le tableau aurait donc affiché, **sur la même ligne**,
un volume « payé uniquement » à côté d'une association « toutes commandes ». **Deux périmètres
différents, présentés comme un tout cohérent.** On recompte donc les volumes nous-mêmes, sur
exactement le même périmètre que les associations.

### Ce qui rend le bug 1 pernicieux
La **marge** (1,48 €/pce) et les **associations** (×2,24) s'affichaient **parfaitement** — elles
viennent d'autres sources. **Seul le volume était faux.**

> **RÈGLE GRAVÉE (v1355) : UN TABLEAU À MOITIÉ JUSTE EST PLUS DANGEREUX QU'UN TABLEAU VIDE.**
> Un écran totalement cassé se voit. Un écran dont trois colonnes sur quatre sont correctes
> **inspire confiance** — et Ben aurait pu sortir Vanille de sa gamme en la croyant invendue.

### Le test qui manquait
`tests/v1355-volumes.test.js` — 5 assertions, bloc de comptage **extrait du fichier réel** (jamais
paraphrasé, leçon v1345) : volumes non nuls, impayées comptées comme les payées, grands formats
(`items` et non `parfums`), reprises historiques exclues.

**Ce bug n'aurait jamais existé si j'avais écrit ce test en v1354.** J'ai livré une vue analytique
entière sans un seul test sur sa donnée centrale — le volume.

---

## v1356 — J'AI RECOMMIS LE PÉCHÉ DE LA v1337, DIX-NEUF VAGUES PLUS TARD

Le tableau fonctionne (2 171 pièces). Mais **Praliné noisettes (96 pces)** et **Chocolat noir
(94 pces)** étaient rangés dans **« À QUESTIONNER — faible volume ET faible marge »**, avec une
marge affichée **« — »**.

**Leur marge est INCONNUE, pas faible.**

```js
const hauteMarge = (l.margeUnit != null) && (l.margeUnit >= medMarge);  // null → false → "faible"
```

> **Un `null` traité comme un `false` est UN JUGEMENT DÉGUISÉ EN DONNÉE.**

C'est exactement la règle gravée en v1337 — *« zéro n'est pas une mesure, c'est une affirmation »* —
**que je viens de recommettre**. Ben aurait pu **sortir de sa gamme** deux parfums qui vendent près
de 100 pièces, sur la foi d'une marge qu'on n'a **jamais mesurée**.

### Pourquoi ces marges sont nulles — le mélange de périmètres, encore
`analyzeFlavorProfitability` calcule `margeUnit` à partir de `piecesVendues`, qui filtre
`paiement === 'Payé'`. **J'ai contourné ce filtre pour les volumes en v1355** (décision de Ben,
v1344) **mais pas dans le moteur de rentabilité**. Ces parfums ont donc **96 et 94 pièces sorties,
et 0 pièce payée**.

Ce ne sont pas des parfums sans marge : **ce sont des parfums dont les commandes ne sont pas encore
réglées.** Nouveau quadrant : **« MARGE NON MESURÉE »** — *ils se vendent, mais aucune commande
réglée : impossible de calculer leur marge*.

### Le second point : le vocabulaire, pas la maths
Popcorn (101 pces) était étiqueté « **faible** volume ». La médiane de la gamme est à **125 pièces**
— le calcul est **juste**. Mais dire « faible » pour 101 pièces vendues est **trompeur** :

> **Un seuil relatif décrit une POSITION, jamais une VALEUR.**

Renommé : *« sous la médiane sur les deux axes — à questionner, pas à condamner »*, et l'écran affiche
désormais les médianes réelles (125 pces / 1,43 €) pour que Ben sache **à quoi** il se compare.

### Ce que ça dit
La règle v1337 est gravée dans `COUVERTURE.md` depuis dix-neuf vagues. Je l'ai relue, citée, et
**enfreinte quand même** — parce qu'un `&&` qui renvoie `false` sur un `null` ne *ressemble* pas à une
affirmation. Les tests attrapent ce que la vigilance ne voit plus.

---

## v1357 — LA BOÎTE PONCTUELLE : quand la contrainte produit des données fausses

Ben veut ranger **78 coques**. L'app répond : *« Aucune boîte ne contient 78 coques (la plus grande
fait 30). **Réduis la quantité.** »*

**Ce n'est pas sa quantité qui est fausse. C'est sa boîte ponctuelle qui manque.**

### Le vrai problème : un blocage sans issue
L'app **ordonnait** à Ben de plier sa réalité à une liste de boîtes saisie un jour, pour d'autres
besoins. Un blocage qui n'offre **aucune sortie** force l'utilisateur à **mentir à son propre outil** —
saisir 30 au lieu de 78, ou abandonner la saisie.

> **RÈGLE GRAVÉE (v1357) : UNE CONTRAINTE SANS ÉCHAPPATOIRE PRODUIT DES DONNÉES FAUSSES.**
> Un outil auquel on ment cesse de mesurer quoi que ce soit. La donnée qu'il protégeait, il la détruit.

**Correctif :** un bouton *« Créer une boîte de 78 coques »* apparaît **dans l'écran de blocage**.
La boîte est créée **en place** (pas de détour par les réglages, pas de perte du flux en cours), et
elle est **automatiquement sélectionnée** — elle a été créée pour cette quantité.

### ⚠️ ET LE MÊME BUG DE PLOMBERIE, POUR LA TROISIÈME FOIS
En écrivant cette fonction, j'ai appelé **`modal(...)`**. `modal` **n'est pas une fonction** — c'est
une **variable** (l'élément DOM). La vraie fonction est **`openModal()`**. **Le bouton aurait planté au
premier clic de Ben.**

**Trois bugs, trois causes, une seule famille :**

| Vague | Bug | Nature |
|---|---|---|
| **v1351** | `db.lots` — table inexistante | Référence fantôme |
| **v1352** | `case` manquant dans le dispatch | Câblage absent |
| **v1357** | `modal()` au lieu de `openModal()` | Fonction fantôme |

**Aucun ne casse à la lecture. Tous cassent à l'exécution.** Aucun test métier ne les attrape — ils
ne concernent pas le **calcul**, mais le **câblage**.

**Troisième test de plomberie :** `tests/v1357-onclick.test.js` vérifie que **chacune des 688
fonctions appelées depuis un `onclick=`** existe réellement dans le fichier. Zéro bouton mort trouvé —
mais je ne l'aurais pas su.

*(Et le test avait lui-même le bug qu'il cherchait : ma regex comptait `onclick="if(...)"` comme un
appel de fonction fantôme. Un faux positif dans le détecteur de faux appels.)*

---

## v1358 — ÉTIQUETTES → BOÎTES → RANGEMENT, EN UN GESTE

Ben : *« J'aimerais pouvoir choisir autant de boîtes que nécessaire pour chaque parfum. […] En
remplissant ces cases ça recréerait automatiquement les boîtes qui vont avec ! Le rangement serait
aussi ajouté à côté de chaque ligne. […] Dans le cas de lignes ayant plusieurs impressions (3×20),
demander confirmation que les 3 boîtes vont au même endroit. Si non, proposer un dispatch individuel. »*

### Ce que ça change
L'écran d'étiquettes n'imprime plus seulement — **il range**. C'est le même geste physique (on
étiquette la boîte au moment où on la remplit), donc c'est le même geste dans l'app.

| Avant | Après |
|---|---|
| 1 ligne = 1 lot = N étiquettes | **N lignes par lot**, chacune = une série de boîtes |
| Pas de boîte créée | **Boîte créée automatiquement** si la capacité n'existe pas (réutilisée sinon) |
| Pas d'emplacement | **Emplacement par ligne** |
| — | **3 boîtes → confirmation** « toutes au même endroit ? » → sinon **dispatch individuel** |

### Ce que je RÉUTILISE, et pourquoi c'est capital
- **`p.placements[]`** — le modèle prévoyait **déjà** le multi-boîtes : l'app affiche « ⊟ dispatché »
  dès que `placements.length > 1` (ligne 8981). **Le besoin de Ben n'était pas une nouveauté du
  modèle — il était juste inaccessible depuis cet écran.**
- **`doMoveEmplacement()`** — porte les règles de **sécurité alimentaire** (anti-recongélation, chaîne
  du froid). Un `db.productions.update({emplacement})` direct les aurait **contournées en silence**.

> **RÈGLE (v1358) : UN SECOND CHEMIN VERS LA MÊME ÉCRITURE FINIT TOUJOURS PAR DIVERGER DU PREMIER.**
> Un bug de données se corrige. Une recongélation, non.

### Le garde-fou : ne jamais ranger plus que le lot ne contient
Si les lignes dépassent `qteRestante`, l'app **refuse**. Sinon elle enregistrerait des coques qui
n'existent pas — et Ben irait chercher des boîtes qui ne sont **nulle part**.
*(Sa décision, v1358 : le reste non rangé **reste en attente**, l'app ne l'oblige pas à tout ranger.)*

### ⚠️ LA VARIABLE FANTÔME — la même famille que db.lots et modal()
`window._lbProds` était **lu 4 fois, écrit 0 fois**. Sans lui, `qteRestante` aurait toujours valu **0**
— et **le garde-fou n'aurait JAMAIS mordu**. Ben aurait pu enregistrer 200 coques rangées sur un lot
de 120.

**Quatrième bug de plomberie de la session**, quatrième cause différente :

| Vague | Bug |
|---|---|
| v1351 | `db.lots` — table inexistante |
| v1352 | `case` manquant dans le dispatch |
| v1357 | `modal()` au lieu de `openModal()` |
| **v1358** | **`_lbProds` — variable lue, jamais écrite** |

### Et mon test était décoratif (encore)
Premier jet : `SRC.includes('window._lbProds = lots;')` — qui reste **vrai même commenté**
(`// window._lbProds = lots;`). **Le test validait sa propre existence, pas celle du code.**
C'est la leçon v1352 (*« un test qui ne mord pas ne vaut rien »*), enfreinte par celui qui l'a écrite.
Durci : les commentaires sont retirés avant recherche. **Vérifié : il mord.**

---

## v1359 — INALTÉRABILITÉ DES ENCAISSEMENTS (exigence légale)

Ben : *« Tu empêches toute suppression de montant encaissé. Et tu proposes une correction avec journal
de suivi en cas d'erreur. On doit aussi pouvoir exporter facilement un historique reprenant tous les
encaissements sur une période donnée. »*

**Cadre :** art. 286-I-3° bis du CGI (inaltérabilité, sécurisation, conservation, archivage des données
de règlement) + norme NF525.

> **RÈGLE GRAVÉE (v1359) : ON NE SUPPRIME PAS UN ENCAISSEMENT. ON LE CONTREPASSE.**
> Une donnée comptable effacée est une donnée qu'aucun contrôle ne peut reconstituer — et l'absence
> de trace ne prouve pas l'absence de fraude : **elle EST le problème**.

### Ce que l'audit du code a trouvé
| Point | État |
|---|---|
| Bouton pour supprimer un paiement | **N'existe pas** (bon) |
| `cmdToDevisConfirm` (repasser en devis) | **Bloquait déjà** si un paiement existe (sain) |
| **`cmdDeleteConfirm`** (supprimer une commande) | ⚠️ **LE TROU** — supprimait la commande **avec ses paiements** |

`logDeletion` gardait bien une trace… mais **l'encaissement disparaissait de la comptabilité** : le CA
du mois changeait **rétroactivement**, sans écriture inverse, sans piste d'audit.

### La demande explicite de Ben, respectée
> *« Une commande non payée doit pouvoir repasser en devis sans bloquer puisque pas de paiement d'effectué. »*

Le verrou ne se déclenche **que s'il y a de l'argent**. Zéro encaissement → suppression libre.
*(Testé : commande sans paiement, sans tableau `paiements`, ou avec un paiement à 0 € → toutes libres.)*

### La contrepassation — le modèle la supportait déjà
L'écriture d'origine **reste**, marquée `annule` avec son motif. Une écriture **négative** s'y ajoute,
puis la corrective si besoin.

**`orderPaid()` fait une somme brute** → les négatifs se soustraient **tout seuls**. Le solde redevient
juste **sans aucune modification du moteur comptable**.

### Le journal vit en BASE, pas en localStorage
`logDeletion` écrit dans `localStorage`. **Vider le cache du navigateur effacerait la preuve.**

> **Une trace qu'un geste anodin peut détruire n'est pas une trace — c'est une illusion de trace.**

Nouvelle table `journalCompta` (schéma v31), qui part dans les sauvegardes. **Aucune fonction de l'app
n'en supprime de ligne.** Et si le journal échoue à l'écriture, **la correction est annulée** — mieux
vaut refuser une correction que la faire sans preuve.

### L'export : un registre HONNÊTE, pas un registre PROPRE
Le CSV contient **toutes** les écritures de la période — **y compris les annulations et les
corrections**, explicitement marquées. Un export qui ne montrerait que le solde net serait **maquillé**.

Un contrôleur doit pouvoir voir **l'erreur ET sa correction**.

Format : `;` + virgule décimale + BOM UTF-8 (Excel FR), total net en pied de fichier, périodes
pré-réglées (ce mois / mois dernier / cette année) ou bornes libres.

### Motif obligatoire
Sans motif, la correction est refusée. **Une correction sans justification n'a aucune valeur probante
devant un contrôle.**

---

## v1360 — LE LIVRE DES RECETTES : complet, chaîné, vérifiable

Ben : *« Je veux avoir quelque chose de très solide à montrer en cas de contrôle, sans contestation
possible. »*

### ⚠️ CE QUE JE LUI AI DIT AVANT DE CODER
**« Sans contestation possible » suppose une certification NF525**, délivrée par un organisme accrédité
(AFNOR, LNE) — **pas par du code**. Je ne peux pas la fabriquer, et prétendre le contraire serait
exactement le mensonge que cette série entière traque.

Ce que j'ai fait : un registre **complet, cohérent et techniquement inaltérable** — au point qu'une
contestation devrait porter sur **la certification**, jamais sur **les données**.

### LE DÉFAUT QUI INVALIDAIT TOUT LE v1359
L'export ne lisait que `db.orders`. **LES VENTES MARCHÉ N'Y ÉTAIENT PAS.**

> Un livre des recettes qui omet un canal de vente entier n'est pas **incomplet** : il est **FAUX**.
> Et l'incomplétude est précisément ce qu'un contrôle cherche.

**TROISIÈME FOIS que j'oublie les marchés :**

| Vague | Ce qui les oubliait |
|---|---|
| v1336 | Le CA |
| v1355 | Les volumes par parfum |
| **v1359** | **Le livre des recettes** |

> **RÈGLE GRAVÉE (v1360) : QUAND JE PARS DE `db.orders`, JE DOIS ME DEMANDER OÙ SONT LES MARCHÉS.**
> Ce n'est plus une erreur ponctuelle — c'est un **réflexe manquant**. Le canal marché ne passe pas
> par `orders`, donc je l'oublie **à chaque fois** que je pars des commandes.

### Les marchés, correctement intégrés
- Seuls les marchés **clos** (recette arrêtée)
- **Le fond de caisse est déduit des espèces** — sinon on déclarerait comme recette l'argent qui
  était déjà là le matin (on passe par `caMarcheEncaisse()`, qui applique déjà cette règle)
- **Chaque mode de règlement est une ligne distincte** (espèces / CB / autre) — la loi exige la
  ventilation

### Le chaînage d'intégrité
Chaque écriture porte une **empreinte** calculée depuis son contenu **et l'empreinte de la
précédente**. Testé : **modifier** un montant, **supprimer** une recette ou **insérer** une fausse
écriture **rompt la chaîne**, et la rupture est **localisée**.

**Ce que ça n'apporte PAS, et je le dis dans le code :** ça rend l'altération **détectable**, pas
**impossible**. Ce n'est pas une certification.

### Les mentions obligatoires (art. L102 B LPF, art. 286-I-3° CGI)
date · pièce justificative · client · **nature de la prestation** · montant · mode de règlement
— toutes présentes, testées une par une.

### Deux sorties
- **CSV** pour le comptable (Excel FR, total net, ventilation par canal et par moyen)
- **Édition papier** — c'est **ce document** qu'on présente à un contrôle. Un CSV n'est pas un livre :
  c'est un fichier. Le livre se lit, se date, se signe. Il porte le **contrôle d'intégrité** et
  l'**empreinte de clôture**.

---

## v1361 — LES REPRISES HISTORIQUES SONT DES RECETTES

Ben : *« Les migrations comptées à part ne sont pas incluses dans le cahier comptable, pourquoi ?
Bien qu'elles aient été comptabilisées elles font bien partie de mon CA, **le dissimuler serait
mentir**. »*

**Il a raison, et l'erreur est grave.** J'avais écrit :

```js
if(!o || o.histo) return;   // « les reprises d'historique ne sont pas des recettes de l'exercice »
```

**C'est faux.** Ce sont des **ventes réelles, encaissées**, qui font partie de son CA. Les exclure du
livre des recettes, c'est **dissimuler du chiffre d'affaires** — et un contrôleur qui compare le livre
à la déclaration verrait l'écart **immédiatement**.

### J'ai confondu deux choses
| Ce que j'ai lu | Ce que c'est |
|---|---|
| « saisi rétroactivement dans l'app » | une caractéristique **technique** |
| « ne fait pas partie du CA » | une affirmation **comptable** — et elle est **FAUSSE** |

> **RÈGLE GRAVÉE (v1361) : UNE CARACTÉRISTIQUE TECHNIQUE N'EST JAMAIS UNE JUSTIFICATION COMPTABLE.**
> Le **mode de saisie** d'une recette ne change **rien** à son **existence**.

C'est le principe que je venais de graver en v1360 (*« l'omission d'un canal rend le livre FAUX »*),
**violé dans la ligne suivante**.

### Le piège technique, plus retors que le filtre
Une commande historique a `paiement:'Payé'` mais **`paiements:[]` — un tableau VIDE**.

**Retirer le filtre `o.histo` n'aurait donc RIEN changé** : la boucle sur `paiements` ne trouve rien.
La recette serait restée absente du livre — **mais silencieusement**, ce qui est pire qu'un filtre
visible.

**Correctif :** même rétro-compatibilité que `orderPaid()` — pas d'écriture de paiement + statut
« Payé » ⇒ la recette vaut le **montant de la commande**, à sa date.

### La vérité, sans dissimulation ni disqualification
La reprise apparaît dans le livre avec :
- sa **nature** : *« Vente de macarons — reprise d'historique (label) »*
- son **canal** : *« Reprise historique »*, ventilé séparément dans les totaux

**On ne cache pas l'origine. On ne la disqualifie pas non plus.**
**Une recette reprise reste une recette.**

---

## v1362 — « ACOMPTE » N'EST PAS UN MOYEN DE PAIEMENT

Ben : *« Pourquoi certains acomptes sont notés dans le livre des recettes comme "virement" et d'autres
comme "acompte" ? **L'un empêche pas l'autre non ?** »*

**Il a raison, et la confusion était dans le code :**

```js
paiements: [{ date, montant, moyen:'Acompte' }]   // un STATUT rangé dans le champ MOYEN
```

### Deux dimensions indépendantes, un seul champ
| Dimension | Ce qu'elle dit | Valeurs |
|---|---|---|
| **MOYEN** | **COMMENT** l'argent est arrivé | Virement · Carte · Espèces · Chèque |
| **STATUT** | **CE QUE** couvre le règlement | Acompte · Solde |

**On peut avoir un acompte PAR VIREMENT, puis un solde EN ESPÈCES.** Les deux coexistent.

> **RÈGLE GRAVÉE (v1362) : UN STATUT N'EST PAS UN MOYEN.**
> Deux dimensions indépendantes ne partagent **jamais** un champ — sinon l'une **écrase** l'autre,
> et le total **ment**.

### La conséquence comptable, et elle est sérieuse
**La ventilation par mode de règlement du livre des recettes était FAUSSE.** Une colonne « Acompte »
sans aucun sens comptable, et **les vrais virements sous-comptés**. Sur un contrôle, c'est une
ventilation qui ne tombe pas juste — exactement le genre d'incohérence qui déclenche un examen.

### Le correctif
- **Le moyen réel est désormais demandé** à la saisie de l'acompte (sélecteur `PAY_METHODS`)
- **Le statut est stocké dans son propre champ** (`acompte:true`)
- **Si le moyen n'est pas renseigné → `null`**, jamais une valeur inventée (v1337)

### Le legacy — l'information n'est pas perdue, elle est remise dans la bonne colonne
Les acomptes **déjà saisis** portent `moyen:'Acompte'`. Le vrai moyen est **inconnu a posteriori** :
- **Colonne moyen** → « Non précisé » (la **vérité**), jamais « Acompte » (une catégorie de règlement
  **qui n'existe pas**)
- **Colonne statut** → « Acompte » ✅ **conservé**

---

## v1363 — CRASH DES ÉTIQUETTES : un modal ouvert par-dessus un modal

Ben, dans « Étiquettes groupées » : *« je subis un crash au moment d'appuyer sur chaque bouton
emplacement. À l'issue du crash je perds toutes les informations qui étaient en attente de validation
et dois recommencer depuis zéro. »*

### La cause
L'écran « Étiquettes groupées » **est lui-même un modal** (`openModal`). Le bouton emplacement
(`lbPickEmp`) rappelait `openModal` — et `openModal` ne crée pas une pile : il fait
`modal.innerHTML = html`, il **remplace**. Au clic sur « emplacement », l'écran des étiquettes était
donc **détruit**. En choisissant l'emplacement, `lbSetEmp → lbRenderLignes` cherchait
`getElementById('lblignes_X')` — un élément **disparu**. D'où le crash, et la perte des lignes.

> **RÈGLE GRAVÉE (v1363) : on n'empile pas les modals. Un sélecteur qui interrompt une saisie
> s'affiche DANS la saisie, jamais par-dessus.**

### Le correctif
Le sélecteur d'emplacement s'affiche **dans la ligne** (drapeau `_empOuvert`, rendu par
`lbRenderLignes`). Aucune fonction `lb*` du flux n'appelle plus `openModal`.

### Le sous-bug attrapé au passage
La **confirmation de dispatch** (« ces 3 boîtes vont-elles au même endroit ? ») est un modal légitime,
mais la fonction qui reconstruit l'écran ensuite (`labelsBatchForm`) remet `_lbLignes` à zéro : le
correctif contenait le bug qu'il corrigeait. On sauvegarde `_lbLignes.slice()` + `_lbUid` **avant**
de rappeler `labelsBatchForm`, et on restaure **après** (`lbRestaurerEcran`).

Test : `tests/v1363-modal-imbrique.test.js` (12 tests) — aucune fonction `lb*` du flux n'ouvre de modal.

---

## v1364 — ATELIER CHRONO : arrêt direct depuis le raccourci + minuteur supprimé

Ben, depuis la fenêtre raccourci (fenêtre flottante) : *« j'ai toutes les difficultés à arrêter des
étapes en cours. Obligé d'ouvrir l'atelier complet. […] Je voudrais supprimer l'option qui lance un
chronomètre. Les étapes semi-actives doivent pouvoir se cumuler. »*

### 1. Le bouton ⏹ ne réagissait pas — MÊME DÉFAUT QUE v1363
`⏹` appelait `prodTaskStopGuard`, qui pour une **meringue partagée** ouvrait un `openModal`. Mais la
fenêtre flottante vit dans sa **propre couche** (`#chronoFloatHost`) : le modal s'ouvrait **derrière
elle**, invisible et incliquable. Le bouton semblait mort.

C'est **exactement** le défaut du crash étiquettes (v1363) : **une action qui ouvre un modal depuis
une couche flottante**.

> **RÈGLE (v1363, re-confirmée v1364) : une couche flottante ne déclenche pas de modal par-dessus elle.**

Ben a tranché : *« supprimer la confirmation : arrêter directement »*. Nouveau `prodTaskStopDirect` —
il fige le chrono, passe l'étape à l'historique, rafraîchit la fenêtre **sur place**. **Aucun modal**,
donc aucune couche concurrente, donc plus de bouton mort. (`prodTaskStopGuard` reste pour l'atelier
complet, où la confirmation a du sens.)

### 2. Le minuteur supprimé
Lancer une étape passive (foisonnement, cuisson…) ouvrait `atShowDurPrompt` : Ben devait **annoncer
une durée à l'avance**, et le chrono se **mettait en pause à la sonnerie**. Retiré de `atLaunch`.

Une passive démarre désormais **comme une active** : un chrono qui court et **se cumule**, qu'on
arrête quand le vrai travail est fini.

> **On MESURE le temps réel, on ne PRÉDIT plus une durée à l'avance** — c'est tout l'objet de l'atelier.

Les libellés « minuteur » qui annonçaient ce comportement disparu ont été retirés du rendu (ils
auraient trompé l'utilisateur).

### 3. Le cumul des semi-actives : NON TOUCHÉ
Ben : *« ça marche déjà, ne pas y toucher ».* `prodTaskStartSmart` (qui porte le cumul) reste le point
de démarrage unique — vérifié par test : les passives passent par le **même** démarrage que les actives.

---

## v1365 — CARTE DE LOT : ne garder que le PDF

Ben, capture à l'appui : *« Dans cet exemple j'ai : PDF, étiquette, image. Je veux garder uniquement
la fonction PDF, les deux autres ne servent à rien et doivent disparaître. »*

Retrait, sur la **carte de lot** (`renderProductions`, ligne ~10174), des boutons :
- **⎙ Étiquette** (`printLabel`)
- **🖼 Image** (`shareLabelImage`)

**📄 PDF** (`shareLabelPDF`) conservé.

### Ce qui n'a PAS été touché, et pourquoi
- Le **modal de détail** d'un lot (ligne ~15045) garde ses propres boutons Étiquette / Image / PDF :
  la demande visait la carte, pas le détail.
- `printLabel` et `shareLabelImage` restent définies — elles servent ailleurs (modal détail,
  assemblage). **Aucun code mort** à retirer : ôter un bouton n'est pas ôter la fonction.

---

## v1366 — UN MÊME MOYEN DE PAIEMENT N'A QU'UN LIBELLÉ

Ben, dans son livre des recettes :
1. *« J'ai deux transactions qui devraient être ensemble : "carte" et "carte bancaire". »*
2. *« Il y a encore des lignes qui affichent "acompte" alors qu'elles devraient afficher le moyen de paiement. »*

**Même nature de bug** : un moyen écrit sous plusieurs formes est ventilé en plusieurs colonnes.

### Bug 1 — « Carte » vs « Carte bancaire » (ma faute, v1360)
En ajoutant les marchés au livre (v1360), j'ai écrit `moyen: 'Carte bancaire'`. Or le libellé
canonique (`PAY_METHODS`, la ventilation compta, les couleurs) est **« Carte »**. Résultat : les
ventes marché CB formaient une **colonne séparée** des ventes commande CB.

### Bug 2 — « Acompte » revient dans la colonne moyen (v1362 incomplet)
Le v1362 neutralisait `p.moyen === 'Acompte'` **mais pas le repli `o.reglement`**. Sur les vieilles
commandes converties, `o.reglement` valait lui-même « Acompte » : en repli, **« Acompte » revenait
par la fenêtre**. Un statut, jamais un moyen (v1362).

### Le correctif : une normalisation unique, à la lecture
`_normMoyen(m)` en tête de `livreDesRecettes` :
- `« Carte bancaire »`, `« CB »`, `« carte »` → **« Carte »**
- `« Acompte »` → **null** (bascule vers le repli, puis « Non précisé »)
- moyens légitimes (Virement, Espèces, Chèque) → inchangés

Appliquée **partout** : `p.moyen` **ET** `o.reglement` (le repli oublié en v1362).

> **RÈGLE (v1366) : un même moyen n'a qu'UN libellé. La normalisation se fait À LA LECTURE** — sinon
> l'historique déjà enregistré resterait scindé, même après correction de l'écriture.

### Tests mis à jour (pas affaiblis)
v1360 et v1362 vérifiaient l'ancien code (`'Carte bancaire'`, l'ancienne formule acompte). Alignés
sur le nouveau comportement — le changement était **légitime**, les tests devaient suivre.

---

## v1367 — LA PAGE D'IMPRESSION DU LIVRE ÉTAIT UN CUL-DE-SAC

Ben : *« quand je clique sur impression livre de recette je n'ai aucun moyen de ressortir de cette
page, je suis contraint de fermer complètement l'application pour ressortir. »*

### La cause
`imprimerLivreRecettes` ouvrait une page HTML **sans bouton de fermeture** et **sans fermeture après
impression**. Sur iPhone en PWA, `window.open('_blank')` ne donne **pas de barre de navigateur** :
aucune sortie → Ben piégé, obligé de tuer l'app.

L'autre impression de l'app (le bilan mensuel) avait déjà `window.onafterprint = window.close()`.
Le livre, ajouté plus tard (v1360), ne l'avait pas. Incohérence que je n'avais pas vue.

> **RÈGLE (v1357, ré-appliquée) : une page sans issue est un cul-de-sac. Toute vue plein écran
> ouverte par l'app doit offrir une sortie visible.**

### Le correctif
- **Barre d'actions** en haut de la page (« ✕ Fermer » + « 🖨 Imprimer »), **sticky**, **masquée à
  l'impression** (`@media print`) pour ne pas salir le PDF.
- **Bouton Fermer robuste** : `window.close()` (vraie popup) **avec repli `history.back()`** (si le
  HTML s'est écrit dans la fenêtre courante — ce qui arrive quand la popup est bloquée, et explique
  le piège).
- **Fermeture après impression** (`window.onafterprint`).
- **On ne force plus `print()` automatiquement** : sur iPhone, la boîte d'impression forcée pouvait
  re-piéger. Ben déclenche l'impression via le bouton, ou ferme. Il garde la main.

---

## v1368 — LE DÉTECTEUR D'ANOMALIES COMPTABLES

Ben : *« Ma plus grande frustration est d'avoir une app qui crée des mensonges en douce, des données
non traçables. Si les chiffres mentent c'est la fin de la confiance. Construisons l'outil permettant
de tracer à chaque instant toute déviance, tout mensonge. »*

### Le principe, et il est fondateur
Le détecteur **ne recalcule pas** la compta — il vérifie qu'elle **ne se contredit pas**. Un chiffre
comptable ne peut pas mentir sans laisser de trace : il suffit de vérifier qu'il **retombe sur ses
lignes**. Chaque contrôle est un **invariant** — une égalité qui DOIT tenir. Sa violation désigne une
donnée inventée, avec sa pièce et la règle enfreinte.

Il **ne corrige rien** tout seul : réparer en douce serait un mensonge de plus. Il montre, localise,
nomme. **Ben décide.**

### Les 7 invariants
| # | Contrôle | Gravité | Ce qu'il attrape |
|---|---|---|---|
| 1 | encaissé ≤ dû | critique | double-saisie, montant inventé |
| 2 | « Payé » ⇒ recette réelle | alerte | statut qui ment |
| 3 | tout encaissement daté + moyen réel | critique/alerte | recette invisible ; « Acompte » comme moyen (v1362) |
| 4 | « Payé » ⇒ solde nul | critique | statut incohérent avec le solde |
| 5 | reprise = recette datée et chiffrée | alerte | reprise inexploitable (v1361) |
| 6 | fond de caisse ≤ espèces | critique | CA marché évaporé (v1360) |
| 7 | **livre des recettes = CA encaissé** | critique | **le contrôle-maître** |

**L'invariant 7 est le cœur** : deux calculs **indépendants** des recettes (le livre `livreDesRecettes`
et la compta `computeAccounting`) doivent donner le **même total**. S'ils divergent, l'un ment — et
c'est invisible sans ce croisement. Les reprises sont exclues des deux côtés (même périmètre : le livre
les inclut v1361, la compta les exclut A4).

> **RÈGLE (v1368) : quand un total ne retombe pas sur la somme de ses lignes, ce n'est pas un détail
> d'affichage — c'est le signe qu'une donnée a été inventée. On la traque jusqu'à sa pièce.**

### Le test prouve que le détecteur MORD
13 tests fabriquent des données **volontairement fausses** et vérifient que chaque invariant se
déclenche — et qu'une base **saine** ne produit **aucun faux positif**. Un détecteur qui n'attrape
jamais rien serait décoratif (leçon v1358).

### Accès
Comptabilité → **🔍 Contrôle de cohérence** → période (ou tout l'historique) → liste triée par gravité,
chaque anomalie pointant sa pièce et sa règle.

Ce n'est pas une app qui promet de ne jamais se tromper. C'est une app capable de **se contrôler
elle-même** — et c'est ça qui rend la confiance.

---

## v1369 — LE DÉTECTEUR ÉTENDU AU STOCK ET AU TEMPS

Ben : *« Poursuis en développant cet outil dans les stocks, en particulier la décrémentation des
matières premières consommées à mesure que je produis. Applique-le aussi à l'atelier chrono et au
calcul du temps réel par recette produite. »*

### La nature du mensonge change selon le domaine
| Domaine | Ce qui doit tenir |
|---|---|
| **Compta** (v1368) | un total retombe sur ses lignes |
| **Stock** | une **chaîne** reste continue : chaque prélèvement = une matière qui existait, en quantité suffisante |
| **Temps** | un **ratio** (min ÷ macarons) dont les deux termes sont réels et représentatifs |

### Stock — 5 invariants de continuité de la chaîne FIFO
| # | Contrôle | Gravité | Le mensonge attrapé |
|---|---|---|---|
| S1 | conso → lot existant | critique | prélèvement fantôme, traçabilité rompue |
| S2 | Σ conso ≤ qté initiale du lot | critique | **décrémentation débordée — la conso « en douce » sur du stock inexistant** |
| S3 | **qteRestante = initiale − Σ conso** | alerte | **le contrôle-maître : le stock affiché ment sur ce qu'il reste** |
| S4 | restant ≥ 0 | critique | sur-décrémentation franche |
| S5 | production faite ⇒ conso | info | stock qui ne se vide pas |

**S2 est exactement le bug que Ben redoute** : une production qui prélève dans le mauvais stock via
FIFO. Si un lot a livré plus qu'il ne contenait, la décrémentation a débordé — et ça se prouve
arithmétiquement.

### Temps — 3 invariants sur le ratio
| # | Contrôle | Gravité | Le mensonge attrapé |
|---|---|---|---|
| T1 | fin ≥ début | critique | durée négative qui empoisonne la moyenne |
| T2 | temps affiché ⇒ fiable | info | moyenne calculée sur trop peu (leçon v1337) |
| T3 | temps d'atelier ⇒ production | alerte | temps rattaché à aucune sortie → rentabilité par parfum faussée |

### Un seul écran, trois domaines
Comptabilité → **🔍 Contrôle de cohérence** lance désormais l'audit **complet** : compta + stock +
temps, résultats groupés par domaine, triés par gravité, chaque anomalie pointant sa pièce et sa règle.

### Le test prouve que ça mord
11 tests fabriquent des ruptures de chaîne et des ratios faux, et vérifient que chaque invariant se
déclenche — sans faux positif sur des données saines. Même discipline que v1368.

---

## v1370 — LE DÉTECTEUR SE TROMPAIT : 65 faux positifs sur des ajustements légitimes

Ben lance l'audit sur ses vraies données : **79 anomalies, dont 67 en stock**, presque toutes du type
« Stock affiché ≠ initiale − consommé » (blancs d'œufs, poudre d'amande…).

**La plupart étaient des faux positifs de MON détecteur.** Le contrôle S3 (v1369) ne connaissait qu'un
seul chemin de décrémentation : la consommation de production. Or un lot baisse par **trois** chemins :
1. la **consommation** (production) — connue
2. la **perte formelle** (casse, péremption, `materialLosses`) — **ignorée**
3. l'**ajustement d'inventaire** (manque constaté, `inventaireConfirm`) — **ignoré ET non tracé**

Chaque lot où Ben avait jeté de la matière ou corrigé un inventaire à la baisse apparaissait donc à
tort comme « incohérent ».

> **RÈGLE GRAVÉE (v1370) : un contrôle qui crie au loup sur des données SAINES détruit la confiance
> aussi sûrement qu'un vrai mensonge.** Un faux positif n'est pas un désagrément mineur : c'est du
> bruit qui masque le signal — Ben finirait par ignorer TOUTES les alertes, y compris les vraies.
> Le détecteur lui-même doit être tenu à la barre qu'il impose au reste du code.

### Le correctif — deux temps
1. **Tracer les ajustements** : `inventaireConfirm` écrit désormais `ajustInventaire` (cumul) sur
   chaque lot décrémenté par un manque d'inventaire. Sans trace, l'écart est indéductible.
2. **S3 déduit les trois chemins** : `attendu = initiale − conso − pertes − ajustements`.

### L'honnêteté sur la limite (les données historiques)
Les ajustements **antérieurs** à v1370 ne sont pas tracés — le champ n'existait pas. Pour ces lots,
S3 ne peut pas prouver l'écart. Il ne CRIE donc pas « incohérence » :
- **affiché < attendu, sans trace** → `ECART_NON_TRACE` en **INFO** (ajustement historique probable,
  pas un mensonge)
- **affiché > attendu** → `RESTANT_SUPERIEUR` en **ALERTE** (du stock apparu de nulle part : ça, c'est
  toujours suspect)

Un détecteur honnête distingue « je sais que c'est faux » de « je ne peux pas l'expliquer ».

### Bonus : bug d'affichage corrigé
Trois libellés du module temps étaient corrompus (« tÃ¢che », « rentabilitÃ© ») par un double
encodage UTF-8 lors d'une manipulation antérieure. Réécrits proprement.

---

## 2026-07-16 — Chantier fiabilité 1/3 : LE STOCKAGE UNIFIÉ + LE JOURNAL D'AUDIT  (v1370 → **v1372**)

**Décidé par Benjamin** (chantier fiabilité, à exécuter dans l'ordre) :
> « 1. IndexedDB unifié + Audit trail (sécurité + conformité) — 2. Schéma de validation — 3. State
> machine des dépendances. On fait les trois dans l'ordre. »

*(Note de numérotation : une v1371 — journal copilote rendu durable — a été perdue dans une session
interrompue. Son objectif est ré-absorbé ici : `sm_aiJournal` est une clé métier du stockage unifié.)*

### Ouverture de chantier : la suite arrivait ROUGE
La base v1370 livrée avait **5 harnais** jamais mis à jour après v1342 (l'extraction de
`_dansPeriode` manquait : monthly-bilan, ca-deux-verites, une-seule-verite, canal-oublie,
total-et-lots) et **2 gardes** de la vague 56 ancrées sur une **fenêtre de 1200 octets** que
l'insertion de `_aiRaisonAveu` avait décalée — la garde testait la mise en page, pas la règle.
Ré-ancrées sur le dossier de justification lui-même (+ garde G0 : il reste ATTACHÉ à la liste).
**Et 18 suites (vagues 63-71) n'avaient jamais été inscrites dans `run-all.js`** : des gardes qui ne
tournaient jamais dans l'agrégat — « un if qui ne tirera jamais » (vague 59). Toutes inscrites.

### Le constat (l'angle mort v1341, en pire)
Les données vivaient dans DEUX mondes : IndexedDB (sauvegardé, vérifié) et localStorage — dont une
partie seulement partait en sauvegarde. L'inventaire complet :
- les **modèles de pyramides** (`sm_pyraModels`) : perdus à toute restauration — l'angle mort déclaré
  de la vague 62 ;
- le **compteur légal de factures** (`sm_factSeq`) : hors sauvegarde, alors que **son propre
  commentaire affirmait le contraire**. Un commentaire qui ment est pire qu'une absence : il dispense
  de vérifier. (Le ré-ancrage sur la plus haute facture définitive limitait la casse — pas le point
  de départ réglé avant la première facture.) ;
- le **journal des vraies requêtes du copilote** (`sm_aiJournal`) : la mesure qui doit trancher la
  question du LLM embarqué mourait avec l'appareil ;
- les **motifs de suppression saisis par Ben** (`sm_deletionLog`) : hors sauvegarde depuis toujours —
  attrapés par la nouvelle garde A2 **à son premier passage**.

> **RÈGLE GRAVÉE (v1372) : une donnée métier qui ne survit pas à une restauration n'est pas
> stockée — elle est en sursis.** Et son corollaire : **UN STOCKAGE NON CLASSÉ EST UN STOCKAGE NON
> PENSÉ** — chaque clé localStorage appartient à une famille déclarée, et le test refuse toute
> clé orpheline (il interdit le MOTIF : les clés futures aussi).

### L'architecture — deux supports, UNE règle d'autorité
localStorage reste le support d'**exécution** (les lectures synchrones de 60 000 lignes ne bougent
pas) ; la table Dexie **`kv`** devient le support **durable** (sauvegardée, vérifiée, restaurée).
- **L'ordre d'écriture est une règle, pas un détail** : localStorage d'abord, `kv` ensuite (file +
  flush 300 ms, flush immédiat au passage en arrière-plan). `kv` peut donc RETARDER, jamais devancer.
- **La réconciliation au boot en découle entièrement** : localStorage vide + `kv` garni →
  **restauration** (LE cas réparé : purge iOS, changement d'appareil, restauration de sauvegarde) ;
  les deux garnis et différents → localStorage gagne, et la divergence est **journalisée** — une
  divergence résolue en silence est une information détruite.
- **Le point de passage est unique** : `setItem`/`removeItem` de l'instance sont enveloppés. Aucune
  liste de sites d'appel à maintenir — le code futur est couvert d'office (vagues 49-50 : interdire
  le motif, pas le cas). Une panne de la copie durable ne casse JAMAIS l'écriture locale (prouvé), et
  elle est comptée + affichée à l'écran Sauvegardes.
- **17 clés métier** classées (réglages, compteurs légaux, modèles de pyramides, journaux copilote,
  charges récurrentes, temps appris, signature, motifs de suppression…) ; **31 clés d'appareil**
  déclarées comme telles (marqueurs de migration, chronos en cours, positions d'écran) — et c'est un
  choix écrit, pas un oubli.

### Le journal d'audit (`auditLog`)
« Cette commande a été modifiée quand, et qu'est-ce qui a changé ? » n'avait pour réponse : rien.
- **Hooks Dexie** sur toutes les tables (création / modification / suppression) : là encore un point
  de passage unique. Modifications tracées **champ par champ** (avant → après, notation pointée
  suivie ; absent = `null`, jamais 0 — v1326/v1337).
- Tampon **par transaction, flush au COMMIT** : une écriture annulée n'a pas eu lieu, elle n'est pas
  journalisée (prouvé).
- Entrées **bornées** (1200 car.) : tronquer en le DISANT (taille réelle + champs touchés), jamais en
  silence (v1333). Rétention **2000 entrées**, affichée à l'écran.
- Exclusions ÉCRITES : `auditLog` (récursion) et `backups` (payloads-mammouths, le tableau des
  sauvegardes est déjà son propre journal).
- `journalCompta` (v1359) reste le journal LÉGAL des encaissements ; `auditLog` est le journal
  OPÉRATIONNEL de tout le reste. Les deux ne se remplacent pas.
- Écran : **Sauvegarde & sécurité → 📜 Voir le journal des écritures** (filtre par table, détail
  champ par champ, écran d'origine).

### Le piège évité : la somme de contrôle rétroactive
Ajouter `kv`/`auditLog` à `TABLES` aurait fait recalculer la somme des VIEILLES sauvegardes sur un
périmètre qu'elles ne connaissent pas → **toutes** déclarées « modifiées ou tronquées ». Une alarme
injustifiée finit ignorée — y compris le jour où elle a raison (vague 59).
> **RÈGLE GRAVÉE : une somme de contrôle dont le périmètre bouge sans être écrit dans le fichier
> n'en est pas une.** Les sauvegardes v1372+ embarquent leur périmètre (`_checksumTables`) ; les
> anciennes sont vérifiées sur la liste HÉRITÉE, figée à jamais. Prouvé dans les deux sens (H4/H5).

### Restauration — trois protections
1. une sauvegarde d'AVANT v1372 n'efface NI `kv` NI `auditLog` (règle prodSessions généralisée : un
   journal d'audit qu'une restauration peut vider n'est pas un journal d'audit) ;
2. après restauration, `kv` → localStorage : les clés métier reflètent la sauvegarde, comme les tables ;
3. `kvBoot()` s'exécute AVANT les migrations du boot — elles lisent localStorage, il doit être
   re-garni d'abord.

### Suite v1372 : 49 assertions (78 suites au total, toutes vertes)
Chaque garde prouvée par réintroduction : clé fantôme injectée → détectée (A3) ; panne kv →
l'écriture locale survit (D4) ; transaction annulée → rien au journal (G4) ; somme naïve → aurait
invalidé tout l'historique (H5).

### Angles morts déclarés
- Le journal d'audit ne connaît pas le POURQUOI d'un changement — seulement le quoi/quand/où.
  `logDeletion` (motifs saisis) reste complémentaire, désormais durable.
- Les écritures des ~300 dernières ms avant un crash brutal peuvent manquer à `kv` — localStorage les
  a, la réconciliation du boot suivant les rattrape (« pousser »). La fenêtre est structurelle, dite,
  et bornée.
- Deux appareils simultanés ne sont PAS réconciliés champ à champ (hors périmètre du chantier 1 —
  c'est l'axe 6 « vector clock », non retenu à ce stade).

---

## 2026-07-16 — Chantier fiabilité 2/3 : LES SCHÉMAS DE VALIDATION À L'ENTRÉE  (v1372 → **v1373**)

**La promesse de l'axe choisi par Benjamin** : « je remets un string où on attend un number »
devient **impossible** — refusé à l'écriture, motif lisible, avant de polluer la base.

### La leçon v1370 appliquée au validateur lui-même
Un contrôle qui refuse des données SAINES détruit la confiance aussi sûrement qu'un vrai mensonge.
D'où **deux niveaux**, et la frontière est une règle :
- **BLOQUANT** — uniquement ce qui est PROUVABLEMENT faux quel que soit le contexte : type erroné
  (montant non numérique, NaN, date malformée, tableau attendu), champ d'identité absent à la
  **création**. Chaque règle bloquante est fondée sur le **site de création réel** du code, cité
  dans le schéma (cmdSave, saveCharge, ttConfirmStop, marketAddRetour, v1359…) — pas sur une
  supposition.
- **ALERTE** — le suspect non prouvé : énumération inconnue, signe inhabituel. L'écriture **passe**,
  l'anomalie est **journalisée** (op « suspect » dans `auditLog`). Même discipline que le détecteur
  d'anomalies v1368-70 : détecter sans bloquer quand on ne peut pas prouver.

Clin d'œil qui n'en est pas un : **« embarque »**, le type fantôme qui a lancé la vague 59, serait
aujourd'hui signalé **à l'écriture même** (E1).

### Le mécanisme
- 21 tables couvertes (`VALIDE_SCHEMAS`) ; types en français (`nombreFini`, `dateJ`, `idRef` — qui
  accepte 0 : « sans fournisseur », `horoMs`…).
- **Hooks Dexie** `creating`/`updating` : lever une exception dans un hook AVORTE l'opération et sa
  transaction — le refus est réel, pas cosmétique. Installés **avant** les hooks d'audit : une
  écriture refusée n'est jamais proposée au journal des écritures commises.
- **Les modifications ne valident que les champs écrits** (les `mods` Dexie) : une fiche ancienne au
  champ hérité bancal reste éditable tant qu'on ne touche pas ce champ. On valide l'ENTRÉE, on ne
  juge pas le stock existant. Chemins pointés non déclarés : passent — limite DITE.
- **Restauration/fusion : hooks suspendus** (`_importEnCours`, audit compris) — rejouer des données
  qui ont déjà vécu en base remplirait le journal de fausses créations et jugerait l'historique.
  Chaque restauration/fusion laisse **une** entrée récapitulative (op « restauration » / « fusion »).
- Le refus n'est **jamais muet** : exception typée `ValidationRefusee` + toast + journal (« rejet »).

### La soupape (parce que je peux me tromper)
Ben n'a pas de développeur sous la main. L'écran Sauvegardes porte un interrupteur **« validation
stricte »** (activée par défaut). Désactivée : plus rien n'est refusé, mais chaque refus évité est
journalisé (« rejet-ignoré ») et une bannière ambre le rappelle — une protection débranchée en
silence serait la fausse sécurité de v1329. Compteurs de session (refus/suspects) affichés.

### Corrigé au passage (v1372 durci)
Les écritures de journal lancées depuis un hook ou un rappel `complete` héritent de la **zone**
Dexie de la transaction morte → `Dexie.ignoreTransaction` partout où le journal écrit depuis un
hook (l'issue documentée). Le flush d'audit de v1372 est corrigé de même.

### Suite v1373 : 32 assertions (79 suites au total, toutes vertes)
La moitié de la suite est un **corpus de 11 fixtures à la forme réelle** (relevées aux sites de
création) que le validateur accepte sans erreur **ni alerte** — l'anti-cri-au-loup est un test,
pas une intention. Preuves : le montant-chaîne refusé et nommé (C1), NaN nommé (C4), le refus est
une vraie exception (F1), le débrayage journalise (F4), les hooks dorment pendant les restaurations
(G2/G3).

### Angles morts déclarés
- `orders.statut` n'a **pas** d'énumération d'alerte : deux dimensions cohabitent dans le code
  (statut de préparation « À préparer/En cours/Terminée/Livrée » et champ `paiement` « Payé/Partiel »)
  et je ne fige pas un vocabulaire que je ne peux pas prouver complet — v1370.
- La validation ne voit pas `bulkPut` interne de `kv` pendant qu'elle est suspendue (restauration) —
  assumé : ces lignes sortent d'une sauvegarde déjà vérifiée par somme de contrôle.
- Les objets libres (lignes de commande, `ca` d'un marché) ne sont pas validés en profondeur —
  limite dite en D3.

---

## 2026-07-16 — Chantier fiabilité 3/3 : LA CARTE DES DÉPENDANCES ENTRE LES CHIFFRES  (v1373 → **v1374**)

**L'axe choisi par Benjamin** : « "CA" dépend de "cash receipts" ; "point mort" dépend de "charges
fixes" ET "CA" ; si l'une se recalcule, les autres cascadent. Le gain : quand tu changes une source,
le compilo te dit ce qu'il faut retester. »

### Le constat
La structure de dépendance des chiffres n'existait NULLE PART : elle vivait de session en session
dans la tête de l'assistant, et chaque bug de source (v1331 : CA à la date de commande ; v1339 :
deux vérités de stock) a été découvert APRÈS coup. La carte la rend **explicite, vérifiée, visible**.

> **RÈGLE GRAVÉE (v1374) : une carte fausse est pire que pas de carte** — c'est le commentaire qui
> ment (v1372), à l'échelle de l'architecture. La carte est donc tenue par des gardes : chaque
> fonction citée existe dans le code, chaque table citée existe au schéma Dexie, chaque clé kv citée
> est une clé métier CLASSÉE (v1372), chaque suite citée existe sur disque, et le graphe n'a pas de
> cycle (détecté ET nommé, chemin compris — D1).

### La carte (`FIGURES`) — 11 chiffres déclarés
CA encaissé, CA marchés, charges fixes, coût de revient (FIFO), point mort, stock fini par parfum,
prévisionnel, revenu horaire, sérénité, audit comptable, audit stock & temps. Chaque figure porte :
ses **sources** (tables Dexie et clés kv — `kv:sm_recurringCharges` est une source comme une autre),
ses **amonts** (point mort ← charges fixes + coût de revient), sa **règle gelée en une ligne**
(celle de la vague qui l'a établie), et ses **suites de tests**.

### Le moteur
- `_figAval` : l'aval transitif — toucher `charges` périme charges fixes → point mort ET CA
  encaissé → revenu horaire, mais PAS le stock par parfum (B1/B2 : l'aval est précis, pas « tout
  est lié à tout »).
- `_figSuitesPour` : l'union exacte des suites à relancer, triée, dédupliquée, existante.
- **`node tests/quoi-retester.js charges kv:sm_settings [--run]`** : la moitié « compilo » de la
  promesse — répond « voici les chiffres périmés, voici les suites », et les lance avec `--run`.
  Une source inconnue de la carte est DITE (trou possible), jamais avalée.

### Au commit, jamais au hasard
Le flush d'audit (v1372) est le seul moment honnête pour dire « ces sources ont changé » : il
signale la carte (`_figSignale`), les écritures kv **par clé**, et émet `sm-figures-perimees`.
**Non-but déclaré et testé (E3)** : AUCUN re-rendu automatique — recharger un écran sous les doigts
de Ben (modale ouverte, saisie en cours) créerait des régressions pires que le mal. Le rail est
posé ; les écrans s'y brancheront quand chacun aura sa preuve. Après une restauration, TOUT est
signalé périmé, une fois.

### Visible pour Ben
**Sauvegarde & sécurité → 🕸 Carte des chiffres** : chaque chiffre, ses sources en clair
(« réglage sm_recurringCharges », « table orders »), ce qu'il alimente, sa règle, ses protections —
et un badge « données modifiées depuis l'ouverture » sur ce qui est périmé.

### Le ratchet des angles morts (A7)
EXACTEMENT une figure sans suite dédiée aujourd'hui : la **sérénité** — déclarée, pas oubliée.
Ajouter demain une figure sans test sans toucher ce compte fait échouer la suite : l'angle mort
restera un CHOIX conscient.

### Suite v1374 : 23 assertions (80 suites au total — 1779 assertions, toutes vertes)
Preuves par réintroduction : cycle injecté détecté et nommé (D1) ; figure fantôme attrapée sur ses
trois mensonges — fonction, amont, suite (D2). Le commit prévient la carte, sources dédupliquées
(G3b, ajouté à la suite v1372).

### Angles morts déclarés
- La sérénité n'a pas de suite dédiée (A7 la tient à l'œil).
- La carte déclare les dépendances de PREMIER ordre vérifiables ; les lectures indirectes profondes
  (ex. un écran qui pioche ad hoc) ne sont pas toutes cartographiées — la carte grandira vague
  par vague, gardes à l'appui.
- L'événement `sm-figures-perimees` n'a pas encore de consommateur d'écran : rail posé, branchement
  à prouver écran par écran.

---

## 2026-07-17 — MISE EN BOÎTE 1/2 : deux bugs d'étiquettes (audit du flux)  (v1374 → **v1375**)

Audit demandé par Ben du flux de mise en boîte, avant remaniement. Deux bugs trouvés en lisant le code.

### BUG#2 (critique) — les quantités saisies étaient ignorées à la génération
Dans « Étiquettes groupées », `lbGenerate` lisait `document.getElementById('lbcopies_'+id)` et
`'lbpieces_'+id` — des identifiants qui **n'existent dans AUCUN élément** (les champs rendus par
`lbRenderLignes` n'ont pas d'`id` ; les saisies vivent dans le modèle `_lbLignes` via `lbSetLigne`).
Conséquence exacte décrite par Ben : `getElementById` → null → `+undefined||1` force **copies=1**, et
`nbPieces` reste **null** → en aval `buildLabelsPDF` ne pose pas l'override et retombe sur la quantité
du lot (« l'ancienne valeur en dur »). Tout ce que Ben tapait était perdu.
> **RÈGLE GRAVÉE (v1375) : L'ÉCRAN ET LE GÉNÉRATEUR LISENT LE MÊME MODÈLE.** Un bouton qui relit le
> DOM par des `id` hérités d'une version antérieure du balisage produit un troisième chiffre (v1339 /
> v1374 : le lecteur et le modèle ne divergent jamais). FIX : `lbGenerate` lit `_lbLignes` (comme le
> rangement) et imprime dès `copies>0` — ce qui **honore aussi plusieurs boîtes par lot** (3×20 + 1×12),
> que l'écran laissait déjà saisir mais que le générateur écrasait. Preuve à DOM vide (A7) : le
> résultat n'est plus le profil dégénéré de l'ancien bug.

Nuance corrigée en cours de route : filtrer sur `lbTotalLigne>0` excluait les lignes « pièces = auto »
(pièces null → total 0), pourtant imprimables avec la quantité du lot. Le bon critère d'impression est
« au moins une étiquette » (copies>0) ; le rangement, lui, garde `lbTotalLigne>0` (on ne range pas une
quantité inconnue). Même modèle, critères d'inclusion propres à chaque usage.

### BUG#1 — l'étiquette générée mais « aucun menu » pour l'imprimer/enregistrer
Depuis Stock par parfum → « Étiquettes (boîtes) », `_etiqValiderGo` faisait `closeModal()` puis
`_etiqResultats()` (ré-ouverture). Or `closeModal` appelle `history.back()`, dont le `popstate`
**différé** se déclenche après la ré-ouverture et referme le modal de résultats. Ben voyait le toast
de validation, mais le menu Imprimer/Enregistrer disparaissait.
> **RÈGLE GRAVÉE (v1375) : on ne ferme-puis-rouvre JAMAIS un modal à travers un saut async** (cousin
> direct de v1363 : on n'empile pas les modals). FIX : `_etiqValiderGo` ne ferme plus avant les
> résultats ; `_etiqResultats` REMPLACE le contenu du modal EN PLACE quand il est déjà ouvert.

### Suite v1375 : 17 assertions (81 suites au total, toutes vertes)
Preuve comportementale du BUG#2 à DOM vide (le vrai `lbGenerate` assemblé avec le vrai `lbTotalLigne`),
+ gardes statiques du BUG#1 (plus de closeModal avant résultats, remplacement en place). NB : la
confirmation en conditions réelles (caméra/partage iOS) reste à faire sur l'appareil de Ben — le
harnais node ne rejoue pas le DOM.

### Angle mort déclaré
Les correctifs de contrôle de flux d'un modal async sont vérifiés par gardes statiques (le harnais ne
lance pas de navigateur). La règle « même modèle » (BUG#2), elle, est prouvée comportementalement.

---

## 2026-07-17 — MISE EN BOÎTE 2/2 : fusion de deux boîtes du même lot  (v1375 → **v1376**)

**Besoin (Ben)** : un même lot est souvent réparti en plusieurs boîtes ; quand les stocks baissent, il
veut les RAPPROCHER facilement, sans jamais perdre la traçabilité.

**Décision métier de Ben, gravée** : on ne fusionne QUE deux boîtes du **même parfum ET du même lot**.
> « Le mélange de lot ou de boîte fait perdre la traçabilité physique. » Toute autre combinaison est
> REFUSÉE. Le garde-fou vise le MOTIF, pas le cas — prouvé par réintroduction (lots différents, parfums
> différents, stades différents, déclassé, même boîte, non-boîte, boîtes vides : 8 refus testés).

### « Même lot » = identité physique, pas devinette
Une boîte est une ligne `productions` issue de `prodPreparerBoites`, qui porte `etiquetteDe` = l'id du
LOT PARENT. Deux boîtes du même lot partagent donc ce champ (leur `lotProduction` diffère par le suffixe
-B1/-B2). C'est le signal retenu, corroboré par `recipeId` + `composant` + `degDeclasse`.

### Ce qu'on préserve à la fusion
- **Quantité** : somme des restes ET des quantités produites/réelles → l'invariant *produit − consommé
  = reste* reste intact (D4).
- **DLC** : la plus COURTE des deux (la plus prudente) — deux boîtes à des températures différentes
  peuvent porter des DLC différentes.
- **Traçabilité** : la boîte gardée conserve `etiquetteDe` et `assembleFrom` ; la boîte absorbée est
  consignée dans `fusionHisto` (id, lot, quantité, DLC, horodatage) — et fusionner à nouveau EMPILE
  l'historique (D8). Plus une entrée d'audit dédiée « fusion-boite » (lisible), en sus des écritures
  auto journalisées par les hooks v1372.
- **Sécurité** : `snapshotBackup('avant-fusion-boites')` AVANT l'opération (elle supprime une boîte),
  et mise à jour + suppression dans UNE transaction (tout ou rien).

### Deux modes (comme demandé)
- **Sélection manuelle** : liste des lots ayant ≥2 boîtes ; on coche exactement deux boîtes d'un même
  lot (même lot GARANTI par le groupe `etiquetteDe`) → confirmation → fusion.
- **Flash QR** : scan de la 1ʳᵉ boîte (réutilise `openScanner`/`_extractLot`), puis la 2ᵉ (scan ou tap
  dans la liste du même lot). Un QR qui n'est pas une boîte issue d'un lot est refusé dès le scan.
Entrée : bouton « 🔀 Fusionner des boîtes » sur l'écran Stock par parfum. Confirmation qui prévient si
les emplacements ou les DLC diffèrent.

### Suite v1376 : 35 assertions (82 suites au total, toutes vertes)
Validation pure (accepte le sain, refuse tout le reste avec motif), DLC la plus courte, calcul de fusion
(somme, invariant, historique empilé), et câblage (re-validation en profondeur, transaction, audit
dédié, sélection à exactement 2, entrée écran, mode QR).

### Limite déclarée
Fusionner la boîte-fille d'une boîte déjà fusionnée (scission d'une boîte) sort de « même lot » au sens
`etiquetteDe` et est refusée — volontaire : au-delà d'un niveau, la provenance physique n'est plus
univoque.

---

## 2026-07-17 — DEVIS ↔ COMMANDE : rebascule réparée + devis périmé/régénération  (v1376 → **v1377**)

Signalé par Ben (après vérification de l'état du code avant toute modif) : un devis accepté passe en
commande ; modifier la commande ne met pas le devis à jour ; et **repasser la commande en devis
affiche une erreur** (« impossible après acceptation »). Diagnostic d'abord, correctif ensuite.

### BUG ① — la rebascule commande→devis plantait (zone morte temporelle)
`cmdToDevisConfirm` contenait `const today = today();`. Le `const today` (portée bloc) **masque** la
fonction globale `today()` et l'appelle **avant son initialisation** → `ReferenceError: Cannot access
'today' before initialization`. Reproduit à l'identique en isolé. Le `catch` affichait le message
générique « Erreur pendant la transformation en devis ». Les garde-fous amont (paiement, batch,
emballage) bloquaient déjà les cas non convertibles ; une commande **propre** (devis accepté par
erreur, sans paiement — le cas de Ben) passait les gardes puis plantait sur la zone morte.
> **FIX** : renommer la variable (`const auj = today();`) pour que l'appel vise la fonction globale.
> L'oubli était ISOLÉ : les 3 autres `o.date||today()` du fichier gardent leurs parenthèses (corrects).
> Prouvé par reproduction (A1) + garde anti-réintroduction (A2).

### FEATURE ③ — le devis ne suivait pas la commande : périmé + régénérer + envoyer
Décision métier de Ben : **marquer le devis périmé** (pas le synchroniser en douce), pouvoir le
**régénérer** depuis la commande, puis **proposer l'envoi au client**. Un devis accepté est une copie
figée de l'offre ; on ne le réécrit jamais silencieusement.
- `_devisPerime(devis, order)` (PURE) : vrai si lignes ou montant divergent (`money2` lisse les
  centimes). Base de comparaison identique à l'acceptation (qui copie `lignes`/`montant` du devis) →
  **aucune fausse alerte** tant que Ben n'a rien changé (v1370).
- `saveCmd` (édition de commande) **pose ou lève** le drapeau `perimeCommande` sur le(s) devis liés —
  jamais le contenu du document, juste le signal.
- L'écran document affiche, pour un devis converti mais divergent, un bandeau « ce devis ne correspond
  plus à la commande » + bouton **🔄 Régénérer depuis la commande**. Un devis à jour garde son simple
  « ✓ Converti en commande ».
- `devisRegenererDepuisCommande(dvId)` recopie le contenu ACTUEL de la commande dans le devis (mêmes
  numéro et statut « accepté »), lève le drapeau, puis **propose l'envoi** (« Visualiser & envoyer »
  via `genererDevisDoc`, réutilisant le canal d'envoi existant). N'écrit QUE le document.

### Suite v1377 : 22 assertions (83 suites au total, toutes vertes)
Reproduction de la zone morte (A1) + antipattern banni (A2) ; `_devisPerime` comportemental (identique
→ pas périmé, montant/ligne changés → périmé, centime sous l'arrondi ignoré) ; régénération (recopie
commande, lève le drapeau, propose l'envoi, ne touche pas la commande) ; câblage saveCmd + bandeau.

### Angle mort déclaré
La comparaison de péremption porte sur `lignes` + `montant`. Un changement de livraison/remise SANS
impact sur le montant total ne lève pas le drapeau — assumé : le montant est le signal fiable de
divergence d'offre. La régénération, elle, recopie tous ces champs annexes.

---

## 2026-07-17 — ATELIER : le rappel de pesée ne s'ouvre plus sur les deux étapes meringue  (v1377 → **v1378**)

**Demande de Ben** : pendant une production, la fiche de pesée (grammages des ingrédients) s'auto-ouvre
au lancement d'une étape de pesée dans l'atelier. Il veut la **retirer pour exactement deux étapes** —
« Pesée des ingrédients meringue » et « Pesée de la meringue pour division » — et la **garder pour le
tant pour tant ». À ces deux étapes les ingrédients sont déjà pesés : le rappel est du bruit.

### Diagnostic préalable (avant toute modif)
Deux rappels coexistent : (A) la fiche recette complète, auto-ouverte à chaque lancement de batch
(`lancerBatchAvecFiche`, « TOUJOURS ») ; (B) la fiche de pesée, auto-ouverte au lancement d'une étape
de pesée (`atLaunch` → `atFichePesee`). Table des déclencheurs actuels de (B), vérifiée : tant pour
tant → oui ; ingrédients meringue → oui ; meringue pour division → oui ; ingrédients (générique),
macaronnage, cuisson, garnissage → non. Ben visait le rappel **B**.

### Le changement — on sépare la POLITIQUE de l'IDENTIFICATEUR
`_atPeseeKind(label)` gardait un double rôle implicite : nommer le type de pesée ET décider de
l'auto-ouverture. On introduit `_atRappelPesee(label)` (PURE) qui porte la **politique** d'ouverture :
elle ne renvoie que `'tpt'`, sinon `null`. `atLaunch` décide désormais via `_atRappelPesee`.
> **Pourquoi ne pas juste retirer la branche meringue de `_atPeseeKind` ?** Parce que retirer un
> rappel ne doit pas faire MENTIR l'identificateur : `_atPeseeKind` doit continuer à reconnaître une
> pesée meringue (C1) pour tout usage futur. On coupe la décision, pas la connaissance.

### Suite v1378 : 11 assertions (84 suites au total, toutes vertes)
La demande au mot (A1/A2 : les deux étapes meringue ne rappellent plus ; A3 : le tant pour tant si) ;
rien d'autre n'a bougé (B) ; l'identificateur `_atPeseeKind` est intact (C) ; le câblage passe par la
politique et bannit le retour de `'meringue'` (D3, garde anti-réintroduction).

### Non touché (déclaré)
Le rappel (A) — fiche recette complète au lancement de batch — reste inchangé : Ben visait
explicitement le rappel B. Les grammages meringue restent consultables via cette fiche complète.

---

## 2026-07-17 — MERINGUE COMMUNE : la base couvre enfin le TOTAL annoncé  (v1378 → **v1379**)

**Le bug, attrapé par Ben en pleine préparation (captures à l'appui)** : Cannelle noisette (60 mac.
standard) + Madeleine (17 mac. grand format) → l'app annonçait « Meringue à réaliser : **239 coques
std éq.** » mais les grammages de la « Base commune » ne couvraient que les **120 coques** de la
Cannelle. Preuve dans ses captures : en passant la Madeleine de 24 à 17 macarons, le total bougeait
(288 → 239) et **pas un gramme ne changeait**. La Madeleine, sans ingrédient coque étiqueté, pesait
ZÉRO dans la base. Pesée telle quelle : une **demi-meringue**, et on tombe court en pleine
production. « Heureusement que j'ai fait attention. »
> Un total qui n'est pas la somme de son détail est un TROISIÈME CHIFFRE (v1339) — ici en version
> silencieuse : l'app omettait un parfum entier sans le dire.

### Le modèle, tranché par Ben (« A »)
Les grands formats sont convertis en **équivalent-coque standard** (1 coque GF = 3,5 std ; 17 mac. GF
= 34 coques GF = 119 std éq.) et la meringue est **mutualisée sur ce total**. La base commune se
dimensionne donc sur `eqTotal` (239), pas sur les seuls parfums porteurs (120). Le tant pour tant
ET les **ajouts propres** (noisettes du Piémont, colorants…) restent PAR PARFUM — l'ancien code
fondait les noisettes de la Cannelle dans la « base commune », donc les « mutualisait » avec la
Madeleine : rendues à leur parfum (`_natureCoque` : 'tpt' / 'base' / 'ajout').

### UN moteur, TROIS surfaces
`_meringueCommuneCalc(parfums, dispOf, matName)` (PURE) calcule : eqTotal, eqPorteurs,
`facteurBase = eqTotal/eqPorteurs`, la base mise à l'échelle, le détail par parfum, et
`baseDetectee`. Les trois surfaces qui affichaient chacune leur propre somme — **aperçu du
formulaire** (`prodDuoApercu`), **fiche de production** (`ficheMeringueProduction`), **fiche de
pesée** (`atFichePesee`) — passent toutes par lui : deux calculs pour la même meringue seraient deux
vérités (v1331). Le motif fautif (`aggCommun`) est éradiqué et sa réintroduction testée.

### Dit à l'écran, jamais implicite
- La base affiche « **dimensionnée pour N coques std éq.** (mutualisée, grands formats convertis) ».
- AUCUN parfum porteur → **⛔ « ne pèse pas cette fiche »** en rouge (jamais une fiche vide pesable).
- Un parfum sans rien en propre : « partage la base commune » (fini le trompeur « pas de tant pour
  tant étiqueté » seul).

### Corrigé à la racine au passage : la ligature œ
`_isBaseMeringue` ne reconnaissait pas « Blancs d'**œ**ufs » : NFD ne décompose PAS les ligatures
(œ ≠ oe). Le normaliseur (`_aiNormalizeRaw`) décompose désormais œ→oe et æ→ae — ce qui répare aussi
le copilote (« oeuf » tapé trouve « œuf »). L'agrégat complet (copilote et vocabulaire compris)
reste vert après le changement.

### Suite v1379 : 27 assertions (85 suites au total, toutes vertes)
Le cas EXACT des captures (239 = 120 + 119, facteur ×1,99, eau 195,64 → 389,65 g), l'invariant
« grammes de base par coque identiques avec ou sans la Madeleine » (B5), le bug rejoué (C1/C2 :
l'ancienne fiche donnait ~50 % de la base requise), les noisettes rendues au parfum (B6), le cas
courant 2 standards → facteur exactement 1, **pas un gramme ne bouge** (D3, v1370), et le câblage
(3 appels, `aggCommun` banni, messages d'écran).

### Angle mort déclaré
La classification base/tpt/ajout repose sur les NOMS de matières (regex sur blancs/eau/sucre
semoule…). Une matière de base nommée hors de ces motifs serait classée « ajout propre » — visible à
l'écran (elle apparaîtrait sous le parfum), pas silencieuse, mais à surveiller si Ben renomme ses
matières.

---

## 2026-07-17 — JOURNAL DE L'ATELIER : le parfum se corrige TÂCHE PAR TÂCHE  (v1379 → **v1380**)

**Demandes de Ben** : (1) dans le journal de l'atelier chrono, pouvoir changer le parfum associé à
UNE tâche — et le temps par parfum doit s'adapter ; (2) voir en en-tête de chaque session les
parfums fabriqués à cette occasion.

### État vérifié avant modification
Le bouton « 🎯 Parfums » existant travaille au niveau SESSION : il applique la même liste de recettes
à TOUTES les tâches (`prodSessParfumsSave`). Aucune édition par tâche n'existait. Point décisif : les
moteurs de temps (`prodSessTempsParRecette`, `_tempsDecompoParParfum`) relisent `t.parfums` À CHAQUE
calcul — le recalcul demandé vient donc TOUT SEUL dès que la réattribution est persistée. Prouvé,
pas supposé (suite v1380, partie C : avant/après sur le VRAI moteur).

### Ce qui est livré
- **En-tête** : chaque carte du journal affiche « 🎨 parfum1 · parfum2 » — les parfums distincts de
  la session, dans l'ordre de première apparition des tâches (`_sessParfumsDistincts`, PURE). Une
  session sans parfums le DIT (« parfums non rattachés — utilise 🎯 ou 🖊 »), jamais un vide muet.
- **🖊 Par tâche** (nouveau bouton par carte) : liste des tâches (libellé, durée, parfums, badge
  « mutualisée ») → tap → éditeur à cases (parfums de la session en tête, puis toutes les recettes) →
  Enregistrer. `_prodTacheParfumsApplique` (PURE) assainit (dédoublonnage, ids valides), permet la
  liste VIDE (détacher une tâche : vaisselle, rangement → temps commun, règle v1310), et marque la
  session `parfumsConfirmes` + `parfumsParTache`. Persistance via `prodSessUpsert` (cache + Dexie).
  Transitions liste ↔ éditeur EN PLACE (`_prodModalSwap`, règle v1375).
- **Garde anti-écrasement** : le flux SESSION (🎯) écrase toutes les tâches — s'il existe des
  corrections par tâche (`parfumsParTache`), il DEMANDE avant d'écraser, et s'il écrase, le drapeau
  tombe (l'état dit toujours la vérité).

### La preuve centrale (partie C)
Fixture à 3 tâches sans chevauchement : AVANT, Cannelle 18 min / Madeleine 2 min. Réattribution de la
ganache (6 min) → APRÈS, Cannelle 12 / Madeleine 8 — **le total distribué est identique à la
milliseconde : on déplace du temps, on n'en invente pas** (v1339). Détachée → ses minutes deviennent
du temps COMMUN partagé à parts égales (règle v1310 de Ben, rien ne s'évapore — C4/C4b). Rattachée
aux deux → partage 50/50 (C5).

### La garde v1357 a fait son travail sur MOI
Ma première version échappait une apostrophe à la main (`replace(/'/g,'')`) dans un onclick — la
garde « escJs() est le SEUL chemin » a mis l'agrégat au rouge. Corrigé via `escJs`. (Et au passage :
une chaîne `grep && python` avait avalé le correctif en silence — le correctif n'était PAS appliqué
alors que je le croyais ; seule la suite l'a révélé. C'est exactement pour ça qu'elle existe.)

### Suite v1380 : 22 assertions (86 suites au total, toutes vertes)

### Angle mort déclaré
L'éditeur par tâche modifie les PARFUMS d'une tâche, pas ses bornes temporelles (start/fin) — hors
périmètre de la demande. Le libellé d'une tâche n'est pas éditable ici non plus.

---

## 2026-07-18 — LE MOTEUR : dexie.min.js ne tenait pas le contrat — un mois de protections mortes  (v1380 → **v1381**)

**La découverte, grâce à Ben** : il a partagé le `dexie.min.js` qui tourne en prod depuis un mois —
une **micro-implémentation autonome**, pas la vraie librairie Dexie. Ce fichier n'a jamais voyagé
dans les zips (ni dans le V1370.zip reçu, ni dans mes livraisons) : je concevais contre l'API Dexie
standard **sans jamais avoir vu le runtime réel**. C'est MA faute de méthode : j'aurais dû exiger de
voir le moteur avant de bâtir dessus.

### L'étendue réelle des dégâts (vérifiée ligne par ligne, pas supposée)
- 🔴 **`bulkPut`/`bulkDelete` absents** → CHAQUE flush du stockage unifié kv échouait depuis un
  mois. La table `kv` est restée **vide en permanence** : compteur légal de factures, modèles de
  pyramides, journal du copilote — jamais recopiés en base, chaque sauvegarde embarquait un kv vide.
  (La bannière « la copie durable a échoué N fois » prévue en v1372 était le seul témoin.)
- 🔴 **`table.hook()` et `db.tables` absents** → `auditInstalle()` et `valideInstalle()` plantaient
  à leur première ligne au boot, erreur avalée (console). **Le journal d'audit et la validation à
  l'entrée n'ont JAMAIS tourné.** Le « 0 refus, 0 suspects » de l'écran voulait dire « le contrôle
  n'a jamais démarré », pas « tes données sont propres ».
- 🟡 `primaryKeys` absent (latent : la rétention du journal aurait planté au premier surplus) ;
  `between`/`anyOf` absents (les fenêtres de dates tournaient sur leurs replis try/catch) ;
  `db.close/open` absents (chemin de réparation « base bloquée » inopérant) ; `Dexie.ignoreTransaction`
  absent (repli setTimeout OK).
- 🟢 **Aucune perte ni corruption de données** : fusion de boîtes, devis périmé, parfum par tâche
  écrivent en direct — fonctionnels. Seule leur trace d'audit manquait.

### Pourquoi mes tests étaient verts pendant que la prod était morte
Mes harnais fournissaient eux-mêmes des `db` factices AVEC `hook()` : ils prouvaient la **logique**,
jamais son **exécution réelle**.
> **RÈGLE GRAVÉE (v1381) : UN TEST QUI FOURNIT LUI-MÊME L'API QU'IL PRÉTEND VÉRIFIER NE VÉRIFIE
> RIEN.** Le contrat entre deux couches se prouve en faisant tourner LES DEUX vraies couches.

### Le correctif — le contrat est tenu PAR LE MOTEUR, zéro changement à app.js
`dexie.min.js` (381 lignes) implémente désormais, à la sémantique Dexie : `table.hook('creating'/
'updating'/'deleting')` (multi-abonnés dans l'ordre d'abonnement ; `this.onsuccess(id)` pour les clés
auto ; **lever une exception AVORTE l'opération et sa transaction** — le refus de validation est
réel) ; enveloppe de transaction avec `.on('complete'|'abort')` (une par transaction IDB : le tampon
d'audit d'une transaction explicite se partage et flushe UNE fois au commit) ; `put` = upsert qui
déclenche creating OU updating ; `bulkPut`/`bulkDelete` ; `Collection.primaryKeys` ; `where().between/
anyOf` ; `db.tables` ; `db.on('blocked')` (émis sur `onblocked`) ; `db.close()/open()` ;
`Dexie.ignoreTransaction` (report en macrotâche — divergence assumée et suffisante : l'appelant
n'attend pas le résultat). **Divergences déclarées en tête de fichier** (clear() sans hooks ligne à
ligne — les seuls clear massifs sont les restaurations, hooks suspendus de toute façon).

### La nouvelle classe de preuve : le VRAI fichier, sous node
`tests/_faux-idb.js` : un IndexedDB minimal en mémoire (Map + microtâches, commit en macrotâche,
**rollback d'abort par instantané**) + chargement du **fichier `dexie.min.js` livré** via `vm` —
jamais une copie. L'IDB factice ne fournit AUCUNE des API manquantes : si le moteur ne les implémente
pas, la suite est rouge.

### Suite v1381 : 28 assertions (87 suites, toutes vertes)
La surface (A) ; le flux kv mort rejoué et vivant (B) ; la sémantique des hooks, refus avortant
compris (C4-C6 : la promesse v1373 enfin réelle) ; le tampon au commit (D) ; **l'atomicité tout-ou-
rien d'une transaction explicite avec refus au milieu — rollback prouvé** (E1, la promesse v1376) ;
ignoreTransaction depuis un hook (F) ; le VRAI `_auditPrune` sur le vrai moteur (G) ; et le
**bout-en-bout intégral** (H) : `valideInstalle` + `auditInstalle` extraits d'app.js, installés sur
le vrai moteur — montant en chaîne refusé par `ValidationRefusee`, rien en base, « rejet » au
journal, toast ; charge saine écrite, « création » journalisée avec sa clé, modification tracée
avant→après. Le chemin de prod mort un mois, prouvé vivant.

### Livraison
**`dexie.min.js` fait désormais partie de chaque zip** — le moteur voyage avec l'app qu'il porte.
Le service worker le précachait déjà (`./dexie.min.js`) : le bump de cache (v414) forcera son
rechargement.

### À vérifier par Ben après déploiement
Écran Sauvegarde & sécurité : le compteur kv doit passer de 0 aux ~18 clés métier dès le premier
démarrage (réconciliation « semer »), et le journal des écritures doit commencer à se remplir.

---

## 2026-07-19 — CARNET DES TRAJETS : distance et temps repris de tes livraisons  (v1381 → **v1382**)

**Demande de Ben** : « configurer l'adresse du client par rapport à mon lieu de départ (labo) pour
calculer en automatique le temps de route et la distance ».

### La décision, prise par Ben
Trois options lui ont été présentées avec leurs contreparties : (A) estimation hors-ligne calibrée,
(B) service de routage en ligne, (C) mémoire par adresse — 1re fois à la main, ensuite auto.
**Ben a choisi C.** C'est le seul des trois qui ne FABRIQUE aucun chiffre : ce que l'app ressort est
une mesure de Ben. Décisif, parce que ces nombres entrent dans `computeDeliveryCost` (carburant +
coût du temps) donc dans la rentabilité et les marges — une distance estimée qui s'y glisserait
serait un troisième chiffre (v1339). Écarté avec A : une clé d'API sur GitHub Pages est publique, et
l'app est 100 % hors-ligne.

### L'état trouvé avant de toucher (vérifié, pas supposé)
Un carnet d'adresses existait déjà (`settings.addressBook` : libellé, km, min) et son
pré-remplissage **fonctionnait** (`acPickBook`). Mais c'était une **île** :
- un seul écrivain, le formulaire manuel — les livraisons déjà chiffrées dans les commandes
  (`lieuLivraison` + `distanceKm` + `tempsLivraisonMin`) ne l'alimentaient **jamais** : Ben aurait dû
  tout ressaisir, alors que sa « 1re fois à la main » était déjà faite, des dizaines de fois ;
- choisir un **client** connu ne proposait rien (`cmdSuggestClientAddress` remplit l'adresse, pas le
  trajet) ;
- le pré-remplissage n'avait lieu **que** si Ben cliquait la ligne du carnet dans l'autocomplétion —
  une adresse tapée, ou pré-remplie depuis la fiche client, ne déclenchait rien ;
- surtout : le carnet ne disait **jamais depuis quel point de départ** les distances étaient
  mesurées. Un déménagement de labo les rendait toutes fausses en silence.

### Ce qui est livré
1. **Le point de départ** est enfin un réglage (`adresseLabo`), **horodaté** (`adresseLaboDepuis`).
   Les trajets mesurés avant un changement sont **signalés**, jamais purgés — Ben décide.
2. **Le carnet apprend de ses propres commandes** (`_carnetTrajets`, PURE) : regroupement par
   adresse et **médiane**, choisie contre la moyenne parce qu'un unique trajet pris dans les
   bouchons ne doit pas devenir la norme (B1/B2 : 15/22/14 → 15 min, pas 17).
3. **Proposition par client** (`_trajetParClient`) quand l'adresse est nouvelle mais le client déjà
   livré — le trou le plus courant de l'ancien code. Et sur une adresse **tapée**, plus seulement
   cliquée.
4. **Rien n'est jamais écrasé** : deux champs vides → pré-remplissage **annoncé** ; un champ déjà
   rempli → simple proposition avec bouton *Appliquer*. L'origine du chiffre est **toujours** dite
   (« d'après 3 livraisons chez ce client »), et la fourchette observée affichée quand elle varie.
5. **Divergence carnet ↔ réalité** (> 15 %) : remontée à l'écran avec les deux chiffres, jamais
   arbitrée en douce.
6. **L'ancien écran devient un alias** : il rendait sa propre liste sans le point de départ ni les
   trajets appris, et les retours après ajout/suppression y ramenaient Ben — deux écrans pour la
   même chose, c'est deux vérités (v1331). Il n'en reste qu'un (F10).

### L'appariement des adresses, volontairement conservateur
`_trajetCle` neutralise casse, accents, ponctuation et espaces multiples — **rien d'autre**. Aucun
rapprochement « intelligent » : le 12 et le 14 de la même rue restent deux trajets (A3).
> Rater une correspondance ne coûte qu'une saisie ; en inventer une injecte la distance d'un autre
> client dans un calcul d'argent.

### Suite v1382 : 38 assertions (88 suites, toutes vertes)
L'appariement (A) ; la médiane contre la moyenne (B) ; **C3, la preuve centrale — chaque chiffre
proposé existe tel quel dans une commande réelle** ; le signalement après changement de labo (D) ;
la priorité carnet > adresse > client, la divergence remontée, le silence quand rien n'est connu
(E4 : l'app se tait plutôt que d'inventer) ; le câblage complet (F) ; et **G, le non-but** : aucun
calcul géographique, aucune vitesse moyenne, aucun facteur d'allongement, aucun appel de routage —
le choix de Ben est tenu par le code, pas seulement par l'intention.

### Angle mort déclaré
Les marchés gardent leurs propres `distanceKm`/`tempsRouteMin` (écran marché) : ils ne sont ni
alimentés ni alimentés par ce carnet. Hors périmètre de la demande, à traiter si Ben le souhaite.

---

## v1392 — Résumé d'assemblage : coques mono-couleur nommées et comptées juste

Vu par Ben en atelier (capture « Citron crémeux », coques Jaune + Jaune) : le résumé
d'assemblage affichait « (9 coques de chaque couleur) » pour un macaron **mono-couleur**.
Faux deux fois : le mot « couleur » n'a pas de sens à une seule couleur, et 9 macarons =
**18 coques** (2 par macaron), pas 9. Attendu : « (18 coques jaunes) ».

Le compte était en fait déjà bon dans `coquesNeeded` (= assemblable × 2) ; il manquait le
**nom de couleur accordé**. La branche mono passe de `(N coques)` à
`(N coques <couleur>s)` via le helper `pluralCouleur()`. Branche bi **inchangée**.

`pluralCouleur()` accorde les deux premiers mots, saute ceux finissant déjà par s/x :
« Jaune » → « jaunes », « Marron foncé » → « marrons foncés », « Rouge bourgogne » →
« rouges bourgognes ».

### Suite v1392 : 9 assertions
Garde statique (branche bi conserve « de chaque couleur » ; branche mono nomme la couleur
et compte `coquesNeeded`, pas `assemblable`) + comportemental sur `pluralCouleur`.

---

## v1393 — Conseil marge par parfum : recommander seulement quand les données le permettent

Demande de Ben (prompt « Decision Council ») : un conseil tarifaire qui ne remplit jamais
les vides. Contrainte majeure : **aucun historique de prix daté** n'est enregistré →
l'**élasticité est incalculable**. Le conseil raisonne donc sur la **marge mesurée**, jamais
sur la réaction de la demande, et le déclare.

`conseilMargeParfum(analysis, settings, data)` est une couche d'**interprétation** : elle lit
`tauxMarge` / `coutRevientUnit` / pièces déjà produits par `analyzeFlavorProfitability` et **ne
recalcule rien** (règle gelée : le raisonnement route, il ne calcule pas).

### Ce que le code tient
- **Jauge de confiance** sur la seule variable disponible (pièces vendues) : reco **FERME**
  seulement au-delà de 50 pièces ; en-dessous → « à confirmer », jamais ferme. C'est la parade
  exacte à l'objection « échantillon trop mince » du procureur.
- **À perte** traité à part (corriger en priorité), pas comme une simple hausse.
- **Le procureur** produit des objections **fondées sur la ligne** : dons qui gonflent le
  volume, écart prix encaissé/attendu (remises/formats), coût de revient possiblement périmé
  si la matière a bougé (`flavorCostHikeAlerts`).
- **« Ce que ce conseil ignore »** nomme toujours l'élasticité incalculable — honnêteté
  structurelle affichée à l'écran `rentaparfum`.

### Piège d'extraction évité (règle du projet)
La 1ʳᵉ version contenait `/pièce` juste après une interpolation `${…}` dans un template : le
stripper de `_extract.js` le prenait pour un début de regex et sur-lisait 122 000 caractères,
masquant un test. Reformulé « par pièce ». L'app tournait, mais le motif était un piège latent.

### Suite v1393 : 20 assertions
Confiance (ferme > 50 pièces ; jamais ferme < 50 à écart de marge égal) ; à perte distinct ;
au-dessus du seuil absent ; procureur (échantillon, dons, écart, coût périmé) ; non-recalcul.
`run-all.js` complété des suites v1389→v1393 qui manquaient à l'appel. Agrégat entièrement vert.

---

## 2026-08-02 — LA COURSE AU DÉMARRAGE : CHIFFRES AU LIEU DES PARFUMS  (v1437 → **v1438**)

*(Ce journal n'a pas d'entrée entre v1393 et v1438 — les livraisons intermédiaires n'ont pas été
tracées ici. Hors périmètre de cette entrée.)*

**Signalé par Ben**, captures + rapport d'incident (écran Santé de l'app) à l'appui : au lancement,
certains batchs affichaient un numéro brut (« #1234 ») au lieu du nom du parfum ; en quittant l'app
et en la relançant, les numéros disparaissaient au profit des parfums. L'écran Productions plantait
parfois tout court (« Affichage indisponible »). Les deux symptômes partageaient la même erreur
IndexedDB dans le journal : « The transaction finished. » ou « The specified object store was not
found. ».

### Ce n'était pas un bug d'affichage
La cause vivait dans le **moteur** (`dexie.min.js`), pas dans l'écran. `_activeTx` (la transaction
IndexedDB « en cours ») est un **champ unique, partagé par toute l'instance Dexie** — pas propre à
chaque appel. Au démarrage, plusieurs opérations tournent concurremment (migrations, flush différé
du journal d'audit via `Dexie.ignoreTransaction`) : l'une d'elles pouvait hériter **par erreur** de
la transaction d'un AUTRE appel — déjà terminée, ou ne portant pas la table visée.

`atParfumsDispo()` avalait cette erreur (`db.recipes.toArray().catch(()=>[])`) → repli silencieux
sur une liste de recettes vide → chaque batch retombait sur `'#'+id`. Sur Productions, la même
erreur n'était pas rattrapée → écran en échec.

### Le fix
`Table._txStore()` vérifie désormais, avant de réutiliser la transaction partagée, qu'elle est
encore **vivante** (elle n'a pas déjà fini) ET qu'elle **porte bien la table demandée**. Si l'un des
deux manque, une transaction dédiée est ouverte au lieu de laisser planter. L'usage légitime
(plusieurs écritures dans le même appel `db.transaction()` explicite) continue de réutiliser la même
transaction — atomicité intacte. Zéro changement à `app.js`.

### Suite v1438 : 7 assertions (`tests/v1438-activeTx-course.test.js`)
Reproduit les deux messages d'erreur exacts du rapport d'incident (transaction étrangère /
transaction déjà finie) ; le symptôme applicatif précis (`recipes.toArray()` + repli `'#'+id`) ;
non-régression sur une transaction explicite multi-tables légitime. Preuve par réintroduction :
4 rouges contre le fichier non corrigé, sur ces mêmes cas.

**Angle mort déclaré** : le fix isole chaque opération contre une transaction morte/étrangère, mais
si deux `db.transaction()` explicites multi-tables tournent **vraiment** en concurrence,
l'atomicité de l'une pourrait se fractionner silencieusement en plusieurs petites transactions
séparées. Une vraie file d'attente de transactions serait le remède complet — hors périmètre de ce
correctif.

**Note d'outillage** : `tests/_faux-idb.js`/`_memidb.js` (le double IndexedDB officiel du projet)
n'étaient pas disponibles au moment d'écrire ce test ; `tests/_fakeidb.js` + `_loadDexie.js` en sont
un substitut minimal, à réconcilier avec le vrai harnais si Ben le retrouve.

---

## 2026-08-03 — LE BOUTON « ＋ LANCER UNE TÂCHE » N'OUVRAIT RIEN  (v1438 → **v1439**)

**Signalé par Ben**, capture du journal d'incident (écran Santé de l'app) à l'appui : clic sur le
bouton marron « ＋ Lancer une tâche » dans l'atelier complet → message d'erreur. Le journal montrait
« GLOBAL onerror @app.js:61626 — Can't find variable: prodTaskPicker », écran atelier.

### La cause
`prodBoardLaunch()`, le gestionnaire de ce bouton, appelait `prodTaskPicker()` — une fonction qui
n'existe **nulle part** dans `app.js`. Un commentaire, deux mille lignes plus haut, affirmait
qu'elle était « réutilisée » par le panneau chrono flottant : cette documentation **fausse** est
précisément ce qui a laissé le trou invisible à la relecture — personne ne cherche une fonction que
le code affirme déjà exister.

Le vrai sélecteur de tâche, depuis le passage à la « couche flottante » (v1364 : « sans ouvrir de
modale »), s'ouvre en posant `_atPicker = true` puis en redessinant le panneau — mécanisme déjà
utilisé et fonctionnel ailleurs, via `atTogglePicker()`, pour le bouton jumeau du panneau flottant.
`prodBoardLaunch()` n'avait simplement jamais été migré vers ce mécanisme.

### Le fix
`prodBoardLaunch()` ouvre désormais le même mécanisme réel (`_atPicker = true` + `prodRenderBoard()`
plutôt que de basculer, puisque ce bouton doit toujours OUVRIR, jamais refermer sous le clic). Le
commentaire fautif corrigé pour ne plus citer une fonction absente.

### Suite v1439 : 7 assertions (`tests/v1439-prodboard-launch.test.js`)
Garde statique anti-réintroduction (aucune définition `prodTaskPicker` nulle part dans `app.js`) ;
le corps réel de `prodBoardLaunch` ne la référence plus et pose bien `_atPicker`/appelle bien
`prodRenderBoard` ; comportement vérifié en isolation (le drapeau passe à `true`, le rendu est
appelé exactement une fois) ; preuve par réintroduction (l'ancien appel reproduit lève le
`ReferenceError` exact vu par Ben).

---

## 2026-08-03 — RÉPARÉ MAIS INVISIBLE  (v1439 → **v1440**)

Suite directe de la vague précédente. Une fois le plantage réparé, Ben a signalé : « maintenant le
bouton ne renvoie plus de message d'erreur, en revanche il ne fonctionne plus. Lorsque je clique
dessus plus rien ne se passe ».

### Le sélecteur s'ouvrait — mais nulle part où on pouvait le voir
Deux causes, cumulatives :
1. La liste de tâches s'affiche **après** les cartes de tâches en cours, dans le bloc suggestion —
   sans aucun mouvement à l'écran, un clic qui ouvre quelque chose hors du cadre visible est
   indiscernable d'un clic sans effet.
2. `_atPicker` n'est **jamais remis à `false` par un simple rechargement de vue** — seulement par un
   choix de tâche ou une fermeture explicite. Si le sélecteur était déjà ouvert d'un essai
   précédent, cliquer de nouveau sur « ＋ Lancer une tâche » ne changeait littéralement rien à
   l'écran : le rendu était identique avant/après.

### Le fix
`prodBoardLaunch()` **attend** désormais le rendu (elle est devenue `async`) puis fait défiler la
liste ouverte dans le cadre (`scrollIntoView`), avec repli sur le bloc suggestion si la liste est
vide. Le clic a maintenant un effet visible **à tous les coups**, que le sélecteur vienne de
s'ouvrir ou qu'il l'était déjà.

### Suite v1439 amendée : 14 assertions (`tests/v1439-prodboard-launch.test.js`)
Ajoutées à la suite du wave précédent : le défilement a bien lieu dans le cas normal (D) ; il a
**aussi** lieu quand `_atPicker` était déjà `true` avant le clic — le cas exact signalé par Ben (D2)
; repli sur `.pb-sugg` sans planter si `.at-list` est absent (D3) ; preuve par réintroduction du
symptôme précis de ce second rapport — la version v1439 seule (sans `scrollIntoView`) ne défile
jamais, même quand la liste existe (E2).

---

## 2026-08-03 — RAPPEL DE DIVISION BICOLORE  (v1440 → **v1441**)

**Demandé par Ben** :
> « Quand je lance une production bicolore le système ne me permet pas de faire la division de
> meringue, je suis obligé d'aller dans meringue mutualisée et de simuler 2 parfums différents afin
> d'avoir la possibilité de sélectionner mes deux couleurs. C'est le cas par exemple pour le parfum
> praliné qui doit produire des coques marrons et des coques blanches. »

### Ce qui existait déjà, et ce qui manquait
La couleur d'une recette bicolore (2 couleurs distinctes, ex. praliné = marron foncé + blanc) est
définie une fois pour toutes sur la fiche recette (`recCoqueColors`, `recEstBicolore`) et pilote
déjà correctement le sélecteur de second lot à l'**assemblage**. Ce qui manquait, c'est un rappel
au moment de la **production** : le formulaire de lancement, en mode « Batch complet » (le mode par
défaut, le plus emprunté), n'affichait **aucune** information de couleur. Le seul endroit qui en
montrait une était le mode « duo » (2-3 parfums, meringue commune) — conçu pour combiner des
recettes **différentes**, pas pour diviser la meringue d'une **seule** recette bicolore. D'où le
contournement de Ben : simuler un faux 2ᵉ parfum juste pour voir apparaître un sélecteur de
couleurs qui n'avait rien à faire là.

### La décision, prise par Ben
Deux questions posées avant de coder (le choix change complètement l'implémentation) :
1. **Un seul lot de coques** (comme aujourd'hui — rien ne change au modèle de données ni au stock),
   avec un rappel clair — plutôt que deux lots séparés et traçables individuellement.
2. **Toujours 50/50** — plutôt qu'un curseur de répartition ajustable.

### Le fix
Nouvelle fonction pure `_bicoloreRappelHtml(rec, nbMacarons)` : si la recette est bicolore, calcule
le nombre de coques de **chaque** couleur (toujours un entier exact — `COQUES_PAR_MACARON=2`
garantit un total pair) et rend un bandeau visuel. Branché à **deux** endroits :
- Le formulaire de lancement (`prodCompSwitch`/`prodUpdateCoqueHint`), désormais aussi en mode
  « Batch complet », pas seulement « Par composants → Coques ».
- La fiche de production (`ficheRecetteProduction`), **toujours** affichée après le lancement
  (`lancerBatchAvecFiche`, point 4) — l'endroit le plus sûr pour que Ben le voie, même s'il avait
  manqué la note du formulaire. Absente pour le composant « ganache » seul (pas de coques dedans).

Exemple affiché : « 🎨 Praliné est bicolore : divise ta meringue en 2 portions égales — 60 coques
marron foncé + 60 coques blanches. »

### Suite v1441 : 15 assertions (`tests/v1441-bicolore-rappel.test.js`)
Rappel présent et split exact 50/50 pour une recette bicolore (A) ; split toujours entier même à
quantité impaire de macarons (B) ; aucun rappel pour une recette monochrome (C) ou sans couleurs
renseignées, sans jamais planter (D) ; `prodCompSwitch` couvre désormais le mode complet, sans
régresser sur composant+coques (E) ; `ficheRecetteProduction` appelle bien le rappel, exclu pour
« ganache » seul (F) ; preuve par réintroduction — l'ancienne condition ne couvrait pas le mode
complet, exactement le trou signalé par Ben (G).

---

## 2026-08-03 — LA FICHE MERINGUE MUTUALISÉE, ACCESSIBLE À TOUT MOMENT  (v1441 → **v1442**)

**Demandé par Ben** :
> « Dans le cadre d'une meringue mutualisée je dois pouvoir accéder à [la] recette donnant la
> quantité totale de meringue mutualisée au même titre que le reste de la recette, c'est à dire
> indiquer de manière séparée mais sur la même vue le détail et poids des ingrédients qui suivent
> pour chaque recette (coques chocolat et praliné par exemple). Voici l'exemple : avoir ce visuel
> supplémentaire disponible à tout moment à l'intérieur de ce bouton-là présent en haut de la page
> fabrication. »

### Ce qui existait déjà, et ce qui manquait
Le calcul demandé par Ben **existait déjà**, exact, depuis la v1379/v1380 :
`ficheMeringueProduction()` affiche la base meringue commune (cumulée, mise à l'échelle du total)
**et**, séparément mais sur la **même vue**, le tant-pour-tant et les ajouts propres de **chaque**
parfum. Le trou : cette fiche ne s'affichait **qu'une fois**, automatiquement, juste après le
lancement d'un batch en mode « duo ». Une fois cette popup fermée, le bouton « Voir la recette »
d'un sous-lot (dans « N production(s) en cours », en haut de la page Fabrication) rouvrait
`ficheRecetteProduction` — qui ne montre que **ce** parfum, jamais la base commune ni l'autre
parfum. La vue combinée que Ben avait vue une fois n'était donc plus jamais accessible.

### Le fix
`ficheRecetteProductionFromBatch(prodId)` — appelée par CE bouton — détecte désormais si le batch
cliqué porte un `meringueBatchId` (fournée de meringue commune). Si oui, elle retrouve tous les
sous-lots de la même fournée (`db.productions.where('meringueBatchId').equals(...)`,  reconstruit
leurs quantités en macarons, et rouvre `ficheMeringueProduction()` — **la même fiche combinée**,
avec **tous** les parfums de la fournée, pas seulement celui cliqué. Repli sur la fiche simple si
un seul sous-lot subsiste (ex. l'autre a été supprimé) : jamais de plantage, jamais de silence.

### Suite v1442 : 15 assertions (`tests/v1442-meringue-fiche-combinee.test.js`)
Statique : la fonction vérifie bien `meringueBatchId`, interroge `where('meringueBatchId')`, route
vers la fiche combinée et conserve le repli simple (A). Comportemental, sur une vraie (fausse)
IndexedDB : cliquer sur UN sous-lot ouvre la fiche combinée avec les DEUX parfums, quantités et
lots exacts reconstruits pour chacun — pas seulement celui cliqué (B) ; non-régression sur un batch
sans meringueBatchId, comportement d'avant inchangé (C) ; cas limite d'un seul sous-lot restant en
base — repli propre sur la fiche simple, sans plantage (D).

---

## 2026-08-03 — « MACARONS Pn » NE SUIVAIT PAS LE PARFUM CHOISI  (v1442 → **v1443**)

**Signalé par Ben**, capture à l'appui : en mode duo (« 2 parfums, meringue commune »), il choisit
« Coco citron vert (100/batch) » en Parfum 2 — le champ « Macarons P2 » reste affiché à **60**.
« 100/batch » est écrit juste au-dessus du champ, « 60 » dedans : la valeur n'avait jamais suivi le
changement de parfum. Lancer la production sans corriger à la main aurait produit la mauvaise
quantité de ce parfum.

### La cause
Les sélecteurs « Parfum 1/2/3 » du mode duo n'appelaient, au changement, que `prodRefreshLot()`
(le numéro de lot) et `prodDuoApercu()` (l'aperçu texte) — **jamais** de resynchronisation de la
quantité elle-même. Le mode **mono-parfum** avait déjà ce réflexe (`prodSyncTheorique()`
resynchronise `f_qte` sur `rendement` à chaque changement de recette) ; il manquait, purement et
simplement, sur les 3 emplacements du mode duo/trio — un oubli lors de l'ajout du mode duo, jamais
comblé depuis.

### Le fix
Nouvelle fonction `prodDuoSyncQte(slot)`, branchée sur les 3 sélecteurs de parfum : lit le
`rendement` du parfum nouvellement choisi (le même `data-rend` déjà utilisé par
`prodSyncTheorique`), l'écrit dans la case « Macarons Pn » correspondante, puis appelle
`prodDuoQteChange()` pour que le total de coques et le curseur de répartition se recalculent
aussitôt à partir des 3 quantités réelles. Choisir « — aucun — » en Parfum 3 remet sa quantité à 0
(sinon une valeur fantôme resterait affichée sous un sélecteur qui dit « aucun »).

### Suite v1443 : 9 assertions (`tests/v1443-duo-qte-sync.test.js`)
Cas exact de Ben : Parfum 2 passe de 60/batch à 100/batch, le champ suit (A) ; symétrie côté
Parfum 1 (B) ; Parfum 3 facultatif suit aussi quand un vrai parfum est choisi (C) et se remet à 0
sur « — aucun — » (D) ; câblage réel vérifié — les 3 sélecteurs du formulaire appellent bien
`prodDuoSyncQte` (E).

---

## 2026-08-03 — GRAPHIQUE DU CA ZOOMABLE ET GLISSANT  (v1443 → **v1444**)

**Demandé par Ben**, capture de l'app Santé d'iPhone à l'appui :
> « Je veux que [le graphique] sur l'accueil puisse être dezoomable pour changer l'affichage du CA
> pour montrer une tranche d'1 an par exemple plutôt que 6 mois. Ou zoomer pour afficher [...] 1
> mois, 1 semaine etc. Et qu'on puisse scroller à l'horizontal pour que la période affichée soit
> glissante. Bien entendu tout résultat affiché reste cliquable et renvoie à la période en
> question. [...] Pour les périodes je veux jour semaine mois année. »

### Ce qui existait
Le graphique de l'accueil était **figé** : 6 barres mensuelles, calculées par 6 appels
`caDuMois()`, sans onglet ni défilement. Impossible de voir plus loin que 6 mois en arrière, ni de
descendre sous le mois.

### Ce qui est fait
Bande **défilante** avec 4 onglets — Jour / Semaine / Mois / Année. L'onglet choisit la largeur
d'**une barre** ; le défilement horizontal fait glisser la fenêtre dans le temps **à granularité
constante**, et le graphique s'ouvre sur la période la plus récente (comme l'app Santé). L'onglet
« Mois » affiche 12 barres — soit exactement la tranche d'1 an citée en exemple par Ben. Chaque
barre reste cliquable et ouvre le détail des encaissements de **sa** période ; le clic sur un mois
ouvre l'écran mensuel habituel (`caMonthDetail`, inchangé) plutôt qu'un second écran concurrent.
Une période sans vente reste une **barre à zéro**, jamais une barre absente — sinon le graphique
mentirait par omission.

Effet de bord favorable : l'accueil ne lance plus 6 requêtes `caDuMois` par rendu. Les
encaissements sont chargés en **un seul passage** (`_caLignesToutes`) puis regroupés côté client.

### Limite déclarée, pas contournée
Un encaissement porte une **date**, jamais une **heure** (`paiementsDe` → `p.date`, marchés →
`k.date`). La barre la plus fine possible est donc **le jour**. Il n'y a pas de vue « heure par
heure », et en fabriquer une inventerait une précision que la base n'a pas.

### Le risque principal, et ce que la suite prouve
L'ancien graphique appelait `caDuMois()` — **source unique de vérité** du CA encaissé d'un mois —
une fois par barre. Le nouveau agrège côté client. Si les deux divergent d'un centime, l'app
affiche **deux chiffres pour le même mois** : la barre dit une chose, le détail au clic en dit une
autre. La suite rejoue donc les **deux chemins sur le même jeu de données** et compare mois par
mois, sur les mêmes règles (reprises exclues, commandes filles sans paiement propre, marchés clos
au CA net uniquement).

### Suite v1444 : 35 assertions (`tests/v1444-ca-graphique-glissant.test.js`)
Les 4 périodes demandées existent et « Mois » vaut bien 12 barres = 1 an (A) ; clés de
regroupement par granularité, dont la semaine ISO lundi→dimanche, un dimanche appartenant à la
semaine du lundi précédent (B) ; bornes de période, dont février 28 **et** 29 jours en bissextile
(C) ; suite continue franchissant le changement d'année, sans trou (D) ; plafond de barres gardant
les périodes les plus **récentes** (E) ; agrégation par jour/semaine/mois/année (F) ;
**réconciliation avec `caDuMois` mois par mois**, plus les exclusions vérifiées explicitement —
reprise d'historique, marché non clos, paiement à 0 €, et un paiement daté d'un autre mois que sa
commande qui doit compter au mois du **paiement** (G).

**Sensibilité vérifiée par mutation** : en retirant le filtre « marché clos » de `_caLignesToutes`,
la réconciliation part de 82,75 € à 1 082,75 € et 3 assertions passent au rouge. Le test échoue
bien quand le code est faux.

---

## 2026-08-03 — DIVISER UN PARFUM BICOLORE EN 2 LOTS, COMME UNE MERINGUE MUTUALISÉE  (v1444 → **v1445**)

**Suite directe de la v1441.** Ben a essayé le simple rappel et signalé que ça ne suffisait pas :
> « Praliné ne se divise pas en 2 comme souhaité. Je veux que le comportement des coques bicolore
> soit identique à une meringue mutualisée car au final c'est le même principe. Ainsi je dois avoir
> d'un côté une couleur de coque puis de l'autre côté la deuxième couleur. Pour le praliné ça
> reviendrait au même comportement que si je décidais de scinder ma meringue en 2 pour faire
> vanille et chocolat au lait (coques marrons et blanches). »

### Ce que la v1441 offrait, et pourquoi ça ne suffisait pas
La v1441 ajoutait un **rappel** (« divise ta meringue en 2 portions égales ») mais gardait UN SEUL
lot de coques en base — décision prise avec Ben à l'époque, pour rester au plus simple. À l'usage,
ça ne donnait pas ce qu'il voulait : pas de DLC séparée, pas de suivi de stock séparé par couleur,
rien qui ressemble au mode « 2 parfums, meringue commune » qu'il utilise déjà pour de vrais
parfums différents.

### Le fix
Le formulaire de lancement, en mode **Composant → Coques**, propose désormais — pour une recette
bicolore — de diviser en **2 lots réels et séparés**, reliés par un `meringueBatchId` partagé
(fournée de meringue commune) : chacun sa quantité, sa DLC, son suivi de stock propre. C'est
**exactement** le mécanisme déjà en place pour 2 parfums différents (`saveProd`, mode duo),
appliqué ici à UN SEUL parfum divisé en ses 2 couleurs plutôt qu'à 2 parfums. Toujours 50/50 (pas
de curseur, conforme à la décision initiale de Ben sur ce point précis).

Absent en mode « Batch complet » : le mode duo lui-même ne gère que les coques (jamais la
garniture) — l'y autoriser aurait silencieusement laissé la garniture non produite. La case
n'apparaît donc que quand le composant choisi est « Coques » seules.

### Sous le capot : une couleur EXPLICITE, prioritaire sur la recette
Un lot de production peut désormais porter un champ `couleur`. Quand il est présent, il **prime**
sur les 2 couleurs de la recette : ce lot ne contient QUE cette couleur, même si sa recette en
porte deux. Absent (comportement par défaut, tous les lots existants) : rien ne change, un lot
bicolore reste virtuellement 50/50 comme avant.

**Trois moteurs** lisent la couleur d'un lot pour des raisons différentes — stock potentiel
(`computeStockPotentiel`), suggestions d'assemblage (`assemblySuggestions`), suggestions de
dégustation (`degustationSuggestions`) — et **les trois** passaient, avant ce correctif, par la
recette directement plutôt que par un point commun. Les trois ont été repointés vers
`coqueColorProfile()`, la même fonction que le sélecteur d'assemblage utilisait déjà : un seul
moteur de vérité sur « quelle couleur contient ce lot », pas trois implémentations qui auraient pu
diverger.

### Le piège du test à 50/50, et comment il a été évité
Une première version des tests de réconciliation utilisait un split 50/50 parfaitement égal — qui,
par coïncidence arithmétique, donne le MÊME total qu'une double-division virtuelle du bug (la
moyenne de deux moitiés égales reste la moitié). Vérifié par mutation réelle de `app.js` : ce
premier test restait vert même le correctif désactivé. Remplacé par un scénario **dissymétrique**
(100 coques marron / 140 blanc) où le calcul correct (100, limité par la couleur la plus rare) et
le calcul buggé (120, moyenne des deux) divergent clairement.

### Suite v1445 : 31 assertions (`tests/v1445-bicolore-divise.test.js`)
Code court de couleur pour les lots (A) ; `coqueColorProfile` respecte la couleur explicite, avec
repli sur la recette si absente ou invalide, non-régression sur les recettes monochromes (B) ; le
sélecteur d'assemblage (`coquesPourCouleur`) respecte aussi la couleur explicite (C) ;
réconciliation `computeStockPotentiel`, dont la contre-épreuve dissymétrique (D) ; même
réconciliation pour `assemblySuggestions` (E) ; `prodLancerBicoloreDivise` — 2 appels
`enregistrerProduction`, split 50/50 exact même à quantité impaire de macarons, `meringueBatchId`
partagé, lots distingués par couleur, refus net d'une recette monochrome (F) ; câblage réel de la
case à cocher restreinte au mode composant+coques (G) ; persistance du champ `couleur` (H).

**Sensibilité vérifiée par mutation réelle de `app.js`**, à 3 endroits séparés : désactiver la
priorité de la couleur explicite dans `coqueColorProfile` fait échouer B, C, D et E ; revenir
individuellement à l'ancien appel direct dans `computeStockPotentiel` fait échouer D seule ; idem
dans `assemblySuggestions` pour E seule — chaque point de correction est couvert par une assertion
qui lui est propre, pas seulement par la fonction centrale.

---

## 2026-08-03 — LA CASE « DIVISER EN 2 LOTS » SE DÉCOCHAIT TOUTE SEULE  (v1445 → **v1446**)

**Signalé par Ben**, captures à l'appui : une fiche de production « Chocolat passion » montrant
un seul lot (« 030826CHP-CO », sans suffixe de couleur) avec le simple rappel v1441 — « divise ta
meringue en 2 portions égales » — alors qu'il pensait avoir demandé la vraie division en 2 lots
introduite en v1445. Le numéro de lot lui-même était la preuve : un partage réussi aurait donné
2 lots avec des codes couleur distincts, pas un seul lot au format d'avant v1445.

### La cause
`prodUpdateCoqueHint()` reconstruit **entièrement** la case à cocher (`innerHTML`) à chaque appel —
y compris depuis le champ **Quantité**, qui appelle cette fonction à **chaque frappe** depuis la
v1441. Le nouvel `<input>` ne portait jamais l'état précédent : cocher la case, puis modifier la
quantité (l'ordre naturel d'usage — la quantité est pré-remplie par le rendement de la recette, on
la corrige souvent après avoir repéré le rappel bicolore) redessinait une case **décochée**, en
silence, sans aucun message d'erreur. Cliquer « Lancer la production » retombait alors sur
l'ancien chemin à un seul lot.

### Le fix
L'état de la case (`checked`) est lu **avant** que l'élément ne soit détruit par la réaffectation
d'`innerHTML`, et reporté sur le nouvel `<input>` généré.

### Un piège d'outillage découvert au passage
Écrire le test de non-régression a révélé que `prodUpdateCoqueHint()` n'avait **jamais** été
extraite par `tests/_extract.js` jusqu'ici. Sa structure — un `${condition ? `template` : `template`}` **imbriqué** dans le gros bloc HTML — fait qu'un backtick d'ouverture du template
imbriqué est indiscernable, pour l'extracteur, de la fermeture du template extérieur : le comptage
d'accolades déraillait et engloutissait des dizaines de milliers de caractères plus loin dans le
fichier avant de retomber par coïncidence sur une profondeur nulle. Corrigé en sortant le texte
conditionnel dans une variable à part (`texteEtat`) avant le template principal — un seul niveau de
backticks, extraction propre, affichage strictement identique. `tests/_extract.js` lui-même n'a pas
été touché (règle du projet : un seul stripper/extracteur, jamais un second).

### Suite v1445 amendée : 3 assertions (`tests/v1445b-checkbox-reset.test.js`)
La case reste cochée après un second rendu déclenché par la quantité — le cas exact de Ben (A) ;
preuve par réintroduction — sans le correctif, la case se décoche bien toute seule (B).

---

## 2026-08-03 — CODES COULEUR DES LOTS : EXPLICITES, PLUS ALGORITHMIQUES  (v1446 → **v1447**)

**Demandé par Ben** : « je veux que le code pour la coque blanche dise BLA et pas BAN. »

### La demande, et ce qu'elle a révélé en creusant
`coqueCouleurCode()` (introduite en v1445 pour distinguer par le numéro de lot les 2 moitiés d'un
parfum bicolore) dérivait le code automatiquement du libellé de la couleur, avec le même filtre
anti-ambiguïté que `flavorCode()` (retire les lettres I/L/O). Pour « Blanc », ce filtre retire le
L et donne « BAN ».

En vérifiant la demande sur l'ensemble de la palette plutôt que sur le seul blanc : le même calcul
faisait aussi atterrir les **4 marrons** (foncé, clair, intermédiaire, intermédiaire café) sur le
code « MAR », les **2 rouges** (rouge, rouge bourgogne) sur « RUG », les **2 verts** (pastel,
pistache) sur « VER », et les **2 jaunes** (jaune, jaune pâle) sur « JAU ». Dix des quatorze
couleurs de la palette collisionnaient deux à deux — deux couleurs réellement différentes se
seraient retrouvées avec le **même** numéro de lot, silencieusement indiscernables. Un bug que Ben
n'avait pas signalé, découvert en vérifiant sa demande plus largement qu'à la lettre.

### Le fix
Une table explicite, `COQUE_COULEUR_CODES` — le même principe que `FLAVOR_CODES` pour les
parfums — donne à chacune des 14 couleurs cataloguées un code à 3 lettres choisi à la main,
lisible et garanti unique (blanc → BLA, comme demandé). Une couleur future, pas encore ajoutée à
la table, retombe sur l'ancien calcul algorithmique — aucune régression sur ce cas.

### Suite v1445 amendée (section A)
Code du blanc vérifié à « BLA » ; absence de collision sur l'ensemble des 14 couleurs cataloguées
(vérifié en boucle, pas seulement sur une paire) ; repli algorithmique pour une couleur inconnue,
sans plantage. **Sensibilité confirmée par réintroduction réelle** : revenir à l'ancien calcul
(table vide) fait échouer les 3 assertions, dont celle qui détecte spécifiquement les collisions.

---

## 2026-08-03 — LE CHAMP « N° LOT DE PRODUCTION » MENTAIT EN MODE DUO  (v1447 → **v1448**)

**Signalé par Ben**, capture à l'appui : lançant une meringue commune Chocolat passion + Pistache,
le champ « N° lot de production » affichait **030826RAF** — ni CHP (Chocolat passion), ni PIS
(Pistache), mais RAF (Coco Rafaello, une tout autre recette).

### La cause, en deux couches
La branche `_mode==='duo'` de `saveProd()` ne lit **jamais** ce champ : chaque parfum reçoit son
propre numéro de lot, calculé indépendamment (`flavorCodeRec` + date). Le champ affiché venait de
`prodRefreshLot()`, qui lit **toujours** la recette du sélecteur unique (`f_rec`) — or `f_rec`
reste présente dans la page en mode duo (juste **masquée**, jamais vidée), avec la valeur de la
**dernière recette affichée** avant le passage en duo (le premier recette de la liste, à
l'ouverture du formulaire, dans le cas de Ben). Un champ qui affiche une valeur fausse **et** n'a
aucun effet réel est pire qu'un champ absent — c'est le principe qui guide le fix.

Même défaut, plus discret : la case « diviser en 2 lots » d'un parfum bicolore (v1445/v1446)
partage le même champ, et `prodLancerBicoloreDivise()` ne le lit pas non plus — il calcule ses 2
propres codes, un par couleur.

### Le fix
Le champ est désormais **masqué** dans les deux cas (mode duo ; case bicolore cochée), et
**remplacé** par un aperçu des vrais numéros de lot :
- En duo, dans le récapitulatif de répartition déjà affiché (« ⚖️ Répartition ») : un parfum → son
  vrai code, calculé avec la **formule identique** à `saveProd`.
- Pour la division bicolore, dans son propre encart, même principe.

Dans les deux cas, le calcul n'est **jamais dupliqué** : c'est la même expression
(`(baseD + flavorCodeRec(r)).toUpperCase().replace(/\s+/g,'')+'-CO'`) que celle réellement
exécutée à la sauvegarde — un aperçu qui divergerait du réel serait pire qu'un aperçu absent.

### Suite v1448 : 12 assertions (`tests/v1448-lot-duo-preview.test.js`)
Ni la branche duo de `saveProd` ni `prodLancerBicoloreDivise` ne lisent `f_lot` (A) ; `f_lotWrap`
masqué exactement quand le mode est duo, comportement vérifié en isolation, y compris le
réaffichage en repassant en mode complet (B, C) ; **réconciliation** — l'aperçu affiché dans
`prodDuoApercu` pour Chocolat passion + Pistache donne bien `030826CHP-CO` et `030826PIS-CO`,
jamais `RAF` — le symptôme exact de Ben (D) ; preuve par réintroduction (E).

---

## 2026-08-03 — UN PARFUM BICOLORE COMBINÉ À D'AUTRES SE DIVISE AUSSI  (v1448 → **v1449**)

**Ben, en réaction à v1445/v1448** :
> « T'as pas compris. Si c'est un parfum bicolore la partie de la meringue dédiée à cette couleur
> doit être divisée ! Ainsi si j'ai 240 coques et que je souhaite mutualiser la meringue à part
> égale entre pistache et chocolat passion je devrais faire : Pistache = 120 coques / Chocolat
> passion = 60 coques marrons + 60 coques orange. Ainsi la recette doit s'ajuster en
> conséquence. »

### Ce qui manquait
La division bicolore (v1445) ne gérait qu'**un seul** parfum, lancé à part, et restait une
**option** qu'on cochait. Le mode duo/trio (meringue commune entre 2-3 parfums différents), lui,
traitait chaque parfum sélectionné comme produisant exactement **un** lot — sans jamais se
demander si CE parfum était lui-même bicolore. Combiner les deux (un parfum bicolore parmi
d'autres dans une même fournée) n'était tout simplement pas prévu.

### Le fix : un moteur, pas une case à cocher
Nouvelle fonction partagée `_sousLotsCoques(rid, rec, qMac, baseD)` : pour **n'importe quel**
parfum entrant dans un lancement de coques (seul, en duo, ou en trio), elle décide s'il produit
**1 sous-lot** (mono-couleur, sa quantité entière) ou **2** (bicolore, toujours 50/50 — jamais un
choix, jamais un curseur). C'est **le seul et même moteur**, réutilisé partout :
- Lancement solo (Composant → Coques) : la case à cocher a **disparu**. Ce n'est plus une option,
  c'est un comportement automatique dès que la recette choisie est bicolore.
- Mode duo/trio (`saveProd`) : chaque parfum sélectionné passe par ce même moteur. Un parfum
  bicolore combiné à d'autres se divise **exactement comme s'il était seul** — la quantité qui lui
  revient après répartition entre parfums sert de base à sa propre division par couleur.
- Aperçu (`prodDuoApercu`) : répartition, numéros de lot prévisualisés et détail des ingrédients
  de la meringue reflètent désormais les **vrais sous-lots**, pas les parfums sélectionnés — un
  trio où chaque parfum serait bicolore afficherait jusqu'à 6 lignes, pas 3.

### Un piège d'outillage retrouvé au passage
En réécrivant `prodDuoApercu`, la même impasse d'extraction que `prodUpdateCoqueHint` (v1446) —
un backtick imbriqué dans un `${...}` d'un autre backtick, cette fois dans la construction de
l'aperçu des lots. Même remède : sortir le texte du template imbriqué, pas toucher
`tests/_extract.js`.

### Suite v1449 : 28 assertions (`tests/v1449-bicolore-duo.test.js`)
`_sousLotsCoques` en isolation : 1 sous-lot mono-couleur, 2 sous-lots bicolore toujours 50/50 exact
même à quantité impaire, lots distingués (A). **Le test qui compte** : reproduction EXACTE du
scénario chiffré de Ben — `saveProd` (branche duo) produit bien 3 lots (Pistache 120 coques,
Chocolat passion 60 marron + 60 orange), un seul `meringueBatchId`, une fiche à 3 parts (B) ;
`prodDuoApercu` affiche les mêmes 3 sous-lots, jamais divergents du réel (C) ; preuve par
réintroduction — sans l'expansion, seulement 2 lots, Chocolat passion jamais divisé (D).

**Sensibilité vérifiée par mutation réelle de `app.js`** : revenir à l'ancien calcul 1-lot-par-def
dans la branche duo fait échouer 7 assertions de la section B, exactement celles qui portent sur
la division de Chocolat passion.

---

## 2026-08-03 — POURCENTAGE DE CA DEVANT CHAQUE TRANSACTION  (v1449 → **v1450**)

**Demandé par Ben** :
> « Je veux qu'à chaque fois que c'est possible, devant chaque transaction ça indique le
> pourcentage de CA que ça représente sur la totalité du calcul réalisé. Exemple quand je clique
> sur CA du mois, et que je clique sur le détail du CA encaissé, chaque commande indique le
> pourcentage que ça représente sur la totalité du calcul. Et je veux que chaque ligne indique le
> nom du client de manière systématique et non pas un montant avec un numéro qui ne donne aucune
> information utile sur la provenance de la transaction. »

### Portée retenue
Les 3 écrans de détail CA/encaissement existants : détail du mois (`caMonthDetail`), détail d'une
période glissante jour/semaine/année (`caPeriodeDetail`, v1444), détail d'une catégorie du bilan
URSSAF (`comptaCategorieDetail`, v1412/v1419) — exactement le chemin décrit par l'exemple de Ben,
et les seuls écrans de l'app où une liste de transactions individuelles somme à un total CA
affiché.

### Le fix
Fonction pure partagée `pctDuTotal(montant, total)`, branchée sous le montant de chaque ligne des
3 écrans — un seul calcul, pas un par écran. Une ligne **négative** (reprise, avoir) affiche un
pourcentage **négatif** : elle réduit le total, ce n'est pas la même chose que d'y contribuer, et
afficher sa valeur absolue aurait menti sur le sens. Une contribution sous 1 % affiche « < 1 % »
plutôt qu'un « 0 % » qui laisserait croire qu'elle est nulle. Respecte le mode confidentialité
comme `euro()` : un pourcentage exact à côté d'un montant masqué resterait un indice exploitable.

### Le second point : déjà en place
Audit des 3 écrans avant de toucher quoi que ce soit : les trois affichent déjà le nom du client
en clair (`caMonthDetail` et `caPeriodeDetail` depuis leur écriture, `comptaCategorieDetail`
depuis le fix v1419 qui avait déjà mis le nom en avant devant le numéro de commande). Vérifié par
garde statique plutôt que re-modifié sans raison de le faire.

### Suite v1450 : 19 assertions (`tests/v1450-pourcentage-ca.test.js`)
`pctDuTotal` en isolation : contribution normale, ligne totale, ligne négative (signée, pas
absolue), petite contribution « < 1 % », total nul sans division par zéro, arrondi, mode
confidentialité (A) ; **réconciliation** — la somme des pourcentages arrondis d'une répartition
complète retombe sur 100 % aux arrondis près (B) ; câblage réel sur les 3 écrans (C) ; garde
statique sur le nom du client, déjà en place (D) ; rendu HTML réel vérifié sur un jeu de données
connu (75 %/25 %) (E). Sensibilité confirmée par mutation réelle de `app.js`.

---

## 2026-08-03 — POURCENTAGE DE CA, SUITE : 3 ÉCRANS DE PLUS  (v1450 → **v1451**)

**Continuation directe de v1450.** Ben avait demandé le pourcentage « à chaque fois que c'est
possible » ; la livraison précédente s'était volontairement limitée aux 3 écrans correspondant à
son exemple littéral (CA du mois). Recherche systématique de tous les autres écrans où une liste
de transactions individuelles somme à un total CA affiché à l'écran.

### Trois écrans de plus, corrigés
- **`comptaFluxDetail`** (« CA facturé » / « CA encaissé » par période) : deux sous-totaux
  distincts déjà affichés séparément — le total officiel, et les reprises d'historique
  (« hors URSSAF »). Une reprise reçoit un pourcentage de **son propre** sous-total, jamais du
  total officiel : les mélanger aurait fait mentir l'un des deux pourcentages, exactement le genre
  d'erreur silencieuse que ce type de correctif doit éviter d'introduire.
- **`renderAvoirs`** (journal des remboursements émis) : le total était déjà affiché en tête
  d'écran (« X avoir(s) émis · total Y »), il ne restait qu'à brancher le pourcentage par ligne.
- **`renderPanierMoyen`** (détail des commandes derrière le panier moyen ventilé) : l'écran affiche
  déjà un « Total sur la sélection » à côté du panier moyen — le pourcentage s'y raccroche
  naturellement, même si le chiffre principal mis en avant est une moyenne, pas une somme.

### Volontairement écartés
- Les **cartes de règlement par commande** (reste à encaisser) : chaque carte détaille UNE
  commande, sans total de groupe affiché au-dessus — rien dont calculer un pourcentage.
- Les **listes d'anomalies de cohérence du CA** : le montant y est un écart constaté, pas une
  contribution à un total — lui donner un pourcentage aurait été un chiffre sans signification.

### Suite v1451 : 9 assertions (`tests/v1451-pourcentage-ca-suite.test.js`)
Câblage réel des 3 écrans (A) ; preuve que les deux sous-totaux de `comptaFluxDetail` restent
séparés dans les pourcentages — une reprise rapportée par erreur au total officiel donnerait un
chiffre différent (B) ; rendu HTML réel du journal des avoirs vérifié sur un jeu de données connu
(75 %/25 %) (C). Sensibilité confirmée par mutation réelle de `app.js` (mélanger les deux
sous-totaux de `comptaFluxDetail` fait échouer l'assertion dédiée).

---

## 2026-08-03 — SACHET (1 À 3 MACARONS) ET COFFRET DE 10 À 22 €  (v1451 → **v1452**)

**Demandé par Ben** :
> « Rajouter offre dans commande permettant de vendre : un coffret de 10 macarons à 22€.
> L'emballage par défaut est la boîte blanche de 8/10 macarons. Assure toi de rendre les autres
> emballages selectionnables aussi telle que c'est déjà le cas aujourd'hui. — un sachet pouvant
> contenir de 1 à 3 macarons. Prix : 2,5€ par macaron. De manière générale introduire ce nouvel
> emballage dans tous les écrans de commande, y compris vrac. »

### Ce que « introduire dans tous les écrans » veut dire techniquement
Un **type de ligne de commande** est lu par environ **137 endroits** de l'app : planification de
production, calculs de prix, factures et devis, exports, analytics client, mix produit, marges,
comptabilité. Et un type inconnu **ne plante pas** — il est ignoré en silence, ou pire, tombe dans
un `else` prévu pour autre chose. C'est le vrai risque de ce chantier, pas la difficulté du code :
un sachet oublié dans `lineTotalStored` vaudrait **0 €** sur la facture ; oublié dans le mix
produit, il serait rangé parmi les **dons** (offerts). Chaque point de branchement a donc été
traité un par un, et chacun est vérifié par une assertion dédiée.

### Le sachet
Nouveau type de ligne complet : bouton « + Sachet », grille de parfums avec le **même compteur de
remplissage** que le coffret (vert quand c'est pile, rouge si ça dépasse — langage visuel déjà
connu de Ben, plutôt qu'un second inventé pour la même idée), macarons « sans parfum déterminé »
supportés (ils partent à la détermination en production comme ceux d'un coffret), remise de ligne,
validation à l'enregistrement (au moins 1 macaron, jamais plus de 3).

Branché dans : enregistrement (`cmdLinesToStored`) et réouverture (`_lineToEdit`) — sans ces deux-là
la ligne **disparaîtrait à la sauvegarde** ou reviendrait avec des parfums au mauvais format ; prix
en saisie **et** prix stocké ; besoins en macarons par parfum et comptage total (production) ;
liaison aux lots ; coût matières et marge (`computeOrderMargins`, en marchandise, sans coût
d'emballage propre — comme le vrac) ; libellés de facture texte et HTML ; export de commande ;
analytics client ; comptage mensuel des pièces ; et **sa propre catégorie** dans le mix produit.

Au passage : le **vrac** manquait dans le comptage mensuel des pièces (`coutByMonth`) — omission
préexistante trouvée en ajoutant le sachet à la même liste, corrigée du même coup.

### Le coffret de 10
Ajouté au catalogue à 22 €. **Migration idempotente distincte du seed initial** : `seedProducts()`
ne s'exécute que sur un catalogue **vide** (`if(n>0) return`) — la base existante de Ben ne l'aurait
donc jamais reçu. `seedCoffret10()` crée aussi la boîte blanche 8/10 si elle manque, et ne réécrit
jamais un coffret 10 déjà présent (Ben a pu en régler le prix lui-même).

Choisir la taille 10 pré-sélectionne cette boîte : c'est un **défaut, pas un verrou** — le mode
« autre emballage » est activé avec la boîte blanche pointée, et les trois modes (standard /
réutilisable / autre) ainsi que toute la liste restent sélectionnables exactement comme avant,
ce que Ben demandait explicitement.

`BOX_FLAVOR_LIMIT[10]` a dû être ajouté : sans cette entrée, le format serait retombé sur `||0`,
soit **zéro parfum sélectionnable** — la grille aurait été bloquée.

### Suite v1452 : 42 assertions (`tests/v1452-sachet-coffret10.test.js`)
Constantes conformes aux chiffres demandés (A) ; **réconciliation** entre le prix du modèle
d'édition et celui du modèle stocké — deux chemins de code distincts qui, s'ils divergeaient,
feraient facturer autre chose que ce qui s'affiche à la saisie (B) ; **aller-retour**
enregistrement → réouverture sans perte (C) ; câblage vérifié sur les 14 points de dispatch, un par
un (D) ; le sachet n'est pas confondu avec un don (E) ; migration idempotente et respectueuse d'un
réglage existant (F) ; emballage par défaut sans verrouillage des autres choix (G).

**Sensibilité vérifiée par mutation réelle de `app.js`** : retirer le sachet de `lineTotalStored`
(le « type oublié » classique) fait échouer 8 assertions, dont la garde explicite « un sachet non
vide ne vaut jamais 0 € ».

**Limite d'outillage** : `drawCoffretLine` contient des templates imbriqués que `tests/_extract.js`
tronque (limite connue, cf. v1446/v1449). L'assertion qui vérifie que les 3 modes d'emballage
restent proposés lit donc le **texte brut** de la fonction plutôt que son extraction. Le code
applicatif est correct ; c'est l'outil de lecture qui ne sait pas parser cette forme.

---

## 2026-08-04 — SUPPRIMER UNE CHARGE DEPUIS SA FICHE  (v1452 → **v1453**)

**Demandé par Ben** :
> « Je veux Pouvoir supprimer des charges en cas d'erreur de saisie. Actuellement 3 lignes
> identifiées dans « autre » qui doivent être supprimées (rajout manuel ligne marketing pour
> entrepremans pour l'année passée et celle qui démarre en septembre) »

### Ce qui existait déjà
La suppression d'une charge (`delCharge`) et d'un modèle de charge récurrente (`recurDel`)
existaient **toutes les deux** avant ce correctif, accessibles depuis l'écran « Voir / gérer les
charges » et « Charges mensuelles récurrentes ». Mais **nulle part dans la fiche d'une charge
elle-même** — celle qu'on ouvre justement en la relisant pour repérer une erreur de saisie. D'où
le blocage de Ben : il avait trouvé les 3 lignes fautives, mais aucun moyen de les supprimer
depuis l'endroit où il les regardait.

### Le fix
Bouton « 🗑 Supprimer » ajouté directement dans le formulaire d'édition d'une charge, visible
uniquement pour une charge **existante** (rien à supprimer sur une nouvelle saisie).

Second point, plus subtil : « celle qui démarre en septembre » sent la charge **récurrente** (le
formulaire des modèles a justement un champ « À partir de (mois) »). Supprimer l'**instance** du
mois ne corrige pas une date de départ fausse sur le **modèle** — qui la regénérerait le mois
suivant. Un rappel explicite s'affiche donc quand une charge porte un lien vers un modèle
récurrent (`c.recurId`), avec un accès direct à l'éditeur des charges récurrentes, pour que Ben
corrige la bonne chose plutôt que de la voir revenir.

### Suite v1453 : 14 assertions (`tests/v1453-charge-delete.test.js`)
Câblage réel du bouton (A) ; rendu HTML vérifié dans les 3 cas — nouvelle charge (pas de bouton),
charge simple existante (bouton présent, pas de rappel), charge récurrente (bouton présent **et**
rappel) (B) ; non-régression sur `delCharge` lui-même (C). Sensibilité confirmée par mutation
réelle de `app.js` (retirer le bouton fait échouer 4 assertions).

---

## 2026-08-04 — ASSEMBLER UN LOT DE COQUES RÉPARTI EN PLUSIEURS BOÎTES  (v1453 → **v1454**)

**Demandé par Ben**, après une discussion d'architecture qu'il a explicitement voulue avant tout code :
> « Si j'ai 200 coques réparties en 6 boîtes je dois faire mon assemblage à 6 reprises, alors que
> dans la réalité je sors l'ensemble des coques de leurs boites (à ce stade les boites n'existent
> plus que sur l'application et plus dans la réalité), les dispose sur mon plan de travail et les
> garnis ensuite, puis les répartis en boîte. »

### Le diagnostic
La boîte est un artefact de **rangement**, pas une unité de **travail**. Au moment d'assembler, elle
doit disparaître du choix ; elle réapparaît à la répartition des macarons garnis. Ben garde par
ailleurs la mise en boîtes des coques — « je m'en sers pour savoir où elles sont rangées ».

### Pourquoi le moteur d'assemblage n'a PAS été touché
`prodAssembleSave` est très intriqué : capacité, décrément et `assembleFrom` supposent un lot de
coques unique, et s'y ajoutent le 2ᵉ lot bicolore (v1413), le mode 3 parties chantache (v1248), les
gardes dégustation et `sansMelange` (v1426). Le rendre multi-sources aurait touché tout ça à la fois.

À la place : une étape **amont** qui regroupe les boîtes du lot en une seule, puis le formulaire
d'assemblage normal s'ouvre dessus. Deux mécanismes éprouvés au lieu d'une réécriture du plus
délicat. Le regroupement **décrit ce qui vient de se passer en atelier** — ce n'est pas un
contournement : les coques sont réellement hors de leurs boîtes.

`regrouperBoitesLot` réutilise `_fusionValide`/`_fusionCalcul` (v1376/v1416) mais en **une seule
transaction** : enchaîner N−1 appels à `fusionnerBoites` aurait fait N−1 sauvegardes de sécurité,
N−1 toasts et N−1 entrées d'audit pour un seul geste métier. Boîtes absorbées **archivées**, jamais
supprimées (invariant v1416). DLC retenue : toujours la **plus courte** des boîtes regroupées.

### Fork tranché par Ben
L'assemblage reste **toujours à l'intérieur d'un seul lot mère** — pas de mélange de deux
productions différentes du même parfum.

### L'étiquette : quantité restante, pas produite
Ben veut une étiquette « recyclée » : il corrige la quantité au stylo à chaque prélèvement, le QR
renvoie à la quantité réelle du moment. Or `buildLabelData` imprimait la quantité **produite** — une
étiquette partant de là serait déjà fausse à l'impression sur une boîte issue d'un lot entamé.
Passée à `prodQteStock` (règle v1429 : une information de stock montre le stock), repli conservé
pour les lots anciens sans `qteRestante`.

**Décision d'architecture liée** : le QR encode `traceUrl(p.lotProduction)`, donc une URL construite
sur le **numéro de lot**. Un numéro qui changerait avec la quantité (idée initiale de Ben :
`…-B-30` → `…-B-25`) rendrait le QR imprimé **mort** au premier prélèvement, et ferait collisionner
la boîte de 30 tombée à 25 avec celle de 25. Le numéro reste donc **stable** ; c'est la quantité
imprimée (et le stylo) qui varie.

### Suite v1454 : 33 assertions (`tests/v1454-assemblage-lot-entier.test.js`)
DLC la plus courte retenue (A) ; **réconciliation sur le cas exact de Ben** — 6 boîtes / 200 coques :
la gardée porte bien les 200, aucune coque créée ni perdue au total, DLC la plus courte retenue même
si ce n'est pas celle de la boîte gardée, 5 boîtes archivées et non supprimées, historique de fusion
complet, sauvegarde et audit écrits (B) ; cas limites — une seule boîte, lot encore en vrac, boîte
déjà fusionnée : succès **sans aucune écriture** (C) ; câblage du bouton de Stock par parfum, avec
non-régression du chemin v1426 à une seule boîte (D) ; étiquette imprimant la quantité restante (E).

**Sensibilité vérifiée par mutation réelle de `app.js`** : faire que la boîte gardée n'accumule pas
les quantités absorbées fait échouer les deux assertions de réconciliation. ⚠️ La première tentative
de mutation n'avait pas pris (chaîne introuvable, indentation) et le test est resté vert — refaite
correctement, elle rougit bien. Une mutation qui ne s'applique pas ne prouve rien.

---

## 2026-08-05 — TRANSFÉRER DES MACARONS D'UNE BOÎTE À UNE AUTRE  (v1454 → **v1455**)

**Demandé par Ben** :
> « Lorsque je les répartis en boites une fois garnis je dois pouvoir facilement transférer
> manuellement un ou plusieurs macarons d'une boîte à une autre (pour gérer les erreurs de
> saisies) […] aussi pouvoir facilement gérer le cas d'une casse lors d'une mise en boîte. »

### L'audit avant d'écrire quoi que ce soit
Deux des trois besoins étaient **déjà couverts** — les chercher a évité d'en réécrire une seconde
version :
- **Répartition en boîtes** : `prodPreparerBoites` (moteur unique depuis v1389).
- **Casse** : `declareLossForm` couvre les 4 stades (produits finis, coques, ganache/crémeux,
  dégustation), avec motif, coût, et le cas « coques cassées récupérables → dégustation ». Un bouton
  « ⚠ Perte » était déjà présent **par boîte** dans la vue des boîtes.

Le seul morceau réellement absent : le **transfert partiel**. La fusion existait, mais elle vide
toujours une boîte entièrement — elle ne sait pas déplacer 3 macarons.

### Les trois règles posées
- **Même lot obligatoire.** Transférer entre deux lots mélangerait deux fabrications sous une même
  étiquette. C'est ce que `_fusionValide` refuse déjà, et pour la même raison — donc réutilisé tel
  quel plutôt que redit.
- **Un transfert total archive la boîte de départ** (`fusionneeDans`, invariant v1416) au lieu de la
  laisser vide avec une étiquette qui ne correspond plus à rien. Cohérent avec la décision de Ben :
  une boîte qui tombe à zéro est archivée, pas ré-étiquetée.
- **La DLC d'arrivée devient la plus courte des deux**, jamais celle qui arrange.

### La traçabilité devait suivre, sinon la fonctionnalité mentait
Enregistrer un transfert sans que le fil de traçabilité sache l'afficher aurait produit un
historique **muet** : la quantité change, rien ne dit pourquoi. `construireFilTracabilite` rend donc
les transferts **dans les deux sens** (côté boîte qui reçoit *et* côté boîte qui donne), avec lien
cliquable vers l'autre boîte. Icône **⇄ distincte du 🔗 de la fusion** : les confondre ferait croire
qu'une boîte a disparu alors qu'elle survit avec le reste.

### Suite v1455 : 34 assertions (`tests/v1455-transfert-boites.test.js`)
Transfert partiel, les deux boîtes survivent, historique posé des deux côtés (A) ; transfert total,
source archivée et non supprimée, numéro de lot conservé (B) ; DLC la plus courte retenue dans les
deux sens (C) ; refus — quantité supérieure au stock, même boîte, quantité nulle, autre lot — avec
vérification qu'**aucune écriture ni sauvegarde inutile** n'a lieu sur un refus (D) ; rendu du fil de
traçabilité dans les deux sens, sans étape inventée quand il n'y a pas eu de transfert (E) ; câblage
du bouton et de l'icône (F). **Réconciliation « aucune pièce créée ni perdue » sur chaque scénario.**

**Sensibilité vérifiée par mutation réelle de `app.js`** : empêcher la source de se décrémenter fait
échouer la réconciliation. ⚠️ Contrairement à la v1454, la mutation a été **vérifiée comme
appliquée** (assertion sur le compte d'occurrences *et* relecture du fichier écrit) avant d'en tirer
une conclusion — la leçon de la v1454, où une mutation muette avait laissé le test vert à tort.

---

## 2026-08-05 — RÉIMPRIMER L'ÉTIQUETTE APRÈS UNE FUSION  (v1455 → **v1456**)

**Demandé par Ben** : « en cas de fusion de boîte je dois pouvoir réimprimer une étiquette mise à
jour ».

### Pourquoi la fusion est le cas particulier
Sur un **prélèvement**, Ben corrige la quantité au stylo — c'est la décision « étiquette recyclée »
(v1454) : le QR reste valide parce que le numéro de lot ne bouge pas. Après une **fusion**, il n'y a
rien à corriger à la main : la boîte gardée contient d'autres pièces qu'annoncé, sa DLC a pu
raccourcir, et l'étiquette de la boîte absorbée n'a plus d'objet. C'est le seul moment où
l'étiquette devient fausse sans recours.

La réimpression est donc **proposée** juste après la fusion, avec la quantité et la DLC réelles
affichées avant d'imprimer — et jamais imposée. Le retour à la vue d'ensemble est confié à cette
proposition plutôt que déclenché en parallèle : ouvrir les deux écrans à la suite ferait disparaître
le premier avant qu'on l'ait lu.

**Le numéro de lot ne change pas.** On réimprime le même numéro avec la bonne quantité : une
réimpression, pas une nouvelle identité. Un bouton « 🖨 Étiquette » permanent a aussi été ajouté sur
chaque boîte, pour réimprimer à tout moment (après un transfert, un regroupement, ou une étiquette
abîmée).

### Suite v1456 : 19 assertions (`tests/v1456-reimpression-fusion.test.js`)
La proposition affiche la quantité réelle après fusion, la DLC, et dit explicitement que le numéro
ne change pas ; « Plus tard » ramène à la vue des boîtes ; sans écran de retour, aucun appel bancal
n'est généré ; pas de ligne DLC quand il n'y en a pas ; boîte introuvable → on ramène quand même
Ben à sa vue plutôt que de le laisser sur un écran mort (A) ; câblage de la fusion et du bouton
permanent (B) ; **gardes de non-régression** — la proposition n'écrit rien en base et ne régénère
aucun numéro de lot, le QR reste bâti sur le numéro (C). Sensibilité vérifiée par mutation réelle.

### ⚠️ INCIDENT D'OUTILLAGE — app.js VIDÉ PENDANT CETTE LIVRAISON
Une mise à jour d'`APP_MAJ` par script Python a **tronqué `app.js` à 0 octet** : `open(p,'w')` vide
le fichier *avant* l'écriture, et l'écriture a échoué sur un caractère mal échappé. Le fichier est
resté vide.

**Le piège qui a failli le masquer** : `node --check` a répondu **OK** sur ce fichier vide — un
fichier vide est du JavaScript valide. Le contrôle de syntaxe habituel a donc donné un faux signal
rassurant. Ce qui a alerté, c'est un `grep` de `APP_VERSION` qui ne renvoyait rien.

**Récupération** : le répertoire de la version précédente contenait `app.js` intact ; seules les
modifications de cette livraison (une fonction, deux branchements) ont été réappliquées. Les 17
suites repassent au vert, y compris celles de v1454 et v1455 — rien n'a été perdu.

**Deux règles retenues** : (1) toute réécriture de fichier par script passe désormais par un
**fichier temporaire puis un remplacement atomique**, pour qu'un échec ne puisse jamais laisser un
fichier vide ; (2) `node --check` ne suffit pas à prouver qu'un fichier est intact — il faut aussi
vérifier sa **taille** et la présence d'un marqueur connu.

---

## 2026-08-05 — RETOURS DE MARCHÉ : RANGER LES INVENDUS EN BOÎTES  (v1456 → **v1457**)

**Demandé par Ben** :
> « Au retour d'un marché je veux pouvoir ranger mes boîtes proprement […] dans l'onglet retour
> marché je saisi les quantités retour de chaque parfums ; l'app fait le delta puis propose de
> ranger chaque quantité pour chaque parfums. Sur cet écran je choisi une répartition par boîte et
> l'app me propose d'editer une étiquette spéciale retour marché […] puis l'emplacement pour les
> ranger proprement et distinctement. »

### L'audit avant d'écrire
L'écran « Retour de marché — invendus » **existait déjà** : saisie par parfum, delta pré-calculé
(`sorti − retour − don − perte`), choix congélateur / frigo / écarté, et une règle de sécurité —
**recongélation interdite** si le lot a déjà été décongelé. Manquaient la répartition en boîtes,
l'emplacement par boîte, l'étiquette retour, et le rattachement correct.

### 🚨 Le défaut trouvé
`marketLineSummary` réduisait la provenance à `productionIds[0]` (commenté « compat affichage »).
La sortie puise pourtant en **FIFO sur plusieurs lots**, et l'app enregistre lesquels. Résultat :
tout le retour était crédité au **premier lot**. Avec 40 pris sur A et 60 sur B, un retour de 50
donnait +50 à A — qui n'en avait fourni que 40 — pendant que B restait court. Stock et traçabilité
faux tous les deux.

`marketLotsSortisParParfum` (pure) reconstitue désormais la provenance réelle, et
`marketRepartirRetour` (pure) **plafonne chaque lot à ce qu'il a effectivement fourni**. C'est ce
plafond qui rend le stock cohérent.

### Les trois décisions de Ben, appliquées
- **DLC d'origine conservée.** `marketAddRetour` la **recalculait** (`computeDlcFromHistory`) : un
  retour au congélateur **prolongeait** donc la DLC de macarons qui venaient de passer la journée
  dehors, à température ambiante. Elle est maintenant conservée telle quelle et **figée**
  (`dlcAuto:false`), pour qu'un déplacement ultérieur ne la rallonge pas par la porte de derrière.
- **Provenance inconnue → ligne « retour marché » non rattachée** (`marketAddRetourNonRattache`),
  suffixe `-RM`, marquée `retourMarche:true` pour l'étiquette spéciale. Sur un marché les boîtes se
  vident et se mélangent : inventer un rattachement serait pire que d'assumer qu'on ne sait pas.
- **Boîtes d'origine recréditées en priorité**, la proposition par défaut suivant la sortie FIFO —
  dans la plupart des cas Ben n'a qu'à valider.

**Décision prise faute d'origine unique** (signalée à Ben) : une ligne non rattachée prend la DLC
**la plus courte** des lots sortis pour ce parfum. Si aucune n'est connue, le champ reste **vide**
plutôt qu'inventé — une DLC fabriquée sur du produit fini serait plus dangereuse qu'une DLC absente,
qui se voit et se corrige.

### Suite v1457 : 40 assertions (`tests/v1457-retours-marche.test.js`)
Provenance réelle retrouvée sur plusieurs lots, retours déjà faits déduits, don/perte ignorés,
sortie historique sans lot non inventée (A) ; **réconciliation** — tout le retour réparti sans rien
créer ni perdre, plafond par lot, surplus en ligne non rattachée, lot déjà rendu qui ne reprend rien
(B) ; DLC non recalculée et règle de recongélation conservée (C) ; la ligne non rattachée crée une
vraie ligne de production, exige un emplacement, DLC vide si inconnue (D) ; flux en deux étapes,
écart saisi/réparti affiché, échec d'une boîte n'interrompant pas les autres (E).

**Sensibilité vérifiée par mutation réelle** : retirer le plafond par lot fait rougir 5 assertions.
⚠️ Au premier essai, la mutation faisait **planter** la suite au lieu de la faire rougir — un
plantage en cours de fichier saute toutes les assertions suivantes et masque l'étendue réelle du
problème. Les assertions concernées ont été rendues **défensives** avant de conclure.

---

## 2026-08-05 — ÉTIQUETTE RETOUR MARCHÉ, ET LA QUANTITÉ QUI MANQUAIT  (v1457 → **v1458**)

**Demandé par Ben** : « l'app me propose d'editer une étiquette spéciale retour marché ».

### 🚨 Le défaut trouvé en ouvrant les étiquettes — plus grave que la demande
`renderLabelHTML` **n'imprimait pas la quantité du tout**. Elle était bien calculée (`nbPieces`) et
bien dessinée par le moteur canvas/PDF, mais ce rendu-là l'omettait. Conséquence : l'étiquette
« recyclable » décidée en v1454 — Ben corrige la quantité au stylo à chaque prélèvement, le QR
renvoyant à la quantité réelle — **n'avait rien à corriger sur ce chemin**.

Le correctif v1454 (imprimer le **restant** plutôt que le **produit**) était donc **nécessaire mais
insuffisant** : il changeait *quelle* quantité est calculée sans voir qu'elle n'était jamais
affichée. Leçon : vérifier qu'une donnée corrigée est bien *rendue*, pas seulement bien calculée —
c'est la même erreur que la v1414 (fonction juste, câblage absent), sous une autre forme.

### Deux moteurs d'étiquette, une seule règle
Le projet a **deux** rendus : canvas/PDF (partage vers Labelife) et HTML (feuille d'impression). La
mention « RETOUR MARCHÉ » a été posée sur **les deux** — sinon elle aurait dépendu du chemin
d'impression choisi, ce qui est précisément le genre de divergence que ce projet combat.

Placement : juste **sous le nom du produit, avant le lot** — c'est la première chose à savoir sur
ces macarons. Style : **noir plein inversé**, car une couleur ou une trame disparaît sur une
imprimante thermique monochrome.

### L'écran proposé après le rangement
`marketRetourExecuter` collecte les lignes « retour marché » créées et propose leurs étiquettes
juste après — ce sont les seules qui n'en ont aucune (les boîtes recréditées en ont déjà une). Les
boîtes **sans DLC** (aucune date connue sur les lots sortis) sont signalées en rouge, avec la
mention explicite que l'app n'en invente pas.

### Suite v1458 : 25 assertions (`tests/v1458-etiquette-retour-marche.test.js`)
Le marqueur est exposé par `buildLabelData`, la quantité reste le restant et le QR reste bâti sur le
numéro de lot — non-régressions v1454 (A) ; rendu HTML : **quantité imprimée** (elle ne l'était pas
du tout), bandeau retour présent et placé avant le lot, absent sur un lot normal, aucune ligne
fantôme quand la quantité est inconnue (B) ; rendu canvas : même bandeau, même ordre, en gras (C) ;
style inversé pour la thermique (D) ; écran d'étiquettes proposé seulement s'il y a des lignes
retour, moteur d'impression existant réutilisé, boîtes sans DLC signalées, pas d'écran vide (E).

**Sensibilité vérifiée par mutation réelle de `app.js`** : retirer la quantité et le bandeau du
rendu HTML fait rougir 3 assertions, sans planter la suite.

---

## 2026-08-05 — MACARONS VENDUS SUR LE MOIS, ET LA DATE DU JOUR  (v1458 → **v1459**)

**Demandé par Ben** : « Peux tu afficher sur l'écran d'accueil le nombre de macarons vendus sur le
mois ? Et sur le tableau de bord indiquer la date du jour, pas seulement le mois ? »

*(L'accueil **est** le tableau de bord — même écran, `renderDash`. Les deux demandes portent donc
sur la même page.)*

### Le piège : « vendus » n'est pas « sortis »
`orderTotalMacarons` existe déjà et compte tous les macarons d'une commande, **dons compris**.
C'est **voulu** : elle sert à lier les lots de production, et un macaron offert quitte bien le
stock physiquement. La réutiliser telle quelle pour ce compteur aurait fait passer les dons pour du
chiffre d'affaires.

Un compteur distinct a donc été écrit (`orderMacaronsVendus`), et **les deux doivent coexister** :
les confondre ferait soit disparaître les dons de la production, soit les faire passer pour des
ventes. Les **reprises d'historique** sont également exclues — elles décrivent des ventes déjà
faites ailleurs, les recompter gonflerait le mois courant.

Côté marchés, la règle du « vendu » (`sortie − retour − don − perte`) **n'est pas redite** :
`marketLineSummary` est réutilisée.

**Période retenue** : la **date de la commande**, la même base que le compteur de commandes affiché
juste à côté — et volontairement **pas** la date d'encaissement. Un paiement partiel ne dit pas
quels macarons il couvre ; inventer cette répartition donnerait un compte faux d'apparence exacte.

### La date
Le bandeau affichait `month:'long', year:'numeric'`. Il montre désormais aussi le jour et le jour de
la semaine. L'espacement de lettres du style (`.14em` + majuscules) a dû être resserré : la chaîne
plus longue débordait sur un écran étroit.

### Suite v1459 : 27 assertions (`tests/v1459-macarons-vendus-mois.test.js`)
Chaque type de ligne compte pour ce qu'il vend, prestation à zéro (A) ; **les dons sont exclus des
ventes mais restent comptés par `orderTotalMacarons`, et les deux fonctions divergent bien** (B) ;
commande mixte, chiffres réels (C) ; périmètre du calcul d'accueil — reprises et histo exclus,
filtre de mois, marchés ajoutés, chargement des mouvements seulement s'il y a un marché, échec côté
marché n'empêchant pas l'accueil de s'afficher (D) ; affichage masqué en mode discret (E) ; date du
jour dans le bandeau (F).

### ⚠️ DEUX MUTATIONS BLANCHES AVANT D'EN TROUVER UNE VRAIE
La vérification par mutation a d'abord donné **27 verts deux fois de suite** :
1. Retirer la garde `if(ln.type==='don') return;` — sans effet, car la fonction n'a **aucune**
   branche `don` : une ligne de don n'y contribue déjà rien.
2. Ajouter une branche `don` en laissant la garde — sans effet non plus, la garde l'interceptant
   avant.

**Deux protections redondantes se masquaient mutuellement.** Il a fallu retirer la garde **et**
ajouter la branche — la vraie erreur qu'on commettrait en recopiant `orderTotalMacarons` — pour
obtenir 4 rouges, exactement sur les assertions concernant les dons.

Leçon : une mutation qui laisse tout vert ne prouve pas que le test est aveugle ; elle peut aussi
signaler qu'on a muté du code sans effet. Il faut alors comprendre **pourquoi** avant de conclure,
et non déclarer le test insensible. La garde redondante a été **conservée** : elle documente
l'intention et protège d'un futur copier-coller.

---

## 2026-08-05 — MACARONS VENDUS DU MOIS : DEUX DÉFAUTS  (v1459 → **v1460**)

**Signalé par Ben**, sur la ligne « 🍬 X macaron(s) vendu(s) » de la carte CA de l'accueil : « je la
vois mais le chiffre me paraît faux ».

### ⚠️ Note de version
Ben avait demandé cette ligne (et la date du jour) au tour précédent. **Les deux existaient déjà**
dans la base de travail, ajoutées sous le tag **v1459** — code et changelog présents, mais
`APP_VERSION` resté à v1458 et fichier de test absent. La présente livraison **corrige** cette
v1459 plutôt que de la refaire, et prend donc le numéro **v1460**. La date du jour, elle, était
correcte : vérifiée, rien touché.

### Les deux défauts
① **Période incohérente avec le CA de la même carte.** Les macarons comptaient les commandes
**datées** du mois ; le CA juste au-dessus compte les **encaissements**. Une commande de juillet
payée en août affichait son CA en août et ses macarons en juillet — deux chiffres côte à côte
décrivant deux choses différentes. C'est très probablement ce que Ben a vu.

② **Double comptage mère/fille.** Quand un client paie une grosse commande d'avance (la « mère »)
puis vient la chercher en plusieurs fois, chaque venue est une commande « fille » portant **ses
propres lignes de macarons**. La somme comptait la mère **et** ses filles. Le CA, lui, était protégé
(règle d'or : une fille n'a jamais de paiement propre) — mais le compteur de macarons n'avait pas
cette protection.

### Le choix de Ben, et pourquoi il règle les deux
Compter les macarons des commandes **encaissées** du mois, même base que le CA. Ce choix élimine ②
**à la racine** : une fille n'ayant aucun paiement, elle pèse zéro sur cette base — aucune règle
d'exclusion supplémentaire à écrire, donc aucune à oublier plus tard.

**Paiement partiel** : le montant encaissé ne dit pas *quels* macarons il couvre. On répartit au
**prorata du montant** — exactement ce que fait déjà le CA, qui étale l'argent d'une commande sur
ses mois de paiement. Ratio **plafonné à 1** : un trop-perçu ne peut pas faire apparaître plus de
macarons que la commande n'en contient. Le total est arrondi **une seule fois, à la fin** : arrondir
commande par commande accumulerait l'erreur.

### Suite v1459/v1460 : 20 assertions (`tests/v1459-macarons-vendus-mois.test.js`)
Le cas de Ben — mère payée d'avance + deux filles de retrait — compté une seule fois (A) ; le mois
du paiement décide, commande non payée à zéro (B) ; **réconciliation** — les mois de paiement d'une
commande étalée totalisent exactement ses macarons, trop-perçu plafonné (C) ; exclusions reprise /
historique / prestation sans macaron, montant nul sans division par zéro, paiement sans date
rattaché comme le fait le CA (D) ; gardes statiques, dont la vérification que le **commentaire du
code n'affirme plus le contraire de ce qu'il fait** (E).

**Sensibilité vérifiée par mutation réelle de `app.js`** : revenir à la base « date de commande »
fait rougir 8 assertions, dont celle du double comptage mère/fille.

---

## 2026-08-05 — LES MACARONS COMPTÉS AU MÊME ENDROIT QUE LE CA  (v1460 → **v1461**)

**Signalé par Ben** : « les macarons comptés ne semblent pas justes, premièrement parce qu'ils ne
comptent pas les marchés et deuxièmement même isolés du marché le compte semble faux ». Il demande
aussi d'afficher, à côté du %, le nombre de macarons sur **chaque ligne** du détail.

### 🚨 La cause racine
Le tableau de bord refaisait sa **propre addition** des macarons, à côté de celle du CA. Deux
écritures de la même règle finissent toujours par diverger — c'est le défaut nommé en v1339. Elles
divergeaient ici sur **deux** points à la fois : le périmètre des marchés, et le prorata des
paiements partiels. Les corrections successives (v1459, v1460) traitaient la formule sans traiter la
**duplication** : tant que le calcul existait à deux endroits, il pouvait redevenir faux.

Le compte vit désormais **dans `caDuMois`**, la fonction qui produit déjà le CA. Elle renvoie
`totalMac` et, sur **chaque ligne**, la part de macarons correspondante. La carte n'y lit plus qu'un
total ; le détail affiche la part par ligne. Carte et détail ne peuvent plus se contredire par
construction — et le total devient vérifiable à l'œil, ce que Ben demandait précisément.

### Ce que ça révèle sur les marchés
La clôture d'un marché **n'exige aucun comptage** de sortie/retour : elle ne demande que les
encaissements. Un marché clos sans mouvement a donc un nombre de macarons **inconnu, pas nul**.
L'app l'additionnait comme un `0`, ce qui faisait passer un compte **incomplet** pour un compte
juste. Elle le signale maintenant : avertissement rouge sur la carte (« N marché(s) sans comptage
saisi — leurs macarons manquent ») et mention « 🍬 non compté » sur la ligne du marché dans le
détail, au lieu d'un zéro trompeur.

### Suite v1461 : 30 assertions (`tests/v1461-macarons-source-unique.test.js`)
Macarons comptés avec le CA, part portée par chaque ligne (A) ; **les marchés sont comptés**, ligne
et total (B) ; marché sans mouvement — signalé, aucun macaron inventé (C) ; non-régressions des
corrections précédentes : mère/fille comptée une fois, prorata sur paiement partiel avec
réconciliation sur deux mois, reprise exclue, trop-perçu plafonné, commande non payée, montant nul,
paiement sans date (D) ; gardes statiques que la carte **lit** la source unique et ne recalcule plus
(E) ; macarons affichés par ligne dans le détail (F). Sensibilité vérifiée par mutation réelle.

### ⚠️ Retrait de la suite v1459
Son sujet — la boucle propre au tableau de bord — **n'existe plus**. Ses cas ont d'abord été
**portés dans v1461** (commande non payée, montant nul, paiement sans date, commande historique),
puis la suite a été retirée de `run-all.js`. Vérifié au passage, plutôt que supposé : `o.histo` est
**déjà** couvert par `estReprise` (qui renvoie `true` si `o.histo===true`) — l'ancienne double
condition était redondante, son retrait ne change rien.

### Deux harnais de test cassés par ce refactor (et pourquoi ce n'étaient pas des bugs)
`v1444` construisait `caDuMois` sans les dépendances que celle-ci a acquises (`round3`,
`marketMoves`, `marketLineSummary`…) → complété, en neutralisant explicitement le comptage de
macarons puisque cette suite vérifie le CA. `v1459` extrayait une boucle supprimée → retirée comme
ci-dessus. Diagnostiqués avant conclusion : aucun des deux ne signalait un défaut applicatif.

---

## 2026-08-05 — MACARONS : LA CARTE ET LE DÉTAIL ARRONDISSAIENT SÉPARÉMENT  (v1461 → **v1462**)

**Signalé par Ben**, en réponse directe à la livraison précédente : « Mais non. Si tu additionnes
l'ensemble ça ne fait pas 318.. »

### Un vrai bug d'arrondi, pas une erreur de lecture
Un paiement partiel proratise les macarons d'une commande — le résultat est une **fraction**
(69,006 macarons, pas 69 pile). Avant ce correctif :
- la **carte** additionnait ces fractions BRUTES sur tout le mois, puis arrondissait le **total** ;
- le **détail** arrondissait **chaque ligne séparément**, à l'affichage.

Arrondir un total et additionner des arrondis individuels ne donnent **pas toujours** le même
résultat — c'est le paradoxe de répartition classique (le même que celui des sièges d'une élection
à la proportionnelle). Rien ne garantissait que les deux tombent sur le même chiffre. Sur la capture
précise que Ben a envoyée, une reconstitution à la main donnait 318 des deux côtés par coïncidence —
le bug reste réel, il se manifeste dès que les fractions tombent autrement, ce qui est le cas
courant.

### Le fix
Un macaron n'existe pas en fraction de toute façon. Chaque **ligne** est désormais arrondie **à la
source**, dans `caDuMois`, et le **total** est la somme de ces entiers déjà arrondis — jamais un
second arrondi indépendant. Carte et détail lisent alors littéralement la même addition : ils ne
peuvent plus diverger, par construction.

### Suite v1462 : 34 assertions (`tests/v1462-macarons-arrondi-coherent.test.js`)
**Reconstitution exacte du cas de Ben** — 5 paiements + 1 marché, fractions construites pour
reproduire précisément « 69, 6, 4, 4, 16 » — total et détail reconciliés à l'unité près (A) ;
**réconciliation systématique sur 30 tirages aléatoires**, pas un seul cas construit à la main :
c'est la garantie que la propriété tient en général, pas seulement sur l'exemple choisi (B) ; câblage
— plus aucun second arrondi côté affichage (C).

**Sensibilité vérifiée par mutation réelle de `app.js`** : revenir à l'arrondi séparé fait échouer 32
des 34 assertions, dont le cas exact de Ben et 30 des 30 tirages aléatoires.

### Deux incidents en cours de route, corrigés avant de conclure
Ma première vérification par mutation semblait presque vide (2 échecs sur un fichier de bac à
sable) : l'extraction n'avait pas repris ma toute dernière modification. Refaite avec le fichier
correctement reconstruit → 32 échecs, cohérents avec l'ampleur réelle du bug.

La régression complète a ensuite fait échouer `v1461` : une assertion statique de cette suite
lisait une tranche de caractères à taille FIXE (`APP.slice(i, i+900)`), et l'ajout d'un commentaire
en v1462 avait poussé le texte recherché hors de cette fenêtre. Remplacé par une découpe ancrée sur
le bloc de code suivant plutôt que sur un compte de caractères arbitraire — plus robuste aux futurs
ajouts de commentaires.

---

## 2026-08-05 — GRILLE TARIFAIRE DATÉE AU 01/09/2026 + VERROU ANTI-DATATION  (v1462 → **v1463**)

**Demandé par Ben** : « Nouveaux tarifs macarons à partir de toute commande passée à compter du
1er septembre 2026. Les commandes passées avant cette date ne sont pas impactées. » Puis, en
précision décisive : « si une commande est anti datée, c'est à dire par exemple entrée le
2 septembre mais livrée en janvier 2026, elle doit nécessairement garder l'ancien tarif ! Je veux
que tu verrouilles ça proprement pour que je puisse facilement rajouter des commandes au fil de
l'eau dans le passé. »

### 🚨 Le risque écarté
Seuls les **coffrets** scellaient leur prix sur la ligne (`prixUnitaireApplique`). Événement, vrac
pro, sachet, pyramide et personnalisation **recalculaient leur prix à chaque affichage** depuis des
constantes. Changer simplement les valeurs aurait **retarifé rétroactivement** toutes les commandes
déjà passées de ces types : factures émises, CA encaissé, marges, déclarations URSSAF.

### La grille datée
`TARIF_GRILLES` : la nouvelle grille au 01/09/2026, l'ancienne avant. Chaque ligne enregistrée porte
`tarifRef` = **la date de sa commande**, posée **une seule fois** et jamais rafraîchie — rouvrir une
vieille commande ne la retarife pas. Une ligne **sans** `tarifRef` est forcément antérieure à cette
version : elle retombe sur l'ancienne grille, donc **aucune migration des données existantes n'est
nécessaire**.

### Les trois verrous (issus directement de la précision de Ben)
1. **Aucun repli sur la date du jour.** Mon premier jet retombait sur `today()` quand la date était
   absente — une commande antidatée mal remplie serait passée au nouveau tarif. Le repli est
   désormais vide, et une date inconnue applique l'**ancienne** grille : dans le doute, on ne
   surfacture jamais.
2. **La grille datée prime sur le catalogue produits.** Les coffrets lisent leur prix dans un
   catalogue éditable qui reflète le tarif *courant* : une commande de janvier saisie en septembre
   aurait pris les prix de septembre. Le prix scellé reste prioritaire, puis la grille de la ligne,
   puis seulement le catalogue.
3. **Un bandeau visible** annonce la grille appliquée (« commande antidatée, les tarifs de sa date
   sont conservés ») et les prix affichés se recalculent quand la date change. Un verrou invisible
   ne se vérifie pas.

### ⚠️ Limite signalée à Ben
Une commande ne stocke **qu'une seule date**, celle de livraison — il n'existe pas de date de prise
de commande distincte. Le verrou s'appuie donc dessus. Cela couvre parfaitement le cas de Ben
(livrée en janvier → tarifs de janvier), mais **pas** celui d'une commande prise le 25 août et
livrée le 10 septembre, qui basculerait au nouveau tarif. Signalé, en attente de son retour.

### Nouveaux tarifs et nouvelles options
Coffrets 14/18/22/34/50 € · sachet 1/2/3 pièces à 2,50/5/6,50 € (**non linéaire** : le 3 pièces est
à 6,50 € et non 7,50 €) · événement 1,90 € · pyramide 22 € · **pro occasionnel 1,75 €** et **pro
récurrent 1,60 €** (nouveau mode, 3 boutons affichant chacun son prix réel à la date de la
commande) · personnalisation couleurs 0,30 € (11 sites de calcul convertis).

**Logo dégressif** : 1 € sous 100, 0,80 € de 100 à 300 (**bornes incluses**), 0,70 € au-delà — le
palier s'applique à **tout le volume** (150 pièces = 150 × 0,80 €, pas 99 × 1 € puis 51 × 0,80 €).
**Forfait création 40 € PAR MODÈLE** (précision de Ben : « si il y a 2 modèles alors 2 × le prix »),
donc un nombre, pas une case à cocher. Les deux apparaissent sur les **devis et factures** : un
montant facturé doit figurer sur le document, et ils entrent dans le brut du calcul de remise.

### Suite v1463 : 52 assertions (`tests/v1463-grille-tarifaire-datee.test.js`)
La grille au centime (A) ; **le verrou anti-datation** — scénario exact de Ben, plus les bornes de
bascule au 31/08 et 01/09 (B) ; sans date → ancien tarif (C) ; paliers logo avec bornes incluses
(D) ; forfait par modèle (E) ; câblage et ordre de priorité des sources de prix (F) ; options
visibles sur les documents (G).

**Sensibilité vérifiée par mutation réelle de `app.js`** : retirer la priorité de la grille sur le
catalogue et remettre le repli `today()` fait rougir 3 assertions.

⚠️ **Une assertion était faussement verte** et a été durcie : elle comparait deux `indexOf` sans
vérifier la présence, or `indexOf` renvoie −1 quand le texte disparaît — et −1 est inférieur à tout.
Elle passait donc précisément quand la protection était retirée. Constaté par mutation, corrigé,
re-vérifié (2 échecs → 3).

### Un harnais cassé par ce chantier
`v1452` construisait `lineTotalBase` sans les dépendances devenues nécessaires (`TARIF_GRILLES`,
`sachetPrixPour`…) → complété. Ses lignes de test n'ont pas de `tarifRef` et retombent donc sur la
grille historique : c'est exactement le comportement attendu pour des commandes antérieures.

---

## 2026-08-06 — CASE « ANCIENS TARIFS » ET GROS MACARONS  (v1463 → **v1464**)

**Demandé par Ben**, en réponse à la limite que je lui avais signalée : « Non au pire tu ajoutes une
case à cocher ancien tarifs. Si c'est coché alors tous les sélecteurs affichent l'ancien tarif. Si
rien de coché on reste sur le prix en vigueur. Comme ça c'est plus simple. Tu rajouteras également
les gros macarons à 7€ tarifs grand public et 3,80 en tarif pro. »

### Ce que la case résout
La v1463 déduisait la grille de la **date** de la commande. Mais l'app ne stocke qu'**une** date,
celle de livraison : une commande **prise avant le 01/09/2026 et livrée après** basculait donc au
nouveau tarif, contre la règle de Ben. Plutôt qu'un second champ de date, il a choisi une case —
plus simple, et surtout **explicite**.

Conséquence de conception : un choix explicite doit **primer** sur une déduction automatique, qui
n'est qu'un défaut commode. `tarifsDeLigne` teste donc le drapeau **avant** la date, et
`tarifsSaisie` consulte la case **avant** de lire le champ Date — l'inverse aurait rendu la case
inopérante dès qu'une date récente était saisie.

Le drapeau est copié sur **chaque ligne** enregistrée : une ligne doit pouvoir se tarifer seule,
sans dépendre d'un champ de la commande que les calculs en aval ne reçoivent pas. Il est conservé à
la réouverture, et le bandeau de tarif annonce « case anciens tarifs cochée » pour que le choix
reste visible.

### Gros macarons
7 € grand public, 3,80 € pro, intégrés à la grille datée comme le reste — avant le 01/09/2026 les
anciens prix restent en vigueur (réglage `prixGrandFormatPro`, sinon 6,00/3,20 €). Le 2ᵉ argument de
`bigPrice` est **optionnel** : les appels d'affichage existants (tableau des tarifs, aide) restent
valides sans modification, seuls les trois sites de **calcul** passent la ligne.

### Suite v1463 étendue : 67 assertions
Sections H et I ajoutées : la case l'emporte sur une date récente (coffret, événement), le
comportement par défaut reste inchangé sans elle, le drapeau est testé avant la date, copié sur les
5 types de ligne et conservé à la réouverture (H) ; prix des gros macarons, absence d'imposition
avant le 01/09, signature rétrocompatible de `bigPrice` (I).

**Sensibilité vérifiée par mutation réelle de `app.js`** : retirer la priorité de la case sur la
date fait rougir 4 assertions.

---

## 2026-08-06 — CORRECTIF : LES NOUVEAUX TARIFS COFFRETS NE S'APPLIQUAIENT PAS EN SAISIE  (v1464 → **v1465**)

**Trouvé en préparant la réponse à Ben**, qui demandait comment tester les nouveaux tarifs dès le
mois d'août. En vérifiant le chemin qu'il allait emprunter, le défaut est apparu.

### Le défaut
Une ligne **en cours de saisie** n'a pas encore sa marque de tarif (`tarifRef`, posée seulement à
l'enregistrement). L'ordre de priorité de la v1463 la faisait donc retomber sur le **catalogue
produits**, qui contient les prix d'installation (12/16/22/28/42 €). Une commande datée de
septembre affichait donc **12 € pour un coffret de 6 au lieu de 14 €** — et ce prix faux était
**scellé** sur la commande à l'enregistrement, donc définitif.

L'ordre posé en v1463 protégeait correctement le passé (grille avant catalogue pour une ligne
*déjà enregistrée*), mais je n'avais pas vérifié le chemin d'une **saisie neuve**. La protection
regardait dans une seule direction.

Les autres types n'étaient pas touchés : sachets, événements, vrac pro et gros macarons n'ont pas de
catalogue et consultaient déjà la grille directement.

### Le fix
La grille datée prime désormais sur le catalogue **même sans marque de tarif** : une ligne en saisie
utilise la grille de la date affichée. Le catalogue ne sert plus que de **repli** pour les tailles
absentes de la grille (formats sur mesure).

⚠️ **Conséquence à connaître** : un prix que Ben aurait personnalisé dans le catalogue pour une
taille standard n'est plus prioritaire. Signalé — à ajuster s'il préfère l'inverse.

### Suite v1463 étendue : 75 assertions (section J)
Ordre de priorité vérifié avec exigence de **présence** avant comparaison (la leçon du `indexOf`
à −1) ; **scénario chiffré exact** — saisie datée de septembre, ligne sans marque de tarif → 14 € et
non les 12 € du catalogue, 50 € et non 42 € pour le 25 ; un prix déjà scellé reste intouché ; une
ligne « ancien tarif » garde 12 € malgré la date de saisie.

**Sensibilité vérifiée par réintroduction du défaut exact** : remettre le catalogue prioritaire fait
rougir 3 assertions, avec les chiffres qui parlent (14 € attendu, 12 € obtenu).

---

## 2026-08-10 — LA CASE DÉCIDE, PLUS LA DATE  (v1465 → **v1466**)

**Ben, après avoir essayé** : « une commande, peu importe sa date de saisie, doit pouvoir afficher
les nouveaux prix, c'est-à-dire ceux après août 2026 si la case "appliquer les anciens tarifs" est
décochée. »

### Ce qui change, et pourquoi
La v1463 déduisait la grille de la **date de la commande**. Cette règle empêchait ce dont Ben a
réellement besoin : saisir **dès aujourd'hui**, en août, une commande aux nouveaux tarifs. La
déduction par la date est donc **abandonnée comme règle de tarification** — `tarifsPour` subsiste
pour *lire* une grille par date (consultation), mais ne décide plus d'un prix.

Règle désormais : **case décochée → tarifs en vigueur**, quelle que soit la date ; **case cochée →
anciens tarifs**. Un seul interrupteur, visible et explicite.

### Ce qui protège encore l'historique
Une ligne enregistrée **avant la v1463** n'a ni drapeau ni marque de tarif (`tarifRef`). Cette
**absence** sert de marqueur d'ancienneté et lui applique la grille historique : aucune facture déjà
émise ne bouge. Les coffrets restent **doublement** protégés, leur prix étant scellé sur la ligne.
`tarifRef` continue d'être enregistré — il ne pilote plus le prix, mais il date la saisie et
distingue une ligne récente d'une ligne héritée. C'est lui, le marqueur.

### Le bandeau réécrit
Il annonçait « commande antidatée, les tarifs de sa date sont conservés » — une phrase qui décrirait
désormais un comportement **inexistant**. Un repère qui ment est pire qu'un repère absent, puisque
Ben s'y fierait. Le libellé de la case a suivi.

### Suite v1463 mise à jour : 77 assertions
Assertions de la règle par date **réécrites** plutôt que supprimées : ligne héritée → ancien tarif
(protection de l'historique), ligne récente décochée → nouveaux tarifs même datée d'août **ou de
janvier**, case cochée → anciens tarifs quelle que soit la date (C) ; le drapeau est le **premier**
test de `tarifsDeLigne` et celle-ci ne consulte plus `tarifsPour` (H) ; `tarifsSaisie` ne lit plus
`f_date` (F).

**Sensibilité vérifiée par mutation réelle** : remettre la règle par date fait rougir 3 assertions.

### Un harnais complété
`v1452` construisait `tarifsDeLigne` sans les deux helpers introduits ici (`grilleCourante`,
`grilleHistorique`) → complété. Diagnostiqué avant conclusion : aucun défaut applicatif.

---

## 2026-08-10 — LE SÉLECTEUR AFFICHAIT LE PRIX DU CATALOGUE, PAS CELUI APPLIQUÉ  (v1466 → **v1467**)

**Capture de Ben** : bandeau « Tarifs au 1er septembre 2026 — tarifs en vigueur », case décochée,
date au 10 septembre — et la liste proposait pourtant « **Coffret 6 macarons — 12,00 €** ». Son
message : « Rien n'a changé ».

### La cause
La liste déroulante des tailles construisait ses libellés avec la valeur **brute** du catalogue
produits (`euro(p.prix)`), sans jamais passer par `coffretUnitPrice` — seule fonction qui connaît la
grille tarifaire et la case « anciens tarifs ».

Le prix **facturé** était pourtant correct depuis la v1465 : c'est l'**affichage** qui mentait. Et
c'est pire qu'un prix faux, parce que Ben choisit sur ce qu'il lit — il aurait renoncé à une
fonctionnalité qui marchait, ou pire, douté du montant réellement facturé.

**Ce que ça révèle sur mes deux correctifs précédents** : j'ai corrigé deux fois la *fonction de
calcul* (v1463 puis v1465) sans jamais vérifier ce que l'écran **affiche**. La leçon est la même
qu'en v1458 (la quantité calculée mais jamais imprimée) et qu'en v1428 (fonction juste, câblage
absent) : une valeur correcte qui n'atteint pas l'écran n'est pas une fonctionnalité.

### Le fix
Chaque option de la liste affiche désormais le prix **réellement appliqué**, en passant par
`coffretUnitPrice` avec le contexte de la ligne (case comprise). `data-prix` porte la même valeur,
pour que l'attribut et le libellé ne puissent pas diverger.

### Le catalogue produits aligné, prudemment
Le catalogue conservait les prix d'installation : Ben y aurait lu 12 € pour un coffret facturé 14 €.
`alignerCatalogueSurGrille()` le met à jour au démarrage — mais **uniquement** les entrées encore au
prix historique **exact**. Un prix que Ben aurait personnalisé n'est jamais écrasé (l'app n'a pas à
défaire une décision qu'elle ne comprend pas), et les tailles sur mesure absentes de la grille sont
laissées intactes. Idempotente.

### Suite v1463 : 85 assertions (sections K et L)
Le libellé du sélecteur passe par `coffretUnitPrice`, n'affiche plus le prix brut, tient compte de
la case, et `data-prix` reste cohérent avec le libellé (K) ; alignement du catalogue — prix
personnalisé jamais écrasé, tailles hors grille intactes, idempotence, n'écrit que le prix (L).

**Sensibilité vérifiée par réintroduction du défaut exact de la capture** : remettre `euro(p.prix)`
dans le sélecteur fait rougir les 4 assertions de la section K.

---

## 2026-08-10 — LES OPTIONS SUIVAIENT ENCORE LA DATE, PAS LA CASE  (v1467 → **v1468**)

**Signalé par Ben** : « la mise à jour de +0,30cts pour la personnalisation des couleurs n'est pas
passé. Quoi que je coche ça reste à 25cts. »

### La cause
En **v1466**, la tarification des **lignes** est passée de la date à la case. Mais les options de
niveau **commande** — personnalisation couleurs, logo, forfait création — sont restées sur
l'ancienne règle, par date. Comme on est en août, elles retombaient sur la grille historique, et la
case n'avait **aucune prise** sur elles.

C'est un changement de règle appliqué **à moitié** : j'ai converti ce que je regardais (les lignes)
sans chercher tout ce qui dépendait de l'ancienne règle. Le troisième défaut de la même famille dans
ce chantier — après le prix calculé mais mal affiché (v1467) et le prix affiché depuis le mauvais
endroit (v1465).

### Le fix
Les trois options prennent désormais un **contexte** (l'objet commande, ou le formulaire en cours)
au lieu d'une date, et passent par le même résolveur que les lignes :
- commande **cochée** → anciens tarifs ;
- commande **récente non cochée** → tarifs en vigueur ;
- commande **héritée**, sans marqueur → grille historique, donc aucune facture émise ne bouge.

Un marqueur de tarif est désormais posé au **niveau commande** aussi (pendant de celui des lignes),
pour distinguer une commande saisie depuis la v1463 d'une commande héritée.

### Suite v1463 : 98 assertions (section M)
Les trois moteurs ne consultent plus `tarifsPour` et passent par le contexte commun ; résolution du
contexte (objet → sa grille, rien → le formulaire donc la case) ; **chiffres exacts de Ben** —
commande récente non cochée → 0,30 €, cochée → 0,25 €, héritée → 0,25 € ; le logo et le forfait
suivent la même règle et restent à 0 sur une commande héritée.

Trois assertions de la section B, qui passaient encore une **date**, ont été réécrites avec le
contexte plutôt que supprimées.

**Sensibilité vérifiée par réintroduction du défaut exact** : remettre la règle par date fait rougir
3 assertions, dont celle qui compare 0,30 € et 0,25 €.

---

## 2026-08-11 — AFFICHÉ ≠ FACTURÉ, ET SACHET REMIS AU LINÉAIRE  (v1468 → **v1469**)

Deux captures de Ben, sur un sachet de 3 macarons aux couleurs personnalisées.

### 1. Une ligne en cours de saisie était tarifée comme une ligne héritée
Le sachet annonçait **6,50 €** dans son encadré, et « Montant ligne » facturait **7,50 €**.

**Cause** : l'absence de marqueur de tarif signifie « ligne **héritée** → grille historique ». C'est
juste pour une ligne **enregistrée** — c'est même ce qui protège l'historique — mais **faux** pour
une ligne qu'on est en train de saisir, qui n'a simplement pas encore reçu son marqueur. L'affichage
consultait la case, le calcul non : deux réponses pour la même ligne.

**Fix** : un résolveur distinct, `tarifsLigneSaisie`, sert le **modèle d'édition** ; les lignes
enregistrées gardent `tarifsDeLigne`. La distinction porte sur le chemin de code (saisie vs
stocké), seul critère qui sépare vraiment les deux cas. Le **vrac** et le **grand format** avaient
la même faille — corrigés du même coup, avant qu'ils ne se manifestent.

### 2. Les prix affichés de la personnalisation étaient figés
« Personnalisation des couleurs (+0,25 €/macaron) » sur la case, « (3×0,25 €) » dans le
récapitulatif, et la fiche d'aide — alors que le calcul appliquait bien **0,30 €** (le total
affichait +0,90 €, soit 3 × 0,30). Le total était juste, l'écran mentait. Troisième occurrence de
cette famille dans le chantier tarifaire.

### 3. Sachet : linéaire, dans tous les cas
**Tranché par Ben** : « peu importe la date le montant du macaron à l'unité est de 2,50€ », et un
sachet de 3 fait « **7,50 € dans tous les cas — toujours 3 × 2,50 €** ». La grille de septembre
annonçait « 1/2/3 = 2,5/5/6,5 € » ; la question a été posée plutôt que tranchée seul, parce qu'il
s'agit d'argent. Le sachet n'est donc **pas dégressif** et **ne change pas** avec la grille — la
case est volontairement sans effet sur lui.

### Suite v1463 : 111 assertions (sections N et O)
Résolveur de saisie distinct, drapeau toujours prioritaire, ligne neuve suivant le formulaire ; les
trois types du modèle d'édition l'utilisent ; **les lignes enregistrées gardent l'autre résolveur**
— garde explicite de la protection de l'historique (N). Les trois affichages de la personnalisation
ne contiennent plus de prix en dur (O). Assertions du sachet réécrites selon la décision de Ben.

**Sensibilité vérifiée par réintroduction des deux défauts exacts des captures** : 3 assertions
rougissent.

### Un harnais complété
`v1452` ne connaissait pas le nouveau résolveur → `tarifsSaisie` y est stubbée sur la grille
historique, ce qui correspond au comportement attendu pour ses cas anciens.

---

## 2026-08-11 — IMPOSSIBLE D'AJOUTER UN NOUVEAU CLIENT  (v1469 → **v1470**)

**Signalé par Ben** : « Impossible de rajouter un nouveau client via la fiche client. C'est un bug
que je n'avais pas avant. »

### La régression
Le bouton « + Nouveau client » de l'écran Clients appelait **`clientFiche()`** — la vue « fiche
client intelligente » — **sans identifiant**. Or celle-ci convertit son argument en nombre :
`+undefined` donne `NaN`, aucun client n'est trouvé, elle affiche « Client introuvable » et
s'arrête. Le bouton ne pouvait donc **rien** ouvrir.

Introduite quand la fiche intelligente a remplacé l'ancien écran client : le bouton d'**ajout** a
suivi la nouvelle fonction, alors qu'il devait continuer de pointer vers le **formulaire de
création** (`clientForm`) — seule fonction conçue pour fonctionner sans client existant (elle part
d'un objet vide, adapte son titre « Nouveau » / « Fiche », et masque le bouton Supprimer).

Le tour de main qui a permis de trouver vite : `saveClient` n'appelle `withSync` que dans la branche
**création**. C'était le premier suspect — mais la vérification l'a innocenté, et remonter les
points d'entrée a mené au vrai coupable. Vérifier une hypothèse plutôt que la suivre a évité de
« corriger » du code sain.

### Le fix, et le garde-fou
Le bouton repointe vers le formulaire de création. Et `clientFiche` appelée **sans identifiant
valide** (vide, nul, zéro, négatif, non numérique) **redirige** désormais vers la création plutôt
que de laisser l'utilisateur sur un cul-de-sac — sans même interroger la base. Un seul point
d'entrée fautif suffisait à casser la fonction ; le garde-fou empêche qu'un autre reproduise le
même symptôme.

### Suite v1470 : 29 assertions (`tests/v1470-nouveau-client.test.js`)
Le bouton appelle bien la création, et **aucun appel `clientFiche()` sans argument ne subsiste dans
toute l'app** (A) ; `clientForm` sait fonctionner sans client, `saveClient` distingue création et
mise à jour, le nom reste obligatoire (B) ; le garde-fou est testé sur **six** valeurs invalides —
chacune ouvre la création, n'affiche pas « Client introuvable » et n'interroge pas la base — plus la
non-régression : avec un identifiant valide, la consultation fonctionne toujours (C).

**Sensibilité vérifiée par réintroduction du bug exact** : remettre le bouton sur `clientFiche()` et
retirer le garde-fou fait rougir 19 assertions.

---

## 2026-08-11 — PICKING GROUPÉ PAR DATE, ET LE SCAN PERMET ENFIN D'AGIR  (v1470 → **v1471**)

**Signalé par Ben** : « Le picking groupé n'est pas optimisé. Cette fonction doit permettre
d'agréger les commandes par dates exactes notamment. Ainsi je ne me retrouve pas avec l'ensemble
des commandes à venir précoché » et « le picking par scan ne fonctionne pas […] le qr code est bien
lu et j'ai bien un écran qui s'affiche mais à aucun endroit il est possible de sélectionner la
boîte pour consommer une partie de son contenu ou pour l'emporter intégralement ».

### Picking groupé
Chaque case portait `checked` **en dur**, sans aucun regroupement : préparer la vague du jour
obligeait à décocher une à une toutes les livraisons lointaines. Désormais une **section par date de
livraison exacte**, et **seule la date la plus proche est pré-cochée**. Un bouton par section coche
ou décoche toute une vague — ajouter la vague suivante devient un geste au lieu d'un nettoyage.

Traité au passage, lié à l'inquiétude de Ben sur les commandes « sous les radars » : une commande
**sans macaron** (prestation ou livraison seule) est grisée et signalée, au lieu d'être cochable
puis absente de l'étape « à sortir » — de quoi croire qu'elle a disparu.

### Le scan : la fonction existait, elle n'était pas branchée
`scanAffectResolve` ouvrait `traceProd` — la fiche de **traçabilité**, un écran de **consultation**.
`scanAffectChooseOrder`, juste en dessous, faisait exactement ce qu'il fallait, complète et
fonctionnelle… mais n'était atteignable que depuis un bouton interne d'une fiche production,
**jamais depuis un scan**. Encore une fonction juste sans câblage — même famille que v1428 et v1439.

Le scan aboutit maintenant sur un **écran d'actions** : servir une commande, emporter en marché,
retirer une quantité (casse / don / dégustation), consulter la traçabilité. Une boîte **vide** ou un
**composant non vendable** le dit explicitement, plutôt que d'afficher des boutons qui échoueraient
à l'étape suivante.

### Une sortie marché du lot scanné
`marketAddSortieParfum` puise en **FIFO sur tous les lots** du parfum : c'est juste quand on part
d'une quantité, mais l'**inverse** du geste de Ben, qui a désigné une boîte précise. D'où
`marketAddSortieDuLot`, calquée sur ses écritures (décrément, `marketMoves` avec
`stockAvant`/`stockApres`, journal de stock) sans le choix du lot, déjà fait par le scan. Le cas
« marché historique » reste traité comme ailleurs : donnée enregistrée, stock intact.

### Suite v1471 : 38 assertions (`tests/v1471-picking-scan.test.js`)
Regroupement par date, une seule date pré-cochée, plus aucune case en dur, bascule par section,
commande sans macaron signalée (A) ; le scan ouvre les actions et non la traçabilité, les quatre
gestes présents, boîte vide et composant non vendable refusés (B) ; **réconciliation** — ce qui sort
du stock est exactement ce qui part au marché, sortie partielle, boîte entière, refus au-delà du
contenu **sans écrire ni bouger le stock**, marché historique sans impact stock (C) ; écran marché —
marchés clos exclus, message utile si aucun, quantité bornée au contenu (D).

**Sensibilité vérifiée par réintroduction des trois défauts** : 7 assertions rougissent, chacune sur
son défaut.

### ⚠️ Point resté ouvert
Ben signale « une commande qui n'apparaît nulle part » dans le picking groupé. La piste du statut a
été **vérifiée et innocentée** (`normStatus` mappe « En cours » vers « À préparer », ces commandes
sont donc bien incluses). Restent deux causes possibles — commande déjà entièrement liée à des lots,
ou statut « Livrée ». En attente de l'identification de la commande pour ne pas corriger à l'aveugle.

---

## 2026-08-11 — CORRIGER LES HORAIRES D'UNE SESSION D'ATELIER  (v1471 → **v1472**)

**Demandé par Ben** : « Je veux pouvoir modifier heure de début et de fin de session d'atelier
(fermer une session laissée ouverte pendant un temps démesurément grand). »

### Pourquoi c'est plus qu'un confort
`prodSessionEnd` fixe **toujours** la fin à `Date.now()`. Une session oubliée toute la nuit
enregistre donc 14 h d'atelier — et ce temps alimente `prodTempsParParfum`, donc le **temps par
recette**, la **rentabilité par parfum** et le **coût de revient**. Une session fausse empoisonne
silencieusement des chiffres dont Ben se sert pour fixer ses prix.

### Le fix
Bouton « 🕐 Horaires » sur chaque session du journal, **ouverte ou déjà clôturée**. Début et fin
saisissables ; laisser la fin **vide** garde (ou rend) la session ouverte. Les heures sont
présentées en heure **locale** et non UTC — sinon Ben lirait une heure différente de celle qu'il a
réellement travaillée.

### La garde qui compte : les tâches suivent les bornes
Corriger les bornes sans toucher aux tâches produirait un temps par recette **supérieur à la
session qui le contient** — exactement l'anomalie que l'audit interne surveille déjà (INVARIANT T1).
Les tâches sont donc **ramenées** à l'intérieur : une tâche jamais arrêtée est clôturée avec la
session, une tâche qui déborde est rognée, une tâche en pause voit sa pause **soldée** à la fin
retenue. Choix assumé de ramener plutôt que refuser : la correction d'une session oubliée porte
justement sur des tâches restées en cours. Une fin antérieure au début est refusée.

### Suite v1472 : 26 assertions (`tests/v1472-session-horaires.test.js`)
**Le cas de Ben** — session ouverte à 9 h avec une tâche jamais arrêtée, clôturée à 11 h 30 : la
tâche suit, et **réconciliation** que sa durée ne dépasse pas celle de la session (A) ; tâches
débordant avant/après ramenées, tâche déjà conforme intacte, **toutes** les tâches dans les bornes,
aucune durée négative (B) ; pause soldée à la fin retenue (C) ; refus — fin avant début, début vide,
**sans rien enregistrer** (D) ; fin vide → session rouverte sans rouvrir les tâches terminées (E) ;
câblage, heure locale, `prodSessUpsert`, alerte de sauvegarde, arrêt du tic-tac (F).

**Sensibilité vérifiée par mutation réelle** : retirer le bornage des tâches et la garde
chronologique fait rougir 5 assertions.

---

## 2026-08-12 — AUDIT COMPLET : 15 TABLES N'ÉTAIENT PAS SAUVEGARDÉES  (v1472 → **v1473**)

**Demandé par Ben** : « repasses en vue l'ensemble de mon code et pars à la recherche de tous les
bugs possible. Prends ton temps, agis méthodiquement et n'invente rien. »

### Méthode
`app.js` fait 6,58 Mo — impossible à relire ligne à ligne, et prétendre le contraire serait
malhonnête. Audit conduit par **détecteurs automatiques** ciblant les familles de bugs qui ont
réellement mordu sur ce projet, **chaque signalement étant vérifié manuellement** avant d'être
présenté.

### Ce que l'audit a ÉCARTÉ (vérifié, pas supposé)
- Aucun appel à une méthode absente de `dexie_min` (`filter`, `sortBy`, `first`…) — classe v1428
- Aucun gestionnaire de clic pointant vers une fonction inexistante — classe v1439/v1470 (les 27
  candidats étaient des méthodes natives ou des mots de commentaires)
- **0 problème de portée transactionnelle sur 59 transactions.** Le premier passage en signalait
  12 : **tous faux positifs**, par découpage à fenêtre fixe. Refait par équilibrage d'accolades →
  0 alerte. C'est exactement la leçon déjà apprise sur ce projet (un analyseur avait produit 8 faux
  positifs sur 8) — d'où la vérification systématique avant annonce
- Aucun stock ne peut passer sous zéro : 21 décréments ont une garde en amont, les 8 restants sont
  soit des annulations symétriques (elles restituent ce qu'elles viennent de créditer), soit
  validés plus haut dans leur flux
- Helpers argent/quantité : 10/10 sur les pièges du flottant. Pourcentage CA et DLC de fusion :
  8/8 sur les cas limites
- Prix écrits en dur : uniquement dans des exemples pédagogiques et un `placeholder`, pas dans des
  libellés appliqués

### 🚨 Le défaut trouvé
`buildDump` parcourt exactement `TABLES` (31 entrées) alors que la base compte **46 tables**.
Quinze tables **utilisées** par l'app n'étaient ni sauvegardées ni restaurées — perdues
**silencieusement** lors d'une restauration sur appareil vierge ou après une purge iOS :
- **`stockMoves`** — journal des mouvements de stock, socle du fil de traçabilité d'une boîte
- **`journalCompta`** — journal comptable
- **`materialLosses`** — pertes de matières premières
- l'espace **R&D** (`rdIdees`, `rdTests`, `rdPreps`, `rdRefs`, `rdIngredients`), la communication
  (`posts`, `blocs`, `prospects`, `personas`) et `planOverrides`

`backups` et `errLog` restent **volontairement** exclus : sauvegarder la liste des sauvegardes n'a
pas de sens, et le journal d'erreurs est du diagnostic local qui gonflerait le fichier sans rien
protéger.

### Le piège de la correction, et sa parade
`applyDump` fait `db.table(t).clear()` **avant** de réinsérer. Ajouter les tables sans précaution
aurait fait qu'une **ancienne** sauvegarde — qui les ignore — **efface** la traçabilité, la compta
et la R&D dès la première restauration : l'inverse exact du but recherché.

La règle posée en v1372 pour `kv`/`auditLog` est donc **généralisée** : *une table absente du
fichier n'est pas une table vide, c'est une table inconnue de ce fichier* — elle est laissée
intacte. Le cas distinct est préservé : un **tableau vide est une mesure** (« il n'y avait rien »)
et vide donc bien la table, comme avant.

Les sauvegardes **déjà faites restent valides** : `backupChecksum` calcule sur le périmètre inscrit
**dans le fichier** (`_checksumTables`), jamais sur `TABLES` courant — la règle v1372, qui prend ici
tout son sens.

### Suite v1473 : 27 assertions (`tests/v1473-sauvegarde-completude.test.js`)
Tables critiques et R&D dans le périmètre, exclusions volontaires respectées (A) ; **balayage
générique** : aucune table utilisée par l'app n'est oubliée (B) ; la garde ignore au lieu de vider,
et s'applique **avant** le `clear()`, un tableau vide restant une mesure (C) ; **réconciliation** —
la somme de contrôle d'une ancienne sauvegarde est **inchangée** après élargissement, avec et sans
périmètre inscrit (D) ; le fichier produit embarque le nouveau périmètre (E).

**Sensibilité vérifiée par réintroduction des deux défauts** : 4 assertions rougissent.

### ⚠️ Deux constats hors code, à connaître
1. **`run-all.js` déclare 159 suites ; 25 seulement existent sur le disque.** 134 fichiers de test
   n'ont jamais fait partie des archives fournies. Quand une livraison annonce « toutes les suites
   vertes », il s'agit donc de 25 suites sur 159 — **84 % de la couverture ne s'exécute pas**. Des
   pans entiers (comptabilité, FIFO, trésorerie, assemblage, panier moyen, prix) sont censés être
   protégés et ne le sont pas.
2. **22 des 27 fichiers déclarés par le service worker ne sont pas dans les zips livrés** (dont
   `qr.min.js`, les polices, les icônes, le manifeste, les 14 packs de recettes). Ils existent chez
   Ben ; les zips ne doivent donc jamais être déployés **seuls** — uniquement en remplaçant les
   fichiers modifiés.

---

## 2026-08-16 — AUDIT, 2ᵉ PASSE : QUATRE ÉCRITURES DE PERTE DONT L'ÉCHEC ÉTAIT INVISIBLE  (v1473 → **v1474**)

Suite de l'audit demandé par Ben, sur des familles de défauts non couvertes au premier passage.

### 🚨 Le défaut
Quatre écritures de perte se terminaient par `.catch(e => console.error(...))`. En cas d'échec,
l'erreur partait dans la console — **invisible** pour Ben — et le flux **continuait** : message de
succès affiché, écran fermé.

Ce qui rend ça grave, c'est l'**ordre des opérations** :
- **Casse en production** : le stock est **décrémenté juste avant**. Échec → stock diminué, perte
  absente → coût matières et compta faussés, sans aucun signe.
- **Perte matière** : le lot est **supprimé juste après**. Échec → lot perdu **et** trace de sa
  perte perdue, avec un message « perte matière enregistrée ».
- **Casse au scan** et **écart au picking** : le stock est ajusté et le toast annonce « Stock mis à
  jour » quoi qu'il arrive.

**Règle posée** : une écriture qui échoue doit se **voir**. Les quatre préviennent désormais et
interrompent ; le lot matière n'est supprimé **qu'après** une écriture réussie.

### Ce qui garde volontairement son silence
Les écritures **accessoires** (journal d'audit, événements de calendrier) : leur échec ne fausse ni
stock ni comptabilité, interrompre l'utilisateur pour elles serait du bruit. Et les écritures déjà
protégées par une **transaction** — si elles échouent, le décrément qui les accompagne est annulé
avec elles, donc aucune désynchronisation n'est possible.

### La garde de motif a trouvé ce que l'inspection manuelle avait raté
L'assertion générique (aucune écriture avalée hors transaction sur `losses`, `materialLosses`,
`stockMoves`, `marketMoves`) est restée **rouge** après mes deux premières corrections : elle
pointait la casse au scan et l'écart au picking, que je n'avais pas vus. Elle a aussi d'abord
signalé une écriture **saine** (protégée par transaction) → le détecteur a été **affiné** plutôt que
le code « corrigé », conformément à la leçon des faux positifs de portée transactionnelle.

### Autres familles vérifiées ce passage — toutes saines
- **2 586 fonctions de premier niveau, aucun doublon de définition** (dans un fichier de 6,5 Mo,
  une redéfinition écraserait silencieusement la première)
- Aucun `forEach(async …)` contenant un `await` (écritures jamais attendues)
- Aucun `setTimeout("…")` (eval implicite), 7 `parseInt` sans base mais tous sur des durées ou des
  pixels — jamais sur une date, où le piège `08`/`09` mordrait
- **22 divisions sans garde apparente** : sans danger, car tout chiffre passe par `euro()` ou
  `qty()` avant affichage, et ces deux-là neutralisent NaN, Infinity, null, undefined et texte
  (16 cas testés dynamiquement)

### Suite v1474 : 16 assertions (`tests/v1474-pertes-echec-visible.test.js`)
Casse en production — plus de catch silencieux, toast d'alerte, **interruption du flux**, message
disant quoi faire (A) ; perte matière — le lot n'est supprimé **qu'après** écriture réussie (B) ;
les écritures accessoires gardent leur silence, c'est voulu (C) ; **garde de motif** sur les quatre
tables critiques, transactions exclues (D).

**Sensibilité vérifiée par réintroduction** : remettre le catch silencieux fait rougir 6 assertions.

---

## 2026-08-16 — LE CA DU TABLEAU DE BORD RESTAIT FIGÉ  (v1474 → **v1475**)

**Signalé par Ben** : « Pourquoi le chiffre d'affaire n'évolue pas sur le tableau de bord ? Quand je
vais dans l'onglet année le CA de l'année en cours n'évolue pas malgré les commandes soldées. »

### Le moteur était sain — vérifié avant de chercher ailleurs
`_caLignesToutes` + `_caAgregeLignes` donnent bien 725 € pour trois paiements et un marché clos sur
2026, l'année précédente reste séparée, et la somme des mois égale l'année. Inutile de « corriger »
un calcul juste : le défaut était ailleurs.

### 🚨 La cause : le cache
`_caLignesCache` n'était vidé **que** par un rendu complet de l'accueil (`renderDash`). Deux
conséquences :
1. **Changer d'onglet** (Jour / Semaine / Mois / Année) appelle `caChartRender()`, qui **relisait le
   cache** au lieu de recharger → chiffres figés **à toutes les granularités**. Or changer d'onglet
   est précisément le geste de quelqu'un qui veut regarder ses chiffres.
2. L'accueil **reste monté** pendant qu'on saisit un encaissement ailleurs → au retour, le graphique
   affichait les chiffres d'**avant** la saisie, alors que la base était à jour.

### Le fix
Changer d'onglet **recharge**. Et `caInvalideCache()` est appelée par toute écriture d'argent : les
**quatre** points d'enregistrement de paiement, la sauvegarde d'une commande, la clôture d'un
marché.

### ⚠️ Le quatrième point a été trouvé par le test, pas par l'inspection
Mon `grep` manuel n'en voyait que trois ; l'assertion « tous les points d'écriture sont
instrumentés » en comptait quatre. J'ai d'abord cru mon détecteur imprécis et l'ai « corrigé » deux
fois — avant de vérifier ligne par ligne et de constater qu'**il avait raison** : un quatrième site
existait bien (l.24842), non instrumenté, et c'est probablement le plus utilisé puisqu'il enregistre
un encaissement complet. Leçon : quand un test contredit une inspection manuelle, vérifier le test
**et** l'inspection avant de trancher en faveur de l'humain.

### Suite v1475 : 18 assertions (`tests/v1475-ca-graphique-fige.test.js`)
Non-régression du moteur, dont la **réconciliation** somme des mois = année (A) ; le changement de
granularité vide le cache **avant** de redessiner (B) ; la fonction d'invalidation existe et **tous**
les points d'écriture l'appellent — compte exact vérifié, c'est lui qui a débusqué l'oubli (C) ; le
rendu conserve ses garanties d'origine, série jusqu'à aujourd'hui et périodes vides à zéro (D).

**Sensibilité vérifiée par réintroduction** : 2 assertions rougissent, dont le compte « 3/4 ».

---

## 2026-08-16 — CHERCHER LE CA MANQUANT  (v1475 → **v1476**)

**Ben, après la v1475** : « Le montant affiché n'est toujours pas correct. »

### Ce qui a été écarté AVANT de coder
Réconciliation sur données identiques : la **carte** du tableau de bord, le **graphique mensuel** et
le **graphique annuel** donnent exactement les mêmes chiffres, et la somme des mois égale l'année.
Les trois surfaces sont donc **cohérentes entre elles** — l'écart est entre l'app et la **réalité**
de Ben, pas une divergence interne. Corriger un calcul juste n'aurait rien donné.

### 🚨 Ce qu'un sondage des formes de données a révélé
`paiementsDe` ne compte une commande que si elle a un **registre de paiements non vide**, ou le
statut **exactement** « Payé ». Trois formes d'argent réel y échappent :
1. statut **« Partiel »** sans registre — un acompte encaissé, jamais compté ;
2. commande **soldée** dont le statut est resté **« En attente »** ;
3. registre présent mais dont **tous les montants valent 0**.

### Le choix : diagnostiquer, pas réparer
Compter automatiquement une commande « En attente » comme encaissée serait **inventer une recette**
— et fausserait une déclaration URSSAF. L'app **liste** donc les commandes concernées
(`auditCaManquant`, qui **n'écrit rien**), avec le motif, le nom du client et le montant en jeu.
Chaque ligne ouvre la commande pour saisir l'encaissement réel. Un lien « Chercher le CA manquant »
est posé dans les **deux** écrans de détail du CA, là où Ben constate l'écart.

Exclusions correctes, vérifiées par test : les commandes **filles** (leur argent vit sur la mère),
celles **sans montant**, et les **reprises d'historique** (hors CA par construction).

### Suite v1476 : 23 assertions (`tests/v1476-ca-manquant.test.js`)
Les trois formes qui échappent au CA (A) ; **non-régression** — registre, repli legacy « Payé »,
commandes filles, paiement sans date (B) ; le diagnostic trouve les 3 cas, **réconciliation du total
en jeu**, n'écrit rien, trie par montant décroissant, motifs distincts et lisibles (C) ; écran
atteignable depuis les deux détails, message rassurant si aucune anomalie (D).

**Sensibilité vérifiée par réintroduction** : retirer la garde « déjà compté » et l'exclusion des
filles fait rougir 4 assertions.

---

## 2026-08-17 — UNE SESSION DE 8 H AFFICHAIT 242 H  (v1476 → **v1477**)

**Capture de Ben** : session du 07/08, **21:20–05:34** (donc 8 h 14 réelles), 119 tâches, total
affiché **« 242 h 09 »**. Les pastilles de phases additionnées faisaient ~21 h. Trois chiffres
incompatibles — et c'est cette incohérence, visible dans sa capture, qui a mis sur la piste.

### 🚨 La cause, reconstituée au chiffre près
Une tâche n'avait **jamais été arrêtée**. `prodSessReelMs` et `prodTaskNet` prenaient alors
`Date.now()` comme fin : le chrono continuait de tourner des jours après la session, gonflant le
total de 24 h par jour. Calcul de vérification : l'écart entre le 07/08 21:20 et le jour de la
capture donne **242 h 09 exactement**. Le diagnostic n'était donc pas une hypothèse.

### Ce n'était pas qu'un affichage
Ce temps alimente `prodTempsParParfum` et le temps atelier agrégé, donc le **taux horaire** et le
**coût de revient** — des chiffres dont Ben se sert pour fixer ses prix. Le bornage a été appliqué
aux **cinq** endroits concernés : total de session, pastilles de phases, temps atelier agrégé, temps
par parfum, catégories de planification.

### La règle
Une session **clôturée** est bornée par sa fin : le temps ne peut pas courir dans une journée déjà
refermée, et une tâche oubliée s'arrête avec sa session. Seule une session **encore ouverte** mesure
jusqu'à maintenant — comportement voulu du chrono en cours, préservé et testé.

### La demande de Ben : corriger le temps par tâche
Bouton dédié sur chaque tâche. Saisie **en heures** ou **directement en minutes** — les deux se
présentent en atelier (« j'ai garni de 22 h à 23 h 30 » vs « ça m'a pris 40 minutes ») — les deux
champs se synchronisant. Une tâche **jamais arrêtée** est signalée dans la liste et dans le
formulaire. Les pauses sont **soldées** : la durée saisie devient le temps réellement travaillé,
sinon elles seraient retranchées une seconde fois.

**Gardes** : une tâche ne peut ni commencer avant sa session, ni finir après — sinon le temps par
recette dépasserait la session qui le contient, l'anomalie même que l'audit interne surveille
(INVARIANT T1) et la cause du « 242 h ».

### Suite v1477 : 29 assertions (`tests/v1477-chrono-tache-bornee.test.js`)
**Reconstitution du cas de Ben** — 8 h 14 et non 242 h, total jamais supérieur à la session, tâche
oubliée bornée, réconciliation sur toutes les tâches (A) ; session **ouverte** mesurant toujours
jusqu'à maintenant (B) ; pauses toujours déduites (C) ; les trois agrégats de coût bornés (D) ;
l'éditeur par tâche, ses deux modes de saisie et ses gardes (E).

**Sensibilité vérifiée par réintroduction** : remettre `Date.now()` comme borne et retirer la garde
de session fait rougir 5 assertions.

### ⚠️ Incident de manipulation, corrigé avant livraison
Une insertion par script a **tronqué une ligne** du bloc ajouté (échappement Python sur une chaîne
contenant des accolades). Détecté immédiatement par `node --check`. La base a été **restaurée depuis
le zip livré** et le bloc réinséré via un fichier séparé, validé isolément avant insertion — méthode
à préférer pour tout ajout de fonction contenant des gabarits.

---

## 2026-08-18 — DEUX SÉANCES ENCAPSULÉES DANS UNE SEULE  (v1477 → **v1478**)

**Demandé par Ben** : « sur la session ouverte j'ai en réalité 2 séances sur 2 jours différents,
toutes les tâches sont rattachées et encapsulées dans la séance du 7 août. J'aimerai que l'app
puisse automatiquement associer les séances au jour où celle-ci démarre. »

### ⚠️ Le piège écarté — le cœur de cette version
Sa séance va de **21:20 à 05:34** : elle **franchit minuit**. Une règle « un jour civil = une
séance » l'aurait **coupée en deux** alors que c'est **une seule nuit de travail continue** — et
aurait cassé précisément sa façon de produire. Prendre sa demande au pied de la lettre aurait donc
créé un défaut pire que celui qu'elle corrige.

Ce qui sépare deux séances chez lui n'est pas minuit, c'est le **temps sans rien faire** : il finit
à 05:34, il dort, il reprend le lendemain soir. **Seuil tranché par Ben : 4 h sans activité.**

### Le fonctionnement
`prodSeancesDe` (pure) regroupe les tâches par trou d'inactivité et date chaque séance du jour où
elle **démarre**, en heure locale. Les tâches qui **se chevauchent** sont gérées : la frontière est
calculée sur la fin la plus tardive atteinte, donc une longue tâche qui couvre le trou empêche à
juste titre la coupure — cas réel, sa session compte 119 tâches en parallèle.

**Ben valide** : le bouton « ✂️ N séances » n'apparaît que si un découpage est réellement détecté,
et un aperçu montre exactement ce qui sera créé (jour, horaires, nombre de tâches) **avant toute
écriture**. La première séance garde la fiche d'origine — donc son identifiant et son historique —
les suivantes deviennent des sessions distinctes. Aucune tâche n'est perdue ni modifiée.

### Empêcher la récurrence
`prodSessionStart` réutilisait **toujours** la session ouverte : c'est ainsi que les tâches du
9 août se sont retrouvées dans la séance du 7. Une session inactive depuis 4 h est désormais
clôturée **à sa dernière activité** — jamais à `Date.now()`, ce qui lui ferait absorber les heures
d'inactivité (le défaut « 242 h » corrigé en v1477) — et une séance neuve s'ouvre. Le seuil est
**partagé** avec le découpage : une seule définition de « séance » dans toute l'app.

### Suite v1478 : 29 assertions (`tests/v1478-seances-par-jour.test.js`)
**Le cas de Ben** — deux séances détectées, la nuit reste entière et datée du 07, la seconde datée
du 09, réconciliation qu'aucune tâche n'est perdue (A) ; ce qui ne doit **pas** être découpé —
pause de 3 h 59, nuit continue sur deux jours civils, seuil de 4 h inclusif (B) ; tâches qui se
chevauchent (C) ; tâche jamais arrêtée ne fabriquant pas de fausse coupure (D) ; application du
découpage (E) ; l'aperçu n'écrit rien (F) ; l'automatisme et son partage de seuil (G).

**Sensibilité vérifiée par mutation** : remettre la règle naïve « un jour civil = une séance » fait
rougir **8 assertions**, dont les deux qui protègent explicitement les nuits de travail.

### Méthode
Les deux blocs ajoutés ont été **écrits dans des fichiers séparés, validés isolément** (`node -c`)
puis **testés avant insertion** — méthode adoptée après l'incident de troncature de la v1477.

---

## 2026-08-18 — FACTURÉ vs ENCAISSÉ : DEUX CHIFFRES JUSTES  (v1478 → **v1479**)

**Ben, capture à l'appui** : « Pourquoi ces données ne se recoupent pas ? Regarde le "depuis le
début" et le cumulé de 2025/2026. » En-tête : **12 036,14 €** au fil de l'app. Graphique, onglet
Année : **10 325,59 €** sur 2025 + 2026.

### Les deux chiffres étaient exacts
- l'**en-tête** additionne le montant **facturé** des commandes (`o.montant`), encaissé ou non ;
- le **graphique** additionne les **encaissements** réels (`paiementsDe`).

L'écart de **1 710,55 €** est donc ce qui est facturé mais **pas encore encaissé**. Vérifié
arithmétiquement sur les chiffres de la capture : `12 036,14 + 637,75 = 12 673,89` (l'activité
globale), et `12 036,14 − 10 325,59 = 1 710,55`.

### 🚨 Le vrai défaut était d'affichage
Deux totaux côte à côte, **sans mention de leur base**, invitent à être comparés — et à conclure à
une erreur de l'app. Corriger un calcul juste n'aurait rien donné ; le travail était de **nommer**.

- L'en-tête annonce désormais « CA total depuis le début — **facturé** » et « activité globale
  cumulée (montant des commandes) ».
- Le graphique annonce « Chiffre d'affaires **encaissé** ».
- Quand un écart existe, une ligne le **chiffre**, le **nomme** (« facturé mais pas encore
  encaissé ») et **renvoie au détail** des commandes concernées — l'outil « Chercher le CA
  manquant » livré en v1476, qui prend ici tout son sens.

### Le total encaissé vient de la source unique
Il est lu depuis `_caLignesToutes` — la fonction qui alimente le graphique — et non recalculé par
une seconde addition. Une addition maison pourrait diverger du graphique et **recréer exactement le
problème corrigé** (leçon de la v1461 : un seul calcul, lu par tous les écrans). Le cache est
réutilisé quand il existe, et un échec de lecture ne casse pas l'accueil.

L'écart se compare au **fil de l'eau seul**, pas à l'activité globale : les reprises d'historique
sont hors CA encaissé par construction (déjà déclarées ailleurs), les inclure gonflerait l'écart à
tort — vérifié par une assertion dédiée.

### Suite v1479 : 23 assertions (`tests/v1479-facture-vs-encaisse.test.js`)
L'arithmétique exacte de la capture (A) ; les deux bases sont bien différentes par construction, et
aucune n'utilise la source de l'autre (B) ; le total encaissé vient de la source unique, l'écart ne
peut être négatif, un échec est absorbé (C) ; **chaque base est nommée à l'écran** (D) ; l'écart est
affiché seulement s'il existe, expliqué et relié au détail, masqué en confidentialité (E) ;
non-régression sur le traitement des reprises d'historique (F).

**Sensibilité vérifiée par réintroduction** : retirer les mentions de base et recalculer l'encaissé
par une addition maison fait rougir 3 assertions.

---

## 2026-08-20 — LE CALENDRIER GARDAIT LA DATE INITIALE  (v1479 → **v1480**)

**Ben** : « Une commande initialement prévue à une date qui s'intègre au calendrier ne se met pas à
jour lorsque la date est modifiée ultérieurement. Ainsi le calendrier affiche toujours la date
initialement enregistrée. »

### 🚨 La cause, vérifiée dans le moteur
`syncOrderEvent` était pourtant correcte : elle supprime l'ancien événement puis recrée le nouveau.
Le problème venait d'un cran plus bas — dans `dexie.min.js`, `equals(v)` est implémenté par
`x => x[index] === v` : une **égalité stricte**, donc **sensible au type**.

Un `refId` enregistré en **nombre** n'est jamais retrouvé par une recherche avec une **chaîne**, et
inversement. L'ancien événement **survivait** donc à la mise à jour pendant que le nouveau
s'ajoutait à côté : la date initiale restait affichée, doublée par la nouvelle. Reproduit en
laboratoire sur les quatre combinaisons de types avant d'écrire la moindre ligne de correctif.

### Le fix
Une purge **unique**, `purgeEventsCommande(oid)`, qui compare sur la **valeur** et non sur le type —
et qui nettoie **aussi les doublons déjà créés** par ce défaut. Sans ce rattrapage, les calendriers
déjà pollués le seraient restés.

### Le même piège servait sur trois autres chemins
Corriger le seul `syncOrderEvent` aurait laissé la faille ailleurs. Tous alignés sur la purge
unique :
- **suppression** d'une commande — son événement serait resté au calendrier ;
- **conversion en devis** — la commande disparaissait, l'événement non (aucun nettoyage n'existait) ;
- **snapshot d'annulation** — sans lui, restaurer une commande supprimée la ramenait **sans sa date**.

Les événements de **marché** conservent leur `equals` : leurs identifiants sont des chaînes
(`'mk'+id`) des deux côtés, donc sains. Une garde trop large aurait condamné du code correct — le
détecteur a été **affiné trois fois** plutôt que de « corriger » ce qui fonctionnait.

### Suite v1480 : 28 assertions (`tests/v1480-calendrier-date-modifiee.test.js`)
Les **quatre combinaisons de types** aboutissent à un seul événement, à la nouvelle date, l'ancienne
ayant disparu (A) ; rattrapage des doublons existants, en **préservant** les événements d'un autre
type et ceux des autres commandes (B) ; la purge n'attrape ni un `refId` nul ni la commande 70 quand
on vise la 7 (C) ; les quatre chemins utilisent la purge unique, avec garde de motif (D) ;
non-régression du comportement d'origine de `syncOrderEvent` (E).

**Sensibilité vérifiée par réintroduction** : 8 assertions rougissent, dont « l'ancienne date a
disparu » — le symptôme exact de Ben.

⚠️ La mutation **plantait** d'abord au lieu de rougir : les bacs à sable ne fournissaient pas
`where`, devenu inutile dans le code corrigé. Un stub **fidèle** au `equals` réel a été ajouté — une
suite qui plante ne prouve pas qu'un défaut est détecté.

---

## 2026-08-20 — UNE SEULE DATE DÉCIDE DE TOUT  (v1480 → **v1481**)

**Ben, après la v1480** : « la modification n'a rien apporté. La commande continue d'afficher la
date d'origine sur le calendrier, peu importe les modifications apportées par la suite. »

### ⚠️ Ma v1480 corrigeait un vrai défaut — mais pas le sien
J'avais traité la suppression de l'ancien événement (`equals` sensible au type) **sans tracer la
chaîne jusqu'à la donnée**. Le correctif était juste et reste utile ; il ne touchait simplement pas
la cause de son symptôme. Leçon : remonter jusqu'à **la valeur affichée** avant de corriger un
mécanisme, même quand le mécanisme est manifestement fautif.

### 🚨 La vraie cause
Le formulaire contenait **deux dates** :
- « **Date** », en haut — celle que Ben modifie → `o.date` ;
- « **Date de livraison** », dans le bloc 🚚 Livraison **replié par défaut** → `o.dateEvenement`.

Et `syncOrderEvent` pose `o.dateEvenement || o.date` : **la seconde prime**. Renseignée une fois,
elle fige le calendrier — et modifier la date du haut n'a plus aucun effet, exactement le symptôme
décrit.

### Tranché par Ben, et implémenté prudemment
« Une seule date : celle du haut décide de tout. »

`dateEvenement` est **lu à 32 endroits** (plan de production, rétroplanning, validité des devis).
Les réécrire un par un aurait été risqué pour un gain nul. Le champ est donc **conservé en base**
mais **alimenté par la date du haut** : un seul champ à saisir, une seule valeur possible. Le champ
en double a été retiré du formulaire et remplacé par une mention indiquant où saisir la date.

### Le rattrapage
Les commandes déjà en base gardaient leur ancienne date figée — sans migration, Ben aurait dû
rouvrir et réenregistrer chacune. `migrerDateUnique` les réaligne au démarrage et **resynchronise
leur calendrier**. Elle n'écrit **que** `dateEvenement`, jamais l'inverse : écraser `date` avec
l'ancienne valeur figerait précisément ce qu'on corrige. Elle ignore les commandes déjà cohérentes
et celles sans date de référence. Idempotente.

### Suite v1481 : 20 assertions (`tests/v1481-date-unique.test.js`)
La date du haut alimente les deux à l'enregistrement (A) ; le champ en double a disparu du
formulaire (B) ; **le rattrapage** — sens d'écriture, commandes épargnées, resynchronisation du
calendrier, idempotence, et **le cas exact de Ben** : une commande figée sur le 01/09 alors que sa
date est le 15/10 prend bien le 15/10 (C) ; une fois les deux dates alignées, le calendrier affiche
la bonne (D).

**Sensibilité vérifiée par réintroduction** : remettre la double saisie **et** inverser le sens de
la migration fait rougir 7 assertions, dont celle qui interdit l'inversion.

---

## 2026-08-21 — ASSEMBLAGE BLOQUÉ SUR COQUES BICOLORES MIGRÉES  (v1481 → **v1482**)

**Ben, capture à l'appui** : « les macarons chocolat passion sont chacun composés d'une coque orange
et d'une coque marron. Lorsque je veux faire un assemblage l'app me bloque » → *« Le second lot de
coques doit être différent du premier. »*

### 🚨 Deux défauts dans la capture, dont un non signalé
**① `#[object Object]`** s'affichait partout où le nom du parfum devait apparaître. `_prodRecName`
attend un **identifiant** de recette ; les **six** appels de cet écran lui passaient l'**objet lot**,
et le repli `'#'+rid` produisait littéralement cette chaîne. Le helper accepte désormais les deux
formes — plus sûr que corriger six appels et risquer d'en oublier un — et nomme aussi les lots sans
recette (produit libre).

**② Le blocage** : la liste du 2ᵉ lot de coques n'excluait **pas** le lot déjà choisi comme premier.
Il y figurait, et le sélectionner déclenchait le refus — incompréhensible, puisque l'app venait de
le proposer.

### Sur le fond : le lot de Ben se suffit à lui-même
`coqueColorProfile` est explicite : un lot **sans** champ `couleur` porte les **deux** couleurs de sa
recette. Les coques migrées de Ben n'ont donc besoin d'**aucun** second lot — « Aucun » est le bon
choix. Rien à l'écran ne le disait : l'aide affirmait qu'un macaron bicolore nécessite un lot
complémentaire, ce qui n'est vrai que si les coques sont **séparées par couleur**.

L'aide distingue maintenant les deux cas, en s'appuyant sur la donnée elle-même (`!p.couleur`).

### Ce qui n'a PAS été touché
Les trois gardes de `prodAssembleSave` (même lot, lot introuvable, lot qui n'est pas des coques)
restent en place : elles sont correctes, elles n'étaient pas le défaut. Le problème était que
l'écran **proposait** une option que la sauvegarde refuse ensuite.

### Suite v1482 : 19 assertions (`tests/v1482-bicolore-lot-unique.test.js`)
Un lot migré porte bien les deux couleurs, un lot marqué n'en porte qu'une (A) ; le nom accepte
objet **et** identifiant, plus jamais « [object Object] », produit libre nommé (B) ; le lot courant
est exclu de la liste (C) ; les trois gardes de sauvegarde tiennent toujours (D) ; l'aide distingue
les deux cas et l'option « Aucun » reste proposée (E).

**Sensibilité vérifiée par réintroduction** : 6 assertions rougissent.

⚠️ Deux ajustements d'outillage en cours de route : une extraction à tranche fixe débordait sur une
fonction `async` voisine (bac à sable impossible à construire) → bornage exact ; et la mutation
**plantait** au lieu de rougir quand le helper disparaissait → la section dégrade désormais vers le
comportement d'avant le correctif, pour rester **mesurable**.

---

## 2026-08-21 — INDISPONIBILITÉS AU CALENDRIER  (v1482 → **v1483**)

**Demandé par Ben** : « je veux pouvoir être capable de faire des croix sur le calendrier pour
indiquer mon indisponibilité. Ainsi en un coup d'œil je vois si je peux prendre des commandes sur
une période précise ou non. »

### Ce qui a été fait
- **Bouton « ✕ Indispo »** : active un mode où toucher une journée la barre, retoucher la libère.
  Le clic **n'est posé que dans ce mode** — un doigt qui glisse ne doit pas marquer une journée par
  accident.
- **Bouton « 📅 Période »** : marque ou libère plusieurs jours d'un coup, **bornes incluses**, pour
  des congés ou une semaine de poste chargée. Bornes inversées acceptées et remises dans l'ordre.
- **Rendu** : hachures + croix rouge, volontairement **discrets** (pas de fond plein) pour que les
  commandes déjà posées ce jour-là restent lisibles.

### Le choix de stockage, et pourquoi il compte
Table `events` avec `type:'indispo'` : aucun changement de schéma, et surtout **cette table est déjà
dans le périmètre de sauvegarde** (v1473). Une table neuve aurait dû y être ajoutée à la main — un
oubli facile, et des indisponibilités perdues à la première restauration. Le raisonnement de la
v1473 sert directement ici.

Contrepartie traitée : les indisponibilités sont **exclues** des « prochains événements » du tableau
de bord et des pastilles à lire du calendrier. Ce sont des journées barrées, pas des échéances —
sans ce filtre, elles noieraient les vraies.

### L'alerte qui rend la fonction utile
Saisir une commande à une date barrée affiche un rappel dans le formulaire. **Non bloquant** : une
indisponibilité est une préférence de Ben, pas une règle physique — il peut accepter quand même
(client fidèle, petite commande). L'app prévient, elle ne décide pas à sa place.

Sans cette alerte, il faudrait penser à ouvrir le calendrier avant chaque saisie — et l'oubli arrive
précisément les jours chargés, ceux où il est justement indisponible.

### Suite v1483 : 34 assertions (`tests/v1483-indisponibilites.test.js`)
Poser/retirer une croix, date vide sans effet (A) ; **doublons** — une croix part toujours au
premier clic (B) ; période bornes incluses, **idempotence**, bornes inversées, libération partielle
avec réconciliation (C) ; un mois entier, garde-fou de boucle, dates construites à midi pour être à
l'abri de l'heure d'été (D) ; ce que les indispos ne polluent pas (E) ; le clic réservé au mode
dédié (F) ; l'alerte non bloquante et son câblage (G) ; **la table est bien sauvegardée** (H).

**Sensibilité vérifiée par réintroduction de trois défauts plausibles** (borne de fin exclue,
suppression d'un seul doublon, tableau de bord non filtré) : **9 assertions rougissent**.

---

## 2026-08-22 — REVUE APPROFONDIE DE LA v1483  (v1483 → **v1484**)

Revue demandée après livraison. Cible : **mon propre code récent**, là où le risque se concentre —
les 134 suites manquantes ne le couvrent pas.

### 🚨 ① Le clic faisait deux choses à la fois
En mode indisponibilité, le clic de bascule était posé sur la **case entière**. Toucher une commande
affichée dans cette case déclenchait donc **les deux** actions : ouvrir la commande **et** barrer la
journée. Un jour se serait barré sans que Ben l'ait voulu — exactement le genre de défaut qui fait
perdre confiance dans un calendrier. La propagation est stoppée sur les événements ; la case garde
son propre clic, les deux coexistent (assertions I).

### 🚨 ② Une accolade orpheline dans la feuille de style — antérieure à ce travail
Le contrôle d'équilibre des accolades a signalé un déséquilibre. **Premier réflexe : vérifier si je
l'avais introduit.** Test sur la v1479 : il était **déjà là**. Puis écarter les commentaires CSS
comme cause : non, déséquilibre réel. Localisé ligne **1473** — une fermante qui referme une
`@media` déjà close.

Le deuxième bloc `<style>` était donc déséquilibré, ce qui peut faire **perdre silencieusement** les
règles suivantes selon l'interprétation du navigateur. Retirée ; les deux blocs sont rééquilibrés et
la présence des règles suivantes (module Préparation / Picking) est vérifiée.

### Contrôles menés, tous verts
- Les **20 fonctions** livrées ces dernières versions sont toutes définies
- Ordre de déclaration du code calendrier correct (rien n'est utilisé avant d'exister)
- Aucune écriture d'événement sans `type` — les deux signalements étaient des **faux positifs**
  (regex tronquée sur un gabarit `${…}`), vérifiés ligne à ligne avant de conclure
- Aucune régression du correctif v1480 : le seul `equals(refId)` restant est celui des marchés,
  légitime

### Méthode
Deux signalements sur quatre étaient des faux positifs de mes propres détecteurs. **Chacun a été
vérifié dans le code avant d'être retenu ou écarté** — la règle du projet depuis les 12 fausses
alertes de portée transactionnelle.

---

## 2026-08-23 — TARIF PYRAMIDE SUIVANT LA GRILLE + 4 NOUVELLES PYRAMIDES  (v1484 → **v1485**)

### 🚨 Le tarif bloqué
**Ben** : « le tarif de 1,90 € par macaron ne passe pas dans mes nouveaux tarifs. Ça reste bloqué à
l'ancien. »

`eventUnitPrice` renvoyait `PYRA_PRICE` — une constante **figée à 1,60 €** — dès qu'une pyramide
était présente sur la ligne. Ce chemin **court-circuitait toute la grille** : c'était le **dernier
prix en dur** de la chaîne tarifaire, même famille que les libellés figés à 0,25 € corrigés en
v1469.

**Règle tranchée par Ben** (question posée avant de coder, parce qu'il s'agit d'argent) : 1,60 € avec
la case « anciens tarifs » cochée, 1,90 € sans.

**L'historique est préservé au centime** : la grille historique porte `event:1.60`, exactement la
valeur de la constante. Supprimer le cas particulier ne change donc **aucune facture passée** —
vérifié par assertion, pas supposé.

### L'écran aligné, et un piège trouvé en chemin
Les **cinq** sites d'affichage ont été alignés. Dans l'optimiseur de pyramides, le prix unitaire
affiché suivait déjà la grille pendant que **la multiplication utilisait encore la constante** : la
ligne aurait annoncé « 100 × 1,90 € = 160,00 € ». Exactement le motif « calcul juste, écran faux »
qui a mordu cinq fois sur ce projet — trouvé cette fois **avant** livraison, en relisant le rendu.

### Les 4 nouvelles pyramides
**Ben** : « 2 noires et 2 blanches […] 15 étages, du sommet à la base : 5 + 7 + 9 + … + 33 = 285. »
Somme **vérifiée** : 285 ✓.

**Un seul modèle pour les quatre** : la couleur ne change ni la capacité ni les paliers. En faire
deux entrées doublerait les candidats de l'optimiseur sans rien apprendre — Ben choisit la couleur
au montage, pas au devis.

Les modèles vivant dans le stockage local, ajouter la valeur par défaut **ne suffisait pas** pour
Ben, qui a déjà des modèles enregistrés. `pyraMigrer285` l'ajoute à sa liste : n'ajoute que si le
modèle est absent (comparaison sur les **plateaux**, pas sur le nom), préserve tous les autres,
ne réécrit le stockage qu'en cas de changement réel. Idempotente.

L'optimiseur en déduit ses **15 paliers** (1 étage = 5 macarons … 15 étages = 285), donc le calcul
automatique du nombre de macarons par étage fonctionne sur devis, factures et commandes.

### Suite v1485 : 33 assertions (`tests/v1485-tarif-pyramide-et-modele.test.js`)
Le prix suit la case, avec et sans pyramide (A) ; **non-régression** — les deux grilles portent bien
1,60 / 1,90 (B) ; plus aucun prix figé affiché **ni multiplié**, et la multiplication de l'optimiseur
utilise la même valeur que le prix affiché (C) ; le modèle — 15 étages, somme 285, suite exacte,
sécable, un seul modèle pour 4 présentoirs (D) ; la migration — ajout, préservation, idempotence,
doublon sous un autre nom, stockage corrompu (E) ; l'optimiseur déduit les 15 paliers, cumuls
strictement croissants (F).

**Sensibilité vérifiée par réintroduction de trois défauts** : 10 assertions rougissent.

---

## 2026-08-26 — LA PERSONNALISATION LOGO ÉTAIT INSAISISSABLE  (v1485 → **v1486**)

**Ben** : « je veux que tu intègres la personnalisation logo », puis, après ma première réponse :
« tu as vérifié si c'était aussi accessible depuis devis facture ? Car je ne le vois pas ».

### Ce qui existait déjà — et ma réponse incomplète
Le barème dégressif (1 € jusqu'à 99, 0,80 € jusqu'à 300, 0,70 € au-delà), le calcul, le forfait
création de 40 € par modèle **et** l'affichage sur devis comme sur facture avaient été livrés en
v1463. Tout était juste, et je l'avais vérifié — **mais uniquement dans le formulaire de commande**.
Ben a dû me demander lui-même de regarder les documents. La leçon « vérifier l'écran, pas seulement
la fonction » vaut aussi pour **tous** les écrans concernés, pas seulement celui qu'on a sous la main.

### 🚨 Le défaut
Le bloc de saisie était en `display:none` **tant que la valeur n'était pas déjà supérieure à zéro**.
Il ne s'affichait donc que s'il avait **déjà été rempli** : la première saisie était impossible. Les
devis et factures ne pouvaient jamais recevoir de valeur — ils affichaient fidèlement un zéro.

Le bloc personnalisation **couleurs** juste au-dessus a une case à cocher qui le révèle ; le bloc
logo n'en avait aucune. C'est l'oubli — encore la famille « fonction juste, jamais atteignable »
(v1428, v1439, v1471).

### Le fix
Une case « Personnalisation logo — indépendante des couleurs », calquée sur celle des couleurs. La
**décocher vide aussi le forfait création** : laisser un forfait sur une commande dont l'option est
désactivée facturerait un supplément invisible à l'écran. Le drapeau est **persisté**, sans quoi
rouvrir une commande cochée mais aux quantités encore vides refermerait le bloc.

### ⚠️ Trou de test comblé en chemin
La vérification par mutation a révélé que **trois défauts sur quatre** étaient détectés, mais pas le
déplacement d'une borne de palier : mes assertions validaient le calcul avec une grille écrite
**dans le test**, pas celle de l'app. Modifier les paliers dans `app.js` passait donc inaperçu. Une
section vérifie désormais les **paliers réels** — et la mutation qui passait est maintenant rouge.

### Suite v1486 : 36 assertions (`tests/v1486-logo-accessible.test.js`)
Le barème sur les bornes 99/100/300/301, palier appliqué sur **tout** le volume, quantité négative
sans crédit (A) ; **les paliers réels de l'app** et le forfait à 40 € (A bis) ; indépendance des
deux personnalisations, forfait par modèle (B) ; grille historique sans supplément (C) ; la case,
le vidage des **deux** champs, la persistance du drapeau (D) ; la ligne sur devis et facture, avec
**réconciliation** 150 × 0,80 = 120,00 € (E).
