'use strict';
// v1489 — LE DEVIS CHANGEAIT DE GRILLE EN CHANGEANT D'ÉCRAN. Ben : « sur la page listant les devis
// le montant n'est pas conforme. Quand je clique dessus pour voir le détail là j'ai bien tout
// indiqué avec les prix. En revanche quand je fais visualiser devis là ça disparaît de nouveau.
// Seule la quantité de macarons reste ».
//
// 🚨 CAUSE : le devis n'enregistrait NI `tarifRef` NI `ancienTarif`. Or `grillePourCommande` traite
// un contexte SANS marqueur comme une commande HÉRITÉE et renvoie la grille HISTORIQUE — où le logo
// n'existe pas (`logoPaliers:null`). Le supplément valait donc ZÉRO au rendu, et une ligne à zéro ne
// s'affiche pas. Le détail, lui, lit des montants déjà calculés : d'où un écran juste et l'autre
// vide, sur le MÊME document.
//
// ⚠️ Trois symptômes, une seule cause. C'est la description précise de Ben (quel écran montre quoi)
// qui a permis de la trouver — sans elle, j'aurais corrigé le total, qui n'était pas en cause.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. LA RÈGLE : sans marqueur, c'est la grille historique ----
{
  const M = new Function('grilleHistorique','grilleCourante', `
    ${extractFunction('grillePourCommande')}
    return grillePourCommande;
  `)(()=>({nom:'historique', logoPaliers:null}), ()=>({nom:'courante', logoPaliers:[{jusqua:99,prix:1}]}));

  check('A. sans marqueur → grille HISTORIQUE (le logo n\'y existe pas)', M({}).nom === 'historique');
  check('A. avec tarifRef → grille courante', M({tarifRef:'2026-08-20'}).nom === 'courante');
  check('A. ancienTarif coché → historique, même avec tarifRef',
    M({tarifRef:'2026-08-20', ancienTarif:true}).nom === 'historique');
  // La conséquence exacte du symptôme de Ben.
  check('A. RÉCONCILIATION : sans marqueur, la grille n\'a pas de paliers logo',
    M({}).logoPaliers === null);
}

// ---- B. LE FIX : le devis porte les marqueurs, à l'écriture ET à la relecture ----
{
  const iDoc = APP.indexOf('const docObj');
  const doc = APP.slice(iDoc, APP.indexOf('if(_cmdDevisId)', iDoc));
  check('B. le devis écrit tarifRef', /tarifRef: o\.tarifRef \|\| \(val\('f_date'\)\|\|today\(\)\)/.test(doc));
  check('B. …et ancienTarif', /ancienTarif: !!o\.ancienTarif/.test(doc));

  const iRel = APP.indexOf('const dv = await db.documents.get(_cmdDevisId);');
  const relu = APP.slice(iRel, iRel + 2600);
  check('B. la relecture restitue tarifRef', /tarifRef:dv\.tarifRef\|\|''/.test(relu));
  check('B. …et ancienTarif (sinon perte au 1er aller-retour, leçon v1488)', /ancienTarif:!!dv\.ancienTarif/.test(relu));
}

// ---- C. LE TOTAL du devis inclut enfin logo et forfait ----
{
  const i = APP.indexOf('const _logoMt = logoMontantPour(d.persoLogoNb, d)');
  check('C. le sous-total du devis ajoute le supplément logo', i >= 0);
  const src = APP.slice(i, i + 400);
  // ⚠️ Regex simplifiée : viser la partie STABLE (« + persoMt + _logoMt ») plutôt que reproduire
  //    tout l'appel `reduce`, dont les parenthèses imbriquées cassaient la classe [^)]*.
  check('C. …dans le totalBrut', /const totalBrut = money2\(/.test(src) && /\+ persoMt \+ _logoMt\)/.test(src));
  check('C. le forfait création est compris', /forfaitCreationPour\(d\.forfaitCreationNb, d\)/.test(src));
}

// ---- D. LE RATTRAPAGE des devis existants ----
async function testMigration(){
  const src = extractFunction('migrerDevisTarifRef');
  check('D. seuls les DEVIS sont touchés, jamais les factures', /d\.type !== 'devis'\) continue/.test(src));
  check('D. un document déjà marqué n\'est pas retouché', /if\(d\.tarifRef \|\| d\.ancienTarif\) continue/.test(src));
  check('D. tarifRef prend la DATE DU DEVIS, pas celle du jour', /const ref = \(d\.date \|\| ''\)/.test(src));
  check('D. ancienTarif reste false (on ne devine pas un choix jamais exprimé)', /ancienTarif: false/.test(src));
  check('D. idempotente', /sm_devisTarifRefMigre/.test(src));

  const docs = [
    { id:1, type:'devis',   date:'2026-08-20' },                          // à migrer
    { id:2, type:'devis',   date:'2026-07-01', tarifRef:'2026-07-01' },   // déjà marqué
    { id:3, type:'facture', date:'2026-08-01' },                          // jamais
    { id:4, type:'devis',   date:'' },                                    // sans date
    { id:5, type:'devis',   date:'2026-09-10', ancienTarif:true },        // choix explicite
  ];
  const store = {};
  const db = { documents:{ toArray: async()=>docs.slice(),
    update: async(id,p)=>{ Object.assign(docs.find(d=>d.id===id), p); } } };
  const localStorage = { getItem:k=>store[k]||null, setItem:(k,v)=>{ store[k]=v; } };
  const fn = new Function('db','localStorage','toast','swallow', `${src}\nreturn migrerDevisTarifRef;`)
    (db, localStorage, ()=>{}, ()=>{});

  check('D. un seul devis migré', (await fn()) === 1);
  check('D. il prend la date du DEVIS (20/08), pas la date du jour', docs[0].tarifRef === '2026-08-20');
  check('D. le devis déjà marqué est intact', docs[1].tarifRef === '2026-07-01');
  check('D. la FACTURE n\'est pas touchée (un document émis ne se retarife pas)', docs[2].tarifRef === undefined);
  check('D. un devis sans date est laissé tel quel', docs[3].tarifRef === undefined);
  check('D. un « anciens tarifs » explicite est préservé', docs[4].ancienTarif === true && docs[4].tarifRef === undefined);
  check('D. relancée, elle ne refait rien', (await fn()) === 0);
}

// ---- E. RÉCONCILIATION DE BOUT EN BOUT : le devis affiche enfin son supplément ----
{
  const grilleCourante = { logoPaliers:[{jusqua:99,prix:1.00},{jusqua:300,prix:0.80},{jusqua:Infinity,prix:0.70}], forfaitCreation:40 };
  const grilleHisto    = { logoPaliers:null, forfaitCreation:0 };

  const faire = ctx => new Function('_grilleOption','money2', `
    ${extractFunction('logoPrixUnitPour')}
    ${extractFunction('logoMontantPour')}
    ${extractFunction('forfaitCreationPour')}
    return { logoMontantPour, forfaitCreationPour };
  `)(() => (ctx && ctx.tarifRef && !ctx.ancienTarif) ? grilleCourante : grilleHisto,
     n=>Math.round(n*100)/100);

  // AVANT : le devis n'avait pas de marqueur.
  const avant = faire({});
  check('E. AVANT le fix : 150 macarons logotés valaient 0 € → ligne invisible',
    avant.logoMontantPour(150) === 0);

  // APRÈS : le devis porte son marqueur.
  const apres = faire({ tarifRef:'2026-09-10' });
  check('E. APRÈS : 150 × 0,80 = 120 €', apres.logoMontantPour(150) === 120);
  check('E. …et le forfait création réapparaît', apres.forfaitCreationPour(1) === 40);

  // Un devis explicitement « anciens tarifs » reste sur l'ancienne grille — c'est voulu.
  const ancien = faire({ tarifRef:'2026-09-10', ancienTarif:true });
  check('E. un devis « anciens tarifs » garde bien l\'ancienne grille', ancien.logoMontantPour(150) === 0);
}

testMigration().then(()=>{
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}).catch(e=>{ console.error('ERREUR SUITE', e); process.exitCode = 1; });
