'use strict';
// v1445b — LA CASE « DIVISER EN 2 LOTS » SE DÉCOCHAIT TOUTE SEULE. Signalé par Ben, captures à
// l'appui (fiche « Chocolat passion » montrant UN SEUL lot « 030826CHP-CO » — sans suffixe de
// couleur — avec le simple rappel v1441, alors que la recette est bicolore). La preuve était dans
// le numéro de lot lui-même : un partage réussi aurait donné 2 lots avec des codes couleur
// distincts (ex. 030826CHPMAR-CO / 030826CHPORA-CO), pas un seul lot au format d'avant v1445.
//
// CAUSE : prodUpdateCoqueHint() reconstruit ENTIÈREMENT la case à cocher (innerHTML) à chaque
// appel — y compris depuis le champ Quantité, qui appelle cette fonction à CHAQUE frappe depuis
// la v1441. Le nouvel <input> ne portait jamais l'état précédent : cocher la case puis ne
// serait-ce que toucher au champ quantité (très probable dans l'ordre normal d'usage — la
// quantité est pré-remplie par défaut, on la change souvent après avoir repéré le rappel
// bicolore) redessinait une case DÉCOCHÉE en silence. Le clic sur « Lancer » retombait alors sur
// l'ancien chemin à un seul lot, sans aucun message d'erreur.
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

// Fausse case à cocher : simule fidèlement ce qu'un vrai navigateur fait quand on assigne
// innerHTML — le <input> est DÉTRUIT et RECRÉÉ à partir du markup. Son état `checked` ne vient
// QUE de l'attribut `checked` littéralement présent dans la chaîne, jamais d'une mémoire.
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
  const diviserHost = {
    _html: '',
    get innerHTML(){ return this._html; },
    set innerHTML(html){
      this._html = html;
      const m = html.match(/<input[^>]*id="f_bicoloreDiviser"[^>]*>/);
      if(m){ registry['f_bicoloreDiviser'] = { type:'checkbox', checked: /\bchecked\b/.test(m[0]) }; }
      else { delete registry['f_bicoloreDiviser']; }
    }
  };
  registry['coqueBicoloreDiviser'] = diviserHost;
  const doc = {
    getElementById: id => registry[id] || null,
    querySelector: sel => (sel.includes('f_comp') ? compRadio : null),
  };
  return { doc, registry };
}

async function testSequence(src){
  const recette = { id:1, produitNom:'Chocolat passion', rendement:60, coqueColors:['marron_fonce','orange'], grandFormat:false };
  const { doc, registry } = makeFakeDocument(recette);
  const db = { recipes: { get: async (id) => (id===recette.id ? recette : null) } };
  const fn = new Function('document', 'db', `
    return (async () => {
      ${src}
      await prodUpdateCoqueHint();                         // 1er rendu : recette choisie
      document.getElementById('f_bicoloreDiviser').checked = true;   // Ben coche la case
      await prodUpdateCoqueHint();                          // Ben modifie ensuite la quantité
      return document.getElementById('f_bicoloreDiviser').checked;
    })();
  `);
  return fn(doc, db);
}

async function run(){
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
    'function swallow(e){ /* test : erreurs visibles, pas avalées */ if(e) throw e; }',
    "function today(){ return '2026-08-03'; }",
    extractFunction('prodUpdateCoqueHint'),
  ].join('\n');

  const resteCoche = await testSequence(src);
  check('A. la case reste cochée après un second rendu déclenché par la quantité (cas exact de Ben)', resteCoche === true);

  // ---- B. Preuve par réintroduction : sans la mémorisation de dejaCoche, la case se décoche
  // toute seule. Remplace TOUT usage de l'identifiant (pas seulement 1 ligne) par une lecture EN
  // DIRECT du DOM — fidèle à l'ancien code, robuste aux ajouts ultérieurs (v1448) qui réutilisent
  // aussi `dejaCoche` ailleurs dans la fonction. ----
  const srcAncien = src
    .replace(
      "const dejaCoche = document.getElementById('f_bicoloreDiviser')?.checked || false;\n      ",
      ''
    )
    .replace(/\bdejaCoche\b/g, "(document.getElementById('f_bicoloreDiviser')?.checked || false)")
    .replace(
      '<input type="checkbox" id="f_bicoloreDiviser" ${(document.getElementById(\'f_bicoloreDiviser\')?.checked || false)?\'checked\':\'\'} style="margin-top:3px" onchange="prodUpdateCoqueHint()">',
      '<input type="checkbox" id="f_bicoloreDiviser" style="margin-top:3px" onchange="prodUpdateCoqueHint()">'
    );
  check('B. préparation de la réintroduction : le texte source a bien changé (sinon le test B ne prouve rien)',
    srcAncien !== src && !srcAncien.includes('const dejaCoche ='));
  const resteCocheAncien = await testSequence(srcAncien);
  check('B. réintroduction : SANS le correctif, la case se décoche bien toute seule (bug reproduit)',
    resteCocheAncien === false);

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}

run().catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
