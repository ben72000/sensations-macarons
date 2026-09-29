'use strict';
// v1506 — PISTACHE FRAMBOISE GF : COQUES MOITIÉ ROSE / MOITIÉ VERT, ROSE MUTUALISÉ AVEC MYRTILLE
// FRAMBOISE GF. Ben : « Le framboise pistache grand format nécessite à la fabrication de séparer les
// coques. Je veux faire moitié rose moitié vert. Les roses peuvent être mutualisés avec les macarons
// myrtille framboise grand format. »
//
// Presque tout existait déjà (couleurs par recette v1249, division automatique 50/50 d'un parfum
// bicolore v1449, mutualisation par couleur + taille, plan de fournées par couleur v1252). Ce qui
// manquait :
//   ① la couleur ROSE n'existait pas dans la palette ;
//   ② « Pistache framboise » était reconnu comme « framboise » (rouge/rouge) au pré-remplissage,
//      et Myrtille framboise aussi (le motif « framboise » est testé avant « myrtille framboise ») ;
//   ③ une recette nouvelle, enregistrée sans toucher aux menus couleur, n'avait AUCUNE couleur ;
//   ④ à l'assemblage, partir du lot de la 2e couleur (vert) proposait encore du vert en complément ;
//   ⑤ « Pistache framboise » n'avait pas de code de lot : ses lots s'appelaient FRAGF (framboise).
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

function extractObjConst(name){
  const i = APP.indexOf('const ' + name + ' = ');
  let depth = 0, end = -1, open = APP.indexOf(APP[APP.indexOf('=', i) + 2] === '[' ? '[' : '{', i);
  const o = APP[open], c = o === '[' ? ']' : '}';
  for(let k = open; k < APP.length; k++){
    if(APP[k] === o) depth++;
    else if(APP[k] === c){ depth--; if(depth === 0){ end = k + 1; break; } }
  }
  return APP.slice(i, end) + ';';
}

const M = new Function(`
  let _aiNormCache = null;
  ${extractFunction('_aiNormalizeRaw')}
  ${extractFunction('aiNormalize')}
  ${extractFunction('normTxt')}
  ${extractObjConst('COQUE_COULEURS')}
  ${extractObjConst('COQUE_COULEUR_CODES')}
  ${extractObjConst('COQUE_COULEURS_DEFAUT')}
  ${extractObjConst('FLAVOR_CODES')}
  ${extractFunction('coqueCouleurLabel')}
  ${extractFunction('coqueCouleurCode')}
  ${extractFunction('coqueCouleursDefautPour')}
  ${extractFunction('recCoqueColors')}
  ${extractFunction('recEstBicolore')}
  ${extractFunction('coqueColorProfile')}
  ${extractFunction('coquesMutualisables')}
  ${extractFunction('coquesPourCouleur')}
  ${extractFunction('flavorCode')}
  ${extractFunction('flavorCodeFor')}
  ${extractFunction('flavorCodeRec')}
  ${extractFunction('_sousLotsCoques')}
  const COQUES_PAR_MACARON = 2;
  function round3(n){ return Math.round((+n||0)*1000)/1000; }
  function qty(n){ return String(n); }
  function coqueCouleurPastille(){ return ''; }
  const ORDO = {};
  ${extractFunction('ordoBesoinsCouleur')}
  return { coqueCouleursDefautPour, recEstBicolore, recCoqueColors, coqueColorProfile, coquesMutualisables,
           coquesPourCouleur, flavorCodeRec, _sousLotsCoques, ordoBesoinsCouleur, COQUE_COULEURS, COQUE_COULEUR_CODES, aiNormalize };
`)();

const pistacheFramboise = { id: 10, produitNom: 'Pistache framboise', grandFormat: true, coqueColors: ['rose','vert_pistache'] };
const myrtilleGF        = { id: 11, produitNom: 'Myrtille framboise', grandFormat: true, coqueColors: ['rose','rose'] };
const myrtilleStd       = { id: 12, produitNom: 'Myrtille framboise', grandFormat: false, coqueColors: ['rose','rose'] };
const recById = { 10: pistacheFramboise, 11: myrtilleGF, 12: myrtilleStd };

// ---- A. ① La couleur rose existe, avec un code de lot propre ----
check('A. « Rose » fait partie de la palette des coques', !!M.COQUE_COULEURS.rose);
check('A. elle a son code de lot (ROS)', M.COQUE_COULEUR_CODES.rose === 'ROS');
{
  const codes = Object.values(M.COQUE_COULEUR_CODES);
  check('A. aucun code de couleur en double (sinon deux moitiés indiscernables au lot)', new Set(codes).size === codes.length);
}

// ---- B. ② Pré-remplissage : Pistache framboise = rose + vert, plus jamais rouge ----
check('B. [LE PIÈGE] « Pistache framboise » → rose + vert pistache (et non rouge/rouge via « framboise »)',
  JSON.stringify(M.coqueCouleursDefautPour('Pistache framboise')) === JSON.stringify(['rose','vert_pistache']));
check('B. l\'ordre inverse du nom est reconnu aussi', JSON.stringify(M.coqueCouleursDefautPour('Framboise pistache')) === JSON.stringify(['rose','vert_pistache']));
check('B. non-régression : « Pistache » seule reste vert/vert', JSON.stringify(M.coqueCouleursDefautPour('Pistache')) === JSON.stringify(['vert_pistache','vert_pistache']));
check('B. non-régression : « Framboise » seule reste rouge/rouge', JSON.stringify(M.coqueCouleursDefautPour('Framboise')) === JSON.stringify(['rouge','rouge']));
check('B. c\'est bien un parfum BICOLORE', M.recEstBicolore(pistacheFramboise));

// ---- C. Fabrication : la division moitié rose / moitié vert, avec les bons numéros de lot ----
{
  const lots = M._sousLotsCoques(10, pistacheFramboise, 60, '270926');
  check('C. 60 macarons → 2 lots de coques', lots.length === 2);
  check('C. moitié rose (30), moitié vert (30)', lots[0].couleur === 'rose' && lots[0].q === 30 && lots[1].couleur === 'vert_pistache' && lots[1].q === 30);
  check('C. ⑤ le code parfum est PFRGF, plus FRAGF (confondable avec une Framboise GF)', lots[0].lot.indexOf('PFRGF') >= 0 && lots[0].lot.indexOf('FRAGF') < 0);
  check('C. les deux moitiés se distinguent au numéro de lot (…ROS / …VPI)', /PFRGFROS-CO$/.test(lots[0].lot) && /PFRGFVPI-CO$/.test(lots[1].lot));
  const impair = M._sousLotsCoques(10, pistacheFramboise, 61, '270926');
  check('C. un nombre impair reste exact (31 + 30 = 61), aucun macaron perdu', impair[0].q + impair[1].q === 61);
}

// ---- D. Mutualisation : les roses se partagent avec Myrtille framboise GF, jamais avec le standard ----
{
  const profilPF = M.coqueColorProfile({ recipeId: 10 }, recById);
  const lotMyrtilleGF  = M.coqueColorProfile({ recipeId: 11 }, recById);
  const lotMyrtilleStd = M.coqueColorProfile({ recipeId: 12 }, recById);
  const lotPFvert      = M.coqueColorProfile({ recipeId: 10, couleur: 'vert_pistache' }, recById);
  check('D. [LE BESOIN] des coques Myrtille framboise GF sont proposées pour monter une Pistache framboise GF',
    M.coquesMutualisables(profilPF, lotMyrtilleGF, null));
  check('D. …et précisément pour la couleur rose', M.coquesMutualisables(profilPF, lotMyrtilleGF, 'rose'));
  check('D. jamais pour la couleur verte (elles ne sont pas vertes)', !M.coquesMutualisables(profilPF, lotMyrtilleGF, 'vert_pistache'));
  check('D. jamais des coques Myrtille framboise STANDARD (taille différente)', !M.coquesMutualisables(profilPF, lotMyrtilleStd, null));
  check('D. dans l\'autre sens : la moitié rose de Pistache framboise peut servir une Myrtille framboise GF',
    M.coquesMutualisables(lotMyrtilleGF, M.coqueColorProfile({ recipeId: 10, couleur: 'rose' }, recById), null));
  check('D. mais pas sa moitié verte', !M.coquesMutualisables(lotMyrtilleGF, lotPFvert, null));

  const stock = [{ id: 1, recipeId: 11 }, { id: 2, recipeId: 12 }, { id: 3, recipeId: 10, couleur: 'vert_pistache' }, { id: 4, recipeId: 10, couleur: 'rose' }];
  const roses = M.coquesPourCouleur(stock, 'rose', recById, profilPF).map(l => l.id).sort();
  check('D. lots roses proposés pour Pistache framboise GF : Myrtille GF + sa propre moitié rose (pas le standard)', JSON.stringify(roses) === JSON.stringify([1, 4]));
}

// ---- E. Plan de fournées par couleur : UNE réserve « Rose (GF) » pour les deux parfums ----
{
  const recByNom = { [M.aiNormalize('Pistache framboise')]: pistacheFramboise, [M.aiNormalize('Myrtille framboise')]: myrtilleGF };
  const items = M.ordoBesoinsCouleur([{ nom: 'Pistache framboise', qte: 40 }, { nom: 'Myrtille framboise', qte: 30 }], recByNom);
  const rose = items.find(i => i.couleur === 'rose' && i.gf);
  const vert = items.find(i => i.couleur === 'vert_pistache' && i.gf);
  check('E. une seule ligne « Rose (GF) » regroupe les deux parfums', !!rose && Object.keys(rose.parfums).length === 2);
  check('E. rose = 40 coques (Pistache framboise, 1 par macaron) + 60 (Myrtille framboise, 2 par macaron) = 100', rose && rose.coques === 100);
  check('E. vert = 40 coques, pour Pistache framboise seule', vert && vert.coques === 40 && Object.keys(vert.parfums).length === 1);
}

// ---- F. ③ Recette nouvelle enregistrée sans toucher aux couleurs : défaut du nom appliqué ----
{
  const src = extractFunction('saveRec');
  check('F. saveRec applique le défaut du nom quand aucune couleur n\'a été choisie', /if\(!out\.length\)\{ const def = coqueCouleursDefautPour\(val\('f_nom'\)/.test(src));
  check('F. …sans jamais passer par-dessus un choix fait dans les menus', src.indexOf('if(!out.length)') > src.indexOf("if(b && COQUE_COULEURS[b]) out.push(b);"));
}

// ---- G. ④ Assemblage : on propose la couleur MANQUANTE, pas toujours la 2e de la recette ----
{
  const i = APP.indexOf('const _coul2 = !_bicolore');
  const bloc = APP.slice(i, i + 200);
  const choisir = new Function('_bicolore', '_coulCible', 'p', bloc.slice(0, bloc.indexOf(';') + 1) + ' return _coul2;');
  check('G. [LE DÉFAUT CORRIGÉ] depuis le lot VERT, on propose du ROSE', choisir(true, ['rose','vert_pistache'], { couleur: 'vert_pistache' }) === 'rose');
  check('G. depuis le lot ROSE, on propose du VERT', choisir(true, ['rose','vert_pistache'], { couleur: 'rose' }) === 'vert_pistache');
  check('G. non-régression : lot sans couleur (bicolore entier) → 2e couleur, comme avant', choisir(true, ['rose','vert_pistache'], {}) === 'vert_pistache');
  check('G. non-régression : parfum monochrome → aucune 2e couleur imposée', choisir(false, ['rose','rose'], {}) === '');
}

// ---- H. Migration des recettes existantes ----
(async () => {
  const src = extractFunction('migrateCoquesRoseV1506');
  const run = async (recettes, dejaFait) => {
    const store = {}; if(dejaFait) Object.assign(store, dejaFait);
    const ecrits = [];
    const db = { recipes: { toArray: async () => recettes, update: async (id, ch) => { ecrits.push({ id, ch }); const r = recettes.find(x => x.id === id); Object.assign(r, ch); } } };
    const localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } };
    const fn = new Function('db', 'localStorage', 'recCoqueColors', 'aiNormalize', `function swallow(){} function toast(){} ${src}; return migrateCoquesRoseV1506;`)(db, localStorage, M.recCoqueColors, M.aiNormalize);
    const n = await fn();
    return { n, ecrits, store, recettes };
  };

  // Le cas réel probable : les deux recettes pré-remplies en ROUGE par l'ancien ordre des motifs.
  const r1 = await run([
    { id: 1, produitNom: 'Myrtille framboise', grandFormat: true,  coqueColors: ['rouge','rouge'] },
    { id: 2, produitNom: 'Myrtille framboise', grandFormat: false, coqueColors: ['rouge','rouge'] },
    { id: 3, produitNom: 'Pistache framboise', grandFormat: true,  coqueColors: ['rouge','rouge'] },
    { id: 4, produitNom: 'Framboise',          grandFormat: false, coqueColors: ['rouge','rouge'] },
  ]);
  check('H. Myrtille framboise GF passe en rose/rose', JSON.stringify(r1.recettes[0].coqueColors) === '["rose","rose"]');
  check('H. Myrtille framboise STANDARD n\'est pas touchée (Ben n\'a parlé que du grand format)', JSON.stringify(r1.recettes[1].coqueColors) === '["rouge","rouge"]');
  check('H. Pistache framboise passe en rose + vert', JSON.stringify(r1.recettes[2].coqueColors) === '["rose","vert_pistache"]');
  check('H. Framboise n\'est pas touchée', JSON.stringify(r1.recettes[3].coqueColors) === '["rouge","rouge"]');
  check('H. deux recettes modifiées, pas une de plus', r1.n === 2);

  // Une seule fois : si Ben remet une couleur à la main ensuite, elle n'est plus jamais écrasée.
  const r2 = await run([{ id: 1, produitNom: 'Myrtille framboise', grandFormat: true, coqueColors: ['violet','violet'] }], r1.store);
  check('H. passage unique : un choix manuel ultérieur n\'est jamais écrasé', r2.n === 0 && JSON.stringify(r2.recettes[0].coqueColors) === '["violet","violet"]');

  // Pistache framboise pas encore créée : la migration réessaiera au prochain démarrage.
  const r3 = await run([{ id: 1, produitNom: 'Myrtille framboise', grandFormat: true, coqueColors: ['rouge','rouge'] }]);
  check('H. recette pas encore créée : le drapeau N\'est PAS posé (nouvel essai au démarrage suivant)',
    r3.store['sm_coqueRosePistacheFramboise_v1506'] !== '1' && r3.store['sm_coqueRoseMyrtilleGF_v1506'] === '1');

  check('H. la migration est appelée au démarrage APRÈS le pré-remplissage (sinon il remettrait du rouge)',
    APP.indexOf('await migrateCoquesRoseV1506()') > APP.indexOf('await migrateCoqueColors()'));

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
})().catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
