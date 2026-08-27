'use strict';
// v1490 — LE TARIF ÉVÉNEMENT RETOMBAIT À 1,60 € PENDANT LA SAISIE. Ben : « j'ai supprimé la commande
// pour tout recommencer et le tarif de 1,90 € n'est plus disponible. Ça revient à 1,60 € peu importe
// que la case appliquer les anciens tarifs soit cochée ou non ».
//
// 🚨 C'EST MA CORRECTION DE LA v1485 QUI A INTRODUIT CE DÉFAUT. J'avais remplacé la constante figée
// par `tarifsDeLigne(ln)` — le résolveur des lignes ENREGISTRÉES, où l'absence de marqueur signifie
// « ligne héritée » et renvoie l'ancienne grille. Or une ligne EN COURS DE SAISIE n'a pas encore de
// `tarifRef` : elle retombait donc TOUJOURS sur 1,60 €, case cochée ou non.
//
// ⚠️ C'est EXACTEMENT le piège documenté en v1469 — DEUX RÉSOLVEURS DISTINCTS, l'un pour les lignes
// enregistrées, l'autre pour le modèle d'édition — et j'y suis retombé. `tarifsLigneSaisie` consulte
// la CASE DU FORMULAIRE quand le marqueur manque ; c'est lui qu'il faut en édition, comme le font
// déjà grand format, vrac et sachet.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

const COURANTE = { event:1.90, eventMin:35, pyramide:22 };
const HISTO    = { event:1.60, eventMin:35, pyramide:20 };

// Les deux résolveurs réels, avec la case du formulaire simulée par `tarifsSaisie`.
function moteur(caseCochee){
  return new Function('grilleHistorique','grilleCourante','tarifsSaisie','EVENT_PRICE', `
    ${extractFunction('tarifsLigneSaisie')}
    ${extractFunction('tarifsDeLigne')}
    ${extractFunction('eventUnitPriceSaisie')}
    ${extractFunction('eventUnitPrice')}
    return { eventUnitPriceSaisie, eventUnitPrice, tarifsLigneSaisie, tarifsDeLigne };
  `)(()=>HISTO, ()=>COURANTE, ()=> caseCochee ? HISTO : COURANTE, 1.60);
}

// ---- A. LE CAS DE BEN : nouvelle commande, ligne pas encore enregistrée ----
{
  const decochee = moteur(false);
  const cochee   = moteur(true);
  const neuve = { type:'evenement', evQte:100, equip:1 };   // AUCUN tarifRef : ligne en saisie

  check('A. case DÉCOCHÉE, ligne neuve → 1,90 €', decochee.eventUnitPriceSaisie(neuve) === 1.90);
  check('A. case COCHÉE, ligne neuve → 1,60 €', cochee.eventUnitPriceSaisie(neuve) === 1.60);
  check('A. la case fait donc bien une différence', decochee.eventUnitPriceSaisie(neuve) !== cochee.eventUnitPriceSaisie(neuve));

  // Le défaut d'avant : le résolveur des lignes enregistrées ignore la case.
  check('A. (le défaut) tarifsDeLigne renvoyait 1,60 € dans les DEUX cas',
    decochee.eventUnitPrice(neuve) === 1.60 && cochee.eventUnitPrice(neuve) === 1.60);

  check('A. sans pyramide non plus, la case est respectée',
    decochee.eventUnitPriceSaisie({ type:'evenement', evQte:100 }) === 1.90);
}

// ---- B. NON-RÉGRESSION : les lignes ENREGISTRÉES gardent leur grille ----
// C'est ce qui protège l'historique : une ligne d'avant la v1463 n'a pas de marqueur et DOIT rester
// sur l'ancienne grille, quelle que soit la case cochée aujourd'hui.
{
  const m = moteur(false);   // case décochée aujourd'hui
  check('B. ligne héritée (sans marqueur) → ancienne grille, historique préservé',
    m.eventUnitPrice({ type:'evenement', evQte:100 }) === 1.60);
  check('B. ligne marquée depuis la v1463 → grille courante',
    m.eventUnitPrice({ type:'evenement', evQte:100, tarifRef:'2026-09-10' }) === 1.90);
  check('B. ligne explicitement « anciens tarifs » → ancienne grille',
    m.eventUnitPrice({ type:'evenement', evQte:100, tarifRef:'2026-09-10', ancienTarif:true }) === 1.60);
  // Une ligne DÉJÀ marquée donne le même résultat par les deux chemins : la distinction ne joue
  // que sur l'absence de marqueur.
  const ln = { type:'evenement', evQte:100, tarifRef:'2026-09-10' };
  check('B. RÉCONCILIATION : ligne marquée → même prix par les deux résolveurs',
    m.eventUnitPrice(ln) === m.eventUnitPriceSaisie(ln));
}

// ---- C. LE CÂBLAGE : saisie et enregistré, chacun son résolveur ----
{
  const srcSaisie = extractFunction('eventUnitPriceSaisie');
  check('C. la variante saisie utilise tarifsLigneSaisie', /tarifsLigneSaisie\(ln\)/.test(srcSaisie));
  const srcStored = extractFunction('eventUnitPrice');
  check('C. la variante enregistrée garde tarifsDeLigne', /tarifsDeLigne\(ln\)/.test(srcStored));

  // Le calcul de la ligne en cours d'édition.
  const srcBase = extractFunction('lineTotalBase');
  check('C. lineTotalBase (édition) appelle la variante saisie', /eventUnitPriceSaisie\(ln\)/.test(srcBase));
  check('C. …et plus l\'ancienne', !/[^S]eventUnitPrice\(ln\)/.test(srcBase));

  // Le RENDU de la ligne en cours d'édition — le calcul juste ne suffit pas.
  // ⚠️ `extractFunction` borne mal drawEventLine (gabarits imbriqués) : on découpe sur le fichier
  //    réel, de la déclaration jusqu'à la fonction suivante. Constaté — l'assertion était rouge
  //    alors que les 3 remplacements étaient bel et bien en place.
  const iDraw = APP.indexOf('function drawEventLine');
  const srcDraw = APP.slice(iDraw, APP.indexOf('\nfunction ', iDraw + 10));
  check('C. le rendu en saisie affiche le prix de la case', /eventUnitPriceSaisie\(ln\)/.test(srcDraw));
  check('C. …sur TOUS ses points d\'affichage',
    (srcDraw.match(/eventUnitPriceSaisie\(ln\)/g)||[]).length === 3);
  check('C. …et plus aucun appel à la variante enregistrée dans le rendu',
    !/[^S]eventUnitPrice\(ln\)/.test(srcDraw));

  // Les écrans de données ENREGISTRÉES ne doivent PAS changer.
  const srcStoredTot = extractFunction('lineTotalStored');
  check('C. lineTotalStored garde la variante enregistrée', /eventUnitPrice\(ln\)/.test(srcStoredTot));
  const srcMarges = extractFunction('computeOrderMargins');
  check('C. le calcul de marge aussi', /eventUnitPrice\(ln\)/.test(srcMarges));
}

// ---- D. GARDE DE MOTIF : aucun chemin d'ÉDITION ne doit utiliser le résolveur « enregistré » ----
{
  let code = APP.replace(/\/\*[\s\S]*?\*\//g, '');
  code = code.split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
  const editions = ['lineTotalBase', 'drawEventLine'];
  const fautifs = editions.filter(f => {
    const i = code.indexOf('function ' + f);
    if(i < 0) return false;
    const src = code.slice(i, code.indexOf('\nfunction ', i + 10));
    return /[^S]eventUnitPrice\(ln\)/.test(src);
  });
  check(`D. aucun chemin d'édition sur le résolveur enregistré (${fautifs.join(', ') || 'aucun'})`,
    fautifs.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
