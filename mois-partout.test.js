/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 55 : CELLES QUI AVOUAIENT SAVENT MAINTENANT
   ----------------------------------------------------------------------------
   La v1333 a posé la règle : « une compétence qui ne sait pas filtrer par mois le DIT, au lieu
   d'ignorer le paramètre en silence ». C'était honnête — mais ce n'était PAS résolu, et nous
   l'avions écrit noir sur blanc dans nos propres angles morts.

   L'AVEU N'EST QU'UNE ÉTAPE, PAS UNE DESTINATION.

   Les trois compétences qui avouaient apprennent ici à faire :
     • aiQueryCharges       — le mois était CODÉ EN DUR (le mois courant).
     • aiQueryGaspillage    — agrégeait TOUS les marchés depuis toujours, sans notion de période.
     • aiQueryBilanMarche   — prenait TOUJOURS le dernier marché, quel que soit le mois demandé.

   RÈGLES FIGÉES ICI :
     A. Un mouvement de marché (don, perte, retour) n'a PAS de date propre : il est daté par le
        MARCHÉ auquel il appartient. Dater autrement inventerait une chronologie.
     B. DISTINCTION CAPITALE : « aucun marché ce mois-là » n'est PAS « aucun gaspillage ».
        Le premier est une ABSENCE DE DONNÉES, le second une PERFORMANCE. Les confondre revient
        à féliciter Benjamin pour un mois où il n'a simplement rien vendu.
     C. Un RETOUR n'est PAS du gaspillage : l'invendu est récupéré, il repart au stock. Seuls les
        dons et les pertes sortent définitivement.
     D. Si plusieurs marchés ont eu lieu dans le mois demandé, on le DIT. Ne pas signaler qu'on a
        choisi, c'est laisser croire qu'il n'y avait rien d'autre — un mensonge par omission.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');
const fs = require('fs');
const path = require('path');
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function buildModule(){
  const code = `
    const round3 = n => Math.round(n*1000)/1000;
    ${extractConstLine('marcheDate')}
    ${extractFunction('marchesDuMois')}
    ${extractFunction('gaspillageMarches')}
    return { marcheDate, marchesDuMois, gaspillageMarches };
  `;
  return new Function(code)();
}
const M = buildModule();

let pass=0, fail=0; const failures=[];
function eq(a, e, label){
  const x=JSON.stringify(a), y=JSON.stringify(e);
  if(x===y){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${y}\n      obtenu : ${x}`); }
}
function ok(cond, label){ if(cond){ pass++; } else { fail++; failures.push(`  ✗ ${label}`); } }

console.log('\n=== TESTS — Vague 55 : celles qui avouaient savent maintenant ===\n');

// Deux marchés en mai, un en juin, aucun en avril.
const MARCHES = [
  { id:1, nom:'Marché de mai #1', date:'2026-05-03' },
  { id:2, nom:'Marché de mai #2', date:'2026-05-24' },
  { id:3, nom:'Marché de juin',   date:'2026-06-14' }
];
const MOVES = [
  { marketId:1, type:'don',    qte:10 },
  { marketId:1, type:'perte',  qte:5  },
  { marketId:1, type:'retour', qte:30 },   // récupéré → PAS du gaspillage
  { marketId:2, type:'perte',  qte:8  },
  { marketId:3, type:'don',    qte:100 },  // juin : gros don, ne doit PAS polluer mai
  { marketId:3, type:'perte',  qte:50 }
];

// ---------------------------------------------------------------------------
// A. LA DATE D'UN MARCHÉ — une règle unique (elle était recopiée à deux endroits)
// ---------------------------------------------------------------------------
{
  eq(M.marcheDate({date:'2026-05-03'}), '2026-05-03', 'A1 · la date du marché est lue sur `date`');
  eq(M.marcheDate({dateCloture:'2026-05-03'}), '2026-05-03', 'A2 · … avec `dateCloture` en repli');
  eq(M.marcheDate({}), '', 'A3 · aucune date → chaîne vide (jamais « undefined » affiché)');
  eq(M.marcheDate(null), '', 'A4 · marché absent → chaîne vide, sans planter');
}

// ---------------------------------------------------------------------------
// B. LE FILTRAGE PAR MOIS
// ---------------------------------------------------------------------------
{
  eq(M.marchesDuMois(MARCHES, '2026-05').map(m=>m.id), [1,2], 'B1 · mai → les deux marchés de mai');
  eq(M.marchesDuMois(MARCHES, '2026-06').map(m=>m.id), [3],   'B2 · juin → le marché de juin');
  eq(M.marchesDuMois(MARCHES, '2026-04').map(m=>m.id), [],    'B3 · avril → aucun marché (et c\'est une INFORMATION, pas une erreur)');
  eq(M.marchesDuMois(MARCHES, null).length, 3,                'B4 · sans mois → tous les marchés (comportement d\'origine)');
  eq(M.marchesDuMois(null, '2026-05'), [],                    'B5 · aucune donnée → tableau vide, sans planter');
}

// ---------------------------------------------------------------------------
// C. LE GASPILLAGE — daté par le MARCHÉ (règle A), et le retour n'en est PAS (règle C)
// ---------------------------------------------------------------------------
{
  const mai = M.gaspillageMarches(MARCHES, MOVES, '2026-05');
  eq(mai.don, 10,    'C1 · mai : 10 donnés');
  eq(mai.perte, 13,  'C2 · mai : 13 perdus (5 + 8, sur les DEUX marchés du mois)');
  eq(mai.total, 23,  'C3 · gaspillage de mai = 23 (dons + pertes)');
  eq(mai.retour, 30, 'C4 · 30 invendus RÉCUPÉRÉS…');
  ok(mai.total === mai.don + mai.perte,
     'C5 · … et ils ne sont PAS comptés dans le gaspillage : un retour repart au stock (règle C)');
  eq(mai.nbMarches, 2, 'C6 · deux marchés concernés en mai');

  // Le gros don de JUIN ne doit PAS polluer mai. C'est tout l'objet du filtrage.
  ok(mai.don < 100, 'C7 · le don de 100 en juin ne fuit PAS dans le bilan de mai');

  const juin = M.gaspillageMarches(MARCHES, MOVES, '2026-06');
  eq(juin.total, 150, 'C8 · juin : 150 (100 dons + 50 pertes)');

  const tout = M.gaspillageMarches(MARCHES, MOVES, null);
  eq(tout.total, 173, 'C9 · sans mois : tout l\'historique (23 + 150) — comportement d\'origine intact');
  eq(tout.nbMarches, 3, 'C10 · … sur les 3 marchés');

  // TRAÇABILITÉ : mai + juin = tout. Aucun mouvement perdu, aucun compté deux fois.
  eq(mai.total + juin.total, tout.total,
     'C11 · TRAÇABILITÉ : mai + juin = l\'historique complet');
}

// ---------------------------------------------------------------------------
// D. LA DISTINCTION CAPITALE — « aucun marché » n'est PAS « aucun gaspillage »
// ---------------------------------------------------------------------------
// C'EST LE CŒUR DE CETTE VAGUE. Un mois sans marché renverrait naturellement un gaspillage de 0.
// Afficher « aucun gaspillage, bravo ! » serait féliciter Benjamin pour un mois où il n'a
// simplement RIEN VENDU. Une absence de données n'est pas une performance.
{
  const avril = M.gaspillageMarches(MARCHES, MOVES, '2026-04');
  eq(avril.total, 0, 'D1 · avril : gaspillage = 0…');
  eq(avril.nbMarches, 0, 'D2 · … mais AUCUN marché tenu — et c\'est CE compteur qui fait la différence');

  // Sans nbMarches, les deux cas seraient INDISCERNABLES. Comparons.
  const maiSansGaspi = M.gaspillageMarches(
    [{ id:9, nom:'Marché propre', date:'2026-05-10' }],
    [{ marketId:9, type:'retour', qte:20 }],   // tout récupéré : zéro gaspillage RÉEL
    '2026-05');
  eq(maiSansGaspi.total, 0, 'D3 · un marché SANS gaspillage donne aussi 0…');
  eq(maiSansGaspi.nbMarches, 1, 'D4 · … mais avec 1 marché tenu : c\'est une VRAIE performance');

  ok(avril.total === maiSansGaspi.total && avril.nbMarches !== maiSansGaspi.nbMarches,
     'D5 · les deux ont le MÊME total (0) — seul nbMarches les distingue. Sans lui, l\'app féliciterait Benjamin pour un mois vide');

  // Le code doit bien exploiter cette distinction.
  const gaspi = APP.slice(APP.indexOf('async function aiQueryGaspillage'),
                          APP.indexOf('async function aiQueryGaspillage') + 2000);
  ok(/nbMarches === 0/.test(gaspi),
     'D6 · aiQueryGaspillage teste explicitement « aucun marché » avant de parler de gaspillage');
  ok(/absence de données/.test(gaspi),
     'D7 · … et le dit à Benjamin : « ce n\'est pas un bon score, c\'est une absence de données »');
}

// ---------------------------------------------------------------------------
// E. LES TROIS COMPÉTENCES ONT CHANGÉ DE CAMP
// ---------------------------------------------------------------------------
{
  const bloc = (nom) => {
    const i = APP.indexOf('const ' + nom + ' = new Set([');
    return i < 0 ? null : APP.slice(i, APP.indexOf(']);', i));
  };
  const supporte = bloc('AI_INTENTS_MOIS');
  const attendu  = bloc('AI_INTENTS_MOIS_ATTENDU');

  ['query_charges','query_gaspillage','query_bilan_marche'].forEach(i => {
    ok(supporte.includes(i), `E · « ${i} » HONORE désormais un mois nommé`);
    ok(!attendu.includes(i), `E · … et n'est plus dans la liste des aveux`);
  });

  // INVARIANT ÉTENDU (vague 54 le vérifiait sur 3 intentions ; on le passe sur TOUTES).
  const noms = [...supporte.matchAll(/'(query_[a-z_]+)'/g)].map(m=>m[1]);
  const dansLesDeux = noms.filter(i => attendu.includes(i));
  eq(dansLesDeux, [],
     'E7 · INVARIANT : AUCUNE compétence n\'est à la fois dans les deux listes — elle sait, ou elle avoue');
  // CLIQUET (v1335) : le nombre de compétences qui SAVENT ne peut que croître, celui des aveux ne
  // peut que décroître. Une compétence qui régresserait vers l'aveu casse ici.
  ok(noms.length >= 8, `E8 · au moins 8 compétences honorent un mois (mesuré : ${noms.length} — 3 en v1333, 6 en v1334)`);
  const aveux = [...attendu.matchAll(/'(query_[a-z_]+)'/g)].map(m=>m[1]);
  ok(aveux.length <= 3, `E9 · au plus 3 compétences avouent encore (mesuré : ${aveux.length})`);
  // Et celles qui restent sont HONNÊTEMENT hors de portée, pas oubliées : le code le justifie.
  ok(/PLAUSIBLE ET FAUX/.test(APP) && /FEN\u00caTRE GLISSANTE|FENÊTRE GLISSANTE/.test(APP),
     'E10 · les compétences qui avouent encore sont JUSTIFIÉES dans le code (coûts FIFO temporels, fenêtre glissante) — ce n\'est pas de la paresse');
}

// ---------------------------------------------------------------------------
// F. LE CODE DES DEUX AUTRES COMPÉTENCES
// ---------------------------------------------------------------------------
{
  const charges = APP.slice(APP.indexOf('async function aiQueryCharges'),
                            APP.indexOf('async function aiQueryCharges') + 1200);
  ok(/params\.periode/.test(charges),
     'F1 · aiQueryCharges LIT params.periode (avant : le mois courant était codé en dur)');

  const bilan = APP.slice(APP.indexOf('async function aiQueryBilanMarche'),
                          APP.indexOf('async function aiQueryBilanMarche') + 2500);
  ok(/marchesDuMois/.test(bilan),
     'F2 · aiQueryBilanMarche cible les marchés DU MOIS (avant : toujours le dernier, tous mois confondus)');
  ok(/aucun marché/.test(bilan),
     'F3 · … et dit franchement « aucun marché en <mois> » plutôt que de montrer celui d\'un autre mois');
  ok(/_autres/.test(bilan),
     'F4 · … et signale s\'il y avait PLUSIEURS marchés ce mois-là (règle D : ne pas taire qu\'on a choisi)');
}

// ---------------------------------------------------------------------------
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail){
  console.log('\n' + failures.join('\n') + '\n');
  console.log('✗ RÉGRESSION DÉTECTÉE.\n');
  process.exit(1);
}
console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
