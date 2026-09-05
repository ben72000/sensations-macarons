'use strict';
// v1494 — DÉCOCHER LA CASE NE RETARIFAIT PAS LES LIGNES DÉJÀ PRÉSENTES. Ben, sur une commande
// réenregistrée : « j'avais coché appliquer ancien tarif. J'ai enregistré mon document puis
// rouvert. Puis constatant le défaut de personnalisation à 0€ j'ai décoché la case. Le calcul
// s'est donc fait correctement à partir de là. En revanche le fait de décocher la case n'a pas
// dynamiquement modifié le tarif des macarons préenregistrés ni modifié le menu déroulant
// indiquant le tarif des macarons par format de coffret ».
//
// 🚨 DEUX DÉFAUTS DISTINCTS, TROUVÉS EN LISANT LE CODE (pas seulement en le supposant) :
//
// ① `coffretUnitPrice(ln)` et `tarifsLigneSaisie(ln)` lisaient `ln.tarifRef`/`ln.ancienTarif`
//    AVANT de consulter la case. Or une ligne ROUVERTE porte encore le marqueur de son DERNIER
//    enregistrement (`_lineToEdit` le recopie tel quel, par construction — voir v1463 section H,
//    « le drapeau survit à la réouverture »). Ces deux fonctions n'étant appelées QUE pendant la
//    SAISIE (jamais pour relire un document déjà émis, qui lit son prixUnitaireApplique scellé
//    directement via lineTotalStored, sans passer par elles), les lire ici revenait à traiter une
//    ligne activement éditée comme si elle était déjà figée — exactement le symptôme de Ben, à la
//    fois sur le prix affiché ET sur le menu déroulant des tailles (qui appelle coffretUnitPrice
//    avec le tarifRef/ancienTarif DE LA LIGNE).
//
// ② `cmdLinesToStored()` posait `const ancienTarif = _ancien || !!ln.ancienTarif;` — un OU avec
//    la valeur précédente. Une ligne marquée « ancien tarif » une fois restait donc marquée POUR
//    TOUJOURS, même en décochant la case et en ré-enregistrant. Ça contredisait la règle posée en
//    v1466 : « la case décide, décochée → tarifs en vigueur », qui ne prévoyait aucune exception.
//
// FIX : les deux fonctions ne consultent plus AUCUN marqueur de ligne — seule `tarifsSaisie()`
// (la case) décide pendant toute la saisie. Le figeage (tarifRef, ancienTarif, prixUnitaireApplique)
// n'intervient plus qu'au moment RÉEL de l'enregistrement, et reflète alors la case telle qu'elle
// est À CET INSTANT, sans mémoire d'un choix antérieur.
const { extractFunction, extractConstLine } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

function extractArrayConstMulti(name){
  const { APP } = require('./_extract');
  const start = APP.indexOf('const ' + name + ' = [');
  let depth = 0, i = start, end = -1;
  for(; i < APP.length; i++){
    if(APP[i] === '[') depth++;
    else if(APP[i] === ']'){ depth--; if(depth === 0){ end = i + 1; break; } }
  }
  return APP.slice(start, end) + ';';
}

// Deux grilles réalistes (mêmes valeurs que la vraie TARIF_GRILLES pour un coffret de 6/25).
const NEUF = '2026-09-15';

// ---- A. LE CAS EXACT DE BEN : coffret ROUVERT, marqué « ancien tarif », case DÉCOCHÉE ----
// La ligne porte tarifRef + ancienTarif:true (recopiés par _lineToEdit à la réouverture) ET un
// prixUnitaireApplique scellé à l'ancien prix (12 €) — les DEUX sources de gel possibles réunies
// dans le même objet, comme une vraie ligne rouverte.
{
  const M = new Function(`
    ${extractConstLine('money2')}
    ${extractArrayConstMulti('TARIF_GRILLES')}
    ${extractFunction('tarifsPour')}
    ${extractFunction('grilleCourante')}
    ${extractFunction('grilleHistorique')}
    ${extractConstLine('BOX_PRICES')}
    let _coche = false;
    const document = { getElementById: id => id==='f_ancienTarif' ? { checked: _coche } : null };
    const cmdProductsCache = [{taille:6, prix:99}];   // catalogue volontairement absurde : ne doit JAMAIS gagner
    ${extractFunction('tarifsSaisie')}
    ${extractFunction('coffretUnitPrice')}
    return { coffretUnitPrice, setCoche: v => { _coche = v; } };
  `)();

  const ligneRouverte = { type:'coffret', taille:6, tarifRef:'2026-08-10', ancienTarif:true, prixUnitaireApplique:12 };

  M.setCoche(false);   // Ben vient de décocher
  check('A. case décochée → 14 € (le tarif en vigueur), malgré le scellé à 12 € et ancienTarif:true sur la ligne',
    M.coffretUnitPrice(ligneRouverte) === 14);

  M.setCoche(true);    // et si Ben recoche
  check('A. case recochée → 12 € (l\'ancien tarif), la case reste bien réactive dans les deux sens',
    M.coffretUnitPrice(ligneRouverte) === 12);

  check('A. le catalogue produits (99 €) ne l\'emporte jamais tant que la grille répond',
    M.coffretUnitPrice(ligneRouverte) !== 99);
}

// ---- B. LE MENU DÉROULANT NE DOIT PLUS RECEVOIR LE MARQUEUR DE LA LIGNE ----
// Capture de Ben : le sélecteur de taille restait sur l'ancien prix après avoir décoché la case.
{
  const i = require('./_extract').APP.indexOf('const boxOpts = cmdProductsCache.map');
  const src = require('./_extract').APP.slice(i, require('./_extract').APP.indexOf(".join('');", i));
  check('B. le menu déroulant ne transmet plus ln.tarifRef à coffretUnitPrice',
    !/tarifRef:\s*ln\.tarifRef/.test(src));
  check('B. le menu déroulant ne transmet plus ln.ancienTarif à coffretUnitPrice',
    !/ancienTarif:\s*ln\.ancienTarif/.test(src));
  check('B. il continue de passer la taille de chaque option (sinon plus aucun prix ne s\'afficherait)',
    /taille:\+p\.taille/.test(src));
}

// ---- C. `coffretUnitPrice` ELLE-MÊME NE LIT PLUS AUCUN MARQUEUR DE LIGNE ----
{
  const src = extractFunction('coffretUnitPrice');
  check('C. plus aucune lecture de prixUnitaireApplique (elle n\'est appelée qu\'en saisie)',
    !/prixUnitaireApplique/.test(src));
  check('C. plus aucune lecture de tarifsDeLigne/tarifRef/ancienTarif',
    !/tarifsDeLigne/.test(src) && !/ln\s*&&\s*\(ln\.tarifRef/.test(src));
  check('C. la source unique restante est tarifsSaisie()', /tarifsSaisie\(\)/.test(src));
}

// ---- D. `tarifsLigneSaisie` NE DONNE PLUS LA PRIORITÉ AU DRAPEAU (ÉTEND LE FIX AU-DELÀ DU
// COFFRET : événement, grand format, vrac, sachet passent tous par elle) ----
{
  const src = extractFunction('tarifsLigneSaisie');
  check('D. ne consulte plus ln.ancienTarif ni ln.tarifRef', !/ancienTarif/.test(src) && !/ln\s*&&\s*ln\.tarifRef/.test(src));
  check('D. délègue uniquement à tarifsSaisie()', /return\s*\(typeof tarifsSaisie/.test(src) || /tarifsSaisie\(\)/.test(src));

  // Comportement : une ligne ÉVÉNEMENT rouverte, marquée ancienTarif:true, doit maintenant suivre
  // la case en direct — pas rester bloquée sur son marqueur, comme un coffret rouvert.
  const M = new Function(`
    function grilleHistorique(){ return {event:1.60}; }
    function grilleCourante(){ return {event:1.90}; }
    let _coche = false;
    function tarifsSaisie(){ return _coche ? grilleHistorique() : grilleCourante(); }
    ${extractFunction('tarifsLigneSaisie')}
    ${extractFunction('eventUnitPriceSaisie')}
    return { eventUnitPriceSaisie, setCoche: v => { _coche = v; } };
  `)();
  const ligneEvtRouverte = { type:'evenement', tarifRef:'2026-08-10', ancienTarif:true };
  M.setCoche(false);
  check('D. événement rouvert marqué « ancien tarif », case décochée → 1,90 € (suit la case, pas le marqueur figé)',
    M.eventUnitPriceSaisie(ligneEvtRouverte) === 1.90);
  M.setCoche(true);
  check('D. …et 1,60 € une fois la case recochée', M.eventUnitPriceSaisie(ligneEvtRouverte) === 1.60);
}

// ---- E. `cmdLinesToStored` : LE DRAPEAU N'EST PLUS COLLANT — LA CASE DÉCIDE À CHAQUE
// ENREGISTREMENT, SANS MÉMOIRE D'UN CHOIX PRÉCÉDENT ----
{
  const src = extractFunction('cmdLinesToStored');
  check('E. plus de ratchet : ancienTarif ne s\'OU-tie plus avec la valeur précédente de la ligne',
    !/_ancien\s*\|\|\s*!!ln\.ancienTarif/.test(src));
  check('E. la case reste la seule source du drapeau à l\'enregistrement', /const ancienTarif = _ancien;/.test(src));

  // Comportement bout en bout : une ligne SAUVEGARDÉE avec ancienTarif:true (vraie donnée d'un
  // enregistrement antérieur), rouverte, case DÉCOCHÉE, puis RÉENREGISTRÉE → doit ressortir sans
  // le drapeau (undefined), donc sur la grille courante — plus jamais bloquée sur true.
  const M = new Function(`
    ${extractConstLine('money2')}
    ${extractArrayConstMulti('TARIF_GRILLES')}
    ${extractFunction('tarifsPour')}
    ${extractFunction('grilleCourante')}
    ${extractFunction('grilleHistorique')}
    ${extractConstLine('BOX_PRICES')}
    let _coche = false;
    const document = { getElementById: id => id==='f_ancienTarif' ? { checked: _coche } : null };
    const cmdProductsCache = [];
    function val(id){ return id==='f_date' ? '2026-09-15' : ''; }
    ${extractFunction('tarifsSaisie')}
    ${extractFunction('coffretUnitPrice')}
    let cmdLines = [];
    ${extractFunction('cmdLinesToStored')}
    return { cmdLinesToStored, setCoche: v => { _coche = v; }, setLines: L => { cmdLines = L; } };
  `)();

  // Ligne telle qu'elle arrive dans le modèle d'édition après réouverture d'une commande qui
  // avait été enregistrée « anciens tarifs » cochée (tarifRef + ancienTarif:true, comme le pose
  // réellement _lineToEdit).
  const ligneRouverte = { type:'coffret', taille:6, tarifRef:'2026-08-10', ancienTarif:true, parfums:{} };

  M.setCoche(false);           // Ben décoche…
  M.setLines([ligneRouverte]); // …sans même retoucher la ligne elle-même
  const [stored1] = M.cmdLinesToStored();
  check('E. [LE DÉFAUT CORRIGÉ] ré-enregistrée case décochée → ancienTarif n\'est plus collé à true',
    stored1.ancienTarif === undefined);
  check('E. …et le prix scellé suit la grille en vigueur (14 €), pas l\'ancien (12 €)',
    stored1.prixUnitaireApplique === 14);

  // Non-régression : si la case est cochée au moment de l'enregistrement, le comportement
  // documenté depuis la v1466 tient toujours.
  M.setCoche(true);
  const [stored2] = M.cmdLinesToStored();
  check('E. non-régression : case cochée à l\'enregistrement → ancienTarif:true, prix 12 €',
    stored2.ancienTarif === true && stored2.prixUnitaireApplique === 12);

  // Sensibilité : réintroduire l'ancien calcul collant donnerait un résultat différent sur EXACTEMENT
  // ce scénario — la preuve que l'assertion mesure bien le bon mécanisme, pas un hasard de données.
  const MAvecBug = new Function(`
    ${extractConstLine('money2')}
    ${extractArrayConstMulti('TARIF_GRILLES')}
    ${extractFunction('tarifsPour')}
    ${extractFunction('grilleCourante')}
    ${extractFunction('grilleHistorique')}
    ${extractConstLine('BOX_PRICES')}
    let _coche = false;
    const document = { getElementById: id => id==='f_ancienTarif' ? { checked: _coche } : null };
    const cmdProductsCache = [];
    function val(id){ return id==='f_date' ? '2026-09-15' : ''; }
    ${extractFunction('tarifsSaisie')}
    ${extractFunction('coffretUnitPrice')}
    let cmdLines = [];
    ${extractFunction('cmdLinesToStored').replace('const ancienTarif = _ancien;', 'const ancienTarif = _ancien || !!ln.ancienTarif;')}
    return { cmdLinesToStored, setCoche: v => { _coche = v; }, setLines: L => { cmdLines = L; } };
  `)();
  MAvecBug.setCoche(false);
  MAvecBug.setLines([ligneRouverte]);
  const [storedBug] = MAvecBug.cmdLinesToStored();
  check('E. [SENSIBILITÉ] avec l\'ancien calcul collant réintroduit, le même scénario reste bloqué sur true',
    storedBug.ancienTarif === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
