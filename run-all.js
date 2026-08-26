/* ============================================================
   LANCEUR DE TESTS — Sensations Macarons
   ------------------------------------------------------------
   Exécute toute la suite de tests de caractérisation et agrège
   les résultats. Un seul échec quelque part → code de sortie 1.

   Usage :  node tests/run-all.js
   ============================================================ */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const SUITES = [
  'characterization.test.js',   // vague 1 : briques pures (argent, dates, DLC, facture)
  'order.test.js',              // vague 2 : famille « commande » (paiements, solde, reprise)
  'accounting.test.js',         // vague 3 : computeAccounting (cœur compta / URSSAF)
  'monthly-bilan.test.js',      // vague 4 : computeMonthlyBilan (ventilation + cotisations)
  'fifo-stock.test.js',         // vague 5 : FIFO stock & coût réel des lots consommés
  'order-pricing.test.js',      // vague 6 : prix de vente des lignes (CA commande)
  'assembly.test.js',           // vague 7 : assemblage chantilly (potentiel min coques/ganache)
  'assembly-decrement.test.js', // vague 8 : décrément transactionnel 3 composants (chantache)
  'avg-sell-price.test.js',     // vague 9 : computeAvgSellPrice (prix de vente moyen)
  'market-costs.test.js',       // vague 10 : coûts marché (marketTotals + computeDeliveryCost)
  'net-poche.test.js',          // vague 11 : computeNetPoche (IR + net en poche)
  'batch-picking.test.js',      // vague 12 : batch picking (agrégation besoins lot, résolution parfum)
  'tresorerie.test.js',         // vague 13 : computeTresorerie (projection J+30/60/90)
  'scenario-prix.test.js',      // vague 14 : computeScenarioPrix (module scénarios prix)
  'panier-moyen.test.js',       // vague 15 : ventilation panier moyen par type dominant
  'fifo-materiel.test.js',      // vague 16 : FIFO matières (décrément/restock, filet refactoring)
  'allocate-batches.test.js',   // vague 17 : allocateBatches (moteur picking FIFO/zone)
  'numerotation-legale.test.js', // vague 18 : numérotation légale factures/avoirs (art. 242 nonies A CGI)
  'seuils-fiscaux.test.js',      // vague 19 : computeSeuilsFiscaux (jauges TVA/micro, projection)
  'pilotage-ca.test.js',         // vague 20 : computePilotageCA (leviers, panier moyen hors événement)
  'pilotage-strategic.test.js',  // vague 21 : computeStrategic (panier, marges, clients actifs)
  'prevision-revenu.test.js',    // vague 22 : computePrevisionRevenu (tendance + carnet)
  'rd-pont-creatif.test.js',     // vague 23 : rdSuggestMaterial (Pont Créatif R&D→Production)
  'order-margins.test.js',       // vague 24 : computeOrderMargins (marge par commande)
  'dlc-anti-recongel.test.js',   // vague 25 : computeDlcFromHistory (DLC anti-recongélation, sanitaire)
  'compute-stats.test.js',       // vague 26 : computeStats (agrégation ventes globale/client)
  'sales-velocity.test.js',      // vague 27 : computeSalesVelocity (vélocité, rupture de stock)
  'forecast.test.js',            // vague 28 : computeForecast (projection réservations datées)
  'market-selection.test.js',    // vague 29 : computeMarketSelection (score composite, classement)
  'market-channel.test.js',      // vague 30 : computeMarketChannelAnalysis (taux d'écoulement)
  'material-needs.test.js',      // vague 31 : computeMaterialNeeds (besoins matières production)
  'gaspillage.test.js',          // vague 32 : computeGaspillage (coût du gaspillage marché)
  'temps-decompo.test.js',       // vague 33 : _tempsDecompoParParfum (traçabilité du temps : le détail doit sommer au total)
  'batch-comptable.test.js',     // vague 34 : _estBatchComptable (dénominateur des moyennes : les composants ne sont pas des batches)
  'temps-par-macaron.test.js',   // vague 35 : temps par macaron et par batch standard de 60 (l'ancienne moyenne divisait par le nb d'enregistrements)
  'copilote-routage.test.js',    // vague 36 : diagnostic du routage du copilote (smWhy/smSkills, aucune compétence fantôme)
  'produits-rentabilite.test.js',// vague 37 : rentabilité par produit (marge réelle, pas chiffre d'affaires)
  'comparaison-periode.test.js', // vague 38 : comparaisons mois/année à périmètre comparable (prorata du temps écoulé)
  'cout-temps-marge.test.js',    // vague 39 : le coût du temps dans les marges (périmètre coques/macarons)
  'marche-temps.test.js',        // vague 40 : rentabilité des marchés rapportée au temps passé sur place
  'prestation-temps.test.js',    // vague 41 : la prestation vend du temps (coût des heures + revenu horaire)
  'pertes-visibles.test.js',     // vague 42 : les pertes ne doivent jamais être cachées (marge négative visible)
  'point-mort.test.js',          // vague 43 : le point mort (combien vendre pour couvrir les charges fixes)
  'point-mort-verite.test.js',   // vague 44 : le point mort disait la moitié de la vérité (URSSAF, impôt et heures hors-atelier oubliés)
  'revenu-horaire.test.js',      // vague 45 : le revenu horaire mentait dans les deux sens (MO comptée 2×, taux unique, impôt absent)
  'emballage-gratuit.test.js',   // vague 46 : l'emballage était gratuit (coutEmballages jamais calculé — prorata d'encaissement, mesuré vs estimé)
  'copilote-comprehension.test.js', // vague 47+48 : compréhension du copilote + désambiguïsation (cliquet anti-régression)
  'donnees-pas-code.test.js',     // vague 49 : un nom de client tuait le copilote (regex non échappée) — LES DONNÉES NE SONT PAS DU CODE
  'apostrophe-boutons.test.js',   // vague 50 : l'apostrophe tuait les boutons (onclick + encodeURIComponent) — helper unique escJs
  'mois-nomme.test.js',           // vague 51 : le copilote ne savait pas lire un mois nommé (« le ca de mai » → vue globale)
  'ca-deux-verites.test.js',      // vague 52 : le CA d'un mois avait DEUX vérités (date de commande vs encaissement)
  'une-seule-verite.test.js',     // vague 54 : les graphiques contredisaient le copilote + le mois nommé n'est plus perdu en silence
  'mois-partout.test.js',         // vague 55 : charges, gaspillage et bilan marché savent enfin filtrer par mois (l'aveu n'est pas une destination)
  'depuis-nest-pas-en.test.js',   // vague 56 : « depuis » n'est pas « en » — la borne HAUTE manquait au parseur de période
  'canal-oublie.test.js',         // vague 57+58 : le CA des MARCHÉS + le fond de caisse + « zéro n'est pas une mesure »
  'vocabulaire.test.js',          // vague 59 : audit de vocabulaire — aucune comparaison contre une valeur qui n'existe pas
  'total-et-lots.test.js',        // vague 60 : le total EST la somme du détail + l'état « en cours » des lots (vrai câblage)
  'reste-du.test.js',             // vague 61 : le total ET le reste dû (un trop-perçu ne paie pas la commande d'à côté)
  'pyramide-montage.test.js',     // vague 62 : le montage pyramide dans la vue rapide (étages déduits, jamais inventés)
  // [v1372] LES 18 SUITES ORPHELINES. Les vagues 63 à 71 ont chacune livré leur fichier de test —
  // aucun n'avait été inscrit ici. Une suite qui ne tourne jamais dans l'agrégat est une garde
  // MORTE (vague 59 : « un if qui ne tirera jamais ») : elle rassure sans protéger. Toutes
  // signalent l'échec par leur code de sortie, comme les autres ; l'agrégateur les voit donc.
  'v1342-periodes.test.js',        // vague 63 : le mois ET la semaine (_dansPeriode, prorata journalier)
  'v1343-associations.test.js',    // v1343 : associations coffrets (capture de composition)
  'v1345-routage.test.js',         // v1345 : routage copilote (compléments)
  'v1350-generateur.test.js',      // v1350 : générateur (Studio Com)
  'v1351-schema-dexie.test.js',    // v1351 : le schéma Dexie déclaré = le schéma réel
  'v1352-cablage.test.js',         // v1352 : câblage des écrans
  'v1355-volumes.test.js',         // v1355 : volumes normalisés
  'v1357-onclick.test.js',         // v1357 : onclick échappés (héritier de la vague 50)
  'v1358-batch-rangement.test.js', // v1358 : rangement des lots
  'v1359-inalterabilite.test.js',  // v1359 : inaltérabilité des encaissements (contrepassation)
  'v1360-livre-recettes.test.js',  // v1360 : livre des recettes chaîné par empreintes
  'v1362-acompte.test.js',         // v1362 : acomptes
  'v1363-modal-imbrique.test.js',  // v1363 : modales imbriquées
  'v1364-atelier-chrono.test.js',  // v1364 : chrono d'atelier
  'v1366-moyen-normalise.test.js', // v1366 : moyens normalisés
  'v1367-livre-sortie.test.js',    // v1367 : sorties du livre
  'v1368-audit-comptable.test.js', // v1368 : détecteur d'anomalies comptables (invariants)
  'v1369-audit-stock-temps.test.js', // v1369-70 : détecteur d'anomalies stock & temps
  'v1372-stockage-unifie.test.js', // v1372 : stockage unifié (kv) + journal d'audit + périmètre de somme versionné
  'v1373-validation.test.js',      // v1373 : schémas de validation à l'entrée (bloquant typé + alerte journalisée)
  'v1374-carte-figures.test.js',   // v1374 : la carte des dépendances entre les chiffres (aval transitif, quoi-retester)
  'v1375-etiquettes-boites.test.js', // v1375 : les deux bugs d'étiquettes de mise en boîte (modèle vs DOM, modal en place)
  'v1376-fusion-boites.test.js',    // v1376 : fusion de deux boîtes du même lot (règle stricte + traçabilité)
  'v1377-rebascule-devis.test.js',   // v1377 : rebascule commande→devis (zone morte) + devis périmé/régénération
  'v1378-rappel-pesee.test.js',     // v1378 : plus de rappel de pesée sur les deux étapes meringue
  'v1379-meringue-commune.test.js', // v1379 : base meringue mutualisée sur le total std-éq (GF converti)
  'v1380-parfum-par-tache.test.js', // v1380 : réattribution du parfum par tâche + parfums en en-tête du journal
  'v1381-moteur-dexie.test.js',     // v1381 : le VRAI dexie.min.js tient le contrat (hooks, kv, atomicité — E2E réel)
  'v1382-carnet-trajets.test.js',   // v1382 : carnet des trajets — distance/temps repris des livraisons réelles
  'v1383-sante-incidents.test.js',  // v1383 · chantier A : les échecs silencieux deviennent visibles (filet global, journal persistant, écran Santé)
  'v1384-import-validation.test.js',  // v1384 · chantier B : le contenu d'une sauvegarde est validé AVANT écriture (réparation du non-ambigu, signalement du reste)
  'v1385-sortie-sauvegardes.test.js',  // v1385 · chantier C : une sortie n'est acquise que CONSTATÉE (tentée ≠ confirmée, instantanés nommés comme non protecteurs)
  'v1386-frontiere-qr.test.js',       // v1386 · chantier D : tout code scanné passe une porte qui peut dire NON, et le refus se VOIT
  'v1387-affectation-inclusion.test.js', // v1387 · le seuil d'inclusion, oublié sur les 2 portes d'affectation du chantier D, est désormais centralisé et inévitable
  'v1388-assemblage-dlc-ganache.test.js', // v1388 · la DLC de l'assemblage suit la GARNITURE (jamais rognée par l'âge des coques) + fin de la durée négative (assemblage instantané)
  'v1389-moteur-rangement-unique.test.js', // v1389 · moteur de rangement unique (un seul chemin de préparation des boîtes)
  'v1389-repli-boites.test.js',            // v1389 · repli Voie 2 des boîtes
  'v1391-portee-transaction.test.js',      // v1391 · la transaction du moteur déclare TOUTES les tables touchées transitivement (productions + recipes)
  'v1392-assemblage-coques-monocouleur.test.js', // v1392 · résumé d'assemblage mono-couleur : « N coques <couleur>s » (total réel), pas « de chaque couleur »
  'v1393-conseil-marge-parfum.test.js',    // v1393 · conseil marge par parfum : reco ferme seulement si l'échantillon le permet + procureur + élasticité déclarée incalculable
  'v1394-calendrier-commandes.test.js',    // v1394 · commande TOUJOURS au calendrier via syncOrderEvent (plus de case f_cal) ; historique exclu
  'v1394-reserve-online.test.js',          // v1394 · réserve de stock vente en ligne : une pièce réservée sort du mobilisable direct (invariant anti-double-vente à la source)
  'v1397-reserve-decrement.test.js',       // v1397 · vente en ligne décrémente la réserve (option A) + état réassort 48h à 0
  'v1398-synchro-sas.test.js',             // v1398 · bouton de synchro sas côté ERP (flux C) : applique le journal, curseur idempotent, panne réseau sans casse
  'v1399-fiche-produit.test.js',           // v1399 · fiches produit conformes : ingrédients par poids + allergènes fiables en gras
  'v1400-prix-unitaire-precision.test.js', // v1400 · prix unitaire de lot en pleine précision + euroPrec
  'v1401-normalisation-ingredients.test.js', // v1401 · fiches produit : ingrédients dédupliqués + simplifiés, gélatine de poisson exceptée
  'v1402-stock-parfum-reserve.test.js',    // v1402 · la liste Stock par parfum soustrait la réserve online (fin de la logique parallèle qui ignorait la réserve)
  'v1403-fusion-recettes.test.js',         // v1403 · fusion de recettes doublons (réaffecte les productions, supprime le doublon, atomique)
  'v1404-diagnostic-noms-stock.test.js',   // v1404 · diagnostic : d'où vient chaque nom du stock
  'v1405-praline-noisette-coherence.test.js', // v1405 · « Praliné noisette » singulier aligné (FLAVORS/couleur/code)
  'v1406-reglages-livraison.test.js',      // v1406 · réglages vente en ligne : adresse labo, tarif 1€/km, créneaux hebdo max 3, message rupture client
  'v1407-commande-mere-filles.test.js',    // v1407 · commandes mère/filles : paiement groupé encaissé UNE fois, retraits échelonnés rattachés après coup (anti double comptage)
  'v1412-detail-bilan-urssaf.test.js',     // v1412 · détail cliquable Vente de marchandise / Prestation de service dans le Bilan URSSAF
  'v1413-assemblage-bicolore.test.js',     // v1413 · assemblage bicolore : 2e lot de coques, capacité = minimum des 2 lots
  'v1414-fil-tracabilite.test.js',         // v1414 · fil de traçabilité unifié d'une boîte (+ fusion v1415, archivage v1416)
  'v1417-vue-boites-lot.test.js',          // v1417 · vue d'ensemble des boîtes d'un lot au clic sur « Ranger »
  'v1418-pointer-lot-productions.test.js', // v1418 · « Voir dans Productions » depuis les DLC pointe le lot concerné
  'v1420-retour-bilan-urssaf.test.js',     // v1420 · chaîne de retour bilan URSSAF ↔ détail catégorie ↔ fiche commande + nom du client
  'v1421-double-comptage-filles.test.js',  // v1421 · une commande fille ne porte aucun encaissement (fin du paiement fantôme) + « ranger » n'est pas « reprise d'historique »
  'v1422-dlc-vue-boites.test.js',          // v1422 · toucher une alerte DLC ouvre la vue d'ensemble des boîtes du lot (emplacement, déplacement, fusion)
  'v1424-reste-a-encaisser-semaine.test.js',// v1424 · l'en-tête de semaine « À venir » affiche le reste à encaisser MÊME sans acompte (le total ne dit pas ce qui n'est pas rentré)
  'v1425-mere-rangee-retrouvable.test.js',  // v1425 · une mère rangée sort du fil mais RESTE dans le cache (recherche/tags/jour) + repli dédié : ranger n'est pas effacer
  'v1426-assemblage-stock-parfum.test.js',  // v1426 · assembler depuis « Stock par parfum » en réutilisant prodAssembleForm, avec interdiction du mélange de parfums SUR CE CHEMIN seulement
  'v1427-migration-chantache.test.js',      // v1427 · reprise du stock de chantache (composant catalogue) : même signature de lot que produireComposant, sans consommer de matières
  'v1428-tracabilite-et-pointage.test.js',  // v1428 · traçabilité réparée (Table.filter n'existe pas dans notre mini-Dexie — garde de motif globale) + pointage EXACT d'un batch dans Productions
  'v1429-quantite-lot-coherente.test.js',   // v1429 · un lot n'affiche plus 60 ici et 120 là : prodQteStock (ce qui reste) vs prodQteAffichee (ce qui a été produit), chacun nommé
  'v1430-stats-marches-reelles.test.js',    // v1430 · stats marchés : un marché sans mouvement n'est pas un marché à 0 vendu, et des retours non comptés ne sont pas des ventes
  'v1431-marche-parfums-vises.test.js',     // v1431 · marché ouvert visible dans le fil des commandes + parfums visés saisis à l'ouverture, qui PRIMENT sur la ventilation devinée du rétroplanning
  'v1432-cout-parfum-mesure.test.js',       // v1432 · coût par parfum mesuré sur les vrais batchs (prodConsumption) — les lots de reprise ne mesurent rien, et un coût inconnu vaut null, jamais 0
  'v1433-marge-macaron-hors-reprises.test.js', // v1433 · le €/macaron de l'accueil : assiette de marge sans reprises/filles, et dénominateur limité aux pièces dont la marge est calculée
  'v1434-dons-independants-paiement.test.js', // v1434 · un DON compte qu'il soit payé ou non : le filtre de vente s'applique APRÈS le comptage des dons, jamais en amont de buildFlavorSales
  'v1435-marches-dans-planning.test.js',      // v1435 · les marchés programmés entrent dans le planning : besoinMarchesParParfum, point de vérité unique des 3 écrans, sans condition de mode
  'v1436-location-pyramide-service.test.js',  // v1436 · la location de pyramide remonte en prestation de service même sans ligne prestation séparée — montantServiceLigne, point de vérité unique
  'v1437-fiche-client-copilote.test.js',      // v1437 · fiche client intelligente : indicateurs à seuil de silence, état relatif au rythme du client, recos argumentées, ouverture universelle
  'v1438-activeTx-course.test.js',            // v1438 · dexie.min.js : _activeTx (transaction en cours) était un champ PARTAGÉ, réutilisable par erreur par un appel concurrent — _txStore vérifie désormais qu'elle est vivante ET porte la bonne table avant de la réutiliser
  'v1439-prodboard-launch.test.js',           // v1439/v1440 · le bouton « ＋ Lancer une tâche » appelait prodTaskPicker(), jamais définie — pointé vers le vrai mécanisme (_atPicker + prodRenderBoard), puis rendu visible à coup sûr (scrollIntoView)
  'v1441-bicolore-rappel.test.js',            // v1441 · rappel de division bicolore (praliné = marron foncé + blanc) dans le formulaire de lancement (mode complet inclus) et la fiche de production toujours affichée après lancement
  'v1442-meringue-fiche-combinee.test.js',    // v1442 · la fiche meringue mutualisée (base commune + détail par parfum) accessible à tout moment via « Voir la recette », pas seulement juste après le lancement du duo
  'v1443-duo-qte-sync.test.js',               // v1443 · en mode duo, « Macarons Pn » suit désormais le rendement du parfum choisi (ne restait plus bloqué sur l'ancienne valeur au changement de parfum)
  'v1444-ca-graphique-glissant.test.js',      // v1444 · graphique du CA zoomable (jour/semaine/mois/année) et glissant, chaque barre cliquable — avec réconciliation mois par mois contre caDuMois
  'v1445-bicolore-divise.test.js',            // v1445 · un parfum bicolore peut être divisé en 2 lots réels séparés (comme une meringue mutualisée) — couleur explicite prioritaire sur la recette dans les 3 moteurs de couleur, réconciliation dissymétrique contre la double-division
  'v1445b-checkbox-reset.test.js',            // v1445b · la case « diviser en 2 lots » se décochait toute seule dès qu'on touchait la quantité (prodUpdateCoqueHint reconstruisait l'input sans mémoriser son état)
  'v1448-lot-duo-preview.test.js',            // v1448 · le champ « N° lot de production » était masqué en duo/bicolore-divisé (jamais lu par la sauvegarde réelle, affichait un code d'une autre recette) et remplacé par un aperçu réconcilié avec la vraie formule de lot
  'v1449-bicolore-duo.test.js',                 // v1449 · un parfum bicolore combiné à d'autres (mode duo/trio) se divise aussi par couleur — moteur partagé _sousLotsCoques, case à cocher supprimée, reproduction exacte du scénario chiffré de Ben (Pistache 120 + Chocolat passion 60/60)
  'v1450-pourcentage-ca.test.js',                // v1450 · pourcentage de CA affiché sous chaque ligne des 3 écrans de détail encaissement (mois, période glissante, catégorie URSSAF) — moteur partagé pctDuTotal, réconciliation à 100%
  'v1451-pourcentage-ca-suite.test.js',         // v1451 · pourcentage de CA étendu à 3 écrans de plus (CA facturé/encaissé par période, journal des avoirs, panier moyen ventilé) — reprises et total officiel gardés séparés
  'v1452-sachet-coffret10.test.js',             // v1452 · sachet (1–3 macarons, 2,50 €/mac.) + coffret de 10 à 22 € : branchement du nouveau type de ligne dans les ~14 points de dispatch, réconciliation prix saisie/stocké, garde « jamais 0 € »
  'v1453-charge-delete.test.js',                // v1453 · bouton Supprimer ajouté directement dans la fiche d'une charge, avec rappel si elle vient d'un modèle récurrent (supprimer l'instance ne corrige pas le modèle)
  'v1454-assemblage-lot-entier.test.js',        // v1454 · assembler un lot de coques réparti en N boîtes : regroupement atomique amont (réconciliation « aucune coque créée ni perdue »), étiquette imprimant la quantité restante
  'v1455-transfert-boites.test.js',             // v1455 · transfert partiel de pièces entre deux boîtes d'un même lot (réconciliation, archivage si la source se vide, DLC la plus courte, rendu dans le fil de traçabilité)
  'v1456-reimpression-fusion.test.js',          // v1456 · réimpression d'étiquette proposée après une fusion (numéro de lot inchangé, aucune écriture en base) + bouton étiquette permanent par boîte
  'v1457-retours-marche.test.js',               // v1457 · retours de marché rangés en boîtes : rattachement plafonné au réellement sorti, ligne « retour marché » quand la provenance est inconnue, DLC d'origine conservée
  'v1458-etiquette-retour-marche.test.js',      // v1458 · mention RETOUR MARCHÉ sur les 2 moteurs d'étiquette + la quantité qui n'était pas imprimée du tout par le rendu HTML
  'v1461-macarons-source-unique.test.js',       // v1461 · macarons comptés DANS caDuMois (source unique, avec le CA) : marchés inclus, marché sans comptage signalé au lieu d'un 0 muet, macarons affichés par ligne dans le détail
  'v1462-macarons-arrondi-coherent.test.js',    // v1462 · macarons vendus : chaque ligne arrondie à la source, le total est la somme des entiers déjà arrondis (élimine l'écart entre la carte et le détail), réconciliation vérifiée sur 30 tirages aléatoires
  'v1463-grille-tarifaire-datee.test.js',       // v1463/v1464 · grille tarifaire datée au 01/09/2026 + verrou anti-datation + case « anciens tarifs » prioritaire sur la date, logo dégressif, forfait par modèle, gros macarons 7 €/3,80 €
  'v1470-nouveau-client.test.js',               // v1470 · régression « impossible d'ajouter un client » : le bouton pointait vers la fiche intelligente sans identifiant + garde-fou de redirection
  'v1471-picking-scan.test.js',                 // v1471 · picking groupé regroupé par date de livraison (une seule date pré-cochée) + le scan d'une boîte ouvre un écran d'actions au lieu de la fiche de traçabilité, avec sortie marché du lot scanné
  'v1472-session-horaires.test.js',             // v1472 · corriger début/fin d'une session d'atelier (clôturer une session oubliée) avec bornage des tâches dans les nouvelles bornes
  'v1473-sauvegarde-completude.test.js',        // v1473 · 15 tables absentes des sauvegardes (dont stockMoves, journalCompta) + garde empêchant une ancienne sauvegarde d'effacer ce qu'elle ignore
  'v1474-pertes-echec-visible.test.js',         // v1474 · 4 écritures de perte dont l'échec était avalé alors que le stock avait déjà bougé + garde de motif sur les tables critiques
  'v1475-ca-graphique-fige.test.js',            // v1475 · CA du tableau de bord figé : le cache du graphique n'était vidé qu'au rendu de l'accueil (changement d'onglet + écritures d'argent)
  'v1476-ca-manquant.test.js',                  // v1476 · diagnostic « CA manquant » : commandes dont l'encaissement n'a jamais été saisi (statut Partiel/En attente sans registre)
  'v1477-chrono-tache-bornee.test.js',          // v1477 · session de 8 h affichant 242 h (tâche jamais arrêtée mesurée jusqu'à aujourd'hui) + édition du temps par tâche
  'v1478-seances-par-jour.test.js',             // v1478 · découpage d'une session en séances par trou d'inactivité (4 h), datées du jour de démarrage — une nuit à cheval sur 2 jours reste entière
  'v1479-facture-vs-encaisse.test.js',          // v1479 · en-tête (facturé) vs graphique (encaissé) : chaque base nommée et l'écart expliqué au lieu d'être laissé à calculer
  'v1480-calendrier-date-modifiee.test.js',     // v1480 · le calendrier gardait la date initiale : equals() sensible au type ne retrouvait pas l'ancien événement (4 chemins corrigés)
  'v1481-date-unique.test.js',                  // v1481 · LA vraie cause : deux dates dans le formulaire, celle du bloc Livraison replié primait — une seule date décide désormais, + migration
  'v1482-bicolore-lot-unique.test.js',          // v1482 · assemblage bloqué sur coques bicolores migrées (le lot courant était proposé comme 2e lot) + nom affiché « #[object Object] »
  'v1483-indisponibilites.test.js',             // v1483 · croix d'indisponibilité au calendrier (jour + période) et alerte non bloquante à la prise de commande
  'v1485-tarif-pyramide-et-modele.test.js'      // v1485 · le tarif événement avec pyramide suit la grille (1,60 € / 1,90 €) + modèle 15 étages 285 macarons et sa migration
];

let allOk = true;
console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║   SUITE DE TESTS — Sensations Macarons           ║');
console.log('╚══════════════════════════════════════════════════╝');

for(const suite of SUITES){
  try{
    const out = execFileSync('node', [path.join(__dirname, suite)], { encoding:'utf8' });
    process.stdout.write(out);
  }catch(err){
    allOk = false;
    if(err.stdout) process.stdout.write(err.stdout);
    if(err.stderr) process.stderr.write(err.stderr);
  }
}

console.log('──────────────────────────────────────────────────');
if(allOk){
  console.log('✓ TOUTE LA SUITE EST VERTE — aucune régression.\n');
  process.exit(0);
}else{
  console.log('✗ AU MOINS UNE SUITE A ÉCHOUÉ — voir ci-dessus.\n');
  process.exit(1);
}
