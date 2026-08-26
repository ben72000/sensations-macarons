'use strict';
// v1486 — LA PERSONNALISATION LOGO ÉTAIT INSAISISSABLE. Ben : « je veux que tu intègres la
// personnalisation logo » puis, après vérification : « tu as vérifié si c'était aussi accessible
// depuis devis facture ? Car je ne le vois pas ».
//
// 🚨 CE QUI EXISTAIT DÉJÀ (livré en v1463) : le barème dégressif, le calcul, le forfait création,
// et l'affichage sur devis ET facture (`factLogoLignes`, appelé aux 4 endroits). Tout était juste.
//
// 🚨 LE DÉFAUT : le bloc de saisie était en `display:none` TANT QUE LA VALEUR N'ÉTAIT PAS DÉJÀ > 0.
// Il ne s'affichait donc que s'il avait déjà été rempli — la PREMIÈRE saisie était impossible. Les
// devis et factures ne pouvaient jamais recevoir de valeur : ils affichaient fidèlement un zéro.
// Le bloc perso COULEURS juste au-dessus a une case à cocher qui le révèle ; le bloc logo n'en
// avait aucune. C'est l'oubli — encore la famille « fonction juste, jamais atteignable ».
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

const grille = { logoPaliers:[{jusqua:99,prix:1.00},{jusqua:300,prix:0.80},{jusqua:Infinity,prix:0.70}], forfaitCreation:40 };
const M = new Function('_grilleOption','money2', `
  ${extractFunction('logoPrixUnitPour')}
  ${extractFunction('logoMontantPour')}
  ${extractFunction('forfaitCreationPour')}
  return { logoPrixUnitPour, logoMontantPour, forfaitCreationPour };
`)(()=>grille, n=>Math.round(n*100)/100);

// ---- A. LE BARÈME DE BEN : 0-100 → 1 € · 100-300 → 0,80 € · +300 → 0,70 € ----
{
  check('A. 1 macaron → 1,00 €', M.logoPrixUnitPour(1) === 1.00);
  check('A. 99 → 1,00 €', M.logoPrixUnitPour(99) === 1.00);
  check('A. 100 → 0,80 € (borne incluse dans la tranche du dessous)', M.logoPrixUnitPour(100) === 0.80);
  check('A. 300 → 0,80 € (borne incluse)', M.logoPrixUnitPour(300) === 0.80);
  check('A. 301 → 0,70 €', M.logoPrixUnitPour(301) === 0.70);
  check('A. 1000 → 0,70 €', M.logoPrixUnitPour(1000) === 0.70);
  // Le palier s'applique sur TOUT le volume, pas par tranche.
  check('A. 150 macarons = 120,00 € (150 × 0,80, pas un cumul par tranche)', M.logoMontantPour(150) === 120);
  check('A. 500 macarons = 350,00 €', M.logoMontantPour(500) === 350);
  check('A. 0 macaron = 0 €', M.logoMontantPour(0) === 0);
  check('A. une quantité négative ne crée pas de crédit', M.logoMontantPour(-50) === 0);
}

// ---- A bis. LES PALIERS RÉELS DE L'APP (et pas seulement ceux du test) ----
// ⚠️ TROU DÉTECTÉ PAR MUTATION : la section A teste le calcul avec une grille écrite DANS le test.
// Modifier les paliers dans app.js passait donc inaperçu. On vérifie ici la grille RÉELLE.
{
  const m = APP.match(/logoPaliers:\[([^\]]+)\]/);
  check('A bis. la grille courante définit bien des paliers logo', !!m);
  if(m){
    const paliers = [...m[1].matchAll(/\{jusqua:\s*([\w.]+),\s*prix:\s*([\d.]+)\}/g)]
      .map(x => ({ jusqua: x[1], prix: parseFloat(x[2]) }));
    check('A bis. trois paliers, comme le barème de Ben', paliers.length === 3);
    check('A bis. 1er palier à 1,00 € jusqu\'à 99 (donc 100 bascule au suivant)',
      paliers[0] && paliers[0].prix === 1.00 && paliers[0].jusqua === '99');
    check('A bis. 2e palier à 0,80 € jusqu\'à 300 inclus',
      paliers[1] && paliers[1].prix === 0.80 && paliers[1].jusqua === '300');
    check('A bis. 3e palier à 0,70 € au-delà',
      paliers[2] && paliers[2].prix === 0.70 && paliers[2].jusqua === 'Infinity');
  }
  const f = APP.match(/forfaitCreation:\s*(\d+)/);
  check('A bis. le forfait création vaut bien 40 €', f && parseInt(f[1],10) === 40);
}

// ---- B. INDÉPENDANCE des deux personnalisations (demande explicite de Ben) ----
{
  const srcLogo = extractFunction('logoMontantPour');
  check('B. le calcul logo n\'utilise pas le tarif couleurs', !/persoCouleur|PERSO_PRIX_UNIT/.test(srcLogo));
  check('B. le forfait création est un NOMBRE de modèles (2 modèles = 2 × 40 €)',
    M.forfaitCreationPour(2) === 80 && M.forfaitCreationPour(1) === 40);
  check('B. pas de forfait si aucun modèle', M.forfaitCreationPour(0) === 0);
}

// ---- C. AVANT LE 01/09/2026 : l'option n'existait pas ----
{
  const M0 = new Function('_grilleOption','money2', `
    ${extractFunction('logoPrixUnitPour')}
    ${extractFunction('logoMontantPour')}
    ${extractFunction('forfaitCreationPour')}
    return { logoMontantPour, forfaitCreationPour };
  `)(()=>({ logoPaliers:null, forfaitCreation:0 }), n=>Math.round(n*100)/100);
  check('C. grille historique : aucun supplément logo', M0.logoMontantPour(150) === 0);
  check('C. grille historique : aucun forfait création', M0.forfaitCreationPour(2) === 0);
}

// ---- D. LE FIX : le bloc est atteignable ----
{
  // ⚠️ Un gabarit ${…} s'intercale entre l'id et onchange : la regex ne doit pas les exiger collés
  //    (constaté — l'assertion était rouge alors que la case existait bel et bien).
  check('D. une case à cocher révèle le bloc logo',
    /id="f_logo"/.test(APP) && /onchange="cmdLogoToggle\(\)"/.test(APP));
  check('D. …et son libellé dit qu\'elle est indépendante des couleurs',
    /Personnalisation logo <span[^>]*>— independante des couleurs/.test(APP));
  check('D. le bloc n\'est plus conditionné à une valeur déjà saisie',
    /id="f_logoWrap" style="\$\{\(o\.logo\|\|\+o\.persoLogoNb>0\|\|\+o\.forfaitCreationNb>0\)/.test(APP));

  const src = extractFunction('cmdLogoToggle');
  check('D. cocher affiche le bloc', /w\.style\.display = on \? 'block' : 'none'/.test(src));
  check('D. décocher vide la quantité logo', /f_logoNb'\); if\(n\) n\.value = ''/.test(src));
  check('D. …ET le forfait (sinon un supplément resterait facturé sans être visible)',
    /f_forfaitNb'\); if\(f\) f\.value = ''/.test(src));
  check('D. le total est recalculé', /cmdRecalc\(\)/.test(src));

  check('D. le drapeau est PERSISTÉ à l\'enregistrement (sinon le bloc se refermerait)',
    /logo: !!\(document\.getElementById\('f_logo'\)\?\.checked\)/.test(APP));
}

// ---- E. DEVIS ET FACTURE : la ligne s'affiche (ce que Ben ne voyait pas) ----
{
  const F = new Function('_grilleOption','money2','euro','esc','qty', `
    ${extractFunction('logoPrixUnitPour')}
    ${extractFunction('logoMontantPour')}
    ${extractFunction('forfaitCreationPour')}
    ${extractFunction('factLogoLignes')}
    return factLogoLignes;
  `)(()=>grille, n=>Math.round(n*100)/100, n=>n.toFixed(2)+' €', x=>String(x), n=>String(n));

  const html = F(150, 1, {});
  const txt = html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  check('E. la ligne logo apparaît', /Personnalisation logo/.test(txt));
  check('E. avec la quantité et le prix unitaire du palier', /150 macarons/.test(txt) && /0\.80/.test(txt));
  check('E. RÉCONCILIATION : le montant affiché = 150 × 0,80 = 120,00 €', /120\.00/.test(txt));
  check('E. la création graphique a sa propre ligne', /Création graphique/.test(txt) && /40\.00/.test(txt));
  check('E. sans logo, aucune ligne parasite', F(0,0,{}) === '');
  check('E. logo seul, sans forfait', !/Création graphique/.test(F(150,0,{})));

  // Les 4 points d'affichage (devis + facture, écran + impression).
  const n = (APP.match(/factLogoLignes\(/g)||[]).length;
  check(`D→E. la ligne est posée sur tous les documents (${n} appels)`, n >= 5);
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
