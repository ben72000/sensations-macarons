'use strict';
// v1445b — ORIGINALEMENT : la case « diviser en 2 lots » se décochait toute seule dès qu'on
// touchait la quantité (prodUpdateCoqueHint reconstruisait l'input sans mémoriser son état).
//
// [v1449] LA CASE N'EXISTE PLUS. Ben a demandé que la division bicolore devienne automatique
// (systématique dès qu'un parfum bicolore produit des coques), pas une option qu'on coche —
// voir v1449-bicolore-duo.test.js pour le nouveau comportement. Le bug original (un état perdu
// entre deux rendus) ne peut plus se produire : il n'y a plus d'état utilisateur à perdre, le
// bloc bicolore est une fonction PURE de (recette, mode, composant, quantité). Ce fichier garde
// une garde de non-régression : la case ne doit jamais revenir, et re-rendre plusieurs fois de
// suite (comme le ferait la frappe dans le champ Quantité) doit produire un résultat identique.
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

// ---- A. Garde anti-réintroduction : la case ne doit jamais revenir dans le code source ----
{
  check('A. aucune trace de f_bicoloreDiviser (la case) dans app.js', !APP.includes('f_bicoloreDiviser'));
}

// ---- B. Re-rendus successifs (simulant la frappe dans le champ Quantité) produisent un résultat
// STRICTEMENT identique — rien à perdre puisqu'il n'y a plus d'état à mémoriser. ----
function makeFakeDocument(recette){
  const registry = {
    f_qte:   { value: '60' },
    f_rec:   { value: String(recette.id) },
    f_mode:  { value: 'composant' },
    f_date:  { value: '2026-08-03' },
    f_lotWrap: { style: {} },
    coqueHint: { innerHTML: '', style: {} },
  };
  const compRadio = { value: 'coques', checked: true };
  const diviserHost = { innerHTML: '' };
  registry.coqueBicoloreDiviser = diviserHost;
  const doc = {
    getElementById: id => registry[id] || null,
    querySelector: sel => (sel.includes('f_comp') ? compRadio : null),
  };
  return { doc, registry };
}

async function testStabilite(){
  const src = [
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
    extractFunction('_bicoloreRappelHtml'),
    extractFunction('lotDateJJMMAA'),
    extractConstLine('LOT_ALPHABET'),
    extractObjectConst('FLAVOR_CODES'),
    extractFunction('normTxt'),
    extractFunction('flavorCode'),
    extractFunction('flavorCodeFor'),
    extractFunction('flavorCodeRec'),
    "function swallow(e){ if(e) throw e; }",
    "function today(){ return '2026-08-03'; }",
    extractFunction('prodUpdateCoqueHint'),
  ].join('\n');

  const recette = { id:1, produitNom:'Chocolat passion', rendement:60, coqueColors:['marron_fonce','orange'], grandFormat:false };
  const { doc, registry } = makeFakeDocument(recette);
  const db = { recipes: { get: async (id) => (id===recette.id ? recette : null) } };
  const fn = new Function('document', 'db', `
    return (async () => {
      ${src}
      await prodUpdateCoqueHint();
      const premier = document.getElementById('coqueBicoloreDiviser').innerHTML;
      await prodUpdateCoqueHint();
      const second = document.getElementById('coqueBicoloreDiviser').innerHTML;
      await prodUpdateCoqueHint();
      const troisieme = document.getElementById('coqueBicoloreDiviser').innerHTML;
      return { premier, second, troisieme, lotWrapDisplay: document.getElementById('f_lotWrap').style.display };
    })();
  `);
  const { premier, second, troisieme, lotWrapDisplay } = await fn(doc, db);
  check('B. le bloc bicolore est identique après 3 rendus successifs (rien à perdre)', premier===second && second===troisieme);
  check('B. le bloc annonce bien 2 lots automatiques (comportement v1449, pas de case)', /2 lots séparés seront créés automatiquement/.test(premier));
  check('B. le champ de lot (f_lotWrap) reste masqué de façon stable (jamais réaffiché par erreur)', lotWrapDisplay==='none');
}

testStabilite().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}).catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
