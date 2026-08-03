'use strict';
// v1449 — UN PARFUM BICOLORE COMBINÉ À D'AUTRES SE DIVISE AUSSI. Ben, en réaction à v1445/v1448 :
// « t'as pas compris. Si c'est un parfum bicolore la partie de la meringue dédiée à cette couleur
// doit être divisée ! Ainsi si j'ai 240 coques et que je souhaite mutualiser la meringue à part
// égale entre pistache et chocolat passion je devrais faire : Pistache = 120 coques / Chocolat
// passion = 60 coques marrons + 60 coques orange. Ainsi la recette doit s'ajuster en
// conséquence. »
//
// v1445 ne gérait que le cas d'UN SEUL parfum bicolore, à part, opt-in via une case à cocher. Ce
// que Ben décrit ici combine les deux mécanismes déjà en place (mode duo pour 2+ parfums
// différents, et la division bicolore) — et ce n'est plus une case à cocher : « la recette doit
// s'ajuster » se lit comme un comportement systématique, pas une option.
//
// LE TEST QUI COMPTE : reproduire EXACTEMENT le scénario chiffré de Ben (120 macarons Pistache +
// 120 macarons Chocolat passion, bicolore marron foncé/orange) et vérifier que le lancement réel
// (saveProd, branche duo) ET l'aperçu (prodDuoApercu) produisent tous deux exactement Pistache
// 120 coques, Chocolat passion marron 60 coques, Chocolat passion orange 60 coques — jamais un
// autre découpage, jamais une divergence entre l'aperçu et ce qui est réellement sauvegardé.
const { extractFunction, extractConstLine, APP, stripComments } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

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

// ---- Données du scénario de Ben, réutilisées par toutes les sections ----
const PISTACHE = { id:2, produitNom:'Pistache', rendement:60, grandFormat:false, coqueColors:['vert_pistache','vert_pistache'] };
const CHOCOLAT_PASSION = { id:1, produitNom:'Chocolat passion', rendement:60, grandFormat:false, coqueColors:['marron_fonce','orange'] };

// ---- A. _sousLotsCoques — le moteur partagé, en isolation ----
{
  const src = [
    extractConstLine('COQUES_PAR_MACARON'),
    extractObjectConst('COQUE_COULEURS'),
    extractFunction('coqueCouleurLabel'),
    extractFunction('coqueCouleurHex'),
    extractFunction('coqueCouleurPastille'),
    extractObjectConst('COQUE_COULEUR_CODES'),
    extractFunction('coqueCouleurCode'),
    extractFunction('recCoqueColors'),
    extractFunction('recEstBicolore'),
    extractConstLine('LOT_ALPHABET'),
    extractObjectConst('FLAVOR_CODES'),
    extractFunction('normTxt'),
    extractFunction('flavorCode'),
    extractFunction('flavorCodeFor'),
    extractFunction('flavorCodeRec'),
    extractFunction('_sousLotsCoques'),
  ].join('\n');
  const M = new Function(`${src}\nreturn { _sousLotsCoques };`)();

  const baseD = '030826';
  const soloPistache = M._sousLotsCoques(2, PISTACHE, 120, baseD);
  check('A. parfum mono-couleur (Pistache) : exactement 1 sous-lot', soloPistache.length===1);
  check('A. le sous-lot mono-couleur porte TOUTE la quantité (120), pas de couleur explicite',
    soloPistache[0].q===120 && soloPistache[0].couleur===undefined);

  const soloChoco = M._sousLotsCoques(1, CHOCOLAT_PASSION, 120, baseD);
  check('A. parfum bicolore (Chocolat passion) : exactement 2 sous-lots', soloChoco.length===2);
  check('A. split 50/50 exact (120 → 60/60)', soloChoco.every(L=>L.q===60));
  check('A. les 2 couleurs de la recette sont bien représentées', 
    new Set(soloChoco.map(L=>L.couleur)).size===2 &&
    soloChoco.some(L=>L.couleur==='marron_fonce') && soloChoco.some(L=>L.couleur==='orange'));
  check('A. les 2 sous-lots ont des numéros de lot DIFFÉRENTS', soloChoco[0].lot !== soloChoco[1].lot);

  // Quantité impaire : jamais de coque orpheline ni de demi-macaron.
  const impair = M._sousLotsCoques(1, CHOCOLAT_PASSION, 61, baseD);
  check('A. quantité impaire (61) : la somme reste exacte', impair.reduce((s,L)=>s+L.q,0)===61);
  check('A. quantité impaire : chaque moitié est un macaron entier', impair.every(L=>Number.isInteger(L.q)));
}

// ---- B. RÉCONCILIATION PRINCIPALE — saveProd (branche duo) reproduit EXACTEMENT le scénario de
// Ben : Pistache 120 mac. (mono, 1 lot de 240 coques) + Chocolat passion 120 mac. (bicolore, 2
// lots de 120 coques chacun). enregistrerProduction est stubbée (enregistreur d'appels) — sa
// propre justesse est couverte ailleurs (duo mode l'utilise sans changement depuis v1379). ----
async function testSaveProdDuo(){
  const srcSave = extractFunction('saveProd');
  const srcDeps = [
    extractConstLine('COQUES_PAR_MACARON'),
    extractObjectConst('COQUE_COULEURS'),
    extractFunction('coqueCouleurLabel'),
    extractFunction('coqueCouleurHex'),
    extractFunction('coqueCouleurPastille'),
    extractObjectConst('COQUE_COULEUR_CODES'),
    extractFunction('coqueCouleurCode'),
    extractFunction('recCoqueColors'),
    extractFunction('recEstBicolore'),
    extractConstLine('LOT_ALPHABET'),
    extractObjectConst('FLAVOR_CODES'),
    extractFunction('normTxt'),
    extractFunction('flavorCode'),
    extractFunction('flavorCodeFor'),
    extractFunction('flavorCodeRec'),
    extractFunction('lotDateJJMMAA'),
    extractFunction('genLotCode'),
    extractFunction('_sousLotsCoques'),
    extractFunction('val'),
  ].join('\n');

  const registry = {
    f_mode: { value: 'duo' },
    f_duoRec1: { value: '1' },   // Chocolat passion en Parfum 1
    f_duoRec2: { value: '2' },   // Pistache en Parfum 2
    f_duoRec3: { value: '' },
    f_duoQte1: { value: '60' },
    f_duoQte2: { value: '60' },
    f_duoQte3: { value: '0' },
    f_date: { value: '2026-08-03' },
  };
  const doc = { getElementById: id => registry[id] || null, querySelector: () => null };
  const db = { recipes: { get: async id => (id===1?CHOCOLAT_PASSION:id===2?PISTACHE:null) },
    productions: { update: async()=>{} } };
  const appelsEnreg = [];
  const appelsTache = [];
  let ficheAppelee = null, toastMsg = null;
  const enregistrerProduction = async (recipeId, qteTh, qteRe, date, lot, dlc, emp, meta) => {
    appelsEnreg.push({ recipeId, qteTh, qteRe, date, lot, meta });
    return appelsEnreg.length;
  };
  const prodTaskStartForBatch = (o) => { appelsTache.push(o); return 900+appelsTache.length; };

  const runner = new Function('document', 'db', 'today', 'toast', 'closeModal', 'renderProductions',
    'ficheMeringueProduction', 'prodTaskStartForBatch', 'swallow', 'enregistrerProduction', 'esc', 'qty', `
    return (async () => {
      ${srcDeps}
      ${srcSave}
      await saveProd();
    })();
  `);
  await runner(doc, db, () => '2026-08-03',
    (msg) => { toastMsg = msg; }, () => {}, () => {},
    (parts, mbid) => { ficheAppelee = { parts, mbid }; },
    prodTaskStartForBatch, () => {}, enregistrerProduction,
    s => s, n => String(n));

  check('B. exactement 3 lots créés (1 Pistache + 2 Chocolat passion)', appelsEnreg.length===3);
  const pist = appelsEnreg.filter(a=>a.recipeId===2);
  const choc = appelsEnreg.filter(a=>a.recipeId===1);
  check('B. Pistache : un seul appel', pist.length===1);
  check('B. Pistache : 60 macarons → 120 coques (×2), quantité ENTIÈRE, aucune couleur explicite',
    pist.length===1 && pist[0].qteTh===120 && pist[0].meta.couleur===undefined);
  check('B. Chocolat passion : deux appels (un par couleur)', choc.length===2);
  const chocMarron = choc.find(a=>a.meta.couleur==='marron_fonce');
  const chocOrange = choc.find(a=>a.meta.couleur==='orange');
  check('B. Chocolat passion marron : présent', !!chocMarron);
  check('B. Chocolat passion orange : présent', !!chocOrange);
  check('B. Chocolat passion : 30 macarons chacun → 60 coques chacun (exactement la moitié de son quota de 120 coques) — les chiffres exacts de Ben (60 marron + 60 orange)',
    chocMarron && chocOrange && chocMarron.qteTh===60 && chocOrange.qteTh===60);
  check('B. les 3 lots partagent le MÊME meringueBatchId (une seule fournée)',
    new Set(appelsEnreg.map(a=>a.meta.meringueBatchId)).size===1 && appelsEnreg[0].meta.meringueBatchId);
  check('B. le total de coques de la fournée est bien 240 — exactement l\'exemple de Ben (120 Pistache + 60 + 60 Chocolat passion)',
    appelsEnreg.reduce((s,a)=>s+a.qteTh,0)===240);
  check('B. 3 tâches atelier démarrées (une par lot réel, pas une par parfum sélectionné)', appelsTache.length===3);
  check('B. la fiche combinée reçoit bien 3 parts (pas 2)', ficheAppelee && ficheAppelee.parts.length===3);
  check('B. le toast mentionne le total exact (240 coques)', toastMsg && /240/.test(toastMsg));
}

// ---- C. RÉCONCILIATION AVEC L'APERÇU — prodDuoApercu (ce que Ben voit AVANT de cliquer) montre
// EXACTEMENT les mêmes 3 sous-lots que ce que B vient de prouver être réellement sauvegardé. Un
// aperçu qui diverge du réel serait pire qu'un aperçu absent. ----
async function testApercuDuo(){
  const srcApercu = extractFunction('prodDuoApercu');
  const srcDeps = [
    extractConstLine('COQUES_PAR_MACARON'),
    extractConstLine('GF_COQUE_RATIO'),
    extractConstLine('MACARONS_PAR_MERINGUE'),
    extractConstLine('round3'),
    extractConstLine('esc'),
    extractConstLine('qty'),
    extractObjectConst('COQUE_COULEURS'),
    extractFunction('coqueCouleurLabel'),
    extractFunction('coqueCouleurHex'),
    extractFunction('coqueCouleurPastille'),
    extractObjectConst('COQUE_COULEUR_CODES'),
    extractFunction('coqueCouleurCode'),
    extractFunction('recCoqueColors'),
    extractFunction('recEstBicolore'),
    extractFunction('lotDateJJMMAA'),
    extractFunction('genLotCode'),
    extractConstLine('LOT_ALPHABET'),
    extractObjectConst('FLAVOR_CODES'),
    extractFunction('normTxt'),
    extractFunction('flavorCode'),
    extractFunction('flavorCodeFor'),
    extractFunction('flavorCodeRec'),
    extractFunction('_sousLotsCoques'),
    extractFunction('_meringueCommuneCalc'),
  ].join('\n');

  const registry = {
    f_duoQte1: { value:'60' }, f_duoQte2: { value:'60' }, f_duoQte3: { value:'0' },
    f_duoRec1: { value:'1', options:[{text:'Chocolat passion (60/batch)'}], selectedIndex:0 },
    f_duoRec2: { value:'2', options:[{text:'Pistache (60/batch)'}], selectedIndex:0 },
    f_duoRec3: { value:'', options:[{text:''}], selectedIndex:0 },
    f_date: { value: '2026-08-03' },
    f_duoApercu: { innerHTML:'' },
  };
  const doc = { getElementById: id => registry[id] || null };
  const db = {
    recipes: { get: async id => (id===1?CHOCOLAT_PASSION:id===2?PISTACHE:null) },
    recipeItems: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    materials: { toArray: async () => [] },
  };
  const fn = new Function('document', 'db', 'today', 'swallow', `
    return (async () => {
      ${srcDeps}
      ${srcApercu}
      await prodDuoApercu();
      return document.getElementById('f_duoApercu').innerHTML;
    })();
  `);
  const html = await fn(doc, db, () => '2026-08-03', () => {});

  check('C. l\'aperçu affiche Pistache (mono, 1 ligne à 60 mac. → 120 coques)', /Pistache[\s\S]{0,80}60 mac\.[\s\S]{0,40}120 coques/.test(html));
  check('C. l\'aperçu affiche Chocolat passion marron foncé et orange (30 mac. → 60 coques chacun)', /marron foncé/i.test(html) && /orange/i.test(html));
  check('C. l\'aperçu affiche 3 lignes de répartition (pas 2) — un par SOUS-LOT réel',
    (html.match(/mac\. →/g)||[]).length===3);
  check('C. la meringue totale annoncée est bien 240 coques std éq. — exactement l\'exemple de Ben', /240 coques std éq/.test(html));
  check('C. l\'aperçu ne montre AUCUN champ "N° lot" trompeur (voir v1448) — juste les vrais codes',
    !html.includes('N° lot de production'));
}

// ---- D. Preuve par réintroduction : si la branche duo n'expansait PAS chaque parfum (ancien
// comportement, 1 def = 1 lot), le scénario de Ben donnerait 2 lots au lieu de 3, et Chocolat
// passion recevrait un seul lot de 120 coques au lieu d'être divisé 60/60. ----
async function testReintroduction(){
  const srcSaveAncien = extractFunction('saveProd').replace(
    'const lance = defs.flatMap((d,i) => _sousLotsCoques(d.rid, recsAll[i], d.q, baseD));',
    `const lance = defs.map((d,i)=>{
      const r=recsAll[i];
      const base=(baseD + flavorCodeRec(r)).toUpperCase().replace(/\\s+/g,'');
      return { rid:d.rid, q:d.q, lot:base+'-CO', base, nom:r.produitNom, rec:r };
    });`
  );
  check('D. préparation : le texte de la branche duo a bien changé (sinon la réintroduction ne prouve rien)',
    !srcSaveAncien.includes('_sousLotsCoques(d.rid'));

  const srcDeps = [
    extractConstLine('COQUES_PAR_MACARON'),
    extractObjectConst('COQUE_COULEURS'),
    extractFunction('coqueCouleurLabel'),
    extractFunction('coqueCouleurHex'),
    extractFunction('coqueCouleurPastille'),
    extractObjectConst('COQUE_COULEUR_CODES'),
    extractFunction('coqueCouleurCode'),
    extractFunction('recCoqueColors'),
    extractFunction('recEstBicolore'),
    extractConstLine('LOT_ALPHABET'),
    extractObjectConst('FLAVOR_CODES'),
    extractFunction('normTxt'),
    extractFunction('flavorCode'),
    extractFunction('flavorCodeFor'),
    extractFunction('flavorCodeRec'),
    extractFunction('lotDateJJMMAA'),
    extractFunction('genLotCode'),
    extractFunction('_sousLotsCoques'),
    extractFunction('val'),
  ].join('\n');
  const registry = {
    f_mode: { value: 'duo' },
    f_duoRec1: { value: '1' }, f_duoRec2: { value: '2' }, f_duoRec3: { value: '' },
    f_duoQte1: { value: '120' }, f_duoQte2: { value: '120' }, f_duoQte3: { value: '0' },
    f_date: { value: '2026-08-03' },
  };
  const doc = { getElementById: id => registry[id] || null, querySelector: () => null };
  const db = { recipes: { get: async id => (id===1?CHOCOLAT_PASSION:id===2?PISTACHE:null) },
    productions: { update: async()=>{} } };
  const appelsEnreg = [];
  const runner = new Function('document', 'db', 'today', 'toast', 'closeModal', 'renderProductions',
    'ficheMeringueProduction', 'prodTaskStartForBatch', 'swallow', 'enregistrerProduction', 'esc', 'qty', `
    return (async () => {
      ${srcDeps}
      ${srcSaveAncien}
      await saveProd();
    })();
  `);
  await runner(doc, db, () => '2026-08-03', () => {}, () => {}, () => {}, () => {}, () => 1, () => {},
    async (recipeId, qteTh, qteRe, date, lot, dlc, emp, meta) => { appelsEnreg.push({ recipeId, qteTh, meta }); return appelsEnreg.length; },
    s => s, n => String(n));

  check('D. réintroduction : sans l\'expansion, seulement 2 lots créés (le bug signalé par Ben)', appelsEnreg.length===2);
  const choc = appelsEnreg.find(a=>a.recipeId===1);
  check('D. réintroduction : Chocolat passion reçoit UN SEUL lot de 240 coques, jamais divisé par couleur',
    choc && choc.qteTh===240 && choc.meta.couleur===undefined);
}

(async () => {
  await testSaveProdDuo();
  await testApercuDuo();
  await testReintroduction();
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
})().catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
