# Journal de couverture des tests

Ce journal trace, livraison par livraison, ce que le filet de sécurité couvre — et ce
qu'il ne couvre pas encore. Il rend visible, à chaque zip, si les tests suivent le
rythme des évolutions de l'app (voir le **contrat de livraison** dans `README.md`).

Règle : à chaque livraison qui touche un calcul, on ajoute une ligne ici. Si une
livraison ajoute une fonction sans test, on l'écrit **explicitement** dans « angles
morts » — un angle mort déclaré est surveillable ; un angle mort tu est un piège.

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
