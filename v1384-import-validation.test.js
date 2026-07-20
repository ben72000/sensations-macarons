/* ============================================================
   TESTS — v1384 · CHANTIER B : VALIDER LE CONTENU À L'IMPORT
   ------------------------------------------------------------
   CE QUE CETTE SUITE INTERDIT DE RÉINTRODUIRE.

   La v1373 a posé des schémas de validation sur chaque table, branchés
   en hooks Dexie. Mais applyDump() et mergeDump() posent
   `_importEnCours = true`, et les deux hooks commencent par
       if(_importEnCours) return;
   Le seul contrôle de CONTENU de l'app était donc ÉTEINT sur la seule
   porte par laquelle entrent des données que Ben n'a pas tapées.

   Ces tests ne vérifient pas que du code existe. Ils fabriquent de VRAIS
   dumps malformés — ceux qu'un export de tableur, un vieux téléphone ou
   une sauvegarde tronquée produisent réellement — et exigent que
   l'anomalie soit vue, réparée quand c'est non ambigu, et SIGNALÉE
   quand ça ne l'est pas.

   LA RÈGLE FIGÉE PAR CE CHANTIER :
   une réparation muette est une falsification ; un refus d'office est
   une sauvegarde perdue. On répare le non ambigu, on signale le reste,
   et c'est Ben qui tranche — informé.
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}

function extraitEntre(debut, fin){
  const i = APP.indexOf(debut);
  if(i === -1) throw new Error('Marqueur de début introuvable : ' + debut);
  const j = APP.indexOf(fin, i);
  if(j === -1) throw new Error('Marqueur de fin introuvable : ' + fin);
  return stripComments(APP.slice(i, j + fin.length));
}

// Monte le moteur de contrôle d'import AVEC ses vraies dépendances : les schémas
// v1373 EXTRAITS DU FICHIER LIVRÉ, pas une copie de test.
//
// [GARDE DE HARNAIS] Le chantier A a produit un test vert qui ne prouvait rien
// (« file bornée : 0 ≤ 200 », vrai seulement parce que la file était vide, le
// harnais oubliant une dépendance). On ne refait pas l'erreur : le harnais est
// lui-même vérifié plus bas (test 0) — on exige qu'il détecte une faute connue
// AVANT de faire confiance à ses verdicts.
function monteMoteur(){
  const types   = extraitEntre('const VALIDE_TYPES = {', '\n};');
  const schemas = extraitEntre('const VALIDE_SCHEMAS = {', '\n};');
  const champ   = extractFunction('_valideChamp');
  const decrit  = extractFunction('_valideDecrit');
  const repare  = extractFunction('_impRepareValeur');
  const valide  = extractFunction('valideDumpAvantImport');
  const rapport = extractFunction('_impRapportTexte');
  const src = [types, schemas, champ, decrit, repare, valide, rapport].join('\n');
  return new Function(
    src + '\n; return { _impRepareValeur, valideDumpAvantImport, _impRapportTexte,' +
    ' VALIDE_SCHEMAS, _valideChamp };'
  )();
}

const M = monteMoteur();

(async () => {
console.log('\n=== TESTS — v1384 · Chantier B : valider le contenu à l\'import ===\n');

// ---------------------------------------------------------------------------
// 0. LE HARNAIS PROUVE QU'IL VOIT QUELQUE CHOSE
//    Avant tout verdict : si le moteur monté ne détectait RIEN, tous les tests
//    « 0 anomalie » ci-dessous passeraient au vert en ne prouvant rien.
// ---------------------------------------------------------------------------
console.log('0. Le harnais lui-même');
{
  const schemasCharges = Object.keys(M.VALIDE_SCHEMAS).length;
  ok(schemasCharges >= 10, `schémas v1373 réellement chargés (${schemasCharges} tables, pas 0)`);
  // une faute grossière DOIT être vue — sinon le moteur est un décor
  const temoin = M.valideDumpAvantImport({ clients:[{ nom:'' }] });
  ok(temoin.nbAnomalies > 0, 'un dump volontairement fautif produit bien une anomalie (le moteur n\'est pas inerte)');
}

// ---------------------------------------------------------------------------
// 1. LA FAILLE ELLE-MÊME : un montant en chaîne entrait sans contrôle
// ---------------------------------------------------------------------------
console.log('\n1. Le cas de la faille : « 32,50 » au lieu de 32.5');
{
  const dump = { orders:[{ date:'2026-03-05', statut:'livree', montant:'32,50' }] };
  const rap = M.valideDumpAvantImport(dump);
  ok(rap.nbReparations === 1, 'la virgule décimale française est réparée');
  ok(dump.orders[0].montant === 32.5, 'le dump est réparé EN PLACE (32.5, un vrai nombre)');
  ok(typeof dump.orders[0].montant === 'number', 'et c\'est bien un number, pas une chaîne');
  ok(rap.reparations[0].avant === '32,50' && rap.reparations[0].apres === 32.5,
     'la réparation est TRACÉE (avant → après), pas muette');
  ok(rap.nbAnomalies === 0, 'aucune anomalie résiduelle sur ce cas');
}

// ---------------------------------------------------------------------------
// 2. LES AUTRES CONVERSIONS NON AMBIGUËS
// ---------------------------------------------------------------------------
console.log('\n2. Les conversions non ambiguës');
{
  ok(M._impRepareValeur('nombreFini', '32.50').valeur === 32.5, 'nombre resté en chaîne (point) → number');
  ok(M._impRepareValeur('nombreFini', '-7,25').valeur === -7.25, 'négatif à virgule → number');
  ok(M._impRepareValeur('entier', '42').valeur === 42, 'entier en chaîne → number');
  ok(M._impRepareValeur('entier', '42,5').repare === false, 'un décimal ne devient PAS un entier');
  ok(M._impRepareValeur('booleen', 'true').valeur === true, '"true" → true');
  ok(M._impRepareValeur('booleen', 'false').valeur === false, '"false" → false');
  ok(M._impRepareValeur('dateJ', '05/03/2026').valeur === '2026-03-05', 'JJ/MM/AAAA → AAAA-MM-JJ');
  ok(M._impRepareValeur('dateJ', '2026-03-05T10:00:00Z').valeur === '2026-03-05', 'horodatage ISO → jour');
  ok(M._impRepareValeur('horoMs', '1750000000000').valeur === 1750000000000, 'horodatage en chaîne → number');
}

// ---------------------------------------------------------------------------
// 3. CE QU'ON REFUSE DE RÉPARER — l'ambigu reste ambigu
//    Une réparation qui DEVINE est une falsification. Ces cas doivent être
//    signalés, JAMAIS corrigés en silence.
// ---------------------------------------------------------------------------
console.log('\n3. L\'ambigu n\'est jamais deviné');
{
  ok(M._impRepareValeur('nombreFini', '1 234,56').repare === false,
     'séparateur de milliers : AMBIGU selon la locale → non réparé');
  ok(M._impRepareValeur('nombreFini', '1.234.56').repare === false,
     'deux séparateurs : non réparé');
  ok(M._impRepareValeur('nombreFini', 'trente-deux').repare === false, 'du texte n\'est pas un nombre');
  // [CAS PROUVÉS PAR MUTATION] Les trois suivants sont les SEULS qui font vraiment
  // travailler le filtre par motif. Sans lui, Number() les convertit tout seul, en
  // silence, en un chiffre d'argent FAUX : "0x1A" deviendrait 26 €. Mes premiers cas
  // ambigus ("1 234,56", "1.234.56") ne prouvaient rien — Number() les rejette déjà
  // en NaN, donc ils passaient au vert même avec le filtre RETIRÉ. Cf. note de chantier.
  ok(M._impRepareValeur('nombreFini', '0x1A').repare === false,
     'un hexadécimal ne devient PAS 26 € (Number() le convertirait en silence)');
  ok(M._impRepareValeur('nombreFini', '1e3').repare === false,
     'une notation exponentielle ne devient PAS 1000 € sans preuve d\'intention');
  ok(M._impRepareValeur('nombreFini', 'Infinity').repare === false,
     '"Infinity" n\'est pas un montant');
  ok(M._impRepareValeur('nombreFini', '').repare === false, 'chaîne vide : non réparée');
  ok(M._impRepareValeur('nombreFini', 'NaN').repare === false, '"NaN" n\'est pas réparé en 0');
  ok(M._impRepareValeur('dateJ', '05/13/2026').repare === false,
     'mois hors bornes : on ne bascule PAS en MM/JJ par supposition');
  ok(M._impRepareValeur('dateJ', 'hier').repare === false, 'une date en toutes lettres n\'est pas devinée');
  ok(M._impRepareValeur('booleen', 'oui').repare === false, '"oui" n\'est pas converti (hors vocabulaire prouvé)');
  // et le cas critique : ne JAMAIS inventer un champ requis absent
  const dump = { clients:[{ tel:'0600000000' }] };   // pas de nom
  const rap = M.valideDumpAvantImport(dump);
  ok(rap.nbAnomalies === 1, 'un champ requis absent est signalé');
  ok(!('nom' in dump.clients[0]) || dump.clients[0].nom === undefined,
     'un champ requis absent n\'est JAMAIS inventé');
  ok(/requis absent/.test(rap.anomalies[0].motif), 'le motif est lisible en français');
}

// ---------------------------------------------------------------------------
// 4. L'IMPORT RESTE POSSIBLE — le refus d'office est interdit
//    Un contrôle qui transforme « restaurer avec 3 anomalies » en « ne rien
//    restaurer » est pire que pas de contrôle le jour où le téléphone est cassé.
// ---------------------------------------------------------------------------
console.log('\n4. Une sauvegarde imparfaite reste restaurable');
{
  const dump = {
    orders:[{ date:'2026-03-05', statut:'livree', montant:'32,50' },
            { date:'pas-une-date', statut:'livree', montant:12 }],
    clients:[{ nom:'Dupont' }]
  };
  const rap = M.valideDumpAvantImport(dump);
  ok(rap.nbReparations === 1 && rap.nbAnomalies === 1, 'réparations et anomalies coexistent');
  ok(dump.orders.length === 2, 'AUCUNE fiche n\'est supprimée du dump');
  ok(dump.orders[1].date === 'pas-une-date', 'la fiche non réparable est laissée TELLE QUELLE, pas vidée');
  ok(dump.clients[0].nom === 'Dupont', 'les fiches saines ne sont pas touchées');
  const txt = M._impRapportTexte(rap);
  ok(/réparée/.test(txt) && /anomalie/.test(txt), 'le rapport annonce les deux, en français');
  ok(!/tout va bien/i.test(txt), 'le rapport ne dit jamais « tout va bien » quand il y a des anomalies');
}

// ---------------------------------------------------------------------------
// 5. UN DUMP SAIN NE DÉCLENCHE RIEN
//    La leçon v1370 : un contrôle qui refuse des données SAINES détruit la
//    confiance aussi sûrement qu'un vrai mensonge.
// ---------------------------------------------------------------------------
console.log('\n5. Aucun faux positif sur des données saines');
{
  const dump = {
    orders:[{ date:'2026-03-05', statut:'livree', montant:32.5, clientId:3, lignes:[], paiements:[] }],
    clients:[{ nom:'Dupont', tel:'0600000000' }],
    charges:[{ date:'2026-02-01', montant:19.9, libelle:'Sucre' }],
    materials:[{ nom:'Poudre d\'amande', unite:'g', prix:0.02 }]
  };
  const avant = JSON.stringify(dump);
  const rap = M.valideDumpAvantImport(dump);
  ok(rap.nbReparations === 0 && rap.nbAnomalies === 0, 'un dump sain : 0 réparation, 0 anomalie');
  ok(JSON.stringify(dump) === avant, 'un dump sain n\'est pas modifié d\'un octet');
  ok(/aucune anomalie/i.test(M._impRapportTexte(rap)), 'le rapport le dit clairement');
  // 0 est une valeur LÉGITIME (v1326 : ne jamais confondre « absent » et « faux »)
  const zero = { orders:[{ date:'2026-03-05', statut:'devis', montant:0 }] };
  const rz = M.valideDumpAvantImport(zero);
  ok(rz.nbAnomalies === 0, 'un montant à 0 n\'est PAS traité comme absent (leçon v1326)');
  ok(zero.orders[0].montant === 0, 'et il reste 0');
}

// ---------------------------------------------------------------------------
// 6. ROBUSTESSE — le contrôle ne doit jamais faire échouer l'import lui-même
// ---------------------------------------------------------------------------
console.log('\n6. Le contrôle ne casse jamais');
{
  let jete = false;
  try{
    M.valideDumpAvantImport(null);
    M.valideDumpAvantImport(undefined);
    M.valideDumpAvantImport({});
    M.valideDumpAvantImport({ orders:'pas un tableau' });
    M.valideDumpAvantImport({ orders:[null, undefined, 42, 'x'] });
    M.valideDumpAvantImport({ tableInconnue:[{ n:1 }] });
  }catch(e){ jete = true; }
  ok(!jete, 'aucun dump dégénéré ne fait jeter le contrôle');
  const rapVide = M.valideDumpAvantImport({});
  ok(rapVide.nbReparations === 0 && rapVide.nbAnomalies === 0, 'dump vide : rapport vide');
  ok(M.valideDumpAvantImport({ tableInconnue:[{ n:'x' }] }).nbAnomalies === 0,
     'une table SANS schéma n\'invente aucune règle (v1370)');
  // volume : 2000 fiches à réparer, sans explosion
  const gros = { orders: Array.from({length:2000}, () => ({ date:'2026-03-05', statut:'l', montant:'10,50' })) };
  const rg = M.valideDumpAvantImport(gros);
  ok(rg.nbReparations === 2000, 'passe à l\'échelle : 2000 réparations comptées');
  ok(gros.orders.every(o => o.montant === 10.5), 'les 2000 fiches sont réellement réparées');
  ok(M._impRapportTexte(rg).split('\n').length < 15,
     'le rapport reste LISIBLE (tronqué) même sur 2000 réparations');
}

// ---------------------------------------------------------------------------
// 7. LE CÂBLAGE RÉEL — le contrôle est branché sur LES DEUX portes
//    Une protection non appelée est une protection absente (règle v1383).
// ---------------------------------------------------------------------------
console.log('\n7. Le contrôle est réellement branché');
{
  const impData  = extractFunction('importData');
  const impMerge = extractFunction('importDataMerge');
  ok(/valideDumpAvantImport\(obj\)/.test(impData), 'importData (remplacement) appelle le contrôle');
  ok(/valideDumpAvantImport\(obj\)/.test(impMerge), 'importDataMerge (fusion) appelle le contrôle');
  ok(impData.indexOf('valideDumpAvantImport') < impData.indexOf('applyDump'),
     'le contrôle a lieu AVANT applyDump (donc avant toute écriture)');
  ok(impMerge.indexOf('valideDumpAvantImport') < impMerge.indexOf('mergeDump'),
     'le contrôle a lieu AVANT mergeDump');
  ok(/_impRapportTexte/.test(impData) && /_impRapportTexte/.test(impMerge),
     'le rapport est montré à Ben dans les deux cas, avant qu\'il confirme');
  ok(/_impJournaliseRapport/.test(impData) && /_impJournaliseRapport/.test(impMerge),
     'le rapport est journalisé : il survit à la boîte de dialogue (règle v1383)');
}

// ---------------------------------------------------------------------------
// 8. INTÉGRITÉ DE L'EXISTANT — B ne casse rien de A ni de v1373
// ---------------------------------------------------------------------------
console.log('\n8. L\'existant est intact');
{
  ok(/if\(_importEnCours\) return;/.test(APP),
     'les hooks v1373 gardent leur suspension (une exception y avorterait toute la restauration)');
  ok(/version\(33\)/.test(APP), 'le schéma v33 (journal des incidents, chantier A) est intact');
  ok(/errLog/.test(APP), 'la table errLog du chantier A est toujours là');
  ok(/op:'import-controle'/.test(APP), 'le journal d\'audit reçoit une opération dédiée');
  ok(Object.keys(M.VALIDE_SCHEMAS).includes('orders'), 'les schémas v1373 sont réutilisés, pas dupliqués');
  ok(!/const VALIDE_SCHEMAS_IMPORT/.test(APP),
     'AUCUN second jeu de schémas : une seule vérité (sinon les deux divergent)');
}

console.log(`\n--- Résultat : ${nOk} assertion(s) vraie(s), ${nKo} échec(s) ---\n`);
process.exit(nKo ? 1 : 0);
})();
