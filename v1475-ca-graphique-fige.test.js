'use strict';
// v1475 — « LE CA N'ÉVOLUE PAS SUR LE TABLEAU DE BORD ». Ben : « Quand je vais dans l'onglet année
// le CA de l'année en cours n'évolue pas malgré les commandes soldées qui alimentent l'appli au
// fur et à mesure du temps ».
//
// LE MOTEUR ÉTAIT SAIN — vérifié avant de chercher ailleurs : `_caLignesToutes` + `_caAgregeLignes`
// donnent bien 425 € pour trois paiements de 100/250/75 sur 2026. Le défaut était dans le CACHE.
//
// 🚨 CAUSE : `_caLignesCache` n'était vidé QUE par un rendu complet de l'accueil (`renderDash`).
// Deux conséquences :
//  ① changer d'onglet (Jour/Semaine/Mois/Année) appelle `caChartRender()`, qui RELISAIT le cache
//    → les chiffres restaient figés à TOUTES les granularités. Or changer d'onglet est justement
//    le geste de quelqu'un qui veut regarder ses chiffres.
//  ② l'accueil peut rester monté pendant qu'on saisit un encaissement ailleurs → au retour, le
//    graphique affichait les chiffres d'AVANT la saisie, alors que la base était à jour.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. NON-RÉGRESSION : le moteur de calcul reste juste ----
async function testMoteur(){
  const M = new Function('db','estReprise','paiementsDe','money2','ymdLocal','marketNetCA','swallow', `
    ${extractFunction('_caLundiDe')}
    ${extractFunction('_caCleGran')}
    ${extractFunction('_caAgregeLignes')}
    ${extractFunction('_caLignesToutes')}
    return {_caLignesToutes,_caAgregeLignes,_caCleGran};
  `);
  const orders = [
    { id:1, clientId:1, date:'2026-03-10', paiements:[{date:'2026-03-10', montant:100}] },
    { id:2, clientId:1, date:'2026-08-01', paiements:[{date:'2026-08-01', montant:250}] },
    { id:3, clientId:1, date:'2026-08-15', paiements:[{date:'2026-08-15', montant:75}] },
    { id:4, clientId:1, date:'2025-11-02', paiements:[{date:'2025-11-02', montant:40}] },
  ];
  const db = { orders:{toArray:async()=>orders}, clients:{toArray:async()=>[{id:1,nom:'A'}]},
               markets:{toArray:async()=>[{id:9,statut:'clos',date:'2026-06-01',nom:'M'}]} };
  const m = M(db, ()=>false, o=>o.paiements||[], n=>Math.round(n*100)/100, d=>d, ()=>300, ()=>{});
  const lignes = await m._caLignesToutes();
  const an = m._caAgregeLignes(lignes,'annee');
  check('A. l\'année en cours cumule commandes ET marchés (100+250+75+300 = 725)', an['2026'] === 725);
  check('A. l\'année précédente reste séparée (40)', an['2025'] === 40);
  const mois = m._caAgregeLignes(lignes,'mois');
  check('A. RÉCONCILIATION : la somme des mois de 2026 égale l\'année 2026',
    Object.keys(mois).filter(k=>k.startsWith('2026')).reduce((s,k)=>s+mois[k],0) === an['2026']);
  check('A. un paiement du jour même est bien pris en compte',
    m._caCleGran('2026-08-16','annee') === '2026');
}

// ---- B. LE FIX ① : changer d'onglet recharge les données ----
{
  const src = extractFunction('caGranSet');
  check('B. changer de granularité vide le cache', /_caLignesCache = null/.test(src));
  check('B. …AVANT de redessiner (sinon le rechargement ne sert à rien)',
    src.indexOf('_caLignesCache = null') < src.indexOf('caChartRender()'));
  check('B. la granularité reste bien appliquée', /_caGran = gran/.test(src));
  check('B. une granularité inconnue est toujours refusée', /CA_GRANS\.indexOf\(gran\)<0/.test(src));
}

// ---- C. LE FIX ② : toute écriture d'argent invalide le cache ----
{
  check('C. une fonction d\'invalidation existe', /function caInvalideCache\(\)/.test(APP));
  const srcInv = extractFunction('caInvalideCache');
  check('C. elle vide bien le cache', /_caLignesCache = null/.test(srcInv));

  const srcSave = extractFunction('saveCmd');
  check('C. enregistrer une commande invalide le cache', /caInvalideCache\(\)/.test(srcSave));
  const srcClose = extractFunction('marketDoClose');
  check('C. clôturer un marché invalide le cache', /caInvalideCache\(\)/.test(srcClose));

  // Les trois écritures de paiement doivent toutes être couvertes.
  // ⚠️ Regex bornée à la MÊME instruction (pas de `;` ni de saut de ligne au milieu) : une
  //    version trop permissive débordait sur l'occurrence suivante et comptait 4 sites pour 3.
  //    Le compte exact importe : c'est lui qui garantit qu'aucun point d'écriture n'est oublié.
  const paiements = [...APP.matchAll(/db\.orders\.update\([^;\n]{0,60}?\{\s*paiements\s*:/g)];
  check(`C. les 4 points d'écriture de paiement sont trouvés (${paiements.length})`, paiements.length === 4);
  let couverts = 0;
  paiements.forEach(m=>{
    const amont = APP.slice(Math.max(0, m.index-400), m.index);
    if(/caInvalideCache\(\)/.test(amont)) couverts++;
  });
  check(`C. …et TOUS invalident le cache (${couverts}/4)`, couverts === paiements.length);
}

// ---- D. Le rendu conserve ses garanties d'origine ----
{
  const src = extractFunction('caChartRender');
  check('D. la série va toujours jusqu\'à AUJOURD\'HUI', /const auj = today\(\)/.test(src));
  check('D. une période sans vente reste une barre à zéro, pas une barre absente',
    /_caSuiteCles\(/.test(src));
  check('D. le cache est rempli s\'il est vide (rechargement effectif)',
    /if\(!_caLignesCache\) _caLignesCache = await _caLignesToutes\(\)/.test(src));
  const srcDash = extractFunction('renderDash');
  check('D. le rendu de l\'accueil vide toujours le cache (comportement v1444 conservé)',
    /_caLignesCache = null/.test(srcDash));
}

testMoteur().then(()=>{
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}).catch(e=>{ console.error('ERREUR SUITE', e); process.exitCode = 1; });
