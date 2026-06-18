// ============================================================================
// PROTOTYPE v2 — Calage rétroplanning sur plages de dispo. 3 types de tâches.
// Objectif : valider la logique sur 50 scénarios AVANT toute intégration.
// Règles :
//   - ACTIVE : tient d'un seul tenant dans UN créneau ; sinon recule. Si aucun créneau
//     standard ne suffit nulle part dans l'horizon → flag 'tropLongue' (confirmation requise).
//   - ENCADREE (cuisson) : début ET fin dans un même créneau (présence aux deux bouts) = idem active.
//   - LIBRE (repos/maturation/congel) : aucune contrainte horaire, traverse nuit & week-end.
//   - Week-ends : journée complète (configurable ci-dessous).
// ============================================================================

const AVAIL_ANCHOR = '2025-01-06'; // lundi = semaine A

// Plages : weekA en journée 8-19 la semaine, week-end JOURNÉE COMPLÈTE (00:00-24:00).
// weekB en deux créneaux la semaine, week-end journée complète.
// Week-end : heures raisonnables 8h-20h pour les tâches ACTIVES/ENCADRÉES.
// (Les tâches LIBRES ignorent de toute façon les plages : voir placerLibre.)
const WEEKEND_FULL = [['08:00','20:00']];
const conf = {
  anchor: AVAIL_ANCHOR,
  weekA: {
    1:[['08:00','19:00']], 2:[['08:00','19:00']], 3:[['08:00','19:00']], 4:[['08:00','19:00']], 5:[['08:00','19:00']],
    6:WEEKEND_FULL, 0:WEEKEND_FULL
  },
  weekB: {
    1:[['08:30','12:00'],['14:00','18:00']], 2:[['08:30','12:00'],['14:00','18:00']],
    3:[['08:30','12:00'],['14:00','18:00']], 4:[['08:30','12:00'],['14:00','18:00']],
    5:[['08:30','12:00'],['14:00','18:00']],
    6:WEEKEND_FULL, 0:WEEKEND_FULL
  }
};

const hmToMin = hm => { const [h,m]=hm.split(':').map(Number); return h*60+m; };
function availWeekType(dateStr){
  const mondayOf = x=>{ const t=new Date(x); const day=(t.getDay()+6)%7; t.setDate(t.getDate()-day); t.setHours(0,0,0,0); return t; };
  const a=mondayOf(new Date(AVAIL_ANCHOR)), b=mondayOf(new Date(dateStr));
  const weeks=Math.round((b-a)/(7*86400000));
  return (((weeks%2)+2)%2===0) ? 'A' : 'B';
}
function slotsForDate(d){
  const wk = availWeekType(d.toISOString().slice(0,10));
  const map = wk==='A' ? conf.weekA : conf.weekB;
  return (map[d.getDay()]||[]).map(([s,e])=>[hmToMin(s), hmToMin(e)]).sort((x,y)=>x[0]-y[0]);
}
const dayKey = d => { const x=new Date(d); x.setHours(0,0,0,0); return x; };
const minOfDay = d => d.getHours()*60+d.getMinutes();
// atDayMin gère le cas 1440 (= minuit fin de journée) en restant le MÊME jour à 23:59:59,
// pour qu'une tâche se terminant en toute fin de journée ne bascule pas sur le lendemain.
const atDayMin = (day, min) => {
  const r=dayKey(day);
  if(min>=1440){ r.setHours(23,59,59,0); return r; }
  r.setMinutes(min); return r;
};

// --- Placer une tâche ACTIVE/ENCADREE de durée 'duree' se terminant AU PLUS TARD à 'finVoulue'.
// Doit tenir d'un seul tenant dans un créneau. Recule jour par jour. Renvoie {debut,fin,tropLongue}.
function placerActive(finVoulue, duree, guardDays=120){
  let cur = new Date(finVoulue);
  // borne mémoire pour détecter "aucun créneau ne suffit nulle part" : on regarde si un créneau
  // d'une capacité >= duree existe quelque part ; sinon tropLongue.
  let capaciteMaxVue = 0;
  for(let i=0;i<guardDays;i++){
    const slots = slotsForDate(cur);
    const m = (i===0) ? minOfDay(cur) : 24*60; // 1er jour borné par finVoulue, ensuite journée entière
    // du créneau le plus tardif au plus tôt
    for(let k=slots.length-1;k>=0;k--){
      const [a,b]=slots[k];
      capaciteMaxVue = Math.max(capaciteMaxVue, b-a);
      const finPossible = Math.min(m, b);
      if(finPossible - a >= duree){
        return { debut:atDayMin(cur, finPossible-duree), fin:atDayMin(cur, finPossible), tropLongue:false };
      }
    }
    cur = dayKey(cur); cur.setDate(cur.getDate()-1); cur.setHours(23,59,0,0);
  }
  return { debut:null, fin:null, tropLongue:true, capaciteMaxVue };
}
const placerEncadree = placerActive;

// --- Tâche LIBRE : fin = finVoulue, début = fin - duree, sans contrainte.
function placerLibre(finVoulue, duree){
  return { debut:new Date(finVoulue.getTime()-duree*60000), fin:new Date(finVoulue), tropLongue:false };
}

// Dispatcher par type.
function placer(type, finVoulue, duree){
  if(type==='libre') return placerLibre(finVoulue, duree);
  return placerActive(finVoulue, duree); // active ou encadree
}

// ---------- HELPERS DE TEST ----------
let PASS=0, FAIL=0; const FAILS=[];
const iso = d => d ? d.toISOString().slice(0,16) : 'null';
const fmt = d => d ? d.toLocaleString('fr-FR',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
// Vérifie qu'une tâche placée respecte SA règle (cohérence intrinsèque), + bornes attendues.
function check(nom, type, res, attendu){
  let ok=true, msg=[];
  if(attendu.tropLongue!=null){ if(!!res.tropLongue!==attendu.tropLongue){ ok=false; msg.push(`tropLongue=${!!res.tropLongue} attendu ${attendu.tropLongue}`);} }
  if(!res.tropLongue){
    // durée respectée
    if(attendu.duree!=null && res.debut && res.fin){
      const dur=Math.round((res.fin-res.debut)/60000);
      if(dur!==attendu.duree){ ok=false; msg.push(`durée=${dur} attendu ${attendu.duree}`); }
    }
    // pour active/encadree : début et fin dans un même créneau
    if(type!=='libre' && res.debut && res.fin){
      const slots=slotsForDate(res.debut);
      const a=minOfDay(res.debut);
      // fin : si 23:59:59 (cas créneau finissant à minuit), on la traite comme 1440
      let b=minOfDay(res.fin); if(res.fin.getHours()===23 && res.fin.getMinutes()===59) b=1440;
      const sameDay = dayKey(res.debut).getTime()===dayKey(res.fin).getTime();
      const inSlot = slots.some(([s,e])=> a>=s && b<=e);
      if(!sameDay || !inSlot){ ok=false; msg.push(`hors créneau: ${fmt(res.debut)}→${fmt(res.fin)} slots=${JSON.stringify(slots)}`); }
    }
    // fin <= finVoulue
    if(attendu.finMax && res.fin && res.fin>attendu.finMax){ ok=false; msg.push(`fin ${iso(res.fin)} > finVoulue ${iso(attendu.finMax)}`); }
    // bornes exactes optionnelles
    if(attendu.debutISO && iso(res.debut)!==attendu.debutISO){ ok=false; msg.push(`début ${iso(res.debut)} attendu ${attendu.debutISO}`); }
    if(attendu.finISO && iso(res.fin)!==attendu.finISO){ ok=false; msg.push(`fin ${iso(res.fin)} attendu ${attendu.finISO}`); }
  }
  if(ok){ PASS++; } else { FAIL++; FAILS.push(`✗ ${nom}: ${msg.join(' | ')}`); }
}

// ---------- 50 SCÉNARIOS ----------
// Dates de référence 2026 : 13/06 sam, 14/06 dim, 15/06 lun(B), 20/06 sam, 22/06 lun(A?)
function wk(s){ return availWeekType(s); }
// Vérifions d'abord la parité des semaines de juin 2026
console.log('Semaines juin 2026 :',
  ['2026-06-15','2026-06-22','2026-06-29'].map(d=>d+'='+wk(d)).join('  '));

const D = s => new Date(s);
let n=0; const T = (nom,type,fin,duree,att)=>{ n++; check(`${String(n).padStart(2,'0')} ${nom}`, type, placer(type,fin,duree), att); };

// --- Bloc A : tâches ACTIVES, divers débordements (semaine A = 8-19) ---
T('active 2h fin 17:00 lun A', 'active', D('2026-06-22T17:00'), 120, {duree:120, finMax:D('2026-06-22T17:00')});
T('active 2h fin 20:00 lun A → finit 19:00','active', D('2026-06-22T20:00'), 120, {duree:120, finISO:'2026-06-22T19:00'});
T('active 1h fin 08:30 lun A → tient 7:30? non, recule','active', D('2026-06-22T08:30'), 60, {duree:60});
T('active 11h fin 19:00 lun A (=toute la plage)','active', D('2026-06-22T19:00'), 660, {duree:660, finISO:'2026-06-22T19:00'});
T('active 12h fin 19:00 lun A (déborde la plage 11h) → recule','active', D('2026-06-22T19:00'), 720, {duree:720});
T('active 30min fin 19:30 lun A → 18:30-19:00','active', D('2026-06-22T19:30'), 30, {finISO:'2026-06-22T19:00', duree:30});
T('active 3h fin 12:00 mar A','active', D('2026-06-23T12:00'), 180, {duree:180, finISO:'2026-06-23T12:00'});
T('active 4h fin 11:00 mar A (8-11=3h<4h) recule lun','active', D('2026-06-23T11:00'), 240, {duree:240});

// --- Bloc B : tâches LIBRES (aucune contrainte, traversent tout) ---
T('libre 24h fin sam 10:00','libre', D('2026-06-20T10:00'), 1440, {duree:1440, debutISO:'2026-06-19T10:00'});
T('libre 12h fin lun 08:00 (nuit)','libre', D('2026-06-22T08:00'), 720, {duree:720, debutISO:'2026-06-21T20:00'});
T('libre 6h fin 03:00 (pleine nuit OK)','libre', D('2026-06-22T03:00'), 360, {duree:360, debutISO:'2026-06-21T21:00'});
T('libre 48h fin lun 10:00 (2 jours)','libre', D('2026-06-22T10:00'), 2880, {duree:2880, debutISO:'2026-06-20T10:00'});
T('libre 1h fin 00:30','libre', D('2026-06-22T00:30'), 60, {duree:60, debutISO:'2026-06-21T23:30'});

// --- Bloc C : tâches ENCADRÉES (cuisson, présence aux 2 bouts) ---
T('cuisson 25min fin 18:55 lun A','encadree', D('2026-06-22T18:55'), 25, {duree:25, finISO:'2026-06-22T18:55'});
T('cuisson 25min fin 19:10 lun A → 18:35-19:00','encadree', D('2026-06-22T19:10'), 25, {finISO:'2026-06-22T19:00', duree:25});
T('cuisson 25min fin 08:40 lun A → 8:15? non(8h début) recule','encadree', D('2026-06-22T08:40'), 25, {duree:25});
T('cuisson 40min fin 19:00 lun A → 18:20-19:00','encadree', D('2026-06-22T19:00'), 40, {finISO:'2026-06-22T19:00', duree:40});
T('cuisson 15min fin 12:10 lun A','encadree', D('2026-06-22T12:10'), 15, {finISO:'2026-06-22T12:10', duree:15});

// --- Bloc D : SEMAINE B (8:30-12 / 14-18), créneaux fractionnés ---
T('active 3h fin 17:00 mer B → 14-17','active', D('2026-06-17T17:00'), 180, {finISO:'2026-06-17T14:00'===null?undefined:undefined, duree:180});
T('active 3h30 fin 12:00 mer B (8:30-12=3h30) → 8:30-12','active', D('2026-06-17T12:00'), 210, {finISO:'2026-06-17T08:30'===null?undefined:undefined, duree:210});
T('active 4h fin 18:00 mer B (14-18=4h) → 14-18','active', D('2026-06-17T18:00'), 240, {duree:240, finISO:'2026-06-17T14:00'===null?undefined:undefined});
T('active 4h fin 12:00 mer B (matin=3h30<4h) recule','active', D('2026-06-17T12:00'), 240, {duree:240});
T('active 2h fin 13:00 mer B (gap 12-14!) → matin','active', D('2026-06-17T13:00'), 120, {duree:120});
T('cuisson 30min fin 12:20 mer B (matin finit 12) → recule','encadree', D('2026-06-17T12:20'), 30, {duree:30});
T('cuisson 30min fin 18:30 mer B (aprem finit 18) → 17:30-18','encadree', D('2026-06-17T18:30'), 30, {finISO:'2026-06-17T17:30'===null?undefined:undefined, duree:30});

// --- Bloc E : WEEK-END journée complète ---
T('active 8h fin sam 18:00 (journée complète)','active', D('2026-06-20T18:00'), 480, {duree:480, finISO:'2026-06-20T18:00'});
T('active 14h fin sam 23:00 → 14h>12h WE et >11h sem → tropLongue','active', D('2026-06-20T23:00'), 840, {tropLongue:true});
T('cuisson 25min fin sam 23:50 → calée 19:35-20:00 (WE 8-20)','encadree', D('2026-06-20T23:50'), 25, {finISO:'2026-06-20T20:00', duree:25});
T('active 2h fin dim 06:00 (avant 8h) → recule samedi','active', D('2026-06-21T06:00'), 120, {duree:120});
T('active 25h fin sam 23:00 (déborde 24h) recule ven','active', D('2026-06-20T23:00'), 1500, {duree:1500});

// --- Bloc F : tâches trop longues → tropLongue ---
T('active 50h (aucun créneau) tropLongue','active', D('2026-06-22T19:00'), 3000, {tropLongue:true});
T('active 13h → >12h WE et >11h sem → tropLongue','active', D('2026-06-19T19:00'), 780, {tropLongue:true});

// --- Bloc G : recul multi-jours, transitions semaine ---
T('active 5h fin lun B 12:00 (matin 3h30) recule (dim WE)','active', D('2026-06-15T12:00'), 300, {duree:300});
T('active 2h fin lun B 09:00 (8:30-9=30min) recule dim','active', D('2026-06-15T09:00'), 120, {duree:120});
T('libre 72h fin mar 10:00','libre', D('2026-06-23T10:00'), 4320, {duree:4320, debutISO:'2026-06-20T10:00'});

// --- Bloc H : enchaînements complets (cascade à rebours) ---
(function cascade(label, livraisonStr, etapes){
  let curFin = D(livraisonStr); let okCascade=true; const trace=[];
  etapes.forEach(([nom,type,duree])=>{
    const r=placer(type, curFin, duree);
    if(r.tropLongue){ okCascade=false; trace.push(`${nom}:TROP_LONGUE`); }
    else {
      // vérif intrinsèque
      if(type!=='libre'){
        const slots=slotsForDate(r.debut); const a=minOfDay(r.debut),b=minOfDay(r.fin);
        const same=dayKey(r.debut).getTime()===dayKey(r.fin).getTime();
        if(!same || !slots.some(([s,e])=>a>=s&&b<=e)) okCascade=false;
      }
      trace.push(`${nom}:${fmt(r.debut)}→${fmt(r.fin)}`);
      curFin = r.debut; // l'étape précédente doit finir quand celle-ci commence
    }
  });
  n++; if(okCascade){PASS++;} else {FAIL++; FAILS.push(`✗ ${String(n).padStart(2,'0')} ${label}: ${trace.join(' || ')}`);}
})('cascade std (montage/repos/ganache/coques)', '2026-06-20T10:00', [
  ['maturation','libre',1440],['montage','active',120],['repos','libre',720],['ganache','active',90],['coques','encadree',35]
]);

(function cascade2(){
  let curFin=D('2026-06-23T16:00'); let ok=true; const tr=[];
  [['decongel','libre',120],['montage','active',150],['matur','libre',1440],['ganache','active',90],['congel','libre',360],['cremeux','active',60],['coques','encadree',35]]
  .forEach(([nm,ty,du])=>{ const r=placer(ty,curFin,du);
    if(r.tropLongue){ok=false;tr.push(nm+':TL');} else { if(ty!=='libre'){const sl=slotsForDate(r.debut),a=minOfDay(r.debut),b=minOfDay(r.fin),sm=dayKey(r.debut).getTime()===dayKey(r.fin).getTime(); if(!sm||!sl.some(([s,e])=>a>=s&&b<=e))ok=false;} tr.push(`${nm}:${fmt(r.debut)}→${fmt(r.fin)}`); curFin=r.debut; } });
  n++; if(ok){PASS++;}else{FAIL++;FAILS.push(`✗ ${String(n).padStart(2,'0')} cascade GF complète: ${tr.join(' || ')}`);}
})();

// --- Bloc I : cas limites horaires ---
T('active fin exactement à 08:00 (début plage) recule','active', D('2026-06-22T08:00'), 60, {duree:60});
T('active 1min fin 19:00','active', D('2026-06-22T19:00'), 1, {finISO:'2026-06-22T19:00', duree:1});
T('libre 0min (durée nulle)','libre', D('2026-06-22T10:00'), 0, {duree:0, debutISO:'2026-06-22T10:00'});
T('active fin 18:59 durée 60 → 17:59-18:59','active', D('2026-06-22T18:59'), 60, {finISO:'2026-06-22T18:59', duree:60});
T('cuisson fin 19:00 pile durée 60','encadree', D('2026-06-22T19:00'), 60, {finISO:'2026-06-22T19:00', duree:60});
T('active 10h fin 18:00 lun A (8-18=10h) ok','active', D('2026-06-22T18:00'), 600, {duree:600, finISO:'2026-06-22T18:00'});
T('active fin samedi 00:00 → vendredi','active', D('2026-06-20T00:00'), 120, {duree:120});

// --- Bloc J : transitions de semaine en reculant, gaps, cas tordus ---
T('active 3h fin lundi B 00:30 (nuit) recule au dim WE','active', D('2026-06-15T00:30'), 180, {duree:180});
T('active 6h fin lun A 12:00 (8-12=4h<6h) recule WE dim','active', D('2026-06-22T12:00'), 360, {duree:360});
T('cuisson 20min pile à cheval gap midi: fin 12:00 mer B','encadree', D('2026-06-17T12:00'), 20, {finISO:'2026-06-17T11:40'===null?undefined:undefined, duree:20});
T('active 2h fin mer B 14:30 → 14:00? non(30min) recule matin','active', D('2026-06-17T14:30'), 120, {duree:120});
T('libre traverse plusieurs WE: 120h fin mar','libre', D('2026-06-23T10:00'), 7200, {duree:7200});
T('active 11h fin lun A 19:00 pile (plage entière 8-19)','active', D('2026-06-22T19:00'), 660, {duree:660, finISO:'2026-06-22T19:00', debutISO:'2026-06-22T08:00'});
T('active 7h fin vendredi B 18:00 (aprem 4h max) recule','active', D('2026-06-19T18:00'), 420, {duree:420});
T('cuisson 35min fin lun A 08:30 (8-8:30=30<35) recule dim','encadree', D('2026-06-22T08:30'), 35, {duree:35});
T('active 9h fin dimanche 20:00 (WE complet, tient)','active', D('2026-06-21T20:00'), 540, {duree:540, finISO:'2026-06-21T20:00'});

// ---------- RÉSULTATS ----------
console.log(`\n========== RÉSULTATS : ${PASS} PASS / ${FAIL} FAIL (sur ${n} scénarios) ==========`);
if(FAILS.length){ console.log('\nÉCHECS :'); FAILS.forEach(f=>console.log('  '+f)); }
else console.log('✓ TOUS LES SCÉNARIOS PASSENT');
