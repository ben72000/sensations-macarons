'use strict';
// v1463 — NOUVELLE GRILLE TARIFAIRE AU 01/09/2026, ET VERROU ANTI-DATATION.
// Ben : « Nouveaux tarifs macarons à partir de toute commande passée à compter du 1er septembre
// 2026. Les commandes passées avant cette date ne sont pas impactées », puis : « si une commande
// est anti datée, c'est à dire par exemple entrée le 2 septembre mais livrée en janvier 2026 elle
// doit nécessairement garder l'ancien tarif ! Je veux que tu verrouilles ça proprement pour que je
// puisse facilement rajouter des commandes au fil de l'eau dans le passé ».
//
// 🚨 LE RISQUE : seuls les COFFRETS scellaient leur prix (`prixUnitaireApplique`). Événement, vrac
// pro, sachet, pyramide et personnalisation recalculaient à CHAQUE affichage depuis des constantes
// — changer les valeurs aurait retarifé rétroactivement toutes les commandes déjà passées de ces
// types (factures, CA encaissé, marges, déclarations URSSAF).
const { extractFunction, extractConstLine, APP, stripComments } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

function extractArrayConstMulti(name){
  const idx = APP.indexOf('const ' + name + ' = [');
  if(idx===-1) throw new Error('Introuvable: '+name);
  const clean = stripComments(APP.slice(idx));
  const i = clean.indexOf('[');
  let depth=0, inStr=null, esc=false;
  for(let j=i;j<clean.length;j++){
    const c=clean[j];
    if(inStr){ if(esc){esc=false;} else if(c==='\\'){esc=true;} else if(c===inStr){inStr=null;} continue; }
    if(c==='"'||c==="'"||c==='`'){ inStr=c; continue; }
    if(c==='[') depth++;
    else if(c===']'){ depth--; if(depth===0) return clean.slice(0,j+1)+';'; }
  }
  throw new Error('Crochets non équilibrés: '+name);
}

let _CASE_COCHEE = false;
const M = new Function('_CASE_COCHEE', `
  ${extractConstLine('money2')}
  ${extractArrayConstMulti('TARIF_GRILLES')}
  ${extractFunction('tarifsPour')}
  ${extractFunction('grilleCourante')}
    ${extractFunction('grilleHistorique')}
    ${extractFunction('tarifsDeLigne')}
  ${extractConstLine('SACHET_PRIX_MACARON')}
  ${extractFunction('sachetPrixPour')}
  ${extractConstLine('PERSO_PRIX_UNIT')}
  ${extractFunction('grillePourCommande')}
  function tarifsSaisie(){ return _CASE_COCHEE ? grilleHistorique() : grilleCourante(); }
  ${extractFunction('_grilleOption')}
  ${extractFunction('persoPrixUnitPour')}
  ${extractFunction('logoPrixUnitPour')}
  ${extractFunction('logoMontantPour')}
  ${extractFunction('forfaitCreationPour')}
  return { TARIF_GRILLES, tarifsPour, tarifsDeLigne, grilleCourante, grilleHistorique, sachetPrixPour, persoPrixUnitPour,
           logoPrixUnitPour, logoMontantPour, forfaitCreationPour };
`)(false);

const NEUF = '2026-09-15', VIEUX = '2026-01-20', VEILLE = '2026-08-31', JOUR_J = '2026-09-01';

// ---- A. La grille demandée par Ben, au centime ----
{
  const g = M.tarifsPour(NEUF);
  check('A. coffret 6 = 14 €', g.box[6] === 14);
  check('A. coffret 8 = 18 €', g.box[8] === 18);
  check('A. coffret 10 = 22 €', g.box[10] === 22);
  check('A. coffret 16 = 34 €', g.box[16] === 34);
  check('A. coffret 25 = 50 €', g.box[25] === 50);
  // [v1469] Ben a tranché : « peu importe la date le montant du macaron à l'unité est de 2,50€ »,
  // et un sachet de 3 fait « 7,50 € dans tous les cas — toujours 3 × 2,50 € ». Le sachet est donc
  // LINÉAIRE et identique dans les deux grilles : la case n'a volontairement aucun effet sur lui.
  check('A. sachet linéaire : 1 / 2 / 3 = 2,50 / 5 / 7,50 €',
    M.sachetPrixPour(1,g)===2.5 && M.sachetPrixPour(2,g)===5 && M.sachetPrixPour(3,g)===7.5);
  check('A. le macaron à l\'unité vaut 2,50 € quelle que soit la grille',
    M.sachetPrixPour(1, M.tarifsPour(NEUF))===2.5 && M.sachetPrixPour(1, M.tarifsPour(VIEUX))===2.5);
  check('A. …et un sachet de 3 vaut 7,50 € des deux côtés (la case ne le change pas)',
    M.sachetPrixPour(3, M.tarifsPour(NEUF))===7.5 && M.sachetPrixPour(3, M.tarifsPour(VIEUX))===7.5);
  check('A. événement 1,90 €, minimum 35 pièces', g.event===1.90 && g.eventMin===35);
  check('A. pro occasionnel 1,75 € · pro récurrent 1,60 €', g.proOccasionnel===1.75 && g.proRecurrent===1.60);
  check('A. location pyramide 22 €', g.pyramide===22);
  check('A. personnalisation couleurs 0,30 €', g.persoCouleur===0.30);
  check('A. forfait création 40 €', g.forfaitCreation===40);
}

// ---- B. LE VERROU ANTI-DATATION — le cœur de la demande de Ben ----
{
  // Son exemple exact : saisie le 2 septembre, commande datée de janvier 2026.
  const g = M.tarifsPour(VIEUX);
  check('B. commande antidatée en janvier : coffret 6 reste à 12 € (ancien tarif)', g.box[6] === 12);
  check('B. …coffret 25 reste à 42 €', g.box[25] === 42);
  check('B. …événement reste à 1,60 €', g.event === 1.60);
  check('B. …pyramide reste à 20 €', g.pyramide === 20);
  // [v1468] Ces options prennent désormais un CONTEXTE (commande), plus une date. Une commande
  // héritée — sans marqueur — reste sur l'ancienne grille : c'est ce qui protège l'historique.
  check('B. …personnalisation couleurs reste à 0,25 € sur une commande héritée', M.persoPrixUnitPour({}) === 0.25);
  check('B. …sachet toujours linéaire à 2,50 €/macaron (3 pièces = 7,50 €)', M.sachetPrixPour(3, g) === 7.5);
  check('B. …le logo n\'existait pas : 0 € sur une commande héritée', M.logoMontantPour(150, {}) === 0);
  check('B. …le forfait création n\'existait pas : 0 €', M.forfaitCreationPour(2, {}) === 0);

  // `tarifsPour` reste la lecture d'une grille PAR DATE (consultation de l'historique des
  // tarifs), mais depuis la v1466 elle ne décide plus du prix d'une commande — c'est la case.
  check('B. tarifsPour lit toujours la grille du 31 août', M.tarifsPour(VEILLE).box[6] === 12);
  check('B. …et celle du 1er septembre', M.tarifsPour(JOUR_J).box[6] === 14);
}

// ---- C. SANS DATE → ancien tarif. On ne surfacture jamais dans le doute ----
{
  check('C. date absente → grille historique, jamais la nouvelle', M.tarifsPour('').box[6] === 12);
  check('C. date nulle → idem', M.tarifsPour(null).box[6] === 12);
  // [v1466] LA CASE DÉCIDE, PLUS LA DATE. Ce qui protège encore l'historique : une ligne HÉRITÉE
  // (ni drapeau ni tarifRef) reste sur l'ancienne grille — aucune facture émise ne bouge.
  check('C. ligne HÉRITÉE (ni drapeau ni tarifRef) → ancien tarif',
    M.tarifsDeLigne({type:'coffret', taille:6}).box[6] === 12);
  check('C. ligne récente, case décochée → NOUVEAUX tarifs même datée d\'août',
    M.tarifsDeLigne({tarifRef:'2026-08-20'}).box[6] === 14);
  check('C. …et même datée de janvier : la date ne décide plus',
    M.tarifsDeLigne({tarifRef:VIEUX}).box[6] === 14);
  check('C. case cochée → anciens tarifs quelle que soit la date',
    M.tarifsDeLigne({tarifRef:NEUF, ancienTarif:true}).box[6] === 12);
}

// ---- D. Personnalisation logo : paliers, bornes incluses ----
{
  check('D. 99 pièces → 1,00 €/pièce', M.logoPrixUnitPour(99, NEUF) === 1.00);
  check('D. 100 pièces → 0,80 € (borne basse INCLUSE)', M.logoPrixUnitPour(100, NEUF) === 0.80);
  check('D. 300 pièces → 0,80 € (borne haute INCLUSE)', M.logoPrixUnitPour(300, NEUF) === 0.80);
  check('D. 301 pièces → 0,70 €', M.logoPrixUnitPour(301, NEUF) === 0.70);
  check('D. le palier s\'applique à TOUT le volume (150 × 0,80 = 120 €, pas 99×1 + 51×0,80)',
    M.logoMontantPour(150, NEUF) === 120);
  check('D. 0 pièce → 0 €', M.logoMontantPour(0, NEUF) === 0);
}

// ---- E. Forfait création : PAR MODÈLE (précision de Ben) ----
{
  check('E. 1 modèle = 40 €', M.forfaitCreationPour(1, NEUF) === 40);
  check('E. 2 modèles = 80 € (« si il y a 2 modèles alors 2 x le prix »)', M.forfaitCreationPour(2, NEUF) === 80);
  check('E. aucun modèle = 0 € (option, pas un dû systématique)', M.forfaitCreationPour(0, NEUF) === 0);
}

// ---- F. Câblage : les fonctions de prix consultent bien la grille ----
{
  const srcCoffret = extractFunction('coffretUnitPrice');
  // ⚠️ Ces deux assertions exigent la PRÉSENCE avant de comparer l'ordre : `indexOf` renvoie -1
  // quand le texte a disparu, et -1 est inférieur à tout — une comparaison nue serait donc
  // faussement verte précisément quand la protection est retirée (constaté par mutation).
  const iScelle = srcCoffret.indexOf('prixUnitaireApplique');
  const iGrille = srcCoffret.indexOf('tarifsDeLigne');
  const iCatal  = srcCoffret.indexOf('cmdProductsCache');
  check('F. le prix scellé sur la ligne reste PRIORITAIRE (commandes déjà enregistrées)',
    iScelle >= 0 && iGrille >= 0 && iScelle < iGrille);
  check('F. la grille datée prime sur le catalogue (sinon une commande antidatée prendrait les prix du jour)',
    iGrille >= 0 && iCatal >= 0 && iGrille < iCatal);

  const srcVrac = extractFunction('vracPrixMacaron');
  check('F. le vrac connaît les 3 modes dont pro récurrent', /prorec/.test(srcVrac));
  check('F. le vrac lit la grille de sa ligne', /tarifsDeLigne\(ln\)/.test(srcVrac));

  const srcEvt = extractFunction('eventUnitPrice');
  check('F. l\'événement lit la grille de sa ligne', /tarifsDeLigne\(ln\)/.test(srcEvt));

  const srcSaisie = extractFunction('tarifsSaisie');
  check('F. [v1466] la saisie ne consulte PLUS la date — la case seule décide',
    !/val\('f_date'\)/.test(srcSaisie));
  check('F. décochée → grille courante ; cochée → grille historique',
    /grilleCourante\(\)/.test(srcSaisie) && /grilleHistorique\(\)/.test(srcSaisie));

  const srcStored = extractFunction('cmdLinesToStored');
  check('F. tarifRef est posé à l\'enregistrement', /tarifRef,/.test(srcStored));
  check('F. tarifRef DÉJÀ posé est conservé (rouvrir une commande ne la retarife pas)',
    /\(ln && ln\.tarifRef\) \? ln\.tarifRef : _dateCmd/.test(srcStored));
  check('F. aucun repli sur today() à l\'enregistrement (le trou signalé par Ben)',
    !/val\('f_date'\) : \(typeof today/.test(srcStored));

  const srcEdit = extractFunction('_lineToEdit');
  check('F. tarifRef survit à la réouverture d\'une commande', (srcEdit.match(/tarifRef: ln\.tarifRef\|\|null/g)||[]).length === 5);
}

// ---- G. Les options apparaissent sur les documents (facturé ⇒ visible) ----
{
  const src = extractFunction('factLogoLignes');
  check('G. une ligne document existe pour le logo', /Personnalisation logo/.test(src));
  check('G. …et pour la création graphique', /Création graphique sur mesure/.test(src));
  check('G. le palier appliqué est écrit en clair sur le document', /logoPrixUnitPour/.test(src));
  check('G. rien n\'est affiché quand l\'option n\'est pas utilisée', /if\(n>0\)/.test(src) && /if\(f>0\)/.test(src));
  const srcRab = extractFunction('docRabaisTotal');
  check('G. logo et forfait entrent dans le brut (sinon la remise annoncée serait fausse)',
    /logoMontantPour/.test(srcRab) && /forfaitCreationPour/.test(srcRab));
}

// ---- H. [v1464] CASE « ANCIENS TARIFS » — Ben : « au pire tu ajoutes une case à cocher ancien
// tarifs. Si c'est coché alors tous les sélecteurs affichent l'ancien tarif. » Ce choix EXPLICITE
// doit primer sur la déduction automatique par la date, qui n'est qu'un défaut commode. C'est ce
// qui résout le cas qu'une date seule ne pouvait pas couvrir : commande prise avant le 01/09,
// livrée après. ----
{
  check('H. ligne cochée « ancien tarif » MALGRÉ une date récente → ancienne grille',
    M.tarifsDeLigne({tarifRef:NEUF, ancienTarif:true}).box[6] === 12);
  check('H. …et le coffret 25 aussi', M.tarifsDeLigne({tarifRef:NEUF, ancienTarif:true}).box[25] === 42);
  check('H. …et l\'événement', M.tarifsDeLigne({tarifRef:NEUF, ancienTarif:true}).event === 1.60);
  check('H. non cochée avec date récente → nouvelle grille (comportement par défaut inchangé)',
    M.tarifsDeLigne({tarifRef:NEUF, ancienTarif:false}).box[6] === 14);
  check('H. cochée sur une ligne déjà ancienne : reste évidemment à l\'ancienne grille',
    M.tarifsDeLigne({tarifRef:VIEUX, ancienTarif:true}).box[6] === 12);

  const src = extractFunction('tarifsDeLigne');
  // [v1466] Le drapeau est le PREMIER test de la fonction : c'est lui qui décide, et rien ne doit
  // pouvoir le contourner ensuite. La date n'y intervient plus du tout.
  const iFlag = src.indexOf('ancienTarif');
  const iRef  = src.indexOf('tarifRef');
  check('H. le drapeau est testé EN PREMIER, avant tout autre critère',
    iFlag >= 0 && iRef >= 0 && iFlag < iRef);
  check('H. la tarification d\'une ligne ne consulte plus tarifsPour (la date ne décide plus)',
    !/tarifsPour/.test(src));
  const srcSaisie = extractFunction('tarifsSaisie');
  check('H. le formulaire consulte la case', /f_ancienTarif/.test(srcSaisie));
  const srcStored = extractFunction('cmdLinesToStored');
  check('H. le drapeau est copié sur CHAQUE ligne enregistrée (une ligne se tarife seule)',
    /ancienTarif:ancienTarif\|\|undefined/.test(srcStored));
  const srcEdit = extractFunction('_lineToEdit');
  check('H. le drapeau survit à la réouverture', (srcEdit.match(/ancienTarif: !!ln\.ancienTarif/g)||[]).length === 5);
}

// ---- I. [v1464] GROS MACARONS — Ben : « 7€ tarifs grand public et 3,80 en tarif pro » ----
{
  const g = M.tarifsPour(NEUF);
  check('I. gros macaron grand public = 7 €', g.grandFormat.particulier === 7.00);
  check('I. gros macaron pro = 3,80 €', g.grandFormat.pro === 3.80);
  check('I. avant le 01/09/2026, la grille n\'impose rien (anciens prix conservés)',
    M.tarifsPour(VIEUX).grandFormat === null);
  const src = extractFunction('bigPrice');
  check('I. bigPrice lit la grille', /grandFormat/.test(src));
  check('I. son 2e argument est OPTIONNEL (les appels d\'affichage existants restent valides)',
    /function bigPrice\(tarif, ref\)/.test(src));
  check('I. repli sur l\'ancien réglage quand la grille ne dit rien', /prixGrandFormatPro/.test(src));
}

// ---- J. [v1465] LE DÉFAUT QUE LE TEST DE BEN AURAIT RÉVÉLÉ : une ligne EN COURS DE SAISIE n'a
// pas encore de tarifRef. L'ancien ordre de priorité la faisait retomber sur le CATALOGUE
// produits, qui contient les prix d'installation (12/16/22/28/42 €) — une commande datée de
// septembre affichait donc 12 € pour un coffret de 6 au lieu de 14 €, et ce prix faux était
// SCELLÉ à l'enregistrement. La grille prime désormais, même sans tarifRef. ----
{
  const src = extractFunction('coffretUnitPrice');
  const iScelle = src.indexOf('prixUnitaireApplique');
  const iGrille = src.indexOf('g.box[taille]');
  const iCatal  = src.indexOf('cmdProductsCache');
  check('J. le prix scellé reste prioritaire (commandes déjà enregistrées intactes)',
    iScelle >= 0 && iGrille >= 0 && iScelle < iGrille);
  check('J. la grille prime sur le catalogue', iGrille >= 0 && iCatal >= 0 && iGrille < iCatal);
  check('J. une ligne SANS tarifRef consulte quand même la grille (cas de la saisie en cours)',
    /tarifsSaisie\(\)/.test(src));
  check('J. le catalogue ne sert plus que de repli', iCatal > iGrille);

  // Comportement : la grille de septembre donne bien 14 € pour un 6, pas le 12 € du catalogue.
  const M2 = new Function(`
    ${extractConstLine('money2')}
    ${extractArrayConstMulti('TARIF_GRILLES')}
    ${extractFunction('tarifsPour')}
    ${extractFunction('grilleCourante')}
    ${extractFunction('grilleHistorique')}
    ${extractFunction('tarifsDeLigne')}
    ${extractConstLine('BOX_PRICES')}
    const cmdProductsCache = [{taille:6, prix:12},{taille:25, prix:42}];   // catalogue d'origine
    function tarifsSaisie(){ return tarifsPour('2026-09-15'); }            // commande de septembre
    ${extractFunction('coffretUnitPrice')}
    return coffretUnitPrice;
  `)();
  check('J. saisie datée de septembre, ligne sans tarifRef → 14 € (et non les 12 € du catalogue)',
    M2({type:'coffret', taille:6}) === 14);
  check('J. …idem pour le 25 : 50 € et non 42 €', M2({type:'coffret', taille:25}) === 50);
  check('J. un prix déjà scellé reste intouché', M2({type:'coffret', taille:6, prixUnitaireApplique:12}) === 12);
  check('J. une ligne marquée « ancien tarif » garde 12 € malgré la date de saisie',
    M2({type:'coffret', taille:6, ancienTarif:true}) === 12);
}

// ---- K. [v1467] LE SÉLECTEUR AFFICHAIT LE PRIX DU CATALOGUE, PAS CELUI APPLIQUÉ. Capture de Ben :
// bandeau « Tarifs au 1er septembre 2026 — tarifs en vigueur », case décochée, et la liste
// proposait « Coffret 6 macarons — 12,00 € ». Le prix FACTURÉ était pourtant correct : c'est
// l'affichage qui mentait — pire, car Ben choisit sur ce qu'il lit. ----
{
  const i = APP.indexOf('const boxOpts = cmdProductsCache.map');
  const src = APP.slice(i, APP.indexOf('.join(\'\');', i));
  check('K. le libellé du sélecteur passe par coffretUnitPrice', /coffretUnitPrice\(/.test(src));
  check('K. il n\'affiche plus le prix brut du catalogue', !/euro\(p\.prix\)/.test(src));
  check('K. le prix affiché tient compte de la case « anciens tarifs »', /ancienTarif:ln\.ancienTarif/.test(src));
  check('K. data-prix porte aussi le prix appliqué (cohérence affichage/valeur)', /data-prix="\$\{pu\}"/.test(src));
}

// ---- L. [v1467] Alignement prudent du catalogue produits ----
{
  const src = extractFunction('alignerCatalogueSurGrille');
  check('L. un prix personnalisé n\'est JAMAIS écrasé', /\+p\.prix !== \+vieux/.test(src) && /continue/.test(src));
  check('L. les tailles hors grille (sur mesure) sont laissées intactes', /neuf==null \|\| vieux==null/.test(src));
  check('L. idempotente : rien à faire si déjà aligné', /\+p\.prix === \+neuf/.test(src));
  check('L. n\'écrit que le prix, rien d\'autre', /update\(p\.id, \{ prix:/.test(src));
}

// ---- M. [v1468] LES OPTIONS SUIVAIENT ENCORE LA DATE. Ben : « la mise à jour de +0,30cts pour la
// personnalisation des couleurs n'est pas passé. Quoi que je coche ça reste à 25cts ». En v1466 la
// tarification des LIGNES est passée sur la case, mais les options de niveau COMMANDE (perso
// couleurs, logo, forfait) sont restées sur l'ancienne règle par date — et comme on est en août,
// elles retombaient sur la grille historique, insensibles à la case. ----
{
  const srcPerso = extractFunction('persoPrixUnitPour');
  check('M. la perso ne consulte plus tarifsPour (la date ne décide plus)', !/tarifsPour/.test(srcPerso));
  check('M. elle passe par le contexte commun', /_grilleOption\(ctx\)/.test(srcPerso));
  const srcLogo = extractFunction('logoPrixUnitPour');
  check('M. le logo non plus', !/tarifsPour/.test(srcLogo) && /_grilleOption\(ctx\)/.test(srcLogo));
  const srcForf = extractFunction('forfaitCreationPour');
  check('M. le forfait création non plus', !/tarifsPour/.test(srcForf) && /_grilleOption\(ctx\)/.test(srcForf));

  const srcCtx = extractFunction('_grilleOption');
  check('M. un objet commande → sa grille ; rien → le formulaire (donc la case)',
    /grillePourCommande\(ctx\)/.test(srcCtx) && /tarifsSaisie\(\)/.test(srcCtx));
  const srcCmd = extractFunction('grillePourCommande');
  check('M. une commande cochée → ancienne grille', /o\.ancienTarif/.test(srcCmd));
  check('M. une commande HÉRITÉE (sans marqueur) → ancienne grille : historique préservé',
    /return grilleHistorique\(\);/.test(srcCmd));

  // Comportement, sur les chiffres exacts de Ben.
  check('M. commande récente NON cochée → 0,30 € (et non 0,25 €)',
    M.persoPrixUnitPour({tarifRef:'2026-08-10'}) === 0.30);
  check('M. commande cochée « anciens tarifs » → 0,25 €',
    M.persoPrixUnitPour({tarifRef:'2026-08-10', ancienTarif:true}) === 0.25);
  check('M. commande héritée (aucun marqueur) → 0,25 € : aucune facture émise ne bouge',
    M.persoPrixUnitPour({}) === 0.25);
  check('M. le logo suit la même règle (0,80 € à 150 pièces sur une commande récente)',
    M.logoPrixUnitPour(150, {tarifRef:'2026-08-10'}) === 0.80);
  check('M. …et reste à 0 sur une commande héritée (l\'option n\'existait pas)',
    M.logoMontantPour(150, {}) === 0);
  check('M. le forfait création suit aussi (40 € sur une commande récente)',
    M.forfaitCreationPour(1, {tarifRef:'2026-08-10'}) === 40);
}

// ---- N. [v1469] AFFICHÉ ≠ FACTURÉ : une ligne EN COURS DE SAISIE était tarifée comme une ligne
// HÉRITÉE. Capture de Ben : le sachet annonçait 6,50 € et « Montant ligne » facturait 7,50 €.
// CAUSE : `tarifsDeLigne` traite l'absence de marqueur comme « ligne héritée → grille historique »
// — ce qui est juste pour une ligne ENREGISTRÉE, mais faux pour une ligne qu'on est en train de
// saisir, qui n'a simplement pas encore reçu son marqueur. D'où un résolveur distinct. ----
{
  const src = extractFunction('tarifsLigneSaisie');
  check('N. un résolveur distinct existe pour les lignes en cours de saisie', src.length > 0);
  check('N. le drapeau reste prioritaire', /ancienTarif/.test(src));
  check('N. une ligne neuve (sans marqueur) suit le FORMULAIRE, pas la grille historique',
    /tarifsSaisie\(\)/.test(src));

  // Le calcul du modèle d'édition doit passer par ce résolveur, pas par celui des lignes stockées.
  const srcBase = extractFunction('lineTotalBase');
  check('N. le sachet en saisie utilise le résolveur de saisie', /sachetPrixPour\(tot, tarifsLigneSaisie\(ln\)\)/.test(srcBase));
  check('N. le vrac aussi', /vracPrixMacaron\(ln, tarifsLigneSaisie\(ln\)\)/.test(srcBase));
  check('N. le grand format aussi', /tarifsLigneSaisie\(ln\)/.test(srcBase));

  // Les lignes ENREGISTRÉES gardent l'autre résolveur : c'est ce qui protège l'historique.
  const srcStored = extractFunction('lineTotalStored');
  check('N. une ligne enregistrée garde tarifsDeLigne (protection de l\'historique)',
    /tarifsDeLigne\(ln\)/.test(srcStored) && !/tarifsLigneSaisie/.test(srcStored));
}

// ---- O. [v1469] Les prix AFFICHÉS de la personnalisation ne sont plus figés ----
{
  check('O. le libellé de la case ne contient plus de prix en dur', !/Personnalisation des couleurs \(\+0,25/.test(APP));
  check('O. il affiche le tarif appliqué', /Personnalisation des couleurs \(\+\$\{euro\(persoPrixUnitPour\(\)\)\}/.test(APP));
  check('O. la ligne du récapitulatif non plus', !/×0,25 €\)<\/span>/.test(APP));
  check('O. elle affiche le tarif appliqué', /\$\{persoNb\}×\$\{euro\(persoPrixUnitPour\(\)\)\}/.test(APP));
  check('O. la fiche d\'aide ne cite plus un montant figé', !/Personnalisation des couleurs \(\+0,25 €\/macaron\)/.test(APP));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
