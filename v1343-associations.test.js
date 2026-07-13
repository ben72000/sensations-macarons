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
const T=(n,a,b)=>{const p=JSON.stringify(a)===JSON.stringify(b);
  if(p){ok++;console.log('  ✓ '+n);}else{ko++;console.log('  ✗ '+n+'\n      obtenu  '+JSON.stringify(a)+'\n      attendu '+JSON.stringify(b));}};
const P=(id,noms,extra)=>({id,montant:20,lignes:[Object.assign({type:'coffret',parfums:noms.map(n=>({nom:n,qte:2}))},extra||{})]});

console.log('\n── LE BUG QUE LE LIFT EMPÊCHE : confondre POPULARITÉ et AFFINITÉ');
// Caramel est dans TOUS les paniers. Café+Praliné se voient 3 fois sur les 3 paniers où ils
// apparaissent. Les DEUX paires pèsent 3 paniers : sans le lift, elles semblent IDENTIQUES.
const orders=[P(1,['Caramel','Cafe','Praline']),P(2,['Caramel','Cafe','Praline']),P(3,['Caramel','Cafe','Praline']),
              P(4,['Caramel','Vanille']),P(5,['Caramel','Pistache']),P(6,['Caramel','Framboise'])];
const {rows}=coOccurrenceParfums(paniersClients(orders).paniers,{minPaniers:3});
const g=(a,b)=>rows.find(r=>(r.a===a&&r.b===b)||(r.a===b&&r.b===a));
T('Café+Praliné et Caramel+Café pèsent le MÊME nombre de paniers (3)',[g('Cafe','Praline').paniers,g('Caramel','Cafe').paniers],[3,3]);
T('… mais Café+Praliné a un lift de 2 → ils s\'ATTIRENT',g('Cafe','Praline').lift,2);
T('… et Caramel+Café un lift de 1 → INDÉPENDANTS (le caramel est juste partout)',g('Caramel','Cafe').lift,1);
T('le classement remonte la VRAIE affinité en tête',rows[0].lift>=2,true);
console.log('      → sans le lift, Ben aurait « découvert » que son caramel se marie avec tout.');
console.log('        Il aurait changé sa gamme sur… sa propre popularité.');

console.log('\n── LA CONSIGNE DE BEN : sansParfum = SES choix, pas ceux du client');
const a=paniersClients([{id:9,montant:20,lignes:[{type:'coffret',parfums:[{nom:'Cafe',qte:2},{nom:'Praline',qte:2}],sansParfum:8}]}]);
T('sansParfum EXCLU des associations',a.paniers[0].parfums.map(p=>p.nom),['Cafe','Praline']);
T('… mais COMPTÉ et tracé (8 macarons composés par Ben)',a.rejets.sansParfum,8);
T('assortiment PUR (0 choisi) → aucun panier',paniersClients([{id:10,montant:20,lignes:[{type:'coffret',parfums:[],sansParfum:6}]}]).paniers.length,0);

console.log('\n── CE QUI N\'EST PAS UN CHOIX D\'ACHAT');
T('mono-parfum → rien à associer',paniersClients([P(11,['Cafe'])]).paniers.length,0);
T('don (0 €) → le client n\'a rien arbitré',paniersClients([{id:12,montant:0,lignes:[{type:'coffret',parfums:[{nom:'A',qte:1},{nom:'B',qte:1}]}]}]).paniers.length,0);
T('reprise histo → données d\'avant l\'app',paniersClients([{id:13,histo:true,montant:20,lignes:[{type:'coffret',parfums:[{nom:'A',qte:1},{nom:'B',qte:1}]}]}]).paniers.length,0);

console.log('\n── ON COMPTE DES PANIERS, JAMAIS DES PIÈCES');
T('10 A + 2 B = UNE association, pas dix',coOccurrenceParfums(paniersClients([{id:14,montant:20,lignes:[{type:'coffret',parfums:[{nom:'A',qte:10},{nom:'B',qte:2}]}]}]).paniers,{minPaniers:1}).rows[0].paniers,1);

console.log('\n── LE SEUIL : un % sans son effectif est un mensonge poli');
const f=coOccurrenceParfums(paniersClients([P(20,['A','B']),P(21,['A','B'])]).paniers,{minPaniers:5});
T('paire vue 2 fois sur seuil 5 → marquée NON significative',f.rows[0].significatif,false);
T('… mais PAS supprimée : cacher le faible, c\'est nier son existence (v1337)',f.rows.length,1);

console.log('\n'+(ko?`❌ ${ko} ÉCHEC(S) — ${ok} ok`:`✅ ${ok}/${ok} — vague 64 verte`));
process.exit(ko?1:0);
