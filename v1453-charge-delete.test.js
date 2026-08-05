'use strict';
// v1453 — SUPPRIMER UNE CHARGE DEPUIS SA FICHE. Ben : « Je veux Pouvoir supprimer des charges en
// cas d'erreur de saisie. Actuellement 3 lignes identifiées dans « autre » qui doivent être
// supprimées (rajout manuel ligne marketing pour entrepremans pour l'année passée et celle qui
// démarre en septembre) »
//
// LA SUPPRESSION EXISTAIT DÉJÀ (delCharge, via l'écran « Voir / gérer les charges ») — mais nulle
// part DANS la fiche d'une charge, là où on la relit et repère justement l'erreur. « celle qui
// démarre en septembre » sent la charge RÉCURRENTE (champ « À partir de (mois) ») : supprimer
// l'instance du mois ne corrige pas une date de départ fausse sur le MODÈLE, qui la regénérerait
// chaque mois — d'où le rappel explicite ajouté quand une charge porte un recurId.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. Câblage réel du bouton Supprimer dans la fiche ----
{
  const src = extractFunction('chargeForm');
  check('A. le bouton Supprimer appelle bien delCharge(id)', /onclick="delCharge\(\$\{id\}\)"/.test(src));
  check('A. le bouton Supprimer n\'apparaît QUE pour une charge existante (id truthy)',
    /\$\{id\?`<button[^`]*delCharge/.test(src));
  check('A. le rappel « charge récurrente » est conditionné à c.recurId', /c\.recurId/.test(src));
  check('A. le rappel pointe vers le vrai écran des modèles récurrents (recurringChargesForm)',
    /recurringChargesForm\(\)/.test(src));
}

// ---- B. Comportemental : rendu réel du formulaire selon les 3 cas ----
async function testRenduReel(){
  const src = extractFunction('chargeForm');
  const runner = (charge, id) => new Function('db', 'esc', 'CHARGE_CATS', 'openModal', 'closeModal', 'recurringChargesForm', `
    ${src}
    return (async () => { await chargeForm(${id}); })();
  `);

  // Cas 1 : NOUVELLE charge (id=0) — pas de bouton Supprimer.
  {
    let captured = null;
    const db = { charges: { get: async () => ({}) } };
    await runner(null, 0)(db, s=>s, ['Autre','Marketing'], html=>{ captured=html; }, ()=>{}, ()=>{});
    check('B. nouvelle charge : PAS de bouton Supprimer (rien à supprimer)', !/delCharge/.test(captured));
    check('B. nouvelle charge : pas de rappel récurrent', !/récurrent/i.test(captured));
  }

  // Cas 2 : charge EXISTANTE, simple (pas de recurId) — bouton Supprimer présent, pas de rappel.
  {
    let captured = null;
    const db = { charges: { get: async () => ({ date:'2025-09-01', categorie:'Autre', libelle:'Marketing Entreprenance', montant:120 }) } };
    await runner(null, 42)(db, s=>s, ['Autre','Marketing'], html=>{ captured=html; }, ()=>{}, ()=>{});
    check('B. charge simple existante : bouton Supprimer présent', /onclick="delCharge\(42\)"/.test(captured));
    check('B. charge simple existante : pas de rappel récurrent (elle n\'en est pas une)', !/récurrent/i.test(captured));
    check('B. le libellé exact de Ben ("Entreprenance") s\'affiche bien dans le formulaire', /Entreprenance/.test(captured));
  }

  // Cas 3 : charge RÉCURRENTE (recurId présent) — bouton Supprimer présent ET rappel explicite.
  {
    let captured = null;
    const db = { charges: { get: async () => ({ date:'2026-09-01', categorie:'Marketing', libelle:'Entreprenance', montant:50, recurId:'rc123' }) } };
    let recurOuvert = false;
    await runner(null, 7)(db, s=>s, ['Autre','Marketing'], html=>{ captured=html; }, ()=>{}, ()=>{ recurOuvert=true; });
    check('B. charge récurrente : bouton Supprimer TOUJOURS présent (supprimer ce mois reste possible)',
      /onclick="delCharge\(7\)"/.test(captured));
    check('B. charge récurrente : le rappel s\'affiche', /récurrent/i.test(captured));
    check('B. charge récurrente : le rappel explique que supprimer ne corrige que CE mois',
      /ce mois-ci/i.test(captured));
  }
}

// ---- C. delCharge lui-même reste correct (non-régression : déjà fonctionnel avant ce fix) ----
{
  const src = extractFunction('delCharge');
  check('C. delCharge supprime bien de db.charges', /db\.charges\.delete\(id\)/.test(src));
  check('C. delCharge demande confirmation avant de supprimer', /confirm\(/.test(src));
}

testRenduReel().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}).catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
