'use strict';
// v1485 — DEUX SUJETS. Ben : « le tarif de 1,90 € par macaron ne passe pas dans mes nouveaux tarifs,
// ça reste bloqué à l'ancien » puis, en tranchant : « en cliquant sur ancien tarif je veux 1,60 €
// dans le cadre d'un événement avec pyramide, et 1,90 € si la case n'est pas cochée ». Et :
// « je voudrais rajouter un modèle de pyramide […] 15 étages, 5+7+…+33 = 285 ».
//
// 🚨 LE TARIF : `eventUnitPrice` renvoyait `PYRA_PRICE` — une constante FIGÉE à 1,60 € — dès qu'une
// pyramide était présente. Ce chemin COURT-CIRCUITAIT la grille : c'était le dernier prix en dur de
// la chaîne tarifaire (même famille que les libellés figés corrigés en v1469).
//
// L'HISTORIQUE EST PRÉSERVÉ AU CENTIME : la grille historique porte `event:1.60`, exactement la
// valeur de la constante. Supprimer le cas particulier ne change AUCUNE facture passée — c'est
// vérifié ci-dessous, pas supposé.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. LE PRIX SUIT LA CASE « ANCIENS TARIFS » ----
{
  const grilleCourante   = { event:1.90, eventMin:35, pyramide:22 };
  const grilleHistorique = { event:1.60, eventMin:35, pyramide:20 };
  const M = new Function('tarifsDeLigne','EVENT_PRICE','PYRA_PRICE','grillePourCommande', `
    ${extractFunction('eventUnitPrice')}
    ${extractFunction('eventUnitPricePourCmd')}
    return { eventUnitPrice, eventUnitPricePourCmd };
  `)(ln => (ln && ln.ancienTarif) ? grilleHistorique : grilleCourante, 1.60, 1.60,
     o => (o && o.ancienTarif) ? grilleHistorique : grilleCourante);

  // Le cas de Ben : événement AVEC pyramide.
  check('A. avec pyramide, case décochée → 1,90 €', M.eventUnitPrice({ equip:1, evQte:100 }) === 1.90);
  check('A. avec pyramide, case COCHÉE → 1,60 €', M.eventUnitPrice({ equip:1, evQte:100, ancienTarif:true }) === 1.60);
  // Sans pyramide : comportement d'origine, inchangé.
  check('A. sans pyramide, case décochée → 1,90 €', M.eventUnitPrice({ evQte:100 }) === 1.90);
  check('A. sans pyramide, case cochée → 1,60 €', M.eventUnitPrice({ evQte:100, ancienTarif:true }) === 1.60);
  check('A. plusieurs pyramides ne changent pas le prix unitaire', M.eventUnitPrice({ equip:3, evQte:100 }) === 1.90);
  check('A. le helper « commande » suit la même règle',
    M.eventUnitPricePourCmd({ ancienTarif:true }) === 1.60 && M.eventUnitPricePourCmd({}) === 1.90);
}

// ---- B. NON-RÉGRESSION : aucune facture passée ne bouge ----
{
  const m = APP.match(/debut:'0000-01-01'[\s\S]{0,600}?event:([\d.]+)/);
  check('B. la grille historique porte bien event:1.60', m && parseFloat(m[1]) === 1.60);
  const c = APP.match(/debut:'2026-09-01'[\s\S]{0,900}?event:([\d.]+)/);
  check('B. la grille courante porte bien event:1.90', c && parseFloat(c[1]) === 1.90);
  check('B. RÉCONCILIATION : ancienne grille = ancienne constante, donc l\'historique est identique',
    m && parseFloat(m[1]) === 1.60);
}

// ---- C. L'ÉCRAN NE PEUT PLUS SE CONTREDIRE (leçon des 5 défauts « calcul juste, écran faux ») ----
{
  let code = APP.replace(/\/\*[\s\S]*?\*\//g, '');
  code = code.split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
  // Plus aucun affichage ni calcul ne doit utiliser la constante figée.
  const usages = [...code.matchAll(/euro\(PYRA_PRICE\)|\*\s*PYRA_PRICE|PYRA_PRICE\s*\*/g)];
  check(`C. plus aucun prix figé affiché ou multiplié (${usages.length})`, usages.length === 0);
  check('C. la ligne de commande affiche le prix de SA grille', /euro\(eventUnitPrice\(ln\)\)/.test(code));
  check('C. …et le calcule avec la même fonction', /const prixMac = eventUnitPrice\(ln\)/.test(code));
  // L'optimiseur (écran de planification, sans ligne) utilise la grille EN VIGUEUR.
  const srcOpt = extractFunction('pyraPrixCourant');
  check('C. l\'optimiseur suit la grille en vigueur', /grilleCourante\(\)/.test(srcOpt));
  check('C. …avec un repli si la grille est illisible', /PYRA_PRICE/.test(srcOpt));
  // Le piège trouvé en cours de route : prix unitaire à jour mais multiplication figée.
  check('C. la multiplication de l\'optimiseur utilise la MÊME valeur que le prix affiché',
    /opt\.propose\*pyraPrixCourant\(\)/.test(code));
}

// ---- D. LE NOUVEAU MODÈLE DE PYRAMIDE ----
{
  const M = new Function('localStorage','swallow', `
    ${extractConstLine('PYRA_MODELE_285')}
    ${extractFunction('pyraMigrer285')}
    return { PYRA_MODELE_285, pyraMigrer285 };
  `)({ getItem:()=>null, setItem:()=>{} }, ()=>{});
  const p = M.PYRA_MODELE_285.plateaux;
  check('D. 15 étages', p.length === 15);
  check('D. RÉCONCILIATION : la somme fait bien 285', p.reduce((a,b)=>a+b,0) === 285);
  check('D. la suite est exactement celle de Ben (5 → 33, de 2 en 2)',
    p.join(',') === '5,7,9,11,13,15,17,19,21,23,25,27,29,31,33');
  check('D. sommet = 5, base = 33', p[0] === 5 && p[14] === 33);
  check('D. sécable : Ben peut monter une pyramide partielle', M.PYRA_MODELE_285.secable === true);
  check('D. UN SEUL modèle pour les 4 présentoirs (la couleur ne change pas la capacité)',
    !/noire|blanche/i.test(M.PYRA_MODELE_285.nom));
  check('D. il est dans la liste par défaut', /PYRA_MODELE_285\s+\/\/ \[v1485\]/.test(APP));
}

// ---- E. La migration : Ben a déjà des modèles enregistrés ----
{
  function bac(contenu){
    const store = contenu ? { sm_pyraModels: JSON.stringify(contenu) } : {};
    const localStorage = { getItem:k=>store[k]||null, setItem:(k,v)=>{ store[k]=v; } };
    const M = new Function('localStorage','swallow', `
      ${extractConstLine('PYRA_MODELE_285')}
      ${extractFunction('pyraMigrer285')}
      return pyraMigrer285;
    `)(localStorage, ()=>{});
    return { M, store };
  }
  const vide = bac(null);
  check('E. sans modèles personnalisés : rien à migrer (la valeur par défaut suffit)', vide.M() === 0);

  const b = bac([{ nom:'Bloc 35', plateaux:[35], secable:false }]);
  check('E. avec des modèles existants : le nouveau est ajouté', b.M() === 1);
  const apres = JSON.parse(b.store.sm_pyraModels);
  check('E. les modèles existants sont PRÉSERVÉS', apres.some(m=>m.nom === 'Bloc 35'));
  check('E. le nouveau modèle est bien là', apres.some(m=>Array.isArray(m.plateaux) && m.plateaux.length === 15));
  check('E. relancée, elle n\'ajoute pas de doublon (idempotente)', b.M() === 0);

  const dejaLa = bac([{ nom:'Autre nom', plateaux:[5,7,9,11,13,15,17,19,21,23,25,27,29,31,33] }]);
  check('E. un modèle identique sous un AUTRE nom n\'est pas dupliqué', dejaLa.M() === 0);

  const casse = bac('pas un tableau');
  check('E. un stockage corrompu ne fait rien planter', casse.M() === 0);
}

// ---- F. L'optimiseur sait déduire les étages du nouveau modèle ----
{
  const fn = new Function(`${extractFunction('pyraConfigs')}\nreturn pyraConfigs;`)();
  const cfgs = fn([5,7,9,11,13,15,17,19,21,23,25,27,29,31,33]);
  check('F. 15 configurations proposées, une par étage', cfgs.length === 15);
  check('F. 1 étage = 5 macarons', cfgs[0].total === 5);
  check('F. 15 étages = 285 macarons', cfgs[14].total === 285);
  check('F. les cumuls sont strictement croissants',
    cfgs.every((c,i)=> i === 0 || c.total > cfgs[i-1].total));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
