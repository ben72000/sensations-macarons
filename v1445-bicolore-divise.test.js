'use strict';
// v1445 — DIVISER UN PARFUM BICOLORE EN 2 LOTS, COMME UNE MERINGUE MUTUALISÉE. Ben, après avoir
// essayé le simple rappel de la v1441 : « Praliné ne se divise pas en 2 comme souhaité. Je veux
// que le comportement des coques bicolore soit identique à une meringue mutualisée car au final
// c'est le même principe. Ainsi je dois avoir d'un côté une couleur de coque puis de l'autre côté
// la deuxième couleur. […] la même chose que si je décidais de scinder ma meringue en 2 pour
// faire vanille et chocolat au lait (coques marrons et blanches). »
//
// LE RISQUE PRINCIPAL : un batch DÉJÀ virtuellement divisé 50/50 par la recette (comportement
// v1441, inchangé par défaut) ne doit JAMAIS se retrouver re-divisé une seconde fois quand il
// porte en plus une couleur EXPLICITE (moitié réelle d'un parfum vraiment divisé). Trois moteurs
// lisent la couleur d'un lot de coques (stock potentiel, suggestions d'assemblage, suggestions de
// dégustation) : les trois sont vérifiés séparément, plus une RÉCONCILIATION qui prouve que diviser
// en 2 lots réels donne EXACTEMENT le même total assemblable qu'un seul lot combiné (l'un ne doit
// pas produire plus ou moins de macarons assemblables que l'autre).
const path = require('path');
const { extractFunction, extractConstLine, APP, stripComments } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// _extract.js ne sait pas extraire un objet littéral multi-lignes (extractArrayConst est borné à
// '];'). Même complément que dans v1441 : construit sur stripComments (déjà durci), pas un second
// stripper.
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

// ---- Module des fonctions PURES de couleur ----
const srcColor = [
  extractConstLine('round3'),
  extractConstLine('esc'),
  extractConstLine('qty'),
  extractConstLine('COQUES_PAR_MACARON'),
  extractObjectConst('COQUE_COULEURS'),
  extractFunction('coqueCouleurLabel'),
  extractFunction('coqueCouleurHex'),
  extractFunction('coqueCouleurPastille'),
  extractObjectConst('COQUE_COULEUR_CODES'),
  extractFunction('coqueCouleurCode'),
  extractFunction('recCoqueColors'),
  extractFunction('recEstBicolore'),
  extractFunction('coqueColorProfile'),
  extractFunction('coquesPourCouleur'),
].join('\n');
const Color = new Function(`
  ${srcColor}
  return { recCoqueColors, recEstBicolore, coqueColorProfile, coqueCouleurCode, coquesPourCouleur, coqueCouleurLabel, COQUE_COULEURS };
`)();

// ---- A. coqueCouleurCode : code court explicite, style FLAVOR_CODES ----
// [v1447] Ben : le code du blanc donnait "BAN" (filtre anti-ambiguïté I/L/O de l'ancien calcul
// algorithmique, qui retirait le L de BLANC) — il voulait "BLA". En creusant, l'algorithme ne
// collisionnait pas QUE sur le blanc : les 4 marrons donnaient tous "MAR", les 2 rouges "RUG",
// les 2 verts "VER", les 2 jaunes "JAU" — deux couleurs différentes, un même code de lot. Passage
// à une table explicite (comme FLAVOR_CODES pour les parfums) : corrige la demande de Ben ET
// élimine les 4 collisions qu'il n'avait pas signalées.
check('A. code du blanc = "BLA" (demande explicite de Ben, pas "BAN")', Color.coqueCouleurCode('blanc') === 'BLA');
check('A. code court pour "Marron foncé"', Color.coqueCouleurCode('marron_fonce') === 'MAF');
check('A. deux couleurs différentes donnent des codes différents (distinction du lot garantie)',
  Color.coqueCouleurCode('marron_fonce') !== Color.coqueCouleurCode('blanc'));
check('A. AUCUNE collision sur l\'ensemble des 14 couleurs cataloguées (chaque code est unique)', (() => {
  const vus = new Set();
  for(const k of Object.keys(Color.COQUE_COULEURS)){
    const c = Color.coqueCouleurCode(k);
    if(vus.has(c)) return false;
    vus.add(c);
  }
  return vus.size === Object.keys(Color.COQUE_COULEURS).length;
})());
check('A. repli algorithmique pour une couleur future, non cataloguée (pas de plantage)',
  Color.coqueCouleurCode('couleur_inconnue_pas_encore_ajoutee').length > 0);

// ---- B. coqueColorProfile : la couleur EXPLICITE prime sur celles de la recette ----
{
  const recBicolore = { id:1, produitNom:'Praliné', coqueColors:['marron_fonce','blanc'], grandFormat:false };
  const recById = { 1: recBicolore };
  const lotCombine = { recipeId:1 };                          // pas de couleur → comportement d'avant
  const lotDivise  = { recipeId:1, couleur:'marron_fonce' };  // moitié réelle, couleur explicite
  const pC = Color.coqueColorProfile(lotCombine, recById);
  const pD = Color.coqueColorProfile(lotDivise, recById);
  check('B. sans couleur explicite : profil = les 2 couleurs de la recette (comportement v1441 inchangé)',
    JSON.stringify(pC.colors) === JSON.stringify(['marron_fonce','blanc']));
  check('B. avec couleur explicite : profil = CETTE seule couleur, même si la recette en porte 2',
    JSON.stringify(pD.colors) === JSON.stringify(['marron_fonce']));
  check('B. une couleur explicite invalide (absente du catalogue) est ignorée, repli sur la recette',
    JSON.stringify(Color.coqueColorProfile({recipeId:1, couleur:'inexistante'}, recById).colors) === JSON.stringify(['marron_fonce','blanc']));
  check('B. recette monochrome : profil = les 2 entrées de la recette (identiques), comme avant (non-régression)',
    JSON.stringify(Color.coqueColorProfile({recipeId:2}, {2:{coqueColors:['blanc','blanc']}}).colors) === JSON.stringify(['blanc','blanc']));
}

// ---- C. coquesPourCouleur (sélecteur d'assemblage) respecte aussi la couleur explicite ----
{
  const recById = { 1: { coqueColors:['marron_fonce','blanc'] } };
  const lots = [
    { id:10, recipeId:1, couleur:'marron_fonce' },   // moitié divisée : SEULEMENT marron
    { id:11, recipeId:1 },                            // lot combiné classique : les 2 couleurs
  ];
  const pourBlanc = Color.coquesPourCouleur(lots, 'blanc', recById);
  check('C. un lot divisé en marron ne ressort PAS pour une recherche "blanc"', !pourBlanc.some(l=>l.id===10));
  check('C. le lot combiné classique ressort bien pour "blanc" (il la contient virtuellement)', pourBlanc.some(l=>l.id===11));
  const pourMarron = Color.coquesPourCouleur(lots, 'marron_fonce', recById);
  check('C. le lot divisé en marron ressort bien pour "marron_fonce"', pourMarron.some(l=>l.id===10));
}

// ---- D. RÉCONCILIATION — computeStockPotentiel : diviser en 2 lots donne EXACTEMENT le même
// total assemblable qu'un seul lot combiné. C'est LE test qui compte : si les deux divergent,
// diviser changerait le stock affiché sans qu'aucune coque n'ait physiquement changé de main. ----
{
  const srcStock = extractFunction('computeStockPotentiel');
  const modStock = new Function(`
    ${extractConstLine('round3')}
    ${extractObjectConst('COQUE_COULEURS')}
    ${extractFunction('prodEstRangee')}
    function prodEstFusionnee(p){ return !!(p && p.fusionneeDans!=null); }
    function prodVendable(p){ return false; }
    function prodComposant(p){ return (p && p.composant) ? p.composant : 'complet'; }
    ${extractFunction('recCoqueColors')}
    ${extractFunction('coqueColorProfile')}
    ${srcStock}
    return { computeStockPotentiel };
  `)();

  const rec = { id:1, produitNom:'Praliné', coqueColors:['marron_fonce','blanc'], grandFormat:false, rendement:60 };
  const recipesById = { 1: rec };
  const ganacheFixe = [
    { id:100, recipeId:1, composant:'ganache', prodStatut:'termine', qteRestante:120 },
  ];

  // Scénario COMBINÉ : 1 lot de 240 coques (= 120 macarons, comportement v1441 par défaut).
  const prodsCombine = ganacheFixe.concat([
    { id:1, recipeId:1, composant:'coques', prodStatut:'termine', qteRestante:240 },
  ]);
  // Scénario DIVISÉ : 2 lots de 120 coques chacun, couleurs explicites (v1445).
  const prodsDivise = ganacheFixe.concat([
    { id:1, recipeId:1, composant:'coques', prodStatut:'termine', qteRestante:120, couleur:'marron_fonce' },
    { id:2, recipeId:1, composant:'coques', prodStatut:'termine', qteRestante:120, couleur:'blanc' },
  ]);

  const rC = modStock.computeStockPotentiel(prodsCombine, recipesById);
  const rD = modStock.computeStockPotentiel(prodsDivise, recipesById);
  check('D. réconciliation : même total assemblable, divisé 50/50 ou combiné (120 macarons)',
    rC.assemblableClassique === 120 && rD.assemblableClassique === 120);

  // Contre-épreuve DISSYMÉTRIQUE — celle qui distingue vraiment le bug. Un split 50/50 donne par
  // coïncidence le même total qu'une double-division virtuelle (moyenne de 2 moitiés égales = la
  // moitié) ; ça ne suffit pas à prouver l'absence de bug. Avec un split INÉGAL (100 marron / 140
  // blanc, 1000 coques de marge sur la ganache) : CORRECT → assemblable = min(100,140) = 100
  // (limité par la couleur la plus rare) ; BUGUÉ (chaque lot re-divisé 50/50 par-dessus sa
  // couleur déjà réelle) → pool marron = 50+70 = 120, pool blanc = 50+70 = 120 → assemblable =
  // min(120,120) = 120. Les deux DIVERGENT : c'est ce test, vérifié par mutation réelle de
  // coqueColorProfile, qui détecte effectivement la régression (100 ≠ 120).
  const prodsAsym = [
    { id:200, recipeId:1, composant:'ganache', prodStatut:'termine', qteRestante:1000 },
    { id:1, recipeId:1, composant:'coques', prodStatut:'termine', qteRestante:100, couleur:'marron_fonce' },
    { id:2, recipeId:1, composant:'coques', prodStatut:'termine', qteRestante:140, couleur:'blanc' },
  ];
  const rAsym = modStock.computeStockPotentiel(prodsAsym, recipesById);
  check('D. contre-épreuve dissymétrique : assemblable = 100 (limité par la couleur la plus rare, PAS 120)',
    rAsym.assemblableClassique === 100);
}

// ---- E. RÉCONCILIATION — assemblySuggestions : même principe, sur le moteur des suggestions
// d'accueil (dashboard). ----
{
  const srcSugg = extractFunction('assemblySuggestions');
  const recipes = [{ id:1, produitNom:'Praliné', coqueColors:['marron_fonce','blanc'], grandFormat:false }];

  function assembler(prods){
    const runner = new Function('window', 'RECIPES', 'PRODS', `
      ${extractConstLine('round3')}
      ${extractConstLine('COQUES_PAR_MACARON')}
      ${extractObjectConst('COQUE_COULEURS')}
      function prodComposant(p){ return (p && p.composant) ? p.composant : 'complet'; }
      ${extractFunction('recCoqueColors')}
      ${extractFunction('coqueColorProfile')}
      ${extractFunction('coqueCouleurLabel')}
      ${extractFunction('coqueCouleurHex')}
      ${extractFunction('coqueCouleurPastille')}
      function prodNomComplet(p){ return 'X'; }
      window = { _allRecipesCache: RECIPES };
      ${srcSugg}
      return assemblySuggestions(PRODS, id=>String(id));
    `);
    return runner({}, recipes, prods);
  }

  const ganacheFixe = [{ id:100, recipeId:1, composant:'ganache', prodStatut:'termine', qteRestante:120, composantCatalogue:false }];
  const prodsCombine = ganacheFixe.concat([{ id:1, recipeId:1, composant:'coques', prodStatut:'termine', qteRestante:240 }]);
  const prodsDivise = ganacheFixe.concat([
    { id:1, recipeId:1, composant:'coques', prodStatut:'termine', qteRestante:120, couleur:'marron_fonce' },
    { id:2, recipeId:1, composant:'coques', prodStatut:'termine', qteRestante:120, couleur:'blanc' },
  ]);
  const outC = assembler(prodsCombine);
  const outD = assembler(prodsDivise);
  const totC = outC.reduce((s,x)=>s+(x.assemblable||0), 0);
  const totD = outD.reduce((s,x)=>s+(x.assemblable||0), 0);
  check('E. assemblySuggestions : même total assemblable, divisé 50/50 ou combiné', totC === 120 && totD === 120);

  // Contre-épreuve dissymétrique — voir D pour le raisonnement complet : un split 50/50 égal
  // donne par coïncidence le même total qu'une double-division virtuelle du bug, ça ne prouve
  // rien à soi seul. Avec 100 marron / 140 blanc (ganache 1000, non limitante) :
  // CORRECT → assemblable = min(100,140) = 100. BUGUÉ → pool marron = pool blanc = 120 (moyenne
  // des deux) → assemblable = 120. Les deux divergent.
  const prodsAsym = [
    { id:200, recipeId:1, composant:'ganache', prodStatut:'termine', qteRestante:1000, composantCatalogue:false },
    { id:1, recipeId:1, composant:'coques', prodStatut:'termine', qteRestante:100, couleur:'marron_fonce' },
    { id:2, recipeId:1, composant:'coques', prodStatut:'termine', qteRestante:140, couleur:'blanc' },
  ];
  const outAsym = assembler(prodsAsym);
  const totAsym = outAsym.reduce((s,x)=>s+(x.assemblable||0), 0);
  check('E. contre-épreuve dissymétrique : assemblable = 100 (limité par la couleur la plus rare, PAS 120)',
    totAsym === 100);
}

// ---- F. prodLancerBicoloreDivise — logique de lancement. enregistrerProduction est STUBBÉE
// (enregistreur d'appels) plutôt que rejouée en entier : sa propre justesse (FIFO, décrément de
// stock…) est déjà couverte ailleurs — le mode duo l'utilise déjà telle quelle depuis la v1379.
// Ce qu'on vérifie ICI, c'est ce que prodLancerBicoloreDivise, LUI, décide : combien d'appels, avec
// quelles couleurs, quelles quantités, quels lots, reliés par quel meringueBatchId. ----
async function testLancement(){
  const srcLancer = [
    extractConstLine('COQUES_PAR_MACARON'),
    extractConstLine('round3'),
    extractConstLine('esc'),
    extractConstLine('qty'),
    extractObjectConst('COQUE_COULEURS'),
    extractFunction('recCoqueColors'),
    extractConstLine('LOT_ALPHABET'),
    extractObjectConst('COQUE_COULEUR_CODES'),
    extractFunction('coqueCouleurCode'),
    extractFunction('coqueCouleurLabel'),
    extractFunction('lotDateJJMMAA'),
    extractFunction('genLotCode'),
    extractFunction('flavorCode'),
    extractFunction('flavorCodeFor'),
    extractFunction('flavorCodeRec'),
    extractObjectConst('FLAVOR_CODES'),
    extractFunction('normTxt'),
    extractFunction('prodLancerBicoloreDivise'),
  ].join('\n');

  async function lancer(rec, qMac){
    const appelsEnreg = [];
    const appelsTache = [];
    let ficheAppelee = null;
    const db = { recipes: { get: async (id) => (id===rec.id ? rec : null) }, productions: { update: async()=>{} } };
    const enregistrerProduction = async (recipeId, qteTh, qteRe, date, lot, dlc, emp, meta) => {
      appelsEnreg.push({ recipeId, qteTh, qteRe, date, lot, meta });
      return appelsEnreg.length;   // id factice
    };
    const prodTaskStartForBatch = (o) => { appelsTache.push(o); return 900+appelsTache.length; };
    const runner = new Function('db', 'closeModal', 'renderProductions', 'toast', 'ficheMeringueProduction',
      'prodTaskStartForBatch', 'swallow', 'enregistrerProduction', `
      return (async () => {
        ${srcLancer}
        await prodLancerBicoloreDivise(${rec.id}, ${qMac}, '2026-08-03');
      })();
    `);
    await runner(db, ()=>{}, ()=>{}, ()=>{},
      (parts, mbid) => { ficheAppelee = { parts, mbid }; },
      prodTaskStartForBatch, ()=>{}, enregistrerProduction);
    return { appelsEnreg, appelsTache, ficheAppelee };
  }

  const praline = { id:1, produitNom:'Praliné', rendement:60, coqueColors:['marron_fonce','blanc'], grandFormat:false };
  const { appelsEnreg, appelsTache, ficheAppelee } = await lancer(praline, 120);

  check('F. exactement 2 appels à enregistrerProduction (2 lots, pas 1, pas 3)', appelsEnreg.length===2);
  const eMarron = appelsEnreg.find(a=>a.meta.couleur==='marron_fonce');
  const eBlanc  = appelsEnreg.find(a=>a.meta.couleur==='blanc');
  check('F. un appel marron et un appel blanc, tous deux présents', !!eMarron && !!eBlanc);
  check('F. split 50/50 exact en COQUES (120 macarons → 120 coques chacun, ×2 par macaron)',
    eMarron && eBlanc && eMarron.qteTh===120 && eBlanc.qteTh===120);
  check('F. facteurQte (macarons) transmis à 60 de chaque côté', eMarron && eBlanc && eMarron.meta.facteurQte===60 && eBlanc.meta.facteurQte===60);
  check('F. composant coques sur les 2 appels (jamais complet — voir la restriction de mode)',
    eMarron && eBlanc && eMarron.meta.composant==='coques' && eBlanc.meta.composant==='coques');
  check('F. les 2 appels partagent le MÊME meringueBatchId (fournée commune)',
    eMarron && eBlanc && eMarron.meta.meringueBatchId && eMarron.meta.meringueBatchId===eBlanc.meta.meringueBatchId);
  check('F. les 2 lots ont des numéros DIFFÉRENTS malgré la même recette (distingués par couleur)',
    eMarron && eBlanc && eMarron.lot !== eBlanc.lot);
  check('F. 2 tâches atelier démarrées, une par couleur', appelsTache.length===2);
  check('F. la fiche combinée est appelée avec les 2 parts et le meringueBatchId partagé',
    ficheAppelee && ficheAppelee.parts.length===2 && ficheAppelee.mbid===eMarron.meta.meringueBatchId);
  check('F. les 2 parts de la fiche portent chacune leur couleur (pour l\'affichage distinct)',
    ficheAppelee && ficheAppelee.parts.every(p=>!!p.couleur) &&
    new Set(ficheAppelee.parts.map(p=>p.couleur)).size===2);

  // Quantité impaire de macarons : le split doit rester exact malgré tout (61 → 31/30 ou 30/31,
  // jamais de moitié de macaron ni de coque orpheline).
  const { appelsEnreg: aImpair } = await lancer(praline, 61);
  const sommeImpair = aImpair.reduce((s,a)=>s+a.meta.facteurQte, 0);
  check('F. quantité impaire : la somme des 2 moitiés reste exacte (61 macarons, aucun perdu)', sommeImpair===61);
  check('F. quantité impaire : chaque moitié est un macaron ENTIER (jamais de .5)',
    aImpair.every(a=>Number.isInteger(a.meta.facteurQte)));

  // Contre-épreuve : recette monochrome → doit refuser, pas diviser en 2 lots identiques.
  const vanille = { id:2, produitNom:'Vanille', rendement:60, coqueColors:['blanc','blanc'], grandFormat:false };
  let msg = 'ok';
  try{ await lancer(vanille, 60); } catch(e){ msg = e.message; }
  check('F. contre-épreuve : une recette monochrome est refusée (message mentionne "bicolore")', /bicolore/i.test(msg));
}

// ---- G. Câblage réel : la case n'apparaît qu'en mode composant+coques, jamais en "complet" ----
{
  const srcHint = extractFunction('prodUpdateCoqueHint');
  check('G. la case de division est gatée par un test de mode (pas montrée inconditionnellement)',
    /modeDivisible/.test(srcHint) && /composant.*coques|coques.*composant/.test(srcHint.replace(/\s+/g,' ')));
  const srcSave = extractFunction('saveProd');
  check('G. saveProd route vers prodLancerBicoloreDivise quand la case est cochée',
    /prodLancerBicoloreDivise/.test(srcSave));
  check('G. le routage est conditionné à composant==="coques" (jamais "complet")',
    /composant\s*===\s*'coques'\s*&&\s*document\.getElementById\('f_bicoloreDiviser'\)/.test(srcSave));
}

// ---- H. enregistrerProduction persiste bien la couleur quand fournie ----
{
  const src = extractFunction('enregistrerProduction');
  check('H. enregistrerProduction écrit couleur:meta.couleur sur le document', /couleur:\s*meta\.couleur/.test(src));
}

testLancement().then(()=>{
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}).catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
