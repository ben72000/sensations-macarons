/* ============================================================
   TESTS — v1382 : le carnet des trajets (distance/temps auto)
   ------------------------------------------------------------
   LA DEMANDE (Ben) : configurer l'adresse du client par rapport à son
   lieu de départ (le labo) pour obtenir automatiquement la distance et
   le temps de route.

   SON CHOIX, parmi trois proposés : « mémoire par adresse — 1re fois à
   la main, ensuite auto ». Le seul des trois qui ne FABRIQUE aucun
   chiffre. Ces nombres entrent dans computeDeliveryCost (carburant +
   coût du temps) donc dans la rentabilité et les marges : une distance
   ESTIMÉE qui s'y glisserait serait un troisième chiffre (v1339).

   LA PREUVE CENTRALE (C) : tout ce que le carnet ressort est une valeur
   que Ben a lui-même saisie sur une commande — jamais une interpolation,
   jamais une moyenne inventée entre deux adresses différentes.
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1382 : le carnet des trajets ===\n');

const cleanApp = stripComments(APP);

// Le VRAI normaliseur du fichier (jamais une copie) — c'est lui qui décide si deux
// écritures d'une adresse sont la même adresse.
const normTxt = eval('(' + extractFunction('normTxt').replace(/^function normTxt/, 'function') + ')');
const mk = nom => new Function('normTxt', 'return ' + extractFunction(nom).replace(new RegExp('^(async )?function ' + nom), 'function'))(normTxt);
const _trajetCle = mk('_trajetCle');
const _mediane = mk('_mediane');
const _carnetTrajets = new Function('normTxt', '_trajetCle', '_mediane',
  'return ' + extractFunction('_carnetTrajets').replace(/^function _carnetTrajets/, 'function'))(normTxt, _trajetCle, _mediane);
const _trajetParClient = new Function('_mediane',
  'return ' + extractFunction('_trajetParClient').replace(/^function _trajetParClient/, 'function'))(_mediane);
const _trajetPropose = new Function('_trajetCle',
  'return ' + extractFunction('_trajetPropose').replace(/^function _trajetPropose/, 'function'))(_trajetCle);
const _trajetOrigine = mk('_trajetOrigine');

// Fixture : les livraisons réelles de Ben (adresses volontairement écrites de façons
// différentes — c'est le cas courant quand on ressaisit à la main).
const ORDERS = [
  { id:1, clientId:7, date:'2026-05-02', lieuLivraison:'12 rue des Acacias, Le Mans', distanceKm:8,  tempsLivraisonMin:15 },
  { id:2, clientId:7, date:'2026-06-11', lieuLivraison:'12 Rue des Acacias  Le Mans', distanceKm:8,  tempsLivraisonMin:22 },
  { id:3, clientId:7, date:'2026-07-03', lieuLivraison:'12 rue des acacias, le mans', distanceKm:9,  tempsLivraisonMin:14 },
  { id:4, clientId:9, date:'2026-06-20', lieuLivraison:'Salle des fêtes, Allonnes',   distanceKm:12, tempsLivraisonMin:20 },
  { id:5, clientId:3, date:'2026-06-25', lieuLivraison:'Chez Paulette',               distanceKm:0,  tempsLivraisonMin:0  },
  { id:6, clientId:4, date:'2026-06-28', lieuLivraison:'',                            distanceKm:30, tempsLivraisonMin:40 }
];

// ---------------------------------------------------------------------------
// A. L'APPARIEMENT DES ADRESSES — conservateur par construction
// ---------------------------------------------------------------------------
{
  ok(_trajetCle('12 rue des Acacias, Le Mans') === _trajetCle('12 Rue des Acacias  Le Mans'),
     'A1 · casse, ponctuation et espaces multiples n\'empêchent pas la reconnaissance');
  ok(_trajetCle('12 rue des Acacias, Le Mans') === _trajetCle('12 rue des acacias, le mans'),
     'A2 · accents et minuscules non plus');
  ok(_trajetCle('12 rue des Acacias, Le Mans') !== _trajetCle('14 rue des Acacias, Le Mans'),
     'A3 · DEUX ADRESSES DIFFÉRENTES RESTENT DIFFÉRENTES — le n° 12 ne prend pas la distance du n° 14');
  ok(_trajetCle('') === '' && _trajetCle(null) === '',
     'A4 · adresse vide → clé vide (jamais un appariement fourre-tout)');
}

// ---------------------------------------------------------------------------
// B. LA MÉDIANE — robuste au jour de bouchons
// ---------------------------------------------------------------------------
{
  ok(_mediane([15, 22, 14]) === 15,
     'B1 · médiane de 15/22/14 = 15 : le trajet à 22 min (bouchons) ne devient PAS la norme');
  ok(Math.round(([15, 22, 14].reduce((a, b) => a + b, 0) / 3) * 10) / 10 === 17,
     'B2 · … là où la moyenne aurait dit 17 min — 2 min de trop sur chaque livraison chiffrée');
  ok(_mediane([8, 10]) === 9 && _mediane([]) === null && _mediane([0, -3, 'x']) === null,
     'B3 · nombre pair → milieu ; vide ou valeurs invalides → null (jamais 0 déguisé en mesure)');
}

// ---------------------------------------------------------------------------
// C. LE CARNET APPRIS — que des mesures de Ben, rien d'inventé
// ---------------------------------------------------------------------------
{
  const c = _carnetTrajets(ORDERS, '');
  const acacias = c.get(_trajetCle('12 rue des Acacias, Le Mans'));
  ok(acacias && acacias.n === 3,
     'C1 · les 3 livraisons aux Acacias — écrites de 3 façons — sont regroupées en UN trajet');
  ok(acacias.km === 8 && acacias.min === 15,
     'C2 · le carnet propose 8 km · 15 min : DES VALEURS QUE BEN A LUI-MÊME SAISIES, pas une moyenne inventée');
  ok(ORDERS.some(o => o.distanceKm === acacias.km) && ORDERS.some(o => o.tempsLivraisonMin === acacias.min),
     'C3 · PREUVE — chaque chiffre proposé existe tel quel dans une commande réelle (aucune estimation)');
  ok(acacias.kmMin === 8 && acacias.kmMax === 9 && acacias.minMin === 14 && acacias.minMax === 22,
     'C4 · la fourchette observée est conservée (14–22 min) : la médiane ne cache pas la variabilité');
  ok(acacias.libelle === '12 rue des acacias, le mans',
     'C5 · le libellé affiché est celui de la livraison la PLUS RÉCENTE (l\'orthographe à jour)');
  ok(!c.has(_trajetCle('Chez Paulette')),
     'C6 · une livraison sans distance NI temps n\'entre pas au carnet (rien de mesuré, rien à apprendre)');
  ok(!c.has(''),
     'C7 · une commande sans adresse n\'entre pas non plus — ses 30 km ne polluent aucun trajet');
  ok(c.size === 2,
     'C8 · au total 2 trajets appris (Acacias, Allonnes) sur 6 commandes');
}

// ---------------------------------------------------------------------------
// D. LE POINT DE DÉPART — un déménagement de labo ne fausse pas en silence
// ---------------------------------------------------------------------------
{
  const c = _carnetTrajets(ORDERS, '2026-07-01');   // labo changé le 1er juillet
  const allonnes = c.get(_trajetCle('Salle des fêtes, Allonnes'));
  const acacias = c.get(_trajetCle('12 rue des Acacias, Le Mans'));
  ok(allonnes.avantLabo === true,
     'D1 · un trajet mesuré uniquement AVANT le changement d\'adresse est SIGNALÉ (v1339 : jamais faux en silence)');
  ok(acacias.avantLabo === false,
     'D2 · … mais un trajet qui a AUSSI une mesure depuis la nouvelle adresse ne l\'est pas');
  ok(allonnes.km === 12,
     'D3 · le trajet signalé est CONSERVÉ, pas purgé — Ben décide s\'il le revérifie');
  ok(/adresseLabo/.test(cleanApp) && /adresseLaboDepuis/.test(cleanApp),
     'D4 · le point de départ et sa date sont des réglages persistés');
}

// ---------------------------------------------------------------------------
// E. LA PROPOSITION — priorité, divergence, et le repli par client
// ---------------------------------------------------------------------------
{
  const c = _carnetTrajets(ORDERS, '');
  const book = [{ libelle:'12 rue des Acacias, Le Mans', km:8, min:15 }];

  const p1 = _trajetPropose({ lieu:'12 RUE DES ACACIAS LE MANS', carnet:c, addressBook:book });
  ok(p1 && p1.source === 'carnet' && p1.km === 8,
     'E1 · le carnet manuel (déclaration explicite de Ben) prime sur l\'historique');

  const p2 = _trajetPropose({ lieu:'Salle des fêtes, Allonnes', carnet:c, addressBook:book });
  ok(p2 && p2.source === 'adresse' && p2.km === 12 && p2.n === 1,
     'E2 · adresse absente du carnet manuel mais déjà livrée → reprise de l\'historique');

  // Le cas courant que l'ancien code ratait : client connu, adresse nouvelle.
  const pc = _trajetParClient(ORDERS, 7, '');
  const p3 = _trajetPropose({ lieu:'Une adresse jamais vue', carnet:c, addressBook:book, parClient:pc, clientNom:'Dupont' });
  ok(p3 && p3.source === 'client' && p3.km === 8 && p3.n === 3,
     'E3 · adresse inconnue MAIS client déjà livré → on propose ses 3 livraisons (le trou de l\'ancien code)');

  const p4 = _trajetPropose({ lieu:'Nulle part', carnet:c, addressBook:book, parClient:null });
  ok(p4 === null,
     'E4 · rien de connu → AUCUNE proposition : l\'app se tait plutôt que d\'inventer');

  // Divergence carnet ↔ réalité : on ne tranche pas en douce.
  const bookVieux = [{ libelle:'Salle des fêtes, Allonnes', km:5, min:8 }];
  const p5 = _trajetPropose({ lieu:'Salle des fêtes, Allonnes', carnet:c, addressBook:bookVieux });
  ok(p5 && p5.divergence && p5.divergence.km === 12,
     'E5 · carnet (5 km) contre livraisons réelles (12 km) → l\'écart est REMONTÉ, pas arbitré en silence');

  const p6 = _trajetPropose({ lieu:'12 rue des Acacias, Le Mans', carnet:c, addressBook:book });
  ok(!p6.divergence,
     'E6 · quand carnet et réalité concordent, aucune alerte inutile (pas de bruit — v1370)');

  ok(_trajetOrigine(p2) === '1 livraison à cette adresse' && _trajetOrigine(p3) === '3 livraisons chez ce client',
     'E7 · l\'origine du chiffre est toujours formulée — un nombre ne s\'affiche jamais nu');
}

// ---------------------------------------------------------------------------
// F. LE CÂBLAGE — proposé partout où Ben en a besoin, sans jamais écraser
// ---------------------------------------------------------------------------
{
  ok(/id="trajetPropo"/.test(APP),
     'F1 · le bandeau de proposition existe dans le bloc livraison de la commande');
  const iProp = cleanApp.indexOf('async function cmdTrajetPropose');
  const corps = cleanApp.slice(iProp, iProp + 3000);
  ok(iProp > -1 && /kmVide && minVide/.test(corps),
     'F2 · le pré-remplissage n\'a lieu QUE si les deux champs sont vides — une saisie de Ben n\'est jamais écrasée');
  ok(/Appliquer<\/button>/.test(APP) && /cmdTrajetApplique\(\)/.test(cleanApp),
     'F3 · si un champ est déjà rempli, le chiffre est PROPOSÉ (bouton Appliquer), pas imposé');
  ok(/cmdTrajetProposeDiff\(\)/.test(cleanApp) && /oninput="acFilter\(this\.value\);cmdTrajetProposeDiff\(\)"/.test(APP),
     'F4 · une adresse TAPÉE déclenche la proposition (avant v1382 : seulement si on cliquait la liste)');
  const iSug = cleanApp.indexOf('function cmdSuggestClientAddress');
  ok(iSug > -1 && /cmdTrajetPropose\(\)/.test(cleanApp.slice(iSug, iSug + 900)),
     'F5 · choisir un CLIENT propose désormais son trajet (avant : l\'adresse seulement)');
  const iSave = cleanApp.indexOf('async function saveCmd');
  ok(iSave > -1 && /_trajetInvalideCache\(\)/.test(cleanApp.slice(iSave, iSave + 30000)),
     'F6 · enregistrer une commande fait APPRENDRE la nouvelle mesure (le cache est invalidé)');
  ok(/openCarnetTrajets\(\)/.test(cleanApp) && /Apprises de tes livraisons/.test(APP),
     'F7 · le carnet montre les trajets appris, séparés de ceux saisis à la main');
  ok(/carnetPromouvoir\('\$\{escJs\(e\.cle\)\}'\)/.test(APP),
     'F8 · promouvoir un trajet appris passe par escJs (garde v1357 respectée)');
  ok(/Aucun point de départ configuré/.test(APP),
     'F9 · sans adresse de labo, le carnet le DIT : un « 8 km » sans point de départ ne veut rien dire');
  ok(/function openAddressBook\(\)\{ return openCarnetTrajets\(\); \}/.test(cleanApp),
     'F10 · l\'ancien écran est un ALIAS : après un ajout ou une suppression, Ben ne retombe plus sur une liste amputée (un seul écran, une seule vérité)');
}

// ---------------------------------------------------------------------------
// G. LE NON-BUT — l'app ne calcule aucune distance toute seule
// ---------------------------------------------------------------------------
{
  ok(!/haversine|Math\.acos|toRadians|openrouteservice|distancematrix|maps\.googleapis/i.test(cleanApp),
     'G1 · AUCUN calcul géographique ni appel à un service de routage — le choix de Ben est tenu par le code');
  const iCarnet = cleanApp.indexOf('function _carnetTrajets');
  ok(iCarnet > -1 && !/\*\s*1\.6|\*\s*1\.3|vitesseMoy|kmParMinute/.test(cleanApp.slice(iCarnet, iCarnet + 2000)),
     'G2 · aucun facteur d\'allongement ni vitesse moyenne : rien n\'est extrapolé d\'une mesure vers une autre');
}

// ---------------------------------------------------------------------------
console.log(`\nRésultat : ${nOk} réussis, ${nKo} échoués (${nOk + nKo} assertions).`);
if(nKo === 0) console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
else console.log('✗ RÉGRESSION DÉTECTÉE.\n');
process.exit(nKo ? 1 : 0);
