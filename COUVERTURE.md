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
