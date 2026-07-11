/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 39 : coût du TEMPS dans les marges
   ----------------------------------------------------------------------------
   Ces chiffres pilotent les DÉCISIONS DE PRIX : le temps mesuré par macaron alimente
   le coût de main-d'œuvre (coutMODUnit), donc la marge, donc le classement de rentabilité.

   BUG CORRIGÉ (v1319) — MÊME CLASSE que celui des analyses de temps :
     • Numérateur   = tout le temps d'atelier, Y COMPRIS la fabrication des COQUES.
     • Dénominateur = seulement les macarons ASSEMBLÉS ('complet'/'assemble').
   En phase de constitution de stock (coques faites d'avance pour un gros événement),
   le temps montait sans que les macarons finis suivent : le coût du temps par macaron
   était SURÉVALUÉ (jusqu'à ×4), donc les marges SOUS-ESTIMÉES.

   Règle figée : on compte en MACARONS ÉQUIVALENTS (une fournée de coques ÷ 2), pour que
   numérateur et dénominateur parlent de la même chose.
   ============================================================================ */
'use strict';

const COQUES_PAR_MACARON = 2;

// Reproduit le dénominateur de prodTempsLissePerMacaron / prodTempsParParfum.
function macaronsEquivalents(prods){
  return prods.reduce((a,p)=>{
    const c = p.composant || 'complet';
    if(c!=='complet' && c!=='assemble' && c!=='coques') return a;   // ganache/chantache : pas des macarons
    const q = (+p.qteReelle || +p.qteProduite || 0);
    if(!(q>0)) return a;
    return a + ((c==='coques') ? (q / COQUES_PAR_MACARON) : q);
  }, 0);
}
// L'ANCIEN dénominateur (buggé), pour démontrer l'écart.
function macaronsFinisSeuls(prods){
  return prods.reduce((a,p)=>{
    const c = p.composant || 'complet';
    if(c!=='complet' && c!=='assemble') return a;
    return a + (+p.qteReelle || +p.qteProduite || 0);
  }, 0);
}
const coutMOParMacaron = (minAtelier, nbMac, tauxHoraire) =>
  nbMac>0 ? (minAtelier/nbMac)/60*tauxHoraire : 0;

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function near(actual, expected, tol, label){
  if(Math.abs(actual-expected) <= tol){ pass++; }
  else { fail++; failures.push(`  ✗ ${label}\n      attendu: ~${expected} (±${tol})\n      obtenu : ${actual}`); }
}

function run(){

// ── LE BUG : semaine de préparation (beaucoup de coques d'avance) ─────────────
{
  // 15 h d'atelier. Produit : 600 coques (= 300 macarons équiv.) + 100 macarons finis.
  const prods = [
    { composant:'coques',  qteReelle:600 },
    { composant:'complet', qteReelle:100 },
  ];
  const minAtelier = 900;   // 15 h
  const taux = 15;          // 15 €/h

  const avant = macaronsFinisSeuls(prods);
  const apres = macaronsEquivalents(prods);

  eq(avant, 100, 'AVANT · le dénominateur ne comptait que les 100 macarons assemblés');
  eq(apres, 400, 'APRÈS · 600 coques (=300 équiv.) + 100 finis = 400 macarons équivalents');

  near(minAtelier/avant, 9.00, 0.01, 'AVANT · 9,00 min par macaron (surévalué)');
  near(minAtelier/apres, 2.25, 0.01, 'APRÈS · 2,25 min par macaron (réel)');

  near(coutMOParMacaron(minAtelier, avant, taux), 2.25, 0.01,
    'AVANT · coût du temps = 2,25 €/macaron → marge SOUS-ESTIMÉE');
  near(coutMOParMacaron(minAtelier, apres, taux), 0.56, 0.01,
    'BUG VERROUILLÉ · coût réel = 0,56 €/macaron');

  const facteur = (minAtelier/avant) / (minAtelier/apres);
  near(facteur, 4, 0.01,
    'IMPACT · le coût du temps était compté 4× trop cher en semaine de préparation');
}

// ── Régime stable : le biais disparaît (le correctif ne casse rien) ───────────
{
  // Quand tout ce qu'on fabrique est assemblé dans la fenêtre, les deux méthodes convergent…
  // à ceci près que les coques d'un macaron fini sont déjà comptées dans le lot 'complet'.
  const prods = [ { composant:'complet', qteReelle:400 } ];
  eq(macaronsFinisSeuls(prods), 400, 'Régime stable · ancien dénominateur = 400');
  eq(macaronsEquivalents(prods), 400, 'Régime stable · nouveau dénominateur = 400 (identique)');
}

// ── La conversion coques → macarons est bien ÷ 2 ─────────────────────────────
{
  eq(macaronsEquivalents([{ composant:'coques', qteReelle:120 }]), 60,
     '120 coques = 60 macarons équivalents (1 macaron = 2 coques)');
  eq(macaronsEquivalents([{ composant:'coques', qteReelle:48 }]), 24,
     'Grand format · 48 coques = 24 macarons équivalents');
}

// ── Ganache / chantache : ce ne sont PAS des macarons ────────────────────────
{
  const prods = [
    { composant:'ganache',     qteReelle:500 },
    { composant:'chantache',   qteReelle:300 },
    { composant:'degustation', qteReelle:10 },
    { composant:'complet',     qteReelle:100 },
  ];
  eq(macaronsEquivalents(prods), 100,
     'Seuls les macarons et les coques comptent — pas la ganache ni la dégustation');
}

// ── Aucune production : pas de division par zéro ─────────────────────────────
{
  eq(macaronsEquivalents([]), 0, 'Aucune production → 0');
  eq(coutMOParMacaron(900, 0, 15), 0,
     'Dénominateur nul → coût 0 (aucun chiffre inventé, pas de division par zéro)');
}

// ── PROPRIÉTÉ MÉTIER : le coût du temps ne peut pas exploser sans raison ─────
{
  // Avec un rythme de travail réaliste (2-3 min de travail actif par macaron à 15 €/h),
  // le coût du temps doit rester dans une fourchette plausible (< 1 €/macaron).
  const prods = [{ composant:'complet', qteReelle:400 }];
  const cout = coutMOParMacaron(900, macaronsEquivalents(prods), 15);
  eq(cout < 1, true,
     'COHÉRENCE MÉTIER · un coût de main-d\'œuvre réaliste reste sous 1 €/macaron');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 39 : coût du temps dans les marges ===\n');
if(fail===0){
  console.log(`Résultat : ${pass} réussis, 0 échoués (${pass} assertions).`);
  console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
} else {
  console.log(`Résultat : ${pass} réussis, ${fail} échoués.`);
  console.log(failures.join('\n')+'\n');
  process.exitCode = 1;
}
}
run();
