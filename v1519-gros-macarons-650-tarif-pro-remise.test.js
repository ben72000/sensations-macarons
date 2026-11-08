'use strict';
// v1519 — GROS MACARONS À 6,50 €, FIN DU TARIF PRO AUTOMATIQUE, REMISE « TARIF PRO » INDÉPENDANTE.
// Ben : « les faire à 6,50 € l'unité et non plus 7 € […] enlever le tarif pro automatique. En lieu et place, pouvoir
// ajouter de manière totalement indépendante la mention tarif pro dans la partie remise, qui se calcule soit en euro
// soit en % ». Ses choix : ① plus de pro automatique sur gros macarons ET vrac pro ; ② la remise « Tarif pro » vaut
// pour toute la commande (une ligne) ; ③ les commandes/devis existants GARDENT leurs prix, même rouverts.
//
// CONCEPTION : une nouvelle grille `nov2026` (6,50 €, proActif:false). Un document enregistré à partir de cette version
// porte `grilleId` (sur lui et sur chaque ligne). Un document déjà enregistré avec `tarifRef` seul est GELÉ sur la grille
// de septembre (7 €, pro 3,80 €), un document sans marqueur reste sur l'historique : rien ne bouge au centime.
// La remise « Tarif pro » n'est qu'un LIBELLÉ posé sur la remise globale existante (€ ou %) : aucun calcul nouveau.
// Tout s'exécute sur le VRAI code d'app.js ; preuve par mutation en fin de fichier (voir run mutation du livrable).
const { APP } = require('./_extract');

let pass = 0, fail = 0; const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
function fn(marker){ const i = APP.indexOf(marker); if(i < 0) return ''; const j = APP.indexOf('\n}\n', i); return APP.slice(i, j < 0 ? i + 4000 : j + 3); }
const money2 = x => Math.round((+x + Number.EPSILON) * 100) / 100;
const mulMoney = (a, b) => money2((+a || 0) * (+b || 0));

// ---------- monde exécutable : vraies grilles + vrais résolveurs ----------
const iG = APP.indexOf('const TARIF_GRILLES = ['), jG = APP.indexOf('\n];\n', iG) + 4;
const srcGrilles = APP.slice(iG, jG);
const oneLine = m => { const i = APP.indexOf(m); if(i < 0) return ''; return APP.slice(i, APP.indexOf('\n', i)); };
const srcFns = [
  oneLine('function grilleCourante(){'), oneLine('function grilleHistorique(){'), oneLine('function grilleParId(id){'),
  fn('function tarifsSaisie(){'), fn('function tarifsDeLigne(ln){'), fn('function tarifsLigneSaisie(ln){'),
  fn('function bigPrice(tarif, ref){'), fn('function vracPrixMacaron(ln, grille){'), fn('function grillePourCommande(o){'),
  fn('function libelleRemise('), fn('function sachetPrixPour(n, g){'), fn('function lineTotalStored(ln){'),
  fn('function coffretSupplementParfums('), fn('function _lineToEdit(ln){'), fn('function cmdLinesToStored(){')
].join('\n');
check('A. grilles et 15 fonctions retrouvées', srcGrilles.length > 500 && (srcFns.match(/^function /gm) || []).length === 15);

function monde({ ancien = false, grilleId = null, date = '2026-11-10' } = {}){
  const cb = { checked: ancien }, gi = grilleId == null ? null : { value: grilleId };
  const doc = { getElementById: id => id === 'f_ancienTarif' ? cb : id === 'f_grilleId' ? gi : null };
  const ctx = { cmdLines: [] };
  const api = new Function('document','money2','mulMoney','getSettings','BOX_PRICES','BIG_PRICE','SACHET_PRIX_MACARON','BOX_FLAVOR_LIMIT','FLAVOR_SURCHARGE',
    'eventUnitPrice','pyraTotalLigne','accessoireDecoTotal','val','coffretUnitPrice','_parfumsToObj','ctx',
    srcGrilles + '\n' + srcFns + '\nreturn { TARIF_GRILLES, grilleCourante, grilleParId, tarifsSaisie, tarifsDeLigne, grillePourCommande, bigPrice, vracPrixMacaron, libelleRemise, lineTotalStored, _lineToEdit, cmdLinesToStored, setLines:l=>{ctx.cmdLines=l;} , getLines:()=>ctx.cmdLines };'
      .replace('cmdLinesToStored, setLines', 'cmdLinesToStored: () => { cmdLines = ctx.cmdLines; return cmdLinesToStored(); }, setLines'))
    (doc, money2, mulMoney, () => ({ prixMacaronProStd: 1.5, prixGrandFormatPro: 3.5 }), { 6: 12 }, { particulier: 7, pro: 3.5 }, 2.5, { 6: 3, 8: 4, 10: 4, 16: 4, 25: 5 }, 3,
      () => 0, () => 0, () => 0, id => id === 'f_date' ? date : '', ln => 10, a => Array.isArray(a) ? Object.fromEntries(a.map(x => [x.nom, x.qte])) : (a || {}), ctx);
  return api;
}
let W = monde();

// ---------- B. LES GRILLES ----------
{
  const [nov, sept, hist] = [W.grilleParId('nov2026'), W.grilleParId('sept2026'), W.grilleParId('hist')];
  check('B. la grille courante est celle du 4 novembre 2026', W.grilleCourante().id === 'nov2026' && W.grilleCourante().debut === '2026-11-04');
  check('B. gros macaron : 6,50 € en vigueur', nov.grandFormat.particulier === 6.5);
  check('B. aucun prix pro automatique : proActif=false, pro gros macaron nul, pro vrac nuls', nov.proActif === false && nov.grandFormat.pro == null && nov.proOccasionnel == null && nov.proRecurrent == null);
  check('B. grille de septembre INTOUCHÉE : 7,00 € / pro 3,80 € / vrac pro 1,75 et 1,60', sept.grandFormat.particulier === 7 && sept.grandFormat.pro === 3.8 && sept.proOccasionnel === 1.75 && sept.proRecurrent === 1.6 && sept.proActif !== false);
  check('B. grille historique INTOUCHÉE (grandFormat nul, coffret 6 = 12 €)', hist.grandFormat === null && hist.box[6] === 12);
  check('B. les autres prix de la grille en vigueur sont inchangés (coffrets, événement, logo, forfait)',
    nov.box[6] === 14 && nov.box[25] === 50 && nov.event === 1.9 && nov.logoPaliers[0].prix === 1 && nov.forfaitCreation === 40);
}

// ---------- C. PRIX D'UN GROS MACARON SELON LE MARQUEUR (« gardent leurs prix, même rouverts ») ----------
{
  const gros = (marq, tarif = 'particulier') => ({ type: 'grand', tarif, items: [{ nom: 'Pistache', qte: 3 }], ...marq });
  check('C. NOUVELLE ligne (grilleId nov2026) : 3 gros macarons = 19,50 €', W.lineTotalStored(gros({ grilleId: 'nov2026', tarifRef: '2026-11-10' })) === 19.5);
  check('C. ligne ENREGISTRÉE AVANT (tarifRef seul) : reste à 7 € → 21,00 €, même rouverte', W.lineTotalStored(gros({ tarifRef: '2026-10-02' })) === 21);
  check('C. ligne ENREGISTRÉE AVANT, tarif pro : reste à 3,80 € → 11,40 € (prix gardé)', W.lineTotalStored(gros({ tarifRef: '2026-10-02' }, 'pro')) === 11.4);
  check('C. ligne sans marqueur : grille historique (BIG_PRICE)', W.lineTotalStored(gros({})) === 21);
  check('C. ligne « anciens tarifs » explicite : historique', W.lineTotalStored(gros({ ancienTarif: true, grilleId: 'nov2026' })) === 21);
  check('C. tarif « pro » hérité sur une ligne de la nouvelle grille : AUCUN prix pro (6,50 €)', W.lineTotalStored(gros({ grilleId: 'nov2026' }, 'pro')) === 19.5);
  check('C. grilleId inconnu → repli sûr (tarifRef/hist), jamais un crash', W.lineTotalStored(gros({ grilleId: 'zzz', tarifRef: '2026-10-02' })) === 21);
}

// ---------- D. VRAC : PLUS DE TARIF PRO AUTOMATIQUE ----------
{
  const vrac = (marq, proMode) => ({ type: 'vrac', proMode, parfums: [{ nom: 'Vanille', qte: 12 }], ...marq });
  const nonpro = money2(14 / 6);
  check('D. nouvelle grille : un vrac « pro occasionnel » ne donne plus 1,75 € mais le prix non pro (14 ÷ 6)', W.vracPrixMacaron(vrac({ grilleId: 'nov2026' }, 'pro')) === nonpro);
  check('D. nouvelle grille : « pro récurrent » idem', W.vracPrixMacaron(vrac({ grilleId: 'nov2026' }, 'prorec')) === nonpro);
  check('D. vrac enregistré avant (tarifRef seul, pro occasionnel) : 1,75 € GARDÉ → 12 × 1,75 = 21,00 €', W.lineTotalStored(vrac({ tarifRef: '2026-10-02' }, 'pro')) === 21);
  check('D. vrac enregistré avant, pro récurrent : 1,60 € GARDÉ → 19,20 €', W.lineTotalStored(vrac({ tarifRef: '2026-10-02' }, 'prorec')) === 19.2);
  check('D. vrac nouvelle grille, total 12 × 2,33 = 27,96 €', W.lineTotalStored(vrac({ grilleId: 'nov2026' }, 'pro')) === money2(12 * nonpro));
}

// ---------- E. ENREGISTREMENT : cmdLinesToStored sur le vrai code ----------
{
  const nouvelle = monde({ grilleId: 'nov2026' });
  nouvelle.setLines([
    { type: 'grand', tarif: 'pro', items: { Pistache: 2 }, remisePct: 0 },
    { type: 'vrac', proMode: 'pro', parfums: { Vanille: 6 }, remisePct: 0 },
    { type: 'coffret', taille: 6, parfums: { Vanille: 6 }, remisePct: 0 },
    { type: 'sachet', parfums: { Vanille: 3 }, remisePct: 0 }
  ]);
  const st = nouvelle.cmdLinesToStored();
  check('E. toutes les lignes enregistrées portent grilleId nov2026', st.length === 4 && st.every(l => l.grilleId === 'nov2026'));
  check('E. gros macaron « pro » forcé en particulier à l\'enregistrement (plus de pro automatique)', st[0].tarif === 'particulier');
  check('E. vrac « pro » forcé en non pro', st[1].proMode === 'nonpro');
  check('E. relecture ligne par ligne : _lineToEdit conserve grilleId', st.every(l => nouvelle._lineToEdit(l).grilleId === 'nov2026'));
  check('E. 2 gros macarons enregistrés = 13,00 €', nouvelle.lineTotalStored(st[0]) === 13);

  // aller-retour d'un document ANTÉRIEUR rouvert puis réenregistré : il reste sur septembre
  const ancienne = monde({ grilleId: 'sept2026' });
  const stockee = { type: 'grand', tarif: 'pro', tarifRef: '2026-10-02', items: [{ nom: 'Pistache', qte: 2 }], remisePct: 0 };
  ancienne.setLines([ancienne._lineToEdit(stockee)]);
  const re = ancienne.cmdLinesToStored();
  check('E. document antérieur rouvert puis réenregistré : reste sur la grille de septembre', re[0].grilleId === 'sept2026');
  check('E. … et GARDE son tarif pro 3,80 € (2 × 3,80 = 7,60 €)', re[0].tarif === 'pro' && ancienne.lineTotalStored(re[0]) === 7.6);
  check('E. … la date de commande d\'origine (tarifRef) n\'est pas rafraîchie', re[0].tarifRef === '2026-10-02');

  // document historique verrouillé : case cochée → pas de grilleId, historique conservé
  const hist = monde({ ancien: true, grilleId: 'sept2026' });
  hist.setLines([{ type: 'grand', tarif: 'particulier', items: { Pistache: 2 }, remisePct: 0 }]);
  const sh = hist.cmdLinesToStored();
  check('E. document historique verrouillé : aucun grilleId posé, ancienTarif conservé, 2 × 7 € = 14,00 €', sh[0].grilleId === undefined && sh[0].ancienTarif === true && hist.lineTotalStored(sh[0]) === 14);
}

// ---------- F. SAISIE : la grille mémorisée du formulaire décide ----------
{
  check('F. nouvelle commande (aucun champ) → grille en vigueur', monde().tarifsSaisie().id === 'nov2026');
  check('F. champ f_grilleId = sept2026 → septembre', monde({ grilleId: 'sept2026' }).tarifsSaisie().id === 'sept2026');
  check('F. case historique cochée → historique, quel que soit f_grilleId', monde({ ancien: true, grilleId: 'nov2026' }).tarifsSaisie().id === 'hist');
  check('F. f_grilleId inconnu → grille en vigueur (jamais de crash)', monde({ grilleId: '???' }).tarifsSaisie().id === 'nov2026');
  const w = monde({ grilleId: 'sept2026' });
  check('F. gros macaron en saisie sur un document de septembre : 7 €', w.bigPrice('particulier', { __grille: w.tarifsSaisie() }) === 7);
  check('F. grillePourCommande : grilleId > tarifRef > historique', w.grillePourCommande({ grilleId: 'nov2026', tarifRef: 'x' }).id === 'nov2026' && w.grillePourCommande({ tarifRef: 'x' }).id === 'sept2026' && w.grillePourCommande({}).id === 'hist');
}

// ---------- G. REMISE « TARIF PRO » : un libellé, pas un prix ----------
{
  check('G. libellé : remise tarif pro seule → « Remise tarif pro »', W.libelleRemise(30, 30, 'Réductions accordées') === 'Remise tarif pro');
  check('G. libellé : tarif pro + autres remises → « (dont remise tarif pro) »', W.libelleRemise(45, 30, 'Réductions accordées') === 'Réductions accordées (dont remise tarif pro)');
  check('G. libellé : pas de tarif pro → libellé d\'origine', W.libelleRemise(30, 0, 'Réductions accordées') === 'Réductions accordées');
  const src = APP;
  // le drapeau est ÉCRIT et RELU partout où la remise globale voyage (contrat v1488 : champ écrit = champ relu)
  const nb = (re) => (src.match(re) || []).length;
  check('G. remiseTarifPro écrit à l\'enregistrement de la commande', /remiseTarifPro: !!\(document\.getElementById\('f_remTarifPro'\)\|\|\{\}\)\.checked && remiseGlobaleEur>0/.test(src));
  check('G. remiseTarifPro écrit dans le devis (docObj)', /remiseTarifPro: !!o\.remiseTarifPro,\s*\n\s*notes:o\.notes/.test(src));
  check('G. grilleId du devis relu à l\'ouverture (sinon le devis changerait de grille au premier aller-retour)', /grilleId:dv\.grilleId\|\|''/.test(src));
  check('G. remiseTarifPro relu à l\'ouverture d\'un devis', /remiseTarifPro:!!dv\.remiseTarifPro/.test(src));
  check('G. remiseTarifPro suit devis→commande et commande→devis', nb(/remiseTarifPro: !!d\.remiseTarifPro/g) >= 1 && nb(/remiseTarifPro: !!o\.remiseTarifPro,\s*\n\s*montant/g) >= 1);
  check('G. case « Tarif pro » présente dans le bloc remise, relue à l\'ouverture', /id="f_remTarifPro" \$\{o\.remiseTarifPro\?'checked':''\}/.test(src));
  check('G. la case ne crée AUCUN calcul : aucune lecture de f_remTarifPro hors libellés/enregistrement', nb(/f_remTarifPro/g) === 3);
  check('G. libellé « Remise tarif pro » sur la vue commande, le devis/facture et les exports texte', nb(/Remise tarif pro/g) >= 5);
}

// ---------- H. L'ASSISTANT NE CRÉE PLUS DE LIGNE PRO ----------
{
  const ai = APP.slice(APP.indexOf('async function aiExecuteOrderDraft'), APP.indexOf('async function aiExecuteOrderDraft') + 3500);
  check('H. assistant : gros macarons toujours « particulier »', /type:'grand', tarif:'particulier'/.test(ai) && !/tarif: estPro\?'pro'/.test(ai));
  check('H. assistant : vrac d\'un client pro en non pro', /type:'vrac', proMode:'nonpro'/.test(ai));
}

// ---------- I. ÉCRANS ----------
{
  const big = fn('function drawBigLine(ln,i){');
  check('I. écran gros macarons : option « Pro » masquée sans tarif pro, indication vers la remise', /_sansPro\?'':`<option value="pro"/.test(big) && /Remise → « Tarif pro »/.test(big));
  const vr = APP.slice(APP.indexOf('const _vSansPro'), APP.indexOf('const _vSansPro') + 900);
  check('I. écran vrac : boutons pro remplacés par une note', /_vSansPro/.test(vr) && /Remise → « Tarif pro »/.test(vr));
  check('I. aucun prix « 7 » codé en dur dans la nouvelle grille', !/grandFormat:\{ particulier:7/.test(srcGrilles.slice(0, srcGrilles.indexOf("id:'sept2026'"))));
}

console.log(`v1519 — ${pass} assertions OK, ${fail} en échec`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
