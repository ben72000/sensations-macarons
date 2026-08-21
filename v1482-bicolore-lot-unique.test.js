'use strict';
// v1482 — ASSEMBLAGE BLOQUÉ SUR DES COQUES BICOLORES MIGRÉES. Ben : « les macarons chocolat passion
// sont chacun composés d'une coque orange et d'une coque marron. Lorsque je veux faire un assemblage
// l'app me bloque avec ce message » → « Le second lot de coques doit être différent du premier ».
//
// 🚨 DEUX DÉFAUTS DANS SA CAPTURE, dont un qu'il n'avait pas signalé :
//
// ① « #[object Object] » s'affiche partout où le nom du parfum devrait apparaître. `_prodRecName`
//    attend un IDENTIFIANT de recette ; les six appels de cet écran lui passaient l'OBJET LOT, et
//    le repli `'#'+rid` produisait littéralement cette chaîne.
//
// ② Le blocage : la liste du 2ᵉ lot de coques n'excluait PAS le lot déjà choisi comme premier.
//    Il y figurait, et le sélectionner déclenchait un refus — incompréhensible, puisque l'app
//    venait de le proposer.
//
// SUR LE FOND : un lot SANS champ `couleur` porte les DEUX couleurs de sa recette (cf.
// `coqueColorProfile`). Les coques migrées de Ben se suffisent donc à elles-mêmes : « Aucun » est
// le bon choix. Rien ne le disait à l'écran.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. Un lot migré porte bien les deux couleurs (fondement du raisonnement) ----
{
  const M = new Function('COQUE_COULEURS','recCoqueColors', `
    ${extractFunction('coqueColorProfile')}
    ${extractFunction('recEstBicolore')}
    return { coqueColorProfile, recEstBicolore };
  `)({ marron_fonce:1, orange:1 }, rec => (rec && rec.coqueColors) || []);

  const recCHP = { id:3, produitNom:'Chocolat passion', coqueColors:['marron_fonce','orange'] };
  const recById = { 3: recCHP };

  check('A. « Chocolat passion » est bien reconnu bicolore', M.recEstBicolore(recCHP) === true);

  const lotMigre = { id:10, recipeId:3 };                       // AUCUN champ couleur
  const prof = M.coqueColorProfile(lotMigre, recById);
  check('A. un lot migré (sans champ couleur) porte les DEUX couleurs', prof.colors.length === 2);
  check('A. …exactement marron foncé + orange', prof.colors.includes('marron_fonce') && prof.colors.includes('orange'));

  const lotOrange = { id:11, recipeId:3, couleur:'orange' };     // lot séparé par couleur
  check('A. un lot marqué d\'une couleur n\'en porte qu\'UNE', M.coqueColorProfile(lotOrange, recById).colors.length === 1);
}

// ---- B. ① le nom du parfum ne s'affiche plus en « [object Object] » ----
{
  // ⚠️ Bornage EXACT : une tranche fixe débordait sur la fonction suivante (qui contient un
  //    `await`), et le bac à sable refusait de se construire. On coupe à la fin du helper.
  const i = APP.indexOf('const _recNameBrut');
  const fin = APP.indexOf('return _recNameBrut(x);', i);
  // ⚠️ Si le helper a disparu (mutation), on ne PLANTE pas : on renvoie le comportement d'AVANT
  //    le correctif, pour que les assertions rougissent au lieu d'interrompre la suite. Une suite
  //    qui plante ne prouve pas qu'un défaut est détecté.
  const M = (i >= 0 && fin > i)
    ? new Function('window', `${APP.slice(i, APP.indexOf('};', fin) + 2)}\nreturn recName;`)({ _prodRecName: rid => 'Recette#' + rid })
    : (x => '#' + x);

  check('B. un OBJET LOT est accepté (c\'est ce que passaient les 6 appels)', M({ recipeId:3 }) === 'Recette#3');
  check('B. un IDENTIFIANT reste accepté (non-régression)', M(3) === 'Recette#3');
  check('B. plus jamais « [object Object] »', !/object Object/.test(String(M({ recipeId:3 }))));
  check('B. un produit libre est nommé par son libellé', M({ produitLibre:'Test maison' }) === 'Test maison');
  check('B. un lot sans recette ni libellé est nommé lisiblement', M({}) === '(sans nom)');
}

// ---- C. ② le lot courant est exclu de la liste du second lot ----
{
  const i = APP.indexOf('const _opts2 = _lots2');
  const src = APP.slice(i - 500, i + 400);
  check('C. la liste exclut le lot déjà choisi', /_lots2\.filter\(c=>\+c\.id !== \+p\.id\)/.test(src));

  // Comportement : le lot courant ne peut plus être proposé, donc plus déclencher le refus.
  const lots = [{ id:10 }, { id:11 }, { id:12 }];
  const p = { id:10 };
  const proposes = lots.filter(c => +c.id !== +p.id).map(c => c.id);
  check('C. le lot courant (10) n\'est plus proposé', !proposes.includes(10));
  check('C. les autres lots restent proposés', proposes.length === 2);
}

// ---- D. La garde de sauvegarde reste en place (elle n'était PAS le défaut) ----
{
  const src = extractFunction('prodAssembleSave');
  check('D. deux fois le même lot reste refusé à l\'enregistrement',
    /Le second lot de coques doit être différent du premier/.test(src));
  check('D. un second lot introuvable reste refusé', /Second lot de coques introuvable/.test(src));
  // ⚠️ Le code échappe l'apostrophe (\\'), la recherche doit donc porter sur la partie stable.
  check('D. un second lot qui n\'est pas des coques reste refusé',
    /Le second lot sélectionné/.test(src) && /pas un lot de coques/.test(src));
}

// ---- E. L'écran DIT que le lot se suffit à lui-même ----
{
  const i = APP.indexOf('const _lotDejaBicolore');
  const src = APP.slice(i, i + 1200);
  check('E. le cas « lot portant déjà les 2 couleurs » est distingué', /_bicolore && !p\.couleur/.test(src));
  check('E. …et l\'aide dit de laisser « Aucun »', /contient <b>déjà les deux couleurs<\/b>/.test(src));
  check('E. le cas « lot d\'une seule couleur » garde son aide d\'origine',
    /Ce lot ne contient qu'<b>une<\/b> couleur/.test(src));
  check('E. l\'option « Aucun » reste proposée', /Aucun : les 2 coques viennent du même lot/.test(APP));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
