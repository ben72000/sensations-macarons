/* ============================================================
   TESTS — v1394 : CALENDRIER AUTOMATIQUE DES COMMANDES
   ------------------------------------------------------------
   LE BUG (vu par Ben) : une commande « cochée » pour le calendrier
   n'apparaissait pas toujours. CAUSE : l'ajout dépendait de
   document.getElementById('f_cal').checked — donc de la PRÉSENCE de la case
   dans le DOM au moment de la sauvegarde. Par un chemin sans le formulaire
   affiché, cb était null → aucun événement, même case « cochée ».

   LA DEMANDE DE BEN : chaque commande s'ajoute TOUJOURS au calendrier,
   automatiquement, sans case, sans y penser.

   L'ARCHITECTURE v1394 :
     • syncOrderEvent(oid) = SOURCE UNIQUE de l'événement-calendrier d'une
       commande. Recrée l'événement (idempotent : supprime l'ancien d'abord).
     • saveCmd et docConvertToOrder l'appellent → toute commande à venir est
       notée, quel que soit le chemin.
     • migSaveOrder (historique/compta, ventes déjà livrées) N'appelle PAS
       syncOrderEvent — décision Ben : le passé n'encombre pas le calendrier.
     • La case f_cal est SUPPRIMÉE du formulaire.

   CE QUE CE TEST GÈLE :
     1. syncOrderEvent existe et n'écrit plus via une case DOM.
     2. saveCmd n'utilise plus getElementById('f_cal') ni de condition sur
        la case ; il appelle syncOrderEvent.
     3. docConvertToOrder (devis → commande) appelle syncOrderEvent.
     4. migSaveOrder n'appelle PAS syncOrderEvent (historique hors calendrier).
     5. la case f_cal a disparu du formulaire commande.
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1394 : calendrier automatique des commandes ===\n');

const clean = stripComments(APP);

// 1. syncOrderEvent : source unique, sans dépendance DOM.
{
  const fn = extractFunction('syncOrderEvent');
  ok(/function\s+syncOrderEvent/.test(fn), 'syncOrderEvent est défini');
  ok(/db\.events\.add/.test(fn), 'syncOrderEvent crée l\'événement calendrier');
  ok(/db\.events\.where\('refId'\)\.equals\(oid\)\.delete/.test(fn),
     'syncOrderEvent supprime l\'ancien d\'abord (idempotent, pas de doublon)');
  ok(!/getElementById\(['"]f_cal['"]\)/.test(fn) && !/\.checked/.test(fn),
     'syncOrderEvent ne dépend d\'AUCUNE case DOM (la cause du bug)');
}

// 2. saveCmd appelle la source unique et n'utilise plus la case.
{
  const fn = extractFunction('saveCmd');
  ok(/syncOrderEvent\(/.test(fn), 'saveCmd appelle syncOrderEvent');
  ok(!/getElementById\(['"]f_cal['"]\)/.test(fn),
     'saveCmd ne lit plus la case f_cal (plus de dépendance DOM)');
  ok(!/const\s+cb\s*=\s*document\.getElementById/.test(fn),
     'saveCmd n\'a plus la logique conditionnelle « if(cb && cb.checked) »');
}

// 3. docConvertToOrder (devis → commande) note aussi au calendrier.
{
  const fn = extractFunction('docConvertToOrder');
  ok(/syncOrderEvent\(/.test(fn),
     'docConvertToOrder (devis → commande) appelle syncOrderEvent');
}

// 4. migSaveOrder (historique) NE note PAS au calendrier (décision Ben).
{
  const fn = extractFunction('migSaveOrder');
  ok(!/syncOrderEvent\(/.test(fn),
     'migSaveOrder (historique/compta) n\'ajoute PAS au calendrier (le passé n\'encombre pas)');
}

// 5. la case f_cal a disparu du formulaire.
{
  ok(!/id="f_cal"/.test(clean), 'la case « Ajouter au calendrier » (f_cal) est supprimée du formulaire');
  ok(/ajout[ée]e? automatiquement au calendrier/i.test(clean),
     'le formulaire indique que l\'ajout est automatique');
}

console.log(`\n=== v1394 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
