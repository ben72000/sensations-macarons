/* ============================================================================
   TESTS — v1427 : REPRISE / MIGRATION DU STOCK DE CHANTACHE
   ----------------------------------------------------------------------------
   Ben : « Je veux un ajout de la migration chantache dans l'outil reprise /
   migration ».

   CE QUI MANQUAIT, ET POURQUOI ÇA COÛTAIT CHER : la reprise savait saisir le
   stock de départ des produits finis, des coques et des garnitures liées à un
   parfum — mais pas celui des COMPOSANTS DU CATALOGUE (chantache, chantilly…),
   dont le stock est mutualisé et ne dépend d'aucun parfum. Or un grand format
   exige une dose de composant, et l'assemblage BLOQUE si aucun lot terminé
   n'existe (garde-fou v1248, volontaire). Sans cette saisie, Ben devait donc
   PRODUIRE une chantache qu'il avait déjà au frigo — et payer une seconde fois
   les matières pour l'obtenir.

   Propriétés verrouillées ici :
     1. Le lot créé a la MÊME signature que celui de `produireComposant` sur tous
        les champs que l'assemblage lit — sinon il serait invisible au moment de
        monter un grand format, et le bug serait pire que le manque.
     2. Trois différences, et trois seulement, toutes voulues : aucune matière
        décomptée, statut « terminé », marquage reprise (histo + rangée).
     3. Refus propre si le composant ou la quantité manquent — rien n'est écrit.
     4. Le panneau ne s'affiche que s'il existe un composant au catalogue, sinon
        il dit où en créer un plutôt que d'offrir un menu vide.
     5. La reprise n'écrit RIEN dans prodConsumption ni dans materialLots.
   ============================================================================ */
'use strict';
const { extractFunction, APP } = require('./_extract');

// ⚠️ `renderMigration` n'est pas extractible en entier (6 467 caractères sur 13 932) :
// l'équilibreur d'accolades cale sur les gabarits imbriqués du HTML. Une garde écrite sur
// l'extraction tronquée ne verrait pas le nouveau panneau et passerait au vert pour rien.
// On délimite donc la zone réelle, du début de la fonction à la déclaration suivante.
function zoneFonction(nom){
  const re = new RegExp('^(?:async\\s+)?function\\s+' + nom + '\\s*\\(', 'm');
  const m = re.exec(APP);
  if(!m) throw new Error('Introuvable (zone): ' + nom);
  const debut = m.index;
  const suiv = /^(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/m.exec(APP.slice(debut + m[0].length));
  return APP.slice(debut, suiv ? debut + m[0].length + suiv.index : APP.length);
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function vrai(cond, label){ eq(!!cond, true, label); }

// ── Bac à sable : on exécute la VRAIE migSaveChantache contre des stubs ──────
// Elle touche au DOM et à la base ; on remplace l'un et l'autre par des doubles
// qui enregistrent ce qui a été demandé, pour observer le lot réellement écrit.
function jouer(champs, composants){
  const ecrits = [];
  const toasts = [];
  const ctx = {
    val: id => (champs[id] !== undefined ? String(champs[id]) : ''),
    today: () => '2026-07-29',
    qty: n => String(n),
    toast: m => toasts.push(m),
    isFreezer: k => k==='bahut' || k==='congelo',
    lotAvecEmplacement: (base, dest) => base + '-' + String(dest||'').charAt(0).toUpperCase(),
    lotDateJJMMAA: d => String(d).slice(8,10)+String(d).slice(5,7)+String(d).slice(2,4),
    renderMigration: () => {},
    EMPLACEMENTS: [
      { key:'bahut',  type:'congelateur', lettre:'B', icon:'❄️', nom:'Bahut' },
      { key:'frigo',  type:'frigo',       lettre:'F', icon:'🧊', nom:'Frigo' },
    ],
    document: {
      querySelector: sel => champs._emp ? { value: champs._emp } : null,
    },
    db: {
      components: { get: id => Promise.resolve(composants[id] || null) },
      productions: { add: o => { ecrits.push(o); return Promise.resolve(ecrits.length); } },
    },
  };
  const noms = Object.keys(ctx);
  const fn = new Function(...noms, `
    ${extractFunction('migSaveChantache')}
    return migSaveChantache();
  `);
  return fn(...noms.map(n=>ctx[n])).then(()=>({ ecrits, toasts }));
}

const COMPOSANTS = { 7:{ id:7, nom:'Chantache vanille', rendement:12 } };

async function run(){

// ── CAS 1 : le lot est bien créé, avec la bonne quantité ───────────────────
{
  const { ecrits, toasts } = await jouer({ mig_chantCid:'7', mig_chantQte:'20', mig_chantDlc:'2026-08-05', _emp:'frigo' }, COMPOSANTS);
  eq(ecrits.length, 1, 'CAS1 · un lot écrit');
  const p = ecrits[0];
  eq([p.qteProduite, p.qteRestante, p.qteTheorique, p.qteReelle, p.ecart], [20,20,20,20,0],
     'CAS1 · 20 doses, sans écart');
  eq(p.dlcProduit, '2026-08-05', 'CAS1 · DLC saisie conservée');
  eq(p.dlcAuto, false,           'CAS1 · … et non recalculée');
  vrai(/Chantache vanille/.test(toasts.join(' ')), 'CAS1 · le retour nomme le composant');
}

// ── CAS 2 : SIGNATURE IDENTIQUE à celle de produireComposant ────────────────
// C'est le cœur : ce sont ces champs exacts que lit le sélecteur du 3ᵉ élément
// (`composantCatalogue===true && componentId===cid && prodStatut==='termine'`).
// Un seul qui diverge, et le lot repris devient invisible à l'assemblage.
{
  const { ecrits } = await jouer({ mig_chantCid:'7', mig_chantQte:'12', _emp:'frigo' }, COMPOSANTS);
  const p = ecrits[0];
  eq(p.composantCatalogue, true, 'CAS2 · drapeau composantCatalogue');
  eq(p.componentId, 7,           'CAS2 · rattaché au bon composant');
  eq(p.recipeId, null,           'CAS2 · aucun parfum (stock mutualisé)');
  eq(p.composant, 'ganache',     'CAS2 · reconnu comme brique d\'assemblage');
  eq(p.garnitureType, 'ganache', 'CAS2 · typage identique à la production');
  eq(p.garnitureNom, 'Chantache vanille', 'CAS2 · nom lisible repris du catalogue');
  eq(p.prodStatut, 'termine',    'CAS2 · terminé : il est prêt, il doit être assemblable tout de suite');
}

// ── CAS 3 : les trois différences voulues avec une vraie production ─────────
{
  const { ecrits } = await jouer({ mig_chantCid:'7', mig_chantQte:'12', _emp:'frigo' }, COMPOSANTS);
  const p = ecrits[0];
  eq(p.histo, true,  'CAS3 · marqué reprise (comme les coques et garnitures de départ)');
  eq(p.rangee, true, 'CAS3 · rangé : il est déjà à sa place, pas à ranger');
  const src = extractFunction('migSaveChantache');
  eq(/materialLots|prodConsumption|recipeItems/.test(src), false,
     'CAS3 · aucune matière décomptée — c\'est du stock de départ, pas une production');
  eq(/db\.transaction/.test(src), false,
     'CAS3 · une seule écriture, pas de transaction multi-tables à orchestrer');
}

// ── CAS 4 : emplacement, DLC libre, traçabilité d'origine ──────────────────
{
  const { ecrits } = await jouer({ mig_chantCid:'7', mig_chantQte:'8', _emp:'bahut' }, COMPOSANTS);
  const p = ecrits[0];
  eq(p.emplacement, 'bahut',         'CAS4 · l\'emplacement choisi est respecté');
  eq(p.venuDuCongelateur, true,      'CAS4 · … et la règle congélateur suit');
  eq(p.dlcProduit, '',               'CAS4 · sans DLC saisie, aucune date inventée');
  eq(p.dlcAuto, true,                'CAS4 · … elle est marquée automatique');
  eq(p.histEmplacement.length, 1,    'CAS4 · une première étape de parcours');
  vrai(/reprise/.test(p.histEmplacement[0].motif),
     'CAS4 · dont le motif dit d\'où vient ce lot');
  eq(p.histEmplacement[0].lieu, 'bahut', 'CAS4 · au bon endroit');
}

// ── CAS 5 : n° de lot de la même forme que la production catalogue ─────────
// Base JJMMAA + GAR, suffixe -GA, lettre d'emplacement : ce que Ben lit sur
// l'étiquette doit être reconnaissable au même titre qu'un lot produit.
{
  const { ecrits } = await jouer({ mig_chantCid:'7', mig_chantQte:'8', _emp:'frigo' }, COMPOSANTS);
  const p = ecrits[0];
  eq(p.lotBase, '290726GAR',        'CAS5 · base datée du jour');
  eq(p.lotProduction, '290726GAR-GA-F', 'CAS5 · suffixe -GA + lettre d\'emplacement');
  eq(p.date, '2026-07-29',          'CAS5 · daté du jour de la saisie');
}

// ── CAS 6 : refus propres — rien n'est écrit ───────────────────────────────
{
  const sansComp = await jouer({ mig_chantQte:'10', _emp:'frigo' }, COMPOSANTS);
  eq(sansComp.ecrits.length, 0, 'CAS6 · sans composant : aucune écriture');
  vrai(/composant/i.test(sansComp.toasts.join(' ')), 'CAS6 · … et on dit ce qui manque');

  const sansQte = await jouer({ mig_chantCid:'7', mig_chantQte:'0', _emp:'frigo' }, COMPOSANTS);
  eq(sansQte.ecrits.length, 0, 'CAS6 · quantité nulle : aucune écriture');
  vrai(/dose/i.test(sansQte.toasts.join(' ')), 'CAS6 · … et on dit quoi saisir');

  const negative = await jouer({ mig_chantCid:'7', mig_chantQte:'-5', _emp:'frigo' }, COMPOSANTS);
  eq(negative.ecrits.length, 0, 'CAS6 · quantité négative refusée');

  const inconnu = await jouer({ mig_chantCid:'99', mig_chantQte:'10', _emp:'frigo' }, COMPOSANTS);
  eq(inconnu.ecrits.length, 0, 'CAS6 · composant introuvable : aucune écriture');
  vrai(/introuvable/i.test(inconnu.toasts.join(' ')), 'CAS6 · … et on le dit');
}

// ── CAS 7 : les décimales ne créent pas de demi-dose ───────────────────────
{
  const { ecrits } = await jouer({ mig_chantCid:'7', mig_chantQte:'12.6', _emp:'frigo' }, COMPOSANTS);
  eq(ecrits[0].qteRestante, 13, 'CAS7 · une dose est entière (arrondie)');
}

// ── CAS 8 : le panneau existe dans l'écran de reprise ──────────────────────
{
  const z = zoneFonction('renderMigration');
  vrai(/2 quater/.test(z),                     'CAS8 · un panneau dédié, à la suite des autres stocks de départ');
  vrai(/onclick="migSaveChantache\(\)"/.test(z),'CAS8 · … câblé sur la bonne fonction');
  vrai(/id="mig_chantCid"/.test(z) && /id="mig_chantQte"/.test(z) && /id="mig_chantDlc"/.test(z),
     'CAS8 · les trois champs lus par la fonction existent');
  vrai(/name="mig_chantEmp"/.test(z),          'CAS8 · … et le choix d\'emplacement aussi');
  vrai(/db\.components\.toArray/.test(z),      'CAS8 · le catalogue est chargé pour alimenter le menu');
}

// ── CAS 9 : catalogue vide → une direction, pas un menu vide ───────────────
{
  const z = zoneFonction('renderMigration');
  vrai(/compCatOpts \? `/.test(z),            'CAS9 · le formulaire est conditionné à l\'existence d\'un composant');
  vrai(/Aucun composant au catalogue/.test(z),'CAS9 · sinon un message le dit');
  vrai(/Recettes → Composants/.test(z),       'CAS9 · … et indique où en créer un');
}

// ── CAS 10 : les autres reprises sont intactes (contre-épreuve) ────────────
{
  vrai(/composant:'coques'/.test(extractFunction('migSaveCoques')),
     'CAS10 · la reprise des coques n\'a pas bougé');
  vrai(/garnitureType:garnType/.test(extractFunction('migSaveGarniture')),
     'CAS10 · celle des garnitures par parfum non plus');
  const z = zoneFonction('renderMigration');
  vrai(/migSaveStock\(\)/.test(z) && /migSaveCoques\(\)/.test(z) && /migSaveGarniture\(\)/.test(z) && /migSaveMatStock\(\)/.test(z),
     'CAS10 · les quatre panneaux existants sont toujours là');
}

// ── résultat ──
console.log('\n=== TESTS — v1427 : reprise / migration du stock de chantache ===\n');
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
