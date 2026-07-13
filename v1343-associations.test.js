// ════════════════════════════════════════════════════════════════════════════
//  VAGUE 64 (v1343) — CE QUE LES CLIENTS ASSOCIENT
//  Fonctions EXTRAITES de app.js, jamais recopiées (leçon v1337).
// ════════════════════════════════════════════════════════════════════════════
function orderToLines(o){ return o.lignes||[]; }
const SRC=require('fs').readFileSync(__dirname+'/../app.js','utf8');
const grab=(n)=>{const i=SRC.indexOf('function '+n+'(');if(i<0)throw new Error('introuvable: '+n);
  let d=0;for(let k=SRC.indexOf('{',i);k<SRC.length;k++){if(SRC[k]==='{')d++;else if(SRC[k]==='}'){d--;if(!d)return SRC.slice(i,k+1);}}};
eval(['paniersClients','coOccurrenceParfums'].map(grab).join('\n'));

let ok=0,ko=0;
// [v1344] UN TEST QUI PLANTE NE DOIT PAS RESSEMBLER À UN TEST QUI PASSE.
// En vérifiant le test-garde des non-payées, l'injection du bug faisait CRASHER le fichier
// avant d'atteindre l'assertion — et mon grep sur « ✗ » ne trouvait rien. L'ABSENCE D'ÉCHEC
// SE LISAIT COMME UN SUCCÈS. C'est la vague 59 dans sa forme la plus pure : un audit qui ne
// détecte pas ce qu'il prétend protéger. On enveloppe donc chaque assertion : une exception
// devient un ÉCHEC BRUYANT, jamais un silence.
const T=(n,fa,fb)=>{ let a,b;
  try{ a=(typeof fa==='function')?fa():fa; b=(typeof fb==='function')?fb():fb; }
  catch(e){ ko++; console.log('  ✗ '+n+'\n      EXCEPTION : '+e.message); return; }
  return _T(n,a,b); };
const _T=(n,a,b)=>{const p=JSON.stringify(a)===JSON.stringify(b);
  if(p){ok++;console.log('  ✓ '+n);}else{ko++;console.log('  ✗ '+n+'\n      obtenu  '+JSON.stringify(a)+'\n      attendu '+JSON.stringify(b));}};
const P=(id,noms,extra)=>({id,montant:20,lignes:[Object.assign({type:'coffret',parfums:noms.map(n=>({nom:n,qte:2}))},extra||{})]});

console.log('\n── LE BUG QUE LE LIFT EMPÊCHE : confondre POPULARITÉ et AFFINITÉ');
// Caramel est dans TOUS les paniers. Café+Praliné se voient 3 fois sur les 3 paniers où ils
// apparaissent. Les DEUX paires pèsent 3 paniers : sans le lift, elles semblent IDENTIQUES.
const orders=[P(1,['Caramel','Cafe','Praline']),P(2,['Caramel','Cafe','Praline']),P(3,['Caramel','Cafe','Praline']),
              P(4,['Caramel','Vanille']),P(5,['Caramel','Pistache']),P(6,['Caramel','Framboise'])];
const {rows}=coOccurrenceParfums(paniersClients(orders).paniers,{minPaniers:3});
const g=(a,b)=>rows.find(r=>(r.a===a&&r.b===b)||(r.a===b&&r.b===a));
T('Café+Praliné et Caramel+Café pèsent le MÊME nombre de paniers (3)',()=>[g('Cafe','Praline').paniers,g('Caramel','Cafe').paniers],[3,3]);
T('… mais Café+Praliné a un lift de 2 → ils s\'ATTIRENT',()=>g('Cafe','Praline').lift,2);
T('… et Caramel+Café un lift de 1 → INDÉPENDANTS (le caramel est juste partout)',()=>g('Caramel','Cafe').lift,1);
T('le classement remonte la VRAIE affinité en tête',()=>rows[0].lift>=2,true);
console.log('      → sans le lift, Ben aurait « découvert » que son caramel se marie avec tout.');
console.log('        Il aurait changé sa gamme sur… sa propre popularité.');

console.log('\n── LA CONSIGNE DE BEN : sansParfum = SES choix, pas ceux du client');
const a=paniersClients([{id:9,montant:20,lignes:[{type:'coffret',parfums:[{nom:'Cafe',qte:2},{nom:'Praline',qte:2}],sansParfum:8}]}]);
T('sansParfum EXCLU des associations',()=>a.paniers[0].parfums.map(p=>p.nom),['Cafe','Praline']);
T('… mais COMPTÉ et tracé (8 macarons composés par Ben)',a.rejets.sansParfum,8);
T('assortiment PUR (0 choisi) → aucun panier',paniersClients([{id:10,montant:20,lignes:[{type:'coffret',parfums:[],sansParfum:6}]}]).paniers.length,0);

console.log('\n── CE QUI N\'EST PAS UN CHOIX D\'ACHAT');
T('mono-parfum → rien à associer',paniersClients([P(11,['Cafe'])]).paniers.length,0);
T('don (0 €) → le client n\'a rien arbitré',paniersClients([{id:12,montant:0,lignes:[{type:'coffret',parfums:[{nom:'A',qte:1},{nom:'B',qte:1}]}]}]).paniers.length,0);
T('reprise histo → données d\'avant l\'app',paniersClients([{id:13,histo:true,montant:20,lignes:[{type:'coffret',parfums:[{nom:'A',qte:1},{nom:'B',qte:1}]}]}]).paniers.length,0);

console.log('\n── [v1344] LES NON-PAYÉES COMPTENT, ET NE SONT PAS DISTINGUÉES (décision de Ben)');
// Un choix de parfum et un encaissement mesurent DEUX RÉALITÉS DIFFÉRENTES. Le client qui a
// composé Café+Praliné a exprimé cette préférence, réglée ou non. Ce test échoue si quelqu'un
// « aligne » un jour les associations sur la compta en croyant corriger une incohérence.
const impayee = {id:30, montant:40, paiement:'En attente', statutPaiement:'En attente',
  lignes:[{type:'coffret', parfums:[{nom:'Cafe',qte:3},{nom:'Praline',qte:3}]}]};
const soldee  = {id:31, montant:40, paiement:'Payé', statutPaiement:'Payé',
  lignes:[{type:'coffret', parfums:[{nom:'Cafe',qte:3},{nom:'Praline',qte:3}]}]};
T('une commande NON PAYÉE produit bien un panier',paniersClients([impayee]).paniers.length,1);
T('… strictement comme une commande soldée',
  ()=>paniersClients([impayee]).paniers[0].parfums, ()=>paniersClients([soldee]).paniers[0].parfums);
T('les deux ensemble = 2 paniers (aucune n\'annule l\'autre)',paniersClients([impayee,soldee]).paniers.length,2);
console.log('      → filtrer sur le paiement laisserait la COMPTA corrompre une mesure COMPORTEMENTALE.');

console.log('\n── ON COMPTE DES PANIERS, JAMAIS DES PIÈCES');
T('10 A + 2 B = UNE association, pas dix',()=>coOccurrenceParfums(paniersClients([{id:14,montant:20,lignes:[{type:'coffret',parfums:[{nom:'A',qte:10},{nom:'B',qte:2}]}]}]).paniers,{minPaniers:1}).rows[0].paniers,1);

console.log('\n── LE SEUIL : un % sans son effectif est un mensonge poli');
const f=coOccurrenceParfums(paniersClients([P(20,['A','B']),P(21,['A','B'])]).paniers,{minPaniers:5});
T('paire vue 2 fois sur seuil 5 → marquée NON significative',()=>f.rows[0].significatif,false);
T('… mais PAS supprimée : cacher le faible, c\'est nier son existence (v1337)',f.rows.length,1);

console.log('\n── [v1346] LE CAS RÉEL DE BEN : le salon de thé (lift ×4,58 — et pourtant vide de sens)');
// Ben a repéré à l'œil ce que le moteur ne voyait pas : Myrtille+Chocolat+Mangue n'est PAS une
// affinité de goût, c'est SON salon de thé qui recommande toujours la même chose. Le lift corrige
// la POPULARITÉ D'UN PARFUM ; il est AVEUGLE à la CONCENTRATION SUR UN CLIENT.
const CL=[{id:1,nom:'Salon de thé',type:'pro'},{id:2,nom:'Particulier A'},{id:3,nom:'Particulier B'},{id:4,nom:'Particulier C'}];
const salon=[];
for(let i=0;i<17;i++) salon.push({id:100+i,clientId:1,montant:80,
  lignes:[{type:'coffret',parfums:[{nom:'Myrtille',qte:5},{nom:'Chocolat',qte:5},{nom:'Mangue',qte:5}]}]});
T('les 17 commandes du salon de thé sont EXCLUES (client pro)',
  ()=>paniersClients(salon,{clients:CL}).paniers.length,0);
T('… et comptées comme rejets pro (traçable, pas escamoté)',
  ()=>paniersClients(salon,{clients:CL}).rejets.pro,17);

// SANS le filtre pro (client non typé), le 2e garde-fou doit AUSSI attraper le cas.
// Deux mécanismes indépendants : ceinture ET bretelles. Si Ben oublie de typer un client pro,
// la concentration mono-client le rattrape quand même.
const salonNonType=salon.map(o=>({...o,clientId:9}));
const co=coOccurrenceParfums(paniersClients(salonNonType,{clients:[]}).paniers,{minPaniers:5});
T('même NON typé pro : 17 paniers mais UN SEUL client → détecté',()=>co.rows[0].nClients,1);
T('… donc marqué monoClient (une habitude, pas une tendance)',()=>co.rows[0].monoClient,true);
T('… et DÉCLASSÉ malgré 17 paniers et un lift écrasant',()=>co.rows[0].significatif,false);
console.log('      → le lift seul aurait laissé passer ×4,58. Il faut compter les CLIENTS, pas les commandes.');

// Une VRAIE tendance : même paire, mais chez 3 clients différents → elle PASSE.
const vraie=[];
[2,3,4].forEach(cid=>{ for(let i=0;i<2;i++) vraie.push({id:200+cid*10+i,clientId:cid,montant:20,
  lignes:[{type:'coffret',parfums:[{nom:'Cafe',qte:3},{nom:'Coco',qte:3}]}]}); });
const cv=coOccurrenceParfums(paniersClients(vraie,{clients:CL}).paniers,{minPaniers:5});
T('6 paniers chez 3 clients distincts → VRAIE tendance, retenue',()=>cv.rows[0].significatif,true);
T('… avec ses 3 clients affichés',()=>cv.rows[0].nClients,3);

console.log('\n── [v1347] LE JOURNAL DES EXCLUSIONS : « 110 commandes, 63 paniers. Pourquoi ? »');
// Ben ne pouvait pas savoir si son chiffre reposait sur ses données ou sur un tiers d'entre elles.
// L'app COMPTAIT ses rejets sans jamais les MONTRER. Un filtre silencieux est un mensonge par omission.
const CLp=[{id:1,type:'pro'}];
const mix=[
  {id:1,clientId:1,montant:50,lignes:[{type:'coffret',parfums:[{nom:'A',qte:2},{nom:'B',qte:2}]}]},   // pro
  {id:2,clientId:2,montant:20,lignes:[{type:'coffret',parfums:[{nom:'A',qte:6}]}]},                    // mono-parfum
  {id:3,clientId:3,montant:20,lignes:[{type:'coffret',parfums:[],sansParfum:6}]},                      // assortiment pur
  {id:4,clientId:4,montant:0,lignes:[{type:'coffret',parfums:[{nom:'A',qte:1},{nom:'B',qte:1}]}]},     // don
  {id:5,clientId:5,montant:20,lignes:[{type:'coffret',parfums:[{nom:'A',qte:2},{nom:'B',qte:2}]}]},    // retenue
];
const R=paniersClients(mix,{clients:CLp});
T('les COMMANDES VUES sont comptées (5)',()=>R.rejets.commandesVues,5);
T('les COMMANDES RETENUES aussi (1)',()=>R.rejets.commandesRetenues,1);
T('chaque motif de rejet est nommé et chiffré',
  ()=>[R.rejets.pro,R.rejets.monoParfum,R.rejets.assortimentPur,R.rejets.dons],[1,1,1,1]);
T('l\'écart est intégralement expliqué (5 − 1 = 4 rejets)',
  ()=>R.rejets.pro+R.rejets.monoParfum+R.rejets.assortimentPur+R.rejets.dons,4);
console.log('      → Ben peut désormais vérifier que le filtre est juste, au lieu de croire le chiffre sur parole.');

console.log('\n── [v1348→v1349] LE JOURNAL AVAIT DEUX BUGS, PAS UN — ET J\'AI D\'ABORD RÉPARÉ LE MAUVAIS');
// Ben : « 42+5+6+14+18=85, +48=133, pour 128 vues ». J\'ai vu un écart de 5 et supposé un MANQUE
// (des commandes invisibles). J\'ai ajouté `sansLigne` — un vrai motif, mais qui valait 0 chez Ben.
// Le second signalement de Ben a montré que sansLigne restait à 0 : mon diagnostic était FAUX.
// L\'écart était un SURPLUS, pas un manque : `dons`/`monoParfum`/`assortimentPur` comptaient des
// LIGNES, alors que `commandesVues` compte des COMMANDES. Une commande à 2 lignes rejetées pour
// le même motif incrémentait ce motif 2 fois pour 1 seule commande vue.
// LEÇON : le SIGNE d\'un écart (trop vs pas assez) désigne la famille de bug. Je l\'ai ignoré et
// j\'ai réparé le premier trou visible au lieu de celui que l\'écart désignait.
T('un vrai "sans format" reste nommé (le premier motif n\'était pas faux, juste incomplet)',
  ()=>paniersClients([{id:1,clientId:1,montant:20,type:'inconnu'}],{clients:[]}).rejets.sansLigne, 1);

console.log('\n── [v1349] LE VRAI BUG : granularité mélangée (lignes vs commandes)');
// UNE COMMANDE À 2 LIGNES À 0 € : avant v1349, `dons` était incrémenté 2 fois pour 1 commande vue.
const deuxDons=[{id:1,clientId:1,montant:0,lignes:[
  {type:'coffret',parfums:[{nom:'A',qte:1},{nom:'B',qte:1}]},
  {type:'coffret',parfums:[{nom:'C',qte:1},{nom:'D',qte:1}]}]}];
const Rd=paniersClients(deuxDons,{clients:[]});
T('commande à 2 lignes-dons : UNE SEULE commande vue',()=>Rd.rejets.commandesVues,1);
T('… et le motif "dons" compté UNE SEULE FOIS (pas 2)',()=>Rd.rejets.dons,1);
T('… l\'identité tombe juste : 1 rejet + 0 retenue = 1 vue',
  ()=>Rd.rejets.pro+Rd.rejets.monoParfum+Rd.rejets.assortimentPur+Rd.rejets.dons+Rd.rejets.histo+Rd.rejets.sansLigne+Rd.rejets.commandesRetenues,
  1);

console.log('\n── [v1349] LA RÉGRESSION QUE J\'AI MOI-MÊME INTRODUITE, ET RATTRAPÉE AVANT LIVRAISON');
// Mon premier correctif de la granularité coupait AUSSI le comptage de `sansParfum` (un TOTAL DE
// MACARONS, pas un verdict de commande) dès qu'une ligne précédente avait été retenue. Sous-
// comptage NEUF, introduit en réparant le surplus. Deux compteurs, deux granularités : jamais
// le même `return`.
const mixte=[{id:1,clientId:1,montant:40,lignes:[
  {type:'coffret',parfums:[{nom:'A',qte:2},{nom:'B',qte:2}]},         // exploitable → retenue
  {type:'coffret',parfums:[],sansParfum:4}]}];                        // assortiment, APRÈS la ligne retenue
const Rm=paniersClients(mixte,{clients:[]});
T('la commande EST retenue (1re ligne exploitable)',()=>Rm.paniers.length,1);
T('… ET les 4 macarons d\'assortiment de la 2e ligne sont TOUJOURS comptés',()=>Rm.rejets.sansParfum,4);
console.log('      → sans ce découplage, ces 4 macarons auraient disparu du décompte, en silence.');

console.log('\n── [v1349] AUTO-VÉRIFICATION : mord sur des cas plus riches (multi-lignes, mixtes)');
const CLben=[{id:1,type:'pro'}];
const richeSet=[
  {id:1,clientId:1,montant:20,lignes:[{type:'coffret',parfums:[{nom:'A',qte:2},{nom:'B',qte:2}]}]},               // pro (client 1)
  {id:2,clientId:2,montant:0,lignes:[{type:'coffret',parfums:[{nom:'A',qte:1}]},{type:'coffret',parfums:[{nom:'B',qte:1}]}]}, // 2 lignes, montant global 0€ → dons, compté 1×
  {id:3,clientId:3,montant:20,lignes:[{type:'coffret',parfums:[{nom:'A',qte:4}]},{type:'coffret',parfums:[{nom:'B',qte:2},{nom:'C',qte:2}]}]}, // 1re mono, 2e exploitable → RETENUE
];
const Rr=paniersClients(richeSet,{clients:CLben});
T('3 commandes vues',()=>Rr.rejets.commandesVues,3);
T('la commande 3 (mono PUIS exploitable) est bien RETENUE',()=>Rr.rejets.commandesRetenues,1);
const sommeR=Rr.rejets.pro+Rr.rejets.monoParfum+Rr.rejets.assortimentPur+Rr.rejets.dons+Rr.rejets.histo+Rr.rejets.sansLigne;
T('identité : rejets + retenues = vues, sur un jeu multi-lignes réaliste',()=>sommeR+Rr.rejets.commandesRetenues,3);

console.log('\n'+(ko?`❌ ${ko} ÉCHEC(S) — ${ok} ok`:`✅ ${ok}/${ok} — vague 64 verte`));
process.exit(ko?1:0);
