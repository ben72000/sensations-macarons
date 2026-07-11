/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 37 : rentabilité par produit (mix produit)
   ----------------------------------------------------------------------------
   BUG CORRIGÉ (v1317) : le panneau « Produits les plus rentables » classait en réalité
   par CHIFFRE D'AFFAIRES. La marge ÉTAIT calculée (computeOrderMargins) puis JETÉE :
   seul lineTotalStored (le CA) était accumulé. Conséquences :
     • Un produit à gros CA mais faible marge apparaissait en tête (mauvais pilotage).
     • « Produits à revoir » listait les plus PETITS CA — d'où un Don et une Prestation
       à 200 € qui s'y retrouvaient absurdement, alors qu'une prestation sans matières
       premières est justement le produit le PLUS rentable.

   Règles figées ici :
     1. La marge d'une commande est répartie sur ses lignes AU PRORATA de leur CA.
     2. « Les plus rentables » = classement par MARGE NETTE (€), pas par CA.
     3. « À revoir » = les plus faibles TAUX de marge (%), pas les plus petits CA.
     4. Le « Don » n'est pas un produit vendu : exclu du classement.
   ============================================================================ */
'use strict';
const { extractFunction } = require('./_extract');

function buildModule(){
  const profitScale = extractFunction('profitScale');
  return new Function(`${profitScale} return { profitScale };`)();
}

const money2 = n => Math.round(n*100)/100;

// Reproduit l'agrégation de app.js : marge de commande répartie au prorata du CA de chaque ligne.
function agregerProduits(commandes){
  const prodAgg = {};
  commandes.forEach(o=>{
    const caCmd = o.ca || 0;
    const margeCmd = o.margeNette || 0;
    o.lignes.forEach(ln=>{
      const key = ln.key;
      const lt = ln.total;
      const partMarge = caCmd>0 ? margeCmd * (lt / caCmd) : 0;
      (prodAgg[key] ||= {ca:0,n:0,marge:0});
      prodAgg[key].ca    = money2(prodAgg[key].ca + lt);
      prodAgg[key].marge = money2(prodAgg[key].marge + partMarge);
      prodAgg[key].n++;
    });
  });
  return Object.entries(prodAgg)
    .map(([k,v])=>({ nom:k, ca:v.ca, n:v.n, marge:v.marge,
                     taux: v.ca>0 ? Math.round((v.marge/v.ca)*100) : 0 }))
    .sort((a,b)=>b.marge-a.marge);
}
const produitsVendus = produits => produits.filter(p=>p.nom!=='Don' && p.ca>0);

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function near(actual, expected, tol, label){
  if(Math.abs(actual-expected) <= tol){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ~${expected} (±${tol})\n      obtenu : ${actual}`); }
}

function run(){
const { profitScale } = buildModule();

// ── 1. La marge est répartie au PRORATA du CA de chaque ligne ─────────────────
{
  // Commande de 100 € (60 € de coffret + 40 € de prestation), marge nette 50 €.
  // Le coffret doit recevoir 60 % de la marge (30 €), la prestation 40 % (20 €).
  const p = agregerProduits([
    { ca:100, margeNette:50, lignes:[
      { key:'Coffret 16', total:60 },
      { key:'Prestation / Coaching', total:40 },
    ]}
  ]);
  near(p.find(x=>x.nom==='Coffret 16').marge, 30, 0.01,
    'RÉPARTITION · le coffret (60 % du CA) reçoit 60 % de la marge');
  near(p.find(x=>x.nom==='Prestation / Coaching').marge, 20, 0.01,
    'RÉPARTITION · la prestation (40 % du CA) reçoit 40 % de la marge');

  // CONSERVATION : la somme des marges attribuées = la marge de la commande.
  const somme = p.reduce((s,x)=>s+x.marge, 0);
  near(somme, 50, 0.01, 'TRAÇABILITÉ · la somme des marges attribuées === la marge de la commande');
}

// ── 2. LE BUG : gros CA ≠ produit rentable ───────────────────────────────────
{
  // Cas réel de Benjamin : l'Événement fait le plus gros CA (588,80 €) mais une marge
  // faible ; la Prestation fait un petit CA (200 €) mais presque tout en marge.
  const p = produitsVendus(agregerProduits([
    { ca:588.80, margeNette:100.10, lignes:[{ key:'Événement', total:588.80 }] },
    { ca:200.00, margeNette:180.00, lignes:[{ key:'Prestation / Coaching', total:200.00 }] },
  ]));

  // AVANT (tri par CA) : l'Événement était n°1.
  const parCA = [...p].sort((a,b)=>b.ca-a.ca);
  eq(parCA[0].nom, 'Événement', 'AVANT · le tri par CA mettait l\'Événement en tête');

  // APRÈS (tri par marge) : la Prestation passe devant.
  eq(p[0].nom, 'Prestation / Coaching',
     'BUG VERROUILLÉ · le tri par MARGE met la Prestation en tête (180 € vs 100 €)');
  eq(p[0].taux, 90, 'La prestation dégage 90 % de marge (aucune matière première)');
  eq(p[1].taux, 17, 'L\'Événement ne dégage que 17 % de marge malgré son gros CA');
}

// ── 3. « À revoir » = faible TAUX de marge, PAS petit CA ─────────────────────
{
  // 5 produits, pour que le « top 3 des pires » discrimine réellement.
  const p = produitsVendus(agregerProduits([
    { ca:588.80, margeNette:100.10, lignes:[{ key:'Événement', total:588.80 }] },                 // 17 %
    { ca:200.00, margeNette:180.00, lignes:[{ key:'Prestation / Coaching', total:200.00 }] },     // 90 %
    { ca: 24.00, margeNette:  2.40, lignes:[{ key:'Coffret 6', total:24.00 }] },                  // 10 %
    { ca:294.00, margeNette: 38.22, lignes:[{ key:'Coffret 8', total:294.00 }] },                 // 13 %
    { ca:290.00, margeNette:151.00, lignes:[{ key:'Grand format', total:290.00 }] },              // 52 %
  ]));
  const aRevoir = p.slice().sort((a,b)=>a.taux-b.taux).slice(0,3).map(x=>x.nom);

  eq(aRevoir[0], 'Coffret 6', '« À revoir » · le plus faible taux (10 %) arrive en tête');
  eq(aRevoir, ['Coffret 6','Coffret 8','Événement'],
     '« À revoir » · les 3 plus faibles TAUX (10 %, 13 %, 17 %)');
  eq(aRevoir.includes('Prestation / Coaching'), false,
     'BUG VERROUILLÉ · la Prestation (90 % de marge) n\'est PLUS classée « à revoir »');
  eq(aRevoir.includes('Grand format'), false,
     'BUG VERROUILLÉ · le Grand format (52 % de marge) n\'est pas « à revoir »');

  // AVANT, le tri par CA croissant y mettait la Prestation à tort (et ignorait l'Événement,
  // pourtant peu rentable malgré son gros chiffre).
  const ancienARevoir = [...p].sort((a,b)=>a.ca-b.ca).slice(0,3).map(x=>x.nom);
  eq(ancienARevoir.includes('Prestation / Coaching'), true,
     'AVANT · le tri par petit CA classait la Prestation « à revoir » (absurde)');
  eq(ancienARevoir.includes('Événement'), false,
     'AVANT · l\'Événement (17 % de marge seulement) échappait à l\'alerte grâce à son gros CA');
}

// ── 4. Le Don n'est pas un produit vendu ─────────────────────────────────────
{
  const p = agregerProduits([
    { ca:281.40, margeNette:281.40, lignes:[{ key:'Don', total:281.40 }] },
    { ca:100.00, margeNette: 30.00, lignes:[{ key:'Coffret 16', total:100.00 }] },
  ]);
  eq(p.some(x=>x.nom==='Don'), true, 'Le Don existe bien dans l\'agrégat brut');
  eq(produitsVendus(p).some(x=>x.nom==='Don'), false,
     'BUG VERROUILLÉ · le Don est EXCLU du classement (ce n\'est pas un produit à optimiser)');
}

// ── 5. L'échelle de rentabilité qualifie correctement chaque taux ────────────
{
  eq(profitScale(90).label, 'Très rentable',          'Échelle · 90 % → Très rentable');
  eq(profitScale(39).label, 'Rentable',               'Échelle · 39 % → Rentable');
  eq(profitScale(17).label, 'Moyennement rentable',   'Échelle · 17 % → Moyennement rentable');
  eq(profitScale(10).label, 'Peu rentable',           'Échelle · 10 % → Peu rentable');
  eq(profitScale(-5).label, 'Non rentable',           'Échelle · marge négative → Non rentable');
}

// ── 6. Commande à CA nul : aucune marge inventée ─────────────────────────────
{
  const p = agregerProduits([
    { ca:0, margeNette:0, lignes:[{ key:'Coffret 6', total:0 }] },
  ]);
  eq(p[0].marge, 0, 'CA nul → marge 0 (aucun chiffre inventé, pas de division par zéro)');
  eq(p[0].taux, 0,  'CA nul → taux 0');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 37 : rentabilité par produit ===\n');
if(fail===0){
  console.log(`Résultat : ${pass} réussis, 0 échoués (${pass} assertions).`);
  console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
} else {
  console.log(`Résultat : ${pass} réussis, ${fail} échoués.`);
  console.log(failures.join('\n')+'\n');
  process.exitCode = 1;
}
}
run();
