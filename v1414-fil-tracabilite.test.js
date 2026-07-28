/* ============================================================
   TESTS — v1414 : FIL DE TRAÇABILITÉ D'UNE BOÎTE
   ------------------------------------------------------------
   LA DEMANDE DE BEN, mot pour mot : scanner une étiquette et voir « le détail
   de la traçabilité, le détail des changements d'emplacement par date et heure
   et ce qui a été décrémenté au fil de l'eau, avec en tête le dernier mouvement
   en date ». Son exemple :

     26/06/26 à 10:05 — Lot 250626-FRA-AS-B, 9 pièces restantes suite à un
       prélèvement de 11 pièces destinées à la commande #179 Pierre CHARPENTIER
     25/06/26 à 19:34 — Lot 250626-FRA-AS-B, 20 pièces rangé, créé à partir de
       l'assemblage du lot 240626-FRA-CO-T et du lot 250626-FRA-GAN-F

   Les trois sources existaient déjà mais SÉPARÉMENT : assembleFrom (origine),
   histEmplacement (parcours), stockMoves (décréments). Rien ne les fusionnait.

   CE QUE CES TESTS GÈLENT :
     1. les 3 sources fusionnent en UN fil daté ;
     2. l'ordre est ANTICHRONOLOGIQUE (le dernier mouvement en tête) ;
     3. `resteApres` reconstitue la quantité restante à chaque étape, en
        remontant les décréments (aucun instantané n'est stocké en base) ;
     4. un prélèvement porte un LIEN cliquable vers sa commande, avec le nom
        du client ;
     5. la fonction est PURE (aucun accès base).
   ============================================================ */
'use strict';
const { extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1414 : fil de traçabilité ===\n');

const G = global;
G.round3 = n => Math.round((+n||0)*1000)/1000;
G.qty = n => String(n);
new Function('G', `with(G){ const round3=G.round3, qty=G.qty; ${extractFunction('construireFilTracabilite')}\n G.construireFilTracabilite = construireFilTracabilite; }`)(G);
const fil = G.construireFilTracabilite;

// Le scénario EXACT de Ben.
const prod = {
  id: 501,
  lotProduction: '250626-FRA-AS-B',
  qteRestante: 9,
  prodTermineTs: '2026-06-25T19:34:00.000Z',
  histEmplacement: [
    { lieu:'B', ts:'2026-06-25T19:34:00.000Z', motif:'rangement' },
  ],
  assembleFrom: [
    { id: 401, lot:'240626-FRA-CO-T',  composant:'coques',  qte:40 },
    { id: 402, lot:'250626-FRA-GAN-F', composant:'ganache', qte:20 },
  ],
};
const moves = [
  { ts:'2026-06-26T10:05:00.000Z', productionId:501, sens:-1, qte:11, type:'commande', orderId:179 },
];
const orders  = [{ id:179, clientId:77 }];
const clients = [{ id:77, nom:'Pierre CHARPENTIER' }];

const f = fil(prod, moves, orders, clients);

// ── 1. Fusion des trois sources ────────────────────────────────────────────
{
  ok(f.length === 2, '1 · création + prélèvement fusionnés en 2 étapes (le 1er rangement, simultané de la création, n\'est pas doublé)');
  ok(f.some(e=>e.type==='creation'),   '2 · l\'étape de CRÉATION est présente');
  ok(f.some(e=>e.type==='prelevement'),'3 · l\'étape de PRÉLÈVEMENT est présente');
}

// ── 2. Ordre antichronologique — le dernier mouvement EN TÊTE ─────────────
{
  ok(f[0].type === 'prelevement',
     '4 · le prélèvement du 26/06 est EN TÊTE (demande explicite de Ben)');
  ok(f[f.length-1].type === 'creation',
     '5 · la création du 25/06 ferme le fil (la plus ancienne)');
  ok(String(f[0].ts) > String(f[1].ts), '6 · tri strictement décroissant par date');
}

// ── 3. Reconstitution du reste à chaque étape ─────────────────────────────
{
  ok(f[0].resteApres === 9,
     '7 · après le prélèvement de 11 : 9 pièces restantes (= qteRestante actuelle)');
  ok(f[1].resteApres === 20,
     '8 · avant ce prélèvement : 20 pièces — reconstituées (9 + 11), rien n\'est stocké en base');
}

// ── 4. Contenu et liens cliquables ────────────────────────────────────────
{
  ok(/prélèvement de 11 pièce\(s\)/.test(f[0].texte),
     '9 · le texte annonce la quantité prélevée');
  ok(/commande #179 Pierre CHARPENTIER/.test(f[0].texte),
     '10 · il nomme la commande ET le client, comme dans l\'exemple de Ben');
  ok(f[0].liens.length === 1 && f[0].liens[0].kind === 'order' && f[0].liens[0].id === 179,
     '11 · un lien cliquable pointe vers la commande #179');
  ok(/240626-FRA-CO-T/.test(f[1].texte) && /250626-FRA-GAN-F/.test(f[1].texte),
     '12 · la création cite les DEUX lots d\'origine (coques et ganache)');
  ok(f[1].liens.length === 2 && f[1].liens.every(l=>l.kind==='prod'),
     '13 · chaque lot d\'origine est cliquable (remontée vers l\'amont)');
}

// ── 5. Cas particuliers ───────────────────────────────────────────────────
{
  // Déplacement postérieur à la création → étape distincte.
  const prod2 = { ...prod, histEmplacement:[
    { lieu:'B', ts:'2026-06-25T19:34:00.000Z', motif:'rangement' },
    { lieu:'F', ts:'2026-06-27T08:00:00.000Z', motif:'transfert' },
  ]};
  const f2 = fil(prod2, moves, orders, clients);
  ok(f2.length === 3 && f2[0].type === 'emplacement',
     '14 · un déplacement postérieur devient une étape à part, en tête si plus récent');
  ok(f2[0].lieu === 'F' && f2[0].motif === 'transfert',
     '15 · l\'étape de déplacement porte le lieu et le motif');
  ok(f2[0].resteApres === 9,
     '16 · un déplacement ne change PAS la quantité restante');

  // Sortie sans commande (perte, ajustement) → pas de lien, mais tracée.
  const f3 = fil(prod, [{ ts:'2026-06-28T09:00:00.000Z', productionId:501, sens:-1, qte:2, type:'perte', note:'casse' }], orders, clients);
  ok(f3[0].type==='prelevement' && f3[0].liens.length===0,
     '17 · une sortie sans commande est tracée, sans lien mort');
  ok(/casse/.test(f3[0].texte), '18 · le motif de la sortie est repris dans le texte');

  // Les ENTRÉES (sens +1) ne sont pas des sorties : jamais comptées comme prélèvement.
  const f4 = fil(prod, [{ ts:'2026-06-26T10:05:00.000Z', productionId:501, sens:1, qte:5, type:'assemblage' }], orders, clients);
  ok(!f4.some(e=>e.type==='prelevement'),
     '19 · un mouvement d\'ENTRÉE n\'est jamais présenté comme un prélèvement');

  // Robustesse.
  ok(fil(null, [], [], []).length === 0, '20 · production absente → fil vide (robuste)');
  ok(fil({id:1, qteRestante:5, date:'2026-06-01'}, null, null, null).length >= 0,
     '21 · sources nulles → aucun plantage');
}

// ── 6. Pureté ─────────────────────────────────────────────────────────────
{
  const src = extractFunction('construireFilTracabilite');
  ok(!/\bdb\./.test(src),
     '22 · la fonction est PURE : aucun accès à la base (testable, réutilisable partout)');
}

// ── 7. FUSION DE BOÎTES (v1415) ───────────────────────────────────────────
// Ben : « en cas de fusion de boîtes je veux que la traçabilité indique clairement la fusion
// puis mette en évidence la traçabilité de chaque contenant ».
// CONTRAINTE RÉELLE : la boîte absorbée est SUPPRIMÉE de `productions` (db.productions.delete)
// → aucun lien vers sa fiche n'est possible sans fabriquer un lien mort. Ce qui SURVIT :
// `fusionHisto` (lot + quantité absorbée) et ses MOUVEMENTS DE STOCK (productionId conservé).
{
  const prodF = {
    id: 601, lotProduction:'250626-FRA-AS-B1', qteRestante: 25,
    prodTermineTs:'2026-06-25T09:00:00.000Z',
    histEmplacement:[{lieu:'B', ts:'2026-06-25T09:00:00.000Z', motif:'rangement'}],
    assembleFrom:[{id:401, lot:'240626-FRA-CO-T', composant:'coques', qte:60}],
    // La boîte B2 (12 pièces restantes) a été absorbée le 27/06. ts = Date.now() → NOMBRE.
    fusionHisto:[{ deId:602, deLot:'250626-FRA-AS-B2', qte:12,
                   dlcAbsorbee:'2026-07-01', ts: Date.parse('2026-06-27T14:20:00.000Z') }],
  };
  const movesF = [
    // Prélèvement sur la boîte ABSORBÉE, AVANT la fusion (elle avait 15, il en restait 12).
    { ts:'2026-06-26T11:00:00.000Z', productionId:602, sens:-1, qte:3, type:'commande', orderId:150 },
    // Prélèvement sur la boîte COURANTE, APRÈS la fusion.
    { ts:'2026-06-28T16:30:00.000Z', productionId:601, sens:-1, qte:5, type:'commande', orderId:179 },
  ];
  const ordersF  = [{id:150, clientId:70}, {id:179, clientId:77}];
  const clientsF = [{id:70, nom:'Marie DUPONT'}, {id:77, nom:'Pierre CHARPENTIER'}];
  const ff = fil(prodF, movesF, ordersF, clientsF);

  ok(ff.some(e=>e.type==='fusion'), '23 · la FUSION apparaît comme une étape à part entière');
  const etapeF = ff.find(e=>e.type==='fusion');
  ok(/250626-FRA-AS-B2/.test(etapeF.texte) && /12 pièce/.test(etapeF.texte),
     '24 · elle nomme la boîte absorbée ET sa quantité');
  ok(etapeF.qteAbsorbee === 12 && etapeF.lotAbsorbe === '250626-FRA-AS-B2',
     '25 · le lot et la quantité absorbés sont exposés séparément (pour l\'affichage)');

  // Ordre : le plus récent en tête → prélèvement 28/06, puis fusion 27/06, puis prélèv. 26/06…
  ok(ff[0].ts === '2026-06-28T16:30:00.000Z',
     '26 · le prélèvement du 28/06 (le plus récent) reste en tête malgré la fusion');
  const iFusion = ff.findIndex(e=>e.type==='fusion');
  const iAvant  = ff.findIndex(e=>e.lotSource==='250626-FRA-AS-B2');
  ok(iFusion < iAvant,
     '27 · la fusion (27/06) se place AVANT le mouvement du 26/06 de la boîte absorbée — le ts numérique de fusionHisto est bien converti');

  // Traçabilité DE CHAQUE CONTENANT : le mouvement d'avant-fusion est attribué à SON lot.
  const mvtAbsorbe = ff[iAvant];
  ok(/sur la boîte 250626-FRA-AS-B2/.test(mvtAbsorbe.texte),
     '28 · un prélèvement d\'avant-fusion est explicitement rattaché à la boîte absorbée');
  ok(mvtAbsorbe.lotSource === '250626-FRA-AS-B2',
     '29 · son lot d\'origine est exposé (l\'affichage l\'indente et l\'étiquette à ce lot)');
  ok(mvtAbsorbe.liens.length===1 && mvtAbsorbe.liens[0].id===150,
     '30 · il garde son lien cliquable vers SA commande (#150 Marie DUPONT)');
  ok(/Marie DUPONT/.test(mvtAbsorbe.texte), '31 · avec le nom du client de cette commande-là');

  // Compteurs : un mouvement d'avant-fusion n'a JAMAIS touché la boîte courante.
  ok(mvtAbsorbe.resteApres === null,
     '32 · CRITIQUE : pas de compteur sur un mouvement d\'avant-fusion (l\'afficher laisserait croire à un mouvement sur cette boîte)');
  ok(ff[0].resteApres === 25,
     '33 · après le dernier prélèvement : 25 pièces (= qteRestante actuelle)');
  ok(etapeF.resteApres === 30,
     '34 · juste après la fusion : 30 pièces (18 avant + 12 absorbées), reconstitué correctement');
  const etapeCrea = ff.find(e=>e.type==='creation');
  ok(etapeCrea.resteApres === 18,
     '35 · à la création : 18 pièces — la quantité absorbée n\'est PAS comptée avant la fusion');
}

console.log(`\n=== v1414 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
