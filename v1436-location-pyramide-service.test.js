/* ============================================================================
   TESTS — v1436 : LA LOCATION DE PYRAMIDE NE REMONTAIT PAS TOUJOURS EN SERVICE
   ----------------------------------------------------------------------------
   Ben : « Pourquoi certaines locations de pyramides ne passent pas en prestation
   de service ? Quand je vais dans ma comptabilité la ventilation ne remonte pas
   systématiquement l'ensemble des commandes avec une location et je me demande
   si déjà à la source la liaison se fait ou si c'est plutôt en aval du
   processus que provient l'origine de ce bug. »

   RÉPONSE À SA QUESTION DIRECTE : le lien se fait CORRECTEMENT à la source.
   Une pyramide louée est bien marquée (`ligneALocation`, `pyraTotalLigne`), et
   son montant est bien inclus dans le total de la ligne événement. Le bug est
   ENTIÈREMENT EN AVAL, dans l'agrégation qui décide ce qui compte comme service.

   LA CAUSE : `partServiceCommande` — créée en v1325 pour être LE point de
   vérité partagé entre le Bilan mensuel & URSSAF et le revenu horaire — ne
   reconnaissait que les lignes `type==='prestation'`. Elle ignorait les lignes
   `type==='evenement'`, où vit pourtant la location de pyramide et l'accessoire
   décoratif. D'où le symptôme exact : « pas systématiquement ». Une commande
   avec pyramide louée MAIS SANS ligne prestation séparée remontait à 100 % en
   marchandise. Une commande qui avait les deux remontait en partie service —
   mais seulement à hauteur de la prestation, jamais de la location.

   Et la règle correcte existait déjà ailleurs : `computeOrderMargins` (marge
   par commande) savait depuis toujours que la pyramide louée est un service et
   la pyramide vendue une marchandise. La fonction censée être « LE » point de
   vérité partagé n'était donc pas la seule vérité.

   Propriétés verrouillées ici :
     1. Une pyramide LOUÉE compte en service, avec ou sans ligne prestation.
     2. Une pyramide VENDUE compte en marchandise, jamais en service.
     3. L'accessoire décoratif (location) compte en service.
     4. Les dons et les autres lignes ne comptent jamais en service.
     5. `computeOrderMargins` et `partServiceCommande` s'accordent désormais
        sur le même chiffre pour la même commande (fin de la double vérité).
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine, stripComments } = require('./_extract');

function buildModule(){
  const code = `
    ${extractConstLine('money2')}
    ${extractConstLine('EVENT_PRICE')}
    ${extractConstLine('PYRA_PRICE')}
    ${extractConstLine('EQUIP_PRICE')}
    ${extractConstLine('ACCESS_DECO_PRICE')}
    const BOX_PRICES = {}; const BOX_FLAVOR_LIMIT = {}; const FLAVOR_SURCHARGE = 0;
    const bigPrice = () => 0; const vracPrixMacaron = () => 0;
    ${extractFunction('eventUnitPrice')}
    ${extractFunction('pyraEstVente')}
    ${extractFunction('pyraPrixUnit')}
    ${extractFunction('pyraTotalLigne')}
    ${extractFunction('pyraCoutLigne')}
    ${extractFunction('accessoireDecoActif')}
    ${extractFunction('accessoireDecoTotal')}
    ${extractFunction('lineTotalStored')}
    ${extractFunction('orderToLines')}
    ${extractFunction('montantServiceLigne')}
    ${extractFunction('partServiceCommande')}
    return { montantServiceLigne, partServiceCommande, lineTotalStored, pyraTotalLigne };
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function vrai(cond, label){ eq(!!cond, true, label); }

const ligneEvt = (equip, extra) => Object.assign({ type:'evenement', evQte:40, equip }, extra||{});

function run(){
const M = buildModule();

// ── CAS 1 : LE CAS DE BEN — pyramide louée SEULE, sans ligne prestation ────
// C'est exactement le trou : avant, cette commande remontait à 0 % service.
{
  const ln = ligneEvt(1);   // 1 pyramide, louée par défaut (pyraVendue absent)
  eq(M.montantServiceLigne(ln), 20, 'CAS1 · la location de la pyramide (20 €) compte en service');
  const total = M.lineTotalStored(ln);   // 40×1,60 + 20 = 84
  eq(total, 84, 'CAS1 · le total de ligne inclut bien la location');
  const o = { montant: 84, lignes:[ln] };
  eq(M.partServiceCommande(o), 20/84, 'CAS1 · la commande remonte en service, alors qu\'elle n\'a AUCUNE ligne prestation');
}

// ── CAS 2 : une pyramide VENDUE ne compte jamais en service ───────────────
{
  const ln = ligneEvt(1, { pyraVendue:true, pyraPrixVente:35, pyraCoutAchat:12 });
  eq(M.montantServiceLigne(ln), 0, 'CAS2 · vendue → aucune part service');
  const o = { montant: M.lineTotalStored(ln), lignes:[ln] };
  eq(M.partServiceCommande(o), 0, 'CAS2 · la commande entière reste marchandise');
}

// ── CAS 3 : l'accessoire décoratif (location) compte en service ──────────
{
  const ln = ligneEvt(2, { accessoireDeco:true });   // 2 pyramides louées + accessoire
  eq(M.montantServiceLigne(ln), 40 + 34, 'CAS3 · 2×20 € de location + 2×17 € d\'accessoire');
}

// ── CAS 4 : accessoire SANS pyramide ne compte pas (garde-fou existant) ──
// `accessoireDecoActif` exige qu'au moins une pyramide soit présente.
{
  const ln = ligneEvt(0, { accessoireDeco:true });
  eq(M.montantServiceLigne(ln), 0, 'CAS4 · pas de pyramide → pas d\'accessoire facturable');
}

// ── CAS 5 : LE SYMPTÔME EXACT DE BEN — « pas systématiquement » ──────────
// Deux commandes avec pyramide louée. L'une a AUSSI une ligne prestation,
// l'autre non. Avant le correctif, seule la première montrait du service —
// et seulement à hauteur de la prestation, jamais de la pyramide.
{
  const avecPresta = { montant: 0, lignes:[
    ligneEvt(1),                                                    // 84 € (dont 20 € pyramide)
    { type:'prestation', montantHT:50, remiseType:'pct', remisePct:0 },  // 50 €
  ]};
  avecPresta.montant = M.lineTotalStored(avecPresta.lignes[0]) + M.lineTotalStored(avecPresta.lignes[1]);
  const sansPresta = { montant: M.lineTotalStored(ligneEvt(1)), lignes:[ligneEvt(1)] };

  const svcAvec = M.partServiceCommande(avecPresta);
  const svcSans = M.partServiceCommande(sansPresta);
  vrai(svcAvec > 0, 'CAS5 · avec ligne prestation : du service remonte (attendu, avant et après)');
  vrai(svcSans > 0, 'CAS5 · SANS ligne prestation : du service remonte AUSSI désormais — c\'était 0 avant');
  // Et la part service de la commande "avec" doit désormais inclure la pyramide, pas seulement
  // la prestation : 20 (pyramide) + 50 (prestation) = 70 sur 134.
  eq(Math.round(svcAvec*avecPresta.montant*100)/100, 70,
     'CAS5 · la part service compte la pyramide ET la prestation, plus seulement la seconde');
}

// ── CAS 6 : les dons et les autres lignes ne comptent jamais en service ──
{
  eq(M.montantServiceLigne({type:'don'}), 0, 'CAS6 · un don n\'est pas un service');
  eq(M.montantServiceLigne({type:'coffret'}), 0, 'CAS6 · un coffret non plus');
  eq(M.montantServiceLigne(null), 0, 'CAS6 · entrée vide → 0, pas d\'exception');
}

// ── CAS 7 : une commande à 100 % prestation reste à 100 % service ────────
// Contre-épreuve : le comportement historique, correct, n'a pas bougé.
{
  const o = { montant: 120, lignes:[{type:'prestation', montantHT:120, remiseType:'pct', remisePct:0}] };
  eq(M.partServiceCommande(o), 1, 'CAS7 · commande 100% prestation → 100% service, comme avant');
}

// ── CAS 8 : plafonné à 1 même si les lignes dépassent le montant total ───
// Garde-fou hérité, à ne pas perdre dans la réécriture.
{
  const o = { montant: 10, lignes:[ligneEvt(1)] };   // service réel = 20, montant commande = 10
  eq(M.partServiceCommande(o), 1, 'CAS8 · jamais plus de 100%, quelle que soit l\'incohérence des données');
}

// ── CAS 9 : LA RÉPONSE STRUCTURELLE — un seul point de vérité, pas deux ──
// `computeOrderMargins` (marge par commande) avait DÉJÀ la bonne règle, en
// double. Elle utilise désormais la même fonction que partServiceCommande —
// fin de la divergence entre les deux écrans.
{
  const src = stripComments(extractFunction('computeOrderMargins'));
  vrai(/caService=money2\(caService\+montantServiceLigne\(ln\)\)/.test(src),
     'CAS9 · computeOrderMargins utilise le point de vérité partagé');
  eq(/caService=money2\(caService\+pyraMontant\)/.test(src), false,
     'CAS9 · l\'ancienne logique dupliquée (pyramide → service, en dur) a disparu');
  eq(/if\(accessoireDecoActif\(ln\)\)\{ caService=money2\(caService\+accessoireDecoTotal\(ln\)\); \}/.test(src), false,
     'CAS9 · … et son pendant pour l\'accessoire aussi');
  vrai(/if\(pyraEstVente\(ln\)\)\{/.test(src),
     'CAS9 · la bascule vers marchandise pour une pyramide VENDUE, elle, est conservée');
}

// ── CAS 10 : partServiceCommande n'a plus de condition sur le seul type ──
// C'est la ligne exacte qui excluait les locations de pyramide.
{
  const src = stripComments(extractFunction('partServiceCommande'));
  eq(/ln && ln\.type === 'prestation'/.test(src), false,
     'CAS10 · le filtre restrictif d\'origine a disparu');
  vrai(/montantServiceLigne\(ln\)/.test(src),
     'CAS10 · toutes les lignes passent désormais par le point de vérité partagé');
}

// ── CAS 11 : le revenu horaire (autre écran, même fonction) hérite du fix ─
// Il appelait déjà partServiceCommande — pas de changement de son côté à faire,
// juste vérifier qu'il continue de s'appuyer sur cette même fonction.
{
  const app = require('./_extract').APP;
  const i = app.indexOf('const _svc = money2(encO * partServiceCommande(o));');
  vrai(i > -1, 'CAS11 · le revenu horaire appelle bien partServiceCommande');
}

// ── résultat ──
console.log('\n=== TESTS — v1436 : la location de pyramide remonte en service, toujours ===\n');
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
