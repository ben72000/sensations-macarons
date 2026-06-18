/* ============================================================
   utils.js — Fonctions utilitaires PURES de Sensations Macarons
   ------------------------------------------------------------
   Helpers mathématiques, de formatage (argent, quantités, dates,
   texte) et d'UI génériques, SANS aucune dépendance au DOM métier
   ni à l'état de l'application (pas de db, getSettings, render…).
   Chargé AVANT app.js : ces fonctions restent globales (window),
   exactement comme avant — aucun changement de comportement.

   Mise en ordre progressive du code (séparation des préoccupations).
   Inventaire actuel :
   • Arrondis / argent / stock : money2, round3, addMoney, subMoney,
     mulMoney, addQty, subQty
   • Dates / heures : today, fmtTime, fmtDateTime, fmtDate, daysTo,
     monthKey, monthLabel
   • Texte : esc, normTxt
   • UI repliable réutilisable : collapseList, collapseRows, collapseToggle
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
// Clé 'AAAA-MM' d'un objet Date en heure LOCALE. À utiliser au lieu de
// date.toISOString().slice(0,7), qui décale d'un mois en fuseau positif (France UTC+1/+2) :
// new Date(2026,5,1).toISOString() → "2026-05-31T22:00Z" → clé "2026-05" au lieu de "2026-06".
function ymOf(d){ if(!(d instanceof Date)||isNaN(d)) return ''; return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
// Libellé lisible d'un mois 'YYYY-MM' → « juin 2026 ».
function monthLabel(k){
  if(!k) return '—';
  const [y,m]=k.split('-'); const noms=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  return `${noms[(+m)-1]||m} ${y}`;
}

// --- Texte ---
const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function normTxt(s){ return (s==null?'':String(s)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

// --- Parfums : couleur de pastille (identiques à la boutique en ligne) ---
// Correspondance nom de parfum → teinte, pour afficher des pastilles cohérentes
// entre le site et l'app de gestion. Comparaison insensible à la casse/accents.
const FLAVOR_COLORS = {
  'citron cremeux':'#f3df8a', 'chocolat au lait':'#b98756', 'chocolat noir':'#6a4630',
  'framboise':'#d76b86', 'vanille':'#efe3c4', 'pistache':'#9bc081',
  'coco rafaello':'#f3ece0', 'cannelle noisette':'#c79a6a', 'caramel beurre sale':'#cf9a52',
  'chocolat passion':'#d98e4e', 'nocciolata':'#8a5a3c', 'coco citron vert':'#cfe2a5',
  'praline noisettes':'#bd8a55', 'popcorn':'#ecd9a4', 'cafe':'#7d5436'
};
// Renvoie la couleur d'un parfum (gris neutre si inconnu, ex. grand format / parfum libre).
function flavorColor(nom){ return FLAVOR_COLORS[normTxt(nom)] || '#cbb89f'; }

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
