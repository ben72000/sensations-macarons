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
  tracabilite:renderTrace, etiquettes:renderLabels
};
let _navLast=0;
function navTo(b){
  if(!b || !b.dataset || !b.dataset.v) return;
  // anti double-déclenchement (écoute directe + délégation)
  const now=Date.now(); if(now-_navLast<120 && view===b.dataset.v) return; _navLast=now;
  document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); view=b.dataset.v; render();
}
// Écoute directe sur chaque bouton (fiable sur Safari iPad) + délégation de secours
document.querySelectorAll('#nav button').forEach(btn=>{
  btn.addEventListener('click', ()=>navTo(btn));
});
document.getElementById('nav').addEventListener('click', e => {
  const b=e.target.closest('button'); if(b) navTo(b);
});
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
async function renderMaterials(){
  const mats = await db.materials.orderBy('nom').toArray();
  const rows=[];
  for(const mat of mats){
    const {total,dlcMin,nbLots}=await stockParMatiere(mat.id);
    const low = total<=(+mat.seuil||0);
    const dj = dlcMin?daysTo(dlcMin):null;
    rows.push(`<tr>
      <td><b>${esc(mat.nom)}</b></td>
      <td>${qty(total)} ${esc(mat.unite||'')}</td>
      <td>${qty(mat.seuil||0)} ${esc(mat.unite||'')}</td>
      <td>${nbLots}</td>
      <td>${dlcMin?`${fmtDate(dlcMin)} ${dj!==null&&dj<=7?`<span class="tag warn">${dj<=0?'expiré':dj+' j'}</span>`:''}`:'—'}</td>
      <td><span class="tag ${low?'low':'ok'}">${low?'À commander':'OK'}</span></td>
      <td style="text-align:right">
        <span class="act" onclick="lotForm(0,${mat.id})">+ Lot</span>
        <span class="act" onclick="matForm(${mat.id})">Modifier</span>
        <span class="act del" onclick="delMat(${mat.id})">Suppr.</span></td></tr>`);
  }
  const lots = await db.materialLots.orderBy('dateReception').reverse().limit(20).toArray();
  const sups = await db.suppliers.toArray();
  const supName = id => (sups.find(s=>s.id===id)||{}).nom||'—';
  const matName = id => (mats.find(s=>s.id===id)||{}).nom||'(supprimée)';
  const matUnit = id => (mats.find(s=>s.id===id)||{}).unite||'';

  // Historique des matières consommées : prodConsumption + production + lot + matière
  const allLots = await db.materialLots.toArray();
  const lotById = id => allLots.find(l=>l.id===id);
  const allProds = await db.productions.toArray();
  const prodById = id => allProds.find(p=>p.id===id);
  const recipes = await db.recipes.toArray();
  const recName = id => (recipes.find(r=>r.id===id)||{}).produitNom||'—';
  const conso = await db.prodConsumption.toArray();
  const histo = conso.map(c=>{
    const lot = lotById(c.materialLotId);
    const prod = prodById(c.productionId);
    return {
      date: prod?prod.date:'',
      materialId: lot?lot.materialId:null,
      lotFournisseur: lot?lot.lotFournisseur:'(lot supprimé)',
      qte: c.qteConsommee,
      produit: prod?recName(prod.recipeId):'(prod. supprimée)',
      lotProd: prod?prod.lotProduction:''
    };
  }).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,20);

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Matières premières & lots</h1><p>${mats.length} matière(s)</p></div>
     <div class="flex"><button class="btn gold" onclick="lotForm()">↘ Réception lot</button><button class="btn" onclick="matForm()">+ Matière</button></div></div>
   <div class="panel"><h2>Inventaire (stock = somme des lots actifs)</h2>
   ${mats.length?`<div class="table-wrap"><table><thead><tr><th>Matière</th><th>Stock</th><th>Seuil</th><th>Lots actifs</th><th>DLC la + proche</th><th>État</th><th></th></tr></thead>
     <tbody>${rows.join('')}</tbody></table></div>`:`<div class="empty">Aucune matière. Crée d'abord tes matières (poudre d'amande, sucre…), puis réceptionne des lots.</div>`}
   </div>
   <div class="panel"><h2>Derniers lots réceptionnés</h2>
   ${lots.length?`<div class="table-wrap"><table><thead><tr><th>Réception</th><th>Matière</th><th>N° lot fourn.</th><th>Fournisseur</th><th>Restant / Initial</th><th>DLC</th><th></th></tr></thead>
     <tbody>${lots.map(l=>`<tr>
       <td>${fmtDate(l.dateReception)}</td><td>${esc(matName(l.materialId))}</td>
       <td>${esc(l.lotFournisseur||'—')}</td><td>${esc(supName(l.supplierId))}</td>
       <td>${qty(l.qteRestante)} / ${qty(l.qteInitiale)}</td><td>${fmtDate(l.dlc)}</td>
       <td style="text-align:right"><span class="act del" onclick="delLot(${l.id})">Suppr.</span></td></tr>`).join('')}</tbody></table></div>`
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
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Productions</h1><p>${prods.length} batch(s) fabriqué(s)</p></div>
     <button class="btn gold" onclick="prodForm()">⚙ Nouvelle production</button></div>
   <div class="panel">
   ${prods.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Produit</th><th>N° lot prod.</th><th>Produit / Restant</th><th></th></tr></thead><tbody>
     ${prods.map(p=>`<tr>
       <td>${fmtDate(p.date)}</td><td><b>${esc(recName(p.recipeId))}</b></td>
       <td>${esc(p.lotProduction||'—')}</td><td>${qty(p.qteProduite)} / <b>${qty(p.qteRestante)}</b></td>
       <td style="text-align:right"><span class="act" onclick="traceProd(${p.id})">Traçabilité</span><span class="act" onclick="view='etiquettes';document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.v==='etiquettes'));renderLabels()">Étiquette</span><span class="act del" onclick="delProd(${p.id})">Suppr.</span></td></tr>`).join('')}
   </tbody></table></div>`:`<div class="empty">Aucune production. Une production consomme automatiquement les matières selon la recette (FIFO par DLC).</div>`}
   </div>`;
}
async function prodForm(){
  const recipes = await db.recipes.toArray();
  if(!recipes.length){toast('Crée d\'abord une recette');return;}
  const opts = recipes.map(r=>`<option value="${r.id}" data-rend="${r.rendement}">${esc(r.produitNom)} (${r.rendement}/batch)</option>`).join('');
  openModal(`<h3>Nouvelle production</h3>
   <div class="field"><label>Recette</label><select id="f_rec">${opts}</select></div>
   <div class="row2">
     <div class="field"><label>Quantité produite</label><input type="number" id="f_qte" value="${recipes[0].rendement}"></div>
     <div class="field"><label>Date</label><input type="date" id="f_date" value="${today()}"></div>
   </div>
   <div class="field"><label>N° lot de production</label><input id="f_lot" value="L-${today().replace(/-/g,'')}-${Math.random().toString(36).slice(2,5).toUpperCase()}"></div>
   <p class="note">À la validation : les matières sont déduites des lots (DLC la plus proche d'abord). Si le stock est insuffisant, <b>rien</b> n'est enregistré.</p>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn gold" onclick="saveProd()">Lancer la production</button></div>`);
}
async function saveProd(){
  const recipeId=+val('f_rec'), qte=+val('f_qte'), date=val('f_date')||today(), lot=val('f_lot');
  if(!qte||qte<=0){toast('Quantité invalide');return;}
  try{
    await enregistrerProduction(recipeId, qte, date, lot);
    closeModal(); renderProductions(); toast('Production enregistrée ✓ — stock mis à jour');
  }catch(err){
    toast(err.message || 'Erreur production');
  }
}
// Transaction atomique : consommation FIFO + traçabilité
async function enregistrerProduction(recipeId, qteProduite, dateProd, lotProduction){
  return db.transaction('rw',
    db.recipes, db.recipeItems, db.materials, db.materialLots, db.productions, db.prodConsumption,
    async () => {
      const recette = await db.recipes.get(recipeId);
      if(!recette) throw new Error('Recette introuvable');
      const items = await db.recipeItems.where('recipeId').equals(recipeId).toArray();
      const facteur = qteProduite / (recette.rendement || 1);

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

      const prodId = await db.productions.add(
        { recipeId, lotProduction, date:dateProd, qteProduite, qteRestante:qteProduite });

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
    <span style="color:#9a8a82;font-size:.85rem">Produit : ${qty(prod.qteProduite)} · Restant : ${qty(prod.qteRestante)}</span></p>
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
async function renderClients(){
  const clients = await db.clients.orderBy('nom').toArray();
  const orders = await db.orders.toArray();
  const list = clients.filter(c=>((c.nom||'')+(c.email||'')+(c.type||'')).toLowerCase().includes(clientSearch.toLowerCase()));
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Clients</h1><p>${clients.length} fiche(s)</p></div>
     <div class="flex"><input class="search" placeholder="Rechercher…" value="${esc(clientSearch)}" oninput="clientSearch=this.value;renderClients()"><button class="btn" onclick="clientForm()">+ Nouveau client</button></div></div>
   <div class="panel">
   ${list.length?`<div class="table-wrap"><table><thead><tr><th>Nom</th><th>Type</th><th>Contact</th><th>Cmd</th><th>CA cumulé</th><th></th></tr></thead><tbody>
     ${list.map(c=>{const cmds=orders.filter(o=>o.clientId===c.id);const ca=cmds.reduce((s,o)=>s+(+o.montant||0),0);
       return `<tr><td><b>${esc(c.nom)}</b></td><td><span class="tag ${c.type==='Pro'?'event':'ok'}">${esc(c.type||'Particulier')}</span></td>
       <td>${esc(c.tel||'')}${c.tel&&c.email?'<br>':''}<span style="color:#9a8a82;font-size:.82rem">${esc(c.email||'')}</span></td>
       <td>${cmds.length}</td><td>${euro(ca)}</td>
       <td style="text-align:right"><span class="act" onclick="clientForm(${c.id})">Modifier</span><span class="act del" onclick="delClient(${c.id})">Suppr.</span></td></tr>`;}).join('')}
   </tbody></table></div>`:`<div class="empty">Aucun client. Clique sur « Nouveau client ».</div>`}
   </div>`;
}
async function clientForm(id){
  const c = id ? await db.clients.get(id) : {};
  openModal(`<h3>${id?'Modifier':'Nouveau'} client</h3>
   <div class="field"><label>Nom / Entreprise</label><input id="f_nom" value="${esc(c.nom)}"></div>
   <div class="row2"><div class="field"><label>Type</label><select id="f_type"><option ${c.type==='Particulier'?'selected':''}>Particulier</option><option ${c.type==='Pro'?'selected':''}>Pro</option></select></div>
   <div class="field"><label>Téléphone</label><input id="f_tel" value="${esc(c.tel)}"></div></div>
   <div class="field"><label>Email</label><input id="f_email" value="${esc(c.email)}"></div>
   <div class="field"><label>Adresse</label><input id="f_adr" value="${esc(c.adresse)}"></div>
   <div class="field"><label>Notes</label><textarea id="f_notes" rows="2">${esc(c.notes)}</textarea></div>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveClient(${id||0})">Enregistrer</button></div>`);
}
async function saveClient(id){
  const o={nom:val('f_nom'),type:val('f_type'),tel:val('f_tel'),email:val('f_email'),adresse:val('f_adr'),notes:val('f_notes')};
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
async function renderProducts(){
  const products = (await db.products.toArray()).sort((a,b)=>(+a.taille)-(+b.taille));
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Offre / Coffrets</h1><p>Catalogue de coffrets et parfums proposés</p></div>
     <button class="btn" onclick="prodCatForm()">+ Nouveau coffret</button></div>
   <div class="panel"><h2>Coffrets</h2>
   ${products.length?`<div class="table-wrap"><table><thead><tr><th>Coffret</th><th>Taille</th><th>Prix de base</th><th>Actif</th><th></th></tr></thead><tbody>
     ${products.map(p=>`<tr><td><b>${esc(p.nom)}</b></td><td>${p.taille} macarons</td><td>${euro(p.prix)}</td>
       <td><span class="tag ${p.actif!==false?'ok':'warn'}">${p.actif!==false?'Oui':'Non'}</span></td>
       <td style="text-align:right"><span class="act" onclick="prodCatForm(${p.id})">Modifier</span><span class="act del" onclick="delProdCat(${p.id})">Suppr.</span></td></tr>`).join('')}
   </tbody></table></div>`:`<div class="empty">Aucun coffret. Ajoute tes formats (6, 8, 16, 25 macarons).</div>`}
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
     <div>${FLAVORS.map(f=>`<span class="pill">${esc(f)}</span>`).join('')}</div>
     <p class="note">Liste utilisée dans les commandes pour détailler les parfums choisis. (Modifiable dans le code si ta gamme évolue.)</p>
   </div>
   <div class="panel"><h2>Options & paiement</h2>
     <p style="font-size:.86rem;margin-bottom:8px"><b>Personnalisation couleurs :</b> proposée en option sur chaque commande.</p>
     <p style="font-size:.86rem;margin-bottom:8px"><b>Statut de paiement :</b> ${PAY_STATUS.map(s=>`<span class="pill">${esc(s)}</span>`).join('')}</p>
     <p style="font-size:.86rem"><b>Modes de règlement :</b> ${PAY_METHODS.map(s=>`<span class="pill">${esc(s)}</span>`).join('')}</p>
   </div>`;
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
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveProdCat(${id||0})">Enregistrer</button></div>`);
}
async function saveProdCat(id){
  const taille=+val('f_taille')||0;
  const o={nom:val('f_nom')||`Coffret ${taille} macarons`, taille, prix:+val('f_prix')||0, actif:document.getElementById('f_actif').checked};
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
async function renderCmd(){
  const orders = (await db.orders.toArray()).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const clients = await db.clients.toArray();
  const clName = id => (clients.find(c=>c.id===id)||{}).nom||'—';
  const lineLabel = ln => {
    if(ln.type==='evenement') return `Événement ${ln.evQte||0} mac. +${ln.equip||0} pyr.`;
    if(ln.type==='grand'){ const n=(ln.items||[]).reduce((s,b)=>s+(+b.qte||0),0); return `Grand format ×${n}`; }
    if(ln.type==='don'){ const n=(ln.parfums||[]).reduce((s,b)=>s+(+b.qte||0),0)+(ln.items||[]).reduce((s,b)=>s+(+b.qte||0),0); return `Don ×${n} (offert)`; }
    return `Coffret ${ln.taille||'?'}`;
  };
  const rows=[];
  for(const o of orders){
    const items = await db.orderItems.where('orderId').equals(o.id).toArray();
    const nbLies = items.length;
    const paye = o.paiement==='Payé';
    const lignes = orderToLines(o);
    const resume = lignes.length ? lignes.map(lineLabel).join(' + ') : '—';
    rows.push(`<tr>
       <td>${fmtDate(o.date)}</td>
       <td><b>${esc(clName(o.clientId))}</b></td>
       <td><span style="font-size:.82rem">${esc(resume)}</span>${o.perso?' <span class="tag event">perso</span>':''}</td>
       <td>${euro(+o.montant)}</td>
       <td><span class="tag ${paye?'done':'todo'}">${esc(o.paiement||'En attente')}</span>${o.reglement?`<br><span style="color:#9a8a82;font-size:.74rem">${esc(o.reglement)}</span>`:''}</td>
       <td><span class="tag ${o.statut==='Livrée'?'done':'todo'}">${esc(o.statut||'À préparer')}</span></td>
       <td>${nbLies?`<span class="tag ok">${nbLies} batch</span>`:'<span class="tag warn">non lié</span>'}</td>
       <td style="text-align:right"><span class="act" onclick="cmdView(${o.id})">Détail</span><span class="act" onclick="cmdLink(${o.id})">Lier</span><span class="act" onclick="cmdForm(${o.id})">Modifier</span><span class="act del" onclick="delCmd(${o.id})">Suppr.</span></td></tr>`);
  }
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Commandes</h1><p>${orders.length} commande(s)</p></div>
     <button class="btn" onclick="cmdForm()">+ Nouvelle commande</button></div>
   <div class="panel">
   ${rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Client</th><th>Produits</th><th>Montant</th><th>Paiement</th><th>Statut</th><th>Traça.</th><th></th></tr></thead><tbody>
     ${rows.join('')}</tbody></table></div>`:`<div class="empty">Aucune commande.</div>`}
   </div>`;
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
    <p style="margin-bottom:10px"><b>${cl?esc(cl.nom):'—'}</b> · ${fmtDate(o.date)}</p>
    ${blocks||'<p class="note">Aucun produit.</p>'}
    <div class="sum-box"><span>Personnalisation couleurs</span><b>${o.perso?'Oui':'Non'}</b></div>
    <div class="sum-box"><span>Montant total</span><b>${euro(o.montant)}</b></div>
    <div class="sum-box"><span>Paiement</span><b>${esc(o.paiement||'En attente')}${o.reglement?' · '+esc(o.reglement):''}</b></div>
    ${o.notes?`<h3 style="font-size:1rem;margin:16px 0 6px">Notes</h3><p style="font-size:.86rem;white-space:pre-wrap">${esc(o.notes)}</p>`:''}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button><button class="btn" onclick="closeModal();cmdForm(${id})">Modifier</button></div>`);
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

// Convertit une ancienne commande mono-type en lignes (rétro-compat)
function orderToLines(o){
  if(Array.isArray(o.lignes) && o.lignes.length) return JSON.parse(JSON.stringify(o.lignes));
  // ancien format : un seul type
  if(o.type==='evenement'){
    const parfums={}; (o.parfums||[]).forEach(p=>{if(p.qte>0)parfums[p.nom]=p.qte;});
    return [{type:'evenement', evQte:o.evQte||EVENT_MIN, equip:o.equip||0, parfums}];
  }
  if(o.type==='grand'){
    const items={}; (o.bigItems||[]).forEach(p=>{if(p.qte>0)items[p.nom]=p.qte;});
    return [{type:'grand', tarif:o.tarif||'particulier', items}];
  }
  if(o.type==='coffret' || o.taille){
    const parfums={}; (o.parfums||[]).forEach(p=>{if(p.qte>0)parfums[p.nom]=p.qte;});
    return [{type:'coffret', taille:o.taille||6, parfums}];
  }
  return [];
}

async function cmdForm(id){
  cmdClientsCache = await db.clients.toArray();
  cmdProductsCache = (await db.products.toArray()).filter(p=>p.actif!==false).sort((a,b)=>(+a.taille)-(+b.taille));
  const o = id ? await db.orders.get(id) : {date:today(),statut:'À préparer',paiement:'En attente',perso:false};
  cmdLines = orderToLines(o);
  const clOpts = cmdClientsCache.map(c=>`<option value="${c.id}" ${o.clientId===c.id?'selected':''}>${esc(c.nom)}</option>`).join('');
  const stOpts = ['À préparer','En cours','Livrée'].map(s=>`<option ${o.statut===s?'selected':''}>${s}</option>`).join('');
  const payStOpts = PAY_STATUS.map(s=>`<option ${o.paiement===s?'selected':''}>${s}</option>`).join('');
  const regOpts = `<option value="">—</option>`+PAY_METHODS.map(s=>`<option ${o.reglement===s?'selected':''}>${s}</option>`).join('');
  openModal(`<h3>${id?'Modifier':'Nouvelle'} commande</h3>
   ${cmdClientsCache.length?'':'<p class="note">Astuce : crée d\'abord un client.</p>'}
   <div class="row2">
     <div class="field"><label>Client</label><select id="f_cl">${clOpts||'<option value="0">— aucun —</option>'}</select></div>
     <div class="field"><label>Date</label><input type="date" id="f_date" value="${o.date||today()}"></div>
   </div>

   <label style="font-size:.82rem;color:#7a6a62;font-weight:500;display:block;margin-bottom:6px">Produits de la commande</label>
   <div id="linesWrap"></div>
   <div class="add-line-row">
     <button class="btn ghost sm" onclick="addLine('coffret')">+ Coffret</button>
     <button class="btn ghost sm" onclick="addLine('evenement')">+ Événement</button>
     <button class="btn ghost sm" onclick="addLine('grand')">+ Grand format</button>
     <button class="btn ghost sm" onclick="addLine('don')">+ Don (0 €)</button>
   </div>

   <label style="font-size:.82rem;color:#7a6a62;display:flex;gap:7px;align-items:center;margin:6px 0"><input type="checkbox" id="f_perso" style="width:auto" ${o.perso?'checked':''}> Personnalisation des couleurs</label>

   <div class="row2">
     <div class="field"><label>Prix total (€) <span style="color:#9a8a82;font-weight:400">— auto, modifiable</span></label><input type="number" step="0.01" id="f_mt" value="${o.montant||''}" oninput="this.dataset.auto='0'"></div>
     <div class="field"><label>Statut paiement</label><select id="f_pay">${payStOpts}</select></div>
   </div>
   <div class="sum-box" id="priceBreak" style="display:none"></div>
   <div class="row2">
     <div class="field"><label>Règlement</label><select id="f_reg">${regOpts}</select></div>
     <div class="field"><label>Statut commande</label><select id="f_st">${stOpts}</select></div>
   </div>

   <div class="field" style="margin-top:14px"><label>Notes</label><textarea id="f_notes" rows="2" placeholder="Allergies, livraison, demande spéciale…">${esc(o.notes||'')}</textarea></div>

   <label style="font-size:.78rem;color:#7a6a62;display:flex;gap:7px;align-items:center"><input type="checkbox" id="f_cal" style="width:auto" ${id?'':'checked'}> Ajouter au calendrier</label>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveCmd(${id||0})">Enregistrer</button></div>`);
  const mt=document.getElementById('f_mt'); if(mt && !mt.value) mt.dataset.auto='1';
  drawLines();
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

// Calcule le prix d'une ligne
function lineTotal(ln){
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
function cmdRecalc(){
  const total = cmdLines.reduce((s,ln)=>s+lineTotal(ln),0);
  const mt=document.getElementById('f_mt');
  if(mt && mt.dataset.auto==='1'){ mt.value = total?total.toFixed(2):''; }
  const brk=document.getElementById('priceBreak');
  if(brk){
    if(cmdLines.length){ brk.style.display='flex'; brk.innerHTML=`<span>Total ${cmdLines.length} produit(s)</span><b>${euro(total)}</b>`; }
    else brk.style.display='none';
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
  // normaliser les lignes (parfums/items en tableaux pour stockage propre)
  const lignes = cmdLines.map(ln=>{
    if(ln.type==='coffret') return {type:'coffret', taille:ln.taille, parfums:Object.keys(ln.parfums).filter(k=>ln.parfums[k]>0).map(nom=>({nom,qte:ln.parfums[nom]}))};
    if(ln.type==='evenement') return {type:'evenement', evQte:ln.evQte, equip:ln.equip, parfums:Object.keys(ln.parfums).filter(k=>ln.parfums[k]>0).map(nom=>({nom,qte:ln.parfums[nom]}))};
    if(ln.type==='grand') return {type:'grand', tarif:ln.tarif, items:Object.keys(ln.items).filter(k=>ln.items[k]>0).map(nom=>({nom,qte:ln.items[nom]}))};
    if(ln.type==='don') return {type:'don', parfums:Object.keys(ln.parfums||{}).filter(k=>ln.parfums[k]>0).map(nom=>({nom,qte:ln.parfums[nom]})), items:Object.keys(ln.items||{}).filter(k=>ln.items[k]>0).map(nom=>({nom,qte:ln.items[nom]}))};
  });
  const o={
    clientId:+val('f_cl')||0, date:val('f_date'),
    lignes,
    perso:document.getElementById('f_perso').checked,
    montant:+val('f_mt')||0,
    paiement:val('f_pay')||'En attente', reglement:val('f_reg')||'',
    statut:val('f_st'), notes:val('f_notes'),
    // on neutralise les anciens champs mono-type
    type:'multi', taille:0, parfums:[], evQte:0, equip:0, tarif:'', bigItems:[]
  };
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
async function renderCal(){
  const events = await db.events.toArray();
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
     <div class="cal-grid">${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d=>`<div class="cal-head">${d}</div>`).join('')}</div>
     <div class="cal-grid" style="margin-top:6px">${cells.map(d=>{
       if(d===null)return `<div class="cal-cell other"></div>`;
       const t=new Date();const isToday=t.getDate()===d&&t.getMonth()===m&&t.getFullYear()===y;
       const evs=evByDay[d]||[];
       return `<div class="cal-cell ${isToday?'today':''}"><div class="cal-num">${d}</div>
        ${evs.map(e=>`<div class="cal-ev ${e.type==='cmd'?'cmd':''}" onclick="delEvent(${e.id})" title="Cliquer pour supprimer">${esc(e.titre)}</div>`).join('')}</div>`;
     }).join('')}</div>
     <p class="note">Clique sur un événement pour le supprimer. Les commandes apparaissent en caramel.</p>
   </div>`;
}
function calMove(n){ calRef.setMonth(calRef.getMonth()+n); renderCal(); }
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
  if(!confirm('Supprimer cet événement ?'))return;
  await db.events.delete(id); renderCal();
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
   <div class="topbar"><div><h1>Étiquettes QR</h1><p>Une étiquette traçable par batch — à imprimer et coller sur les boîtes</p></div>
     <div class="flex"><button class="btn ghost" onclick="window.print()">⎙ Imprimer</button></div></div>
   <div class="banner">▤ <div>Chaque QR encode un lien vers la fiche de traçabilité du batch. Scanné avec l'appareil photo de l'iPhone, il ouvre directement la chaîne fournisseur → lot → batch.</div></div>
   <div class="panel">
   ${prods.length?`<div class="labels-grid" id="labelsGrid">
     ${prods.map(p=>`<div class="label">
        <div class="qr"><canvas data-lot="${esc(p.lotProduction||'')}"></canvas></div>
        <div class="info">
          <b>${esc(recName(p.recipeId))}</b><br>
          <span class="meta">Lot ${esc(p.lotProduction||'—')}</span><br>
          <span class="meta">Prod. ${fmtDate(p.date)}</span><br>
          <span class="meta">${p.qteProduite} pièces</span>
          <div class="brand-tag">Sensations Macarons</div>
        </div>
     </div>`).join('')}
   </div>`:`<div class="empty">Aucun batch produit. Lance une production pour générer ses étiquettes.</div>`}
   </div>`;
  // dessiner les QR après insertion dans le DOM
  document.querySelectorAll('#labelsGrid canvas').forEach(cv=>{
    const lot = cv.getAttribute('data-lot');
    try{ QR.render(cv, traceUrl(lot), {scale:4, dark:'#52252F', light:'#ffffff'}); }
    catch(e){ console.error('QR',e); }
  });
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

(async()=>{
  try{ await seedIfEmpty(); }catch(e){ console.error('seed',e); }
  try{ await seedProducts(); }catch(e){ console.error('seedProducts',e); }
  const opened = await handleTraceAnchor().catch(()=>false);
  if(!opened) render();
  exportReminder();
})();
