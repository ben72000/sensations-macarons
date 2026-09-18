'use strict';
// v1498 — AUCUNE RECETTE NE POUVAIT PLUS ÊTRE CRÉÉE. Ben, capture à l'appui, en créant une
// recette dûment nommée et remplie (6 lignes de composition) :
//   « ⛔ champ requis absent : « nom » (recipes) — écriture refusée »
//
// 🚨 CAUSE : le schéma de validation exigeait un champ `nom` sur la table `recipes`, alors qu'une
// recette porte son libellé dans `produitNom` — c'est ce qu'écrit `saveRec`, et ce que lisent
// `recForm`, la liste des recettes, la reprise/migration, le diagnostic des grands formats… Le
// champ `nom` n'existant sur AUCUNE recette, la règle refusait 100 % des créations, quel que soit
// le nom saisi. Un garde-fou qui ne protégeait rien et bloquait tout.
//
// Conséquence en cascade : c'est aussi ce qui empêchait « Pistache framboise » d'apparaître dans
// les sections « stock de départ » de la reprise (elles listent les RECETTES) — le contournement
// conseillé (« crée la recette à la main ») était lui-même impossible.
//
// FIX : `requisCreation: ['produitNom']` + `champs: { produitNom:'chaineNonVide' }`.
const { APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// Extrait le bloc VALIDE_SCHEMAS et l'évalue, pour juger les données réelles du schéma
// plutôt qu'une expression régulière sur du texte.
const iSch = APP.indexOf('const VALIDE_SCHEMAS = {');
const iEnd = APP.indexOf('\n};', iSch);
const SCHEMAS = new Function(APP.slice(iSch, iEnd + 3) + '\nreturn VALIDE_SCHEMAS;')();

// ---- A. Le schéma recipes exige le champ qui existe vraiment ----
{
  const rec = SCHEMAS.recipes || {};
  check('A. [LE DÉFAUT CORRIGÉ] recipes n\'exige plus « nom » (champ qui n\'existe sur aucune recette)',
    !(rec.requisCreation || []).includes('nom'));
  check('A. recipes exige « produitNom » — le champ réellement écrit par saveRec',
    (rec.requisCreation || []).includes('produitNom'));
  check('A. le typage porte lui aussi sur produitNom, pas sur nom',
    rec.champs && rec.champs.produitNom === 'chaineNonVide' && !rec.champs.nom);
}

// ---- B. Une recette telle que saveRec la construit passe désormais la validation ----
// On rejoue la fonction de validation réelle sur un objet recette minimal.
{
  const iVal = APP.indexOf('function _valideObjet(');
  const iValEnd = APP.indexOf('\nfunction ', iVal + 10);
  const harness = `
    const VALIDE_TYPES = {
      chaineNonVide: v => typeof v === 'string' && v.trim() !== '',
      chaine: v => v == null || typeof v === 'string',
      nombreFini: v => v == null || (typeof v === 'number' && isFinite(v)),
      idRef: v => v == null || typeof v === 'number',
      booleen: v => v == null || typeof v === 'boolean',
    };
    function _valideChamp(type, valeur){ const t = VALIDE_TYPES[type]; return t ? t(valeur) : true; }
    function _valideDecrit(v){ return String(v); }
    ${APP.slice(iSch, iEnd + 3)}
    ${APP.slice(iVal, iValEnd > 0 ? iValEnd : undefined)}
    return _valideObjet;
  `;
  const valideObjet = new Function(harness)();

  // La recette de Ben : nommée, grand format, rendement — comme saveRec l'écrit.
  const recetteDeBen = { produitNom:'Pistache framboise', rendement:40, grandFormat:true };
  const r1 = valideObjet('recipes', recetteDeBen, 'creation');
  check('B. une recette nommée passe la validation (c\'était refusé avant le correctif)', r1.ok);
  check('B. …et sans aucune erreur remontée', r1.erreurs.length === 0);

  // Le garde-fou reste utile : une recette SANS nom doit toujours être refusée.
  const sansNom = { rendement:40, grandFormat:true };
  const r2 = valideObjet('recipes', sansNom, 'creation');
  check('B. le garde-fou protège toujours : une recette sans libellé reste refusée', !r2.ok);
  check('B. …et le motif cite le bon champ (produitNom), pas un champ fantôme',
    r2.erreurs.some(e => /produitNom/.test(e)) && !r2.erreurs.some(e => /« nom »/.test(e)));

  const nomVide = { produitNom:'   ', rendement:40 };
  check('B. un libellé fait uniquement d\'espaces reste refusé',
    !valideObjet('recipes', nomVide, 'creation').ok);

  // Sensibilité : l'ancien schéma, rejoué sur la recette de Ben, la refuse — reproduisant
  // exactement le message de sa capture.
  const valideAncien = new Function(harness.replace(
    "requisCreation: ['produitNom'],\n    champs: { produitNom:'chaineNonVide' }",
    "requisCreation: ['nom'],\n    champs: { nom:'chaineNonVide' }"))();
  const rAncien = valideAncien('recipes', recetteDeBen, 'creation');
  check('B. [SENSIBILITÉ] l\'ancien schéma refusait cette même recette, motif « nom » absent',
    !rAncien.ok && rAncien.erreurs.some(e => /« nom »/.test(e)));
}

// ---- C. Cohérence générale : tout champ requis doit exister sur la table qu'il garde ----
// Le défaut n'était pas une faute de frappe isolée mais un schéma qui ne correspondait pas à la
// forme réelle des données. On vérifie donc les autres tables où le même écart serait possible.
{
  // clients et materials écrivent bien un champ `nom` (saveClient / saveMat) : leur schéma est
  // correct, et doit le rester.
  check('C. clients exige toujours « nom » (saveClient écrit bien ce champ)',
    (SCHEMAS.clients.requisCreation || []).includes('nom'));
  check('C. materials exige toujours « nom » (saveMat écrit bien ce champ)',
    (SCHEMAS.materials.requisCreation || []).includes('nom'));
  check('C. recipeItems reste gardé sur recipeId + materialId',
    ['recipeId','materialId'].every(c => (SCHEMAS.recipeItems.requisCreation || []).includes(c)));

  // Aucun schéma ne doit exiger un champ qu'il ne type pas, ni typer un champ « nom » sur une
  // table qui n'en a pas : c'est la forme exacte du défaut corrigé ici.
  check('C. aucune table n\'exige un champ requis absent de sa propre liste de champs typés',
    Object.keys(SCHEMAS).every(t => {
      const s = SCHEMAS[t];
      if(!s.requisCreation || !s.requisCreation.length || !s.champs) return true;
      return s.requisCreation.every(ch => Object.prototype.hasOwnProperty.call(s.champs, ch));
    }));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
