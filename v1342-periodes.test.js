// ════════════════════════════════════════════════════════════════════════════
//  VAGUE 63 (v1342) — LE MOIS *ET* LA SEMAINE
//  Chaque test nomme le BUG qu'il empêche de revenir. Un test qui n'empêche rien
//  ne fait que valider sa propre cohérence (leçon de la v1337).
// ════════════════════════════════════════════════════════════════════════════
function ymdLocal(d){const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');}
function fmtDate(s){return s;} function money2(n){return Math.round((+n||0)*100)/100;}
function monthKey(d){return (d||'').slice(0,7);} function monthLabel(ym){return ym;}
function _aiMoisNomme(t){ if(/\bmai\b/.test(t))return{cle:'2026-05'}; if(/\bdecembre\b/.test(t))return{cle:'2025-12'}; return null; }

const SRC=require('fs').readFileSync(__dirname+'/../app.js','utf8');
const grab=(n)=>{const i=SRC.indexOf('function '+n+'(');if(i<0)throw new Error('introuvable: '+n);
  let d=0,j=SRC.indexOf('{',i);for(let k=j;k<SRC.length;k++){if(SRC[k]==='{')d++;else if(SRC[k]==='}'){d--;if(!d)return SRC.slice(i,k+1);}}};
// On EXTRAIT les fonctions de app.js au lieu de les recopier : un test qui recopie le code
// qu'il teste ne valide que sa propre cohérence (leçon de la v1337).
const NOMS=['_isoLundi','_isoSemaine','_isoBornesSemaine','_isoNbSemaines','_aiSemaineNommee','_aiIntervalleSemaine','_aiPeriodeCible','_aiProrataChargesFixes','_dansPeriode','_perLabel'];
eval(NOMS.map(grab).join('\n'));

let ok=0,ko=0;
const T=(n,a,b)=>{const p=JSON.stringify(a)===JSON.stringify(b);
  if(p){ok++;console.log('  ✓ '+n);}else{ko++;console.log('  ✗ '+n+'\n      obtenu  '+JSON.stringify(a)+'\n      attendu '+JSON.stringify(b));}};
const R=new Date(2026,6,13);   // réf figée : un test qui dépend du calendrier est un piège (v1330)

console.log('\n── ISO 8601 : l\'année ISO n\'est PAS l\'année civile');
T('1 jan 2027 → S53 de 2026 (le piège qui dort 11 mois)',_isoSemaine(new Date(2027,0,1)),{an:2026,num:53});
T('1 jan 2026 → S1 de 2026',_isoSemaine(new Date(2026,0,1)),{an:2026,num:1});
T('2026 compte 53 semaines',_isoNbSemaines(2026),53);
T('2025 en compte 52',_isoNbSemaines(2025),52);

console.log('\n── BUG ÉVITÉ : une S53 inexistante glissant en silence sur la S1 suivante');
T('S53-2025 → refusée, PAS remplacée',_aiSemaineNommee('semaine 53 2025',R),{an:2025,num:53,invalide:true});
T('S53-2026 → acceptée (elle existe)',_aiSemaineNommee('semaine 53 2026',R),{an:2026,num:53,explicite:true});

console.log('\n── BUG ÉVITÉ : « semaine 39 » lue comme un mois (ym rempli à tort)');
const S=_aiPeriodeCible('mon ca de la semaine 39',R);
T('S39 → bornes ISO justes',[S.depuis,S.jusqu],['2025-09-22','2025-09-28']);
T('S39 → ym NULL : une semaine n\'est pas un mois',S.ym,null);
T('mai → ym rempli : le contrat v1333 est INTACT',_aiPeriodeCible('ca de mai',R).ym,'2026-05');
T('décembre 2025 → ym rempli',_aiPeriodeCible('point mort decembre 2025',R).ym,'2025-12');

console.log('\n── BUG ÉVITÉ : le prorata « mois du lundi » (plausible, et faux de 42 %)');
const C=_aiPeriodeCible('semaine 40 2025',R);
T('S40-2025 chevauche bien sept→oct',[C.depuis,C.jusqu],['2025-09-29','2025-10-05']);
const P=_aiProrataChargesFixes(C.depuis,C.jusqu,{'2025-09':300,'2025-10':620});
T('prorata JOUR PAR JOUR = 120 € (2j sept à 10 €/j + 5j oct à 20 €/j)',P.total,120);
T('le chevauchement est DÉTECTÉ (2 mois)',P.moisChevauches,2);
console.log('      → un prorata « mois du lundi » aurait dit 70 € : plausible, invisible, faux.');

console.log('\n── BUG ÉVITÉ : « [object Object] » affiché à Ben');
T('_perLabel sur un intervalle',_perLabel({label:'semaine 39'}),'semaine 39');
T('_perLabel sur une clé de mois',_perLabel('2026-05'),'2026-05');

console.log('\n── LE PRÉDICAT UNIQUE : mois ET semaine, un seul moteur');
T('paiement du 25 sept ∈ S39',_dansPeriode('2025-09-25',{depuis:'2025-09-22',jusqu:'2025-09-28'}),true);
T('paiement du 29 sept ∉ S39',_dansPeriode('2025-09-29',{depuis:'2025-09-22',jusqu:'2025-09-28'}),false);
T('clé de mois : comportement historique inchangé',_dansPeriode('2025-09-25','2025-09'),true);
T('date vide → jamais dans la période',_dansPeriode('',{depuis:'2025-09-22',jusqu:'2025-09-28'}),false);

console.log('\n'+(ko?`❌ ${ko} ÉCHEC(S) — ${ok} ok`:`✅ ${ok}/${ok} — vague 63 verte`));
process.exit(ko?1:0);
