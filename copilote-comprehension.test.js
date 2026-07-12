/* ============================================================================
   BANC D'ESSAI DU COPILOTE — taux de compréhension réel de parseIntent
   ----------------------------------------------------------------------------
   Ce n'est pas (encore) un test de caractérisation : c'est un INSTRUMENT DE MESURE.
   Objectif : répondre par un CHIFFRE à la question « faut-il un LLM embarqué pour
   comprendre mes demandes ? », au lieu de le supposer.

   Méthode : un corpus de formulations réalistes, chacune étiquetée avec l'intention
   ATTENDUE. On passe le corpus dans parseIntent (le vrai, relu en direct depuis app.js)
   et on compte :
     • ✅ TROUVÉ      — l'intention attendue est renvoyée
     • ❌ RATÉ        — 'unknown' : le copilote ne comprend pas du tout
     • ⚠️ DÉTOURNÉ    — une AUTRE intention est renvoyée (le pire cas : il répond à côté
                        avec assurance, sans jamais dire qu'il n'a pas compris)

   Le corpus est volontairement composé de VARIANTES : la formulation « canonique »
   (celle que le développeur avait en tête), puis des reformulations naturelles, des
   familiarités, des fautes de frappe et des tournures orales. C'est exactement ce que
   produit un vrai usage à une main, en atelier, les doigts pleins de farine.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine } = require('./_extract');

function buildParseIntent(){
  const noms = ['_aiNormalizeRaw','aiNormalize','aiCorrigeFautes','aiLexFrag','aiLexTest','aiFindFlavor','aiFindMaterial',
                'aiFindClient','aiParseNumber','aiParseDate','aiExtractName','aiParseOrderItems',
                '_aiParsePeriode','_saisonDepuisTexte','parseIntent','aiIntentAmbigu'];
  // Le LEXIQUE (AI_LEX) est un gros objet const : on le récupère tel quel depuis app.js, sans le
  // recopier — sinon le banc mesurerait un lexique figé au lieu du vrai.
  // [v1327] AI_MARQUEURS : les signatures qui distinguent deux compétences voisines.
  const lex = extractConstBlock('AI_LEX') + '\n' + extractConstBlock('_AI_CORRECTIONS')
            + '\n' + extractConstBlock('AI_MARQUEURS');
  let src = 'var _aiNormCache;\n' + lex + '\n';
  const manquants = [];
  for(const n of noms){
    try{ src += extractFunction(n) + '\n'; }
    catch(e){ manquants.push(n); }
  }
  return { src, manquants };
}

// Récupère `const NOM = { … };` en équilibrant les accolades (le lexique contient des regex
// truffées de quotes — on s'appuie sur le stripper désormais conscient des littéraux de regex).
function extractConstBlock(nom){
  const fs = require('fs'), path = require('path');
  const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const i = APP.indexOf('const ' + nom + ' = {');
  if(i < 0) throw new Error('Introuvable : ' + nom);
  let depth = 0, inStr = null, esc = false;
  for(let j = APP.indexOf('{', i); j < APP.length; j++){
    const c = APP[j];
    if(inStr){
      if(esc) esc = false;
      else if(c === '\\') esc = true;
      else if(c === inStr) inStr = null;
      continue;
    }
    if(c === '"' || c === "'" || c === '`'){ inStr = c; continue; }
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return APP.slice(i, j + 1) + ';'; }
  }
  throw new Error('Accolades non équilibrées : ' + nom);
}

const { src, manquants } = buildParseIntent();
if(manquants.length){
  console.log('⚠ Fonctions non extractibles : ' + manquants.join(', '));
}

// ---------------------------------------------------------------------------
// LE CORPUS. Chaque entrée : [intention attendue, ...formulations]
// La PREMIÈRE formulation de chaque ligne est la tournure « canonique » (celle qui a
// probablement servi à écrire la regex). Les suivantes sont des reformulations que
// Benjamin pourrait taper un jour de rush.
// ---------------------------------------------------------------------------
const CORPUS = [
  ['query_revenu_horaire',
    'mon revenu horaire',
    'combien je gagne de l\'heure',
    'je me fais combien de l\'heure',
    'ça me rapporte combien par heure',
    'est-ce que je gagne au moins le smic',
    'mon taux horaire réel'],

  ['query_seuil_rentabilite',
    'mon seuil de rentabilité',
    'mon point mort',
    'combien je dois vendre pour ne pas perdre d\'argent',
    'combien de macarons par mois pour couvrir mes charges',
    'à partir de combien je gagne de l\'argent'],

  ['query_stock',
    'mon stock de poudre d\'amande',
    'il me reste combien de poudre d\'amande',
    'j\'ai encore de la poudre d\'amande ?',
    'stock poudre amande',
    'combien de poudre d amande il me reste'],

  ['query_retards',
    'mes retards',
    'qu\'est-ce qui est en retard',
    'j\'ai du retard quelque part ?',
    'des commandes en retard ?'],

  ['query_orders',
    'mes commandes',
    'qu\'est-ce que j\'ai à livrer',
    'c\'est quoi mes commandes en cours',
    'montre moi les commandes'],

  ['query_net_poche',
    'mon net en poche',
    'combien il me reste vraiment',
    'ce que je touche vraiment à la fin',
    'combien je mets dans ma poche'],

  ['query_charges',
    'mes charges',
    'combien je paye de charges',
    'mes frais fixes',
    'ça me coûte combien par mois'],

  ['query_top_parfum',
    'mon meilleur parfum',
    'quel parfum se vend le mieux',
    'lequel marche le mieux',
    'mon parfum le plus vendu'],

  ['query_gaspillage',
    'mon gaspillage',
    'combien je jette',
    'mes invendus me coûtent combien',
    'j\'ai perdu combien en invendus'],

  ['query_panier_moyen',
    'mon panier moyen',
    'combien dépense un client en moyenne',
    'la moyenne par commande'],

  ['query_prochaine_livraison',
    'ma prochaine livraison',
    'quand est-ce que je dois livrer',
    'c\'est quand ma prochaine livraison',
    'la prochaine livraison c\'est quand'],

  ['query_bilan_marche',
    'mon bilan marché',
    'comment s\'est passé mon dernier marché',
    'le marché de samedi a donné quoi',
    'mes marchés rapportent combien'],
];

// ---------------------------------------------------------------------------
// EXÉCUTION
// ---------------------------------------------------------------------------
const flavors = ['chocolat','vanille','framboise','pistache','caramel','citron','coco'];
const materials = [
  {id:1, nom:'Poudre d\'amande', unite:'g'},
  {id:2, nom:'Sucre glace', unite:'g'},
  {id:3, nom:'Chocolat noir', unite:'g'}
];
const clients = [{id:1, nom:'Dupont'}, {id:2, nom:'Paulette'}];

let M;
try{
  M = new Function(`
    const console = { warn(){}, error(){}, log(){} };
    ${src}
    return { parseIntent, aiIntentAmbigu, aiNormalize, aiCorrigeFautes };
  `)();
}catch(e){
  console.log('\n✗ IMPOSSIBLE DE CONSTRUIRE parseIntent : ' + e.message);
  console.log('  (dépendances manquantes ou extraction incomplète)\n');
  process.exit(1);
}

const { parseIntent, aiIntentAmbigu, aiNormalize, aiCorrigeFautes } = M;
const ctx = { flavors, clients, materials };

// [v1327] Le copilote ne répond plus aveuglément : si l'intention retenue ne porte AUCUNE
// signature propre alors qu'une rivale en porte une, il DEMANDE au lieu de trancher.
// On rejoue ici exactement la logique de _aiDispatch.
const estAmbigu = (phrase, intent) => {
  try{ return aiIntentAmbigu(aiCorrigeFautes(aiNormalize(phrase)), intent).ambigu; }
  catch(e){ return false; }
};
let nTotal=0, nTrouve=0, nRate=0, nDetourne=0;
const rates = [], detournes = [];

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  BANC D\'ESSAI — taux de compréhension du copilote        ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

for(const [attendu, ...phrases] of CORPUS){
  const res = [];
  phrases.forEach((p, idx) => {
    nTotal++;
    let r;
    try{ r = parseIntent(p, ctx); }catch(e){ r = {intent:'ERREUR:'+e.message}; }
    const got = r && r.intent;
    if(got === attendu){ nTrouve++; res.push('✅'); }
    else if(got === 'unknown'){ nRate++; res.push('❌'); rates.push({attendu, p, idx}); }
    else { nDetourne++; res.push('⚠️'); detournes.push({attendu, p, got, idx}); }
  });
  const canon = res[0];
  console.log(`${canon} ${attendu.padEnd(26)} ${res.join(' ')}   (${res.filter(x=>x==='✅').length}/${res.length})`);
}

const pct = n => Math.round(n/nTotal*1000)/10;
console.log('\n──────────────────────────────────────────────────────────');
console.log(`  Formulations testées : ${nTotal}`);
console.log(`  ✅ Comprises          : ${nTrouve}  (${pct(nTrouve)} %)`);
console.log(`  ❌ Non comprises      : ${nRate}  (${pct(nRate)} %)   → « je n'ai pas compris »`);
console.log(`  ⚠️  DÉTOURNÉES         : ${nDetourne}  (${pct(nDetourne)} %)   → répond à CÔTÉ, sans le dire`);
console.log('──────────────────────────────────────────────────────────\n');

// Le canonique marche-t-il toujours ? (sinon le problème n'est pas la reformulation)
const canonKO = CORPUS.filter(([att, first]) => {
  try{ return parseIntent(first, ctx).intent !== att; }catch(e){ return true; }
});
console.log(`Formulation CANONIQUE reconnue : ${CORPUS.length - canonKO.length}/${CORPUS.length}`);
if(canonKO.length) console.log('  ⚠ échouent même au canonique : ' + canonKO.map(c=>c[0]).join(', '));

if(detournes.length){
  console.log('\n⚠️  LES DÉTOURNEMENTS (le cas le plus grave — il répond avec assurance, à côté) :');
  detournes.slice(0,12).forEach(d=>{
    console.log(`   « ${d.p} »\n      attendu : ${d.attendu}\n      obtenu  : ${d.got}`);
  });
  if(detournes.length>12) console.log(`   … et ${detournes.length-12} autre(s).`);
}

if(rates.length){
  console.log('\n❌ LES NON-COMPRIS (au moins, il le dit) :');
  rates.slice(0,15).forEach(r=> console.log(`   « ${r.p} »   (attendu : ${r.attendu})`));
  if(rates.length>15) console.log(`   … et ${rates.length-15} autre(s).`);
}
// ---------------------------------------------------------------------------
// GARDE-FOU PERMANENT — on FIGE le comportement mesuré aujourd'hui.
// Ce banc n'est plus seulement un instrument : c'est un cliquet. Toute modification du
// copilote qui ferait BAISSER la compréhension, ou MONTER les détournements, casse ici.
// ---------------------------------------------------------------------------
let pass=0, fail=0; const failures=[];
function ok(cond, label){ if(cond){ pass++; } else { fail++; failures.push('  ✗ ' + label); } }

// ---------------------------------------------------------------------------
// [v1327] L'EFFET DE LA DÉSAMBIGUÏSATION — les deux seuls chiffres qui comptent
// ---------------------------------------------------------------------------
// 1. Combien de DÉTOURNEMENTS sont désormais rattrapés (réponse fausse → question posée) ?
// 2. Combien de bonnes réponses sont ABÎMÉES au passage (faux positifs) ?
// Le second est le vrai risque : un garde-fou qui casse ce qui marchait serait une régression,
// pas une amélioration.
const detourRattrapes = detournes.filter(d => estAmbigu(d.p, d.got));
const detourRestants  = detournes.filter(d => !estAmbigu(d.p, d.got));

// Faux positifs : une phrase DÉJÀ bien comprise que le détecteur viendrait perturber.
const fauxPositifs = [];
for(const [attendu, ...phrases] of CORPUS){
  phrases.forEach(p => {
    let r; try{ r = parseIntent(p, ctx); }catch(e){ return; }
    if(r && r.intent === attendu && estAmbigu(p, r.intent)) fauxPositifs.push({p, attendu});
  });
}

console.log('── DÉSAMBIGUÏSATION (v1327) ──────────────────────────────');
console.log(`  🤔 Détournements RATTRAPÉS  : ${detourRattrapes.length}/${detournes.length}   (réponse fausse → question posée)`);
console.log(`  ⚠️  Détournements RESTANTS   : ${detourRestants.length}/${detournes.length}`);
console.log(`  💥 FAUX POSITIFS            : ${fauxPositifs.length}/${nTrouve}   (bonnes réponses abîmées)`);
if(detourRattrapes.length){
  console.log('\n  Rattrapés — le copilote demandera au lieu de répondre à côté :');
  detourRattrapes.forEach(d => console.log(`     « ${d.p} »`));
}
if(detourRestants.length){
  console.log('\n  Restants — encore détournés (limite assumée) :');
  detourRestants.forEach(d => console.log(`     « ${d.p} » → ${d.got}`));
}
if(fauxPositifs.length){
  console.log('\n  ⚠ FAUX POSITIFS — le détecteur dérange des requêtes qui marchaient :');
  fauxPositifs.forEach(f => console.log(`     « ${f.p} » (${f.attendu})`));
}
console.log('');

// ---------------------------------------------------------------------------
// [v1327] CORPUS DE VALIDATION (HOLDOUT) — l'honnêteté envers soi-même
// ---------------------------------------------------------------------------
// Les signatures d'AI_MARQUEURS ont été écrites EN CONNAISSANT les 8 détournements du corpus
// principal. Même écrites à partir des concepts, le risque de SURAPPRENTISSAGE est réel : on
// pourrait n'avoir fait que « réviser pour l'examen », et obtenir 8/8 sans rien améliorer.
//
// Ces phrases-ci n'ont JAMAIS servi à concevoir les signatures. Le chiffre qui compte est le
// nombre de FAUX POSITIFS : si le détecteur vient déranger des requêtes que le copilote
// comprenait très bien, il est nuisible — peu importe ses succès ailleurs.
const HOLDOUT = [
  ['query_stock',              'combien de sucre glace en stock'],
  ['query_stock',              'il me reste combien de chocolat noir'],
  ['query_retards',            'y a-t-il des retards'],
  ['query_orders',             'liste mes commandes'],
  ['query_charges',            'le total de mes charges'],
  ['query_net_poche',          'mon net en poche ce mois-ci'],
  ['query_revenu_horaire',     'mon taux horaire'],
  ['query_seuil_rentabilite',  'mon point mort mensuel'],
  ['query_top_parfum',         'mon parfum le plus vendu'],
  ['query_gaspillage',         'mes invendus'],
  ['query_panier_moyen',       'le panier moyen'],
  ['query_bilan_marche',       'le bilan de mon marché'],
  ['query_prochaine_livraison','ma prochaine livraison'],
  ['query_dlc_finis',          'mes dlc'],
  ['query_top_clients',        'mes meilleurs clients']
];

let hOk=0, hFP=0, hAutre=0;
const hFauxPos = [];
for(const [attendu, phrase] of HOLDOUT){
  let r; try{ r = parseIntent(phrase, ctx); }catch(e){ hAutre++; continue; }
  const got = r && r.intent;
  const amb = estAmbigu(phrase, got);
  if(got === attendu && !amb) hOk++;
  else if(got === attendu && amb){ hFP++; hFauxPos.push(phrase); }   // ← le danger
  else hAutre++;
}
console.log('── VALIDATION (corpus jamais vu par les signatures) ───────');
console.log(`  ✅ Comprises sans être dérangées : ${hOk}/${HOLDOUT.length}`);
console.log(`  💥 FAUX POSITIFS                 : ${hFP}/${HOLDOUT.length}`);
console.log(`  ·  Autres (détour ou inconnu)    : ${hAutre}/${HOLDOUT.length}`);
if(hFauxPos.length) hFauxPos.forEach(p => console.log(`     ⚠ « ${p} » est dérangée à tort`));
console.log('');

console.log('── GARDE-FOUS ────────────────────────────────────────────');

// 1. Les formulations canoniques DOIVENT toutes passer. Si l'une casse, ce n'est plus un
//    problème de reformulation : c'est une compétence devenue inaccessible.
ok(canonKO.length === 0,
   'Les 12 formulations canoniques sont toutes reconnues (aucune compétence inaccessible)');

// 2. CLIQUET sur la compréhension : elle ne doit jamais redescendre sous le niveau mesuré.
ok(nTrouve >= 41, `Compréhension ≥ 41/51 (mesuré aujourd'hui : ${nTrouve})`);

// 3. CLIQUET sur les DÉTOURNEMENTS — le vrai danger. Répondre à côté avec assurance est
//    pire que dire « je n'ai pas compris » : Benjamin repart avec le mauvais chiffre.
ok(nDetourne <= 8, `Détournements ≤ 8/51 (mesuré aujourd'hui : ${nDetourne})`);

// 4. INVARIANT DE CONCEPTION. Les détournements observés opposent tous des compétences
//    SÉMANTIQUEMENT VOISINES (revenu horaire vs CA, seuil vs rentabilité, charges vs coût de
//    revient…). C'est le constat central de ce banc : le copilote ne « comprend pas mal »,
//    il TRANCHE MAL entre des compétences qui se recouvrent. Un modèle plus gros ne
//    supprimerait pas ce recouvrement — il changerait seulement lesquelles il rate.
const VOISINS = [
  ['query_revenu_horaire','query_revenue'], ['query_seuil_rentabilite','query_rentabilite'],
  ['query_seuil_rentabilite','query_urssaf'], ['query_charges','query_cout_revient'],
  ['query_gaspillage','query_stock'], ['query_prochaine_livraison','query_orders'],
  ['query_bilan_marche','query_gaspillage'], ['query_bilan_marche','query_market_advice']
];
const estVoisin = (a,b) => VOISINS.some(([x,y]) => (x===a&&y===b) || (x===b&&y===a));
const detourLointain = detournes.filter(d => !estVoisin(d.attendu, d.got));
ok(detourLointain.length === 0,
   'Tous les détournements opposent des compétences VOISINES (aucun égarement total)');
if(detourLointain.length){
  detourLointain.forEach(d => failures.push(`      « ${d.p} » → ${d.got} (attendu ${d.attendu})`));
}

// 5. INVARIANT CAPITAL — AUCUN FAUX POSITIF. Le détecteur ne doit JAMAIS déranger une requête
//    que le copilote comprenait déjà. C'est la contrepartie de la règle conservatrice : on ne
//    demande que si l'intention retenue ne porte AUCUNE signature propre. Si ce test casse, la
//    désambiguïsation est devenue plus nuisible qu'utile — elle doit alors être retirée.
ok(fauxPositifs.length === 0,
   `Aucun faux positif : les ${nTrouve} requêtes déjà comprises ne sont pas dérangées`);
fauxPositifs.forEach(f => failures.push(`      « ${f.p} » (${f.attendu}) est maintenant marquée ambiguë`));

// 6. La désambiguïsation doit rattraper la MAJORITÉ des détournements — sinon elle ne sert à rien.
ok(detourRattrapes.length >= 6,
   `Au moins 6 des ${detournes.length} détournements sont rattrapés (mesuré : ${detourRattrapes.length})`);

// 7. Une réponse fausse et confiante est PIRE qu'une question. Après désambiguïsation, il doit
//    rester moins de détournements silencieux qu'avant (le point de toute la vague).
ok(detourRestants.length < detournes.length,
   'Les détournements silencieux ont diminué (une question vaut mieux qu\'une réponse fausse)');

// 8. HOLDOUT — le test anti-surapprentissage. Sur des phrases jamais vues lors de la conception
//    des signatures, le détecteur ne doit déranger AUCUNE requête déjà bien comprise.
ok(hFP === 0, `Corpus de validation : aucun faux positif (mesuré : ${hFP}/${HOLDOUT.length})`);
hFauxPos.forEach(p => failures.push(`      « ${p} » (jamais vue) est dérangée à tort`));

console.log(`Résultat : ${pass} réussis, ${fail} échoués (${pass+fail} assertions).`);
if(fail){
  console.log('\n' + failures.join('\n') + '\n');
  console.log('✗ RÉGRESSION DÉTECTÉE.\n');
  process.exit(1);
}
console.log('✓ Comportement figé conforme. Aucune régression détectée.\n');
