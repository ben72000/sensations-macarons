'use strict';
// v1512 — « PERSONNALISATION LOGO : 10 × 0 € = 0,00 € ».
// Ben : « pourquoi sur le devis, quand je clique sur personnalisation des logos et que j'indique un chiffre comme
// 10, ça met 10 × 0 € = 0,00 € ? »
//
// CAUSE (vérifiée sur le vrai code, voir A) : le calcul du logo est JUSTE. L'ancienne grille tarifaire n'a pas de
// tarif logo (`logoPaliers:null` : l'option n'existait pas) → sur une commande/un devis VERROUILLÉ sur l'ancienne
// grille, 10 logos = 10 × 0 €. Depuis v1509 la case « anciens tarifs » est CACHÉE : un document verrouillé n'offrait
// donc plus aucun moyen d'en sortir. C'est MON défaut de v1509 (je l'avais noté comme limite « les coffrets se règlent
// ligne par ligne » sans voir que le logo et le forfait création, eux, n'ont aucun prix dans l'ancienne grille).
//
// CORRECTIFS : ① un bouton explicite « Passer aux tarifs en vigueur » dans le bandeau du document verrouillé ;
// ② l'indice sous le champ logo dit POURQUOI au lieu d'afficher un zéro qui a l'air d'un prix ;
// ③ l'enregistrement refuse un logo / forfait à 0 € (une option « offerte » que personne n'a décidée).
// RIEN d'autre ne change : le verrou reste le défaut d'une commande déjà enregistrée, aucune donnée stockée n'est touchée.
// LEÇONS : un zéro silencieux est un écran qui rattrape (v1491) · retirer un contrôle exige d'inventorier ce qu'il permettait.
const { stripComments, APP } = require('./_extract');

let pass = 0, fail = 0; const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
function fn(marker){
  const i = APP.indexOf(marker); if(i < 0) return '';
  const j = APP.indexOf('\n}\n', i);
  return APP.slice(i, j < 0 ? i + 4000 : j + 3);
}
const money2 = x => Math.round((+x + Number.EPSILON) * 100) / 100;

// ---------- A. REPRODUCTION de la cause sur le VRAI code (grilles et fonctions réelles) ----------
const iG = APP.indexOf('const TARIF_GRILLES = ['), jG = APP.indexOf('\n];\n', iG) + 4;
const srcGrilles = APP.slice(iG, jG);
check('A. les grilles tarifaires sont retrouvées', srcGrilles.length > 500 && /logoPaliers/.test(srcGrilles));
const ligne = marker => { const i = APP.indexOf(marker); if(i < 0) return ''; const j = APP.indexOf('\n', i); return APP.slice(i, j); };   // fonctions écrites sur UNE ligne
const srcFns = [ligne('function grilleCourante(){'), ligne('function grilleHistorique(){'), ...['function tarifsSaisie(){','function _grilleOption(ctx){','function logoPrixUnitPour(nb, ctx){','function logoMontantPour(nb, ctx){','function forfaitCreationPour('].map(m => fn(m))].join('\n');
check('A. les 7 fonctions de tarification sont retrouvées', srcFns.length > 400 && (srcFns.match(/^function /gm) || []).length === 7);
function monde(coche){
  const doc = { getElementById: id => (id === 'f_ancienTarif' ? cb : null) };
  const cb = { checked: coche };
  const api = new Function('document','money2','grillePourCommande', srcGrilles + '\n' + srcFns + '\nreturn { logoPrixUnitPour, logoMontantPour, forfaitCreationPour, tarifsSaisie };')(doc, money2, () => { throw new Error('ctx non attendu'); });
  return { cb, api, doc };
}
{
  const verrou = monde(true), libre = monde(false);
  check('A. CAUSE : document VERROUILLÉ sur l\'ancienne grille → 10 logos = 10 × 0 € = 0,00 € (le calcul est juste, la grille n\'a pas de logo)',
    verrou.api.logoPrixUnitPour(10) === 0 && verrou.api.logoMontantPour(10) === 0);
  check('A. tarifs EN VIGUEUR → 10 logos = 10 × 1,00 € = 10,00 €', libre.api.logoPrixUnitPour(10) === 1 && libre.api.logoMontantPour(10) === 10);
  check('A. forfait création : 0 € verrouillé, 40 € en vigueur', verrou.api.forfaitCreationPour(1) === 0 && libre.api.forfaitCreationPour(1) === 40);
  check('A. paliers dégressifs intacts (150 → 0,80 €, 400 → 0,70 €)', libre.api.logoPrixUnitPour(150) === 0.8 && libre.api.logoPrixUnitPour(400) === 0.7);
}

// ---------- B. La sortie explicite : cmdPasserTarifsEnVigueur ----------
{
  const src = fn('function cmdPasserTarifsEnVigueur(){');
  check('B. cmdPasserTarifsEnVigueur retrouvée', src.length > 200);
  function lancer(coche, avecRecalc){
    const trace = []; const cb = { checked: coche };
    const doc = { getElementById: id => (id === 'f_ancienTarif' ? cb : null) };
    new Function('document','cmdTarifBandeau','cmdRecalc','toast', src + '\ncmdPasserTarifsEnVigueur();')(
      doc, () => trace.push('bandeau'), avecRecalc ? () => trace.push('recalc') : undefined, t => trace.push('toast:' + t));
    return { cb, trace };
  }
  const r = lancer(true, true);
  check('B. le bouton DÉCOCHE le verrou', r.cb.checked === false);
  check('B. puis redessine (bandeau + lignes), recalcule et prévient', r.trace[0] === 'bandeau' && r.trace[1] === 'recalc' && /^toast:Tarifs en vigueur appliqués/.test(r.trace[2]));
  check('B. sans cmdRecalc défini : pas de plantage', lancer(true, false).cb.checked === false);
  // BOUT EN BOUT sur le vrai code : verrou → logo à 0 ; geste du bouton → logo à 10 €
  const w = monde(true);
  const avant = w.api.logoMontantPour(10);
  new Function('document','cmdTarifBandeau','cmdRecalc','toast', src + '\ncmdPasserTarifsEnVigueur();')(w.doc, () => {}, () => {}, () => {});
  check('B. BOUT EN BOUT : 10 logos passent de 0,00 € à 10,00 € après « Passer aux tarifs en vigueur »', avant === 0 && w.api.logoMontantPour(10) === 10);
}

// ---------- C. Le bandeau n'apparaît que pour un document verrouillé, avec le bouton ----------
{
  const src = fn('function cmdTarifBandeau(){');
  function rendre(coche){
    const z = { innerHTML: '' }; let redessine = 0;
    new Function('document','tarifsSaisie','esc','drawLines', src + '\ncmdTarifBandeau();')(
      { getElementById: id => id === 'f_tarifBandeau' ? z : (id === 'f_ancienTarif' ? { checked: coche } : null) },
      () => ({ libelle: 'Tarifs historiques' }), x => String(x), () => { redessine++; });
    return { html: z.innerHTML, redessine };
  }
  const v = rendre(true), l = rendre(false);
  check('C. verrouillé : bandeau + bouton « Passer aux tarifs en vigueur » branché sur cmdPasserTarifsEnVigueur', /onclick="cmdPasserTarifsEnVigueur\(\)">Passer aux tarifs en vigueur<\/button>/.test(v.html));
  check('C. verrouillé : le bandeau dit que logo et forfait création y sont à 0 € (pas de surprise)', /logo<\/b> et <b>forfait création<\/b>/.test(v.html) && /à 0 €/.test(v.html));
  check('C. non verrouillé : AUCUN bandeau, aucun bouton', l.html === '');
  check('C. dans les deux cas les lignes sont redessinées', v.redessine === 1 && l.redessine === 1);
}

// ---------- D. L'indice sous le champ logo ne montre plus un zéro muet ----------
{
  const i = APP.indexOf("const _lh = document.getElementById('f_logoHint');");
  const bloc = stripComments(APP.slice(i, i + 2200));
  check('D. le bloc d\'indice est retrouvé', i > 0 && /f_logoHint/.test(APP.slice(i, i + 80)));
  check('D. logo à 0 € (pu non > 0) → message « indisponible aux anciens tarifs » au lieu de « n × 0,00 € » (condition EXACTE, pas une simple mention)', bloc.includes('if((logoNb>0 && !(pu>0)) || _forfaitBloque){') && /indisponible aux anciens tarifs de cette commande/.test(bloc));
  check('D. le message propose la sortie (« Passer aux tarifs en vigueur »)', /onclick="cmdPasserTarifsEnVigueur\(\)">Passer aux tarifs en vigueur →/.test(bloc));
  check('D. le message précède l\'ancien affichage « n × prix = total » (qui ne sert plus qu\'avec un vrai prix)', bloc.indexOf('indisponible aux anciens tarifs') < bloc.indexOf('${qty(logoNb)} ×'));
  check('D. forfait création à 0 € traité de même', /_forfaitBloque = forfaitNb>0 && !\(forfaitCreationPour\(1\)>0\)/.test(bloc));
}

// ---------- E. L'enregistrement refuse un logo / forfait à 0 € ----------
{
  const i = APP.indexOf('async function saveCmd(');
  const sv = stripComments(APP.slice(i, i + 16000));
  const iGarde = sv.indexOf("indisponibles aux anciens tarifs de cette commande");
  const iLignes = sv.indexOf('const lignes = cmdLinesToStored();');
  check('E. garde retrouvée dans saveCmd, AVANT la construction des lignes enregistrées', iGarde > 0 && iLignes > iGarde);
  const m = sv.match(/\{ const _lN = [^\n]*\n\s*if\((\(_lN>0 && !\(logoPrixUnitPour\(_lN\)>0\)\) \|\| \(_fN>0 && !\(forfaitCreationPour\(1\)>0\)\))\)/);
  check('E. condition de la garde retrouvée', !!m);
  const bloque = m ? new Function('_lN','_fN','logoPrixUnitPour','forfaitCreationPour', 'return !!(' + m[1] + ');') : () => null;
  const ver = { l: n => 0, f: n => 0 }, vig = { l: n => 1, f: n => 40 };
  check('E. 10 logos sur document verrouillé → REFUSÉ', bloque(10, 0, ver.l, ver.f) === true);
  check('E. 10 logos aux tarifs en vigueur → accepté', bloque(10, 0, vig.l, vig.f) === false);
  check('E. aucun logo ni forfait, même verrouillé → accepté (rien ne change pour les commandes sans option)', bloque(0, 0, ver.l, ver.f) === false);
  check('E. forfait création sur document verrouillé → REFUSÉ', bloque(0, 2, ver.l, ver.f) === true);
  check('E. forfait création aux tarifs en vigueur → accepté', bloque(0, 2, vig.l, vig.f) === false);
  check('E. le message dit quoi faire (« Passer aux tarifs en vigueur »)', /touche « Passer aux tarifs en vigueur »/.test(sv));
}

// ---------- F. Ce qui NE change PAS ----------
{
  check('F. le verrou par défaut d\'une commande déjà enregistrée est conservé', /\$\{\(o\.ancienTarif \|\| \(o\.id && !o\.tarifRef\)\)\?'checked':''\}/.test(APP));
  check('F. l\'élément f_ancienTarif reste caché (aucune case visible ne revient)', /<input type="checkbox" id="f_ancienTarif" hidden /.test(APP) && !/Appliquer les <b>anciens tarifs<\/b>/.test(APP));
  check('F. logoPrixUnitPour inchangé : la grille historique garde `logoPaliers:null` (aucune donnée stockée retarifée)', /logoPaliers:null, forfaitCreation:0 \}/.test(APP));
  check('F. une seule définition de cmdPasserTarifsEnVigueur', (stripComments(APP).match(/function cmdPasserTarifsEnVigueur\(/g) || []).length === 1);
}

// ---------- G. Version ----------
check('G. APP_VERSION >= v1512', (m => !!m && +m[1] >= 1512)(APP.match(/const APP_VERSION = 'v(\d+)';/)));

setTimeout(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}, 100);
