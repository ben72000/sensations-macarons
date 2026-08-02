/* ============================================================================
   TESTS — v1431 : LE MARCHÉ OUVERT DANS LE FIL, ET SES PARFUMS VISÉS
   ----------------------------------------------------------------------------
   Ben : « Un marché ouvert doit apparaître dans commande avec la quantité visée.
   Ainsi la quantité visée doit être renseignée à l'ouverture du marché avec les
   parfums souhaités. Ceci permet aussi d'approvisionner en donnée le
   rétroplanning pour fabriquer les quantités nécessaires dans les temps. »

   CE QUI EXISTAIT DÉJÀ — et qu'il ne fallait surtout pas réécrire :
   `buildProductionPlan` consommait DÉJÀ les marchés non clos dont `prevuQte>0`,
   et ventilait par parfum via la répartition apprise (`marketForecast`), avec un
   repli au prorata des commandes puis une ligne fourre-tout « Marché (parfums à
   définir) ». Le moteur de ventilation `marketVentilation` (cible × historique)
   existait aussi, utilisé par le Plan de production et le copilote.

   CE QUI MANQUAIT : DEVINER N'EST PAS DÉCIDER. Ben n'avait aucun moyen de dire
   ce qu'il veut emporter, parfum par parfum. Le plan estimait à sa place, et
   retombait sur une ligne anonyme quand l'historique manquait.

   Propriétés verrouillées ici :
     1. Le choix de Ben PRIME sur la ventilation devinée, et court-circuite les
        deux replis.
     2. Sans choix, les replis d'origine fonctionnent exactement comme avant
        (contre-épreuve : on n'a pas cassé le comportement par défaut).
     3. Seules les lignes renseignées sont enregistrées : une liste de zéros
        n'est pas une ventilation.
     4. Le bouton « Répartir automatiquement » réutilise `marketVentilation` —
        aucun second moteur.
     5. Le marché ouvert apparaît dans le fil des commandes avec sa quantité
        visée, SANS entrer dans `_cmdCache` (ce n'est pas une commande).
     6. Un marché sans quantité visée est signalé, parce qu'il n'alimente pas
        le rétroplanning.
   ============================================================================ */
'use strict';
const { extractFunction, stripComments, APP } = require('./_extract');

// `marketForm` SUR-extrait (28 339 caractères, l'équilibreur finit dans une autre fonction) :
// une garde écrite dessus matcherait du code voisin et passerait au vert pour rien. Zone réelle.
function zoneFonction(nom){
  const re = new RegExp('^(?:async\\s+)?function\\s+' + nom + '\\s*\\(', 'm');
  const m = re.exec(APP);
  if(!m) throw new Error('Introuvable (zone): ' + nom);
  const debut = m.index;
  const suiv = /^(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/m.exec(APP.slice(debut + m[0].length));
  return APP.slice(debut, suiv ? debut + m[0].length + suiv.index : APP.length);
}

function buildModule(){
  const code = `
    const aiNormalize = s => String(s||'').toLowerCase().trim();
    ${extractFunction('marketVentilation')}
    return { marketVentilation };
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function vrai(cond, label){ eq(!!cond, true, label); }

// La règle de besoin d'un marché, rejouée à l'identique de _buildProductionPlanRaw : le choix de
// Ben d'abord, puis la répartition apprise, puis le prorata des commandes, puis le fourre-tout.
function besoinMarche(m, rep, besoinExistant){
  const besoin = Object.assign({}, besoinExistant||{});
  const q = +m.prevuQte||0; if(q<=0) return besoin;
  const visee = Array.isArray(m.prevuParfums) ? m.prevuParfums.filter(x=>x && x.parfum && +x.qte>0) : [];
  if(visee.length){
    visee.forEach(x=>{ besoin[x.parfum]=(besoin[x.parfum]||0)+(+x.qte||0); });
    return besoin;
  }
  const totPct = (rep||[]).reduce((s,r)=>s+(+r.pct||0),0);
  if((rep||[]).length && totPct>0){
    let cumule=0;
    rep.forEach((r,i)=>{
      let part=(i===rep.length-1)?(q-cumule):Math.round(q*(+r.pct||0)/totPct);
      if(i!==rep.length-1) cumule+=part;
      if(part>0) besoin[r.parfum]=(besoin[r.parfum]||0)+part;
    });
    return besoin;
  }
  const noms=Object.keys(besoin); const tot=noms.reduce((s,n)=>s+besoin[n],0);
  if(tot>0){ let c=0; noms.forEach((n,i)=>{ let part=(i===noms.length-1)?(q-c):Math.round(q*besoin[n]/tot); if(i!==noms.length-1)c+=part; if(part>0)besoin[n]=(besoin[n]||0)+part; }); }
  else besoin['Marché (parfums à définir)']=(besoin['Marché (parfums à définir)']||0)+q;
  return besoin;
}

function run(){
const M = buildModule();

const REP = [{parfum:'Framboise', pct:50}, {parfum:'Pistache', pct:30}, {parfum:'Café', pct:20}];

// ── CAS 1 : LE CHOIX DE BEN PRIME, AU MACARON PRÈS ─────────────────────────
{
  const m = { id:1, date:'2026-08-15', statut:'ouvert', prevuQte:250,
              prevuParfums:[{parfum:'Caramel beurre salé', qte:120}, {parfum:'Citron crémeux', qte:80}, {parfum:'Café', qte:50}] };
  const b = besoinMarche(m, REP, {});
  eq(b, {'Caramel beurre salé':120, 'Citron crémeux':80, 'Café':50},
     'CAS1 · le rétroplanning reçoit exactement ce que Ben a saisi');
  eq(b.Framboise, undefined, 'CAS1 · la ventilation devinée est court-circuitée');
  eq(b.Pistache, undefined,  'CAS1 · … entièrement');
}

// ── CAS 2 : son choix s'AJOUTE aux besoins des commandes, il ne les remplace pas
{
  const m = { id:1, prevuQte:100, prevuParfums:[{parfum:'Café', qte:100}] };
  const b = besoinMarche(m, REP, {'Café':40, 'Pistache':30});
  eq(b, {'Café':140, 'Pistache':30}, 'CAS2 · les besoins s\'additionnent par parfum');
}

// ── CAS 3 : CONTRE-ÉPREUVE — sans choix, le repli appris marche comme avant ─
// Si ce cas tombait, on aurait cassé le comportement par défaut de tous les
// marchés existants pour ajouter une option.
{
  const m = { id:1, prevuQte:200 };
  const b = besoinMarche(m, REP, {});
  eq(b, {'Framboise':100, 'Pistache':60, 'Café':40}, 'CAS3 · ventilation apprise appliquée');
  eq(Object.values(b).reduce((s,x)=>s+x,0), 200, 'CAS3 · … et la somme fait la quantité visée');
}

// ── CAS 4 : repli au prorata des commandes, puis fourre-tout ──────────────
{
  const m = { id:1, prevuQte:100 };
  const proRata = besoinMarche(m, [], {'Vanille':30, 'Café':10});
  eq(proRata, {'Vanille':105, 'Café':35}, 'CAS4 · réparti au prorata des commandes en cours');
  const fourreTout = besoinMarche(m, [], {});
  eq(fourreTout, {'Marché (parfums à définir)':100},
     'CAS4 · sans aucune donnée, une ligne honnête plutôt qu\'un chiffre inventé');
}

// ── CAS 5 : une ventilation de zéros n'est pas une ventilation ────────────
{
  const m = { id:1, prevuQte:200, prevuParfums:[{parfum:'Café', qte:0}, {parfum:'Pistache', qte:0}] };
  const b = besoinMarche(m, REP, {});
  eq(b, {'Framboise':100, 'Pistache':60, 'Café':40},
     'CAS5 · on retombe sur le repli appris (les zéros ne décident rien)');
}

// ── CAS 6 : un marché sans quantité visée n'alimente pas le plan ──────────
{
  eq(besoinMarche({id:1, prevuQte:0, prevuParfums:[{parfum:'Café', qte:50}]}, REP, {}), {},
     'CAS6 · quantité visée à 0 → rien, même avec des parfums saisis');
  eq(besoinMarche({id:1}, REP, {}), {}, 'CAS6 · champ absent → rien');
}

// ── CAS 7 : le moteur de ventilation réutilisé, pas réécrit ──────────────
// C'est lui que le bouton « Répartir automatiquement » appelle.
{
  const cible = [{parfum:'Framboise', pct:60}, {parfum:'Café', pct:40}];
  const histo = [{parfum:'Framboise', pct:40}, {parfum:'Café', pct:60}];
  const v = M.marketVentilation(cible, histo, 200, {mode:'croise'});
  eq(v.sourceUtilisee, 'croise',   'CAS7 · croisement cible × historique');
  eq(v.totalVentile, 200,          'CAS7 · la somme tombe juste sur le volume');
  eq(v.lignes.map(l=>[l.parfum,l.pieces]), [['Framboise',100],['Café',100]],
     'CAS7 · 50/50 après moyenne des deux sources');
  const seule = M.marketVentilation(cible, [], 100, {mode:'croise'});
  eq(seule.sourceUtilisee, 'cible', 'CAS7 · cible seule si pas d\'historique');
  const rien = M.marketVentilation([], [], 100, {mode:'croise'});
  eq(rien.sourceUtilisee, 'aucune', 'CAS7 · rien à proposer = dit explicitement');
  eq(rien.lignes, [],               'CAS7 · … et aucune ligne inventée');
}

// ── CAS 8 : le choix prime AVANT les deux replis ─────────────────────────
// ⚠️ RÉÉCRIT EN v1435. Ces gardes visaient `_buildProductionPlanRaw`, qui portait alors sa
// propre copie de la règle. Il s'est avéré que la MÊME règle était écrite dans TROIS écrans et
// que la v1431 n'en avait corrigé qu'un : les deux autres ignoraient encore les parfums visés.
// La règle vit désormais dans `besoinMarchesParParfum`, appelée par les trois — c'est donc là
// que l'ordre doit être vérifié. L'intention est inchangée : le choix de Ben passe en premier.
{
  const src = stripComments(extractFunction('besoinMarchesParParfum'));
  const iVisee = src.indexOf('const visee =');
  const iRep   = src.indexOf('if(rep.length && totPct>0)');
  const iFourre= src.indexOf('parfums à définir');
  vrai(iVisee > -1, 'CAS8 · la règle lit prevuParfums');
  vrai(iVisee < iRep,    'CAS8 · … avant la ventilation apprise');
  vrai(iVisee < iFourre, 'CAS8 · … et avant le fourre-tout');
  vrai(/m\.prevuParfums\.filter\(x=>x && x\.parfum && \+x\.qte>0\)/.test(src),
     'CAS8 · seules les lignes non nulles comptent comme une décision');
  vrai(/if\(visee\.length\)\{[\s\S]{0,120}return;/.test(src),
     'CAS8 · … et le choix retourne immédiatement (aucun repli ne s\'y ajoute)');
  ['ordoBuildNeeds', '_buildProductionPlanRaw', 'generateProductionOrder'].forEach(fn=>{
    vrai(/besoinMarchesParParfum\(/.test(stripComments(extractFunction(fn))),
       'CAS8 · ' + fn + ' applique bien cette règle (plus de copie divergente)');
  });
}

// ── CAS 9 : le formulaire marché sait saisir les parfums visés ───────────
{
  const z = zoneFonction('marketForm');
  vrai(/class="mk-parf" data-parfum=/.test(z),   'CAS9 · un champ par parfum, identifié');
  vrai(/db\.recipes\.toArray/.test(z),            'CAS9 · la liste vient des recettes réelles');
  vrai(/marketVentilation\(_cible,/.test(z),      'CAS9 · la suggestion passe par le moteur existant');
  vrai(/mkAppliquerVentilation\(\)/.test(z),      'CAS9 · … derrière un bouton, pas imposée');
  vrai(/oninput="mkParfumsTotal\(\)"/.test(z),    'CAS9 · le total se recalcule à la frappe');
  vrai(/sugg\. \$\{sg\}/.test(z),                 'CAS9 · la suggestion reste visible à côté du champ saisi');
}

// ── CAS 10 : l'écart entre le total ventilé et la quantité visée se VOIT ─
{
  const src = stripComments(extractFunction('mkParfumsTotal'));
  vrai(/mk_prevu/.test(src),  'CAS10 · le total est comparé à la quantité visée');
  vrai(/vs \$\{cible\} visés/.test(src), 'CAS10 · l\'écart est nommé, pas masqué');
  vrai(/non renseignés/.test(src), 'CAS10 · l\'absence de saisie est dite aussi');
  const app = stripComments(extractFunction('mkAppliquerVentilation'));
  vrai(/_mkVentilSuggeree/.test(app), 'CAS10 · le bouton relit la suggestion calculée');
  eq(/db\./.test(app), false, 'CAS10 · … et n\'écrit rien en base (rien avant « Enregistrer »)');
}

// ── CAS 11 : l'enregistrement ne garde que les lignes renseignées ───────
{
  const src = stripComments(extractFunction('saveMarket'));
  vrai(/o\.prevuParfums = _pf/.test(src),             'CAS11 · le champ est enregistré');
  vrai(/if\(n && q>0\) _pf\.push/.test(src),          'CAS11 · seules les quantités > 0 sont retenues');
  vrai(/Math\.round\(\+el\.value\|\|0\)/.test(src),   'CAS11 · pas de demi-macaron');
}

// ── CAS 12 : le marché ouvert apparaît dans le fil des commandes ────────
{
  const src = stripComments(extractFunction('cmdFilter'));
  vrai(/_cmdMarketsCache\.length/.test(src),        'CAS12 · un bloc dédié aux marchés');
  vrai(/macarons visés/.test(src),                  'CAS12 · avec la quantité visée en en-tête');
  vrai(/aucune quantité visée/.test(src),           'CAS12 · un marché sans quantité est signalé…');
  vrai(/parfums à définir/.test(src),               'CAS12 · … et un marché sans parfums aussi');
  vrai(/marketForm\(\$\{m\.id\}\)/.test(src),       'CAS12 · la ligne ouvre le marché');
  const iMk = src.indexOf('_cmdMarketsCache.length');
  const iAv = src.indexOf('if(aVenir.length)');
  vrai(iMk > -1 && iAv > -1 && iMk < iAv,
     'CAS12 · le bloc s\'affiche même quand aucune commande n\'est à venir');
}

// ── CAS 13 : un marché n'est PAS une commande ───────────────────────────
// Le verser dans `_cmdCache` le ferait entrer dans la recherche, les tags, les
// totaux à encaisser et les compteurs — un marché n'a ni client, ni montant dû.
{
  const rc = stripComments(extractFunction('renderCmd'));
  vrai(/_cmdMarketsCache = \(await db\.markets\.toArray/.test(rc),
     'CAS13 · les marchés vivent dans un cache SÉPARÉ');
  vrai(/statut !== 'clos'/.test(rc), 'CAS13 · … et seuls les non clos y entrent');
  const iCache = rc.indexOf('_cmdCache = orders.map');
  const iMk = rc.indexOf('_cmdMarketsCache =');
  vrai(iCache > -1 && iMk > -1, 'CAS13 · les deux caches existent');
  eq(/_cmdCache[\s\S]{0,400}markets/.test(rc.slice(iCache)), false,
     'CAS13 · aucun marché ne rejoint le cache des commandes');
}

// ── résultat ──
console.log('\n=== TESTS — v1431 : marché ouvert dans le fil + parfums visés ===\n');
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
