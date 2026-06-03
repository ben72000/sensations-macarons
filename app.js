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

// --------- Helpers ---------
const euro  = n => (+n || 0).toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' €';
const today = () => new Date().toISOString().slice(0,10);
const esc   = s => (s==null?'':String(s)).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function val(id){ const el = document.getElementById(id); return el ? (el.value||'').trim() : ''; }
function fmtDate(s){ if(!s) return ''; const d = new Date(s); return isNaN(d)?'':d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'2-digit'}); }
function daysTo(s){ if(!s) return null; return Math.ceil((new Date(s) - new Date(today())) / 86400000); }

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
  dash:renderDash, clients:renderClients, commandes:renderCmd, cal:renderCal,
  fournisseurs:renderSuppliers, matieres:renderMaterials, recettes:renderRecipes,
  productions:renderProductions, tracabilite:renderTrace, etiquettes:renderLabels
};
document.getElementById('nav').addEventListener('click', e => {
  const b=e.target.closest('button'); if(!b) return;
  document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); view=b.dataset.v; render();
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
       ${low.length?`<table><tbody>${low.map(s=>`<tr><td>${esc(s.nom)}</td><td style="text-align:right"><span class="tag low">${s.total} ${esc(s.unite||'')}</span></td><td style="text-align:right;color:#9a8a82">seuil ${s.seuil}</td></tr>`).join('')}</tbody></table>`:`<div class="empty">Tout est au-dessus du seuil ✓</div>`}
     </div>
     <div class="panel"><h2>Prochaines échéances</h2>
       ${upcoming.length?`<table><tbody>${upcoming.map(e=>`<tr><td>${fmtDate(e.date)}</td><td>${esc(e.titre)}</td><td style="text-align:right"><span class="tag ${e.type==='cmd'?'todo':'event'}">${e.type==='cmd'?'Commande':'Événement'}</span></td></tr>`).join('')}</tbody></table>`:`<div class="empty">Aucune échéance à venir</div>`}
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
   ${list.length?`<table><thead><tr><th>Nom</th><th>Contact</th><th></th></tr></thead><tbody>
     ${list.map(s=>`<tr><td><b>${esc(s.nom)}</b></td><td style="color:#9a8a82">${esc(s.contact||'')}</td>
       <td style="text-align:right"><span class="act" onclick="supForm(${s.id})">Modifier</span><span class="act del" onclick="delSup(${s.id})">Suppr.</span></td></tr>`).join('')}
   </tbody></table>`:`<div class="empty">Aucun fournisseur. Ajoute tes fournisseurs (nut&me, Calconut…).</div>`}
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
      <td>${total} ${esc(mat.unite||'')}</td>
      <td>${esc(mat.seuil||0)} ${esc(mat.unite||'')}</td>
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

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Matières premières & lots</h1><p>${mats.length} matière(s)</p></div>
     <div class="flex"><button class="btn gold" onclick="lotForm()">↘ Réception lot</button><button class="btn" onclick="matForm()">+ Matière</button></div></div>
   <div class="panel"><h2>Inventaire (stock = somme des lots actifs)</h2>
   ${mats.length?`<table><thead><tr><th>Matière</th><th>Stock</th><th>Seuil</th><th>Lots actifs</th><th>DLC la + proche</th><th>État</th><th></th></tr></thead>
     <tbody>${rows.join('')}</tbody></table>`:`<div class="empty">Aucune matière. Crée d'abord tes matières (poudre d'amande, sucre…), puis réceptionne des lots.</div>`}
   </div>
   <div class="panel"><h2>Derniers lots réceptionnés</h2>
   ${lots.length?`<table><thead><tr><th>Réception</th><th>Matière</th><th>N° lot fourn.</th><th>Fournisseur</th><th>Restant / Initial</th><th>DLC</th><th></th></tr></thead>
     <tbody>${lots.map(l=>`<tr>
       <td>${fmtDate(l.dateReception)}</td><td>${esc(matName(l.materialId))}</td>
       <td>${esc(l.lotFournisseur||'—')}</td><td>${esc(supName(l.supplierId))}</td>
       <td>${l.qteRestante} / ${l.qteInitiale}</td><td>${fmtDate(l.dlc)}</td>
       <td style="text-align:right"><span class="act del" onclick="delLot(${l.id})">Suppr.</span></td></tr>`).join('')}</tbody></table>`
     :`<div class="empty">Aucun lot réceptionné.</div>`}
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
  if(id) await db.materials.update(id,o); else await db.materials.add(o);
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
  const matOpts = mats.map(m=>`<option value="${m.id}" ${presetMat===m.id?'selected':''}>${esc(m.nom)} (${esc(m.unite)})</option>`).join('');
  const supOpts = `<option value="0">— non précisé —</option>`+sups.map(s=>`<option value="${s.id}">${esc(s.nom)}</option>`).join('');
  openModal(`<h3>Réception d'un lot</h3>
   <div class="field"><label>Matière</label><select id="f_mat">${matOpts}</select></div>
   <div class="row2">
     <div class="field"><label>Fournisseur</label><select id="f_sup">${supOpts}</select></div>
     <div class="field"><label>N° lot fournisseur</label><input id="f_lotf" placeholder="ex: NM-2026-0142"></div>
   </div>
   <div class="row2">
     <div class="field"><label>Quantité reçue</label><input type="number" step="0.01" id="f_qte" value="1"></div>
     <div class="field"><label>Prix total (€)</label><input type="number" step="0.01" id="f_prix" value="0"></div>
   </div>
   <div class="row2">
     <div class="field"><label>Date réception</label><input type="date" id="f_date" value="${today()}"></div>
     <div class="field"><label>DLC / DDM</label><input type="date" id="f_dlc"></div>
   </div>
   <p class="note">Chaque réception crée un lot tracé. La production puisera dans les lots par <b>DLC la plus proche d'abord (FIFO)</b>.</p>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn gold" onclick="saveLot()">Réceptionner</button></div>`);
}
async function saveLot(){
  const qte=+val('f_qte');
  if(!qte||qte<=0){toast('Quantité invalide');return;}
  const o={
    materialId:+val('f_mat'), supplierId:+val('f_sup')||0,
    lotFournisseur:val('f_lotf'), qteInitiale:qte, qteRestante:qte,
    prix:+val('f_prix')||0, dateReception:val('f_date')||today(), dlc:val('f_dlc')||''
  };
  await db.materialLots.add(o);
  closeModal(); renderMaterials(); toast('Lot réceptionné ✓');
}
async function delLot(id){
  if(!confirm('Supprimer ce lot ? (Attention à la traçabilité)'))return;
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
      ${items.length?`<table><thead><tr><th>Matière</th><th>Quantité / batch</th></tr></thead><tbody>
        ${items.map(it=>`<tr><td>${esc(matName(it.materialId))}</td><td>${it.qteParBatch} ${esc(matUnit(it.materialId))}</td></tr>`).join('')}
      </tbody></table>`:`<div class="empty">Aucun ingrédient défini.</div>`}</div>`);
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
  const o={produitNom:val('f_nom'),rendement:+val('f_rend')||1};
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
   ${prods.length?`<table><thead><tr><th>Date</th><th>Produit</th><th>N° lot prod.</th><th>Produit / Restant</th><th></th></tr></thead><tbody>
     ${prods.map(p=>`<tr>
       <td>${fmtDate(p.date)}</td><td><b>${esc(recName(p.recipeId))}</b></td>
       <td>${esc(p.lotProduction||'—')}</td><td>${p.qteProduite} / <b>${p.qteRestante}</b></td>
       <td style="text-align:right"><span class="act" onclick="traceProd(${p.id})">Traçabilité</span><span class="act" onclick="view='etiquettes';document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.v==='etiquettes'));renderLabels()">Étiquette</span><span class="act del" onclick="delProd(${p.id})">Suppr.</span></td></tr>`).join('')}
   </tbody></table>`:`<div class="empty">Aucune production. Une production consomme automatiquement les matières selon la recette (FIFO par DLC).</div>`}
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
          await db.prodConsumption.add({productionId:prodId, materialLotId:lot.id, qteConsommee:pris});
          besoin -= pris;
        }
      }
      return prodId;
    });
}
async function delProd(id){
  if(!confirm('Supprimer cette production ? (le stock consommé ne sera PAS recrédité)'))return;
  await db.transaction('rw',db.productions,db.prodConsumption,db.orderItems,async()=>{
    await db.prodConsumption.where('productionId').equals(id).delete();
    await db.orderItems.where('productionId').equals(id).delete();
    await db.productions.delete(id);
  });
  renderProductions(); toast('Production supprimée');
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
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Traçabilité</h1><p>Remonter la chaîne fournisseur → lot → batch → commande</p></div></div>
   <div class="banner">⊕ <div>La traçabilité répond à trois questions réglementaires : ingrédients d'une commande, origine d'un batch, et usage d'un lot de matière.</div></div>
   <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px">
     <div class="panel"><h2>Par commande livrée</h2>
       ${orders.length?`<table><tbody>${orders.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(o=>`<tr>
         <td>${fmtDate(o.date)}</td><td><b>${esc(clName(o.clientId))}</b></td>
         <td style="text-align:right"><span class="act" onclick="traceOrder(${o.id})">Tracer</span></td></tr>`).join('')}</tbody></table>`
         :`<div class="empty">Aucune commande.</div>`}
     </div>
     <div class="panel"><h2>Par batch de production</h2>
       ${prods.length?`<table><tbody>${prods.map(p=>`<tr>
         <td>${fmtDate(p.date)}</td><td><b>${esc(recName(p.recipeId))}</b><br><span style="color:#9a8a82;font-size:.78rem">${esc(p.lotProduction||'')}</span></td>
         <td style="text-align:right"><span class="act" onclick="traceProd(${p.id})">Tracer</span></td></tr>`).join('')}</tbody></table>`
         :`<div class="empty">Aucune production.</div>`}
     </div>
   </div>`;
}

async function traceProd(prodId){
  const prod = await db.productions.get(prodId);
  const recipe = await db.recipes.get(prod.recipeId);
  const conso = await db.prodConsumption.where('productionId').equals(prodId).toArray();
  const lines=[];
  for(const c of conso){
    const lot = await db.materialLots.get(c.materialLotId);
    if(!lot){ lines.push(`<div class="trace-step">Lot supprimé — ${c.qteConsommee}</div>`); continue; }
    const mat = await db.materials.get(lot.materialId);
    const sup = lot.supplierId ? await db.suppliers.get(lot.supplierId) : null;
    lines.push(`<div class="trace-step"><b>${esc(mat?mat.nom:'?')}</b> — ${c.qteConsommee} ${esc(mat?mat.unite:'')}<br>
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
    <span style="color:#9a8a82;font-size:.85rem">Produit : ${prod.qteProduite} · Restant : ${prod.qteRestante}</span></p>
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
      const lot = await db.materialLots.get(c.materialLotId); if(!lot) continue;
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
   ${list.length?`<table><thead><tr><th>Nom</th><th>Type</th><th>Contact</th><th>Cmd</th><th>CA cumulé</th><th></th></tr></thead><tbody>
     ${list.map(c=>{const cmds=orders.filter(o=>o.clientId===c.id);const ca=cmds.reduce((s,o)=>s+(+o.montant||0),0);
       return `<tr><td><b>${esc(c.nom)}</b></td><td><span class="tag ${c.type==='Pro'?'event':'ok'}">${esc(c.type||'Particulier')}</span></td>
       <td>${esc(c.tel||'')}${c.tel&&c.email?'<br>':''}<span style="color:#9a8a82;font-size:.82rem">${esc(c.email||'')}</span></td>
       <td>${cmds.length}</td><td>${euro(ca)}</td>
       <td style="text-align:right"><span class="act" onclick="clientForm(${c.id})">Modifier</span><span class="act del" onclick="delClient(${c.id})">Suppr.</span></td></tr>`;}).join('')}
   </tbody></table>`:`<div class="empty">Aucun client. Clique sur « Nouveau client ».</div>`}
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
   COMMANDES  (+ liaison aux batchs = traçabilité aval)
   ============================================================ */
async function renderCmd(){
  const orders = (await db.orders.toArray()).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const clients = await db.clients.toArray();
  const clName = id => (clients.find(c=>c.id===id)||{}).nom||'—';
  const rows=[];
  for(const o of orders){
    const items = await db.orderItems.where('orderId').equals(o.id).toArray();
    const nbLies = items.length;
    rows.push(`<tr><td>${fmtDate(o.date)}</td><td><b>${esc(clName(o.clientId))}</b></td><td>${esc(o.detail||'')}</td><td>${euro(+o.montant)}</td>
       <td><span class="tag ${o.statut==='Livrée'?'done':'todo'}">${esc(o.statut||'À préparer')}</span></td>
       <td>${nbLies?`<span class="tag ok">${nbLies} batch</span>`:'<span class="tag warn">non lié</span>'}</td>
       <td style="text-align:right"><span class="act" onclick="cmdLink(${o.id})">Lier batch</span><span class="act" onclick="cmdForm(${o.id})">Modifier</span><span class="act del" onclick="delCmd(${o.id})">Suppr.</span></td></tr>`);
  }
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Commandes</h1><p>${orders.length} commande(s)</p></div>
     <button class="btn" onclick="cmdForm()">+ Nouvelle commande</button></div>
   <div class="panel">
   ${rows.length?`<table><thead><tr><th>Date</th><th>Client</th><th>Détail</th><th>Montant</th><th>Statut</th><th>Traçabilité</th><th></th></tr></thead><tbody>
     ${rows.join('')}</tbody></table>`:`<div class="empty">Aucune commande.</div>`}
   </div>`;
}
async function cmdForm(id){
  const clients = await db.clients.toArray();
  const o = id ? await db.orders.get(id) : {date:today(),statut:'À préparer'};
  const opts = clients.map(c=>`<option value="${c.id}" ${o.clientId===c.id?'selected':''}>${esc(c.nom)}</option>`).join('');
  openModal(`<h3>${id?'Modifier':'Nouvelle'} commande</h3>
   ${clients.length?'':'<p class="note">Astuce : crée d\'abord un client.</p>'}
   <div class="field"><label>Client</label><select id="f_cl">${opts||'<option value="0">— aucun —</option>'}</select></div>
   <div class="row2"><div class="field"><label>Date</label><input type="date" id="f_date" value="${o.date||today()}"></div>
   <div class="field"><label>Montant (€)</label><input type="number" step="0.01" id="f_mt" value="${o.montant||''}"></div></div>
   <div class="field"><label>Détail (boîtes, parfums…)</label><input id="f_det" value="${esc(o.detail)}"></div>
   <div class="field"><label>Statut</label><select id="f_st">${['À préparer','En cours','Livrée'].map(s=>`<option ${o.statut===s?'selected':''}>${s}</option>`).join('')}</select></div>
   <label style="font-size:.78rem;color:#7a6a62;display:flex;gap:7px;align-items:center;margin-top:4px"><input type="checkbox" id="f_cal" style="width:auto" ${id?'':'checked'}> Ajouter au calendrier</label>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveCmd(${id||0})">Enregistrer</button></div>`);
}
async function saveCmd(id){
  const o={clientId:+val('f_cl')||0,date:val('f_date'),montant:+val('f_mt')||0,detail:val('f_det'),statut:val('f_st')};
  if(!o.montant){toast('Indique un montant');return;}
  let oid=id;
  if(id) await db.orders.update(id,o); else oid=await db.orders.add(o);
  const cb=document.getElementById('f_cal');
  if(cb&&cb.checked){
    const cl = o.clientId ? await db.clients.get(o.clientId) : null;
    await db.events.add({date:o.date,titre:'Cmd '+(cl?cl.nom:''),type:'cmd',refId:oid});
  }
  closeModal(); renderCmd(); toast('Commande enregistrée ✓');
}
async function delCmd(id){
  if(!confirm('Supprimer cette commande ?'))return;
  await db.transaction('rw',db.orders,db.orderItems,async()=>{
    await db.orderItems.where('orderId').equals(id).delete();
    await db.orders.delete(id);
  });
  renderCmd(); toast('Supprimée');
}
// Lier une commande à des batchs (décrémente le stock de produits finis)
async function cmdLink(orderId){
  const prods = await db.productions.toArray();
  const recipes = await db.recipes.toArray();
  const recName = id => (recipes.find(r=>r.id===id)||{}).produitNom||'?';
  const dispo = prods.filter(p=>+p.qteRestante>0);
  const existing = await db.orderItems.where('orderId').equals(orderId).toArray();
  openModal(`<h3>Lier des batchs à la commande</h3>
    ${existing.length?`<p class="note">Déjà lié : ${existing.map(e=>{const p=prods.find(x=>x.id===e.productionId);return (p?esc(p.lotProduction):'?')+' ('+e.qte+')';}).join(', ')}</p>`:''}
    ${dispo.length?`
    <div class="field"><label>Batch (produit fini disponible)</label>
      <select id="f_prod">${dispo.map(p=>`<option value="${p.id}">${esc(recName(p.recipeId))} — ${esc(p.lotProduction||'')} (reste ${p.qteRestante})</option>`).join('')}</select></div>
    <div class="field"><label>Quantité à affecter</label><input type="number" id="f_q" value="1"></div>`
    :'<p class="note">Aucun batch disponible. Lance une production d\'abord.</p>'}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
    ${dispo.length?`<button class="btn gold" onclick="saveLink(${orderId})">Lier</button>`:''}</div>`);
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


const TABLES = ['suppliers','materials','materialLots','recipes','recipeItems','productions','prodConsumption','clients','orders','orderItems','events'];
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
  if(!confirm('Importer remplacera toutes les données actuelles. Continuer ?')){e.target.value='';return;}
  try{
    const obj=JSON.parse(await f.text());
    await db.transaction('rw',...TABLES.map(t=>db.table(t)),async()=>{
      for(const t of TABLES){ await db.table(t).clear(); if(Array.isArray(obj[t])) await db.table(t).bulkAdd(obj[t]); }
    });
    render(); toast('Données importées ✓');
  }catch(err){ console.error(err); toast('Fichier invalide'); }
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
  const opened = await handleTraceAnchor().catch(()=>false);
  if(!opened) render();
  exportReminder();
})();
