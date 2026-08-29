'use strict';
// v1492 — MENTION « CHÈQUE DE CAUTION » OPTIONNELLE. Ben : « peut-on rendre optionnelle la mention
// chèque de caution avec le texte qui y est associé ? On coche la case chèque de caution ou non, au
// même titre que la mention 75 % d'acompte. Attention de ne rien casser des autres fonctionnalités ».
//
// MÉTHODE : calquer EXACTEMENT le motif `acompteMention`, qui fonctionne déjà et circule à 7
// endroits. Pas d'invention — la même convention, le même défaut, les mêmes chemins.
//
// ⚠️ DÉFAUT PAR ABSENCE : `cautionMention` absent ou true = mention AFFICHÉE. Tous les documents et
// commandes déjà enregistrés n'ont pas ce champ : ils continuent donc d'afficher la mention,
// exactement comme avant. C'est ce qui garantit qu'on ne casse rien.
// [v1493] Le libellé est devenu « Empreinte bancaire » (demande de Ben). Le MÉCANISME testé ici
// est inchangé : seules les chaînes attendues ont suivi. Le vocabulaire adapté (prise/débitée/
// annulée) est vérifié par la suite v1493, pas ici.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

const R = new Function('cmdALocation','euro','CAUTION_CHEQUE', `
  ${extractFunction('cautionRowHtml')}
  return cautionRowHtml;
`)(lignes => (lignes||[]).some(l => l && l.equip > 0), n => n.toFixed(2) + ' €', 80);

const avecLocation = [{ type:'evenement', equip:1 }];
const sansLocation = [{ type:'coffret' }];

// ---- A. LE COMPORTEMENT DEMANDÉ ----
{
  check('A. case cochée (true) → mention affichée', /Empreinte bancaire/.test(R(avecLocation, { cautionMention:true })));
  check('A. case DÉCOCHÉE (false) → mention masquée', R(avecLocation, { cautionMention:false }) === '');
  check('A. le texte associé disparaît aussi', !/restitué après retour/.test(R(avecLocation, { cautionMention:false })));
}

// ---- B. NON-RÉGRESSION — « ne rien casser » ----
{
  // Un document existant n'a PAS le champ : il doit se comporter comme avant.
  check('B. champ ABSENT → mention affichée (comportement d\'avant)', /Empreinte bancaire/.test(R(avecLocation, {})));
  check('B. contexte absent → mention affichée (appels non modifiés)', /Empreinte bancaire/.test(R(avecLocation)));
  check('B. contexte null → mention affichée', /Empreinte bancaire/.test(R(avecLocation, null)));
  // La règle d'origine tient toujours : pas de location, pas de mention.
  check('C. sans location, aucune mention même si la case est cochée', R(sansLocation, { cautionMention:true }) === '');
  check('C. sans location et case décochée : rien non plus', R(sansLocation, { cautionMention:false }) === '');
  // Le montant reste celui de la constante.
  check('C. le montant du chèque reste affiché', /80\.00/.test(R(avecLocation, { cautionMention:true })));
}

// ---- D. LE CÂBLAGE : tous les points d'affichage reçoivent le contexte ----
{
  check('D. plus aucun appel sans contexte', !/cautionRowHtml\(lignes\)/.test(APP));
  const n = (APP.match(/cautionRowHtml\(lignes, [do]\)/g)||[]).length;
  check(`D. les 4 documents passent leur contexte (${n})`, n === 4);
  const src = extractFunction('cautionRowHtml');
  check('D. le 2e argument est OPTIONNEL (protège tout chemin oublié)', /function cautionRowHtml\(lignes, ctx\)/.test(src));
  check('D. seul un false explicite masque', /ctx\.cautionMention === false/.test(src));
  check('D. la règle « pas de location, pas de mention » est conservée', /if\(!cmdALocation\(lignes\)\) return '';/.test(src));
}

// ---- E. LA CASE, et sa persistance sur TOUS les chemins ----
{
  check('E. une case existe dans le formulaire', /id="f_cautionMention"/.test(APP));
  check('E. elle est cochée par défaut', /id="f_cautionMention" \$\{o\.cautionMention!==false\?'checked':''\}/.test(APP));
  check('E. elle n\'apparaît QUE s\'il y a une location', /\$\{cmdALocation\(cmdLines\)\?`<label class="switch-row"><input type="checkbox" id="f_cautionMention"/.test(APP));
  check('E. enregistrée comme l\'acompte (champ absent = affichée)',
    /cautionMention: !document\.getElementById\('f_cautionMention'\) \|\| document\.getElementById\('f_cautionMention'\)\.checked/.test(APP));

  // GARDE DE MOTIF : partout où le drapeau d'acompte circule, celui de caution doit suivre.
  // C'est exactement le contrôle qui manquait pour le logo (v1487-v1489).
  const lignes = APP.split('\n');
  const manques = [];
  lignes.forEach((x, i) => {
    if(/acompteMention\s*:/.test(x) && !/cautionMention/.test(x) && !/f_acompteMention/.test(x)) manques.push(i+1);
  });
  check(`E. le drapeau suit l'acompte PARTOUT (${manques.join(', ') || 'aucun manque'})`, manques.length === 0);
  check('E. il circule sur au moins 7 chemins', (APP.match(/cautionMention/g)||[]).length >= 14);
}

// ---- F. RÉCONCILIATION : l'aller-retour conserve le choix ----
{
  // Écriture → document → relecture, avec les mêmes règles que le code.
  const cmd = { cautionMention:false };
  const doc = { cautionMention:(cmd.cautionMention!==false) };
  const relu = { cautionMention:(doc.cautionMention!==false) };
  check('F. « décochée » survit à l\'aller-retour', relu.cautionMention === false);

  const cmd2 = { cautionMention:true };
  const doc2 = { cautionMention:(cmd2.cautionMention!==false) };
  const relu2 = { cautionMention:(doc2.cautionMention!==false) };
  check('F. « cochée » aussi', relu2.cautionMention === true);

  // Un document ancien, sans le champ : la mention reste affichée.
  const ancien = {};
  check('F. un document ancien garde la mention', (ancien.cautionMention!==false) === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
