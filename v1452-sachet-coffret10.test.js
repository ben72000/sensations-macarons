'use strict';
// v1452 — SACHET (1 à 3 macarons, 2,50 €/macaron) + COFFRET DE 10 À 22 €. Ben : « Rajouter offre
// dans commande permettant de vendre : un coffret de 10 macarons à 22€. L'emballage par défaut est
// la boîte blanche de 8/10 macarons. Assure toi de rendre les autres emballages selectionnables
// aussi telle que c'est déjà le cas aujourd'hui. — un sachet pouvant contenir de 1 à 3 macarons.
// Prix : 2,5€ par macaron. De manière générale introduire ce nouvel emballage dans tous les écrans
// de commande, y compris vrac. »
//
// LE RISQUE PRINCIPAL de ce chantier : un type de ligne de commande est lu par ~137 endroits
// (production, prix, factures, exports, analytics). Un type INCONNU ne plante pas — il est
// silencieusement ignoré, ou pire, tombe dans un `else` prévu pour autre chose. Un sachet oublié
// dans lineTotalStored vaudrait 0 € sur la facture ; oublié dans le mix produit, il serait compté
// comme un DON (offert). Cette suite vérifie donc chaque point de branchement, un par un.
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

// ---- A. Constantes conformes à la demande chiffrée de Ben ----
{
  const M = new Function(`
    ${extractConstLine('SACHET_PRIX_MACARON')}
    ${extractConstLine('SACHET_MAX')}
    ${extractConstLine('COFFRET10_TAILLE')}
    ${extractConstLine('COFFRET10_PRIX')}
    ${extractConstLine('COFFRET10_EMB_NOM')}
    ${extractObjectConst('BOX_PRICES')}
    ${extractObjectConst('BOX_FLAVOR_LIMIT')}
    return { SACHET_PRIX_MACARON, SACHET_MAX, COFFRET10_TAILLE, COFFRET10_PRIX, COFFRET10_EMB_NOM, BOX_PRICES, BOX_FLAVOR_LIMIT };
  `)();
  check('A. sachet : 2,50 € par macaron', M.SACHET_PRIX_MACARON === 2.5);
  check('A. sachet : maximum 3 macarons', M.SACHET_MAX === 3);
  check('A. coffret de 10 : taille 10', M.COFFRET10_TAILLE === 10);
  check('A. coffret de 10 : prix 22 €', M.COFFRET10_PRIX === 22);
  check('A. coffret de 10 : emballage par défaut = la boîte blanche 8/10', /8\/10/.test(M.COFFRET10_EMB_NOM));
  check('A. BOX_PRICES[10] = 22 € (repli cohérent avec le catalogue)', M.BOX_PRICES[10] === 22);
  check('A. BOX_FLAVOR_LIMIT[10] existe — sans lui, 0 parfum serait sélectionnable pour ce format',
    M.BOX_FLAVOR_LIMIT[10] > 0);
}

// ---- B. RÉCONCILIATION DU PRIX — le modèle d'ÉDITION (parfums en objet) et le modèle STOCKÉ
// (parfums en tableau) sont deux chemins de code différents. S'ils divergent, le prix affiché
// pendant la saisie ne serait pas celui facturé après enregistrement. ----
{
  const deps = [
    extractConstLine('SACHET_PRIX_MACARON'),
    extractConstLine('SACHET_MAX'),
    extractObjectConst('BOX_PRICES'),
    extractObjectConst('BOX_FLAVOR_LIMIT'),
    extractConstLine('FLAVOR_SURCHARGE'),
    extractConstLine('money2'),
    extractConstLine('round3'),
    // [v1463] La tarification est devenue DATÉE : ces fonctions sont désormais nécessaires
    // pour construire lineTotalBase/lineTotalStored. Les lignes de ce test n'ont pas de
    // tarifRef → elles retombent sur la grille historique, ce qui est exactement le
    // comportement attendu pour des commandes antérieures au 01/09/2026.
    extractArrayConstMulti('TARIF_GRILLES'),
    extractFunction('tarifsPour'),
    extractFunction('grilleCourante'),
    extractFunction('grilleHistorique'),
    extractFunction('tarifsDeLigne'),
    // [v1469] Résolveur des lignes EN COURS DE SAISIE. Ici les lignes de test n'ont pas de
    // marqueur et il n'y a pas de formulaire : `tarifsSaisie` est stubbée sur la grille
    // historique, ce qui correspond au comportement attendu pour ces cas anciens.
    "function tarifsSaisie(){ return grilleHistorique(); }",
    extractFunction('tarifsLigneSaisie'),
    extractFunction('sachetPrixPour'),
    extractConstLine('mulMoney'),
    extractConstLine('addMoney'),
    extractConstLine('subMoney'),
  ].join('\n');
  const M = new Function(`
    ${deps}
    function vracPrixMacaron(){ return 1.4; }
    function eventUnitPrice(){ return 1.6; }
    function pyraTotalLigne(){ return 0; }
    function accessoireDecoTotal(){ return 0; }
    function bigPrice(){ return 6; }
    function coffretUnitPrice(ln){ return BOX_PRICES[ln&&ln.taille] || 0; }
    ${extractFunction('lineTotalBase')}
    ${extractFunction('lineTotalStored')}
    return { lineTotalBase, lineTotalStored };
  `)();

  // 3 macarons : 3 × 2,50 = 7,50 €
  const edition = { type:'sachet', parfums:{ 'Pistache':2, 'Vanille':1 } };
  const stocke  = { type:'sachet', parfums:[{nom:'Pistache',qte:2},{nom:'Vanille',qte:1}] };
  check('B. modèle d\'édition : 3 macarons → 7,50 €', M.lineTotalBase(edition) === 7.5);
  check('B. modèle stocké : 3 macarons → 7,50 €', M.lineTotalStored(stocke) === 7.5);
  check('B. RÉCONCILIATION : les deux chemins donnent le MÊME prix',
    M.lineTotalBase(edition) === M.lineTotalStored(stocke));

  // 1 macaron : 2,50 €
  check('B. 1 macaron → 2,50 €', M.lineTotalStored({type:'sachet', parfums:[{nom:'Vanille',qte:1}]}) === 2.5);
  // « sans parfum » compte comme un macaron vendu
  check('B. un macaron « sans parfum déterminé » est facturé comme les autres',
    M.lineTotalStored({type:'sachet', parfums:[], sansParfum:2}) === 5);
  check('B. mélange parfum + sans parfum : 1+1 = 2 macarons = 5 €',
    M.lineTotalStored({type:'sachet', parfums:[{nom:'Vanille',qte:1}], sansParfum:1}) === 5);
  // remise de ligne
  check('B. remise de ligne appliquée (7,50 € − 10 % = 6,75 €)',
    M.lineTotalStored({type:'sachet', parfums:[{nom:'Vanille',qte:3}], remisePct:10}) === 6.75);

  // GARDE ANTI-RÉGRESSION : un sachet ne doit JAMAIS valoir 0 € (le symptôme d'un type oublié).
  check('B. garde : un sachet non vide ne vaut jamais 0 €',
    M.lineTotalStored({type:'sachet', parfums:[{nom:'Vanille',qte:1}]}) > 0);

  // Coffret de 10 au tarif catalogue.
  check('B. coffret de 10 : 22 € (via BOX_PRICES)',
    M.lineTotalStored({type:'coffret', taille:10, parfums:[{nom:'Vanille',qte:10}]}) === 22);
}

// ---- C. RÉCONCILIATION ALLER-RETOUR — saisir un sachet, l'enregistrer, le rouvrir : rien ne doit
// se perdre. C'est le scénario qui aurait silencieusement mangé les données si cmdLinesToStored
// n'avait pas de branche sachet (la ligne aurait disparu du .filter(Boolean)). ----
{
  const M = new Function(`
    ${extractConstLine('money2')}
    ${extractFunction('_parfumsToObj')}
    ${extractFunction('_lineToEdit')}
    return { _lineToEdit };
  `)();
  const stocke = { type:'sachet', parfums:[{nom:'Pistache',qte:2}], sansParfum:1, spMode:'assortiment', remisePct:5 };
  const edit = M._lineToEdit(stocke);
  check('C. réouverture : le type est conservé', edit.type === 'sachet');
  check('C. réouverture : les parfums repassent en OBJET (sinon la grille de saisie casse)',
    edit.parfums && !Array.isArray(edit.parfums) && edit.parfums['Pistache'] === 2);
  check('C. réouverture : les macarons sans parfum sont conservés', edit.sansParfum === 1);
  check('C. réouverture : la remise de ligne est conservée', edit.remisePct === 5);
}

// ---- D. Câblage : chaque point de branchement connaît le sachet ----
{
  const points = [
    ['cmdLinesToStored',    'enregistrement (sans ça, la ligne disparaît en silence)'],
    ['_lineToEdit',         'réouverture pour édition'],
    ['lineTotalBase',       'prix pendant la saisie'],
    ['lineTotalStored',     'prix d\'une commande enregistrée'],
    ['orderFlavorNeeds',    'besoins en macarons par parfum (production)'],
    ['orderTotalMacarons',  'nombre total de macarons'],
    ['addLine',             'bouton d\'ajout'],
    ['drawLines',           'affichage de la ligne dans le formulaire'],
    ['saveCmd',             'validation avant enregistrement'],
    ['factLineDesc',        'libellé sur la facture (texte)'],
    ['factLineDescHtml',    'libellé sur la facture (HTML)'],
    ['computeOrderMargins', 'calcul de marge / CA marchandise'],
    ['collectOrderExport',  'export de la commande'],
    ['estimateOrderMaterialCost', 'coût matières estimé'],
  ];
  points.forEach(([fn, quoi])=>{
    let src=''; try{ src = extractFunction(fn); }catch(e){ src=''; }
    check(`D. ${fn} connaît le sachet — ${quoi}`, /['"]sachet['"]/.test(src));
  });
}

// ---- E. Le sachet n'est PAS confondu avec un don (0 €) dans le mix produit ----
{
  // La clé du mix produit se choisit par une cascade de else-if terminée par `else key='Don'`.
  // Un type non listé y tomberait — et un sachet payant serait rangé parmi les produits offerts.
  const src = APP.slice(APP.indexOf("else key='Don';") - 700, APP.indexOf("else key='Don';") + 20);
  check('E. le sachet a sa propre clé de mix produit AVANT le repli « Don »', /key='Sachet'/.test(src));
}

// ---- F. Coffret de 10 : la migration est idempotente et ne réécrit pas un réglage existant ----
{
  const src = extractFunction('seedCoffret10');
  check('F. la migration vérifie l\'existence du coffret 10 avant de l\'ajouter (idempotente)',
    /some\(p=>\+p\.taille===COFFRET10_TAILLE\)/.test(src));
  check('F. la migration vérifie l\'existence de la boîte blanche avant de la créer',
    /embExiste/.test(src) && /categorie==='emballage'/.test(src));
  const srcSeed = extractFunction('seedProducts');
  check('F. seedProducts reste réservée au catalogue VIDE (d\'où la migration séparée)',
    /if\(n>0\)\s*return;/.test(srcSeed));
}

// ---- G. Emballage par défaut du coffret 10, SANS verrouiller les autres choix ----
{
  const src = extractFunction('setCoffretTaille');
  check('G. choisir la taille 10 pré-sélectionne un emballage', /COFFRET10_TAILLE/.test(src));
  check('G. le défaut pointe la boîte blanche par son nom', /COFFRET10_EMB_NOM/.test(src));
  check('G. le défaut passe par le mode « autre » — donc la liste complète reste accessible',
    /embMode='autre'/.test(src));
  // Le sélecteur d'emballage lui-même ne doit pas avoir été restreint : les 3 modes existent encore.
  // Lu sur le TEXTE BRUT de drawCoffretLine plutôt que via extractFunction : cette fonction contient
  // des templates imbriqués (`${cond ? \`…\` : \`…\`}`) que l'extracteur tronque (limite connue,
  // cf. v1446/v1449). Le code applicatif est correct ; c'est l'outil de test qui ne peut pas le lire.
  const iDraw = APP.indexOf('function drawCoffretLine');
  const srcDraw = APP.slice(iDraw, APP.indexOf('function setCoffretSansParfum', iDraw));
  check('G. les 3 modes d\'emballage restent proposés (standard / réutilisable / autre)',
    /value="standard"/.test(srcDraw) && /value="reutilisable"/.test(srcDraw) && /value="autre"/.test(srcDraw));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
