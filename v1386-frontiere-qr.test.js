/* ============================================================
   TESTS — v1386 · CHANTIER D : DURCIR LA FRONTIÈRE QR
   ------------------------------------------------------------
   CE QUE CETTE SUITE INTERDIT DE RÉINTRODUIRE.

   L'audit de juillet 2026, faille 4. L'app a quatre frontières — la
   saisie clavier (gardée v1373), le fichier de sauvegarde (gardé v1384),
   le réseau R&D, et LE QR CODE, qui n'avait AUCUN contrôle. C'est
   pourtant la seule que Ben franchit les mains pleines, en atelier,
   sans regarder l'écran.

   QUATRE FAITS VÉRIFIÉS SUR LE CODE LIVRÉ :

   1) _extractLot() JETAIT sur un QR abîmé — decodeURIComponent('%E0%A4%A')
      lève URIError. Étiquette froissée, mouillée, à moitié décollée.

   2) Dans scanLoop(), ce jet était avalé par le catch « frame non
      décodée, on continue » : le scanner repartait EN BOUCLE, SANS RIEN
      DIRE. Ben visait, visait encore, croyant que la caméra ne voyait
      pas le code — alors que l'app l'avait lu, avait planté, et avait
      jeté l'erreur en silence. Le motif du chantier A, sur la frontière
      la moins surveillée.

   3) Dans onScan() (h5-qrcode), AUCUN try : le jet remontait dans une
      callback de librairie tierce, scanner ouvert et figé.

   4) La recherche compare par INCLUSION : un QR ne contenant qu'un tiret
      correspondait à TOUS les lots. Sur un écran « Quel lot ? », c'est
      une invitation à décrémenter le mauvais stock — et en traçabilité
      alimentaire, se tromper de lot n'est pas une erreur d'affichage.

   LA RÈGLE FIGÉE, que ces tests protègent :
   un code venu de l'extérieur n'est jamais une donnée tant qu'il n'a pas
   passé une porte qui peut dire NON — et le refus doit se VOIR.
   ============================================================ */
'use strict';
const { APP, stripComments, extractFunction } = require('./_extract');

let nOk = 0, nKo = 0;
function ok(cond, label){
  if(cond){ nOk++; console.log('  ✓ ' + label); }
  else { nKo++; console.log('  ✗ ' + label); }
}

function extraitConst(nom){
  const re = new RegExp('^const ' + nom + '\\s*=\\s*[^\\n]*$', 'm');
  const m = APP.match(re);
  if(!m) throw new Error('Constante introuvable : ' + nom);
  return m[0];
}

// Monte la porte QR avec ses VRAIES constantes, extraites du fichier livré.
// Pas de recopie des bornes dans le test : une borne recopiée diverge du code
// à la version suivante, et la garde jugerait alors une règle qui n'existe plus.
function montePorte(){
  const src = [
    'function toast(){} function swallow(){}',
    extraitConst('QR_CARACTERES_OK'),
    extraitConst('QR_LONGUEUR_MAX'),
    extraitConst('QR_LONGUEUR_MIN_RECHERCHE'),
    extractFunction('_qrLire'),
    extractFunction('_qrLireRecherche'),
    extractFunction('_extractLot')
  ].join('\n');
  return new Function(src +
    '\n; return { _qrLire, _qrLireRecherche, _extractLot,' +
    ' MAX:QR_LONGUEUR_MAX, MIN:QR_LONGUEUR_MIN_RECHERCHE };')();
}

const P = montePorte();

(async () => {
console.log('\n=== TESTS — v1386 · Chantier D : durcir la frontière QR ===\n');

// ---------------------------------------------------------------------------
// 0. LE HARNAIS PROUVE QU'IL VOIT QUELQUE CHOSE
// ---------------------------------------------------------------------------
console.log('0. Le harnais lui-même');
{
  ok(P.MAX > 0 && P.MIN > 0, `les vraies bornes sont chargées (max ${P.MAX}, min recherche ${P.MIN})`);
  ok(P._qrLire('NM-A-101').ok === true, 'un lot valide passe (la porte n\'est pas fermée à tout)');
  ok(P._qrLire('..;DROP').ok === false, 'un code fautif est refusé (la porte n\'est pas ouverte à tout)');
}

// ---------------------------------------------------------------------------
// 1. LA FAILLE ELLE-MÊME : l'étiquette abîmée ne fait plus jeter
// ---------------------------------------------------------------------------
console.log('\n1. Le cas de la faille : l\'encodage invalide');
{
  let jete = false, v = null;
  try{ v = P._qrLire('#trace=%E0%A4%A'); }catch(e){ jete = true; }
  ok(!jete, 'un QR à l\'encodage invalide ne fait PLUS jeter la porte');
  ok(v && v.ok === false, 'il est refusé explicitement');
  ok(v && /abîmée|illisible/i.test(v.motif), 'le motif parle d\'une étiquette abîmée, en français');
  ok(v && /à la main|manuel/i.test(v.motif), 'et propose la saisie manuelle — Ben n\'est pas laissé sans issue');
  ok(v && v.lot === '', 'aucun lot n\'est rendu : rien ne file en aval');
  // le vrai jet d'origine, pour mémoire
  let originJete = false;
  try{ decodeURIComponent('%E0%A4%A'); }catch(e){ originJete = true; }
  ok(originJete, 'preuve que decodeURIComponent jette bien sur cette entrée (la faille était réelle)');
}

// ---------------------------------------------------------------------------
// 2. _extractLot NE JETTE PLUS — quoi qu'on lui donne
//    Cinq appelants héritaient du jet sans le savoir. On a fermé le trou à la
//    source plutôt que de patcher cinq sites (le sixième, écrit plus tard,
//    serait retombé dedans).
// ---------------------------------------------------------------------------
console.log('\n2. _extractLot ne jette plus jamais');
{
  const entrees = ['#trace=%E0%A4%A', '#trace=%%', '', null, undefined, 42, {}, [],
                   'X'.repeat(500000), '#trace=', '\u0000', '#trace=%'];
  let jete = false, quoi = '';
  for(const e of entrees){
    try{ P._extractLot(e); }catch(err){ jete = true; quoi = String(e).slice(0,20); }
  }
  ok(!jete, `aucune des ${entrees.length} entrées dégénérées ne fait jeter _extractLot${quoi?' (échec sur '+quoi+')':''}`);
  ok(P._extractLot('#trace=%E0%A4%A') === '', 'un code refusé rend la chaîne vide (traité comme « rien trouvé »)');
  ok(P._extractLot('NM-A-101') === 'NM-A-101', 'un lot nu passe intact');
  ok(P._extractLot('#trace=NM-A-101') === 'NM-A-101', 'une URL de traçabilité rend bien le lot');
  ok(P._extractLot('#trace=NM%2DA%2D101') === 'NM-A-101', 'un lot percent-encodé est décodé correctement');
}

// ---------------------------------------------------------------------------
// 3. LES BORNES — longueur et jeu de caractères
// ---------------------------------------------------------------------------
console.log('\n3. Les bornes de la porte');
{
  ok(P._qrLire('X'.repeat(P.MAX)).ok === true, `un code à la borne exacte (${P.MAX}) passe`);
  ok(P._qrLire('X'.repeat(P.MAX + 1)).ok === false, 'un caractère de trop est refusé');
  ok(/trop long/i.test(P._qrLire('X'.repeat(P.MAX + 1)).motif), 'et le motif dit pourquoi');
  const enorme = P._qrLire('X'.repeat(500000));
  ok(enorme.ok === false, 'un code énorme est refusé');
  ok(/trop long/i.test(enorme.motif), 'sans être décodé d\'abord (borne appliquée en amont)');
  ok(P._qrLire('NM-A-101').ok && P._qrLire('NM_A.101 B').ok,
     'le jeu de caractères réel des étiquettes est accepté (lettres, chiffres, - _ . espace)');
  ok(P._qrLire('NM<script>').ok === false, 'des caractères impossibles dans un lot sont refusés');
  ok(P._qrLire('NM\u0000A').ok === false, 'un octet nul est refusé');
  ok(P._qrLire('NM/../../etc').ok === false, 'une tentative de chemin est refusée');
  ok(P._qrLire('   ').ok === false, 'des espaces seuls ne sont pas un code');
  ok(P._qrLire(null).ok === false && P._qrLire(undefined).ok === false, 'null/undefined refusés proprement');
  ok(P._qrLire(42).ok === false, 'un non-texte est refusé sans planter');
}

// ---------------------------------------------------------------------------
// 4. LA RECHERCHE PAR INCLUSION — le défaut qui fait décrémenter le mauvais lot
// ---------------------------------------------------------------------------
console.log('\n4. Un code trop court ne peut plus tout ramener');
{
  // Reproduction du comportement réel : full.includes(target)
  const lots = ['NM-A-101','NM-A-102','CH-B-205','VA-C-330'];
  const norm = s => String(s||'').toLowerCase();
  const combien = q => lots.filter(l => norm(l) === norm(q) || norm(l).includes(norm(q))).length;

  ok(combien('-') === 4, 'PREUVE du défaut : « - » correspondait bien à TOUS les lots');
  ok(P._qrLireRecherche('-').ok === false, 'la porte de recherche refuse un code d\'un caractère');
  ok(/trop court/i.test(P._qrLireRecherche('-').motif), 'et explique que ça ramènerait presque tout');
  ok(P._qrLireRecherche('a').ok === false, 'une lettre seule est refusée aussi');
  ok(P._qrLireRecherche('').ok === false, 'un code vide est refusé');
  ok(P._qrLireRecherche('NM-A-101').ok === true, 'un vrai numéro de lot passe');
  ok(P._qrLireRecherche('NM').ok === true, 'un préfixe de 2 caractères reste autorisé (recherche légitime)');
  ok(P._qrLireRecherche('#trace=%E0%A4%A').ok === false, 'la recherche hérite aussi du contrôle d\'encodage');
}

// ---------------------------------------------------------------------------
// 5. CE QU'ON REFUSE DE FAIRE — on ne devine jamais
//    Même règle qu'au chantier B : proposer le mauvais lot avec assurance est
//    pire que dire « je ne trouve pas ».
// ---------------------------------------------------------------------------
console.log('\n5. Aucun lot n\'est deviné');
{
  const v = P._qrLire('NM-A-1O1');           // O majuscule au lieu du zéro
  ok(v.ok === true, 'un code bien formé mais inconnu est ACCEPTÉ par la porte');
  ok(v.lot === 'NM-A-1O1', 'et rendu TEL QUEL — jamais corrigé en « NM-A-101 »');
  ok(P._qrLire('  NM-A-101  ').lot === 'NM-A-101', 'seuls les espaces de bordure sont retirés');
  ok(P._qrLire('nm-a-101').lot === 'nm-a-101', 'la casse n\'est pas modifiée (la comparaison s\'en charge en aval)');
}

// ---------------------------------------------------------------------------
// 6. LE CÂBLAGE RÉEL — les trois entrées et les deux recherches
//    Une protection non appelée est une protection absente (règle v1383).
// ---------------------------------------------------------------------------
console.log('\n6. La porte est réellement branchée');
{
  const scanLoop = extractFunction('scanLoop');

  const h5       = extractFunction('_openScannerH5');
  const trace    = extractFunction('traceLotByNumber');
  const affect   = extractFunction('scanAffectResolve');

  ok(/_qrLire\(/.test(scanLoop), 'la caméra native (scanLoop) passe par la porte');
  ok(/_qrRefus/.test(scanLoop), 'et un refus y est SIGNALÉ au lieu de reboucler en silence');
  ok(/_qrLire\(/.test(h5) && /_qrRefus/.test(h5), 'le moteur h5-qrcode aussi');
  // [NOTE D'EXTRACTION] openScanner contient un littéral gabarit avec des apostrophes
  // françaises (« l'étiquette ») qui déraille le comptage d'accolades de l'extracteur :
  // extractFunction n'en rend que les 646 premiers caractères. Juger cette extraction
  // tronquée ferait échouer un câblage pourtant BIEN présent. On vise donc la ligne
  // réelle du bouton de saisie manuelle dans la source complète.
  const boutonManuel = APP.match(/scanManual'\)\.value[^\n]*/);
  ok(!!boutonManuel && /_qrLire\(/.test(boutonManuel[0]),
     'la saisie manuelle passe par la porte');
  ok(!!boutonManuel && /_qrRefus\(/.test(boutonManuel[0]),
     'et un code saisi refusé est signalé, pas avalé');
  ok(/_qrLireRecherche/.test(trace), 'traceLotByNumber utilise la porte STRICTE (inclusion)');
  ok(/_qrLireRecherche/.test(affect), 'scanAffectResolve aussi');

  // le catch qui avalait tout ne doit plus recevoir le jet
  ok(!/const lot=_extractLot\(val\);/.test(scanLoop),
     'scanLoop n\'appelle plus _extractLot directement dans le try qui avale');

  // aucun appelant ne doit plus dépendre d'un _extractLot qui jette
  const nu = stripComments(APP);
  ok(/function _extractLot\(val\)\{ const v=_qrLire\(val\)/.test(nu),
     '_extractLot délègue à la porte (le trou est fermé à la SOURCE, pas site par site)');
  ok(!/function _extractLot[^\n]*decodeURIComponent/.test(nu),
     '_extractLot n\'appelle plus decodeURIComponent en direct');
}

// ---------------------------------------------------------------------------
// 7. LE REFUS SE VOIT — la leçon du chantier A appliquée ici
// ---------------------------------------------------------------------------
console.log('\n7. Un refus ne peut pas être silencieux');
{
  const refus = extractFunction('_qrRefus');
  ok(/toast\(/.test(refus), 'un refus affiche un message à l\'écran');
  ok(/swallow\(/.test(refus), 'et laisse une trace dans le journal des incidents (chantier A)');
  ok(/'qr /.test(refus) || /"qr /.test(refus), 'tracé sous un contexte « qr » repérable dans l\'écran Santé');
  // tous les motifs sont des phrases lisibles, pas des codes
  const motifs = ['#trace=%E0%A4%A', 'X'.repeat(500000), 'NM<script>', '', null, 42]
    .map(x => P._qrLire(x).motif);
  ok(motifs.every(m => typeof m === 'string' && m.length > 8),
     'chaque refus porte une phrase explicative, jamais un code muet');
  ok(motifs.every(m => !/undefined|NaN|\[object/.test(m)),
     'aucun motif ne laisse fuir un artefact technique');
}

// ---------------------------------------------------------------------------
// 8. INTÉGRITÉ DE L'EXISTANT — D ne casse ni A, ni B, ni C
// ---------------------------------------------------------------------------
console.log('\n8. L\'existant est intact');
{
  ok(/version\(33\)/.test(APP), 'le schéma v33 (chantier A) est intact');
  ok(/valideDumpAvantImport/.test(APP), 'le contrôle d\'import (chantier B) est intact');
  ok(/sortieEtat/.test(APP), 'l\'état de sortie honnête (chantier C) est intact');
  ok(/errLog/.test(APP), 'la table errLog du chantier A est toujours là');
  ok(/_extractLot/.test(APP), '_extractLot existe toujours : les appelants ne sont pas cassés');
}

console.log(`\n--- Résultat : ${nOk} assertion(s) vraie(s), ${nKo} échec(s) ---\n`);
process.exit(nKo ? 1 : 0);
})();
