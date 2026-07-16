/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 54 : UNE SEULE VÉRITÉ, ET AUCUN PARAMÈTRE PERDU
   ----------------------------------------------------------------------------
   Deux dettes soldées, toutes deux DÉCLARÉES par nous-mêmes aux vagues précédentes.

   ┌─ DETTE 1 — LES GRAPHIQUES CONTREDISAIENT LE COPILOTE (angle mort déclaré en vague 52)
   │  La v1331 a basculé le copilote sur la VÉRITÉ COMPTABLE (le mois où l'argent rentre).
   │  Mais les COURBES des écrans stats sont restées sur l'ancienne base (mois de la COMMANDE,
   │  montant TOTAL). L'app affichait donc DEUX CA différents pour le MÊME mois, sur deux écrans.
   │  On avait corrigé un écran et laissé l'autre le contredire — exactement la maladie qu'on
   │  prétend soigner. Une dette qu'on s'est infligée soi-même est la plus urgente à payer.
   │
   │  UNE SEULE SOURCE : `serieMensuelleEncaisse` est bâtie sur `caMoisEncaisse` (v1331, déjà
   │  testée). On ne recrée SURTOUT PAS une troisième vérité — on réutilise celle qui existe.
   │
   └─ DETTE 2 — LE PARAMÈTRE PERDU EN SILENCE (angle mort déclaré en vague 51)
      La v1330 a appris le mois nommé au CA… et à lui seul. « Mon net en poche en mai » renvoyait
      juillet : `aiQueryNetPoche` codait le mois courant EN DUR et ignorait purement ses
      paramètres. Même bug, même gravité que la v1330 : l'intention est BONNE, le paramètre se
      perd, et l'app affiche un chiffre juste À UNE AUTRE QUESTION.

      DEUX RÈGLES FIGÉES :
        1. Le mois nommé est injecté dans toutes les compétences qui savent le traiter.
        2. Celles qui NE savent PAS le traiter ne l'ignorent plus en silence : elles le DISENT.
           Un paramètre donné par Benjamin et jeté sans un mot, c'est le pire des deux mondes.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');
const fs = require('fs');
const path = require('path');
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function buildModule(){
  const code = `
    const money2 = n => Math.round(n*100)/100;
    const round3 = n => Math.round(n*1000)/1000;
    ${extractFunction('monthKey')}
    ${extractFunction('_dansPeriode')}
    ${extractConstLine('ymKey')}
    ${extractFunction('estReprise')}
    ${extractFunction('lineTotalStored')}
    ${extractFunction('orderToLines')}
    ${extractFunction('paiementsDe')}
    // [v1336] Les MARCHES entrent dans le CA : ils ne passent jamais par la table orders.
    ${extractConstLine('marcheDate')}
    const swallow = () => {};
    const addMoney = (...a) => Math.round(a.reduce((x,y)=>x+(+y||0),0)*100)/100;
    ${extractConstLine('addQty')}
    ${extractConstLine('subQty')}
    ${extractFunction('marketLineSummary')}
    ${extractFunction('caMarcheEncaisse')}
    ${extractFunction('caMarchesDuMois')}
    ${extractFunction('caEncaisseParMois')}
    ${extractFunction('macaronsDeCommande')}
    ${extractFunction('caMoisEncaisse')}
    ${extractFunction('serieMensuelleEncaisse')}
    return { serieMensuelleEncaisse, caMoisEncaisse, caEncaisseParMois, orderToLines };
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

console.log('\n=== TESTS — Vague 54 : une seule vérité, et aucun paramètre perdu ===\n');

const cmd = (id, dateCmd, montant, paiements, parfums) => ({
  id, date: dateCmd, montant, paiement: 'Payé', paiements,
  lignes: [{ type:'coffret', taille:6, parfums: parfums || [] }]
});

// ---------------------------------------------------------------------------
// A. LA SÉRIE MENSUELLE — les courbes disent enfin la même chose que le copilote
// ---------------------------------------------------------------------------
{
  // Commande de mai (100 €, 20 macarons) payée en JUILLET.
  // Commande de mai (200 €, 40 macarons) : acompte 50 € en mai, solde 150 € en juin.
  const orders = [
    cmd(1, '2026-05-20', 100, [{date:'2026-07-03', montant:100}], [{nom:'Vanille', qte:20}]),
    cmd(2, '2026-05-10', 200, [{date:'2026-05-15', montant:50}, {date:'2026-06-20', montant:150}], [{nom:'Chocolat', qte:40}])
  ];
  const S = M.serieMensuelleEncaisse(orders, M.orderToLines);

  eq(S.mois, ['2026-05','2026-06','2026-07'],
     'A1 · les mois affichés sont ceux où l\'ARGENT EST RENTRÉ, pas ceux où les commandes ont été passées');
  eq(S.parMois['2026-05'].ca, 50,  'A2 · mai : 50 € (le seul acompte réellement encaissé)');
  eq(S.parMois['2026-06'].ca, 150, 'A3 · juin : 150 € (le solde)');
  eq(S.parMois['2026-07'].ca, 100, 'A4 · juillet : 100 € (la commande de mai, payée en juillet)');

  // Les macarons suivent le MÊME prorata — sinon la courbe €  et la courbe macarons
  // raconteraient deux histoires sur le même graphique.
  eq(S.parMois['2026-05'].macarons, 10, 'A5 · mai : 10 macarons (25 % de la commande de 40, au prorata)');
  eq(S.parMois['2026-06'].macarons, 30, 'A6 · juin : les 30 restants');
  eq(S.parMois['2026-07'].macarons, 20, 'A7 · juillet : les 20 de l\'autre commande');

  // TRAÇABILITÉ : la somme des mois = tout l'argent encaissé, ni plus ni moins.
  const totalCa = S.mois.reduce((a,m)=>a+S.parMois[m].ca, 0);
  eq(Math.round(totalCa*100)/100, 300, 'A8 · TRAÇABILITÉ : 50 + 150 + 100 = 300 € — aucun euro perdu ni dupliqué');
  const totalMac = S.mois.reduce((a,m)=>a+S.parMois[m].macarons, 0);
  eq(totalMac, 60, 'A9 · TRAÇABILITÉ : 10 + 30 + 20 = 60 macarons (20 + 40)');
}

// ---------------------------------------------------------------------------
// B. UNE SEULE SOURCE — la série NE DOIT PAS être une 3e vérité
// ---------------------------------------------------------------------------
// C'est LE point. On a déjà eu deux vérités (v1331). En bâtir une troisième pour les graphiques
// serait ajouter au mal en croyant le soigner. La série DOIT coïncider, au centime, avec les deux
// sources déjà en place : caMoisEncaisse (le copilote) et caEncaisseParMois (la compta).
{
  const orders = [
    cmd(1, '2026-05-20', 100, [{date:'2026-07-03', montant:100}], [{nom:'Vanille', qte:20}]),
    cmd(2, '2026-05-10', 200, [{date:'2026-05-15', montant:50}, {date:'2026-06-20', montant:150}], [{nom:'Chocolat', qte:40}]),
    cmd(3, '2026-06-01', 75,  [{date:'2026-06-02', montant:75}], [{nom:'Citron', qte:15}])
  ];
  const S = M.serieMensuelleEncaisse(orders, M.orderToLines);
  const compta = M.caEncaisseParMois(orders).parMois;

  S.mois.forEach(ym => {
    eq(S.parMois[ym].ca, M.caMoisEncaisse(orders, ym, M.orderToLines).ca,
       `B · ${ym} : la COURBE = le COPILOTE (caMoisEncaisse), au centime`);
    eq(S.parMois[ym].ca, Math.round((compta[ym]||0)*100)/100,
       `B · ${ym} : la COURBE = la COMPTA (caEncaisseParMois), au centime`);
  });
}

// ---------------------------------------------------------------------------
// C. GARDE-FOU STRUCTUREL — plus aucun écran ne lit l'ancienne base
// ---------------------------------------------------------------------------
// Comme aux vagues 49 et 50 : on n'interdit pas un cas, on interdit LE MOTIF. Toute lecture d'un
// CA mensuel depuis computeStats (base « date de commande ») dans du code d'AFFICHAGE fera
// échouer ce test — y compris celles qui ne sont pas encore écrites.
{
  const fautes = [];
  APP.split('\n').forEach((l, i) => {
    // On cible la lecture d'un CA mensuel : `.parMois[…].ca`
    if(!/parMois\[[^\]]+\]\.ca\b/.test(l)) return;
    if(/^\s*(\/\/|\*)/.test(l)) return;                       // commentaire
    // computeStats CONSTRUIT ses tables (`+=`) : c'est une écriture, pas une lecture d'affichage.
    // La base « date de commande » y reste légitime — elle sert la vue « par commande » et le
    // graphe par client (explicitement étiqueté comme tel en v1333). Ce qu'on interdit, c'est de
    // la LIRE pour afficher un CA mensuel.
    if(/\.ca\s*\+=/.test(l)) return;
    if(/_SE\.|_SEc\.|_SEG\.|src\[/.test(l)) return;            // déjà sur la nouvelle base (v1339 : _SEG)
    fautes.push(`ligne ${i+1} : ${l.trim().slice(0,90)}`);
  });
  ok(fautes.length === 0,
     'C1 · GARDE-FOU : aucun écran ne lit plus le CA mensuel sur la base « date de commande »');
  fautes.forEach(f => failures.push('      ' + f));
}

// ---------------------------------------------------------------------------
// D. LE PARAMÈTRE PERDU EN SILENCE — les deux tables de routage
// ---------------------------------------------------------------------------
// Règle 1 : le mois nommé est injecté dans les compétences qui savent le traiter.
// Règle 2 : celles qui ne savent pas le DISENT. Jamais de silence.
{
  const bloc = (nom) => {
    const i = APP.indexOf('const ' + nom + ' = new Set([');
    if(i < 0) return null;
    return APP.slice(i, APP.indexOf(']);', i));
  };
  const supporte = bloc('AI_INTENTS_MOIS');
  const attendu  = bloc('AI_INTENTS_MOIS_ATTENDU');

  ok(supporte !== null, 'D1 · la table des compétences qui HONORENT un mois existe');
  ok(attendu  !== null, 'D2 · … et celle des compétences qui doivent l\'AVOUER aussi');

  // Les trois compétences câblées doivent y être.
  ['query_revenue','query_net_poche','query_urssaf'].forEach(i => {
    ok(supporte.includes(i), `D · « ${i} » honore un mois nommé`);
  });

  // Aucune compétence ne peut être dans les DEUX : elle sait, ou elle avoue. Pas les deux.
  const dansLesDeux = ['query_revenue','query_net_poche','query_urssaf']
    .filter(i => attendu.includes(i));
  eq(dansLesDeux, [],
     'D6 · INVARIANT : une compétence ne peut pas à la fois honorer un mois ET avouer qu\'elle ne sait pas');

  // Le STOCK est délibérément ABSENT des deux listes : c'est une PHOTO du présent. Prétendre
  // pouvoir le filtrer par mois — ou s'en excuser — serait une autre forme de mensonge.
  ok(!supporte.includes('query_stock') && !attendu.includes('query_stock'),
     'D7 · le STOCK n\'est dans aucune liste : c\'est une photo du présent, il n\'y a rien à filtrer');
}

// ---------------------------------------------------------------------------
// E. LES DEUX CORRECTIFS DE COMPÉTENCE — le mois était CODÉ EN DUR
// ---------------------------------------------------------------------------
// `aiQueryNetPoche` codait `monthKey(today())` EN DUR et ignorait `params` : « mon net en poche
// en mai » répondait juillet. On vérifie que le code lit désormais la période.
{
  const netPoche = APP.slice(APP.indexOf('async function aiQueryNetPoche'),
                             APP.indexOf('async function aiQueryNetPoche') + 1400);
  ok(/params\.periode/.test(netPoche),
     'E1 · aiQueryNetPoche LIT enfin params.periode (avant : le mois était codé en dur)');
  ok(/\^\\\\d\{4\}-\\\\d\{2\}\$|\\d\{4\}-\\d\{2\}/.test(netPoche),
     'E2 · … et reconnaît une clé de mois AAAA-MM');

  const urssaf = APP.slice(APP.indexOf('async function aiQueryUrssaf'),
                           APP.indexOf('async function aiQueryUrssaf') + 1200);
  ok(/monthLabel\(ym\)/.test(urssaf),
     'E3 · aiQueryUrssaf affiche le mois demandé (avant : « ce mois-ci » ou « le mois dernier », rien d\'autre)');
}

// ---------------------------------------------------------------------------
console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail){
  console.log('\n' + failures.join('\n') + '\n');
  console.log('✗ RÉGRESSION DÉTECTÉE.\n');
  process.exit(1);
}
console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
