/* ============================================================
   TESTS — v1373 : les schémas de validation à l'entrée
   ------------------------------------------------------------
   LA PROMESSE DU CHANTIER : « je remets un string où on attend un
   number » devient IMPOSSIBLE — refusé à l'écriture, motif lisible.

   LA LEÇON v1370 APPLIQUÉE AU VALIDATEUR LUI-MÊME : un contrôle qui
   refuse (ou même suspecte) des données SAINES détruit la confiance.
   La moitié de cette suite est donc un CORPUS de fixtures à la forme
   réelle (relevée aux sites de création du code) que le validateur
   doit accepter SANS erreur NI alerte. L'autre moitié prouve que les
   fautes promises sont bien refusées — et que le refus est réel
   (exception typée), journalisé, et débrayable sans devenir muet.
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1373 : schémas de validation à l\'entrée ===\n');

// ---------------------------------------------------------------------------
// Assemblage du module (motif des autres harnais : le VRAI code, jamais une copie)
// ---------------------------------------------------------------------------
function extractBloc(marqueur, closer){
  const i = APP.indexOf(marqueur);
  if(i === -1) throw new Error('Introuvable : ' + marqueur);
  const clean = stripComments(APP.slice(i, i + 20000));
  const j = clean.indexOf(closer);
  if(j === -1) throw new Error('Fin introuvable : ' + marqueur);
  return clean.slice(0, j + closer.length);
}
const code = [
  extractBloc('const VALIDE_TYPES = {', '\n};'),
  extractBloc('const VALIDE_SCHEMAS = {', '\n};'),
  extractFunction('_valideChamp'),
  extractFunction('_valideDecrit'),
  extractFunction('_valideObjet'),
  extractBloc('class ValidationRefusee', '\n}'),
  extractFunction('_valideApplique')
].join('\n');

function buildModule(env){
  const src = `(function(db, view, APP_VERSION, swallow, toast, valideStricteActive, _valideCompteurs, _horsTransaction, _auditResume){
    ${code}
    return { VALIDE_TYPES, VALIDE_SCHEMAS, _valideChamp, _valideObjet, _valideDecrit, _valideApplique, ValidationRefusee };
  })`;
  return eval(src)(env.db, env.view, env.APP_VERSION, env.swallow, env.toast,
    env.valideStricteActive, env._valideCompteurs, env._horsTransaction, env._auditResume);
}
const neutre = () => ({
  db:{ auditLog:{ add:(e)=>({ catch:()=>{} }) } }, view:'test', APP_VERSION:'vTEST',
  swallow:()=>{}, toast:()=>{}, valideStricteActive:()=>true,
  _valideCompteurs:{ rejets:0, suspects:0 }, _horsTransaction:(fn)=>fn(),
  _auditResume:(o)=>JSON.stringify(o)
});
const M = buildModule(neutre());

// ---------------------------------------------------------------------------
// A. LES TYPES — chacun répond juste, cas limites compris
// ---------------------------------------------------------------------------
{
  const T = M.VALIDE_TYPES;
  ok(T.nombreFini(12.5) && !T.nombreFini('12.5') && !T.nombreFini(NaN) && !T.nombreFini(Infinity),
     'A1 · nombreFini : accepte 12.5, refuse la CHAÎNE « 12.5 », NaN et Infinity — la promesse du chantier');
  ok(T.dateJ('2026-07-16') && !T.dateJ('16/07/2026') && !T.dateJ('2026-7-1') && !T.dateJ('2026-07-16T10:00:00Z'),
     'A2 · dateJ : le format de today() et rien d\'autre (ni date française, ni ISO long)');
  ok(T.idRef(42) && T.idRef(0) && T.idRef('uuid-abc') && !T.idRef('') && !T.idRef(NaN),
     'A3 · idRef : id numérique, 0 compris (« sans fournisseur », supplierId:0), ou uuid non vide');
  ok(T.horoMs(Date.now()) && !T.horoMs(0) && !T.horoMs(1.5),
     'A4 · horoMs : un Date.now() plausible — jamais 0, jamais fractionnaire');
  ok(T.chaineNonVide('x') && !T.chaineNonVide('   ') && !T.chaineNonVide(''),
     'A5 · chaineNonVide : les espaces seuls ne sont pas un contenu');
  ok(T.tableau([]) && !T.tableau({}) && T.objet({}) && !T.objet([]) && !T.objet(null),
     'A6 · tableau/objet : jamais confondus, et null n\'est pas un objet');
}

// ---------------------------------------------------------------------------
// B. LE CORPUS SAIN — la forme réelle passe SANS erreur NI alerte (leçon v1370)
//    Chaque fixture est calquée sur le site de création cité dans le schéma.
// ---------------------------------------------------------------------------
{
  const corpus = [
    // cmdSave / conversion de devis (o = clientId, date, statut, lignes, paiements…)
    ['orders', { clientId:3, date:'2026-07-16', statut:'À préparer', montant:86, lignes:[{}],
                 paiements:[{ date:'2026-07-16', montant:20, moyen:null, acompte:true }],
                 remiseGlobale:0, fraisLivraison:0, distanceKm:12.4, notes:'' }],
    ['orders', { clientId:null, date:'2026-05-02', statut:'Livrée', montant:45, lignes:[], paiements:[] }],
    // saveCharge : {date, categorie, libelle, montant}
    ['charges', { date:'2026-07-01', categorie:'Assurance', libelle:'RC pro', montant:32.5 }],
    // réception de lot : {materialId, supplierId:0, lotFournisseur, …}
    ['materialLots', { materialId:7, supplierId:0, lotFournisseur:'INV-20260716', qte:2.5, prix:18.9, dlc:'2026-12-01' }],
    // ttConfirmStop : la session d'atelier complète
    ['workSessions', { date:'2026-07-16', debut:'2026-07-16T06:00:00.000Z', fin:'2026-07-16T08:30:00.000Z',
                       dureeMin:150, dureeHeures:2.5, pauseMin:10, activite:'Coques', tauxHoraire:12, coutTotal:30 }],
    // marketAddRetour : {marketId, productionId, type:'retour', qte, parfum, date, destination}
    ['marketMoves', { marketId:2, productionId:11, type:'retour', qte:6, parfum:'Vanille', date:'2026-07-13' }],
    ['marketMoves', { marketId:2, productionId:null, type:'sortie', qte:40, date:'2026-07-13' }],
    // journalCompta (v1359) : correction d'encaissement
    ['journalCompta', { orderId:5, type:'correction', ts:Date.now(), montantAvant:50, montantApres:45, moyen:null, motif:'erreur de saisie' }],
    // documents : un devis tel que construit ligne à ligne
    ['documents', { type:'devis', statut:'en_attente', numero:'202607-3', clientId:3, date:'2026-07-16',
                    montant:120, lignes:[], orderIds:undefined, createdAt:Date.now(), acompte:0 }],
    // kv (v1372)
    ['kv', { cle:'sm_settings', valeur:'{"laborRate":12}', ts:Date.now() }],
    // batch (v29)
    ['batches', { nom:'Fournée sam.', statut:'ouvert', orderIds:[1,2], createdAt:Date.now() }]
  ];
  let fautes = [];
  corpus.forEach(([table, objet], i) => {
    const v = M._valideObjet(table, objet, 'creation');
    if(!v.ok || v.alertes.length) fautes.push(`${table}#${i} → ${v.erreurs.concat(v.alertes).join(' / ')}`);
  });
  ok(fautes.length === 0,
     `B1 · les ${corpus.length} fixtures à la forme réelle passent sans erreur NI alerte — un validateur qui crie au loup sur du sain détruit la confiance (v1370)` +
     (fautes.length ? ' — fautes : ' + fautes.join(' ; ') : ''));
}

// ---------------------------------------------------------------------------
// C. LES FAUTES PROMISES — refusées, avec un motif lisible
// ---------------------------------------------------------------------------
{
  const c1 = M._valideObjet('charges', { date:'2026-07-01', montant:'32,50' }, 'creation');
  ok(!c1.ok && /montant/.test(c1.erreurs[0]) && /nombreFini/.test(c1.erreurs[0]),
     'C1 · LE bug promis impossible : un montant en CHAÎNE (« 32,50 ») est refusé, motif nommant le champ et le type');
  const c2 = M._valideObjet('charges', { date:'16/07/2026', montant:10 }, 'creation');
  ok(!c2.ok && /date/.test(c2.erreurs[0]),
     'C2 · une date au format français est refusée (le format de l\'app est AAAA-MM-JJ, partout)');
  const c3 = M._valideObjet('charges', { montant:10 }, 'creation');
  ok(!c3.ok && /requis/.test(c3.erreurs[0]) && /date/.test(c3.erreurs[0]),
     'C3 · un champ requis absent à la CRÉATION est refusé (saveCharge : « Date obligatoire »)');
  const c4 = M._valideObjet('orders', { date:'2026-07-16', statut:'En cours', montant:NaN }, 'creation');
  ok(!c4.ok && /NaN/.test(c4.erreurs[0]),
     'C4 · NaN est refusé ET NOMMÉ — pas « le nombre NaN est un nombre » (Number.isFinite, pas typeof)');
  const c5 = M._valideObjet('orders', { date:'2026-07-16', statut:'En cours', lignes:'une seule' }, 'creation');
  ok(!c5.ok && /lignes/.test(c5.erreurs[0]) && /tableau/.test(c5.erreurs[0]),
     'C5 · une chaîne là où l\'app attend un tableau (lignes) est refusée');
  const c6 = M._valideObjet('orders', { date:'2026-07-16', statut:'' }, 'creation');
  ok(!c6.ok, 'C6 · une chaîne VIDE ne satisfait pas un champ requis — le vide n\'est pas un statut');
}

// ---------------------------------------------------------------------------
// D. LES MODIFICATIONS — on juge l'ENTRÉE, jamais le stock existant
// ---------------------------------------------------------------------------
{
  const d1 = M._valideObjet('orders', { montant:99.5 }, 'modification');
  ok(d1.ok, 'D1 · modifier UN champ ne réclame pas les champs requis de la création (la fiche existe déjà)');
  const d2 = M._valideObjet('orders', { montant:'99,5' }, 'modification');
  ok(!d2.ok, 'D2 · … mais le champ TOUCHÉ est typé : montant en chaîne refusé aussi en modification');
  const d3 = M._valideObjet('markets', { 'ca.especes': 120 }, 'modification');
  ok(d3.ok && !d3.erreurs.length,
     'D3 · un chemin pointé (ca.especes) non déclaré au schéma passe — limite DITE : on ne devine pas la forme interne d\'un objet libre');
  const d4 = M._valideObjet('orders', { champLibreHistorique:'peu importe' }, 'modification');
  ok(d4.ok, 'D4 · un champ hors schéma reste libre — on n\'invente pas de règle (v1370)');
}

// ---------------------------------------------------------------------------
// E. LE NIVEAU ALERTE — suspect ≠ prouvé faux : ça passe, c'est journalisé
// ---------------------------------------------------------------------------
{
  const e1 = M._valideObjet('marketMoves', { marketId:2, type:'embarque', qte:5 }, 'creation');
  ok(e1.ok && e1.alertes.length === 1 && /embarque/.test(e1.alertes[0]),
     'E1 · « embarque » — LE type fantôme de v1336 — est signalé à l\'écriture désormais… sans bloquer (pas prouvé faux)');
  const e2 = M._valideObjet('charges', { date:'2026-07-01', montant:-15 }, 'creation');
  ok(e2.ok && e2.alertes.length === 1 && /-15/.test(e2.alertes[0]),
     'E2 · un montant négatif de charge passe mais alerte (le formulaire impose > 0 ; ailleurs, on signale)');
  const e3 = M._valideObjet('documents', { type:'devis' }, 'creation');
  ok(e3.ok && e3.alertes.length === 0,
     'E3 · une valeur d\'énumération CONNUE ne déclenche rien — pas de bruit sur du sain');
}

// ---------------------------------------------------------------------------
// F. _valideApplique — le refus est RÉEL, journalisé, débrayable sans devenir muet
// ---------------------------------------------------------------------------
{
  function scenario(strict){
    const journal = []; const toasts = [];
    const env = neutre();
    env.db = { auditLog:{ add:(e)=>{ journal.push(e); return { catch:()=>{} }; } } };
    env.toast = (m)=>toasts.push(m);
    env.valideStricteActive = () => strict;
    const compteurs = env._valideCompteurs;
    const Mx = buildModule(env);
    return { Mx, journal, toasts, compteurs };
  }
  // Strict ON : exception typée + journal « rejet » + toast
  {
    const { Mx, journal, toasts, compteurs } = scenario(true);
    let err = null;
    try{ Mx._valideApplique('charges', { ok:false, erreurs:['« montant » devrait être nombreFini (reçu : la chaîne « x »)'], alertes:[] }, 'création'); }
    catch(e){ err = e; }
    ok(err && err.name === 'ValidationRefusee' && err.table === 'charges',
       'F1 · en mode strict, le refus est une EXCEPTION typée : l\'écriture Dexie avorte réellement');
    ok(journal.length === 1 && journal[0].op === 'rejet' && toasts.length === 1 && /refusée/.test(toasts[0]),
       'F2 · le refus est journalisé (« rejet ») ET dit à l\'écran — jamais muet');
    ok(compteurs.rejets === 1, 'F3 · le compteur de session avance (affiché à l\'écran Sauvegardes)');
  }
  // Strict OFF : pas d'exception, mais « rejet-ignoré » au journal
  {
    const { Mx, journal } = scenario(false);
    let err = null;
    try{ Mx._valideApplique('charges', { ok:false, erreurs:['x'], alertes:[] }, 'création'); }catch(e){ err = e; }
    ok(err === null && journal.length === 1 && journal[0].op === 'rejet-ignore',
       'F4 · validation débranchée : l\'écriture passe, mais le refus évité est journalisé — une protection coupée en silence serait la fausse sécurité de v1329');
  }
  // Alertes seules : jamais d'exception, journal « suspect »
  {
    const { Mx, journal } = scenario(true);
    let err = null;
    try{ Mx._valideApplique('marketMoves', { ok:true, erreurs:[], alertes:['« type » vaut « embarque »…'] }, 'création'); }catch(e){ err = e; }
    ok(err === null && journal.length === 1 && journal[0].op === 'suspect',
       'F5 · une alerte ne bloque jamais : elle nourrit le journal (op « suspect »), même discipline que le détecteur v1368-70');
  }
}

// ---------------------------------------------------------------------------
// G. LE CÂBLAGE — suspendu pendant les restaurations, installé avant l'audit
// ---------------------------------------------------------------------------
{
  const clean = stripComments(APP);
  const iBoot = clean.lastIndexOf('(async()=>{');
  const boot = clean.slice(iBoot, iBoot + 4000);
  ok(boot.indexOf('valideInstalle()') > -1 && boot.indexOf('valideInstalle()') < boot.indexOf('auditInstalle()'),
     'G1 · la validation s\'installe AVANT l\'audit : une écriture refusée n\'est jamais proposée au journal des écritures commises');
  const nGardes = (clean.match(/if\(_importEnCours\) return;/g) || []).length;
  ok(nGardes >= 5,
     `G2 · les 5 hooks (3 audit + 2 validation) sont suspendus pendant restauration/fusion (${nGardes} gardes) : on valide l'ENTRÉE, pas l'existant restauré`);
  ok(/async function applyDump\(dump\)\{[\s\S]{0,400}_importEnCours = true;/.test(clean) &&
     /\}finally\{ _importEnCours = false; \}/.test(clean),
     'G3 · applyDump lève le drapeau et le rabaisse dans un finally — même en cas d\'échec, les hooks se réveillent');
  ok(/op:'restauration'/.test(clean) && /op:'fusion'/.test(clean),
     'G4 · restauration et fusion laissent chacune UNE entrée récapitulative au journal — l\'événement est dit, sans mille fausses créations');
  ok(/'sm_valideStricte',/.test(clean),
     'G5 · l\'interrupteur est CLASSÉ (clé d\'appareil) — la garde A2 de v1372 l\'exigerait de toute façon');
  ok(/valideStricteBascule/.test(clean) && /Désactiver la validation stricte/.test(APP),
     'G6 · le levier est à l\'écran Sauvegardes : Ben peut débrayer sans développeur si une règle se trompe');
  ok(/Dexie\.ignoreTransaction/.test(clean),
     'G7 · les écritures de journal depuis les hooks passent par Dexie.ignoreTransaction — l\'issue documentée hors de la zone morte');
}

// ---------------------------------------------------------------------------
console.log(`\nRésultat : ${nOk} réussis, ${nKo} échoués (${nOk + nKo} assertions).`);
if(nKo === 0) console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
else console.log('✗ RÉGRESSION DÉTECTÉE.\n');
process.exit(nKo ? 1 : 0);
