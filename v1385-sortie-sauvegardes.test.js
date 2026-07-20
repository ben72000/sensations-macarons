/* ============================================================
   TESTS — v1385 · CHANTIER C : SORTIR LES SAUVEGARDES DE LA BOÎTE
   ------------------------------------------------------------
   CE QUE CETTE SUITE INTERDIT DE RÉINTRODUIRE.

   L'audit de juillet 2026, faille 3. Trois faits distincts :

   1) db.backups vit dans la MÊME base IndexedDB que les données qu'il
      protège. Le danger que l'app nomme elle-même partout (« effacer
      l'historique Safari supprime aussi la base ») emporte les 20
      instantanés AVEC les données. Une copie qui meurt quand meurt
      l'original n'est pas une sauvegarde.

   2) exportData() faisait :
          a.click();
          localStorage.setItem('sm_lastExport', today());
      Le commentaire juste dessous admettait : « L'app ne peut PAS savoir
      si la sauvegarde a été confirmée ». Elle l'écrivait quand même. Un
      partage annulé d'un geste éteignait le rappel SEPT JOURS et remettait
      le compteur de travail non sauvegardé à zéro.

   3) Une seule clé portait deux sens : « j'ai demandé » et « c'est fait ».

   LA RÈGLE FIGÉE, que ces tests protègent :
   une sauvegarde n'est acquise que lorsqu'elle est SORTIE de l'appareil,
   et une sortie n'est acquise que lorsqu'elle est CONSTATÉE — jamais
   parce qu'on l'a demandée.

   Ces tests ne vérifient pas que du code existe : ils simulent de VRAIS
   partages annulés et exigent que l'app reste inquiète.
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}

// Monte le moteur de sortie avec un localStorage SIMULÉ et une horloge fixe.
// Le harnais fournit today()/fmtDate()/daysTo() — les vraies dépendances — pour que
// les verdicts portent sur le code livré, pas sur une reformulation de test.
//
// [INCIDENT DE HARNAIS, corrigé] Ma première version exposait l'objet ACCESSEUR
// (celui qui porte getItem/setItem) sous le nom `LS`, alors que le vrai magasin est
// un objet distinct fermé dans la closure. Les tests écrivaient donc dans une
// propriété que PERSONNE ne lisait, et 9 assertions échouaient sans que le code
// livré soit en cause. C'est le motif du chantier A — un harnais qui ne branche pas
// ce qu'il croit brancher. Ici il a échoué BRUYAMMENT (rouge), pas en vert : c'est
// la seule raison pour laquelle il n'a pas menti. On expose désormais le magasin.
function monteMoteur(aujourdhui){
  const LS = {};
  const faux = {
    getItem: k => (k in LS ? LS[k] : null),
    setItem: (k, v) => { LS[k] = String(v); },
    removeItem: k => { delete LS[k]; }
  };
  const socle = `
    const localStorage = __LS__;
    const AUJ = ${JSON.stringify(aujourdhui)};
    function today(){ return AUJ; }
    function fmtDate(d){ return String(d); }
    // daysTo : négatif = dans le passé (convention de l'app)
    function daysTo(d){
      if(!d) return null;
      const a = Date.parse(d + 'T00:00:00Z'), b = Date.parse(AUJ + 'T00:00:00Z');
      if(isNaN(a) || isNaN(b)) return null;
      return Math.round((a - b) / 86400000);
    }
    let _unsaved = 5;
    function clearUnsaved(){ _unsaved = 0; }
    function unsavedCount(){ return _unsaved; }
    function swallow(){}
    const APP_VERSION = 'test';
    const view = '';
    const db = { auditLog: { add: () => ({ catch: () => {} }) } };
    function _auditResume(o){ return JSON.stringify(o); }
  `;
  const src = [
    socle,
    stripComments(extraitConst('SORTIE_TENTEE_KEY')),
    stripComments(extraitConst('SORTIE_CONFIRMEE_KEY')),
    extractFunction('sortieMarqueTentee'),
    extractFunction('sortieMarqueConfirmee'),
    extractFunction('sortieTenteeNonConfirmee'),
    extractFunction('sortieEtat')
  ].join('\n');
  const f = new Function('__LS__', src +
    '\n; return { sortieMarqueTentee, sortieMarqueConfirmee, sortieTenteeNonConfirmee,' +
    ' sortieEtat, unsavedCount };');
  const api = f(faux);
  api.LS = LS;            // le VRAI magasin, celui que getItem/setItem lisent
  return api;
}

function extraitConst(nom){
  const re = new RegExp('^const ' + nom + '\\s*=\\s*[^\\n]*$', 'm');
  const m = APP.match(re);
  if(!m) throw new Error('Constante introuvable : ' + nom);
  return m[0];
}

(async () => {
console.log('\n=== TESTS — v1385 · Chantier C : sortir les sauvegardes de la boîte ===\n');

// ---------------------------------------------------------------------------
// 0. LE HARNAIS PROUVE QU'IL VOIT QUELQUE CHOSE
//    Sans ce contrôle, tous les « rappel actif » ci-dessous pourraient être
//    vrais simplement parce que le moteur ne fait rien du tout.
// ---------------------------------------------------------------------------
console.log('0. Le harnais lui-même');
{
  const M = monteMoteur('2026-07-20');
  ok(M.sortieEtat(7).jamais === true, 'état initial : aucune sortie connue (le moteur répond)');
  M.sortieMarqueConfirmee('fichier');
  ok(M.sortieEtat(7).jamais === false, 'après confirmation, l\'état CHANGE (le moteur n\'est pas inerte)');
  ok(M.LS['sm_lastExport'] === '2026-07-20', 'et il écrit réellement dans le stockage');
}

// ---------------------------------------------------------------------------
// 1. LA FAILLE ELLE-MÊME : une sortie tentée puis ANNULÉE ne doit rien éteindre
// ---------------------------------------------------------------------------
console.log('\n1. Le cas de la faille : le partage annulé');
{
  const M = monteMoteur('2026-07-20');
  M.sortieMarqueTentee('icloud');          // Ben ouvre le partage… puis annule
  const e = M.sortieEtat(7);
  ok(e.jamais === true, 'une TENTATIVE ne compte pas comme une sortie');
  ok(e.enRetard === true, 'le rappel reste ACTIF après une tentative non confirmée');
  ok(M.LS['sm_lastExport'] === undefined || M.LS['sm_lastExport'] === null,
     'la clé de sortie confirmée n\'est PAS écrite par une tentative');
  ok(M.unsavedCount() === 5, 'le compteur de travail non sauvegardé n\'est PAS remis à zéro');
  ok(M.LS['sm_exportSnooze'] === undefined || M.LS['sm_exportSnooze'] === null,
     'aucun report de rappel n\'est posé');
  ok(/tentative/i.test(e.texte), 'le texte MENTIONNE la tentative au lieu de la taire');
}

// ---------------------------------------------------------------------------
// 2. UNE SORTIE CONFIRMÉE, ELLE, COMPTE VRAIMENT
//    Le symétrique : un contrôle qui ne se laisse jamais satisfaire serait
//    aussi inutile qu'un contrôle absent (leçon v1370).
// ---------------------------------------------------------------------------
console.log('\n2. Une sortie confirmée compte');
{
  const M = monteMoteur('2026-07-20');
  M.sortieMarqueTentee('icloud');
  M.sortieMarqueConfirmee('icloud');
  const e = M.sortieEtat(7);
  ok(e.jamais === false && e.confirmee === '2026-07-20', 'la sortie confirmée est enregistrée');
  ok(e.enRetard === false, 'le rappel s\'éteint — mais seulement là');
  ok(e.jours === 0, 'l\'âge est 0 jour');
  ok(M.unsavedCount() === 0, 'le compteur de travail non sauvegardé retombe à zéro');
  ok(M.LS['sm_lastICloud'] === '2026-07-20', 'le canal iCloud est tracé séparément');
  ok(M.sortieTenteeNonConfirmee() === null, 'la tentative est absorbée par la confirmation');
  ok(!/tentative/i.test(e.texte), 'le texte ne parle plus d\'une tentative en suspens');
}

// ---------------------------------------------------------------------------
// 3. L'ÂGE RÉEL — le rappel se rallume tout seul
// ---------------------------------------------------------------------------
console.log('\n3. L\'âge réel de la dernière sortie');
{
  const M = monteMoteur('2026-07-20');
  M.LS['sm_lastExport'] = '2026-07-13';        // sortie confirmée il y a 7 jours
  const e = M.sortieEtat(7);
  ok(e.jours === 7, 'l\'âge est calculé en jours réels');
  ok(e.enRetard === true, 'à 7 jours avec un seuil de 7, le rappel se rallume');
  const M2 = monteMoteur('2026-07-20');
  M2.LS['sm_lastExport'] = '2026-07-18';
  ok(M2.sortieEtat(7).enRetard === false, 'à 2 jours, pas de rappel (aucun faux positif)');
  const M3 = monteMoteur('2026-07-20');
  M3.LS['sm_lastExport'] = '2026-05-01';
  ok(M3.sortieEtat(7).jours === 80, 'une sortie très ancienne est comptée exactement (80 j)');
  ok(/2026-05-01/.test(M3.sortieEtat(7).texte), 'et la date réelle est affichée, pas approximée');
}

// ---------------------------------------------------------------------------
// 4. UNE TENTATIVE PLUS RÉCENTE QU'UNE CONFIRMATION ANCIENNE
//    Le cas sournois : Ben a bien sauvegardé le 1er, a tenté le 20 et annulé.
//    L'app doit dire les DEUX, sans que la tentative n'écrase la vérité.
// ---------------------------------------------------------------------------
console.log('\n4. Tentative récente vs confirmation ancienne');
{
  const M = monteMoteur('2026-07-20');
  M.LS['sm_lastExport'] = '2026-07-01';
  M.sortieMarqueTentee('icloud');
  const e = M.sortieEtat(7);
  ok(e.confirmee === '2026-07-01', 'la dernière sortie RÉELLE reste celle du 1er');
  ok(e.jours === 19, 'l\'âge est celui de la confirmation, pas de la tentative');
  ok(e.enRetard === true, 'donc le rappel est bien actif');
  ok(e.tentee !== null, 'la tentative du 20 est retenue');
  ok(/tentative/i.test(e.texte), 'et annoncée à l\'écran');
  // et l'inverse : une confirmation postérieure absorbe la tentative
  M.sortieMarqueConfirmee('fichier');
  ok(M.sortieTenteeNonConfirmee() === null, 'une confirmation postérieure absorbe la tentative');
}

// ---------------------------------------------------------------------------
// 5. ROBUSTESSE — l'état ne doit jamais faire planter l'écran
// ---------------------------------------------------------------------------
console.log('\n5. Le moteur ne casse jamais');
{
  const M = monteMoteur('2026-07-20');
  let jete = false;
  try{
    M.LS['sm_lastExportTente'] = 'pas du json';     // stockage corrompu
    M.sortieTenteeNonConfirmee();
    M.sortieEtat(7);
    M.LS['sm_lastExport'] = 'pas-une-date';
    M.sortieEtat(7);
    M.sortieEtat(0);
    M.sortieEtat(undefined);
  }catch(e){ jete = true; }
  ok(!jete, 'un stockage corrompu ne fait pas planter l\'état');
  const M2 = monteMoteur('2026-07-20');
  M2.LS['sm_lastExportTente'] = 'pas du json';
  ok(M2.sortieTenteeNonConfirmee() === null, 'une tentative illisible est ignorée, pas devinée');
  const M3 = monteMoteur('2026-07-20');
  M3.LS['sm_lastExport'] = 'pas-une-date';
  ok(M3.sortieEtat(7).enRetard === true,
     'une date de sortie illisible est traitée comme un RISQUE, jamais comme un succès');
}

// ---------------------------------------------------------------------------
// 6. LE CÂBLAGE RÉEL — l'affirmation optimiste a bien disparu du code livré
//    Une protection non appelée est une protection absente (règle v1383).
// ---------------------------------------------------------------------------
console.log('\n6. L\'affirmation optimiste a disparu');
{
  const exportSrc = extractFunction('exportData');
  const icloudSrc = extractFunction('shareBackupToICloud');
  const dlSrc     = extractFunction('downloadBackup');

  ok(!/a\.click\(\);\s*\n\s*localStorage\.setItem\('sm_lastExport'/.test(exportSrc),
     'exportData n\'écrit plus sm_lastExport juste après le clic');
  ok(/sortieMarqueTentee/.test(exportSrc) && /sortieDemandeConfirmation/.test(exportSrc),
     'exportData enregistre une tentative puis DEMANDE confirmation');
  ok(/sortieMarqueTentee/.test(icloudSrc) && /sortieDemandeConfirmation/.test(icloudSrc),
     'le partage iCloud fait de même (navigator.share qui rend la main ne prouve rien)');
  ok(/sortieMarqueTentee/.test(dlSrc) && /sortieDemandeConfirmation/.test(dlSrc),
     'le téléchargement d\'un instantané fait de même');

  // AUCUN chemin ne doit plus écrire la sortie confirmée à la main.
  // On juge la SOURCE DÉCOMMENTÉE : un exemple cité dans un commentaire d'explication
  // n'est pas un appelant. (Ma première version comptait mon propre commentaire.)
  const nu = stripComments(APP);
  const parts = nu.split('function sortieMarqueConfirmee');
  const horsMoteur = parts[0] + (parts[1] ? parts[1].split('\n}').slice(1).join('\n}') : '');
  ok(!/localStorage\.setItem\('sm_lastExport',\s*today\(\)\)/.test(horsMoteur),
     'PLUS AUCUN appelant n\'écrit sm_lastExport directement (une seule porte)');

  const reminder = extractFunction('exportReminder');
  ok(/sortieEtat/.test(reminder), 'le rappel lit l\'état honnête au lieu de la clé brute');
  const rb = extractFunction('renderBackups');
  ok(/sortieEtat/.test(rb), 'l\'écran Sauvegardes lit le même état (une seule vérité)');
}

// ---------------------------------------------------------------------------
// 7. LA MISE EN GARDE EST ÉCRITE À L'ÉCRAN
//    Le fait n°1 de la faille — les instantanés sont DANS la boîte — doit être
//    dit là où Ben les voit, sinon il continuera de les croire protecteurs.
// ---------------------------------------------------------------------------
console.log('\n7. La boîte est nommée à l\'écran');
{
  const rb = extractFunction('renderBackups');
  ok(/DANS cette app/.test(rb), 'l\'écran dit que les instantanés vivent dans l\'app');
  ok(/purge iOS|purge/.test(rb), 'et qu\'ils ne protègent PAS d\'une purge iOS');
  ok(/ailleurs/.test(rb), 'et que seul un fichier rangé ailleurs protège de ça');
  ok(!/vos données sont en sécurité/i.test(APP),
     'nulle part l\'app n\'affirme une sécurité qu\'elle ne peut pas prouver');
}

// ---------------------------------------------------------------------------
// 8. INTÉGRITÉ DE L'EXISTANT — C ne casse ni A ni B
// ---------------------------------------------------------------------------
console.log('\n8. L\'existant est intact');
{
  ok(/version\(33\)/.test(APP), 'le schéma v33 (chantier A) est intact');
  ok(/valideDumpAvantImport/.test(APP), 'le contrôle d\'import (chantier B) est intact');
  ok(/errLog/.test(APP), 'la table errLog du chantier A est toujours là');
  ok(/op:'sortie-confirmee'/.test(APP), 'une sortie confirmée laisse une trace au journal d\'audit');
  ok(/MAX_BACKUPS/.test(APP), 'l\'historique interne reste en place (il sert toujours contre les fausses manœuvres)');
}

console.log(`\n--- Résultat : ${nOk} assertion(s) vraie(s), ${nKo} échec(s) ---\n`);
process.exit(nKo ? 1 : 0);
})();
