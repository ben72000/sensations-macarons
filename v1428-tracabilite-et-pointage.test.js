/* ============================================================================
   TESTS — v1428 : LA TRAÇABILITÉ ÉCHOUAIT TOUJOURS · LE POINTAGE RATISSAIT LARGE
   ----------------------------------------------------------------------------
   Ben, depuis l'accueil, sur un lot dont la DLC a expiré :
   (1) « au moment de cliquer sur traçabilité ça indique de manière systématique :
       erreur lors de l'affichage de la traçabilité du batch. Pourquoi ? »
   (2) « le pointage vers le batch précis n'est pas optimal, puisqu'actuellement
       on tombe sur le numéro de lot prérempli dans la barre de recherche et
       qu'un filtrage partiel se met en place, laissant apparaître des batchs qui
       n'ont rien à voir avec le lot de départ »

   BUG 1 — LA CAUSE : `traceProd` appelait `db.stockMoves.filter(fn)`. `filter`
   est une méthode de Table dans le VRAI Dexie ; notre `dexie_min.js` ne
   l'implémente pas. L'appel levait un TypeError SYNCHRONE — donc avant toute
   promesse, et le `.catch(()=>[])` posé derrière n'attrapait rien. L'exception
   remontait au try/catch de traceProd : TOUTE traçabilité de batch échouait,
   depuis n'importe quel écran.
   ⚠️ POURQUOI AUCUN TEST NE L'A VU : la v1414 couvrait `construireFilTracabilite`
   (pure, 47 assertions vertes) mais jamais le CÂBLAGE qui l'alimente. Une
   fonction juste, branchée sur une méthode qui n'existe pas, reste inutilisable.
   La garde ci-dessous interdit donc le MOTIF, pas le cas : plus aucun appel à
   une méthode de Table absente de notre mini-Dexie, où que ce soit dans app.js.

   BUG 2 — LA CAUSE : la v1418 pré-remplissait la RECHERCHE avec le n° de lot.
   La recherche fait de la correspondance PARTIELLE : le n° d'une boîte contient
   celui de son lot de base, qui lui-même se retrouve dans des lots voisins.
   Pointer, ce n'est pas ressembler.
   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { extractFunction, stripComments, APP } = require('./_extract');

// Les gardes de motif portent sur le CODE, pas sur la prose : les commentaires de v1428 citent
// justement l'appel fautif pour expliquer le bug, et le citer ne le rétablit pas.
const CODE = stripComments(APP);

// `traceProd` SUR-extrait (165 813 caractères : l'équilibreur déborde bien après sa fin), ce qui
// est le piège inverse de la troncature — une garde y matcherait du code d'autres fonctions et
// passerait au vert pour rien (faux vert de la v1419). On délimite la zone réelle.
function zoneFonction(nom){
  const re = new RegExp('^(?:async\\s+)?function\\s+' + nom + '\\s*\\(', 'm');
  const m = re.exec(APP);
  if(!m) throw new Error('Introuvable (zone): ' + nom);
  const debut = m.index;
  const suiv = /^(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/m.exec(APP.slice(debut + m[0].length));
  return APP.slice(debut, suiv ? debut + m[0].length + suiv.index : APP.length);
}

const DEXIE = fs.readFileSync(path.join(__dirname, '..', 'dexie_min.js'), 'utf8');

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function vrai(cond, label){ eq(!!cond, true, label); }

function run(){

// ── CAS 1 : notre mini-Dexie n'a PAS de Table.filter — c'est un fait, on le fige
// Si un jour dexie_min.js en gagne une, ce test rougit et invite à relire la
// garde du CAS 3 plutôt qu'à la contourner.
{
  const iTable = DEXIE.indexOf('class Table {');
  vrai(iTable > -1, 'CAS1 · la classe Table existe dans dexie_min.js');
  const corpsTable = DEXIE.slice(iTable);
  eq(/^\s{4}(?:async\s+)?filter\s*\(/m.test(corpsTable), false,
     'CAS1 · Table n\'expose aucune méthode filter');
  // Ce que Table expose RÉELLEMENT : c'est là-dessus qu'app.js peut compter.
  ['get','toArray','count','where','orderBy','add','put','delete'].forEach(m=>{
    vrai(new RegExp('(?:async\\s+)?' + m + '\\s*\\(').test(corpsTable), 'CAS1 · Table.' + m + ' existe');
  });
  // Collection, elle, a bien un filter — d'où la confusion d'origine.
  // Et Collection non plus n'a pas de `filter` : elle offre `and(fn)`. Le nom `filter` n'existe
  // NULLE PART dans notre couche base — c'est l'habitude du vrai Dexie qui a écrit cette ligne.
  const iColl = DEXIE.indexOf('class Collection {');
  vrai(iColl > -1, 'CAS1 · la classe Collection existe');
  const corpsColl = DEXIE.slice(iColl, iTable);
  eq(/^\s{4}(?:async\s+)?filter\s*\(/m.test(corpsColl), false,
     'CAS1 · Collection n\'a pas de filter non plus');
  vrai(/^\s{4}and\s*\(fn\)/m.test(corpsColl),
     'CAS1 · elle offre `and(fn)` — c\'est le seul chaînage de prédicat disponible');
}

// ── CAS 2 : la traçabilité lit les mouvements par un chemin qui existe ──────
{
  const z = stripComments(zoneFonction('traceProd'));
  vrai(/db\.stockMoves\.toArray\(\)/.test(z), 'CAS2 · traceProd relit la table entière…');
  vrai(/\.filter\(m=>\s*m && _idsTrace\.indexOf\(\+m\.productionId\)>=0\)/.test(z),
     'CAS2 · … puis filtre en JS, sur le tableau');
  eq(/db\.stockMoves\.filter\(/.test(z), false,
     'CAS2 · plus aucun appel à la méthode inexistante');
}

// ── CAS 3 : GARDE GLOBALE — le MOTIF est interdit, pas seulement ce cas ─────
// Une seule occurrence suffisait à casser tout un écran, et elle est passée à
// travers 118 suites. On interdit la forme partout dans app.js.
{
  const appels = [];
  const re = /db\.([A-Za-z_$][\w$]*)\.filter\s*\(/g;
  let m;
  while((m = re.exec(CODE))) appels.push(m[1]);
  eq(appels, [], 'CAS3 · aucun `db.<table>.filter(` dans app.js');
  // Même interdiction pour les autres méthodes de Collection appelées sur une Table.
  const autres = [];
  const re2 = /db\.([A-Za-z_$][\w$]*)\.(sortBy|first|primaryKeys|reverse|limit)\s*\(/g;
  while((m = re2.exec(CODE))) autres.push(m[1] + '.' + m[2]);
  eq(autres, [], 'CAS3 · ni sortBy/first/primaryKeys/reverse/limit appelés sur une Table');
}

// ── CAS 4 : les ids tracés sont bien numériques (fusion comprise) ───────────
// `productionId` peut arriver en chaîne selon la source ; la comparaison se fait
// sur des nombres des deux côtés, sinon un mouvement légitime serait ignoré.
{
  const z = stripComments(zoneFonction('traceProd'));
  vrai(/_idsTrace = \[prodId\]\.concat\(_idsFusion\)\.map\(Number\)/.test(z),
     'CAS4 · la liste des ids est normalisée en nombres');
  vrai(/\+m\.productionId/.test(z), 'CAS4 · … et le mouvement aussi, à la comparaison');
  vrai(/fusionHisto/.test(z), 'CAS4 · les boîtes absorbées par fusion restent incluses');
}

// ── CAS 5 : la sélection des mouvements, rejouée sur des données ────────────
{
  const prod = { id: 42, fusionHisto: [{ deId: 43, deLot: 'X-B2', qte: 5 }] };
  const idsFusion = (Array.isArray(prod.fusionHisto)?prod.fusionHisto:[]).map(f=>f&&f.deId).filter(v=>v!=null).map(Number);
  const ids = [prod.id].concat(idsFusion).map(Number);
  const moves = [
    { id:1, productionId:42,   qte:3 },
    { id:2, productionId:'42', qte:2 },   // même boîte, id en chaîne
    { id:3, productionId:43,   qte:5 },   // boîte absorbée
    { id:4, productionId:99,   qte:7 },   // une autre boîte
    null,                                  // ligne dégradée
  ];
  const gardes = moves.filter(m=> m && ids.indexOf(+m.productionId)>=0).map(m=>m.id);
  eq(gardes, [1,2,3], 'CAS5 · la boîte, ses mouvements en chaîne et l\'absorbée — pas la voisine');
}

// ── CAS 6 : le pointage ne passe plus par la barre de recherche ─────────────
{
  const src = extractFunction('renderProductions');
  eq(/type==='lot' && f\.val\)\{\s*prodnSearch = String\(f\.val\)/.test(src), false,
     'CAS6 · le n° de lot n\'est plus injecté dans la recherche');
  vrai(/prodnSearch = ''/.test(src),          'CAS6 · la recherche reste vide et disponible');
  vrai(/_prodLotFiltreId\s*=\s*\+f\.prodId/.test(src), 'CAS6 · un filtre EXACT sur l\'id est posé');
  vrai(/f\.prodId!=null/.test(src),
     'CAS6 · … et il faut un id : sans lui, on n\'invente pas un filtre depuis un n° de lot');
}

// ── CAS 7 : un seul batch affiché, celui qu'on a touché ────────────────────
{
  const src = extractFunction('_prodbatFilterInner');
  vrai(/_prodnCache\.filter\(r=> r && r\.p && \+r\.p\.id === \+_lotId\)/.test(src),
     'CAS7 · sélection par ÉGALITÉ d\'id, pas par ressemblance de texte');
  const iFiltre = src.indexOf('_prodLotFiltreId');
  const iSearch = src.indexOf('searchRank');
  vrai(iFiltre > -1 && iSearch > -1 && iFiltre < iSearch,
     'CAS7 · le filtre exact court-circuite la recherche (aucun voisin ne peut remonter)');
  vrai(/_prodbatRowsAvecRepli\(cible\)/.test(src),
     'CAS7 · le rendu reste celui de la liste (repli des boîtes compris)');
}

// ── CAS 8 : le filtre se VOIT et se lève ───────────────────────────────────
// Un filtre invisible est un piège : on ne saurait pas pourquoi le reste a disparu.
{
  const src = extractFunction('_prodbatFilterInner');
  vrai(/affiché seul/.test(src),                  'CAS8 · un bandeau annonce l\'état');
  vrai(/prodLotFiltreClear\(\)/.test(src),        'CAS8 · … avec un bouton pour tout revoir');
  vrai(/batch pointé/.test(src),                  'CAS8 · le compteur le dit aussi');
  const clr = extractFunction('prodLotFiltreClear');
  vrai(/_prodLotFiltreId = null/.test(clr),       'CAS8 · lever le filtre le remet à zéro');
  vrai(/prodbatFilter\(/.test(clr),               'CAS8 · … et réaffiche la liste');
}

// ── CAS 9 : taper dans la recherche reprend la main ────────────────────────
{
  const src = extractFunction('_prodbatFilterInner');
  vrai(/window\._prodLotFiltreId!=null && raw\)\{\s*window\._prodLotFiltreId=null/.test(src),
     'CAS9 · la première frappe lève le filtre plutôt que d\'ignorer la saisie');
}

// ── CAS 10 : le filtre ne survit pas à une nouvelle entrée dans l'écran ────
{
  const src = extractFunction('renderProductions');
  const iReset = src.indexOf('window._prodLotFiltreId = null');
  const iPose  = src.indexOf('_prodLotFiltreId  = +f.prodId');
  vrai(iReset > -1, 'CAS10 · l\'écran repart d\'un état propre');
  vrai(iPose > iReset, 'CAS10 · … et seul le focus repose le filtre, après');
}

// ── CAS 11 : batch introuvable → une explication, pas une page vide ────────
// Une boîte fusionnée ou rattachée à une commande prête est masquée de la liste :
// un écran vide laisserait croire à une panne.
{
  const src = extractFunction('_prodbatFilterInner');
  vrai(/fusionné dans une autre boîte/.test(src), 'CAS11 · la raison probable est nommée');
  vrai(/commande déjà prête/.test(src),           'CAS11 · … et l\'autre aussi');
}

// ── CAS 12 : la mise en évidence de la carte est conservée ─────────────────
{
  const src = extractFunction('renderProductions');
  vrai(/_prodLotAPointer\s*=\s*\+f\.prodId/.test(src), 'CAS12 · la cible du pointage est gardée');
  const ptr = extractFunction('_prodPointerLot');
  vrai(/getElementById\('prodcard-'\+id\)/.test(ptr), 'CAS12 · la carte est retrouvée par son id DOM');
  vrai(/scrollIntoView/.test(ptr),                    'CAS12 · … amenée à l\'écran');
  vrai(/boxShadow/.test(ptr),                         'CAS12 · … et mise en évidence');
}

// ── résultat ──
console.log('\n=== TESTS — v1428 : traçabilité réparée + pointage exact ===\n');
if(fail===0){
  console.log(`Résultat : ${pass} réussis, 0 échoués (${pass} assertions).`);
  console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
} else {
  console.log(`Résultat : ${pass} réussis, ${fail} échoués.`);
  console.log(failures.join('\n')+'\n');
  process.exitCode = 1;
}
}
run();
