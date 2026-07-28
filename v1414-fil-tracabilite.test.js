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

console.log(`\n=== v1414 : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
