/* ============================================================================
   TESTS — v1437 : LA FICHE CLIENT DEVIENT UN COPILOTE
   ----------------------------------------------------------------------------
   Ben : « faire évoluer le module Client afin qu'il ne soit plus une simple
   fiche d'informations mais un véritable copilote CRM […] transformer
   automatiquement toutes les données déjà présentes en informations utiles ».
   Et : « peu importe où se trouve l'utilisateur, un clic sur le nom d'un client
   doit toujours ouvrir cette vue intelligente ».

   ⚠️ LE PRINCIPE QUI GOUVERNE TOUT — LE SEUIL DE SILENCE.
   Chaque indicateur porte le nombre d'observations sur lequel il repose et
   REFUSE de se prononcer en dessous. Un « rythme habituel » déduit de deux
   commandes n'est pas une habitude, c'est une coïncidence — affiché comme un
   fait, il enverrait Ben relancer un client qui n'a rien demandé.
   C'est la v1337 (« zéro n'est pas une mesure, c'est une affirmation »)
   appliquée au comportement d'achat, et la v1430 (un marché sans donnée n'est
   pas un marché à zéro vente) appliquée au client.

   Ce que ces tests NE couvrent PAS, et c'est délibéré : aucune probabilité
   d'attrition, aucun persona auto-généré, aucun générateur de coffrets. Ces
   trois modules du cahier des charges exigent une base de clients que
   Sensations Macarons n'a pas encore (lancement octobre 2025). Les livrer
   maintenant produirait des pourcentages inventés — et un chiffre faux dans un
   outil auquel on se fie coûte plus cher qu'un chiffre absent.

   Propriétés verrouillées ici :
     1. Les faits ne viennent QUE des commandes réelles du client (reprises,
        filles et impayées écartées via estVenteAgregable).
     2. Chaque indicateur refuse de se prononcer sous son seuil.
     3. L'état actif/retard/dormant est RELATIF au rythme propre du client.
     4. Une association de parfums exige d'être observée plusieurs fois.
     5. Le statut VIP exige le contexte des autres clients.
     6. Le clic sur un nom ouvre la fiche partout dans l'app.
   ============================================================================ */
'use strict';
const { extractFunction, extractConstLine, stripComments, APP } = require('./_extract');

function buildModule(){
  const code = `
    ${extractConstLine('money2')}
    const euro = v => (Math.round(v*100)/100) + ' €';
    const today = () => '2026-08-02';
    ${extractConstLine('CL_MIN_INTERVALLE')}
    ${extractConstLine('CL_MIN_REGULARITE')}
    ${extractConstLine('CL_MIN_TENDANCE')}
    ${extractConstLine('CL_MIN_DIVERSITE')}
    ${extractConstLine('CL_RETARD_FACTEUR')}
    ${extractConstLine('CL_DORMANT_FACTEUR')}
    ${extractFunction('estVenteAgregable')}
    ${extractFunction('orderToLines')}
    ${extractFunction('_orderParfumDemand')}
    ${extractFunction('clientFaits')}
    ${extractFunction('_clMediane')}
    ${extractFunction('_clInd')}
    ${extractFunction('clientIndicateurs')}
    ${extractFunction('clientStatut')}
    ${extractFunction('clientPreferences')}
    ${extractFunction('clientSynthese')}
    ${extractFunction('clientRecommandations')}
    return { clientFaits, clientIndicateurs, clientStatut, clientPreferences,
             clientSynthese, clientRecommandations, _clMediane };
  `;
  return new Function(code)();
}

let pass=0, fail=0; const failures=[];
function eq(actual, expected, label){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ pass++; } else { fail++; failures.push(`  ✗ ${label}\n      attendu: ${e}\n      obtenu : ${a}`); }
}
function vrai(cond, label){ eq(!!cond, true, label); }

// Commande d'un client : coffret de N avec une composition par parfum.
const cmd = (id, date, montant, parfums, taille) => ({
  id, clientId:7, date, montant, paiement:'Payé',
  lignes:[{ type:'coffret', taille: taille||16,
            parfums: Object.entries(parfums||{}).map(([nom,qte])=>({nom, qte})) }]
});

function run(){
const M = buildModule();

// Client régulier : 5 commandes tous les 30 jours environ, dernière il y a 25 j.
const REGULIER = [
  cmd(1,'2026-03-05',48,{'Vanille':8,'Pistache':8}),
  cmd(2,'2026-04-04',52,{'Vanille':8,'Pistache':8}),
  cmd(3,'2026-05-06',50,{'Vanille':10,'Café':6}),
  cmd(4,'2026-06-05',56,{'Vanille':8,'Pistache':8}),
  cmd(5,'2026-07-08',60,{'Vanille':10,'Pistache':6}),
];

// ── CAS 1 : les faits ne viennent que des commandes réelles ───────────────
{
  const parasites = REGULIER.concat([
    { id:90, clientId:7, date:'2025-01-10', montant:500, paiement:'Payé', histo:true },      // reprise
    { id:91, clientId:7, date:'2026-07-20', montant:80, paiement:'Payé', commandeMereId:5 }, // fille
    { id:92, clientId:7, date:'2026-07-25', montant:40, paiement:'En attente' },             // impayée
    { id:93, clientId:8, date:'2026-07-01', montant:99, paiement:'Payé' },                   // autre client
  ]);
  const f = M.clientFaits(7, parasites);
  eq(f.nbCommandes, 5, 'CAS1 · reprise, fille, impayée et autre client écartés');
  eq(f.ca, 266, 'CAS1 · le CA ne compte que ses vraies ventes');
  eq(f.premiereCmd, '2026-03-05', 'CAS1 · première commande');
  eq(f.derniereCmd, '2026-07-08', 'CAS1 · dernière commande');
  eq(f.joursDepuisDerniere, 25, 'CAS1 · 25 jours depuis la dernière');
}

// ── CAS 2 : LE SEUIL DE SILENCE — deux commandes ne font pas un rythme ────
// C'est la propriété centrale de tout le module.
{
  const ind = M.clientIndicateurs(M.clientFaits(7, REGULIER.slice(0,2)));
  eq(ind.intervalleMedian.suffisant, false, 'CAS2 · pas de rythme sur 2 commandes');
  eq(ind.intervalleMedian.valeur, null,     'CAS2 · … et surtout PAS une valeur basse : null');
  eq(ind.intervalleMedian.minRequis, 3,     'CAS2 · le seuil est dit');
  eq(ind.regularite.suffisant, false,       'CAS2 · pas de régularité non plus');
  eq(ind.tendancePanier.suffisant, false,   'CAS2 · ni de tendance');
  eq(ind.etat, 'inconnu',                   'CAS2 · l\'état ne se prononce pas');
  vrai(/il en faut 3/.test(ind.etatDetail), 'CAS2 · … et il dit ce qui manque');
  // Ce qui est mesurable dès la première commande l'est quand même :
  eq(ind.panierMoyen.suffisant, true,       'CAS2 · le panier moyen, lui, se calcule');
}

// ── CAS 3 : avec assez de commandes, les indicateurs se prononcent ────────
{
  const ind = M.clientIndicateurs(M.clientFaits(7, REGULIER));
  eq(ind.intervalleMedian.suffisant, true, 'CAS3 · le rythme est mesurable');
  eq(ind.intervalleMedian.valeur, 31,      'CAS3 · médiane des intervalles : 31 jours');
  eq(ind.panierMoyen.valeur, 53.2,         'CAS3 · panier moyen 53,20 €');
  eq(ind.etat, 'actif',                    'CAS3 · 25 j pour un rythme de 31 j → actif');
  eq(ind.regularite.suffisant, true,       'CAS3 · régularité mesurable sur 4 intervalles');
  vrai(ind.regularite.valeur < 0.35,       'CAS3 · … et elle le dit très régulier');
}

// ── CAS 4 : L'ÉTAT EST RELATIF AU CLIENT, jamais à une moyenne générale ──
// Un client qui commande deux fois par an n'est pas en retard au bout de 3 mois.
{
  const rare = [
    cmd(1,'2025-08-01',60,{'Vanille':16}),
    cmd(2,'2026-02-01',60,{'Vanille':16}),
    cmd(3,'2026-06-01',60,{'Vanille':16}),
  ];
  const ind = M.clientIndicateurs(M.clientFaits(7, rare));
  eq(ind.etat, 'actif', 'CAS4 · 62 j sans commande, mais son rythme est de ~180 j → actif');
  // Le même délai chez le client régulier serait un retard :
  const enRetard = REGULIER.slice(0,4);   // dernière le 2026-06-05, soit 58 j
  eq(M.clientIndicateurs(M.clientFaits(7, enRetard)).etat, 'retard',
     'CAS4 · 58 j pour un rythme de 30 j → en retard');
}

// ── CAS 5 : dormant à 3× son rythme ──────────────────────────────────────
{
  const dormant = [
    cmd(1,'2026-01-05',48,{'Vanille':16}),
    cmd(2,'2026-02-04',48,{'Vanille':16}),
    cmd(3,'2026-03-06',48,{'Vanille':16}),
  ];
  const ind = M.clientIndicateurs(M.clientFaits(7, dormant));
  eq(ind.etat, 'dormant', 'CAS5 · 149 j pour un rythme de 30 j → dormant');
  vrai(/rythme habituel/.test(ind.etatDetail), 'CAS5 · la justification cite son propre rythme');
}

// ── CAS 6 : la tendance du panier ────────────────────────────────────────
{
  const ind = M.clientIndicateurs(M.clientFaits(7, REGULIER));
  eq(ind.tendancePanier.suffisant, true, 'CAS6 · mesurable sur 5 commandes');
  eq(ind.tendancePanier.valeur, 11,      'CAS6 · +11 % : moyenne des 3 dernières (55,33) vs des précédentes (50)');
}

// ── CAS 7 : préférences et associations ──────────────────────────────────
{
  const f = M.clientFaits(7, REGULIER);
  const prefs = M.clientPreferences(f, ['Vanille','Pistache','Café','Framboise','Praliné']);
  eq(prefs.favoris[0].nom, 'Vanille',   'CAS7 · Vanille est son favori');
  eq(prefs.favoris[0].qte, 44,          'CAS7 · 44 pièces cumulées');
  eq(prefs.favoris[0].partCmd, 100,     'CAS7 · présente dans 100 % de ses commandes');
  eq(prefs.jamaisCommandes, ['Framboise','Praliné'], 'CAS7 · ce qu\'il n\'a jamais goûté');
  eq(prefs.tailleFavorite.taille, 16,   'CAS7 · format favori');
  // Association : Vanille+Pistache vue 4 fois, Vanille+Café une seule fois.
  eq(prefs.associations.map(a=>a.paire), ['Pistache + Vanille'],
     'CAS7 · seules les associations RÉCURRENTES remontent');
  eq(prefs.associations[0].fois, 4, 'CAS7 · observée 4 fois');
}

// ── CAS 8 : une association vue UNE fois n'est pas une habitude ──────────
{
  const f = M.clientFaits(7, [cmd(1,'2026-07-01',48,{'Vanille':8,'Café':8})]);
  const prefs = M.clientPreferences(f, []);
  eq(prefs.associations, [], 'CAS8 · une seule commande ne crée aucune association');
}

// ── CAS 9 : le statut VIP exige le contexte des autres clients ───────────
// Sans lui, l'étiquette ne veut rien dire : on ne se compare pas à soi-même.
{
  const ind = M.clientIndicateurs(M.clientFaits(7, REGULIER));
  eq(M.clientStatut(ind, {}).cle, 'fidele',
     'CAS9 · sans contexte, pas de VIP — « Fidèle », qui se justifie seul');
  eq(M.clientStatut(ind, {seuilVip:200, pctVip:10}).cle, 'vip',
     'CAS9 · avec le contexte, 266 € dépasse le seuil → VIP');
  eq(M.clientStatut(ind, {seuilVip:500, pctVip:10}).cle, 'fidele',
     'CAS9 · sous le seuil, il redevient fidèle');
  vrai(M.clientStatut(ind, {}).pourquoi.length > 0, 'CAS9 · chaque statut porte sa raison');
}

// ── CAS 10 : statuts de base ─────────────────────────────────────────────
{
  eq(M.clientStatut(M.clientIndicateurs(M.clientFaits(7, [])), {}).cle, 'aucun',
     'CAS10 · aucune commande');
  eq(M.clientStatut(M.clientIndicateurs(M.clientFaits(7, [cmd(1,'2026-07-25',48,{'Vanille':16})])), {}).cle, 'nouveau',
     'CAS10 · une seule commande → nouveau');
}

// ── CAS 11 : la synthèse ne comble jamais les trous ──────────────────────
// Une synthèse qui remplit les blancs avec des formules vagues serait pire
// qu'une synthèse courte.
{
  const f2 = M.clientFaits(7, REGULIER.slice(0,2));
  const s2 = M.clientSynthese(M.clientIndicateurs(f2), M.clientPreferences(f2, []));
  eq(s2.some(p=>/toutes les/.test(p)), false, 'CAS11 · aucune phrase de rythme sur 2 commandes');
  const f5 = M.clientFaits(7, REGULIER);
  const s5 = M.clientSynthese(M.clientIndicateurs(f5), M.clientPreferences(f5, []));
  vrai(s5.some(p=>/toutes les/.test(p)), 'CAS11 · … mais elle apparaît sur 5');
  vrai(s5.some(p=>/Vanille/.test(p)),    'CAS11 · ses parfums sont nommés');
  eq(M.clientSynthese(M.clientIndicateurs(M.clientFaits(7, [])), M.clientPreferences({}, [])),
     ['Aucune commande enregistrée pour ce client.'], 'CAS11 · client sans commande : une phrase, pas un vide');
}

// ── CAS 12 : les recommandations sont argumentées et hiérarchisées ───────
{
  const enRetard = REGULIER.slice(0,4);
  const f = M.clientFaits(7, enRetard);
  const recos = M.clientRecommandations(M.clientIndicateurs(f), M.clientPreferences(f, []), f);
  vrai(recos.length > 0, 'CAS12 · un client régulier en retard déclenche une reco');
  eq(recos[0].cle, 'relance-regulier', 'CAS12 · relance en tête');
  eq(recos[0].urgence, 'haute',        'CAS12 · urgence haute');
  eq(recos[0].confiance, 'haute',      'CAS12 · confiance haute (client régulier)');
  vrai(/Vanille/.test(recos[0].action), 'CAS12 · l\'action propose son parfum favori');
  vrai(recos.every(r=>r.pourquoi && r.action && r.confiance),
     'CAS12 · chaque reco porte sa justification, son action et sa confiance');
}

// ── CAS 13 : un retard chez un client IRRÉGULIER pèse moins ──────────────
// Deux clients « en retard » ne se relancent pas de la même façon.
{
  // Intervalles 7 / 96 / 30 j → médiane 30, forte dispersion. Dernière il y a 49 j : en retard
  // (1,6× sa médiane) sans être dormant.
  const irregulier = [
    cmd(1,'2026-02-01',48,{'Vanille':16}),
    cmd(2,'2026-02-08',48,{'Vanille':16}),
    cmd(3,'2026-05-15',48,{'Vanille':16}),
    cmd(4,'2026-06-14',48,{'Vanille':16}),
  ];
  const f = M.clientFaits(7, irregulier);
  const ind = M.clientIndicateurs(f);
  eq(ind.etat, 'retard', 'CAS13 · en retard, pas dormant');
  vrai(ind.regularite.valeur > 0.5, 'CAS13 · sa régularité est mauvaise');
  const recos = M.clientRecommandations(ind, M.clientPreferences(f, []), f);
  const r = recos.find(x=>x.cle==='relance-simple') || {};
  eq(r.cle, 'relance-simple', 'CAS13 · la reco est la version prudente');
  eq(r.confiance, 'moyenne', 'CAS13 · confiance moyenne, pas haute');
  vrai(/irrégulier/.test(r.pourquoi||''), 'CAS13 · et elle DIT pourquoi elle est prudente');
}

// ── CAS 14 : entrées dégradées ───────────────────────────────────────────
{
  eq(M.clientFaits(7, null).nbCommandes, 0, 'CAS14 · aucune commande → 0');
  eq(M.clientFaits(7, [null, undefined]).nbCommandes, 0, 'CAS14 · lignes nulles ignorées');
  const ind = M.clientIndicateurs({});
  eq(ind.nbCommandes, 0, 'CAS14 · indicateurs sur faits vides');
  eq(ind.etat, 'inconnu', 'CAS14 · … état inconnu, pas d\'exception');
  eq(M.clientRecommandations(ind, {favoris:[]}, {}), [], 'CAS14 · aucune reco sur du vide');
  eq(M._clMediane([]), null, 'CAS14 · médiane d\'un tableau vide → null');
  eq(M._clMediane([3,1,2]), 2, 'CAS14 · médiane impaire');
  eq(M._clMediane([4,1,2,3]), 2.5, 'CAS14 · médiane paire');
}

// ── CAS 15 : LE CLIC SUR UN NOM OUVRE LA FICHE, PARTOUT ─────────────────
// « Peu importe où se trouve l'utilisateur […] le comportement doit être
// identique partout. »
{
  const code = stripComments(APP);
  const versFiche = (code.match(/onclick="[^"]*clientFiche\(/g)||[]).length
                  + (code.match(/action:`clientFiche\(/g)||[]).length;
  vrai(versFiche >= 12, 'CAS15 · au moins 12 points d\'entrée routés vers la fiche (trouvés : ' + versFiche + ')');
  // Le formulaire d'édition reste joignable, mais seulement par un geste explicite.
  const versForm = (code.match(/onclick="clientForm\(/g)||[]).length;
  vrai(versForm <= 3, 'CAS15 · l\'édition n\'est plus la porte d\'entrée (' + versForm + ' accès explicites)');
  vrai(/async function clientFiche\(id\)/.test(code), 'CAS15 · la fiche existe');
  vrai(/async function clientForm\(id\)/.test(code), 'CAS15 · le formulaire d\'édition existe toujours');
}

// ── CAS 16 : l'écran affiche l'assise de chaque chiffre ─────────────────
// Un indicateur sans son assise redeviendrait un chiffre qu'on croit.
{
  const src = stripComments(extractFunction('clientFiche'));
  vrai(/pas encore mesurable/.test(src), 'CAS16 · un indicateur insuffisant le DIT');
  vrai(/il en faut \$\{indic\.minRequis\}/.test(src), 'CAS16 · … et annonce le seuil');
  vrai(/indic\.suffisant/.test(src), 'CAS16 · l\'affichage teste la suffisance');
  vrai(/clientRecommandations\(ind, prefs, faits\)/.test(src), 'CAS16 · les recos sont calculées');
  vrai(/confiance \$\{esc\(r\.confiance\)\}/.test(src), 'CAS16 · … avec leur niveau de confiance affiché');
}

// ── CAS 17 : les actions immédiates sont là ─────────────────────────────
{
  const src = stripComments(extractFunction('clientFiche'));
  ['tel:', 'sms:', 'mailto:', 'maps.google.com', 'clFicheCopier', 'cmdForm(null,{clientId:'].forEach(a=>{
    vrai(src.indexOf(a) > -1, 'CAS17 · action présente : ' + a);
  });
  // Elles ne s'affichent que si la donnée existe — un bouton « Appeler » sans
  // numéro est une promesse non tenue.
  vrai(/tel  \? btn\('📞 Appeler'/.test(src), 'CAS17 · « Appeler » conditionné à un téléphone');
  vrai(/mail \? btn\('✉️ E-mail'/.test(src), 'CAS17 · « E-mail » conditionné à une adresse');
}

// ── CAS 18 : le mode confidentialité est respecté ───────────────────────
{
  const src = stripComments(extractFunction('clientFiche'));
  vrai(/privacyModeEnabled/.test(src), 'CAS18 · la fiche connaît le mode confidentialité');
  vrai(/masque\(euro\(faits\.ca\)\)/.test(src), 'CAS18 · le CA est masquable');
  vrai(/masque\(esc\(c\.nom/.test(src), 'CAS18 · le nom aussi');
}

// ── résultat ──
console.log('\n=== TESTS — v1437 : la fiche client devient un copilote ===\n');
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
