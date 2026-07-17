/* ============================================================
   TESTS — v1376 : la fusion de deux boîtes du même lot
   ------------------------------------------------------------
   LA RÈGLE MÉTIER, IMPÉRATIVE : on ne fusionne QUE deux boîtes du
   MÊME PARFUM et du MÊME LOT. Toute autre combinaison (lots
   différents, parfums différents, stades différents, même boîte,
   non-boîte, boîtes vides) est REFUSÉE — sinon la traçabilité
   physique est perdue. Chaque refus est prouvé par un cas ; le
   garde-fou vise le MOTIF, pas le cas.

   ET ON PRÉSERVE À LA FUSION : la somme des quantités (avec
   l'invariant produit − consommé = reste intact), la DLC la plus
   courte (la plus prudente), et la traçabilité (etiquetteDe conservé
   + historique fusionHisto + entrée d'audit « fusion-boite »).
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1376 : fusion de deux boîtes du même lot ===\n');

const cleanApp = stripComments(APP);
const round3 = x => Math.round((+x || 0) * 1000) / 1000;

const _fusionMemeLot      = eval('(' + extractFunction('_fusionMemeLot').replace(/^function _fusionMemeLot/, 'function') + ')');
const _fusionValide       = new Function('_fusionMemeLot', 'return ' + extractFunction('_fusionValide').replace(/^function _fusionValide/, 'function'))(_fusionMemeLot);
const _fusionDlcPlusCourte = eval('(' + extractFunction('_fusionDlcPlusCourte').replace(/^function _fusionDlcPlusCourte/, 'function') + ')');
const _fusionCalcul       = new Function('_fusionDlcPlusCourte', 'return ' + extractFunction('_fusionCalcul').replace(/^function _fusionCalcul/, 'function'))(_fusionDlcPlusCourte);

// Deux boîtes SAINES du même lot (parent 100), même parfum (recipe 7), stade complet.
const boiteA = () => ({ id:1, etiquetteDe:100, recipeId:7, composant:'complet', degDeclasse:false, produitLibre:'',
  lotProduction:'NM-A-101-B1-F', dlcProduit:'2026-08-20', qteRestante:15, qteReelle:20, qteProduite:20, qteTheorique:20 });
const boiteB = () => ({ id:2, etiquetteDe:100, recipeId:7, composant:'complet', degDeclasse:false, produitLibre:'',
  lotProduction:'NM-A-101-B2-C', dlcProduit:'2026-08-14', qteRestante:8, qteReelle:10, qteProduite:10, qteTheorique:10 });

// ---------------------------------------------------------------------------
// A. « MÊME LOT » — l'identité physique
// ---------------------------------------------------------------------------
{
  ok(_fusionMemeLot(boiteA(), boiteB()) === true,
     'A1 · deux boîtes issues du même lot parent (même etiquetteDe) sont « même lot »');
  ok(_fusionMemeLot(boiteA(), { ...boiteB(), etiquetteDe:200 }) === false,
     'A2 · un etiquetteDe différent = lot différent (l\'identité ne se devine pas, elle se compare)');
  ok(_fusionMemeLot(boiteA(), { ...boiteB(), etiquetteDe:null }) === false,
     'A3 · une boîte sans lot parent n\'est jamais « même lot » qu\'une autre');
}

// ---------------------------------------------------------------------------
// B. LA VALIDATION — accepte le sain, refuse tout le reste avec un motif
// ---------------------------------------------------------------------------
{
  ok(_fusionValide(boiteA(), boiteB()).ok === true,
     'B1 · deux boîtes du même parfum et du même lot, avec stock → ACCEPTÉ');

  const rLot = _fusionValide(boiteA(), { ...boiteB(), etiquetteDe:200 });
  ok(rLot.ok === false && /lot/i.test(rLot.raison),
     'B2 · REFUS — lots différents (le cœur de la règle : jamais mélanger deux lots)');

  const rParfum = _fusionValide(boiteA(), { ...boiteB(), recipeId:9 });
  ok(rParfum.ok === false && /parfum|stade/i.test(rParfum.raison),
     'B3 · REFUS — parfums différents (même s\'ils partageaient un lot, ce qui n\'arrive pas)');

  const rStade = _fusionValide(boiteA(), { ...boiteB(), composant:'coques' });
  ok(rStade.ok === false && /parfum|stade/i.test(rStade.raison),
     'B4 · REFUS — stades différents (des coques ne se fusionnent pas avec des macarons finis)');

  const rDeg = _fusionValide(boiteA(), { ...boiteB(), degDeclasse:true });
  ok(rDeg.ok === false,
     'B5 · REFUS — une boîte déclassée (dégustation) ne fusionne pas avec une boîte normale');

  const rMeme = _fusionValide(boiteA(), boiteA());
  ok(rMeme.ok === false && /différent/i.test(rMeme.raison),
     'B6 · REFUS — la même boîte deux fois');

  const rNonBoite = _fusionValide({ ...boiteA(), etiquetteDe:null }, { ...boiteB(), etiquetteDe:null });
  ok(rNonBoite.ok === false && /bo[iî]te/i.test(rNonBoite.raison),
     'B7 · REFUS — deux lots bruts non scindés (ce ne sont pas des boîtes)');

  const rVide = _fusionValide({ ...boiteA(), qteRestante:0 }, { ...boiteB(), qteRestante:0 });
  ok(rVide.ok === false && /vide/i.test(rVide.raison),
     'B8 · REFUS — deux boîtes vides (rien à fusionner)');

  ok(_fusionValide(null, boiteB()).ok === false && _fusionValide(boiteA(), null).ok === false,
     'B9 · REFUS — une boîte introuvable ne fait pas planter la validation');

  // Une boîte pleine + une vide DU MÊME LOT : la fusion reste utile (on absorbe la vide).
  ok(_fusionValide(boiteA(), { ...boiteB(), qteRestante:0 }).ok === true,
     'B10 · une seule des deux avec stock suffit (fusionner libère la boîte vide)');
}

// ---------------------------------------------------------------------------
// C. LA DLC RETENUE — la plus courte, la plus prudente
// ---------------------------------------------------------------------------
{
  ok(_fusionDlcPlusCourte('2026-08-20', '2026-08-14') === '2026-08-14',
     'C1 · entre deux DLC, on garde la plus PROCHE (la plus prudente)');
  ok(_fusionDlcPlusCourte('2026-08-14', '2026-08-20') === '2026-08-14',
     'C2 · … quel que soit l\'ordre des arguments');
  ok(_fusionDlcPlusCourte(null, '2026-08-14') === '2026-08-14' && _fusionDlcPlusCourte('2026-08-14', null) === '2026-08-14',
     'C3 · une DLC absente laisse l\'autre décider');
  ok(_fusionDlcPlusCourte(null, null) === null,
     'C4 · deux DLC absentes → aucune (pas de date inventée)');
}

// ---------------------------------------------------------------------------
// D. LE CALCUL DE FUSION — somme, invariant, traçabilité
// ---------------------------------------------------------------------------
{
  const A = boiteA(), B = boiteB();
  const c = _fusionCalcul(A, B, round3);
  ok(c.garde === 1 && c.supprime === 2,
     'D1 · on GARDE la boîte A et on SUPPRIME la boîte B (une seule boîte survit)');
  ok(c.patch.qteRestante === 23,
     'D2 · le reste fusionné = la somme des restes (15 + 8 = 23)');
  ok(c.patch.qteProduite === 30 && c.patch.qteReelle === 30 && c.patch.qteTheorique === 30,
     'D3 · les quantités produites/réelles se somment aussi (20 + 10 = 30)');
  const consoAvant = (A.qteProduite - A.qteRestante) + (B.qteProduite - B.qteRestante);
  const consoApres = c.patch.qteProduite - c.patch.qteRestante;
  ok(consoApres === consoAvant && consoApres === 7,
     'D4 · l\'INVARIANT produit − consommé = reste est préservé (5 + 2 = 7 consommés avant comme après)');
  ok(c.patch.dlcProduit === '2026-08-14',
     'D5 · la boîte fusionnée porte la DLC la plus courte des deux');
  ok(Array.isArray(c.patch.fusionHisto) && c.patch.fusionHisto.length === 1 &&
     c.patch.fusionHisto[0].deId === 2 && c.patch.fusionHisto[0].deLot === 'NM-A-101-B2-C' &&
     c.patch.fusionHisto[0].qte === 8 && c.patch.fusionHisto[0].dlcAbsorbee === '2026-08-14',
     'D6 · l\'historique note la boîte absorbée (id, lot, quantité, DLC) — traçabilité physique conservée');
  ok(c.patch.fusionHisto[0].ts > 0,
     'D7 · … avec l\'horodatage de la fusion');

  // Une fusion sur une boîte DÉJÀ fusionnée empile l'historique (ne l'écrase pas).
  const Adeja = { ...boiteA(), fusionHisto:[{ deId:9, deLot:'X', qte:3, dlcAbsorbee:null, ts:1 }] };
  const c2 = _fusionCalcul(Adeja, B, round3);
  ok(c2.patch.fusionHisto.length === 2 && c2.patch.fusionHisto[0].deId === 9 && c2.patch.fusionHisto[1].deId === 2,
     'D8 · fusionner à nouveau EMPILE l\'historique (une boîte peut regrouper plusieurs fois, sans perte de mémoire)');
}

// ---------------------------------------------------------------------------
// E. L'EXÉCUTEUR & LE CÂBLAGE — transaction, audit dédié, sécurité, entrée écran
// ---------------------------------------------------------------------------
{
  ok(/async function fusionnerBoites\(idA, idB\)/.test(cleanApp),
     'E1 · l\'exécuteur fusionnerBoites existe');
  ok(/const v = _fusionValide\(A, B\);\s*if\(!v\.ok\)\{ toast\(v\.raison\); return/.test(cleanApp),
     'E2 · il RE-VALIDE avant d\'écrire (la validation de l\'écran ne suffit pas — défense en profondeur)');
  ok(/snapshotBackup\('avant-fusion-boites'\)/.test(cleanApp),
     'E3 · une sauvegarde de sécurité est prise AVANT la fusion (opération destructive : suppression d\'une boîte)');
  const iExec = cleanApp.indexOf('async function fusionnerBoites');
  const corps = cleanApp.slice(iExec, cleanApp.indexOf('\n}\n', iExec) + 2);
  ok(/db\.transaction\('rw', db\.productions[\s\S]*db\.productions\.update\(idA, calc\.patch\)[\s\S]*db\.productions\.delete\(idB\)/.test(corps),
     'E4 · mise à jour de la gardée ET suppression de l\'absorbée dans UNE transaction (tout ou rien)');
  ok(/op:'fusion-boite'/.test(cleanApp),
     'E5 · une entrée d\'audit dédiée « fusion-boite » rend l\'événement LISIBLE (en plus des écritures auto v1372)');
  ok(/fusionMajBouton\(\$\{k\}\)/.test(APP) && /'\.fus-sel-' \+ grp \+ ':checked'/.test(cleanApp),
     'E6 · en sélection manuelle, les cases d\'un lot sont lues à la volée — même lot GARANTI par le groupe (etiquetteDe)');
  ok(/querySelectorAll\('\.fus-sel-' \+ grp \+ ':checked'\)/.test(cleanApp) && /if\(checked\.length !== 2\)/.test(cleanApp),
     'E7 · la sélection manuelle exige EXACTEMENT deux boîtes (ni une, ni trois)');
  ok(/onclick="fusionOuvrir\(\)"/.test(APP),
     'E8 · l\'entrée « 🔀 Fusionner des boîtes » est branchée sur l\'écran Stock par parfum');
  ok(/function fusionScanA\(\)/.test(cleanApp) && /function fusionScanB\(idA\)/.test(cleanApp) && /openScanner\(/.test(cleanApp),
     'E9 · le mode QR (scan des deux boîtes) réutilise le scanner existant');
  ok(/p\.etiquetteDe == null\)\{ toast\([^)]*\); return null/.test(cleanApp),
     'E10 · un QR qui n\'est pas une boîte issue d\'un lot est refusé dès le scan');
}

// ---------------------------------------------------------------------------
console.log(`\nRésultat : ${nOk} réussis, ${nKo} échoués (${nOk + nKo} assertions).`);
if(nKo === 0) console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
else console.log('✗ RÉGRESSION DÉTECTÉE.\n');
process.exit(nKo ? 1 : 0);
