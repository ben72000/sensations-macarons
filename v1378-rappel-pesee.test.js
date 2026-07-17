/* ============================================================
   TESTS — v1378 : le rappel de pesée ne s'ouvre plus sur les
   deux étapes meringue
   ------------------------------------------------------------
   DEMANDE DE BEN : pendant une production, la fiche de pesée
   (grammages des ingrédients) s'auto-ouvrait au lancement de
   plusieurs étapes. Il veut la SUPPRIMER pour exactement deux :
     1) « Pesée des ingrédients meringue »
     2) « Pesée de la meringue pour division »
   … et la GARDER pour le « tant pour tant ». À ces deux étapes les
   grammages sont déjà pesés : le rappel est du bruit, pas de
   l'information.

   La politique d'auto-ouverture (`_atRappelPesee`) est séparée de
   l'identificateur (`_atPeseeKind`) : retirer un rappel ne fait pas
   mentir l'identificateur, qui garde son rôle (nommer le type de
   pesée).
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1378 : plus de rappel de pesée sur les deux étapes meringue ===\n');

const cleanApp = stripComments(APP);
const aiNormalize = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const mod = new Function('aiNormalize',
  extractFunction('_atPeseeKind') + '\n' + extractFunction('_atRappelPesee') +
  '\nreturn { _atPeseeKind, _atRappelPesee };')(aiNormalize);
const { _atPeseeKind, _atRappelPesee } = mod;

// Les libellés réels des étapes (tels qu'ils apparaissent dans le protocole de production).
const L_TPT      = 'Pesée du tant pour tant (poudre d\'amande + sucre glace)';
const L_MERINGUE = 'Pesée des ingrédients meringue (eau, blanc d\'œuf, sucre)';
const L_DIVISION = 'Pesée de la meringue pour division';
const L_INGRED   = 'Pesée des ingrédients';
const L_MACARON  = 'Macaronnage';
const L_CUISSON  = 'Cuisson';
const L_GARNI    = 'Garnissage';

// ---------------------------------------------------------------------------
// A. LA DEMANDE, AU MOT : rappel retiré pour les deux étapes meringue
// ---------------------------------------------------------------------------
{
  ok(_atRappelPesee(L_MERINGUE) === null,
     'A1 · « Pesée des ingrédients meringue » → PLUS de rappel auto (demande n°1 de Ben)');
  ok(_atRappelPesee(L_DIVISION) === null,
     'A2 · « Pesée de la meringue pour division » → PLUS de rappel auto (demande n°2 de Ben)');
  ok(_atRappelPesee(L_TPT) === 'tpt',
     'A3 · « Pesée du tant pour tant » → rappel CONSERVÉ (Ben veut le garder)');
}

// ---------------------------------------------------------------------------
// B. RIEN D'AUTRE N'A BOUGÉ : les étapes sans rappel restent sans rappel
// ---------------------------------------------------------------------------
{
  ok(_atRappelPesee(L_INGRED) === null,
     'B1 · « Pesée des ingrédients » (générique) : toujours pas de rappel (inchangé)');
  ok([L_MACARON, L_CUISSON, L_GARNI].every(l => _atRappelPesee(l) === null),
     'B2 · Macaronnage / Cuisson / Garnissage : toujours pas de rappel (inchangé)');
}

// ---------------------------------------------------------------------------
// C. L'IDENTIFICATEUR N'A PAS ÉTÉ CORROMPU (on a coupé la POLITIQUE, pas le sens)
// ---------------------------------------------------------------------------
// _atPeseeKind doit TOUJOURS savoir nommer une pesée meringue — c'est l'auto-ouverture qu'on retire,
// pas la connaissance. Sinon un futur usage de _atPeseeKind hériterait d'un mensonge.
{
  ok(_atPeseeKind(L_MERINGUE) === 'meringue' && _atPeseeKind(L_DIVISION) === 'meringue',
     'C1 · _atPeseeKind reconnaît toujours les deux étapes comme « meringue » (identité préservée)');
  ok(_atPeseeKind(L_TPT) === 'tpt',
     'C2 · _atPeseeKind reconnaît toujours le tant pour tant');
  ok(_atPeseeKind(L_MACARON) === null,
     'C3 · … et ne prend pas une étape non-pesée pour une pesée');
}

// ---------------------------------------------------------------------------
// D. LE CÂBLAGE : l'atelier décide via la POLITIQUE, pas via l'identificateur brut
// ---------------------------------------------------------------------------
{
  const iLaunch = cleanApp.indexOf('function atLaunch');
  const corps = cleanApp.slice(iLaunch, cleanApp.indexOf('\n}', iLaunch + 50));
  ok(/const _pk = \(typeof _atRappelPesee==='function'\) \? _atRappelPesee\(label\) : null;/.test(corps),
     'D1 · atLaunch calcule l\'auto-ouverture via _atRappelPesee (la politique), plus via _atPeseeKind brut');
  ok(/if\(_pk && typeof atFichePesee==='function'\)\{ atFichePesee\(_pk\); \}/.test(corps),
     'D2 · … et n\'ouvre la fiche que si la politique renvoie un type (donc jamais pour la meringue)');
  ok(/function _atRappelPesee\(label\)\{\s*return \(_atPeseeKind\(label\) === 'tpt'\) \? 'tpt' : null;\s*\}/.test(cleanApp),
     'D3 · _atRappelPesee ne laisse passer que \'tpt\' — réintroduire \'meringue\' ici ferait échouer la garde');
}

// ---------------------------------------------------------------------------
console.log(`\nRésultat : ${nOk} réussis, ${nKo} échoués (${nOk + nKo} assertions).`);
if(nKo === 0) console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
else console.log('✗ RÉGRESSION DÉTECTÉE.\n');
process.exit(nKo ? 1 : 0);
