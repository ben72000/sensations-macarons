'use strict';
// v1511 — COFFRETS IDENTIQUES RÉSUMÉS SUR LES DEVIS ET FACTURES.
// Ben : « sur un devis ou une facture, les 10 coffrets résumés en UNE ligne si les parfums sont tous pareils :
//   10 coffrets de 4 macarons composés de 2 chocolat et 2 vanille.
// S'il y a une différence, elles sont détaillées :
//   10 coffrets de 4 macarons
//   9 coffrets composés de 2 chocolat et 2 vanille
//   1 coffret composé de 3 framboise et 1 citron »
//
// PRÉSENTATION SEULE (jamais de données) : les lignes enregistrées — une par coffret — et leurs montants ne
// changent pas ; le total d'un groupe est la SOMME EXACTE de ses lignes (le client additionne et retrouve le total).
// DÉCISIONS : une famille = même format + même montant (brut ET net) + même remise de ligne : on ne fond jamais
// deux prix différents dans un total. Une famille se résume à partir de 2 coffrets ET si une composition s'y répète ;
// 10 coffrets tous différents restent détaillés ligne à ligne, comme avant.
// LEÇONS : écran juste ≠ calcul juste (le montant affiché est vérifié, pas seulement le texte) · un SEUL point
// d'entrée pour les 4 rendus (garde par pattern) · chaque garde prouvée par réintroduction du défaut.
const { stripComments, APP } = require('./_extract');

let pass = 0, fail = 0; const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
function fn(marker){
  const i = APP.indexOf(marker); if(i < 0) return '';
  const j = APP.indexOf('\n}\n', i);
  return APP.slice(i, j < 0 ? i + 4000 : j + 3);
}
const money2 = x => Math.round((+x + Number.EPSILON) * 100) / 100;
const euro = x => money2(x).toFixed(2).replace('.', ',') + ' €';
const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- Chargement des VRAIES fonctions dans un bac à sable ----------
const noms = ['factRemiseSubHtml','factListeFr','factCoffretFamille','factCoffretCompoCle','factCoffretCompoPhrase','factGrouperCoffrets','factGroupeCoffretRows','factRowsHtml'];
const sources = noms.map(n => fn('function ' + n + '('));
check('0. les 8 fonctions sont retrouvées dans app.js', sources.every(s => s.length > 60));
// Totaux de ligne : modèle simple et INDÉPENDANT (prix de ligne, supplément de parfums, remise de ligne en %).
const brutDe = l => money2(+l.pu + (+l.sup || 0));
const netDe = l => money2(brutDe(l) * (1 - (+l.remisePct || 0) / 100));
function monter(){
  const appels = [];
  const factLineRows = (ln, brut) => { appels.push(ln); return `<tr data-single="${esc(ln.id)}"><td>${esc(ln.type)} ${brut ? 'brut' : 'net'}</td></tr>`; };
  const f = new Function('esc','euro','money2','lineTotalBrut','lineTotalStored','lineRemiseEuro','factLineRows',
    sources.join('\n') + '\nreturn { factRowsHtml, factGrouperCoffrets, factGroupeCoffretRows, factCoffretCompoPhrase, factRemiseSubHtml, factListeFr };')(
    esc, euro, money2, brutDe, netDe, l => money2(brutDe(l) - netDe(l)), factLineRows);
  return Object.assign(f, { appels });
}
const P = (nom, qte) => ({ nom, qte });
const coffret = (id, parfums, extra) => Object.assign({ id, type: 'coffret', taille: 4, pu: 8, parfums }, extra || {});
const choVan = id => coffret(id, [P('Chocolat', 2), P('Vanille', 2)]);
const framCit = id => coffret(id, [P('Framboise', 3), P('Citron', 1)]);
const nbTr = h => (h.match(/<tr[ >]/g) || []).length;
const sansBalises = h => h.replace(/<[^>]+>/g, ' | ').replace(/\s+/g, ' ');

// ---------- A. Tous identiques → UNE ligne (exemple 1 de Ben) ----------
{
  const M = monter();
  const h = M.factRowsHtml(Array.from({ length: 10 }, (_, k) => choVan(k)), false);
  check('A. 10 coffrets identiques → UNE seule ligne de tableau', nbTr(h) === 1);
  check('A. libellé « 10 coffrets de 4 macarons »', /<span class="ln-main">10 coffrets de 4 macarons<\/span>/.test(h));
  check('A. composition « composés de 2 Chocolat et 2 Vanille »', /<span class="ln-sub">composés de 2 Chocolat et 2 Vanille<\/span>/.test(h));
  check('A. MONTANT = somme des 10 lignes (10 × 8 € = 80,00 €)', /<td class="mt">80,00 €<\/td>/.test(h));
  check('A. aucune ligne individuelle n\'est passée par le rendu simple', M.appels.length === 0);
}

// ---------- B. Une différence → détail (exemple 2 de Ben) ----------
{
  const M = monter();
  const L = [...Array.from({ length: 9 }, (_, k) => choVan(k)), framCit(9)];
  const h = M.factRowsHtml(L, false);
  check('B. 9 + 1 variante → toujours UNE ligne de tableau (en-tête + détails)', nbTr(h) === 1);
  check('B. en-tête « 10 coffrets de 4 macarons »', /<span class="ln-main">10 coffrets de 4 macarons<\/span>/.test(h));
  const subs = [...h.matchAll(/<span class="ln-sub">([^<]*)<\/span>/g)].map(m => m[1]);
  check('B. détail n°1 : « 9 coffrets composés de 2 Chocolat et 2 Vanille »', subs[0] === '9 coffrets composés de 2 Chocolat et 2 Vanille');
  check('B. détail n°2 : « 1 coffret composé de 3 Framboise et 1 Citron » (singulier)', subs[1] === '1 coffret composé de 3 Framboise et 1 Citron');
  check('B. exactement deux détails', subs.length === 2);
  check('B. MONTANT = somme exacte des 10 lignes (80,00 €)', /<td class="mt">80,00 €<\/td>/.test(h));
  // La variante saisie EN PREMIER : le détail le plus fréquent passe quand même en tête
  const h2 = monter().factRowsHtml([framCit(0), ...Array.from({ length: 9 }, (_, k) => choVan(k + 1))], false);
  const subs2 = [...h2.matchAll(/<span class="ln-sub">([^<]*)<\/span>/g)].map(m => m[1]);
  check('B. la composition la plus fréquente est listée en premier, même saisie en dernier', subs2[0].startsWith('9 coffrets') && subs2[1].startsWith('1 coffret'));
  // 2 compositions répétées + 1 isolée
  const h3 = monter().factRowsHtml([choVan(0), choVan(1), choVan(2), framCit(3), framCit(4), coffret(5, [P('Pistache', 4)])], false);
  const subs3 = [...h3.matchAll(/<span class="ln-sub">([^<]*)<\/span>/g)].map(m => m[1]);
  check('B. 3 compositions : 3 / 2 / 1 dans l\'ordre décroissant', subs3.length === 3 && subs3[0].startsWith('3 coffrets') && subs3[1].startsWith('2 coffrets') && subs3[2].startsWith('1 coffret composé de 4 Pistache'));
}

// ---------- C. Garde-fou : on ne résume que s'il y a de la répétition ----------
{
  const M = monter();
  const L = [coffret(0, [P('A', 4)]), coffret(1, [P('B', 4)]), coffret(2, [P('C', 4)]), coffret(3, [P('D', 4)])];
  const h = M.factRowsHtml(L, false);
  check('C. 4 coffrets TOUS différents → détaillés ligne à ligne comme avant (aucun regroupement)', nbTr(h) === 4 && M.appels.length === 4 && !/coffrets de 4 macarons/.test(h));
  const M2 = monter();
  const h2 = M2.factRowsHtml([choVan(0)], false);
  check('C. un coffret seul → rendu inchangé', nbTr(h2) === 1 && M2.appels.length === 1);
}

// ---------- D. Famille = même format ET même montant ET même remise ----------
{
  const M = monter();
  const L = [...Array.from({ length: 9 }, (_, k) => choVan(k)), Object.assign(choVan(9), { pu: 10 })];
  const h = M.factRowsHtml(L, false);
  check('D. 9 à 8 € + 1 à 10 € (même composition) → DEUX familles : on ne fond pas deux prix', nbTr(h) === 2);
  check('D. le groupe de 9 totalise 72,00 €', /<td class="mt">72,00 €<\/td>/.test(h) && /9 coffrets de 4 macarons/.test(h));
  check('D. le coffret à 10 € reste une ligne simple (rendu d\'origine)', M.appels.length === 1 && M.appels[0].pu === 10);
  const h2 = monter().factRowsHtml([...Array.from({ length: 3 }, (_, k) => choVan(k)), ...Array.from({ length: 2 }, (_, k) => Object.assign(choVan(k + 3), { taille: 6, pu: 14 }))], false);
  check('D. formats différents (4 et 6 macarons) → deux groupes séparés', nbTr(h2) === 2 && /3 coffrets de 4 macarons/.test(h2) && /2 coffrets de 6 macarons/.test(h2));
  const h3 = monter().factRowsHtml([choVan(0), choVan(1), Object.assign(choVan(2), { remisePct: 10 }), Object.assign(choVan(3), { remisePct: 10 })], false);
  check('D. remises de ligne différentes (0 % / 10 %) → deux familles', nbTr(h3.replace(/<tr class="ln-remise">/g, '<tx>')) === 2);
  const h4 = monter().factRowsHtml([Object.assign(choVan(0), { sup: 3 }), Object.assign(choVan(1), { sup: 3 }), choVan(2), choVan(3)], false);
  check('D. un supplément de parfums différent change le montant → deux familles (8 € et 11 €)', /<td class="mt">16,00 €<\/td>/.test(h4) && /<td class="mt">22,00 €<\/td>/.test(h4));
}

// ---------- E. Remises : mêmes règles que la ligne simple (net : brut + sous-ligne ; brut : rien) ----------
{
  const L = Array.from({ length: 4 }, (_, k) => choVan(k)).map(l => Object.assign(l, { remisePct: 10 }));   // 8 € - 10 % = 7,20 €
  const net = monter().factRowsHtml(L, false), brut = monter().factRowsHtml(L, true);
  check('E. MODE NET : ligne principale au BRUT (4 × 8 = 32,00 €) + sous-ligne « remise de ligne −3,20 € »', /<td class="mt">32,00 €<\/td>/.test(net) && /remise de ligne −3,20 €/.test(net) && /<tr class="ln-remise">/.test(net));
  check('E. MODE NET : brut − remise = net exact (32,00 − 3,20 = 28,80 €)', money2(32 - 3.2) === 28.8 && money2(L.reduce((a, l) => a + netDe(l), 0)) === 28.8);
  check('E. MODE BRUT (devis groupé / facture) : AUCUNE sous-ligne, montant brut 32,00 €', !/ln-remise/.test(brut) && /<td class="mt">32,00 €<\/td>/.test(brut));
  const sans = monter().factRowsHtml(Array.from({ length: 3 }, (_, k) => choVan(k)), false);
  check('E. sans remise : aucune sous-ligne', !/ln-remise/.test(sans));
}

// ---------- F. Ordre du document, autres types, composition ----------
{
  const M = monter();
  const sachet = { id: 's1', type: 'sachet', pu: 5 };
  const h = M.factRowsHtml([sachet, choVan(0), { id: 'e1', type: 'evenement', pu: 100 }, choVan(1), choVan(2)], false);
  const i1 = h.indexOf('data-single="s1"'), iG = h.indexOf('3 coffrets de 4 macarons'), i2 = h.indexOf('data-single="e1"');
  check('F. ordre du document conservé : sachet, GROUPE (à la place de son 1er coffret), événement', i1 >= 0 && iG > i1 && i2 > iG);
  check('F. les lignes d\'autres types passent par le rendu d\'origine, dans l\'ordre', M.appels.map(a => a.id).join() === 's1,e1');
  check('F. le groupe est écrit UNE fois (pas une fois par coffret)', (h.match(/3 coffrets de 4 macarons/g) || []).length === 1);
  const A = coffret(0, [P('Chocolat', 2), P('Vanille', 2)]), B = coffret(1, [P('vanille ', 2), P('CHOCOLAT', 2)]);
  const hm = monter().factRowsHtml([A, B], false);
  check('F. même composition malgré l\'ordre, la casse et les espaces → résumés', nbTr(hm) === 1 && /2 coffrets de 4 macarons/.test(hm) && /composés de 2 Chocolat et 2 Vanille/.test(hm));
  const hn = monter().factRowsHtml([coffret(0, [P('Chocolat', 1), P('Vanille', 1), P('Chocolat', 1), P('Citron', 2)]), coffret(1, [P('Citron', 2), P('Chocolat', 2), P('Vanille', 1)])], false);
  check('F. un parfum saisi deux fois est additionné (2 Chocolat) avant comparaison', /composés de 2 Chocolat, 1 Vanille et 2 Citron/.test(hn) && nbTr(hn) === 1);
  const Mx = monter();
  check('F. liste vide / absente → chaîne vide sans plantage', Mx.factRowsHtml([], false) === '' && Mx.factRowsHtml(null, true) === '');
  check('F. phrase : 1 parfum, 2 parfums, 3 parfums', Mx.factCoffretCompoPhrase(coffret(0, [P('Pistache', 4)])) === '4 Pistache' && Mx.factCoffretCompoPhrase(choVan(0)) === '2 Chocolat et 2 Vanille' && Mx.factCoffretCompoPhrase(coffret(0, [P('A', 2), P('B', 1), P('C', 1)])) === '2 A, 1 B et 1 C');
  const hx = monter().factRowsHtml([coffret(0, [P('Fraise<b>', 4)]), coffret(1, [P('Fraise<b>', 4)])], false);
  check('F. nom de parfum ÉCHAPPÉ (aucun HTML injecté)', !/<b>/.test(hx) && /Fraise&lt;b&gt;/.test(hx));
  const hv = monter().factRowsHtml([coffret(0, []), coffret(1, [])], false);
  check('F. coffrets sans composition : résumé « 2 coffrets de 4 macarons » sans phrase vide', /2 coffrets de 4 macarons/.test(hv) && !/composés de\s*</.test(hv) && !/ln-sub/.test(hv));
  const hd = monter().factRowsHtml([coffret(0, []), coffret(1, []), choVan(2)], false);
  check('F. composition vide parmi d\'autres : « (composition non détaillée) » plutôt qu\'une ligne trompeuse', /2 coffrets \(composition non détaillée\)/.test(hd) && /1 coffret composé de 2 Chocolat et 2 Vanille/.test(hd));
}

// ---------- G. « Sans parfum » : mention comparée et affichée ----------
{
  const sp = (id, nb, mode, n) => coffret(id, [P('Chocolat', 2)], { sansParfum: nb, spMode: mode, spNbParfums: n });
  const M = monter();
  const h = M.factRowsHtml([sp(0, 2, 'assortiment', 3), sp(1, 2, 'assortiment', 3)], false);
  check('G. 2 coffrets « 2 Chocolat + 2 en assortiment de 3 parfums » → résumés avec la mention', nbTr(h) === 1 && /composés de 2 Chocolat et 2 en assortiment de 3 parfums/.test(h));
  const h2 = monter().factRowsHtml([sp(0, 2, 'assortiment', 3), sp(1, 2, 'assortiment', 3), sp(2, 2, 'assortiment', 2)], false);
  check('G. assortiment de 3 parfums ≠ de 2 parfums → deux compositions détaillées', /2 coffrets composés de 2 Chocolat et 2 en assortiment de 3 parfums/.test(h2) && /1 coffret composé de 2 Chocolat et 2 en assortiment de 2 parfums/.test(h2));
  const h3 = monter().factRowsHtml([sp(0, 2, 'adeterminer', 0), sp(1, 2, 'adeterminer', 0)], false);
  check('G. « parfum(s) à déterminer » conservé', /2 parfum\(s\) à déterminer/.test(h3));
  const h4 = monter().factRowsHtml([sp(0, 2, 'assortiment', 1), sp(1, 2, 'assortiment', 1)], false);
  check('G. un seul parfum au choix : « 2 en 1 parfum »', /2 en 1 parfum/.test(h4));
}

// ---------- H. Sous-ligne de remise : balisage inchangé (oracle indépendant) ----------
{
  const M = monter();
  const attendu = '<tr class="ln-remise"><td class="desc"><span class="ln-sub" style="color:#3f7d52">remise de ligne \u22125,00 €</span></td><td class="mt" style="color:#3f7d52">\u22125,00 €</td></tr>';
  check('H. factRemiseSubHtml(5) = balisage d\'origine, au caractère près', M.factRemiseSubHtml(5) === attendu);
  check('H. factRemiseSubHtml(0) = chaîne vide', M.factRemiseSubHtml(0) === '');
  const lr = fn('function factLineRows(ln, brut){');
  check('H. factLineRows utilise le helper (un seul gabarit)', /const remiseSub = factRemiseSubHtml\(_remLn\);/.test(lr));
}

// ---------- I. GARDE PAR PATTERN : un seul point d'entrée pour les 4 rendus ----------
{
  const src = stripComments(APP);
  check('I. plus aucun `lignes.map(ln=>factLineRows(…))` : tous passent par factRowsHtml', !/lignes\.map\(ln=>factLineRows\(/.test(src));
  const sites = (src.match(/factRowsHtml\(lignes, (false|true)\)/g) || []);
  check('I. les 4 rendus (devis, devis groupé net, devis groupé brut, facture) appellent factRowsHtml : ' + sites.length, sites.length === 4);
  check('I. devis (net) · devis groupé (net) · devis groupé (brut) · facture (brut)', sites.filter(s => /false/.test(s)).length === 2 && sites.filter(s => /true/.test(s)).length === 2);
  check('I. la somme des lignes enregistrées n\'est PAS modifiée : les totaux restent calculés sur `lignes`', /lignes\.reduce\(\(s,ln\)=>s\+lineTotalStored\(ln\),0\)/.test(src));
}

// ---------- J. Version ----------
check('J. APP_VERSION >= v1511', (m => !!m && +m[1] >= 1511)(APP.match(/const APP_VERSION = 'v(\d+)';/)));

setTimeout(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}, 100);
