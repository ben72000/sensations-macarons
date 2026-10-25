'use strict';
// v1510 — DUPLIQUER UN COFFRET (« x10 »).
// Ben : « si je veux ajouter à un devis 10 coffrets de 4 macarons, tous identiques, je veux le saisir une seule
// fois et indiquer x10, tout en permettant la modification d'un ou plusieurs coffrets une fois la saisie
// effectuée, pour par exemple ajouter une variation de parfums sur une partie de la commande. »
//
// CHOIX DE CONCEPTION (à ne pas défaire sans raison) : des COPIES INDÉPENDANTES — une ligne par coffret — et non
// une « quantité » portée par la ligne. Totaux, production, stock, étiquettes et documents lisent « une ligne =
// un coffret » : une quantité aurait touché des dizaines de lecteurs (argent, stock). Chaque copie est une ligne
// comme les autres : modifiable seule, supprimable seule, re-dupliquable.
// `repli` = état d'AFFICHAGE du formulaire : jamais écrit dans la commande, jamais relu (voir C).
//
// LEÇONS APPLIQUÉES : écran juste ≠ calcul juste (D : la carte repliée montre le prix RÉELLEMENT appliqué) ·
// aller-retour (C) · garde par pattern sur la persistance de `repli` · chaque garde prouvée par réintroduction.
const { stripComments, APP } = require('./_extract');

let pass = 0, fail = 0; const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
function fn(marker){
  const i = APP.indexOf(marker); if(i < 0) return '';
  const j = APP.indexOf('\n}\n', i);
  return APP.slice(i, j < 0 ? i + 4000 : j + 3);
}
const money2 = x => Math.round((+x + Number.EPSILON) * 100) / 100;

// ---------- A. dupliquerCoffret : comportement réel ----------
const srcDup = fn('function dupliquerCoffret(i, total){');
check('A. dupliquerCoffret retrouvée', srcDup.length > 400);
function lancer(lignes, i, total){
  const cmdLines = lignes; const toasts = []; let redraw = 0;
  const f = new Function('cmdLines','toast','drawLines','CMD_DUP_MAX', srcDup + '\nreturn dupliquerCoffret;')(cmdLines, t => toasts.push(t), () => { redraw++; }, 50);
  const ok = f(i, total);
  return { ok, cmdLines, toasts, redraw };
}
const modele = () => ({ type: 'coffret', taille: 4, parfums: { Caramel: 2, Framboise: 2 }, sansParfum: 0, remisePct: 5, prixUnitaireApplique: 8, prixLibre: true, embMode: 'standard', embMatId: null });
{
  const r = lancer([modele()], 0, 10);
  check('A. x10 → 10 coffrets au total (1 original + 9 copies)', r.ok === true && r.cmdLines.length === 10);
  check('A. l\'ORIGINAL reste déplié (sans repli)', !r.cmdLines[0].repli);
  check('A. toutes les copies sont repliées', r.cmdLines.slice(1).every(c => c.repli === true));
  const sansRepli = c => { const x = JSON.parse(JSON.stringify(c)); delete x.repli; return JSON.stringify(x); };
  check('A. chaque copie est IDENTIQUE à l\'original (format, prix, parfums, remise, emballage)', r.cmdLines.every(c => sansRepli(c) === sansRepli(r.cmdLines[0])));
  check('A. le prix saisi (8 €) est repris sur chaque copie', r.cmdLines.every(c => c.prixUnitaireApplique === 8 && c.prixLibre === true));
  check('A. un redessin et un message de confirmation', r.redraw === 1 && r.toasts.length === 1 && /10 coffrets identiques/.test(r.toasts[0]) && /9 copies/.test(r.toasts[0]));
  // INDÉPENDANCE : modifier une copie ne touche ni l'original ni les autres (copie PROFONDE)
  r.cmdLines[3].parfums.Pistache = 4; r.cmdLines[3].taille = 6; r.cmdLines[3].prixUnitaireApplique = 10;
  check('A. INDÉPENDANCE : modifier la copie n°4 ne touche pas l\'original', r.cmdLines[0].parfums.Pistache === undefined && r.cmdLines[0].taille === 4 && r.cmdLines[0].prixUnitaireApplique === 8);
  check('A. INDÉPENDANCE : ni les autres copies', r.cmdLines.filter((c, k) => k !== 3).every(c => c.parfums.Pistache === undefined && c.taille === 4));
  // total de la commande : 9 coffrets à 8 € + 1 à 10 €
  const srcPU = fn('function coffretUnitPrice(');
  const pu = new Function('tarifsSaisie','money2','cmdProductsCache','BOX_PRICES', srcPU + '\nreturn coffretUnitPrice;')(() => ({ box: {} }), money2, [], {});
  check('A. TOTAL : 9 coffrets à 8 € + 1 variante à 10 € = 82 €', money2(r.cmdLines.reduce((a, c) => a + pu(c), 0)) === 82);
}
{
  const r = lancer([{ type: 'coffret', taille: 6, parfums: { A: 6 }, prixUnitaireApplique: 14 }, modele(), { type: 'sachet' }], 1, 3);
  check('A. dupliquer la ligne du MILIEU : les copies s\'insèrent juste après elle', r.cmdLines.length === 5 && r.cmdLines[1].taille === 4 && r.cmdLines[2].repli && r.cmdLines[3].repli && r.cmdLines[4].type === 'sachet');
  check('A. la ligne d\'avant n\'est pas touchée', r.cmdLines[0].taille === 6 && !r.cmdLines[0].repli);
}
{ const r = lancer([modele()], 0, '10'); check('A. « 10 » saisi comme TEXTE est accepté', r.ok === true && r.cmdLines.length === 10); }
{ const r = lancer([modele()], 0, 10.9); check('A. 10,9 → 10 (arrondi à l\'entier inférieur)', r.cmdLines.length === 10); }
{ const r = lancer([modele()], 0, 2); check('A. x2 → 1 copie (« 1 copie », pas « 1 copies »)', r.cmdLines.length === 2 && /1 copie /.test(r.toasts[0]) && !/1 copies/.test(r.toasts[0])); }
{ const r = lancer([modele()], 0, 50); check('A. x50 (maximum) accepté', r.ok === true && r.cmdLines.length === 50); }
for(const [lab, v] of [['1', 1], ['0', 0], ['51', 51], ['négatif', -4], ['vide', ''], ['texte', 'abc'], ['NaN', NaN]]){
  const r = lancer([modele()], 0, v);
  check(`A. total ${lab} REFUSÉ : rien n\'est créé, un message explicite`, r.ok === false && r.cmdLines.length === 1 && r.redraw === 0 && r.toasts.length === 1);
}
{ const r = lancer([{ type: 'sachet', qte: 3 }], 0, 5); check('A. une ligne qui n\'est pas un coffret ne se duplique pas', r.ok === false && r.cmdLines.length === 1); }
{ const r = lancer([], 0, 5); check('A. ligne inexistante → refus sans plantage', r.ok === false); }
{ const r = lancer([{ type: 'coffret', taille: 4, parfums: {}, sansParfum: 0 }], 0, 5);
  check('A. un coffret NON composé (aucun parfum) est refusé : « compose d\'abord »', r.ok === false && r.cmdLines.length === 1 && /Compose/.test(r.toasts[0])); }
{ const r = lancer([{ type: 'coffret', taille: 4, parfums: {}, sansParfum: 4, spMode: 'assortiment' }], 0, 3);
  check('A. un coffret « sans parfum » composé (4 sans parfum) se duplique', r.ok === true && r.cmdLines.length === 3); }
{ const r = lancer([modele()], 0, 10); const r2 = lancer(r.cmdLines, 0, 3);
  check('A. RE-DUPLIQUER une ligne ajoute des copies sans effacer les autres (10 + 2)', r2.cmdLines.length === 12); }

// ---------- B. Replier / déplier ----------
{
  const src = fn('function repliLigne(i, etat){');
  check('B. repliLigne retrouvée', src.length > 100);
  const mk = lignes => { let redraw = 0; const f = new Function('cmdLines','drawLines', src + '\nreturn repliLigne;')(lignes, () => { redraw++; }); return { f, get redraw(){ return redraw; } }; };
  const L = [{ type: 'coffret' }, { type: 'coffret', repli: true }];
  const m = mk(L);
  m.f(0, true); check('B. replier pose repli:true', L[0].repli === true);
  m.f(1, false); check('B. déplier SUPPRIME le drapeau (pas repli:false laissé en base mémoire)', !('repli' in L[1]));
  check('B. chaque bascule redessine', m.redraw === 2);
  m.f(9, true); check('B. index inexistant sans plantage ni redessin', m.redraw === 2);
}

// ---------- C. `repli` n'est JAMAIS persisté ni relu (aller-retour) ----------
{
  const srcEdit = fn('function _lineToEdit(ln){'), srcObj = fn('function _parfumsToObj(p){');
  const toEdit = new Function(srcObj + '\n' + srcEdit + '\nreturn _lineToEdit;')();
  const e = toEdit({ type: 'coffret', taille: 4, prixUnitaireApplique: 8, prixLibre: true, repli: true, parfums: [{ nom: 'a', qte: 4 }] });
  check('C. rouvrir une ligne ne relit PAS un éventuel repli (la règle d\'ouverture décide seule)', !('repli' in e) && e.prixUnitaireApplique === 8);
  const stoSrc = stripComments(APP);
  const iSto = stoSrc.indexOf('prixLibre: (ln.prixLibre===true)||undefined');
  const bloc = stoSrc.slice(Math.max(0, iSto - 900), iSto + 700);
  check('C. le constructeur de ligne ENREGISTRÉE ne mentionne pas `repli`', iSto > 0 && !/repli/.test(bloc));
  check('C. `repli` n\'apparaît nulle part dans les écritures de base (db.orders / docs)', !/db\.(orders|docs|devis)\.(add|put|update)\([^)]*repli/.test(stoSrc));
}

// ---------- D. Carte repliée : l'essentiel, et exact ----------
{
  const src = fn('function drawCoffretRepliee(ln,i){');
  check('D. drawCoffretRepliee retrouvée', src.length > 500);
  const pu = l => (l.prixUnitaireApplique != null ? +l.prixUnitaireApplique : 0);
  const draw = new Function('esc','euro','coffretUnitPrice', src + '\nreturn drawCoffretRepliee;')(x => String(x).replace(/</g, '&lt;'), x => money2(x).toFixed(2).replace('.', ',') + ' €', pu);
  const h1 = draw({ type: 'coffret', taille: 4, parfums: { Caramel: 2, Framboise: 2 }, prixUnitaireApplique: 8 }, 3);
  check('D. complet : « ✓ complet », prix appliqué 8,00 €, parfums listés', /✓ complet/.test(h1) && /8,00 €/.test(h1) && /Caramel×2, Framboise×2/.test(h1));
  const h2 = draw({ type: 'coffret', taille: 4, parfums: { Caramel: 2 }, prixUnitaireApplique: 8 }, 0);
  check('D. incomplet : « ⚠ 2/4 » (une variation à moitié saisie ne passe pas inaperçue)', /⚠ 2\/4/.test(h2) && !/✓ complet/.test(h2));
  const h3 = draw({ type: 'coffret', taille: 4, parfums: { Caramel: 4 }, prixUnitaireApplique: null }, 0);
  check('D. prix manquant : « ⚠ prix ? » (jamais un 0,00 € muet)', /⚠ prix \?/.test(h3) && !/0,00/.test(h3));
  const h4 = draw({ type: 'coffret', taille: 4, parfums: { 'Fraise<b>': 4 }, prixUnitaireApplique: 8 }, 0);
  check('D. nom de parfum ÉCHAPPÉ (pas de HTML injecté)', !/<b>/.test(h4) && /Fraise&lt;b>/.test(h4));
  const h5 = draw({ type: 'coffret', taille: 4, parfums: { A: 2 }, sansParfum: 2, prixUnitaireApplique: 8 }, 0);
  check('D. « sans parfum » compté dans le total et affiché (2 + 2 = 4 → complet)', /✓ complet/.test(h5) && /2 sans parfum/.test(h5));
  check('D. toucher la carte la déplie ; « retirer » ne la déplie PAS (stopPropagation)', /onclick="repliLigne\(\$\{i\},false\)"/.test(src) && /event\.stopPropagation\(\);removeLine\(\$\{i\}\)/.test(src));
  check('D. la carte porte l\'index de SA ligne', /repliLigne\(5,false\)/.test(draw({ type: 'coffret', taille: 4, parfums: { A: 4 }, prixUnitaireApplique: 8 }, 5)));
}

// ---------- E. Câblage : l'écran passe bien par les nouvelles fonctions ----------
{
  const dl = fn('function drawLines(){');
  check('E. drawLines envoie une ligne coffret repliée vers la carte compacte', /ln\.type==='coffret'\) return ln\.repli \? drawCoffretRepliee\(ln,i\) : drawCoffretLine\(ln,i\)/.test(dl));
  const ecr = fn('function drawCoffretLine(ln,i){');
  check('E. la carte dépliée porte le champ « coffrets identiques » et le bouton Dupliquer', /id="dupN_\$\{i\}"/.test(ecr) && /dupliquerCoffret\(\$\{i\}, document\.getElementById\('dupN_\$\{i\}'\)\.value\)/.test(ecr));
  check('E. le champ est borné 2..CMD_DUP_MAX côté écran aussi', /min="2" max="\$\{CMD_DUP_MAX\}"/.test(ecr));
  check('E. le bouton « Replier » n\'apparaît qu\'avec 2 coffrets ou plus', /cmdLines\.filter\(x=>x\.type==='coffret'\)\.length>=2 \? `<button[^`]*repliLigne\(\$\{i\},true\)/.test(ecr));
  check('E. CMD_DUP_MAX = 50 déclarée une fois', (APP.match(/const CMD_DUP_MAX = 50;/g) || []).length === 1);
  // ouverture d'une commande : repli SEULEMENT au chargement frais, pas quand on garde les lignes en cours
  check('E. à l\'ouverture, les coffrets sont repliés par cmdReplierCoffretsSiNombreux (chargement frais)', /else \{ cmdLines = cmdReplierCoffretsSiNombreux\(orderToEditLines\(o\)\); \}/.test(APP));
  check('E. le chemin « keepLines » (retour après ajout d\'un client) ne replie rien', /if\(opts\.keepLines && Array\.isArray\(cmdLines\)\)\{ \/\* cmdLines déjà en mémoire, on le garde \*\/ \}/.test(APP));
  const src = fn('function cmdReplierCoffretsSiNombreux(lignes){');
  const rep = new Function(src + '\nreturn cmdReplierCoffretsSiNombreux;')();
  const c = () => ({ type: 'coffret' });
  check('E. 2 coffrets → aucun replié', rep([c(), c()]).every(l => !l.repli));
  check('E. 3 coffrets → tous repliés', rep([c(), c(), c()]).every(l => l.repli === true));
  const mix = rep([c(), { type: 'sachet' }, c(), c(), { type: 'evenement' }]);
  check('E. mélange : seuls les coffrets sont repliés', mix.filter(l => l.type === 'coffret').every(l => l.repli) && mix.filter(l => l.type !== 'coffret').every(l => !l.repli));
  check('E. liste vide / absente sans plantage (renvoyée telle quelle)', rep([]).length === 0 && rep(null) === null);
}

// ---------- F. Rien ne casse ailleurs : l'aller-retour d'une commande de 10 coffrets ----------
{
  const srcEdit = fn('function _lineToEdit(ln){'), srcObj = fn('function _parfumsToObj(p){');
  const toEdit = new Function(srcObj + '\n' + srcEdit + '\nreturn _lineToEdit;')();
  const stockees = Array.from({ length: 10 }, (_, k) => ({ type: 'coffret', taille: 4, parfums: [{ nom: 'Caramel', qte: 2 }, { nom: k < 7 ? 'Framboise' : 'Pistache', qte: 2 }], prixUnitaireApplique: 8, prixLibre: true }));
  const edit = stockees.map(toEdit);
  check('F. 10 lignes enregistrées → 10 lignes d\'édition, prix et composition repris', edit.length === 10 && edit.every(e => e.prixUnitaireApplique === 8 && e.taille === 4));
  check('F. la VARIATION (3 coffrets avec Pistache) survit à la réouverture', edit.filter(e => e.parfums.Pistache === 2).length === 3 && edit.filter(e => e.parfums.Framboise === 2).length === 7);
}

// ---------- G. Version ----------
check('G. APP_VERSION >= v1510 (la règle vaut pour toutes les versions suivantes)', (m => !!m && +m[1] >= 1510)(APP.match(/const APP_VERSION = 'v(\d+)';/)));

setTimeout(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}, 100);
