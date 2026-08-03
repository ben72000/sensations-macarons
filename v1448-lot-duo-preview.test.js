'use strict';
// v1448 — LE CHAMP « N° LOT DE PRODUCTION » MENTAIT EN MODE DUO. Signalé par Ben, capture à
// l'appui : lançant une meringue commune Chocolat passion + Pistache, le champ affichait
// « 030826RAF » — ni CHP (Chocolat passion) ni PIS (Pistache), mais RAF (Coco Rafaello, une
// tout autre recette). Pire que faux : le champ n'a RIEN à voir avec ce qui se sauvegarde. La
// branche `_mode==='duo'` de saveProd() ne lit JAMAIS f_lot — chaque parfum reçoit son propre
// lot, calculé indépendamment (flavorCodeRec + date). Le champ affiché venait de
// prodRefreshLot(), qui lit TOUJOURS f_rec — or f_rec reste dans le DOM (juste masquée) en duo,
// avec la valeur de la DERNIÈRE recette affichée en mode mono-parfum avant le passage en duo.
//
// Même défaut, plus discret, sur la case « diviser en 2 lots » (v1445/v1446) : cochée, le champ
// f_lot n'est pas plus lu par prodLancerBicoloreDivise, qui calcule ses 2 propres codes.
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

// ---- A. saveProd (duo) et prodLancerCoquesParfum ne lisent JAMAIS f_lot — vérifie que le
// diagnostic tient toujours, garde anti-réintroduction si quelqu'un branchait f_lot dessus par
// erreur plus tard sans mettre à jour l'aperçu. ----
{
  const srcSaveDuo = extractFunction('saveProd');
  // Isole la branche duo (entre "if(_mode==='duo')" et le prochain "if(composant" / fin logique).
  const iDuo = srcSaveDuo.indexOf("if(_mode==='duo')");
  const brancheDuo = srcSaveDuo.slice(iDuo, iDuo + 2000);
  check("A. la branche duo de saveProd ne lit pas val('f_lot')", !brancheDuo.includes("val('f_lot')"));
  const srcDivise = extractFunction('prodLancerCoquesParfum');
  check('A. prodLancerCoquesParfum ne lit pas non plus f_lot (calcule ses propres codes)',
    !srcDivise.includes('f_lot'));
}

// ---- B. prodModeSwitch masque bien f_lotWrap en mode duo, et le réaffiche pour les autres modes ----
{
  const src = extractFunction('prodModeSwitch');
  check('B. prodModeSwitch cible f_lotWrap (pas juste f_lot)', src.includes("getElementById('f_lotWrap')"));
  check("B. f_lotWrap est masqué exactement quand mode==='duo'", /f_lotWrap[\s\S]{0,40}mode\s*===\s*'duo'\s*\?\s*'none'\s*:\s*'block'/.test(src));
}

// Petit DOM factice réutilisable.
function makeFakeDocument(overrides){
  const registry = Object.assign({
    f_mode: { value: 'duo' },
    f_compWrap: { style:{} }, f_garnitureWrap: { style:{} }, f_duoWrap: { style:{} },
    f_rec: { style:{}, closest: () => ({ style:{} }) },
    f_qteRow: { style:{} }, f_qtereelWrap: { style:{} },
    f_lotWrap: { style:{} },
    f_garnitureApercu: { style:{}, innerHTML:'' },
    f_duoApercu: { innerHTML:'' },
  }, overrides || {});
  return { getElementById: id => registry[id] || null, registry };
}

// ---- C. Comportement réel de prodModeSwitch, en isolation ----
{
  const src = extractFunction('prodModeSwitch');
  const { doc, registry } = (() => { const r = makeFakeDocument(); return { doc:r, registry:r.registry }; })();
  const fn = new Function('document', 'prodSyncTheorique', 'prodApercuGarniture', 'prodRefreshLot', 'prodDuoApercu', 'prodCompSwitch', `
    ${src}
    prodModeSwitch('duo');
  `);
  fn(doc, ()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{});
  check('C. en mode duo, f_lotWrap passe bien à "none"', registry.f_lotWrap.style.display === 'none');
}
{
  const src = extractFunction('prodModeSwitch');
  const { doc, registry } = (() => { const r = makeFakeDocument({ f_lotWrap:{style:{display:'none'}} }); return { doc:r, registry:r.registry }; })();
  const fn = new Function('document', 'prodSyncTheorique', 'prodApercuGarniture', 'prodRefreshLot', 'prodDuoApercu', 'prodCompSwitch', `
    ${src}
    prodModeSwitch('complet');
  `);
  fn(doc, ()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{});
  check('C. repasser en mode complet réaffiche f_lotWrap (pas coincé masqué)', registry.f_lotWrap.style.display === 'block');
}

// ---- D. RÉCONCILIATION — les codes de lot prévisualisés dans prodDuoApercu sont calculés avec
// EXACTEMENT la formule utilisée par la vraie sauvegarde (saveProd, branche duo). C'est le test
// qui compte : un aperçu qui ment est pire qu'une absence d'aperçu. Couvre aussi le cas mixte
// (un parfum mono-couleur + un parfum bicolore) — voir tests/v1449-bicolore-duo.test.js pour la
// réconciliation complète du scénario de Ben (Pistache + Chocolat passion). ----
async function testReconciliationDuo(){
  const srcFormuleReelle = extractFunction('saveProd');
  const iDuo = srcFormuleReelle.indexOf("if(_mode==='duo')");
  const brancheDuo = srcFormuleReelle.slice(iDuo, iDuo+2000);
  check('D. la branche duo utilise bien _sousLotsCoques (le moteur partagé, pas un second calcul)',
    /_sousLotsCoques/.test(brancheDuo));

  const registry = {
    f_duoQte1: { value:'60' }, f_duoQte2: { value:'60' }, f_duoQte3: { value:'0' },
    f_duoRec1: { value:'1', options:[{text:'Chocolat passion (60/batch)'}], selectedIndex:0 },
    f_duoRec2: { value:'2', options:[{text:'Pistache (60/batch)'}], selectedIndex:0 },
    f_duoRec3: { value:'', options:[{text:''}], selectedIndex:0 },
    f_date: { value: '2026-08-03' },
    f_duoApercu: { innerHTML:'' },
  };
  const doc = { getElementById: id => registry[id] || null };
  // Chocolat passion : MONOCHROME dans ce test (pas de coqueColors bicolore) — cas de base sans
  // division, pour vérifier que le lot simple reste correct une fois le moteur généralisé.
  const chocolatPassion = { id:1, produitNom:'Chocolat passion', rendement:60, grandFormat:false };
  const pistache = { id:2, produitNom:'Pistache', rendement:60, grandFormat:false };
  const db = {
    recipes: { get: async id => (id===1?chocolatPassion:id===2?pistache:null) },
    recipeItems: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    materials: { toArray: async () => [] },
  };

  const src = [
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
    extractFunction('prodDuoApercu'),
  ].join('\n');

  const fn = new Function('document', 'db', 'today', 'swallow', `
    return (async () => {
      ${src}
      await prodDuoApercu();
      return document.getElementById('f_duoApercu').innerHTML;
    })();
  `);
  const html = await fn(doc, db, () => '2026-08-03', () => {});

  // Lot attendu, avec la formule VÉRIFIÉE identique ci-dessus (D, plus haut) : JJMMAA + code + '-CO'.
  const attenduCHP = '030826CHP-CO';
  const attenduPIS = '030826PIS-CO';
  check('D. le lot de Chocolat passion prévisualisé est le vrai code attendu (030826CHP-CO)', html.includes(attenduCHP));
  check('D. le lot de Pistache prévisualisé est le vrai code attendu (030826PIS-CO)', html.includes(attenduPIS));
  check('D. ni l\'un ni l\'autre ne mentionne "RAF" (le symptôme exact signalé par Ben)', !html.includes('RAF'));
}

// ---- E. Preuve par réintroduction : avec l'ancienne version de prodModeSwitch (sans le masquage
// de f_lotWrap), le champ resterait affiché en duo — exactement le bug signalé. ----
{
  const src = extractFunction('prodModeSwitch');
  const srcAncien = src.replace(
    /const lotWrap=document\.getElementById\('f_lotWrap'\); if\(lotWrap\) lotWrap\.style\.display = mode==='duo'\?'none':'block';\n\s*/,
    ''
  );
  check('E. préparation de la réintroduction : le texte a bien changé', srcAncien !== src);
  const { doc, registry } = (() => { const r = makeFakeDocument(); return { doc:r, registry:r.registry }; })();
  const fn = new Function('document', 'prodSyncTheorique', 'prodApercuGarniture', 'prodRefreshLot', 'prodDuoApercu', 'prodCompSwitch', `
    ${srcAncien}
    prodModeSwitch('duo');
  `);
  fn(doc, ()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{});
  check('E. réintroduction : sans le correctif, f_lotWrap reste affiché en duo (bug reproduit)',
    registry.f_lotWrap.style.display !== 'none');
}

testReconciliationDuo().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}).catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
