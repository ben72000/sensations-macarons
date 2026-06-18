// ============================================================================
// PROTOTYPE — Calage du rétroplanning sur les plages de disponibilité (3 types).
// Reproduit availSlotsForDate (bascule A/B) et implémente le calage À REBOURS.
// AUCUNE intégration : on valide la logique sur plusieurs cas avant de toucher app.js.
// ============================================================================

const AVAIL_ANCHOR = '2025-01-06'; // un lundi (semaine A)
const conf = {
  anchor: AVAIL_ANCHOR,
  weekA: {
    1:[['08:00','19:00']], 2:[['08:00','19:00']], 3:[['08:00','19:00']], 4:[['08:00','19:00']], 5:[['08:00','19:00']],
    6:[['09:00','19:00']], 0:[]   // dimanche OFF en semaine A
  },
  weekB: {
    1:[['08:30','12:00'],['14:00','18:00']], 2:[['08:30','12:00'],['14:00','18:00']],
    3:[['08:30','12:00'],['14:00','18:00']], 4:[['08:30','12:00'],['14:00','18:00']],
    5:[['08:30','12:00'],['14:00','18:00']],
    6:[['09:00','19:00']], 0:[]
  }
};

const hmToMin = hm => { const [h,m]=hm.split(':').map(Number); return h*60+m; };
function availWeekType(dateStr){
  const anchor=new Date(AVAIL_ANCHOR);
  const mondayOf = x=>{ const t=new Date(x); const day=(t.getDay()+6)%7; t.setDate(t.getDate()-day); t.setHours(0,0,0,0); return t; };
  const a=mondayOf(anchor), b=mondayOf(new Date(dateStr));
  const weeks=Math.round((b-a)/(7*86400000));
  return (((weeks%2)+2)%2===0) ? 'A' : 'B';
}
function availSlotsForDate(d){
  const wk = availWeekType(d.toISOString().slice(0,10));
  const map = wk==='A' ? conf.weekA : conf.weekB;
  return (map[d.getDay()]||[]);
}

// Convertit une Date en "minutes depuis epoch local 00:00 du jour" pour comparer aux plages.
function dayKey(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function minOfDay(d){ return d.getHours()*60+d.getMinutes(); }

// --- Cœur : reculer une date jusqu'à la fin d'un créneau de travail valide. ---
// On cherche le dernier instant <= 'date' qui tombe dans une plage. Utilisé pour la FIN d'une
// tâche active/encadrée (on la termine au plus tard possible sans dépasser 'date').
function reculerVersFinDeCreneau(date, guardDays=30){
  let cur = new Date(date);
  for(let i=0;i<guardDays;i++){
    const slots = availSlotsForDate(cur).slice().sort((a,b)=>hmToMin(a[0])-hmToMin(b[0]));
    const m = minOfDay(cur);
    // chercher le créneau dont [s,e] contient un instant <= m
    let best=null;
    for(const [s,e] of slots){
      const a=hmToMin(s), b=hmToMin(e);
      if(a < m){ // il y a de la place avant m dans ce créneau (ou tout le créneau)
        best = Math.min(m, b);
      }
    }
    if(best!=null){ const r=dayKey(cur); r.setMinutes(best); return r; }
    // sinon, jour précédent à 23:59
    cur = dayKey(cur); cur.setDate(cur.getDate()-1); cur.setHours(23,59,0,0);
  }
  return null;
}

// Placer une tâche ACTIVE de durée dureeMin se terminant AU PLUS TARD à 'finVoulue'.
// Par défaut : doit tenir d'un seul tenant dans un créneau. Renvoie {debut, fin, deborde}.
function placerActive(finVoulue, dureeMin, guardDays=40){
  let cur = new Date(finVoulue);
  for(let i=0;i<guardDays;i++){
    const slots = availSlotsForDate(cur).slice().sort((a,b)=>hmToMin(a[0])-hmToMin(b[0]));
    const m = minOfDay(cur);
    // tester chaque créneau, du plus tardif au plus tôt
    for(const [s,e] of slots.slice().reverse()){
      const a=hmToMin(s), b=hmToMin(e);
      const finPossible = Math.min(m, b);
      if(finPossible - a >= dureeMin){
        // tient dans ce créneau
        const fin=dayKey(cur); fin.setMinutes(finPossible);
        const deb=dayKey(cur); deb.setMinutes(finPossible-dureeMin);
        return { debut:deb, fin, deborde:false };
      }
    }
    // aucun créneau du jour ne convient → jour précédent, fin de journée
    cur = dayKey(cur); cur.setDate(cur.getDate()-1); cur.setHours(23,59,0,0);
  }
  return { debut:null, fin:null, deborde:true };
}

// Placer une tâche PASSIVE ENCADRÉE (cuisson) : début ET fin dans le MÊME créneau (présence
// requise aux deux bouts). Identique à active du point de vue calage (tenir dans un créneau).
const placerEncadree = placerActive;

// Tâche PASSIVE LIBRE (repos) : aucune contrainte. La fin est 'finVoulue', le début = fin - duree,
// peut traverser la nuit/week-end librement.
function placerLibre(finVoulue, dureeMin){
  const fin=new Date(finVoulue);
  const deb=new Date(finVoulue.getTime() - dureeMin*60000);
  return { debut:deb, fin, deborde:false };
}

// ---------- TESTS ----------
const fmt = d => d ? d.toLocaleString('fr-FR',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';

console.log('=== Vérif plages (semaine A = lun 06/01/2025) ===');
console.log('Lundi 2026-06-15 type:', availWeekType('2026-06-15'), 'slots:', JSON.stringify(availSlotsForDate(new Date('2026-06-15T12:00'))));

console.log('\n=== CAS 1 : montage actif 2h, fin voulue mardi 16/06 20:00 (hors plage 8-19) ===');
let r = placerActive(new Date('2026-06-16T20:00'), 120);
console.log('  → placé', fmt(r.debut), '→', fmt(r.fin), r.deborde?'(DÉBORDE!)':'');
console.log('  Attendu : reculé pour finir à 19:00 (fin de plage), début 17:00');

console.log('\n=== CAS 2 : montage actif 3h, fin voulue lundi 15/06 09:30 (créneau trop court avant) ===');
r = placerActive(new Date('2026-06-15T09:30'), 180);
console.log('  → placé', fmt(r.debut), '→', fmt(r.fin));
console.log('  Attendu : recule au samedi/jour précédent car 8:00→9:30 = 1h30 < 3h');

console.log('\n=== CAS 3 : cuisson encadrée 25 min, fin voulue mardi 16/06 18:55 ===');
r = placerEncadree(new Date('2026-06-16T18:55'), 25);
console.log('  → placé', fmt(r.debut), '→', fmt(r.fin));
console.log('  Attendu : OK, 18:30→18:55 tient avant 19:00');

console.log('\n=== CAS 4 : cuisson encadrée 25 min, fin voulue mardi 16/06 19:10 (déborde) ===');
r = placerEncadree(new Date('2026-06-16T19:10'), 25);
console.log('  → placé', fmt(r.debut), '→', fmt(r.fin));
console.log('  Attendu : reculé pour finir à 19:00, début 18:35');

console.log('\n=== CAS 5 : repos libre 12h, fin voulue mardi 16/06 08:00 ===');
r = placerLibre(new Date('2026-06-16T08:00'), 12*60);
console.log('  → placé', fmt(r.debut), '→', fmt(r.fin));
console.log('  Attendu : début lundi 20:00 (traverse la nuit librement, AUCUNE contrainte)');

console.log('\n=== CAS 6 : semaine B, montage 3h, fin voulue mercredi (créneaux 8:30-12 / 14-18) ===');
// trouver un mercredi en semaine B
let merc = new Date('2026-06-17T17:00');
console.log('  17/06 type:', availWeekType('2026-06-17'));
r = placerActive(merc, 180);
console.log('  → placé', fmt(r.debut), '→', fmt(r.fin));
console.log('  Attendu : si semaine B, tient dans 14-18 (4h) → 14:00-17:00');

console.log('\n=== CAS 7 (limite) : cuisson 25 min, fin voulue à 08:40 (créneau B 8:30-12, place ?) ===');
r = placerEncadree(new Date('2026-06-15T08:40'), 25);
console.log('  → placé', fmt(r.debut), '→', fmt(r.fin));
console.log('  Attendu : 8:30→8:40 = 10 min < 25 min, donc recule au jour précédent');

console.log('\n=== CAS 8 : tâche active 5h, fin voulue mardi B 17:00 (aucun créneau B ne fait 5h) ===');
r = placerActive(new Date('2026-06-16T17:00'), 300);
console.log('  → placé', fmt(r.debut), '→', fmt(r.fin), r.deborde?'(DÉBORDE)':'');
console.log('  Attendu : recule jusqu\'à un samedi/dimanche (créneau 9-19 = 10h) car B fait max 4h');

console.log('\n=== CAS 9 : enchaînement réaliste à rebours (livraison → montage → repos → coques) ===');
const livraison = new Date('2026-06-20T10:00'); // samedi
console.log('Livraison:', fmt(livraison));
// maturation 24h AVANT livraison (libre)
let matFin = livraison;
let mat = placerLibre(matFin, 24*60);
console.log('  Maturation (libre, 24h) finit', fmt(mat.fin), 'commence', fmt(mat.debut));
// montage 2h, doit finir au début de la maturation (= mat.debut), actif
let montage = placerActive(mat.debut, 120);
console.log('  Montage (actif, 2h)', fmt(montage.debut), '→', fmt(montage.fin), montage.deborde?'(DÉBORDE)':'');
// repos ganache 12h avant le montage (libre)
let repos = placerLibre(montage.debut, 12*60);
console.log('  Repos ganache (libre, 12h)', fmt(repos.debut), '→', fmt(repos.fin));
// ganache 1h30 avant le repos (actif)
let ganache = placerActive(repos.debut, 90);
console.log('  Ganache (actif, 1h30)', fmt(ganache.debut), '→', fmt(ganache.fin), ganache.deborde?'(DÉBORDE)':'');
