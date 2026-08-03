'use strict';
// v1441 — RAPPEL DE DIVISION BICOLORE. Demande de Ben : pour un parfum bicolore (ex. praliné =
// coques marron foncé + blanc), rien ne rappelait de diviser la meringue en 2 couleurs — il devait
// passer par le mode « duo » (2-3 parfums) et simuler un faux 2e parfum juste pour faire
// apparaître un sélecteur de couleurs, alors que sa recette est mono-parfum.
//
// Décision de Ben (2 questions posées, 2 réponses) : UN SEUL lot de coques, comme aujourd'hui —
// rien ne change au modèle de données ni au stock — juste un rappel clair, TOUJOURS 50/50 (pas de
// curseur : COQUES_PAR_MACARON=2 garantit un total pair, donc la moitié est toujours entière).
'use strict';
const { APP, stripComments, extractFunction, extractConstLine } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// _extract.js ne sait pas encore extraire un objet littéral multi-lignes (extractArrayConst est
// borné à '];'). Petit complément LOCAL, construit sur le MÊME stripComments durci (v1327) plutôt
// que de réécrire un stripper — règle du projet : un seul stripper, jamais un second.
function extractObjectConst(name){
  const idx = APP.indexOf('const ' + name + ' = {');
  if(idx===-1) throw new Error('Introuvable (object): '+name);
  const clean = stripComments(APP.slice(idx));
  const i = clean.indexOf('{');
  let depth=0, inStr=null, esc=false;
  for(let j=i;j<clean.length;j++){
    const c=clean[j];
    if(inStr){ if(esc){esc=false;} else if(c==='\\'){esc=true;} else if(c===inStr){inStr=null;} continue; }
    if(c==='"'||c==="'"||c==='`'){ inStr=c; continue; }
    if(c==='{') depth++;
    else if(c==='}'){ depth--; if(depth===0) return clean.slice(0,j+1)+';'; }
  }
  throw new Error('Accolades non équilibrées: '+name);
}

// ---- Construit le vrai module à partir des vraies sources extraites ----
const src = [
  extractConstLine('round3'),
  extractConstLine('esc'),
  extractConstLine('qty'),
  extractConstLine('COQUES_PAR_MACARON'),
  extractObjectConst('COQUE_COULEURS'),
  extractFunction('coqueCouleurLabel'),
  extractFunction('coqueCouleurHex'),
  extractFunction('coqueCouleurPastille'),
  extractFunction('recCoqueColors'),
  extractFunction('recEstBicolore'),
  extractFunction('_bicoloreRappelHtml'),
].join('\n');

function buildModule(){
  const fn = new Function(`
    ${src}
    return { recEstBicolore, recCoqueColors, _bicoloreRappelHtml, coqueCouleurLabel };
  `);
  return fn();
}
const M = buildModule();

// ---- A. Recette bicolore (praliné-like) : rappel présent, split exact 50/50 ----
{
  const rec = { produitNom:'Praliné', coqueColors:['marron_fonce','blanc'] };
  check('A. recEstBicolore détecte bien 2 couleurs différentes', M.recEstBicolore(rec) === true);
  const html = M._bicoloreRappelHtml(rec, 60);   // 60 macarons → 120 coques → 60/60
  check('A. le rappel mentionne "bicolore"', /bicolore/i.test(html));
  check('A. le rappel mentionne le nom du parfum', html.includes('Praliné'));
  check('A. split exact 60/60 (120 coques ÷ 2)', /60 coques marron fonc/.test(html) && /60 coques blanc/.test(html));
}

// ---- B. Quantité impaire de macarons : le total en coques reste toujours pair (×2), donc la
// moitié est toujours un entier exact — jamais de .5 affiché. ----
{
  const rec = { produitNom:'Praliné', coqueColors:['marron_fonce','blanc'] };
  const html = M._bicoloreRappelHtml(rec, 37);   // 37 macarons → 74 coques → 37/37
  check('B. split toujours entier même à quantité impaire de macarons (37/37)',
    /37 coques marron fonc/.test(html) && /37 coques blanc/.test(html) && !html.includes('.5'));
}

// ---- C. Recette MONOCHROME (2× la même couleur) : aucun rappel, jamais ----
{
  const rec = { produitNom:'Vanille', coqueColors:['blanc','blanc'] };
  check('C. recEstBicolore refuse une recette monochrome', M.recEstBicolore(rec) === false);
  check('C. aucun rappel pour une recette monochrome', M._bicoloreRappelHtml(rec, 60) === '');
}

// ---- D. Recette sans couleurs renseignées (ancienne recette) : pas de rappel, pas de plantage ----
{
  check('D. recette sans coqueColors : pas de rappel, pas d\'exception', M._bicoloreRappelHtml({produitNom:'Ancienne'}, 60) === '');
  check('D. recette null : pas de rappel, pas d\'exception', M._bicoloreRappelHtml(null, 60) === '');
}

// ---- E. Le formulaire de lancement montre désormais le rappel en mode 'complet' (pas seulement
// 'composant'+coques comme avant) — c'est justement le mode par défaut, le plus emprunté. ----
{
  const srcCompSwitch = extractFunction('prodCompSwitch');
  check("E. prodCompSwitch inclut désormais le mode 'complet'", /mode\s*===\s*'complet'/.test(srcCompSwitch));
  check('E. prodCompSwitch continue de couvrir composant+coques (non-régression)',
    /mode\s*===\s*'composant'\s*&&\s*comp\s*===\s*'coques'/.test(srcCompSwitch));
}

// ---- F. La fiche de production TOUJOURS affichée après lancement (ficheRecetteProduction)
// inclut le rappel, sauf pour le composant 'ganache' seul (pas de coques dedans). ----
{
  const srcFiche = extractFunction('ficheRecetteProduction');
  check('F. ficheRecetteProduction appelle _bicoloreRappelHtml', /_bicoloreRappelHtml\(/.test(srcFiche));
  check("F. le rappel est exclu pour le composant 'ganache' seul", /composant\s*!==\s*'ganache'/.test(srcFiche));
}

// ---- G. Preuve par réintroduction : l'ancienne condition (composant seul) aurait laissé le mode
// 'complet' — le chemin le plus emprunté par Ben — sans AUCUN rappel. ----
{
  const ancienneCondition = (mode, comp) => (mode==='composant' && comp==='coques');
  check("G. réintroduction : l'ancienne condition ne couvrait PAS le mode complet (c'était le trou)",
    ancienneCondition('complet','coques') === false);
  const nouvelleCondition = (mode, comp) => (mode==='complet') || (mode==='composant' && comp==='coques');
  check('G. la nouvelle condition couvre bien le mode complet', nouvelleCondition('complet','coques') === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
