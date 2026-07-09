/* ============================================================================
   TESTS DE CARACTÉRISATION — Vague 18 : numérotation légale (factures & avoirs)
   ----------------------------------------------------------------------------
   Fige le comportement des compteurs séquentiels légaux (art. 242 nonies A CGI :
   continuité, jamais de trou, jamais de réutilisation). Une erreur ici est une
   VIOLATION LÉGALE, pas juste un bug d'affichage — c'est la fonction la plus
   sensible du filet de sécurité posé en vue d'un futur refactoring.
   Dépend de localStorage (compteur persistant) : stubbé en mémoire pour le test.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildModule(){
  const docEstDefinitif = extractFunction('docEstDefinitif');
  const docEstAvoirDefinitif = extractFunction('docEstAvoirDefinitif');
  // Les corps de _factSeqGet/_factSeqSet/_avoirSeqGet/_avoirSeqSet et les fonctions next*
  // sont courts et mono-bloc mais utilisent localStorage/FACT_SEQ_KEY/AVOIR_SEQ_KEY en
  // closure — on les extrait individuellement pour rester fidèle au code réel.
  const nextFactureNumeroDefinitif = extractFunction('nextFactureNumeroDefinitif');
  const peekFactureNumero = extractFunction('peekFactureNumero');
  const nextAvoirNumeroDefinitif = extractFunction('nextAvoirNumeroDefinitif');
  const peekAvoirNumero = extractFunction('peekAvoirNumero');
  const code = `
    const FACT_SEQ_KEY = 'sm_factSeq';
    function _factSeqGet(){ const raw = parseInt(localStorage.getItem(FACT_SEQ_KEY), 10); return Number.isFinite(raw) ? raw : 23; }
    function _factSeqSet(n){ localStorage.setItem(FACT_SEQ_KEY, String(n)); }
    const AVOIR_SEQ_KEY = 'sm_avoirSeq';
    function _avoirSeqGet(){ const raw = parseInt(localStorage.getItem(AVOIR_SEQ_KEY), 10); return Number.isFinite(raw) ? raw : 0; }
    function _avoirSeqSet(n){ localStorage.setItem(AVOIR_SEQ_KEY, String(n)); }
    ${docEstDefinitif}
    ${docEstAvoirDefinitif}
    ${nextFactureNumeroDefinitif}
    ${peekFactureNumero}
    ${nextAvoirNumeroDefinitif}
    ${peekAvoirNumero}
    return { nextFactureNumeroDefinitif, peekFactureNumero, nextAvoirNumeroDefinitif, peekAvoirNumero,
      _factSeqGet, _avoirSeqGet };
  `;
  const factory = new Function('db', 'localStorage', code);
  return factory;
}

// localStorage en mémoire (jamais partagé entre tests : une instance neuve par cas).
function makeLocalStorage(){
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k,v) => { store[k]=String(v); }
  };
}
function makeDb(documents){
  const docs = documents || [];
  return { documents: { where: (field) => ({ equals: (val) => ({ toArray: async()=>docs.filter(d=>d[field]===val) }) }) } };
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}

async function run(){

// ── CAS 1 — Facture : première facture démarre à 24 (départ conventionnel de l'app) ──
{
  const ls = makeLocalStorage();
  const m = buildModule()(makeDb([]), ls);
  const num = await m.nextFactureNumeroDefinitif();
  eq(/-(24)$/.test(num), true, 'CAS1 · première facture jamais émise → numéro se termine par -24');
}

// ── CAS 2 — Facture : deux appels successifs → séquence strictement continue, jamais de trou ──
{
  const ls = makeLocalStorage();
  const m = buildModule()(makeDb([]), ls);
  const n1 = await m.nextFactureNumeroDefinitif();
  const n2 = await m.nextFactureNumeroDefinitif();
  const s1 = +n1.match(/-(\d+)$/)[1], s2 = +n2.match(/-(\d+)$/)[1];
  eq(s2, s1+1, 'CAS2 · le 2e numéro suit immédiatement le 1er (aucun trou)');
}

// ── CAS 3 — Facture : jamais de réutilisation même si des factures définitives existent déjà
//    en base avec un numéro PLUS HAUT que le compteur local (garde-fou anti-régression) ──
{
  const ls = makeLocalStorage();   // compteur local vierge (comme après perte de storage)
  const docs = [
    { type:'facture', statut:'emise', numero:'20260701-99' }   // déjà une facture n°99 en base !
  ];
  const m = buildModule()(makeDb(docs), ls);
  const num = await m.nextFactureNumeroDefinitif();
  const seq = +num.match(/-(\d+)$/)[1];
  eq(seq, 100, 'CAS3 · garde-fou anti-régression : repart à 100 (jamais en dessous du max déjà attribué)');
}

// ── CAS 4 — Facture : une facture BROUILLON (non définitive) n'influence PAS le garde-fou ──
{
  const ls = makeLocalStorage();
  const docs = [
    { type:'facture', statut:'brouillon', numero:'20260701-500' }   // brouillon : jamais définitif
  ];
  const m = buildModule()(makeDb(docs), ls);
  const num = await m.nextFactureNumeroDefinitif();
  const seq = +num.match(/-(\d+)$/)[1];
  eq(seq, 24, 'CAS4 · un brouillon n\'affecte pas la séquence légale (repart à 24, pas 501)');
}

// ── CAS 5 — Facture : peekFactureNumero ne CONSOMME PAS le numéro (aperçu seul) ──
{
  const ls = makeLocalStorage();
  const m = buildModule()(makeDb([]), ls);
  const preview1 = m.peekFactureNumero();
  const preview2 = m.peekFactureNumero();
  eq(preview1, preview2, 'CAS5 · deux aperçus successifs donnent le MÊME numéro (pas de consommation)');
  const real = await m.nextFactureNumeroDefinitif();
  eq(real, preview1, 'CAS5 · le numéro réellement attribué correspond à ce que l\'aperçu annonçait');
}

// ── CAS 6 — Avoir : compteur totalement SÉPARÉ de celui des factures ──
{
  const ls = makeLocalStorage();
  const m = buildModule()(makeDb([]), ls);
  await m.nextFactureNumeroDefinitif();   // consomme une facture (compteur facture → 24)
  const avoirNum = await m.nextAvoirNumeroDefinitif();
  eq(/-1$/.test(avoirNum), true, 'CAS6 · le premier avoir est numéroté 1, indépendamment du compteur factures');
  eq(avoirNum.startsWith('AV-'), true, 'CAS6 · préfixe AV- distinct du préfixe facture');
}

// ── CAS 7 — Avoir : même garde-fou anti-régression que les factures ──
{
  const ls = makeLocalStorage();
  const docs = [{ type:'avoir', statut:'emis', numero:'AV-202607-42' }];
  const m = buildModule()(makeDb(docs), ls);
  const num = await m.nextAvoirNumeroDefinitif();
  const seq = +num.match(/-(\d+)$/)[1];
  eq(seq, 43, 'CAS7 · garde-fou anti-régression sur les avoirs aussi (repart à 43, pas 1)');
}

// ── CAS 8 — Avoir : un avoir statut 'enregistre' (pas 'emis') n'est PAS "définitif" pour la
//    numérotation légale — seul 'emis' (facture liée) porte un numéro légal obligatoire ──
{
  const ls = makeLocalStorage();
  const docs = [{ type:'avoir', statut:'enregistre', numero:null }];   // remboursement simple, sans numéro légal
  const m = buildModule()(makeDb(docs), ls);
  const num = await m.nextAvoirNumeroDefinitif();
  const seq = +num.match(/-(\d+)$/)[1];
  eq(seq, 1, 'CAS8 · un avoir "enregistre" sans numéro n\'influence pas la séquence légale (repart à 1)');
}

// ── résultat ──
console.log('\n=== TESTS DE CARACTÉRISATION — Vague 18 : numérotation légale ===\n');
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
