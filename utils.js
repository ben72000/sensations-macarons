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
// Libellé lisible d'un mois 'YYYY-MM' → « juin 2026 ».
function monthLabel(k){
  if(!k) return '—';
  const [y,m]=k.split('-'); const noms=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  return `${noms[(+m)-1]||m} ${y}`;
}

// --- Texte ---
const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function normTxt(s){ return (s==null?'':String(s)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

// --- UI : bloc repliable réutilisable ---
// Affiche les `show` premiers éléments d'une liste HTML, masque le reste derrière un
// chevron « Voir les N autres ▾ ». Fluidifie les longues listes verticales.
// - items : tableau de chaînes HTML (chaque entrée = un bloc déjà formaté)
// - show  : nombre d'éléments visibles par défaut (ex. 5, ou 1)
// - opts  : { moreLabel:(n)=>texte, lessLabel:texte }
// Chaque élément est enveloppé dans un <div> ; pour des lignes de tableau, utiliser
// collapseRows() à la place.
let _collapseSeq = 0;
function collapseList(items, show, opts){
  opts = opts || {}; items = items || [];
  const total = items.length;
  if(total <= show) return items.join('');
  const id = 'clp'+(++_collapseSeq);
  const head = items.slice(0, show).join('');
  const restWrapped = items.slice(show).map(h=>`<div class="collapse-more">${h}</div>`).join('');
  const nMore = total - show;
  const moreTxt = opts.moreLabel ? opts.moreLabel(nMore) : `Voir les ${nMore} autre(s)`;
  const lessTxt = opts.lessLabel || 'Voir moins';
  const toggle = `<button type="button" class="collapse-toggle" onclick="collapseToggle('${id}', this)">`
    + `<span class="chev">▾</span><span class="clp-txt" data-more="${esc(moreTxt)}" data-less="${esc(lessTxt)}">${esc(moreTxt)}</span></button>`;
  return `<div class="collapse-block" id="${id}">${head}${restWrapped}${toggle}</div>`;
}
// Variante pour les LIGNES de tableau (<tr>) : renvoie {visible, hidden, toggleRow}
// à insérer dans un <tbody>. Le toggle est une ligne <tr> pleine largeur.
function collapseRows(rows, show, colspan, opts){
  opts = opts || {}; rows = rows || [];
  const total = rows.length;
  if(total <= show) return rows.join('');
  const id = 'clp'+(++_collapseSeq);
  const head = rows.slice(0, show).join('');
  // chaque ligne masquée reçoit la classe collapse-more (ajoutée à son <tr>)
  const hidden = rows.slice(show).map(r=>r.replace(/^(\s*)<tr/, '$1<tr class="collapse-more"')).join('');
  const nMore = total - show;
  const moreTxt = opts.moreLabel ? opts.moreLabel(nMore) : `Voir les ${nMore} autre(s)`;
  const lessTxt = opts.lessLabel || 'Voir moins';
  const toggle = `<tr class="clp-toggle-row"><td colspan="${colspan||1}" style="text-align:center;padding:6px">`
    + `<button type="button" class="collapse-toggle" onclick="collapseToggle('${id}', this)">`
    + `<span class="chev">▾</span><span class="clp-txt" data-more="${esc(moreTxt)}" data-less="${esc(lessTxt)}">${esc(moreTxt)}</span></button></td></tr>`;
  return `<tbody class="collapse-block" id="${id}">${head}${hidden}${toggle}</tbody>`;
}
function collapseToggle(id, btn){
  const el = document.getElementById(id); if(!el) return;
  el.classList.toggle('open');
  const open = el.classList.contains('open');
  const txt = btn.querySelector('.clp-txt'); if(!txt) return;
  txt.textContent = open ? (txt.dataset.less||'Voir moins') : (txt.dataset.more||'Voir plus');
}
