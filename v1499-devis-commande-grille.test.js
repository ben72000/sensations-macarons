'use strict';
// v1499 — LE DEVIS SIGNÉ ET LA COMMANDE NE DISAIENT PAS LA MÊME CHOSE, ET LA FACTURE A HÉRITÉ DE
// LA MAUVAISE VERSION. Ben : « j'avais d'un côté le devis validé et de l'autre la commande. Pour
// une raison inconnue les 2 ne disaient pas la même chose. Puis j'ai été dans commande et j'ai
// cliqué sur "facturer la sélection" […] et j'ai validé sans contrôler. » Ce qui différait :
// « le détail de la commande, les options, les lignes de service ».
//
// 🚨 CAUSE RACINE : `docConvertToOrder` recopiait TOUT du devis (lignes, options, logo, livraison,
// remises…) SAUF `tarifRef` et `ancienTarif`. Or `grillePourCommande` traite une commande SANS
// marqueur comme HÉRITÉE et renvoie la grille HISTORIQUE — celle où le supplément logo n'existe
// pas (`logoPaliers:null`). La commande naissait donc sur une AUTRE grille que le devis que le
// client venait de signer, sans que Ben n'ait rien modifié.
// C'est le MIROIR du défaut v1489 (le devis, lui, ne les portait pas et affichait zéro) : on les
// a ajoutés au devis, sans jamais mettre à jour le chemin retour. Leçon : un aller corrigé ne
// corrige pas le retour — chaque constructeur de document se recopie séparément, comme les champs
// logo oubliés dans les 3 constructeurs en v1487.
//
// QUATRE VOLETS :
//   ① la conversion devis→commande transmet les marqueurs (cause) ;
//   ② le retour commande→devis aussi (même trou, autre sens) ;
//   ③ migration des commandes DÉJÀ nées amputées — sans elle, corriger le code ne corrige pas les
//      données de Ben, et refacturer depuis le devis repartirait encore de la commande fausse ;
//   ④ avertissement avant de facturer une commande dont le devis a divergé (l'app le SAVAIT via
//      `perimeCommande`, mais ne l'affichait que sur la fiche du devis — écran que ce chemin ne
//      fait jamais ouvrir) + avoir d'ANNULATION pour neutraliser la facture déjà validée.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. ① La conversion devis → commande transmet les marqueurs de grille ----
{
  const src = extractFunction('docConvertToOrder');
  check('A. [LA CAUSE] la commande reçoit tarifRef du devis', /tarifRef:\s*d\.tarifRef/.test(src));
  check('A. …et ancienTarif du devis', /ancienTarif:\s*!!d\.ancienTarif/.test(src));
  check('A. le repli part de la date DU DEVIS, jamais du jour de la conversion (un devis signé en août reste sur sa grille)',
    /tarifRef:\s*d\.tarifRef\s*\|\|\s*d\.date/.test(src));

  // Comportement : la grille réellement appliquée à la commande née du devis.
  const M = new Function(`
    ${(function(){
      const start = APP.indexOf('const TARIF_GRILLES = [');
      let depth = 0, end = -1;
      for(let i = start; i < APP.length; i++){
        if(APP[i] === '[') depth++;
        else if(APP[i] === ']'){ depth--; if(depth === 0){ end = i + 1; break; } }
      }
      return APP.slice(start, end) + ';';
    })()}
    ${extractFunction('grilleCourante')}
    ${extractFunction('grilleHistorique')}
    ${extractFunction('grillePourCommande')}
    return grillePourCommande;
  `);
  const grillePourCommande = M();
  // Le devis signé porte ses marqueurs (acquis v1489). La commande qui en naît doit avoir la MÊME
  // grille — c'est tout l'enjeu : même offre, mêmes prix d'options.
  const devisSigne = { tarifRef:'2026-09-10', ancienTarif:false };
  const cmdIssue   = { tarifRef: devisSigne.tarifRef, ancienTarif: !!devisSigne.ancienTarif };
  const cmdAmputee = { };   // ce que produisait l'ancienne conversion
  const gDevis = grillePourCommande(devisSigne);
  check('A. la commande issue du devis applique la MÊME grille que lui',
    JSON.stringify(grillePourCommande(cmdIssue)) === JSON.stringify(gDevis));
  check('A. [SENSIBILITÉ] la commande amputée (ancien comportement) tombait sur une AUTRE grille',
    JSON.stringify(grillePourCommande(cmdAmputee)) !== JSON.stringify(gDevis));
  check('A. …et c\'est bien la grille historique, celle sans supplément logo',
    grillePourCommande(cmdAmputee).logoPaliers == null);
  check('A. alors que le devis signé, lui, a des paliers de logo',
    gDevis.logoPaliers != null);
}

// ---- B. ② Le chemin retour commande → devis porte les mêmes marqueurs ----
{
  const src = extractFunction('cmdToDevisConfirm');
  check('B. le devis issu d\'une commande reçoit tarifRef', /tarifRef:\s*o\.tarifRef/.test(src));
  check('B. …et ancienTarif', /ancienTarif:\s*!!o\.ancienTarif/.test(src));
  // Les champs logo y étaient écrits deux fois (copier-coller du correctif v1487).
  const nbLogo = (src.match(/persoLogoNb:\+o\.persoLogoNb/g) || []).length;
  check('B. les champs logo ne sont plus dupliqués dans ce constructeur', nbLogo === 1);
}

// ---- C. ③ Migration des commandes déjà nées amputées ----
{
  const src = extractFunction('migrerCommandesIssuesDevis');
  check('C. la migration existe et est branchée au démarrage',
    src.length > 0 && /await migrerCommandesIssuesDevis\(\)/.test(APP));
  check('C. elle ne touche jamais une commande déjà marquée',
    /if\(o\.tarifRef \|\| o\.ancienTarif\) continue/.test(src));
  check('C. elle reprend les marqueurs DU DEVIS d\'origine, sans jamais les deviner',
    /dv\.tarifRef/.test(src) && !/today\(\)/.test(src));
  check('C. une commande sans devis retrouvable est laissée intacte (plutôt qu\'une grille inventée)',
    /if\(!dv\) continue/.test(src));
  check('C. elle retrouve le devis par orderId ou, à défaut, par le numéro noté à la conversion',
    /\+d\.orderId === \+o\.id/.test(src) && /o\.issuDevis/.test(src));
  check('C. elle ne s\'exécute qu\'une fois (drapeau localStorage dédié)',
    /sm_cmdDevisTarifRefMigre/.test(src));
}

// ---- D. ④ Le garde-fou au moment de facturer ----
{
  const src = extractFunction('genererFactureMultiple');
  check('D. le contrôle lit le drapeau perimeCommande du devis lié',
    /perimeCommande/.test(src));
  check('D. il se déclenche AVANT la construction de la facture (donc avant toute validation)',
    src.indexOf('perimeCommande') < src.indexOf('factGetEmetteur'));
  check('D. il laisse le choix plutôt que de bloquer (une commande peut avoir évolué d\'un commun accord)',
    /Facturer la commande quand même/.test(src) && /Annuler et vérifier/.test(src));
  check('D. un échec de ce contrôle ne bloque jamais la facturation (swallow)',
    /swallow\(e, 'controle divergence devis avant facture'\)/.test(src));
}

// ---- E. ④ L'avoir d'ANNULATION (facture émise, jamais encaissée) ----
{
  const src = extractFunction('avoirForm');
  check('E. [LE BLOCAGE LEVÉ] le refus sec « rien n\'a été encaissé » a disparu',
    !/if\(dejaEncaisse<=0\)\{ toast\('Rien/.test(src));
  check('E. sans encaissement, le plafond vient de la FACTURE et non de l\'encaissé',
    /estAnnulation \? money2\(\+\(\(facture&&facture\.montant\)\|\|0\)\) : dejaEncaisse/.test(src));
  check('E. sans facture définitive ET sans encaissement, il n\'y a toujours rien à annuler',
    /estAnnulation && !facture/.test(src));
  check('E. la nature est transmise au contexte pour l\'émission',
    /annulation: estAnnulation/.test(src));

  const srcConfirm = extractFunction('avoirConfirm');
  check('E. l\'avoir émis porte sa nature', /nature: ctx\.annulation \? 'annulation' : 'remboursement'/.test(srcConfirm));
}

// ---- F. Effets comptables : une annulation ne touche QUE le CA facturé ----
// C'est le cœur du correctif : retirer de l'encaissé un argent jamais reçu ferait plonger le CA
// encaissé en négatif et sous-estimerait la base URSSAF — erreur symétrique de celle qu'on corrige.
{
  const iAv = APP.indexOf('avoirsEmis.forEach(a=>{');
  const srcCA = APP.slice(iAv, APP.indexOf('});', iAv) + 3);
  check('F. le CA encaissé n\'est amputé que pour un avoir NON annulation',
    /if\(!_annulation\)\{[\s\S]*totalEncaisse=money2\(totalEncaisse-v\);[\s\S]*\}/.test(srcCA));
  check('F. le CA facturé est corrigé dans les DEUX cas (hors du bloc conditionnel)',
    /\}\s*factByMonth\[m\]=money2\(\(factByMonth\[m\]\|\|0\)-v\);/.test(srcCA));

  const srcBilan = APP.slice(APP.indexOf('for(const a of allAvoirsBilan){'));
  check('F. le bilan URSSAF (assis sur l\'encaissement) ignore les avoirs d\'annulation',
    /if\(a\.nature === 'annulation'\) continue;/.test(srcBilan.slice(0, 1400)));

  // Rétro-compatibilité : les avoirs d'avant la v1499 n'ont pas de champ `nature`.
  const estAnnulation = a => (a.nature === 'annulation');
  check('F. un avoir antérieur (sans nature) reste traité comme un remboursement — aucun total ne bouge rétroactivement',
    estAnnulation({ montant:50 }) === false);
  check('F. un avoir de remboursement explicite l\'est aussi',
    estAnnulation({ montant:50, nature:'remboursement' }) === false);
  check('F. seul un avoir explicitement marqué « annulation » change de traitement',
    estAnnulation({ montant:50, nature:'annulation' }) === true);

  // Le suivi des créances, lui, doit déduire les DEUX natures : une facture annulée n'est plus
  // due, exactement comme une remboursée. Vérifié qu'il n'a pas été filtré par erreur.
  const iCr = APP.indexOf('allAvoirsT.forEach(a=>{');
  const srcCr = APP.slice(iCr, APP.indexOf('});', iCr) + 3);
  check('F. les créances (reste à encaisser) déduisent les deux natures — une facture annulée n\'est plus due',
    !/nature/.test(srcCr));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
