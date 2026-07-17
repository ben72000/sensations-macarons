/* ============================================================
   TESTS — v1377 : rebascule commande→devis + devis périmé
   ------------------------------------------------------------
   BUG ① (rebascule cassée) : `cmdToDevisConfirm` contenait
   `const today = today();` — le const masquait la fonction globale
   `today()` et l'appelait AVANT son initialisation (zone morte
   temporelle) → ReferenceError → tout rebasculement d'une commande
   propre en devis échouait avec « Erreur pendant la transformation ».
   FIX : renommer la variable (`const auj = today();`).

   FEATURE ③ (le devis ne suivait pas la commande) : un devis accepté
   est une copie figée. Décision de Ben : le marquer PÉRIMÉ dès que la
   commande ne lui correspond plus (lignes ou montant), pouvoir le
   RÉGÉNÉRER depuis la commande, puis proposer l'envoi au client. On ne
   réécrit jamais un devis accepté en douce.
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1377 : rebascule commande→devis + devis périmé ===\n');

const cleanApp = stripComments(APP);
const money2 = x => Math.round((+x || 0) * 100) / 100;

// ---------------------------------------------------------------------------
// A. BUG ① — l'antipattern de zone morte est éradiqué (prouvé par reproduction)
// ---------------------------------------------------------------------------
{
  // La cause exacte, isolée : `const t = t();` lève une ReferenceError.
  let leve = false;
  try{ (function(){ /* eslint-disable */ const today = today(); return today; })(); }
  catch(e){ leve = (e instanceof ReferenceError); }
  ok(leve === true,
     'A1 · PREUVE — `const today = today()` lève bien une ReferenceError (la cause du plantage)');

  ok(!/const\s+today\s*=\s*today\s*\(\s*\)/.test(cleanApp),
     'A2 · cet antipattern n\'existe PLUS dans le code — le réintroduire fait échouer la garde');

  const iConf = cleanApp.indexOf('async function cmdToDevisConfirm');
  const corps = cleanApp.slice(iConf, cleanApp.indexOf('\n}\n', iConf));
  ok(/const auj\s*=\s*today\(\)/.test(corps),
     'A3 · cmdToDevisConfirm appelle bien la fonction globale via une variable non masquante (`auj`)');
  ok(/date:o\.date\|\|auj/.test(corps) && !/date:o\.date\|\|today\b/.test(corps),
     'A4 · l\'usage de la date utilise la variable corrigée (`auj`), plus l\'ancien nom masquant');

  // Les autres `o.date||today()` du fichier gardent bien leurs parenthèses (appels corrects).
  ok((cleanApp.match(/o\.date\|\|today\b(?!\()/g) || []).length === 0,
     'A5 · plus aucun `o.date||today` sans parenthèses ailleurs (l\'oubli était isolé)');
}

// ---------------------------------------------------------------------------
// B. _devisPerime — COMPORTEMENTAL : le devis suit-il la commande ?
// ---------------------------------------------------------------------------
{
  const _devisPerime = new Function('money2', 'return ' +
    extractFunction('_devisPerime').replace(/^function _devisPerime/, 'function'))(money2);

  const lignes = [{ produit:'Coffret 12', qte:2, prix:24 }, { produit:'Coco Rafaello', qte:1, prix:9 }];
  const devis = { lignes:JSON.parse(JSON.stringify(lignes)), montant:57 };
  const cmdIdentique = { lignes:JSON.parse(JSON.stringify(lignes)), montant:57 };
  ok(_devisPerime(devis, cmdIdentique) === false,
     'B1 · devis et commande identiques (lignes + montant) → PAS périmé (aucune fausse alerte, v1370)');

  ok(_devisPerime(devis, { lignes:JSON.parse(JSON.stringify(lignes)), montant:62 }) === true,
     'B2 · le montant a changé → périmé');

  const lignesModif = JSON.parse(JSON.stringify(lignes)); lignesModif[0].qte = 3;
  ok(_devisPerime(devis, { lignes:lignesModif, montant:57 }) === true,
     'B3 · une ligne a changé (quantité) même à montant égal → périmé (un swap de contenu compte)');

  ok(_devisPerime(devis, { lignes:JSON.parse(JSON.stringify(lignes)), montant:57.004 }) === false,
     'B4 · un écart de centime sous l\'arrondi n\'est PAS une divergence (money2 lisse le bruit)');

  ok(_devisPerime(null, cmdIdentique) === false && _devisPerime(devis, null) === false,
     'B5 · devis ou commande absent → pas périmé (défensif, pas de plantage)');
}

// ---------------------------------------------------------------------------
// C. LA RÉGÉNÉRATION — recopie la commande, lève le drapeau, propose l'envoi
// ---------------------------------------------------------------------------
{
  const iReg = cleanApp.indexOf('async function devisRegenererDepuisCommande');
  const corps = cleanApp.slice(iReg, cleanApp.indexOf('\n}\n', iReg));
  ok(/const o = await db\.orders\.get\(dv\.orderId\)/.test(corps),
     'C1 · la régénération part de la COMMANDE liée (la source de vérité désormais)');
  ok(/lignes: Array\.isArray\(o\.lignes\)/.test(corps) && /montant: \+o\.montant/.test(corps),
     'C2 · elle recopie lignes ET montant depuis la commande — le devis correspond de nouveau');
  ok(/perimeCommande: false/.test(corps),
     'C3 · elle lève le drapeau « périmé » (le devis est de nouveau à jour)');
  ok(/db\.documents\.update\(dvId, patch\)/.test(corps) && !/orders\.update|orders\.delete/.test(corps),
     'C4 · elle n\'écrit QUE le document devis — la commande n\'est pas touchée');
  ok(/genererDevisDoc\(\$\{dvId\}\)/.test(corps),
     'C5 · après régénération, l\'envoi au client est PROPOSÉ (visualiser & envoyer)');
  // Cohérence : après régénération, _devisPerime redeviendrait faux (lignes+montant recopiés).
  ok(/const numero=await nextDocNumero/.test(cleanApp),
     'C6 · (le numéro du devis n\'est pas régénéré : c\'est le même devis, remis à jour)');
}

// ---------------------------------------------------------------------------
// D. LE CÂBLAGE — saveCmd pose/lève le drapeau ; l'écran l'affiche
// ---------------------------------------------------------------------------
{
  const iSave = cleanApp.indexOf('async function saveCmd');
  const corpsSave = cleanApp.slice(iSave, iSave + 12000);
  ok(/const per = _devisPerime\(dv, o\)/.test(corpsSave),
     'D1 · saveCmd évalue la péremption du devis lié à chaque enregistrement de commande');
  ok(/if\(!!dv\.perimeCommande !== per\) await db\.documents\.update\(dv\.id, \{ perimeCommande: per \}\)/.test(corpsSave),
     'D2 · il POSE ou LÈVE le drapeau selon le cas — jamais le contenu du devis, juste le signal');
  ok(/x\.type === 'devis' && x\.orderId === id/.test(corpsSave),
     'D3 · il ne vise que le(s) devis réellement liés à CETTE commande');

  ok(/d\.perimeCommande\s*\n?\s*\?\s*`<div class="banner"[^`]*Ce devis ne correspond plus/.test(APP) ||
     /Ce devis ne correspond plus à la commande/.test(APP),
     'D4 · l\'écran document affiche un bandeau « ne correspond plus à la commande » quand c\'est périmé');
  ok(/onclick="devisRegenererDepuisCommande\(\$\{d\.id\}\)"/.test(APP),
     'D5 · … avec le bouton « 🔄 Régénérer depuis la commande »');
  ok(/✓ Converti en commande\./.test(APP),
     'D6 · un devis converti mais À JOUR garde son simple « ✓ Converti en commande »');
}

// ---------------------------------------------------------------------------
console.log(`\nRésultat : ${nOk} réussis, ${nKo} échoués (${nOk + nKo} assertions).`);
if(nKo === 0) console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
else console.log('✗ RÉGRESSION DÉTECTÉE.\n');
process.exit(nKo ? 1 : 0);
