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

const M = new Function(`
  ${extractConstLine('money2')}
  ${extractArrayConstMulti('TARIF_GRILLES')}
  ${extractFunction('tarifsPour')}
  ${extractFunction('tarifsDeLigne')}
  ${extractConstLine('SACHET_PRIX_MACARON')}
  ${extractFunction('sachetPrixPour')}
  ${extractConstLine('PERSO_PRIX_UNIT')}
  ${extractFunction('persoPrixUnitPour')}
  ${extractFunction('logoPrixUnitPour')}
  ${extractFunction('logoMontantPour')}
  ${extractFunction('forfaitCreationPour')}
  return { TARIF_GRILLES, tarifsPour, tarifsDeLigne, sachetPrixPour, persoPrixUnitPour,
           logoPrixUnitPour, logoMontantPour, forfaitCreationPour };
`)();

const NEUF = '2026-09-15', VIEUX = '2026-01-20', VEILLE = '2026-08-31', JOUR_J = '2026-09-01';

// ---- A. La grille demandée par Ben, au centime ----
{
  const g = M.tarifsPour(NEUF);
  check('A. coffret 6 = 14 €', g.box[6] === 14);
  check('A. coffret 8 = 18 €', g.box[8] === 18);
  check('A. coffret 10 = 22 €', g.box[10] === 22);
  check('A. coffret 16 = 34 €', g.box[16] === 34);
  check('A. coffret 25 = 50 €', g.box[25] === 50);
  check('A. sachet 1 / 2 / 3 = 2,50 / 5 / 6,50 €',
    M.sachetPrixPour(1,g)===2.5 && M.sachetPrixPour(2,g)===5 && M.sachetPrixPour(3,g)===6.5);
  check('A. le sachet de 3 n\'est PAS linéaire (6,50 € et non 7,50 €)', M.sachetPrixPour(3,g) !== 7.5);
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
  check('B. …personnalisation couleurs reste à 0,25 €', M.persoPrixUnitPour(VIEUX) === 0.25);
  check('B. …sachet reste linéaire à 2,50 €/macaron (3 pièces = 7,50 €)', M.sachetPrixPour(3, g) === 7.5);
  check('B. …le logo n\'existait pas : 0 €', M.logoMontantPour(150, VIEUX) === 0);
  check('B. …le forfait création n\'existait pas : 0 €', M.forfaitCreationPour(2, VIEUX) === 0);

  // Bornes exactes du basculement.
  check('B. le 31 août est encore à l\'ancien tarif', M.tarifsPour(VEILLE).box[6] === 12);
  check('B. le 1er septembre bascule au nouveau', M.tarifsPour(JOUR_J).box[6] === 14);
}

// ---- C. SANS DATE → ancien tarif. On ne surfacture jamais dans le doute ----
{
  check('C. date absente → grille historique, jamais la nouvelle', M.tarifsPour('').box[6] === 12);
  check('C. date nulle → idem', M.tarifsPour(null).box[6] === 12);
  check('C. une LIGNE sans tarifRef (antérieure à cette version) → ancien tarif',
    M.tarifsDeLigne({type:'coffret', taille:6}).box[6] === 12);
  check('C. une ligne AVEC tarifRef ancien → ancien tarif', M.tarifsDeLigne({tarifRef:VIEUX}).box[6] === 12);
  check('C. une ligne AVEC tarifRef récent → nouveau tarif', M.tarifsDeLigne({tarifRef:NEUF}).box[6] === 14);
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
  check('F. la saisie suit la DATE DE LA COMMANDE, pas le jour', /val\('f_date'\)/.test(srcSaisie));
  check('F. sans date, la saisie retombe sur la grille historique',
    /TARIF_GRILLES\[TARIF_GRILLES\.length-1\]/.test(srcSaisie));

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
  check('H. le drapeau est testé AVANT la date (il doit primer, pas se faire écraser)',
    src.indexOf('ancienTarif') >= 0 && src.indexOf('ancienTarif') < src.indexOf('tarifsPour'));
  const srcSaisie = extractFunction('tarifsSaisie');
  check('H. le formulaire consulte la case et la fait primer sur la date',
    /f_ancienTarif/.test(srcSaisie) && srcSaisie.indexOf('f_ancienTarif') < srcSaisie.indexOf("val('f_date')"));
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

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
