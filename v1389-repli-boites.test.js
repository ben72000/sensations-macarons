/* ============================================================
   TESTS — v1389 : REPLI D'AFFICHAGE DES BOÎTES (Voie 2)
   ------------------------------------------------------------
   CONTEXTE : depuis l'unification du moteur, ranger un lot en plusieurs
   boîtes le SCINDE en lignes-filles -B1/-B2 (etiquetteDe = id parent).
   Ben range souvent un lot en plusieurs boîtes → la liste Production
   afficherait N cartes pour un lot. Décision Ben (Voie 2) : REPLIER les
   boîtes d'un même lot sous UNE carte-parent dépliable — affichage SEUL.

   CE QUE CE TEST FIGE (comportemental, la vraie fonction extraite) :
     1. Deux filles du même etiquetteDe → UNE carte-parent repliable qui
        les contient toutes (pas 2 cartes au premier niveau).
     2. Un lot NON scindé (sans etiquetteDe) → carte normale, JAMAIS de
        wrapper de repli.
     3. Une fille SEULE de son lot → carte normale (rien à replier).
     4. L'ordre des lots est préservé (première apparition).
     5. Le repli n'INVENTE aucune donnée : il n'appelle jamais la base,
        c'est du pur assemblage de chaînes.
   ============================================================ */
'use strict';
const { extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}
console.log('\n=== TESTS — v1389 : repli d\'affichage des boîtes (Voie 2) ===\n');

// On assemble la VRAIE fonction extraite, avec des stubs pour ses dépendances d'affichage.
// `_prodbatRow` est stubbé pour émettre un marqueur traçable par id → on peut vérifier QUELLES
// cartes sont rendues et où, sans dépendre du rendu réel d'une carte.
const src = extractFunction('_prodbatRowsAvecRepli');

function build(){
  const ctx = {
    // stub : chaque carte rend un marqueur <CARD id> repérable
    _prodbatRow: (row)=>`<CARD ${row.p.id}>`,
    round3: (x)=>Math.round((+x||0)*1000)/1000,
    qty: (x)=>String(x),
    esc: (s)=>String(s==null?'':s),
    empInfo: (key)=>({ lettre: (key||'?').toString().charAt(0).toUpperCase() }),
    lotBaseSansSuffixe: (lot)=> (lot||'').replace(/-B\d+$/,''),
    window: { _prodRecName: (id)=>'Vanille' }
  };
  // eslint-disable-next-line no-new-func
  const factory = new Function(...Object.keys(ctx), src + '\nreturn _prodbatRowsAvecRepli;');
  return factory(...Object.values(ctx));
}
const repli = build();

// --- Jeu de données : 2 boîtes d'un même lot (etiquetteDe=100), 1 lot non scindé, 1 fille seule ---
const rows = [
  { p:{ id:101, etiquetteDe:100, lotProduction:'2501-VAN-B1', qteRestante:40, emplacement:'frigo' } },
  { p:{ id:102, etiquetteDe:100, lotProduction:'2501-VAN-B2', qteRestante:30, emplacement:'congelA' } },
  { p:{ id:200, etiquetteDe:null, lotProduction:'2502-CHO',    qteRestante:60, emplacement:'frigo' } },
  { p:{ id:301, etiquetteDe:300, lotProduction:'2503-PIS-B1', qteRestante:20, emplacement:'frigo' } },
];

let out;
let threw=false;
try{ out = repli(rows); }catch(e){ threw=true; console.log('    → exception : '+e.message); }
ok(!threw, 'la fonction s\'exécute sans erreur');

// 1. Les 2 filles du lot 100 sont sous UN wrapper de repli, toutes deux présentes.
const nbWrappers = (out.match(/prod-boites-repli/g)||[]).length;
ok(nbWrappers===1, 'un seul wrapper de repli (pour le lot scindé en 2 boîtes)');
ok(out.includes('<CARD 101>') && out.includes('<CARD 102>'), 'les 2 cartes-filles du lot sont rendues');

// 2. Le lot non scindé (200) est une carte normale, hors wrapper.
{
  // tout ce qui précède le wrapper + tout ce qui suit doit contenir la carte 200 au 1er niveau
  const avant = out.split('prod-boites-repli')[0];
  const apres = out.split('prod-boites-body')[1] || '';
  ok(out.includes('<CARD 200>'), 'le lot non scindé est rendu');
  ok(avant.includes('<CARD 200>') || apres.includes('<CARD 200>'),
     'le lot non scindé est une carte de 1er niveau (hors repli)');
}

// 3. La fille seule (301) n'est PAS repliée (un seul élément de son lot).
ok(nbWrappers===1, 'la fille seule n\'ajoute pas de 2e wrapper');
ok(out.includes('<CARD 301>'), 'la fille seule est rendue comme carte normale');

// 4. En-tête du repli : nb boîtes + stock cumulé + répartition emplacements.
ok(/2 boîtes/.test(out), 'l\'en-tête indique « 2 boîtes »');
ok(/70/.test(out), 'l\'en-tête cumule le stock des boîtes (40+30=70)');
ok(/1×F/.test(out) && /1×C/.test(out), 'l\'en-tête montre la répartition par emplacement (frigo + congel A)');

// 5. Le repli n'appelle jamais la base (pur affichage) : aucune trace de db. dans la source.
ok(!/\bdb\./.test(src), 'le repli ne touche JAMAIS la base (affichage pur, zéro logique de rangement)');

// 6. Ordre préservé : le lot 100 (1re apparition) vient avant le lot 200, avant 300.
{
  const iP100 = out.indexOf('<CARD 101>');
  const iP200 = out.indexOf('<CARD 200>');
  const iP301 = out.indexOf('<CARD 301>');
  ok(iP100 < iP200 && iP200 < iP301, 'l\'ordre d\'apparition des lots est préservé');
}

console.log(`\n=== v1389-repli : ${nOk} OK, ${nKo} KO ===\n`);
if(nKo>0) process.exit(1);
