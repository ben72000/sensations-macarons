/* ============================================================
   TESTS — v1372 : le stockage unifié + le journal d'audit
   ------------------------------------------------------------
   LE BUG D'ORIGINE (vague 62, angle mort déclaré) : les modèles de
   pyramides vivaient dans localStorage, hors sauvegarde — une
   restauration les PERDAIT. L'inventaire complet a révélé pire : le
   compteur légal de factures (sm_factSeq) vivait hors sauvegarde
   alors que son commentaire affirmait le contraire, et le journal des
   vraies requêtes du copilote disparaissait avec l'appareil.

   LA RÈGLE GELÉE : une donnée métier qui ne survit pas à une
   restauration n'est pas stockée — elle est en sursis. Et son
   corollaire : UN STOCKAGE NON CLASSÉ EST UN STOCKAGE NON PENSÉ —
   toute clé sm_* du code doit appartenir à une famille déclarée
   (métier → recopiée en base ; appareil → locale, et c'est un choix).

   Chaque garde est prouvée par RÉINTRODUCTION du bug qu'elle traque.
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}

console.log('\n=== TESTS — v1372 : stockage unifié + journal d\'audit ===\n');

// ---------------------------------------------------------------------------
// Extraction des constantes multi-lignes (objet / Set) — on réutilise le
// stripper DURCI de _extract (vague 59 : ne JAMAIS en écrire un second).
// ---------------------------------------------------------------------------
function extractObjectConst(name, closer){
  const idx = APP.indexOf('const ' + name + ' = ');
  if(idx === -1) throw new Error('Introuvable : ' + name);
  const clean = stripComments(APP.slice(idx, idx + 8000));
  const end = clean.indexOf(closer);
  if(end === -1) throw new Error('Fin introuvable : ' + name);
  return clean.slice(0, end + closer.length);
}
const codeKvMetier   = extractObjectConst('KV_METIER', '\n};');
const codeKvAppareil = extractObjectConst('KV_APPAREIL', '\n]);');
const codeKvPrefixes = extractObjectConst('KV_PREFIXES_APPAREIL', '];');
const KV_METIER   = eval('(() => { ' + codeKvMetier + ' return KV_METIER; })()');
const KV_APPAREIL = eval('(() => { ' + codeKvAppareil + ' return KV_APPAREIL; })()');
const KV_PREFIXES_APPAREIL = eval('(() => { ' + codeKvPrefixes + ' return KV_PREFIXES_APPAREIL; })()');

// ---------------------------------------------------------------------------
// A. LA CLASSIFICATION EST EXHAUSTIVE — et prouvée telle
// ---------------------------------------------------------------------------
// On scanne le code SANS ses commentaires (échec n°1 de la vague 59 : compter
// les commentaires, où les clés vivent aussi dans la prose qui les explique).
function clesNonClassees(source){
  const clean = stripComments(source);
  const vues = new Set();
  const re = /'(sm_[A-Za-z0-9_]+)'/g;
  let m;
  while((m = re.exec(clean))) vues.add(m[1]);
  const orphelines = [];
  vues.forEach(cle => {
    if(Object.prototype.hasOwnProperty.call(KV_METIER, cle)) return;
    if(KV_APPAREIL.has(cle)) return;
    if(KV_PREFIXES_APPAREIL.some(p => cle === p || cle.startsWith(p))) return;
    orphelines.push(cle);
  });
  return { vues, orphelines };
}
{
  const scan = clesNonClassees(APP);
  ok(scan.vues.size >= 40,
     `A1 · le scan voit bien l'inventaire réel (${scan.vues.size} clés sm_* distinctes ≥ 40)`);
  ok(scan.orphelines.length === 0,
     'A2 · CHAQUE clé sm_* du code appartient à une famille déclarée (métier ou appareil)' +
     (scan.orphelines.length ? ' — orphelines : ' + scan.orphelines.join(', ') : ''));

  // RÉINTRODUCTION : une clé fantôme non classée doit faire crier la garde.
  const avecFantome = clesNonClassees(APP + "\nlocalStorage.setItem('sm_cleFantome','1');");
  ok(avecFantome.orphelines.includes('sm_cleFantome'),
     'A3 · PREUVE — une clé non classée injectée est détectée (la garde attrape le motif, pas le cas)');

  // Une clé dans les DEUX familles aurait deux vérités (v1331) : interdit.
  const doubles = Object.keys(KV_METIER).filter(k => KV_APPAREIL.has(k));
  ok(doubles.length === 0,
     'A4 · aucune clé n\'est à la fois métier ET appareil' + (doubles.length ? ' — doubles : ' + doubles.join(', ') : ''));

  // Une clé classée mais absente du code est une garde morte (vague 59) qui
  // survivrait à la suppression de la fonctionnalité qu'elle couvrait.
  const mortes = [...Object.keys(KV_METIER), ...KV_APPAREIL]
    .filter(k => !scan.vues.has(k));
  ok(mortes.length === 0,
     'A5 · aucune clé classée n\'est morte (toutes existent encore dans le code)' +
     (mortes.length ? ' — mortes : ' + mortes.join(', ') : ''));
}

// ---------------------------------------------------------------------------
// B. L'ANGLE MORT DE LA VAGUE 62 EST FERMÉ — et les compteurs légaux avec
// ---------------------------------------------------------------------------
{
  ok(Object.prototype.hasOwnProperty.call(KV_METIER, 'sm_pyraModels'),
     'B1 · les modèles de pyramides sont MÉTIER : ils survivent désormais à une restauration (bug d\'origine)');
  ok(Object.prototype.hasOwnProperty.call(KV_METIER, 'sm_factSeq') &&
     Object.prototype.hasOwnProperty.call(KV_METIER, 'sm_avoirSeq'),
     'B2 · les compteurs légaux (factures, avoirs) sont MÉTIER : le commentaire « inclus dans les sauvegardes » est enfin VRAI');
  ok(Object.prototype.hasOwnProperty.call(KV_METIER, 'sm_aiJournal'),
     'B3 · le journal des vraies requêtes du copilote est MÉTIER : la mesure qui tranchera la question du LLM ne meurt plus avec l\'appareil');
  const clean = stripComments(APP);
  ok(/const TABLES *= *\[[^\]]*'kv'[^\]]*\]/.test(clean.replace(/\n/g,' ')) || /'kv'\]/.test(clean) || /'kv',\s*'auditLog'/.test(clean),
     'B4 · la table kv fait partie de TABLES : elle part dans chaque sauvegarde comme les autres');
  ok(/'auditLog'/.test(clean.slice(clean.indexOf('const TABLES ='), clean.indexOf('const TABLES =') + 900)),
     'B5 · la table auditLog aussi : un journal d\'audit qui meurt avec l\'appareil n\'est pas un journal d\'audit');
}

// ---------------------------------------------------------------------------
// C. LA RÉCONCILIATION localStorage ↔ kv — la matrice complète
// ---------------------------------------------------------------------------
// Règle d'ordre d'écriture : localStorage D'ABORD, kv ensuite. Donc kv peut
// retarder, jamais l'inverse — et en cas de divergence, localStorage a raison.
{
  const _kvReconcilie = eval('(' + extractFunction('_kvReconcilie').replace(/^function _kvReconcilie/, 'function') + ')');
  ok(_kvReconcilie(null, null).action === 'rien',            'C1 · (∅, ∅) → rien');
  ok(_kvReconcilie('a', null).action === 'semer',            'C2 · (LS, ∅) → semer la base (première recopie)');
  ok(_kvReconcilie(null, 'a').action === 'restaurer',        'C3 · (∅, kv) → RESTAURER localStorage — le cas que ce chantier répare');
  ok(_kvReconcilie('a', 'a').action === 'rien',              'C4 · (égaux) → rien');
  const div = _kvReconcilie('nouveau', 'ancien');
  ok(div.action === 'pousser',
     'C5 · (différents) → localStorage GAGNE (il ne peut être que plus récent, par ordre d\'écriture)');
  ok(div.divergence === true,
     'C6 · … et la divergence est SIGNALÉE, pas résolue en silence — une divergence tue est une information détruite');
  // RÉINTRODUCTION : si quelqu'un inversait la règle (kv gagne), C5 deviendrait
  // rouge — c'est précisément le pile-ou-face de v1331 (deux vérités) qu'on interdit.
  ok(_kvReconcilie('', 'ancien').action === 'pousser',
     'C7 · une chaîne VIDE est une valeur, pas une absence (v1326 : poser 0/"" n\'est pas s\'abstenir)');
}

// ---------------------------------------------------------------------------
// D. LE PATCH localStorage — le point de passage unique, injectable et prouvé
// ---------------------------------------------------------------------------
{
  const src = extractFunction('_kvInstallePatch');
  const fabrique = new Function('KV_METIER', 'swallow', 'return ' + src.replace(/^function _kvInstallePatch/, 'function'));
  const _kvInstallePatch = fabrique(KV_METIER, () => {});
  const fauxStore = (() => {
    const m = {};
    return { m,
      setItem(k, v){ m[k] = String(v); },
      removeItem(k){ delete m[k]; } };
  })();
  const pousses = [];
  _kvInstallePatch(fauxStore, (cle, val) => pousses.push([cle, val]));

  fauxStore.setItem('sm_settings', '{"x":1}');
  ok(fauxStore.m.sm_settings === '{"x":1}' && pousses.length === 1 && pousses[0][0] === 'sm_settings',
     'D1 · une écriture MÉTIER va dans le support ET dans la file kv');
  fauxStore.setItem('sm_debug', '1');
  ok(fauxStore.m.sm_debug === '1' && pousses.length === 1,
     'D2 · une écriture APPAREIL va dans le support SEULEMENT (pas de bruit en base)');
  fauxStore.removeItem('sm_settings');
  ok(!('sm_settings' in fauxStore.m) && pousses.length === 2 && pousses[1][1] === null,
     'D3 · une SUPPRESSION métier est poussée comme telle (null) — sinon la réconciliation ressusciterait la clé effacée');

  // RÉINTRODUCTION : si la file explose, le support local doit avoir écrit QUAND MÊME
  // (localStorage d'abord, toujours) — sinon une panne de kv casserait l'app entière.
  const fauxStore2 = { m:{}, setItem(k,v){ this.m[k]=String(v); }, removeItem(k){ delete this.m[k]; } };
  _kvInstallePatch(fauxStore2, () => { throw new Error('kv en panne'); });
  let survecu = true;
  try{ fauxStore2.setItem('sm_settings', 'v'); }catch(e){ survecu = false; }
  ok(survecu && fauxStore2.m.sm_settings === 'v',
     'D4 · PREUVE — une panne de la copie durable ne casse JAMAIS l\'écriture locale (l\'app continue)');
}

// ---------------------------------------------------------------------------
// E. LE DIFF D'AUDIT — champ par champ, sémantique v1326/v1337 (absent = null, pas 0)
// ---------------------------------------------------------------------------
{
  const _auditDiff = eval('(' + extractFunction('_auditDiff').replace(/^function _auditDiff/, 'function') + ')');
  const d1 = _auditDiff({ statut:'ouvert', total:100 }, { statut:'clos' });
  ok(d1.statut && d1.statut.avant === 'ouvert' && d1.statut.apres === 'clos' && !('total' in d1),
     'E1 · seul le champ modifié figure au diff, avec avant ET après');
  const d2 = _auditDiff({ a:{ b:7 } }, { 'a.b': 9 });
  ok(d2['a.b'] && d2['a.b'].avant === 7 && d2['a.b'].apres === 9,
     'E2 · la notation pointée de Dexie est suivie dans l\'objet d\'origine');
  const d3 = _auditDiff({}, { nouveau:'x' });
  ok(d3.nouveau && d3.nouveau.avant === null,
     'E3 · un champ qui n\'existait pas AVANT vaut null — « absent », jamais 0 ni \'\' (v1337 : zéro n\'est pas une mesure)');
  const d4 = _auditDiff(null, { x:1 });
  ok(d4.x && d4.x.avant === null,
     'E4 · un objet d\'origine absent ne fait pas exploser le diff');
}

// ---------------------------------------------------------------------------
// F. LE RÉSUMÉ BORNÉ — tronquer en le DISANT, jamais en silence (v1333)
// ---------------------------------------------------------------------------
{
  const src = extractFunction('_auditResume');
  const _auditResume = new Function('AUDIT_MAX_RESUME', 'return ' + src.replace(/^function _auditResume/, 'function'))(1200);
  const petit = _auditResume({ a:1 });
  ok(petit === '{"a":1}', 'F1 · une petite entrée passe entière');
  const gros = {}; for(let i = 0; i < 300; i++) gros['champ' + i] = 'x'.repeat(20);
  const r = JSON.parse(_auditResume(gros));
  ok(r._tronque === true && r.taille > 1200 && Array.isArray(r.champs) && r.champs.length > 0,
     'F2 · une entrée trop grosse est tronquée EN LE DISANT : taille réelle + liste des champs touchés');
  ok(_auditResume(gros).length <= 1300,
     'F3 · le résumé tronqué respecte lui-même la borne (sinon la borne ment)');
  const circ = {}; circ.moi = circ;
  ok(_auditResume(circ) === '{"_illisible":true}',
     'F4 · un objet insérialisable devient « illisible » — dit, pas avalé');
  const explicite = _auditResume({ a:1 }, 3);
  ok(JSON.parse(explicite)._tronque === true, 'F5 · la borne passée explicitement est honorée');
}

// ---------------------------------------------------------------------------
// G. LE TAMPON D'AUDIT — on n'écrit qu'au COMMIT (une écriture annulée n'a pas eu lieu)
// ---------------------------------------------------------------------------
{
  const srcPousse = extractFunction('_auditPousse');
  const appels = { add:[], bulk:[], signaux:[] };
  // _horsTransaction (v1373) échappe à la zone Dexie ; ici on l'injecte SYNCHRONE pour
  // observer les écritures immédiatement — le mécanisme de zone n'existe pas sous node.
  // _figSignale (v1374) est enregistré : le commit doit AUSSI prévenir la carte des chiffres.
  const fabrique = new Function('db', 'view', 'APP_VERSION', 'swallow', '_horsTransaction', '_figSignale', 'return ' + srcPousse.replace(/^function _auditPousse/, 'function'));
  const _auditPousse = fabrique(
    { auditLog: { add:(e) => { appels.add.push(e); return { catch:()=>{} }; }, bulkAdd:(l) => { appels.bulk.push(l); return { catch:()=>{} }; } } },
    'ecran-test', 'vTEST', () => {}, (fn) => fn(), (sources) => appels.signaux.push(sources));

  // Transaction factice : capture le callback 'complete', ne le déclenche que sur ordre.
  function fausseTrans(){
    const cbs = {};
    return { on(evt, cb){ cbs[evt] = cb; }, commit(){ if(cbs.complete) cbs.complete(); }, cbs };
  }
  const t1 = fausseTrans();
  _auditPousse(t1, { tbl:'orders', op:'creation', cle:1, resume:'{}' });
  _auditPousse(t1, { tbl:'orders', op:'modification', cle:1, resume:'{}' });
  ok(appels.bulk.length === 0, 'G1 · rien n\'est écrit tant que la transaction n\'est pas COMMISE');
  t1.commit();
  ok(appels.bulk.length === 1 && appels.bulk[0].length === 2,
     'G2 · au commit, le lot part en UNE écriture (2 entrées empilées)');
  ok(appels.bulk[0][0].ecran === 'ecran-test' && appels.bulk[0][0].v === 'vTEST' && appels.bulk[0][0].ts > 0,
     'G3 · chaque entrée porte l\'écran, la version et l\'horodatage');
  ok(appels.signaux.length === 1 && appels.signaux[0].length === 1 && appels.signaux[0][0] === 'orders',
     'G3b · au commit, la carte des chiffres est prévenue — sources dédupliquées (2 entrées orders → 1 source)');

  // RÉINTRODUCTION : une transaction ANNULÉE (complete jamais déclenché) ne doit RIEN écrire.
  const t2 = fausseTrans();
  _auditPousse(t2, { tbl:'orders', op:'suppression', cle:9, resume:'{}' });
  ok(appels.bulk.length === 1,
     'G4 · PREUVE — une transaction annulée n\'écrit rien : un journal qui note des faits sans commit n\'est pas un journal');
  _auditPousse(null, { tbl:'kv', op:'reconciliation', cle:'x', resume:'{}' });
  ok(appels.add.length === 1, 'G5 · sans transaction, l\'entrée part directement (cas boot)');
}

// ---------------------------------------------------------------------------
// H. LE PÉRIMÈTRE DE LA SOMME DE CONTRÔLE VOYAGE AVEC LE FICHIER
// ---------------------------------------------------------------------------
// LE BUG QU'ON A ÉVITÉ : ajouter kv/auditLog à TABLES aurait fait recalculer la
// somme des VIEILLES sauvegardes sur un périmètre qu'elles ne connaissent pas →
// TOUTES auraient été déclarées « modifiées ou tronquées ». Une alarme injustifiée
// finit ignorée — y compris le jour où elle a raison (vague 59).
{
  const cleanApp = stripComments(APP);
  const iTables = cleanApp.indexOf('const TABLES =');
  const zoneT = cleanApp.slice(iTables, iTables + 1600);
  const TABLES = eval(zoneT.slice(zoneT.indexOf('['), zoneT.indexOf(']') + 1));
  const iHer = cleanApp.indexOf('const TABLES_CHECKSUM_HERITAGE =');
  const zoneH = cleanApp.slice(iHer, iHer + 1200);
  const HERITAGE = eval(zoneH.slice(zoneH.indexOf('['), zoneH.indexOf(']') + 1));

  ok(TABLES.includes('kv') && TABLES.includes('auditLog'),
     'H1 · TABLES couvre kv et auditLog (elles partent en sauvegarde)');
  ok(!HERITAGE.includes('kv') && !HERITAGE.includes('auditLog'),
     'H2 · la liste HÉRITÉE est figée AVANT v1372 — elle ne bougera plus jamais');
  ok(HERITAGE.every(t => TABLES.includes(t)),
     'H3 · l\'héritage est un sous-ensemble strict du présent (rien n\'a été retiré : livraison cumulative)');

  const src = extractFunction('backupChecksum');
  const backupChecksum = new Function('TABLES_CHECKSUM_HERITAGE',
    'return ' + src.replace(/^function backupChecksum/, 'function'))(HERITAGE);

  // Une VIEILLE sauvegarde : créée avant v1372, somme calculée sur l'héritage.
  const vieuxDump = { orders:[{ id:1, total:50 }], clients:[{ id:1, nom:'X' }] };
  const sommeAncienne = (() => {   // la somme telle que l'ANCIEN code l'aurait écrite
    let str = ''; for(const t of HERITAGE){ str += t + ':' + JSON.stringify(vieuxDump[t] || []) + ';'; }
    let h = 5381; for(let i = 0; i < str.length; i++){ h = ((h << 5) + h + str.charCodeAt(i)) | 0; }
    return (h >>> 0).toString(16);
  })();
  vieuxDump._checksum = sommeAncienne;
  ok(backupChecksum(vieuxDump) === sommeAncienne,
     'H4 · une sauvegarde d\'AVANT v1372 vérifie toujours (périmètre hérité, pas TABLES courant)');

  // RÉINTRODUCTION DU BUG : recalculer la somme du vieux dump sur le périmètre COURANT
  // (kv inclus) donne un autre résultat — c'est exactement l'invalidation rétroactive interdite.
  const sommeNaive = (() => {
    let str = ''; for(const t of TABLES){ str += t + ':' + JSON.stringify(vieuxDump[t] || []) + ';'; }
    let h = 5381; for(let i = 0; i < str.length; i++){ h = ((h << 5) + h + str.charCodeAt(i)) | 0; }
    return (h >>> 0).toString(16);
  })();
  ok(sommeNaive !== sommeAncienne,
     'H5 · PREUVE — le calcul naïf (périmètre courant) aurait bien invalidé toutes les sauvegardes passées');

  // Une NOUVELLE sauvegarde : le périmètre voyage dans le fichier, kv PÈSE dans la somme.
  const neufA = { _checksumTables:TABLES, orders:[{ id:1 }], kv:[{ cle:'sm_settings', valeur:'{}', ts:1 }] };
  const neufB = { _checksumTables:TABLES, orders:[{ id:1 }], kv:[{ cle:'sm_settings', valeur:'{"modifié":1}', ts:1 }] };
  ok(backupChecksum(neufA) !== backupChecksum(neufB),
     'H6 · dans une sauvegarde v1372+, altérer kv change la somme : le stockage unifié est PROTÉGÉ, pas juste embarqué');
  ok(/buildDump[\s\S]{0,900}_checksumTables\s*=\s*TABLES/.test(cleanApp),
     'H7 · buildDump écrit le périmètre dans chaque nouveau fichier');
}

// ---------------------------------------------------------------------------
// I. LE CÂBLAGE — écrit dans le code, pas promis dans un commentaire
// ---------------------------------------------------------------------------
{
  const clean = stripComments(APP);
  const iBoot = clean.lastIndexOf('(async()=>{');
  const boot = clean.slice(iBoot, iBoot + 4000);
  const iKv = boot.indexOf('await kvBoot()');
  const iMig = boot.indexOf('migratePackaging202511()');
  ok(iKv > -1 && iMig > -1 && iKv < iMig,
     'I1 · kvBoot s\'exécute AVANT les migrations — elles lisent localStorage, il doit être re-garni d\'abord');
  ok(boot.indexOf('auditInstalle()') > -1 && boot.indexOf('auditInstalle()') < iMig,
     'I2 · les hooks d\'audit s\'installent avant toute écriture de la session (les seeds sont journalisés aussi)');
  ok(/if\(\(t==='kv' \|\| t==='auditLog'\) && !Array\.isArray\(dump\[t\]\)\) continue;/.test(clean),
     'I3 · restaurer une sauvegarde d\'AVANT v1372 n\'efface NI le stockage unifié NI le journal (règle prodSessions généralisée)');
  ok(/applyLocalSettings\(dump\);[\s\S]{0,700}kvRestaureLSDepuisBase\(\)/.test(clean),
     'I4 · après une restauration, kv → localStorage : les clés métier reflètent la sauvegarde, comme les tables');
  ok(/AUDIT_TABLES_EXCLUES = new Set\(\['auditLog','backups'\]\)/.test(clean),
     'I5 · auditLog ne s\'audite pas lui-même (récursion) et backups reste hors journal (payloads-mammouths) — exclusions ÉCRITES');
  ok(/hook\('creating'/.test(clean) && /hook\('updating'/.test(clean) && /hook\('deleting'/.test(clean),
     'I6 · les trois opérations (création, modification, suppression) passent par les hooks — le point de passage est unique');
  ok(/db\.version\(32\)\.stores\(\{\s*kv: 'cle',\s*auditLog: '\+\+id, ts, tbl'/.test(clean),
     'I7 · le schéma v32 déclare kv et auditLog — la table réelle et la table déclarée sont la même (v1351)');
}

// ---------------------------------------------------------------------------
console.log(`\nRésultat : ${nOk} réussis, ${nKo} échoués (${nOk + nKo} assertions).`);
if(nKo === 0) console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
else console.log('✗ RÉGRESSION DÉTECTÉE.\n');
process.exit(nKo ? 1 : 0);
