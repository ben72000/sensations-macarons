/* ============================================================
   Sensations Macarons — Pilotage
   Couche données : Dexie.js (IndexedDB) — 100% offline
   ============================================================ */

const db = new Dexie('sensations_macarons');
db.version(1).stores({
  suppliers:       '++id, nom',
  materials:       '++id, nom',
  materialLots:    '++id, materialId, supplierId, dlc, dateReception',
  recipes:         '++id, produitNom',
  recipeItems:     '++id, recipeId, materialId',
  productions:     '++id, recipeId, date',
  prodConsumption: '++id, productionId, materialLotId',
  clients:         '++id, nom',
  orders:          '++id, clientId, date',
  orderItems:      '++id, orderId, productionId',
  events:          '++id, date'
});
// v2 : catalogue de coffrets (offre/produit). Les détails de commande
// (parfums, perso, paiement) sont stockés directement sur l'objet order.
db.version(2).stores({
  products:        '++id, taille'
});
// v3 : index refId sur events (pour la suppression en cascade commande → calendrier)
db.version(3).stores({
  events:          '++id, date, refId'
});

// --------- Catalogue de référence ---------
const FLAVORS = [
  'Citron crémeux','Chocolat au lait','Chocolat noir','Framboise','Vanille',
  'Pistache','Coco Rafaello','Cannelle noisette','Caramel beurre salé',
  'Chocolat passion','Nocciolata','Coco citron vert','Praliné noisettes',
  'Popcorn','Café'
];
const BOX_SIZES = [6, 8, 16, 25];
const BOX_PRICES = { 6: 12, 8: 16, 16: 28, 25: 42 }; // prix de base par taille
const BOX_FLAVOR_LIMIT = { 6: 3, 8: 4, 16: 4, 25: 5 }; // parfums DIFFÉRENTS inclus
const FLAVOR_SURCHARGE = 3;     // € par parfum différent supplémentaire
const ORDER_STATUS = ['À préparer', 'Terminée', 'Livrée'];
const PAY_STATUS = ['En attente', 'Payé'];
const PAY_METHODS = ['Carte', 'Virement', 'Espèces', 'Chèque', 'PayPal'];

// Prestation événement
const EVENT_PRICE = 1.60;       // prix par macaron
const EVENT_MIN = 35;           // quantité minimale
const EQUIP_PRICE = 20;         // location présentoir / pyramide (par unité)
const EVENT_MIN_EQUIP = 1;      // au moins 1 pyramide obligatoire

// Macarons grand format (vente à l'unité), double tarif
const BIG_FORMATS = ['Chocolat', 'Myrtille framboise', 'Mangue passion', 'Madeleine'];
const BIG_PRICE = { pro: 3.20, particulier: 6.00 };

// --------- Helpers ---------
const euro  = n => (+n || 0).toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' €';
// Quantité : arrondit proprement (max 3 décimales) et supprime les zéros parasites
const qty = n => { const v = Math.round((+n||0)*1000)/1000; return v.toLocaleString('fr-FR', {maximumFractionDigits:3}); };
const today = () => new Date().toISOString().slice(0,10);
const esc   = s => (s==null?'':String(s)).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function val(id){ const el = document.getElementById(id); return el ? (el.value||'').trim() : ''; }
function fmtDate(s){ if(!s) return ''; const d = new Date(s); return isNaN(d)?'':d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'2-digit'}); }
function daysTo(s){ if(!s) return null; return Math.ceil((new Date(s) - new Date(today())) / 86400000); }

// --------- Graphique linéaire SVG (sans dépendance) ---------
// series : [{label, points:[{x:'2026-01', y:12.5}], color}]  — x = clé triable
function lineChart(series, opt){
  opt = opt || {};
  const W = opt.w || 640, H = opt.h || 240, pad = {l:48,r:16,t:16,b:34};
  const all = series.flatMap(s=>s.points);
  if(!all.length) return '<div class="empty">Pas encore de données.</div>';
  // axe X = union triée des clés
  const xs = [...new Set(all.map(p=>p.x))].sort();
  const xIdx = {}; xs.forEach((x,i)=>xIdx[x]=i);
  const xPos = i => xs.length<=1 ? pad.l+(W-pad.l-pad.r)/2 : pad.l + i*(W-pad.l-pad.r)/(xs.length-1);
  let ymin = Math.min(...all.map(p=>p.y)), ymax = Math.max(...all.map(p=>p.y));
  if(opt.zero) ymin = Math.min(0,ymin);
  if(ymin===ymax){ ymax = ymin+1; ymin = Math.max(0,ymin-1); }
  const pad2 = (ymax-ymin)*0.12; ymax+=pad2; if(ymin>0) ymin=Math.max(0,ymin-pad2);
  const yPos = v => H-pad.b - (v-ymin)/(ymax-ymin)*(H-pad.t-pad.b);
  // grille + labels Y (4 lignes)
  let grid='';
  for(let i=0;i<=4;i++){
    const v = ymin+(ymax-ymin)*i/4, y=yPos(v);
    grid+=`<line x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}" stroke="#f0eae0"/>`;
    grid+=`<text x="${pad.l-6}" y="${y+3}" text-anchor="end" font-size="10" fill="#9a8a82">${opt.fmt?opt.fmt(v):Math.round(v*100)/100}</text>`;
  }
  // labels X (max ~6)
  const step = Math.ceil(xs.length/6);
  let xlab='';
  xs.forEach((x,i)=>{ if(i%step===0||i===xs.length-1) xlab+=`<text x="${xPos(i)}" y="${H-pad.b+16}" text-anchor="middle" font-size="10" fill="#9a8a82">${esc(opt.xlabel?opt.xlabel(x):x)}</text>`; });
  // courbes
  let paths='';
  series.forEach(s=>{
    const col = s.color||'#AA7C39';
    const pts = s.points.slice().sort((a,b)=>a.x.localeCompare(b.x));
    if(!pts.length) return;
    const d = pts.map((p,i)=>`${i?'L':'M'}${xPos(xIdx[p.x]).toFixed(1)},${yPos(p.y).toFixed(1)}`).join(' ');
    paths+=`<path d="${d}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>`;
    pts.forEach(p=>{ paths+=`<circle cx="${xPos(xIdx[p.x]).toFixed(1)}" cy="${yPos(p.y).toFixed(1)}" r="3.2" fill="${col}"/>`; });
  });
  // légende
  let leg='';
  if(series.length>1 || (series[0]&&series[0].label)){
    leg='<div class="flex" style="gap:16px;margin-top:8px;font-size:.78rem">'+series.map(s=>`<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:14px;height:3px;background:${s.color||'#AA7C39'};display:inline-block;border-radius:2px"></span>${esc(s.label||'')}</span>`).join('')+'</div>';
  }
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${grid}${xlab}${paths}</svg>${leg}`;
}
const ymKey = d => (d||'').slice(0,7);
const ymLabel = ym => { const [y,m]=ym.split('-'); return new Date(y,+m-1,1).toLocaleDateString('fr-FR',{month:'short',year:'2-digit'}); };


// --------- Toast & Modal ---------
let tt;
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(tt); tt=setTimeout(()=>t.classList.remove('show'),2400); }
const overlay=document.getElementById('overlay'), modal=document.getElementById('modal');
function openModal(html){ modal.innerHTML=html; overlay.classList.add('show'); }
function closeModal(){ overlay.classList.remove('show'); modal.innerHTML=''; }
overlay.addEventListener('click', e => { if(e.target===overlay) closeModal(); });

// --------- Router ---------
let view='dash';
const VIEWS = {
  dash:renderDash, clients:renderClients, commandes:renderCmd, produits:renderProducts, cal:renderCal,
  fournisseurs:renderSuppliers, matieres:renderMaterials, recettes:renderRecipes,
  productions:renderProductions, couts:renderCosts, dlc:renderDlc,
  tracabilite:renderTrace, etiquettes:renderLabels, stats:renderStats, analyse:renderAnalyse, previsionnel:renderForecast, assistant:renderAssistant
};
let _navLast=0;
function setActiveView(v){
  document.querySelectorAll('.nav button, .tabbar button, .sheet-grid button').forEach(x=>{
    if(x.dataset && x.dataset.v) x.classList.toggle('active', x.dataset.v===v);
  });
}
function navTo(b){
  if(!b || !b.dataset || !b.dataset.v) return;
  const now=Date.now(); if(now-_navLast<120 && view===b.dataset.v && !document.getElementById('sheetOverlay').classList.contains('show')) return; _navLast=now;
  view=b.dataset.v; setActiveView(view); render();
  closeSheet();
}
function openSheet(){ const o=document.getElementById('sheetOverlay'); if(o){ o.classList.add('show'); setActiveView(view);} }
function closeSheet(){ const o=document.getElementById('sheetOverlay'); if(o) o.classList.remove('show'); }

// Sidebar (iPad / desktop) — écoute directe + délégation
document.querySelectorAll('#nav button').forEach(btn=>{ btn.addEventListener('click', ()=>navTo(btn)); });
const navEl=document.getElementById('nav');
if(navEl) navEl.addEventListener('click', e => { const b=e.target.closest('button'); if(b) navTo(b); });

// Tabbar (iPhone)
document.querySelectorAll('#tabbar button[data-v]').forEach(btn=>{ btn.addEventListener('click', ()=>navTo(btn)); });
const menuBtn=document.getElementById('menuBtn'); if(menuBtn) menuBtn.addEventListener('click', openSheet);

// Feuille menu (iPhone)
document.querySelectorAll('#sheetGrid button[data-v]').forEach(btn=>{ btn.addEventListener('click', ()=>navTo(btn)); });
const sheetOv=document.getElementById('sheetOverlay');
if(sheetOv) sheetOv.addEventListener('click', e=>{ if(e.target===sheetOv) closeSheet(); });

function render(){ (VIEWS[view]||renderDash)(); }

// --------- Stock courant calculé depuis les lots ---------
async function stockParMatiere(materialId){
  const lots = await db.materialLots.where('materialId').equals(materialId).toArray();
  const total = lots.reduce((s,l)=>s+(+l.qteRestante||0),0);
  const actifs = lots.filter(l=>+l.qteRestante>0);
  const dlcMin = actifs.length ? actifs.map(l=>l.dlc).filter(Boolean).sort()[0] : null;
  return { total, dlcMin, nbLots:actifs.length };
}

/* ============================================================
   DASHBOARD
   ============================================================ */
async function renderDash(){
  const now=new Date(), m=now.getMonth(), y=now.getFullYear();
  const [orders, clients, materials, productions, events] = await Promise.all([
    db.orders.toArray(), db.clients.toArray(), db.materials.toArray(),
    db.productions.toArray(), db.events.toArray()
  ]);
  const caMonth = orders.filter(c=>{const d=new Date(c.date);return d.getMonth()===m&&d.getFullYear()===y;}).reduce((s,c)=>s+(+c.montant||0),0);
  const nbMonth = orders.filter(c=>{const d=new Date(c.date);return d.getMonth()===m&&d.getFullYear()===y;}).length;
  const caTotal = orders.reduce((s,c)=>s+(+c.montant||0),0);

  // alertes stock & DLC
  let low=[], dlcAlert=[];
  for(const mat of materials){
    const {total,dlcMin}=await stockParMatiere(mat.id);
    if(total<=(+mat.seuil||0)) low.push({nom:mat.nom,total,unite:mat.unite,seuil:mat.seuil});
    if(dlcMin){ const d=daysTo(dlcMin); if(d!==null && d<=7) dlcAlert.push({nom:mat.nom,dlc:dlcMin,j:d}); }
  }
  const finis = productions.reduce((s,p)=>s+(+p.qteRestante||0),0);

  const upcoming = events.filter(e=>e.date>=today()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4);
  const months=[]; for(let i=5;i>=0;i--){const d=new Date(y,m-i,1);months.push({k:d.toISOString().slice(0,7),l:d.toLocaleDateString('fr-FR',{month:'short'})});}
  const data=months.map(mo=>({...mo,v:orders.filter(c=>c.date&&c.date.slice(0,7)===mo.k).reduce((s,c)=>s+(+c.montant||0),0)}));
  const max=Math.max(...data.map(d=>d.v),1);

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Tableau de bord</h1><p>Vue d'ensemble — ${now.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</p></div></div>
   ${dlcAlert.length?`<div class="banner">⏰ <div><b>DLC proche</b> : ${dlcAlert.map(a=>`${esc(a.nom)} (${a.j<=0?'expiré':a.j+' j'})`).join(' · ')}</div></div>`:''}
   <div class="cards">
     <div class="card"><div class="corner">€</div><div class="lbl">CA ce mois</div><div class="val">${euro(caMonth)}</div><div class="sub">${nbMonth} commande(s)</div></div>
     <div class="card"><div class="corner">∑</div><div class="lbl">CA total</div><div class="val">${euro(caTotal)}</div><div class="sub">depuis le début</div></div>
     <div class="card"><div class="corner">⚙</div><div class="lbl">Macarons en stock</div><div class="val">${finis}</div><div class="sub">${productions.length} batch(s)</div></div>
     <div class="card"><div class="corner">⬛</div><div class="lbl">Alertes stock</div><div class="val">${low.length}</div><div class="sub">matière(s) sous seuil</div></div>
   </div>
   <div class="panel"><h2>Chiffre d'affaires — 6 derniers mois</h2>
     <div class="bar-wrap">${data.map(d=>`<div class="bar-col"><div class="bar-val">${d.v>0?Math.round(d.v):''}</div><div class="bar" style="height:${d.v/max*140}px"></div><div class="bar-lbl">${d.l}</div></div>`).join('')}</div>
   </div>
   <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px">
     <div class="panel"><h2>⚠ Matières à réapprovisionner</h2>
       ${low.length?`<div class="table-wrap"><table><tbody>${low.map(s=>`<tr><td>${esc(s.nom)}</td><td style="text-align:right"><span class="tag low">${qty(s.total)} ${esc(s.unite||'')}</span></td><td style="text-align:right;color:#9a8a82">seuil ${qty(s.seuil)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">Tout est au-dessus du seuil ✓</div>`}
     </div>
     <div class="panel"><h2>Prochaines échéances</h2>
       ${upcoming.length?`<div class="table-wrap"><table><tbody>${upcoming.map(e=>`<tr><td>${fmtDate(e.date)}</td><td>${esc(e.titre)}</td><td style="text-align:right"><span class="tag ${e.type==='cmd'?'todo':'event'}">${e.type==='cmd'?'Commande':'Événement'}</span></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">Aucune échéance à venir</div>`}
     </div>
   </div>`;
}

/* ============================================================
   FOURNISSEURS
   ============================================================ */
async function renderSuppliers(){
  const list = await db.suppliers.orderBy('nom').toArray();
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Fournisseurs</h1><p>${list.length} fournisseur(s)</p></div>
     <button class="btn" onclick="supForm()">+ Nouveau fournisseur</button></div>
   <div class="panel">
   ${list.length?`<div class="table-wrap"><table><thead><tr><th>Nom</th><th>Contact</th><th></th></tr></thead><tbody>
     ${list.map(s=>`<tr><td><b>${esc(s.nom)}</b></td><td style="color:#9a8a82">${esc(s.contact||'')}</td>
       <td style="text-align:right"><span class="act" onclick="supForm(${s.id})">Modifier</span><span class="act del" onclick="delSup(${s.id})">Suppr.</span></td></tr>`).join('')}
   </tbody></table></div>`:`<div class="empty">Aucun fournisseur. Ajoute tes fournisseurs (nut&me, Calconut…).</div>`}
   </div>`;
}
async function supForm(id){
  const s = id ? await db.suppliers.get(id) : {};
  openModal(`<h3>${id?'Modifier':'Nouveau'} fournisseur</h3>
   <div class="field"><label>Nom</label><input id="f_nom" value="${esc(s.nom)}"></div>
   <div class="field"><label>Contact (tél, email, site…)</label><input id="f_contact" value="${esc(s.contact)}"></div>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveSup(${id||0})">Enregistrer</button></div>`);
}
async function saveSup(id){
  const o={nom:val('f_nom'),contact:val('f_contact')};
  if(!o.nom){toast('Nom requis');return;}
  if(id) await db.suppliers.update(id,o); else await db.suppliers.add(o);
  closeModal(); renderSuppliers(); toast('Fournisseur enregistré ✓');
}
async function delSup(id){
  if(!confirm('Supprimer ce fournisseur ?'))return;
  await db.suppliers.delete(id); renderSuppliers(); toast('Supprimé');
}

/* ============================================================
   MATIÈRES & LOTS
   ============================================================ */
let matSearch='';
let _matCache=null, _lotCache=null;
async function renderMaterials(){
  const mats = await db.materials.orderBy('nom').toArray();
  // précalcul du stock par matière (une seule passe sur les lots)
  const allLots = await db.materialLots.toArray();
  const stockBy={}, dlcBy={}, nbBy={};
  allLots.forEach(l=>{ const id=l.materialId; if(!(id in stockBy)){stockBy[id]=0;nbBy[id]=0;}
    const r=+l.qteRestante||0; stockBy[id]+=r;
    if(r>0){ nbBy[id]++; if(l.dlc && (!dlcBy[id]||l.dlc<dlcBy[id])) dlcBy[id]=l.dlc; } });
  _matCache = mats.map(mat=>{
    const total=stockBy[mat.id]||0, dlcMin=dlcBy[mat.id]||null, nbLots=nbBy[mat.id]||0;
    const low = total<=(+mat.seuil||0);
    const prim = normTxt(mat.nom||'');
    const blob = normTxt([mat.nom, mat.unite, mat.ref, low?'à commander':'ok'].filter(Boolean).join(' '));
    return {mat, total, dlcMin, nbLots, low, _prim:prim, _blob:blob, _digits:''};
  });

  const sups = await db.suppliers.toArray();
  const supName = id => (sups.find(s=>s.id===id)||{}).nom||'—';
  const matName = id => (mats.find(s=>s.id===id)||{}).nom||'(supprimée)';
  const matUnit = id => (mats.find(s=>s.id===id)||{}).unite||'';

  // lots récents (cache complet pour recherche, affichage limité par défaut)
  const lots = allLots.slice().sort((a,b)=>(b.dateReception||'').localeCompare(a.dateReception||''));
  _lotCache = lots.map(l=>{
    const prim = normTxt(l.lotFournisseur||'');
    const blob = normTxt([l.lotFournisseur, matName(l.materialId), supName(l.supplierId), fmtDate(l.dateReception), fmtDate(l.dlc)].filter(Boolean).join(' '));
    return {l, matName:matName(l.materialId), supName:supName(l.supplierId), _prim:prim, _blob:blob, _digits:onlyDigits(l.lotFournisseur||'')};
  });

  // Historique consommation (inchangé, non recherché — volume borné à 20)
  const lotById = id => allLots.find(l=>l.id===id);
  const allProds = await db.productions.toArray();
  const prodById = id => allProds.find(p=>p.id===id);
  const recipes = await db.recipes.toArray();
  const recName = id => (recipes.find(r=>r.id===id)||{}).produitNom||'—';
  const conso = await db.prodConsumption.toArray();
  const histo = conso.map(c=>{
    const lot = lotById(c.materialLotId); const prod = prodById(c.productionId);
    return { date: prod?prod.date:'', materialId: lot?lot.materialId:null,
      lotFournisseur: lot?lot.lotFournisseur:'(lot supprimé)', qte: c.qteConsommee,
      produit: prod?recName(prod.recipeId):'(prod. supprimée)', lotProd: prod?prod.lotProduction:'' };
  }).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,20);

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Matières premières & lots</h1><p id="matCount">${mats.length} matière(s)</p></div>
     <div class="flex"><button class="btn gold" onclick="lotForm()">↘ Réception lot</button><button class="btn" onclick="matForm()">+ Matière</button></div></div>
   <div class="panel"><h2>Inventaire (stock = somme des lots actifs)</h2>
     <input class="search" id="matSearch" style="width:100%;margin-bottom:12px" placeholder="Nom de matière, unité, état…" value="${esc(matSearch)}" oninput="matFilter(this.value)" autocomplete="off" autocapitalize="off" autocorrect="off">
   ${mats.length?`<div class="table-wrap"><table><thead><tr><th>Matière</th><th>Stock</th><th>Seuil</th><th>Lots actifs</th><th>DLC la + proche</th><th>État</th><th></th></tr></thead>
     <tbody id="matBody"></tbody></table></div><div id="matEmpty" class="empty" style="display:none">Aucune matière.</div>`:`<div class="empty">Aucune matière. Crée d'abord tes matières (poudre d'amande, sucre…), puis réceptionne des lots.</div>`}
   </div>
   <div class="panel"><h2>Lots réceptionnés</h2>
     <input class="search" id="lotSearch" style="width:100%;margin-bottom:12px" placeholder="N° de lot, matière, fournisseur…" value="${esc(lotSearch)}" oninput="lotFilter(this.value)" autocomplete="off" autocapitalize="off" autocorrect="off">
   ${lots.length?`<div class="table-wrap"><table><thead><tr><th>Réception</th><th>Matière</th><th>N° lot fourn.</th><th>Fournisseur</th><th>Restant / Initial</th><th>DLC</th><th></th></tr></thead>
     <tbody id="lotBody"></tbody></table></div><div id="lotEmpty" class="empty" style="display:none">Aucun lot.</div>`
     :`<div class="empty">Aucun lot réceptionné.</div>`}
   </div>
   <div class="panel"><h2>Dernières matières consommées</h2>
   ${histo.length?`<div class="table-wrap"><table><thead><tr><th>Date prod.</th><th>Matière</th><th>Quantité</th><th>Lot fourn.</th><th>Produit fabriqué</th></tr></thead>
     <tbody>${histo.map(h=>`<tr>
       <td>${fmtDate(h.date)}</td>
       <td><b>${esc(matName(h.materialId))}</b></td>
       <td><span class="tag out">−${qty(h.qte)} ${esc(matUnit(h.materialId))}</span></td>
       <td>${esc(h.lotFournisseur||'—')}</td>
       <td>${esc(h.produit)}${h.lotProd?`<br><span style="color:#9a8a82;font-size:.78rem">${esc(h.lotProd)}</span>`:''}</td></tr>`).join('')}</tbody></table></div>`
     :`<div class="empty">Aucune consommation. Les sorties apparaissent dès qu'une production est lancée.</div>`}
   </div>`;
  matFilter(matSearch);
  lotFilter(lotSearch);
}
function _matRow(row){
  const mat=row.mat; const dj=row.dlcMin?daysTo(row.dlcMin):null;
  return `<tr>
    <td><b>${esc(mat.nom)}</b></td>
    <td>${qty(row.total)} ${esc(mat.unite||'')}</td>
    <td>${qty(mat.seuil||0)} ${esc(mat.unite||'')}</td>
    <td>${row.nbLots}</td>
    <td>${row.dlcMin?`${fmtDate(row.dlcMin)} ${dj!==null&&dj<=7?`<span class="tag warn">${dj<=0?'expiré':dj+' j'}</span>`:''}`:'—'}</td>
    <td><span class="tag ${row.low?'low':'ok'}">${row.low?'À commander':'OK'}</span></td>
    <td style="text-align:right">
      <span class="act" onclick="lotForm(0,${mat.id})">+ Lot</span>
      <span class="act" onclick="matForm(${mat.id})">Modifier</span>
      <span class="act del" onclick="delMat(${mat.id})">Suppr.</span></td></tr>`;
}
function _lotRow(row){
  const l=row.l;
  return `<tr>
    <td>${fmtDate(l.dateReception)}</td><td>${esc(row.matName)}</td>
    <td>${esc(l.lotFournisseur||'—')}</td><td>${esc(row.supName)}</td>
    <td>${qty(l.qteRestante)} / ${qty(l.qteInitiale)}</td><td>${fmtDate(l.dlc)}</td>
    <td style="text-align:right"><span class="act del" onclick="delLot(${l.id})">Suppr.</span></td></tr>`;
}
function matFilter(q){
  matSearch=q||'';
  if(!_matCache) return;
  searchRenderBody('matBody','matCount','matEmpty', _matCache, q, _matRow, 7, 'matière(s)');
}
let lotSearch='';
function lotFilter(q){
  lotSearch=q||'';
  if(!_lotCache) return;
  searchRenderBody('lotBody','__noop','lotEmpty', _lotCache, q, _lotRow, 7, 'lot(s)');
}
async function matForm(id){
  const s = id ? await db.materials.get(id) : {unite:'kg'};
  openModal(`<h3>${id?'Modifier':'Nouvelle'} matière</h3>
   <div class="field"><label>Nom</label><input id="f_nom" value="${esc(s.nom)}"></div>
   <div class="row2">
     <div class="field"><label>Unité</label><select id="f_unite">${['kg','g','L','mL','unité','sachet'].map(u=>`<option ${s.unite===u?'selected':''}>${u}</option>`).join('')}</select></div>
     <div class="field"><label>Seuil d'alerte</label><input type="number" step="0.01" id="f_seuil" value="${s.seuil||0}"></div>
   </div>
   <div class="field"><label>Prix indicatif / unité (€)</label><input type="number" step="0.01" id="f_prix" value="${s.prixDefaut||0}"></div>
   <p class="note">Le stock réel se gère par <b>lots</b> (bouton « Réception lot »). Ici tu définis seulement la matière et son seuil.</p>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveMat(${id||0})">Enregistrer</button></div>`);
}
async function saveMat(id){
  const o={nom:val('f_nom'),unite:val('f_unite'),seuil:+val('f_seuil')||0,prixDefaut:+val('f_prix')||0};
  if(!o.nom){toast('Nom requis');return;}
  if(id){
    // S3 : interdire le changement d'unité si la matière est déjà utilisée (lots ou recettes)
    const prev = await db.materials.get(id);
    if(prev && prev.unite && prev.unite!==o.unite){
      const nbLots = (await db.materialLots.where('materialId').equals(id).toArray()).length;
      const nbItems = (await db.recipeItems.where('materialId').equals(id).toArray()).length;
      if(nbLots || nbItems){
        toast(`Unité verrouillée : ${nbLots} lot(s) et ${nbItems} recette(s) utilisent « ${prev.unite} »`);
        return;
      }
    }
    await db.materials.update(id,o);
  } else {
    await db.materials.add(o);
  }
  closeModal(); renderMaterials(); toast('Matière enregistrée ✓');
}
async function delMat(id){
  if(!confirm('Supprimer cette matière et ses lots ?'))return;
  await db.transaction('rw',db.materials,db.materialLots,async()=>{
    await db.materialLots.where('materialId').equals(id).delete();
    await db.materials.delete(id);
  });
  renderMaterials(); toast('Supprimée');
}
async function lotForm(_id, presetMat){
  const mats = await db.materials.toArray();
  const sups = await db.suppliers.toArray();
  if(!mats.length){toast('Crée d\'abord une matière');return;}
  const matOpts = mats.map(m=>`<option value="${m.id}" data-unite="${esc(m.unite)}" ${presetMat===m.id?'selected':''}>${esc(m.nom)} (${esc(m.unite)})</option>`).join('');
  const supOpts = `<option value="0">— non précisé —</option>`+sups.map(s=>`<option value="${s.id}">${esc(s.nom)}</option>`).join('');
  openModal(`<h3>Réception d'un lot</h3>
   <div class="field"><label>Matière</label><select id="f_mat" onchange="majPrixUnit()">${matOpts}</select></div>
   <div class="row2">
     <div class="field"><label>Fournisseur</label><select id="f_sup">${supOpts}</select></div>
     <div class="field"><label>N° lot fournisseur</label><input id="f_lotf" placeholder="ex: NM-2026-0142"></div>
   </div>
   <div class="row2">
     <div class="field"><label>Quantité reçue</label><input type="number" step="0.01" id="f_qte" value="1" oninput="majPrixUnit()"></div>
     <div class="field"><label>Prix total payé (€)</label><input type="number" step="0.01" id="f_prix" value="0" oninput="majPrixUnit()"></div>
   </div>
   <div class="field"><label>Prix unitaire</label><div id="f_pu" style="padding:10px 12px;background:var(--creme-2);border-radius:10px;font-weight:600;color:var(--bordeaux)">—</div></div>
   <div class="row2">
     <div class="field"><label>Date réception</label><input type="date" id="f_date" value="${today()}"></div>
     <div class="field"><label>DLC / DDM</label><input type="date" id="f_dlc"></div>
   </div>
   <p class="note">Chaque réception crée un lot tracé. Le <b>prix unitaire</b> est calculé automatiquement et alimente le suivi des prix et de la rentabilité. La production puise dans les lots par <b>DLC la plus proche d'abord (FIFO)</b>.</p>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn gold" onclick="saveLot()">Réceptionner</button></div>`);
  majPrixUnit();
}
function majPrixUnit(){
  const q=+val('f_qte'), p=+val('f_prix');
  const el=document.getElementById('f_pu'); if(!el)return;
  const sel=document.getElementById('f_mat');
  const unite = sel && sel.options[sel.selectedIndex] ? (sel.options[sel.selectedIndex].dataset.unite||'') : '';
  if(q>0 && p>0){ el.textContent = euro(p/q)+' / '+unite; }
  else { el.textContent='—'; }
}
async function saveLot(){
  const qte=+val('f_qte');
  if(!qte||qte<=0){toast('Quantité invalide');return;}
  const prix=+val('f_prix')||0;
  const o={
    materialId:+val('f_mat'), supplierId:+val('f_sup')||0,
    lotFournisseur:val('f_lotf'), qteInitiale:qte, qteRestante:qte,
    prix, prixUnitaire: qte>0 ? prix/qte : 0,
    dateReception:val('f_date')||today(), dlc:val('f_dlc')||''
  };
  await db.materialLots.add(o);
  closeModal(); renderMaterials(); toast('Lot réceptionné ✓');
}
async function delLot(id){
  // S1 : un lot consommé par une production ne peut pas être supprimé (traçabilité HACCP)
  const conso = await db.prodConsumption.where('materialLotId').equals(id).toArray();
  if(conso.length){
    const prods = await db.productions.toArray();
    const lots = prods.filter(p=>conso.some(c=>c.productionId===p.id)).map(p=>p.lotProduction||('batch '+p.id));
    openModal(`<h3>Suppression impossible</h3>
      <div class="banner" style="background:#f6e3e0;border-color:var(--red);color:#7a2a20">⛔ <div>Ce lot a été consommé par ${conso.length} production(s) : <b>${esc([...new Set(lots)].join(', '))}</b>.</div></div>
      <p class="note">Pour préserver la traçabilité réglementaire (HACCP), un lot déjà utilisé en production ne peut pas être supprimé. Son historique de consommation doit rester intact.</p>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Compris</button></div>`);
    return;
  }
  if(!confirm('Supprimer ce lot ? (Aucune production ne l\'utilise.)'))return;
  await db.materialLots.delete(id); renderMaterials(); toast('Lot supprimé');
}

/* ============================================================
   RECETTES (BOM)
   ============================================================ */
async function renderRecipes(){
  const recipes = await db.recipes.orderBy('produitNom').toArray();
  const mats = await db.materials.toArray();
  const matName = id => (mats.find(m=>m.id===id)||{}).nom||'(supprimée)';
  const matUnit = id => (mats.find(m=>m.id===id)||{}).unite||'';
  const blocks=[];
  for(const r of recipes){
    const items = await db.recipeItems.where('recipeId').equals(r.id).toArray();
    blocks.push(`<div class="panel"><h2>${esc(r.produitNom)} <span style="font-weight:400;font-size:.85rem;color:#9a8a82">— rendement ${r.rendement} / batch</span>
      <span><span class="act" onclick="recForm(${r.id})">Modifier</span><span class="act del" onclick="delRec(${r.id})">Suppr.</span></span></h2>
      ${items.length?`<div class="table-wrap"><table><thead><tr><th>Matière</th><th>Quantité / batch</th></tr></thead><tbody>
        ${items.map(it=>`<tr><td>${esc(matName(it.materialId))}</td><td>${qty(it.qteParBatch)} ${esc(matUnit(it.materialId))}</td></tr>`).join('')}
      </tbody></table></div>`:`<div class="empty">Aucun ingrédient défini.</div>`}</div>`);
  }
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Recettes (BOM)</h1><p>${recipes.length} recette(s) — nomenclature matières</p></div>
     <button class="btn" onclick="recForm()">+ Nouvelle recette</button></div>
   ${recipes.length?blocks.join(''):`<div class="panel"><div class="empty">Aucune recette. Une recette définit les matières consommées par batch (le « Bill of Materials »).</div></div>`}`;
}
let bomDraft=[];
async function recForm(id){
  const mats = await db.materials.toArray();
  if(!mats.length){toast('Crée d\'abord des matières');return;}
  let r={produitNom:'',rendement:60};
  bomDraft=[];
  if(id){ r=await db.recipes.get(id); bomDraft=(await db.recipeItems.where('recipeId').equals(id).toArray()).map(it=>({materialId:it.materialId,qteParBatch:it.qteParBatch})); }
  window._matsCache=mats;
  openModal(`<h3>${id?'Modifier':'Nouvelle'} recette</h3>
   <div class="row2">
     <div class="field"><label>Nom du produit</label><input id="f_nom" value="${esc(r.produitNom)}" placeholder="Macaron vanille"></div>
     <div class="field"><label>Rendement (nb par batch)</label><input type="number" id="f_rend" value="${r.rendement||60}"></div>
   </div>
   <div class="field"><label>Composition (par batch)</label><div id="bomList"></div>
     <button class="btn ghost sm" style="margin-top:6px" onclick="bomAdd()">+ Ajouter une matière</button></div>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveRec(${id||0})">Enregistrer</button></div>`);
  drawBom();
}
function drawBom(){
  const mats=window._matsCache||[];
  document.getElementById('bomList').innerHTML = bomDraft.map((b,i)=>`
    <div class="bom-line">
      <select onchange="bomDraft[${i}].materialId=+this.value">
        ${mats.map(m=>`<option value="${m.id}" ${b.materialId===m.id?'selected':''}>${esc(m.nom)} (${esc(m.unite)})</option>`).join('')}
      </select>
      <input type="number" step="0.001" value="${b.qteParBatch}" oninput="bomDraft[${i}].qteParBatch=+this.value" placeholder="qté">
      <span style="font-size:.75rem;color:#9a8a82">/ batch</span>
      <span class="x" onclick="bomDel(${i})">×</span>
    </div>`).join('') || '<p class="note">Aucune matière ajoutée.</p>';
}
function bomAdd(){ const mats=window._matsCache||[]; bomDraft.push({materialId:mats[0].id,qteParBatch:1}); drawBom(); }
function bomDel(i){ bomDraft.splice(i,1); drawBom(); }
async function saveRec(id){
  const rend=+val('f_rend');
  if(!rend || rend<=0){toast('Le rendement doit être supérieur à 0');return;}
  const o={produitNom:val('f_nom'),rendement:rend};
  if(!o.produitNom){toast('Nom requis');return;}
  if(!bomDraft.length){toast('Ajoute au moins une matière');return;}
  await db.transaction('rw',db.recipes,db.recipeItems,async()=>{
    let rid=id;
    if(id){ await db.recipes.update(id,o); await db.recipeItems.where('recipeId').equals(id).delete(); }
    else { rid=await db.recipes.add(o); }
    for(const b of bomDraft) await db.recipeItems.add({recipeId:rid,materialId:b.materialId,qteParBatch:b.qteParBatch});
  });
  closeModal(); renderRecipes(); toast('Recette enregistrée ✓');
}
async function delRec(id){
  if(!confirm('Supprimer cette recette ?'))return;
  await db.transaction('rw',db.recipes,db.recipeItems,async()=>{
    await db.recipeItems.where('recipeId').equals(id).delete();
    await db.recipes.delete(id);
  });
  renderRecipes(); toast('Supprimée');
}

/* ============================================================
   PRODUCTIONS  (cœur de la traçabilité : consommation FIFO)
   ============================================================ */
async function renderProductions(){
  const prods = await db.productions.orderBy('date').reverse().toArray();
  const recipes = await db.recipes.toArray();
  const recName = id => (recipes.find(r=>r.id===id)||{}).produitNom||'(recette supprimée)';
  const ecartTag = p => {
    const e = (p.ecart!=null) ? +p.ecart : 0;
    if(!e) return '<span class="tag ok">conforme</span>';
    return `<span class="tag ${e<0?'warn':'event'}">${e>0?'+':''}${qty(e)}</span>`;
  };
  // résumé rendement global (somme réel / somme théorique sur les batchs renseignés)
  const withBoth = prods.filter(p=>p.qteTheorique>0 && p.qteReelle!=null);
  const sumTh = withBoth.reduce((s,p)=>s+(+p.qteTheorique||0),0);
  const sumRe = withBoth.reduce((s,p)=>s+(+p.qteReelle||0),0);
  const rendePct = sumTh ? Math.round(sumRe/sumTh*1000)/10 : null;
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Productions</h1><p>${prods.length} batch(s) fabriqué(s)${rendePct!=null?` · rendement réel global ${rendePct}%`:''}</p></div>
     <button class="btn gold" onclick="prodForm()">⚙ Nouvelle production</button></div>
   <div class="panel">
   ${prods.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Produit</th><th>N° lot prod.</th><th>Théo.</th><th>Réel</th><th>Écart</th><th>Restant</th><th></th></tr></thead><tbody>
     ${prods.map(p=>{
       const th = (p.qteTheorique!=null)?p.qteTheorique:p.qteProduite;
       const re = (p.qteReelle!=null)?p.qteReelle:p.qteProduite;
       return `<tr>
       <td>${fmtDate(p.date)}</td><td><b>${esc(recName(p.recipeId))}</b></td>
       <td>${esc(p.lotProduction||'—')}</td>
       <td>${qty(th)}</td><td><b>${qty(re)}</b></td><td>${ecartTag(p)}</td>
       <td>${qty(p.qteRestante)}</td>
       <td style="text-align:right"><span class="act" onclick="prodAdjustForm(${p.id})">Ajuster réel</span><span class="act" onclick="traceProd(${p.id})">Traçabilité</span><span class="act" onclick="view='etiquettes';document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.v==='etiquettes'));renderLabels()">Étiquette</span><span class="act del" onclick="delProd(${p.id})">Suppr.</span></td></tr>`;}).join('')}
   </tbody></table></div>`:`<div class="empty">Aucune production. Une production consomme les matières selon la quantité <b>théorique</b> (FIFO par DLC) ; le stock de produits finis suit la quantité <b>réelle</b>.</div>`}
   </div>`;
}
async function prodForm(){
  const recipes = await db.recipes.toArray();
  if(!recipes.length){toast('Crée d\'abord une recette');return;}
  _prodReelTouched=false;
  const opts = recipes.map(r=>`<option value="${r.id}" data-rend="${r.rendement}">${esc(r.produitNom)} (${r.rendement}/batch)</option>`).join('');
  openModal(`<h3>Nouvelle production</h3>
   <div class="field"><label>Recette</label><select id="f_rec" onchange="prodSyncTheorique()">${opts}</select></div>
   <div class="row2">
     <div class="field"><label>Quantité théorique (batch) <span style="color:#9a8a82;font-weight:400">— base matières</span></label>
       <input type="number" id="f_qte" value="${recipes[0].rendement}" min="1" oninput="prodSyncReelDefault()"></div>
     <div class="field"><label>Date</label><input type="date" id="f_date" value="${today()}"></div>
   </div>
   <div class="field"><label>Quantité réelle produite <span style="color:#9a8a82;font-weight:400">— stock produits finis (modifiable en fin de production)</span></label>
     <input type="number" id="f_qtereel" value="${recipes[0].rendement}" min="0" oninput="_prodReelTouched=true;prodUpdateEcartHint()">
     <p class="note" id="ecartHint" style="margin-top:4px;display:none"></p></div>
   <div class="row2">
     <div class="field"><label>N° lot de production</label><input id="f_lot" value="L-${today().replace(/-/g,'')}-${Math.random().toString(36).slice(2,5).toUpperCase()}"></div>
     <div class="field"><label>DLC produit fini</label><input type="date" id="f_dlcprod" value=""></div>
   </div>
   <p class="note">Les <b>matières premières</b> sont déduites sur la base de la <b>quantité théorique</b> (DLC la plus proche d'abord). Le <b>stock de produits finis</b> est calé sur la <b>quantité réelle</b>. L'écart est historisé. Si le stock matières est insuffisant, <b>rien</b> n'est enregistré.</p>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn gold" onclick="saveProd()">Lancer la production</button></div>`);
  prodSyncReelDefault();
}
// Quand on change de recette, recale les deux quantités sur le rendement de la recette.
function prodSyncTheorique(){
  const sel=document.getElementById('f_rec'); if(!sel) return;
  const rend=+sel.options[sel.selectedIndex]?.dataset.rend || 0;
  const th=document.getElementById('f_qte'), re=document.getElementById('f_qtereel');
  if(th && rend){ th.value=rend; }
  if(re && rend){ re.value=rend; }
  prodSyncReelDefault();
}
// Tant que l'utilisateur n'a pas touché la quantité réelle, on la garde égale au théorique
// et on affiche l'écart en direct.
let _prodReelTouched=false;
function prodSyncReelDefault(){
  const th=+(document.getElementById('f_qte')?.value)||0;
  const re=document.getElementById('f_qtereel');
  if(re && !_prodReelTouched){ re.value=th; }
  prodUpdateEcartHint();
}
function prodUpdateEcartHint(){
  const th=+(document.getElementById('f_qte')?.value)||0;
  const re=+(document.getElementById('f_qtereel')?.value)||0;
  const hint=document.getElementById('ecartHint'); if(!hint) return;
  const e=re-th;
  if(!th || e===0){ hint.style.display='none'; return; }
  hint.style.display='block';
  hint.style.color = e<0 ? 'var(--red,#b3261e)' : '#3f7d52';
  const pct = th? (e/th*100):0;
  hint.textContent = `Écart : ${e>0?'+':''}${qty(e)} pièce(s) (${e>0?'+':''}${Math.round(pct)}%) — ${e<0?'perte / casse':'surplus de rendement'}. Sans impact sur les matières.`;
}
async function saveProd(){
  const recipeId=+val('f_rec');
  const qteTheorique=+val('f_qte');
  let qteReelle=val('f_qtereel');
  qteReelle = qteReelle==='' ? qteTheorique : +qteReelle; // défaut = théorique
  const date=val('f_date')||today(), lot=val('f_lot'), dlcProd=val('f_dlcprod')||'';
  if(!qteTheorique||qteTheorique<=0){toast('Quantité théorique invalide');return;}
  if(qteReelle<0||isNaN(qteReelle)){toast('Quantité réelle invalide');return;}
  try{
    await enregistrerProduction(recipeId, qteTheorique, qteReelle, date, lot, dlcProd);
    closeModal(); renderProductions();
    const ecart=qteReelle-qteTheorique;
    toast(ecart===0 ? 'Production enregistrée ✓ — stock mis à jour'
      : `Production enregistrée ✓ — écart ${ecart>0?'+':''}${qty(ecart)} historisé`);
  }catch(err){
    toast(err.message || 'Erreur production');
  }
}
// Transaction atomique : consommation FIFO (théorique) + traçabilité + stock fini (réel)
async function enregistrerProduction(recipeId, qteTheorique, qteReelle, dateProd, lotProduction, dlcProduit){
  return db.transaction('rw',
    db.recipes, db.recipeItems, db.materials, db.materialLots, db.productions, db.prodConsumption,
    async () => {
      const recette = await db.recipes.get(recipeId);
      if(!recette) throw new Error('Recette introuvable');
      const items = await db.recipeItems.where('recipeId').equals(recipeId).toArray();
      // CONSOMMATION MATIÈRES : basée UNIQUEMENT sur la quantité théorique
      const facteur = qteTheorique / (recette.rendement || 1);

      // Vérif préalable : tout le stock nécessaire est-il disponible ?
      for(const item of items){
        const lots = await db.materialLots.where('materialId').equals(item.materialId).and(l=>+l.qteRestante>0).toArray();
        const dispo = lots.reduce((s,l)=>s+(+l.qteRestante),0);
        const besoin = item.qteParBatch * facteur;
        if(dispo + 1e-9 < besoin){
          const mat = await db.materials.get(item.materialId);
          throw new Error(`Stock insuffisant : ${mat?mat.nom:'?'} (besoin ${besoin.toFixed(2)}, dispo ${dispo.toFixed(2)})`);
        }
      }

      const ecart = qteReelle - qteTheorique;
      const prodId = await db.productions.add({
        recipeId, lotProduction, date:dateProd,
        qteTheorique, qteReelle, ecart,
        // STOCK PRODUITS FINIS : calé sur la quantité réelle
        // qteProduite/qteRestante conservés pour compat. (lecture par trace, liaison commandes, analytics)
        qteProduite: qteReelle, qteRestante: qteReelle,
        dlcProduit: dlcProduit||''
      });

      for(const item of items){
        let besoin = item.qteParBatch * facteur;
        const lots = await db.materialLots
          .where('materialId').equals(item.materialId)
          .and(l=>+l.qteRestante>0).toArray();
        lots.sort((a,b)=>(a.dlc||'9999').localeCompare(b.dlc||'9999')); // FIFO par DLC
        for(const lot of lots){
          if(besoin<=1e-9) break;
          const pris = Math.min(besoin, +lot.qteRestante);
          await db.materialLots.update(lot.id, {qteRestante:+lot.qteRestante - pris});
          // T2 : on fige (dénormalise) l'origine pour que la traçabilité survive à toute suppression future
          await db.prodConsumption.add({productionId:prodId, materialLotId:lot.id, qteConsommee:pris,
            snapMaterialId:item.materialId, snapLotFournisseur:lot.lotFournisseur||'',
            snapSupplierId:lot.supplierId||0, snapDlc:lot.dlc||''});
          besoin -= pris;
        }
      }
      return prodId;
    });
}

// AJUSTEMENT DE FIN DE PRODUCTION : réviser la quantité réelle produite.
// - les matières NE sont PAS retouchées (consommation figée sur le théorique)
// - le stock de produits finis est ajusté du delta réel
// - l'écart théorique/réel est ré-historisé
async function prodAdjustForm(id){
  const p = await db.productions.get(id); if(!p){ toast('Production introuvable'); return; }
  const recipe = await db.recipes.get(p.recipeId);
  const th = (p.qteTheorique!=null)?p.qteTheorique:p.qteProduite;
  const re = (p.qteReelle!=null)?p.qteReelle:p.qteProduite;
  // pièces déjà sorties de ce batch (affectées à des commandes) = qteProduite - qteRestante
  const dejaSorti = (+p.qteProduite||0) - (+p.qteRestante||0);
  openModal(`<h3>Ajuster la quantité réelle</h3>
    <p style="margin-bottom:8px"><b>${esc(recipe?recipe.produitNom:'?')}</b> · lot <b>${esc(p.lotProduction||'—')}</b></p>
    <div class="sum-box"><span>Quantité théorique (base matières)</span><b>${qty(th)}</b></div>
    <div class="sum-box"><span>Quantité réelle actuelle</span><b>${qty(re)}</b></div>
    ${dejaSorti>0?`<div class="sum-box"><span>Déjà affecté à des commandes</span><b>${qty(dejaSorti)}</b></div>`:''}
    <div class="field" style="margin-top:10px"><label>Nouvelle quantité réelle produite</label>
      <input type="number" id="f_newreel" value="${re}" min="${dejaSorti}" oninput="prodAdjHint(${th},${dejaSorti})">
      <p class="note" id="adjHint" style="margin-top:4px"></p></div>
    <p class="note">Les matières premières restent inchangées (déjà consommées sur la base théorique). Seul le stock de produits finis et l'écart sont recalculés.</p>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn gold" onclick="prodAdjustReel(${id})">Enregistrer l'ajustement</button></div>`);
  prodAdjHint(th, dejaSorti);
}
function prodAdjHint(th, dejaSorti){
  const v=+(document.getElementById('f_newreel')?.value);
  const hint=document.getElementById('adjHint'); if(!hint) return;
  if(isNaN(v)){ hint.textContent=''; return; }
  if(v<dejaSorti){
    hint.style.color='var(--red,#b3261e)';
    hint.textContent=`Impossible : ${qty(dejaSorti)} pièce(s) sont déjà affectées à des commandes. Minimum ${qty(dejaSorti)}.`;
    return;
  }
  const e=v-th;
  hint.style.color = e<0 ? 'var(--red,#b3261e)' : (e>0?'#3f7d52':'#9a8a82');
  hint.textContent = `Nouvel écart théorique/réel : ${e>0?'+':''}${qty(e)} pièce(s)${e<0?' (perte / casse)':(e>0?' (surplus)':' (conforme)')}.`;
}
async function prodAdjustReel(id){
  const newReel=+val('f_newreel');
  const p = await db.productions.get(id); if(!p){ toast('Production introuvable'); return; }
  if(isNaN(newReel) || newReel<0){ toast('Quantité invalide'); return; }
  const th = (p.qteTheorique!=null)?p.qteTheorique:p.qteProduite;
  const dejaSorti = (+p.qteProduite||0) - (+p.qteRestante||0);
  if(newReel < dejaSorti - 1e-9){
    toast(`Au moins ${qty(dejaSorti)} (déjà affecté à des commandes)`); return;
  }
  // nouveau restant = nouvelle production réelle − ce qui est déjà sorti vers les commandes
  const newRestant = newReel - dejaSorti;
  const ecart = newReel - th;
  await db.productions.update(id, {
    qteReelle:newReel, ecart,
    qteProduite:newReel,     // total réellement produit
    qteRestante:newRestant   // stock fini disponible recalé (matières inchangées)
  });
  closeModal(); renderProductions();
  toast(`Quantité réelle ajustée à ${qty(newReel)} — écart ${ecart>0?'+':''}${qty(ecart)}`);
}
async function delProd(id){
  // Garde-fou : production liée à une commande ?
  const liens = await db.orderItems.where('productionId').equals(id).toArray();
  if(liens.length){
    const orders = await db.orders.toArray();
    const clients = await db.clients.toArray();
    const noms = liens.map(l=>{ const o=orders.find(x=>x.id===l.orderId); const c=o?clients.find(cl=>cl.id===o.clientId):null; return c?c.nom:(o?fmtDate(o.date):'commande'); });
    openModal(`<h3>Suppression impossible</h3>
      <div class="banner" style="background:#f6e3e0;border-color:var(--red);color:#7a2a20">⛔ <div>Cette production est attribuée à ${liens.length} commande(s) : <b>${esc([...new Set(noms)].join(', '))}</b>.</div></div>
      <p class="note">Pour préserver la traçabilité, tu ne peux pas supprimer un batch déjà rattaché à une commande ou un client. Détache-le d'abord depuis la commande concernée (bouton « Lier ») si tu veux vraiment le supprimer.</p>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Compris</button></div>`);
    return;
  }
  // Sinon : proposer le choix de recréditer ou non
  const prod = await db.productions.get(id);
  const conso = await db.prodConsumption.where('productionId').equals(id).toArray();
  const recap = conso.length ? `${conso.length} ligne(s) de matière consommée` : 'aucune matière consommée';
  openModal(`<h3>Supprimer la production</h3>
    <p style="margin-bottom:10px">Batch <b>${esc(prod?prod.lotProduction||'':'')}</b> — ${recap}.</p>
    <p class="note" style="margin-bottom:16px">Souhaites-tu remettre les ingrédients consommés dans leurs lots d'origine (recréditer le stock) ?</p>
    <div class="modal-actions" style="flex-direction:column;gap:8px">
      <button class="btn gold" style="width:100%" onclick="doDelProd(${id},true)">↩ Supprimer ET recréditer le stock</button>
      <button class="btn" style="width:100%" onclick="doDelProd(${id},false)">Supprimer sans recréditer</button>
      <button class="btn ghost" style="width:100%" onclick="closeModal()">Annuler</button>
    </div>`);
}
async function doDelProd(id, recrediter){
  // Re-vérifier le garde-fou (sécurité anti-concurrence)
  const liens = await db.orderItems.where('productionId').equals(id).toArray();
  if(liens.length){ closeModal(); toast('Production liée à une commande — suppression annulée'); renderProductions(); return; }
  await db.transaction('rw',db.productions,db.prodConsumption,db.materialLots,async()=>{
    if(recrediter){
      const conso = await db.prodConsumption.where('productionId').equals(id).toArray();
      for(const c of conso){
        const lot = await db.materialLots.get(c.materialLotId);
        if(lot){ await db.materialLots.update(lot.id, { qteRestante: (+lot.qteRestante||0) + (+c.qteConsommee||0) }); }
      }
    }
    await db.prodConsumption.where('productionId').equals(id).delete();
    await db.productions.delete(id);
  });
  closeModal(); renderProductions(); toast(recrediter?'Production supprimée, stock recrédité ✓':'Production supprimée');
}

/* ============================================================
   COÛTS & PRIX  (évolution prix matières + rentabilité)
   ============================================================ */
// Prix unitaire d'un lot (rétro-compatible si prixUnitaire absent)
function lotPU(l){
  if(l.prixUnitaire!=null && !isNaN(l.prixUnitaire)) return +l.prixUnitaire;
  return (l.qteInitiale>0) ? (+l.prix||0)/l.qteInitiale : 0;
}
// Prix unitaire "courant" d'une matière = dernier lot reçu avec prix > 0
function prixCourant(materialId, lots){
  const ls = lots.filter(l=>l.materialId===materialId && lotPU(l)>0)
                 .sort((a,b)=>(b.dateReception||'').localeCompare(a.dateReception||''));
  return ls.length ? lotPU(ls[0]) : 0;
}
// Coût matière théorique d'une recette (par batch) selon prix courants
function coutRecette(recipeId, items, lots){
  return items.filter(it=>it.recipeId===recipeId)
    .reduce((s,it)=>s + it.qteParBatch * prixCourant(it.materialId, lots), 0);
}

async function renderCosts(){
  const [lots, mats, recipes, recipeItems, productions, conso, orders] = await Promise.all([
    db.materialLots.toArray(), db.materials.toArray(), db.recipes.toArray(),
    db.recipeItems.toArray(), db.productions.toArray(), db.prodConsumption.toArray(), db.orders.toArray()
  ]);
  const matName = id => (mats.find(m=>m.id===id)||{}).nom||'—';
  const matUnit = id => (mats.find(m=>m.id===id)||{}).unite||'';
  const recName = id => (recipes.find(r=>r.id===id)||{}).produitNom||'—';
  const lotById = id => lots.find(l=>l.id===id);
  const prodById = id => productions.find(p=>p.id===id);

  // ---- Graphe 1 : évolution du prix unitaire par matière (moyenne mensuelle des lots reçus) ----
  // construit une série par matière qui a au moins 2 points de prix
  const palette = ['#AA7C39','#52252F','#3f7d52','#b04a3e','#7a4b82','#c6974f','#6e3340'];
  const series=[];
  let ci=0;
  for(const mat of mats){
    const ls = lots.filter(l=>l.materialId===mat.id && lotPU(l)>0);
    if(ls.length<1) continue;
    // moyenne par mois
    const byMonth={};
    ls.forEach(l=>{ const k=ymKey(l.dateReception); (byMonth[k]=byMonth[k]||[]).push(lotPU(l)); });
    const pts = Object.keys(byMonth).sort().map(k=>({x:k, y: byMonth[k].reduce((a,b)=>a+b,0)/byMonth[k].length}));
    if(pts.length>=1){ series.push({label:mat.nom, color:palette[ci%palette.length], points:pts}); ci++; }
  }

  // ---- Tableau prix courant + variation par matière ----
  const priceRows = mats.map(mat=>{
    const ls = lots.filter(l=>l.materialId===mat.id && lotPU(l)>0)
                   .sort((a,b)=>(a.dateReception||'').localeCompare(b.dateReception||''));
    if(!ls.length) return null;
    const first=lotPU(ls[0]), last=lotPU(ls[ls.length-1]);
    const varPct = first>0 ? (last-first)/first*100 : 0;
    return {nom:mat.nom, unite:mat.unite, last, varPct, n:ls.length};
  }).filter(Boolean);

  // ---- Rentabilité : coût matière théorique par recette + marge si prix de vente connu ----
  // On déduit un "prix de vente unitaire" implicite via les commandes liées (montant / pièces) — sinon N/A.
  const recRows = recipes.map(r=>{
    const coutBatch = coutRecette(r.id, recipeItems, lots);
    const coutUnit = r.rendement>0 ? coutBatch/r.rendement : 0;
    return {nom:r.produitNom, rendement:r.rendement, coutBatch, coutUnit};
  });

  // ---- Graphe 2 : évolution de la rentabilité mensuelle ----
  // Par mois : CA (somme commandes) - coût matière réel des productions du mois
  // coût réel d'une production = somme(conso × PU du lot consommé)
  const prodCost = {};
  conso.forEach(c=>{
    const lot=lotById(c.materialLotId); const prod=prodById(c.productionId);
    if(!lot||!prod) return;
    prodCost[prod.id] = (prodCost[prod.id]||0) + c.qteConsommee*lotPU(lot);
  });
  const moisCA={}, moisCout={};
  orders.forEach(o=>{ const k=ymKey(o.date); moisCA[k]=(moisCA[k]||0)+(+o.montant||0); });
  productions.forEach(p=>{ const k=ymKey(p.date); moisCout[k]=(moisCout[k]||0)+(prodCost[p.id]||0); });
  const moisKeys=[...new Set([...Object.keys(moisCA),...Object.keys(moisCout)])].sort();
  const serieCA={label:'CA', color:'#3f7d52', points:moisKeys.map(k=>({x:k,y:moisCA[k]||0}))};
  const serieCout={label:'Coût matière', color:'#b04a3e', points:moisKeys.map(k=>({x:k,y:moisCout[k]||0}))};
  const serieMarge={label:'Marge brute', color:'#AA7C39', points:moisKeys.map(k=>({x:k,y:(moisCA[k]||0)-(moisCout[k]||0)}))};

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Coûts & prix</h1><p>Évolution des prix d'achat et de la rentabilité</p></div></div>

   <div class="panel"><h2>Évolution du prix d'achat unitaire</h2>
     ${series.length?lineChart(series,{fmt:v=>euro(v),xlabel:ymLabel,zero:true}):'<div class="empty">Réceptionne des lots avec un prix pour voir la courbe (au moins un point par matière).</div>'}
     <p class="note">Prix unitaire moyen des lots reçus, par mois. Chaque réception de lot avec un prix alimente cette courbe.</p>
   </div>

   <div class="panel"><h2>Prix courant par matière</h2>
     ${priceRows.length?`<div class="table-wrap"><table><thead><tr><th>Matière</th><th>Prix actuel</th><th>Variation depuis le 1ᵉʳ lot</th><th>Réceptions</th></tr></thead><tbody>
       ${priceRows.map(r=>`<tr><td><b>${esc(r.nom)}</b></td><td>${euro(r.last)} / ${esc(r.unite)}</td>
         <td><span class="tag ${r.varPct>0.5?'low':(r.varPct<-0.5?'ok':'')}">${r.varPct>0?'▲ +':r.varPct<0?'▼ ':''}${r.varPct.toFixed(1)} %</span></td>
         <td>${r.n}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Aucun prix enregistré.</div>'}
   </div>

   <div class="panel"><h2>Coût matière par recette</h2>
     ${recRows.length?`<div class="table-wrap"><table><thead><tr><th>Produit</th><th>Rendement</th><th>Coût matière / batch</th><th>Coût matière / pièce</th></tr></thead><tbody>
       ${recRows.map(r=>`<tr><td><b>${esc(r.nom)}</b></td><td>${r.rendement}</td><td>${euro(r.coutBatch)}</td><td><b>${euro(r.coutUnit)}</b></td></tr>`).join('')}</tbody></table></div>
       <p class="note">Calculé au prix d'achat <b>le plus récent</b> de chaque matière. Compare ce coût/pièce à ton prix de vente pour connaître ta marge.</p>`
       :'<div class="empty">Crée des recettes et réceptionne des lots avec prix pour voir les coûts.</div>'}
   </div>

   <div class="panel"><h2>Rentabilité mensuelle</h2>
     ${moisKeys.length?lineChart([serieCA,serieCout,serieMarge],{fmt:v=>euro(v),xlabel:ymLabel,zero:true}):'<div class="empty">Enregistre des commandes et des productions pour suivre ta rentabilité.</div>'}
     <p class="note">CA = somme des commandes du mois. Coût matière = valeur réelle des matières consommées par les productions du mois (au prix de leur lot). Marge brute = CA − coût matière.</p>
   </div>`;
}

/* ============================================================
   SUIVI DLC PROACTIF
   ============================================================ */
async function renderDlc(){
  const [lots, mats, sups] = await Promise.all([
    db.materialLots.toArray(), db.materials.toArray(), db.suppliers.toArray()
  ]);
  const matName = id => (mats.find(m=>m.id===id)||{}).nom||'(supprimée)';
  const matUnit = id => (mats.find(m=>m.id===id)||{}).unite||'';
  const supName = id => (sups.find(s=>s.id===id)||{}).nom||'—';
  // lots actifs avec DLC renseignée
  const actifs = lots.filter(l=>+l.qteRestante>0 && l.dlc)
    .map(l=>({...l, j:daysTo(l.dlc)}))
    .sort((a,b)=>(a.dlc||'').localeCompare(b.dlc||''));
  const expires = actifs.filter(l=>l.j!==null && l.j<0);
  const urgent  = actifs.filter(l=>l.j!==null && l.j>=0 && l.j<=3);
  const proche  = actifs.filter(l=>l.j!==null && l.j>3 && l.j<=7);
  const ok      = actifs.filter(l=>l.j!==null && l.j>7);
  const sansDlc = lots.filter(l=>+l.qteRestante>0 && !l.dlc);

  const ligne = l => `<tr>
     <td><b>${esc(matName(l.materialId))}</b></td>
     <td>${qty(l.qteRestante)} ${esc(matUnit(l.materialId))}</td>
     <td>${esc(l.lotFournisseur||'—')}</td>
     <td>${esc(supName(l.supplierId))}</td>
     <td>${fmtDate(l.dlc)}</td>
     <td>${l.j<0?`<span class="tag out">expiré (${-l.j} j)</span>`:l.j<=3?`<span class="tag out">J−${l.j}</span>`:l.j<=7?`<span class="tag low">J−${l.j}</span>`:`<span class="tag ok">${l.j} j</span>`}</td>
   </tr>`;

  const bloc = (titre,arr,cls)=> arr.length?`<div class="panel"><h2>${titre} <span class="tag ${cls}">${arr.length}</span></h2>
     <div class="table-wrap"><table><thead><tr><th>Matière</th><th>Restant</th><th>Lot fourn.</th><th>Fournisseur</th><th>DLC</th><th>Échéance</th></tr></thead>
     <tbody>${arr.map(ligne).join('')}</tbody></table></div></div>`:'';

  const total = expires.length+urgent.length+proche.length;
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Suivi DLC</h1><p>Lots actifs classés par urgence</p></div></div>
   ${total?`<div class="banner">⏰ <div><b>${total} lot(s) à surveiller</b> — ${expires.length} expiré(s), ${urgent.length} sous 3 jours, ${proche.length} sous 7 jours. Écoule-les en priorité (la production les utilise déjà en premier via le FIFO).</div></div>`
     :`<div class="banner" style="background:#e3f0e7;border-color:#3f7d52;color:#2f6040">✓ <div>Aucun lot n'arrive à expiration dans les 7 jours.</div></div>`}
   ${bloc('Expirés', expires, 'out')}
   ${bloc('Urgent — sous 3 jours', urgent, 'out')}
   ${bloc('À écouler — sous 7 jours', proche, 'low')}
   ${bloc('Plus de 7 jours', ok, 'ok')}
   ${sansDlc.length?`<div class="panel"><h2>Sans DLC renseignée <span class="tag warn">${sansDlc.length}</span></h2>
     <div class="table-wrap"><table><thead><tr><th>Matière</th><th>Restant</th><th>Lot fourn.</th><th>Réception</th></tr></thead>
     <tbody>${sansDlc.map(l=>`<tr><td><b>${esc(matName(l.materialId))}</b></td><td>${qty(l.qteRestante)} ${esc(matUnit(l.materialId))}</td><td>${esc(l.lotFournisseur||'—')}</td><td>${fmtDate(l.dateReception)}</td></tr>`).join('')}</tbody></table></div>
     <p class="note">Pense à renseigner la DLC à la réception pour activer le suivi.</p></div>`:''}
   ${actifs.length===0&&sansDlc.length===0?'<div class="panel"><div class="empty">Aucun lot actif. Réceptionne des lots pour activer le suivi DLC.</div></div>':''}`;
}

/* ============================================================
   TRAÇABILITÉ
   ============================================================ */
async function renderTrace(){
  const orders = await db.orders.toArray();
  const clients = await db.clients.toArray();
  const clName = id => (clients.find(c=>c.id===id)||{}).nom||'—';
  const prods = await db.productions.orderBy('date').reverse().toArray();
  const recipes = await db.recipes.toArray();
  const recName = id => (recipes.find(r=>r.id===id)||{}).produitNom||'—';
  const lots = await db.materialLots.toArray();
  const mats = await db.materials.toArray();
  const matName = id => (mats.find(m=>m.id===id)||{}).nom||'—';
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Traçabilité</h1><p>Remonter la chaîne fournisseur → lot → batch → commande</p></div></div>
   <div class="banner">⊕ <div>La traçabilité répond à trois questions réglementaires : ingrédients d'une commande, origine d'un batch, et usage d'un lot de matière.</div></div>
   <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px">
     <div class="panel"><h2>Par commande livrée</h2>
       ${orders.length?`<div class="table-wrap"><table><tbody>${orders.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(o=>`<tr>
         <td>${fmtDate(o.date)}</td><td><b>${esc(clName(o.clientId))}</b></td>
         <td style="text-align:right"><span class="act" onclick="traceOrder(${o.id})">Tracer</span></td></tr>`).join('')}</tbody></table></div>`
         :`<div class="empty">Aucune commande.</div>`}
     </div>
     <div class="panel"><h2>Par batch de production</h2>
       ${prods.length?`<div class="table-wrap"><table><tbody>${prods.map(p=>`<tr>
         <td>${fmtDate(p.date)}</td><td><b>${esc(recName(p.recipeId))}</b><br><span style="color:#9a8a82;font-size:.78rem">${esc(p.lotProduction||'')}</span></td>
         <td style="text-align:right"><span class="act" onclick="traceProd(${p.id})">Tracer</span></td></tr>`).join('')}</tbody></table></div>`
         :`<div class="empty">Aucune production.</div>`}
     </div>
   </div>
   <div class="panel" style="margin-top:22px"><h2>Par lot de matière première <span style="font-weight:400;font-size:.82rem;color:#9a8a82">— en cas de rappel fournisseur</span></h2>
     ${lots.length?`<div class="table-wrap"><table><thead><tr><th>Matière</th><th>N° lot fourn.</th><th>Réception</th><th></th></tr></thead><tbody>${lots.sort((a,b)=>(b.dateReception||'').localeCompare(a.dateReception||'')).map(l=>`<tr>
       <td><b>${esc(matName(l.materialId))}</b></td><td>${esc(l.lotFournisseur||'—')}</td><td>${fmtDate(l.dateReception)}</td>
       <td style="text-align:right"><span class="act" onclick="traceLot(${l.id})">Tracer</span></td></tr>`).join('')}</tbody></table></div>`
       :`<div class="empty">Aucun lot.</div>`}
   </div>`;
}

// T3 : d'un lot de matière → toutes les productions, commandes et clients impactés (rappel produit)
async function traceLot(lotId){
  const lot = await db.materialLots.get(lotId);
  if(!lot){ toast('Lot introuvable'); return; }
  const mat = await db.materials.get(lot.materialId);
  const sup = lot.supplierId ? await db.suppliers.get(lot.supplierId) : null;
  const conso = await db.prodConsumption.where('materialLotId').equals(lotId).toArray();
  const orders = await db.orders.toArray();
  const clients = await db.clients.toArray();
  const recipes = await db.recipes.toArray();
  const blocks=[];
  for(const c of conso){
    const prod = await db.productions.get(c.productionId);
    if(!prod){ continue; }
    const rec = recipes.find(r=>r.id===prod.recipeId);
    const oi = await db.orderItems.where('productionId').equals(prod.id).toArray();
    const cmdList = oi.map(it=>{ const o=orders.find(x=>x.id===it.orderId); const cl=o?clients.find(cc=>cc.id===o.clientId):null;
      return `<div style="font-size:.8rem;color:#6a5a52;padding:2px 0">→ ${esc(cl?cl.nom:'—')} · ${it.qte} pièces · ${o?fmtDate(o.date):''}</div>`; });
    blocks.push(`<div class="trace-step"><b>${esc(rec?rec.produitNom:'?')}</b> · batch ${esc(prod.lotProduction||'—')} · ${qty(c.qteConsommee)} ${esc(mat?mat.unite:'')} consommé(s)
      <div style="margin-top:4px">${cmdList.join('')||'<span class="note">Aucune commande servie depuis ce batch.</span>'}</div></div>`);
  }
  openModal(`<h3>Traçabilité — lot de matière</h3>
    <p style="margin-bottom:8px"><b>${esc(mat?mat.nom:'?')}</b> · lot fourn. <b>${esc(lot.lotFournisseur||'—')}</b><br>
    <span style="color:#9a8a82;font-size:.85rem">${esc(sup?sup.nom:'fournisseur non précisé')} · reçu ${fmtDate(lot.dateReception)} · DLC ${fmtDate(lot.dlc)||'—'}</span></p>
    <h3 style="font-size:1rem;margin:14px 0 8px">➡ Produits & clients impactés</h3>
    ${blocks.length?blocks.join(''):'<p class="note">Ce lot n\'a encore été utilisé dans aucune production.</p>'}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`);
}

async function traceProd(prodId){
  const prod = await db.productions.get(prodId);
  const recipe = await db.recipes.get(prod.recipeId);
  const conso = await db.prodConsumption.where('productionId').equals(prodId).toArray();
  const lines=[];
  for(const c of conso){
    const lot = await db.materialLots.get(c.materialLotId);
    if(!lot){
      // T2 : le lot n'existe plus → on s'appuie sur les données figées au moment de la production
      const mat = c.snapMaterialId ? await db.materials.get(c.snapMaterialId) : null;
      const sup = c.snapSupplierId ? await db.suppliers.get(c.snapSupplierId) : null;
      lines.push(`<div class="trace-step"><b>${esc(mat?mat.nom:'Matière')}</b> — ${qty(c.qteConsommee)} ${esc(mat?mat.unite:'')}<br>
        <span style="font-size:.8rem;color:#9a8a82">Lot fourn. ${esc(c.snapLotFournisseur||'—')} · ${esc(sup?sup.nom:'fournisseur non précisé')} · DLC ${fmtDate(c.snapDlc)||'—'} <span class="tag warn">lot archivé</span></span></div>`);
      continue;
    }
    const mat = await db.materials.get(lot.materialId);
    const sup = lot.supplierId ? await db.suppliers.get(lot.supplierId) : null;
    lines.push(`<div class="trace-step"><b>${esc(mat?mat.nom:'?')}</b> — ${qty(c.qteConsommee)} ${esc(mat?mat.unite:'')}<br>
      <span style="font-size:.8rem;color:#9a8a82">Lot fourn. ${esc(lot.lotFournisseur||'—')} · ${esc(sup?sup.nom:'fournisseur non précisé')} · DLC ${fmtDate(lot.dlc)||'—'}</span></div>`);
  }
  // commandes liées
  const oi = await db.orderItems.where('productionId').equals(prodId).toArray();
  const clients = await db.clients.toArray();
  const orders = await db.orders.toArray();
  const cmdLines = oi.map(it=>{
    const o=orders.find(x=>x.id===it.orderId); const cl=o?clients.find(c=>c.id===o.clientId):null;
    return `<div class="trace-step">${cl?esc(cl.nom):'—'} — ${it.qte} pièces · ${o?fmtDate(o.date):''}</div>`;
  });
  openModal(`<h3>Traçabilité — batch</h3>
    <p style="margin-bottom:8px"><b>${esc(recipe?recipe.produitNom:'?')}</b> · lot <b>${esc(prod.lotProduction||'—')}</b> · ${fmtDate(prod.date)}<br>
    <span style="color:#9a8a82;font-size:.85rem">Théorique : ${qty((prod.qteTheorique!=null)?prod.qteTheorique:prod.qteProduite)} · Réel : ${qty((prod.qteReelle!=null)?prod.qteReelle:prod.qteProduite)}${prod.ecart?` · écart ${(+prod.ecart>0?'+':'')}${qty(prod.ecart)}`:''} · Restant : ${qty(prod.qteRestante)}</span></p>
    <h3 style="font-size:1rem;margin:16px 0 8px">⬅ Matières consommées (origine)</h3>
    ${lines.length?lines.join(''):'<p class="note">Aucune consommation enregistrée.</p>'}
    <h3 style="font-size:1rem;margin:18px 0 8px">➡ Commandes servies</h3>
    ${cmdLines.length?cmdLines.join(''):'<p class="note">Ce batch n\'est lié à aucune commande pour l\'instant.</p>'}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button><button class="btn" onclick="exportTraceProd(${prodId})">⬇ Exporter CSV</button></div>`);
}

async function traceOrder(orderId){
  const order = await db.orders.get(orderId);
  const client = order.clientId ? await db.clients.get(order.clientId) : null;
  const items = await db.orderItems.where('orderId').equals(orderId).toArray();
  const blocks=[];
  for(const it of items){
    const prod = await db.productions.get(it.productionId);
    if(!prod){ blocks.push(`<div class="trace-step">Production supprimée</div>`); continue; }
    const recipe = await db.recipes.get(prod.recipeId);
    const conso = await db.prodConsumption.where('productionId').equals(prod.id).toArray();
    const sub=[];
    for(const c of conso){
      const lot = await db.materialLots.get(c.materialLotId);
      if(!lot){
        const mat = c.snapMaterialId ? await db.materials.get(c.snapMaterialId) : null;
        const sup = c.snapSupplierId ? await db.suppliers.get(c.snapSupplierId) : null;
        sub.push(`<div style="font-size:.8rem;color:#6a5a52;padding:2px 0">• ${esc(mat?mat.nom:'Matière')} — lot ${esc(c.snapLotFournisseur||'—')} (${esc(sup?sup.nom:'?')}) <span class="tag warn">archivé</span></div>`);
        continue;
      }
      const mat = await db.materials.get(lot.materialId);
      const sup = lot.supplierId ? await db.suppliers.get(lot.supplierId) : null;
      sub.push(`<div style="font-size:.8rem;color:#6a5a52;padding:2px 0">• ${esc(mat?mat.nom:'?')} — lot ${esc(lot.lotFournisseur||'—')} (${esc(sup?sup.nom:'?')})</div>`);
    }
    blocks.push(`<div class="trace-step"><b>${esc(recipe?recipe.produitNom:'?')}</b> · ${it.qte} pièces · batch ${esc(prod.lotProduction||'—')}
      <div style="margin-top:4px">${sub.join('')||'<span class="note">pas de matières tracées</span>'}</div></div>`);
  }
  openModal(`<h3>Traçabilité — commande</h3>
    <p style="margin-bottom:8px"><b>${client?esc(client.nom):'—'}</b> · ${fmtDate(order.date)} · ${esc(order.statut||'')}</p>
    ${blocks.length?blocks.join(''):'<p class="note">Aucune production liée. Lie cette commande à un ou plusieurs batchs depuis l\'écran Commandes.</p>'}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button><button class="btn" onclick="exportTraceOrder(${orderId})">⬇ Exporter CSV</button></div>`);
}

/* ============================================================
   CLIENTS
   ============================================================ */
let clientSearch='';
let _clientsCache=null;   // {clients, ordersByClient, blob} chargé une seule fois par rendu de page
// Normalisation tolérante : minuscules + suppression des accents
function normTxt(s){ return (s==null?'':String(s)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function onlyDigits(s){ return (s==null?'':String(s)).replace(/[^0-9]/g,''); }

/* ============================================================
   MOTEUR DE RECHERCHE PARTAGÉ (hors-ligne, sans dépendance)
   Utilisé à l'identique par Clients, Commandes, Produits, Stocks, Calendrier.
   - index préconstruit une seule fois par rendu (champ `blob` normalisé)
   - filtrage multi-mots (ET), tolérant casse/accents, correspondance partielle
   - score de pertinence : champ prioritaire > préfixe > début de mot > sous-chaîne
   ============================================================ */
// Calcule un score de pertinence d'un item pour une requête déjà normalisée (terms[]).
// `prim` = chaîne normalisée du champ prioritaire (nom/titre), `blob` = tout le reste inclus.
// Retourne -1 si un terme n'est pas trouvé du tout (donc exclu).
function searchScore(terms, prim, blob, digitsField, qd){
  if(!terms.length && !qd) return 0;
  let score=0;
  for(const t of terms){
    if(!blob.includes(t)){
      // dernier recours : correspondance numérique (téléphone, n° lot/commande)
      if(qd && digitsField && digitsField.includes(qd)) { score+=2; continue; }
      return -1;
    }
    if(prim===t) score+=100;                       // égalité exacte du champ principal
    else if(prim.startsWith(t)) score+=60;         // préfixe du champ principal
    else if(new RegExp('\\b'+escapeRe(t)).test(prim)) score+=40; // début de mot dans le principal
    else if(prim.includes(t)) score+=25;           // sous-chaîne du champ principal
    else if(new RegExp('\\b'+escapeRe(t)).test(blob)) score+=10; // début de mot ailleurs
    else score+=4;                                 // sous-chaîne ailleurs
  }
  // bonus requête numérique correspondant à un identifiant
  if(qd && digitsField && digitsField.includes(qd)) score+=5;
  return score;
}
function escapeRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
// Filtre + trie une liste indexée. items: [{...,_prim,_blob,_digits}]. q: requête brute.
// Retourne les items conservés, triés par pertinence puis ordre d'origine.
function searchRank(items, q){
  const terms = normTxt(q).split(/\s+/).filter(Boolean);
  const qd = onlyDigits(q);
  if(!terms.length && !qd) return items.slice();
  const scored=[];
  for(let i=0;i<items.length;i++){
    const it=items[i];
    const sc=searchScore(terms, it._prim||'', it._blob||'', it._digits||'', qd);
    if(sc>=0) scored.push({it,sc,i});
  }
  scored.sort((a,b)=> b.sc-a.sc || a.i-b.i);
  return scored.map(x=>x.it);
}
// Rendu standard d'un corps de tableau filtré (mise à jour du seul tbody, jamais de la page).
// rowFn: item -> '<tr>…'. cols: nb de colonnes (pour la ligne « +N autres »).
function searchRenderBody(bodyId, countId, emptyId, items, q, rowFn, cols, unitLabel){
  const body=document.getElementById(bodyId); if(!body) return;
  const rows=searchRank(items, q);
  const cnt=document.getElementById(countId);
  if(cnt) cnt.textContent = (q&&q.trim()) ? `${rows.length} / ${items.length} ${unitLabel}` : `${items.length} ${unitLabel}`;
  const empty=document.getElementById(emptyId);
  if(!rows.length){ body.innerHTML=''; if(empty) empty.style.display='block'; return; }
  if(empty) empty.style.display='none';
  const LIMIT=300;
  body.innerHTML = rows.slice(0,LIMIT).map(rowFn).join('') +
    (rows.length>LIMIT?`<tr><td colspan="${cols}" class="note" style="text-align:center">… ${rows.length-LIMIT} autre(s) résultat(s). Affinez la recherche.</td></tr>`:'');
}

async function renderClients(){
  const clients = await db.clients.orderBy('nom').toArray();
  const orders = await db.orders.toArray();
  // pré-calcul : nb commandes + CA + index de recherche par client (fait UNE fois)
  const aggr={};
  for(const o of orders){ const k=o.clientId||0; (aggr[k] ||= {n:0,ca:0}); aggr[k].n++; aggr[k].ca+=(+o.montant||0); }
  _clientsCache = clients.map(c=>{
    const a=aggr[c.id]||{n:0,ca:0};
    const prim = normTxt([c.nom,c.prenom,c.societe].filter(Boolean).join(' '));
    const blob = normTxt([c.nom,c.prenom,c.societe,c.email,c.adresse,c.notes,c.ref,c.type,c.tel].filter(Boolean).join(' '));
    return {c, nb:a.n, ca:a.ca, _prim:prim, _blob:blob, _digits:onlyDigits(c.tel)};
  });
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Clients</h1><p id="clCount">${clients.length} fiche(s)</p></div>
     <div class="flex"><input class="search" id="clSearch" placeholder="Nom, société, téléphone, e-mail, réf, notes…" value="${esc(clientSearch)}" oninput="clientFilter(this.value)" autocomplete="off" autocapitalize="off" autocorrect="off"><button class="btn" onclick="clientForm()">+ Nouveau client</button></div></div>
   <div class="panel">
     <div class="table-wrap"><table><thead><tr><th>Nom</th><th>Type</th><th>Contact</th><th>Cmd</th><th>CA cumulé</th><th></th></tr></thead>
       <tbody id="clBody"></tbody></table></div>
     <div id="clEmpty" class="empty" style="display:none">Aucun client.</div>
   </div>`;
  clientFilter(clientSearch); // remplissage initial du corps uniquement
}
// Construit une ligne <tr> client
function _clientRow(row){
  const c=row.c;
  return `<tr><td><b><span class="link-name" onclick="clientForm(${c.id})">${esc(c.nom)}</span></b></td>
    <td><span class="tag ${c.type==='Pro'?'event':'ok'}">${esc(c.type||'Particulier')}</span></td>
    <td>${esc(c.tel||'')}${c.tel&&c.email?'<br>':''}<span style="color:#9a8a82;font-size:.82rem">${esc(c.email||'')}</span></td>
    <td>${row.nb}</td><td>${euro(row.ca)}</td>
    <td style="text-align:right"><span class="act" onclick="clientForm(${c.id})">Fiche</span><span class="act del" onclick="delClient(${c.id})">Suppr.</span></td></tr>`;
}
// Filtrage instantané : ne touche QUE le corps du tableau (pas de re-render global, pas de relecture DB)
function clientFilter(q){
  clientSearch=q||'';
  if(!_clientsCache) return;
  searchRenderBody('clBody','clCount','clEmpty', _clientsCache, q, _clientRow, 6, 'fiche(s)');
}
async function clientForm(id){
  const c = id ? await db.clients.get(id) : {};
  openModal(`<h3>${id?'Fiche':'Nouveau'} client</h3>
   <div class="field"><label>Nom / Entreprise *</label><input id="f_nom" value="${esc(c.nom)}"></div>
   <div class="row2">
     <div class="field"><label>Prénom</label><input id="f_prenom" value="${esc(c.prenom)}"></div>
     <div class="field"><label>Société</label><input id="f_societe" value="${esc(c.societe)}"></div>
   </div>
   <div class="row2"><div class="field"><label>Type</label><select id="f_type"><option ${c.type==='Particulier'?'selected':''}>Particulier</option><option ${c.type==='Pro'?'selected':''}>Pro</option></select></div>
   <div class="field"><label>Téléphone</label><input id="f_tel" type="tel" inputmode="tel" value="${esc(c.tel)}"></div></div>
   <div class="row2">
     <div class="field"><label>Email</label><input id="f_email" type="email" value="${esc(c.email)}"></div>
     <div class="field"><label>Réf. client</label><input id="f_ref" value="${esc(c.ref)}" placeholder="ex : CLI-0042"></div>
   </div>
   <div class="field"><label>Adresse</label><input id="f_adr" value="${esc(c.adresse)}"></div>
   <div class="field"><label>Notes</label><textarea id="f_notes" rows="2">${esc(c.notes)}</textarea></div>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button><button class="btn" onclick="saveClient(${id||0})">Enregistrer</button></div>`);
}
async function saveClient(id){
  const o={nom:val('f_nom'),prenom:val('f_prenom'),societe:val('f_societe'),type:val('f_type'),tel:val('f_tel'),email:val('f_email'),ref:val('f_ref'),adresse:val('f_adr'),notes:val('f_notes')};
  if(!o.nom){toast('Le nom est requis');return;}
  if(id) await db.clients.update(id,o); else await db.clients.add(o);
  closeModal(); renderClients(); toast('Client enregistré ✓');
}
async function delClient(id){
  if(!confirm('Supprimer ce client ?'))return;
  await db.clients.delete(id); renderClients(); toast('Client supprimé');
}

/* ============================================================
   OFFRE / COFFRETS  (catalogue préenregistré)
   ============================================================ */
let prodSearch='';
let _prodCache=null;
async function renderProducts(){
  const products = (await db.products.toArray()).sort((a,b)=>(+a.taille)-(+b.taille));
  _prodCache = products.map(p=>{
    const prim = normTxt(p.nom||'');
    const blob = normTxt([p.nom, p.ref, p.taille+' macarons', p.taille, (p.actif!==false?'actif':'inactif')].filter(v=>v!=null&&v!=='').join(' '));
    return {p, _prim:prim, _blob:blob, _digits:onlyDigits(String(p.taille||''))};
  });
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Offre / Coffrets</h1><p id="prodCount">Catalogue de coffrets et parfums proposés</p></div>
     <button class="btn" onclick="prodCatForm()">+ Nouveau coffret</button></div>
   <div class="panel"><h2>Coffrets</h2>
     <input class="search" id="prodSearch" style="width:100%;margin-bottom:12px" placeholder="Nom du coffret, référence, taille…" value="${esc(prodSearch)}" oninput="prodFilter(this.value)" autocomplete="off" autocapitalize="off" autocorrect="off">
     ${products.length?`<div class="table-wrap"><table><thead><tr><th>Coffret</th><th>Taille</th><th>Prix de base</th><th>Actif</th><th></th></tr></thead>
       <tbody id="prodBody"></tbody></table></div><div id="prodEmpty" class="empty" style="display:none">Aucun coffret.</div>`
       :`<div class="empty">Aucun coffret. Ajoute tes formats (6, 8, 16, 25 macarons).</div>`}
   </div>
   <div class="panel"><h2>Prestation événement</h2>
     <div class="sum-box"><span>Prix par macaron</span><b>${euro(EVENT_PRICE)}</b></div>
     <div class="sum-box"><span>Quantité minimale</span><b>${EVENT_MIN} pièces</b></div>
     <div class="sum-box"><span>Location présentoir / pyramide</span><b>${euro(EQUIP_PRICE)} / unité</b></div>
     <p class="note">Disponible comme type de commande « Événement ». Le prix se calcule automatiquement (macarons + présentoirs).</p>
   </div>
   <div class="panel"><h2>Macarons grand format <span class="tag warn">${BIG_FORMATS.length}</span></h2>
     <div class="table-wrap"><table><thead><tr><th>Produit</th><th>Tarif particulier</th><th>Tarif pro</th></tr></thead><tbody>
       ${BIG_FORMATS.map(f=>`<tr><td><b>${esc(f)}</b></td><td>${euro(BIG_PRICE.particulier)}</td><td>${euro(BIG_PRICE.pro)}</td></tr>`).join('')}
     </tbody></table></div>
     <p class="note">Vendus à l'unité via le type de commande « Grand format ». Le tarif (pro / particulier) se choisit à chaque commande.</p>
   </div>
   <div class="panel"><h2>Parfums proposés <span class="tag ok">${FLAVORS.length}</span></h2>
     <input class="search" id="flavSearch" style="width:100%;margin-bottom:10px" placeholder="Filtrer les parfums…" oninput="flavFilter(this.value)" autocomplete="off" autocapitalize="off" autocorrect="off">
     <div id="flavWrap">${FLAVORS.map(f=>`<span class="pill">${esc(f)}</span>`).join('')}</div>
     <p class="note">Liste utilisée dans les commandes pour détailler les parfums choisis.</p>
   </div>
   <div class="panel"><h2>Options & paiement</h2>
     <p style="font-size:.86rem;margin-bottom:8px"><b>Personnalisation couleurs :</b> proposée en option sur chaque commande.</p>
     <p style="font-size:.86rem;margin-bottom:8px"><b>Statut de paiement :</b> ${PAY_STATUS.map(s=>`<span class="pill">${esc(s)}</span>`).join('')}</p>
     <p style="font-size:.86rem"><b>Modes de règlement :</b> ${PAY_METHODS.map(s=>`<span class="pill">${esc(s)}</span>`).join('')}</p>
   </div>`;
  prodFilter(prodSearch);
}
function _prodRow(row){
  const p=row.p;
  return `<tr><td><b>${esc(p.nom)}</b>${p.ref?`<br><span style="color:#9a8a82;font-size:.78rem">${esc(p.ref)}</span>`:''}</td><td>${p.taille} macarons</td><td>${euro(p.prix)}</td>
    <td><span class="tag ${p.actif!==false?'ok':'warn'}">${p.actif!==false?'Oui':'Non'}</span></td>
    <td style="text-align:right"><span class="act" onclick="prodCatForm(${p.id})">Modifier</span><span class="act del" onclick="delProdCat(${p.id})">Suppr.</span></td></tr>`;
}
function prodFilter(q){
  prodSearch=q||'';
  if(!_prodCache) return;
  const cntEl=document.getElementById('prodCount');
  searchRenderBody('prodBody','__noop','prodEmpty', _prodCache, q, _prodRow, 5, 'coffret(s)');
  if(cntEl){ const n=searchRank(_prodCache,q).length; cntEl.textContent = (q&&q.trim())?`${n} / ${_prodCache.length} coffret(s)`:'Catalogue de coffrets et parfums proposés'; }
}
// Filtre simple des pastilles de parfums (correspondance partielle, accents/casse)
function flavFilter(q){
  const wrap=document.getElementById('flavWrap'); if(!wrap) return;
  const t=normTxt(q);
  const list = t ? FLAVORS.filter(f=>normTxt(f).includes(t)) : FLAVORS;
  wrap.innerHTML = list.length ? list.map(f=>`<span class="pill">${esc(f)}</span>`).join('') : '<span class="note">Aucun parfum.</span>';
}
async function prodCatForm(id){
  const p = id ? await db.products.get(id) : {taille:6, prix:BOX_PRICES[6], actif:true};
  openModal(`<h3>${id?'Modifier':'Nouveau'} coffret</h3>
   <div class="field"><label>Nom</label><input id="f_nom" value="${esc(p.nom||'')}" placeholder="Coffret 6 macarons"></div>
   <div class="row2">
     <div class="field"><label>Taille (nb macarons)</label><input type="number" id="f_taille" value="${p.taille||6}" oninput="(function(){var pr=document.getElementById('f_prix');})()"></div>
     <div class="field"><label>Prix de base (€)</label><input type="number" step="0.01" id="f_prix" value="${p.prix||0}"></div>
   </div>
   <label style="font-size:.82rem;color:#7a6a62;display:flex;gap:7px;align-items:center"><input type="checkbox" id="f_actif" style="width:auto" ${p.actif!==false?'checked':''}> Coffret actif (proposé dans les commandes)</label>
   <div class="field" style="margin-top:10px"><label>Référence produit <span style="color:#9a8a82;font-weight:400">— optionnelle</span></label><input id="f_ref" value="${esc(p.ref||'')}" placeholder="ex : COF-16"></div>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveProdCat(${id||0})">Enregistrer</button></div>`);
}
async function saveProdCat(id){
  const taille=+val('f_taille')||0;
  const o={nom:val('f_nom')||`Coffret ${taille} macarons`, taille, prix:+val('f_prix')||0, ref:val('f_ref')||'', actif:document.getElementById('f_actif').checked};
  if(!taille){toast('Indique une taille');return;}
  if(id) await db.products.update(id,o); else await db.products.add(o);
  closeModal(); renderProducts(); toast('Coffret enregistré ✓');
}
async function delProdCat(id){
  if(!confirm('Supprimer ce coffret du catalogue ?'))return;
  await db.products.delete(id); renderProducts(); toast('Supprimé');
}

/* ============================================================
   COMMANDES  (+ liaison aux batchs = traçabilité aval)
   ============================================================ */
// Normalise l'ancien statut « En cours » vers la nouvelle structure
function normStatus(st){ return st==='En cours' ? 'À préparer' : (st || 'À préparer'); }
// Pastille colorée selon le statut
function statusTag(st){
  const s = normStatus(st);
  const cls = s==='Livrée' ? 'done' : (s==='Terminée' ? 'ok' : 'todo');
  return `<span class="tag ${cls}">${esc(s)}</span>`;
}
// Changement rapide : passe au statut suivant (À préparer → Terminée → Livrée → …)
async function cycleStatus(id){
  const o = await db.orders.get(id); if(!o) return;
  const cur = normStatus(o.statut);
  const i = ORDER_STATUS.indexOf(cur);
  const next = ORDER_STATUS[(i+1) % ORDER_STATUS.length];
  await db.orders.update(id, {statut: next});
  // mise à jour immédiate du calendrier et des stats : ces vues relisent la base à chaque rendu,
  // il suffit donc de rafraîchir la liste ici ; calendrier/stats seront à jour à leur prochaine ouverture
  renderCmd();
  toast('Statut : '+next);
}
// Définit un statut précis (depuis la fiche détail)
async function setOrderStatus(id, statut){
  await db.orders.update(id, {statut});
  closeModal(); renderCmd(); toast('Statut : '+statut);
}

/* ============================================================
   BBC — PAIEMENT RAPIDE
   ============================================================ */
// Réglage : automatisation du statut de paiement quand un règlement est saisi.
// Stocké dans localStorage, activé par défaut, désactivable par l'utilisateur.
function autoPayEnabled(){ return localStorage.getItem('sm_autoPay')!=='0'; }
function setAutoPay(on){ localStorage.setItem('sm_autoPay', on?'1':'0'); }

// Applique le paiement sur un objet commande (mutation en place) de façon cohérente :
// si un règlement est présent ET l'auto-paiement actif → Payé + date du jour.
// Garantit l'absence de conflit règlement/paiement.
function applyAutoPay(o){
  if(autoPayEnabled() && o.reglement && o.paiement!=='Payé'){
    o.paiement='Payé';
    if(!o.datePaiement) o.datePaiement=today();
  }
  // cohérence inverse : si payé sans date, on date au jour
  if(o.paiement==='Payé' && !o.datePaiement) o.datePaiement=today();
  return o;
}

// Action rapide « Payé » en un clic depuis la liste ou la fiche détail.
async function markPaid(id, fromModal){
  const o=await db.orders.get(id); if(!o) return;
  if(o.paiement==='Payé'){ toast('Déjà payée'); return; }
  const patch={paiement:'Payé', datePaiement: o.datePaiement||today()};
  await db.orders.update(id, patch);
  if(fromModal) closeModal();
  renderCmd();
  toast('Commande marquée payée ✓');
}
let cmdSearch='';
let _cmdCache=null;
async function renderCmd(){
  _cmdSel = new Set();   // sélection réinitialisée à chaque ouverture de l'écran
  const orders = (await db.orders.toArray()).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const clients = await db.clients.toArray();
  const clById = Object.fromEntries(clients.map(c=>[c.id,c]));
  _cmdClNameMap = Object.fromEntries(clients.map(c=>[c.id, c.nom||'—']));
  const clName = id => (clById[id]||{}).nom||'—';
  // charge TOUS les liens batch en une seule requête (au lieu d'une par commande)
  const allItems = await db.orderItems.toArray();
  const itemsByOrder={}; allItems.forEach(it=>{ (itemsByOrder[it.orderId] ||= []).push(it); });
  const lineLabel = ln => {
    if(ln.type==='evenement') return `Événement ${ln.evQte||0} mac. +${ln.equip||0} pyr.`;
    if(ln.type==='grand'){ const n=(ln.items||[]).reduce((s,b)=>s+(+b.qte||0),0); return `Grand format ×${n}`; }
    if(ln.type==='don'){ const n=(ln.parfums||[]).reduce((s,b)=>s+(+b.qte||0),0)+(ln.items||[]).reduce((s,b)=>s+(+b.qte||0),0); return `Don ×${n} (offert)`; }
    return `Coffret ${ln.taille||'?'}`;
  };
  // index de recherche par commande, calculé une seule fois
  _cmdCache = orders.map(o=>{
    const lignes = orderToLines(o);
    const resume = lignes.length ? lignes.map(lineLabel).join(' + ') : '—';
    // produits/parfums pour la recherche
    const prodTxt = lignes.flatMap(ln=>[
      ...(ln.parfums||[]).map(p=>p.nom),
      ...(ln.items||[]).map(p=>p.nom),
      ln.type
    ]).join(' ');
    const cl=clById[o.clientId]||{};
    const prim = normTxt([clName(o.clientId), 'cmd'+o.id].filter(Boolean).join(' '));
    const blob = normTxt([clName(o.clientId), cl.prenom, cl.societe, cl.tel, cl.email, cl.ref,
      resume, prodTxt, o.notes, o.reglement, o.paiement, 'cmd'+o.id, '#'+o.id, fmtDate(o.date)].filter(Boolean).join(' '));
    const digits = onlyDigits([o.id, cl.tel, o.montant].filter(v=>v!=null&&v!=='').join(' '));
    return {o, resume, nbLies:(itemsByOrder[o.id]||[]).length, _prim:prim, _blob:blob, _digits:digits};
  });
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Commandes</h1><p id="cmdCount">${orders.length} commande(s)</p></div>
     <button class="btn" onclick="cmdForm()">+ Nouvelle commande</button></div>
   <div class="panel">
     <input class="search" id="cmdSearch" style="width:100%;margin-bottom:12px" placeholder="N° commande, client, produit, parfum, notes, règlement…" value="${esc(cmdSearch)}" oninput="cmdFilter(this.value)" autocomplete="off" autocapitalize="off" autocorrect="off">
     <div id="cmdSelBar" class="sel-bar" style="display:none">
       <span id="cmdSelCount">0 sélectionnée(s)</span>
       <div class="flex" style="gap:6px">
         <button class="btn ghost sm" onclick="cmdSelectAllVisible()">Tout cocher</button>
         <button class="btn ghost sm" onclick="cmdClearSelection()">Tout décocher</button>
         <button class="btn gold sm" onclick="cmdExportSelection()">⬇ Exporter la sélection (TXT)</button>
       </div>
     </div>
     <div class="table-wrap"><table><thead><tr><th style="width:34px"><input type="checkbox" id="cmdSelHead" onclick="cmdToggleAll(this.checked)" title="Tout sélectionner"></th><th>Date</th><th>Client</th><th>Produits</th><th>Montant</th><th>Paiement</th><th>Statut</th><th>Traça.</th><th></th></tr></thead>
       <tbody id="cmdBody"></tbody></table></div>
     <div id="cmdEmpty" class="empty" style="display:none">Aucune commande.</div>
   </div>`;
  cmdFilter(cmdSearch);
  cmdUpdateSelBar();
}
function _cmdRow(row){
  const o=row.o; const paye=o.paiement==='Payé';
  const checked = _cmdSel.has(o.id) ? 'checked' : '';
  return `<tr>
     <td><input type="checkbox" class="cmd-check" ${checked} onclick="cmdToggleOne(${o.id},this.checked)"></td>
     <td>${fmtDate(o.date)}</td>
     <td>${o.clientId?`<b><span class="link-name" onclick="clientForm(${o.clientId})">${esc(_cmdClName(o.clientId))}</span></b>`:`<b>—</b>`}</td>
     <td><span style="font-size:.82rem">${esc(row.resume)}</span>${o.perso?' <span class="tag event">perso</span>':''}</td>
     <td>${euro(+o.montant)}</td>
     <td>
       <div class="pay-toggle sm">
         <label class="pay-opt"><input type="radio" name="paylist_${o.id}" ${!paye?'checked':''} onclick="listSetPay(${o.id},'En attente')"><span>En attente</span></label>
         <label class="pay-opt"><input type="radio" name="paylist_${o.id}" ${paye?'checked':''} onclick="listSetPay(${o.id},'Payé')"><span>Payé</span></label>
       </div>
       ${o.reglement?`<span style="color:#9a8a82;font-size:.72rem">${esc(o.reglement)}</span>`:''}${paye&&o.datePaiement?`<span style="color:#9a8a82;font-size:.72rem"> · le ${fmtDate(o.datePaiement)}</span>`:''}
     </td>
     <td><span class="act-status" onclick="cycleStatus(${o.id})" title="Toucher pour changer le statut">${statusTag(o.statut)}</span></td>
     <td>${row.nbLies?`<span class="tag ok">${row.nbLies} batch</span>`:'<span class="tag warn">non lié</span>'}</td>
     <td style="text-align:right"><span class="act" onclick="cmdView(${o.id})">Détail</span><span class="act" onclick="exportOrderText(${o.id})">Texte</span><span class="act" onclick="cmdLink(${o.id})">Lier</span><span class="act" onclick="cmdForm(${o.id})">Modifier</span><span class="act del" onclick="delCmd(${o.id})">Suppr.</span></td></tr>`;
}
// ---- Statut paiement instantané depuis la liste (En attente / Payé) ----
async function listSetPay(id, statut){
  const o=await db.orders.get(id); if(!o) return;
  const patch={paiement:statut};
  if(statut==='Payé'){ patch.datePaiement = o.datePaiement||today(); }
  await db.orders.update(id, patch);
  // mise à jour locale du cache pour refléter sans recharger toute la page
  if(_cmdCache){ const r=_cmdCache.find(x=>x.o.id===id); if(r){ r.o.paiement=statut; if(patch.datePaiement) r.o.datePaiement=patch.datePaiement; } }
  toast(statut==='Payé'?'Marquée payée ✓':'Repassée en attente');
  cmdFilter(cmdSearch); // redessine le corps seulement
}
// ---- Sélection multiple ----
let _cmdSel = new Set();
function cmdToggleOne(id, on){ if(on) _cmdSel.add(id); else _cmdSel.delete(id); cmdUpdateSelBar(); }
function cmdToggleAll(on){ cmdToggleAllVisible(on); }
function cmdSelectAllVisible(){ cmdToggleAllVisible(true); }
function cmdToggleAllVisible(on){
  // agit sur les commandes actuellement filtrées/affichées
  const rows = searchRank(_cmdCache||[], cmdSearch);
  rows.forEach(r=>{ if(on) _cmdSel.add(r.o.id); else _cmdSel.delete(r.o.id); });
  cmdFilter(cmdSearch); cmdUpdateSelBar();
}
function cmdClearSelection(){ _cmdSel.clear(); const h=document.getElementById('cmdSelHead'); if(h)h.checked=false; cmdFilter(cmdSearch); cmdUpdateSelBar(); }
function cmdUpdateSelBar(){
  const bar=document.getElementById('cmdSelBar'), cnt=document.getElementById('cmdSelCount');
  if(!bar) return;
  if(_cmdSel.size>0){ bar.style.display='flex'; if(cnt) cnt.textContent=`${_cmdSel.size} sélectionnée(s)`; }
  else { bar.style.display='none'; }
}
let _cmdClNameMap={};
function _cmdClName(id){ return _cmdClNameMap[id]||'—'; }
function cmdFilter(q){
  cmdSearch=q||'';
  if(!_cmdCache) return;
  searchRenderBody('cmdBody','cmdCount','cmdEmpty', _cmdCache, q, _cmdRow, 9, 'commande(s)');
}
// Vue détail d'une commande (multi-lignes)
async function cmdView(id){
  const o = await db.orders.get(id);
  const cl = o.clientId ? await db.clients.get(o.clientId) : null;
  const lignes = orderToLines(o);
  const blocks = lignes.map(ln=>{
    if(ln.type==='coffret'){
      const parfums=(ln.parfums||[]).filter(p=>p.qte>0);
      const totQ=parfums.reduce((s,p)=>s+(+p.qte||0),0);
      const nbDiff=parfums.length, limit=BOX_FLAVOR_LIMIT[ln.taille]||0, over=Math.max(0,nbDiff-limit);
      return `<div class="cmd-line"><div class="line-type">Coffret ${ln.taille} macarons ${over?`<span class="line-sub">+${over} parfum(s) suppl. = +${euro(over*FLAVOR_SURCHARGE)}</span>`:''}</div>
        ${parfums.length?`<div style="margin-top:6px">${parfums.map(p=>`<span class="pill">${esc(p.nom)} × ${p.qte}</span>`).join('')}</div>`:'<p class="note">Parfums non détaillés.</p>'}
        ${totQ&&totQ!==+ln.taille?`<p class="note" style="color:var(--red)">⚠ ${totQ} macarons pour un coffret de ${ln.taille}.</p>`:''}
        <div class="sum-box" style="margin-top:8px"><span>Sous-total</span><b>${euro(lineTotalStored(ln))}</b></div></div>`;
    }
    if(ln.type==='evenement'){
      const parfums=(ln.parfums||[]).filter(p=>p.qte>0);
      return `<div class="cmd-line"><div class="line-type">Événement</div>
        <div class="sum-box"><span>Macarons</span><b>${ln.evQte||0} × ${euro(EVENT_PRICE)}</b></div>
        <div class="sum-box"><span>Pyramides / présentoirs</span><b>${ln.equip||0} × ${euro(EQUIP_PRICE)}</b></div>
        ${parfums.length?`<div style="margin-top:6px">${parfums.map(p=>`<span class="pill">${esc(p.nom)} × ${p.qte}</span>`).join('')}</div>`:''}
        <div class="sum-box" style="margin-top:8px"><span>Sous-total</span><b>${euro(lineTotalStored(ln))}</b></div></div>`;
    }
    if(ln.type==='grand'){
      const items=(ln.items||[]).filter(p=>p.qte>0);
      return `<div class="cmd-line"><div class="line-type">Grand format <span class="line-sub">tarif ${esc(ln.tarif||'particulier')}</span></div>
        ${items.length?`<div style="margin-top:6px">${items.map(p=>`<span class="pill">${esc(p.nom)} × ${p.qte}</span>`).join('')}</div>`:'<p class="note">Aucun.</p>'}
        <div class="sum-box" style="margin-top:8px"><span>Sous-total</span><b>${euro(lineTotalStored(ln))}</b></div></div>`;
    }
    if(ln.type==='don'){
      const parfums=(ln.parfums||[]).filter(p=>p.qte>0);
      const items=(ln.items||[]).filter(p=>p.qte>0);
      const n=parfums.reduce((s,p)=>s+(+p.qte||0),0)+items.reduce((s,p)=>s+(+p.qte||0),0);
      return `<div class="cmd-line"><div class="line-type">Don <span class="line-sub">offert · décrémente le stock</span></div>
        ${parfums.length?`<div style="margin-top:6px">${parfums.map(p=>`<span class="pill">${esc(p.nom)} × ${p.qte}</span>`).join('')}</div>`:''}
        ${items.length?`<div style="margin-top:6px">${items.map(p=>`<span class="pill">${esc(p.nom)} (GF) × ${p.qte}</span>`).join('')}</div>`:''}
        ${!n?'<p class="note">Aucun macaron.</p>':''}
        <div class="sum-box" style="margin-top:8px"><span>${n} offert(s) · sous-total</span><b>${euro(0)}</b></div></div>`;
    }
    return '';
  }).join('');
  openModal(`<h3>Détail commande</h3>
    <p style="margin-bottom:10px"><b>${cl?`<span class="link-name" onclick="closeModal();clientForm(${cl.id})">${esc(cl.nom)}</span>`:'—'}</b> · ${fmtDate(o.date)}</p>
    ${blocks||'<p class="note">Aucun produit.</p>'}
    <div class="sum-box"><span>Personnalisation couleurs</span><b>${o.perso?'Oui':'Non'}</b></div>
    ${+o.remiseGlobale>0?`<div class="sum-box"><span>Remise globale</span><b>−${o.remiseGlobale}%</b></div>`:''}
    <div class="sum-box"><span>Montant total${+o.remiseGlobale>0||lignes.some(l=>+l.remisePct>0)?' (TTC, remises incluses)':''}</span><b>${euro(o.montant)}</b></div>
    <div class="sum-box"><span>Paiement</span><b>${esc(o.paiement||'En attente')}${o.reglement?' · '+esc(o.reglement):''}${o.paiement==='Payé'&&o.datePaiement?' · le '+fmtDate(o.datePaiement):''}</b></div>
    ${o.paiement!=='Payé'?`<button class="btn gold sm" style="margin-top:6px" onclick="markPaid(${id},true)">✓ Marquer payée</button>`:''}
    <h3 style="font-size:1rem;margin:16px 0 8px">Statut de la commande</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${ORDER_STATUS.map(st=>{const cur=normStatus(o.statut)===st;
        return `<button class="btn ${cur?'':'ghost'} sm" onclick="setOrderStatus(${id},'${st}')" ${cur?'style="pointer-events:none"':''}>${cur?'● ':''}${st}</button>`;}).join('')}
    </div>
    ${o.notes?`<h3 style="font-size:1rem;margin:16px 0 6px">Notes</h3><p style="font-size:.86rem;white-space:pre-wrap">${esc(o.notes)}</p>`:''}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button><button class="btn ghost" onclick="exportOrderText(${id})">⧉ Texte</button><button class="btn" onclick="closeModal();cmdForm(${id})">Modifier</button></div>`);
}
// Total d'une ligne stockée (parfums/items en tableaux)
function lineTotalStored(ln){
  if(ln.type==='coffret'){
    const base=(BOX_PRICES[ln.taille]!=null)?BOX_PRICES[ln.taille]:0;
    const nbDiff=(ln.parfums||[]).filter(p=>p.qte>0).length;
    const limit=BOX_FLAVOR_LIMIT[ln.taille]||0;
    return base + Math.max(0,nbDiff-limit)*FLAVOR_SURCHARGE;
  }
  if(ln.type==='evenement') return (ln.evQte||0)*EVENT_PRICE + (ln.equip||0)*EQUIP_PRICE;
  if(ln.type==='grand'){ const pu=BIG_PRICE[ln.tarif]||0; const tot=(ln.items||[]).reduce((s,p)=>s+(+p.qte||0),0); return tot*pu; }
  if(ln.type==='don') return 0;
  return 0;
}
let cmdLines = [];      // lignes de produits de la commande en cours
let cmdProductsCache = [];
let cmdClientsCache = [];

// Convertit une ancienne commande mono-type en lignes (rétro-compat).
// Renvoie les lignes SOUS FORME DE STOCKAGE : parfums/items en TABLEAU [{nom,qte}].
// (Forme attendue par les lecteurs : liste commandes, analytics, besoins matières, détail.)
function orderToLines(o){
  if(Array.isArray(o.lignes) && o.lignes.length) return JSON.parse(JSON.stringify(o.lignes));
  // ancien format : un seul type
  if(o.type==='evenement'){
    const parfums=[]; (o.parfums||[]).forEach(p=>{if(p.qte>0)parfums.push({nom:p.nom,qte:p.qte});});
    return [{type:'evenement', evQte:o.evQte||EVENT_MIN, equip:o.equip||0, parfums}];
  }
  if(o.type==='grand'){
    const items=[]; (o.bigItems||[]).forEach(p=>{if(p.qte>0)items.push({nom:p.nom,qte:p.qte});});
    return [{type:'grand', tarif:o.tarif||'particulier', items}];
  }
  if(o.type==='coffret' || o.taille){
    const parfums=[]; (o.parfums||[]).forEach(p=>{if(p.qte>0)parfums.push({nom:p.nom,qte:p.qte});});
    return [{type:'coffret', taille:o.taille||6, parfums}];
  }
  return [];
}
// Modèle d'ÉDITION en mémoire : parfums/items en OBJET {nom:qte}. Utilisé uniquement par le
// formulaire de commande (drawLines & co). Corrige la perte des parfums à la réouverture.
function _parfumsToObj(p){
  if(!p) return {};
  if(Array.isArray(p)){ const o={}; p.forEach(x=>{ if(x && x.nom && +x.qte>0) o[x.nom]=+x.qte; }); return o; }
  if(typeof p==='object'){ const o={}; Object.keys(p).forEach(k=>{ if(+p[k]>0) o[k]=+p[k]; }); return o; }
  return {};
}
function _lineToEdit(ln){
  const t=ln.type;
  if(t==='coffret') return {type:'coffret', taille:ln.taille||6, parfums:_parfumsToObj(ln.parfums), remisePct:+ln.remisePct||0};
  if(t==='evenement') return {type:'evenement', evQte:ln.evQte||EVENT_MIN, equip:(ln.equip!=null?ln.equip:EVENT_MIN_EQUIP), parfums:_parfumsToObj(ln.parfums), remisePct:+ln.remisePct||0};
  if(t==='grand') return {type:'grand', tarif:ln.tarif||'particulier', items:_parfumsToObj(ln.items), remisePct:+ln.remisePct||0};
  if(t==='don') return {type:'don', parfums:_parfumsToObj(ln.parfums), items:_parfumsToObj(ln.items)};
  return {...ln};
}
// Charge une commande dans le modèle d'édition (objet) sans rien perdre.
function orderToEditLines(o){ return orderToLines(o).map(_lineToEdit); }

async function cmdForm(id, opts){
  opts = opts || {};
  cmdClientsCache = await db.clients.toArray();
  cmdProductsCache = (await db.products.toArray()).filter(p=>p.actif!==false).sort((a,b)=>(+a.taille)-(+b.taille));
  const o = id ? await db.orders.get(id) : {date:today(),statut:'À préparer',paiement:'En attente',perso:false};
  // Préserver les lignes en cours si on rouvre après ajout d'un client
  if(opts.keepLines && Array.isArray(cmdLines)){ /* cmdLines déjà en mémoire, on le garde */ }
  else { cmdLines = orderToEditLines(o); }   // forme objet, parfums conservés
  const preselect = opts.clientId || o.clientId || 0;
  // trier les clients par nom pour un défilement lisible même à plusieurs centaines
  cmdClientsCache.sort((a,b)=>(a.nom||'').localeCompare(b.nom||''));
  const clOpts = '<option value="0">— aucun —</option>'+cmdClientsCache.map(c=>`<option value="${c.id}" ${preselect===c.id?'selected':''}>${esc(c.nom)}${c.tel?' · '+esc(c.tel):''}</option>`).join('');
  const curStatut = o.statut==='En cours' ? 'À préparer' : (o.statut||'À préparer');
  const stOpts = ORDER_STATUS.map(s=>`<option ${curStatut===s?'selected':''}>${s}</option>`).join('');
  const regOpts = `<option value="">—</option>`+PAY_METHODS.map(s=>`<option ${o.reglement===s?'selected':''}>${s}</option>`).join('');
  openModal(`<h3>${id?'Modifier':'Nouvelle'} commande</h3>
   <div class="field"><label>Client</label>
     <input class="search" id="f_clsearch" placeholder="Rechercher par nom ou téléphone…" oninput="filterCmdClients(this.value)" value="">
     <select id="f_cl" style="margin-top:6px">${clOpts||'<option value="0">— aucun —</option>'}</select>
     <button class="btn ghost sm" style="margin-top:6px" onclick="quickClient(${id||0})">+ Nouveau client</button>
   </div>
   <div class="field"><label>Date</label><input type="date" id="f_date" value="${o.date||today()}"></div>

   <label style="font-size:.82rem;color:#7a6a62;font-weight:500;display:block;margin-bottom:6px">Produits de la commande</label>
   <div id="linesWrap"></div>
   <div class="add-line-row">
     <button class="btn ghost sm" onclick="addLine('coffret')">+ Coffret</button>
     <button class="btn ghost sm" onclick="addLine('evenement')">+ Événement</button>
     <button class="btn ghost sm" onclick="addLine('grand')">+ Grand format</button>
     <button class="btn ghost sm" onclick="addLine('don')">+ Don (0 €)</button>
   </div>

   <label style="font-size:.82rem;color:#7a6a62;display:flex;gap:7px;align-items:center;margin:6px 0"><input type="checkbox" id="f_perso" style="width:auto" ${o.perso?'checked':''}> Personnalisation des couleurs</label>

   <div class="field"><label>Statut de paiement</label>
     <div class="pay-toggle" id="payToggle">
       <label class="pay-opt"><input type="radio" name="f_pay_radio" value="En attente" ${o.paiement!=='Payé'?'checked':''} onchange="cmdSetPay('En attente')"> <span>En attente</span></label>
       <label class="pay-opt"><input type="radio" name="f_pay_radio" value="Payé" ${o.paiement==='Payé'?'checked':''} onchange="cmdSetPay('Payé')"> <span>Payé</span></label>
     </div>
     <input type="hidden" id="f_pay" value="${esc(o.paiement||'En attente')}">
   </div>
   <label style="font-size:.78rem;color:#7a6a62;display:flex;gap:7px;align-items:center;margin:2px 0 6px"><input type="checkbox" id="f_autopay" style="width:auto" ${autoPayEnabled()?'checked':''} onchange="setAutoPay(this.checked);cmdSyncPayUI()"> Passer automatiquement en « Payé » dès qu'un règlement est saisi</label>
   <div class="row2">
     <div class="field"><label>Règlement</label><select id="f_reg" onchange="cmdSyncPayUI()">${regOpts}</select></div>
     <div class="field"><label>Statut commande</label><select id="f_st">${stOpts}</select></div>
   </div>
   <div class="row2">
     <div class="field"><label>% de remise globale</label><input type="number" min="0" max="100" step="1" id="f_remiseg" value="${o.remiseGlobale||''}" placeholder="0" oninput="cmdRecalc()"></div>
     <div class="field"><label>Prix total (€) <span style="color:#9a8a82;font-weight:400">— auto, modifiable</span></label><input type="number" step="0.01" id="f_mt" value="${o.montant||''}" oninput="this.dataset.auto='0'"></div>
   </div>
   <div class="sum-box" id="priceBreak" style="display:none"></div>

   <div class="field" style="margin-top:14px"><label>Notes</label><textarea id="f_notes" rows="2" placeholder="Allergies, livraison, demande spéciale…">${esc(o.notes||'')}</textarea></div>

   <label style="font-size:.78rem;color:#7a6a62;display:flex;gap:7px;align-items:center"><input type="checkbox" id="f_cal" style="width:auto" ${id?'':'checked'}> Ajouter au calendrier</label>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveCmd(${id||0})">Enregistrer</button></div>`);
  const mt=document.getElementById('f_mt'); if(mt && !mt.value) mt.dataset.auto='1';
  cmdSyncPayUI();
  drawLines();
}

// Statut de paiement piloté par 2 radios (En attente / Payé), une seule active à la fois.
function cmdSetPay(v){
  const hid=document.getElementById('f_pay'); if(hid) hid.value=v;
  // refléter sur les radios (cas appel programmatique)
  document.querySelectorAll('input[name="f_pay_radio"]').forEach(r=>{ r.checked = (r.value===v); });
}
// Conservé pour compat. : force « Payé ».
function cmdQuickPay(){ cmdSetPay('Payé'); }
// Auto-Payé si un règlement est saisi et l'option active. Garantit la cohérence règlement/paiement.
function cmdSyncPayUI(){
  const hid=document.getElementById('f_pay'); const reg=document.getElementById('f_reg');
  if(!hid) return;
  if(autoPayEnabled() && reg && reg.value && hid.value!=='Payé'){ cmdSetPay('Payé'); toast('Règlement saisi → Payé'); }
}

// Recherche client instantanée dans le formulaire de commande (nom ou téléphone)
function filterCmdClients(q){
  const sel=document.getElementById('f_cl'); if(!sel)return;
  const cur=sel.value;
  const term=(q||'').trim().toLowerCase();
  const norm=s=>(s||'').toLowerCase();
  const digits=s=>(s||'').replace(/[^0-9]/g,'');
  const qd=digits(q);
  const matches = !term ? cmdClientsCache : cmdClientsCache.filter(c=>{
    const byName = norm(c.nom).includes(term);
    const byTel = qd && digits(c.tel).includes(qd);
    return byName || byTel;
  });
  sel.innerHTML='<option value="0">— aucun —</option>'+matches.map(c=>`<option value="${c.id}" ${String(c.id)===cur?'selected':''}>${esc(c.nom)}${c.tel?' · '+esc(c.tel):''}</option>`).join('');
  // si un seul résultat, le présélectionner pour gagner un clic
  if(matches.length===1) sel.value=String(matches[0].id);
}

// Ajout rapide d'un client SANS quitter la commande (popup → retour avec client sélectionné)
let _quickClientReturnId = 0;
function quickClient(orderId){
  _quickClientReturnId = orderId||0;
  openModal(`<h3>Nouveau client</h3>
    <p class="note">Saisie rapide. Vous pourrez compléter la fiche plus tard depuis l'onglet Clients.</p>
    <div class="field"><label>Nom / Entreprise *</label><input id="qc_nom" placeholder="ex : Marie Dupont"></div>
    <div class="field"><label>Téléphone *</label><input id="qc_tel" type="tel" inputmode="tel" placeholder="ex : 06 12 34 56 78"></div>
    <div class="field"><label>Type</label><select id="qc_type"><option>Particulier</option><option>Pro</option></select></div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="cmdForm(${orderId||0},{keepLines:true})">Annuler</button>
      <button class="btn" onclick="saveQuickClient()">Ajouter et sélectionner</button>
    </div>`);
  setTimeout(()=>{const n=document.getElementById('qc_nom'); if(n)n.focus();},100);
}
async function saveQuickClient(){
  const nom=(val('qc_nom')||'').trim();
  const tel=(val('qc_tel')||'').trim();
  const type=val('qc_type')||'Particulier';
  if(!nom){ toast('Le nom est requis'); return; }
  if(!tel){ toast('Le téléphone est requis'); return; }
  // Anti-doublon : même nom + même téléphone (chiffres) → on réutilise, on ne crée pas
  const digits=s=>(s||'').replace(/[^0-9]/g,'');
  const existing=(await db.clients.toArray()).find(c=>
    (c.nom||'').trim().toLowerCase()===nom.toLowerCase() && digits(c.tel)===digits(tel));
  let cid;
  if(existing){
    cid=existing.id;
    toast('Client déjà existant — sélectionné');
  } else {
    cid=await db.clients.add({nom, tel, type, email:'', adresse:'', notes:''});
    toast('Client ajouté ✓');
  }
  // rouvrir la commande en préservant les lignes et en sélectionnant le client
  await cmdForm(_quickClientReturnId, {clientId:cid, keepLines:true});
}

function addLine(type){
  if(type==='coffret') cmdLines.push({type:'coffret', taille:6, parfums:{}});
  else if(type==='evenement') cmdLines.push({type:'evenement', evQte:EVENT_MIN, equip:EVENT_MIN_EQUIP, parfums:{}});
  else if(type==='grand') cmdLines.push({type:'grand', tarif:'particulier', items:{}});
  else if(type==='don') cmdLines.push({type:'don', parfums:{}, items:{}});
  drawLines();
}
function removeLine(i){ cmdLines.splice(i,1); drawLines(); }

function drawLines(){
  const wrap=document.getElementById('linesWrap'); if(!wrap)return;
  if(!cmdLines.length){ wrap.innerHTML='<p class="note">Ajoute au moins un produit ci-dessous (coffret, événement, grand format ou don).</p>'; cmdRecalc(); return; }
  wrap.innerHTML = cmdLines.map((ln,i)=>{
    if(ln.type==='coffret') return drawCoffretLine(ln,i);
    if(ln.type==='evenement') return drawEventLine(ln,i);
    if(ln.type==='grand') return drawBigLine(ln,i);
    if(ln.type==='don') return drawDonLine(ln,i);
    return '';
  }).join('');
  cmdRecalc();
}

function drawCoffretLine(ln,i){
  const boxOpts = cmdProductsCache.map(p=>`<option value="${p.taille}" data-prix="${p.prix}" ${(+ln.taille===+p.taille)?'selected':''}>${esc(p.nom)} — ${euro(p.prix)}</option>`).join('');
  const limit = BOX_FLAVOR_LIMIT[ln.taille]||0;
  // sélecteur de quantité 0..taille pour chaque parfum
  const flavRows = FLAVORS.map((f,fi)=>{
    const q=ln.parfums[f]||0;
    const maxq = ln.taille||25;
    let opts='';
    for(let n=0;n<=maxq;n++) opts+=`<option value="${n}" ${q===n?'selected':''}>${n}</option>`;
    return `<div class="flav-row ${q>0?'on':''}">
      <span class="nm">${esc(f)}</span>
      <select class="flav-sel" onchange="setCoffretParfum(${i},${fi},this.value)">${opts}</select></div>`;
  }).join('');
  const nbDiff = Object.values(ln.parfums).filter(q=>q>0).length;
  const totQ = Object.values(ln.parfums).reduce((s,q)=>s+(+q||0),0);
  const over = Math.max(0, nbDiff-limit);
  return `<div class="cmd-line">
    <div class="line-head"><span class="line-type">Coffret <span class="line-sub">jusqu'à ${limit} parfum(s) inclus</span></span><span class="line-del" onclick="removeLine(${i})">✕ retirer</span></div>
    <div class="field"><label>Taille</label><select onchange="setCoffretTaille(${i},this.value)">${boxOpts}</select></div>
    <label style="font-size:.78rem;color:#7a6a62">Parfums (quantité par parfum)</label>
    <div class="flav-grid">${flavRows}</div>
    <div class="sum-box"><span>${nbDiff} parfum(s) différent(s) · ${totQ}/${ln.taille} macarons</span><b>${over?`+${over} suppl. (${euro(over*FLAVOR_SURCHARGE)})`:'inclus'}</b></div>
    ${totQ&&totQ!==+ln.taille?`<p class="note" style="color:var(--red)">⚠ ${totQ} macarons sélectionnés pour un coffret de ${ln.taille}.</p>`:''}
    ${lineRemiseRow(ln,i)}
  </div>`;
}
function setCoffretTaille(i,v){ cmdLines[i].taille=+v; // purge les parfums au-delà de la nouvelle taille
  const max=+v; Object.keys(cmdLines[i].parfums).forEach(k=>{ if(cmdLines[i].parfums[k]>max) cmdLines[i].parfums[k]=max; }); drawLines(); }
function setCoffretParfum(i,fi,v){ const f=FLAVORS[fi]; const q=+v||0; if(q>0)cmdLines[i].parfums[f]=q; else delete cmdLines[i].parfums[f]; drawLines(); }

function drawEventLine(ln,i){
  const flavRows = FLAVORS.map((f,fi)=>{
    const q=ln.parfums[f]||0;
    let opts=''; for(let n=0;n<=Math.max(ln.evQte,50);n++) opts+=`<option value="${n}" ${q===n?'selected':''}>${n}</option>`;
    return `<div class="flav-row ${q>0?'on':''}"><span class="nm">${esc(f)}</span>
      <select class="flav-sel" onchange="setEventParfum(${i},${fi},this.value)">${opts}</select></div>`;
  }).join('');
  const totQ = Object.values(ln.parfums).reduce((s,q)=>s+(+q||0),0);
  return `<div class="cmd-line">
    <div class="line-head"><span class="line-type">Événement <span class="line-sub">${euro(EVENT_PRICE)}/macaron · min ${EVENT_MIN} · ≥1 pyramide</span></span><span class="line-del" onclick="removeLine(${i})">✕ retirer</span></div>
    <div class="row2">
      <div class="field"><label>Nombre de macarons</label><input type="number" min="${EVENT_MIN}" value="${ln.evQte}" oninput="setEventQte(${i},this.value)"></div>
      <div class="field"><label>Pyramides / présentoirs</label><input type="number" min="${EVENT_MIN_EQUIP}" value="${ln.equip}" oninput="setEventEquip(${i},this.value)"></div>
    </div>
    <label style="font-size:.78rem;color:#7a6a62">Parfums (optionnel)</label>
    <div class="flav-grid">${flavRows}</div>
    <div class="sum-box"><span>${ln.evQte} macarons · ${ln.equip} pyramide(s)</span><b>${euro(ln.evQte*EVENT_PRICE + ln.equip*EQUIP_PRICE)}</b></div>
    ${ln.equip<EVENT_MIN_EQUIP?`<p class="note" style="color:var(--red)">⚠ Au moins ${EVENT_MIN_EQUIP} pyramide obligatoire.</p>`:''}
    ${totQ&&totQ!==+ln.evQte?`<p class="note" style="color:var(--red)">⚠ ${totQ} parfums détaillés ≠ ${ln.evQte} macarons.</p>`:''}
    ${lineRemiseRow(ln,i)}
  </div>`;
}
function setEventQte(i,v){ cmdLines[i].evQte=+v||0; cmdRecalc(); }
function setEventEquip(i,v){ cmdLines[i].equip=+v||0; cmdRecalc(); }
function setEventParfum(i,fi,v){ const f=FLAVORS[fi]; const q=+v||0; if(q>0)cmdLines[i].parfums[f]=q; else delete cmdLines[i].parfums[f]; drawLines(); }

function drawBigLine(ln,i){
  const pu=BIG_PRICE[ln.tarif]||0;
  const bigRows = BIG_FORMATS.map((f,fi)=>{
    const q=ln.items[f]||0;
    let opts=''; for(let n=0;n<=50;n++) opts+=`<option value="${n}" ${q===n?'selected':''}>${n}</option>`;
    return `<div class="flav-row ${q>0?'on':''}"><span class="nm">${esc(f)}</span>
      <select class="flav-sel" onchange="setBigItem(${i},${fi},this.value)">${opts}</select></div>`;
  }).join('');
  const tot=Object.values(ln.items).reduce((s,q)=>s+(+q||0),0);
  return `<div class="cmd-line">
    <div class="line-head"><span class="line-type">Grand format</span><span class="line-del" onclick="removeLine(${i})">✕ retirer</span></div>
    <div class="field"><label>Tarif</label><select onchange="setBigTarif(${i},this.value)">
      <option value="particulier" ${ln.tarif!=='pro'?'selected':''}>Particulier — ${euro(BIG_PRICE.particulier)}/pièce</option>
      <option value="pro" ${ln.tarif==='pro'?'selected':''}>Pro — ${euro(BIG_PRICE.pro)}/pièce</option>
    </select></div>
    <label style="font-size:.78rem;color:#7a6a62">Produits (quantité)</label>
    <div class="flav-grid">${bigRows}</div>
    <div class="sum-box"><span>${tot} pièce(s) × ${euro(pu)}</span><b>${euro(tot*pu)}</b></div>
    ${lineRemiseRow(ln,i)}
  </div>`;
}
function setBigTarif(i,v){ cmdLines[i].tarif=v; drawLines(); }
function setBigItem(i,fi,v){ const f=BIG_FORMATS[fi]; const q=+v||0; if(q>0)cmdLines[i].items[f]=q; else delete cmdLines[i].items[f]; drawLines(); }

function drawDonLine(ln,i){
  if(!ln.parfums) ln.parfums={}; if(!ln.items) ln.items={};
  const parfRows = FLAVORS.map((f,fi)=>{
    const q=ln.parfums[f]||0;
    let opts=''; for(let n=0;n<=60;n++) opts+=`<option value="${n}" ${q===n?'selected':''}>${n}</option>`;
    return `<div class="flav-row ${q>0?'on':''}"><span class="nm">${esc(f)}</span>
      <select class="flav-sel" onchange="setDonParfum(${i},${fi},this.value)">${opts}</select></div>`;
  }).join('');
  const bigRows = BIG_FORMATS.map((f,fi)=>{
    const q=ln.items[f]||0;
    let opts=''; for(let n=0;n<=30;n++) opts+=`<option value="${n}" ${q===n?'selected':''}>${n}</option>`;
    return `<div class="flav-row ${q>0?'on':''}"><span class="nm">${esc(f)} <span style="color:#9a8a82;font-size:.72rem">(GF)</span></span>
      <select class="flav-sel" onchange="setDonItem(${i},${fi},this.value)">${opts}</select></div>`;
  }).join('');
  const totP=Object.values(ln.parfums).reduce((s,q)=>s+(+q||0),0);
  const totB=Object.values(ln.items).reduce((s,q)=>s+(+q||0),0);
  return `<div class="cmd-line">
    <div class="line-head"><span class="line-type">Don <span class="line-sub">offert · 0 € · décrémente le stock</span></span><span class="line-del" onclick="removeLine(${i})">✕ retirer</span></div>
    <label style="font-size:.78rem;color:#7a6a62">Macarons offerts (par parfum)</label>
    <div class="flav-grid">${parfRows}</div>
    <label style="font-size:.78rem;color:#7a6a62;display:block;margin-top:8px">Grands formats offerts (optionnel)</label>
    <div class="flav-grid">${bigRows}</div>
    <div class="sum-box"><span>${totP+totB} macaron(s) offert(s)</span><b>${euro(0)}</b></div>
  </div>`;
}
function setDonParfum(i,fi,v){ const f=FLAVORS[fi]; const q=+v||0; if(q>0)cmdLines[i].parfums[f]=q; else delete cmdLines[i].parfums[f]; drawLines(); }
function setDonItem(i,fi,v){ const f=BIG_FORMATS[fi]; const q=+v||0; if(q>0)cmdLines[i].items[f]=q; else delete cmdLines[i].items[f]; drawLines(); }

// Prix d'une ligne AVANT remise de ligne
function lineTotalBase(ln){
  if(ln.type==='coffret'){
    const base = (BOX_PRICES[ln.taille]!=null) ? BOX_PRICES[ln.taille] : (cmdProductsCache.find(p=>+p.taille===+ln.taille)||{}).prix||0;
    const nbDiff = Object.values(ln.parfums||{}).filter(q=>q>0).length;
    const limit = BOX_FLAVOR_LIMIT[ln.taille]||0;
    const over = Math.max(0, nbDiff-limit);
    return base + over*FLAVOR_SURCHARGE;
  }
  if(ln.type==='evenement') return (ln.evQte||0)*EVENT_PRICE + (ln.equip||0)*EQUIP_PRICE;
  if(ln.type==='grand'){ const pu=BIG_PRICE[ln.tarif]||0; const tot=Object.values(ln.items||{}).reduce((s,q)=>s+(+q||0),0); return tot*pu; }
  if(ln.type==='don') return 0;
  return 0;
}
// Remise de ligne en € (bornée 0–100 %)
function lineRemiseEuro(ln){
  const pct=Math.max(0,Math.min(100,+ln.remisePct||0));
  return lineTotalBase(ln)*pct/100;
}
// Prix d'une ligne APRÈS remise de ligne
function lineTotal(ln){
  return Math.max(0, lineTotalBase(ln) - lineRemiseEuro(ln));
}
// Bloc d'affichage « remise de ligne » réutilisé par chaque type (sauf don, gratuit)
function lineRemiseRow(ln,i){
  if(ln.type==='don') return '';
  const base=lineTotalBase(ln);
  const pct=+ln.remisePct||0;
  const net=lineTotal(ln);
  return `<div class="row2" style="align-items:end">
      <div class="field" style="margin:0"><label>% de remise (ligne)</label>
        <input type="number" min="0" max="100" step="1" value="${pct||''}" placeholder="0"
          oninput="setLineRemise(${i},this.value)"></div>
      <div class="sum-box" style="margin:0">${pct>0
        ? `<span>Avant ${euro(base)} · −${pct}%</span><b>${euro(net)}</b>`
        : `<span>Montant ligne</span><b>${euro(base)}</b>`}</div>
    </div>`;
}
function setLineRemise(i,v){ let p=+v||0; if(p<0)p=0; if(p>100)p=100; cmdLines[i].remisePct=p; cmdRecalc(); }
function cmdRecalc(){
  const sousTotal = cmdLines.reduce((s,ln)=>s+lineTotal(ln),0); // après remises de ligne
  const gpct = Math.max(0, Math.min(100, +(document.getElementById('f_remiseg')?.value)||0));
  const remiseG = sousTotal*gpct/100;
  const total = Math.max(0, sousTotal - remiseG);
  const mt=document.getElementById('f_mt');
  if(mt && mt.dataset.auto==='1'){ mt.value = total?total.toFixed(2):''; }
  const brk=document.getElementById('priceBreak');
  if(brk){
    if(cmdLines.length){
      brk.style.display='block';
      const remiseLignes = cmdLines.reduce((s,ln)=>s+lineRemiseEuro(ln),0);
      brk.innerHTML =
        `<div style="display:flex;justify-content:space-between"><span>Sous-total (${cmdLines.length} produit(s))</span><b>${euro(cmdLines.reduce((s,ln)=>s+lineTotalBase(ln),0))}</b></div>`+
        (remiseLignes>0?`<div style="display:flex;justify-content:space-between;color:#3f7d52"><span>Remises de ligne</span><b>−${euro(remiseLignes)}</b></div>`:'')+
        (gpct>0?`<div style="display:flex;justify-content:space-between;color:#3f7d52"><span>Remise globale (−${gpct}%)</span><b>−${euro(remiseG)}</b></div>`:'')+
        `<div style="display:flex;justify-content:space-between;border-top:1px solid #e8dccd;margin-top:4px;padding-top:4px"><span><b>Total TTC</b></span><b>${euro(total)}</b></div>`;
    } else brk.style.display='none';
  }
}

async function saveCmd(id){
  // validations par ligne
  if(!cmdLines.length){ toast('Ajoute au moins un produit'); return; }
  for(const ln of cmdLines){
    if(ln.type==='evenement'){
      if((ln.evQte||0)<EVENT_MIN){ toast(`Événement : minimum ${EVENT_MIN} macarons`); return; }
      if((ln.equip||0)<EVENT_MIN_EQUIP){ toast(`Événement : au moins ${EVENT_MIN_EQUIP} pyramide obligatoire`); return; }
    }
    if(ln.type==='grand'){
      const tot=Object.values(ln.items||{}).reduce((s,q)=>s+(+q||0),0);
      if(!tot){ toast('Grand format : sélectionne au moins une pièce'); return; }
    }
    if(ln.type==='coffret' && !ln.taille){ toast('Coffret : choisis une taille'); return; }
    if(ln.type==='don'){
      const tot=Object.values(ln.parfums||{}).reduce((s,q)=>s+(+q||0),0)+Object.values(ln.items||{}).reduce((s,q)=>s+(+q||0),0);
      if(!tot){ toast('Don : indique au moins un macaron offert'); return; }
    }
  }
  // normaliser les lignes (parfums/items en tableaux pour stockage propre), remise de ligne conservée
  const lignes = cmdLines.map(ln=>{
    const rp = Math.max(0,Math.min(100,+ln.remisePct||0));
    if(ln.type==='coffret') return {type:'coffret', taille:ln.taille, remisePct:rp, parfums:Object.keys(ln.parfums).filter(k=>ln.parfums[k]>0).map(nom=>({nom,qte:ln.parfums[nom]}))};
    if(ln.type==='evenement') return {type:'evenement', evQte:ln.evQte, equip:ln.equip, remisePct:rp, parfums:Object.keys(ln.parfums).filter(k=>ln.parfums[k]>0).map(nom=>({nom,qte:ln.parfums[nom]}))};
    if(ln.type==='grand') return {type:'grand', tarif:ln.tarif, remisePct:rp, items:Object.keys(ln.items).filter(k=>ln.items[k]>0).map(nom=>({nom,qte:ln.items[nom]}))};
    if(ln.type==='don') return {type:'don', parfums:Object.keys(ln.parfums||{}).filter(k=>ln.parfums[k]>0).map(nom=>({nom,qte:ln.parfums[nom]})), items:Object.keys(ln.items||{}).filter(k=>ln.items[k]>0).map(nom=>({nom,qte:ln.items[nom]}))};
  });
  const remiseGlobale = Math.max(0, Math.min(100, +val('f_remiseg')||0));
  const o={
    clientId:+val('f_cl')||0, date:val('f_date'),
    lignes, remiseGlobale,
    perso:document.getElementById('f_perso').checked,
    montant:+val('f_mt')||0,
    paiement:val('f_pay')||'En attente', reglement:val('f_reg')||'',
    statut:val('f_st'), notes:val('f_notes'),
    // on neutralise les anciens champs mono-type
    type:'multi', taille:0, parfums:[], evQte:0, equip:0, tarif:'', bigItems:[]
  };
  // BBC : préserver une éventuelle date de paiement existante, puis appliquer l'auto-paiement
  if(id){ const prev=await db.orders.get(id); if(prev && prev.datePaiement) o.datePaiement=prev.datePaiement; }
  applyAutoPay(o);
  if(o.montant<0){toast('Le prix ne peut pas être négatif');return;}
  let oid=id;
  if(id) await db.orders.update(id,o); else oid=await db.orders.add(o);
  // calendrier : recréer l'événement lié
  await db.events.where('refId').equals(oid).delete().catch(()=>{});
  const cb=document.getElementById('f_cal');
  if(cb&&cb.checked){
    const cl = o.clientId ? await db.clients.get(o.clientId) : null;
    await db.events.add({date:o.date,titre:'Cmd '+(cl?cl.nom:'')+` (${lignes.length} produit${lignes.length>1?'s':''})`,type:'cmd',refId:oid});
  }
  closeModal(); renderCmd(); toast('Commande enregistrée ✓');
  // Vérification prévisionnelle immédiate : la commande crée-t-elle un risque sous 8 jours ?
  await checkForecastForOrder(oid);
}
// Contrôle ciblé après création/modif : alerte si CETTE commande (livraison < 8 j) est en stock insuffisant.
async function checkForecastForOrder(orderId){
  try{
    const o = await db.orders.get(orderId);
    if(!o || !o.date) return;
    const dans = daysTo(o.date);
    if(dans===null || dans>=8 || normStatus(o.statut)==='Livrée') return; // hors fenêtre d'alerte
    const f = await computeForecast({horizon:8});
    const dem = _orderParfumDemand(o);
    // y a-t-il un parfum de cette commande en rupture prévisionnelle ?
    const concernes = f.lignes.filter(l=> dem[l.parfum] && l.soldePrev<0);
    if(!concernes.length) return;
    const lignes = concernes.map(l=>`<div class="sum-box"><span>⚠ <b>${esc(l.parfum)}</b></span><b style="color:var(--red,#b3261e)">manque ${qty(l.manque)}</b></div>`).join('');
    openModal(`<h3>⚠ Stock insuffisant pour cette commande</h3>
      <p class="note">Livraison ${dans<=0?"aujourd'hui":'dans '+dans+' jour(s)'} (${fmtDate(o.date)}). Le stock fini actuel ne couvre pas les commandes à venir pour :</p>
      ${lignes}
      <div class="modal-actions">
        <button class="btn ghost" onclick="closeModal()">OK</button>
        <button class="btn gold" onclick="closeModal();view='previsionnel';setActiveView&&setActiveView('previsionnel');renderForecast()">Voir le prévisionnel</button>
      </div>`);
  }catch(e){ /* silencieux */ }
}
async function delCmd(id){
  // Compter ce qui sera impacté pour informer l'utilisateur
  const items = await db.orderItems.where('orderId').equals(id).toArray();
  const totBatch = items.reduce((s,it)=>s+(+it.qte||0),0);
  const ev = await db.events.where('refId').equals(id).toArray().catch(()=>[]);
  const msg = `Supprimer cette commande ?` +
    (totBatch?`\n\n• ${totBatch} macaron(s) de batch(s) lié(s) seront recrédités au stock disponible.`:'') +
    (ev.length?`\n• L'entrée du calendrier sera supprimée.`:'');
  if(!confirm(msg))return;
  await db.transaction('rw',db.orders,db.orderItems,db.productions,db.events,async()=>{
    // 1) recréditer le stock fini des batchs liés
    for(const it of items){
      const prod = await db.productions.get(it.productionId);
      if(prod){ await db.productions.update(prod.id,{qteRestante:(+prod.qteRestante||0)+(+it.qte||0)}); }
    }
    // 2) supprimer les liens
    await db.orderItems.where('orderId').equals(id).delete();
    // 3) supprimer l'événement calendrier lié
    await db.events.where('refId').equals(id).delete();
    // 4) supprimer la commande
    await db.orders.delete(id);
  });
  renderCmd(); toast(totBatch?`Commande supprimée — ${totBatch} macaron(s) recrédité(s) ✓`:'Commande supprimée ✓');
}
// Lier une commande à des batchs (décrémente le stock de produits finis)
async function cmdLink(orderId){
  const prods = await db.productions.toArray();
  const recipes = await db.recipes.toArray();
  const recName = id => (recipes.find(r=>r.id===id)||{}).produitNom||'?';
  const dispo = prods.filter(p=>+p.qteRestante>0);
  const existing = await db.orderItems.where('orderId').equals(orderId).toArray();
  // total de macarons de la commande (coffrets + événement + dons ; les grands formats sont à part)
  const ord = await db.orders.get(orderId);
  const lignes = orderToLines(ord||{});
  let totMac=0, totDon=0;
  lignes.forEach(ln=>{
    if(ln.type==='coffret') totMac += +ln.taille||0;
    else if(ln.type==='evenement') totMac += +ln.evQte||0;
    else if(ln.type==='don'){ const n=(ln.parfums||[]).reduce((s,p)=>s+(+p.qte||0),0); totMac+=n; totDon+=n; }
  });
  const dejaLie = existing.reduce((s,e)=>s+(+e.qte||0),0);
  openModal(`<h3>Lier des batchs à la commande</h3>
    <div class="sum-box"><span>Macarons de la commande${totDon?` (dont ${totDon} offert${totDon>1?'s':''})`:''}</span><b>${totMac||'—'}</b></div>
    ${totMac?`<div class="sum-box"><span>Déjà affecté depuis le stock</span><b>${dejaLie} / ${totMac}</b></div>`:''}
    ${existing.length?`<div class="field" style="margin-top:10px"><label>Batchs déjà liés</label>
      ${existing.map(e=>{const p=prods.find(x=>x.id===e.productionId);
        return `<div class="sum-box"><span>${p?esc(recName(p.recipeId)):'?'} — ${p?esc(p.lotProduction||''):'(supprimé)'} × ${e.qte}</span>
          <span class="act del" onclick="unlinkBatch(${e.id},${orderId})">Détacher</span></div>`;}).join('')}
      </div>`:''}
    ${dispo.length?`
    <div class="field"><label>Ajouter un batch (produit fini disponible)</label>
      <select id="f_prod">${dispo.map(p=>`<option value="${p.id}">${esc(recName(p.recipeId))} — ${esc(p.lotProduction||'')} (reste ${qty(p.qteRestante)})</option>`).join('')}</select></div>
    <div class="field"><label>Quantité à affecter</label><input type="number" id="f_q" value="1"></div>`
    :'<p class="note">Aucun batch disponible à ajouter. Lance une production d\'abord.</p>'}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
    ${dispo.length?`<button class="btn gold" onclick="saveLink(${orderId})">Lier</button>`:''}</div>`);
}
async function unlinkBatch(itemId, orderId){
  const item = await db.orderItems.get(itemId);
  if(!item){ cmdLink(orderId); return; }
  await db.transaction('rw',db.orderItems,db.productions,async()=>{
    const prod = await db.productions.get(item.productionId);
    if(prod){ await db.productions.update(prod.id,{qteRestante:(+prod.qteRestante||0)+(+item.qte||0)}); }
    await db.orderItems.delete(itemId);
  });
  toast('Batch détaché — stock fini restitué'); cmdLink(orderId);
}
async function saveLink(orderId){
  const prodId=+val('f_prod'), q=+val('f_q');
  if(!q||q<=0){toast('Quantité invalide');return;}
  const prod=await db.productions.get(prodId);
  if(q>+prod.qteRestante){toast('Quantité > stock du batch');return;}
  await db.transaction('rw',db.orderItems,db.productions,async()=>{
    await db.orderItems.add({orderId,productionId:prodId,qte:q});
    await db.productions.update(prodId,{qteRestante:+prod.qteRestante - q});
  });
  closeModal(); renderCmd(); toast('Batch lié à la commande ✓');
}

/* ============================================================
   CALENDRIER
   ============================================================ */
let calRef=new Date();
// === insère moteur computeStats (voir stats_engine.js) ===
/* ============================================================
   STATISTIQUES  (commandes payées uniquement — recalcul depuis brut)
   Moteur pur : computeStats(orders, clients, orderToLinesFn)
   Cohérence garantie : tout dérive d'une seule passe sur les lignes.
   ============================================================ */
function computeStats(orders, clients, toLines){
  // Filtre STRICT : commandes payées uniquement (validées). Les annulées sont
  // supprimées de la base, donc absentes. Aucune correction n'est agrégée.
  const valides = (orders||[]).filter(o=>o && o.paiement==='Payé');
  const clientName = id => (clients.find(c=>c.id===id)||{}).nom || '—';

  const global = {
    parfums:{},        // nom -> nb macarons (coffret+événement+don)
    produits:{},       // 'Coffret 16','Événement','Grand format: Chocolat'... -> nb pièces
    coffretsTaille:{}, // taille -> nb de coffrets vendus
    grandFormat:{},    // nom -> nb pièces
    parMois:{},        // 'YYYY-MM' -> {ca, macarons, commandes}
    caTotal:0, nbCommandes:valides.length, nbMacarons:0
  };
  const parClient = {}; // clientId -> {nom, parfums:{}, produits:{}, parMois:{}, ca, nbCommandes, macarons}

  const addP=(obj,k,n)=>{ obj[k]=(obj[k]||0)+n; };

  for(const o of valides){
    const cid=o.clientId||0;
    if(!parClient[cid]) parClient[cid]={nom:clientName(cid), parfums:{}, produits:{}, coffretsTaille:{}, grandFormat:{}, parMois:{}, ca:0, nbCommandes:0, macarons:0};
    const C=parClient[cid];
    C.nbCommandes++; C.ca+=(+o.montant||0); global.caTotal+=(+o.montant||0);
    const mois=(o.date||'').slice(0,7) || 'inconnu';
    if(!global.parMois[mois]) global.parMois[mois]={ca:0,macarons:0,commandes:0};
    if(!C.parMois[mois]) C.parMois[mois]={ca:0,macarons:0,commandes:0};
    global.parMois[mois].ca+=(+o.montant||0); global.parMois[mois].commandes++;
    C.parMois[mois].ca+=(+o.montant||0); C.parMois[mois].commandes++;

    const lignes=toLines(o);
    for(const ln of lignes){
      if(ln.type==='coffret'){
        const lbl='Coffret '+ln.taille;
        addP(global.produits,lbl,1); addP(C.produits,lbl,1);
        addP(global.coffretsTaille,ln.taille,1); addP(C.coffretsTaille,ln.taille,1);
        (ln.parfums||[]).forEach(p=>{ if(p.qte>0){ addP(global.parfums,p.nom,p.qte); addP(C.parfums,p.nom,p.qte);
          global.nbMacarons+=p.qte; C.macarons+=p.qte; global.parMois[mois].macarons+=p.qte; C.parMois[mois].macarons+=p.qte; } });
      } else if(ln.type==='evenement'){
        addP(global.produits,'Événement',1); addP(C.produits,'Événement',1);
        (ln.parfums||[]).forEach(p=>{ if(p.qte>0){ addP(global.parfums,p.nom,p.qte); addP(C.parfums,p.nom,p.qte);
          global.nbMacarons+=p.qte; C.macarons+=p.qte; global.parMois[mois].macarons+=p.qte; C.parMois[mois].macarons+=p.qte; } });
      } else if(ln.type==='grand'){
        (ln.items||[]).forEach(p=>{ if(p.qte>0){ const lbl='Grand format : '+p.nom;
          addP(global.produits,lbl,p.qte); addP(C.produits,lbl,p.qte);
          addP(global.grandFormat,p.nom,p.qte); addP(C.grandFormat,p.nom,p.qte);
          global.nbMacarons+=p.qte; C.macarons+=p.qte; global.parMois[mois].macarons+=p.qte; C.parMois[mois].macarons+=p.qte; } });
      } else if(ln.type==='don'){
        // dons : comptés dans la consommation par parfum (sortie de stock réelle), 0 € donc pas de CA
        addP(global.produits,'Don',1); addP(C.produits,'Don',1);
        (ln.parfums||[]).forEach(p=>{ if(p.qte>0){ addP(global.parfums,p.nom,p.qte); addP(C.parfums,p.nom,p.qte);
          global.nbMacarons+=p.qte; C.macarons+=p.qte; global.parMois[mois].macarons+=p.qte; C.parMois[mois].macarons+=p.qte; } });
        (ln.items||[]).forEach(p=>{ if(p.qte>0){ const lbl='Grand format : '+p.nom;
          addP(global.grandFormat,p.nom,p.qte);
          global.nbMacarons+=p.qte; C.macarons+=p.qte; global.parMois[mois].macarons+=p.qte; C.parMois[mois].macarons+=p.qte; } });
      }
    }
  }
  return {global, parClient, nbValides:valides.length};
}


/* ============================================================
   MODULE ANALYTIQUE AVANCÉ — calculs purs, hors-ligne
   Construit sur computeStats / orderToLines existants.
   Aucune écriture en base : lecture + agrégation uniquement.
   ============================================================ */

// Moyenne / écart-type d'un tableau de nombres
function _mean(a){ return a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0; }
function _std(a){ if(a.length<2) return 0; const m=_mean(a); return Math.sqrt(_mean(a.map(x=>(x-m)*(x-m)))); }

// Liste triée des N derniers mois (clés 'YYYY-MM') présents OU comblés à 0
function _monthsRange(keys){
  if(!keys.length) return [];
  const sorted=[...new Set(keys)].sort();
  const [y0,m0]=sorted[0].split('-').map(Number);
  const [y1,m1]=sorted[sorted.length-1].split('-').map(Number);
  const out=[]; let y=y0,m=m0;
  while(y<y1 || (y===y1&&m<=m1)){ out.push(`${y}-${String(m).padStart(2,'0')}`); m++; if(m>12){m=1;y++;} }
  return out;
}

// ---- ANALYSE DE TENDANCES ----
// Compare les ventes par parfum entre les 2 dernières fenêtres de `windowDays`.
// Retourne {hausses:[], baisses:[], stables:[], periode:{...}}
function analyzeTrends(orders, opts){
  opts=opts||{}; const windowDays=opts.windowDays||30;
  const valides=(orders||[]).filter(o=>o&&o.paiement==='Payé'&&o.date);
  const now = opts.ref ? new Date(opts.ref) : new Date();
  const dayMs=86400000;
  const recentStart=new Date(now-windowDays*dayMs);
  const prevStart=new Date(now-2*windowDays*dayMs);
  const flav=(o)=>{ const acc={}; orderToLines(o).forEach(ln=>{
      (ln.parfums||[]).forEach(p=>{ if(p.qte>0) acc[p.nom]=(acc[p.nom]||0)+p.qte; });
      (ln.items||[]).forEach(p=>{ if(p.qte>0){ const k='Grand format : '+p.nom; acc[k]=(acc[k]||0)+p.qte; } });
    }); return acc; };
  const recent={}, prev={};
  for(const o of valides){
    const d=new Date(o.date);
    const bucket = d>=recentStart ? recent : (d>=prevStart ? prev : null);
    if(!bucket) continue;
    const f=flav(o); for(const k in f) bucket[k]=(bucket[k]||0)+f[k];
  }
  const noms=[...new Set([...Object.keys(recent),...Object.keys(prev)])];
  const rows=noms.map(nom=>{
    const r=recent[nom]||0, p=prev[nom]||0;
    const delta=r-p;
    const pct = p>0 ? (delta/p*100) : (r>0?100:0);
    return {nom, recent:r, prev:p, delta, pct};
  });
  const hausses=rows.filter(x=>x.delta>0).sort((a,b)=>b.pct-a.pct);
  const baisses=rows.filter(x=>x.delta<0).sort((a,b)=>a.pct-b.pct);
  const stables=rows.filter(x=>x.delta===0);
  return {hausses,baisses,stables,windowDays,
    periode:{recentStart:recentStart.toISOString().slice(0,10), now:now.toISOString().slice(0,10)}};
}

// Compare deux parfums (ou produits) similaires sur tout l'historique payé
function compareFlavors(R, a, b){
  const ga=R.global.parfums[a]||0, gb=R.global.parfums[b]||0;
  const mA={}, mB={};
  // reconstruit la série mensuelle par parfum à partir de parClient (approx : on relit global non dispo par mois/parfum)
  return {a:{nom:a,total:ga}, b:{nom:b,total:gb}, diff:ga-gb};
}

// ---- ANALYSE CLIENT ----
// Régularité, valeur, préférences. R = computeStats(...)
function analyzeClients(R, orders){
  const valides=(orders||[]).filter(o=>o&&o.paiement==='Payé'&&o.date);
  // dates de commande par client (pour intervalle moyen entre commandes)
  const datesByClient={};
  for(const o of valides){ (datesByClient[o.clientId||0] ||= []).push(o.date); }
  const rows=Object.keys(R.parClient).map(id=>{
    const C=R.parClient[id];
    const ds=(datesByClient[id]||[]).slice().sort();
    let intervalleMoy=null;
    if(ds.length>=2){
      const gaps=[]; for(let i=1;i<ds.length;i++){ gaps.push((new Date(ds[i])-new Date(ds[i-1]))/86400000); }
      intervalleMoy=_mean(gaps);
    }
    const top=Object.entries(C.parfums).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
    return {id:+id, nom:C.nom, ca:C.ca, nbCommandes:C.nbCommandes, macarons:C.macarons,
      panierMoyen: C.nbCommandes? C.ca/C.nbCommandes : 0,
      intervalleMoy, derniereCmd: ds.length?ds[ds.length-1]:null,
      parfumFavori: top.length?top[0][0]:null, prefs:top.slice(0,3).map(([n,q])=>({nom:n,qte:q}))};
  });
  return {
    parValeur: rows.slice().sort((a,b)=>b.ca-a.ca),
    parFrequence: rows.filter(r=>r.nbCommandes>0).sort((a,b)=>b.nbCommandes-a.nbCommandes),
    parReguliers: rows.filter(r=>r.intervalleMoy!=null).sort((a,b)=>a.intervalleMoy-b.intervalleMoy),
    all: rows
  };
}

// ---- ANALYSE D'ANOMALIES ----
// 1) Mois de vente atypiques (z-score sur le CA mensuel)
// 2) Incohérences production / ventes / stock
function analyzeAnomalies(R){
  const months=_monthsRange(Object.keys(R.global.parMois));
  const caSerie=months.map(m=>(R.global.parMois[m]||{}).ca||0);
  const mac=months.map(m=>(R.global.parMois[m]||{}).macarons||0);
  const m=_mean(caSerie), sd=_std(caSerie);
  const outliers=[];
  months.forEach((mo,i)=>{
    if(sd>0){ const z=(caSerie[i]-m)/sd; if(Math.abs(z)>=1.6) outliers.push({mois:mo, ca:caSerie[i], z, sens:z>0?'haut':'bas'}); }
  });
  return {months, caSerie, macSerie:mac, moyenneCA:m, ecartType:sd, outliers};
}

// Rapproche stock fini (productions.qteRestante) et consommation récente pour
// détecter les risques de rupture. Retourne par recette un état de couverture.
// ---- PRÉVISIONNEL STOCKS / COMMANDES ----
// Construit l'état prévisionnel par parfum : stock fini actuel, réservations datées
// (commandes futures non livrées), solde prévisionnel et risques de rupture.
// Tout est calculé sur les données réelles du jour (today()).
function _orderParfumDemand(o){
  // renvoie {parfum: qte} pour une commande (coffret/événement/don = macarons ; grand format = pièces)
  const acc={};
  orderToLines(o).forEach(ln=>{
    (ln.parfums||[]).forEach(p=>{ if(+p.qte>0) acc[p.nom]=(acc[p.nom]||0)+(+p.qte); });
    (ln.items||[]).forEach(p=>{ if(+p.qte>0){ const k=p.nom; acc[k]=(acc[k]||0)+(+p.qte); } });
  });
  return acc;
}
async function computeForecast(opts){
  opts=opts||{};
  const horizon = opts.horizon!=null ? opts.horizon : 8;     // seuil d'alerte en jours
  const recipes = await db.recipes.toArray();
  const prods = await db.productions.toArray();
  const orders = await db.orders.toArray();
  const norm = s=>aiNormalize(s);

  // 1) STOCK FINI ACTUEL par parfum (somme des batchs restants, regroupés par recette/produitNom)
  const stockByParfum = {};
  prods.forEach(p=>{
    const r = recipes.find(x=>x.id===p.recipeId);
    const nom = r ? r.produitNom : ('Recette #'+p.recipeId);
    stockByParfum[nom] = (stockByParfum[nom]||0) + (+p.qteRestante||0);
  });

  // 2) RÉSERVATIONS : commandes à honorer (date >= aujourd'hui) et non livrées
  const todayStr = today();
  const futureOrders = orders.filter(o=> o.date && o.date>=todayStr && normStatus(o.statut)!=='Livrée');
  // demande par parfum (toutes commandes futures) + détail daté par parfum
  const reservedByParfum = {};       // parfum -> qte totale réservée
  const datedByParfum = {};          // parfum -> [{date, qte, orderId, clientId, dans}]
  futureOrders.forEach(o=>{
    const dem=_orderParfumDemand(o);
    const dans = daysTo(o.date); // jours avant livraison (0 = aujourd'hui)
    for(const nom in dem){
      reservedByParfum[nom] = (reservedByParfum[nom]||0) + dem[nom];
      (datedByParfum[nom] ||= []).push({date:o.date, qte:dem[nom], orderId:o.id, clientId:o.clientId||0, dans});
    }
  });

  // 3) PROJECTION par parfum : trie les réservations par date, calcule le solde courant
  const parfums = [...new Set([...Object.keys(stockByParfum), ...Object.keys(reservedByParfum)])];
  const lignes = parfums.map(nom=>{
    const stock = stockByParfum[nom]||0;
    const resv = (datedByParfum[nom]||[]).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    let solde = stock;
    let firstShortDate=null, firstShortDans=null, manqueTotal=0;
    const echeances = resv.map(r=>{
      solde -= r.qte;
      const rupture = solde < 0;
      if(rupture && firstShortDate===null){ firstShortDate=r.date; firstShortDans=r.dans; }
      return {...r, soldeApres:solde, rupture};
    });
    const reserved = resv.reduce((s,r)=>s+r.qte,0);
    const soldePrev = stock - reserved;
    if(soldePrev<0) manqueTotal = -soldePrev;
    // alerte si une rupture survient pour une livraison dans < horizon jours
    const alerte = echeances.some(e=> e.rupture && e.dans!=null && e.dans < horizon);
    return {parfum:nom, stock, reserved, soldePrev, manque:manqueTotal,
      firstShortDate, firstShortDans, alerte, echeances};
  }).sort((a,b)=>{
    // priorité : alerte d'abord, puis solde prévisionnel croissant
    if(a.alerte!==b.alerte) return a.alerte?-1:1;
    return a.soldePrev-b.soldePrev;
  });

  const alertes = lignes.filter(l=>l.alerte);
  return {horizon, todayStr, lignes, alertes,
    nbFutur:futureOrders.length,
    nbParfumsRupture: lignes.filter(l=>l.soldePrev<0).length};
}
// Résumé court des alertes pour la popup quotidienne.
async function forecastAlerts(){
  const f = await computeForecast({horizon:8});
  return f.alertes;
}

async function analyzeStockCoverage(orders){
  const recipes=await db.recipes.toArray();
  const prods=await db.productions.toArray();
  // stock fini par recette
  const finiByRecipe={};
  prods.forEach(p=>{ finiByRecipe[p.recipeId]=(finiByRecipe[p.recipeId]||0)+(+p.qteRestante||0); });
  // demande par parfum sur 60j (commandes payées + à préparer = engagement réel)
  const now=new Date(), since=new Date(now-60*86400000);
  const demande={};
  (orders||[]).forEach(o=>{
    if(!o.date) return; if(new Date(o.date)<since) return;
    if(o.paiement!=='Payé' && normStatus(o.statut)!=='À préparer') return;
    orderToLines(o).forEach(ln=>{ (ln.parfums||[]).forEach(p=>{ if(p.qte>0) demande[p.nom]=(demande[p.nom]||0)+p.qte; }); });
  });
  return {recipes, finiByRecipe, demande60j:demande};
}

// ---- BESOINS MATIÈRES depuis des commandes planifiées (à préparer) ----
// Calcule, par recette dont le nom matche un parfum demandé, le nombre de batchs
// nécessaires puis les besoins en matières premières via le BOM.
async function computeMaterialNeeds(orders, opts){
  opts=opts||{};
  const recipes=await db.recipes.toArray();
  const recipeItems=await db.recipeItems.toArray();
  const materials=await db.materials.toArray();
  const matById=Object.fromEntries(materials.map(m=>[m.id,m]));
  // demande par parfum sur les commandes "à préparer" (ou filtre fourni)
  const cible=(orders||[]).filter(o=> opts.all ? true : normStatus(o.statut)==='À préparer');
  const demande={};
  cible.forEach(o=> orderToLines(o).forEach(ln=>{
    (ln.parfums||[]).forEach(p=>{ if(p.qte>0) demande[p.nom]=(demande[p.nom]||0)+p.qte; });
  }));
  // associe parfum -> recette par nom (tolérant)
  const norm=s=>aiNormalize(s);
  const findRecipe=nom=>{
    const n=norm(nom);
    return recipes.find(r=> norm(r.produitNom)===n)
        || recipes.find(r=> norm(r.produitNom).includes(n) || n.includes(norm(r.produitNom)));
  };
  const batchsParRecette={}, sansRecette=[];
  for(const nom in demande){
    const r=findRecipe(nom);
    if(!r){ sansRecette.push({parfum:nom, qte:demande[nom]}); continue; }
    const rdt=+r.rendement||1;
    const nbBatchs=Math.ceil(demande[nom]/rdt);
    batchsParRecette[r.id]=(batchsParRecette[r.id]||0)+nbBatchs;
  }
  // besoins matières = somme(batchs * qteParBatch)
  const besoins={}; // materialId -> qte
  for(const rid in batchsParRecette){
    const items=recipeItems.filter(it=>it.recipeId===+rid);
    items.forEach(it=>{ besoins[it.materialId]=(besoins[it.materialId]||0)+batchsParRecette[rid]*(+it.qteParBatch||0); });
  }
  // confronte au stock courant
  const lots=await db.materialLots.toArray();
  const stockById={}; lots.forEach(l=>{ stockById[l.materialId]=(stockById[l.materialId]||0)+(+l.qteRestante||0); });
  const matLignes=Object.keys(besoins).map(id=>{
    const m=matById[id]||{nom:'(matière supprimée)',unite:''};
    const requis=besoins[id], dispo=stockById[id]||0;
    return {id:+id, nom:m.nom, unite:m.unite||'', requis, dispo, manque:Math.max(0,requis-dispo)};
  }).sort((a,b)=>b.manque-a.manque || b.requis-a.requis);
  return {demande, batchsParRecette, recipes, matLignes, sansRecette};
}


// Barre horizontale simple (rang) sans dépendance
function statBars(obj, opt){
  opt=opt||{};
  const entries=Object.entries(obj).filter(([k,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  if(!entries.length) return '<p class="note">Aucune donnée.</p>';
  const max=entries[0][1];
  const unit=opt.unit||'';
  return '<div style="display:flex;flex-direction:column;gap:7px">'+entries.map(([k,v])=>{
    const pct=Math.round(v/max*100);
    return `<div style="display:flex;align-items:center;gap:10px">
      <div style="flex:0 0 42%;font-size:.82rem;color:var(--ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(k)}</div>
      <div style="flex:1;background:var(--creme-2);border-radius:6px;height:18px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--caramel)"></div></div>
      <div style="flex:0 0 auto;font-weight:600;color:var(--bordeaux);font-size:.82rem;min-width:36px;text-align:right">${qty(v)}${unit}</div>
    </div>`;
  }).join('')+'</div>';
}

let statClientSel = 0;
async function renderStats(){
  const orders = await db.orders.toArray();
  const clients = await db.clients.toArray();
  const R = computeStats(orders, clients, orderToLines);
  const G = R.global;
  const moisKeys = Object.keys(G.parMois).sort();
  const fmtMois = k => { const [y,m]=k.split('-'); return ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'][(+m||1)-1]+' '+(y||'').slice(2); };

  // graphe CA mensuel
  const caSerie={label:'CA', color:'#3f7d52', points:moisKeys.map(k=>({x:k,y:G.parMois[k].ca}))};
  const macSerie={label:'Macarons', color:'#AA7C39', points:moisKeys.map(k=>({x:k,y:G.parMois[k].macarons}))};
  const caChart = moisKeys.length ? lineChart([caSerie],{xlabel:fmtMois, ylabel:'€'}) : '<p class="note">Pas encore de données mensuelles.</p>';
  const macChart = moisKeys.length ? lineChart([macSerie],{xlabel:fmtMois}) : '';

  // sélecteur client
  const clientsAvecCmd = Object.keys(R.parClient).map(id=>({id:+id, ...R.parClient[id]})).sort((a,b)=>b.ca-a.ca);
  const clOpts = '<option value="0">— Vue globale —</option>'+clientsAvecCmd.map(c=>`<option value="${c.id}" ${statClientSel===c.id?'selected':''}>${esc(c.nom)} (${euro(c.ca)})</option>`).join('');

  let clientBlock='';
  if(statClientSel && R.parClient[statClientSel]){
    const C=R.parClient[statClientSel];
    const cMois=Object.keys(C.parMois).sort();
    const cChart = cMois.length ? lineChart([{label:'Macarons', color:'#AA7C39', points:cMois.map(k=>({x:k,y:C.parMois[k].macarons}))}],{xlabel:fmtMois}) : '<p class="note">—</p>';
    clientBlock=`
     <div class="panel"><h2>Consommation par parfum — ${esc(C.nom)}</h2>${statBars(C.parfums)}</div>
     <div class="panel"><h2>Préférences par produit — ${esc(C.nom)}</h2>${statBars(C.produits)}</div>
     <div class="panel"><h2>Évolution dans le temps — ${esc(C.nom)}</h2>
       <div class="sum-box"><span>Commandes payées</span><b>${C.nbCommandes}</b></div>
       <div class="sum-box"><span>Chiffre d'affaires</span><b>${euro(C.ca)}</b></div>
       <div class="sum-box"><span>Macarons (dons inclus)</span><b>${qty(C.macarons)}</b></div>
       <div style="margin-top:12px">${cChart}</div></div>`;
  }

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Statistiques</h1><p>Commandes payées uniquement · ${R.nbValides} commande(s) · ${euro(G.caTotal)}</p></div></div>
   <div class="banner">📊 <div>Analyse fondée exclusivement sur les commandes <b>payées</b>. Les annulations (supprimées) et les commandes en attente sont exclues. Les dons sont comptés dans la consommation de macarons.</div></div>

   <div class="panel"><h2>Analyse par client</h2>
     <div class="field"><label>Choisir un client</label><select id="statCl" onchange="statClientSel=+this.value;renderStats()">${clOpts}</select></div>
     ${statClientSel?'':'<p class="note">Sélectionne un client pour voir sa consommation par parfum, ses préférences produit et son évolution.</p>'}
   </div>
   ${clientBlock}

   <h2 style="font-family:'Fraunces',serif;color:var(--bordeaux);margin:24px 0 4px;font-size:1.3rem">Vue globale</h2>
   <div class="panel"><h2>Tendances par parfum <span style="font-weight:400;font-size:.8rem;color:#9a8a82">— tous produits, dons inclus</span></h2>${statBars(G.parfums)}</div>
   <div class="panel"><h2>Produits les plus vendus</h2>${statBars(G.produits, {unit:''})}</div>
   <div class="panel"><h2>Évolution des coffrets <span style="font-weight:400;font-size:.8rem;color:#9a8a82">— par taille</span></h2>
     ${Object.keys(G.coffretsTaille).length?statBars(Object.fromEntries(Object.entries(G.coffretsTaille).map(([t,n])=>['Coffret '+t,n]))):'<p class="note">Aucun coffret vendu.</p>'}
   </div>
   <div class="panel"><h2>Chiffre d'affaires mensuel</h2>${caChart}</div>
   <div class="panel"><h2>Macarons écoulés par mois</h2>${macChart||'<p class="note">—</p>'}</div>`;
}

/* ============================================================
   ANALYSE & PRODUCTION — tableau de bord décisionnel
   ============================================================ */
let anaWindow = 30; // fenêtre de tendance en jours
async function renderAnalyse(){
  const orders=await db.orders.toArray();
  const clients=await db.clients.toArray();
  const R=computeStats(orders,clients,orderToLines);

  // --- TENDANCES ---
  const T=analyzeTrends(orders,{windowDays:anaWindow});
  const trendRow=(x,up)=>`<div class="sum-box"><span>${up?'▲':'▼'} ${esc(x.nom)}</span>
    <b style="color:${up?'#3f7d52':'var(--red,#b3261e)'}">${x.prev>0?(x.pct>0?'+':'')+Math.round(x.pct)+'%':'nouveau'} <span style="font-weight:400;color:#9a8a82">(${qty(x.prev)}→${qty(x.recent)})</span></b></div>`;
  const trendBlock=`
   <div class="panel"><h2>Tendances de consommation
     <span style="font-weight:400;font-size:.8rem;color:#9a8a82">— ${anaWindow} derniers jours vs ${anaWindow} précédents</span></h2>
     <div class="field" style="max-width:240px"><label>Fenêtre de comparaison</label>
       <select onchange="anaWindow=+this.value;renderAnalyse()">
         ${[7,14,30,60,90].map(d=>`<option value="${d}" ${anaWindow===d?'selected':''}>${d} jours</option>`).join('')}
       </select></div>
     ${(T.hausses.length||T.baisses.length)?'':'<p class="note">Pas assez de données sur la période pour dégager une tendance.</p>'}
     ${T.hausses.length?`<h3 style="font-size:.92rem;margin:10px 0 4px;color:#3f7d52">En hausse</h3>${T.hausses.slice(0,6).map(x=>trendRow(x,true)).join('')}`:''}
     ${T.baisses.length?`<h3 style="font-size:.92rem;margin:12px 0 4px;color:var(--red,#b3261e)">En baisse</h3>${T.baisses.slice(0,6).map(x=>trendRow(x,false)).join('')}`:''}
   </div>`;

  // --- CLIENTS ---
  const A=analyzeClients(R,orders);
  const valLine=c=>`<div class="sum-box"><span><span class="link-name" onclick="clientForm(${c.id})">${esc(c.nom)}</span></span><b>${euro(c.ca)} · ${c.nbCommandes} cmd · panier ${euro(c.panierMoyen)}</b></div>`;
  const freqLine=c=>`<div class="sum-box"><span><span class="link-name" onclick="clientForm(${c.id})">${esc(c.nom)}</span></span><b>${c.nbCommandes} commandes${c.intervalleMoy!=null?' · ~'+Math.round(c.intervalleMoy)+' j entre cmd':''}</b></div>`;
  const prefLine=c=>`<div class="sum-box"><span><span class="link-name" onclick="clientForm(${c.id})">${esc(c.nom)}</span></span><b>${c.parfumFavori?esc(c.parfumFavori):'—'}</b></div>`;
  const clientBlock=`
   <div class="panel"><h2>Clients à forte valeur <span style="font-weight:400;font-size:.8rem;color:#9a8a82">— CA cumulé</span></h2>
     ${A.parValeur.length?A.parValeur.slice(0,8).map(valLine).join(''):'<p class="note">Aucune commande payée.</p>'}</div>
   <div class="panel"><h2>Clients les plus réguliers <span style="font-weight:400;font-size:.8rem;color:#9a8a82">— fréquence & cadence</span></h2>
     ${A.parReguliers.length?A.parReguliers.slice(0,8).map(freqLine).join(''):
       (A.parFrequence.length?A.parFrequence.slice(0,8).map(freqLine).join(''):'<p class="note">—</p>')}</div>
   <div class="panel"><h2>Préférence récurrente par client</h2>
     ${A.all.filter(c=>c.parfumFavori).length?A.all.filter(c=>c.parfumFavori).slice(0,10).map(prefLine).join(''):'<p class="note">—</p>'}</div>`;

  // --- ANOMALIES ---
  const AN=analyzeAnomalies(R);
  const anoBlock=`
   <div class="panel"><h2>Détection d'anomalies <span style="font-weight:400;font-size:.8rem;color:#9a8a82">— CA mensuel</span></h2>
     <div class="sum-box"><span>CA mensuel moyen</span><b>${euro(AN.moyenneCA)}</b></div>
     ${AN.outliers.length?AN.outliers.map(o=>`<div class="sum-box"><span>${o.sens==='haut'?'⚡':'⚠'} ${o.mois}</span>
        <b style="color:${o.sens==='haut'?'#3f7d52':'var(--red,#b3261e)'}">${euro(o.ca)} — ${o.sens==='haut'?'pic inhabituel':'creux inhabituel'} (z=${o.z.toFixed(1)})</b></div>`).join(''):
       '<p class="note">Aucune variation mensuelle inhabituelle détectée.</p>'}</div>`;

  // --- PRODUCTION : besoins matières depuis commandes à préparer ---
  const N=await computeMaterialNeeds(orders);
  const demandeEntries=Object.entries(N.demande).filter(([,q])=>q>0).sort((a,b)=>b[1]-a[1]);
  const prodSugg = demandeEntries.length
    ? demandeEntries.map(([nom,q])=>{
        const rid=Object.keys(N.batchsParRecette).find(id=>{ const r=N.recipes.find(x=>x.id===+id); return r && aiNormalize(r.produitNom).includes(aiNormalize(nom).slice(0,4)); });
        const r=rid?N.recipes.find(x=>x.id===+rid):null;
        const rdt=r?(+r.rendement||1):null;
        const batchs=rdt?Math.ceil(q/rdt):null;
        return `<div class="sum-box"><span>${esc(nom)}</span><b>${qty(q)} pièce(s)${batchs?` · ${batchs} batch(s)`:' · pas de recette liée'}</b></div>`;
      }).join('')
    : '<p class="note">Aucune commande « À préparer ». Les suggestions de production apparaîtront ici dès qu\'une commande est planifiée.</p>';
  const matBlock = N.matLignes.length
    ? `<div class="table-wrap"><table><thead><tr><th>Matière</th><th>Requis</th><th>Stock</th><th>Manque</th></tr></thead><tbody>
        ${N.matLignes.map(m=>`<tr${m.manque>0?' style="background:#fdf3f2"':''}><td>${esc(m.nom)}</td>
          <td>${qty(m.requis)} ${esc(m.unite)}</td><td>${qty(m.dispo)} ${esc(m.unite)}</td>
          <td style="font-weight:600;color:${m.manque>0?'var(--red,#b3261e)':'#3f7d52'}">${m.manque>0?qty(m.manque)+' '+esc(m.unite):'OK'}</td></tr>`).join('')}
       </tbody></table></div>`
    : '<p class="note">Aucun besoin matière calculé (aucune recette liée aux commandes à préparer).</p>';
  const sansRec = N.sansRecette.length
    ? `<p class="note" style="color:var(--red,#b3261e)">⚠ Parfums demandés sans recette définie : ${N.sansRecette.map(x=>esc(x.parfum)).join(', ')}. Créez la recette (BOM) pour intégrer leurs besoins matières.</p>`
    : '';

  // --- RENDEMENT : écarts théorique vs réel historisés sur les productions ---
  const allProds = await db.productions.toArray();
  const prodRecipes = await db.recipes.toArray();
  const recNm = id => (prodRecipes.find(r=>r.id===id)||{}).produitNom||'(recette supprimée)';
  const withEcart = allProds.filter(p=>p.qteTheorique>0 && p.qteReelle!=null);
  const byRec={};
  withEcart.forEach(p=>{ (byRec[p.recipeId] ||= {th:0,re:0,n:0,pertes:0,surplus:0});
    const b=byRec[p.recipeId]; b.th+=+p.qteTheorique; b.re+=+p.qteReelle; b.n++;
    const e=(+p.ecart||((+p.qteReelle)-(+p.qteTheorique))); if(e<0) b.pertes+=-e; else b.surplus+=e; });
  const totTh=withEcart.reduce((s,p)=>s+(+p.qteTheorique||0),0);
  const totRe=withEcart.reduce((s,p)=>s+(+p.qteReelle||0),0);
  const rendGlobal = totTh? Math.round(totRe/totTh*1000)/10 : null;
  const recRows=Object.keys(byRec).map(rid=>{
    const b=byRec[rid]; const r=b.th? Math.round(b.re/b.th*1000)/10 : 0;
    return {nom:recNm(+rid), th:b.th, re:b.re, n:b.n, rendement:r, pertes:b.pertes, surplus:b.surplus};
  }).sort((a,b)=>a.rendement-b.rendement);
  const rendBlock = withEcart.length
    ? `<div class="sum-box"><span>Rendement réel global <span style="font-weight:400;color:#9a8a82">(${withEcart.length} batch)</span></span><b style="color:${rendGlobal<100?'var(--red,#b3261e)':'#3f7d52'}">${rendGlobal}%</b></div>
       <div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Produit</th><th>Théo.</th><th>Réel</th><th>Rdt</th><th>Pertes</th></tr></thead><tbody>
         ${recRows.map(x=>`<tr><td>${esc(x.nom)}</td><td>${qty(x.th)}</td><td>${qty(x.re)}</td>
           <td style="font-weight:600;color:${x.rendement<100?'var(--red,#b3261e)':'#3f7d52'}">${x.rendement}%</td>
           <td>${x.pertes?qty(x.pertes):'—'}</td></tr>`).join('')}
       </tbody></table></div>`
    : '<p class="note">Aucun écart de production enregistré pour l\'instant. Renseignez une quantité réelle différente du théorique pour suivre le rendement.</p>';

  const prodBlock=`
   <div class="panel"><h2>Suggestion de production <span style="font-weight:400;font-size:.8rem;color:#9a8a82">— d'après les commandes à préparer</span></h2>
     ${prodSugg}</div>
   <div class="panel"><h2>Besoins en matières premières</h2>${matBlock}${sansRec}</div>
   <div class="panel"><h2>Rendement de production <span style="font-weight:400;font-size:.8rem;color:#9a8a82">— écarts théorique / réel</span></h2>${rendBlock}</div>`;

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Analyse &amp; Production</h1><p>Décisions opérationnelles · 100% hors-ligne</p></div></div>
   <div class="banner">🧭 <div>Vue décisionnelle : tendances, clients clés, anomalies, et besoins de production calculés à partir de vos commandes et recettes. Aucune donnée ne quitte l'appareil.</div></div>
   ${trendBlock}
   <h2 style="font-family:'Fraunces',serif;color:var(--bordeaux);margin:24px 0 4px;font-size:1.3rem">Clients</h2>
   ${clientBlock}
   <h2 style="font-family:'Fraunces',serif;color:var(--bordeaux);margin:24px 0 4px;font-size:1.3rem">Anomalies</h2>
   ${anoBlock}
   <h2 style="font-family:'Fraunces',serif;color:var(--bordeaux);margin:24px 0 4px;font-size:1.3rem">Production</h2>
   ${prodBlock}`;
}

/* ============================================================
   PRÉVISIONNEL STOCKS / COMMANDES — écran d'anticipation
   ============================================================ */
async function renderForecast(){
  const f = await computeForecast({horizon:8});
  const dateBadge = (d,dans)=>{
    if(d==null) return '—';
    const cls = dans!=null && dans<8 ? 'low' : (dans!=null && dans<=14 ? 'warn' : 'ok');
    return `${fmtDate(d)} <span class="tag ${cls}">${dans!=null?(dans<=0?"aujourd'hui":'J−'+dans):''}</span>`;
  };
  const bannerTxt = f.alertes.length
    ? `⚠ ${f.alertes.length} parfum(s) en risque de rupture pour une livraison sous ${f.horizon} jours. Planifiez une production.`
    : `✅ Aucun risque de rupture détecté sous ${f.horizon} jours sur les ${f.nbFutur} commande(s) à venir.`;

  const rows = f.lignes.map(l=>{
    const soldeColor = l.soldePrev<0 ? 'var(--red,#b3261e)' : (l.soldePrev<=5 ? 'var(--caramel)' : '#3f7d52');
    const etat = l.alerte
      ? `<span class="tag low">rupture sous ${f.horizon} j</span>`
      : (l.soldePrev<0 ? '<span class="tag warn">à produire</span>' : '<span class="tag ok">OK</span>');
    const dateInfo = l.firstShortDate ? dateBadge(l.firstShortDate, l.firstShortDans) : '—';
    return `<tr ${l.alerte?'style="background:#fdf3f2"':''}>
      <td><b>${esc(l.parfum)}</b></td>
      <td>${qty(l.stock)}</td>
      <td>${qty(l.reserved)}</td>
      <td style="font-weight:700;color:${soldeColor}">${qty(l.soldePrev)}</td>
      <td>${l.manque>0?`<b style="color:var(--red,#b3261e)">${qty(l.manque)}</b>`:'—'}</td>
      <td>${dateInfo}</td>
      <td>${etat}</td></tr>`;
  }).join('');

  // détail des échéances en rupture (pour planifier les journées de production)
  const detailRupture = f.lignes.filter(l=>l.echeances.some(e=>e.rupture)).map(l=>{
    const ech = l.echeances.filter(e=>e.rupture).map(e=>
      `<div class="sum-box"><span>${fmtDate(e.date)} ${e.dans!=null?`<span style="color:#9a8a82">(J−${Math.max(0,e.dans)})</span>`:''} · cmd #${e.orderId}</span><b style="color:var(--red,#b3261e)">manque ${qty(-e.soldeApres)}</b></div>`).join('');
    return `<div class="panel"><h2>${esc(l.parfum)} <span style="font-weight:400;font-size:.8rem;color:#9a8a82">— stock ${qty(l.stock)}, réservé ${qty(l.reserved)}</span></h2>${ech}</div>`;
  }).join('');

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Prévisionnel stocks</h1><p>Anticipation des ruptures · données du ${fmtDate(f.todayStr)}</p></div>
     <button class="btn ghost sm" onclick="renderForecast()">↻ Réévaluer</button></div>
   <div class="banner" style="${f.alertes.length?'background:#fdf3f2;border-color:#f0c9c4':''}">${f.alertes.length?'⚠':'🔮'} <div>${bannerTxt}</div></div>
   <div class="panel"><h2>Stock prévisionnel par parfum</h2>
   ${f.lignes.length?`<div class="table-wrap"><table><thead><tr><th>Parfum</th><th>Stock actuel</th><th>Réservé</th><th>Prévisionnel</th><th>Manque</th><th>1ère rupture</th><th>État</th></tr></thead>
     <tbody>${rows}</tbody></table></div>
     <p class="note">« Réservé » = macarons engagés par les commandes à venir non livrées. « Prévisionnel » = stock fini actuel − réservé. Une rupture sous ${f.horizon} jours déclenche une alerte.</p>`
     :`<div class="empty">Aucune donnée. Lancez des productions et créez des commandes pour activer le prévisionnel.</div>`}
   </div>
   ${detailRupture?`<h2 style="font-family:'Fraunces',serif;color:var(--bordeaux);margin:20px 0 4px;font-size:1.2rem">Échéances en rupture</h2>${detailRupture}`:''}`;
}

// === insère le moteur parseIntent (voir ai_engine.js) ===
/* ============================================================
   ASSISTANT IA INTERNE — analyseur d'intentions hors-ligne
   parseIntent(texte, ctx) -> {intent, params, critical, label}
   Aucune dépendance réseau. Reconnaissance par motifs FR.
   ctx = {flavors:[...], clients:[{id,nom,tel}], materials:[{id,nom}]}
   ============================================================ */
function aiNormalize(s){
  return (s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // enlève accents
    .replace(/['']/g,"'").replace(/\s+/g,' ').trim();
}
// extrait un nombre écrit en chiffres ou en lettres (1..20 + dizaines simples)
function aiParseNumber(txt){
  const mots={un:1,une:1,deux:2,trois:3,quatre:4,cinq:5,six:6,sept:7,huit:8,neuf:9,dix:10,
    onze:11,douze:12,treize:13,quatorze:14,quinze:15,seize:16,vingt:20,trente:30,quarante:40,cinquante:50,cent:100};
  const m=txt.match(/\b(\d+(?:[.,]\d+)?)\b/);
  if(m) return parseFloat(m[1].replace(',','.'));
  for(const k in mots){ if(new RegExp('\\b'+k+'\\b').test(txt)) return mots[k]; }
  return null;
}
// résout une date relative -> 'YYYY-MM-DD'
function aiParseDate(txt, base){
  const d = base ? new Date(base) : new Date();
  const jours={dimanche:0,lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6};
  if(/\baujourd'?hui\b/.test(txt)){ return d.toISOString().slice(0,10); }
  if(/\bdemain\b/.test(txt)){ d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); }
  if(/\bapres-demain\b/.test(txt)){ d.setDate(d.getDate()+2); return d.toISOString().slice(0,10); }
  for(const j in jours){
    if(new RegExp('\\b'+j+'\\b').test(txt)){
      // prochain jour de semaine correspondant
      const target=jours[j]; let delta=(target - d.getDay() + 7) % 7; if(delta===0) delta=7;
      d.setDate(d.getDate()+delta); return d.toISOString().slice(0,10);
    }
  }
  // date explicite jj/mm ou jj/mm/aaaa
  const m=txt.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if(m){ let y=m[3]?(+m[3]<100?2000+ +m[3]:+m[3]):d.getFullYear(); const mo=String(+m[2]).padStart(2,'0'); const da=String(+m[1]).padStart(2,'0'); return `${y}-${mo}-${da}`; }
  return null;
}
// retrouve un parfum mentionné
function aiFindFlavor(txt, flavors){
  for(const f of flavors){ if(aiNormalize(txt).includes(aiNormalize(f))) return f; }
  // mots-clés partiels
  const map={chocolat:'Chocolat noir', vanille:'Vanille', framboise:'Framboise', pistache:'Pistache',
    citron:'Citron crémeux', cafe:'Café', caramel:'Caramel beurre salé', coco:'Coco Rafaello',
    praline:'Praliné noisettes', popcorn:'Popcorn', cannelle:'Cannelle noisette'};
  const n=aiNormalize(txt);
  for(const k in map){ if(n.includes(k) && flavors.includes(map[k])) return map[k]; }
  return null;
}
// retrouve une matière (signale l ambiguite si plusieurs correspondent)
function aiFindMaterial(txt, materials){
  const n=aiNormalize(txt);
  const exacts=materials.filter(m=>n.includes(aiNormalize(m.nom)));
  if(exacts.length===1) return exacts[0];
  if(exacts.length>1){ const r=exacts.slice().sort((a,b)=>b.nom.length-a.nom.length)[0]; r._ambig=exacts.map(m=>m.nom); return r; }
  const kw={chocolat:'chocolat',amande:'amande',sucre:'sucre',oeuf:'oeuf',creme:'creme',vanille:'vanille',colorant:'colorant',praline:'praline'};
  for(const k in kw){
    if(n.includes(k)){
      const matches=materials.filter(m=>aiNormalize(m.nom).includes(k));
      if(matches.length===1) return matches[0];
      if(matches.length>1){ const r=matches[0]; r._ambig=matches.map(m=>m.nom); return r; }
    }
  }
  return null;
}
// retrouve un client par nom (tolérant : "M. Dupont", "monsieur dupont", "dupont")
function aiFindClient(txt, clients){
  const n=aiNormalize(txt).replace(/\b(m|mr|mme|monsieur|madame|melle|mlle)\b\.?/g,' ').replace(/\s+/g,' ').trim();
  let best=null;
  for(const c of clients){
    const cn=aiNormalize(c.nom);
    if(n.includes(cn)){ if(!best||cn.length>best.score) best={client:c,score:cn.length}; }
    else { // match sur le dernier mot (nom de famille)
      const parts=cn.split(' '); const last=parts[parts.length-1];
      if(last.length>=3 && new RegExp('\\b'+last+'\\b').test(n)){ if(!best) best={client:c,score:last.length}; }
    }
  }
  return best?best.client:null;
}

function parseIntent(texte, ctx){
  ctx=ctx||{}; const flavors=ctx.flavors||[]; const clients=ctx.clients||[]; const materials=ctx.materials||[];
  const raw=texte||''; const t=aiNormalize(raw);
  if(!t) return {intent:'unknown', params:{}, critical:false};

  // ---- ACTIONS CRITIQUES prioritaires sur les consultations homonymes ----
  // ajuster le stock (doit passer avant query_stock car contient "stock")
  if(/\b(ajuste|ajuster|corrige|corriger|fixe|mets|met|regle|regler)\b/.test(t) && /stock/.test(t)){
    const mat=aiFindMaterial(t,materials); const nb=aiParseNumber(t);
    return {intent:'adjust_stock', critical:true, params:{material:mat, value:nb},
      label:`Ajuster le stock${mat?' de '+mat.nom:''}${nb!=null?' à '+nb:''}`};
  }

  // ---- CONSULTATIONS (non critiques) ----
  // stock d'une matière
  if(/\b(stock|combien|reste|il reste|quantite)\b/.test(t) && !/commande/.test(t)){
    const mat=aiFindMaterial(t,materials);
    return {intent:'query_stock', params:{material:mat}, critical:false,
      label: mat?`Consulter le stock de « ${mat.nom} »`:'Consulter le stock'};
  }
  // commandes à préparer / à une date
  if(/\b(commande|commandes)\b/.test(t) && /\b(a preparer|preparer|affiche|montre|liste|voir|quelles)\b/.test(t)){
    const date=aiParseDate(t);
    return {intent:'query_orders', params:{date, statut: /preparer/.test(t)?'À préparer':null}, critical:false,
      label: date?`Afficher les commandes du ${date}`:'Afficher les commandes à préparer'};
  }
  // top clients par parfum
  if(/\b(client|clients)\b/.test(t) && /\b(plus|top|meilleur|commandent|achetent|consomment)\b/.test(t)){
    const fl=aiFindFlavor(t,flavors);
    return {intent:'query_top_clients', params:{flavor:fl}, critical:false,
      label: fl?`Clients qui commandent le plus de « ${fl} »`:'Meilleurs clients'};
  }
  // chiffre d'affaires
  if(/\b(chiffre d'affaires|chiffre d affaires|chiffre|recette|recettes)\b/.test(t)
     || (/\b(vente|ventes)\b/.test(t) && /\b(combien|total|mois|montant|euros?)\b/.test(t))){
    return {intent:'query_revenue', params:{}, critical:false, label:'Consulter le chiffre d\'affaires'};
  }

  // ---- ACTIONS CRITIQUES (validation obligatoire) ----
  // créer une commande
  if(/\b(cree|creer|crée|nouvelle commande|ajoute une commande|enregistre une commande)\b/.test(t) && /commande/.test(t)
     || (/\bcree|creer\b/.test(t) && /commande/.test(t))){
    const client=aiFindClient(t,clients);
    const date=aiParseDate(t);
    const nb=aiParseNumber(t);
    // taille de coffret évoquée
    let taille=null; const mm=t.match(/coffret[s]? de (\d+)|(\d+) macaron/);
    if(mm) taille=+(mm[1]||mm[2]);
    const fl=aiFindFlavor(t,flavors);
    return {intent:'create_order', critical:true,
      params:{client, clientNameRaw: !client?aiExtractName(raw):null, date, taille, qte:nb, flavor:fl},
      label:`Créer une commande${client?' pour '+client.nom:''}${date?' le '+date:''}`};
  }
  // ajouter des coffrets (à une commande en cours de dialogue)
  if(/\bajoute|ajouter\b/.test(t) && /coffret|macaron/.test(t)){
    const nb=aiParseNumber(t)||1;
    const mm=t.match(/de (\d+)|(\d+) macaron/); const taille=mm?+(mm[1]||mm[2]):null;
    return {intent:'add_box', critical:true, params:{nb, taille},
      label:`Ajouter ${nb} coffret(s)${taille?' de '+taille:''}`};
  }
  // supprimer une commande
  if(/\b(supprime|supprimer|annule|annuler)\b/.test(t) && /commande/.test(t)){
    const client=aiFindClient(t,clients);
    return {intent:'delete_order', critical:true, params:{client},
      label:`Supprimer/annuler une commande${client?' de '+client.nom:''}`};
  }

  // ---- ANALYSE AVANCÉE (consultations) ----
  // tendances de consommation (hausse/baisse)
  if(/\b(tendance|tendances|evolue|evolution|hausse|baisse|progresse|recule|monte|descend)\b/.test(t)){
    return {intent:'query_trends', params:{}, critical:false, label:'Analyser les tendances de consommation'};
  }
  // anomalies / variations inhabituelles
  if(/\b(anomalie|anomalies|inhabituel|inhabituelle|atypique|pic|creux|bizarre|etrange)\b/.test(t)){
    return {intent:'query_anomalies', params:{}, critical:false, label:'Détecter les anomalies de vente'};
  }
  // besoins de production / matières à produire
  if(/\b(produire|production|fabriquer|batch|combien.*macaron|preparer.*production)\b/.test(t)
     && /\b(faut|besoin|combien|matiere|matieres|premiere|prevoir|planifie|planifier)\b/.test(t)){
    return {intent:'query_production_needs', params:{}, critical:false, label:'Calculer les besoins de production'};
  }
  // risque de rupture
  if(/\b(rupture|risque|manque|manquer|epuise|epuiser|epuisement)\b/.test(t)){
    return {intent:'query_rupture', params:{}, critical:false, label:'Détecter les risques de rupture'};
  }

  return {intent:'unknown', params:{}, critical:false};
}
// extrait un nom propre candidat après "pour"
function aiExtractName(raw){
  const m=raw.match(/\bpour\s+(?:M\.?|Mr\.?|Mme\.?|Monsieur|Madame|Mlle\.?)?\s*([A-ZÉÈÀ][\wéèàâ'\-]+(?:\s+[A-ZÉÈÀ][\wéèàâ'\-]+)?)/);
  return m?m[1].trim():null;
}


let aiPending = null; // action critique en attente de validation
function renderAssistant(){
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Assistant</h1><p>Pilotez l'application en langage naturel</p></div></div>
   <div class="banner">🤖 <div>Écrivez ou dictez (micro du clavier) une instruction. L'assistant fonctionne <b>hors-ligne</b>. Toute action critique (création, suppression, ajustement) demande votre validation.</div></div>
   <div class="panel">
     <div class="field"><label>Votre demande</label>
       <textarea id="aiInput" rows="2" placeholder="ex : Quel est le stock de chocolat ? · Crée une commande pour M. Dupont vendredi · Affiche les commandes à préparer demain"></textarea>
     </div>
     <div class="flex" style="gap:8px"><button class="btn" onclick="aiRun()">Envoyer</button>
       <button class="btn ghost" onclick="document.getElementById('aiInput').value='';document.getElementById('aiOut').innerHTML='';">Effacer</button></div>
     <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
       ${['Quel est le stock de chocolat ?','Commandes à préparer demain','Quels clients commandent le plus de vanille ?','Chiffre d\'affaires','Quelles sont les tendances ?','Que faut-il produire ?','Y a-t-il un risque de rupture ?'].map(s=>`<button class="btn ghost sm" onclick="document.getElementById('aiInput').value=${JSON.stringify(s)};aiRun()">${esc(s)}</button>`).join('')}
     </div>
   </div>
   <div id="aiOut"></div>`;
}
function aiSay(html){ document.getElementById('aiOut').innerHTML = `<div class="panel">${html}</div>`; }

async function aiRun(){
  const txt=(document.getElementById('aiInput').value||'').trim();
  if(!txt){ return; }
  const flavors=FLAVORS;
  const clients=await db.clients.toArray();
  const materials=await db.materials.toArray();
  const r=parseIntent(txt,{flavors,clients,materials});
  aiPending=null;
  switch(r.intent){
    case 'query_stock': return aiQueryStock(r.params);
    case 'query_orders': return aiQueryOrders(r.params);
    case 'query_top_clients': return aiQueryTopClients(r.params);
    case 'query_revenue': return aiQueryRevenue();
    case 'query_trends': return aiQueryTrends();
    case 'query_anomalies': return aiQueryAnomalies();
    case 'query_production_needs': return aiQueryProductionNeeds();
    case 'query_rupture': return aiQueryRupture();
    case 'create_order': return aiConfirmCreateOrder(r);
    case 'delete_order': return aiConfirmDeleteOrder(r);
    case 'adjust_stock': return aiConfirmAdjustStock(r);
    case 'add_box': return aiSay(`<p>Pour ajouter des coffrets, ouvrez d'abord une commande. Dites par exemple : <b>« Crée une commande pour [client] »</b>, puis ajoutez les produits.</p>`);
    default:
      return aiSay(`<p>Je n'ai pas compris « ${esc(txt)} ».</p>
        <p class="note">Exemples : <i>Quel est le stock de chocolat ?</i> · <i>Crée une commande pour M. Dupont vendredi</i> · <i>Affiche les commandes à préparer demain</i> · <i>Quels clients commandent le plus de vanille ?</i></p>`);
  }
}

// ---- CONSULTATIONS ----
async function aiQueryStock(params){
  const materials=await db.materials.toArray();
  if(!params.material){
    // liste tout le stock
    const rows=[];
    for(const m of materials){ const lots=await db.materialLots.where('materialId').equals(m.id).toArray();
      const tot=lots.reduce((s,l)=>s+(+l.qteRestante||0),0); rows.push(`<div class="sum-box"><span>${esc(m.nom)}</span><b>${qty(tot)} ${esc(m.unite||'')}</b></div>`); }
    return aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">Stock de toutes les matières</h3>${rows.join('')||'<p class="note">Aucune matière.</p>'}`);
  }
  const lots=await db.materialLots.where('materialId').equals(params.material.id).and(l=>+l.qteRestante>0).toArray();
  const tot=lots.reduce((s,l)=>s+(+l.qteRestante||0),0);
  const proche=lots.slice().sort((a,b)=>(a.dlc||'9999').localeCompare(b.dlc||'9999'))[0];
  const ambig = params.material._ambig && params.material._ambig.length>1 ? `<p class="note">Plusieurs matières correspondent : ${params.material._ambig.map(esc).join(", ")}. Affichage de « ${esc(params.material.nom)} ». Précisez le nom complet pour une autre.</p>` : "";
  aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">Stock — ${esc(params.material.nom)}</h3>${ambig}
    <div class="sum-box"><span>Quantité disponible</span><b>${qty(tot)} ${esc(params.material.unite||'')}</b></div>
    <div class="sum-box"><span>Lots actifs</span><b>${lots.length}</b></div>
    ${proche?`<div class="sum-box"><span>DLC la plus proche</span><b>${fmtDate(proche.dlc)||'—'}</b></div>`:''}
    ${params.material.seuil&&tot<params.material.seuil?`<p class="note" style="color:var(--red)">⚠ Sous le seuil d'alerte (${qty(params.material.seuil)}).</p>`:''}`);
}
async function aiQueryOrders(params){
  let orders=await db.orders.toArray();
  const clients=await db.clients.toArray();
  const clName=id=>(clients.find(c=>c.id===id)||{}).nom||'—';
  if(params.date) orders=orders.filter(o=>o.date===params.date);
  if(params.statut) orders=orders.filter(o=>normStatus(o.statut)===params.statut);
  orders.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const titre=`Commandes${params.statut?' à préparer':''}${params.date?' du '+fmtDate(params.date):''}`;
  if(!orders.length) return aiSay(`<h3 style="font-size:1rem">${titre}</h3><p class="note">Aucune commande.</p>`);
  aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">${titre} (${orders.length})</h3>
    ${orders.map(o=>`<div class="sum-box"><span>${esc(clName(o.clientId))} · ${fmtDate(o.date)}</span><b>${euro(o.montant)} · ${esc(normStatus(o.statut))}</b></div>`).join('')}`);
}
async function aiQueryTopClients(params){
  const orders=await db.orders.toArray();
  const clients=await db.clients.toArray();
  const R=computeStats(orders,clients,orderToLines);
  const fl=params.flavor;
  const rank=Object.keys(R.parClient).map(id=>({id:+id, nom:R.parClient[id].nom, n: fl?(R.parClient[id].parfums[fl]||0):R.parClient[id].macarons}))
    .filter(x=>x.n>0).sort((a,b)=>b.n-a.n).slice(0,10);
  if(!rank.length) return aiSay(`<p class="note">Aucune donnée${fl?' pour « '+esc(fl)+' »':''} (commandes payées uniquement).</p>`);
  aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">Clients — ${fl?'parfum '+esc(fl):'tous macarons'} <span style="font-weight:400;font-size:.78rem;color:#9a8a82">(commandes payées)</span></h3>
    ${rank.map((x,i)=>`<div class="sum-box"><span>${i+1}. ${x.id?`<span class="link-name" onclick="clientForm(${x.id})">${esc(x.nom)}</span>`:esc(x.nom)}</span><b>${qty(x.n)} macaron(s)</b></div>`).join('')}`);
}
async function aiQueryRevenue(){
  const orders=await db.orders.toArray(); const clients=await db.clients.toArray();
  const R=computeStats(orders,clients,orderToLines);
  const mois=Object.keys(R.global.parMois).sort();
  aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">Chiffre d'affaires <span style="font-weight:400;font-size:.78rem;color:#9a8a82">(commandes payées)</span></h3>
    <div class="sum-box"><span>CA total</span><b>${euro(R.global.caTotal)}</b></div>
    <div class="sum-box"><span>Commandes payées</span><b>${R.nbValides}</b></div>
    <div class="sum-box"><span>Macarons écoulés</span><b>${qty(R.global.nbMacarons)}</b></div>
    ${mois.length?mois.map(m=>`<div class="sum-box"><span>${m}</span><b>${euro(R.global.parMois[m].ca)}</b></div>`).join(''):''}`);
}

// ---- ANALYSE AVANCÉE (assistant) ----
async function aiQueryTrends(){
  const orders=await db.orders.toArray();
  const T=analyzeTrends(orders,{windowDays:30});
  if(!T.hausses.length && !T.baisses.length)
    return aiSay(`<p class="note">Pas assez de données sur les 60 derniers jours pour dégager une tendance.</p>`);
  const up=T.hausses.slice(0,5).map(x=>`<div class="sum-box"><span>▲ ${esc(x.nom)}</span><b style="color:#3f7d52">${x.prev>0?(x.pct>0?'+':'')+Math.round(x.pct)+'%':'nouveau'} (${qty(x.prev)}→${qty(x.recent)})</b></div>`).join('');
  const down=T.baisses.slice(0,5).map(x=>`<div class="sum-box"><span>▼ ${esc(x.nom)}</span><b style="color:var(--red,#b3261e)">${Math.round(x.pct)}% (${qty(x.prev)}→${qty(x.recent)})</b></div>`).join('');
  aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">Tendances <span style="font-weight:400;font-size:.78rem;color:#9a8a82">30 j vs 30 j précédents · commandes payées</span></h3>
    ${up?'<p style="margin:4px 0;color:#3f7d52;font-weight:600">En hausse</p>'+up:''}
    ${down?'<p style="margin:8px 0 4px;color:var(--red,#b3261e);font-weight:600">En baisse</p>'+down:''}
    <p class="note" style="margin-top:8px">Vue complète dans l'onglet <b>Analyse &amp; Production</b>.</p>`);
}
async function aiQueryAnomalies(){
  const orders=await db.orders.toArray(); const clients=await db.clients.toArray();
  const R=computeStats(orders,clients,orderToLines);
  const AN=analyzeAnomalies(R);
  if(!AN.outliers.length)
    return aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">Anomalies</h3><div class="sum-box"><span>CA mensuel moyen</span><b>${euro(AN.moyenneCA)}</b></div><p class="note">Aucune variation mensuelle inhabituelle détectée.</p>`);
  aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">Anomalies détectées</h3>
    <div class="sum-box"><span>CA mensuel moyen</span><b>${euro(AN.moyenneCA)}</b></div>
    ${AN.outliers.map(o=>`<div class="sum-box"><span>${o.sens==='haut'?'⚡':'⚠'} ${o.mois}</span><b style="color:${o.sens==='haut'?'#3f7d52':'var(--red,#b3261e)'}">${euro(o.ca)} — ${o.sens==='haut'?'pic':'creux'} (z=${o.z.toFixed(1)})</b></div>`).join('')}`);
}
async function aiQueryProductionNeeds(){
  const orders=await db.orders.toArray();
  const N=await computeMaterialNeeds(orders);
  const dem=Object.entries(N.demande).filter(([,q])=>q>0).sort((a,b)=>b[1]-a[1]);
  if(!dem.length) return aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">Besoins de production</h3><p class="note">Aucune commande « À préparer » en attente.</p>`);
  const prod=dem.map(([nom,q])=>`<div class="sum-box"><span>${esc(nom)}</span><b>${qty(q)} pièce(s)</b></div>`).join('');
  const mat=N.matLignes.slice(0,12).map(m=>`<div class="sum-box"><span>${esc(m.nom)}</span><b style="color:${m.manque>0?'var(--red,#b3261e)':'#3f7d52'}">${qty(m.requis)} ${esc(m.unite)}${m.manque>0?' · manque '+qty(m.manque):' · OK'}</b></div>`).join('');
  aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">À produire (commandes à préparer)</h3>${prod}
    <h3 style="font-size:.95rem;margin:12px 0 6px">Matières premières nécessaires</h3>${mat||'<p class="note">Aucune recette liée.</p>'}
    ${N.sansRecette.length?`<p class="note" style="color:var(--red,#b3261e)">⚠ Sans recette : ${N.sansRecette.map(x=>esc(x.parfum)).join(', ')}.</p>`:''}`);
}
async function aiQueryRupture(){
  const orders=await db.orders.toArray();
  const N=await computeMaterialNeeds(orders);
  const risques=N.matLignes.filter(m=>m.manque>0);
  // matières sous seuil (indépendamment des commandes)
  const materials=await db.materials.toArray();
  const lots=await db.materialLots.toArray();
  const stock={}; lots.forEach(l=>{ stock[l.materialId]=(stock[l.materialId]||0)+(+l.qteRestante||0); });
  const sousSeuil=materials.filter(m=>+m.seuil>0 && (stock[m.id]||0)<=+m.seuil)
    .map(m=>({nom:m.nom, dispo:stock[m.id]||0, seuil:+m.seuil, unite:m.unite||''}));
  // ruptures prévisionnelles produits finis (sous 8 jours)
  let prev=[]; try{ prev=await forecastAlerts(); }catch(e){}
  if(!risques.length && !sousSeuil.length && !prev.length)
    return aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">Risques de rupture</h3><p class="note">Aucun risque détecté : produits finis couverts sous 8 jours, matières suffisantes et au-dessus des seuils.</p>`);
  aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">Risques de rupture</h3>
    ${prev.length?'<p style="margin:4px 0;font-weight:600;color:var(--red,#b3261e)">Produits finis — rupture prévue sous 8 jours</p>'+prev.map(a=>`<div class="sum-box"><span>${esc(a.parfum)}${a.firstShortDate?` · ${fmtDate(a.firstShortDate)}`:''}</span><b style="color:var(--red,#b3261e)">manque ${qty(a.manque||0)}</b></div>`).join(''):''}
    ${risques.length?'<p style="margin:10px 0 4px;font-weight:600;color:var(--red,#b3261e)">Matières insuffisantes pour les commandes planifiées</p>'+risques.map(m=>`<div class="sum-box"><span>${esc(m.nom)}</span><b style="color:var(--red,#b3261e)">manque ${qty(m.manque)} ${esc(m.unite)} (${qty(m.dispo)}/${qty(m.requis)})</b></div>`).join(''):''}
    ${sousSeuil.length?'<p style="margin:10px 0 4px;font-weight:600">Matières sous le seuil d\'alerte</p>'+sousSeuil.map(m=>`<div class="sum-box"><span>${esc(m.nom)}</span><b style="color:var(--red,#b3261e)">${qty(m.dispo)} / seuil ${qty(m.seuil)} ${esc(m.unite)}</b></div>`).join(''):''}
    <p class="note" style="margin-top:8px">Détail dans l'onglet <b>Prévisionnel stocks</b>.</p>`);
}

// ---- ACTIONS CRITIQUES : résumé + validation explicite ----
function aiConfirmCreateOrder(r){
  const p=r.params;
  const clientLine = p.client ? p.client.nom : (p.clientNameRaw||'(non précisé)');
  aiPending={type:'create_order', params:p};
  aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">⚠ Action à valider — Créer une commande</h3>
    <div class="sum-box"><span>Client</span><b>${esc(clientLine)}${!p.client&&p.clientNameRaw?' (nouveau)':''}</b></div>
    <div class="sum-box"><span>Date</span><b>${p.date?fmtDate(p.date):'aujourd\'hui'}</b></div>
    ${p.taille?`<div class="sum-box"><span>Coffret</span><b>${p.taille} macarons</b></div>`:''}
    <p class="note">L'assistant prépare le formulaire ; vous compléterez les produits et le prix avant l'enregistrement définitif.</p>
    <div class="flex" style="gap:8px;margin-top:10px"><button class="btn ghost" onclick="document.getElementById('aiOut').innerHTML=''">Annuler</button>
      <button class="btn" onclick="aiExecute()">Ouvrir le formulaire pré-rempli</button></div>`);
}
function aiConfirmDeleteOrder(r){
  aiPending={type:'delete_order', params:r.params};
  const c=r.params.client;
  aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">⚠ Action à valider — Supprimer une commande</h3>
    ${c?`<div class="sum-box"><span>Client</span><b>${esc(c.nom)}</b></div>`:'<p class="note">Aucun client précisé.</p>'}
    <p class="note">Pour éviter toute erreur, l'assistant vous montrera la liste des commandes concernées ; vous choisirez laquelle supprimer depuis l'onglet Commandes (suppression sécurisée avec recréditation du stock).</p>
    <div class="flex" style="gap:8px;margin-top:10px"><button class="btn ghost" onclick="document.getElementById('aiOut').innerHTML=''">Annuler</button>
      <button class="btn" onclick="aiExecute()">Voir les commandes concernées</button></div>`);
}
function aiConfirmAdjustStock(r){
  const p=r.params;
  if(!p.material) return aiSay(`<p>Quelle matière ajuster ? Précisez, par exemple : <b>« Ajuste le stock de chocolat à 5 »</b>.</p>`);
  if(p.value==null) return aiSay(`<p>À quelle valeur ajuster le stock de <b>${esc(p.material.nom)}</b> ? Précisez un nombre.</p>`);
  aiPending={type:'adjust_stock', params:p};
  aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">⚠ Action à valider — Ajuster le stock</h3>
    <div class="sum-box"><span>Matière</span><b>${esc(p.material.nom)}</b></div>
    <div class="sum-box"><span>Nouvelle valeur cible</span><b>${qty(p.value)} ${esc(p.material.unite||'')}</b></div>
    <p class="note">L'ajustement crée un lot de correction daté d'aujourd'hui (traçable), il ne modifie pas les lots existants. La traçabilité est préservée.</p>
    <div class="flex" style="gap:8px;margin-top:10px"><button class="btn ghost" onclick="document.getElementById('aiOut').innerHTML=''">Annuler</button>
      <button class="btn danger" onclick="aiExecute()">Confirmer l'ajustement</button></div>`);
}

async function aiExecute(){
  if(!aiPending){ return; }
  const {type,params}=aiPending; aiPending=null;
  if(type==='create_order'){
    // ouvre le formulaire de commande ; pré-sélectionne le client si connu
    document.getElementById('aiOut').innerHTML='';
    if(params.client){ await cmdForm(0,{clientId:params.client.id}); }
    else { await cmdForm(0); if(params.clientNameRaw){ const s=document.getElementById('f_clsearch'); if(s){ s.value=params.clientNameRaw; } } }
    // pré-remplir la date si présente
    setTimeout(()=>{ const d=document.getElementById('f_date'); if(d&&params.date) d.value=params.date; },120);
    toast('Formulaire prêt — complétez puis enregistrez');
  } else if(type==='delete_order'){
    // redirige vers la liste filtrée (sécurité : pas de suppression directe par l'IA)
    view='commandes'; if(typeof setActiveView==='function') setActiveView('commandes'); renderCmd();
    toast('Choisissez la commande à supprimer dans la liste');
  } else if(type==='adjust_stock'){
    // ajustement = création d'un lot de correction (traçable), jamais d'écrasement
    const m=params.material; const lots=await db.materialLots.where('materialId').equals(m.id).toArray();
    const actuel=lots.reduce((s,l)=>s+(+l.qteRestante||0),0);
    const delta=params.value-actuel;
    if(Math.abs(delta)<1e-9){ aiSay(`<p>Le stock de <b>${esc(m.nom)}</b> est déjà à ${qty(params.value)} ${esc(m.unite||'')}.</p>`); return; }
    await db.materialLots.add({materialId:m.id, supplierId:0, lotFournisseur:'AJUST-'+today().replace(/-/g,''),
      qteInitiale: delta>0?delta:0, qteRestante: delta>0?delta:0,
      dateReception:today(), dlc:'', prix:0, prixUnitaire:0, note:'Ajustement assistant'});
    if(delta<0){
      // décrément : on retire FIFO sur les lots existants
      let reste=-delta;
      const actifs=lots.filter(l=>+l.qteRestante>0).sort((a,b)=>(a.dlc||'9999').localeCompare(b.dlc||'9999'));
      for(const l of actifs){ if(reste<=0)break; const pris=Math.min(reste,+l.qteRestante); await db.materialLots.update(l.id,{qteRestante:+l.qteRestante-pris}); reste-=pris; }
    }
    aiSay(`<h3 style="font-size:1rem">Stock ajusté ✓</h3>
      <div class="sum-box"><span>${esc(m.nom)}</span><b>${qty(actuel)} → ${qty(params.value)} ${esc(m.unite||'')}</b></div>
      <p class="note">${delta>0?'Lot de correction (+'+qty(delta)+') créé.':'Décrément FIFO appliqué ('+qty(delta)+').'} Traçable dans Matières &amp; lots.</p>`);
    toast('Stock ajusté ✓');
  }
}

let calSearch='';
let _calCache=null;
async function renderCal(){
  const events = await db.events.toArray();
  // index de recherche sur TOUS les événements (toutes dates), construit une fois
  _calCache = events.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(e=>{
    const prim = normTxt(e.titre||'');
    const blob = normTxt([e.titre, e.date, fmtDate(e.date), e.type==='cmd'?'commande':'evenement'].filter(Boolean).join(' '));
    return {e, _prim:prim, _blob:blob, _digits:onlyDigits(e.date||'')};
  });
  const y=calRef.getFullYear(),m=calRef.getMonth();
  const first=new Date(y,m,1),start=(first.getDay()+6)%7;
  const days=new Date(y,m+1,0).getDate();
  const cells=[]; for(let i=0;i<start;i++)cells.push(null); for(let d=1;d<=days;d++)cells.push(d);
  const evByDay={}; events.forEach(e=>{const d=new Date(e.date);if(d.getMonth()===m&&d.getFullYear()===y){(evByDay[d.getDate()]=evByDay[d.getDate()]||[]).push(e);}});
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Calendrier</h1><p>Commandes & événements</p></div>
     <div class="flex"><div class="cal-nav"><button class="btn ghost sm" onclick="calMove(-1)">‹</button>
     <b style="min-width:150px;text-align:center;color:var(--bordeaux);text-transform:capitalize">${calRef.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</b>
     <button class="btn ghost sm" onclick="calMove(1)">›</button></div><button class="btn" onclick="evForm()">+ Événement</button></div></div>
   <div class="panel">
     <input class="search" id="calSearch" style="width:100%;margin-bottom:12px" placeholder="Rechercher un événement ou une commande (toutes dates)…" value="${esc(calSearch)}" oninput="calFilter(this.value)" autocomplete="off" autocapitalize="off" autocorrect="off">
     <div id="calResults" style="display:none;margin-bottom:12px"></div>
     <div id="calGridWrap">
       <div class="cal-grid">${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d=>`<div class="cal-head">${d}</div>`).join('')}</div>
       <div class="cal-grid" style="margin-top:6px">${cells.map(d=>{
         if(d===null)return `<div class="cal-cell other"></div>`;
         const t=new Date();const isToday=t.getDate()===d&&t.getMonth()===m&&t.getFullYear()===y;
         const evs=evByDay[d]||[];
         return `<div class="cal-cell ${isToday?'today':''}"><div class="cal-num">${d}</div>
          ${evs.map(e=>`<div class="cal-ev ${e.type==='cmd'?'cmd':''}" onclick="evView(${e.id})" title="${esc(e.titre)}">${esc(e.titre)}</div>`).join('')}</div>`;
       }).join('')}</div>
       <p class="note">Touchez un événement pour voir son détail. Les commandes apparaissent en caramel.</p>
     </div>
   </div>`;
  calFilter(calSearch);
}
// Recherche calendrier : affiche une liste filtrée (toutes dates) et masque la grille pendant la saisie.
function calFilter(q){
  calSearch=q||'';
  const res=document.getElementById('calResults'), grid=document.getElementById('calGridWrap');
  if(!res||!_calCache) return;
  if(!q || !q.trim()){ res.style.display='none'; res.innerHTML=''; if(grid) grid.style.display=''; return; }
  if(grid) grid.style.display='none';
  res.style.display='block';
  const rows=searchRank(_calCache, q);
  if(!rows.length){ res.innerHTML='<div class="empty">Aucun événement ne correspond.</div>'; return; }
  res.innerHTML = `<p class="note" style="margin-bottom:8px">${rows.length} résultat(s) — toutes dates confondues :</p>`+
    rows.slice(0,200).map(r=>{
      const e=r.e;
      return `<div class="sum-box" style="cursor:pointer" onclick="evView(${e.id})">
        <span>${e.type==='cmd'?'🧾':'📌'} ${esc(e.titre)}</span><b>${fmtDate(e.date)}</b></div>`;
    }).join('');
}
function calMove(n){ calRef.setMonth(calRef.getMonth()+n); renderCal(); }

// Vue de détail d'un événement (consultation seule — aucune action destructive directe)
async function evView(id){
  const e = await db.events.get(id);
  if(!e){ toast('Événement introuvable'); return; }
  if(e.type==='cmd' && e.refId){
    // Événement issu d'une commande : la suppression se fait via la commande, pas ici
    const o = await db.orders.get(e.refId);
    const cl = o && o.clientId ? await db.clients.get(o.clientId) : null;
    openModal(`<h3>Détail de l'événement</h3>
      <div class="sum-box"><span>Type</span><b>Commande</b></div>
      <div class="sum-box"><span>Intitulé</span><b>${esc(e.titre)}</b></div>
      <div class="sum-box"><span>Date</span><b>${fmtDate(e.date)}</b></div>
      ${o?`<div class="sum-box"><span>Client</span><b>${esc(cl?cl.nom:'—')}</b></div>
      <div class="sum-box"><span>Montant</span><b>${euro(o.montant)}</b></div>`:'<p class="note">Commande associée introuvable.</p>'}
      <p class="note">Cet événement est rattaché à une commande. Pour le retirer du calendrier, supprimez la commande depuis l'onglet Commandes (la suppression y est sécurisée).</p>
      <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
      ${o?`<button class="btn" onclick="closeModal();view='commandes';setActiveView&&setActiveView('commandes');renderCmd();cmdView(${o.id})">Voir la commande</button>`:''}</div>`);
    return;
  }
  // Événement libre : consultation, puis suppression via bouton explicite
  openModal(`<h3>Détail de l'événement</h3>
    <div class="sum-box"><span>Intitulé</span><b>${esc(e.titre)}</b></div>
    <div class="sum-box"><span>Date</span><b>${fmtDate(e.date)}</b></div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Fermer</button>
      <button class="btn ghost" onclick="closeModal();evEdit(${id})">Modifier</button>
      <button class="btn danger" onclick="confirmDeleteEvent(${id})">Supprimer</button>
    </div>`);
}
// Modification d'un événement libre (depuis la vue détail uniquement)
async function evEdit(id){
  const e = await db.events.get(id); if(!e) return;
  openModal(`<h3>Modifier l'événement</h3>
   <div class="field"><label>Titre</label><input id="f_t" value="${esc(e.titre||'')}"></div>
   <div class="field"><label>Date</label><input type="date" id="f_d" value="${e.date||today()}"></div>
   <div class="modal-actions"><button class="btn ghost" onclick="evView(${id})">Annuler</button><button class="btn" onclick="saveEvEdit(${id})">Enregistrer</button></div>`);
}
async function saveEvEdit(id){
  const t=val('f_t'),d=val('f_d'); if(!t){toast('Titre requis');return;}
  await db.events.update(id,{titre:t,date:d}); closeModal(); renderCal(); toast('Événement modifié ✓');
}
// Suppression : seconde confirmation explicite, jamais en un seul clic depuis le calendrier
function confirmDeleteEvent(id){
  openModal(`<h3>Supprimer l'événement ?</h3>
    <p class="note">Cette action est définitive. L'événement sera retiré du calendrier.</p>
    <div class="modal-actions">
      <button class="btn ghost" onclick="evView(${id})">Annuler</button>
      <button class="btn danger" onclick="delEvent(${id})">Supprimer définitivement</button>
    </div>`);
}
function evForm(){
  openModal(`<h3>Nouvel événement</h3>
   <div class="field"><label>Titre</label><input id="f_t" placeholder="Marché de Noël, livraison mariage…"></div>
   <div class="field"><label>Date</label><input type="date" id="f_d" value="${today()}"></div>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveEv()">Ajouter</button></div>`);
}
async function saveEv(){
  const t=val('f_t'),d=val('f_d'); if(!t){toast('Titre requis');return;}
  await db.events.add({date:d,titre:t,type:'event'}); closeModal(); renderCal(); toast('Événement ajouté ✓');
}
async function delEvent(id){
  await db.events.delete(id); closeModal(); renderCal(); toast('Événement supprimé');
}

/* ============================================================
   ÉTIQUETTES QR  (une étiquette imprimable par batch)
   ============================================================ */
function traceUrl(lotProduction){
  // URL absolue vers l'app, avec ancre #trace=<lot> ouverte au chargement
  const base = location.href.split('#')[0];
  return base + '#trace=' + encodeURIComponent(lotProduction || '');
}
async function renderLabels(){
  const prods = await db.productions.orderBy('date').reverse().toArray();
  const recipes = await db.recipes.toArray();
  const recName = id => (recipes.find(r=>r.id===id)||{}).produitNom||'—';
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Étiquettes</h1><p>Format thermique 50 × 30 mm — Phomemo D520BT</p></div></div>
   <div class="banner">▤ <div>Étiquettes en noir sur fond blanc, sans décoration, optimisées pour l'impression thermique. Chaque étiquette porte : produit, lot, DLC, date, et le QR de traçabilité. Sélectionne un batch puis « Imprimer ».</div></div>
   <div class="panel">
   ${prods.length?`<div class="labels-grid" id="labelsGrid">
     ${prods.map(p=>`<div class="label" data-prod="${p.id}">
        <div class="qr"><canvas data-lot="${esc(p.lotProduction||'')}"></canvas></div>
        <div class="info">
          <b>${esc(recName(p.recipeId))}</b>
          <span class="meta">Lot : ${esc(p.lotProduction||'—')}</span>
          <span class="meta">DLC : ${p.dlcProduit?fmtDate(p.dlcProduit):'— à compléter —'}</span>
          <span class="meta">Fab. : ${fmtDate(p.date)}</span>
        </div>
        <button class="btn ghost sm label-print" onclick="printLabel(${p.id})">⎙ Imprimer</button>
     </div>`).join('')}
   </div>`:`<div class="empty">Aucun batch produit. Lance une production pour générer ses étiquettes.</div>`}
   </div>`;
  document.querySelectorAll('#labelsGrid canvas').forEach(cv=>{
    const lot = cv.getAttribute('data-lot');
    try{ QR.render(cv, traceUrl(lot), {scale:4, dark:'#000000', light:'#ffffff'}); }
    catch(e){ console.error('QR',e); }
  });
}

// Impression d'une étiquette unique au format thermique 50×40 mm (noir sur blanc, sans décoration)
async function printLabel(prodId){
  const p = await db.productions.get(prodId);
  if(!p){ toast('Batch introuvable'); return; }
  const rec = await db.recipes.get(p.recipeId);
  // QR rendu hors écran puis converti en image
  const tmp = document.createElement('canvas');
  try{ QR.render(tmp, traceUrl(p.lotProduction||''), {scale:6, dark:'#000000', light:'#ffffff'}); }catch(e){}
  const qrData = tmp.toDataURL('image/png');
  const dlc = p.dlcProduit ? fmtDate(p.dlcProduit) : '—';
  const win = window.open('', '_blank', 'width=400,height=260');
  if(!win){ toast('Autorise les fenêtres pour imprimer'); return; }
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Étiquette ${esc(p.lotProduction||'')}</title>
   <style>
     @page { size: 50mm 30mm; margin: 0; }
     * { margin:0; padding:0; box-sizing:border-box; }
     html,body { background:#fff; }
     .lab { width:50mm; height:30mm; background:#fff; color:#000; padding:1.5mm;
            font-family:Arial,Helvetica,sans-serif; display:flex; gap:1.5mm; align-items:center; }
     .lab .q { width:16mm; height:16mm; flex-shrink:0; }
     .lab .q img { width:16mm; height:16mm; display:block; image-rendering:pixelated; }
     .lab .t { flex:1; min-width:0; line-height:1.2; }
     .lab .prod { font-size:3mm; font-weight:bold; }
     .lab .row { font-size:2.5mm; }
     .lab .dlc { font-size:2.8mm; font-weight:bold; }
   </style></head><body>
   <div class="lab">
     <div class="q"><img src="${qrData}"></div>
     <div class="t">
       <div class="prod">${esc(rec?rec.produitNom:'Produit')}</div>
       <div class="row">Lot : ${esc(p.lotProduction||'—')}</div>
       <div class="dlc">DLC : ${dlc}</div>
       <div class="row">Fab. : ${fmtDate(p.date)}</div>
     </div>
   </div>
   <script>window.onload=function(){setTimeout(function(){window.print();},250);};window.onafterprint=function(){window.close();};<\/script>
   </body></html>`);
  win.document.close();
}
// Ouvrir une fiche traçabilité à partir de l'ancre #trace=<lot> (QR scanné)
async function handleTraceAnchor(){
  const h = location.hash || '';
  const m = h.match(/#trace=(.+)$/);
  if(!m) return false;
  const lot = decodeURIComponent(m[1]);
  history.replaceState(null,'',location.pathname); // nettoie l'URL
  const prod = (await db.productions.toArray()).find(p=>p.lotProduction===lot);
  if(prod){ view='tracabilite'; document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.v==='tracabilite')); await renderTrace(); traceProd(prod.id); return true; }
  toast('Lot '+lot+' introuvable sur cet appareil'); return false;
}


const TABLES = ['suppliers','materials','materialLots','recipes','recipeItems','productions','prodConsumption','clients','orders','orderItems','events','products'];
async function exportData(){
  const dump={_app:'sensations-macarons',_version:1,_date:new Date().toISOString()};
  for(const t of TABLES) dump[t]=await db.table(t).toArray();
  const blob=new Blob([JSON.stringify(dump,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='sensations-macarons-sauvegarde-'+today()+'.json'; a.click();
  toast('Sauvegarde téléchargée ✓');
}
async function importData(e){
  const f=e.target.files[0]; if(!f)return;
  let obj;
  try{
    const txt = await f.text();
    obj = JSON.parse(txt);
  }catch(err){
    toast('Fichier illisible (JSON invalide)'); e.target.value=''; return;
  }
  // Validation : est-ce bien une sauvegarde Sensations Macarons ?
  const hasAnyTable = obj && typeof obj==='object' && TABLES.some(t=>Array.isArray(obj[t]));
  const isOurApp = obj && obj._app==='sensations-macarons';
  if(!hasAnyTable && !isOurApp){
    toast('Ce fichier n\'est pas une sauvegarde valide'); e.target.value=''; return;
  }
  // Résumé de ce qui va être importé
  const counts = TABLES.map(t=>Array.isArray(obj[t])?obj[t].length:0);
  const nbOrders = Array.isArray(obj.orders)?obj.orders.length:0;
  const nbClients = Array.isArray(obj.clients)?obj.clients.length:0;
  const dateInfo = obj._date ? `\nSauvegarde du ${new Date(obj._date).toLocaleString('fr-FR')}` : '';
  if(!confirm(`Importer cette sauvegarde ?${dateInfo}\n\n• ${nbClients} client(s)\n• ${nbOrders} commande(s)\n\n⚠ Toutes les données actuelles seront remplacées.`)){
    e.target.value=''; return;
  }
  try{
    await db.transaction('rw',...TABLES.map(t=>db.table(t)),async()=>{
      for(const t of TABLES){
        await db.table(t).clear();
        if(Array.isArray(obj[t]) && obj[t].length) await db.table(t).bulkAdd(obj[t]);
      }
    });
    render(); toast('Données importées ✓');
  }catch(err){ console.error('import',err); toast('Erreur pendant l\'import'); }
  e.target.value='';
}
function csvDownload(name, rows){
  const csv=rows.map(r=>r.map(c=>`"${String(c==null?'':c).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
}
async function exportTraceProd(prodId){
  const prod=await db.productions.get(prodId);
  const recipe=await db.recipes.get(prod.recipeId);
  const conso=await db.prodConsumption.where('productionId').equals(prodId).toArray();
  const rows=[['Produit','Lot production','Date','Matière','Qté consommée','Lot fournisseur','Fournisseur','DLC']];
  for(const c of conso){
    const lot=await db.materialLots.get(c.materialLotId); if(!lot)continue;
    const mat=await db.materials.get(lot.materialId);
    const sup=lot.supplierId?await db.suppliers.get(lot.supplierId):null;
    rows.push([recipe?recipe.produitNom:'',prod.lotProduction,prod.date,mat?mat.nom:'',c.qteConsommee,lot.lotFournisseur,sup?sup.nom:'',lot.dlc]);
  }
  csvDownload('tracabilite-batch-'+(prod.lotProduction||prodId)+'.csv',rows); toast('CSV exporté ✓');
}
async function exportTraceOrder(orderId){
  const order=await db.orders.get(orderId);
  const client=order.clientId?await db.clients.get(order.clientId):null;
  const items=await db.orderItems.where('orderId').equals(orderId).toArray();
  const rows=[['Client','Date commande','Produit','Batch','Qté','Matière','Lot fournisseur','Fournisseur','DLC']];
  for(const it of items){
    const prod=await db.productions.get(it.productionId); if(!prod)continue;
    const recipe=await db.recipes.get(prod.recipeId);
    const conso=await db.prodConsumption.where('productionId').equals(prod.id).toArray();
    if(!conso.length) rows.push([client?client.nom:'',order.date,recipe?recipe.produitNom:'',prod.lotProduction,it.qte,'','','','']);
    for(const c of conso){
      const lot=await db.materialLots.get(c.materialLotId); if(!lot)continue;
      const mat=await db.materials.get(lot.materialId);
      const sup=lot.supplierId?await db.suppliers.get(lot.supplierId):null;
      rows.push([client?client.nom:'',order.date,recipe?recipe.produitNom:'',prod.lotProduction,it.qte,mat?mat.nom:'',lot.lotFournisseur,sup?sup.nom:'',lot.dlc]);
    }
  }
  csvDownload('tracabilite-commande-'+orderId+'.csv',rows); toast('CSV exporté ✓');
}

/* ============================================================
   EXPORT DES COMMANDES — architecture extensible
   collectOrderExport() = source de données unique (structurée).
   formatOrderTXT() = rendu texte. Prévu pour brancher PDF / Excel / email
   plus tard sur la MÊME structure sans retoucher la collecte.
   ============================================================ */
// Numéro de commande lisible : n°AAAA-NNN (année de la commande + id zéro-paddé).
function orderNumber(o){
  const y = (o.date||today()).slice(0,4);
  return `${y}-${String(o.id||0).padStart(3,'0')}`;
}
// Récupère TOUTES les données d'une commande sous forme structurée (réutilisable tous formats).
async function collectOrderExport(orderId){
  const o = await db.orders.get(orderId);
  if(!o) return null;
  const cl = o.clientId ? await db.clients.get(o.clientId) : null;
  const lignes = orderToLines(o);
  const produits = lignes.map(ln=>{
    if(ln.type==='coffret') return {label:`Coffret ${ln.taille} macarons`, remisePct:+ln.remisePct||0,
      parfums:(ln.parfums||[]).filter(p=>p.qte>0).map(p=>({nom:p.nom,qte:p.qte}))};
    if(ln.type==='evenement') return {label:`Événement : ${ln.evQte||0} macarons + ${ln.equip||0} présentoir(s)`, remisePct:+ln.remisePct||0,
      parfums:(ln.parfums||[]).filter(p=>p.qte>0).map(p=>({nom:p.nom,qte:p.qte}))};
    if(ln.type==='grand') return {label:`Grand format (${ln.tarif||'particulier'})`, remisePct:+ln.remisePct||0,
      parfums:(ln.items||[]).filter(p=>p.qte>0).map(p=>({nom:p.nom,qte:p.qte}))};
    if(ln.type==='don') return {label:'Don (offert)', remisePct:0,
      parfums:[...(ln.parfums||[]).filter(p=>p.qte>0).map(p=>({nom:p.nom,qte:p.qte,offert:true})),
               ...(ln.items||[]).filter(p=>p.qte>0).map(p=>({nom:p.nom+' (GF)',qte:p.qte,offert:true}))]};
    return {label:ln.type, parfums:[]};
  });
  const totalMacarons = lignes.reduce((s,ln)=>{
    if(ln.type==='coffret'||ln.type==='evenement'||ln.type==='don') s+=(ln.parfums||[]).reduce((a,p)=>a+(+p.qte||0),0);
    if(ln.type==='evenement' && (!ln.parfums||!ln.parfums.length)) s+=(+ln.evQte||0);
    if(ln.type==='grand'||ln.type==='don') s+=(ln.items||[]).reduce((a,p)=>a+(+p.qte||0),0);
    return s;
  },0);
  return {
    numero: orderNumber(o),
    date: o.date, dateFmt: fmtDate(o.date),
    client: { nom: cl?cl.nom:'—', prenom: cl?cl.prenom:'', societe: cl?cl.societe:'',
      tel: cl?cl.tel:'', email: cl?cl.email:'', ref: cl?cl.ref:'', type: cl?cl.type:'' },
    produits, totalMacarons,
    remiseGlobale: +o.remiseGlobale||0,
    montant: +o.montant||0,
    paiement: o.paiement||'En attente', reglement: o.reglement||'',
    statut: normStatus(o.statut),
    notes: o.notes||''
  };
}
// Rendu TEXTE propre et homogène d'une commande, à partir de la structure.
function formatOrderTXT(d){
  const L=[];
  L.push(`Commande n°${d.numero}`);
  L.push('');
  const clLine = [d.client.prenom, d.client.nom].filter(Boolean).join(' ') || d.client.nom;
  L.push('Client : '+clLine + (d.client.societe?` — ${d.client.societe}`:''));
  if(d.client.tel) L.push('Téléphone : '+d.client.tel);
  if(d.client.email) L.push('Email : '+d.client.email);
  L.push('Date : '+d.dateFmt);
  L.push('');
  L.push('Produits :');
  d.produits.forEach(p=>{
    L.push('  - '+p.label + (p.remisePct>0?` (remise ${p.remisePct}%)`:''));
    p.parfums.forEach(f=>L.push(`      ${f.nom} : ${f.qte}`+(f.offert?' (offert)':'')));
  });
  L.push('');
  if(d.remiseGlobale>0) L.push(`Remise globale : −${d.remiseGlobale}%`);
  L.push('Total : '+euro(d.montant));
  L.push('Statut : '+d.paiement+(d.reglement?` (${d.reglement})`:''));
  if(d.notes){ L.push(''); L.push('Commentaires : '+d.notes.replace(/\n/g,' / ')); }
  return L.join('\n');
}
// Export TXT d'une sélection de commandes (séparateur homogène entre commandes).
async function cmdExportSelection(){
  const ids=[..._cmdSel];
  if(!ids.length){ toast('Aucune commande sélectionnée'); return; }
  // ordre chronologique des sélectionnées
  const datas=[];
  for(const id of ids){ const d=await collectOrderExport(id); if(d) datas.push(d); }
  datas.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const SEP='\n\n────────────────────────────────────────\n\n';
  const header = `SENSATIONS MACARONS — Export de ${datas.length} commande(s)\n${fmtDate(today())}`;
  const txt = header + SEP + datas.map(formatOrderTXT).join(SEP) + SEP + 'Sensations Macarons — Le Mans';
  const name = `commandes-selection-${today()}.txt`;
  let copied=false;
  try{ if(navigator.clipboard&&navigator.clipboard.writeText){ await navigator.clipboard.writeText(txt); copied=true; } }catch(e){}
  const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  openModal(`<h3>Export de ${datas.length} commande(s)</h3>
    <p class="note">${copied?'Copié dans le presse-papier ✓ — collez directement dans un email.':'Fichier .txt téléchargé. Vous pouvez aussi copier ci-dessous.'}</p>
    <textarea id="selTxt" rows="16" style="width:100%;font-family:monospace;font-size:.76rem;white-space:pre">${esc(txt)}</textarea>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Fermer</button>
      <button class="btn" onclick="(function(){const t=document.getElementById('selTxt');t.select();try{document.execCommand('copy');}catch(e){} toast('Copié ✓');})()">⧉ Copier</button>
    </div>
    <p class="note" style="margin-top:8px;color:#9a8a82">Exports PDF, Excel et envoi e-mail direct : prévus prochainement (même base de données structurée).</p>`);
}

// Export TEXTE d'une commande (détaillé, avec traçabilité des lots) : fichier .txt + copie
async function buildOrderText(orderId){
  const o = await db.orders.get(orderId);
  const cl = o.clientId ? await db.clients.get(o.clientId) : null;
  const lignes = orderToLines(o);
  const L=[];
  L.push('SENSATIONS MACARONS');
  L.push('Commande du '+fmtDate(o.date));
  L.push('========================================');
  L.push('');
  L.push('CLIENT');
  L.push('  '+(cl?cl.nom:'—')+(cl&&cl.type?' ('+cl.type+')':''));
  if(cl&&cl.email) L.push('  '+cl.email);
  if(cl&&cl.tel) L.push('  '+cl.tel);
  L.push('');
  L.push('PRODUITS');
  lignes.forEach(ln=>{
    if(ln.type==='coffret'){
      L.push('  - Coffret '+ln.taille+' macarons');
      (ln.parfums||[]).filter(p=>p.qte>0).forEach(p=>L.push('      • '+p.nom+' × '+p.qte));
    } else if(ln.type==='evenement'){
      L.push('  - Événement : '+(ln.evQte||0)+' macarons + '+(ln.equip||0)+' présentoir(s)');
      (ln.parfums||[]).filter(p=>p.qte>0).forEach(p=>L.push('      • '+p.nom+' × '+p.qte));
    } else if(ln.type==='grand'){
      L.push('  - Grand format ('+(ln.tarif||'particulier')+')');
      (ln.items||[]).filter(p=>p.qte>0).forEach(p=>L.push('      • '+p.nom+' × '+p.qte));
    } else if(ln.type==='don'){
      L.push('  - Don (offert)');
      (ln.parfums||[]).filter(p=>p.qte>0).forEach(p=>L.push('      • '+p.nom+' × '+p.qte+' (offert)'));
      (ln.items||[]).filter(p=>p.qte>0).forEach(p=>L.push('      • '+p.nom+' (GF) × '+p.qte+' (offert)'));
    }
  });
  L.push('');
  L.push('MONTANT : '+euro(o.montant));
  L.push('Paiement : '+(o.paiement||'En attente')+(o.reglement?' ('+o.reglement+')':''));
  L.push('Statut : '+normStatus(o.statut));
  if(o.notes){ L.push(''); L.push('NOTES'); L.push('  '+o.notes.replace(/\n/g,'\n  ')); }
  // Lots utilisés (traçabilité), si la commande est liée à des batchs
  const items = await db.orderItems.where('orderId').equals(orderId).toArray();
  if(items.length){
    L.push('');
    L.push('LOTS DE PRODUCTION (traçabilité)');
    for(const it of items){
      const prod = await db.productions.get(it.productionId);
      if(!prod) continue;
      const rec = await db.recipes.get(prod.recipeId);
      L.push('  - '+(rec?rec.produitNom:'?')+' · lot '+(prod.lotProduction||'—')+' × '+it.qte
        +(prod.dlcProduit?' · DLC '+fmtDate(prod.dlcProduit):''));
    }
  }
  L.push('');
  L.push('========================================');
  L.push('Sensations Macarons — Le Mans');
  return L.join('\n');
}
async function exportOrderText(orderId){
  const txt = await buildOrderText(orderId);
  const o = await db.orders.get(orderId);
  const cl = o.clientId ? await db.clients.get(o.clientId) : null;
  const slug = (cl?cl.nom:'commande').replace(/[^a-zA-Z0-9]+/g,'-').toLowerCase();
  const name = 'commande-'+slug+'-'+(o.date||'')+'.txt';
  // copie instantanée dans le presse-papier (usage email)
  let copied=false;
  try{ if(navigator.clipboard&&navigator.clipboard.writeText){ await navigator.clipboard.writeText(txt); copied=true; } }catch(e){}
  // fichier .txt téléchargeable
  const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  // aperçu + copie manuelle de secours
  openModal(`<h3>Commande en texte</h3>
    <p class="note">${copied?'Copié dans le presse-papier ✓ — collez directement dans un email.':'Fichier .txt téléchargé. Vous pouvez aussi copier ci-dessous.'} </p>
    <textarea id="orderTxt" rows="14" style="width:100%;font-family:monospace;font-size:.78rem;white-space:pre">${esc(txt)}</textarea>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
      <button class="btn" onclick="(function(){const t=document.getElementById('orderTxt');t.select();try{document.execCommand('copy');}catch(e){} toast('Copié ✓');})()">⧉ Copier</button></div>`);
}

/* ============================================================
   SEED initial + BOOT
   ============================================================ */
async function seedIfEmpty(){
  const n = await db.materials.count();
  const c = await db.clients.count();
  if(n>0 || c>0) return;
  const fourId = await db.suppliers.add({nom:'nut&me',contact:'nutandme.fr'});
  const mats = [
    {nom:"Poudre d'amande",unite:'kg',seuil:5,prixDefaut:18},
    {nom:'Sucre glace',unite:'kg',seuil:6,prixDefaut:2.5},
    {nom:'Sucre semoule',unite:'kg',seuil:5,prixDefaut:1.8},
    {nom:"Blancs d'œufs",unite:'L',seuil:2,prixDefaut:6},
    {nom:'Chocolat blanc',unite:'kg',seuil:3,prixDefaut:12},
    {nom:'Colorant',unite:'unité',seuil:3,prixDefaut:9},
  ];
  const ids={};
  for(const m of mats) ids[m.nom]=await db.materials.add(m);
  const inDays = n => { const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
  await db.materialLots.bulkAdd([
    {materialId:ids["Poudre d'amande"],supplierId:fourId,lotFournisseur:'NM-A-101',qteInitiale:8,qteRestante:8,prix:144,dateReception:today(),dlc:inDays(120)},
    {materialId:ids['Sucre glace'],supplierId:fourId,lotFournisseur:'NM-S-220',qteInitiale:12,qteRestante:12,prix:30,dateReception:today(),dlc:inDays(300)},
    {materialId:ids["Blancs d'œufs"],supplierId:fourId,lotFournisseur:'NM-B-077',qteInitiale:3,qteRestante:3,prix:18,dateReception:today(),dlc:inDays(20)},
  ]);
  const recId = await db.recipes.add({produitNom:'Macaron vanille',rendement:60});
  await db.recipeItems.bulkAdd([
    {recipeId:recId,materialId:ids["Poudre d'amande"],qteParBatch:0.3},
    {recipeId:recId,materialId:ids['Sucre glace'],qteParBatch:0.3},
    {recipeId:recId,materialId:ids["Blancs d'œufs"],qteParBatch:0.12},
  ]);
}

// Catalogue de coffrets — créé une seule fois, indépendamment du reste
// (ainsi les utilisateurs existants l'obtiennent aussi).
async function seedProducts(){
  const n = await db.products.count();
  if(n>0) return;
  for(const t of BOX_SIZES){
    await db.products.add({ taille:t, nom:`Coffret ${t} macarons`, prix:BOX_PRICES[t], actif:true });
  }
}

// Rappel d'export hebdomadaire (parade à la purge iOS d'IndexedDB)
async function exportReminder(){
  const last = localStorage.getItem('sm_lastExport');
  if(!last){ localStorage.setItem('sm_lastExport', today()); return; }
  const diff = daysTo(last); // négatif = passé
  if(diff!==null && diff<=-7){
    toast('💾 Pense à exporter ta sauvegarde (bouton ⬇).');
  }
}

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
}

// POPUP D'ALERTE PRÉVISIONNELLE — affichée à l'ouverture (1×/jour) et après création/modif de commande.
// Toujours recalculée sur les données réelles du jour.
async function showForecastPopup(opts){
  opts=opts||{};
  let alertes;
  try{ alertes = await forecastAlerts(); }catch(e){ return; }
  if(!alertes || !alertes.length) return;
  // anti-spam : à l'ouverture, une fois par jour seulement (sauf appel forcé après une commande)
  if(opts.daily){
    if(localStorage.getItem('sm_forecastSeen')===today()) return;
    localStorage.setItem('sm_forecastSeen', today());
  }
  const lignes = alertes.slice(0,8).map(a=>{
    const d = a.firstShortDate ? `${fmtDate(a.firstShortDate)}${a.firstShortDans!=null?` (J−${Math.max(0,a.firstShortDans)})`:''}` : '';
    return `<div class="sum-box"><span>⚠ <b>${esc(a.parfum)}</b>${d?` · ${d}`:''}</span><b style="color:var(--red,#b3261e)">manque ${qty(a.manque||0)}</b></div>`;
  }).join('');
  openModal(`<h3>⚠ Risque de rupture</h3>
    <p class="note">${alertes.length} parfum(s) risque(nt) la rupture pour une livraison sous 8 jours, d'après le stock fini actuel et les commandes à venir.</p>
    ${lignes}
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Plus tard</button>
      <button class="btn gold" onclick="closeModal();view='previsionnel';setActiveView&&setActiveView('previsionnel');renderForecast()">Voir le prévisionnel</button>
    </div>`);
}

(async()=>{
  try{ await seedIfEmpty(); }catch(e){ console.error('seed',e); }
  try{ await seedProducts(); }catch(e){ console.error('seedProducts',e); }
  const opened = await handleTraceAnchor().catch(()=>false);
  if(!opened) render();
  exportReminder();
  // Surveillance quotidienne : réévalue toutes les commandes futures vs stock actuel.
  setTimeout(()=>{ showForecastPopup({daily:true}); }, 600);
})();
