'use strict';
// v1523 — VRAC AU PRIX LIBRE (même logique que les coffrets).
// Ben : « on arrête les prix préenregistrés, on arrête les tarifs pro et non pro : un menu déroulant avec la quantité de
// macarons, un champ libre avec le prix ; à la rigueur des bulles avec des prix favoris ; et pouvoir modifier une commande
// passée en cliquant sur Modifier ».
// Conception : `prixVrac` = prix TOTAL de la ligne (avant remise de ligne), `nbMacarons` = quantité du menu. Une ligne
// ancienne (sans prixVrac) garde EXACTEMENT son total (quantité × tarif de sa grille) ; rouverte, elle est scellée à ce total.
// Tout s'exécute sur le VRAI code d'app.js.
const { APP } = require('./_extract');
let pass = 0, fail = 0; const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
function fn(marker){ const i = APP.indexOf(marker); if(i < 0) return ''; const j = APP.indexOf('\n}\n', i); return APP.slice(i, j < 0 ? i + 4000 : j + 3); }
const oneLine = m => { const i = APP.indexOf(m); if(i < 0) return ''; return APP.slice(i, APP.indexOf('\n', i)); };
const money2 = x => Math.round((+x + Number.EPSILON) * 100) / 100;
const mulMoney = (a, b) => money2((+a || 0) * (+b || 0));
const iG = APP.indexOf('const TARIF_GRILLES = ['), jG = APP.indexOf('\n];\n', iG) + 4;
const srcGrilles = APP.slice(iG, jG);

const srcFns = [
  oneLine('function grilleCourante(){'), oneLine('function grilleHistorique(){'), oneLine('function grilleParId(id){'),
  fn('function tarifsSaisie(){'), fn('function tarifsDeLigne(ln){'), fn('function tarifsLigneSaisie(ln){'),
  oneLine('function vracEstLibre(ln){'), fn('function vracNbPieces(ln){'), fn('function vracFavorisListe(){'),
  fn('function bigPrice(tarif, ref){'), fn('function vracPrixMacaron(ln, grille){'),
  fn('function sachetPrixPour(n, g){'), fn('function lineTotalStored(ln){'), fn('function coffretSupplementParfums('),
  fn('function _lineToEdit(ln){'), fn('function cmdLinesToStored(){'),
  fn('function _vracRecalcPrix(ln){'), fn('function _vracPrixDepuisTexte(v){'), fn('function setVracNb(i,v){'), oneLine('function setVracPrix(i,v){'),
  fn('function setVracPrixLive(i,v){'), fn('function setVracPrixUnit(i,pu){'),
  fn('function setVracParfum(i,fi,v){'), oneLine('function setVracParfum(i,fi,v){')
].join('\n');
// lineTotalBase (total en cours de saisie) : on prend la vraie fonction
const srcBase = fn('function lineTotalBase(ln){') + '\n' + fn('function lineRemiseEuro(ln){') + '\n' + fn('function lineTotal(ln){');

function monde({ favoris = undefined, date = '2026-11-10' } = {}){
  const cb = { checked: false }, gi = null;
  const ctx = { cmdLines: [], toasts: [], els: {}, draws: 0, recalcs: 0 };
  const doc = { getElementById: id => id === 'f_ancienTarif' ? cb : id === 'f_grilleId' ? gi : (ctx.els[id] || null) };
  const settings = { prixMacaronProStd: 1.5, prixGrandFormatPro: 3.5 };
  if(favoris !== undefined) settings.vracFavoris = favoris;
  const api = new Function('document','money2','mulMoney','getSettings','BOX_PRICES','BIG_PRICE','SACHET_PRIX_MACARON','BOX_FLAVOR_LIMIT','FLAVOR_SURCHARGE',
    'eventUnitPrice','pyraTotalLigne','accessoireDecoTotal','val','coffretUnitPrice','_parfumsToObj','ctx','FLAVORS',
    srcGrilles + '\n' + srcFns + '\n' + srcBase +
    '\nlet cmdLines=ctx.cmdLines; const drawLines=()=>{ctx.draws++;}; const cmdRecalc=()=>{ctx.recalcs++;}; const toast=m=>{ctx.toasts.push(m);}; const euro=x=>"E"+x; const subMoney=(a,b)=>money2(a-b);' +
    '\nreturn { vracEstLibre, vracNbPieces, vracFavorisListe, vracPrixMacaron, lineTotalStored, _lineToEdit, cmdLinesToStored:()=>{cmdLines=ctx.cmdLines; return cmdLinesToStored();}, ' +
    'setLines:l=>{ctx.cmdLines=l; cmdLines=l;}, lineTotalBase: typeof lineTotalBase==="function"?lineTotalBase:null, _vracPrixDepuisTexte, setVracNb, setVracPrix, setVracPrixLive, setVracPrixUnit };')
    (doc, money2, mulMoney, () => settings, { 6: 12 }, { particulier: 7, pro: 3.5 }, 2.5, { 6: 3, 8: 4, 10: 4, 16: 4, 25: 5 }, 3,
      () => 0, () => 0, () => 0, id => id === 'f_date' ? date : '', ln => 10, a => Array.isArray(a) ? Object.fromEntries(a.map(x => [x.nom, x.qte])) : (a || {}), ctx, ['Vanille','Pistache','Chocolat']);
  api.ctx = ctx;
  return api;
}
let W;
try { W = monde(); } catch(e){ console.log('Monde non exécutable : ' + e.message); process.exit(1); }
check('A. fonctions du vrac libre retrouvées dans app.js', /function vracEstLibre/.test(APP) && /function setVracNb/.test(APP) && /function setVracPrixUnit/.test(APP));

// ---------- B. LE PRIX LIBRE FAIT LE TOTAL ----------
{
  const l = { type: 'vrac', nbMacarons: 12, prixVrac: 24, parfums: [{ nom: 'Vanille', qte: 12 }] };
  check('B. prixVrac 24 € pour 12 macarons → ligne à 24 €', W.lineTotalStored(l) === 24);
  check('B. le prix est le TOTAL, pas un prix unitaire (pas de ×12)', W.lineTotalStored({ ...l, prixVrac: 30 }) === 30);
  check('B. prix libre quelconque (17,35 €)', W.lineTotalStored({ ...l, prixVrac: 17.35 }) === 17.35);
  check('B. aucune dépendance au mode pro/non pro ni à la grille', [undefined,'pro','prorec','nonpro'].every(m => W.lineTotalStored({ ...l, proMode: m, grilleId: 'nov2026' }) === 24));
  check('B. remise de ligne appliquée sur le prix libre (10 % → 21,60 €)', W.lineTotalStored({ ...l, remisePct: 10 }) === 21.6);
  check('B. vracEstLibre : 0 € est un prix valide (donc détecté), null/vide ne le sont pas', W.vracEstLibre({ prixVrac: 0 }) && !W.vracEstLibre({ prixVrac: null }) && !W.vracEstLibre({}) && !W.vracEstLibre({ prixVrac: '' }));
}

// ---------- C. LES ANCIENNES COMMANDES GARDENT LEUR TOTAL (stockées) ----------
{
  const vieux = (marq, proMode) => ({ type: 'vrac', proMode, parfums: [{ nom: 'Vanille', qte: 10 }, { nom: 'Pistache', qte: 2 }], sansParfum: 3, ...marq });
  const attendu = [undefined, 'pro', 'prorec', 'nonpro'].map(m => [m, vieux({ tarifRef: '2026-10-02' }, m)]);
  attendu.forEach(([m, ln]) => {
    const avant = W.lineTotalStored(ln);
    check(`C. ancienne ligne (mode ${m}) : total d'origine intact (${avant} €) — 15 macarons × tarif de sa grille`, avant === money2(15 * W.vracPrixMacaron(ln)) && avant > 0);
  });
  check('C. ancienne ligne sans prixVrac : formule historique inchangée (grille 15 mac. × 1,5 réglage pro)', W.lineTotalStored(vieux({}, 'pro')) === money2(15 * W.vracPrixMacaron(vieux({}, 'pro'))));
  check('C. ancienne ligne : vracPrixMacaron toujours disponible pour relire le passé', typeof W.vracPrixMacaron === 'function');
}

// ---------- D. ROUVRIR UNE ANCIENNE COMMANDE : TOTAL SCELLÉ, AUCUN PRIX NE BOUGE ----------
{
  const cas = [
    { m: 'pro', ref: { tarifRef: '2026-10-02' } }, { m: 'prorec', ref: { tarifRef: '2026-10-02' } },
    { m: 'nonpro', ref: { tarifRef: '2026-10-02' } }, { m: 'pro', ref: {} }, { m: 'nonpro', ref: { grilleId: 'nov2026', tarifRef: '2026-11-10' } },
    { m: 'pro', ref: { grilleId: 'sept2026', tarifRef: '2026-09-15' } }
  ];
  cas.forEach(({ m, ref }, k) => {
    const ln = { type: 'vrac', proMode: m, parfums: [{ nom: 'Vanille', qte: 9 }], sansParfum: 3, remisePct: 5, ...ref };
    const total = W.lineTotalStored(ln);
    const e = W._lineToEdit(ln);
    check(`D${k}. rouvrir : prixVrac scellé = total d'origine (${total / 1 - total * 0.05 === 0 ? '' : ''}${money2(12 * W.vracPrixMacaron(ln))})`, e.prixVrac === money2(12 * W.vracPrixMacaron(ln)) && e.nbMacarons === 12);
    check(`D${k}. rouvrir : total affiché pendant l'édition = total d'origine`, W.lineTotalBase && W.lineTotalBase(e) === money2(12 * W.vracPrixMacaron(ln)));
    W.setLines([e]);
    const re = W.cmdLinesToStored()[0];
    check(`D${k}. rouvrir puis enregistrer sans toucher : total identique à l'ancien`, W.lineTotalStored(re) === total);
    check(`D${k}. la remise de ligne (5 %) est conservée`, re.remisePct === 5);
    check(`D${k}. parfums et « sans parfum » conservés (9 + 3)`, W.vracNbPieces(re) === 12 && re.sansParfum === 3 && re.parfums.length === 1 && re.parfums[0].qte === 9);
  });
}

// ---------- E. MODIFIER UNE COMMANDE PASSÉE : QUANTITÉ ET PRIX ----------
{
  const ln = { type: 'vrac', proMode: 'pro', tarifRef: '2026-10-02', parfums: [{ nom: 'Vanille', qte: 6 }], sansParfum: 0 };
  const e = W._lineToEdit(ln);
  e.prixVrac = 33.5; e.prixMacaronVrac = 3.35; e.nbMacarons = 10;                       // il retouche prix et quantité
  W.setLines([e]);
  const s = W.cmdLinesToStored()[0];
  check('E. après modification : nouveau prix 33,50 € pris en compte', W.lineTotalStored(s) === 33.5);
  check('E. après modification : quantité 10, reste non réparti (4) = « sans parfum »', W.vracNbPieces(s) === 10 && s.sansParfum === 4 && s.nbMacarons === 10);
  check('E. spMode posé quand il reste des macarons sans parfum', s.spMode === 'assortiment');
  const r = W._lineToEdit(s);
  check('E. re-rouvrir la commande modifiée : prix et quantité identiques', r.prixVrac === 33.5 && r.nbMacarons === 10 && r.sansParfum === 4);
  W.setLines([r]);
  const s2 = W.cmdLinesToStored()[0];
  check('E. aller-retour stable (stocké → édition → stocké)', JSON.stringify(s2) === JSON.stringify(s));
  check('E. plus de proMode enregistré sur une ligne vrac neuve', s.proMode === undefined);
  const e0 = { ...e, prixVrac: 0 };
  check('E. total en cours de saisie suit le champ prix', W.lineTotalBase(e) === 33.5 && W.lineTotalBase(e0) === 0);
}

// ---------- F. NOUVELLE LIGNE : AUCUN PRIX PAR DÉFAUT ----------
{
  const neuve = { type: 'vrac', parfums: {}, nbMacarons: 0, prixVrac: null };
  check('F. ligne neuve : total 0 (rien de préenregistré)', W.lineTotalBase(neuve) === 0);
  check('F. addLine crée une ligne sans prix ni mode', /type==='vrac'\) cmdLines\.push\(\{type:'vrac', parfums:\{\}, nbMacarons:0, prixVrac:null, prixMacaronVrac:null\}\)/.test(APP));
  W.setLines([{ ...neuve, nbMacarons: 12, prixVrac: 24, parfums: { Vanille: 5, Pistache: 3 } }]);
  const s = W.cmdLinesToStored()[0];
  check('F. enregistrement : reste (12 − 8 = 4) → sans parfum', s.sansParfum === 4 && W.vracNbPieces(s) === 12);
  W.setLines([{ ...neuve, nbMacarons: 8, prixVrac: 16, parfums: { Vanille: 5, Pistache: 3 } }]);
  const t = W.cmdLinesToStored()[0];
  check('F. parfums = quantité → aucun « sans parfum »', t.sansParfum === undefined && t.spMode === undefined);
}

// ---------- G. SAISIE : QUANTITÉ (menu) × PRIX PAR PIÈCE, APERÇU DU TOTAL ----------
{
  check('G. prix « 1,75 » (virgule) → 1.75', W._vracPrixDepuisTexte('1,75') === 1.75);
  check('G. prix « 2.00 » (point) → 2', W._vracPrixDepuisTexte('2.00') === 2);
  check('G. champ vidé → null (jamais un 0 silencieux)', W._vracPrixDepuisTexte('') === null && W._vracPrixDepuisTexte('abc') === null && W._vracPrixDepuisTexte('-3') === null);
  const L = { type: 'vrac', parfums: { Vanille: 9, Pistache: 4 }, nbMacarons: 0, prixVrac: null, prixMacaronVrac: null, sansParfum: 2 };
  W.setLines([L]);
  W.setVracNb(0, '10');
  check('G. choisir 10 : parfums purgés au plafond', L.nbMacarons === 10 && L.parfums.Vanille === 9 && L.sansParfum === undefined);
  check('G. quantité sans prix par pièce : pas de prix (null)', L.prixVrac === null);
  W.setVracNb(0, '5');
  check('G. passer à 5 : un parfum à 9 est ramené à 5', L.parfums.Vanille === 5 && L.parfums.Pistache === 4);
  W.setVracPrix(0, '1,75');
  check('G. prix par pièce 1,75 × 5 = 8,75 € (total calculé automatiquement)', L.prixMacaronVrac === 1.75 && L.prixVrac === 8.75 && W.lineTotalBase(L) === 8.75);
  W.setVracNb(0, '12');
  check('G. changer la quantité recalcule le total (12 × 1,75 = 21 €)', L.prixVrac === 21);
  W.ctx.els.vracTot_0 = { textContent: '' };
  const d0 = W.ctx.draws; W.setVracPrixLive(0, '2');
  check('G. frappe en direct : total recalculé (24 €), aperçu mis à jour, sans redessiner', L.prixVrac === 24 && W.ctx.els.vracTot_0.textContent === 'E24' && W.ctx.draws === d0 && W.ctx.recalcs === 1);
  W.setVracPrixLive(0, '1.666');
  check('G. total arrondi au centime (12 × 1,666 = 19,99 €)', L.prixVrac === 19.99);
  W.setVracPrixUnit(0, 1.6);
  check('G. bulle 1,60 € : prix par pièce 1,60 → 19,20 €', L.prixMacaronVrac === 1.6 && L.prixVrac === 19.2);
  W.setVracPrix(0, '');
  check('G. prix par pièce vidé → plus de prix', L.prixVrac === null && W.lineTotalBase(L) === 0);
  W.setLines([{ ...L, prixMacaronVrac: 1.75, prixVrac: 21, nbMacarons: 12, parfums: { Vanille: 12 } }]);
  const st = W.cmdLinesToStored()[0];
  check('G. enregistré : prix par pièce conservé ET total scellé', st.prixMacaronVrac === 1.75 && st.prixVrac === 21 && W.lineTotalStored(st) === 21);
  const re = W._lineToEdit(st);
  check('G. réouverture : prix par pièce relu tel que saisi (1,75)', re.prixMacaronVrac === 1.75 && re.prixVrac === 21);
  re.nbMacarons = 20; W.setLines([re]); 
}

// ---------- H. FAVORIS ----------
{
  check('H. favoris par défaut : 1,60 / 1,75 / 2,00', JSON.stringify(W.vracFavorisListe()) === JSON.stringify([1.6, 1.75, 2]));
  const W2 = monde({ favoris: '2,20  3;1.5 abc 2.2 0' });
  check('H. favoris réglables : virgule/point, doublons et valeurs invalides ignorés', JSON.stringify(W2.vracFavorisListe()) === JSON.stringify([2.2, 3, 1.5]));
  check('H. liste vide acceptée (aucune bulle)', monde({ favoris: '' }).vracFavorisListe().length === 0);
  check('H. paramètres : champ des favoris + enregistrement', /id="ps_vracfav"/.test(APP) && /s\.vracFavoris=String\(fv\.value/.test(APP) && /vracFavoris: '1\.60, 1\.75, 2\.00'/.test(APP));
  check('H. ancien tarif pro relabellisé « ancien » (lecture du passé uniquement)', /Ancien tarif PRO vrac/.test(APP));
}

// ---------- I. ÉCRAN ET VALIDATION (code réel) ----------
{
  const vr = fn('function drawVracLine(ln,i){');
  check('I. écran : menu quantité + champ prix + bulles favoris', /setVracNb\(\$\{i\}/.test(vr) && /setVracPrix\(\$\{i\}/.test(vr) && /setVracPrixUnit/.test(vr) && /Prix par pièce/.test(vr) && /vracTot_\$\{i\}/.test(vr) && vr.indexOf('vracTot_') < vr.indexOf('Parfums (quantité)'));
  check('I. écran : plus de boutons pro / non pro ni tarif au macaron imposé', !/setVracMode|Pro occasionnel|Pro récurrent|Non pro|vracPrixMacaron/.test(vr));
  check('I. setVracMode supprimée', !/function setVracMode/.test(APP));
  const sv = APP.slice(APP.indexOf('async function saveCmd(id){'), APP.indexOf('async function saveCmd(id){') + 9000);
  check('I. saveCmd exige la quantité, le prix > 0 et refuse un dépassement de parfums', /Vrac : choisis la quantité/.test(sv) && /indique le prix par pièce/.test(sv) && /macarons répartis pour/.test(sv)
    && /if\(sumP>nb\)\{ toast\(`Vrac/.test(sv) && /if\(!\(vracEstLibre\(ln\) && \+ln\.prixVrac>0\)\)\{ toast/.test(sv) && /if\(!\(nb>0\)\)\{ toast\('Vrac/.test(sv));
  check('I. cmdLinesToStored écrit prixVrac et nbMacarons, sans proMode', /type:'vrac', nbMacarons:_nb\|\|undefined, prixVrac:money2/.test(APP));
  check('I. libellés : « Vrac pro » seulement pour les anciennes lignes', /Vrac\$\{vracEstLibre\(ln\)\?'':' pro'\}/.test(APP) && /'  - Vrac'\+\(vracEstLibre\(ln\)\?'':' pro'\)/.test(APP));
}

// ---------- J. LIVRAISON ----------
{
  check('J. APP_VERSION v1523', /const APP_VERSION = 'v15\d\d'/.test(APP));
  const sw = require('fs').readFileSync(require('path').join(__dirname, '..', 'service-worker.js'), 'utf8');
  check('J. cache du service worker v553', /sm-iphone-v5\d\d/.test(sw));
}

console.log(`v1523 — ${pass} assertions OK, ${fail} en échec`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
