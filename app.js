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
// v4 : historique des sauvegardes internes (JSON complet + somme de contrôle)
db.version(4).stores({
  backups:         '++id, date, type'
});
// v5 : charges / dépenses (comptabilité)
db.version(5).stores({
  charges:         '++id, date, categorie'
});
// v6 : marchés / ventes itinérantes + mouvements (sortie, don, perte, retour, vente)
db.version(6).stores({
  markets:         '++id, date, nom',
  marketMoves:     '++id, marketId, productionId, type'   // type: sortie | don | perte | retour
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

/* ============================================================
   PARAMÈTRES DE GESTION (réglables, persistés en localStorage)
   - Taux de charges sociales : marchandise (produit fini) vs prestation de service
   - Coût emballages/consommables par coffret selon la taille
   ============================================================ */
const SETTINGS_DEFAULTS = {
  socialGoods: 12.3,     // % charges sociales sur vente de marchandise (produit fini)
  socialService: 25.6,   // % charges sociales sur prestation de service
  packaging: { 6:0.50, 8:0.60, 16:1.00, 25:1.50 }, // € emballage/consommable par coffret (commandes)
  // Types d'emballage pour le comptage avant/après marché (delta) : {nom, cout unitaire €}
  packTypes: [
    {nom:'Boîte 6', cout:0.50},
    {nom:'Boîte 12', cout:0.80},
    {nom:'Sachet individuel', cout:0.15},
    {nom:'Pochon kraft', cout:0.30}
  ]
};
function getSettings(){
  try{ const s=JSON.parse(localStorage.getItem('sm_settings')||'{}');
    return {
      socialGoods: s.socialGoods!=null?+s.socialGoods:SETTINGS_DEFAULTS.socialGoods,
      socialService: s.socialService!=null?+s.socialService:SETTINGS_DEFAULTS.socialService,
      packaging: Object.assign({}, SETTINGS_DEFAULTS.packaging, s.packaging||{}),
      packTypes: Array.isArray(s.packTypes) ? s.packTypes : JSON.parse(JSON.stringify(SETTINGS_DEFAULTS.packTypes))
    };
  }catch(e){ return JSON.parse(JSON.stringify(SETTINGS_DEFAULTS)); }
}
function saveSettings(s){ localStorage.setItem('sm_settings', JSON.stringify(s)); }
// Coût emballage d'un coffret selon sa taille (commandes)
function packagingCost(taille){ const s=getSettings(); return money2(s.packaging[taille]!=null?s.packaging[taille]:0); }


// Macarons grand format (vente à l'unité), double tarif
const BIG_FORMATS = ['Chocolat', 'Myrtille framboise', 'Mangue passion', 'Madeleine'];
const BIG_PRICE = { pro: 3.20, particulier: 6.00 };

// --------- Helpers ---------
// Arrondis stricts pour éviter la dérive des flottants (ex. 0.1+0.2, soustractions FIFO répétées).
// money2 : arrondi au centime via entiers de centimes. round3 : quantités de stock (3 décimales).
const money2 = n => Math.round(((+n)||0)*100)/100;
const round3  = n => Math.round(((+n)||0)*1000)/1000;
// Opérations financières/stocks sûres (toujours ré-arrondies après l'opération).
const addMoney = (...xs) => money2(xs.reduce((s,x)=>s+((+x)||0),0));
const subMoney = (a,b) => money2(((+a)||0)-((+b)||0));
const mulMoney = (a,b) => money2(((+a)||0)*((+b)||0));
const addQty  = (...xs) => round3(xs.reduce((s,x)=>s+((+x)||0),0));
const subQty  = (a,b) => round3(((+a)||0)-((+b)||0));
// ---- MODE DISCRET / CONFIDENTIALITÉ ----
// Masque les chiffres sensibles (CA, montants, volumes de stock) d'un simple clic,
// utile devant un client ou un fournisseur. Persisté dans localStorage (comme sm_autoPay).
function privacyModeEnabled(){ return localStorage.getItem('sm_privacyMode')==='1'; }
function setPrivacyMode(on){ localStorage.setItem('sm_privacyMode', on?'1':'0'); }
function togglePrivacyMode(){ setPrivacyMode(!privacyModeEnabled()); render(); }

// Suspension ponctuelle du masquage : la SAISIE et le DÉTAIL d'une commande restent
// toujours en clair (on a besoin de voir les prix face au client), même en mode discret.
// _privacySuspend>0 ⇒ euro()/qtyP() n'appliquent pas le masquage.
let _privacySuspend = 0;
function privacyMasked(){ return privacyModeEnabled() && _privacySuspend<=0; }
// Exécute fn() avec le masquage suspendu (utilisé pour le rendu HTML synchrone d'une modale).
function withClearMoney(fn){ _privacySuspend++; try{ return fn(); } finally{ _privacySuspend--; } }

// euro() est privacy-aware : en mode discret, tous les montants deviennent « ••• € »,
// SAUF pendant une suspension (saisie/détail de commande).
// Comme tous les écrans passent par euro(), un seul interrupteur masque l'argent partout.
const euro = n => privacyMasked() ? '••• €'
  : (money2(n)).toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' €';
// Quantité : arrondit proprement (max 3 décimales) et supprime les zéros parasites
const qty = n => { const v = round3(n); return v.toLocaleString('fr-FR', {maximumFractionDigits:3}); };
// Masque un volume de stock en mode discret (sauf suspension).
const qtyP = n => privacyMasked() ? '•••' : qty(n);
const today = () => new Date().toISOString().slice(0,10);
// Calcule la DLC selon l'emplacement, à partir d'un horodatage (calcul SIMPLE, sans historique).
// Règle de base : frigo = +7 jours ; congélateur = +4 mois.
function computeDlc(emplacement, baseIso){
  const d = baseIso ? new Date(baseIso) : new Date();
  if(emplacement==='congelateur'){ d.setMonth(d.getMonth()+4); }
  else { d.setDate(d.getDate()+7); } // frigo (et défaut prudent)
  return d.toISOString().slice(0,10);
}
const FRIGO_DAYS = 7;        // durée de vie totale au frigo (jours)
const CONGELO_MONTHS = 4;    // durée de vie au congélateur (mois)
const MS_DAY = 86400000;
// Calcule la DLC en TENANT COMPTE de l'historique des emplacements.
// Principe sanitaire : le frigo dispose d'un budget total de 7 jours qui se CONSOMME
// à chaque séjour au frigo (avant ET après congélation). La congélation met le compteur
// en pause (le froid négatif ne consomme pas le budget frigo) et ajoute sa propre limite
// de 4 mois tant que le produit reste congelé.
// hist = [{lieu:'frigo'|'congelateur', ts:ISO, ...}] dans l'ordre chronologique.
// refIso = instant "de référence" (le dernier déplacement, ou maintenant) à partir duquel
// on projette le temps restant pour le segment courant.
function computeDlcFromHistory(hist, refIso){
  if(!Array.isArray(hist) || !hist.length) return null;
  const segs = hist.slice().sort((a,b)=>(a.ts||'').localeCompare(b.ts||''));
  const ref = new Date(refIso||new Date().toISOString());
  let frigoConsumedMs = 0;        // temps frigo déjà consommé (segments clos)
  // parcourt les segments fermés (du début jusqu'à l'avant-dernier) pour cumuler le temps frigo écoulé
  for(let i=0;i<segs.length-1;i++){
    if(segs[i].lieu==='frigo'){
      const start=new Date(segs[i].ts), end=new Date(segs[i+1].ts);
      const dur=end-start; if(dur>0) frigoConsumedMs+=dur;
    }
  }
  const last=segs[segs.length-1];
  const lastStart=new Date(last.ts);
  if(last.lieu==='congelateur'){
    // DLC = entrée au congélo + 4 mois (le budget frigo restant est gelé jusqu'à la décongélation)
    const d=new Date(lastStart); d.setMonth(d.getMonth()+CONGELO_MONTHS);
    return d.toISOString().slice(0,10);
  }
  // segment courant = frigo : budget restant = 7j - temps frigo déjà consommé (segments précédents)
  // + temps déjà écoulé dans le segment frigo courant (entre lastStart et ref)
  const currentFrigoElapsed = Math.max(0, ref - lastStart);
  const totalFrigoConsumed = frigoConsumedMs + currentFrigoElapsed;
  const resteMs = Math.max(0, FRIGO_DAYS*MS_DAY - totalFrigoConsumed);
  const dlc=new Date(ref.getTime()+resteMs);
  return dlc.toISOString().slice(0,10);
}
// Horodatage lisible "le JJ/MM/AAAA à HHhMM" à partir d'un ISO.
function fmtDateTime(iso){
  if(!iso) return '—';
  const d=new Date(iso); if(isNaN(d)) return '—';
  const date=d.toLocaleDateString('fr-FR');
  const h=String(d.getHours()).padStart(2,'0'), mn=String(d.getMinutes()).padStart(2,'0');
  return `${date} à ${h}h${mn}`;
}
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
function openModal(html){ modal.innerHTML=html; overlay.classList.add('show');
  if(_histReady && !_popping){ try{ history.pushState({kind:'modal'}, '', '#modal'); }catch(e){} } }
function closeModal(opts){
  overlay.classList.remove('show'); modal.innerHTML='';
  _privacySuspend=0; // fin d'une éventuelle suspension du masquage (saisie/détail commande)
  // sécurité : couper toute caméra de scan encore active
  if(typeof stopScanStream==='function'){ try{ stopScanStream(); }catch(e){} }
  // si fermeture déclenchée par l'utilisateur (pas par un retour navigateur), consommer l'entrée d'historique
  opts=opts||{};
  if(_histReady && !_popping && !opts.fromPop && history.state && history.state.kind==='modal'){
    try{ history.back(); }catch(e){}
  }
}
overlay.addEventListener('click', e => { if(e.target===overlay) closeModal(); });

// --------- Router ---------
let view='dash';
const VIEWS = {
  dash:renderDash, clients:renderClients, commandes:renderCmd, produits:renderProducts, cal:renderCal,
  fournisseurs:renderSuppliers, matieres:renderMaterials, recettes:renderRecipes,
  productions:renderProductions, couts:renderCosts, dlc:renderDlc,
  tracabilite:renderTrace, etiquettes:renderLabels, stats:renderStats, compta:renderCompta, pilotage:renderPilotage, rentabilite:renderProfit, marches:renderMarkets, analyse:renderAnalyse, previsionnel:renderForecast, evenements:renderEvents, sauvegardes:renderBackups, assistant:renderAssistant
};
let _navLast=0;
let _popping=false;        // vrai quand on traite un retour (popstate) pour éviter de re-pousser
let _histReady=false;
function setActiveView(v){
  document.querySelectorAll('.nav button, .tabbar button, .sheet-grid button').forEach(x=>{
    if(x.dataset && x.dataset.v) x.classList.toggle('active', x.dataset.v===v);
  });
}
function navTo(b){
  if(!b || !b.dataset || !b.dataset.v) return;
  const now=Date.now(); if(now-_navLast<120 && view===b.dataset.v && !document.getElementById('sheetOverlay').classList.contains('show')) return; _navLast=now;
  goView(b.dataset.v);
  closeSheet();
}
// Navigation centralisée : change la vue ET empile une entrée d'historique (bouton Retour iOS).
function goView(v, opts){
  opts=opts||{};
  view=v; setActiveView(view); render();
  if(_histReady && !_popping && !opts.replace){
    try{ history.pushState({view:v, kind:'view'}, '', '#'+v); }catch(e){}
  }
}
function openSheet(){
  const o=document.getElementById('sheetOverlay'); if(o){ o.classList.add('show'); setActiveView(view);
    if(_histReady && !_popping){ try{ history.pushState({kind:'sheet'}, '', '#menu'); }catch(e){} } }
}
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

// FLUIDITÉ DE NAVIGATION : sur mobile, dès que l'utilisateur fait défiler la PAGE DE FOND,
// on retire le focus du champ actif (clavier qui se referme) pour ne plus avoir à
// toucher une zone vide. IMPORTANT : on ne le fait JAMAIS quand une modale de saisie est
// ouverte (sinon le clavier qui s'ouvre déclenche un scroll et le champ perd le focus =
// « ça quitte dès qu'on tape »), ni pour les zones de texte multi-lignes.
let _scrollBlurTimer=null;
document.addEventListener('scroll', (e)=>{
  // une modale est ouverte ? on ne touche à rien (saisie protégée)
  if(overlay && overlay.classList.contains('show')) return;
  // le scroll vient-il d'une liste interne (tableau) plutôt que de la page ? on ignore
  const tgt=e.target;
  if(tgt && tgt.closest && tgt.closest('.table-wrap')) return;
  const a=document.activeElement;
  if(!a) return;
  // ne jamais retirer le focus d'un champ texte/area en cours de frappe
  const tag=a.tagName;
  if(tag==='TEXTAREA') return;
  if(tag==='INPUT'){
    const t=(a.getAttribute('type')||'text').toLowerCase();
    // champs de SAISIE TEXTE : on laisse l'utilisateur taper tranquillement
    if(['text','number','tel','email','search','date','password','url'].includes(t)) return;
  }
  if(tag==='INPUT' || tag==='SELECT'){
    clearTimeout(_scrollBlurTimer);
    _scrollBlurTimer=setTimeout(()=>{ if(document.activeElement===a) a.blur(); }, 150);
  }
}, {passive:true, capture:true});

function render(){
  const fn = VIEWS[view] || renderDash;
  // transition légère : on relance l'animation de fondu/glissement du conteneur
  const main=document.getElementById('main');
  if(main){ main.classList.remove('view-in'); void main.offsetWidth; main.classList.add('view-in'); }
  try {
    const r = fn();
    // les vues sont asynchrones : on capture aussi un rejet de promesse (sinon écran blanc silencieux)
    if (r && typeof r.catch === 'function') r.catch(err => renderViewError(view, err));
  } catch (err) {
    renderViewError(view, err);
  }
}
// Affiche une erreur de rendu dans le conteneur principal au lieu de laisser un écran vide.
function renderViewError(v, err){
  console.error('Erreur de rendu vue', v, err);
  const main=document.getElementById('main'); if(!main) return;
  main.innerHTML = `<div class="topbar"><div><h1>Affichage indisponible</h1><p>Vue « ${esc(v)} »</p></div></div>
    <div class="panel"><div class="empty">Une erreur est survenue à l'affichage de cette vue.<br>
      <span style="color:#9a8a82;font-size:.8rem">${esc((err&&err.message)||String(err)||'erreur inconnue')}</span><br><br>
      <button class="btn ghost sm" onclick="render()">Réessayer</button></div></div>`;
}

/* ============================================================
   NAVIGATION HISTORIQUE — bouton « Retour » iOS / Safari
   Branche la navigation interne sur history.pushState/popstate
   pour que le geste « retour » revienne à la vue précédente
   (et ferme d'abord une fenêtre ou le menu ouverts).
   ============================================================ */
function initHistoryNav(){
  // état racine = tableau de bord
  try{ history.replaceState({view:view, kind:'view'}, '', '#'+view); }catch(e){}
  _histReady=true;
  window.addEventListener('popstate', (e)=>{
    _popping=true;
    try{
      // 1) une fenêtre modale ouverte ? le retour la ferme.
      if(overlay && overlay.classList.contains('show')){ closeModal({fromPop:true}); return; }
      // 2) le menu (feuille iPhone) ouvert ? le retour le ferme.
      const sh=document.getElementById('sheetOverlay');
      if(sh && sh.classList.contains('show')){ closeSheet(); return; }
      // 3) sinon, restaurer la vue indiquée par l'état (ou le dashboard).
      const st=e.state;
      const v=(st && st.view) ? st.view : 'dash';
      if(VIEWS[v]){ view=v; setActiveView(view); render(); }
    } finally { _popping=false; }
  });
}

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
  const [orders, clients, materials, productions, events, markets, recipes] = await Promise.all([
    db.orders.toArray(), db.clients.toArray(), db.materials.toArray(),
    db.productions.toArray(), db.events.toArray(),
    (db.markets?db.markets.toArray():Promise.resolve([])).catch(()=>[]),
    db.recipes.toArray()
  ]);
  const recName = rid => (recipes.find(r=>r.id===rid)||{}).produitNom||'Produit';
  // CA des marchés clôturés (somme espèces+CB+autre), rattaché à leur date de clôture.
  const closedMk = (markets||[]).filter(k=>k.statut==='clos').map(k=>{
    const ca=k.ca||{}; return {date:(k.dateCloture||k.date||''), montant:money2((+ca.especes||0)+(+ca.cb||0)+(+ca.autre||0))};
  }).filter(k=>k.montant>0);
  const mkInMonth = d => { const dt=new Date(d); return dt.getMonth()===m && dt.getFullYear()===y; };

  const caCmdMonth = orders.filter(c=>{const d=new Date(c.date);return d.getMonth()===m&&d.getFullYear()===y;}).reduce((s,c)=>s+(+c.montant||0),0);
  const caMkMonth = closedMk.filter(k=>mkInMonth(k.date)).reduce((s,k)=>s+k.montant,0);
  const caMonth = money2(caCmdMonth + caMkMonth);
  const nbMonth = orders.filter(c=>{const d=new Date(c.date);return d.getMonth()===m&&d.getFullYear()===y;}).length;
  const caTotal = money2(orders.reduce((s,c)=>s+(+c.montant||0),0) + closedMk.reduce((s,k)=>s+k.montant,0));

  // alertes stock & DLC
  let low=[], dlcAlert=[];
  for(const mat of materials){
    const {total,dlcMin}=await stockParMatiere(mat.id);
    if(total<=(+mat.seuil||0)) low.push({nom:mat.nom,total,unite:mat.unite,seuil:mat.seuil});
    if(dlcMin){ const d=daysTo(dlcMin); if(d!==null && d<=7) dlcAlert.push({nom:mat.nom,dlc:dlcMin,j:d}); }
  }
  const finis = productions.reduce((s,p)=>s+(+p.qteRestante||0),0);

  // Alertes DLC produits finis (suivi en sourdine) : seuil adapté à l'emplacement.
  // Frigo : alerte à ≤2 jours. Congélateur : alerte à ≤14 jours. Expiré = priorité.
  const prodDlcAlert=[];
  productions.forEach(p=>{
    if(round3(+p.qteRestante)<=0 || !p.dlcProduit) return;
    const j=daysTo(p.dlcProduit); if(j===null) return;
    const seuil = p.emplacement==='congelateur' ? 14 : 2;
    if(j<=seuil){
      prodDlcAlert.push({nom:recName(p.recipeId), lot:p.lotProduction||('#'+p.id),
        dlc:p.dlcProduit, j, emplacement:p.emplacement||'', qte:round3(+p.qteRestante)});
    }
  });
  prodDlcAlert.sort((a,b)=>a.j-b.j);

  const upcoming = events.filter(e=>e.date>=today()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4);
  const months=[]; for(let i=5;i>=0;i--){const d=new Date(y,m-i,1);months.push({k:d.toISOString().slice(0,7),l:d.toLocaleDateString('fr-FR',{month:'short'})});}
  const data=months.map(mo=>({...mo,v: money2(
    orders.filter(c=>c.date&&c.date.slice(0,7)===mo.k).reduce((s,c)=>s+(+c.montant||0),0)
    + closedMk.filter(k=>k.date&&k.date.slice(0,7)===mo.k).reduce((s,k)=>s+k.montant,0)
  )}));
  const max=Math.max(...data.map(d=>d.v),1);

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Tableau de bord</h1><p>Vue d'ensemble — ${now.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</p></div>
     <button class="btn ghost sm" onclick="togglePrivacyMode()">${privacyModeEnabled()?'👁️ Afficher les chiffres':'🙈 Mode discret'}</button></div>
   ${privacyModeEnabled()?`<div class="banner">🙈 <div>Mode discret actif : montants et volumes sensibles masqués dans toute l'application. Touchez « Afficher les chiffres » pour les réafficher.</div></div>`:''}
   ${dlcAlert.length?`<div class="banner">⏰ <div><b>DLC matières proche</b> : ${dlcAlert.map(a=>`${esc(a.nom)} (${a.j<=0?'expiré':a.j+' j'})`).join(' · ')}</div></div>`:''}
   ${prodDlcAlert.length?`<div class="banner" style="background:#fdf3f2">🧁 <div><b>DLC produits finis</b> : ${prodDlcAlert.slice(0,6).map(a=>`${esc(a.nom)} ${a.emplacement==='congelateur'?'❄️':'🧊'} (${a.j<=0?'<b style="color:#b3261e">expiré</b>':a.j+' j'}, lot ${esc(a.lot)})`).join(' · ')}${prodDlcAlert.length>6?` … +${prodDlcAlert.length-6}`:''}</div></div>`:''}
   <div class="cards">
     <div class="card clickable" onclick="goView('compta')" title="Voir la comptabilité"><div class="corner">€</div><div class="lbl">CA ce mois</div><div class="val">${euro(caMonth)}</div><div class="sub">${nbMonth} commande(s) ›</div></div>
     <div class="card clickable" onclick="goView('compta')" title="Voir la comptabilité"><div class="corner">∑</div><div class="lbl">CA total</div><div class="val">${euro(caTotal)}</div><div class="sub">depuis le début ›</div></div>
     <div class="card clickable" onclick="goView('productions')" title="Voir les productions"><div class="corner">⚙</div><div class="lbl">Macarons en stock</div><div class="val">${qtyP(finis)}</div><div class="sub">${productions.length} batch(s) ›</div></div>
     <div class="card clickable" onclick="goView('matieres')" title="Voir les matières à réapprovisionner"><div class="corner">⬛</div><div class="lbl">Alertes stock</div><div class="val">${low.length}</div><div class="sub">matière(s) sous seuil ›</div></div>
   </div>
   <div class="panel"${privacyModeEnabled()?' style="filter:blur(6px);opacity:.45;pointer-events:none;user-select:none"':''}><h2>Chiffre d'affaires — 6 derniers mois</h2>
     <div class="bar-wrap">${data.map(d=>`<div class="bar-col"><div class="bar-val">${(!privacyModeEnabled()&&d.v>0)?Math.round(d.v):''}</div><div class="bar" style="height:${d.v/max*140}px"></div><div class="bar-lbl">${d.l}</div></div>`).join('')}</div>
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
    <td><div class="qa-row">
      <button class="qa pay" onclick="lotForm(0,${mat.id})" title="Ajouter un lot">＋ Lot</button>
      <button class="qa edit" onclick="matForm(${mat.id})" title="Modifier la matière">✎ Modifier</button>
      <button class="qa del" onclick="delMat(${mat.id})" title="Supprimer">🗑</button>
    </div></td></tr>`;
}
function _lotRow(row){
  const l=row.l;
  return `<tr>
    <td>${fmtDate(l.dateReception)}</td><td>${esc(row.matName)}</td>
    <td>${esc(l.lotFournisseur||'—')}</td><td>${esc(row.supName)}</td>
    <td>${qty(l.qteRestante)} / ${qty(l.qteInitiale)}</td><td>${fmtDate(l.dlc)}</td>
    <td><div class="qa-row"><button class="qa del" onclick="delLot(${l.id})" title="Supprimer le lot">🗑 Suppr.</button></div></td></tr>`;
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
  const qte=round3(+val('f_qte'));
  if(!qte||qte<=0){toast('Quantité invalide');return;}
  const prix=money2(+val('f_prix')||0);
  const o={
    materialId:+val('f_mat'), supplierId:+val('f_sup')||0,
    lotFournisseur:val('f_lotf'), qteInitiale:qte, qteRestante:qte,
    prix, prixUnitaire: qte>0 ? money2(prix/qte) : 0,
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
  _recipeMultCache = {}; // {recipeId: {rendement, items:[{nom,unite,qteParBatch}]}}
  const blocks=[];
  for(const r of recipes){
    const items = await db.recipeItems.where('recipeId').equals(r.id).toArray();
    _recipeMultCache[r.id] = { rendement:+r.rendement||1,
      items: items.map(it=>({nom:matName(it.materialId), unite:matUnit(it.materialId), qteParBatch:+it.qteParBatch||0})) };
    const rows = items.map((it,idx)=>`<tr>
        <td>${esc(matName(it.materialId))}</td>
        <td>${qty(it.qteParBatch)} ${esc(matUnit(it.materialId))}</td>
        <td id="mult_${r.id}_${idx}"><b>${qty(it.qteParBatch)}</b> ${esc(matUnit(it.materialId))}</td>
      </tr>`).join('');
    blocks.push(`<div class="panel"><h2>${esc(r.produitNom)} <span style="font-weight:400;font-size:.85rem;color:#9a8a82">— rendement ${r.rendement} / batch</span>
      <span><span class="act" onclick="recForm(${r.id})">Modifier</span><span class="act del" onclick="delRec(${r.id})">Suppr.</span></span></h2>
      ${items.length?`
      <div class="mult-bar">
        <label>Quantité voulue</label>
        <input type="number" min="1" step="1" id="multQ_${r.id}" value="${r.rendement}" oninput="recipeMultiply(${r.id},this.value)">
        <span class="note" style="margin:0">pièce(s)</span>
        <span style="flex:1"></span>
        ${[0.5,1,2,3].map(m=>`<button type="button" class="btn ghost sm" onclick="recipeMultiplyFactor(${r.id},${m})">×${m}</button>`).join('')}
      </div>
      <div class="table-wrap"><table><thead><tr><th>Matière</th><th>Par batch (${r.rendement})</th><th id="multHead_${r.id}">Pour ${r.rendement} pièce(s)</th></tr></thead><tbody>
        ${rows}
      </tbody></table></div>
      <p class="note">Recalcul à la volée selon la quantité voulue — la recette de base n'est jamais modifiée.</p>`
      :`<div class="empty">Aucun ingrédient défini.</div>`}</div>`);
  }
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Recettes (BOM)</h1><p>${recipes.length} recette(s) — nomenclature matières</p></div>
     <button class="btn" onclick="recForm()">+ Nouvelle recette</button></div>
   ${recipes.length?blocks.join(''):`<div class="panel"><div class="empty">Aucune recette. Une recette définit les matières consommées par batch (le « Bill of Materials »).</div></div>`}`;
}
// Cache des recettes pour le multiplicateur dynamique (lecture seule, aucune écriture en base)
let _recipeMultCache={};
// Recalcule les poids d'ingrédients pour une quantité cible (en pièces).
function recipeMultiply(recipeId, targetQ){
  const rec=_recipeMultCache[recipeId]; if(!rec) return;
  const target=Math.max(0,+targetQ||0);
  const factor = rec.rendement>0 ? target/rec.rendement : 0;
  rec.items.forEach((it,idx)=>{
    const cell=document.getElementById(`mult_${recipeId}_${idx}`);
    if(cell){ cell.innerHTML=`<b>${qty(round3(it.qteParBatch*factor))}</b> ${esc(it.unite)}`; }
  });
  const head=document.getElementById(`multHead_${recipeId}`);
  if(head) head.textContent = `Pour ${qty(target)} pièce(s)`;
}
// Applique un facteur multiplicateur (×0.5, ×2, ×3…) relatif au rendement de base.
function recipeMultiplyFactor(recipeId, factor){
  const rec=_recipeMultCache[recipeId]; if(!rec) return;
  const target=round3(rec.rendement*factor);
  const input=document.getElementById(`multQ_${recipeId}`);
  if(input) input.value=target;
  recipeMultiply(recipeId, target);
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
   ${prods.length?`<div class="table-wrap"><table><thead><tr><th>Produit</th><th>N° lot prod.</th><th>Emplacement</th><th>Théo.</th><th>Réel</th><th>Écart</th><th>Restant</th><th>Actions</th></tr></thead><tbody>
     ${prods.map(p=>{
       const th = (p.qteTheorique!=null)?p.qteTheorique:p.qteProduite;
       const re = (p.qteReelle!=null)?p.qteReelle:p.qteProduite;
       const emp = p.emplacement;
       const empTag = emp==='congelateur' ? '<span class="tag" style="background:#3b6ea5;color:#fff">❄️ Congélateur</span>'
         : emp==='frigo' ? '<span class="tag" style="background:#6aa3a0;color:#fff">🧊 Frigo</span>'
         : '<span class="tag warn">non renseigné</span>';
       const blocked = p.venuDuCongelateur ? ' title="A séjourné au congélateur : ne peut y retourner"' : '';
       return `<tr>
       <td><b>${esc(recName(p.recipeId))}</b><br><span style="color:#9a8a82;font-size:.74rem">${fmtDate(p.date)}</span></td>
       <td>${esc(p.lotProduction||'—')}</td>
       <td>${empTag}${emp?`<br><span class="act" onclick="toggleEmplacement(${p.id})"${blocked}>↔ ${emp==='frigo'?'mettre au congélo':'mettre au frigo'}</span>`:`<br><span class="act" onclick="setEmplacement(${p.id})">renseigner</span>`}</td>
       <td>${qty(th)}</td><td><b>${qty(re)}</b></td><td>${ecartTag(p)}</td>
       <td>${qty(p.qteRestante)}</td>
       <td><div class="qa-row"><button class="qa edit" onclick="prodAdjustForm(${p.id})" title="Ajuster la quantité réelle">✎ Réel</button><button class="qa" onclick="traceProd(${p.id})" title="Traçabilité">🔎 Traça.</button><button class="qa del" onclick="delProd(${p.id})" title="Supprimer">🗑</button></div></td></tr>`;}).join('')}
   </tbody></table></div>`:`<div class="empty">Aucune production. Une production consomme les matières selon la quantité <b>théorique</b> (FIFO par DLC) ; le stock de produits finis suit la quantité <b>réelle</b>.</div>`}
   </div>`;
}
// Change l'emplacement frigo↔congélateur d'un batch (avec journal).
async function toggleEmplacement(id){
  const p=await db.productions.get(id); if(!p) return;
  const cible = p.emplacement==='frigo' ? 'congelateur' : 'frigo';
  const nowIso=new Date().toISOString();
  const hist=(p.histEmplacement||[]).concat([{lieu:cible, ts:nowIso, motif:'déplacement manuel'}]);
  const patch={emplacement:cible, emplacementMaj:nowIso, histEmplacement:hist};
  if(cible==='congelateur') patch.venuDuCongelateur=true; // dès qu'il passe au congélo, le drapeau reste
  // DLC recalculée si elle est en mode auto : +7j frigo / +4 mois congélo, à partir de maintenant
  if(p.dlcAuto!==false){ patch.dlcProduit=computeDlcFromHistory(hist, nowIso); patch.dlcAuto=true; }
  await db.productions.update(id, patch);
  renderProductions(); toast(`Déplacé vers ${cible==='frigo'?'le frigo 🧊':'le congélateur ❄️'} · DLC ${fmtDate(patch.dlcProduit||p.dlcProduit)}`);
}
// Renseigne l'emplacement d'un batch ancien (sans emplacement) — choix obligatoire.
async function setEmplacement(id){
  openModal(`<h3>Renseigner l'emplacement</h3>
    <div class="field"><div class="pay-toggle">
      <label class="pay-opt"><input type="radio" name="se_dest" value="frigo"> <span>🧊 Frigo</span></label>
      <label class="pay-opt"><input type="radio" name="se_dest" value="congelateur"> <span>❄️ Congélateur</span></label>
    </div></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveEmplacement(${id})">Enregistrer</button></div>`);
}
async function saveEmplacement(id){
  const dest=(document.querySelector('input[name="se_dest"]:checked')||{}).value||'';
  if(dest!=='frigo'&&dest!=='congelateur'){ toast('Choisissez frigo ou congélateur'); return; }
  const p=await db.productions.get(id); if(!p) return;
  const nowIso=new Date().toISOString();
  const hist=(p.histEmplacement||[]).concat([{lieu:dest, ts:nowIso, motif:'saisie a posteriori'}]);
  const patch={emplacement:dest, emplacementMaj:nowIso, histEmplacement:hist};
  if(dest==='congelateur') patch.venuDuCongelateur=true;
  if(p.dlcAuto!==false){ patch.dlcProduit=computeDlcFromHistory(hist, nowIso); patch.dlcAuto=true; }
  await db.productions.update(id, patch);
  closeModal(); renderProductions(); toast('Emplacement renseigné ✓');
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
   <div class="field"><label>N° lot de production</label><input id="f_lot" value="L-${today().replace(/-/g,'')}-${Math.random().toString(36).slice(2,5).toUpperCase()}"></div>
   <div class="field"><label>Destination après production *</label>
     <div class="pay-toggle" id="prodDest">
       <label class="pay-opt"><input type="radio" name="f_dest" value="frigo" onchange="prodDlcHint()"> <span>🧊 Frigo</span></label>
       <label class="pay-opt"><input type="radio" name="f_dest" value="congelateur" onchange="prodDlcHint()"> <span>❄️ Congélateur</span></label>
     </div>
     <p class="note" id="dlcHint">La DLC est calculée automatiquement : <b>+7 jours</b> au frigo, <b>+4 mois</b> au congélateur. L'horodatage (date + heure) est enregistré automatiquement.</p>
   </div>
   <p class="note">Les <b>matières premières</b> sont déduites sur la base de la <b>quantité théorique</b> (DLC la plus proche d'abord). Le <b>stock de produits finis</b> est calé sur la <b>quantité réelle</b>. L'écart est historisé. Si le stock matières est insuffisant, <b>rien</b> n'est enregistré.</p>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn gold" onclick="saveProd()">Lancer la production</button></div>`);
  prodSyncReelDefault();
}
// Aperçu live de la DLC calculée selon la destination choisie.
function prodDlcHint(){
  const dest=(document.querySelector('input[name="f_dest"]:checked')||{}).value||'';
  const el=document.getElementById('dlcHint'); if(!el) return;
  if(dest==='frigo'||dest==='congelateur'){
    const dlc=computeDlc(dest, new Date().toISOString());
    el.innerHTML=`DLC calculée automatiquement : <b>${fmtDate(dlc)}</b> (${dest==='frigo'?'+7 jours, frigo':'+4 mois, congélateur'}). Horodatage à l'enregistrement.`;
  } else {
    el.innerHTML=`La DLC est calculée automatiquement : <b>+7 jours</b> au frigo, <b>+4 mois</b> au congélateur. L'horodatage (date + heure) est enregistré automatiquement.`;
  }
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
  const date=val('f_date')||today(), lot=val('f_lot');
  const dest=(document.querySelector('input[name="f_dest"]:checked')||{}).value||'';
  if(!qteTheorique||qteTheorique<=0){toast('Quantité théorique invalide');return;}
  if(qteReelle<0||isNaN(qteReelle)){toast('Quantité réelle invalide');return;}
  if(dest!=='frigo' && dest!=='congelateur'){ toast('Choisissez une destination : frigo ou congélateur'); return; }
  try{
    await enregistrerProduction(recipeId, qteTheorique, qteReelle, date, lot, '', dest);
    closeModal(); renderProductions();
    const ecart=qteReelle-qteTheorique;
    toast(ecart===0 ? 'Production enregistrée ✓ — stock mis à jour'
      : `Production enregistrée ✓ — écart ${ecart>0?'+':''}${qty(ecart)} historisé`);
  }catch(err){
    toast(err.message || 'Erreur production');
  }
}
// Transaction atomique : consommation FIFO (théorique) + traçabilité + stock fini (réel)
async function enregistrerProduction(recipeId, qteTheorique, qteReelle, dateProd, lotProduction, dlcProduit, emplacement){
  return db.transaction('rw',
    db.recipes, db.recipeItems, db.materials, db.materialLots, db.productions, db.prodConsumption,
    async () => {
      const recette = await db.recipes.get(recipeId);
      if(!recette) throw new Error('Recette introuvable');
      if(emplacement!=='frigo' && emplacement!=='congelateur') throw new Error('Destination (frigo/congélateur) obligatoire');
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
      const nowIso = new Date().toISOString();
      // DLC calculée automatiquement selon l'emplacement (frigo +7j / congélo +4 mois),
      // à partir de l'horodatage réel de production. Plus de saisie manuelle.
      const dlcAuto = computeDlc(emplacement, nowIso);
      const prodId = await db.productions.add({
        recipeId, lotProduction, date:dateProd,
        qteTheorique, qteReelle, ecart,
        // STOCK PRODUITS FINIS : calé sur la quantité réelle
        // qteProduite/qteRestante conservés pour compat. (lecture par trace, liaison commandes, analytics)
        qteProduite: qteReelle, qteRestante: qteReelle,
        dlcProduit: dlcAuto,            // DLC auto (recalculée si l'emplacement change)
        dlcAuto: true,                  // marque une DLC calculée automatiquement
        // Traçabilité conservation : horodatage + emplacement + journal des déplacements
        prodTimestamp: nowIso,          // date + HEURE réelles de production (horodatage auto)
        emplacement,                    // 'frigo' | 'congelateur'
        emplacementMaj: nowIso,         // date/heure du dernier changement d'emplacement
        venuDuCongelateur: emplacement==='congelateur', // a séjourné au congélo (interdit d'y retourner après décongélation)
        histEmplacement: [{lieu:emplacement, ts:nowIso, motif:'production'}]
      });

      for(const item of items){
        let besoin = round3(item.qteParBatch * facteur);
        const lots = await db.materialLots
          .where('materialId').equals(item.materialId)
          .and(l=>+l.qteRestante>0).toArray();
        lots.sort((a,b)=>(a.dlc||'9999').localeCompare(b.dlc||'9999')); // FIFO par DLC
        for(const lot of lots){
          if(besoin<=1e-9) break;
          const pris = round3(Math.min(besoin, +lot.qteRestante));
          await db.materialLots.update(lot.id, {qteRestante: subQty(lot.qteRestante, pris)});
          // T2 : on fige (dénormalise) l'origine pour que la traçabilité survive à toute suppression future
          await db.prodConsumption.add({productionId:prodId, materialLotId:lot.id, qteConsommee:pris,
            snapMaterialId:item.materialId, snapLotFournisseur:lot.lotFournisseur||'',
            snapSupplierId:lot.supplierId||0, snapDlc:lot.dlc||''});
          besoin = subQty(besoin, pris);
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
        if(lot){ await db.materialLots.update(lot.id, { qteRestante: addQty(lot.qteRestante, c.qteConsommee) }); }
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
   <div class="topbar"><div><h1>Traçabilité</h1><p>Remonter la chaîne fournisseur → lot → batch → commande</p></div>
     <div class="flex" style="gap:8px"><button class="btn" onclick="openScanner(lot=>traceLotByNumber(lot))">📷 Scanner un lot</button>
     <button class="btn" style="background:var(--red,#b3261e)" onclick="openFlashAlert()">⚠ Alerte Sanitaire Flash</button></div></div>
   <div class="banner">⊕ <div>La traçabilité répond à trois questions réglementaires : ingrédients d'une commande, origine d'un batch, et usage d'un lot de matière. En cas de problème, l'<b>Alerte Sanitaire Flash</b> isole un lot et liste tous les produits et clients concernés.</div></div>
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

/* ============================================================
   SCAN QR / CODE-BARRES — intégré, sans quitter l'app, hors-ligne.
   Utilise l'API native BarcodeDetector (Safari iOS 17+) ; repli sur saisie manuelle.
   ============================================================ */
let _scanStream=null, _scanRAF=null, _scanDetector=null;
function scannerSupported(){ return 'BarcodeDetector' in window; }
async function openScanner(onResult){
  // onResult(texte) appelé quand un code est lu (ou saisi manuellement)
  const supported = scannerSupported();
  openModal(`<h3>Scanner un lot</h3>
    ${supported
      ? `<div class="scan-wrap"><video id="scanVideo" playsinline muted></video><div class="scan-frame"></div></div>
         <p class="note" id="scanMsg">Visez le QR code ou code-barres du lot…</p>`
      : `<p class="note">La lecture caméra n'est pas disponible sur cet appareil/navigateur. Saisissez le numéro de lot manuellement :</p>`}
    <div class="field" style="margin-top:8px"><label>N° de lot (saisie manuelle)</label>
      <input id="scanManual" placeholder="ex : NM-A-101" autocapitalize="characters" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeScanner()">Annuler</button>
      <button class="btn" onclick="(function(){var v=document.getElementById('scanManual').value.trim(); if(v){ closeScanner(); (window._scanCb&&window._scanCb(v)); } else toast('Saisissez un numéro de lot'); })()">Valider</button>
    </div>`);
  window._scanCb = onResult;
  if(!supported) return;
  try{
    _scanDetector = new BarcodeDetector({formats:['qr_code','code_128','ean_13','ean_8','code_39','codabar','upc_a','upc_e']});
  }catch(e){ _scanDetector=null; }
  try{
    _scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    const video=document.getElementById('scanVideo');
    if(!video){ stopScanStream(); return; }
    video.srcObject=_scanStream; await video.play();
    scanLoop(video);
  }catch(err){
    const msg=document.getElementById('scanMsg');
    if(msg) msg.textContent='Caméra inaccessible (autorisation refusée ?). Utilisez la saisie manuelle.';
  }
}
async function scanLoop(video){
  if(!_scanStream || !_scanDetector) return;
  try{
    const codes = await _scanDetector.detect(video);
    if(codes && codes.length){
      const val=(codes[0].rawValue||'').trim();
      if(val){
        // un QR d'étiquette peut contenir une URL #trace=LOT ; on extrait alors le lot
        let lot=val; const m=val.match(/#trace=(.+)$/); if(m) lot=decodeURIComponent(m[1]);
        const cb=window._scanCb; closeScanner(); if(cb) cb(lot); return;
      }
    }
  }catch(e){ /* frame non décodée, on continue */ }
  _scanRAF = requestAnimationFrame(()=>scanLoop(video));
}
function stopScanStream(){
  if(_scanRAF){ cancelAnimationFrame(_scanRAF); _scanRAF=null; }
  if(_scanStream){ _scanStream.getTracks().forEach(t=>t.stop()); _scanStream=null; }
  _scanDetector=null;
}
function closeScanner(){ stopScanStream(); window._scanCb=null; closeModal(); }
// Lance le scan puis ouvre l'alerte flash sur le lot lu.
function scanForFlashAlert(){ openScanner(lot=>flashAlert(lot)); }
// Résout un numéro scanné : lot matière → traceLot, sinon lot de production → traceProd.
async function traceLotByNumber(code){
  code=(code||'').trim(); if(!code){ return; }
  const target=normTxt(code);
  const lots=await db.materialLots.toArray();
  const ml=lots.find(l=>normTxt(l.lotFournisseur||'')===target) || lots.find(l=>normTxt(l.lotFournisseur||'').includes(target));
  if(ml){ traceLot(ml.id); return; }
  const prods=await db.productions.toArray();
  const p=prods.find(x=>normTxt(x.lotProduction||'')===target) || prods.find(x=>normTxt(x.lotProduction||'').includes(target));
  if(p){ traceProd(p.id); return; }
  toast('Lot « '+code+' » introuvable. Essayez l\'Alerte Flash.');
}

/* ============================================================
   ALERTE SANITAIRE FLASH — isole un lot fournisseur et liste
   instantanément toutes les productions et ventes impactées.
   ============================================================ */
// Sélection du lot à isoler (liste + scan), avant l'alerte.
async function openFlashAlert(){
  const lots = await db.materialLots.toArray();
  const mats = await db.materials.toArray();
  const matName = id => (mats.find(m=>m.id===id)||{}).nom||'—';
  // regrouper par numéro de lot fournisseur (un même n° peut couvrir plusieurs réceptions)
  const byLotNum={};
  lots.forEach(l=>{ const k=(l.lotFournisseur||'(sans numéro)'); (byLotNum[k] ||= []).push(l); });
  const nums=Object.keys(byLotNum).sort();
  openModal(`<h3>⚠ Alerte sanitaire flash</h3>
    <p class="note">Sélectionnez ou scannez le lot fournisseur à isoler. L'app listera instantanément toutes les productions et ventes impactées.</p>
    <button class="btn gold" style="width:100%;margin-bottom:10px" onclick="scanForFlashAlert()">📷 Scanner le lot</button>
    <div class="field"><label>Ou choisir un n° de lot fournisseur</label>
      <select id="flashLotNum">${nums.map(n=>`<option value="${esc(n)}">${esc(n)} — ${esc([...new Set(byLotNum[n].map(l=>matName(l.materialId)))].join(', '))}</option>`).join('')}</select></div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Fermer</button>
      <button class="btn" onclick="(function(){var v=document.getElementById('flashLotNum').value; closeModal(); flashAlert(v);})()">Déclencher l'alerte</button>
    </div>`);
}
// Cœur de l'alerte : agrège tout l'impact d'un numéro de lot fournisseur.
async function flashAlert(lotNum){
  lotNum=(lotNum||'').trim();
  if(!lotNum){ toast('Aucun lot indiqué'); return; }
  const [lots, conso, prods, oitems, orders, clients, recipes, mats, sups] = await Promise.all([
    db.materialLots.toArray(), db.prodConsumption.toArray(), db.productions.toArray(),
    db.orderItems.toArray(), db.orders.toArray(), db.clients.toArray(),
    db.recipes.toArray(), db.materials.toArray(), db.suppliers.toArray()
  ]);
  const matName=id=>(mats.find(m=>m.id===id)||{}).nom||'—';
  const matUnit=id=>(mats.find(m=>m.id===id)||{}).unite||'';
  const recName=id=>(recipes.find(r=>r.id===id)||{}).produitNom||'—';
  const clName=id=>(clients.find(c=>c.id===id)||{}).nom||'—';
  const supName=id=>(sups.find(s=>s.id===id)||{}).nom||'—';

  // 1) tous les lots de matière portant ce n° fournisseur (recherche tolérante)
  const target=normTxt(lotNum);
  const matchedLots = lots.filter(l=> normTxt(l.lotFournisseur||'')===target || normTxt(l.lotFournisseur||'').includes(target));
  // repli : on a pu scanner un n° de lot de PRODUCTION (étiquette produit fini)
  const matchedProdsByLabel = prods.filter(p=> normTxt(p.lotProduction||'')===target);

  const lotIds=new Set(matchedLots.map(l=>l.id));
  // 2) consommations issues de ces lots → productions impactées
  const impactedProdIds=new Set(matchedProdsByLabel.map(p=>p.id));
  const consoByProd={};
  conso.forEach(c=>{ if(lotIds.has(c.materialLotId)){ impactedProdIds.add(c.productionId);
    (consoByProd[c.productionId] ||= []).push(c); } });

  // 3) ventes (liaisons batch→commande) issues des productions impactées
  const impactedProds=[...impactedProdIds].map(id=>prods.find(p=>p.id===id)).filter(Boolean);
  let totalVendu=0, totalStock=0;
  const prodBlocks = impactedProds.map(p=>{
    const links = oitems.filter(it=>it.productionId===p.id);
    const ventes = links.map(it=>{ const o=orders.find(x=>x.id===it.orderId); const cl=o?clName(o.clientId):'—';
      totalVendu+=(+it.qte||0);
      return `<div class="trace-step" style="margin:3px 0">→ <b>${esc(cl)}</b> · ${qty(it.qte)} pièce(s) · ${o?fmtDate(o.date):''} · cmd #${it.orderId}
        ${o&&o.tel?`<br><span class="note">☎ ${esc(o.tel)}${o.email?' · '+esc(o.email):''}</span>`:''}</div>`;
    });
    totalStock += (+p.qteRestante||0);
    const usedMat = (consoByProd[p.id]||[]).map(c=>{ const l=lots.find(x=>x.id===c.materialLotId);
      return `${esc(matName(l?l.materialId:null))} ${qty(c.qteConsommee)} ${esc(matUnit(l?l.materialId:null))}`; }).join(', ');
    return `<div class="panel" style="margin:8px 0;border-left:4px solid var(--red,#b3261e)">
      <b>${esc(recName(p.recipeId))}</b> · batch ${esc(p.lotProduction||'—')} · ${fmtDate(p.date)}
      <div class="note">Produit ${qty(p.qteProduite!=null?p.qteProduite:p.qteReelle)} · encore en stock ${qty(p.qteRestante)}${usedMat?` · matière incriminée : ${usedMat}`:''}</div>
      <div style="margin-top:6px">${ventes.join('')||'<span class="note">Aucune vente liée — tout est encore en stock/non distribué.</span>'}</div>
    </div>`;
  });

  const supList=[...new Set(matchedLots.map(l=>l.supplierId).filter(Boolean))].map(supName).join(', ');
  const found = matchedLots.length || matchedProdsByLabel.length;
  const summary = found
    ? `<div class="sum-box"><span>Lots matière concernés</span><b>${matchedLots.length}</b></div>
       <div class="sum-box"><span>Productions impactées</span><b>${impactedProds.length}</b></div>
       <div class="sum-box"><span>Pièces déjà vendues</span><b style="color:var(--red,#b3261e)">${qty(totalVendu)}</b></div>
       <div class="sum-box"><span>Pièces encore en stock</span><b>${qty(totalStock)}</b></div>
       ${supList?`<div class="sum-box"><span>Fournisseur(s)</span><b>${esc(supList)}</b></div>`:''}`
    : '';

  openModal(`<h3>⚠ Alerte sanitaire — lot « ${esc(lotNum)} »</h3>
    ${found ? summary : `<p class="note">Aucun lot fournisseur ni batch ne correspond à « ${esc(lotNum)} » sur cet appareil.</p>`}
    ${impactedProds.length?`<h3 style="font-size:1rem;margin:14px 0 6px">Productions & ventes impactées</h3>${prodBlocks.join('')}`
      : (found?'<p class="note" style="margin-top:8px">Ce lot n\'a alimenté aucune production : aucun produit fini n\'est concerné.</p>':'')}
    <div class="modal-actions">
      ${found?`<button class="btn gold" onclick="exportFlashAlert('${esc(lotNum).replace(/'/g,"\\'")}')">⬇ Exporter le rapport (TXT)</button>`:''}
      <button class="btn ghost" onclick="closeModal()">Fermer</button>
    </div>`);
}
// Export texte du rapport d'alerte (réutilise l'agrégation), pour communication/retrait.
async function exportFlashAlert(lotNum){
  const [lots, conso, prods, oitems, orders, clients, recipes, mats] = await Promise.all([
    db.materialLots.toArray(), db.prodConsumption.toArray(), db.productions.toArray(),
    db.orderItems.toArray(), db.orders.toArray(), db.clients.toArray(), db.recipes.toArray(), db.materials.toArray()
  ]);
  const matName=id=>(mats.find(m=>m.id===id)||{}).nom||'—';
  const recName=id=>(recipes.find(r=>r.id===id)||{}).produitNom||'—';
  const clName=id=>(clients.find(c=>c.id===id)||{}).nom||'—';
  const target=normTxt(lotNum);
  const matchedLots=lots.filter(l=>normTxt(l.lotFournisseur||'').includes(target));
  const lotIds=new Set(matchedLots.map(l=>l.id));
  const impacted=new Set(prods.filter(p=>normTxt(p.lotProduction||'')===target).map(p=>p.id));
  conso.forEach(c=>{ if(lotIds.has(c.materialLotId)) impacted.add(c.productionId); });
  const L=[`ALERTE SANITAIRE — lot fournisseur « ${lotNum} »`, `Édité le ${fmtDate(today())}`, ''];
  [...impacted].map(id=>prods.find(p=>p.id===id)).filter(Boolean).forEach(p=>{
    L.push(`■ ${recName(p.recipeId)} — batch ${p.lotProduction||'—'} (${fmtDate(p.date)})`);
    L.push(`   Produit : ${p.qteProduite!=null?p.qteProduite:p.qteReelle} · encore en stock : ${p.qteRestante}`);
    oitems.filter(it=>it.productionId===p.id).forEach(it=>{ const o=orders.find(x=>x.id===it.orderId);
      L.push(`   → ${clName(o?o.clientId:0)} : ${it.qte} pièce(s)${o&&o.tel?' · '+o.tel:''}${o&&o.date?' · '+fmtDate(o.date):''}`); });
    L.push('');
  });
  if(impacted.size===0) L.push('Aucune production impactée.');
  const blob=new Blob([L.join('\n')],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='alerte-sanitaire-'+lotNum.replace(/[^a-zA-Z0-9_-]/g,'_')+'-'+today()+'.txt'; a.click();
  toast('Rapport exporté ✓');
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
// Aperçu rapide d'un client (lecture seule) — moins intrusif que la fiche complète.
async function clientPopup(id){
  const c = await db.clients.get(id);
  if(!c){ toast('Client introuvable'); return; }
  // petit récap commandes / CA si dispo
  let stat='';
  try{
    const orders=(await db.orders.toArray()).filter(o=>o.clientId===id);
    if(orders.length){
      const ca=orders.reduce((s,o)=>s+(+o.montant||0),0);
      stat=`<div class="sum-box"><span>Commandes</span><b>${orders.length}</b></div>
            <div class="sum-box"><span>CA cumulé</span><b>${euro(ca)}</b></div>`;
    }
  }catch(e){}
  const nomComplet=[c.prenom,c.nom].filter(Boolean).join(' ')||c.nom||'Client';
  const ligne=(label,val)=> val?`<div class="sum-box"><span>${label}</span><b>${esc(val)}</b></div>`:'';
  openModal(`<h3>${esc(nomComplet)}</h3>
    <div style="margin:-4px 0 10px"><span class="tag ${c.type==='Pro'?'event':'ok'}">${esc(c.type||'Particulier')}</span>${c.ref?` <span class="note">${esc(c.ref)}</span>`:''}</div>
    ${ligne('Société', c.societe)}
    ${c.tel?`<div class="sum-box"><span>Téléphone</span><b><a href="tel:${esc(c.tel)}" style="color:var(--bordeaux)">${esc(c.tel)}</a></b></div>`:''}
    ${c.email?`<div class="sum-box"><span>Email</span><b><a href="mailto:${esc(c.email)}" style="color:var(--bordeaux);word-break:break-all">${esc(c.email)}</a></b></div>`:''}
    ${ligne('Adresse', c.adresse)}
    ${c.notes?`<div class="sum-box" style="flex-direction:column;align-items:flex-start"><span>Notes</span><b style="font-weight:500;white-space:pre-wrap">${esc(c.notes)}</b></div>`:''}
    ${stat}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button><button class="btn" onclick="clientForm(${id})">Ouvrir la fiche complète</button></div>`);
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
// ---- TRAÇABILITÉ DES PAIEMENTS (registre + solde) ----
// Chaque commande porte un registre paiements:[{date, montant, moyen}].
// Le solde dû et le statut dérivent de ce registre + du montant total.
function orderPaid(o){
  if((!o.paiements || !o.paiements.length) && o.paiement==='Payé'){ return money2(o.montant); } // rétro-compat
  return money2((o.paiements||[]).reduce((s,p)=>s+((+p.montant)||0),0));
}
function orderBalance(o){ return money2(((+o.montant)||0) - orderPaid(o)); }
// Statut dérivé : Payé (solde ≤ 0), Partiel (encaissé > 0), sinon En attente.
function orderPayStatus(o){
  const total=(+o.montant)||0, paid=orderPaid(o);
  if(total>0 && paid+1e-9>=total) return 'Payé';
  if(paid>0) return 'Partiel';
  return 'En attente';
}
// Synchronise les champs hérités (paiement/datePaiement/reglement) à partir du registre,
// pour rester cohérent avec tous les lecteurs existants (liste, export, stats, prévisionnel).
function syncPaymentFields(o){
  o.paiements = (o.paiements||[]).filter(p=>p && (+p.montant)||p.moyen||p.date);
  const st=orderPayStatus(o);
  o.paiement = (st==='Payé') ? 'Payé' : 'En attente'; // lecteurs binaires : Partiel compte comme non soldé
  o.statutPaiement = st;                               // statut fin (3 états) pour l'affichage
  o.soldeDu = orderBalance(o);
  o.montantEncaisse = orderPaid(o);
  if(o.paiements.length){
    const last=o.paiements[o.paiements.length-1];
    // datePaiement = date du dernier règlement (ou la plus tardive si soldé). Jamais auto-générée.
    o.datePaiement = (st==='Payé') ? (o.paiements.reduce((d,p)=>p.date&&p.date>d?p.date:d,'')) : (last.date||'');
    o.reglement = last.moyen || o.reglement || '';
  }
  return o;
}

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

// Action « Solder » : ouvre un encaissement du solde, SANS date auto — l'utilisateur saisit date + mode.
async function markPaid(id, fromModal){
  const o=await db.orders.get(id); if(!o) return;
  if(orderPayStatus(o)==='Payé'){ toast('Déjà soldée'); return; }
  const reste=orderBalance(o);
  if(reste<=0){ toast('Rien à encaisser'); return; }
  openModal(`<h3>Encaisser le solde</h3>
    <p class="note">Solde restant dû : <b>${euro(reste)}</b>. Renseignez la date réelle du règlement (libre) et le mode.</p>
    <div class="field"><label>Montant encaissé (€)</label><input type="number" step="0.01" min="0" id="solde_mt" value="${reste}"></div>
    <div class="field"><label>Date de règlement</label><input type="date" id="solde_date" value=""></div>
    <div class="field"><label>Mode de paiement</label>
      <select id="solde_moyen"><option value="">— mode —</option>${PAY_METHODS.map(m=>`<option>${m}</option>`).join('')}</select></div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn gold" onclick="confirmMarkPaid(${id},${fromModal?1:0})">Enregistrer l'encaissement</button>
    </div>`);
}
async function confirmMarkPaid(id, fromModal){
  const mt=money2(+(document.getElementById('solde_mt')?.value)||0);
  const date=document.getElementById('solde_date')?.value||'';
  const moyen=document.getElementById('solde_moyen')?.value||'';
  if(mt<=0){ toast('Montant requis'); return; }
  if(!date){ toast('Date de règlement obligatoire'); return; }
  if(!moyen){ toast('Mode de paiement obligatoire'); return; }
  const o=await db.orders.get(id); if(!o) return;
  o.paiements=(o.paiements||[]).concat([{date, montant:mt, moyen}]);
  syncPaymentFields(o);
  await db.orders.update(id, {paiements:o.paiements, paiement:o.paiement, statutPaiement:o.statutPaiement,
    soldeDu:o.soldeDu, montantEncaisse:o.montantEncaisse, datePaiement:o.datePaiement, reglement:o.reglement});
  closeModal();
  renderCmd();
  toast('Encaissement enregistré ✓ ('+euro(mt)+' le '+fmtDate(date)+')');
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
    if(ln.type==='prestation') return `Prestation${ln.libelle?' : '+ln.libelle:''}`;
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
     <div class="table-wrap"><table><thead><tr><th>Client</th><th>Produits</th><th>Montant</th><th>Paiement</th><th>Statut</th><th>Traça.</th><th>Actions</th><th style="width:34px" title="Sélection"><input type="checkbox" id="cmdSelHead" onclick="cmdToggleAll(this.checked)" title="Tout sélectionner"></th></tr></thead>
       <tbody id="cmdBody"></tbody></table></div>
     <div id="cmdEmpty" class="empty" style="display:none">Aucune commande.</div>
   </div>`;
  cmdFilter(cmdSearch);
  cmdUpdateSelBar();
}
function _cmdRow(row){
  const o=row.o; const paye=o.paiement==='Payé';
  const checked = _cmdSel.has(o.id) ? 'checked' : '';
  const st = orderPayStatus(o); const solde = orderBalance(o);
  const stCol = st==='Payé'?'done':(st==='Partiel'?'todo':'todo');
  return `<tr>
     <td><b>${o.clientId?`<span class="link-name" onclick="clientPopup(${o.clientId})">${esc(_cmdClName(o.clientId))}</span>`:'—'}</b><br><span style="color:#9a8a82;font-size:.74rem">${fmtDate(o.date)}</span></td>
     <td><span style="font-size:.82rem">${esc(row.resume)}</span>${o.perso?' <span class="tag event">perso</span>':''}</td>
     <td>${euro(+o.montant)}</td>
     <td>
       <span class="tag ${st==='Payé'?'done':(st==='Partiel'?'event':'todo')}">${st}</span>
       ${st!=='Payé'&&solde>0?`<br><span style="color:var(--red,#b3261e);font-size:.72rem">solde ${euro(solde)}</span>`:''}
       ${st==='Payé'&&o.datePaiement?`<br><span style="color:#9a8a82;font-size:.72rem">le ${fmtDate(o.datePaiement)}</span>`:''}
     </td>
     <td><span class="act-status" onclick="cycleStatus(${o.id})" title="Toucher pour changer le statut">${statusTag(o.statut)}</span></td>
     <td>${row.nbLies?`<span class="tag ok">${row.nbLies} batch</span>`:'<span class="tag warn">non lié</span>'}</td>
     <td><div class="qa-row">
       ${st!=='Payé'?`<button class="qa pay" onclick="markPaid(${o.id})" title="Encaisser le solde">✓ Solder</button>`:''}
       <button class="qa status" onclick="cycleStatus(${o.id})" title="Changer le statut">⟳ Statut</button>
       <button class="qa" onclick="cmdView(${o.id})" title="Voir le détail">👁 Détail</button>
       <button class="qa edit" onclick="cmdForm(${o.id})" title="Modifier">✎ Modifier</button>
       <button class="qa" onclick="exportOrderText(${o.id})" title="Exporter en texte">⤓ Texte</button>
       <button class="qa" onclick="cmdLink(${o.id})" title="Lier à une production">🔗 Lier</button>
       <button class="qa del" onclick="delCmd(${o.id})" title="Supprimer">🗑</button>
     </div></td>
     <td><input type="checkbox" class="cmd-check" ${checked} onclick="cmdToggleOne(${o.id},this.checked)"></td></tr>`;
}
// ---- Solder une commande depuis la liste (encaisse le solde, daté du jour) ----
async function listSetPay(id, statut){
  return markPaid(id);
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
  _privacySuspend=1; // détail de commande toujours en clair, même en mode discret
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
    if(ln.type==='prestation'){
      const base=money2(+ln.montantHT||0); const net=lineTotalStored(ln);
      const remTxt = ln.remiseType==='euro' ? (ln.remiseEuro>0?`remise ${euro(ln.remiseEuro)}`:'') : (ln.remisePct>0?`remise ${ln.remisePct}%`:'');
      return `<div class="cmd-line"><div class="line-type">Prestation / Coaching <span class="line-sub">service</span></div>
        <p style="margin-top:4px">${esc(ln.libelle||'Prestation')}</p>
        <div class="sum-box" style="margin-top:8px"><span>${base!==net?`Avant remise ${euro(base)}${remTxt?' · '+remTxt:''}`:'Montant'}</span><b>${euro(net)}</b></div></div>`;
    }
    return '';
  }).join('');
  openModal(`<h3>Détail commande</h3>
    <p style="margin-bottom:10px"><b>${cl?`<span class="link-name" onclick="closeModal();clientForm(${cl.id})">${esc(cl.nom)}</span>`:'—'}</b> · ${fmtDate(o.date)}</p>
    ${blocks||'<p class="note">Aucun produit.</p>'}
    <div class="sum-box"><span>Personnalisation couleurs</span><b>${o.perso?'Oui':'Non'}</b></div>
    ${+o.remiseGlobale>0?`<div class="sum-box"><span>Remise globale</span><b>−${o.remiseGlobale}%</b></div>`:''}
    <div class="sum-box"><span>Montant total${+o.remiseGlobale>0||lignes.some(l=>+l.remisePct>0)?' (TTC, remises incluses)':''}</span><b>${euro(o.montant)}</b></div>
    <h3 style="font-size:1rem;margin:16px 0 8px">Paiements <span style="font-weight:400;font-size:.78rem;color:#9a8a82">— réf. commande n°${esc(orderNumber(o))}</span></h3>
    ${(o.paiements&&o.paiements.length)
      ? o.paiements.map(p=>`<div class="sum-box"><span>${fmtDate(p.date)} · ${esc(p.moyen||'—')}</span><b>${euro(p.montant)}</b></div>`).join('')
      : (o.paiement==='Payé'?`<div class="sum-box"><span>${o.datePaiement?fmtDate(o.datePaiement):'—'} · ${esc(o.reglement||'—')}</span><b>${euro(o.montant)}</b></div>`:'<p class="note">Aucun encaissement enregistré.</p>')}
    ${(function(){const st=orderPayStatus(o),solde=orderBalance(o),enc=orderPaid(o);
       const col=st==='Payé'?'#3f7d52':(st==='Partiel'?'var(--caramel)':'var(--red,#b3261e)');
       return `<div class="sum-box"><span>Encaissé</span><b>${euro(enc)}</b></div>
         <div class="sum-box"><span><b>Solde restant dû</b> <span class="tag" style="background:${col};color:#fff">${st}</span></span><b style="color:${solde>0?'var(--red,#b3261e)':'#3f7d52'}">${euro(solde)}</b></div>`;})()}
    ${orderPayStatus(o)!=='Payé'?`<button class="btn gold sm" style="margin-top:6px" onclick="markPaid(${id},true)">✓ Solder (${euro(orderBalance(o))})</button>`:''}
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
    // priorité au prix scellé dans la commande (immunise les ventes passées)
    const base = (ln.prixUnitaireApplique!=null && +ln.prixUnitaireApplique>=0)
      ? +ln.prixUnitaireApplique
      : ((BOX_PRICES[ln.taille]!=null)?BOX_PRICES[ln.taille]:0);
    const nbDiff=(ln.parfums||[]).filter(p=>p.qte>0).length;
    const limit=BOX_FLAVOR_LIMIT[ln.taille]||0;
    return money2(base + Math.max(0,nbDiff-limit)*FLAVOR_SURCHARGE);
  }
  if(ln.type==='evenement') return money2((ln.evQte||0)*EVENT_PRICE + (ln.equip||0)*EQUIP_PRICE);
  if(ln.type==='grand'){ const pu=BIG_PRICE[ln.tarif]||0; const tot=(ln.items||[]).reduce((s,p)=>s+(+p.qte||0),0); return money2(tot*pu); }
  if(ln.type==='don') return 0;
  if(ln.type==='prestation'){
    const base=money2(+ln.montantHT||0);
    const rem = ln.remiseType==='euro' ? Math.min(base,money2(+ln.remiseEuro||0)) : money2(base*Math.max(0,Math.min(100,+ln.remisePct||0))/100);
    return Math.max(0, money2(base-rem));
  }
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
  if(t==='coffret') return {type:'coffret', taille:ln.taille||6, parfums:_parfumsToObj(ln.parfums), remisePct:+ln.remisePct||0, prixUnitaireApplique: (ln.prixUnitaireApplique!=null?+ln.prixUnitaireApplique:null)};
  if(t==='evenement') return {type:'evenement', evQte:ln.evQte||EVENT_MIN, equip:(ln.equip!=null?ln.equip:EVENT_MIN_EQUIP), parfums:_parfumsToObj(ln.parfums), remisePct:+ln.remisePct||0};
  if(t==='grand') return {type:'grand', tarif:ln.tarif||'particulier', items:_parfumsToObj(ln.items), remisePct:+ln.remisePct||0};
  if(t==='don') return {type:'don', parfums:_parfumsToObj(ln.parfums), items:_parfumsToObj(ln.items)};
  if(t==='prestation') return {type:'prestation', libelle:ln.libelle||'', montantHT:+ln.montantHT||0, remiseType:ln.remiseType||'pct', remisePct:+ln.remisePct||0, remiseEuro:+ln.remiseEuro||0};
  return {...ln};
}
// Charge une commande dans le modèle d'édition (objet) sans rien perdre.
function orderToEditLines(o){ return orderToLines(o).map(_lineToEdit); }

async function cmdForm(id, opts){
  opts = opts || {};
  _privacySuspend=1; // saisie de commande toujours en clair, même en mode discret
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
     <button class="btn ghost sm" onclick="addLine('prestation')">+ Prestation / Coaching</button>
     <button class="btn ghost sm" onclick="addLine('don')">+ Don (0 €)</button>
   </div>

   <label style="font-size:.82rem;color:#7a6a62;display:flex;gap:7px;align-items:center;margin:6px 0"><input type="checkbox" id="f_perso" style="width:auto" ${o.perso?'checked':''}> Personnalisation des couleurs</label>

   <div class="field"><label>Statut commande</label><select id="f_st">${stOpts}</select></div>
   <div class="row2">
     <div class="field"><label>% de remise globale</label><input type="number" min="0" max="100" step="1" id="f_remiseg" value="${o.remiseGlobale||''}" placeholder="0" oninput="cmdRecalc()"></div>
     <div class="field"><label>Prix total (€) <span style="color:#9a8a82;font-weight:400">— auto, modifiable</span></label><input type="number" step="0.01" id="f_mt" value="${o.montant||''}" oninput="this.dataset.auto='0';cmdRecalc()"></div>
   </div>
   <div class="sum-box" id="priceBreak" style="display:none"></div>

   <div class="pay-ledger" style="margin-top:14px">
     <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
       <label style="font-weight:600;color:var(--bordeaux)">Paiements encaissés</label>
       <label style="font-size:.76rem;color:#7a6a62;display:flex;gap:6px;align-items:center"><input type="checkbox" id="f_autopay" style="width:auto" ${autoPayEnabled()?'checked':''} onchange="setAutoPay(this.checked)"> auto-solder si encaissement</label>
     </div>
     <div id="payList"></div>
     <button type="button" class="btn ghost sm" onclick="cmdAddPayment()">＋ Ajouter un paiement</button>
     <div class="sum-box" id="paySummary" style="margin-top:8px"></div>
     <div class="field" style="margin-top:8px"><label>Date prévue du règlement final <span style="color:#9a8a82;font-weight:400">— acomptes / événements</span></label>
       <input type="date" id="f_dateFinal" value="${esc(o.dateReglementFinal||'')}"></div>
   </div>
   <input type="hidden" id="f_pay" value="${esc(o.paiement||'En attente')}">

   <div class="field" style="margin-top:14px"><label>Notes</label><textarea id="f_notes" rows="2" placeholder="Allergies, livraison, demande spéciale…">${esc(o.notes||'')}</textarea></div>

   <label style="font-size:.78rem;color:#7a6a62;display:flex;gap:7px;align-items:center"><input type="checkbox" id="f_cal" style="width:auto" ${id?'':'checked'}> Ajouter au calendrier</label>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveCmd(${id||0})">Enregistrer</button></div>`);
  // initialise le registre de paiements en mémoire (copie de travail)
  // Initialise le registre d'édition. Pour une ancienne commande « Payé » sans registre,
  // on reconstitue une ligne à partir des données réellement enregistrées (date/mode si connus),
  // sans jamais inventer une date.
  cmdPayments = JSON.parse(JSON.stringify(
    (o.paiements && o.paiements.length) ? o.paiements
    : (o.paiement==='Payé' ? [{date:o.datePaiement||'', montant:+o.montant||0, moyen:o.reglement||''}] : [])
  ));
  const mt=document.getElementById('f_mt'); if(mt && !mt.value) mt.dataset.auto='1';
  drawPayments();
  drawLines();
}
// Registre de paiements en cours d'édition (copie de travail, écrit en base au save)
let cmdPayments=[];
function cmdAddPayment(){
  const reste=cmdCurrentBalance();
  // Aucune donnée auto-générée : date et mode vides, à saisir manuellement.
  // Seul le montant est pré-suggéré au solde restant (modifiable, et zéro accepté tant que non validé).
  cmdPayments.push({date:'', montant: reste>0?reste:'', moyen:''});
  drawPayments(); cmdRecalc();
}
function cmdRemovePayment(i){ cmdPayments.splice(i,1); drawPayments(); cmdRecalc(); }
function setPayField(i,field,v){
  if(!cmdPayments[i]) return;
  cmdPayments[i][field] = field==='montant' ? (v===''?'':money2(+v||0)) : v;
  // redessine seulement pour la validation visuelle des champs date/mode ; le montant garde le focus
  if(field==='montant') cmdUpdatePaySummary(); else drawPayments();
}
// Total commande courant (depuis le champ montant)
function cmdCurrentTotal(){ return money2(+(document.getElementById('f_mt')?.value)||0); }
function cmdCurrentPaid(){ return money2(cmdPayments.reduce((s,p)=>s+((+p.montant)||0),0)); }
function cmdCurrentBalance(){ return money2(cmdCurrentTotal()-cmdCurrentPaid()); }
const PAY_METHODS_LIST = PAY_METHODS;
// Une ligne d'encaissement est valide si montant>0 ET date ET mode renseignés.
function payRowValid(p){ return (+p.montant)>0 && !!p.date && !!p.moyen; }
function drawPayments(){
  const box=document.getElementById('payList'); if(!box) return;
  box.innerHTML = cmdPayments.length ? cmdPayments.map((p,i)=>{
    const missing = !payRowValid(p);
    return `
    <div class="pay-row${missing?' pay-row-err':''}">
      <input type="date" value="${esc(p.date||'')}" onchange="setPayField(${i},'date',this.value)" title="Date de règlement (obligatoire)" ${!p.date?'style="border-color:var(--red,#b3261e)"':''}>
      <input type="number" step="0.01" min="0" value="${p.montant===''?'':p.montant}" placeholder="€" oninput="setPayField(${i},'montant',this.value)" title="Montant encaissé (obligatoire)" ${!((+p.montant)>0)?'style="border-color:var(--red,#b3261e)"':''}>
      <select onchange="setPayField(${i},'moyen',this.value)" title="Mode de paiement (obligatoire)" ${!p.moyen?'style="border-color:var(--red,#b3261e)"':''}>
        <option value="" ${!p.moyen?'selected':''}>— mode —</option>
        ${PAY_METHODS_LIST.map(m=>`<option ${p.moyen===m?'selected':''}>${m}</option>`).join('')}</select>
      <button type="button" class="act del" onclick="cmdRemovePayment(${i})" title="Retirer">✕</button>
    </div>`;
  }).join('') : '<p class="note" style="margin:4px 0">Aucun encaissement. Cliquez « Ajouter un paiement » pour enregistrer un règlement (partiel ou total).</p>';
  const anyMissing = cmdPayments.some(p=>!payRowValid(p));
  if(anyMissing){ box.insertAdjacentHTML('beforeend', '<p class="note" style="color:var(--red,#b3261e);margin-top:4px">⚠ Chaque encaissement exige un montant, une date et un mode de paiement.</p>'); }
  cmdUpdatePaySummary();
}
function cmdUpdatePaySummary(){
  const box=document.getElementById('paySummary'); if(!box) return;
  const total=cmdCurrentTotal(), paid=cmdCurrentPaid(), reste=money2(total-paid);
  const st = total>0 && paid+1e-9>=total ? 'Payé' : (paid>0?'Partiel':'En attente');
  const col = st==='Payé'?'#3f7d52':(st==='Partiel'?'var(--caramel)':'var(--red,#b3261e)');
  box.innerHTML = `<div style="display:flex;justify-content:space-between"><span>Encaissé</span><b>${euro(paid)}</b></div>
    <div style="display:flex;justify-content:space-between"><span>Total commande</span><b>${euro(total)}</b></div>
    <div style="display:flex;justify-content:space-between;border-top:1px solid #e8dccd;margin-top:4px;padding-top:4px">
      <span><b>Solde restant dû</b> <span class="tag" style="background:${col};color:#fff">${st}</span></span><b style="color:${reste>0?'var(--red,#b3261e)':'#3f7d52'}">${euro(reste)}</b></div>`;
  const hid=document.getElementById('f_pay'); if(hid) hid.value = (st==='Payé')?'Payé':'En attente';
}

// Compat. : ces helpers existaient pour l'ancien toggle ; le registre de paiements les remplace.
function cmdSetPay(v){ const hid=document.getElementById('f_pay'); if(hid) hid.value=v; }
function cmdQuickPay(){ if(typeof cmdAddPayment==='function') cmdAddPayment(); }
function cmdSyncPayUI(){ if(typeof cmdUpdatePaySummary==='function') cmdUpdatePaySummary(); }

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
  else if(type==='prestation') cmdLines.push({type:'prestation', libelle:'', montantHT:0, remiseType:'pct', remisePct:0, remiseEuro:0});
  drawLines();
}
function removeLine(i){ cmdLines.splice(i,1); drawLines(); }

function drawLines(){
  const wrap=document.getElementById('linesWrap'); if(!wrap)return;
  if(!cmdLines.length){ wrap.innerHTML='<p class="note">Ajoute au moins un produit ci-dessous (coffret, événement, grand format, prestation ou don).</p>'; cmdRecalc(); return; }
  wrap.innerHTML = cmdLines.map((ln,i)=>{
    if(ln.type==='coffret') return drawCoffretLine(ln,i);
    if(ln.type==='evenement') return drawEventLine(ln,i);
    if(ln.type==='grand') return drawBigLine(ln,i);
    if(ln.type==='don') return drawDonLine(ln,i);
    if(ln.type==='prestation') return drawPrestationLine(ln,i);
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
function setCoffretTaille(i,v){ cmdLines[i].taille=+v;
  cmdLines[i].prixUnitaireApplique=null; // taille changée → re-tarifer au prix courant du catalogue
  // purge les parfums au-delà de la nouvelle taille
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
function drawPrestationLine(ln,i){
  if(ln.remiseType==null) ln.remiseType='pct';
  const base=money2(+ln.montantHT||0);
  const net=lineTotal(ln);
  return `<div class="cmd-line">
    <div class="line-head"><span class="line-type">Prestation / Coaching <span class="line-sub">service · charges sociales ${getSettings().socialService}%</span></span><span class="line-del" onclick="removeLine(${i})">✕ retirer</span></div>
    <div class="field" style="margin:6px 0"><label>Libellé de la prestation</label>
      <input value="${esc(ln.libelle||'')}" placeholder="ex : Coaching macarons (2 h), déplacement…" oninput="setPrestaField(${i},'libelle',this.value)"></div>
    <div class="row2">
      <div class="field" style="margin:0"><label>Montant (€)</label>
        <input type="number" step="0.01" min="0" value="${ln.montantHT||''}" placeholder="0" oninput="setPrestaField(${i},'montantHT',this.value)"></div>
      <div class="field" style="margin:0"><label>Type de remise</label>
        <select onchange="setPrestaField(${i},'remiseType',this.value)">
          <option value="pct" ${ln.remiseType==='pct'?'selected':''}>Pourcentage (%)</option>
          <option value="euro" ${ln.remiseType==='euro'?'selected':''}>Fixe (€)</option>
        </select></div>
    </div>
    <div class="field" style="margin:6px 0 0">
      ${ln.remiseType==='euro'
        ? `<label>Remise (€)</label><input type="number" step="0.01" min="0" value="${ln.remiseEuro||''}" placeholder="0" oninput="setPrestaField(${i},'remiseEuro',this.value)">`
        : `<label>Remise (%)</label><input type="number" step="1" min="0" max="100" value="${ln.remisePct||''}" placeholder="0" oninput="setPrestaField(${i},'remisePct',this.value)">`}
    </div>
    <div class="sum-box">${(base!==net)?`<span>Avant remise ${euro(base)}</span><b>${euro(net)}</b>`:`<span>Montant prestation</span><b>${euro(base)}</b>`}</div>
  </div>`;
}
function setPrestaField(i,field,v){
  if(!cmdLines[i]) return;
  if(field==='montantHT'||field==='remiseEuro') cmdLines[i][field]=money2(+v||0);
  else if(field==='remisePct'){ let p=+v||0; cmdLines[i][field]=Math.max(0,Math.min(100,p)); }
  else cmdLines[i][field]=v;
  if(field==='remiseType') drawLines(); else cmdRecalc();
}
function setDonParfum(i,fi,v){ const f=FLAVORS[fi]; const q=+v||0; if(q>0)cmdLines[i].parfums[f]=q; else delete cmdLines[i].parfums[f]; drawLines(); }
function setDonItem(i,fi,v){ const f=BIG_FORMATS[fi]; const q=+v||0; if(q>0)cmdLines[i].items[f]=q; else delete cmdLines[i].items[f]; drawLines(); }

// Prix d'une ligne AVANT remise de ligne (arrondi strict au centime)
function lineTotalBase(ln){
  if(ln.type==='coffret'){
    const base = coffretUnitPrice(ln);
    const nbDiff = Object.values(ln.parfums||{}).filter(q=>q>0).length;
    const limit = BOX_FLAVOR_LIMIT[ln.taille]||0;
    const over = Math.max(0, nbDiff-limit);
    return money2(base + over*FLAVOR_SURCHARGE);
  }
  if(ln.type==='evenement') return addMoney(mulMoney(ln.evQte||0,EVENT_PRICE), mulMoney(ln.equip||0,EQUIP_PRICE));
  if(ln.type==='grand'){ const pu=BIG_PRICE[ln.tarif]||0; const tot=Object.values(ln.items||{}).reduce((s,q)=>s+(+q||0),0); return mulMoney(tot,pu); }
  if(ln.type==='don') return 0;
  if(ln.type==='prestation') return money2(+ln.montantHT||0);
  return 0;
}
// Prix unitaire d'un coffret, par ordre de priorité :
//  1) prix SCELLÉ sur la ligne (prixUnitaireApplique) — protège les commandes passées
//  2) catalogue dynamique (db.products via cmdProductsCache) — priorité aux tarifs saisis dans l'app
//  3) constante BOX_PRICES — repli historique uniquement
function coffretUnitPrice(ln){
  if(ln && ln.prixUnitaireApplique!=null && +ln.prixUnitaireApplique>=0) return +ln.prixUnitaireApplique;
  const cat = (typeof cmdProductsCache!=='undefined' ? cmdProductsCache : []).find(p=>+p.taille===+(ln&&ln.taille));
  if(cat && cat.prix!=null) return +cat.prix;
  return (BOX_PRICES[ln&&ln.taille]!=null) ? BOX_PRICES[ln.taille] : 0;
}
// Remise de ligne en € (bornée 0–100 %, arrondie au centime)
function lineRemiseEuro(ln){
  const base=lineTotalBase(ln);
  if(ln.type==='prestation'){
    if(ln.remiseType==='euro') return Math.min(base, money2(+ln.remiseEuro||0));
    const pct=Math.max(0,Math.min(100,+ln.remisePct||0));
    return money2(base*pct/100);
  }
  const pct=Math.max(0,Math.min(100,+ln.remisePct||0));
  return money2(base*pct/100);
}
// Prix d'une ligne APRÈS remise de ligne
function lineTotal(ln){
  return Math.max(0, subMoney(lineTotalBase(ln), lineRemiseEuro(ln)));
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
  const sousTotal = addMoney(...cmdLines.map(ln=>lineTotal(ln))); // après remises de ligne
  const gpct = Math.max(0, Math.min(100, +(document.getElementById('f_remiseg')?.value)||0));
  const remiseG = money2(sousTotal*gpct/100);
  const total = Math.max(0, subMoney(sousTotal, remiseG));
  const mt=document.getElementById('f_mt');
  if(mt && mt.dataset.auto==='1'){ mt.value = total?total.toFixed(2):''; }
  const brk=document.getElementById('priceBreak');
  if(brk){
    if(cmdLines.length){
      brk.style.display='block';
      const remiseLignes = addMoney(...cmdLines.map(ln=>lineRemiseEuro(ln)));
      brk.innerHTML =
        `<div style="display:flex;justify-content:space-between"><span>Sous-total (${cmdLines.length} produit(s))</span><b>${euro(addMoney(...cmdLines.map(ln=>lineTotalBase(ln))))}</b></div>`+
        (remiseLignes>0?`<div style="display:flex;justify-content:space-between;color:#3f7d52"><span>Remises de ligne</span><b>−${euro(remiseLignes)}</b></div>`:'')+
        (gpct>0?`<div style="display:flex;justify-content:space-between;color:#3f7d52"><span>Remise globale (−${gpct}%)</span><b>−${euro(remiseG)}</b></div>`:'')+
        `<div style="display:flex;justify-content:space-between;border-top:1px solid #e8dccd;margin-top:4px;padding-top:4px"><span><b>Total TTC</b></span><b>${euro(total)}</b></div>`;
    } else brk.style.display='none';
  }
  if(typeof cmdUpdatePaySummary==='function') cmdUpdatePaySummary();
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
    if(ln.type==='coffret') return {type:'coffret', taille:ln.taille, remisePct:rp, prixUnitaireApplique: coffretUnitPrice(ln), parfums:Object.keys(ln.parfums).filter(k=>ln.parfums[k]>0).map(nom=>({nom,qte:ln.parfums[nom]}))};
    if(ln.type==='evenement') return {type:'evenement', evQte:ln.evQte, equip:ln.equip, remisePct:rp, parfums:Object.keys(ln.parfums).filter(k=>ln.parfums[k]>0).map(nom=>({nom,qte:ln.parfums[nom]}))};
    if(ln.type==='grand') return {type:'grand', tarif:ln.tarif, remisePct:rp, items:Object.keys(ln.items).filter(k=>ln.items[k]>0).map(nom=>({nom,qte:ln.items[nom]}))};
    if(ln.type==='don') return {type:'don', parfums:Object.keys(ln.parfums||{}).filter(k=>ln.parfums[k]>0).map(nom=>({nom,qte:ln.parfums[nom]})), items:Object.keys(ln.items||{}).filter(k=>ln.items[k]>0).map(nom=>({nom,qte:ln.items[nom]}))};
    if(ln.type==='prestation') return {type:'prestation', libelle:ln.libelle||'', montantHT:money2(+ln.montantHT||0), remiseType:ln.remiseType||'pct', remisePct:Math.max(0,Math.min(100,+ln.remisePct||0)), remiseEuro:money2(+ln.remiseEuro||0)};
  });
  const remiseGlobale = Math.max(0, Math.min(100, +val('f_remiseg')||0));
  // Registre de paiements : chaque encaissement exige montant>0 + date + mode. AUCUNE date auto-générée.
  // On considère "entamé" tout encaissement où au moins un champ a été touché.
  const touched = (cmdPayments||[]).filter(p=> (+p.montant)>0 || p.date || p.moyen);
  for(const p of touched){
    if(!((+p.montant)>0)){ toast('Chaque encaissement doit avoir un montant > 0'); return; }
    if(!p.date){ toast('Chaque encaissement doit avoir une date de règlement'); return; }
    if(!p.moyen){ toast('Chaque encaissement doit avoir un mode de paiement'); return; }
  }
  const paiements = touched.map(p=>({ date:p.date, montant:money2(+p.montant||0), moyen:p.moyen }));
  const montant=money2(+val('f_mt')||0);
  const o={
    clientId:+val('f_cl')||0, date:val('f_date'),
    lignes, remiseGlobale,
    perso:document.getElementById('f_perso').checked,
    montant,
    paiements,
    dateReglementFinal: val('f_dateFinal')||'',
    statut:val('f_st'), notes:val('f_notes'),
    // on neutralise les anciens champs mono-type
    type:'multi', taille:0, parfums:[], evQte:0, equip:0, tarif:'', bigItems:[]
  };
  // dérive paiement/statutPaiement/soldeDu/montantEncaisse/datePaiement/reglement depuis le registre
  syncPaymentFields(o);
  if(o.montant<0){toast('Le prix ne peut pas être négatif');return;}
  // garde-fou : un encaissement sans date ne doit jamais passer (traçabilité)
  if(orderPayStatus(o)!=='En attente' && !o.datePaiement){ toast('Date de paiement manquante'); return; }
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
      if(prod){ await db.productions.update(prod.id,{qteRestante: addQty(prod.qteRestante, it.qte)}); }
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
    if(prod){ await db.productions.update(prod.id,{qteRestante: addQty(prod.qteRestante, item.qte)}); }
    await db.orderItems.delete(itemId);
  });
  toast('Batch détaché — stock fini restitué'); cmdLink(orderId);
}
async function saveLink(orderId){
  const prodId=+val('f_prod'), q=+val('f_q');
  if(!q||q<=0){toast('Quantité invalide');return;}
  try{
    await db.transaction('rw',db.orderItems,db.productions,async()=>{
      // lecture + contrôle + écriture DANS la transaction : aucun état asymétrique possible
      const prod=await db.productions.get(prodId);
      if(!prod) throw new Error('Batch introuvable');
      if(round3(q) > round3(+prod.qteRestante)) throw new Error('Quantité > stock du batch');
      await db.orderItems.add({orderId,productionId:prodId,qte:round3(q)});
      await db.productions.update(prodId,{qteRestante: subQty(prod.qteRestante, q)});
    });
  }catch(err){ toast(err.message||'Erreur de liaison'); return; }
  closeModal(); renderCmd(); toast('Batch lié à la commande ✓');
}

/* ============================================================
   CALENDRIER
   ============================================================ */
let calRef=new Date();

/* ============================================================
   COMPTABILITÉ — moteur en TRÉSORERIE (cash basis)
   Principe clé : le CA est comptabilisé à la DATE RÉELLE D'ENCAISSEMENT
   (date de chaque ligne de paiement), pas à la date de commande/livraison.
   Indépendant des modules Commandes/Stocks : ne lit que les données brutes.
   ============================================================ */
function monthKey(d){ return (d||'').slice(0,7); }   // 'YYYY-MM'
function monthLabel(k){
  if(!k) return '—';
  const [y,m]=k.split('-'); const noms=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  return `${noms[(+m)-1]||m} ${y}`;
}
async function computeAccounting(opts){
  opts=opts||{};
  const orders = await db.orders.toArray();
  const charges = await (db.charges?db.charges.toArray():Promise.resolve([])).catch(()=>[]);
  const recipes = await db.recipes.toArray();
  const recipeItems = await db.recipeItems.toArray();
  const lots = await db.materialLots.toArray();
  const markets = await (db.markets?db.markets.toArray():Promise.resolve([])).catch(()=>[]);

  // 1) ENCAISSEMENTS par date réelle de paiement (cash basis)
  //    Chaque ligne de paiement {date, montant, moyen} compte au mois de SA date.
  const encByMonth={};      // 'YYYY-MM' -> total encaissé
  const encByMethod={};     // moyen -> total
  let totalEncaisse=0;
  // CA FACTURÉ (accrual) : montant total de la commande, à la date de commande.
  // Une commande "En attente de paiement" est facturée mais PAS encaissée → exclue du CA encaissé.
  const factByMonth={}; let totalFacture=0;
  orders.forEach(o=>{
    const mF=monthKey(o.date); const tot=money2(o.montant);
    if(mF && tot>0){ factByMonth[mF]=money2((factByMonth[mF]||0)+tot); totalFacture=money2(totalFacture+tot); }
    const pays = (o.paiements||[]);
    // rétro-compat : ancienne commande "Payé" sans registre → on rattache au datePaiement connu
    const list = pays.length ? pays
      : (o.paiement==='Payé' && o.datePaiement ? [{date:o.datePaiement, montant:+o.montant||0, moyen:o.reglement||'—'}] : []);
    list.forEach(p=>{
      const m=monthKey(p.date); if(!m) return;
      const v=money2(p.montant);
      encByMonth[m]=money2((encByMonth[m]||0)+v);
      encByMethod[p.moyen||'—']=money2((encByMethod[p.moyen||'—']||0)+v);
      totalEncaisse=money2(totalEncaisse+v);
    });
  });

  // 1b) VENTES DE MARCHÉ (clôturées) : encaissement immédiat → facturé = encaissé au mois de clôture.
  //     Réparti par mode de paiement (Espèces / Carte / Autre). Évite tout double comptage :
  //     les ventes de marché ne passent jamais par la table orders.
  let totalMarches=0;
  markets.forEach(mk=>{
    if(mk.statut!=='clos') return;
    const ca=mk.ca||{}; const esp=money2(ca.especes||0), cb=money2(ca.cb||0), au=money2(ca.autre||0);
    const tot=money2(esp+cb+au); if(tot<=0) return;
    const m=monthKey(mk.dateCloture||mk.date); if(!m) return;
    encByMonth[m]=money2((encByMonth[m]||0)+tot);
    factByMonth[m]=money2((factByMonth[m]||0)+tot);
    totalEncaisse=money2(totalEncaisse+tot); totalFacture=money2(totalFacture+tot); totalMarches=money2(totalMarches+tot);
    if(esp>0) encByMethod['Espèces']=money2((encByMethod['Espèces']||0)+esp);
    if(cb>0) encByMethod['Carte']=money2((encByMethod['Carte']||0)+cb);
    if(au>0) encByMethod['Autre (marché)']=money2((encByMethod['Autre (marché)']||0)+au);
  });

  // 2) CHARGES par mois (date de la charge) + par catégorie
  const chargeByMonth={}, chargeByCat={};
  let totalCharges=0;
  charges.forEach(c=>{
    const m=monthKey(c.date); const v=money2(c.montant);
    if(m) chargeByMonth[m]=money2((chargeByMonth[m]||0)+v);
    chargeByCat[c.categorie||'Autre']=money2((chargeByCat[c.categorie||'Autre']||0)+v);
    totalCharges=money2(totalCharges+v);
  });

  // 3) Coût matières des commandes (pour marge brute indicative) — au mois d'encaissement
  //    On rattache le coût matière estimé d'une commande au(x) mois où elle est encaissée,
  //    au prorata du montant encaissé.
  const costByMonth={};
  orders.forEach(o=>{
    const total=money2(o.montant); if(total<=0) return;
    const coutMat = estimateOrderMaterialCost(o, recipes, recipeItems, lots);
    const pays = (o.paiements&&o.paiements.length)?o.paiements
      :(o.paiement==='Payé'&&o.datePaiement?[{date:o.datePaiement,montant:total}]:[]);
    pays.forEach(p=>{
      const m=monthKey(p.date); if(!m) return;
      const ratio=total>0?(money2(p.montant)/total):0;
      costByMonth[m]=money2((costByMonth[m]||0)+coutMat*ratio);
    });
  });

  // 3b) Coûts des marchés clôturés (matière des vendus + emballages delta), au mois de clôture.
  const avgUnitMat = avgMacaronCost(recipes, recipeItems, lots);
  // (chargement des mouvements pour le coût matière marché)
  const allMoves = await (db.marketMoves?db.marketMoves.toArray():Promise.resolve([])).catch(()=>[]);
  const movesByMk={}; allMoves.forEach(mv=>{ (movesByMk[mv.marketId] ||= []).push(mv); });
  let totalCoutMarches=0;
  markets.forEach(mk=>{
    if(mk.statut!=='clos') return;
    const T=marketTotals(mk, movesByMk[mk.id]||[], avgUnitMat);
    const m=monthKey(mk.dateCloture||mk.date); if(!m) return;
    const c=money2(T.coutMat+T.coutEmb);
    costByMonth[m]=money2((costByMonth[m]||0)+c);
    totalCoutMarches=money2(totalCoutMarches+c);
  });

  // 4) Série mensuelle consolidée
  const months=[...new Set([...Object.keys(encByMonth),...Object.keys(chargeByMonth),...Object.keys(factByMonth)])].sort();
  const serie=months.map(m=>{
    const ca=encByMonth[m]||0, fact=factByMonth[m]||0, ch=chargeByMonth[m]||0, cout=costByMonth[m]||0;
    return {mois:m, ca, caFacture:fact, charges:ch, coutMatieres:money2(cout),
      margeBrute:money2(ca-cout), resultat:money2(ca-ch-cout)};
  });

  // 5) Solde clients dû (créances) = total commandes − encaissé, pour les non soldées
  let creances=0;
  orders.forEach(o=>{ const b=orderBalance(o); if(b>0) creances=money2(creances+b); });

  const totalCout=money2(serie.reduce((s,x)=>s+x.coutMatieres,0));
  return {
    serie, encByMethod, chargeByCat,
    totalEncaisse, totalFacture, totalCharges, totalCoutMatieres:totalCout,
    totalMarches,
    margeBrute: money2(totalEncaisse-totalCout),
    resultat: money2(totalEncaisse-totalCharges-totalCout),
    creances,
    nbCharges: charges.length
  };
}
// Coût matières estimé d'une commande (somme sur ses lignes coffret/événement via les recettes).
function estimateOrderMaterialCost(o, recipes, recipeItems, lots){
  // coût unitaire matière par recette (réutilise coutRecette/ rendement)
  let cost=0;
  const lignes = orderToLines(o);
  lignes.forEach(ln=>{
    let pieces=0;
    if(ln.type==='coffret') pieces=+ln.taille||0;
    else if(ln.type==='evenement') pieces=+ln.evQte||0;
    else if(ln.type==='grand') pieces=(ln.items||[]).reduce((s,p)=>s+(+p.qte||0),0);
    else if(ln.type==='don') pieces=(ln.parfums||[]).reduce((s,p)=>s+(+p.qte||0),0);
    if(pieces<=0) return;
    // coût unitaire moyen toutes recettes confondues (approximation si parfum↔recette non résolu)
    const perRecipeUnit = recipes.map(r=>{ const cb=coutRecette(r.id, recipeItems, lots); return r.rendement>0?cb/r.rendement:0; }).filter(x=>x>0);
    const avgUnit = perRecipeUnit.length ? perRecipeUnit.reduce((s,x)=>s+x,0)/perRecipeUnit.length : 0;
    cost += pieces*avgUnit;
  });
  return money2(cost);
}

/* ============================================================
   MARGES — rentabilité réelle d'une vente
   Brute  = prix de vente − coût matières − coût emballages − consommables
   Nette  = brute − charges sociales (12,3% marchandise / 25,6% prestation)
   La fiscalité/frais annexes seront ajoutés plus tard (au choix de l'utilisateur).
   ============================================================ */
function computeOrderMargins(o, recipes, recipeItems, lots){
  const s=getSettings();
  const lignes = orderToLines(o);
  // coût unitaire matière moyen (toutes recettes)
  const perRecipeUnit = recipes.map(r=>{ const cb=coutRecette(r.id, recipeItems, lots); return r.rendement>0?cb/r.rendement:0; }).filter(x=>x>0);
  const avgUnit = perRecipeUnit.length ? perRecipeUnit.reduce((a,x)=>a+x,0)/perRecipeUnit.length : 0;

  let caGoods=0, caService=0;        // répartition du CA par régime social
  let coutMat=0, coutEmb=0;          // coûts matières / emballages
  lignes.forEach(ln=>{
    const net = lineTotalStored(ln); // prix de vente net de remises de ligne
    if(ln.type==='prestation'){ caService=money2(caService+net); return; } // service : pas de matière/emballage
    if(ln.type==='evenement'){
      // l'événement mêle marchandise (macarons) et service (location pyramide/déplacement)
      const maca = money2((+ln.evQte||0)*EVENT_PRICE);
      const presta = money2((+ln.equip||0)*EQUIP_PRICE);
      caGoods=money2(caGoods+maca); caService=money2(caService+presta);
      coutMat=money2(coutMat+(+ln.evQte||0)*avgUnit);
      return;
    }
    // coffret / grand / don : marchandise
    caGoods=money2(caGoods+net);
    let pieces=0;
    if(ln.type==='coffret'){ pieces=+ln.taille||0; coutEmb=money2(coutEmb+packagingCost(ln.taille)); }
    else if(ln.type==='grand') pieces=(ln.items||[]).reduce((a,p)=>a+(+p.qte||0),0);
    else if(ln.type==='don') pieces=(ln.parfums||[]).reduce((a,p)=>a+(+p.qte||0),0);
    coutMat=money2(coutMat+pieces*avgUnit);
  });

  const ca = money2(caGoods+caService);           // = montant commande (hors remise globale éventuelle)
  // remise globale éventuelle appliquée au prorata
  const totalLignes = lignes.reduce((a,ln)=>a+lineTotalStored(ln),0);
  const gpct = Math.max(0,Math.min(100,+o.remiseGlobale||0));
  const factor = gpct>0 ? (1-gpct/100) : 1;
  const caNet = money2(ca*factor), caGoodsN=money2(caGoods*factor), caServiceN=money2(caService*factor);

  const margeBrute = money2(caNet - coutMat - coutEmb);
  const tauxBrut = caNet>0 ? Math.round(margeBrute/caNet*1000)/10 : 0;

  const chargesSociales = money2(caGoodsN*s.socialGoods/100 + caServiceN*s.socialService/100);
  const margeNette = money2(margeBrute - chargesSociales);
  const tauxNet = caNet>0 ? Math.round(margeNette/caNet*1000)/10 : 0;

  return {ca:caNet, caGoods:caGoodsN, caService:caServiceN,
    coutMat, coutEmb, margeBrute, tauxBrut,
    chargesSociales, margeNette, tauxNet};
}
// Échelle de rentabilité d'après le taux de marge nette.
function profitScale(tauxNet){
  if(tauxNet>=50) return {label:'Très rentable', col:'#2e7d32', rank:5};
  if(tauxNet>=30) return {label:'Rentable', col:'#3f7d52', rank:4};
  if(tauxNet>=15) return {label:'Moyennement rentable', col:'#caa23b', rank:3};
  if(tauxNet>=0)  return {label:'Peu rentable', col:'#d98324', rank:2};
  return {label:'Non rentable', col:'#b3261e', rank:1};
}

/* ============================================================
   MARCHÉS / VENTES ITINÉRANTES — moteur
   Stock fini = productions.qteRestante. Une SORTIE décrémente (départ marché),
   un RETOUR ré-incrémente (invendus rapportés). Dons/pertes ne reviennent pas en stock.
   Vendu = embarqué − retour − don − perte (calculé).
   Tous les mouvements sont ACID (transaction Dexie) et historisés.
   ============================================================ */
// Enregistre une SORTIE de stock vers un marché (décrément ACID du batch).
async function marketAddSortie(marketId, productionId, qte, parfum){
  qte=round3(qte);
  if(qte<=0) throw new Error('Quantité invalide');
  await db.transaction('rw', db.productions, db.marketMoves, async()=>{
    const p=await db.productions.get(productionId);
    if(!p) throw new Error('Lot introuvable');
    if(qte > round3(+p.qteRestante)) throw new Error('Quantité > stock atelier du lot');
    const stockAvant=round3(+p.qteRestante);
    await db.productions.update(productionId, {qteRestante: subQty(p.qteRestante, qte)});
    await db.marketMoves.add({marketId, productionId, type:'sortie', qte, parfum:parfum||'', motif:'',
      date:today(), stockAvant, stockApres:subQty(stockAvant,qte)});
  });
}

// Stock fini disponible AGRÉGÉ PAR PARFUM (sans se soucier des lots).
// Retourne [{parfum, dispo, recipeId, batches:[{id,qteRestante,date}]}] trié par parfum.
async function stockFiniParParfum(){
  const prods=(await db.productions.toArray()).filter(p=>round3(+p.qteRestante)>0);
  const recipes=await db.recipes.toArray();
  const recName=rid=>(recipes.find(r=>r.id===rid)||{}).produitNom||'(parfum ?)';
  const byParfum={};
  prods.forEach(p=>{
    const nom=recName(p.recipeId);
    (byParfum[nom] ||= {parfum:nom, recipeId:p.recipeId, dispo:0, batches:[]});
    byParfum[nom].dispo=addQty(byParfum[nom].dispo, p.qteRestante);
    byParfum[nom].batches.push({id:p.id, qteRestante:round3(+p.qteRestante), date:p.date||'', lot:p.lotProduction||String(p.id)});
  });
  // FIFO : batches triés par date (DLC/ancienneté) croissante
  Object.values(byParfum).forEach(b=>b.batches.sort((a,c)=>(a.date||'').localeCompare(c.date||'')));
  return Object.values(byParfum).sort((a,b)=>a.parfum.localeCompare(b.parfum));
}

// Sortie d'une quantité d'un PARFUM, répartie en FIFO sur ses lots (le plus ancien d'abord).
// L'utilisateur ne voit pas les lots ; la traçabilité et le stock atelier restent corrects.
async function marketAddSortieParfum(marketId, parfum, qteDemandee){
  let reste=round3(qteDemandee);
  if(reste<=0) throw new Error('Quantité invalide');
  await db.transaction('rw', db.productions, db.recipes, db.marketMoves, async()=>{
    const recipes=await db.recipes.toArray();
    const recName=rid=>(recipes.find(r=>r.id===rid)||{}).produitNom||'';
    // tous les lots de ce parfum avec du stock, triés FIFO (date croissante)
    const all=(await db.productions.toArray())
      .filter(p=>round3(+p.qteRestante)>0 && recName(p.recipeId)===parfum)
      .sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    const dispo=all.reduce((s,p)=>addQty(s,p.qteRestante),0);
    if(reste>round3(dispo)) throw new Error(`Stock insuffisant pour ${parfum} (dispo ${qty(dispo)})`);
    for(const p of all){
      if(reste<=0) break;
      const pris=Math.min(round3(+p.qteRestante), reste);
      const stockAvant=round3(+p.qteRestante);
      await db.productions.update(p.id, {qteRestante: subQty(p.qteRestante, pris)});
      await db.marketMoves.add({marketId, productionId:p.id, type:'sortie', qte:pris, parfum, motif:'',
        date:today(), stockAvant, stockApres:subQty(stockAvant,pris)});
      reste=subQty(reste, pris);
    }
  });
}
// Enregistre un don ou une perte (sort définitivement du stock embarqué, pas de retour atelier).
async function marketAddLoss(marketId, productionId, qte, type, parfum, motif){
  qte=round3(qte);
  if(qte<=0) throw new Error('Quantité invalide');
  if(type!=='don' && type!=='perte') throw new Error('Type invalide');
  await db.marketMoves.add({marketId, productionId, type, qte, parfum:parfum||'', motif:motif||'', date:today()});
}
// Enregistre un RETOUR d'invendus (ré-incrémente le stock atelier, ACID).
async function marketAddRetour(marketId, productionId, qte, parfum, destination){
  qte=round3(qte);
  if(qte<0) throw new Error('Quantité invalide');
  if(destination!=='frigo' && destination!=='congelateur') throw new Error('Destination du retour obligatoire');
  await db.transaction('rw', db.productions, db.marketMoves, async()=>{
    const p=await db.productions.get(productionId);
    if(!p) throw new Error('Lot introuvable');
    // RÈGLE SÉCURITÉ ALIMENTAIRE : un produit venu du congélateur ne peut pas y retourner.
    if(destination==='congelateur' && p.venuDuCongelateur){
      throw new Error(`${parfum||'Ce lot'} vient du congélateur : recongélation interdite. Choisissez le frigo.`);
    }
    const nowIso=new Date().toISOString();
    const hist=(p.histEmplacement||[]).concat([{lieu:destination, ts:nowIso, motif:'retour marché'}]);
    const patch={qteRestante: addQty(p.qteRestante, qte), emplacement:destination, emplacementMaj:nowIso, histEmplacement:hist};
    if(destination==='congelateur') patch.venuDuCongelateur=true;
    if(p.dlcAuto!==false){ patch.dlcProduit=computeDlcFromHistory(hist, nowIso); patch.dlcAuto=true; }
    await db.productions.update(productionId, patch);
    await db.marketMoves.add({marketId, productionId, type:'retour', qte, parfum:parfum||'', motif:'', date:today(), destination});
  });
}
// Agrège les mouvements d'un marché par lot/parfum : embarqué, retour, don, perte, vendu.
function marketLineSummary(moves){
  // clé = parfum (l'utilisateur raisonne par parfum, pas par lot).
  // On conserve la liste des productionId concernés pour la traçabilité éventuelle.
  const byParfum={};
  moves.forEach(mv=>{
    const k=mv.parfum||('lot#'+mv.productionId);
    (byParfum[k] ||= {parfum:mv.parfum||'', productionIds:[], sortie:0, retour:0, don:0, perte:0});
    const b=byParfum[k];
    if(mv.parfum && !b.parfum) b.parfum=mv.parfum;
    if(mv.productionId!=null && !b.productionIds.includes(mv.productionId)) b.productionIds.push(mv.productionId);
    if(mv.type==='sortie') b.sortie=addQty(b.sortie,mv.qte);
    else if(mv.type==='retour') b.retour=addQty(b.retour,mv.qte);
    else if(mv.type==='don') b.don=addQty(b.don,mv.qte);
    else if(mv.type==='perte') b.perte=addQty(b.perte,mv.qte);
  });
  return Object.values(byParfum).map(b=>{
    b.productionId = b.productionIds[0]; // compat affichage
    b.vendu = Math.max(0, subQty(subQty(subQty(b.sortie,b.retour),b.don),b.perte));
    b.incoherent = (subQty(subQty(subQty(b.sortie,b.retour),b.don),b.perte) < 0);
    return b;
  }).sort((a,c)=>(a.parfum||'').localeCompare(c.parfum||''));
}
// Coût emballages d'un marché par delta avant/après : Σ((avant − après) × coût unitaire).
function marketPackagingCost(market){
  const pk=(market && market.packaging) || [];
  let used=0, cost=0;
  pk.forEach(p=>{ const u=Math.max(0, round3((+p.before||0)-(+p.after||0))); used+=u; cost=money2(cost+u*(+p.cost||0)); });
  return {used:round3(used), cost:money2(cost)};
}
// Totaux d'un marché (quantités + CA + pertes + coûts + marges).
// avgUnitMat = coût matière moyen par macaron (fourni par l'appelant qui a accès aux recettes).
function marketTotals(market, moves, avgUnitMat){
  const lines=marketLineSummary(moves);
  const embarque=lines.reduce((s,l)=>s+l.sortie,0);
  const retour=lines.reduce((s,l)=>s+l.retour,0);
  const don=lines.reduce((s,l)=>s+l.don,0);
  const perte=lines.reduce((s,l)=>s+l.perte,0);
  const vendu=lines.reduce((s,l)=>s+l.vendu,0);
  const ca=market.ca||{};
  const caEspeces=money2(ca.especes||0), caCB=money2(ca.cb||0), caAutre=money2(ca.autre||0);
  const caTotal=addMoney(caEspeces,caCB,caAutre);
  const tauxInvendus = embarque>0 ? Math.round((retour+don+perte)/embarque*1000)/10 : 0;
  const tauxPerte = embarque>0 ? Math.round(perte/embarque*1000)/10 : 0;
  // Coûts : matière sur les macarons SORTIS (matière engagée ; les invendus restent mangeables mais
  // le coût matière est déjà supporté) — on rattache au vendu pour une marge sur ventes réelles.
  const unit = +avgUnitMat||0;
  const coutMat = money2(vendu*unit);
  const pkg = marketPackagingCost(market);
  const coutEmb = pkg.cost;
  const s=getSettings();
  const margeBrute = money2(caTotal - coutMat - coutEmb);
  const tauxBrut = caTotal>0?Math.round(margeBrute/caTotal*1000)/10:0;
  // marché = vente de marchandise → charges sociales "goods"
  const chargesSociales = money2(caTotal*s.socialGoods/100);
  const margeNette = money2(margeBrute - chargesSociales);
  const tauxNet = caTotal>0?Math.round(margeNette/caTotal*1000)/10:0;
  return {lines, embarque:round3(embarque), retour:round3(retour), don:round3(don), perte:round3(perte), vendu:round3(vendu),
    caEspeces, caCB, caAutre, caTotal,
    pctCB: caTotal>0?Math.round(caCB/caTotal*100):0, pctEspeces: caTotal>0?Math.round(caEspeces/caTotal*100):0,
    tauxInvendus, tauxPerte,
    caParHeure: (market.heures>0)?money2(caTotal/market.heures):0,
    coutMat, coutEmb, pkgUsed:pkg.used, margeBrute, tauxBrut, chargesSociales, margeNette, tauxNet};
}
// Coût matière moyen par macaron (helper réutilisable, nécessite recipes+items+lots).
function avgMacaronCost(recipes, recipeItems, lots){
  const per = recipes.map(r=>{ const cb=coutRecette(r.id, recipeItems, lots); return r.rendement>0?cb/r.rendement:0; }).filter(x=>x>0);
  return per.length ? per.reduce((a,x)=>a+x,0)/per.length : 0;
}

// === insère moteur computeStats (voir stats_engine.js) ===
/* ============================================================
   PILOTAGE STRATÉGIQUE — consolidation des indicateurs + recommandations
   S'appuie sur computeAccounting (CA encaissé/facturé) et computeOrderMargins.
   ============================================================ */
async function computeStrategic(){
  const [orders, clients, recipes, recipeItems, lots, products] = await Promise.all([
    db.orders.toArray(), db.clients.toArray(), db.recipes.toArray(),
    db.recipeItems.toArray(), db.materialLots.toArray(), db.products.toArray()
  ]);
  const A = await computeAccounting();
  const now=new Date(); const curM=now.toISOString().slice(0,7); const curY=String(now.getFullYear());
  const prevMonthD=new Date(now.getFullYear(), now.getMonth()-1, 1); const prevM=prevMonthD.toISOString().slice(0,7);
  const prevY=String(now.getFullYear()-1);

  // CA encaissé mensuel / annuel + évolutions (depuis la série de computeAccounting)
  const caByMonth={}; A.serie.forEach(s=>caByMonth[s.mois]=s.ca);
  const caByYear={}; A.serie.forEach(s=>{ const y=s.mois.slice(0,4); caByYear[y]=money2((caByYear[y]||0)+s.ca); });
  const caMonth=caByMonth[curM]||0, caPrevMonth=caByMonth[prevM]||0;
  const caYear=caByYear[curY]||0, caPrevYear=caByYear[prevY]||0;
  const evoMonth = caPrevMonth>0 ? Math.round((caMonth-caPrevMonth)/caPrevMonth*1000)/10 : (caMonth>0?100:0);
  const evoYear = caPrevYear>0 ? Math.round((caYear-caPrevYear)/caPrevYear*1000)/10 : (caYear>0?100:0);

  // Marges globales (somme des marges par commande payée)
  let margeBrute=0, margeNette=0, caPaye=0;
  const paid = orders.filter(o=>o.paiement==='Payé');
  paid.forEach(o=>{ const m=computeOrderMargins(o,recipes,recipeItems,lots); margeBrute=money2(margeBrute+m.margeBrute); margeNette=money2(margeNette+m.margeNette); caPaye=money2(caPaye+m.ca); });
  const tauxBrut = caPaye>0?Math.round(margeBrute/caPaye*1000)/10:0;
  const tauxNet = caPaye>0?Math.round(margeNette/caPaye*1000)/10:0;

  // Panier moyen + nb commandes + clients actifs (90 j)
  const nbCmd = paid.length;
  const panier = nbCmd>0 ? money2(caPaye/nbCmd) : 0;
  const since=new Date(now-90*86400000).toISOString().slice(0,10);
  const activeClients = new Set(paid.filter(o=>o.date&&o.date>=since && o.clientId).map(o=>o.clientId)).size;
  const totalClients = clients.length;

  return {
    caMonth, caPrevMonth, evoMonth, caYear, caPrevYear, evoYear,
    margeBrute, margeNette, tauxBrut, tauxNet,
    panier, nbCmd, activeClients, totalClients,
    caEncaisse:A.totalEncaisse, caFacture:A.totalFacture, creances:A.creances,
    serie:A.serie,
    _ctx:{orders, clients, recipes, recipeItems, lots, products, paid}
  };
}

// Analyses + recommandations automatiques fondées sur la rentabilité réelle.
function generateInsights(S){
  const {orders, clients, recipes, recipeItems, lots, products, paid} = S._ctx;
  const clName=id=>(clients.find(c=>c.id===id)||{}).nom||'—';

  // --- rentabilité par "produit" (type/format de ligne) ---
  const prodAgg={}; // clé lisible -> {ca, brute, nette, n}
  paid.forEach(o=>{
    const m=computeOrderMargins(o,recipes,recipeItems,lots);
    orderToLines(o).forEach(ln=>{
      let key;
      if(ln.type==='coffret') key=`Coffret ${ln.taille}`;
      else if(ln.type==='evenement') key='Événement';
      else if(ln.type==='grand') key='Grand format';
      else if(ln.type==='prestation') key='Prestation / Coaching';
      else key='Don';
      const lt=lineTotalStored(ln);
      (prodAgg[key] ||= {ca:0,n:0}); prodAgg[key].ca=money2(prodAgg[key].ca+lt); prodAgg[key].n++;
    });
  });
  const produits=Object.entries(prodAgg).map(([k,v])=>({nom:k, ca:v.ca, n:v.n})).sort((a,b)=>b.ca-a.ca);

  // --- clients les plus rentables (marge nette) ---
  const byClient={};
  paid.forEach(o=>{ const m=computeOrderMargins(o,recipes,recipeItems,lots); const k=o.clientId||0;
    (byClient[k] ||= {nom:clName(k), ca:0, nette:0, n:0}); const c=byClient[k];
    c.ca=money2(c.ca+m.ca); c.nette=money2(c.nette+m.margeNette); c.n++; });
  const clientsTop=Object.values(byClient).map(c=>({...c, tauxNet:c.ca>0?Math.round(c.nette/c.ca*1000)/10:0})).sort((a,b)=>b.nette-a.nette);

  // --- événements les plus rentables ---
  const events=paid.filter(orderIsEvent).map(o=>{ const m=computeOrderMargins(o,recipes,recipeItems,lots);
    return {nom:clName(o.clientId), date:o.date, ca:m.ca, nette:m.margeNette, taux:m.tauxNet}; }).sort((a,b)=>b.nette-a.nette);

  // --- tendances & saisonnalité ---
  const trends=analyzeTrends(orders,{windowDays:30});
  // saisonnalité : CA encaissé moyen par mois calendaire
  const moisCA={}; const moisN={};
  S.serie.forEach(s=>{ const mm=+s.mois.slice(5,7); moisCA[mm]=(moisCA[mm]||0)+s.ca; moisN[mm]=(moisN[mm]||0)+1; });
  const noms=['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
  const saison=Object.keys(moisCA).map(mm=>({mois:+mm, nom:noms[mm-1], moy:money2(moisCA[mm]/moisN[mm])})).sort((a,b)=>b.moy-a.moy);

  // --- recommandations concrètes ---
  const reco=[];
  // produit le plus / moins rentable
  if(produits.length>=1){
    reco.push({type:'avant', txt:`Mettez en avant « ${produits[0].nom} » : c'est votre plus gros contributeur au CA (${euro(produits[0].ca)}).`});
  }
  if(produits.length>=3){
    const last=produits[produits.length-1];
    reco.push({type:'revoir', txt:`« ${last.nom} » génère peu de CA (${euro(last.ca)}). À revoir : tarif, visibilité, ou retrait de l'offre.`});
  }
  // marge nette globale
  if(S.tauxNet<15 && S.caEncaisse>0){
    reco.push({type:'marge', txt:`Votre marge nette globale est de ${S.tauxNet}%. Pour l'améliorer : revoyez les tarifs des produits à faible marge, négociez vos matières, ou réduisez les remises.`});
  } else if(S.tauxNet>=30){
    reco.push({type:'marge', txt:`Bonne marge nette globale (${S.tauxNet}%). Vous avez de la marge pour investir (communication, équipement) ou absorber une hausse de coûts.`});
  }
  // tarifs : coffret le plus vendu vs prix
  const coffretProd=produits.find(p=>p.nom.startsWith('Coffret'));
  if(coffretProd){
    reco.push({type:'tarif', txt:`« ${coffretProd.nom} » est très demandé (${coffretProd.n} ventes). Testez une légère hausse de prix : l'élasticité est souvent faible sur un produit installé.`});
  }
  // client fidèle
  if(clientsTop.length>=1 && clientsTop[0].n>=2){
    reco.push({type:'oppo', txt:`${clientsTop[0].nom} est votre client le plus rentable (${euro(clientsTop[0].nette)} de marge nette sur ${clientsTop[0].n} commandes). Proposez-lui une offre fidélité ou un événement dédié.`});
  }
  // prestations
  const presta=produits.find(p=>p.nom.includes('Prestation'));
  if(presta){
    reco.push({type:'oppo', txt:`Les prestations/coaching rapportent ${euro(presta.ca)} : développez ce service à forte marge (peu de coût matière).`});
  } else {
    reco.push({type:'oppo', txt:`Vous ne facturez pas encore de prestation/coaching : c'est un service à très forte marge nette (peu de coût matière) à développer.`});
  }
  // créances
  if(S.creances>0){
    reco.push({type:'action', txt:`${euro(S.creances)} restent à encaisser (créances clients). Relancez les soldes en attente pour améliorer votre trésorerie.`});
  }
  // tendance
  if(trends.hausses.length){
    reco.push({type:'avant', txt:`En hausse ce mois : ${trends.hausses.slice(0,3).map(h=>h.nom).join(', ')}. Capitalisez (mise en avant, stock anticipé).`});
  }
  if(trends.baisses.length){
    reco.push({type:'revoir', txt:`En baisse : ${trends.baisses.slice(0,3).map(b=>b.nom).join(', ')}. Vérifiez la qualité, le prix ou relancez par une promo ciblée.`});
  }
  // évolution CA
  if(S.evoMonth<0){
    reco.push({type:'action', txt:`CA en baisse de ${Math.abs(S.evoMonth)}% vs le mois dernier. Action : relance clients dormants, opération commerciale, ou présence accrue (Instagram, événements).`});
  } else if(S.evoMonth>0){
    reco.push({type:'action', txt:`CA en hausse de ${S.evoMonth}% vs le mois dernier. Maintenez la dynamique et sécurisez vos approvisionnements.`});
  }

  return {produits, clientsTop, events, trends, saison, reco};
}

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

/* ============================================================
   PRÉDICTIF — rupture basée sur le RYTHME DE VENTES des mois passés.
   Distinct du prévisionnel par commandes : ici on projette la
   consommation moyenne (vélocité) sur le stock actuel pour estimer
   le nombre de jours avant rupture, par parfum.
   ============================================================ */
async function computeSalesVelocity(opts){
  opts=opts||{};
  const lookbackMonths = opts.months || 3;   // nb de mois récents pris en compte
  const horizon = opts.horizonDays || 14;     // seuil d'alerte (jours avant rupture)
  const recipes = await db.recipes.toArray();
  const prods = await db.productions.toArray();
  const orders = await db.orders.toArray();

  // 1) Stock fini actuel par parfum (somme des batchs restants, regroupés par recette)
  const stockByParfum = {};
  prods.forEach(p=>{
    const r = recipes.find(x=>x.id===p.recipeId);
    const nom = r ? r.produitNom : ('Recette #'+p.recipeId);
    stockByParfum[nom] = round3((stockByParfum[nom]||0) + (+p.qteRestante||0));
  });

  // 2) Historique des ventes par parfum et par mois (commandes payées uniquement)
  const todayD = new Date(today());
  const startWindow = new Date(todayD); startWindow.setMonth(startWindow.getMonth()-lookbackMonths);
  const startStr = startWindow.toISOString().slice(0,10);
  const soldByParfum = {};       // parfum -> total pièces vendues sur la fenêtre
  let firstSaleDate = null;
  orders.forEach(o=>{
    if(o.paiement!=='Payé' || !o.date) return;
    if(o.date < startStr) return;                 // hors fenêtre récente
    if(!firstSaleDate || o.date<firstSaleDate) firstSaleDate=o.date;
    const dem=_orderParfumDemand(o);
    for(const nom in dem){ soldByParfum[nom]=(soldByParfum[nom]||0)+dem[nom]; }
  });

  // nombre de jours effectivement observés dans la fenêtre (borne au 1er jour de vente)
  const obsStart = (firstSaleDate && firstSaleDate>startStr) ? firstSaleDate : startStr;
  let observedDays = Math.max(1, Math.round((todayD - new Date(obsStart))/86400000));

  // 3) Vélocité (pièces/jour) + projection jours-avant-rupture par parfum
  const parfums = [...new Set([...Object.keys(stockByParfum), ...Object.keys(soldByParfum)])];
  const lignes = parfums.map(nom=>{
    const vendu = soldByParfum[nom]||0;
    const stock = stockByParfum[nom]||0;
    const perDay = vendu>0 ? vendu/observedDays : 0;        // vélocité moyenne
    const perMonth = round3(perDay*30);
    const joursRestants = perDay>0 ? Math.floor(stock/perDay) : null; // null = aucune vente récente
    let dateRupture=null;
    if(joursRestants!=null){ const d=new Date(todayD); d.setDate(d.getDate()+joursRestants); dateRupture=d.toISOString().slice(0,10); }
    const alerte = joursRestants!=null && joursRestants<=horizon;
    return {parfum:nom, stock, vendu, perDay:round3(perDay), perMonth, joursRestants, dateRupture, alerte};
  }).filter(l=>l.stock>0 || l.vendu>0)
    .sort((a,b)=>{
      // priorité : ceux qui vont rompre le plus tôt
      const ja=a.joursRestants==null?Infinity:a.joursRestants;
      const jb=b.joursRestants==null?Infinity:b.joursRestants;
      return ja-jb;
    });

  return {lignes, alertes:lignes.filter(l=>l.alerte), lookbackMonths, horizon, observedDays,
    hasData: Object.keys(soldByParfum).length>0};
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
   COMPTABILITÉ — écran de pilotage (CA encaissé, charges, marges)
   ============================================================ */
const CHARGE_CATS = ['Matières premières','Emballages','Équipement','Loyer','Énergie','Transport','Marketing','Frais bancaires','Cotisations / impôts','Formation','Autre'];
async function renderCompta(){
 try {
  const A = await computeAccounting();
  const fmtPct = (n,d)=> d>0 ? Math.round(n/d*100) : 0;

  // graphe CA encaissé vs charges par mois (lineChart attend des séries de points {x,y})
  let chart='';
  if(A.serie.length){
    const mkPts = sel => A.serie.map((s,i)=>({x:i, y:sel(s)}));
    const labelByIdx = A.serie.map(s=>monthLabel(s.mois));
    chart = lineChart([
      {name:'CA facturé', points:mkPts(s=>s.caFacture), color:'#c9a227'},
      {name:'CA encaissé', points:mkPts(s=>s.ca), color:'#52252F'},
      {name:'Résultat', points:mkPts(s=>s.resultat), color:'#3f7d52'}
    ], {zero:true, xlabel:i=>labelByIdx[i]||'', fmt:v=>Math.round(v)+'€'});
  }

  const serieRows = A.serie.slice().reverse().map(s=>`<tr>
     <td>${monthLabel(s.mois)}</td>
     <td>${euro(s.caFacture)}</td>
     <td>${euro(s.ca)}</td>
     <td>${euro(s.charges)}</td>
     <td style="font-weight:600;color:${s.resultat>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(s.resultat)}</td></tr>`).join('');

  const methodRows = Object.entries(A.encByMethod).sort((a,b)=>b[1]-a[1])
    .map(([m,v])=>`<div class="sum-box"><span>${esc(m)}</span><b>${euro(v)} <span style="color:#9a8a82;font-weight:400">(${fmtPct(v,A.totalEncaisse)}%)</span></b></div>`).join('');
  const catRows = Object.entries(A.chargeByCat).sort((a,b)=>b[1]-a[1])
    .map(([c,v])=>`<div class="sum-box"><span>${esc(c)}</span><b>${euro(v)}</b></div>`).join('');

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Comptabilité</h1><p>Pilotage en trésorerie — CA comptabilisé à l'encaissement réel</p></div>
     <div class="flex" style="gap:8px"><button class="btn ghost sm" onclick="togglePrivacyMode()">${privacyModeEnabled()?'👁️':'🙈'}</button><button class="btn gold" onclick="chargeForm()">＋ Charge</button></div></div>
   <div class="banner">📒 <div>Deux lectures du chiffre d'affaires : le <b>CA facturé</b> (total des commandes, à leur date) et le <b>CA encaissé</b> (règlements reçus, à leur date réelle). Une commande « en attente de paiement » est facturée mais n'entre pas dans le CA encaissé. Le CA des <b>marchés clôturés</b> est inclus (à leur date de clôture).${A.totalMarches>0?` Dont marchés : <b>${euro(A.totalMarches)}</b>.`:''}</div></div>
   <div class="flex" style="gap:8px;margin-bottom:14px;flex-wrap:wrap">
     <button class="btn" onclick="view='rentabilite';setActiveView&&setActiveView('rentabilite');renderProfit()">📈 Analyse de rentabilité</button>
     <button class="btn ghost" onclick="settingsForm()">⚙ Paramètres (taux, emballages)</button>
   </div>

   <div class="kpi-grid">
     <div class="kpi"><span>CA facturé</span><b>${euro(A.totalFacture)}</b></div>
     <div class="kpi"><span>CA encaissé</span><b>${euro(A.totalEncaisse)}</b></div>
     <div class="kpi"><span>Charges</span><b>${euro(A.totalCharges)}</b></div>
     <div class="kpi"><span>Coût matières (est.)</span><b>${euro(A.totalCoutMatieres)}</b></div>
     <div class="kpi"><span>Résultat (encaissé)</span><b style="color:${A.resultat>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(A.resultat)}</b></div>
     <div class="kpi"><span>Créances clients</span><b style="color:${A.creances>0?'var(--caramel)':'#3f7d52'}">${euro(A.creances)}</b></div>
   </div>

   ${A.serie.length?`<div class="panel"${privacyModeEnabled()?' style="filter:blur(6px);opacity:.45;pointer-events:none"':''}><h2>CA encaissé, charges & résultat par mois</h2>${chart}</div>`:''}

   <div class="panel"><h2>Détail mensuel (facturé vs encaissé)</h2>
   ${A.serie.length?`<div class="table-wrap"><table><thead><tr><th>Mois</th><th>CA facturé</th><th>CA encaissé</th><th>Charges</th><th>Résultat</th></tr></thead>
     <tbody>${serieRows}</tbody></table></div>`:`<div class="empty">Aucun encaissement ni charge enregistré.</div>`}
   </div>

   <div class="panel"><h2>Encaissements par mode de paiement</h2>
     ${methodRows||'<p class="note">Aucun encaissement.</p>'}</div>

   <div class="panel"><h2>Charges par catégorie <span class="tag warn">${A.nbCharges}</span></h2>
     ${catRows||'<p class="note">Aucune charge. Ajoutez vos dépenses (matières, emballages, loyer…) pour suivre votre résultat réel.</p>'}
     <button class="btn ghost sm" style="margin-top:8px" onclick="renderChargesList()">Voir / gérer les charges</button></div>

   <p class="note" style="margin-top:10px">Le coût matières est une estimation moyenne (coût recette ÷ rendement) pour donner une marge indicative. Pour la comptabilité officielle, appuyez-vous sur vos charges saisies et l'export.</p>`;
 } catch(err){ renderViewError('compta', err); }
}
// Liste détaillée des charges (gestion : éditer / supprimer)
async function renderChargesList(){
  const charges = (await db.charges.toArray()).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  openModal(`<h3>Charges / dépenses</h3>
    <button class="btn gold sm" style="margin-bottom:8px" onclick="chargeForm()">＋ Nouvelle charge</button>
    ${charges.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Catégorie</th><th>Libellé</th><th>Montant</th><th></th></tr></thead>
      <tbody>${charges.map(c=>`<tr><td>${fmtDate(c.date)}</td><td>${esc(c.categorie||'—')}</td><td>${esc(c.libelle||'')}</td><td>${euro(c.montant)}</td>
        <td style="text-align:right"><span class="act" onclick="chargeForm(${c.id})">Modifier</span><span class="act del" onclick="delCharge(${c.id})">Suppr.</span></td></tr>`).join('')}</tbody></table></div>`
      :'<p class="note">Aucune charge enregistrée.</p>'}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`);
}
async function chargeForm(id){
  const c = id ? await db.charges.get(id) : {};
  openModal(`<h3>${id?'Modifier':'Nouvelle'} charge</h3>
    <div class="field"><label>Date *</label><input type="date" id="ch_date" value="${esc(c.date||'')}"></div>
    <div class="field"><label>Catégorie *</label><select id="ch_cat">${CHARGE_CATS.map(x=>`<option ${c.categorie===x?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label>Libellé</label><input id="ch_lib" value="${esc(c.libelle||'')}" placeholder="ex : Achat poudre d'amande"></div>
    <div class="field"><label>Montant (€) *</label><input type="number" step="0.01" min="0" id="ch_mt" value="${c.montant||''}"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveCharge(${id||0})">Enregistrer</button></div>`);
}
async function saveCharge(id){
  const date=val('ch_date'), categorie=val('ch_cat'), libelle=val('ch_lib'), montant=money2(+val('ch_mt')||0);
  if(!date){ toast('Date obligatoire'); return; }
  if(montant<=0){ toast('Montant obligatoire'); return; }
  const o={date, categorie, libelle, montant};
  if(id) await db.charges.update(id,o); else await db.charges.add(o);
  closeModal(); renderCompta(); toast('Charge enregistrée ✓');
}
async function delCharge(id){
  if(!confirm('Supprimer cette charge ?')) return;
  await db.charges.delete(id); closeModal(); renderCompta(); toast('Charge supprimée');
}

/* ============================================================
   TABLEAU DE BORD STRATÉGIQUE — centre de pilotage financier
   ============================================================ */
async function renderPilotage(){
 try {
  const S = await computeStrategic();
  const I = generateInsights(S);
  const evoBadge = (v)=>{ const up=v>=0; return `<span style="color:${up?'#3f7d52':'var(--red,#b3261e)'};font-size:.8rem">${up?'▲':'▼'} ${Math.abs(v)}%</span>`; };

  // mini-courbe CA encaissé
  let chart='';
  if(S.serie.length){
    chart = lineChart([{name:'CA encaissé', points:S.serie.map((s,i)=>({x:i,y:s.ca})), color:'#52252F'}],
      {zero:true, xlabel:i=>monthLabel(S.serie[i]?.mois)||'', fmt:v=>Math.round(v)+'€'});
  }

  const recoIcon={avant:'⭐',revoir:'🔧',marge:'📊',tarif:'🏷️',oppo:'💡',action:'🎯'};
  const recoCards = I.reco.map(r=>`<div class="sum-box" style="align-items:flex-start"><span>${recoIcon[r.type]||'•'}</span><span style="flex:1">${esc(r.txt)}</span></div>`).join('');

  const topProd = I.produits.slice(0,5).map(p=>`<div class="sum-box"><span>${esc(p.nom)} <span style="color:#9a8a82;font-size:.74rem">(${p.n} ventes)</span></span><b>${euro(p.ca)}</b></div>`).join('');
  const lowProd = I.produits.slice(-3).reverse().map(p=>`<div class="sum-box"><span>${esc(p.nom)}</span><b>${euro(p.ca)}</b></div>`).join('');
  const topClients = I.clientsTop.slice(0,5).map(c=>`<div class="sum-box"><span>${esc(c.nom)} <span style="color:#9a8a82;font-size:.74rem">(${c.n} cmd)</span></span><b style="color:${c.nette>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(c.nette)} <span style="color:#9a8a82;font-weight:400;font-size:.72rem">marge nette</span></b></div>`).join('');
  const topEvents = I.events.slice(0,5).map(e=>`<div class="sum-box"><span>${esc(e.nom)} <span style="color:#9a8a82;font-size:.74rem">${fmtDate(e.date)}</span></span><b style="color:${e.nette>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(e.nette)} (${e.taux}%)</b></div>`).join('');
  const saison = I.saison.slice(0,3).map(s=>`<span class="pill">${s.nom} : ${euro(s.moy)}/mois</span>`).join(' ');

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Pilotage stratégique</h1><p>Centre de pilotage financier — temps réel</p></div>
     <div class="flex" style="gap:8px"><button class="btn ghost sm" onclick="togglePrivacyMode()">${privacyModeEnabled()?'👁️':'🙈'}</button><button class="btn ghost sm" onclick="renderProfit()">Rentabilité détaillée →</button></div></div>

   <div class="kpi-grid">
     <div class="kpi"><span>CA ce mois</span><b>${euro(S.caMonth)}</b><span>${evoBadge(S.evoMonth)} vs mois dernier</span></div>
     <div class="kpi"><span>CA cette année</span><b>${euro(S.caYear)}</b><span>${evoBadge(S.evoYear)} vs an dernier</span></div>
     <div class="kpi"><span>Marge brute</span><b>${euro(S.margeBrute)}</b><span>${S.tauxBrut}% du CA</span></div>
     <div class="kpi"><span>Marge nette</span><b style="color:${S.margeNette>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(S.margeNette)}</b><span>${S.tauxNet}% du CA</span></div>
     <div class="kpi"><span>Panier moyen</span><b>${euro(S.panier)}</b><span>${S.nbCmd} commande(s)</span></div>
     <div class="kpi"><span>Clients actifs</span><b>${S.activeClients}</b><span>sur ${S.totalClients} (90 j)</span></div>
   </div>

   ${S.serie.length?`<div class="panel"${privacyModeEnabled()?' style="filter:blur(6px);opacity:.45;pointer-events:none"':''}><h2>Évolution du CA encaissé</h2>${chart}</div>`:''}

   <div class="panel" style="border-left:4px solid var(--bordeaux)"><h2>💡 Recommandations</h2>
     ${recoCards||'<p class="note">Pas encore assez de données pour des recommandations. Enregistrez des ventes payées.</p>'}</div>

   <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
     <div class="panel"><h2>Produits les plus rentables</h2>${topProd||'<p class="note">—</p>'}</div>
     <div class="panel"><h2>Produits à revoir</h2>${lowProd||'<p class="note">—</p>'}</div>
     <div class="panel"><h2>Clients les plus rentables</h2>${topClients||'<p class="note">—</p>'}</div>
     <div class="panel"><h2>Événements les plus rentables</h2>${topEvents||'<p class="note">Aucun événement.</p>'}</div>
   </div>

   <div class="panel"><h2>Saisonnalité</h2>
     ${I.saison.length?`<p style="margin-bottom:6px">Meilleurs mois (CA encaissé moyen) : ${saison}</p>`:'<p class="note">Pas encore assez d\'historique pour dégager une saisonnalité.</p>'}</div>

   <p class="note" style="margin-top:8px">Centre de pilotage : tout est recalculé en temps réel depuis vos commandes, encaissements, charges et marchés clôturés. Le CA inclut les marchés ; les marges sont calculées sur les commandes (les marchés ont leur propre tableau de bord avec taux d'invendus). Marge nette = après charges sociales (12,3 % / 25,6 %).</p>`;
 } catch(err){ renderViewError('pilotage', err); }
}

/* ============================================================
   ANALYSE DE RENTABILITÉ — par client et par événement, avec échelle
   ============================================================ */
async function renderProfit(){
  const [orders, clients, recipes, recipeItems, lots] = await Promise.all([
    db.orders.toArray(), db.clients.toArray(), db.recipes.toArray(), db.recipeItems.toArray(), db.materialLots.toArray()
  ]);
  const clName=id=>(clients.find(c=>c.id===id)||{}).nom||'—';

  // marge par commande (toutes commandes confirmées)
  const withM = orders.map(o=>({o, m:computeOrderMargins(o, recipes, recipeItems, lots)}));

  // --- par client ---
  const byClient={};
  withM.forEach(({o,m})=>{
    const k=o.clientId||0;
    (byClient[k] ||= {clientId:k, nom:clName(k), ca:0, nb:0, brute:0, nette:0});
    const c=byClient[k]; c.ca=money2(c.ca+m.ca); c.nb++; c.brute=money2(c.brute+m.margeBrute); c.nette=money2(c.nette+m.margeNette);
  });
  const clientRows=Object.values(byClient).map(c=>{
    c.panier=c.nb>0?money2(c.ca/c.nb):0;
    c.tauxNet=c.ca>0?Math.round(c.nette/c.ca*1000)/10:0;
    c.scale=profitScale(c.tauxNet);
    return c;
  }).sort((a,b)=>b.ca-a.ca);

  // --- par événement ---
  const eventsM = withM.filter(({o})=>orderIsEvent(o)).map(({o,m})=>{
    const sc=profitScale(m.tauxNet);
    return {o, m, sc, nom:clName(o.clientId)};
  }).sort((a,b)=>b.m.ca-a.m.ca);

  const clientTable = clientRows.length?`<div class="table-wrap"><table><thead><tr><th>Client</th><th>CA</th><th>Cmd</th><th>Panier moy.</th><th>Marge nette</th><th>Rentabilité</th></tr></thead>
    <tbody>${clientRows.map(c=>`<tr>
      <td><b>${c.clientId?`<span class="link-name" onclick="clientForm(${c.clientId})">${esc(c.nom)}</span>`:esc(c.nom)}</b></td>
      <td>${euro(c.ca)}</td><td>${c.nb}</td><td>${euro(c.panier)}</td>
      <td style="color:${c.nette>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(c.nette)} <span style="color:#9a8a82;font-size:.72rem">(${c.tauxNet}%)</span></td>
      <td><span class="tag" style="background:${c.scale.col};color:#fff">${c.scale.label}</span></td></tr>`).join('')}</tbody></table></div>`
    :'<div class="empty">Aucune commande.</div>';

  const eventCards = eventsM.length?eventsM.map(({o,m,sc,nom})=>`<div class="panel" style="margin:8px 0;border-left:4px solid ${sc.col}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><b>${esc(nom)}</b> <span style="color:#9a8a82;font-size:.8rem">· n°${esc(orderNumber(o))} · ${fmtDate(o.date)}</span></div>
        <span class="tag" style="background:${sc.col};color:#fff">${sc.label}</span></div>
      <div class="sum-box"><span>Chiffre d'affaires</span><b>${euro(m.ca)}</b></div>
      <div class="sum-box"><span>Coût production (matières + emballages)</span><b>${euro(money2(m.coutMat+m.coutEmb))}</b></div>
      <div class="sum-box"><span>Marge brute</span><b>${euro(m.margeBrute)} <span style="color:#9a8a82;font-weight:400">(${m.tauxBrut}%)</span></b></div>
      <div class="sum-box"><span>Charges sociales</span><b>−${euro(m.chargesSociales)}</b></div>
      <div class="sum-box"><span><b>Marge nette</b></span><b style="color:${m.margeNette>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(m.margeNette)} (${m.tauxNet}%)</b></div>
    </div>`).join('')
    :'<p class="note">Aucune commande événementielle.</p>';

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Analyse de rentabilité</h1><p>Marge brute & nette · classement par rentabilité</p></div>
     <button class="btn ghost sm" onclick="settingsForm()">⚙ Paramètres</button></div>
   <div class="banner">📈 <div>Marge brute = prix de vente − matières − emballages. Marge nette = marge brute − charges sociales (${getSettings().socialGoods}% marchandise, ${getSettings().socialService}% prestation). L'échelle de rentabilité se base sur le taux de marge nette.</div></div>
   <div class="panel"><h2>Classement clients par rentabilité</h2>${clientTable}</div>
   <h2 style="font-family:'Fraunces',serif;color:var(--bordeaux);margin:18px 0 4px;font-size:1.2rem">Rentabilité par événement</h2>
   ${eventCards}`;
}

// Paramètres : taux de charges sociales + coûts d'emballage par taille de coffret.
function settingsForm(){
  const s=getSettings();
  openModal(`<h3>Paramètres de gestion</h3>
    <p class="note">Charges sociales appliquées au calcul de la marge nette.</p>
    <div class="row2">
      <div class="field"><label>Charges sociales — marchandise (%)</label><input type="number" step="0.1" id="set_sg" value="${s.socialGoods}"></div>
      <div class="field"><label>Charges sociales — prestation (%)</label><input type="number" step="0.1" id="set_ss" value="${s.socialService}"></div>
    </div>
    <p class="note" style="margin-top:8px">Coût emballage / consommables par coffret (€).</p>
    <div class="row2">
      ${BOX_SIZES.map(t=>`<div class="field"><label>Coffret ${t}</label><input type="number" step="0.01" id="set_pk_${t}" value="${s.packaging[t]!=null?s.packaging[t]:0}"></div>`).join('')}
    </div>
    <p class="note" style="margin-top:8px">Types d'emballage pour le comptage avant/après en marché (nom + coût unitaire €). Laissez le nom vide pour retirer une ligne.</p>
    <div id="set_pktypes">
      ${(s.packTypes||[]).concat([{nom:'',cout:''}]).map((t,i)=>`<div class="pay-row"><input id="set_pt_n_${i}" value="${esc(t.nom||'')}" placeholder="nom (ex: Boîte 6)" style="flex:1"><input type="number" step="0.01" min="0" id="set_pt_c_${i}" value="${t.cout!==''&&t.cout!=null?t.cout:''}" placeholder="€/u" style="width:90px"></div>`).join('')}
    </div>
    <input type="hidden" id="set_pt_n" value="${(s.packTypes||[]).length+1}">
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveSettingsForm()">Enregistrer</button></div>`);
}
function saveSettingsForm(){
  const s=getSettings();
  s.socialGoods=Math.max(0,+val('set_sg')||0);
  s.socialService=Math.max(0,+val('set_ss')||0);
  s.packaging={}; BOX_SIZES.forEach(t=>{ s.packaging[t]=money2(+val('set_pk_'+t)||0); });
  // types d'emballage (on lit toutes les lignes, on garde celles avec un nom)
  const n=+val('set_pt_n')||0; const pts=[];
  for(let i=0;i<n;i++){ const nom=(val('set_pt_n_'+i)||'').trim(); if(!nom) continue; pts.push({nom, cout:money2(+val('set_pt_c_'+i)||0)}); }
  s.packTypes=pts.length?pts:SETTINGS_DEFAULTS.packTypes;
  saveSettings(s);
  closeModal();
  if(view==='rentabilite') renderProfit(); else if(view==='compta') renderCompta(); else if(view==='marches') renderMarkets(); else toast('Paramètres enregistrés ✓');
  toast('Paramètres enregistrés ✓');
}

/* ============================================================
   MARCHÉS / VENTES ITINÉRANTES — écrans
   ============================================================ */
async function renderMarkets(){
  const markets=(await db.markets.toArray()).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const moves=await db.marketMoves.toArray();
  const movesByMarket={}; moves.forEach(mv=>{ (movesByMarket[mv.marketId] ||= []).push(mv); });
  const [recipes, recipeItems, lots] = await Promise.all([db.recipes.toArray(), db.recipeItems.toArray(), db.materialLots.toArray()]);
  const avgUnit = avgMacaronCost(recipes, recipeItems, lots);

  // tableau de bord global
  let caTotal=0, venduTotal=0, nbClos=0, sumInvendus=0, margeNetteTotal=0;
  const perMarket=markets.map(mk=>{ const T=marketTotals(mk, movesByMarket[mk.id]||[], avgUnit);
    if(mk.statut==='clos'){ caTotal=addMoney(caTotal,T.caTotal); venduTotal=round3(venduTotal+T.vendu); nbClos++; sumInvendus+=T.tauxInvendus; margeNetteTotal=addMoney(margeNetteTotal,T.margeNette); }
    return {mk,T}; });
  const caMoyen = nbClos>0?money2(caTotal/nbClos):0;
  const invMoyen = nbClos>0?Math.round(sumInvendus/nbClos*10)/10:0;

  const rows=perMarket.map(({mk,T})=>`<tr>
     <td>${fmtDate(mk.date)}</td>
     <td><b>${esc(mk.nom||'—')}</b><br><span style="color:#9a8a82;font-size:.75rem">${esc(mk.lieu||'')}</span></td>
     <td>${mk.statut==='clos'?`<span class="tag done">Clos</span>`:`<span class="tag todo">Ouvert</span>`}</td>
     <td>${mk.statut==='clos'?euro(T.caTotal):'—'}</td>
     <td>${T.vendu>0||mk.statut==='clos'?qty(T.vendu):'—'}</td>
     <td>${mk.statut==='clos'?T.tauxInvendus+'%':'—'}</td>
     <td style="text-align:right"><span class="act" onclick="marketDetail(${mk.id})">Ouvrir</span><span class="act del" onclick="delMarket(${mk.id})">Suppr.</span></td></tr>`).join('');

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Marchés</h1><p>${markets.length} marché(s) · ventes itinérantes</p></div>
     <div class="flex" style="gap:8px"><button class="btn ghost sm" onclick="renderMarketStats()">📊 Statistiques</button>
     <button class="btn" onclick="marketForm()">+ Nouveau marché</button></div></div>
   ${nbClos>0?`<div class="kpi-grid">
     <div class="kpi"><span>CA marchés (clos)</span><b>${euro(caTotal)}</b><span>${nbClos} marché(s)</span></div>
     <div class="kpi"><span>CA moyen / marché</span><b>${euro(caMoyen)}</b></div>
     <div class="kpi"><span>Marge nette marchés</span><b style="color:${margeNetteTotal>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(margeNetteTotal)}</b></div>
     <div class="kpi"><span>Macarons vendus</span><b>${qty(venduTotal)}</b></div>
     <div class="kpi"><span>Taux d'invendus moyen</span><b>${invMoyen}%</b></div>
   </div>`:''}
   <div class="panel">
   ${markets.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Marché</th><th>Statut</th><th>CA</th><th>Vendus</th><th>Invendus</th><th></th></tr></thead>
     <tbody>${rows}</tbody></table></div>`:`<div class="empty">Aucun marché. Créez une fiche avant votre prochain marché pour suivre stocks, ventes et performances.</div>`}
   </div>
   <div class="flex" style="gap:8px;margin-top:12px"><button class="btn ghost" onclick="renderMarketForecast()">🔮 Prévisions de production marché</button></div>`;
}

async function marketForm(id){
  const mk = id ? await db.markets.get(id) : {date:today(), statut:'ouvert'};
  openModal(`<h3>${id?'Modifier':'Nouveau'} marché</h3>
    <div class="field"><label>Nom du marché *</label><input id="mk_nom" value="${esc(mk.nom||'')}" placeholder="ex : Marché de Noël du Mans"></div>
    <div class="row2">
      <div class="field"><label>Date *</label><input type="date" id="mk_date" value="${esc(mk.date||today())}"></div>
      <div class="field"><label>Lieu</label><input id="mk_lieu" value="${esc(mk.lieu||'')}" placeholder="Place, ville"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Horaires</label><input id="mk_horaires" value="${esc(mk.horaires||'')}" placeholder="ex : 9h–18h"></div>
      <div class="field"><label>Durée (heures)</label><input type="number" step="0.5" min="0" id="mk_heures" value="${mk.heures||''}" placeholder="ex : 8"></div>
    </div>
    <div class="field"><label>Météo (optionnel)</label><input id="mk_meteo" value="${esc(mk.meteo||'')}" placeholder="ex : Ensoleillé, 18°C"></div>
    <div class="field"><label>Commentaires</label><textarea id="mk_notes" rows="2">${esc(mk.notes||'')}</textarea></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveMarket(${id||0})">Enregistrer</button></div>`);
}
async function saveMarket(id){
  const nom=val('mk_nom'), date=val('mk_date');
  if(!nom){ toast('Nom obligatoire'); return; }
  if(!date){ toast('Date obligatoire'); return; }
  const o={nom, date, lieu:val('mk_lieu'), horaires:val('mk_horaires'), heures:+val('mk_heures')||0,
    meteo:val('mk_meteo'), notes:val('mk_notes')};
  if(id){ await db.markets.update(id,o); }
  else { o.statut='ouvert'; o.ca={especes:0,cb:0,autre:0}; await db.markets.add(o); }
  closeModal(); renderMarkets(); toast('Marché enregistré ✓');
}
async function delMarket(id){
  if(!confirm('Supprimer ce marché et son historique ? Les invendus non retournés ne seront pas recrédités.')) return;
  await db.transaction('rw', db.markets, db.marketMoves, async()=>{
    await db.marketMoves.where('marketId').equals(id).delete();
    await db.markets.delete(id);
  });
  renderMarkets(); toast('Marché supprimé');
}

// Fiche détaillée d'un marché : sorties, dons/pertes, retours, CA, clôture.
async function marketDetail(id){
  const mk=await db.markets.get(id); if(!mk){ toast('Marché introuvable'); return; }
  const moves=await db.marketMoves.where('marketId').equals(id).toArray();
  const prods=await db.productions.toArray();
  const recipes=await db.recipes.toArray();
  const recipeItems=await db.recipeItems.toArray();
  const lots=await db.materialLots.toArray();
  const T=marketTotals(mk, moves, avgMacaronCost(recipes, recipeItems, lots));
  const recName=rid=>(recipes.find(r=>r.id===rid)||{}).produitNom||'—';
  const prodLabel=p=>`${recName(p.recipeId)} · lot ${p.lotProduction||p.id}`;

  const lineRows=T.lines.map(l=>{
    return `<tr ${l.incoherent?'style="background:#fdf3f2"':''}>
      <td>${esc(l.parfum||'(parfum ?)')}</td>
      <td>${qty(l.sortie)}</td><td>${qty(l.retour)}</td><td>${qty(addQty(l.don,l.perte))}</td>
      <td><b>${qty(l.vendu)}</b>${l.incoherent?' <span class="tag low">incohérent</span>':''}</td></tr>`;}).join('');

  const clos = mk.statut==='clos';
  openModal(`<h3>${esc(mk.nom)} <span style="font-weight:400;font-size:.8rem;color:#9a8a82">${fmtDate(mk.date)}${mk.lieu?' · '+esc(mk.lieu):''}</span></h3>
    ${mk.horaires||mk.meteo?`<p class="note">${esc(mk.horaires||'')}${mk.meteo?' · '+esc(mk.meteo):''}</p>`:''}
    ${!clos?`<div class="flex" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">
      <button class="btn gold sm" onclick="marketSortieForm(${id})">＋ Sortie stock</button>
      <button class="btn ghost sm" onclick="marketMoveForm(${id},'perte')">＋ Don / Perte / Casse</button>
      <button class="btn ghost sm" onclick="marketRetourForm(${id})">↩ Retour de marché</button>
    </div>`:''}
    <div class="table-wrap"><table><thead><tr><th>Parfum</th><th>Emb.</th><th>Ret.</th><th>Don/Perte</th><th>Vendu</th></tr></thead>
      <tbody>${lineRows||'<tr><td colspan="6" class="empty">Aucune sortie enregistrée.</td></tr>'}</tbody></table></div>
    <div class="sum-box"><span>Embarqué</span><b>${qty(T.embarque)}</b></div>
    <div class="sum-box"><span>Vendu</span><b>${qty(T.vendu)}</b></div>
    <div class="sum-box"><span>Retour / Don / Perte</span><b>${qty(T.retour)} / ${qty(T.don)} / ${qty(T.perte)}</b></div>
    ${clos?`<div class="sum-box"><span>CA encaissé</span><b>${euro(T.caTotal)}</b></div>
      <div class="sum-box"><span>Espèces / CB / Autre</span><b>${euro(T.caEspeces)} / ${euro(T.caCB)} / ${euro(T.caAutre)}</b></div>
      <div class="sum-box"><span>Répartition</span><b>CB ${T.pctCB}% · Espèces ${T.pctEspeces}%</b></div>
      <div class="sum-box"><span>Taux d'invendus / pertes</span><b>${T.tauxInvendus}% / ${T.tauxPerte}%</b></div>
      ${mk.heures>0?`<div class="sum-box"><span>CA / heure</span><b>${euro(T.caParHeure)}</b></div>`:''}
      <h3 style="font-size:.95rem;margin:12px 0 6px">Rentabilité</h3>
      <div class="sum-box"><span>Coût matières (${qty(T.vendu)} vendus)</span><b>−${euro(T.coutMat)}</b></div>
      <div class="sum-box"><span>Coût emballages (delta ${qty(T.pkgUsed)} u.)</span><b>−${euro(T.coutEmb)}</b></div>
      <div class="sum-box"><span>Marge brute</span><b>${euro(T.margeBrute)} <span style="color:#9a8a82;font-weight:400">(${T.tauxBrut}%)</span></b></div>
      <div class="sum-box"><span>Charges sociales (${getSettings().socialGoods}%)</span><b>−${euro(T.chargesSociales)}</b></div>
      <div class="sum-box"><span><b>Marge nette</b></span><b style="color:${T.margeNette>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(T.margeNette)} (${T.tauxNet}%)</b></div>
      <button class="btn ghost sm" style="margin-top:8px" onclick="marketPackagingForm(${id})">📦 Comptage emballages (avant/après)</button>`
     :`<button class="btn gold" style="width:100%;margin-top:10px" onclick="marketCloseForm(${id})">Clôturer le marché (saisir le CA)</button>`}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
      <button class="btn ghost" onclick="marketForm(${id})">Modifier la fiche</button></div>`);
}

// Sortie de stock : choix du lot + quantité (stock théorique affiché).
async function marketSortieForm(marketId){
  const stock=await stockFiniParParfum();
  if(!stock.length){ toast('Aucun stock fini disponible à l\'atelier'); return; }
  const rows=stock.map((s,i)=>`<div class="pay-row" style="align-items:center">
      <span style="flex:1;min-width:140px">${esc(s.parfum)} <span class="note">dispo ${qty(s.dispo)}</span></span>
      <input type="number" step="1" min="0" max="${s.dispo}" id="ms_${i}" data-parfum="${esc(s.parfum)}" data-dispo="${s.dispo}"
        placeholder="0" oninput="marketSortieClamp(${i})" style="width:90px">
    </div>`).join('');
  openModal(`<h3>Sortie de stock pour le marché</h3>
    <p class="note">Saisissez la quantité à embarquer par parfum. Vous ne pouvez pas dépasser le stock disponible. La répartition entre lots se fait automatiquement (du plus ancien au plus récent).</p>
    <div class="pay-row" style="font-weight:600;color:#9a8a82"><span style="flex:1;min-width:140px">Parfum</span><span style="width:90px">Quantité</span></div>
    ${rows}
    <input type="hidden" id="ms_n" value="${stock.length}">
    <div class="modal-actions"><button class="btn ghost" onclick="marketDetail(${marketId})">Retour</button>
      <button class="btn" onclick="marketDoSortie(${marketId})">Embarquer</button></div>`);
}
// borne la saisie au stock disponible du parfum
function marketSortieClamp(i){
  const el=document.getElementById('ms_'+i); if(!el) return;
  const dispo=+el.getAttribute('data-dispo')||0;
  let v=+el.value||0; if(v<0) v=0; if(v>dispo){ v=dispo; toast('Limité au stock disponible : '+qty(dispo)); }
  if(String(v)!==el.value) el.value=v?v:'';
}
async function marketDoSortie(marketId){
  const n=+val('ms_n')||0; let done=0, total=0;
  for(let i=0;i<n;i++){ const el=document.getElementById('ms_'+i); if(!el) continue;
    const q=+el.value||0; if(q<=0) continue;
    const parfum=el.getAttribute('data-parfum');
    try{ await marketAddSortieParfum(marketId, parfum, q); done++; total+=q; }
    catch(e){ toast(e.message||'Erreur sur '+parfum); }
  }
  if(done) toast(`${done} parfum(s) embarqué(s) · ${qty(total)} macarons ✓`); else toast('Aucune quantité saisie');
  marketDetail(marketId);
}

// Don / Perte / Casse — mouvement unique (exclu des ventes)
async function marketMoveForm(marketId, type){
  const moves=await db.marketMoves.where('marketId').equals(marketId).toArray();
  const lines=marketLineSummary(moves);
  if(!lines.length){ toast('Faites d\'abord une sortie de stock'); return; }
  const opts=lines.map(l=>{
    const restant=subQty(subQty(subQty(l.sortie,l.retour),l.don),l.perte);
    return `<option value="${l.productionId}" data-parfum="${esc(l.parfum)}">${esc(l.parfum||'(parfum ?)')} · embarqué ${qty(l.sortie)} · reste ${qty(restant)}</option>`;}).join('');
  openModal(`<h3>Don / Perte / Casse</h3>
    <p class="note">Mouvement non vendu (retiré des ventes). Précisez la raison.</p>
    <div class="field"><label>Parfum</label><select id="mv_prod">${opts}</select></div>
    <div class="field"><label>Quantité</label><input type="number" step="1" min="1" id="mv_qte" placeholder="0"></div>
    <div class="field"><label>Raison</label>
      <select id="mv_raison"><option value="Don">Don</option><option value="Perte">Perte</option><option value="Casse">Casse</option></select></div>
    <div class="field"><label>Détail (optionnel)</label><input id="mv_motif" placeholder="ex : dégustation, casse transport, chaleur…"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="marketDetail(${marketId})">Retour</button>
      <button class="btn" onclick="marketDoMove(${marketId})">Enregistrer</button></div>`);
}
async function marketDoMove(marketId){
  const sel=document.getElementById('mv_prod'); const pid=+sel.value;
  const parfum=sel.options[sel.selectedIndex].getAttribute('data-parfum');
  const qte=+val('mv_qte')||0; const raison=val('mv_raison')||'Perte'; const detail=val('mv_motif');
  const motif=(raison+(detail?' — '+detail:''));
  // un seul type interne 'perte' (don/casse inclus) : tout est exclu des ventes de façon homogène
  try{ await marketAddLoss(marketId, pid, qte, 'perte', parfum, motif); }catch(e){ toast(e.message||'Erreur'); return; }
  toast(raison+' enregistré ✓'); marketDetail(marketId);
}

// Retour de marché : saisie des invendus par lot (vendu recalculé).
async function marketRetourForm(marketId){
  const moves=await db.marketMoves.where('marketId').equals(marketId).toArray();
  const lines=marketLineSummary(moves).filter(l=>l.sortie>0);
  const prods=await db.productions.toArray();
  const recipes=await db.recipes.toArray();
  const recName=rid=>(recipes.find(r=>r.id===rid)||{}).produitNom||'—';
  if(!lines.length){ toast('Aucune sortie à retourner'); return; }
  const rows=lines.map((l,i)=>{
    const restant=subQty(subQty(subQty(l.sortie,l.retour),l.don),l.perte);
    const p=prods.find(x=>x.id===l.productionId);
    const fromFreezer = p && p.venuDuCongelateur;
    return `<div class="pay-row" style="flex-wrap:wrap;align-items:flex-start">
      <span style="flex:1;min-width:120px">${esc(l.parfum||'(parfum ?)')}<br><span class="note">embarqué ${qty(l.sortie)}, déjà retourné ${qty(l.retour)}${fromFreezer?' · ❄️ vient du congélo':''}</span></span>
      <input type="number" step="1" min="0" max="${restant}" id="mr_${i}" data-prod="${l.productionId}" data-parfum="${esc(l.parfum)}" data-freezer="${fromFreezer?1:0}" placeholder="invendus" style="width:80px">
      <select id="md_${i}" style="width:120px">
        <option value="frigo">🧊 Frigo</option>
        <option value="congelateur" ${fromFreezer?'disabled':''}>❄️ Congélateur${fromFreezer?' (interdit)':''}</option>
      </select>
    </div>`;}).join('');
  openModal(`<h3>Retour de marché</h3>
    <p class="note">Saisissez les invendus rapportés par parfum et leur destination. Ils sont recrédités au stock atelier. ⚠️ Un produit <b>issu du congélateur</b> ne peut pas y retourner (décongélation → recongélation interdite).</p>
    ${rows}
    <div class="modal-actions"><button class="btn ghost" onclick="marketDetail(${marketId})">Retour</button>
      <button class="btn" onclick="marketDoRetour(${marketId},${lines.length})">Valider les retours</button></div>`);
}
async function marketDoRetour(marketId, n){
  let done=0;
  for(let i=0;i<n;i++){ const el=document.getElementById('mr_'+i); if(!el) continue;
    const q=+el.value||0; if(q<=0) continue;
    const pid=+el.getAttribute('data-prod'); const parfum=el.getAttribute('data-parfum');
    const dest=(document.getElementById('md_'+i)||{}).value||'frigo';
    try{ await marketAddRetour(marketId, pid, q, parfum, dest); done++; }catch(e){ toast(e.message||'Erreur'); }
  }
  toast(done?`${done} retour(s) enregistré(s) ✓`:'Aucun retour saisi'); marketDetail(marketId);
}

// Clôture : saisie du CA par mode + contrôle de cohérence vs quantités vendues.
async function marketCloseForm(marketId){
  const mk=await db.markets.get(marketId);
  const moves=await db.marketMoves.where('marketId').equals(marketId).toArray();
  const T=marketTotals(mk, moves);
  openModal(`<h3>Clôture du marché</h3>
    <p class="note">Quantité vendue calculée : <b>${qty(T.vendu)}</b> macaron(s). Saisissez les encaissements par mode de paiement.</p>
    <div class="field"><label>Espèces (€)</label><input type="number" step="0.01" min="0" id="mc_esp" value="${(mk.ca&&mk.ca.especes)||''}"></div>
    <div class="field"><label>Carte bancaire (€)</label><input type="number" step="0.01" min="0" id="mc_cb" value="${(mk.ca&&mk.ca.cb)||''}"></div>
    <div class="field"><label>Autres (€) — optionnel</label><input type="number" step="0.01" min="0" id="mc_autre" value="${(mk.ca&&mk.ca.autre)||''}"></div>
    <div class="sum-box" id="mc_summary"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="marketDetail(${marketId})">Annuler</button>
      <button class="btn gold" onclick="marketDoClose(${marketId},${T.vendu})">Clôturer</button></div>`);
  ['mc_esp','mc_cb','mc_autre'].forEach(idf=>{ const el=document.getElementById(idf); if(el) el.oninput=()=>marketCloseSummary(T.vendu); });
  marketCloseSummary(T.vendu);
}
function marketCloseSummary(vendu){
  const esp=+(document.getElementById('mc_esp')?.value)||0, cb=+(document.getElementById('mc_cb')?.value)||0, au=+(document.getElementById('mc_autre')?.value)||0;
  const tot=addMoney(esp,cb,au); const box=document.getElementById('mc_summary'); if(!box) return;
  const ppu = vendu>0 ? money2(tot/vendu) : 0;
  // cohérence : prix moyen par macaron plausible entre 0,80 € et 5 € (sinon alerte)
  let warn='';
  if(vendu>0 && tot>0 && (ppu<0.8 || ppu>5)) warn=`<div style="color:var(--red,#b3261e);margin-top:4px">⚠ Prix moyen ${euro(ppu)}/macaron : écart inhabituel, vérifiez le CA ou les quantités.</div>`;
  if(vendu>0 && tot===0) warn=`<div style="color:var(--red,#b3261e);margin-top:4px">⚠ ${qty(vendu)} vendus mais 0 € encaissé.</div>`;
  box.innerHTML=`<div style="display:flex;justify-content:space-between"><span>Total encaissé</span><b>${euro(tot)}</b></div>
    <div style="display:flex;justify-content:space-between"><span>CB / Espèces</span><b>${tot>0?Math.round(cb/tot*100):0}% / ${tot>0?Math.round(esp/tot*100):0}%</b></div>
    ${vendu>0?`<div style="display:flex;justify-content:space-between"><span>Prix moyen / macaron</span><b>${euro(ppu)}</b></div>`:''}${warn}`;
}
async function marketDoClose(marketId, vendu){
  const esp=money2(+val('mc_esp')||0), cb=money2(+val('mc_cb')||0), au=money2(+val('mc_autre')||0);
  const tot=addMoney(esp,cb,au);
  if(tot<=0 && vendu>0){ if(!confirm('Aucun encaissement saisi alors que des ventes sont calculées. Clôturer quand même ?')) return; }
  await db.markets.update(marketId, {ca:{especes:esp,cb:cb,autre:au}, statut:'clos', dateCloture:today()});
  toast('Marché clôturé ✓'); marketDetail(marketId);
}

// Comptage des emballages avant/après le marché : le coût consommé = Σ((avant−après) × coût unitaire).
async function marketPackagingForm(marketId){
  const mk=await db.markets.get(marketId); if(!mk) return;
  const types=getSettings().packTypes||[];
  // initialise depuis l'existant ou les types paramétrés
  let pk = (mk.packaging && mk.packaging.length) ? mk.packaging
    : types.map(t=>({nom:t.nom, cost:+t.cout||0, before:'', after:''}));
  // fusionne d'éventuels nouveaux types paramétrés non encore présents
  types.forEach(t=>{ if(!pk.some(p=>p.nom===t.nom)) pk.push({nom:t.nom, cost:+t.cout||0, before:'', after:''}); });
  const rows = pk.map((p,i)=>`<div class="pay-row" style="flex-wrap:wrap;align-items:center">
      <span style="flex:1;min-width:130px">${esc(p.nom)} <span class="note">(${euro(p.cost)}/u)</span></span>
      <input type="number" step="1" min="0" id="pk_b_${i}" value="${p.before!==''&&p.before!=null?p.before:''}" placeholder="avant" style="width:80px">
      <input type="number" step="1" min="0" id="pk_a_${i}" value="${p.after!==''&&p.after!=null?p.after:''}" placeholder="après" style="width:80px">
    </div>`).join('');
  openModal(`<h3>Comptage emballages</h3>
    <p class="note">Saisissez le stock d'emballages embarqué (avant) et rapporté (après). Le coût consommé = (avant − après) × coût unitaire. Les types et coûts se règlent dans ⚙ Paramètres.</p>
    <div class="pay-row" style="font-weight:600;color:#9a8a82"><span style="flex:1;min-width:130px">Type</span><span style="width:80px">Avant</span><span style="width:80px">Après</span></div>
    ${rows||'<p class="note">Aucun type d\'emballage paramétré.</p>'}
    <input type="hidden" id="pk_n" value="${pk.length}">
    <div class="modal-actions"><button class="btn ghost" onclick="marketDetail(${marketId})">Retour</button>
      <button class="btn" onclick="marketDoPackaging(${marketId})">Enregistrer le comptage</button></div>`);
  // stocke les noms/coûts pour la sauvegarde
  window._pkDraft = pk;
}
async function marketDoPackaging(marketId){
  const pk=(window._pkDraft||[]).map((p,i)=>({
    nom:p.nom, cost:+p.cost||0,
    before: val('pk_b_'+i)!==''?(+val('pk_b_'+i)||0):'',
    after: val('pk_a_'+i)!==''?(+val('pk_a_'+i)||0):''
  }));
  // contrôle de cohérence : après ne doit pas dépasser avant
  for(const p of pk){ if(p.before!=='' && p.after!=='' && (+p.after)>(+p.before)){ toast(`« ${p.nom} » : le stock après (${p.after}) dépasse l'avant (${p.before}).`); return; } }
  await db.markets.update(marketId, {packaging:pk});
  window._pkDraft=null;
  toast('Comptage emballages enregistré ✓'); marketDetail(marketId);
}

// Tableau de bord statistique des marchés.
async function renderMarketStats(){
  const markets=(await db.markets.toArray()).filter(m=>m.statut==='clos');
  const moves=await db.marketMoves.toArray();
  const movesByMarket={}; moves.forEach(mv=>{ (movesByMarket[mv.marketId] ||= []).push(mv); });
  if(!markets.length){ document.getElementById('main').innerHTML=`<div class="topbar"><div><h1>Statistiques marchés</h1></div><button class="btn ghost sm" onclick="renderMarkets()">← Marchés</button></div><div class="panel"><div class="empty">Aucun marché clôturé. Clôturez un marché pour voir ses statistiques.</div></div>`; return; }

  const [recipes, recipeItems, lots] = await Promise.all([db.recipes.toArray(), db.recipeItems.toArray(), db.materialLots.toArray()]);
  const avgUnit = avgMacaronCost(recipes, recipeItems, lots);
  const data=markets.map(mk=>({mk, T:marketTotals(mk, movesByMarket[mk.id]||[], avgUnit)})).sort((a,b)=>(a.mk.date||'').localeCompare(b.mk.date||''));
  const caTotal=data.reduce((s,d)=>addMoney(s,d.T.caTotal),0);
  const margeNetteTot=data.reduce((s,d)=>addMoney(s,d.T.margeNette),0);
  const venduTotal=data.reduce((s,d)=>round3(s+d.T.vendu),0);
  const caMoyen=money2(caTotal/data.length);

  // CA par marché (classement)
  const ranking=data.slice().sort((a,b)=>b.T.caTotal-a.T.caTotal);
  const rankRows=ranking.map((d,i)=>`<div class="sum-box"><span>${i+1}. ${esc(d.mk.nom)} <span style="color:#9a8a82;font-size:.74rem">${fmtDate(d.mk.date)}</span></span><b>${euro(d.T.caTotal)}</b></div>`).join('');

  // CA par mois
  const byMonth={}; data.forEach(d=>{ const m=monthKey(d.mk.date); byMonth[m]=addMoney(byMonth[m]||0,d.T.caTotal); });
  const months=Object.keys(byMonth).sort();
  let chart=''; if(months.length) chart=lineChart([{name:'CA marchés', points:months.map((m,i)=>({x:i,y:byMonth[m]})), color:'#52252F'}], {zero:true, xlabel:i=>monthLabel(months[i]), fmt:v=>Math.round(v)+'€'});

  // parfums les + / - vendus (somme vendu par parfum)
  const byParfum={};
  data.forEach(d=>d.T.lines.forEach(l=>{ const k=l.parfum||'(?)'; byParfum[k]=round3((byParfum[k]||0)+l.vendu); }));
  const parfRank=Object.entries(byParfum).map(([k,v])=>({nom:k,v})).sort((a,b)=>b.v-a.v);
  const topParf=parfRank.slice(0,5).map(p=>`<div class="sum-box"><span>${esc(p.nom)}</span><b>${qty(p.v)}</b></div>`).join('');
  const lowParf=parfRank.slice(-3).reverse().map(p=>`<div class="sum-box"><span>${esc(p.nom)}</span><b>${qty(p.v)}</b></div>`).join('');

  // meilleures journées (CA/heure si dispo, sinon CA)
  const bestDays=data.slice().sort((a,b)=>(b.T.caParHeure||b.T.caTotal)-(a.T.caParHeure||a.T.caTotal)).slice(0,3)
    .map(d=>`<div class="sum-box"><span>${esc(d.mk.nom)} ${d.mk.heures?`<span style="color:#9a8a82;font-size:.74rem">${d.mk.heures}h</span>`:''}</span><b>${d.mk.heures?euro(d.T.caParHeure)+'/h':euro(d.T.caTotal)}</b></div>`).join('');

  const totEmb=data.reduce((s,d)=>s+d.T.embarque,0), totInv=data.reduce((s,d)=>s+d.T.retour+d.T.don+d.T.perte,0);
  const tauxInvGlobal=totEmb>0?Math.round(totInv/totEmb*1000)/10:0;

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Statistiques marchés</h1><p>${data.length} marché(s) clôturé(s)</p></div><button class="btn ghost sm" onclick="renderMarkets()">← Marchés</button></div>
   <div class="kpi-grid">
     <div class="kpi"><span>CA total marchés</span><b>${euro(caTotal)}</b></div>
     <div class="kpi"><span>CA moyen / marché</span><b>${euro(caMoyen)}</b></div>
     <div class="kpi"><span>Marge nette totale</span><b style="color:${margeNetteTot>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(margeNetteTot)}</b></div>
     <div class="kpi"><span>Macarons vendus</span><b>${qty(venduTotal)}</b></div>
     <div class="kpi"><span>Taux d'invendus global</span><b>${tauxInvGlobal}%</b></div>
   </div>
   ${months.length>1?`<div class="panel"><h2>CA marchés par mois</h2>${chart}</div>`:''}
   <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
     <div class="panel"><h2>Classement des marchés (CA)</h2>${rankRows}</div>
     <div class="panel"><h2>Meilleures journées (CA/h)</h2>${bestDays}</div>
     <div class="panel"><h2>Parfums les plus vendus</h2>${topParf||'<p class="note">—</p>'}</div>
     <div class="panel"><h2>Parfums les moins vendus</h2>${lowParf||'<p class="note">—</p>'}</div>
   </div>`;
}

// Prévisions : à partir de l'historique des marchés clos, suggérer quantités & répartition.
async function renderMarketForecast(){
  const markets=(await db.markets.toArray()).filter(m=>m.statut==='clos');
  const moves=await db.marketMoves.toArray();
  const movesByMarket={}; moves.forEach(mv=>{ (movesByMarket[mv.marketId] ||= []).push(mv); });
  document.getElementById('main').innerHTML=`<div class="topbar"><div><h1>Prévisions marché</h1><p>Basées sur ${markets.length} marché(s) clôturé(s)</p></div><button class="btn ghost sm" onclick="renderMarkets()">← Marchés</button></div><div id="mfBody"></div>`;
  const body=document.getElementById('mfBody');
  if(markets.length<1){ body.innerHTML=`<div class="panel"><div class="empty">Pas encore d'historique. Clôturez quelques marchés pour obtenir des suggestions de production.</div></div>`; return; }

  // moyennes par parfum : vendu moyen, invendu moyen
  const sumVendu={}, sumEmb={}; let nb=markets.length;
  markets.forEach(mk=>{ const T=marketTotals(mk, movesByMarket[mk.id]||[]);
    T.lines.forEach(l=>{ const k=l.parfum||'(?)'; sumVendu[k]=(sumVendu[k]||0)+l.vendu; sumEmb[k]=(sumEmb[k]||0)+l.sortie; }); });
  const parfums=Object.keys(sumVendu);
  const venduMoyenTotal=parfums.reduce((s,k)=>s+sumVendu[k]/nb,0);

  const rows=parfums.map(k=>{
    const vMoy=sumVendu[k]/nb, eMoy=sumEmb[k]/nb;
    const tauxEcoul = eMoy>0?vMoy/eMoy:0;
    // suggestion : viser le vendu moyen + marge de sécurité 15%, arrondi à 5
    const suggere=Math.ceil((vMoy*1.15)/5)*5;
    const part = venduMoyenTotal>0?Math.round(vMoy/venduMoyenTotal*100):0;
    let risque='';
    if(tauxEcoul>=0.9) risque='<span class="tag low">risque rupture</span>';
    else if(tauxEcoul>0 && tauxEcoul<0.5) risque='<span class="tag warn">risque invendus</span>';
    else risque='<span class="tag ok">équilibré</span>';
    return {k, vMoy:round3(vMoy), suggere, part, risque, tauxEcoul};
  }).sort((a,b)=>b.vMoy-a.vMoy);

  const totSuggere=rows.reduce((s,r)=>s+r.suggere,0);
  body.innerHTML=`
   <div class="banner">🔮 <div>Suggestions pour un marché similaire, calculées sur la moyenne de vos marchés passés (+15 % de sécurité). Total suggéré : <b>${totSuggere}</b> macarons.</div></div>
   <div class="panel"><h2>Quantités à produire & répartition par parfum</h2>
     <div class="table-wrap"><table><thead><tr><th>Parfum</th><th>Vendu moyen</th><th>Part</th><th>À produire</th><th>Risque</th></tr></thead>
       <tbody>${rows.map(r=>`<tr><td><b>${esc(r.k)}</b></td><td>${qty(r.vMoy)}</td><td>${r.part}%</td><td><b>${r.suggere}</b></td><td>${r.risque}</td></tr>`).join('')}</tbody></table></div>
     <p class="note">« Risque rupture » : tu écoulais presque tout (produis plus). « Risque invendus » : tu rapportais beaucoup (produis moins).</p>
   </div>`;
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

/* ============================================================
   ÉVÉNEMENTS & ACOMPTES — suivi dédié des commandes événementielles
   ============================================================ */
function orderIsEvent(o){ return orderToLines(o).some(ln=>ln.type==='evenement'); }
async function renderEvents(){
  const orders = await db.orders.toArray();
  const clients = await db.clients.toArray();
  const clName = id => (clients.find(c=>c.id===id)||{}).nom||'—';
  const events = orders.filter(orderIsEvent);

  // construit la fiche acompte de chaque événement
  const rows = events.map(o=>{
    const total = money2(o.montant);
    const paid = orderPaid(o);
    const solde = orderBalance(o);
    const st = orderPayStatus(o);
    const paiements = (o.paiements||[]).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    const acompte = paiements.length ? paiements[0] : null; // 1er versement = acompte
    return {o, clientNom:clName(o.clientId), total, paid, solde, st,
      acompteMontant: acompte?money2(acompte.montant):0,
      acompteDate: acompte?acompte.date:null,
      dateFinal: o.dateReglementFinal||'',
      nbPaiements: paiements.length};
  }).sort((a,b)=>(b.o.date||'').localeCompare(a.o.date||''));

  const soldes = rows.filter(r=>r.st==='Payé');
  const avecAcompte = rows.filter(r=>r.st==='Partiel');
  const aEncaisser = rows.filter(r=>r.st==='En attente');

  const card = r=>{
    const o=r.o;
    const stTag = r.st==='Payé'?'<span class="tag done">Soldé</span>'
      : r.st==='Partiel'?'<span class="tag event">Acompte versé</span>'
      : '<span class="tag todo">À encaisser</span>';
    const finalLate = r.dateFinal && r.st!=='Payé' && daysTo(r.dateFinal)!=null && daysTo(r.dateFinal)<0;
    return `<div class="panel" style="margin:8px 0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div><b>${o.clientId?`<span class="link-name" onclick="clientForm(${o.clientId})">${esc(r.clientNom)}</span>`:esc(r.clientNom)}</b>
          <span style="color:#9a8a82;font-size:.8rem"> · n°${esc(orderNumber(o))} · ${fmtDate(o.date)}</span></div>
        ${stTag}
      </div>
      <div class="sum-box"><span>Montant total</span><b>${euro(r.total)}</b></div>
      ${r.acompteMontant>0?`<div class="sum-box"><span>Acompte ${r.acompteDate?'· '+fmtDate(r.acompteDate):''}</span><b>${euro(r.acompteMontant)}</b></div>`:''}
      ${r.nbPaiements>1?`<div class="sum-box"><span>Total encaissé (${r.nbPaiements} versements)</span><b>${euro(r.paid)}</b></div>`:''}
      <div class="sum-box"><span><b>Solde restant dû</b></span><b style="color:${r.solde>0?'var(--red,#b3261e)':'#3f7d52'}">${euro(r.solde)}</b></div>
      ${r.st!=='Payé'?`<div class="sum-box"><span>Règlement final prévu</span><b ${finalLate?'style="color:var(--red,#b3261e)"':''}>${r.dateFinal?fmtDate(r.dateFinal)+(finalLate?' ⚠ dépassé':''):'— à définir —'}</b></div>`:''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
        <button class="btn ghost sm" onclick="cmdView(${o.id})">Détail</button>
        ${r.st!=='Payé'?`<button class="btn gold sm" onclick="markPaid(${o.id})">✓ Solder (${euro(r.solde)})</button>`:''}
        <button class="btn ghost sm" onclick="cmdForm(${o.id})">Modifier</button>
      </div>
    </div>`;
  };

  const section = (titre, list, emptyMsg, color) =>
    `<h2 style="font-family:'Fraunces',serif;color:${color||'var(--bordeaux)'};margin:18px 0 4px;font-size:1.2rem">${titre} <span style="font-weight:400;font-size:.85rem;color:#9a8a82">(${list.length})</span></h2>
     ${list.length?list.map(card).join(''):`<p class="note">${emptyMsg}</p>`}`;

  // totaux
  const totalAEncaisser = money2(avecAcompte.concat(aEncaisser).reduce((s,r)=>s+r.solde,0));

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Événements & acomptes</h1><p>${events.length} commande(s) événementielle(s)</p></div></div>
   <div class="banner">🎉 <div>Suivi dédié des prestations événementielles : montant total, acompte, solde restant dû et date de règlement final. ${totalAEncaisser>0?`<b>${euro(totalAEncaisser)}</b> restent à encaisser au total.`:'Tout est soldé.'}</div></div>
   ${events.length?
     section('À encaisser', aEncaisser, 'Aucun événement sans paiement.', 'var(--red,#b3261e)')+
     section('Avec acompte', avecAcompte, 'Aucun événement avec acompte partiel.', 'var(--caramel)')+
     section('Soldés', soldes, 'Aucun événement soldé pour l\'instant.', '#3f7d52')
     :`<div class="panel"><div class="empty">Aucune commande événementielle. Créez une commande avec une ligne « Événement » pour la suivre ici.</div></div>`}`;
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
  // rupture PRÉDICTIVE (rythme de ventes) : "quand", "combien de temps", "prévision", "tenir"
  if(/\b(rupture|stock|tenir|epuise|epuiser|tiendra|durera|reste)\b/.test(t)
     && /\b(quand|combien de temps|prevision|previsions|prevoir|rythme|vais|jusqu|tiendra|durera|tenir)\b/.test(t)){
    return {intent:'query_predict', params:{}, critical:false, label:'Prévoir les ruptures selon le rythme de ventes'};
  }
  // risque de rupture (immédiat : commandes + seuils)
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
   <div id="aiPredict"><div class="banner">📈 <div>Analyse du rythme de ventes en cours…</div></div></div>
   <div class="banner">🤖 <div>Écrivez ou dictez (micro du clavier) une instruction. L'assistant fonctionne <b>hors-ligne</b>. Toute action critique (création, suppression, ajustement) demande votre validation.</div></div>
   <div class="panel">
     <div class="field"><label>Votre demande</label>
       <textarea id="aiInput" rows="2" placeholder="ex : Quel est le stock de chocolat ? · Crée une commande pour M. Dupont vendredi · Affiche les commandes à préparer demain"></textarea>
     </div>
     <div class="flex" style="gap:8px"><button class="btn" onclick="aiRun()">Envoyer</button>
       <button class="btn ghost" onclick="document.getElementById('aiInput').value='';document.getElementById('aiOut').innerHTML='';">Effacer</button></div>
     <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
       ${['Quel est le stock de chocolat ?','Commandes à préparer demain','Quels clients commandent le plus de vanille ?','Chiffre d\'affaires','Quelles sont les tendances ?','Que faut-il produire ?','Quand vais-je être en rupture ?'].map(s=>`<button class="btn ghost sm" onclick="document.getElementById('aiInput').value=${JSON.stringify(s)};aiRun()">${esc(s)}</button>`).join('')}
     </div>
   </div>
   <div id="aiOut"></div>`;
  renderPredictiveAlerts();
}
// Affiche, en haut de l'assistant, les alertes de rupture PRÉDICTIVES (rythme de ventes).
async function renderPredictiveAlerts(){
  const box=document.getElementById('aiPredict'); if(!box) return;
  let v; try{ v=await computeSalesVelocity({months:3, horizonDays:14}); }catch(e){ box.innerHTML=''; return; }
  if(!v.hasData){
    box.innerHTML=`<div class="banner">📈 <div>Pas encore assez d'historique de ventes pour prédire les ruptures. Les prévisions apparaîtront après quelques semaines de commandes payées.</div></div>`;
    return;
  }
  if(!v.alertes.length){
    box.innerHTML=`<div class="banner" style="background:#eef6ee;border-color:#bcdcc0">✅ <div>Au rythme des ventes des ${v.lookbackMonths} derniers mois, aucun parfum ne devrait manquer dans les ${v.horizon} prochains jours.</div></div>`;
    return;
  }
  const rows=v.alertes.slice(0,8).map(a=>{
    const urgent = a.joursRestants<=7;
    return `<div class="sum-box"><span>${urgent?'🔴':'🟠'} <b>${esc(a.parfum)}</b> <span style="color:#9a8a82">— ${qty(a.perMonth)}/mois</span></span>
      <b style="color:${urgent?'var(--red,#b3261e)':'var(--caramel)'}">~${a.joursRestants} j${a.dateRupture?` · ${fmtDate(a.dateRupture)}`:''}</b></div>`;
  }).join('');
  box.innerHTML=`<div class="banner" style="background:#fdf3f2;border-color:#f0c9c4;flex-direction:column;align-items:stretch">
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">⚠ <b>Ruptures prévues (rythme des ${v.lookbackMonths} derniers mois)</b></div>
    ${rows}
    <p class="note" style="margin-top:6px">Estimation basée sur la vélocité de vente moyenne et le stock fini actuel. Pensez à planifier une production.</p>
  </div>`;
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
    case 'query_predict': return aiQueryPredict();
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
// Réponse PRÉDICTIVE : jours avant rupture par parfum, selon le rythme de ventes.
async function aiQueryPredict(){
  const v=await computeSalesVelocity({months:3, horizonDays:14});
  if(!v.hasData) return aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">Prévision de rupture</h3><p class="note">Pas encore assez d'historique de ventes payées pour estimer un rythme. Reviens après quelques semaines de commandes.</p>`);
  const withPrev = v.lignes.filter(l=>l.joursRestants!=null);
  if(!withPrev.length) return aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">Prévision de rupture</h3><p class="note">Aucune vente récente sur les parfums en stock : impossible d'estimer une vélocité.</p>`);
  const rows=withPrev.slice(0,15).map(l=>{
    const col = l.alerte ? (l.joursRestants<=7?'var(--red,#b3261e)':'var(--caramel)') : '#3f7d52';
    return `<div class="sum-box"><span><b>${esc(l.parfum)}</b> <span style="color:#9a8a82">— stock ${qty(l.stock)} · ${qty(l.perMonth)}/mois</span></span>
      <b style="color:${col}">~${l.joursRestants} j${l.dateRupture?` · ${fmtDate(l.dateRupture)}`:''}</b></div>`;
  }).join('');
  aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">Prévision de rupture <span style="font-weight:400;font-size:.78rem;color:#9a8a82">— rythme des ${v.lookbackMonths} derniers mois</span></h3>
    ${rows}
    <p class="note" style="margin-top:6px">Jours estimés avant épuisement = stock fini actuel ÷ vélocité de vente moyenne. À planifier en production.</p>`);
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
      for(const l of actifs){ if(reste<=0)break; const pris=round3(Math.min(reste,+l.qteRestante)); await db.materialLots.update(l.id,{qteRestante: subQty(l.qteRestante,pris)}); reste=subQty(reste,pris); }
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
  // commandes ayant des batchs liés (pour l'impression par commande)
  const oitems = await db.orderItems.toArray();
  const linkedOrderIds = [...new Set(oitems.map(it=>it.orderId))];
  const orders = (await db.orders.toArray()).filter(o=>linkedOrderIds.includes(o.id))
    .sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const clients = await db.clients.toArray();
  const clName = id => (clients.find(c=>c.id===id)||{}).nom||'—';
  const linkCount = id => oitems.filter(it=>it.orderId===id).length;

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Étiquettes</h1><p>Format thermique 50 × 30 mm — Phomemo D520BT (AirPrint)</p></div></div>
   <div class="banner">▤ <div>Étiquettes noir sur blanc, sans décoration, optimisées pour l'impression thermique. Chaque étiquette porte : produit, lot, DLC, date, et le QR de traçabilité. Choisis un nombre de copies pour imprimer en lot, ou imprime toutes les étiquettes d'une commande.</div></div>

   ${orders.length?`<div class="panel"><h2>Imprimer les étiquettes d'une commande</h2>
     <div class="table-wrap"><table><thead><tr><th>Date</th><th>Client</th><th>Batchs liés</th><th></th></tr></thead><tbody>
       ${orders.map(o=>`<tr><td>${fmtDate(o.date)}</td><td><b>${esc(clName(o.clientId))}</b></td><td>${linkCount(o.id)}</td>
         <td style="text-align:right">
           <span class="act" onclick="printOrderLabels(${o.id},'perLink')">1 / produit</span>
           <span class="act" onclick="printOrderLabels(${o.id},'perPiece')">1 / pièce</span></td></tr>`).join('')}
     </tbody></table></div>
     <p class="note">« 1 / produit » : une étiquette par batch lié. « 1 / pièce » : autant d'étiquettes que de pièces commandées.</p>
   </div>`:''}

   <div class="panel"><h2>Par batch de production</h2>
   ${prods.length?`<div class="labels-grid" id="labelsGrid">
     ${prods.map(p=>`<div class="label" data-prod="${p.id}">
        <div class="qr"><canvas data-lot="${esc(p.lotProduction||'')}"></canvas></div>
        <div class="info">
          <b>${esc(recName(p.recipeId))}</b>
          <span class="meta">Lot : ${esc(p.lotProduction||'—')}</span>
          <span class="meta">DLC : ${p.dlcProduit?fmtDate(p.dlcProduit):'— à compléter —'}</span>
          <span class="meta">Fab. : ${fmtDate(p.date)}</span>
        </div>
        <div class="label-actions">
          <label class="copies">Copies <input type="number" id="lblCopies_${p.id}" min="1" max="200" value="1"></label>
          <button class="btn ghost sm" onclick="printLabelCopies(${p.id})">⎙ Imprimer</button>
        </div>
     </div>`).join('')}
   </div>`:`<div class="empty">Aucun batch produit. Lance une production pour générer ses étiquettes.</div>`}
   </div>`;
  document.querySelectorAll('#labelsGrid canvas').forEach(cv=>{
    const lot = cv.getAttribute('data-lot');
    try{ QR.render(cv, traceUrl(lot), {scale:4, dark:'#000000', light:'#ffffff'}); }
    catch(e){ console.error('QR',e); }
  });
}

/* ============================================================
   IMPRESSION D'ÉTIQUETTES THERMIQUES 50×30 mm via AirPrint
   Architecture : buildLabelData (données) → renderLabelHTML (1 étiquette)
   → printLabelSheet (feuille de N étiquettes, 1 par page 50×30).
   Web Bluetooth volontairement écarté : non supporté par Safari iOS.
   Un backend Bluetooth/ESC-POS pourra se brancher ici plus tard (Android/desktop).
   ============================================================ */
// Prépare les données d'étiquette d'un batch de production.
async function buildLabelData(prodId){
  const p = await db.productions.get(prodId);
  if(!p) return null;
  const rec = await db.recipes.get(p.recipeId);
  const tmp = document.createElement('canvas');
  try{ QR.render(tmp, traceUrl(p.lotProduction||''), {scale:6, dark:'#000000', light:'#ffffff'}); }catch(e){}
  return {
    produit: rec?rec.produitNom:'Produit',
    lot: p.lotProduction||'—',
    dlc: p.dlcProduit ? fmtDate(p.dlcProduit) : '—',
    // Fabrication : horodatage automatique (date + heure) si disponible, sinon la date saisie
    fab: p.prodTimestamp ? fmtDateTime(p.prodTimestamp) : fmtDate(p.date),
    emplacement: p.emplacement==='congelateur'?'Congélateur':(p.emplacement==='frigo'?'Frigo':''),
    qr: tmp.toDataURL('image/png')
  };
}
// HTML d'UNE étiquette (50×30 mm, noir sur blanc, sans décoration).
function renderLabelHTML(d){
  return `<div class="lab">
     <div class="q"><img src="${d.qr}"></div>
     <div class="t">
       <div class="prod">${esc(d.produit)}</div>
       <div class="row">Lot : ${esc(d.lot)}</div>
       <div class="dlc">DLC : ${esc(d.dlc)}</div>
       <div class="row">Fab. : ${esc(d.fab)}</div>
     </div>
   </div>`;
}
// Ouvre une fenêtre d'impression contenant une feuille de plusieurs étiquettes.
// `labels` = tableau de données d'étiquette (déjà multiplié par le nombre de copies).
function printLabelSheet(labels, titre){
  if(!labels || !labels.length){ toast('Aucune étiquette à imprimer'); return; }
  const win = window.open('', '_blank', 'width=420,height=320');
  if(!win){ toast('Autorise les fenêtres pour imprimer'); return; }
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(titre||'Étiquettes')}</title>
   <style>
     @page { size: 50mm 30mm; margin: 0; }
     * { margin:0; padding:0; box-sizing:border-box; }
     html,body { background:#fff; }
     .lab { width:50mm; height:30mm; background:#fff; color:#000; padding:1.5mm;
            font-family:Arial,Helvetica,sans-serif; display:flex; gap:1.5mm; align-items:center;
            page-break-after:always; break-after:page; }
     .lab:last-child { page-break-after:auto; break-after:auto; }
     .lab .q { width:16mm; height:16mm; flex-shrink:0; }
     .lab .q img { width:16mm; height:16mm; display:block; image-rendering:pixelated; }
     .lab .t { flex:1; min-width:0; line-height:1.2; }
     .lab .prod { font-size:3mm; font-weight:bold; }
     .lab .row { font-size:2.5mm; }
     .lab .dlc { font-size:2.8mm; font-weight:bold; }
   </style></head><body>
   ${labels.map(renderLabelHTML).join('')}
   <script>window.onload=function(){setTimeout(function(){window.print();},300);};window.onafterprint=function(){window.close();};<\/script>
   </body></html>`);
  win.document.close();
}
// Impression d'une étiquette unique (compat. bouton existant).
async function printLabel(prodId){
  const d = await buildLabelData(prodId);
  if(!d){ toast('Batch introuvable'); return; }
  printLabelSheet([d], 'Étiquette '+d.lot);
}
// Impression EN LOT : N copies d'un même batch.
async function printLabelCopies(prodId){
  const n = Math.max(1, Math.min(200, +(document.getElementById('lblCopies_'+prodId)?.value)||1));
  const d = await buildLabelData(prodId);
  if(!d){ toast('Batch introuvable'); return; }
  const sheet=[]; for(let i=0;i<n;i++) sheet.push(d);
  printLabelSheet(sheet, `${n} étiquette(s) — ${d.lot}`);
  toast(`${n} étiquette(s) envoyée(s) à l'impression`);
}
// Impression des étiquettes liées à UNE commande : un batch par produit lié,
// nombre d'étiquettes = quantité de pièces liées (ou 1 par lien selon le choix).
async function printOrderLabels(orderId, mode){
  const links = await db.orderItems.where('orderId').equals(orderId).toArray();
  if(!links.length){ toast('Aucun batch lié à cette commande. Liez d\'abord des batchs.'); return; }
  const sheet=[];
  for(const it of links){
    const d = await buildLabelData(it.productionId);
    if(!d) continue;
    const n = (mode==='perPiece') ? Math.max(1, Math.round(+it.qte||1)) : 1;
    for(let i=0;i<n;i++) sheet.push(d);
  }
  if(!sheet.length){ toast('Batchs liés introuvables'); return; }
  printLabelSheet(sheet, 'Étiquettes commande #'+orderId);
  toast(`${sheet.length} étiquette(s) envoyée(s) à l'impression`);
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


const TABLES = ['suppliers','materials','materialLots','recipes','recipeItems','productions','prodConsumption','clients','orders','orderItems','events','products','charges','markets','marketMoves'];
const BACKUP_VERSION = 2;
const MAX_BACKUPS = 20; // historique conservé en base (les plus anciens sont purgés)

// ---- Construction d'un instantané structuré ----
async function buildDump(){
  const dump={_app:'sensations-macarons',_version:BACKUP_VERSION,_date:new Date().toISOString()};
  for(const t of TABLES) dump[t]=await db.table(t).toArray();
  dump._checksum = backupChecksum(dump);
  return dump;
}
// Somme de contrôle simple et déterministe (hash 32 bits, type DJB2) sur les données (hors méta).
function backupChecksum(dump){
  let str='';
  for(const t of TABLES){ str += t+':'+JSON.stringify(dump[t]||[])+';'; }
  let h=5381;
  for(let i=0;i<str.length;i++){ h=((h<<5)+h+str.charCodeAt(i))|0; }
  return (h>>>0).toString(16); // non signé, hexadécimal
}
// Compte total d'enregistrements d'un dump.
function dumpRecordCount(dump){ return TABLES.reduce((s,t)=>s+(Array.isArray(dump[t])?dump[t].length:0),0); }

// ---- Vérification d'intégrité d'une sauvegarde ----
// Retourne {ok, raisons:[], checksumOk, structureOk, counts}
function verifyBackup(dump){
  const raisons=[];
  if(!dump || typeof dump!=='object'){ return {ok:false, raisons:['Fichier illisible.'], checksumOk:false, structureOk:false}; }
  const structureOk = dump._app==='sensations-macarons' || TABLES.some(t=>Array.isArray(dump[t]));
  if(!structureOk) raisons.push("Ce fichier n'a pas la structure d'une sauvegarde Sensations Macarons.");
  // chaque table présente doit être un tableau
  TABLES.forEach(t=>{ if(dump[t]!=null && !Array.isArray(dump[t])) raisons.push(`La table « ${t} » est corrompue (format inattendu).`); });
  // contrôle de cohérence référentielle légère
  if(Array.isArray(dump.orders) && Array.isArray(dump.clients)){
    const ids=new Set(dump.clients.map(c=>c.id));
    const orphelins=dump.orders.filter(o=>o.clientId && !ids.has(o.clientId)).length;
    if(orphelins>0) raisons.push(`${orphelins} commande(s) référencent un client absent.`);
  }
  // somme de contrôle (si présente)
  let checksumOk=true;
  if(dump._checksum){
    const recomputed=backupChecksum(dump);
    checksumOk = recomputed===dump._checksum;
    if(!checksumOk) raisons.push('La somme de contrôle ne correspond pas : la sauvegarde a peut-être été modifiée ou tronquée.');
  }
  // une sauvegarde sans aucune table de données est suspecte
  const total=dumpRecordCount(dump);
  return {ok: structureOk && checksumOk && !raisons.some(r=>r.includes('corrompue')), raisons, checksumOk, structureOk, total};
}

// ---- FUSION d'un dump (AJOUT sans écrasement) ----
// Ajoute les enregistrements d'un dump à la base existante, sans rien effacer.
// Les ID entrants sont ré-attribués automatiquement pour éviter toute collision,
// et les clés étrangères internes au dump sont remappées (clientId, marketId, recipeId, etc.).
// Retourne un récapitulatif {table:nbAjouté}.
async function mergeDump(dump){
  const added={};
  // ordre d'insertion : les "parents" d'abord pour pouvoir remapper les enfants
  const order=['suppliers','materials','clients','recipes','products','events',
               'materialLots','recipeItems','productions','prodConsumption',
               'orders','orderItems','charges','markets','marketMoves'];
  const idMap={}; order.forEach(t=>idMap[t]={}); // old id -> new id, par table
  // table parent d'une clé étrangère donnée
  const FK={
    materialLots:{materialId:'materials', supplierId:'suppliers'},
    recipeItems:{recipeId:'recipes', materialId:'materials'},
    productions:{recipeId:'recipes'},
    prodConsumption:{productionId:'productions', materialLotId:'materialLots'},
    orders:{clientId:'clients'},
    orderItems:{orderId:'orders', productionId:'productions'},
    marketMoves:{marketId:'markets', productionId:'productions'}
  };
  await db.transaction('rw',...order.map(t=>db.table(t)),async()=>{
    for(const t of order){
      const rows=dump[t]; if(!Array.isArray(rows)||!rows.length) continue;
      let n=0;
      for(const row of rows){
        const rec=Object.assign({},row);
        const oldId=rec.id; delete rec.id;             // laisse IndexedDB attribuer un nouvel id
        // remap des clés étrangères internes au dump
        const fk=FK[t]||{};
        for(const field in fk){
          const parentTable=fk[field];
          const oldRef=rec[field];
          if(oldRef!=null && idMap[parentTable] && idMap[parentTable][oldRef]!=null){
            rec[field]=idMap[parentTable][oldRef]; // référence remappée vers le nouvel id
          }
          // si la référence ne correspond à rien d'importé, on la laisse telle quelle
          // (ex : marketMoves.productionId sans lot → l'affichage retombe sur le nom du parfum)
        }
        const newId=await db.table(t).add(rec);
        if(oldId!=null) idMap[t][oldId]=newId;
        n++;
      }
      added[t]=n;
    }
  });
  return added;
}

// ---- Application d'un dump à la base (remplacement atomique) ----
async function applyDump(dump){
  await db.transaction('rw',...TABLES.map(t=>db.table(t)),async()=>{
    for(const t of TABLES){
      await db.table(t).clear();
      if(Array.isArray(dump[t]) && dump[t].length) await db.table(t).bulkAdd(dump[t]);
    }
  });
}

// ---- EXPORT MANUEL (fichier .json téléchargé) ----
async function exportData(){
  const dump=await buildDump();
  const blob=new Blob([JSON.stringify(dump,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='sensations-macarons-sauvegarde-'+today()+'.json'; a.click();
  localStorage.setItem('sm_lastExport', today());
  toast('Sauvegarde téléchargée ✓');
}
// ---- IMPORT MANUEL (depuis un fichier .json) ----
async function importData(e){
  const f=e.target.files[0]; if(!f)return;
  let obj;
  try{ obj = JSON.parse(await f.text()); }
  catch(err){ toast('Fichier illisible (JSON invalide)'); e.target.value=''; return; }
  const v=verifyBackup(obj);
  if(!v.structureOk){ toast('Ce fichier n\'est pas une sauvegarde valide'); e.target.value=''; return; }
  const nbOrders = Array.isArray(obj.orders)?obj.orders.length:0;
  const nbClients = Array.isArray(obj.clients)?obj.clients.length:0;
  const dateInfo = obj._date ? `\nSauvegarde du ${new Date(obj._date).toLocaleString('fr-FR')}` : '';
  const warn = v.raisons.length ? `\n\n⚠ Avertissement(s) :\n- ${v.raisons.join('\n- ')}` : '\n\n✓ Intégrité vérifiée.';
  if(!confirm(`Importer cette sauvegarde ?${dateInfo}\n\n• ${nbClients} client(s)\n• ${nbOrders} commande(s)${warn}\n\nToutes les données actuelles seront remplacées (une sauvegarde de sécurité sera prise avant).`)){
    e.target.value=''; return;
  }
  try{
    await snapshotBackup('avant-import'); // filet de sécurité avant écrasement
    await applyDump(obj);
    render(); toast('Données importées ✓');
  }catch(err){ console.error('import',err); toast('Erreur pendant l\'import'); }
  e.target.value='';
}

// ---- IMPORT FUSION (ajoute sans écraser) ----
async function importDataMerge(e){
  const f=e.target.files[0]; if(!f)return;
  let obj;
  try{ obj = JSON.parse(await f.text()); }
  catch(err){ toast('Fichier illisible (JSON invalide)'); e.target.value=''; return; }
  const v=verifyBackup(obj);
  if(!v.structureOk){ toast('Ce fichier n\'est pas un fichier Sensations Macarons valide'); e.target.value=''; return; }
  // récapitulatif de ce qui sera ajouté
  const parts=[];
  TABLES.forEach(t=>{ const n=Array.isArray(obj[t])?obj[t].length:0; if(n>0){
    const labels={clients:'client(s)',orders:'commande(s)',markets:'marché(s)',marketMoves:'mouvement(s) marché',charges:'charge(s)',productions:'production(s)',recipes:'recette(s)',materials:'matière(s)',materialLots:'lot(s) matière',products:'produit(s) catalogue',events:'événement(s)'};
    parts.push(`• ${n} ${labels[t]||t}`); } });
  const dateInfo = obj._date ? `\nFichier du ${new Date(obj._date).toLocaleString('fr-FR')}` : '';
  if(!confirm(`Fusionner ce fichier avec vos données ?${dateInfo}\n\nCe contenu sera AJOUTÉ (rien ne sera effacé) :\n${parts.join('\n')||'• (aucune donnée détectée)'}\n\nUne sauvegarde de sécurité sera prise avant.`)){
    e.target.value=''; return;
  }
  try{
    await snapshotBackup('avant-fusion');
    const added=await mergeDump(obj);
    const tot=Object.values(added).reduce((s,n)=>s+n,0);
    render(); toast(`Fusion réussie : ${tot} enregistrement(s) ajouté(s) ✓`);
  }catch(err){ console.error('merge',err); toast('Erreur pendant la fusion'); }
  e.target.value='';
}
// Enregistre un instantané JSON complet + checksum dans la table backups, puis purge les plus anciens.
async function snapshotBackup(type){
  const dump=await buildDump();
  const payload=JSON.stringify(dump);
  const rec={ date:new Date().toISOString(), type:type||'manuel',
    checksum:dump._checksum, count:dumpRecordCount(dump), size:payload.length, payload };
  const id=await db.backups.add(rec);
  // purge : ne conserver que les MAX_BACKUPS plus récents
  const all=await db.backups.orderBy('date').reverse().toArray();
  if(all.length>MAX_BACKUPS){
    const surplus=all.slice(MAX_BACKUPS).map(b=>b.id);
    await db.backups.bulkDelete(surplus);
  }
  return id;
}
// Sauvegarde automatique quotidienne (au démarrage, une fois par jour).
async function autoDailyBackup(){
  try{
    if(localStorage.getItem('sm_autoBackupDate')===today()) return;
    // ne pas sauvegarder une base vide (premier lancement)
    const n=await db.clients.count()+await db.orders.count()+await db.materials.count();
    if(n===0){ localStorage.setItem('sm_autoBackupDate', today()); return; }
    await snapshotBackup('auto-quotidienne');
    localStorage.setItem('sm_autoBackupDate', today());
  }catch(e){ console.error('autoBackup',e); }
}
// Restaure une sauvegarde de l'historique interne (avec filet de sécurité).
async function restoreBackup(id){
  const b=await db.backups.get(id); if(!b){ toast('Sauvegarde introuvable'); return; }
  let dump; try{ dump=JSON.parse(b.payload); }catch(e){ toast('Sauvegarde corrompue (illisible)'); return; }
  const v=verifyBackup(dump);
  const warn = v.raisons.length ? `\n\n⚠ ${v.raisons.join(' ')}` : '\n\n✓ Intégrité vérifiée.';
  if(!confirm(`Restaurer la sauvegarde du ${new Date(b.date).toLocaleString('fr-FR')} ?\n\n• ${b.count} enregistrement(s)${warn}\n\nL'état actuel sera remplacé (une sauvegarde de sécurité est prise avant).`)) return;
  try{
    await snapshotBackup('avant-restauration');
    await applyDump(dump);
    closeModal(); render(); toast('Sauvegarde restaurée ✓');
  }catch(e){ console.error('restore',e); toast('Erreur pendant la restauration'); }
}
// Télécharge une sauvegarde de l'historique en .json (pour la mettre à l'abri hors appareil).
async function downloadBackup(id){
  const b=await db.backups.get(id); if(!b) return;
  const blob=new Blob([b.payload],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='sensations-sauvegarde-'+b.date.slice(0,10)+'-'+id+'.json'; a.click();
  toast('Sauvegarde téléchargée ✓');
}
async function deleteBackup(id){
  if(!confirm('Supprimer cette sauvegarde de l\'historique ?')) return;
  await db.backups.delete(id); renderBackups(); toast('Supprimée');
}

// ---- ÉCRAN SAUVEGARDE & SÉCURITÉ ----
async function renderBackups(){
  const backups = await db.backups.orderBy('date').reverse().toArray();
  const lastExport = localStorage.getItem('sm_lastExport');
  const dExp = lastExport ? daysTo(lastExport) : null;
  const expWarn = (!lastExport || (dExp!==null && dExp<=-7));
  const typeLabel = t => ({'auto-quotidienne':'Auto (quotidienne)','manuel':'Manuelle','avant-import':'Avant import','avant-restauration':'Avant restauration','avant-reparation':'Avant réparation'}[t]||t||'—');
  const rows = backups.map(b=>{
    let integ='—';
    try{ const d=JSON.parse(b.payload); const v=verifyBackup(d); integ = v.ok ? '<span class="tag ok">vérifiée</span>' : '<span class="tag low">à vérifier</span>'; }
    catch(e){ integ='<span class="tag low">illisible</span>'; }
    const ko = Math.round((b.size||0)/1024);
    return `<tr>
      <td>${new Date(b.date).toLocaleString('fr-FR')}</td>
      <td><span class="tag ${b.type==='auto-quotidienne'?'ok':'warn'}">${typeLabel(b.type)}</span></td>
      <td>${b.count||0} enr.</td><td>${ko} Ko</td><td>${integ}</td>
      <td style="text-align:right">
        <span class="act" onclick="restoreBackup(${b.id})">Restaurer</span>
        <span class="act" onclick="downloadBackup(${b.id})">Télécharger</span>
        <span class="act del" onclick="deleteBackup(${b.id})">Suppr.</span></td></tr>`;
  }).join('');

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Sauvegarde & sécurité</h1><p>${backups.length} sauvegarde(s) dans l'historique · max ${MAX_BACKUPS}</p></div></div>
   ${expWarn?`<div class="banner" style="background:#fdf3f2;border-color:#f0c9c4">⚠ <div>${lastExport?`Dernier export manuel il y a ${Math.abs(dExp)} jour(s).`:'Aucun export manuel hors appareil pour le moment.'} Pensez à télécharger une sauvegarde et à la conserver ailleurs (e-mail, cloud) : iOS peut purger les données de l'app.</div></div>`:''}
   <div class="panel"><h2>Actions</h2>
     <div class="flex" style="flex-wrap:wrap;gap:8px">
       <button class="btn gold" onclick="snapshotBackup('manuel').then(()=>{renderBackups();toast('Sauvegarde créée ✓');})">＋ Sauvegarder maintenant</button>
       <button class="btn" onclick="exportData()">⬇ Exporter (.json)</button>
       <label class="btn ghost" style="cursor:pointer">⬆ Importer (.json)<input type="file" accept="application/json,.json" style="display:none" onchange="importData(event)"></label>
       <label class="btn ghost" style="cursor:pointer">➕ Importer en fusion (.json)<input type="file" accept="application/json,.json" style="display:none" onchange="importDataMerge(event)"></label>
       <button class="btn ghost" onclick="runConsistencyCheck(true)">🔍 Vérifier l'intégrité</button>
     </div>
     <p class="note">L'import « Importer » <b>remplace</b> tout ; l'import « en fusion » <b>ajoute</b> sans rien effacer (idéal pour intégrer un fichier de saisies préparé à part). La sauvegarde automatique se déclenche une fois par jour à l'ouverture.</p>
   </div>
   <div class="panel"><h2>Historique des sauvegardes</h2>
   ${backups.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Contenu</th><th>Taille</th><th>Intégrité</th><th></th></tr></thead>
     <tbody>${rows}</tbody></table></div>`:`<div class="empty">Aucune sauvegarde encore. Cliquez sur « Sauvegarder maintenant » ou attendez la sauvegarde automatique.</div>`}
   </div>`;
}

// ---- CONTRÔLE DE COHÉRENCE AU DÉMARRAGE ----
// Détecte une base corrompue / incohérente et propose une restauration depuis l'historique.
async function checkDbConsistency(){
  const issues=[];
  try{
    // 1) la base répond-elle ? lecture de chaque table
    for(const t of TABLES){
      try{ await db.table(t).count(); }
      catch(e){ issues.push(`Table « ${t} » inaccessible.`); }
    }
    // 2) intégrité référentielle légère (commandes ↔ clients, items ↔ productions)
    const [orders, clients, items, prods] = await Promise.all([
      db.orders.toArray(), db.clients.toArray(), db.orderItems.toArray(), db.productions.toArray()
    ]);
    const clientIds=new Set(clients.map(c=>c.id));
    const prodIds=new Set(prods.map(p=>p.id));
    const ordOrph=orders.filter(o=>o.clientId && !clientIds.has(o.clientId)).length;
    const itemOrph=items.filter(it=>it.productionId && !prodIds.has(it.productionId)).length;
    if(ordOrph>0) issues.push(`${ordOrph} commande(s) liées à un client supprimé.`);
    if(itemOrph>0) issues.push(`${itemOrph} liaison(s) batch pointant vers une production absente.`);
    // 3) lignes de commande structurellement valides
    const badLines=orders.filter(o=>o.lignes!=null && !Array.isArray(o.lignes)).length;
    if(badLines>0) issues.push(`${badLines} commande(s) au format de lignes invalide.`);
  }catch(e){
    issues.push('La base de données n\'a pas pu être lue (corruption possible).');
  }
  return issues;
}
async function runConsistencyCheck(manual){
  const issues = await checkDbConsistency();
  if(!issues.length){
    if(manual) toast('✓ Base cohérente, aucune anomalie détectée');
    return;
  }
  // proposer une restauration depuis la dernière sauvegarde saine
  let lastGood=null;
  try{
    const backups=await db.backups.orderBy('date').reverse().toArray();
    for(const b of backups){ try{ const d=JSON.parse(b.payload); if(verifyBackup(d).ok){ lastGood=b; break; } }catch(e){} }
  }catch(e){}
  openModal(`<h3>⚠ Anomalies détectées dans les données</h3>
    <p class="note">Un contrôle de cohérence a relevé :</p>
    ${issues.map(i=>`<div class="sum-box"><span>•</span><b style="font-weight:500">${esc(i)}</b></div>`).join('')}
    ${lastGood
      ? `<p class="note" style="margin-top:8px">Une sauvegarde saine du ${new Date(lastGood.date).toLocaleString('fr-FR')} est disponible.</p>
         <div class="modal-actions">
           <button class="btn ghost" onclick="closeModal()">Ignorer</button>
           <button class="btn ghost" onclick="closeModal();view='sauvegardes';setActiveView&&setActiveView('sauvegardes');renderBackups()">Voir l'historique</button>
           <button class="btn gold" onclick="restoreBackup(${lastGood.id})">Restaurer la sauvegarde saine</button>
         </div>`
      : `<p class="note" style="margin-top:8px">Aucune sauvegarde saine n'est disponible dans l'historique. Si vous disposez d'un fichier .json exporté, importez-le.</p>
         <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
           <button class="btn" onclick="closeModal();view='sauvegardes';setActiveView&&setActiveView('sauvegardes');renderBackups()">Aller aux sauvegardes</button></div>`}`);
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
    if(ln.type==='prestation') return {label:`Prestation : ${ln.libelle||'service'}`, remisePct:(ln.remiseType==='pct'?+ln.remisePct||0:0), parfums:[]};
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
    paiement: orderPayStatus(o), reglement: o.reglement||'',
    paiements: (o.paiements||[]).map(p=>({date:p.date, montant:+p.montant||0, moyen:p.moyen||''})),
    encaisse: orderPaid(o), solde: orderBalance(o),
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
  // Traçabilité des paiements
  if(d.paiements && d.paiements.length){
    L.push('Paiements :');
    d.paiements.forEach(p=>L.push(`  - ${fmtDate(p.date)} · ${euro(p.montant)} · ${p.moyen||'—'}`));
    L.push(`Encaissé : ${euro(d.encaisse)} · Solde dû : ${euro(d.solde)}`);
  }
  L.push('Statut : '+d.paiement+(d.reglement&&!(d.paiements&&d.paiements.length)?` (${d.reglement})`:''));
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

/* ============================================================
   SERVICE WORKER — détection de mise à jour + invite « Recharger »
   skipWaiting est piloté par l'utilisateur (pas automatique).
   ============================================================ */
let _swReg=null, _swReloading=false;
function showUpdateBanner(worker){
  if(document.getElementById('updateBanner')) return; // déjà affichée
  const div=document.createElement('div');
  div.id='updateBanner';
  div.innerHTML=`<span>Une nouvelle version est disponible.</span>
    <button type="button" id="updateReload">Recharger l'application</button>
    <button type="button" id="updateDismiss" aria-label="Ignorer">✕</button>`;
  document.body.appendChild(div);
  div.querySelector('#updateReload').addEventListener('click', ()=>{
    if(worker){ worker.postMessage({type:'SKIP_WAITING'}); }
    else { location.reload(); }
  });
  div.querySelector('#updateDismiss').addEventListener('click', ()=>div.remove());
}
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./service-worker.js').then(reg=>{
      _swReg=reg;
      reg.update().catch(()=>{}); // vérifie tout de suite s'il existe une version plus récente
      // une version est déjà en attente (installée mais pas active) → proposer le rechargement
      if(reg.waiting && navigator.serviceWorker.controller){ showUpdateBanner(reg.waiting); }
      // une nouvelle version commence à s'installer → l'attendre puis proposer
      reg.addEventListener('updatefound', ()=>{
        const nw=reg.installing; if(!nw) return;
        nw.addEventListener('statechange', ()=>{
          // installée + un contrôleur existe déjà = ce n'est pas la 1ère install → maj dispo
          if(nw.state==='installed' && navigator.serviceWorker.controller){ showUpdateBanner(reg.waiting||nw); }
        });
      });
    }).catch(()=>{});
    // quand le nouveau SW prend le contrôle (après SKIP_WAITING), on recharge une seule fois
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{
      if(_swReloading) return; _swReloading=true; location.reload();
    });
  });
  // vérifie l'existence d'une mise à jour quand l'app revient au premier plan
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState==='visible' && _swReg){ _swReg.update().catch(()=>{}); }
  });
}

// POPUP D'ALERTE PRÉVISIONNELLE — affichée à l'ouverture (1×/jour) et après création/modif de commande.
// Toujours recalculée sur les données réelles du jour.
async function showForecastPopup(opts){
  opts=opts||{};
  // ne pas recouvrir une fenêtre déjà ouverte (ex. alerte de cohérence au démarrage)
  if(overlay && overlay.classList.contains('show')) return;
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
  initHistoryNav();
  exportReminder();
  // Sécurité des données : contrôle de cohérence + sauvegarde auto quotidienne au démarrage.
  try{ await runConsistencyCheck(false); }catch(e){ console.error('consistency',e); }
  try{ await autoDailyBackup(); }catch(e){ console.error('autoBackup',e); }
  // Surveillance quotidienne : réévalue toutes les commandes futures vs stock actuel.
  setTimeout(()=>{ showForecastPopup({daily:true}); }, 600);
})();
