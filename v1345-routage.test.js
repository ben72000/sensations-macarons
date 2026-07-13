// ════════════════════════════════════════════════════════════════════════════
//  v1345 — LE ROUTAGE : MESURER, CRÉER, CLASSER. Trois questions, trois réponses.
//
//  LE BUG : « Quels parfums sont souvent commandés ensemble » (une MESURE des clients)
//  renvoyait des IDÉES DE NOUVEAUX PARFUMS POUR L'ÉTÉ (une CRÉATION). Ma règle v1343 était
//  placée 250 lignes APRÈS la suggestion R&D : elle ne pouvait jamais gagner.
//
//  J'avais vérifié ce qui venait APRÈS elle. Jamais ce qui venait AVANT.
//  VÉRIFIER L'ORDRE D'UNE RÈGLE, C'EST REGARDER DES DEUX CÔTÉS.
// ════════════════════════════════════════════════════════════════════════════
const SRC=require('fs').readFileSync(__dirname+'/../app.js','utf8');

// LES CONDITIONS SONT EXTRAITES DU FICHIER, PAS PARAPHRASÉES.
// Premier jet de ce test : j'avais RECOPIÉ les regex en les simplifiant — et il a « échoué »
// sur deux phrases que le vrai code gère parfaitement. Je testais MA PARAPHRASE, pas l'app de Ben.
// C'est la règle de la v1337, que je viens d'enfreindre en l'ayant écrite : UN TEST QUI RECOPIE
// LE CODE QU'IL TESTE NE VALIDE QUE SA PROPRE COHÉRENCE.
const cond = (marqueur) => {
  const i = SRC.indexOf(marqueur);
  if(i < 0) throw new Error('règle introuvable : ' + marqueur);
  const deb = SRC.lastIndexOf('  if(', i);
  const src = SRC.slice(deb, i);
  const corps = src.slice(src.indexOf('if(') + 3, src.lastIndexOf('){'));
  return new Function('t', 'return (' + corps + ');');
};
const rAssoc = cond("intent:'query_associations'");
const rSugg  = cond("intent:'query_suggestion_parfum'");
const rTop   = cond("intent:'query_top_parfum'");

const iA = SRC.indexOf("intent:'query_associations'");
const iS = SRC.indexOf("intent:'query_suggestion_parfum'");

// L'ordre du CODE fait foi : première règle qui matche, dans l'ordre du fichier.
const route = t => rAssoc(t) ? 'MESURE' : (rSugg(t) ? 'CREATION' : (rTop(t) ? 'CLASSEMENT' : '—'));

let ok=0,ko=0;
const T=(t,exp)=>{let g;try{g=route(t);}catch(e){ko++;console.log('  ✗ EXCEPTION '+e.message);return;}
  const p=g===exp; if(p){ok++;console.log('  ✓ "'+t+'" → '+g);}
  else{ko++;console.log('  ✗ "'+t+'" → '+g+'   (attendu '+exp+')');}};

console.log('\n── L\'ordre du code : associations AVANT la R&D');
const T_ORDER = (iA>0 && iS>0 && iA<iS);
if(T_ORDER){ok++;console.log('  ✓ query_associations précède query_suggestion_parfum');}
else{ko++;console.log('  ✗ query_associations est APRÈS la R&D — le bug est de retour');}

console.log('\n── LA PHRASE EXACTE DE BEN (celle qui a échoué en v1343)');
T('quels parfums sont souvent commandes ensemble','MESURE');

console.log('\n── MESURER : ce que les clients ont DÉJÀ choisi');
T('quels parfums vont ensemble','MESURE');
T('quelles saveurs se marient','MESURE');
T('les associations de mes clients','MESURE');
T('quels parfums sont achetes ensemble','MESURE');

console.log('\n── CRÉER : la R&D n\'est PAS volée (non-régression)');
T('quel parfum lancer pour l ete','CREATION');
T('propose moi un nouveau parfum','CREATION');
T('une idee de parfum pour l automne','CREATION');
console.log('  → « propose une ASSOCIATION de parfums » contient "associ" MAIS "propose" :');
T('propose moi une association de parfums pour l ete','CREATION');
console.log('    c\'est bien une IDÉE que Ben demande, pas une mesure. La garde le sait.');

console.log('\n── CLASSER : le top parfum n\'est pas volé non plus');
T('le parfum le plus vendu','CLASSEMENT');
T('mon meilleur parfum','CLASSEMENT');

console.log('\n'+(ko?`❌ ${ko} ÉCHEC(S) — ${ok} ok`:`✅ ${ok}/${ok} — routage correct`));
process.exit(ko?1:0);
