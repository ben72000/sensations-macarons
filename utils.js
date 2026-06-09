/* ============================================================
   utils.js — Fonctions utilitaires PURES de Sensations Macarons
   ------------------------------------------------------------
   Helpers mathématiques, de formatage (argent, quantités, dates,
   texte) sans aucune dépendance au DOM ni à l'état de l'application.
   Chargé AVANT app.js : ces fonctions restent globales (window),
   exactement comme avant — aucun changement de comportement.
   Première étape d'une mise en ordre progressive du code.
   ============================================================ */

// --- Arrondis stricts (évitent la dérive des flottants : 0.1+0.2, FIFO répétés) ---
// money2 : arrondi au centime. round3 : quantités de stock (3 décimales).
const money2 = n => Math.round(((+n)||0)*100)/100;
const round3 = n => Math.round(((+n)||0)*1000)/1000;

// --- Opérations financières / stocks sûres (toujours ré-arrondies) ---
const addMoney = (...xs) => money2(xs.reduce((s,x)=>s+((+x)||0),0));
const subMoney = (a,b) => money2(((+a)||0)-((+b)||0));
const mulMoney = (a,b) => money2(((+a)||0)*((+b)||0));
const addQty = (...xs) => round3(xs.reduce((s,x)=>s+((+x)||0),0));
const subQty = (a,b) => round3(((+a)||0)-((+b)||0));

// --- Dates / heures ---
const today = () => new Date().toISOString().slice(0,10);
function fmtTime(iso){
  if(!iso) return '';
  const d=new Date(iso); if(isNaN(d)) return '';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function fmtDateTime(iso){
  if(!iso) return '—';
  const d=new Date(iso); if(isNaN(d)) return '—';
  const date=d.toLocaleDateString('fr-FR');
  return `${date} à ${fmtTime(iso)}`;
}
function fmtDate(s){ if(!s) return ''; const d = new Date(s); return isNaN(d)?'':d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'2-digit'}); }
function daysTo(s){ if(!s) return null; return Math.ceil((new Date(s) - new Date(today())) / 86400000); }
function monthKey(d){ return (d||'').slice(0,7); }   // 'YYYY-MM'

// --- Texte ---
const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function normTxt(s){ return (s==null?'':String(s)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
