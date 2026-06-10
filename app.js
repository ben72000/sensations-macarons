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
// v7 : pertes / casse sur stock fini (déclaration explicite, traçable, KPI taux de perte)
db.version(7).stores({
  losses:          '++id, productionId, date, motif'
});
// v8 : pointeuse de laboratoire — sessions de travail (temps global, décorrélé recettes/commandes)
db.version(8).stores({
  workSessions:    '++id, date'
});
// v9 : HACCP / PMS (Plan de Maîtrise Sanitaire) — équipements, relevés T°, tâches & nettoyage
db.version(9).stores({
  pmsEquipments:   '++id, nom, type',
  temperatureLogs: '++id, equipmentId, date, periode',
  pmsTasks:        '++id, nom, frequence',
  cleaningLogs:    '++id, taskId, date'
});

// --------- Catalogue de référence ---------
const FLAVORS = [
  'Citron crémeux','Chocolat au lait','Chocolat noir','Framboise','Vanille',
  'Pistache','Coco Rafaello','Cannelle noisette','Caramel beurre salé',
  'Chocolat passion','Nocciolata','Coco citron vert','Praliné noisettes',
  'Popcorn','Café'
];
const BOX_SIZES = [6, 8, 16, 25];
// 14 allergènes à déclaration obligatoire (règlement INCO 1169/2011). Servent à
// l'étiquetage et seront réutilisés par la boutique en ligne (information avant achat).
const ALLERGENS = [
  'Gluten','Crustacés','Œufs','Poissons','Arachides','Soja','Lait',
  'Fruits à coque','Céleri','Moutarde','Sésame','Sulfites','Lupin','Mollusques'
];
// Allergènes connus par parfum (catégories réglementaires). Source : fiche allergènes.
// Sert à pré-remplir automatiquement une recette QUI N'A PAS ENCORE d'allergènes saisis.
// La clé est normalisée (sans accents/casse) ; un nom de recette contenant ces mots
// (ex. « Macaron vanille de Madagascar ») sera reconnu.
// IMPORTANT : l'ordre compte. La 1ʳᵉ règle dont un mot-clé est contenu dans le nom gagne.
// On va donc du PLUS SPÉCIFIQUE au PLUS GÉNÉRIQUE :
//  - 'coco citron'/'coco' AVANT 'citron' (sinon « Coco citron vert » hériterait des Poissons du citron) ;
//  - variantes 'chocolat au lait/noir/passion' et '2 chocolats' AVANT le 'chocolat' générique.
const ALLERGENS_PAR_PARFUM = [
  { match:['rafaello','raffaello','coco citron','coco'], all:['Œufs','Lait','Soja','Fruits à coque'] }, // coco AVANT citron
  { match:['framboise-myrtille','myrtille'], all:['Œufs','Lait','Soja','Fruits à coque'] }, // grand format
  { match:['framboise'],         all:['Œufs','Lait','Soja','Fruits à coque','Poissons'] }, // gélatine de poisson
  { match:['citron'],            all:['Œufs','Lait','Soja','Fruits à coque','Poissons'] }, // gélatine de poisson
  { match:['cannelle'],          all:['Œufs','Lait','Soja','Fruits à coque','Sulfites'] }, // lait inclus (corrigé)
  { match:['praline','praliné'], all:['Œufs','Lait','Soja','Fruits à coque','Sulfites'] },
  { match:['nocciolata'],        all:['Œufs','Lait','Soja','Fruits à coque','Sulfites'] },
  { match:['caramel'],           all:['Œufs','Lait','Fruits à coque'] },                   // pas de soja
  { match:['madeleine'],         all:['Œufs','Lait','Soja','Fruits à coque','Gluten'] },   // grand format : GLUTEN
  { match:['mangue'],            all:['Œufs','Lait','Soja','Fruits à coque'] },            // grand format
  { match:['2 chocolats','deux chocolats'], all:['Œufs','Lait','Soja','Fruits à coque'] },// grand format
  { match:['chocolat au lait'],  all:['Œufs','Lait','Soja','Fruits à coque'] },
  { match:['chocolat noir'],     all:['Œufs','Lait','Soja','Fruits à coque'] },
  { match:['chocolat passion'],  all:['Œufs','Lait','Soja','Fruits à coque'] },
  { match:['chocolat'],          all:['Œufs','Lait','Soja','Fruits à coque'] },            // grand format « Chocolat » seul + générique
  { match:['vanille'],           all:['Œufs','Lait','Soja','Fruits à coque'] },
  { match:['pistache'],          all:['Œufs','Lait','Soja','Fruits à coque'] },
  { match:['popcorn'],           all:['Œufs','Lait','Soja','Fruits à coque'] },
  { match:['café','cafe'],       all:['Œufs','Lait','Soja','Fruits à coque'] },
];
// Renvoie les allergènes connus pour un nom de recette donné, ou null si inconnu.
function allergenesPourNom(nom){
  const n = (nom||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,''); // enlève les accents
  for(const e of ALLERGENS_PAR_PARFUM){
    if(e.match.some(m => n.includes(m.normalize('NFD').replace(/[\u0300-\u036f]/g,'')))) return e.all;
  }
  return null;
}
// Pré-remplit les allergènes des recettes qui n'en ont pas encore (jamais d'écrasement).
async function seedAllergenes(){
  try{
    const recs = await db.recipes.toArray();
    for(const r of recs){
      if(r.allergenes && r.allergenes.length) continue;   // déjà renseigné → on ne touche pas
      const all = allergenesPourNom(r.produitNom);
      if(all){ await db.recipes.update(r.id, { allergenes: all }); }
    }
  }catch(e){ /* silencieux : ne bloque jamais le démarrage */ }
}
const BOX_PRICES = { 6: 12, 8: 16, 16: 28, 25: 42 }; // prix de base par taille
const BOX_FLAVOR_LIMIT = { 6: 3, 8: 4, 16: 4, 25: 5 }; // parfums DIFFÉRENTS inclus
const FLAVOR_SURCHARGE = 3;     // € par parfum différent supplémentaire
const ORDER_STATUS = ['À préparer', 'Terminée', 'Livrée'];
// Motifs de perte / casse sur stock fini (déclaration explicite)
const LOSS_REASONS = ['Raté / casse', 'Invendable / DLC dépassée', 'Chute de production', 'Offert / dégustation', 'Autre'];
const PAY_STATUS = ['En attente', 'Payé'];
const PAY_METHODS = ['Carte', 'Virement', 'Espèces', 'Chèque', 'PayPal'];

// Lieux de livraison habituels préenregistrés. À ceux-ci s'ajoutent automatiquement
// les adresses déjà saisies dans les commandes passées (voir usualDeliveryPlaces()).
const PRESET_DELIVERY_PLACES = [
  'Leclerc Sargé',
  'Intermarché Av Bollée',
  'Place des Jacobins',
  'Place de la République',
  'Carrefour Market Boulevard Mutuel',
  'Lidl Allonnes'
];
// Construit la liste dédupliquée des lieux à suggérer : presets + lieux déjà
// utilisés dans des commandes (les plus fréquents/récents d'abord), hors doublons.
async function usualDeliveryPlaces(){
  const [orders, clients] = await Promise.all([
    db.orders.toArray().catch(()=>[]),
    db.clients.toArray().catch(()=>[])
  ]);
  const freq = {};
  orders.forEach(o=>{
    const v = (o.lieuLivraison||'').trim();
    if(v) freq[v] = (freq[v]||0) + 1;
  });
  // lieux issus des commandes, triés par fréquence décroissante
  const fromOrders = Object.keys(freq).sort((a,b)=>freq[b]-freq[a]);
  // adresses enregistrées sur les fiches clients (nom + adresse pour faciliter la recherche)
  const fromClients = [];
  clients.forEach(c=>{
    const a=(c.adresse||'').trim(); if(!a) return;
    fromClients.push(a);
    if(c.nom) fromClients.push(`${c.nom} — ${a}`);
  });
  // fusion sans doublon (insensible à la casse), presets puis commandes puis clients
  const seen = new Set(), out = [];
  [...PRESET_DELIVERY_PLACES, ...fromOrders, ...fromClients].forEach(v=>{
    const k = v.toLowerCase();
    if(!seen.has(k)){ seen.add(k); out.push(v); }
  });
  return out;
}

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
const EXPORT_REMINDER_DAYS_DEFAULT = 3;   // fréquence par défaut du rappel d'export (jours)
const SETTINGS_DEFAULTS = {
  socialGoods: 12.3,     // % charges sociales sur vente de marchandise (produit fini)
  socialService: 25.6,   // % charges sociales sur prestation de service
  packaging: { 6:1.26, 8:2.18, 16:1.90, 25:2.32 }, // € emballage/consommable par coffret (tarifs réels reçus le 28/11/2025)
  packagingDate: '2025-11-28', // date de réception de référence de ces tarifs (mise à jour à chaque nouvelle réception)
  // Main-d'œuvre (optionnelle) : prise en compte dans le coût de revient si activée.
  laborEnabled: false,   // active/désactive l'ajout du coût de main-d'œuvre
  laborRate: 12.0,       // coût horaire main-d'œuvre (€/h) chargé
  // Livraison : consommation moyenne du véhicule (L/100 km), pour chiffrer le carburant.
  // Le coût du temps de livraison réutilise laborRate (€/h).
  vehicleConso: 6.5,     // litres aux 100 km
  // PRIX DE VENTE PAR FORMAT (dégressif) — € par macaron selon la taille du coffret.
  // Sert à estimer un prix moyen pondéré et à détecter les incohérences de CA.
  // Le CA réel reste toujours le CA ENCAISSÉ ; cette grille n'établit pas le CA.
  prixParFormat: { 6:2.00, 8:2.00, 16:1.75, 25:1.68 },
  // Prix unitaire de repli (si aucune vente pour pondérer) — recalculé depuis la grille.
  prixVenteUnitaire: 2.00,
  // Tarif PRO au macaron STANDARD (vrac en boîte réutilisable, non facturée). Évolutif.
  prixMacaronProStd: 1.40,
  // Tarif PRO au macaron GRAND FORMAT. Évolutif (le tarif particulier reste à 6,00 €).
  prixGrandFormatPro: 3.20,
  // Types d'emballage pour le comptage avant/après marché (delta) :
  // {nom, cout unitaire €, capacite = nb de macarons par boîte (sert à reconstituer le CA par format)}
  packTypes: [
    {nom:'Boîte 6', cout:0.50, capacite:6},
    {nom:'Boîte 8', cout:0.60, capacite:8},
    {nom:'Boîte 16', cout:1.00, capacite:16},
    {nom:'Boîte 25', cout:1.50, capacite:25}
  ]
};
function getSettings(){
  try{ const s=JSON.parse(localStorage.getItem('sm_settings')||'{}');
    return {
      socialGoods: s.socialGoods!=null?+s.socialGoods:SETTINGS_DEFAULTS.socialGoods,
      socialService: s.socialService!=null?+s.socialService:SETTINGS_DEFAULTS.socialService,
      laborEnabled: s.laborEnabled===true,
      laborRate: s.laborRate!=null?+s.laborRate:SETTINGS_DEFAULTS.laborRate,
      vehicleConso: s.vehicleConso!=null?+s.vehicleConso:SETTINGS_DEFAULTS.vehicleConso,
      prixParFormat: Object.assign({}, SETTINGS_DEFAULTS.prixParFormat, s.prixParFormat||{}),
      prixVenteUnitaire: s.prixVenteUnitaire!=null?+s.prixVenteUnitaire:SETTINGS_DEFAULTS.prixVenteUnitaire,
      prixMacaronProStd: s.prixMacaronProStd!=null?+s.prixMacaronProStd:SETTINGS_DEFAULTS.prixMacaronProStd,
      prixGrandFormatPro: s.prixGrandFormatPro!=null?+s.prixGrandFormatPro:SETTINGS_DEFAULTS.prixGrandFormatPro,
      packaging: Object.assign({}, SETTINGS_DEFAULTS.packaging, s.packaging||{}),
      packagingDate: s.packagingDate || SETTINGS_DEFAULTS.packagingDate,
      packTypes: Array.isArray(s.packTypes) ? s.packTypes : JSON.parse(JSON.stringify(SETTINGS_DEFAULTS.packTypes)),
      exportReminderDays: (parseInt(s.exportReminderDays,10)>0)?parseInt(s.exportReminderDays,10):EXPORT_REMINDER_DAYS_DEFAULT
    };
  }catch(e){ return JSON.parse(JSON.stringify(SETTINGS_DEFAULTS)); }
}
function saveSettings(s){ localStorage.setItem('sm_settings', JSON.stringify(s)); }

// Migration unique : inscrit les tarifs d'emballage reçus le 28/11/2025 dans les réglages
// enregistrés (qui priment sinon sur les nouveaux défauts). Ne s'exécute qu'UNE fois : à ta
// prochaine réception, tu modifieras les prix dans Paramètres et ils ne seront plus écrasés.
function migratePackaging202511(){
  try{
    if(localStorage.getItem('sm_pkg_migr_20251128_v2')==='done') return;
    const raw=JSON.parse(localStorage.getItem('sm_settings')||'{}');
    const cur=raw.packaging||{};
    // N'applique les nouveaux tarifs QUE si l'utilisateur n'a rien personnalisé depuis :
    // soit aucun tarif enregistré, soit exactement les anciens défauts (0.50/0.60/1.00/1.50).
    const estAncienDefaut = (cur[6]==0.50&&cur[8]==0.60&&cur[16]==1.00&&cur[25]==1.50);
    const estVide = !cur || Object.keys(cur).length===0;
    if(estVide || estAncienDefaut){
      raw.packaging = { 6:1.26, 8:2.18, 16:1.90, 25:2.32 };
      raw.packagingDate = '2025-11-28';
      localStorage.setItem('sm_settings', JSON.stringify(raw));
    }
    localStorage.setItem('sm_pkg_migr_20251128_v2','done');
  }catch(e){ console.error('migratePackaging', e); }
}
// Applique les tarifs d'emballage du 28/11/2025, sous contrôle de l'utilisateur (bouton Paramètres).
// Écrit directement dans les réglages (fiable, indépendant de la migration automatique).
function applyPackaging202511(){
  const tarifs={6:1.26, 8:2.18, 16:1.90, 25:2.32};
  try{
    // Écriture DIRECTE dans le localStorage brut (sans passer par getSettings, pour éviter
    // toute réintroduction de valeurs parasites). On remplace entièrement la clé packaging.
    const raw=JSON.parse(localStorage.getItem('sm_settings')||'{}');
    raw.packaging = Object.assign({}, tarifs);   // remplace tout : 6/8/16/25 = tarifs réels
    raw.packagingDate = '2025-11-28';
    localStorage.setItem('sm_settings', JSON.stringify(raw));
    localStorage.setItem('sm_pkg_migr_20251128_v2','done');
  }catch(e){ console.error('applyPackaging202511', e); toast('Erreur d\'enregistrement'); return; }
  // met à jour les champs visibles si le formulaire est ouvert
  Object.keys(tarifs).forEach(t=>{ const el=document.getElementById('set_pk_'+t); if(el) el.value=tarifs[t]; });
  toast('Tarifs emballage du 28/11/2025 appliqués ✓');
  if(typeof settingsForm==='function') settingsForm();   // rouvre le formulaire avec les valeurs à jour + diagnostic
}
// Coût emballage d'un coffret selon sa taille (commandes) — tarif paramétré (repli).
function packagingCost(taille){ const s=getSettings(); return money2(s.packaging[taille]!=null?s.packaging[taille]:0); }

// Coût unitaire RÉEL d'un emballage par capacité, calculé sur les lots d'emballage
// (prix unitaire moyen pondéré par les quantités reçues). Renvoie une Map(capacite → coût).
// Repli silencieux sur le tarif paramétré si aucun lot d'emballage chiffrable.
function realPackagingCostMap(materials, lots){
  const embByCap = new Map();   // capacite -> {coutTotal, qteTotal}
  const embMatCap = new Map();  // materialId -> capacite (pour les matières emballage)
  (materials||[]).forEach(m=>{ if(m.categorie==='emballage' && +m.capacite>0) embMatCap.set(m.id, +m.capacite); });
  (lots||[]).forEach(l=>{
    const cap = embMatCap.get(l.materialId); if(!cap) return;
    const q=+l.qteInitiale||0, pu=lotPU(l); if(q<=0||!(pu>0)) return;
    const cur = embByCap.get(cap) || {coutTotal:0, qteTotal:0};
    cur.coutTotal += pu*q; cur.qteTotal += q; embByCap.set(cap, cur);
  });
  const out = new Map();
  for(const [cap, v] of embByCap){ if(v.qteTotal>0) out.set(cap, money2(v.coutTotal/v.qteTotal)); }
  return out;
}
// Coût emballage d'un format : réel (lots) si dispo, sinon tarif paramétré.
function packagingCostReal(taille, realMap){
  if(realMap && realMap.has(+taille)) return realMap.get(+taille);
  return packagingCost(taille);
}
// Trouve la matière EMBALLAGE correspondant à un format de coffret (par capacité).
async function findPackagingMaterial(taille){
  const mats = await db.materials.toArray();
  return mats.find(m=>m.categorie==='emballage' && +m.capacite===+taille) || null;
}
// Crée les emballages standards (un par format de coffret) s'ils n'existent pas encore.
// Idempotent : ne recrée pas un format déjà présent. Le stock se gère ensuite par lots.
async function seedEmballages(){
  const mats = await db.materials.toArray();
  const s = getSettings();
  for(const cap of BOX_SIZES){
    const existe = mats.some(m=>m.categorie==='emballage' && +m.capacite===+cap);
    if(existe) continue;
    const prixDef = (s.packaging && s.packaging[cap]!=null) ? s.packaging[cap] : 0;
    await db.materials.add({nom:`Coffret ${cap} macarons`, unite:'unité', categorie:'emballage',
      capacite:+cap, seuil:0, prixDefaut:prixDef});
  }
}
// Comparateur FIFO des lots de matière/emballage.
// RÈGLE : un lot de REPRISE (stock de départ migration, repriseStock:true) est TOUJOURS
// consommé en premier (priorité absolue), avant tout autre lot. Ensuite, ordre normal :
// DLC la plus proche d'abord, puis réception la plus ancienne.
function lotFifoCompare(a, b){
  const ra = a.repriseStock?0:1, rb = b.repriseStock?0:1;
  if(ra!==rb) return ra-rb;                       // les lots de reprise en tête
  return (a.dlc||'9999').localeCompare(b.dlc||'9999')
      || (a.dateReception||'').localeCompare(b.dateReception||'');
}
// Décrémente `nb` emballages du stock (lots FIFO : reprise d'abord, puis DLC la plus proche).
// Retourne {consomme, manque, materialId} ; ne lève pas si stock insuffisant (consomme ce qui existe).
// À appeler dans une transaction incluant db.materialLots.
async function decrementPackagingStock(taille, nb){
  const mat = await findPackagingMaterial(taille);
  if(!mat) return {consomme:0, manque:nb, materialId:null, absent:true};
  const lots = (await db.materialLots.where('materialId').equals(mat.id).toArray())
    .filter(l=>round3(+l.qteRestante)>0)
    .sort(lotFifoCompare);
  let reste = round3(+nb||0); let consomme=0;
  for(const l of lots){
    if(reste<=0) break;
    const dispo = round3(+l.qteRestante);
    const pris = Math.min(dispo, reste);
    if(pris>0){
      await db.materialLots.update(l.id, {qteRestante: subQty(l.qteRestante, pris)});
      reste = round3(reste - pris); consomme = round3(consomme + pris);
    }
  }
  return {consomme, manque: round3(Math.max(0, reste)), materialId: mat.id, absent:false};
}


// Macarons grand format (vente à l'unité), double tarif. Le tarif PRO est évolutif
// (réglable dans les paramètres) ; le tarif particulier reste la référence par défaut.
const BIG_FORMATS = ['Chocolat', 'Myrtille framboise', 'Mangue passion', 'Madeleine'];
const BIG_PRICE = { pro: 3.20, particulier: 6.00 };   // défauts/repli
// 1 macaron assemblé = 2 coques + 1 dose de ganache. Les sous-lots COQUES sont comptés
// en coques ; les sous-lots GANACHE en nombre de macarons garnissables.
const COQUES_PAR_MACARON = 2;
// Prix grand format selon le tarif, en tenant compte du réglage pro évolutif.
function bigPrice(tarif){
  if(tarif==='pro'){ const s=getSettings(); return (s.prixGrandFormatPro!=null)?+s.prixGrandFormatPro:BIG_PRICE.pro; }
  return BIG_PRICE.particulier;
}

// --------- Helpers ---------
// Arrondis & opérations argent/stock : voir utils.js (money2, round3, addMoney,
// subMoney, mulMoney, addQty, subQty) — chargé avant app.js.
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
// Floute un NOM (client) en mode discret : le texte reste présent (recherche/tri)
// mais s'affiche flouté. Réutilisable partout où un nom sensible apparaît.
const nameP = (txt)=>{
  const s = esc(txt==null?'':String(txt));
  return privacyMasked() ? `<span class="blur-name">${s}</span>` : s;
};
// today() : voir utils.js
// Calcule la DLC selon l'emplacement, à partir d'un horodatage (calcul SIMPLE, sans historique).
// Règle de base : frigo = +7 jours ; congélateur = +4 mois.
function computeDlc(emplacement, baseIso){
  const d = baseIso ? new Date(baseIso) : new Date();
  if(isFreezer(emplacement)){ d.setMonth(d.getMonth()+4); }
  else { d.setDate(d.getDate()+7); } // frigo (et défaut prudent)
  return d.toISOString().slice(0,10);
}
// ---- EMPLACEMENTS DE STOCKAGE ----
// 1 frigo + 3 congélateurs, chacun identifié par une LETTRE qui s'ajoute au n° de lot
// et apparaît sur l'étiquette pour localiser physiquement la production.
const EMPLACEMENTS = [
  {key:'frigo',   lettre:'F', nom:'Frigo',                type:'frigo',      icon:'🧊'},
  {key:'bahut',   lettre:'B', nom:'Congélateur bahut',    type:'congelateur',icon:'❄️'},
  {key:'colonne', lettre:'C', nom:'Congélateur colonne',  type:'congelateur',icon:'❄️'},
  {key:'petit',   lettre:'A', nom:'Petit congélateur',    type:'congelateur',icon:'❄️'}
];
const EMP_BY_KEY = Object.fromEntries(EMPLACEMENTS.map(e=>[e.key,e]));
const EMP_BY_LETTRE = Object.fromEntries(EMPLACEMENTS.map(e=>[e.lettre,e]));
// Un emplacement est-il un congélateur ? (B, C, A) — sinon frigo (F).
function isFreezer(key){ const e=EMP_BY_KEY[key]; return e ? e.type==='congelateur' : key==='congelateur'; }
// Libellé/lettre/icône d'un emplacement (rétro-compat : 'congelateur' générique → bahut par défaut d'affichage).
function empInfo(key){
  if(EMP_BY_KEY[key]) return EMP_BY_KEY[key];
  if(key==='ambiant') return {key:'ambiant', lettre:'T', nom:'Température ambiante', type:'ambiant', icon:'🌡️'};
  if(key==='congelateur') return {key:'congelateur', lettre:'B', nom:'Congélateur', type:'congelateur', icon:'❄️'};
  if(key==='frigo') return EMP_BY_KEY.frigo;
  return {key:key||'', lettre:'?', nom:'—', type:'', icon:''};
}
function empLettre(key){ return empInfo(key).lettre; }
function empNom(key){ return empInfo(key).nom; }
function empIcon(key){ return empInfo(key).icon; }
// Tag HTML coloré d'un emplacement.
// Sur iPad/desktop : icône + nom complet + lettre (ex. « 🌡️ Température ambiante · T »).
// Sur iPhone (CSS @media) : on n'affiche QUE la lettre centrée, en gardant la couleur.
function empTagHtml(key){
  const e=empInfo(key);
  if(!e.key) return '<span class="tag warn">non renseigné</span>';
  const bg = e.type==='frigo' ? '#6aa3a0' : '#3b6ea5';
  return `<span class="tag emp-tag" style="background:${bg};color:#fff" title="${esc(e.nom)}">`
    + `<span class="emp-full">${e.icon} ${esc(e.nom)} · ${e.lettre}</span>`
    + `<span class="emp-letter">${e.lettre}</span></span>`;
}
// Applique/relève la lettre d'emplacement au numéro de lot : « L-…-EMR » + « -A ».
// On retire d'abord un éventuel suffixe -X existant, puis on ajoute la nouvelle lettre.
const EMP_LETTERS = EMPLACEMENTS.map(e=>e.lettre).join(''); // "FBCA"
function lotBaseSansSuffixe(lot){
  if(!lot) return '';
  return String(lot).replace(new RegExp('-[' + EMP_LETTERS + ']$'), '');
}
function lotAvecEmplacement(lot, key){
  const base = lotBaseSansSuffixe(lot);
  const l = empLettre(key);
  return (l && l!=='?') ? `${base}-${l}` : base;
}
// Génère un code aléatoire pour le n° de lot SANS les lettres ambiguës I, L, O
// (confusion avec 1 / 1 / 0). Alphabet : A–Z sauf I/L/O + chiffres 2–9 (0 et 1 exclus aussi).
const LOT_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // pas de I,L,O ni 0,1
function genLotCode(n){
  n = n||3;
  let s='';
  for(let i=0;i<n;i++) s += LOT_ALPHABET[Math.floor(Math.random()*LOT_ALPHABET.length)];
  return s;
}
// Nettoie un n° de lot saisi : met en majuscules et retire les lettres ambiguës I, L, O.
// Renvoie {lot, changed} pour pouvoir prévenir l'utilisateur si une correction a eu lieu.
function sanitizeLot(lot){
  const up = String(lot||'').toUpperCase();
  const cleaned = up.replace(/[ILO]/g, '');
  return {lot:cleaned, changed: cleaned!==up};
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
    if(!isFreezer(segs[i].lieu)){
      const start=new Date(segs[i].ts), end=new Date(segs[i+1].ts);
      const dur=end-start; if(dur>0) frigoConsumedMs+=dur;
    }
  }
  const last=segs[segs.length-1];
  const lastStart=new Date(last.ts);
  if(isFreezer(last.lieu)){
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
// Heure seule au format 00:00 (ex : 10:02). Renvoie '' si non valide.
// fmtTime / fmtDateTime : voir utils.js
// --------- Statut de production : démarré / terminé ---------
// Plafond de temps autorisé en statut « démarré » avant blocage (4 jours).
const PROD_OPEN_MAX_DAYS = 4;
// Statut effectif d'une prod (rétro-compat : les anciennes prods sans statut
// sont considérées comme « terminée », avec leur DLC déjà figée).
function prodStatut(p){ return p && p.prodStatut ? p.prodStatut : 'termine'; }
// Composant d'une production : 'complet' (vendable), 'coques'/'ganache' (intermédiaires), 'assemble' (vendable).
function prodComposant(p){ return (p && p.composant) ? p.composant : 'complet'; }
// Un lot est-il un PRODUIT FINI vendable ? (exclut les sous-lots coques/ganache non assemblés)
function prodVendable(p){ const c=prodComposant(p); return c==='complet' || c==='assemble'; }
// Heure d'ancrage de la DLC frigo : le moment où la prod est passée « terminée »
// (ou, pour les anciennes prods, l'horodatage de production).
function prodDlcAnchor(p){ return (p && (p.prodTermineTs || (prodStatut(p)==='termine' ? p.prodTimestamp : ''))) || ''; }
// Heures écoulées depuis le démarrage d'une prod « démarrée ».
function prodOpenHours(p){
  const start = p && (p.prodDebutTs || p.prodTimestamp);
  if(!start) return null;
  return (Date.now() - new Date(start).getTime()) / 3600000;
}
// Une prod « démarrée » dépasse-t-elle le plafond des 4 jours ?
function prodOpenOverdue(p){
  if(prodStatut(p)!=='demarre') return false;
  const h = prodOpenHours(p);
  return h!=null && h > PROD_OPEN_MAX_DAYS*24;
}
// esc() : voir utils.js
function val(id){ const el = document.getElementById(id); return el ? (el.value||'').trim() : ''; }
// fmtDate() / daysTo() : voir utils.js

// --------- Graphique linéaire SVG (sans dépendance) ---------
// series : [{label, points:[{x:'2026-01', y:12.5}], color}]  — x = clé triable
function lineChart(series, opt){
  opt = opt || {};
  const W = opt.w || 640, H = opt.h || 240, pad = {l:48,r:16,t:16,b:34};
  const all = series.flatMap(s=>s.points);
  if(!all.length) return '<div class="empty">Pas encore de données.</div>';
  // axe X = union triée des clés
  const xs = [...new Set(all.map(p=>p.x))].sort((a,b)=>String(a).localeCompare(String(b)));
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
    const pts = s.points.slice().sort((a,b)=>String(a.x).localeCompare(String(b.x)));
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
function toast(msg){ const t=document.getElementById('toast'); if(!t) return; t.innerHTML=esc(msg); t.classList.remove('with-action'); t.classList.add('show'); clearTimeout(tt); tt=setTimeout(()=>t.classList.remove('show'),2400); }
// ---- ANNULATION RAPIDE (undo) ----
// Le toast affiche un message + un lien « Annuler » discret, au même endroit que les
// notifications habituelles (non invasif). Disparaît seul après quelques secondes.
let _undoFn=null, _undoTimer=null;
function showUndoToast(label, restoreFn, ms){
  _undoFn=restoreFn;
  const t=document.getElementById('toast'); if(!t){ return; }
  t.innerHTML=`<span class="toast-msg">${esc(label)}</span><button type="button" class="toast-undo" onclick="runUndo()">↩ Annuler</button>`;
  t.classList.add('show','with-action');
  clearTimeout(tt); clearTimeout(_undoTimer);
  _undoTimer=setTimeout(()=>{ hideUndo(); }, ms||6000);
}
function hideUndo(){ const t=document.getElementById('toast'); if(t){ t.classList.remove('show','with-action'); } _undoFn=null; clearTimeout(_undoTimer); }
async function runUndo(){
  const fn=_undoFn; _undoFn=null; clearTimeout(_undoTimer);
  const t=document.getElementById('toast'); if(t) t.classList.remove('show','with-action');
  if(typeof fn==='function'){ try{ await fn(); toast('Action annulée ✓'); }catch(e){ toast('Annulation impossible'); } }
}
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
  fournisseurs:renderSuppliers, matieres:renderMaterials, recettes:renderRecipes, achats:renderAchats,
  productions:renderProductions, couts:renderCosts, dlc:renderDlc, picking:renderPicking, mrp:renderMRP,
  tracabilite:renderTrace, etiquettes:renderLabels, stats:renderStats, compta:renderCompta, pilotage:renderPilotage, rentabilite:renderProfit, rentaparfum:renderParfums, stockparfums:renderStockParfums, marches:renderMarkets, analyse:renderAnalyse, previsionnel:renderForecast, evenements:renderEvents, sauvegardes:renderBackups, assistant:renderAssistant, pms:renderPMS, migration:renderMigration
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
  // Filet de sécurité HACCP : si on quitte l'écran Températures avec des valeurs
  // saisies mais non validées, on prévient (évite la perte silencieuse de relevés).
  if(typeof pmsGuardUnsaved==='function' && view==='pms' && v!=='pms'){
    if(!pmsGuardUnsaved()) return;
  }
  if(typeof hideUndo==='function') hideUndo();
  view=v; setActiveView(view); render();
  if(_histReady && !_popping && !opts.replace){
    try{ history.pushState({view:v, kind:'view'}, '', '#'+v); }catch(e){}
  }
}
// Renvoie true s'il existe une température MODIFIÉE et non encore validée dans l'écran courant.
// On compare la valeur affichée à la valeur déjà enregistrée (data-saved) : un relevé déjà
// validé puis simplement réaffiché ne compte PAS comme « non enregistré ».
function pmsHasUnsavedTemp(){
  if(_pmsTab!=='temp') return false;
  const sels=document.querySelectorAll('select[id^="pmsT_"]');
  for(const s of sels){
    const cur = s.value;
    const saved = s.getAttribute('data-saved')||'';
    // une vraie modification = valeur courante différente de la valeur enregistrée
    if(cur!==saved && cur!=='' && !isNaN(+cur)) return true;
  }
  return false;
}
// Garde-fou : si une température a été MODIFIÉE sans être revalidée, on demande confirmation
// avant de quitter. Message neutre (pas de « perte de données ») : il s'agit seulement d'un
// relevé non encore validé. Robuste si confirm() est indisponible (PWA iOS).
function pmsGuardUnsaved(){
  if(!pmsHasUnsavedTemp()) return true;
  let ok;
  try{
    ok = window.confirm('Un relevé de température a été modifié mais pas encore validé.\n\nTouche « ✓ Valider les relevés » pour l\'enregistrer.\n\nContinuer sans valider cette modification ?');
  }catch(e){ ok = undefined; }
  // Si confirm() n'est pas exploitable (certaines PWA iOS), on ne bloque pas la navigation
  // mais on prévient clairement par un toast.
  if(ok===undefined){
    if(typeof toast==='function') toast('ℹ️ Relevé modifié non validé — pense à « Valider les relevés »');
    return true;
  }
  return ok;
}
function openSheet(){
  const o=document.getElementById('sheetOverlay'); if(o){ o.classList.add('show'); setActiveView(view);
    navAdvEnsureVisible();
    const pb=document.getElementById('sheetPrivacyBtn'); if(pb) pb.textContent = privacyModeEnabled()?'👁️ Afficher les données':'🙈 Mode discret';
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

// MENU SIMPLIFIÉ : section « Avancé » repliée par défaut, état mémorisé.
// S'ouvre automatiquement si l'écran actif est un écran avancé (pour rester visible).
function navAdvApply(open){
  document.querySelectorAll('#navAdv, #sheetAdv').forEach(el=>el.classList.toggle('open', !!open));
  document.querySelectorAll('.nav-adv-toggle, .sheet-adv-toggle').forEach(el=>el.classList.toggle('open', !!open));
}
function navAdvToggle(){
  const open = !document.getElementById('sheetAdv')?.classList.contains('open');
  navAdvApply(open);
  try{ localStorage.setItem('sm_nav_adv', open?'1':'0'); }catch(e){}
}
function navAdvEnsureVisible(){
  // si la vue active vit dans la section Avancé, on déplie pour que son bouton soit visible
  const adv=document.getElementById('sheetAdv');
  if(adv && adv.querySelector(`button[data-v="${view}"]`)) navAdvApply(true);
}
(function(){ try{ if(localStorage.getItem('sm_nav_adv')==='1') navAdvApply(true); }catch(e){} })();

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
  // la mascotte reflète l'état courant : on la réévalue à chaque navigation
  if(typeof mascotRefresh==='function') mascotRefresh();
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
  // Relevé de température du jour fait ou non (rappel HACCP discret).
  const tLogsToday = await (db.temperatureLogs?db.temperatureLogs.where('date').equals(today()).toArray():Promise.resolve([])).catch(()=>[]);
  const releveFait = tLogsToday.length>0;
  // CA des marchés clôturés (somme espèces+CB+autre), rattaché à leur date de clôture.
  const closedMk = (markets||[]).filter(k=>k.statut==='clos').map(k=>{
    const ca=k.ca||{}; return {date:(k.dateCloture||k.date||''), montant:marketNetCA(k)};
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
    // Les emballages (carton, film…) ne périment pas → pas d'alerte DLC pour eux.
    if(dlcMin && mat.categorie!=='emballage'){ const d=daysTo(dlcMin); if(d!==null && d<=7) dlcAlert.push({nom:mat.nom,dlc:dlcMin,j:d}); }
  }
  // Stock de macarons FINIS VENDABLES uniquement : on exclut les sous-lots intermédiaires
  // (ganache, coques non assemblées) via prodVendable(), comme la vue « Stock par parfum ».
  const finis = productions.filter(prodVendable).reduce((s,p)=>s+(+p.qteRestante||0),0);

  // Alertes DLC produits finis (suivi en sourdine) : seuil adapté à l'emplacement.
  // Frigo : alerte à ≤2 jours. Congélateur : alerte à ≤14 jours. Expiré = priorité.
  const prodDlcAlert=[];
  productions.forEach(p=>{
    if(round3(+p.qteRestante)<=0 || !p.dlcProduit) return;
    const j=daysTo(p.dlcProduit); if(j===null) return;
    const seuil = isFreezer(p.emplacement) ? 14 : 2;
    if(j<=seuil){
      prodDlcAlert.push({nom:recName(p.recipeId), lot:p.lotProduction||('#'+p.id),
        dlc:p.dlcProduit, j, emplacement:p.emplacement||'', qte:round3(+p.qteRestante)});
    }
  });
  prodDlcAlert.sort((a,b)=>a.j-b.j);

  // Alerte : productions encore « démarrées » (DLC non lancée) et celles dépassant 4 jours.
  const prodOuvertes = productions.filter(p=>prodStatut(p)==='demarre');
  const prodEnRetard = prodOuvertes.filter(prodOpenOverdue);
  const prodSugg = assemblySuggestions(productions, recName);

  const upcoming = events.filter(e=>e.date>=today()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4);
  const months=[]; for(let i=5;i>=0;i--){const d=new Date(y,m-i,1);months.push({k:d.toISOString().slice(0,7),l:d.toLocaleDateString('fr-FR',{month:'short'})});}
  const data=months.map(mo=>({...mo,v: money2(
    orders.filter(c=>c.date&&c.date.slice(0,7)===mo.k).reduce((s,c)=>s+(+c.montant||0),0)
    + closedMk.filter(k=>k.date&&k.date.slice(0,7)===mo.k).reduce((s,k)=>s+k.montant,0)
  )}));
  const max=Math.max(...data.map(d=>d.v),1);

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Tableau de bord</h1><p>Vue d'ensemble — ${now.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</p></div>
     <div class="flex" style="gap:6px"><button class="btn ghost sm" onclick="quickLossForm()">⚠ Casse</button><button class="btn ghost sm" onclick="togglePrivacyMode()">${privacyModeEnabled()?'👁️ Afficher les chiffres':'🙈 Mode discret'}</button></div></div>
   ${privacyModeEnabled()?`<div class="banner">🙈 <div>Mode discret actif : montants et volumes sensibles masqués dans toute l'application. Touchez « Afficher les chiffres » pour les réafficher.</div></div>`:''}
   ${prodEnRetard.length?`<div class="banner" style="background:#fdf3f2;border-color:#e5b4ae">⛔ <div><b>${prodEnRetard.length} production(s) ouverte(s) &gt; ${PROD_OPEN_MAX_DAYS} jours</b> : ${prodEnRetard.slice(0,5).map(p=>`${esc(recName(p.recipeId))} (lot ${esc(p.lotProduction||('#'+p.id))})`).join(' · ')}. À terminer ou supprimer. <span class="act" onclick="goView('productions')">Ouvrir Productions →</span></div></div>`:''}
   ${!releveFait?`<div class="banner">🌡 <div><b>Relevé de température non fait aujourd'hui.</b> Pense à le saisir et à <b>valider</b>. <span class="act" onclick="goView('pms')">Faire le relevé →</span></div></div>`:''}
   ${prodOuvertes.length && !prodEnRetard.length?`<div class="banner">▶ <div><b>${prodOuvertes.length} production(s) en cours</b> — DLC en attente du passage en « terminée ». <span class="act" onclick="goView('productions')">Voir →</span></div></div>`:''}
   ${prodSugg.length?`<div class="banner" style="background:#f4faf5;border-color:#cfe3d4">🔗 <div><b>${prodSugg.length} assemblage(s) à finaliser</b> — des coques et ganaches en stock peuvent être réunies (${prodSugg.slice(0,3).map(s=>esc(s.coqRec)+' '+qty(s.assemblable)+' mac.').join(' · ')}${prodSugg.length>3?' …':''}). <span class="act" onclick="goView('productions')">Assembler →</span></div></div>`:''}
   ${dlcAlert.length?`<div class="banner">⏰ <div><b>DLC matières proche</b> : ${dlcAlert.map(a=>`${esc(a.nom)} (${a.j<=0?'expiré':a.j+' j'})`).join(' · ')}</div></div>`:''}
   ${prodDlcAlert.length?`<div class="banner" style="background:#fdf3f2">🧁 <div><b>DLC produits finis</b> : ${prodDlcAlert.slice(0,6).map(a=>`${esc(a.nom)} ${empIcon(a.emplacement)}${a.emplacement?' '+empLettre(a.emplacement):''} (${a.j<=0?'<b style="color:#b3261e">expiré</b>':a.j+' j'}, lot ${esc(a.lot)})`).join(' · ')}${prodDlcAlert.length>6?` … +${prodDlcAlert.length-6}`:''}</div></div>`:''}
   <div class="cards">
     <div class="card clickable" onclick="goView('compta')" title="Voir la comptabilité"><div class="corner">€</div><div class="lbl">CA ce mois</div><div class="val">${euro(caMonth)}</div><div class="sub">${nbMonth} commande(s) ›</div></div>
     <div class="card clickable" onclick="goView('compta')" title="Voir la comptabilité"><div class="corner">∑</div><div class="lbl">CA total</div><div class="val">${euro(caTotal)}</div><div class="sub">depuis le début ›</div></div>
     <div class="card clickable" onclick="goView('stockparfums')" title="Voir le stock par parfum"><div class="corner">🍬</div><div class="lbl">Macarons en stock</div><div class="val">${qtyP(finis)}</div><div class="sub">par parfum ›</div></div>
     <div class="card clickable" onclick="goView('matieres')" title="Voir les matières à réapprovisionner"><div class="corner">⬛</div><div class="lbl">Alertes stock</div><div class="val">${low.length}</div><div class="sub">matière(s) sous seuil ›</div></div>
   </div>
   <div class="panel"${privacyModeEnabled()?' style="filter:blur(6px);opacity:.45;pointer-events:none;user-select:none"':''}><h2>Chiffre d'affaires — 6 derniers mois</h2>
     <div class="bar-wrap">${data.map(d=>`<div class="bar-col"><div class="bar-val">${(!privacyModeEnabled()&&d.v>0)?Math.round(d.v):''}</div><div class="bar" style="height:${d.v/max*140}px"></div><div class="bar-lbl">${d.l}</div></div>`).join('')}</div>
   </div>
   <div class="dash-2col">
     <div class="panel"><h2>⚠ Matières à réapprovisionner</h2>
       ${low.length?`<div class="table-wrap"><table class="dash-tbl"><tbody>${low.map(s=>`<tr>
         <td class="nm">${esc(s.nom)}</td>
         <td style="text-align:right;white-space:nowrap"><span class="tag low">${qty(s.total)} ${esc(s.unite||'')}</span></td>
         <td style="text-align:right;color:#9a8a82;white-space:nowrap;font-size:.78rem">seuil ${qty(s.seuil)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">Tout est au-dessus du seuil ✓</div>`}
     </div>
     <div class="panel"><h2>Prochaines échéances</h2>
       ${upcoming.length?`<div class="table-wrap"><table class="dash-tbl"><tbody>${upcoming.map(e=>`<tr>
         <td style="white-space:nowrap;color:#6a5a52">${fmtDate(e.date)}</td>
         <td class="nm">${esc(e.titre)}</td>
         <td style="text-align:right"><span class="tag ${e.type==='cmd'?'todo':'event'}">${e.type==='cmd'?'Commande':'Événement'}</span></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">Aucune échéance à venir</div>`}
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
   OPTIMISATION DES ACHATS — Comparateur fournisseurs
   Pour chaque matière approvisionnée chez ≥2 fournisseurs, compare le
   prix unitaire du lot le plus récent de chaque fournisseur et recommande
   le moins cher. Réutilise lotPU() (gère prix manquant / division par 0).
   Optimisé : 1 seul scan des lots, regroupement en Map (pas de boucles imbriquées).
   ============================================================ */
async function getSupplierRecommendations(){
  // chargement groupé (3 lectures, pas de requête par matière)
  const [materials, suppliers, lots] = await Promise.all([
    db.materials.toArray(), db.suppliers.toArray(), db.materialLots.toArray()
  ]);
  const matName = new Map(materials.map(m=>[m.id, m]));
  const supName = new Map(suppliers.map(s=>[s.id, s.nom]));
  // 1) Regroupe les lots par matière → par fournisseur, en un seul passage.
  //    byMat: Map(materialId -> Map(supplierId -> lotLePlusRecent))
  const byMat = new Map();
  for(const l of lots){
    if(l.materialId==null || !l.supplierId) continue;       // ignore lots sans fournisseur
    let perSup = byMat.get(l.materialId);
    if(!perSup){ perSup = new Map(); byMat.set(l.materialId, perSup); }
    const cur = perSup.get(l.supplierId);
    // « plus récent » = dateReception la plus grande, départage par id le plus élevé
    const newer = !cur
      || (l.dateReception||'') > (cur.dateReception||'')
      || ((l.dateReception||'')===(cur.dateReception||'') && (l.id||0) > (cur.id||0));
    if(newer) perSup.set(l.supplierId, l);
  }
  // 2) Pour chaque matière avec ≥2 fournisseurs distincts : prix unitaires + classement.
  const reco = [];
  for(const [materialId, perSup] of byMat){
    if(perSup.size < 2) continue;                            // besoin d'au moins 2 fournisseurs
    const mat = matName.get(materialId) || {nom:'Matière #'+materialId, unite:''};
    const offres = [];
    for(const [supplierId, lot] of perSup){
      const pu = lotPU(lot);                                 // gère qte 0 / prix absent → 0
      if(!(pu>0)) continue;                                  // on écarte les offres sans prix exploitable
      offres.push({ supplierId, fournisseur: supName.get(supplierId) || 'Fournisseur #'+supplierId,
        prixUnitaire: money2(pu), dateReception: lot.dateReception||'', lotId: lot.id });
    }
    if(offres.length < 2) continue;                          // <2 offres chiffrables → pas de comparaison
    offres.sort((a,b)=> a.prixUnitaire - b.prixUnitaire);    // du moins cher au plus cher
    const meilleur = offres[0];
    const pire = offres[offres.length-1];
    const economieEuro = money2(pire.prixUnitaire - meilleur.prixUnitaire);
    const economiePct = pire.prixUnitaire>0 ? Math.round(economieEuro/pire.prixUnitaire*100) : 0;
    reco.push({
      materialId, matiere: mat.nom, unite: mat.unite||'kg',
      meilleur, alternatives: offres.slice(1),
      pire, economieEuro, economiePct,
      belleEconomie: economiePct >= 10        // seuil « belle économie » → badge vert
    });
  }
  // tri : plus grosse économie en % d'abord (les opportunités en tête)
  reco.sort((a,b)=> b.economiePct - a.economiePct);
  return reco;
}

async function renderAchats(){
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Optimisation des achats</h1><p>Comparateur de prix par fournisseur</p></div></div>
   <div id="achatsBody"><div class="banner">🛒 <div>Analyse des prix d'achat…</div></div></div>`;
  const box=document.getElementById('achatsBody');
  let reco; try{ reco=await getSupplierRecommendations(); }
  catch(e){ box.innerHTML=`<div class="banner" style="background:#fdf3f2;border-color:#e5b4ae">⛔ <div>Erreur : ${esc(e.message||'analyse impossible')}</div></div>`; return; }
  if(!reco.length){
    box.innerHTML=`<div class="empty">Aucune comparaison disponible.<br><span style="font-size:.82rem">Il faut au moins une matière achetée chez 2 fournisseurs différents (avec prix renseignés) pour comparer.</span></div>`;
    return;
  }
  // total des économies potentielles (indicatif, par unité)
  const cards = reco.map(r=>{
    const u=esc(r.unite);
    const alt = r.alternatives.map(a=>{
      const plusCher = a===r.pire && r.alternatives.length>0;
      return `<div class="achat-alt">
        <span class="achat-alt-sup">⚠️ ${esc(a.fournisseur)}</span>
        <span class="achat-alt-prix" style="color:${plusCher?'var(--red,#b3261e)':'#7a6a62'}">${euro(a.prixUnitaire)} / ${u}</span></div>`;
    }).join('');
    return `<div class="achat-card">
      <div class="achat-head">
        <span class="achat-mat">${esc(r.matiere)}</span>
        ${r.belleEconomie?`<span class="tag" style="background:var(--green,#3f7d52);color:#fff">−${r.economiePct}% 💰</span>`:`<span class="tag">${r.economiePct>0?'−'+r.economiePct+'%':'≈'}</span>`}
      </div>
      <div class="achat-best">
        <span class="achat-best-sup">🏆 ${esc(r.meilleur.fournisseur)}</span>
        <span class="achat-best-prix">${euro(r.meilleur.prixUnitaire)} / ${u}</span>
      </div>
      ${alt}
      ${r.economieEuro>0?`<div class="achat-eco">Économie : <b>${euro(r.economieEuro)} / ${u}</b> vs le plus cher (${esc(r.pire.fournisseur)})</div>`:''}
    </div>`;
  }).join('');
  const nbBelles = reco.filter(r=>r.belleEconomie).length;
  box.innerHTML = `${nbBelles?`<div class="banner" style="background:#eef6ee;border-color:#bcdcc0">✅ <div><b>${nbBelles} opportunité(s)</b> d'économie ≥ 10 % détectée(s). Compare les prix avant ta prochaine commande.</div></div>`:''}${cards}`;
}


/* ============================================================
   MATIÈRES & LOTS
   ============================================================ */
let matSearch='';
let _matCatFilter='all';   // 'all' | 'denree' | 'emballage'
let _matCache=null, _lotCache=null;
async function renderMaterials(){
  // Tri alphabétique STRICT par nom, insensible à la casse et aux accents,
  // indépendant de l'ordre de saisie (l'index IndexedDB trie mal les accents/majuscules).
  const mats = (await db.materials.toArray())
    .sort((a,b)=> normTxt(a.nom||'').localeCompare(normTxt(b.nom||''), 'fr', {numeric:true}));
  window._allMatsCache = mats;   // cache pour le coût emballage réel (calculs synchrones)
  // précalcul du stock par matière (une seule passe sur les lots)
  const allLots = await db.materialLots.toArray();
  const stockBy={}, dlcBy={}, nbBy={};
  allLots.forEach(l=>{ const id=l.materialId; if(!(id in stockBy)){stockBy[id]=0;nbBy[id]=0;}
    const r=+l.qteRestante||0; stockBy[id]+=r;
    if(r>0){ nbBy[id]++; if(l.dlc && (!dlcBy[id]||l.dlc<dlcBy[id])) dlcBy[id]=l.dlc; } });
  _matCache = mats.map(mat=>{
    const total=stockBy[mat.id]||0, dlcMin=dlcBy[mat.id]||null, nbLots=nbBy[mat.id]||0;
    const low = total<=(+mat.seuil||0);
    const cat = mat.categorie||'denree';
    const prim = normTxt(mat.nom||'');
    const blob = normTxt([mat.nom, mat.marque, mat.unite, mat.ref, cat==='emballage'?'emballage':'denree', low?'à commander':'ok'].filter(Boolean).join(' '));
    return {mat, total, dlcMin, nbLots, low, cat, _prim:prim, _blob:blob, _digits:''};
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

  // Historique consommation : regroupé PAR BATCH (1 recette = 1 titre + ses ingrédients).
  // Les batchs supprimés n'ont plus de prodConsumption (nettoyés à la suppression) ; par
  // sécurité on ignore aussi toute conso dont la production n'existe plus.
  const lotById = id => allLots.find(l=>l.id===id);
  const allProds = await db.productions.toArray();
  const prodById = id => allProds.find(p=>p.id===id);
  const recipes = await db.recipes.toArray();
  const recName = id => (recipes.find(r=>r.id===id)||{}).produitNom||'—';
  const matCatById = id => (mats.find(m=>m.id===id)||{}).categorie||'denree';
  const conso = await db.prodConsumption.toArray();
  // Consommables non rattachés à un batch (papier sulfurisé, film étirable, emballages…)
  const isConsumable = (matId)=>{
    const m = mats.find(x=>x.id===matId);
    if(!m) return false;
    if((m.categorie||'denree')==='emballage') return true;
    return /sulfuris|papier|film|cellophane|étirable|etirable|aluminium|alu\b/i.test(m.nom||'');
  };
  // Regroupe par batch (production existante uniquement)
  const batchMap = new Map();
  const consumablesAgg = new Map(); // matId -> total (hors batch)
  for(const c of conso){
    const lot = lotById(c.materialLotId);
    const matId = lot ? lot.materialId : (c.snapMaterialId||null);
    if(isConsumable(matId)){
      const prev=consumablesAgg.get(matId)||0; consumablesAgg.set(matId, prev+(+c.qteConsommee||0));
      continue;
    }
    const prod = prodById(c.productionId);
    if(!prod) continue; // batch supprimé → on n'affiche pas
    if(!batchMap.has(prod.id)) batchMap.set(prod.id, {prod, items:[]});
    batchMap.get(prod.id).items.push({
      materialId: matId,
      lotFournisseur: lot ? lot.lotFournisseur : (c.snapLotFournisseur||'(lot archivé)'),
      qte: c.qteConsommee
    });
  }
  // Tri des batchs : du plus récent au plus ancien (par heure de fab. ou date)
  const tsOf = p => p.prodTermineTs || p.prodDebutTs || p.prodTimestamp || (p.date?p.date+'T00:00':'');
  const batches = Array.from(batchMap.values())
    .sort((a,b)=> String(tsOf(b.prod)).localeCompare(String(tsOf(a.prod)))).slice(0,30);
  const consumablesList = Array.from(consumablesAgg.entries()).map(([id,total])=>({id,total}))
    .sort((a,b)=> (matName(a.id)||'').localeCompare(matName(b.id)||''));

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Matières & emballages</h1><p id="matCount">${mats.length} référence(s)</p></div>
     <div class="flex"><button class="btn gold" onclick="lotForm()">↘ Réception lot</button><button class="btn" onclick="matForm()">+ Référence</button></div></div>
   <div class="panel"><h2>Inventaire (stock = somme des lots actifs)</h2>
     <div class="mat-cat-chips">
       <button class="${_matCatFilter==='all'?'active':''}" onclick="matSetCat('all')">Tout</button>
       <button class="${_matCatFilter==='denree'?'active':''}" onclick="matSetCat('denree')">🥚 Denrées</button>
       <button class="${_matCatFilter==='emballage'?'active':''}" onclick="matSetCat('emballage')">📦 Emballages</button>
     </div>
     <input class="search" id="matSearch" style="width:100%;margin-bottom:12px" placeholder="Nom de référence, unité, état…" value="${esc(matSearch)}" oninput="matFilter(this.value)" autocomplete="off" autocapitalize="off" autocorrect="off">
   ${mats.length?`<div class="table-wrap"><table><thead><tr><th>Référence</th><th>Cat.</th><th>Stock</th><th>Seuil</th><th>Lots</th><th>DLC la + proche</th><th>État</th><th></th></tr></thead>
     <tbody id="matBody"></tbody></table></div><div id="matEmpty" class="empty" style="display:none">Aucune référence.</div>`:`<div class="empty">Aucune matière. Crée d'abord tes matières (poudre d'amande, sucre…) et tes emballages, puis réceptionne des lots.</div>`}
   </div>
   <div class="panel"><h2>Lots réceptionnés</h2>
     <input class="search" id="lotSearch" style="width:100%;margin-bottom:12px" placeholder="N° de lot, matière, fournisseur…" value="${esc(lotSearch)}" oninput="lotFilter(this.value)" autocomplete="off" autocapitalize="off" autocorrect="off">
   ${lots.length?`<div class="table-wrap"><table><thead><tr><th>Réception</th><th>Matière</th><th>N° lot fourn.</th><th>Fournisseur</th><th>Restant / Initial</th><th>DLC</th><th></th></tr></thead>
     <tbody id="lotBody"></tbody></table></div><div id="lotEmpty" class="empty" style="display:none">Aucun lot.</div>`
     :`<div class="empty">Aucun lot réceptionné.</div>`}
   </div>
   <div class="panel"><h2>Matières consommées par batch</h2>
   ${batches.length?collapseList(batches.map(b=>{
     const p=b.prod;
     const deb = p.prodDebutTs||p.prodTimestamp||'';
     const fin = p.prodTermineTs||'';
     const dur = (deb&&fin)?ttFormat(new Date(fin)-new Date(deb)):'';
     const compTag = prodComposant(p)!=='complet'?` <span class="tag" style="background:${prodComposant(p)==='assemble'?'#3f7d52':prodComposant(p)==='degustation'?'#caa23b':'#8a6d3b'};color:#fff;font-size:.66rem">${prodComposant(p)==='coques'?'coques':prodComposant(p)==='ganache'?'ganache':prodComposant(p)==='degustation'?'dégustation':'assemblé'}</span>`:'';
     return `<div class="trace-step" style="margin-bottom:12px">
       <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
         <div><b>${esc(recName(p.recipeId))}</b>${compTag}<br>
           <span style="color:#9a8a82;font-size:.78rem">lot ${esc(p.lotProduction||('#'+p.id))}</span></div>
         <button class="btn ghost sm" onclick="closeModal&&closeModal();traceProd(${p.id})" title="Détail du batch">🔎</button>
       </div>
       <div style="font-size:.8rem;color:#6b5a52;margin:4px 0 6px">
         ⏱ ${deb?`Début ${fmtDateTime(deb)}`:'Début —'}${fin?` · Fin ${fmtDateTime(fin)}`:(prodStatut(p)==='demarre'?' · <span class="tag event" style="font-size:.62rem">en cours</span>':'')}${dur?` · durée ${dur}`:''}
         <button class="btn ghost sm" style="margin-left:6px;padding:1px 7px" onclick="prodEditTimes(${p.id})">✎ Heures</button>
       </div>
       ${b.items.map(it=>`<div style="display:flex;justify-content:space-between;font-size:.85rem;padding:2px 0;border-top:1px solid #f0e8da">
         <span>${esc(matName(it.materialId))} <span style="color:#9a8a82">· lot ${esc(it.lotFournisseur||'—')}</span></span>
         <span class="tag out">−${qty(it.qte)} ${esc(matUnit(it.materialId))}</span></div>`).join('')}
     </div>`;
   }), 1, {moreLabel:n=>`Voir les ${n} batch(s) précédent(s)`, lessLabel:'Réduire'}):`<div class="empty">Aucune consommation rattachée à un batch.</div>`}
   </div>
   ${consumablesList.length?`<div class="panel"><h2>Consommables <span style="font-weight:400;font-size:.8rem;color:#9a8a82">— non rattachés à un batch (papier, film, emballages…)</span></h2>
     <div class="table-wrap"><table><thead><tr><th>Consommable</th><th>Total consommé</th></tr></thead><tbody>
     ${consumablesList.map(c=>`<tr><td><b>${esc(matName(c.id))}</b></td><td><span class="tag out">−${qty(c.total)} ${esc(matUnit(c.id))}</span></td></tr>`).join('')}
     </tbody></table></div></div>`:''}`;
  matFilter(matSearch);
  lotFilter(lotSearch);
}
function _matRow(row){
  const mat=row.mat; const dj=row.dlcMin?daysTo(row.dlcMin):null;
  const emb = row.cat==='emballage';
  return `<tr>
    <td><b>${esc(mat.nom)}</b>${mat.marque?`<br><span style="color:#9a8a82;font-size:.74rem">🏷️ ${esc(mat.marque)}</span>`:''}</td>
    <td><span class="tag" style="background:${emb?'#7a6a9a':'#6aa3a0'};color:#fff">${emb?'📦':'🥚'}</span></td>
    <td>${qty(row.total)} ${esc(mat.unite||'')}</td>
    <td>${qty(mat.seuil||0)} ${esc(mat.unite||'')}</td>
    <td>${row.nbLots}</td>
    <td>${emb?'—':(row.dlcMin?`${fmtDate(row.dlcMin)} ${dj!==null&&dj<=7?`<span class="tag warn">${dj<=0?'expiré':dj+' j'}</span>`:''}`:'—')}</td>
    <td><span class="tag ${row.low?'low':'ok'}">${row.low?'À commander':'OK'}</span></td>
    <td><div class="qa-row">
      <button class="qa pay" onclick="lotForm(0,${mat.id})" title="Ajouter un lot">＋ Lot</button>
      <button class="qa edit" onclick="matForm(${mat.id})" title="Modifier">✎ Modifier</button>
      <button class="qa del" onclick="delMat(${mat.id})" title="Supprimer">🗑</button>
    </div></td></tr>`;
}
function _lotRow(row){
  const l=row.l;
  const idtxt = l.refProduit ? esc(l.refProduit) : (l.commentaire?`<span style="color:#9a8a82">${esc(l.commentaire)}</span>`:(esc(l.lotFournisseur||'—')));
  return `<tr>
    <td>${fmtDate(l.dateReception)}</td><td>${esc(row.matName)}</td>
    <td>${idtxt}</td><td>${esc(row.supName)}</td>
    <td>${qty(l.qteRestante)} / ${qty(l.qteInitiale)}</td><td>${fmtDate(l.dlc)}</td>
    <td><div class="qa-row"><button class="qa del" onclick="delLot(${l.id})" title="Supprimer le lot">🗑 Suppr.</button></div></td></tr>`;
}
function matSetCat(c){ _matCatFilter=c; renderMaterials(); }
function matFilter(q){
  matSearch=q||'';
  if(!_matCache) return;
  const list = _matCatFilter==='all' ? _matCache : _matCache.filter(r=>r.cat===_matCatFilter);
  searchRenderBody('matBody','matCount','matEmpty', list, q, _matRow, 8, 'référence(s)');
}
let lotSearch='';
function lotFilter(q){
  lotSearch=q||'';
  if(!_lotCache) return;
  searchRenderBody('lotBody','__noop','lotEmpty', _lotCache, q, _lotRow, 7, 'lot(s)', 5);
}
async function matForm(id){
  const s = id ? await db.materials.get(id) : {unite:'kg', categorie:'denree'};
  const cat = s.categorie || 'denree';
  const isEmb = cat==='emballage';
  // Denrées alimentaires : tout au KILOGRAMME (prix, stock, recettes) pour une lecture homogène.
  // Emballages : à l'unité.
  openModal(`<h3>${id?'Modifier':'Nouvelle'} ${isEmb?'emballage':'matière'}</h3>
   <div class="field"><label>Catégorie</label>
     <select id="f_cat" onchange="matCatSwitch(this.value)">
       <option value="denree" ${cat==='denree'?'selected':''}>Denrée alimentaire</option>
       <option value="emballage" ${cat==='emballage'?'selected':''}>Emballage</option>
     </select></div>
   <div class="field"><label>Nom</label><input id="f_nom" value="${esc(s.nom)}" placeholder="${isEmb?'ex : Boîte 8 macarons kraft':'ex : Poudre amande'}"></div>
   <div class="field"><label>Marque du produit <span style="color:#9a8a82;font-weight:400">— optionnel (ex : Valrhona)</span></label><input id="f_marque" value="${esc(s.marque||'')}" placeholder="${isEmb?'ex : marque de l’emballage':'ex : Valrhona'}"></div>
   <div class="row2">
     <div class="field" id="f_uniteWrap"><label>Unité</label>
       <select id="f_unite" ${isEmb?'':'disabled'}>${(isEmb?['unité','sachet']:['kg']).map(u=>`<option ${ (s.unite===u)||(!isEmb&&u==='kg')?'selected':''}>${u}</option>`).join('')}</select>
       <p class="note" id="uniteNote" style="margin-top:4px">${isEmb?'Emballages : comptés à l’unité.':'Les denrées sont gérées <b>au kilogramme</b> (prix, stock et recettes en kg).'}</p></div>
     <div class="field"><label>Seuil d'alerte ${isEmb?'(unités)':'(kg)'}</label><input type="number" step="0.01" id="f_seuil" value="${s.seuil||0}"></div>
   </div>
   <div class="field"><label>${isEmb?'Prix indicatif / unité (€)':'Prix indicatif au kilo (€/kg)'}</label><input type="number" step="0.01" id="f_prix" value="${s.prixDefaut||0}"></div>
   <div class="field" id="f_capWrap" style="${isEmb?'':'display:none'}"><label>Capacité (nb de macarons) <span style="color:#9a8a82;font-weight:400">— relie l'emballage à un format de coffret</span></label>
     <input type="number" min="0" step="1" id="f_cap" value="${s.capacite!=null?esc(s.capacite):''}" placeholder="ex : 8"></div>
   <div id="f_periWrap" style="${isEmb?'display:none':''}">
     <label class="switch-row"><input type="checkbox" id="f_peri" ${s.perissableOuvert?'checked':''} onchange="matPeriSwitch(this.checked)"> Périssable une fois ouvert (crème, lait…)</label>
     <div class="field" id="f_periDaysWrap" style="${s.perissableOuvert?'':'display:none'}"><label>Durée après ouverture (jours) <span style="color:#9a8a82;font-weight:400">— DLC déclenchée dès la 1ʳᵉ utilisation en production</span></label>
       <input type="number" min="1" step="1" id="f_periDays" value="${s.joursApresOuverture!=null?s.joursApresOuverture:7}" placeholder="7"></div>
   </div>
   <p class="note">Le stock réel se gère par <b>lots</b> (bouton « Réception lot »). Ici tu définis seulement ${isEmb?"l'emballage":'la matière'} et son seuil.</p>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveMat(${id||0})">Enregistrer</button></div>`);
}
// Bascule unité/champs selon la catégorie. Denrée → kg verrouillé ; emballage → unité.
function matCatSwitch(cat){
  const u=document.getElementById('f_unite');
  const note=document.getElementById('uniteNote');
  if(u){
    if(cat==='emballage'){
      u.disabled=false;
      u.innerHTML=['unité','sachet'].map(x=>`<option ${x==='unité'?'selected':''}>${x}</option>`).join('');
      if(note) note.innerHTML='Emballages : comptés à l’unité.';
    } else {
      u.innerHTML='<option selected>kg</option>'; u.value='kg'; u.disabled=true;
      if(note) note.innerHTML='Les denrées sont gérées <b>au kilogramme</b> (prix, stock et recettes en kg).';
    }
  }
  const cw=document.getElementById('f_capWrap'); if(cw) cw.style.display = cat==='emballage' ? 'block' : 'none';
  const pw=document.getElementById('f_periWrap'); if(pw) pw.style.display = cat==='emballage' ? 'none' : 'block';
  // met à jour le libellé du prix
  const prixField=document.getElementById('f_prix');
  if(prixField){ const lab=prixField.closest('.field')?.querySelector('label');
    if(lab) lab.textContent = cat==='emballage' ? 'Prix indicatif / unité (€)' : 'Prix indicatif au kilo (€/kg)'; }
  const seuilLab=document.getElementById('f_seuil')?.closest('.field')?.querySelector('label');
  if(seuilLab) seuilLab.textContent = cat==='emballage' ? "Seuil d'alerte (unités)" : "Seuil d'alerte (kg)";
}
function matPeriSwitch(on){ const d=document.getElementById('f_periDaysWrap'); if(d) d.style.display = on?'block':'none'; }
async function saveMat(id){
  const isEmb = val('f_cat')==='emballage';
  const peri = !isEmb && document.getElementById('f_peri')?.checked;
  const unite = isEmb ? (val('f_unite')||'unité') : 'kg';   // denrées toujours en kg
  const o={nom:val('f_nom'),marque:(val('f_marque')||'').trim(),unite,seuil:+val('f_seuil')||0,prixDefaut:+val('f_prix')||0,
    categorie: isEmb?'emballage':'denree', capacite: isEmb ? (+val('f_cap')||0) : undefined,
    perissableOuvert: !!peri, joursApresOuverture: peri ? (Math.max(1,+val('f_periDays')||7)) : undefined};
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
  const mat = await db.materials.get(id);
  if(!mat){ toast('Matière introuvable'); return; }
  // Garde-fou : une matière utilisée dans une ou plusieurs recettes ne peut pas être supprimée.
  const usedItems = await db.recipeItems.where('materialId').equals(id).toArray().catch(()=>[]);
  if(usedItems.length){
    const recIds = [...new Set(usedItems.map(it=>it.recipeId))];
    const recs = await db.recipes.toArray();
    const recNoms = recIds.map(rid=>{ const r=recs.find(x=>x.id===rid); return r?(r.produitNom||('recette #'+rid)):('recette #'+rid); });
    openModal(`<h3>Suppression impossible</h3>
      <div class="banner" style="background:#f6e3e0;border-color:var(--red,#b3261e);color:#7a2a20">⛔ <div><b>${esc(mat.nom)}</b> est utilisée dans ${recIds.length} recette(s) : <b>${esc([...new Set(recNoms)].join(', '))}</b>.<br>Retirez d'abord cette matière de ces recettes avant de la supprimer.</div></div>
      <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`);
    return;
  }
  const nbLots = await db.materialLots.where('materialId').equals(id).count();
  openModal(`<h3>🗑 Supprimer la matière</h3>
    <p style="margin-bottom:10px"><b>${esc(mat.nom)}</b>${nbLots?` — ${nbLots} lot(s) seront aussi supprimés.`:''}</p>
    <p class="note">Cette action est définitive.</p>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn danger" onclick="doDelMat(${id})">🗑 Supprimer</button>
    </div>`);
}
async function doDelMat(id){
  // Re-vérification anti-concurrence : la matière a-t-elle été ajoutée à une recette entre-temps ?
  const stillUsed = await db.recipeItems.where('materialId').equals(id).count().catch(()=>0);
  if(stillUsed){ closeModal(); toast('Matière désormais utilisée dans une recette — suppression annulée'); renderMaterials(); return; }
  await db.transaction('rw',db.materials,db.materialLots,async()=>{
    await db.materialLots.where('materialId').equals(id).delete();
    await db.materials.delete(id);
  });
  closeModal();
  renderMaterials();
  toast('Matière supprimée');
}
async function lotForm(_id, presetMat){
  const mats = await db.materials.toArray();
  const sups = await db.suppliers.toArray();
  if(!mats.length){toast('Crée d\'abord une matière');return;}
  const matOpts = mats.map(m=>`<option value="${m.id}" data-unite="${esc(m.unite)}" data-emb="${m.categorie==='emballage'?1:0}" ${presetMat===m.id?'selected':''}>${esc(m.nom)}${m.marque?' — '+esc(m.marque):''} (${esc(m.unite)})</option>`).join('');
  const supOpts = `<option value="0">— non précisé —</option>`+sups.map(s=>`<option value="${s.id}">${esc(s.nom)}</option>`).join('');
  openModal(`<h3>Réception d'un lot</h3>
   <div class="field"><label>Matière</label><select id="f_mat" onchange="majPrixUnit()">${matOpts}</select></div>
   <div class="row2">
     <div class="field"><label>Fournisseur</label><select id="f_sup">${supOpts}</select></div>
     <div class="field"><label>N° lot fournisseur</label><input id="f_lotf" placeholder="ex: NM-2026-0142"></div>
   </div>
   <div class="row2">
     <div class="field"><label>Quantité reçue <span id="qteUniteHint" style="color:#9a8a82;font-weight:400"></span></label><input type="number" step="0.01" id="f_qte" value="1" oninput="majPrixUnit()"></div>
     <div class="field"><label>Prix total payé (€)</label><input type="number" step="0.01" id="f_prix" value="0" oninput="majPrixUnit()"></div>
   </div>
   <div class="field"><label>Prix unitaire</label><div id="f_pu" style="padding:10px 12px;background:var(--creme-2);border-radius:10px;font-weight:600;color:var(--bordeaux)">—</div></div>
   <div class="row2">
     <div class="field"><label>Date réception</label><input type="date" id="f_date" value="${today()}"></div>
     <div class="field" id="f_dlcWrap"><label>DLC / DDM</label><input type="date" id="f_dlc"></div>
   </div>
   <div class="field"><label>Référence produit <span style="color:#9a8a82;font-weight:400">— EAN / code article (si disponible)</span></label>
     <input id="f_ref" placeholder="ex : 3760123456789 ou ART-BTE08"></div>
   <div class="field"><label>Commentaire d'identification <span style="color:#9a8a82;font-weight:400">— utile si pas de référence</span></label>
     <input id="f_comm" placeholder="ex : Boîte kraft 8 macarons, couvercle transparent"></div>
   <p class="note">Chaque réception crée un lot tracé. Le <b>prix unitaire</b> est calculé automatiquement et alimente le suivi des prix et de la rentabilité. La production puise dans les lots par <b>DLC la plus proche d'abord (FIFO)</b>.</p>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn gold" onclick="saveLot()">Réceptionner</button></div>`);
  majPrixUnit();
}
function majPrixUnit(){
  const q=+val('f_qte'), p=+val('f_prix');
  const el=document.getElementById('f_pu'); if(!el)return;
  const sel=document.getElementById('f_mat');
  const opt = sel && sel.options[sel.selectedIndex];
  const unite = opt ? (opt.dataset.unite||'') : '';
  const hint=document.getElementById('qteUniteHint'); if(hint) hint.textContent = unite?`— en ${unite}`:'';
  // Emballages (carton, film…) : pas de DLC pertinente → on masque le champ.
  const isEmb = opt && opt.dataset.emb==='1';
  const dlcWrap=document.getElementById('f_dlcWrap');
  if(dlcWrap){
    dlcWrap.style.display = isEmb ? 'none' : '';
    if(isEmb){ const d=document.getElementById('f_dlc'); if(d) d.value=''; }   // pas de DLC sur un emballage
  }
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
    dateReception:val('f_date')||today(), dlc:val('f_dlc')||'',
    refProduit:val('f_ref')||'', commentaire:val('f_comm')||''
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
  // Coût de revient + rentabilité par parfum (indicateur visuel sur la fiche)
  const _lots = await db.materialLots.toArray();
  const _orders = await db.orders.toArray();
  const _markets = await db.markets.toArray();
  const _marketMoves = await db.marketMoves.toArray();
  const _productions = await db.productions.toArray();
  const _recipeItems = await db.recipeItems.toArray();
  const _settings = getSettings();
  const _A = analyzeFlavorProfitability({recipes, recipeItems:_recipeItems, lots:_lots, mats, orders:_orders, markets:_markets, marketMoves:_marketMoves, productions:_productions, settings:_settings});
  const _rowByRec = {}; _A.rows.forEach(r=>{ _rowByRec[r.recipeId]=r; });
  _recipeMultCache = {}; // {recipeId: {rendement, items:[{nom,unite,qteParBatch(affichée),base}]}}
  // Affichage : denrées (kg) → grammes ; autres → unité native.
  const dispOf = id => { const u=matUnit(id); const m=(mats.find(x=>x.id===id)||{}); const kg=(m.categorie!=='emballage'&&u==='kg'); return kg?{u:'g',f:1000}:{u,f:1}; };
  const blocks=[];
  for(const r of recipes){
    const items = await db.recipeItems.where('recipeId').equals(r.id).toArray();
    _recipeMultCache[r.id] = { rendement:+r.rendement||1,
      items: items.map(it=>{ const d=dispOf(it.materialId); return {nom:matName(it.materialId), unite:d.u, qteParBatch:round3((+it.qteParBatch||0)*d.f)}; }) };
    const rows = items.map((it,idx)=>{ const d=dispOf(it.materialId); const shown=round3((+it.qteParBatch||0)*d.f);
      const tags=[it.partie?(it.partie==='coque'?'coque':'ganache'):'', it.etiquette||''].filter(Boolean).join(' · ');
      return `<tr>
        <td>${esc(matName(it.materialId))}${tags?` <span style="color:#9a8a82;font-size:.74rem">(${esc(tags)})</span>`:''}</td>
        <td>${qty(shown)} ${esc(d.u)}</td>
        <td id="mult_${r.id}_${idx}"><b>${qty(shown)}</b> ${esc(d.u)}</td>
      </tr>`; }).join('');
    blocks.push(`<div class="panel"><h2>${esc(r.produitNom)} ${r.grandFormat?'<span class="tag" style="background:#8a6d3b;color:#fff;font-size:.62rem">🍪 grand format</span> ':''}<span style="font-weight:400;font-size:.85rem;color:#9a8a82">— rendement ${r.rendement} / batch</span>
      <span><span class="act" onclick="recForm(${r.id})">Modifier</span><span class="act del" onclick="delRec(${r.id})">Suppr.</span></span></h2>
      ${(()=>{ const rr=_rowByRec[r.id]; if(!rr) return ''; const c=rr.cost;
        return `<div class="sum-box" style="margin:0 0 8px"><span>Coût de revient ${euro(c.coutRevientUnit)}/pc${rr.prixVenteMoyen!=null?` · vente moy. ${euro(rr.prixVenteMoyen)} · marge ${rr.margeUnit!=null?euro(rr.margeUnit):'—'}`:''}</span>
          <b><span class="tag" style="background:${rr.scale.col};color:#fff">${rr.scale.dot} ${rr.tauxMarge!=null?rr.tauxMarge+'%':'coût seul'}</span></b></div>`; })()}
      ${(r.allergenes&&r.allergenes.length)?`<div class="note" style="margin:0 0 8px"><b>Allergènes :</b> ${r.allergenes.map(a=>esc(a)).join(' · ')}</div>`:'<div class="note" style="margin:0 0 8px;color:#b08a3a">⚠ Allergènes non renseignés</div>'}
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
  if(id){ r=await db.recipes.get(id); bomDraft=(await db.recipeItems.where('recipeId').equals(id).toArray()).map(it=>({materialId:it.materialId,qteParBatch:it.qteParBatch,partie:it.partie||'',etiquette:it.etiquette||''})); }
  window._matsCache=mats;
  openModal(`<h3>${id?'Modifier':'Nouvelle'} recette</h3>
   <div class="row2">
     <div class="field"><label>Nom du produit</label><input id="f_nom" value="${esc(r.produitNom)}" placeholder="Macaron vanille"></div>
     <div class="field"><label>Rendement (nb par batch)</label><input type="number" id="f_rend" value="${r.rendement||60}"></div>
   </div>
   <label class="switch-row"><input type="checkbox" id="f_gf" ${r.grandFormat?'checked':''}> 🍪 Recette <b>grand format</b> (macaron à l'unité — stock séparé des petits)</label>
   <div class="field"><label>Allergènes <span style="color:#9a8a82;font-weight:400">— information obligatoire pour la vente</span></label>
     <div class="allergen-chips">${ALLERGENS.map(a=>{
       const on=(r.allergenes||[]).includes(a);
       return `<button type="button" class="allergen-chip${on?' on':''}" data-a="${esc(a)}" onclick="this.classList.toggle('on')">${esc(a)}</button>`;
     }).join('')}</div>
   </div>
   <div class="field"><label>Composition (par batch)</label><div id="bomList"></div>
     <button class="btn ghost sm" style="margin-top:6px" onclick="bomAdd()">+ Ajouter une matière</button></div>
   <details style="margin:10px 0"><summary style="cursor:pointer;color:var(--caramel,#AA7C39);font-weight:600">Coût de revient avancé (optionnel)</summary>
     <div class="row2" style="margin-top:8px">
       <div class="field"><label>Pertes / casse (%)</label><input type="number" step="0.5" min="0" max="90" id="f_perte" value="${r.pertePct!=null?r.pertePct:0}" placeholder="ex : 5"></div>
       <div class="field"><label>Temps de main-d'œuvre (min/batch)</label><input type="number" step="1" min="0" id="f_mod" value="${r.minParBatch!=null?r.minParBatch:0}" placeholder="ex : 90"></div>
     </div>
     <div class="field"><label>Consommables par pièce (€) <span style="color:#9a8a82;font-weight:400">— insert, étiquette, caissette…</span></label><input type="number" step="0.001" min="0" id="f_conso" value="${r.coutConsoUnit!=null?r.coutConsoUnit:0}" placeholder="ex : 0.05"></div>
     <div class="field"><label>Poids de garniture par macaron (g) <span style="color:#9a8a82;font-weight:400">— pour l'assistant de production</span></label><input type="number" step="0.1" min="0" id="f_garn" value="${r.poidsGarnitureUnit!=null?r.poidsGarnitureUnit:''}" placeholder="ex : 7"></div>
     <p class="note">Pertes : réduit le nombre de pièces vendables (augmente le coût/pièce). Main-d'œuvre : ajoutée au coût de revient uniquement si activée dans les paramètres (taux horaire global). Consommables : coût direct par macaron.</p>
   </details>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveRec(${id||0})">Enregistrer</button></div>`);
  drawBom();
}
// Unité d'affichage/saisie d'une matière en recette :
//  - denrée (stockée en kg) → saisie en GRAMMES (facteur 1000)
//  - emballage / autre      → unité native (facteur 1)
function bomDisplay(materialId){
  const mats=window._matsCache||[];
  const m=mats.find(x=>x.id===materialId);
  const isKg = m && (m.categorie!=='emballage') && (m.unite==='kg');
  return { unit: isKg?'g':(m?m.unite:''), factor: isKg?1000:1 };
}
function drawBom(){
  const mats=window._matsCache||[];
  // Compte les occurrences de chaque matière, et repère les doublons sur la MÊME phase (vraie erreur).
  const countMat={}, countMatPart={};
  bomDraft.forEach(b=>{ countMat[b.materialId]=(countMat[b.materialId]||0)+1;
    const k=b.materialId+'|'+(b.partie||''); countMatPart[k]=(countMatPart[k]||0)+1; });
  document.getElementById('bomList').innerHTML = bomDraft.map((b,i)=>{
    const d=bomDisplay(b.materialId);
    const shown = round3((+b.qteParBatch||0)*d.factor);   // kg → g pour l'affichage
    const part = b.partie||'';
    const multi = countMat[b.materialId]>1;                          // matière sur plusieurs lignes
    const conflit = part && countMatPart[b.materialId+'|'+part]>1;   // même matière + même phase = doublon réel
    const note = conflit
      ? `<span style="font-size:.66rem;color:var(--red,#b3261e);font-weight:600" title="Deux lignes de la même matière sur la même phase : fusionne-les ou change la phase">⚠ doublon ${part==='coque'?'coque':'ganache'}</span>`
      : (multi ? `<span style="font-size:.66rem;color:#9a8a82" title="Cette matière est répartie sur plusieurs phases (ex. eau coque + eau ganache) — c'est normal">↔ ${countMat[b.materialId]} lignes</span>` : '');
    return `
    <div class="bom-line">
      <select onchange="bomSetMat(${i}, +this.value)">
        ${mats.map(m=>`<option value="${m.id}" ${b.materialId===m.id?'selected':''}>${esc(m.nom)}${m.marque?' — '+esc(m.marque):''} (saisie en ${bomDisplay(m.id).unit})</option>`).join('')}
      </select>
      <input type="number" step="${d.factor===1000?'1':'0.001'}" value="${shown}" oninput="bomSetQte(${i}, +this.value)" placeholder="qté">
      <span style="font-size:.75rem;color:#9a8a82">${esc(d.unit)}/batch${note?'<br>'+note:''}</span>
      <select class="bom-part" onchange="bomSetPartie(${i}, this.value)" title="À quelle phase sert cet ingrédient ?">
        <option value="" ${part===''?'selected':''}>— phase —</option>
        <option value="coque" ${part==='coque'?'selected':''}>🟤 Coque</option>
        <option value="ganache" ${part==='ganache'?'selected':''}>🍫 Ganache</option>
      </select>
      <input type="text" class="bom-etiq" value="${esc(b.etiquette||'')}" oninput="bomSetEtiq(${i}, this.value)" placeholder="note (ex : chaude)" title="Étiquette libre, purement informative — sans effet sur le stock" maxlength="24">
      <span class="x" onclick="bomDel(${i})">×</span>
    </div>`; }).join('') || '<p class="note">Aucune matière ajoutée.</p>';
}
// Étiquette un ingrédient comme servant aux coques ou à la ganache (évite le double
// comptage lors d'une production par composants séparés).
function bomSetPartie(i, val){ if(bomDraft[i]){ bomDraft[i].partie = val||''; drawBom(); } }
// Étiquette LIBRE et purement informative (ex. « chaude », « froide »). N'a AUCUN effet sur
// la consommation de stock : deux lignes d'une même matière puisent dans le même stock,
// quelle que soit leur étiquette. Pas de redraw (préserve le focus pendant la frappe).
function bomSetEtiq(i, val){ if(bomDraft[i]){ bomDraft[i].etiquette = (val||'').slice(0,24); } }
// Saisie utilisateur (en g pour les denrées) → stockée en unité de base (kg).
function bomSetQte(i, shownVal){
  const d=bomDisplay(bomDraft[i].materialId);
  bomDraft[i].qteParBatch = round3((+shownVal||0)/d.factor);
}
// Changement de matière : on conserve la valeur affichée et on reconvertit dans la bonne unité.
function bomSetMat(i, newId){
  const oldD=bomDisplay(bomDraft[i].materialId);
  const shown = (+bomDraft[i].qteParBatch||0)*oldD.factor;   // valeur telle qu'affichée
  bomDraft[i].materialId=newId;
  const newD=bomDisplay(newId);
  bomDraft[i].qteParBatch = round3(shown/newD.factor);
  drawBom();
}
function bomAdd(){ const mats=window._matsCache||[]; bomDraft.push({materialId:mats[0].id,qteParBatch:bomDisplay(mats[0].id).factor===1000?0.001:1}); drawBom(); }
function bomDel(i){ bomDraft.splice(i,1); drawBom(); }
async function saveRec(id){
  const rend=+val('f_rend');
  if(!rend || rend<=0){toast('Le rendement doit être supérieur à 0');return;}
  const o={produitNom:val('f_nom'),rendement:rend,
    grandFormat: !!document.getElementById('f_gf')?.checked,
    allergenes: Array.from(document.querySelectorAll('.allergen-chip.on')).map(b=>b.dataset.a),
    pertePct: Math.max(0, Math.min(90, +val('f_perte')||0)),
    minParBatch: Math.max(0, +val('f_mod')||0),
    coutConsoUnit: Math.max(0, money2(+val('f_conso')||0)),
    poidsGarnitureUnit: Math.max(0, +val('f_garn')||0)};
  if(!o.produitNom){toast('Nom requis');return;}
  // Si aucun allergène coché mais que le parfum est connu, on pré-remplit automatiquement.
  if((!o.allergenes || !o.allergenes.length)){
    const auto = allergenesPourNom(o.produitNom);
    if(auto) o.allergenes = auto.slice();
  }
  if(!bomDraft.length){toast('Ajoute au moins une matière');return;}
  await db.transaction('rw',db.recipes,db.recipeItems,async()=>{
    let rid=id;
    if(id){ await db.recipes.update(id,o); await db.recipeItems.where('recipeId').equals(id).delete(); }
    else { rid=await db.recipes.add(o); }
    for(const b of bomDraft) await db.recipeItems.add({recipeId:rid,materialId:b.materialId,qteParBatch:b.qteParBatch,partie:b.partie||'',etiquette:b.etiquette||''});
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
let prodnSearch='';
let _prodnCache=null;
// Suggestions de rapprochement coques ↔ ganache (sous-lots non assemblés, avec stock).
// Priorité : même lot de base, puis même recette (parfum). Allocation gloutonne pour
// ne pas proposer deux fois la même ganache/coque.
function assemblySuggestions(prods, recName){
  recName = recName || (id=>String(id));
  const coques = prods.filter(p=>prodComposant(p)==='coques' && round3(+p.qteRestante)>0)
    .map(p=>({p, mac: Math.floor(round3(+p.qteRestante)/COQUES_PAR_MACARON)}))
    .filter(x=>x.mac>0);
  let ganaches = prods.filter(p=>prodComposant(p)==='ganache' && round3(+p.qteRestante)>0)
    .map(p=>({p, mac: round3(+p.qteRestante), used:0}));
  if(!coques.length || !ganaches.length) return [];
  const out=[];
  for(const c of coques){
    // cherche une ganache : même lotBase d'abord, puis même recette, puis n'importe laquelle
    const score = g => {
      const dispo = g.mac - g.used; if(dispo<=0) return -1;
      let s=0;
      if(c.p.lotBase && g.p.lotBase && c.p.lotBase===g.p.lotBase) s+=100;
      if(c.p.recipeId===g.p.recipeId) s+=10;
      return s;
    };
    let best=null, bestS=-1;
    for(const g of ganaches){ const sc=score(g); if(sc>bestS){ bestS=sc; best=g; } }
    if(!best || bestS<0) continue;
    const dispoGan = best.mac - best.used;
    const assemblable = Math.min(c.mac, dispoGan);
    if(assemblable<=0) continue;
    best.used += assemblable;
    out.push({
      coqId: c.p.id, ganId: best.p.id,
      coqRec: recName(c.p.recipeId), ganRec: recName(best.p.recipeId),
      coqLot: c.p.lotProduction||('#'+c.p.id), ganLot: best.p.lotProduction||('#'+best.p.id),
      coqMac: c.mac, ganMac: best.mac, assemblable,
      coqUnits: round3(+c.p.qteRestante),               // nb de COQUES physiques réelles en stock
      coquesNeeded: assemblable*COQUES_PAR_MACARON,      // coques réellement consommées par l'assemblage
      coquesReste: round3(round3(+c.p.qteRestante) - assemblable*COQUES_PAR_MACARON), // coques qui resteront (casse/impair)
      ganacheReste: round3((best.mac) - assemblable),    // ganaches qui resteront
      sameBase: !!(c.p.lotBase && best.p.lotBase && c.p.lotBase===best.p.lotBase),
      sameRec: c.p.recipeId===best.p.recipeId
    });
  }
  // les rapprochements "même lot / même parfum" d'abord
  out.sort((a,b)=> (b.sameBase-a.sameBase) || (b.sameRec-a.sameRec) || (b.assemblable-a.assemblable));
  return out;
}
async function renderProductions(){
  const prods = await db.productions.orderBy('date').reverse().toArray();
  const recipes = await db.recipes.toArray();
  const losses = await db.losses.toArray().catch(()=>[]);
  const kpi = await lossKPIs();
  const lossByProd = {}; losses.forEach(l=>{ lossByProd[l.productionId]=(lossByProd[l.productionId]||0)+(+l.qte||0); });
  const recName = id => (recipes.find(r=>r.id===id)||{}).produitNom||'(recette supprimée)';
  // Nom affiché d'une production : accepte soit l'objet production, soit un recipeId.
  // Pour une production « libre » (mode découverte), renvoie son nom saisi.
  const prodNom = arg => {
    if(arg && typeof arg==='object'){ return arg.libre ? (arg.produitLibre||'(sans nom)') : recName(arg.recipeId); }
    return recName(arg);
  };
  window._prodNom = prodNom;
  window._prodLossBy = lossByProd; window._prodRecName = prodNom;
  // Consommation matières par batch (pour le bloc « Stock consommé » en bas de l'écran).
  const _allMats = await db.materials.toArray();
  const _matById = {}; _allMats.forEach(m=>_matById[m.id]=m);
  const _matNameP = id => (_matById[id]||{}).nom || '(matière supprimée)';
  const _matUnitP = id => (_matById[id]||{}).unite || '';
  const _consoAll = await db.prodConsumption.toArray();
  const _consoByProd = new Map();
  _consoAll.forEach(c=>{
    const mid = c.snapMaterialId!=null ? c.snapMaterialId : (c.materialId!=null?c.materialId:null);
    if(!_consoByProd.has(c.productionId)) _consoByProd.set(c.productionId, {});
    const agg=_consoByProd.get(c.productionId);
    const key = mid+'|'+(c.snapLotFournisseur||'');
    if(!agg[key]) agg[key]={materialId:mid, lotFournisseur:c.snapLotFournisseur||'', qte:0};
    agg[key].qte = round3(agg[key].qte + (+c.qteConsommee||0));
  });
  // résumé rendement global (somme réel / somme théorique sur les batchs renseignés)
  const withBoth = prods.filter(p=>p.qteTheorique>0 && p.qteReelle!=null);
  const sumTh = withBoth.reduce((s,p)=>s+(+p.qteTheorique||0),0);
  const sumRe = withBoth.reduce((s,p)=>s+(+p.qteReelle||0),0);
  const rendePct = sumTh ? Math.round(sumRe/sumTh*1000)/10 : null;
  const ouvertes = prods.filter(p=>prodStatut(p)==='demarre');
  const enRetard = ouvertes.filter(prodOpenOverdue);
  // ---- SURVEILLANCE : coques & ganache non assemblées → suggestions de rapprochement ----
  const sugg = assemblySuggestions(prods, recName);
  // Anciens lots coques non convertis (quantité ≈ rendement au lieu de ×2) à signaler
  const _recById={}; recipes.forEach(r=>_recById[r.id]=r);
  const coquesSuspectsN = prods.filter(p=>{
    if(prodComposant(p)!=='coques' || p._coquesConverti) return false;
    const rec=_recById[p.recipeId]; const rend=+(rec&&rec.rendement)||0; if(rend<=0) return false;
    const ratio=(+p.qteTheorique||0)/rend; return ratio>0.7 && ratio<1.4;
  }).length;
  // index de recherche : lot, parfum/recette, date (plusieurs formats), emplacement (nom + LETTRE), statut
  _prodnCache = prods.map(p=>{
    const nom = prodNom(p);
    const e = empInfo(p.emplacement);
    const st = prodStatut(p)==='termine' ? 'terminée terminé' : 'démarrée en cours';
    const dateBlob = [p.date, fmtDate(p.date), (p.date||'').slice(0,7)].filter(Boolean).join(' ');
    // la LETTRE d'emplacement comme token isolé → une seule lettre suffit à filtrer
    const lettre = (e.lettre||'').toLowerCase();
    const prim = normTxt([nom, p.lotProduction||''].filter(Boolean).join(' '));
    const lotNoSep = (p.lotProduction||'').replace(/[-\s]/g,'');
    const blob = normTxt([nom, p.lotProduction, lotNoSep, e.nom, e.lettre, st, dateBlob,
      p.parentProdId?'partie':''].filter(Boolean).join(' '));
    return {p, _lettre:lettre, _prim:prim, _blob:blob, _digits:onlyDigits([p.lotProduction, p.id].filter(Boolean).join(' '))};
  });
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Productions</h1><p id="prodCount">${prods.length} batch(s) fabriqué(s)${rendePct!=null?` · rendement réel global ${rendePct}%`:''}${ouvertes.length?` · ${ouvertes.length} en cours`:''}</p></div>
     <button class="btn gold" onclick="prodForm()">⚙ Nouvelle production</button>
     <button class="btn ghost" style="margin-left:6px" onclick="quickLossForm()">⚠ Casse / Perte</button></div>
   ${kpi.count?`<div class="cards" style="margin-bottom:18px">
     <div class="card"><div class="lbl">Taux de perte</div><div class="val" style="color:${kpi.taux>=10?'#b3261e':(kpi.taux>=5?'#d98324':'#2e7d32')}">${kpi.taux}%</div><div class="sub">${qty(kpi.totalPerdu)} perdues / ${qty(kpi.totalProduit)} produites</div></div>
     <div class="card"><div class="lbl">Valeur perdue (casse)</div><div class="val">${euro(kpi.valeurPerdue)}</div><div class="sub">${kpi.count} déclaration(s) · imputé au coût de revient</div></div>
   </div>`:''}
   ${enRetard.length?`<div class="banner" style="background:#fdf3f2;border-color:#e5b4ae">⛔ <div><b>${enRetard.length} production(s) ouverte(s) depuis plus de ${PROD_OPEN_MAX_DAYS} jours.</b> Une production ne peut pas rester « démarrée » au-delà de ${PROD_OPEN_MAX_DAYS} jours : terminez-la (✓ Terminer) pour figer la DLC, ou supprimez-la.</div></div>`:''}
   ${ouvertes.length && !enRetard.length?`<div class="banner">▶ <div><b>${ouvertes.length} production(s) en cours.</b> La DLC de 7 j ne démarre qu'au passage en « terminée ».</div></div>`:''}
   ${sugg.length?`<div class="panel" style="border:1.5px solid #cfe3d4;background:#f4faf5">
     <h2 style="color:#2e7d32">🔗 Assemblages à finaliser <span style="font-weight:400;font-size:.82rem;color:#6a8a72">— ${sugg.length} rapprochement(s) possible(s)</span></h2>
     <p class="note" style="margin-bottom:8px">Coques et ganaches réellement <b>en stock</b> (quantités réelles, casse déduite) pouvant être assemblées. Vérifie le parfum avant de valider.</p>
     ${sugg.map(s=>`<div class="sugg-row">
        <div class="sugg-main">
          <div><b>🟤 ${esc(s.coqRec)}</b> <span class="tag" style="background:#8a6d3b;color:#fff;font-size:.64rem">${qty(s.coqUnits)} coques (= ${qty(s.coqMac)} mac.)</span> <span style="color:#9a8a82;font-size:.72rem">lot ${esc(s.coqLot)}</span></div>
          <div style="margin-top:2px"><b>🍫 ${esc(s.ganRec)}</b> <span class="tag" style="background:#5a3a2a;color:#fff;font-size:.64rem">${qty(s.ganMac)} doses dispo</span> <span style="color:#9a8a82;font-size:.72rem">lot ${esc(s.ganLot)}</span></div>
          <div style="margin-top:3px;font-size:.8rem;color:#2e7d32">➜ assemblage : <b>${qty(s.coquesNeeded)} coques + ${qty(s.assemblable)} ganaches → ${qty(s.assemblable)} macaron(s)</b>${s.sameBase?' · <span class="tag ok" style="font-size:.62rem">même lot</span>':''}${s.sameRec?'':' · <span class="tag warn" style="font-size:.62rem">parfum différent</span>'}</div>
          ${(s.coquesReste>0||s.ganacheReste>0)?`<div style="margin-top:2px;font-size:.74rem;color:#9a8a82">↳ resterait : ${s.coquesReste>0?`<b>${qty(s.coquesReste)} coque(s)</b>`:''}${s.coquesReste>0&&s.ganacheReste>0?' · ':''}${s.ganacheReste>0?`<b>${qty(s.ganacheReste)} ganache(s)</b>`:''} (casse / écart réel)</div>`:''}
        </div>
        <button class="btn gold sm" onclick="prodAssembleForm(${s.coqId})" title="Assembler ces composants">🔗 Assembler</button>
      </div>`).join('')}
   </div>`:''}
   <div class="panel">
     ${coquesSuspectsN>0?`<div class="banner" style="background:#fff8ec;border-color:#e8cfa0;margin-bottom:8px">🔧 <div><b>${coquesSuspectsN} ancien(s) lot(s) de coques</b> à corriger (quantité non doublée). <span class="act" onclick="reviewCoquesMigration(false)">Vérifier et corriger →</span></div></div>`:''}
     <input class="search" id="prodbatSearch" style="width:100%;margin-bottom:6px" placeholder="N° lot, parfum, date, emplacement (F/B/C/A)…" value="${esc(prodnSearch)}" oninput="prodbatFilter(this.value)" autocomplete="off" autocapitalize="off" autocorrect="off">
     <div class="prod-emp-chips" style="margin-bottom:12px">
       ${EMPLACEMENTS.map(e=>`<button onclick="prodbatSearchEmp('${e.lettre}')" title="${esc(e.nom)}">${e.icon} ${e.lettre}</button>`).join('')}
       <button onclick="prodbatSearchEmp('')" class="clear">Tout</button>
     </div>
   ${prods.length?`<div class="table-wrap"><table><thead><tr><th>Produit</th><th>Statut</th><th>N° lot prod.</th><th>Emplacement</th><th>Théo.</th><th>Réel</th><th>Écart</th><th>Restant</th><th>Actions</th></tr></thead>
     <tbody id="prodbatBody"></tbody></table></div><div id="prodbatEmpty" class="empty" style="display:none">Aucune production ne correspond.</div>`
     :`<div class="empty">Aucune production. Une production consomme les matières selon la quantité <b>théorique</b> (FIFO par DLC) ; le stock de produits finis suit la quantité <b>réelle</b>.</div>`}
   </div>
   ${(()=>{
     // Bloc STOCK CONSOMMÉ : vision directe du stock décrémenté par la production,
     // sans aller dans « Matières & lots ». Batchs triés du plus récent au plus ancien.
     const consoBatches = prods
       .filter(p=>_consoByProd.has(p.id))
       .map(p=>({p, items:Object.values(_consoByProd.get(p.id))}))
       .filter(b=>b.items.length>0);
     if(!consoBatches.length) return '';
     const blocs = consoBatches.map(b=>{
       const p=b.p;
       const comp=prodComposant(p);
       const compTag = comp!=='complet'?` <span class="tag" style="background:${comp==='assemble'?'#3f7d52':comp==='degustation'?'#caa23b':comp==='ganache'?'#5a3a2a':'#8a6d3b'};color:#fff;font-size:.66rem">${comp==='coques'?'coques':comp==='ganache'?'ganache':comp==='degustation'?'dégustation':'assemblé'}</span>`:'';
       const when = p.prodTermineTs||p.prodDebutTs||p.prodTimestamp||(p.date?p.date+'T00:00':'');
       return `<div class="trace-step" style="margin-bottom:10px">
         <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
           <div><b>${esc(recName(p.recipeId))}</b>${compTag}<br>
             <span style="color:#9a8a82;font-size:.76rem">lot ${esc(p.lotProduction||('#'+p.id))}${when?' · '+fmtDateTime(when):''}</span></div>
           <button class="btn ghost sm" onclick="traceProd(${p.id})" title="Détail du batch">🔎</button>
         </div>
         ${b.items.map(it=>`<div style="display:flex;justify-content:space-between;font-size:.85rem;padding:3px 0;border-top:1px solid #f0e8da">
           <span>${esc(_matNameP(it.materialId))} <span style="color:#9a8a82">· lot ${esc(it.lotFournisseur||'—')}</span></span>
           <span class="tag out">−${qty(it.qte)} ${esc(_matUnitP(it.materialId))}</span></div>`).join('')}
       </div>`;
     });
     return `<div class="panel"><h2>📉 Stock consommé par la production <span style="font-weight:400;font-size:.8rem;color:#9a8a82">— matières décrémentées à mesure que tu produis</span></h2>
       ${collapseList(blocs, 1, {moreLabel:n=>`Voir les ${n} batch(s) précédent(s)`, lessLabel:'Réduire'})}</div>`;
   })()}`;
  prodbatFilter(prodnSearch);
}
function ecartTag(p){
  const e = (p.ecart!=null) ? +p.ecart : 0;
  if(!e) return '<span class="tag ok">conforme</span>';
  return `<span class="tag ${e<0?'warn':'event'}">${e>0?'+':''}${qty(e)}</span>`;
}
function _prodbatRow(row){
  const p=row.p; const recName=window._prodRecName||(id=>'#'+id); const lossByProd=window._prodLossBy||{};
  const th = (p.qteTheorique!=null)?p.qteTheorique:p.qteProduite;
  const re = (p.qteReelle!=null)?p.qteReelle:p.qteProduite;
  const emp = p.emplacement; const empTag = empTagHtml(emp);
  const st = prodStatut(p);
  const tsFab = st==='termine' ? (p.prodTermineTs||p.prodTimestamp) : (p.prodDebutTs||p.prodTimestamp);
  const heureFab = tsFab ? fmtDateTime(tsFab) : '';
  const overdue = prodOpenOverdue(p);
  let statutCell;
  if(st==='termine'){
    statutCell = `<span class="tag ok">✓ Terminée</span>`
      + (p.prodTermineTs?`<br><span style="color:#9a8a82;font-size:.72rem">le ${fmtDateTime(p.prodTermineTs)}</span>`:'')
      + (p.dlcProduit?`<br><span style="color:#9a8a82;font-size:.72rem">DLC ${fmtDate(p.dlcProduit)}</span>`:'');
  } else {
    const oh = prodOpenHours(p);
    const ouvertTxt = oh!=null ? (oh<24?`${Math.floor(oh)} h`:`${Math.floor(oh/24)} j ${Math.floor(oh%24)} h`) : '';
    statutCell = `<span class="tag ${overdue?'warn':'event'}">▶ Démarrée</span>`
      + (ouvertTxt?`<br><span style="font-size:.72rem;color:${overdue?'#b3261e':'#9a8a82'}">ouverte ${ouvertTxt}${overdue?' · &gt; 4 j !':''}</span>`:'')
      + `<br><button class="qa edit" style="margin-top:3px" onclick="prodSetTermine(${p.id})" title="Passer en terminée — démarre la DLC">✓ Terminer</button>`;
  }
  const comp = prodComposant(p);
  // Pastille composant PROÉMINENTE : repérage instantané (couleur + icône + mot).
  const compMeta = {
    coques:     {ico:'🟤', mot:'COQUES',      cls:'comp-coques'},
    ganache:    {ico:'🍫', mot:'GANACHE',     cls:'comp-ganache'},
    assemble:   {ico:'✓',  mot:'ASSEMBLÉ',    cls:'comp-assemble'},
    degustation:{ico:'🥄', mot:'DÉGUSTATION', cls:'comp-degustation'},
    complet:    {ico:'🍪', mot:'COMPLET',     cls:'comp-complet'}
  }[comp] || {ico:'🍪', mot:'COMPLET', cls:'comp-complet'};
  const compPill = `<span class="comp-pill ${compMeta.cls}"><span class="cp-ico">${compMeta.ico}</span>${compMeta.mot}</span>`;
  const rowCls = `prow prow-${comp||'complet'}`;
  const partTag = p.parentProdId ? ` <span class="tag" style="background:#ece2d4;color:#6b5a52;font-size:.66rem">partie</span>` : '';
  // Bouton Assembler : proposé sur un sous-lot coques OU ganache encore disponible.
  const assembleBtn = (comp==='coques'||comp==='ganache') && round3(+p.qteRestante)>0
    ? `<button class="qa edit" onclick="prodAssembleForm(${p.id})" title="Assembler coques + ganache de ce lot">🔗 Assembler</button>` : '';
  // Bouton Distribué : décrémente un lot dégustation au fur et à mesure (offert).
  const degBtn = comp==='degustation' && round3(+p.qteRestante)>0
    ? `<button class="qa edit" onclick="prodDegDistribue(${p.id})" title="Décompter des macarons distribués en dégustation">🥄 Distribué</button>` : '';
  return `<tr class="${rowCls}"${overdue?' style="background:#fdf3f2"':''}>
     <td>${compPill}${partTag}<br><span style="color:#9a8a82;font-size:.74rem">${fmtDate(p.date)}</span>${heureFab?`<br><span style="color:#9a8a82;font-size:.72rem">🕒 ${heureFab}</span>`:''}</td>
     <td>${statutCell}</td>
     <td><b>${esc(p.lotProduction||'—')}</b>${p.lotBase?`<br><span style="color:#9a8a82;font-size:.68rem">base ${esc(p.lotBase)}</span>`:''}</td>
     <td>${empTag}<br><span class="act" onclick="setEmplacement(${p.id})">${emp?'↔ déplacer':'📍 ranger'}</span></td>
     <td>${qty(th)}</td><td><b>${qty(re)}</b></td><td>${ecartTag(p)}</td>
     <td>${qty(p.qteRestante)}${comp==='coques'?' <span style="color:#9a8a82;font-size:.66rem">coques</span>':''}${lossByProd[p.id]?`<br><span class="tag out" style="font-size:.68rem">−${qty(lossByProd[p.id])} perte</span>`:''}</td>
     <td><div class="qa-row">${assembleBtn}${degBtn}<button class="qa" onclick="prodSplitForm(${p.id})" title="Découper en parties rangées séparément">✂ Découper</button><button class="qa edit" onclick="prodAdjustForm(${p.id})" title="Ajuster la quantité réelle">✎ Réel</button><button class="qa del" onclick="declareLossForm(${p.id})" title="Déclarer une perte / casse">⚠ Perte</button><button class="qa" onclick="printLabel(${p.id})" title="Imprimer l'étiquette de ce batch">⎙ Étiquette</button><button class="qa" onclick="traceProd(${p.id})" title="Traçabilité">🔎</button><button class="qa del" onclick="delProd(${p.id})" title="Supprimer">🗑</button></div></td></tr>`;
}
// Recherche intelligente des productions. Une seule lettre d'emplacement (F/B/C/A)
// filtre par zone ; sinon recherche plein-texte (lot, parfum, date, statut…).
function prodbatFilter(q){
  prodnSearch=q||'';
  if(!_prodnCache) return;
  const body=document.getElementById('prodbatBody'); if(!body) return;
  const cnt=document.getElementById('prodCount'); const empty=document.getElementById('prodbatEmpty');
  const raw=(q||'').trim();
  let rows;
  const empLetters = EMPLACEMENTS.map(e=>e.lettre.toLowerCase());
  if(raw.length===1 && empLetters.includes(raw.toLowerCase())){
    // filtre exact par lettre d'emplacement
    const L=raw.toLowerCase();
    rows = _prodnCache.filter(r=>r._lettre===L);
  } else {
    rows = searchRank(_prodnCache, q);
  }
  if(cnt){ const tot=_prodnCache.length; cnt.textContent = raw ? `${rows.length} / ${tot} batch(s)` : `${tot} batch(s) fabriqué(s)`; }
  if(!rows.length){ body.innerHTML=''; if(empty) empty.style.display='block'; return; }
  if(empty) empty.style.display='none';
  const recName=window._prodRecName||(id=>'#'+id);
  // Ordre des composants à l'intérieur d'une recette : coques, ganache, assemblé, dégustation, complet
  const compOrder={coques:0, ganache:1, assemble:2, degustation:3, complet:4};
  const capped = rows.slice(0,400);
  // Regroupe par recette en conservant l'ordre d'apparition (déjà trié par pertinence/date)
  const groups=[]; const idx={};
  capped.forEach(r=>{
    const rid = r.p.libre ? ('libre:'+(r.p.produitLibre||r.p.id)) : r.p.recipeId;
    if(idx[rid]==null){ idx[rid]=groups.length; groups.push({rid, name:recName(r.p), libre:!!r.p.libre, rows:[]}); }
    groups[idx[rid]].rows.push(r);
  });
  let html='';
  groups.forEach(g=>{
    g.rows.sort((a,b)=>(compOrder[prodComposant(a.p)]??9)-(compOrder[prodComposant(b.p)]??9));
    const nb=g.rows.length;
    const reste=g.rows.reduce((s,r)=>s+(round3(+r.p.qteRestante)>0?1:0),0);
    const libreTag = g.libre?' <span class="tag" style="background:#e9eef9;color:#3a5a9a;font-size:.64rem">libre</span>':'';
    html+=`<tr class="prod-sec-head"><td colspan="9">🍩 ${esc(g.name)}${libreTag}<span class="sec-count">${nb} batch${nb>1?'s':''}${reste?` · ${reste} en stock`:''}</span></td></tr>`;
    html+=g.rows.map(_prodbatRow).join('');
  });
  body.innerHTML = html +
    (rows.length>400?`<tr><td colspan="9" class="note" style="text-align:center">… ${rows.length-400} autre(s). Affinez la recherche.</td></tr>`:'');
}
// Chip emplacement : remplit la recherche avec la lettre (ou efface).
function prodbatSearchEmp(lettre){
  const inp=document.getElementById('prodbatSearch'); if(inp) inp.value=lettre;
  prodbatFilter(lettre);
}

/* ============================================================
   PRÉPARATION / PICKING — piloté par les BATCHS, optimisé par ZONE
   ------------------------------------------------------------
   Principe : on ne lie plus les batchs en amont. Le picking calcule
   les besoins en macarons (par parfum) d'une date, puis AFFECTE les
   batchs disponibles : FIFO par DLC, regroupés par EMPLACEMENT pour
   limiter les allers-retours et les chocs thermiques. Si un batch ne
   couvre pas le besoin, on enchaîne sur le suivant (zone adéquate).
   La liaison commande↔batch est créée AUTOMATIQUEMENT à la validation
   « Commande prête » (réutilise la décrémentation de stock existante).
   ============================================================ */
let _pickMode = 'commandes';     // 'commandes' | 'marche'
let _pickDate = '';              // date sélectionnée (YYYY-MM-DD)
let _pickConsolidated = false;   // vue par zone (consolidée) vs par commande
let _pickConsDone = new Set();   // cases cochées en vue consolidée (aide au tri, en mémoire)

// Le parfum d'une commande (ex. "Vanille") correspond-il à la recette d'un batch
// (ex. "Macaron vanille") ? Correspondance normalisée par inclusion.
function pickFlavorMatch(flavorNom, recipeNom){
  const a=normTxt(flavorNom), b=normTxt(recipeNom);
  if(!a||!b) return false;
  return a===b || b.includes(a) || a.includes(b);
}
// Besoins en macarons par parfum pour une commande (coffrets + événement + don).
// Marqueur interne pour distinguer un besoin "grand format" d'un besoin "petit format"
// portant le même nom de parfum (ils NE partagent PAS le même stock / la même recette).
const GF_MARK = '\u0001GF';
function isGFKey(k){ return typeof k==='string' && k.endsWith(GF_MARK); }
function gfBase(k){ return isGFKey(k) ? k.slice(0, -GF_MARK.length) : k; }
function orderFlavorNeeds(o){
  const needs={};
  orderToLines(o).forEach(ln=>{
    if(ln.type==='coffret'||ln.type==='evenement'||ln.type==='don'||ln.type==='vrac'){
      (ln.parfums||[]).forEach(p=>{ if(+p.qte>0) needs[p.nom]=(needs[p.nom]||0)+(+p.qte||0); });
    }
    // Grands formats : recette DISTINCTE, stock séparé → clé marquée GF, jamais mélangée
    // avec les petits macarons du même nom.
    if(ln.type==='grand'||ln.type==='don'){
      (ln.items||[]).forEach(p=>{ if(+p.qte>0){ const k=p.nom+GF_MARK; needs[k]=(needs[k]||0)+(+p.qte||0); } });
    }
  });
  return needs;
}
// Emballages d'une commande (coffrets par taille + pyramides + grands formats).
function orderPackaging(o){
  const boxes={}; let pyramides=0; const bigItems={};
  orderToLines(o).forEach(ln=>{
    if(ln.type==='coffret') boxes[ln.taille]=(boxes[ln.taille]||0)+1;
    else if(ln.type==='evenement') pyramides+=(+ln.equip||0);
    else if(ln.type==='grand') (ln.items||[]).forEach(p=>{ if(+p.qte>0) bigItems[p.nom]=(bigItems[p.nom]||0)+(+p.qte||0); });
    else if(ln.type==='don') (ln.items||[]).forEach(p=>{ if(+p.qte>0) bigItems[p.nom]=(bigItems[p.nom]||0)+(+p.qte||0); });
  });
  return {boxes, pyramides, bigItems};
}

// MOTEUR D'AFFECTATION : pour une carte de besoins {parfum: qte}, alloue les
// batchs disponibles en optimisant par ZONE.
// Retourne { byZone: [{emp, lettre, nom, icon, picks:[{flavor, prodId, lot, qte, dlc}]}],
//            shortages: [{flavor, manque}], plan: [{flavor, prodId, qte}] }
function allocateBatches(needs, prods, recipes){
  const recName = id => (recipes.find(r=>r.id===id)||{}).produitNom||'';
  // candidats par parfum : batchs avec stock, triés FIFO (DLC la plus proche d'abord)
  const remaining = {}; Object.keys(needs).forEach(f=>remaining[f]=needs[f]);
  const recById = {}; (recipes||[]).forEach(r=>{ recById[r.id]=r; });
  // index des batchs disponibles ; on mémorise si le batch est d'une recette GRAND FORMAT
  const stock = prods.filter(p=>round3(+p.qteRestante)>0 && prodVendable(p)).map(p=>({
    id:p.id, emp:p.emplacement||'', lot:p.lotProduction||'', dlc:p.dlcProduit||'',
    rec:recName(p.recipeId), gf: !!(recById[p.recipeId] && recById[p.recipeId].grandFormat),
    dispo:round3(+p.qteRestante)
  }));
  // Correspondance besoin ↔ batch : le type DOIT coïncider (grand format avec grand format,
  // petit avec petit), en plus de la correspondance de parfum. Jamais de mélange.
  const matchNeed = (needKey, s) => {
    const wantGF = isGFKey(needKey);
    if(wantGF !== s.gf) return false;
    return pickFlavorMatch(gfBase(needKey), s.rec);
  };
  const flavorsNeeded = Object.keys(needs).filter(f=>needs[f]>0);
  const zoneScore = {};
  EMPLACEMENTS.forEach(e=>{ zoneScore[e.key]=0; });
  flavorsNeeded.forEach(f=>{
    const zones=new Set(stock.filter(s=>matchNeed(f, s)).map(s=>s.emp));
    zones.forEach(z=>{ if(zoneScore[z]!=null) zoneScore[z]++; else zoneScore[z]=1; });
  });
  const zoneOrder = [...new Set([...EMPLACEMENTS.map(e=>e.key), ...stock.map(s=>s.emp)])]
    .filter(z=>z!=='')
    .sort((a,b)=>(zoneScore[b]||0)-(zoneScore[a]||0));
  // libellé d'affichage : nom propre + suffixe « (grand format) » si besoin GF
  const dispName = k => isGFKey(k) ? (gfBase(k)+' (grand format)') : k;
  const plan=[];
  zoneOrder.forEach(z=>{
    flavorsNeeded.forEach(f=>{
      if(remaining[f]<=0) return;
      const cands=stock.filter(s=>s.emp===z && s.dispo>0 && matchNeed(f, s))
        .sort((a,b)=>(a.dlc||'9999').localeCompare(b.dlc||'9999')); // FIFO
      for(const s of cands){
        if(remaining[f]<=0) break;
        const take=Math.min(remaining[f], s.dispo);
        if(take>0){
          plan.push({flavor:dispName(f), prodId:s.id, qte:round3(take), emp:s.emp, lot:s.lot, dlc:s.dlc});
          s.dispo=round3(s.dispo-take); remaining[f]=round3(remaining[f]-take);
        }
      }
    });
  });
  const byZone=[];
  zoneOrder.forEach(z=>{
    const picks=plan.filter(pk=>pk.emp===z);
    if(picks.length){ const e=empInfo(z); byZone.push({emp:z, lettre:e.lettre, nom:e.nom, icon:e.icon, picks}); }
  });
  const shortages=flavorsNeeded.filter(f=>remaining[f]>0).map(f=>({flavor:dispName(f), manque:round3(remaining[f])}));
  return {byZone, shortages, plan};
}

async function renderPicking(){
  if(!_pickDate) _pickDate = today();
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Préparation / Picking</h1><p>Affectation des batchs optimisée par emplacement</p></div></div>
   <div class="pick-tabs">
     <button class="${_pickMode==='commandes'?'active':''}" onclick="pickSetMode('commandes')">📋 Commandes</button>
     <button class="${_pickMode==='marche'?'active':''}" onclick="pickSetMode('marche')">⛺ Départ marché</button>
   </div>
   <div id="pickBody"></div>`;
  if(_pickMode==='commandes') await pickRenderOrders();
  else await pickRenderMarket();
}
function pickSetMode(m){ _pickMode=m; _pickConsolidated=false; renderPicking(); }
function pickSetDate(v){ _pickDate=v; if(_pickMode==='commandes') pickRenderOrders(); else pickRenderMarket(); }
function pickToggleConsolidated(){ _pickConsolidated=!_pickConsolidated; pickRenderOrders(); }

// ---------- MODE COMMANDES ----------
async function pickRenderOrders(){
  const body=document.getElementById('pickBody'); if(!body) return;
  const allOrders = await db.orders.toArray();
  const clients = await db.clients.toArray();
  const clName = id => (clients.find(c=>c.id===id)||{}).nom||'Client';
  const prods = await db.productions.toArray();
  const recipes = await db.recipes.toArray();
  // commandes de la date, non encore livrées (PLUS BESOIN d'être liées en amont)
  const orders = allOrders.filter(o=>o.date===_pickDate && normStatus(o.statut)!=='Livrée');
  // besoins consolidés de la journée
  const allNeeds={};
  orders.forEach(o=>{ const n=orderFlavorNeeds(o); Object.keys(n).forEach(f=>allNeeds[f]=(allNeeds[f]||0)+n[f]); });
  const alloc = allocateBatches(allNeeds, prods, recipes);

  body.innerHTML=`
   <div class="pick-date">
     <label style="font-weight:600;color:#7a6a62">Date</label>
     <input type="date" value="${_pickDate}" onchange="pickSetDate(this.value)">
     <button class="btn ${_pickConsolidated?'':'ghost'}" onclick="pickToggleConsolidated()">${_pickConsolidated?'📋 Par commande':'📦 Tout sortir (par zone)'}</button>
   </div>
   ${!orders.length?`<div class="empty">Aucune commande à préparer pour le ${fmtDate(_pickDate)}.</div>`:
     _pickConsolidated ? pickConsolidatedHtml(alloc, orders) : orders.map(o=>pickOrderCard(o, clName(o.clientId), prods, recipes)).join('')
   }`;
}

// Vue « Tout sortir » : un parcours par ZONE (emplacements polyvalents en premier).
function pickConsolidatedHtml(alloc, orders){
  if(!alloc.byZone.length && !alloc.shortages.length) return '<div class="empty">Rien à préparer (aucun macaron demandé).</div>';
  const zones = alloc.byZone.map(z=>{
    const lines = z.picks.map(pk=>{
      const key='z:'+z.emp+':'+pk.prodId+':'+pk.flavor;
      const done=_pickConsDone.has(key);
      return `<div class="pick-row${done?' done':''}" onclick="pickToggleCons('${key.replace(/'/g,"\\'")}')">
        <div class="pick-check">${done?'✓':''}</div>
        <div class="pick-main"><div class="pick-name">${esc(pk.flavor)}</div>
          <div class="pick-sub">lot ${esc(pk.lot||'—')}${pk.dlc?` · DLC ${fmtDate(pk.dlc)}`:''}</div></div>
        <button class="pick-scan" onclick="event.stopPropagation();pickScanConfirm('${esc(pk.flavor).replace(/'/g,"\\'")}','${esc(pk.lot||'').replace(/'/g,"\\'")}')" title="Scanner ce bac">📷</button>
        <div class="pick-qty">${pk.qte}</div></div>`;
    }).join('');
    return `<div class="panel"><h2>${z.icon} ${esc(z.nom)} <span class="tag" style="background:${empInfo(z.emp).type==='frigo'?'#6aa3a0':'#3b6ea5'};color:#fff">${z.lettre}</span></h2>
      <p class="note" style="margin-bottom:10px">Sors tous ces bacs en une fois depuis cet emplacement.</p>${lines}</div>`;
  }).join('');
  const short = alloc.shortages.length?`<div class="banner" style="background:#fdf3f2;border-color:#e5b4ae">⛔ <div><b>Stock insuffisant :</b> ${alloc.shortages.map(s=>`${esc(s.flavor)} (manque ${qty(s.manque)})`).join(' · ')}. Lance une production.</div></div>`:'';
  // emballages consolidés
  const pack={}; let pyr=0; const bigs={};
  orders.forEach(o=>{ const pk=orderPackaging(o);
    Object.keys(pk.boxes).forEach(t=>pack[t]=(pack[t]||0)+pk.boxes[t]); pyr+=pk.pyramides;
    Object.keys(pk.bigItems).forEach(b=>bigs[b]=(bigs[b]||0)+pk.bigItems[b]); });
  const packRows=[
    ...Object.keys(pack).sort((a,b)=>(+a)-(+b)).map(t=>({label:`Coffret ${t} macarons`, qte:pack[t]})),
    ...(pyr>0?[{label:'Pyramide / présentoir', qte:pyr}]:[]),
    ...Object.keys(bigs).sort().map(b=>({label:b+' (grand format)', qte:bigs[b]}))
  ];
  const packHtml = packRows.length?`<div class="panel"><h2>📦 Emballages</h2>${packRows.map(r=>{
    const key='pack:'+r.label; const done=_pickConsDone.has(key);
    return `<div class="pick-row${done?' done':''}" onclick="pickToggleCons('${key.replace(/'/g,"\\'")}')">
      <div class="pick-check">${done?'✓':''}</div>
      <div class="pick-main"><div class="pick-name">${esc(r.label)}</div><div class="pick-sub">emballage</div></div>
      <div class="pick-qty">${r.qte}</div></div>`;
  }).join('')}</div>`:'';
  return short + zones + packHtml;
}

// Carte d'une commande : checklist tactile, AVEC l'affectation batch+zone proposée.
function pickOrderCard(o, nom, prods, recipes){
  const needs=orderFlavorNeeds(o);
  const alloc=allocateBatches(needs, prods, recipes);
  const pack=orderPackaging(o);
  const state=o.pickState||{};
  // lignes = emballages + (par zone) parfums affectés
  const rows=[];
  Object.keys(pack.boxes).sort((a,b)=>(+a)-(+b)).forEach(t=>rows.push({key:'box'+t, kind:'pack', label:`Coffret ${t} macarons`, qte:pack.boxes[t], sub:'emballage'}));
  if(pack.pyramides>0) rows.push({key:'pyr', kind:'pack', label:'Pyramide / présentoir', qte:pack.pyramides, sub:'emballage'});
  Object.keys(pack.bigItems).sort().forEach(b=>rows.push({key:'gf:'+b, kind:'pack', label:b+' (grand format)', qte:pack.bigItems[b], sub:'emballage'}));
  // parfums affectés, regroupés par zone (zones polyvalentes d'abord)
  alloc.byZone.forEach(z=>{
    z.picks.forEach(pk=>{
      rows.push({key:'pick:'+pk.prodId+':'+pk.flavor, kind:'mac', label:pk.flavor, qte:pk.qte,
        emp:z.emp, lettre:z.lettre, zoneNom:z.nom, icon:z.icon, lot:pk.lot, dlc:pk.dlc, prodId:pk.prodId});
    });
  });
  const totalLines=rows.length;
  const doneLines=rows.filter(r=>state[r.key]).length;
  const pct=totalLines?Math.round(doneLines/totalLines*100):0;
  const allDone=totalLines>0 && doneLines===totalLines;
  const ready=normStatus(o.statut)==='Terminée' || o._pickDone===true;
  const hasShort=alloc.shortages.length>0;
  // regroupe visuellement par zone : on insère un mini en-tête quand la zone change
  let lastZone=null;
  const rowsHtml=rows.map(r=>{
    let header='';
    if(r.kind==='mac' && r.emp!==lastZone){
      lastZone=r.emp;
      header=`<div class="pick-zone-head">${r.icon} ${esc(r.zoneNom)} <span class="tag" style="background:${empInfo(r.emp).type==='frigo'?'#6aa3a0':'#3b6ea5'};color:#fff">${r.lettre}</span></div>`;
    }
    const done=!!state[r.key];
    const scan = r.kind==='mac'?`<button class="pick-scan" onclick="event.stopPropagation();pickScanConfirm('${esc(r.label).replace(/'/g,"\\'")}','${esc(r.lot||'').replace(/'/g,"\\'")}')" title="Scanner ce bac">📷</button>`:'';
    const sub = r.kind==='mac'?`lot ${esc(r.lot||'—')}${r.dlc?` · DLC ${fmtDate(r.dlc)}`:''}`:r.sub;
    return header+`<div class="pick-row${done?' done':''}" onclick="pickToggleLine(${o.id},'${r.key.replace(/'/g,"\\'")}')">
      <div class="pick-check">${done?'✓':''}</div>
      <div class="pick-main"><div class="pick-name">${esc(r.label)}</div><div class="pick-sub">${sub}</div></div>
      ${scan}<div class="pick-qty">${r.qte}</div></div>`;
  }).join('');
  return `<div class="pick-order-card${ready?' ready':''}">
    <div class="pick-order-head">
      <h3>${esc(nom)}${o.heureLivraison?` <span style="font-size:.8rem;color:#9a8a82;font-weight:400">${esc(o.heureLivraison)}</span>`:''}</h3>
      <span class="tag ${ready?'done':'todo'}">${ready?'✓ Prête':doneLines+'/'+totalLines}</span>
    </div>
    <div class="pick-progress"><span style="width:${pct}%"></span></div>
    ${hasShort?`<div class="banner" style="background:#fdf3f2;border-color:#e5b4ae;margin-bottom:10px">⛔ <div>Stock insuffisant : ${alloc.shortages.map(s=>`${esc(s.flavor)} (manque ${qty(s.manque)})`).join(' · ')}</div></div>`:''}
    ${rowsHtml||'<p class="note">Aucun macaron/emballage à préparer.</p>'}
    <button class="pick-big-btn ${(allDone||ready)&&!hasShort?'ready':'wait'}" style="margin-top:12px" onclick="pickMarkReady(${o.id})">
      ${ready?'✓ Commande prête':(hasShort?'Stock insuffisant':(allDone?'✓ Marquer « Commande prête »':`Cochez tout (${doneLines}/${totalLines})`))}</button>
  </div>`;
}

async function pickToggleLine(orderId, key){
  const o=await db.orders.get(orderId); if(!o) return;
  const st=Object.assign({}, o.pickState||{});
  st[key]=!st[key];
  await db.orders.update(orderId, {pickState:st});
  pickRenderOrders();
}
function pickToggleCons(key){
  if(_pickConsDone.has(key)) _pickConsDone.delete(key); else _pickConsDone.add(key);
  pickRenderOrders();
}

// VALIDATION : crée AUTOMATIQUEMENT les liaisons commande↔batch d'après le plan
// d'affectation, décrémente le stock (réutilise la logique existante), puis passe
// la commande en « Terminée ». Idempotent : ne relie pas ce qui l'est déjà.
async function pickMarkReady(orderId){
  const o=await db.orders.get(orderId); if(!o) return;
  if(normStatus(o.statut)==='Terminée'){ toast('Commande déjà prête'); return; }
  const prods=await db.productions.toArray();
  const recipes=await db.recipes.toArray();
  const needs=orderFlavorNeeds(o);
  const rows=[]; const pack=orderPackaging(o);
  // reconstruit la liste des clés pour vérifier que tout est coché
  Object.keys(pack.boxes).forEach(t=>rows.push('box'+t));
  if(pack.pyramides>0) rows.push('pyr');
  Object.keys(pack.bigItems).forEach(b=>rows.push('gf:'+b));
  const alloc=allocateBatches(needs, prods, recipes);
  alloc.byZone.forEach(z=>z.picks.forEach(pk=>rows.push('pick:'+pk.prodId+':'+pk.flavor)));
  if(alloc.shortages.length){ toast('Stock insuffisant pour cette commande'); return; }
  const state=o.pickState||{};
  const allDone=rows.length>0 && rows.every(k=>state[k]);
  if(!allDone){ toast('Coche toutes les lignes avant de valider'); return; }
  // déjà liés ? (évite un double décrément si l'utilisateur avait lié à la main)
  const existing=await db.orderItems.where('orderId').equals(orderId).toArray();
  const dejaLie=existing.reduce((s,e)=>s+(+e.qte||0),0);
  let pkgManques=[];
  try{
    await db.transaction('rw', db.orderItems, db.productions, db.materialLots, db.orders, async()=>{
      if(dejaLie<=0){
        // affecte chaque pick : crée le lien + décrémente le stock fini du batch
        for(const pk of alloc.plan){
          const prod=await db.productions.get(pk.prodId);
          if(!prod) continue;
          const take=Math.min(round3(+pk.qte), round3(+prod.qteRestante));
          if(take<=0) continue;
          await db.orderItems.add({orderId, productionId:pk.prodId, qte:round3(take)});
          await db.productions.update(pk.prodId, {qteRestante: subQty(prod.qteRestante, take)});
        }
      }
      // décrément automatique des EMBALLAGES (coffrets), une seule fois par commande
      if(o.pkgDecremented!==true){
        for(const taille in pack.boxes){
          const nb=+pack.boxes[taille]||0; if(nb<=0) continue;
          const res=await decrementPackagingStock(taille, nb);
          if(res.absent) pkgManques.push(`format ${taille} (aucun emballage défini)`);
          else if(res.manque>0) pkgManques.push(`${res.manque}× boîte ${taille}`);
        }
        await db.orders.update(orderId, {pkgDecremented:true});
      }
      await db.orders.update(orderId, {statut:'Terminée'});
    });
  }catch(err){ toast(err.message||'Erreur à la validation'); return; }
  if(pkgManques.length) toast('Commande prête ✓ — stock emballage insuffisant : '+pkgManques.join(', '));
  else toast(dejaLie>0?'Commande prête ✓':'Commande prête ✓ — batchs & emballages décomptés');
  pickRenderOrders();
}

// Bonus QR : confirme que le lot scanné correspond au parfum ET au bac attendu.
async function pickScanConfirm(flavor, expectedLot){
  if(typeof openScanner!=='function'){ toast('Scanner indisponible'); return; }
  openScanner(async (lot)=>{
    const prods=await db.productions.toArray();
    const recipes=await db.recipes.toArray();
    const p=prods.find(x=>normTxt(x.lotProduction||'')===normTxt(lot));
    if(!p){ toast('Lot '+lot+' introuvable'); return; }
    const rec=(recipes.find(r=>r.id===p.recipeId)||{}).produitNom||'?';
    if(expectedLot && normTxt(lot)===normTxt(expectedLot)){
      toast(`✓ Bon bac : ${rec} (lot ${p.lotProduction})`);
    } else if(pickFlavorMatch(flavor, rec)){
      toast(`✓ Parfum OK (${rec}) — lot ${p.lotProduction}${expectedLot?` (attendu : ${expectedLot})`:''}`);
    } else {
      toast(`⚠ Ce lot est « ${rec} », pas « ${flavor} »`);
    }
  });
}

// ---------- MODE DÉPART MARCHÉ ----------
async function pickRenderMarket(){
  const body=document.getElementById('pickBody'); if(!body) return;
  const markets=(await db.markets.toArray().catch(()=>[])).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const ouverts=markets.filter(m=>m.statut!=='clos');
  const moves=await db.marketMoves.toArray().catch(()=>[]);
  const prods=await db.productions.toArray();
  const recipes=await db.recipes.toArray();
  const recName=id=>(recipes.find(r=>r.id===id)||{}).produitNom||'?';
  const movesByMarket={}; moves.forEach(mv=>{(movesByMarket[mv.marketId] ||= []).push(mv);});
  body.innerHTML=`
   <p class="note" style="margin-bottom:14px">Checklist de chargement du camion. Les bacs « sortis » (écran Marchés) forment ton stock de départ ; coche ici ce qui est physiquement chargé.</p>
   ${!ouverts.length?`<div class="empty">Aucun marché ouvert.<br><span style="font-size:.82rem">Crée un marché depuis l'écran Marchés, puis reviens préparer ton chargement.</span></div>`:
     ouverts.map(mk=>{
       const mvs=(movesByMarket[mk.id]||[]).filter(v=>v.type==='sortie');
       const load=mk.loadState||{};
       // regroupe les bacs sortis par EMPLACEMENT d'origine du batch
       const byZone={};
       mvs.forEach(v=>{ const p=prods.find(x=>x.id===v.productionId); const emp=p?p.emplacement||'':''; (byZone[emp] ||= []).push({v,p}); });
       const extra=[{key:'pres', label:'Présentoirs / pyramides', sub:'matériel'},
                    {key:'emb', label:'Emballages (boîtes, sachets)', sub:'matériel'},
                    {key:'caisse', label:'Caisse / monnaie / TPE', sub:'logistique'}];
       const allKeys=[...mvs.map(v=>'mv'+v.id), ...extra.map(e=>e.key)];
       const done=allKeys.filter(k=>load[k]).length;
       const ready=mk.loadReady===true;
       const zonesHtml=Object.keys(byZone).map(z=>{
         const e=empInfo(z);
         const head=z?`<div class="pick-zone-head">${e.icon} ${esc(e.nom)} <span class="tag" style="background:${e.type==='frigo'?'#6aa3a0':'#3b6ea5'};color:#fff">${e.lettre}</span></div>`:'';
         return head+byZone[z].map(({v,p})=>{
           const k='mv'+v.id; const d=!!load[k];
           const nom=v.parfum||(p?recName(p.recipeId):'?');
           return `<div class="pick-row${d?' done':''}" onclick="pickToggleMarket(${mk.id},'${k}')">
             <div class="pick-check">${d?'✓':''}</div>
             <div class="pick-main"><div class="pick-name">${esc(nom)}</div><div class="pick-sub">bac · lot ${esc(p?p.lotProduction||'':'')}</div></div>
             <div class="pick-qty">${v.qte}</div></div>`;
         }).join('');
       }).join('');
       const extraHtml=extra.map(r=>{
         const d=!!load[r.key];
         return `<div class="pick-row${d?' done':''}" onclick="pickToggleMarket(${mk.id},'${r.key}')">
           <div class="pick-check">${d?'✓':''}</div>
           <div class="pick-main"><div class="pick-name">${esc(r.label)}</div><div class="pick-sub">${esc(r.sub)}</div></div></div>`;
       }).join('');
       return `<div class="pick-order-card${ready?' ready':''}">
         <div class="pick-order-head"><h3>${esc(mk.nom||'Marché')} <span style="font-size:.8rem;color:#9a8a82;font-weight:400">${fmtDate(mk.date)}</span></h3>
           <span class="tag ${ready?'done':'todo'}">${ready?'✓ Chargé':done+'/'+allKeys.length}</span></div>
         ${!mvs.length?`<p class="note" style="margin-bottom:10px">Aucun bac « sorti » pour ce marché. Enregistre tes sorties de stock depuis l'écran Marchés.</p>`:zonesHtml}
         ${extraHtml}
         <button class="pick-big-btn ${ready?'ready':'wait'}" style="margin-top:12px" onclick="pickMarketReady(${mk.id})">${ready?'✓ Camion chargé':'✓ Valider le chargement'}</button>
       </div>`;
     }).join('')
   }`;
}
async function pickToggleMarket(marketId, key){
  const mk=await db.markets.get(marketId); if(!mk) return;
  const load=Object.assign({}, mk.loadState||{});
  load[key]=!load[key];
  await db.markets.update(marketId, {loadState:load});
  pickRenderMarket();
}
async function pickMarketReady(marketId){
  const mk=await db.markets.get(marketId); if(!mk) return;
  await db.markets.update(marketId, {loadReady:!(mk.loadReady===true)});
  toast(mk.loadReady===true?'Chargement rouvert':'Camion chargé ✓');
  pickRenderMarket();
}

// Une production a-t-elle déjà suivi le chemin congélateur → frigo ?
// Si oui, toute recongélation est INTERDITE (congélateur>frigo>congélateur 🚫).
// Règle chaîne du froid : une production SORTIE du congélateur ne peut y RETOURNER
// que si le retour est saisi dans l'HEURE qui suit la sortie. Au-delà, retour A/B/C bloqué.
const FREEZER_RETURN_MAX_MS = 60*60*1000; // 1 heure
function freezerExitTs(p){
  // dernier instant où la prod a quitté le congélateur (passage congélo -> non-congélo)
  const hist=(p&&p.histEmplacement)||[];
  let last='';
  for(let i=1;i<hist.length;i++){
    if(isFreezer(hist[i-1].lieu) && !isFreezer(hist[i].lieu)) last=hist[i].ts||'';
  }
  return last;
}
// Retour congélateur bloqué ? (sortie du congélo non suivie d'un retour dans l'heure)
function freezerReturnBlocked(p){
  if(!p) return false;
  if(isFreezer(p.emplacement)) return false;          // déjà au congélo : non concerné
  const exit=freezerExitTs(p);
  if(!exit) return false;                              // jamais sortie d'un congélo
  return (Date.now() - new Date(exit).getTime()) > FREEZER_RETURN_MAX_MS;
}
function aDejaDecongele(p){
  const hist=(p&&p.histEmplacement)||[];
  let vuCongelo=false;
  for(const seg of hist){
    if(isFreezer(seg.lieu)) vuCongelo=true;
    else if(vuCongelo) return true; // un séjour frigo APRÈS un congélo = décongélation faite
  }
  // repli sur l'ancien drapeau si l'historique est incomplet
  return false;
}
// Ouvre le sélecteur d'emplacement (4 cases : F / B / C / A) pour une production.
async function setEmplacement(id){
  const p=await db.productions.get(id); if(!p){ toast('Production introuvable'); return; }
  const decongele = aDejaDecongele(p);
  const retourBloque = freezerReturnBlocked(p);
  const courant = p.emplacement||'';
  const exitTs = freezerExitTs(p);
  const opts = EMPLACEMENTS.map(e=>{
    const estCongelo = e.type==='congelateur';
    const interdit = estCongelo && (decongele || retourBloque); // recongélation interdite OU délai 1h dépassé
    const actif = courant===e.key;
    const titre = decongele ? 'Déjà décongelé : recongélation interdite' : (retourBloque?'Retour congélateur dépassé : délai d\'1h écoulé depuis la sortie':'');
    return `<button class="btn ${actif?'gold':'ghost'} sm" ${interdit?`disabled title="${titre}"`:''}
       style="${interdit?'opacity:.45':''};min-width:46%;margin:3px 0;justify-content:flex-start;display:flex;gap:6px"
       onclick="doMoveEmplacement(${id},'${e.key}')">
       <b style="background:${e.type==='frigo'?'#6aa3a0':'#3b6ea5'};color:#fff;border-radius:6px;padding:0 7px">${e.lettre}</b>
       <span>${e.icon} ${esc(e.nom)}</span>${actif?' <span class="tag ok" style="margin-left:auto">actuel</span>':''}${interdit?' <span class="tag warn" style="margin-left:auto">🚫</span>':''}</button>`;
  }).join('');
  openModal(`<h3>Emplacement de stockage</h3>
    <p class="note">${courant?`Actuellement : <b>${esc(empNom(courant))} (${empLettre(courant)})</b>.`:'Choisissez où ranger cette production.'} La lettre s'ajoute au n° de lot et à l'étiquette.</p>
    ${decongele?'<div class="banner" style="background:#fdf3f2;border-color:#e5b4ae"><div>⚠️ Cette production est déjà passée par le frigo après congélation : <b>recongélation interdite</b>.</div></div>':''}
    ${(!decongele&&retourBloque)?`<div class="banner" style="background:#fdf3f2;border-color:#e5b4ae"><div>⛔ Sortie du congélateur le <b>${fmtDateTime(exitTs)}</b> : le délai d'<b>1 heure</b> pour un retour au congélateur est dépassé. Retour A/B/C bloqué (chaîne du froid).</div></div>`:''}
    <div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:space-between">${opts}</div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`);
}
// Déplacement central d'une production vers un emplacement (frigo / B / C / A).
// Applique : règle anti-recongélation, journal, DLC (frigo↔congélo), MAJ de la lettre de lot,
// régénération implicite de l'étiquette (le lot et l'emplacement changent).
async function doMoveEmplacement(id, dest){
  if(!EMP_BY_KEY[dest]){ toast('Emplacement inconnu'); return; }
  const p=await db.productions.get(id); if(!p){ toast('Production introuvable'); return; }
  if(p.emplacement===dest){ closeModal(); toast('Déjà dans cet emplacement'); return; }
  // RÈGLE SÉCURITÉ ALIMENTAIRE : interdiction de recongeler après décongélation.
  if(isFreezer(dest) && aDejaDecongele(p)){
    toast('Recongélation interdite : cette production est déjà passée congélateur → frigo.');
    return;
  }
  // RÈGLE CHAÎNE DU FROID : retour congélateur uniquement dans l'heure suivant la sortie.
  if(isFreezer(dest) && freezerReturnBlocked(p)){
    const exit=freezerExitTs(p);
    toast(`Retour congélateur bloqué : plus d'1 h depuis la sortie (${fmtDateTime(exit)}).`);
    return;
  }
  const nowIso=new Date().toISOString();
  const hist=(p.histEmplacement||[]).concat([{lieu:dest, ts:nowIso, motif:'transfert'}]);
  const nouveauLot = lotAvecEmplacement(p.lotProduction, dest);
  const patch={ emplacement:dest, emplacementMaj:nowIso, histEmplacement:hist, lotProduction:nouveauLot };
  if(isFreezer(dest)) patch.venuDuCongelateur=true; // a séjourné au congélo
  // DLC : recalculée en mode auto ; reste vide tant que la prod est « démarrée »
  if(p.dlcAuto!==false){
    patch.dlcAuto=true;
    patch.dlcProduit = prodStatut(p)==='termine' ? computeDlcFromHistory(hist, nowIso) : '';
  }
  await db.productions.update(id, patch);
  closeModal(); renderProductions();
  const e=empInfo(dest);
  toast(`Rangé en ${e.nom} (${e.lettre}) · lot ${nouveauLot}${patch.dlcProduit?` · DLC ${fmtDate(patch.dlcProduit)}`:''}`);
}
// Compat : ancien point d'entrée « toggle » → ouvre désormais le sélecteur complet.
async function toggleEmplacement(id){ return setEmplacement(id); }
async function saveEmplacement(id){ return setEmplacement(id); }

// ---- DÉCOUPE D'UNE PRODUCTION EN PLUSIEURS PARTIES ----
// Chaque partie devient une production « enfant » : même recette, même base de lot,
// même horodatage et mêmes liens de traçabilité (parentProdId), mais quantité,
// emplacement (lettre de lot), DLC et historique PROPRES. Le stock restant de la
// production d'origine est diminué d'autant. Réutilise toute la mécanique existante.
let _splitDraft=[];
async function prodSplitForm(id){
  const p=await db.productions.get(id); if(!p){ toast('Production introuvable'); return; }
  const dispo=round3(+p.qteRestante||0);
  if(dispo<=0){ toast('Aucun stock restant à découper sur cette production'); return; }
  const recipes=await db.recipes.toArray();
  const recName=rid=>(recipes.find(r=>r.id===rid)||{}).produitNom||'—';
  const decongele=aDejaDecongele(p);
  // 2 parts par défaut
  _splitDraft=[{qte:'',dest:p.emplacement||'frigo'},{qte:'',dest:''}];
  window._splitCtx={id, dispo, decongele, base:lotBaseSansSuffixe(p.lotProduction), recipeId:p.recipeId, recName:recName(p.recipeId)};
  openModal(`<h3>✂ Découper la production</h3>
    <p class="note"><b>${esc(window._splitCtx.recName)}</b> · lot <b>${esc(window._splitCtx.base)}</b> · stock à répartir : <b>${qty(dispo)}</b> pièce(s).</p>
    <p class="note">Indiquez chaque partie : sa quantité et son emplacement. Chaque partie reçoit la lettre de son emplacement dans son n° de lot (ex : ${esc(window._splitCtx.base)}-A). Le reste non réparti demeure sur la production d'origine.</p>
    ${decongele?'<div class="banner" style="background:#fdf3f2;border-color:#e5b4ae"><div>⚠️ Production déjà décongelée : les parties ne peuvent pas aller au congélateur.</div></div>':''}
    <div id="splitRows"></div>
    <button class="btn ghost sm" style="margin-top:6px" onclick="splitAddRow()">+ Ajouter une partie</button>
    <div class="sum-box" id="splitSummary" style="margin-top:8px"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn gold" onclick="prodDoSplit()">Découper</button></div>`);
  drawSplitRows();
}
function drawSplitRows(){
  const ctx=window._splitCtx||{}; const box=document.getElementById('splitRows'); if(!box) return;
  const empOpts=dest=>EMPLACEMENTS.map(e=>{
    const interdit=ctx.decongele && e.type==='congelateur';
    return `<option value="${e.key}" ${dest===e.key?'selected':''} ${interdit?'disabled':''}>${e.icon} ${esc(e.nom)} (${e.lettre})${interdit?' — interdit':''}</option>`;
  }).join('');
  box.innerHTML=_splitDraft.map((r,i)=>`<div class="pay-row" style="align-items:center;gap:6px">
      <input type="number" step="1" min="0" id="sp_q_${i}" value="${r.qte!==''&&r.qte!=null?r.qte:''}" placeholder="qté" style="width:80px" oninput="_splitDraft[${i}].qte=this.value;splitSummary()">
      <select id="sp_d_${i}" style="flex:1;min-width:150px" onchange="_splitDraft[${i}].dest=this.value;splitSummary()"><option value="">— emplacement —</option>${empOpts(r.dest)}</select>
      ${_splitDraft.length>1?`<span class="x" onclick="splitDelRow(${i})">×</span>`:''}
    </div>`).join('');
  splitSummary();
}
function splitAddRow(){ _splitDraft.push({qte:'',dest:''}); drawSplitRows(); }
function splitDelRow(i){ _splitDraft.splice(i,1); drawSplitRows(); }
function splitSummary(){
  const ctx=window._splitCtx||{}; const box=document.getElementById('splitSummary'); if(!box) return;
  let total=0; _splitDraft.forEach(r=>{ total+=Math.max(0,+r.qte||0); });
  total=round3(total);
  const reste=round3((ctx.dispo||0)-total);
  const over=reste<0;
  box.innerHTML=`<div style="display:flex;justify-content:space-between"><span>Réparti / disponible</span><b>${qty(total)} / ${qty(ctx.dispo||0)}</b></div>
    <div style="display:flex;justify-content:space-between"><span>Reste sur la production d'origine</span><b style="color:${over?'#b3261e':'#3f7d52'}">${over?'dépassement '+qty(-reste):qty(reste)}</b></div>`;
}
async function prodDoSplit(){
  const ctx=window._splitCtx; if(!ctx){ return; }
  const p=await db.productions.get(ctx.id); if(!p){ toast('Production introuvable'); return; }
  // lecture + validation
  const parts=[];
  for(let i=0;i<_splitDraft.length;i++){
    const q=round3(+val('sp_q_'+i)||0); const dest=val('sp_d_'+i)||_splitDraft[i].dest||'';
    if(q<=0) continue;
    if(!EMP_BY_KEY[dest]){ toast(`Partie ${i+1} : choisissez un emplacement.`); return; }
    if(isFreezer(dest) && ctx.decongele){ toast(`Partie ${i+1} : recongélation interdite.`); return; }
    parts.push({qte:q, dest});
  }
  if(!parts.length){ toast('Renseignez au moins une partie (quantité + emplacement).'); return; }
  const total=round3(parts.reduce((s,x)=>s+x.qte,0));
  if(total>round3(+p.qteRestante||0)){ toast('La somme des parties dépasse le stock restant.'); return; }

  const nowIso=new Date().toISOString();
  const base=lotBaseSansSuffixe(p.lotProduction);
  await db.transaction('rw', db.productions, async()=>{
    for(const part of parts){
      const hist=[{lieu:part.dest, ts:nowIso, motif:'découpe de production'}];
      const child={
        recipeId:p.recipeId,
        parentProdId:p.parentProdId||p.id,           // rattachement à la prod mère (traçabilité)
        lotBase:base,
        lotProduction:lotAvecEmplacement(base, part.dest),
        date:p.date,
        // quantités : la partie porte sa propre quantité, sans écart (issue d'une prod déjà mesurée)
        qteTheorique:part.qte, qteReelle:part.qte, ecart:0,
        qteProduite:part.qte, qteRestante:part.qte,
        // statut & horodatage hérités (la DLC court selon le statut de la mère)
        prodStatut:prodStatut(p),
        prodDebutTs:p.prodDebutTs||p.prodTimestamp||nowIso,
        prodTermineTs:p.prodTermineTs||'',
        prodTimestamp:p.prodTimestamp||nowIso,
        dlcAuto:p.dlcAuto!==false,
        emplacement:part.dest, emplacementMaj:nowIso,
        venuDuCongelateur: isFreezer(part.dest) || !!p.venuDuCongelateur,
        histEmplacement:hist
      };
      // DLC de la partie : selon son emplacement, ancrée à la fin de prod (ou vide si démarrée)
      child.dlcProduit = (child.prodStatut==='termine' && child.dlcAuto)
        ? computeDlcFromHistory([{lieu:part.dest, ts:(p.prodTermineTs||p.prodTimestamp||nowIso)}], (p.prodTermineTs||p.prodTimestamp||nowIso))
        : '';
      await db.productions.add(child);
    }
    // diminue le stock restant de la production d'origine
    const reste=subQty(p.qteRestante, total);
    await db.productions.update(p.id, {qteRestante:reste});
  });
  window._splitCtx=null; _splitDraft=[];
  closeModal(); renderProductions();
  toast(`${parts.length} partie(s) créée(s) · ${parts.map(x=>`${qty(x.qte)} en ${empLettre(x.dest)}`).join(', ')}`);
}
// STATUT : passe une production de « démarré » à « terminé ».
// C'est CE moment qui déclenche la DLC (7 j au frigo, 4 mois au congélateur).
// Règle : on NE PEUT PAS revenir en arrière (terminé → démarré interdit).
async function prodSetTermine(id){
  const p=await db.productions.get(id); if(!p){ toast('Production introuvable'); return; }
  if(prodStatut(p)==='termine'){ toast('Production déjà terminée — retour en arrière impossible'); return; }
  const comp=prodComposant(p);
  const decongele=aDejaDecongele(p);
  // Emplacements proposés selon le composant (centralisés dans un tableau lisible) :
  //  - coques  : ambiant ou congélateur (jamais frigo)
  //  - ganache : frigo uniquement
  //  - complet/assemble : F / B / C / A (pas d'ambiant)
  const choices=[];
  EMPLACEMENTS.forEach(e=>{
    const freezer=e.type!=='frigo';
    let ok=true;
    if(comp==='coques') ok = freezer;            // congélateur (les coques ambiantes → option dédiée ci-dessous)
    else if(comp==='ganache') ok = (e.type==='frigo');
    if(comp==='ganache' && e.type!=='frigo') ok=false;
    if(decongele && freezer) ok=false;           // recongélation interdite
    if(ok) choices.push({key:e.key, lettre:e.lettre, icon:e.icon, nom:e.nom, freezer});
  });
  if(comp==='coques'){ choices.push({key:'ambiant', lettre:'T°', icon:'🌡️', nom:'Température ambiante', freezer:false}); }
  const rows=choices.map(c=>`<label class="opt-row">
     <input type="radio" name="f_destEnd" value="${c.key}">
     <b class="opt-emp" style="background:${c.freezer?'#3b6ea5':(c.key==='ambiant'?'#caa23b':'#6aa3a0')}">${c.lettre}</b>
     <span class="opt-main"><b>${c.icon} ${esc(c.nom)}</b><br><span class="opt-sub">${c.freezer?'+4 mois':(c.key==='ambiant'?'sans DLC frigo (coques sèches)':'+7 j')}</span></span></label>`).join('');
  openModal(`<h3>✓ Terminer la production</h3>
    <p style="margin-bottom:8px"><b>${esc(p.libre ? (p.produitLibre||'(sans nom)') : ((p.recipeId!=null ? (await db.recipes.get(p.recipeId)) : null)?.produitNom||'?'))}</b> · lot <b>${esc(p.lotProduction||'—')}</b>${comp!=='complet'?` · <span class="tag" style="background:#8a6d3b;color:#fff;font-size:.66rem">${comp==='coques'?'coques':comp==='ganache'?'ganache':comp}</span>`:''}</p>
    <div class="field"><label>Emplacement de rangement *</label>
      <div class="opt-table" id="prodDestEnd">${rows||'<p class="note">Aucun emplacement disponible (recongélation interdite).</p>'}</div></div>
    ${decongele?'<p class="note" style="color:#b3261e">⚠️ Déjà décongelé : le congélateur est désactivé (recongélation interdite).</p>':''}
    <p class="note">La <b>DLC démarre maintenant</b> selon l'emplacement choisi. La lettre s'ajoute au n° de lot.</p>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn gold" onclick="prodTermineConfirm(${id})">Terminer</button></div>`);
}
async function prodTermineConfirm(id){
  const dest=(document.querySelector('input[name="f_destEnd"]:checked')||{}).value||'';
  if(!dest){ toast('Choisis un emplacement'); return; }
  const p=await db.productions.get(id); if(!p){ toast('Production introuvable'); return; }
  const comp=prodComposant(p);
  // garde-fous de cohérence
  if(comp==='coques' && dest==='frigo'){ toast('Les coques ne vont pas au frigo.'); return; }
  if(comp==='ganache' && dest!=='frigo'){ toast('La ganache va uniquement au frigo.'); return; }
  if(isFreezer(dest) && aDejaDecongele(p)){ toast('Recongélation interdite.'); return; }
  const nowIso=new Date().toISOString();
  // ajoute la lettre d'emplacement au lot (base + éventuel suffixe composant déjà présent)
  const newLot = lotAvecEmplacement(p.lotProduction||'', dest);
  const hist=[{lieu:dest, ts:nowIso, motif:'fin de production'}];
  const patch={
    prodStatut:'termine', prodTermineTs:nowIso,
    emplacement:dest, emplacementMaj:nowIso, lotProduction:newLot,
    venuDuCongelateur: isFreezer(dest) || !!p.venuDuCongelateur,
    histEmplacement: hist
  };
  if(p.dlcAuto!==false){
    patch.dlcProduit = computeDlcFromHistory(hist, nowIso);
    if(p.dlcContrainteOuverture && (!patch.dlcProduit || p.dlcContrainteOuverture < patch.dlcProduit)){
      patch.dlcProduit = p.dlcContrainteOuverture; patch.dlcLimiteeParOuverture = true;
    }
    patch.dlcAuto = true;
  }
  await db.productions.update(id, patch);
  closeModal(); renderProductions();
  toast(`Production terminée ✓ · ${empLettre(dest)}${patch.dlcProduit?` · DLC ${fmtDate(patch.dlcProduit)}`:''}`);
}

// ====== ASSEMBLAGE coques + ganache → macaron assemblé (vendable) ======
// Réunit un sous-lot COQUES et un sous-lot GANACHE (idéalement même n° de lot de base)
// en une production « assemble » qui alimente le stock vendable, avec traçabilité de bout en bout.
async function prodAssembleForm(id){
  const p=await db.productions.get(id); if(!p){ toast('Sous-lot introuvable'); return; }
  const comp=prodComposant(p);
  if(comp!=='coques' && comp!=='ganache'){ toast('L\'assemblage part d\'un sous-lot coques ou ganache.'); return; }
  const recName = (window._prodRecName)||((rid)=>'#'+rid);
  const all=await db.productions.toArray();
  const want = comp==='coques' ? 'ganache' : 'coques';
  // Candidats : TOUS les sous-lots complémentaires en stock (tous parfums), car une
  // dégustation peut associer coques et ganache de parfums différents. On trie en mettant
  // le même n° de lot puis la même recette en tête (assemblage « normal »).
  let cands=all.filter(x=>prodComposant(x)===want && round3(+x.qteRestante)>0);
  cands.sort((a,b)=>{
    const sa=(a.lotBase&&a.lotBase===p.lotBase)?0:1, sb=(b.lotBase&&b.lotBase===p.lotBase)?0:1;
    if(sa!==sb) return sa-sb;
    const ra=(a.recipeId===p.recipeId)?0:1, rb=(b.recipeId===p.recipeId)?0:1;
    if(ra!==rb) return ra-rb;
    return (a.dlcProduit||'9999').localeCompare(b.dlcProduit||'9999');
  });
  if(!cands.length){ toast(`Aucun sous-lot ${want==='ganache'?'ganache':'coques'} disponible pour assembler.`); return; }
  const optsCand = cands.map(c=>{
    const same = c.recipeId===p.recipeId;
    const tag = c.lotBase===p.lotBase ? ' · même lot' : (same?'':' · ⚠ parfum différent');
    // 'want' est le composant du candidat : coques → capacité = reste/2 ; ganache → reste
    const capMac = want==='coques' ? Math.floor(round3(+c.qteRestante)/COQUES_PAR_MACARON) : round3(+c.qteRestante);
    const unite = want==='coques' ? `${qty(c.qteRestante)} coques (≈ ${capMac} mac.)` : `${qty(c.qteRestante)} mac.`;
    return `<option value="${c.id}">${esc(recName(c.recipeId))} — ${esc(c.lotProduction||('#'+c.id))} · ${unite}${tag}</option>`;
  }).join('');
  // Capacité en MACARONS de CE sous-lot : coques → /2 ; ganache → tel quel.
  const maxThisMac = comp==='coques' ? Math.floor(round3(+p.qteRestante)/COQUES_PAR_MACARON) : round3(+p.qteRestante);
  const uniteThis = comp==='coques' ? `${qty(p.qteRestante)} coques (≈ ${maxThisMac} macarons)` : `${qty(p.qteRestante)} macarons`;
  openModal(`<h3>🔗 Assembler ${esc(recName(p.recipeId))}</h3>
   <p class="note">1 macaron = <b>2 coques + 1 ganache</b>. Assemblage <b>normal</b> : coques + ganache du même parfum/lot (vendable). Assemblage <b>dégustation</b> : sans correspondance couleur/parfum (offert, non vendable).</p>
   <div class="sum-box"><span>${comp==='coques'?'🟤 Coques':'🍫 Ganache'} (ce lot)</span><b>${esc(p.lotProduction||('#'+p.id))} · ${uniteThis}</b></div>
   <div class="field"><label>${want==='ganache'?'🍫 Ganache à associer':'🟤 Coques à associer'}</label>
     <select id="f_asmOther">${optsCand}</select></div>
   <label class="switch-row"><input type="checkbox" id="f_asmDeg" onchange="prodAsmDegSwitch(this.checked)"> 🥄 Assemblage dégustation (offert, non vendable)</label>
   <div class="field"><label>Quantité de <b>macarons</b> à assembler</label>
     <input type="number" id="f_asmQte" min="1" value="${maxThisMac}" max="${maxThisMac}">
     <p class="note" style="margin-top:4px">Consommera 2 coques + 1 ganache par macaron. Le maximum réel dépend aussi du sous-lot associé.</p></div>
   <div class="field" id="f_asmDestWrap"><label>Emplacement du macaron assemblé *</label>
     <div style="display:flex;flex-wrap:wrap;gap:6px">
       <label class="pay-opt" style="flex:1;min-width:46%;display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="f_asmDest" value="frigo" checked> <b style="background:#6aa3a0;color:#fff;border-radius:6px;padding:0 7px">F</b> 🧊 Frigo (DLC 7 j)</label>
       ${EMPLACEMENTS.filter(e=>e.type!=='frigo').map(e=>`<label class="pay-opt" style="flex:1;min-width:46%;display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="f_asmDest" value="${e.key}"> <b style="background:#3b6ea5;color:#fff;border-radius:6px;padding:0 7px">${e.lettre}</b> ${e.icon} ${esc(e.nom)}</label>`).join('')}
     </div></div>
   <p class="note" id="asmDegHint" style="display:none">🥄 Ces macarons iront dans un <b>stock dégustation séparé</b> (non vendable, valeur 0 €). Tu les décrémenteras au fur et à mesure qu'ils sont distribués (marchés, dégustations).</p>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button>
     <button class="btn gold" onclick="prodAssembleSave(${p.id})">Assembler</button></div>`);
}
function prodAsmDegSwitch(on){
  const h=document.getElementById('asmDegHint'); if(h) h.style.display=on?'block':'none';
}
async function prodAssembleSave(thisId){
  const otherId=+val('f_asmOther');
  let qteAsm=+val('f_asmQte')||0;
  const deg=document.getElementById('f_asmDeg')?.checked;
  const dest=(document.querySelector('input[name="f_asmDest"]:checked')||{}).value||'frigo';
  if(qteAsm<=0){ toast('Quantité invalide'); return; }
  try{
    const res = await db.transaction('rw', db.productions, db.prodConsumption, async ()=>{
      const a=await db.productions.get(thisId); const b=await db.productions.get(otherId);
      if(!a||!b) throw new Error('Sous-lot introuvable');
      const coques = prodComposant(a)==='coques' ? a : (prodComposant(b)==='coques'?b:null);
      const ganache = prodComposant(a)==='ganache' ? a : (prodComposant(b)==='ganache'?b:null);
      if(!coques||!ganache) throw new Error('Il faut un sous-lot coques ET un sous-lot ganache.');
      // qteAsm = nombre de MACARONS. Capacité : coques/2 (2 coques/macaron) et ganache (déjà en macarons).
      const capCoques = Math.floor(round3(+coques.qteRestante)/COQUES_PAR_MACARON);
      const capGanache = round3(+ganache.qteRestante);
      const dispo = Math.min(capCoques, capGanache);
      if(qteAsm>dispo+1e-9) throw new Error(`Max assemblable : ${qty(dispo)} macaron(s) — limité par ${capCoques<=capGanache?'les coques ('+qty(coques.qteRestante)+' coques)':'la ganache ('+qty(ganache.qteRestante)+' macarons)'}.`);
      const coquesUtilisees = qteAsm*COQUES_PAR_MACARON;
      const nowIso=new Date().toISOString();
      const motif = deg ? 'assemblage dégustation' : 'assemblage';
      // DLC : 7 j frigo / 4 mois congélo, plafonné par la DLC la plus courte des composants
      const baseDlc = computeDlcFromHistory([{lieu:dest, ts:nowIso, motif}], nowIso);
      let dlc=baseDlc;
      [coques.dlcProduit, ganache.dlcProduit, coques.dlcContrainteOuverture, ganache.dlcContrainteOuverture].forEach(d=>{
        if(d && (!dlc || d<dlc)) dlc=d;
      });
      const lotBase = coques.lotBase || ganache.lotBase || lotBaseSansSuffixe(coques.lotProduction||'');
      const suff = deg ? '-DG' : '-AS';
      const lotAsm = lotAvecEmplacement((lotBase||genLotCode(3))+suff, dest);
      // décrémente les composants selon le ratio : 2 coques + 1 ganache par macaron
      await db.productions.update(coques.id, {qteRestante: subQty(coques.qteRestante, coquesUtilisees)});
      await db.productions.update(ganache.id, {qteRestante: subQty(ganache.qteRestante, qteAsm)});
      // crée la production assemblée : 'assemble' (vendable) ou 'degustation' (offert, non vendable)
      await db.productions.add({
        recipeId: coques.recipeId, lotProduction: lotAsm, date: today(),
        composant: deg ? 'degustation' : 'assemble', lotBase,
        degustation: !!deg,
        qteTheorique:qteAsm, qteReelle:qteAsm, ecart:0,
        qteProduite:qteAsm, qteRestante:qteAsm,
        dlcProduit:dlc, dlcAuto:true, dlcLimiteeParOuverture: (dlc!==baseDlc),
        prodStatut:'termine', prodDebutTs:nowIso, prodTermineTs:nowIso, prodTimestamp:nowIso,
        emplacement:dest, emplacementMaj:nowIso, venuDuCongelateur:isFreezer(dest),
        histEmplacement:[{lieu:dest, ts:nowIso, motif}],
        assembleFrom:[{id:coques.id, lot:coques.lotProduction, composant:'coques', qte:coquesUtilisees, parfum:(window._prodRecName?window._prodRecName(coques.recipeId):'')},
                      {id:ganache.id, lot:ganache.lotProduction, composant:'ganache', qte:qteAsm, parfum:(window._prodRecName?window._prodRecName(ganache.recipeId):'')}]
      });
      return {lotAsm, dlc, qteAsm, deg};
    });
    closeModal(); renderProductions();
    toast(res.deg
      ? `🥄 Dégustation assemblée ✓ ${qty(res.qteAsm)} · lot ${res.lotAsm} (non vendable)`
      : `Assemblé ✓ ${qty(res.qteAsm)} · lot ${res.lotAsm}${res.dlc?` · DLC ${fmtDate(res.dlc)}`:''}`);
  }catch(err){ toast(err.message||'Erreur assemblage'); }
}
// Décompte des macarons dégustation distribués (offerts) — sort du stock dégustation.
async function prodDegDistribue(id){
  const p=await db.productions.get(id); if(!p){ toast('Lot introuvable'); return; }
  const reste=round3(+p.qteRestante||0);
  if(reste<=0){ toast('Plus de stock dégustation sur ce lot.'); return; }
  openModal(`<h3>🥄 Dégustations distribuées</h3>
   <p class="note">Combien de macarons de ce lot dégustation as-tu distribués (offerts) ? Ils sortent du stock dégustation.</p>
   <div class="sum-box"><span>Lot ${esc(p.lotProduction||('#'+p.id))}</span><b>reste ${qty(reste)}</b></div>
   <div class="field"><label>Quantité distribuée</label><input type="number" id="f_degQte" min="1" max="${reste}" value="${reste}"></div>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button>
     <button class="btn gold" onclick="prodDegDistribueSave(${p.id})">Décompter</button></div>`);
}
async function prodDegDistribueSave(id){
  const q=+val('f_degQte')||0;
  const p=await db.productions.get(id); if(!p){ toast('Lot introuvable'); return; }
  const reste=round3(+p.qteRestante||0);
  if(q<=0){ toast('Quantité invalide'); return; }
  if(q>reste+1e-9){ toast(`Maximum ${qty(reste)}.`); return; }
  await db.productions.update(id, {qteRestante: subQty(reste, q)});
  closeModal(); renderProductions();
  toast(`🥄 ${qty(q)} dégustation(s) distribuée(s) · reste ${qty(subQty(reste,q))}`);
}
async function prodForm(){
  const recipes = await db.recipes.toArray();
  // Mode DÉCOUVERTE : si aucune recette n'existe encore, on propose une production « libre »
  // (nom saisi à la main, sans recette ni consommation de matières) pour se familiariser.
  if(!recipes.length){ return prodFormLibre(); }
  // Garde-fou : on ne peut pas démarrer une nouvelle production tant qu'une
  // production reste « démarrée » depuis plus de 4 jours (à terminer ou supprimer).
  const allProds = await db.productions.toArray();
  const enRetard = allProds.filter(prodOpenOverdue);
  if(enRetard.length){
    toast(`${enRetard.length} production(s) ouverte(s) depuis plus de ${PROD_OPEN_MAX_DAYS} j : terminez-les ou supprimez-les avant d'en lancer une nouvelle.`);
    return;
  }
  _prodReelTouched=false;
  const opts = recipes.map(r=>`<option value="${r.id}" data-rend="${r.rendement}">${esc(r.produitNom)} (${r.rendement}/batch)</option>`).join('');
  openModal(`<h3>Nouvelle production</h3>
   <p class="note" style="margin:-2px 0 10px"><span class="act" onclick="prodFormLibre()">⚡ Production rapide (sans recette) →</span> <span style="color:#9a8a82">pour se familiariser sans tout paramétrer</span></p>
   <div class="field"><label>Mode de production</label>
     <select id="f_mode" onchange="prodModeSwitch(this.value)">
       <option value="complet">Batch complet (coques + ganache assemblés)</option>
       <option value="composant">Par composants (coques / ganache séparés)</option>
     </select></div>
   <div class="field"><label>Recette</label><select id="f_rec" onchange="prodSyncTheorique()">${opts}</select></div>
   <div class="field" id="f_compWrap" style="display:none"><label>Composant à produire</label>
     <div class="opt-table">
       <label class="opt-row"><input type="radio" name="f_comp" value="coques" checked onchange="prodCompSwitch()"> <span class="opt-ico">🟤</span> <span class="opt-main"><b>Coques</b><br><span class="opt-sub">rangement : ambiant ou congélateur (jamais frigo)</span></span></label>
       <label class="opt-row"><input type="radio" name="f_comp" value="ganache" onchange="prodCompSwitch()"> <span class="opt-ico">🍫</span> <span class="opt-main"><b>Ganache</b><br><span class="opt-sub">rangement : frigo uniquement</span></span></label>
     </div></div>
   <div class="row2">
     <div class="field"><label>Quantité théorique <span style="color:#9a8a82;font-weight:400" id="qteUnit">— en macarons (base matières)</span></label>
       <input type="number" id="f_qte" value="${recipes[0].rendement}" min="1" oninput="prodSyncReelDefault()"></div>
     <div class="field"><label>Date</label><input type="date" id="f_date" value="${today()}"></div>
   </div>
   <p class="note" id="coqueHint" style="display:none;margin:-4px 0 8px;color:#8a6d3b"></p>
   <div class="field"><label>Quantité réelle produite <span style="color:#9a8a82;font-weight:400">— stock produits finis (modifiable en fin de production)</span></label>
     <input type="number" id="f_qtereel" value="${recipes[0].rendement}" min="0" oninput="_prodReelTouched=true;prodUpdateEcartHint()">
     <p class="note" id="ecartHint" style="margin-top:4px;display:none"></p></div>
   <div class="field"><label>N° lot de production <span style="color:#9a8a82;font-weight:400">— la lettre d'emplacement s'ajoutera à la fin</span></label><input id="f_lot" value="L-${today().replace(/-/g,'')}-${genLotCode(3)}"></div>
   <p class="note" id="dlcHint">La production démarre au statut <b>« démarrée »</b>. Tu choisiras l'<b>emplacement de rangement</b> au moment de la <b>fin de production</b> (« ✓ Terminer »), et la DLC (<b>+7 j</b> frigo, <b>+4 mois</b> congélateur) ne courra qu'à ce moment-là.</p>
   <p class="note">Les <b>matières premières</b> sont déduites sur la base de la <b>quantité théorique</b> (DLC la plus proche d'abord). Le <b>stock de produits finis</b> est calé sur la <b>quantité réelle</b>. L'écart est historisé. Si le stock matières est insuffisant, <b>rien</b> n'est enregistré.</p>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn gold" onclick="saveProd()">Lancer la production</button></div>`);
  prodSyncReelDefault();
}
// Bascule entre batch complet et production par composants.
function prodModeSwitch(mode){
  const w=document.getElementById('f_compWrap'); if(w) w.style.display = mode==='composant'?'block':'none';
  prodCompSwitch();
}
// Met à jour la note « coques » (1 macaron = 2 coques) selon le composant choisi.
function prodCompSwitch(){
  const mode=document.getElementById('f_mode')?.value||'complet';
  const comp=(document.querySelector('input[name="f_comp"]:checked')||{}).value||'coques';
  const hint=document.getElementById('coqueHint');
  const unit=document.getElementById('qteUnit');
  const isCoques = (mode==='composant' && comp==='coques');
  if(unit) unit.textContent = isCoques ? '— en macarons (× 2 coques)' : '— en macarons (base matières)';
  if(hint){
    if(isCoques){
      hint.style.display='block';
      prodUpdateCoqueHint();
    } else { hint.style.display='none'; }
  }
}
function prodUpdateCoqueHint(){
  const hint=document.getElementById('coqueHint'); if(!hint) return;
  const q=+(document.getElementById('f_qte')?.value)||0;
  hint.innerHTML = `🟤 1 macaron = <b>2 coques</b> → ce batch produira <b>${qty(q*COQUES_PAR_MACARON)} coques</b> (pour ${qty(q)} macarons).`;
}
// Aperçu live de la DLC : désormais informatif (l'emplacement est choisi à la fin).
function prodDlcHint(){ /* l'emplacement et la DLC sont fixés à la fin de production */ }
// Quand on change de recette, recale les deux quantités sur le rendement de la recette.
function prodSyncTheorique(){
  const sel=document.getElementById('f_rec'); if(!sel) return;
  const rend=+sel.options[sel.selectedIndex]?.dataset.rend || 0;
  const th=document.getElementById('f_qte'), re=document.getElementById('f_qtereel');
  if(th && rend){ th.value=rend; }
  if(re && rend){ re.value=rend; }
  prodSyncReelDefault();
  prodUpdateCoqueHint();
}
// Tant que l'utilisateur n'a pas touché la quantité réelle, on la garde égale au théorique
// et on affiche l'écart en direct.
let _prodReelTouched=false;
function prodSyncReelDefault(){
  const th=+(document.getElementById('f_qte')?.value)||0;
  const re=document.getElementById('f_qtereel');
  if(re && !_prodReelTouched){ re.value=th; }
  prodUpdateEcartHint();
  prodUpdateCoqueHint();
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
  const date=val('f_date')||today(); let lot=val('f_lot');
  const mode=document.getElementById('f_mode')?.value||'complet';
  const comp=(document.querySelector('input[name="f_comp"]:checked')||{}).value||'coques';
  const composant = mode==='composant' ? comp : 'complet';
  if(!qteTheorique||qteTheorique<=0){toast('Quantité théorique invalide');return;}
  if(qteReelle<0||isNaN(qteReelle)){toast('Quantité réelle invalide');return;}
  // L'emplacement n'est plus demandé au lancement : il sera choisi à la fin de production.
  // Nettoyage des lettres ambiguës (I, L, O) sur la PARTIE VARIABLE uniquement
  const baseLot = lotBaseSansSuffixe(val('f_lot'));
  const m = baseLot.match(/^(L-\d{8}-)(.*)$/i);
  let lotPrefix, lotCode;
  if(m){ lotPrefix=m[1].toUpperCase(); lotCode=m[2]; }
  else { lotPrefix=''; lotCode=baseLot; }
  const san=sanitizeLot(lotCode);
  if(san.changed) toast('Lettres ambiguës (I, L, O) retirées du n° de lot.');
  let cleanBase = lotPrefix + san.lot;
  if(!san.lot){ cleanBase = lotPrefix + genLotCode(3); }
  // suffixe composant (CO/GA) — la lettre d'emplacement sera ajoutée à la fin de production
  const suffComp = composant==='coques' ? '-CO' : (composant==='ganache' ? '-GA' : '');
  lot = cleanBase + suffComp;   // pas encore de lettre d'emplacement
  if(!lotBaseSansSuffixe(lot)){ toast('N° de lot vide — saisissez un identifiant.'); return; }
  // COQUES : 1 macaron = 2 coques. La quantité SAISIE est en macarons (rendement recette) ;
  // on stocke le nombre de COQUES (×2). Les matières restent calées sur le nombre de macarons.
  let qTh=qteTheorique, qRe=qteReelle, facteurQte=qteTheorique;
  if(composant==='coques'){
    qTh = qteTheorique*COQUES_PAR_MACARON;
    qRe = qteReelle*COQUES_PAR_MACARON;
    facteurQte = qteTheorique;   // matières basées sur les macarons (pas les coques)
  }
  try{
    await enregistrerProduction(recipeId, qTh, qRe, date, lot, '', '',
      {composant, lotBase:cleanBase, facteurQte});
    renderProductions();
    const lbl = composant==='coques'?'Coques':composant==='ganache'?'Ganache':'Production';
    const extra = composant==='coques'?` (${qty(qTh)} coques pour ${qty(qteTheorique)} macarons)`:'';
    toast(`${lbl} démarrée ✓${extra}`);
    // Affiche aussitôt la fiche recette recalculée aux quantités du batch, pour produire.
    await ficheRecetteProduction(recipeId, facteurQte, composant, lot);
  }catch(err){
    toast(err.message || 'Erreur production');
  }
}
// Fiche recette recalculée aux quantités d'un batch (affichée juste après le lancement).
// Met à l'échelle chaque ingrédient selon le nombre de macarons produits, en ne montrant
// que les ingrédients du composant concerné (coque / ganache) si la recette est étiquetée.
async function ficheRecetteProduction(recipeId, nbMacarons, composant, lot){
  const rec = recipeId!=null ? await db.recipes.get(recipeId) : null;
  if(!rec){ closeModal(); return; }
  const allItems = await db.recipeItems.where('recipeId').equals(recipeId).toArray();
  const mats = await db.materials.toArray();
  const matName = id => (mats.find(m=>m.id===id)||{}).nom || '(matière ?)';
  const dispOf = id => { const m=mats.find(x=>x.id===id)||{}; const u=(m.unite||'').toLowerCase();
    return (u==='kg') ? {u:'g', f:1000} : {u:m.unite||'', f:1}; };
  const rendement = +rec.rendement||1;
  const facteur = rendement>0 ? (nbMacarons/rendement) : 0;
  const etiquetee = allItems.some(it=>it.partie==='coque'||it.partie==='ganache');
  let items = allItems;
  if(etiquetee && (composant==='coques'||composant==='ganache')){
    const cible = composant==='coques' ? 'coque' : 'ganache';
    items = allItems.filter(it=> it.partie===cible || !it.partie);
  }
  const compLabel = composant==='coques'?'🟤 Coques':composant==='ganache'?'🍫 Ganache':'🍩 Complet';
  // Total par matière (pour afficher « crème : 150 g » quand elle est répartie sur plusieurs lignes).
  const totParMat = {};
  items.forEach(it=>{ const d=dispOf(it.materialId); const q=round3((+it.qteParBatch||0)*d.f*facteur);
    if(!totParMat[it.materialId]) totParMat[it.materialId]={q:0, u:d.u, n:0};
    totParMat[it.materialId].q = round3(totParMat[it.materialId].q + q);
    totParMat[it.materialId].n++; });
  const rows = items.map(it=>{ const d=dispOf(it.materialId);
    const q = round3((+it.qteParBatch||0)*d.f*facteur);
    const partTag = it.partie ? ` <span class="tag" style="background:${it.partie==='coque'?'#8a6d3b':'#5a3a2a'};color:#fff;font-size:.6rem">${it.partie}</span>` : '';
    const etiq = it.etiquette ? ` <span style="color:#9a8a82;font-size:.8rem">${esc(it.etiquette)}</span>` : '';
    return `<tr><td>${esc(matName(it.materialId))}${etiq}${partTag}</td><td style="text-align:right"><b>${qty(q)}</b> ${esc(d.u)}</td></tr>`;
  }).join('') || '<tr><td colspan="2" class="note">Aucun ingrédient renseigné pour ce composant.</td></tr>';
  // Lignes de sous-total (uniquement pour les matières présentes sur 2+ lignes : c'est ton cas crème chaude/froide).
  const totals = Object.keys(totParMat).filter(id=>totParMat[id].n>1)
    .map(id=>`<tr style="background:#faf6ef"><td><b>Total ${esc(matName(+id))}</b> <span style="color:#9a8a82;font-size:.74rem">(prélevé du stock)</span></td><td style="text-align:right"><b>${qty(totParMat[id].q)}</b> ${esc(totParMat[id].u)}</td></tr>`).join('');
  openModal(`<h3>📋 Fiche de production</h3>
    <p style="margin-bottom:4px"><b>${esc(rec.produitNom)}</b> · ${compLabel} · lot <b>${esc(lot||'—')}</b></p>
    <p class="note" style="margin-bottom:12px">Quantités calculées pour <b>${qty(nbMacarons)} macaron(s)</b> (recette de base : ${rendement}/batch). Suis ces grammages pour produire.</p>
    <div class="table-wrap"><table><thead><tr><th>Ingrédient</th><th style="text-align:right">Quantité</th></tr></thead><tbody>${rows}${totals?`<tr><td colspan="2" style="padding:2px"></td></tr>${totals}`:''}</tbody></table></div>
    <p class="note" style="margin-top:10px">La production est <b>démarrée</b>. Tu choisiras l'emplacement de rangement à la fin (✓ Terminer dans la liste).</p>
    <div class="modal-actions"><button class="btn gold" onclick="closeModal()">C'est parti 🧑‍🍳</button></div>`);
}
// ---- MODE DÉCOUVERTE : production « libre » sans recette ni consommation de matières ----
// Permet de se familiariser avec l'app. Ces productions sont marquées « libre » et pourront
// être supprimées plus tard. Elles ne décrémentent AUCUN stock.
function prodFormLibre(){
  openModal(`<h3>Production rapide ⚡</h3>
   <p class="note" style="margin-bottom:10px">Pour te familiariser : crée une production avec juste un <b>nom</b>, sans recette ni matières. Aucun stock n'est touché. Tu pourras la compléter ou la supprimer plus tard.</p>
   <div class="field"><label>Nom du produit</label><input id="fl_nom" placeholder="ex. Macaron chocolat" autocomplete="off"></div>
   <div class="row2">
     <div class="field"><label>Quantité produite</label><input type="number" id="fl_qte" value="30" min="1"></div>
     <div class="field"><label>Date</label><input type="date" id="fl_date" value="${today()}"></div>
   </div>
   <div class="field"><label>N° lot de production</label><input id="fl_lot" value="L-${today().replace(/-/g,'')}-${genLotCode(3)}"></div>
   <p class="note">Cette production apparaîtra avec une étiquette <b>« libre »</b> pour que tu la repères. Elle n'entre pas dans les calculs de coût tant qu'elle n'est pas reliée à une recette.</p>
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn gold" onclick="saveProdLibre()">Lancer la production</button></div>`);
  setTimeout(()=>{ const el=document.getElementById('fl_nom'); if(el) el.focus(); }, 60);
}
async function saveProdLibre(){
  const nom=val('fl_nom').trim();
  if(!nom){ toast('Donne un nom au produit'); return; }
  const qte=+val('fl_qte'); if(!qte||qte<=0){ toast('Quantité invalide'); return; }
  const date=val('fl_date')||today();
  const baseLot=lotBaseSansSuffixe(val('fl_lot'));
  const san=sanitizeLot(baseLot.replace(/^(L-\d{8}-)/i,''));
  const m=baseLot.match(/^(L-\d{8}-)(.*)$/i);
  const lot=(m?m[1].toUpperCase():'')+(san.lot||genLotCode(3));
  try{
    await db.productions.add({
      recipeId: null, produitLibre: nom, libre: true,
      qteTheorique: qte, qteReelle: qte, qteProduite: qte, qteRestante: qte,
      date, lotProduction: lot, lotBase: lot,
      composant: 'complet', prodStatut: 'demarre', emplacement: '',
      prodDebutTs: new Date().toISOString()
    });
    closeModal(); renderProductions();
    toast(`Production « ${nom} » créée ✓ (mode découverte)`);
  }catch(err){ console.error(err); toast('Erreur création'); }
}
// Transaction atomique : consommation FIFO (théorique) + traçabilité + stock fini (réel)
async function enregistrerProduction(recipeId, qteTheorique, qteReelle, dateProd, lotProduction, dlcProduit, emplacement, meta){
  meta=meta||{};
  return db.transaction('rw',
    db.recipes, db.recipeItems, db.materials, db.materialLots, db.productions, db.prodConsumption,
    async () => {
      const recette = await db.recipes.get(recipeId);
      if(!recette) throw new Error('Recette introuvable');
      if(!EMP_BY_KEY[emplacement] && emplacement!=='ambiant' && emplacement!=='') throw new Error('Emplacement de rangement invalide');
      const allItems = await db.recipeItems.where('recipeId').equals(recipeId).toArray();
      // CONSOMMATION PAR COMPOSANT : un batch « coques » ne puise que les ingrédients
      // étiquetés coque ; un batch « ganache » que les ingrédients ganache ; un batch
      // « complet » puise tout. Évite le double comptage quand on produit en 2 temps.
      // Rétro-compat : si AUCUN ingrédient n'est étiqueté (anciennes recettes), on consomme
      // tout quel que soit le composant (comportement d'avant l'étiquetage).
      const comp = meta.composant || 'complet';
      const recetteEtiquetee = allItems.some(it=>it.partie==='coque'||it.partie==='ganache');
      let items = allItems;
      if(recetteEtiquetee && (comp==='coques' || comp==='ganache')){
        const cible = comp==='coques' ? 'coque' : 'ganache';
        // un ingrédient non étiqueté est considéré commun → consommé par les deux composants
        items = allItems.filter(it=> it.partie===cible || !it.partie);
      }
      // CONSOMMATION MATIÈRES : basée sur la quantité de MACARONS-équivalent.
      // Pour les coques, qteTheorique est en COQUES ; meta.facteurQte donne le nb de macarons.
      const baseFacteur = (meta.facteurQte!=null) ? meta.facteurQte : qteTheorique;
      const facteur = baseFacteur / (recette.rendement || 1);

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
      // STATUT : toute nouvelle production démarre au statut « démarré ».
      // La DLC (7 j frigo) ne court qu'à partir du passage en « terminée ».
      // Tant que la prod est « démarrée », aucune DLC n'est figée.
      const prodId = await db.productions.add({
        recipeId, lotProduction, date:dateProd,
        composant: meta.composant||'complet',   // 'complet' | 'coques' | 'ganache' | 'assemble'
        lotBase: meta.lotBase||'',               // n° de lot commun (relie coques/ganache/assemblé)
        qteTheorique, qteReelle, ecart,
        // STOCK PRODUITS FINIS : calé sur la quantité réelle
        // qteProduite/qteRestante conservés pour compat. (lecture par trace, liaison commandes, analytics)
        qteProduite: qteReelle, qteRestante: qteReelle,
        dlcProduit: '',                 // DLC non encore active (production en cours)
        dlcAuto: true,                  // marque une DLC calculée automatiquement (dès la fin de prod)
        // STATUT DE PRODUCTION : 'demarre' | 'termine'
        prodStatut: 'demarre',          // démarre toujours « en cours »
        prodDebutTs: nowIso,            // horodatage de démarrage (sert au plafond des 4 jours)
        prodTermineTs: '',              // horodatage de passage en « terminée » (déclenche la DLC)
        // Traçabilité conservation : horodatage + emplacement + journal des déplacements
        prodTimestamp: nowIso,          // date + HEURE réelles de production (horodatage auto)
        emplacement,                    // '' au démarrage ; choisi à la fin de production
        emplacementMaj: nowIso,         // date/heure du dernier changement d'emplacement
        venuDuCongelateur: isFreezer(emplacement), // a séjourné au congélo (suivi de la règle de décongélation)
        histEmplacement: emplacement ? [{lieu:emplacement, ts:nowIso, motif:'production'}] : []
      });

      let dlcOuvertureMin = '';   // DLC la plus courte issue d'une matière périssable ouverte
      for(const item of items){
        let besoin = round3(item.qteParBatch * facteur);
        const mat = await db.materials.get(item.materialId);
        const peri = mat && mat.perissableOuvert;
        const nbJoursOuv = peri ? (Math.max(1,+mat.joursApresOuverture||7)) : 0;
        const lots = await db.materialLots
          .where('materialId').equals(item.materialId)
          .and(l=>+l.qteRestante>0).toArray();
        lots.sort(lotFifoCompare); // FIFO : lots de reprise d'abord, puis DLC la plus proche
        for(const lot of lots){
          if(besoin<=1e-9) break;
          const pris = round3(Math.min(besoin, +lot.qteRestante));
          const patch = {qteRestante: subQty(lot.qteRestante, pris)};
          // CRÈME/LAIT OUVERT : on horodate l'ouverture à la 1ʳᵉ utilisation et on calcule
          // une DLC d'ouverture (date + N jours). Au plus prudent : écrase si plus courte.
          if(peri){
            let ouvertLe = lot.ouvertLe;
            if(!ouvertLe){ ouvertLe = nowIso; patch.ouvertLe = nowIso;
              const d = new Date(nowIso); d.setDate(d.getDate()+nbJoursOuv);
              patch.dlcOuverture = d.toISOString().slice(0,10);
            }
            const dOuv = lot.dlcOuverture || patch.dlcOuverture;
            if(dOuv && (!dlcOuvertureMin || dOuv<dlcOuvertureMin)) dlcOuvertureMin = dOuv;
          }
          await db.materialLots.update(lot.id, patch);
          // T2 : on fige (dénormalise) l'origine pour que la traçabilité survive à toute suppression future
          await db.prodConsumption.add({productionId:prodId, materialLotId:lot.id, qteConsommee:pris,
            snapMaterialId:item.materialId, snapLotFournisseur:lot.lotFournisseur||'',
            snapSupplierId:lot.supplierId||0, snapDlc:lot.dlc||'',
            snapDlcOuverture: peri ? (lot.dlcOuverture||patch.dlcOuverture||'') : ''});
          besoin = subQty(besoin, pris);
        }
      }
      // Mémorise la contrainte de DLC d'ouverture sur la production (sert au plafonnement + ordonnancement).
      if(dlcOuvertureMin){ await db.productions.update(prodId, {dlcContrainteOuverture: dlcOuvertureMin}); }
      return prodId;
    });
}

// AJUSTEMENT DE FIN DE PRODUCTION : réviser la quantité réelle produite.
// - les matières NE sont PAS retouchées (consommation figée sur le théorique)
// - le stock de produits finis est ajusté du delta réel
// - l'écart théorique/réel est ré-historisé
async function prodAdjustForm(id){
  const p = await db.productions.get(id); if(!p){ toast('Production introuvable'); return; }
  const recipe = p.recipeId!=null ? await db.recipes.get(p.recipeId) : null;
  const th = (p.qteTheorique!=null)?p.qteTheorique:p.qteProduite;
  const re = (p.qteReelle!=null)?p.qteReelle:p.qteProduite;
  const estCoques = prodComposant(p)==='coques';
  const u = estCoques ? 'coques' : 'macarons';
  // pièces déjà sorties de ce batch (affectées à des commandes) = qteProduite - qteRestante
  const dejaSorti = (+p.qteProduite||0) - (+p.qteRestante||0);
  openModal(`<h3>Ajuster la quantité réelle</h3>
    <p style="margin-bottom:8px"><b>${esc(recipe?recipe.produitNom:'?')}</b> · lot <b>${esc(p.lotProduction||'—')}</b>${estCoques?' · <span class="tag" style="background:#8a6d3b;color:#fff;font-size:.66rem">🟤 coques</span>':''}</p>
    ${estCoques?`<p class="note" style="margin-bottom:8px">🟤 Les quantités sont en <b>coques</b> (1 macaron = 2 coques).</p>`:''}
    <div class="sum-box"><span>Quantité théorique (base matières)</span><b>${qty(th)} ${u}</b></div>
    <div class="sum-box"><span>Quantité réelle actuelle</span><b>${qty(re)} ${u}</b></div>
    ${dejaSorti>0?`<div class="sum-box"><span>Déjà affecté à des commandes</span><b>${qty(dejaSorti)} ${u}</b></div>`:''}
    <div class="field" style="margin-top:10px"><label>Nouvelle quantité réelle produite (${u})</label>
      <input type="number" id="f_newreel" value="${re}" min="${dejaSorti}" oninput="prodAdjHint(${th},${dejaSorti})">
      ${estCoques?`<button class="btn ghost sm" style="margin-top:6px" onclick="document.getElementById('f_newreel').value=Math.round((+document.getElementById('f_newreel').value||0)*2);prodAdjHint(${th},${dejaSorti})">×2 — convertir macarons → coques (ancien lot)</button>`:''}
      <p class="note" id="adjHint" style="margin-top:4px"></p></div>
    <p class="note">Les matières premières restent inchangées (déjà consommées sur la base théorique). Seul le stock de produits finis et l'écart sont recalculés.</p>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn gold" onclick="prodAdjustReel(${id})">Enregistrer l'ajustement</button></div>`);
  prodAdjHint(th, dejaSorti);
}

/* ============================================================
   CORRECTION ASSISTÉE — anciens lots COQUES non convertis (×2)
   ------------------------------------------------------------
   Avant l'introduction de la conversion automatique « 1 macaron = 2 coques »,
   un batch de 60 macarons en coques stockait 60 coques au lieu de 120.
   On NE corrige RIEN automatiquement (risque de doubler un lot déjà bon).
   À la place : on détecte les lots SUSPECTS (quantité ≈ rendement, pas ×2)
   et on laisse l'utilisateur cocher ceux à doubler. Sûr et réversible.
   ============================================================ */
async function detectCoquesSuspects(){
  const [prods, recipes] = await Promise.all([db.productions.toArray(), db.recipes.toArray()]);
  const recById = {}; recipes.forEach(r=>recById[r.id]=r);
  const out=[];
  prods.forEach(p=>{
    if(prodComposant(p)!=='coques') return;
    const rec=recById[p.recipeId]; if(!rec) return;
    const rend=+rec.rendement||0; if(rend<=0) return;
    const qTh=+p.qteTheorique||0;
    // Lot déjà converti si qté ≈ un multiple pair du rendement (≥ rendement×2).
    // Suspect si qté est proche du rendement SIMPLE (pas doublé) -> ancien lot.
    // tolérance 15 % pour absorber casse/écarts.
    const ratio = qTh/rend;
    const suspect = ratio>0.7 && ratio<1.4;   // ~1× rendement => non doublé
    if(suspect && !p._coquesConverti){
      out.push({id:p.id, lot:p.lotProduction||('#'+p.id), parfum:rec.produitNom||('#'+p.recipeId),
        rend, qTh, qRe:+p.qteReelle||qTh, propose: qTh*2, propRe:(+p.qteReelle||qTh)*2,
        date:p.date||''});
    }
  });
  return out;
}
async function reviewCoquesMigration(silentIfNone){
  const susp = await detectCoquesSuspects();
  if(!susp.length){
    if(!silentIfNone) toast('Aucun ancien lot de coques à corriger ✓');
    return;
  }
  const rows = susp.map(s=>`<label class="pay-opt" style="display:flex;align-items:flex-start;gap:9px;padding:10px;border:1px solid #e7dcc9;border-radius:10px;margin-top:7px;cursor:pointer">
    <input type="checkbox" class="coqMigChk" data-id="${s.id}" data-prop="${s.propose}" data-propre="${s.propRe}" checked style="margin-top:3px">
    <div style="flex:1">
      <div><b>${esc(s.parfum)}</b> <span style="color:#9a8a82;font-size:.74rem">lot ${esc(s.lot)}${s.date?' · '+fmtDate(s.date):''}</span></div>
      <div style="font-size:.82rem;margin-top:2px">actuel : <b>${qty(s.qTh)} coques</b> → corrigé : <b style="color:#2e7d32">${qty(s.propose)} coques</b> <span style="color:#9a8a82">(= ${qty(s.rend)} macarons)</span></div>
    </div></label>`).join('');
  openModal(`<h3>🔧 Corriger les anciens lots de coques</h3>
    <div class="banner" style="background:#fff8ec;border-color:#e8cfa0"><div>${susp.length} lot(s) de coques semblent dater d'avant la conversion automatique (1 macaron = 2 coques). Leur quantité paraît <b>non doublée</b>. Coche ceux à corriger — <b>vérifie chacun</b> avant de valider, surtout si tu as fait des demi-batchs.</div></div>
    <div style="max-height:42vh;overflow:auto;margin-top:6px">${rows}</div>
    <p class="note" style="margin-top:8px">La correction double les coques (théorique + réel) ; les matières et la ganache ne changent pas. Réversible via « ✎ Réel » sur chaque lot.</p>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn gold" onclick="applyCoquesMigration()">Corriger les lots cochés</button></div>`);
}
async function applyCoquesMigration(){
  const chks=[...document.querySelectorAll('.coqMigChk:checked')];
  if(!chks.length){ closeModal(); toast('Aucun lot sélectionné.'); return; }
  let n=0;
  for(const c of chks){
    const id=+c.dataset.id, prop=+c.dataset.prop, propRe=+c.dataset.propre;
    const p=await db.productions.get(id); if(!p) continue;
    const dejaSorti=(+p.qteProduite||0)-(+p.qteRestante||0);
    const newRestant=Math.max(0, propRe - dejaSorti);
    await db.productions.update(id, {
      qteTheorique:prop, qteReelle:propRe, qteProduite:propRe,
      qteRestante:newRestant, _coquesConverti:true,
      ecart: propRe - prop
    });
    n++;
  }
  closeModal(); renderProductions();
  toast(`${n} lot(s) de coques corrigé(s) ✓`);
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

/* ------------------------------------------------------------
   DÉCLARATION DE PERTE / CASSE sur stock fini.
   Décrémente le stock disponible (qteRestante) du batch et enregistre
   un événement de perte traçable (date, motif, quantité, coût unitaire figé).
   Le coût unitaire est snapshoté pour le KPI et l'imputation au coût de revient.
   ------------------------------------------------------------ */
async function declareLossForm(prodId){
  const p = await db.productions.get(prodId); if(!p){ toast('Production introuvable'); return; }
  const recipe = p.recipeId!=null ? await db.recipes.get(p.recipeId) : null;
  const dispo = round3(+p.qteRestante||0);
  if(dispo<=0){ toast('Aucune pièce disponible dans ce batch'); return; }
  const motifOpts = LOSS_REASONS.map(m=>`<option>${esc(m)}</option>`).join('');
  const uLoss = prodComposant(p)==='coques' ? 'coques' : 'pièces';
  openModal(`<h3>Déclarer une perte</h3>
    <p style="margin-bottom:8px"><b>${esc(recipe?recipe.produitNom:'?')}</b> · lot <b>${esc(p.lotProduction||'—')}</b>${prodComposant(p)==='coques'?' · <span class="tag" style="background:#8a6d3b;color:#fff;font-size:.66rem">🟤 coques</span>':''}</p>
    <div class="sum-box"><span>Stock disponible de ce batch</span><b>${qty(dispo)} ${uLoss}</b></div>
    <div class="field" style="margin-top:10px"><label>Quantité perdue (${uLoss})</label>
      <input type="number" id="f_lossQte" min="0" max="${dispo}" step="1" value="" placeholder="ex : 3"></div>
    <div class="field"><label>Motif</label><select id="f_lossMotif">${motifOpts}</select></div>
    <label class="switch-row"><input type="checkbox" id="f_lossDeg" onchange="lossDegSwitch(this.checked)"> 🥄 Cassé mais garni → bascule en dégustation (offert, non perdu)</label>
    <div class="field" id="f_lossDestWrap" style="display:none"><label>Emplacement des dégustations</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        <label class="pay-opt" style="flex:1;min-width:46%;display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="f_lossDest" value="frigo" checked> <b style="background:#6aa3a0;color:#fff;border-radius:6px;padding:0 7px">F</b> 🧊 Frigo (DLC 7 j)</label>
        ${EMPLACEMENTS.filter(e=>e.type!=='frigo').map(e=>`<label class="pay-opt" style="flex:1;min-width:46%;display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="f_lossDest" value="${e.key}"> <b style="background:#3b6ea5;color:#fff;border-radius:6px;padding:0 7px">${e.lettre}</b> ${e.icon} ${esc(e.nom)}</label>`).join('')}
      </div></div>
    <div class="field"><label>Date</label><input type="date" id="f_lossDate" value="${today()}"></div>
    <div class="field"><label>Note (facultatif)</label><input id="f_lossNote" placeholder="détail, circonstances…"></div>
    <p class="note" id="lossDegHint">La perte sort définitivement du stock fini et alimente le taux de perte. Le coût des pièces perdues est imputé au coût de revient global.</p>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn danger" onclick="saveLoss(${prodId})">Déclarer</button></div>`);
}
function lossDegSwitch(on){
  const w=document.getElementById('f_lossDestWrap'); if(w) w.style.display=on?'block':'none';
  const h=document.getElementById('lossDegHint');
  if(h) h.innerHTML = on
    ? '🥄 Ces pièces cassées mais garnies ne sont <b>pas comptées en perte</b> : elles basculent en <b>stock dégustation</b> (offert, non vendable), à distribuer (marchés…).'
    : 'La perte sort définitivement du stock fini et alimente le taux de perte. Le coût des pièces perdues est imputé au coût de revient global.';
}
// ACCÈS RAPIDE « Casse / Perte » : sortir une pièce du stock sans passer par la fiche
// d'un batch. On liste les batchs vendables avec stock ; le choix ouvre la déclaration
// de perte existante (coût, KPI et option « cassé garni » réutilisés tels quels).
async function quickLossForm(){
  const [prods, recipes] = await Promise.all([db.productions.toArray(), db.recipes.toArray()]);
  const recName = id => (recipes.find(r=>r.id===id)||{}).produitNom||'?';
  const dispo = prods.filter(p=>round3(+p.qteRestante)>0 && prodVendable(p))
    .sort((a,b)=>(b.prodTimestamp||b.date||'').localeCompare(a.prodTimestamp||a.date||''));
  if(!dispo.length){ toast('Aucun stock disponible à décompter.'); return; }
  const opts = dispo.map(p=>{
    const e=empInfo(p.emplacement);
    return `<option value="${p.id}">${esc(recName(p.recipeId))} — lot ${esc(p.lotProduction||('#'+p.id))} · ${qty(p.qteRestante)} dispo${e.lettre?' · '+e.lettre:''}</option>`;
  }).join('');
  openModal(`<h3>⚠ Casse / Perte rapide</h3>
    <p class="note">Retire des pièces du stock (tombées, invendables, DLC dépassée…) sans passer par une commande. Tracé avec son coût pour le suivi des pertes.</p>
    <div class="field"><label>Produit / lot concerné</label>
      <select id="ql_prod">${opts}</select></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn danger" onclick="quickLossNext()">Suivant</button></div>`);
}
function quickLossNext(){
  const id=+val('ql_prod'); if(!id){ toast('Choisis un produit'); return; }
  closeModal();
  declareLossForm(id);   // réutilise la déclaration de perte complète (quantité, motif, coût, dégustation)
}

async function saveLoss(prodId){
  const qteP = +val('f_lossQte');
  const p = await db.productions.get(prodId); if(!p){ toast('Production introuvable'); return; }
  const dispo = round3(+p.qteRestante||0);
  if(isNaN(qteP) || qteP<=0){ toast('Indique une quantité'); return; }
  if(qteP > dispo + 1e-9){ toast(`Maximum ${qty(dispo)} pièce(s) disponibles`); return; }
  const enDeg = document.getElementById('f_lossDeg')?.checked;
  // CAS « cassé mais garni » → bascule en stock DÉGUSTATION (offert, non vendable), pas une perte.
  if(enDeg){
    const dest=(document.querySelector('input[name="f_lossDest"]:checked')||{}).value||'frigo';
    const recName = (window._prodRecName)||((rid)=>'#'+rid);
    await db.transaction('rw', db.productions, async()=>{
      const src=await db.productions.get(prodId);
      const nowIso=new Date().toISOString();
      const baseDlc=computeDlcFromHistory([{lieu:dest, ts:nowIso, motif:'dégustation (cassé garni)'}], nowIso);
      let dlc=baseDlc;
      [src.dlcProduit, src.dlcContrainteOuverture].forEach(d=>{ if(d && (!dlc||d<dlc)) dlc=d; });
      const lotBase = src.lotBase || lotBaseSansSuffixe(src.lotProduction||'');
      const lotDeg = lotAvecEmplacement((lotBase||genLotCode(3))+'-DG', dest);
      await db.productions.update(prodId, {qteRestante: subQty(src.qteRestante, qteP)});
      await db.productions.add({
        recipeId: src.recipeId, lotProduction: lotDeg, date: today(),
        composant:'degustation', lotBase, degustation:true, degOrigine:'casse-garni',
        qteTheorique:qteP, qteReelle:qteP, ecart:0, qteProduite:qteP, qteRestante:qteP,
        dlcProduit:dlc, dlcAuto:true, dlcLimiteeParOuverture:(dlc!==baseDlc),
        prodStatut:'termine', prodDebutTs:nowIso, prodTermineTs:nowIso, prodTimestamp:nowIso,
        emplacement:dest, emplacementMaj:nowIso, venuDuCongelateur:isFreezer(dest),
        histEmplacement:[{lieu:dest, ts:nowIso, motif:'dégustation (cassé mais garni)'}],
        assembleFrom:[{id:src.id, lot:src.lotProduction, composant:'casse-garni', qte:qteP, parfum:recName(src.recipeId)}]
      });
    });
    closeModal(); renderProductions();
    toast(`🥄 ${qty(qteP)} cassé(s) garni(s) basculé(s) en dégustation (non perdu)`);
    return;
  }
  // CAS perte pure : coût unitaire de revient figé pour ce batch
  const recipe = p.recipeId!=null ? await db.recipes.get(p.recipeId) : null;
  const [recipeItems, lots] = await Promise.all([db.recipeItems.toArray(), db.materialLots.toArray()]);
  let coutUnit = 0;
  if(recipe){ const cr = coutRevientRecette(recipe, recipeItems, lots); coutUnit = +cr.coutRevientUnit||0; }
  const loss = {
    productionId: prodId, recipeId: p.recipeId,
    lotProduction: p.lotProduction||'',
    date: val('f_lossDate')||today(),
    motif: val('f_lossMotif')||LOSS_REASONS[0],
    note: val('f_lossNote')||'',
    qte: round3(qteP),
    coutUnit: money2(coutUnit),
    coutTotal: money2(coutUnit*qteP)
  };
  await db.transaction('rw', db.losses, db.productions, async()=>{
    await db.losses.add(loss);
    await db.productions.update(prodId, {qteRestante: subQty(p.qteRestante, qteP)});
  });
  closeModal(); renderProductions();
  toast(`Perte déclarée : ${qty(qteP)} pièce(s) · ${euro(loss.coutTotal)}`);
}
// KPI agrégés de perte (sur l'ensemble des productions / pertes déclarées).
async function lossKPIs(){
  const [prods, losses] = await Promise.all([db.productions.toArray(), db.losses.toArray().catch(()=>[])]);
  const totalProduit = prods.reduce((s,p)=>s+(+p.qteProduite||0),0);
  const totalPerdu = losses.reduce((s,l)=>s+(+l.qte||0),0);
  const valeurPerdue = losses.reduce((s,l)=>s+(+l.coutTotal||0),0);
  const taux = totalProduit>0 ? Math.round(totalPerdu/totalProduit*1000)/10 : 0;
  return {totalProduit:round3(totalProduit), totalPerdu:round3(totalPerdu), valeurPerdue:money2(valeurPerdue), taux, count:losses.length};
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
  // Sinon : raison obligatoire, puis choix recréditer / pertes / simple suppression
  const prod = await db.productions.get(id);
  const conso = await db.prodConsumption.where('productionId').equals(id).toArray();
  const recap = conso.length ? `${conso.length} ligne(s) de matière consommée` : 'aucune matière consommée';
  const reste = round3(+(prod?prod.qteRestante:0)||0);
  const opts = DELETE_REASONS_PROD.map(r=>`<option>${esc(r)}</option>`).join('');
  openModal(`<h3>🗑 Supprimer la production</h3>
    <p style="margin-bottom:10px">Batch <b>${esc(prod?prod.lotProduction||'':'')}</b> — ${recap}.</p>
    <div class="field"><label>Raison de la suppression *</label><select id="f_delReason">${opts}</select></div>
    <div class="field"><label>Précision (facultatif)</label><input id="f_delNote" placeholder="détail…"></div>
    ${reste>0?`<p class="note">Ce batch a encore <b>${qty(reste)}</b> en stock. Que faire de ces pièces non distribuées ?</p>`:'<p class="note" style="margin-bottom:6px">Souhaites-tu recréditer les ingrédients consommés dans leurs lots d\'origine ?</p>'}
    <div class="modal-actions" style="flex-direction:column;gap:8px">
      <button class="btn gold" style="width:100%" onclick="doDelProd(${id},'recrediter')">↩ Supprimer ET recréditer le stock matières</button>
      ${reste>0?`<button class="btn" style="width:100%" onclick="doDelProd(${id},'pertes')">⚠ Supprimer et déclarer ${qty(reste)} en pertes</button>`:''}
      <button class="btn" style="width:100%" onclick="doDelProd(${id},'simple')">Supprimer sans recréditer ${reste>0?'(pièces ni recréditées ni en pertes)':''}</button>
      <button class="btn ghost" style="width:100%" onclick="closeModal()">Annuler</button>
    </div>`);
}
async function doDelProd(id, mode){
  const reason=val('f_delReason')||DELETE_REASONS_PROD[0];
  const note=val('f_delNote')||'';
  // Re-vérifier le garde-fou (sécurité anti-concurrence)
  const liens = await db.orderItems.where('productionId').equals(id).toArray();
  if(liens.length){ closeModal(); toast('Production liée à une commande — suppression annulée'); renderProductions(); return; }
  const prod = await db.productions.get(id);
  const conso = await db.prodConsumption.where('productionId').equals(id).toArray();
  const lossesBefore = await db.losses.where('productionId').equals(id).toArray().catch(()=>[]);
  const reste = round3(+(prod?prod.qteRestante:0)||0);
  // snapshot pour annulation
  const snap = { prod:prod?{...prod}:null, conso:conso.map(c=>({...c})), losses:lossesBefore.map(l=>({...l})), mode, reste };
  let newLoss=null;
  await db.transaction('rw',db.productions,db.prodConsumption,db.materialLots,db.losses,async()=>{
    if(mode==='recrediter'){
      for(const c of conso){
        const lot = await db.materialLots.get(c.materialLotId);
        if(lot){ await db.materialLots.update(lot.id, { qteRestante: addQty(lot.qteRestante, c.qteConsommee) }); }
      }
    }
    if(mode==='pertes' && reste>0 && prod){
      const recipe = await db.recipes.get(prod.recipeId);
      const [recipeItems, lots] = await Promise.all([db.recipeItems.toArray(), db.materialLots.toArray()]);
      let coutUnit=0; if(recipe){ const cr=coutRevientRecette(recipe, recipeItems, lots); coutUnit=+cr.coutRevientUnit||0; }
      newLoss = { productionId:id, recipeId:prod.recipeId, lotProduction:prod.lotProduction||'',
        date:today(), motif:'Suppression batch — '+reason, note,
        qte:reste, coutUnit:money2(coutUnit), coutTotal:money2(coutUnit*reste) };
      await db.losses.add(newLoss);
    }
    await db.prodConsumption.where('productionId').equals(id).delete();
    if(mode!=='pertes'){ await db.losses.where('productionId').equals(id).delete().catch(()=>{}); }
    await db.productions.delete(id);
  });
  logDeletion('production', id, reason, note, prod?(prod.lotProduction||''):'');
  closeModal(); renderProductions();
  // annulation rapide
  showUndoToast(mode==='recrediter'?'Production supprimée, stock recrédité'
    : mode==='pertes'?`Production supprimée · ${qty(reste)} en pertes`
    : 'Production supprimée', async ()=>{
    await db.transaction('rw',db.productions,db.prodConsumption,db.materialLots,db.losses,async()=>{
      if(snap.prod) await db.productions.put(snap.prod);
      for(const c of snap.conso){ await db.prodConsumption.put(c); }
      // annule le recrédit matières effectué
      if(snap.mode==='recrediter'){
        for(const c of snap.conso){ const lot=await db.materialLots.get(c.materialLotId);
          if(lot){ await db.materialLots.update(lot.id, {qteRestante: subQty(lot.qteRestante, c.qteConsommee)}); } }
      }
      // retire la perte créée par la suppression
      if(snap.mode==='pertes'){
        const created = await db.losses.where('productionId').equals(id).toArray().catch(()=>[]);
        for(const l of created){ if(/^Suppression batch/.test(l.motif||'')) await db.losses.delete(l.id); }
        for(const l of snap.losses){ await db.losses.put(l); }
      }
    });
    renderProductions();
  });
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
   <div class="topbar"><div><h1>Coûts & prix</h1><p>Évolution des prix d'achat et de la rentabilité</p></div>
     <button class="btn ghost sm" onclick="goView('rentaparfum')">🎯 Rentabilité par parfum</button></div>

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
  // lots actifs avec DLC renseignée — hors emballages (carton, film… ne périment pas)
  const isEmbMat = id => (mats.find(m=>m.id===id)||{}).categorie==='emballage';
  const actifs = lots.filter(l=>+l.qteRestante>0 && l.dlc && !isEmbMat(l.materialId))
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
         <td style="text-align:right"><span class="act" onclick="printLabel(${p.id})">⎙ Étiquette</span> <span class="act" onclick="traceProd(${p.id})">Tracer</span></td></tr>`).join('')}</tbody></table></div>`
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
    blocks.push(`<div class="trace-step"><b>${esc(rec?rec.produitNom:'?')}</b> · batch ${esc(prod.lotProduction||'—')}
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
      return `${esc(matName(l?l.materialId:null))}`; }).filter(Boolean).join(', ');
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

// Convertit un ISO en valeur d'input datetime-local (heure locale, sans secondes).
function isoToLocalInput(iso){
  if(!iso) return '';
  const d=new Date(iso); if(isNaN(d)) return '';
  const off=d.getTimezoneOffset();
  const loc=new Date(d.getTime()-off*60000);
  return loc.toISOString().slice(0,16);
}
function localInputToIso(v){ if(!v) return ''; const d=new Date(v); return isNaN(d)?'':d.toISOString(); }
// Edition manuelle des heures de debut/fin d'un batch (tracking temps au reel).
async function prodEditTimes(prodId){
  const p=await db.productions.get(prodId); if(!p){ toast('Batch introuvable'); return; }
  const deb=isoToLocalInput(p.prodDebutTs||p.prodTimestamp||'');
  const fin=isoToLocalInput(p.prodTermineTs||'');
  openModal(`<h3>\u270e Heures du batch</h3>
    <p class="note" style="margin-bottom:10px">Ajuste le debut et la fin reels de la production. Sert a mesurer le temps de fabrication au plus juste.</p>
    <div class="field"><label>Debut de production</label><input type="datetime-local" id="f_pDebut" value="${deb}"></div>
    <div class="field"><label>Fin de production ${prodStatut(p)==='demarre'?'(laisser vide si en cours)':''}</label><input type="datetime-local" id="f_pFin" value="${fin}"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn" onclick="prodSaveTimes(${prodId})">Enregistrer</button></div>`);
}
async function prodSaveTimes(prodId){
  const debIso=localInputToIso(val('f_pDebut'));
  const finIso=localInputToIso(val('f_pFin'));
  if(debIso && finIso && new Date(finIso)<new Date(debIso)){ toast('La fin est avant le debut'); return; }
  const patch={};
  if(debIso){ patch.prodDebutTs=debIso; }
  if(finIso){ patch.prodTermineTs=finIso; } else { patch.prodTermineTs=''; }
  await db.productions.update(prodId, patch);
  closeModal();
  if(view==='matieres') renderMaterials(); else if(view==='productions') renderProductions();
  toast('Heures mises a jour \u2713');
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
      lines.push(`<div class="trace-step"><b>${esc(mat?mat.nom:'Matière')}</b><br>
        <span style="font-size:.8rem;color:#9a8a82">Lot fourn. ${esc(c.snapLotFournisseur||'—')} · ${esc(sup?sup.nom:'fournisseur non précisé')} · DLC ${fmtDate(c.snapDlc)||'—'} <span class="tag warn">lot archivé</span></span></div>`);
      continue;
    }
    const mat = await db.materials.get(lot.materialId);
    const sup = lot.supplierId ? await db.suppliers.get(lot.supplierId) : null;
    lines.push(`<div class="trace-step"><b>${esc(mat?mat.nom:'?')}</b><br>
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
  // pertes déclarées sur ce batch
  const lossList = await db.losses.where('productionId').equals(prodId).toArray().catch(()=>[]);
  const lossBlock = lossList.length
    ? `<h3 style="font-size:1rem;margin:18px 0 8px">⚠ Pertes / casse déclarées</h3>`
      + lossList.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(l=>
          `<div class="trace-step">${qty(l.qte)} pièce(s) · ${esc(l.motif||'—')} · ${fmtDate(l.date)}${l.coutTotal?` · ${euro(l.coutTotal)}`:''}${l.note?`<br><span style="font-size:.8rem;color:#9a8a82">${esc(l.note)}</span>`:''}</div>`
        ).join('')
    : '';
  const _deb=prod.prodDebutTs||prod.prodTimestamp||''; const _fin=prod.prodTermineTs||'';
  const _dur=(_deb&&_fin)?ttFormat(new Date(_fin)-new Date(_deb)):'';
  openModal(`<h3>Traçabilité — batch</h3>
    <p style="margin-bottom:8px"><b>${esc(recipe?recipe.produitNom:'?')}</b> · lot <b>${esc(prod.lotProduction||'—')}</b> · ${fmtDate(prod.date)}<br>
    <span style="color:#9a8a82;font-size:.85rem">Emplacement : ${empTagHtml(prod.emplacement)}${prodComposant(prod)!=='complet'?` · <span class="tag" style="background:${prodComposant(prod)==='assemble'?'#3f7d52':prodComposant(prod)==='degustation'?'#caa23b':'#8a6d3b'};color:#fff">${prodComposant(prod)==='coques'?'🟤 Coques':prodComposant(prod)==='ganache'?'🍫 Ganache':prodComposant(prod)==='degustation'?'🥄 Dégustation (offert)':'✓ Assemblé'}</span>`:''}${prod.parentProdId?' · <span class="tag" style="background:#ece2d4;color:#6b5a52">partie d\'une production</span>':''}</span><br>
    <span style="color:#9a8a82;font-size:.85rem">Statut : <b>${prodStatut(prod)==='termine'?'✓ Terminée':'▶ Démarrée'}</b>${(prod.prodDebutTs||prod.prodTimestamp)?` · démarrée le ${fmtDateTime(prod.prodDebutTs||prod.prodTimestamp)}`:''}${prod.prodTermineTs?` · terminée le ${fmtDateTime(prod.prodTermineTs)}`:''}${_dur?` · <b>durée ${_dur}</b>`:''}${prod.dlcProduit?` · DLC ${fmtDate(prod.dlcProduit)}`:(prodStatut(prod)!=='termine'?' · DLC non lancée (prod en cours)':'')}</span><br>
    <span style="color:#9a8a82;font-size:.85rem">Théorique : ${qty((prod.qteTheorique!=null)?prod.qteTheorique:prod.qteProduite)} · Réel : ${qty((prod.qteReelle!=null)?prod.qteReelle:prod.qteProduite)}${prod.ecart?` · écart ${(+prod.ecart>0?'+':'')}${qty(prod.ecart)}`:''} · Restant : ${qty(prod.qteRestante)}</span></p>
    ${(prod.histEmplacement&&prod.histEmplacement.length>1)?`<div class="sum-box" style="flex-direction:column;align-items:flex-start"><span style="font-weight:600">Parcours de conservation</span>${prod.histEmplacement.map(h=>`<span style="font-size:.8rem;color:#6b5a52">${empIcon(h.lieu)} ${esc(empNom(h.lieu))} (${empLettre(h.lieu)}) — ${fmtDateTime(h.ts)}${h.motif?` · ${esc(h.motif)}`:''}</span>`).join('')}</div>`:''}
    <h3 style="font-size:1rem;margin:16px 0 8px">⬅ Matières consommées (origine)</h3>
    ${lines.length?lines.join(''):(prodComposant(prod)==='assemble'?'<p class="note">Macaron assemblé : matières tracées via les sous-lots ci-dessous.</p>':'<p class="note">Aucune consommation enregistrée.</p>')}
    ${(prod.assembleFrom&&prod.assembleFrom.length)?`<h3 style="font-size:1rem;margin:18px 0 8px">🔗 ${prod.degOrigine==='casse-garni'?'Issu de pièces cassées mais garnies':'Assemblé à partir de'}${prodComposant(prod)==='degustation'?' <span class="tag" style="background:#caa23b;color:#fff;font-size:.66rem">dégustation</span>':''}</h3>${prod.assembleFrom.map(s=>`<div class="trace-step">${s.composant==='coques'?'🟤 Coques':s.composant==='ganache'?'🍫 Ganache':'💔 Cassé garni'}${s.parfum?` <b>${esc(s.parfum)}</b>`:''} · lot <b>${esc(s.lot||('#'+s.id))}</b> · ${qty(s.qte)} pièce(s)</div>`).join('')}`:''}
    ${lossBlock}
    <h3 style="font-size:1rem;margin:18px 0 8px">➡ Commandes servies</h3>
    ${cmdLines.length?cmdLines.join(''):'<p class="note">Ce batch n\'est lié à aucune commande pour l\'instant.</p>'}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button><button class="btn ghost" onclick="prodEditTimes(${prodId})">✎ Heures</button><button class="btn gold" onclick="printLabel(${prodId})">⎙ Imprimer l'étiquette</button><button class="btn" onclick="exportTraceProd(${prodId})">⬇ Exporter CSV</button></div>`);
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
// normTxt() : voir utils.js
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
function searchRenderBody(bodyId, countId, emptyId, items, q, rowFn, cols, unitLabel, collapseShow){
  const body=document.getElementById(bodyId); if(!body) return;
  const rows=searchRank(items, q);
  const cnt=document.getElementById(countId);
  if(cnt) cnt.textContent = (q&&q.trim()) ? `${rows.length} / ${items.length} ${unitLabel}` : `${items.length} ${unitLabel}`;
  const empty=document.getElementById(emptyId);
  if(!rows.length){ body.innerHTML=''; if(empty) empty.style.display='block'; return; }
  if(empty) empty.style.display='none';
  const LIMIT=300;
  const capped = rows.slice(0,LIMIT);
  const overflow = rows.length>LIMIT?`<tr><td colspan="${cols}" class="note" style="text-align:center">… ${rows.length-LIMIT} autre(s) résultat(s). Affinez la recherche.</td></tr>`:'';
  // Repli optionnel : seulement HORS recherche (sinon on masquerait des résultats filtrés).
  // On insère les lignes directement dans le <tbody> existant via collapseRows (qui crée
  // son propre <tbody> interne) — ici on garde le <tbody> hôte et on gère le masquage par classe.
  if(collapseShow && collapseShow>0 && !(q&&q.trim()) && capped.length>collapseShow){
    const htmlRows = capped.map(rowFn);
    const id='clpb'+(++_collapseSeq);
    body.classList.add('collapse-block'); body.id=bodyId;   // garde l'id d'origine + classe
    const head = htmlRows.slice(0,collapseShow).join('');
    const hidden = htmlRows.slice(collapseShow).map(r=>r.replace(/^(\s*)<tr/, '$1<tr class="collapse-more"')).join('');
    const nMore = capped.length-collapseShow;
    const toggle = `<tr class="clp-toggle-row"><td colspan="${cols}" style="text-align:center;padding:6px">`
      + `<button type="button" class="collapse-toggle" onclick="collapseToggle('${bodyId}', this)">`
      + `<span class="chev">▾</span><span class="clp-txt" data-more="Voir les ${nMore} autre(s)" data-less="Réduire">Voir les ${nMore} autre(s)</span></button></td></tr>`;
    body.innerHTML = head + hidden + toggle + overflow;
    return;
  }
  // sinon : affichage classique
  body.classList.remove('collapse-block');
  body.innerHTML = capped.map(rowFn).join('') + overflow;
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
     <div class="flex"><button class="btn ghost sm" onclick="togglePrivacyMode()" title="Masquer/afficher les données sensibles">${privacyModeEnabled()?'👁️':'🙈'}</button><input class="search" id="clSearch" placeholder="Nom, société, téléphone, e-mail, réf, notes…" value="${esc(clientSearch)}" oninput="clientFilter(this.value)" autocomplete="off" autocapitalize="off" autocorrect="off"><button class="btn" onclick="clientForm()">+ Nouveau client</button></div></div>
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
  return `<tr><td><b><span class="link-name" onclick="clientForm(${c.id})">${nameP(c.nom)}</span></b></td>
    <td><span class="tag ${c.type==='Pro'?'event':'ok'}">${esc(c.type||'Particulier')}</span></td>
    <td>${nameP(c.tel||'')}${c.tel&&c.email?'<br>':''}<span style="color:#9a8a82;font-size:.82rem">${nameP(c.email||'')}</span></td>
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
/* ============================================================
   CRM — Tableau de bord client enrichi
   Branché sur les structures réelles : o.montant, _orderParfumDemand(o),
   orderIsEvent(o). Gère client introuvable / sans commande.
   ============================================================ */
async function getClientDashboardData(clientId){
  const c = await db.clients.get(clientId);
  if(!c) throw new Error('Client introuvable');
  // requête ciblée (index clientId) plutôt que toArray global
  const orders = (await db.orders.where('clientId').equals(clientId).toArray())
    .sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const nb = orders.length;
  if(!nb){
    return {client:c, nbCommandes:0, panierMoyen:0, panierMoyenHorsEvent:0,
      parfumPrefere:null, frequenceTxt:'Nouveau client', frequenceJours:null,
      caTotal:0, badge:null};
  }
  // 1) Panier moyen (toutes commandes) + panier moyen hors événement (pour le badge VIP)
  const caTotal = orders.reduce((s,o)=>s+(+o.montant||0),0);
  const panierMoyen = money2(caTotal/nb);
  const horsEvent = orders.filter(o=>!orderIsEvent(o));
  const panierMoyenHorsEvent = horsEvent.length
    ? money2(horsEvent.reduce((s,o)=>s+(+o.montant||0),0)/horsEvent.length) : 0;
  // 2) Parfum préféré (agrégation des parfums de toutes les commandes)
  const parfums={};
  orders.forEach(o=>{ const dem=_orderParfumDemand(o);
    for(const nom in dem) parfums[nom]=(parfums[nom]||0)+dem[nom]; });
  let parfumPrefere=null, maxQ=0;
  for(const nom in parfums){ if(parfums[nom]>maxQ){ maxQ=parfums[nom]; parfumPrefere=nom; } }
  // 3) Fréquence d'achat (moyenne de jours entre commandes datées)
  const dates = orders.map(o=>o.date).filter(Boolean).sort();
  let frequenceJours=null, frequenceTxt='Nouveau client';
  if(dates.length>=2){
    let totGap=0, n=0;
    for(let i=1;i<dates.length;i++){
      const g=Math.round((new Date(dates[i])-new Date(dates[i-1]))/86400000);
      if(g>=0){ totGap+=g; n++; }
    }
    if(n>0){
      frequenceJours=Math.round(totGap/n);
      if(frequenceJours>=14){ const sem=Math.round(frequenceJours/7); frequenceTxt=`Toutes les ${sem} semaine${sem>1?'s':''}`; }
      else if(frequenceJours>=1){ frequenceTxt=`Tous les ${frequenceJours} jour${frequenceJours>1?'s':''}`; }
      else { frequenceTxt='Très régulier (quotidien)'; }
    }
  }
  // Badge : VIP (panier moyen hors événement > 50€) prioritaire, sinon Fidèle (>5 commandes)
  let badge=null;
  if(panierMoyenHorsEvent>50) badge={label:'VIP', col:'var(--gold,#AA7C39)'};
  else if(nb>5) badge={label:'Client fidèle', col:'var(--bordeaux,#52252F)'};
  return {client:c, nbCommandes:nb, panierMoyen, panierMoyenHorsEvent,
    parfumPrefere, frequenceTxt, frequenceJours, caTotal:money2(caTotal), badge};
}

async function clientPopup(id){
  const c = await db.clients.get(id);
  if(!c){ toast('Client introuvable'); return; }
  // tableau de bord enrichi (KPI)
  let stat='', badgeHtml='';
  try{
    const d = await getClientDashboardData(id);
    if(d.badge) badgeHtml=` <span class="tag" style="background:${d.badge.col};color:#fff">${esc(d.badge.label)}</span>`;
    if(d.nbCommandes){
      stat=`<div class="crm-kpis">
        <div class="crm-kpi"><div class="crm-emo">🛍️</div><div class="crm-val">${euro(d.panierMoyen)}</div><div class="crm-lbl">Panier moyen</div></div>
        <div class="crm-kpi"><div class="crm-emo">🎯</div><div class="crm-val">${d.parfumPrefere?esc(d.parfumPrefere):'—'}</div><div class="crm-lbl">Parfum préféré</div></div>
        <div class="crm-kpi"><div class="crm-emo">📅</div><div class="crm-val" style="font-size:.95rem">${esc(d.frequenceTxt)}</div><div class="crm-lbl">Fréquence</div></div>
      </div>
      <div class="sum-box"><span>Commandes</span><b>${d.nbCommandes}</b></div>
      <div class="sum-box"><span>CA cumulé</span><b>${euro(d.caTotal)}</b></div>`;
    } else {
      stat=`<div class="sum-box"><span>Commandes</span><b>Aucune pour l'instant</b></div>`;
    }
  }catch(e){ /* client sans données : on continue avec la fiche simple */ }
  const nomComplet=[c.prenom,c.nom].filter(Boolean).join(' ')||c.nom||'Client';
  const ligne=(label,val)=> val?`<div class="sum-box"><span>${label}</span><b>${esc(val)}</b></div>`:'';
  openModal(`<h3>${esc(nomComplet)}</h3>
    <div style="margin:-4px 0 10px"><span class="tag ${c.type==='Pro'?'event':'ok'}">${esc(c.type||'Particulier')}</span>${badgeHtml}${c.ref?` <span class="note">${esc(c.ref)}</span>`:''}</div>
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
   <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button><button class="btn" onclick="saveClient(${id||0})">Enregistrer</button>${id?`<button class="btn danger" onclick="confirmDelClient(${id})">🗑 Supprimer</button>`:''}</div>`);
}
async function confirmDelClient(id){
  // Garde-fou : un client avec des commandes associées ne peut pas être supprimé
  // (préserve l'historique et évite les commandes orphelines).
  const cmds = await db.orders.where('clientId').equals(id).toArray().catch(()=>[]);
  if(cmds.length){
    const apercu = cmds.slice(0,5).map(o=>`n°${esc(orderNumber(o))}${o.date?` (${fmtDate(o.date)})`:''}`).join(', ');
    openModal(`<h3>Suppression impossible</h3>
      <div class="banner" style="background:#f6e3e0;border-color:var(--red,#b3261e);color:#7a2a20">⛔ <div>Ce client est associé à <b>${cmds.length} commande(s)</b> : ${apercu}${cmds.length>5?` … +${cmds.length-5}`:''}.<br>Supprimez d'abord ces commandes (ou réattribuez-les) avant de supprimer la fiche client.</div></div>
      <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`);
    return;
  }
  openModal(`<h3>Supprimer ce client ?</h3>
    <p class="note">Cette action est définitive.</p>
    <div class="modal-actions"><button class="btn ghost" onclick="clientForm(${id})">Annuler</button>
      <button class="btn danger" onclick="doDelClient(${id})">Supprimer définitivement</button></div>`);
}
async function doDelClient(id){
  const c=await db.clients.get(id); const snap=c?{...c}:null;
  await db.clients.delete(id); closeModal(); renderClients();
  if(snap) showUndoToast('Client supprimé', async()=>{ await db.clients.put(snap); renderClients(); });
  else toast('Client supprimé ✓');
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
       ${BIG_FORMATS.map(f=>`<tr><td><b>${esc(f)}</b></td><td>${euro(bigPrice('particulier'))}</td><td>${euro(bigPrice('pro'))}</td></tr>`).join('')}
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
  return `<span class="tag ${cls}">${esc(s==='Terminée'?'Prête':s)}</span>`;
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
// --- Filtres par tags libres empilables (cumul en ET, par-dessus la recherche texte) ---
// Un tag = une facette structurée "categorie:valeur" (ex. "format:8", "parfum:framboise",
// "annee:2026", "type:coffret", "paiement:paye"). Les tags ne s'affichent PAS dans le tableau :
// ils servent uniquement au filtrage. L'ensemble actif est conservé entre les frappes.
let cmdTags = new Set();
// Calcule les facettes d'une commande à partir de ses lignes déjà résolues.
// Retourne un tableau de {cat, val, label} — cat/val normalisés (filtrage), label lisible (pastille).
function orderFacets(o, lignes){
  const out=[]; const seen=new Set();
  const add=(cat,val,label)=>{ const key=cat+':'+normTxt(String(val)); if(!seen.has(key)){ seen.add(key); out.push({cat, val:normTxt(String(val)), label, key}); } };
  // Année (depuis la date de commande)
  const an=(o.date||'').slice(0,4); if(an) add('annee', an, an);
  lignes.forEach(ln=>{
    // Type de ligne
    if(ln.type) add('type', ln.type, ln.type==='coffret'?'Coffret':ln.type==='grand'?'Grand format':ln.type==='evenement'?'Événement':ln.type);
    // Format (taille) pour les coffrets
    if(ln.type==='coffret' && ln.taille) add('format', ln.taille, 'Coffret '+ln.taille);
    // Parfums (coffrets + événements)
    (ln.parfums||[]).forEach(p=>{ if(p && p.nom) add('parfum', p.nom, p.nom); });
    // Produits (grands formats)
    (ln.items||[]).forEach(p=>{ if(p && p.nom) add('parfum', p.nom, p.nom); });
  });
  // Statut de paiement (réutilise la logique existante)
  const st = orderPayStatus(o);
  if(st) add('paiement', st, st);
  return out;
}
// Une commande (entrée de cache) satisfait-elle TOUS les tags actifs ? (ET logique)
function cmdMatchTags(entry){
  if(!cmdTags.size) return true;
  const facetKeys = new Set((entry._facets||[]).map(f=>f.key));
  for(const t of cmdTags){ if(!facetKeys.has(t)) return false; }
  return true;
}
function cmdToggleTag(key){
  if(cmdTags.has(key)) cmdTags.delete(key); else cmdTags.add(key);
  _cmdRenderTagBar();
  cmdFilter(cmdSearch);
}
function cmdClearTags(){ cmdTags.clear(); _cmdRenderTagBar(); cmdFilter(cmdSearch); }
async function renderCmd(){
  _cmdSel = new Set();   // sélection réinitialisée à chaque ouverture de l'écran
  cmdTags = new Set();   // filtres par tags réinitialisés à chaque ouverture
  // Les commandes "historiques" (reprise/migration) ne s'affichent pas ici :
  // elles comptent dans le CA mais ne sont pas opérationnelles.
  const orders = (await db.orders.toArray()).filter(o=>!o.histo).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const clients = await db.clients.toArray();
  const clById = Object.fromEntries(clients.map(c=>[c.id,c]));
  _cmdClNameMap = Object.fromEntries(clients.map(c=>[c.id, c.nom||'—']));
  const clName = id => (clById[id]||{}).nom||'—';
  // charge TOUS les liens batch en une seule requête (au lieu d'une par commande)
  const allItems = await db.orderItems.toArray();
  const itemsByOrder={}; allItems.forEach(it=>{ (itemsByOrder[it.orderId] ||= []).push(it); });
  // n° de lot des batchs liés, par commande (pour permettre la recherche par lot)
  const allProdsForLots = await db.productions.toArray();
  const prodLotById = {}; allProdsForLots.forEach(p=>{ prodLotById[p.id]=p.lotProduction||''; });
  const lotsByOrder={}; allItems.forEach(it=>{ const lot=prodLotById[it.productionId]; if(lot){ (lotsByOrder[it.orderId] ||= []).push(lot); } });
  const lineLabel = ln => {
    if(ln.type==='evenement') return `Événement ${ln.evQte||0} mac. +${ln.equip||0} pyr.`;
    if(ln.type==='grand'){ const n=(ln.items||[]).reduce((s,b)=>s+(+b.qte||0),0); return `Grand format ×${n}`; }
    if(ln.type==='vrac'){ const n=(ln.parfums||[]).reduce((s,b)=>s+(+b.qte||0),0); return `Vrac pro ×${n}`; }
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
    const refCmd = orderNumber(o);   // n° de référence affiché (ex. 2026-030)
    const prim = normTxt([clName(o.clientId), 'cmd'+o.id, refCmd].filter(Boolean).join(' '));
    const blob = normTxt([clName(o.clientId), cl.prenom, cl.societe, cl.tel, cl.email, cl.ref,
      resume, prodTxt, o.notes, o.reglement, o.paiement, 'cmd'+o.id, '#'+o.id, refCmd, fmtDate(o.date),
      (lotsByOrder[o.id]||[]).join(' ')].filter(Boolean).join(' '));
    const digits = onlyDigits([o.id, refCmd, cl.tel, o.montant].filter(v=>v!=null&&v!=='').join(' '));
    const _facets = orderFacets(o, lignes);
    return {o, resume, nbLies:(itemsByOrder[o.id]||[]).length, _prim:prim, _blob:blob, _digits:digits, _facets};
  });
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Commandes</h1><p id="cmdCount">${orders.length} commande(s)</p></div>
     <div class="flex" style="gap:8px"><button class="btn ghost sm" onclick="togglePrivacyMode()" title="Masquer/afficher les données sensibles">${privacyModeEnabled()?'👁️ Afficher':'🙈 Mode discret'}</button>
     <button class="btn" onclick="cmdForm()">+ Nouvelle commande</button></div></div>
   <div class="panel">
     <input class="search" id="cmdSearch" style="width:100%;margin-bottom:12px" placeholder="N° commande, client, produit, parfum, notes, règlement…" value="${esc(cmdSearch)}" oninput="cmdFilter(this.value)" autocomplete="off" autocapitalize="off" autocorrect="off">
     <div id="cmdTagBar" class="cmd-tagbar"></div>
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
  _cmdRenderTagBar();
  cmdFilter(cmdSearch);
  cmdUpdateSelBar();
}
// Dessine la barre de filtres par tags : pastilles groupées par catégorie, dans l'ordre
// Format → Parfum → Année → Type → Paiement. Une pastille active est mise en évidence.
// Les pastilles ne listent que les facettes RÉELLEMENT présentes dans les commandes.
const _FACET_CATS = [
  {cat:'format',   titre:'Format'},
  {cat:'parfum',   titre:'Parfum'},
  {cat:'annee',    titre:'Année'},
  {cat:'type',     titre:'Type'},
  {cat:'paiement', titre:'Paiement'}
];
function _cmdRenderTagBar(){
  const bar=document.getElementById('cmdTagBar'); if(!bar) return;
  if(!_cmdCache || !_cmdCache.length){ bar.innerHTML=''; return; }
  // Inventaire des facettes présentes : key -> {cat, label} ; et comptage par key.
  const facetMap=new Map();
  _cmdCache.forEach(e=>(e._facets||[]).forEach(f=>{ if(!facetMap.has(f.key)) facetMap.set(f.key, {cat:f.cat, val:f.val, label:f.label}); }));
  if(!facetMap.size){ bar.innerHTML=''; return; }
  let html='';
  _FACET_CATS.forEach(({cat,titre})=>{
    let facets=[...facetMap.entries()].filter(([k,f])=>f.cat===cat);
    if(!facets.length) return;
    // Tri : formats par taille croissante ; années décroissantes ; le reste alpha.
    facets.sort((a,b)=>{
      if(cat==='format') return (parseInt(a[1].val,10)||0)-(parseInt(b[1].val,10)||0);
      if(cat==='annee')  return b[1].val.localeCompare(a[1].val);
      return a[1].label.localeCompare(b[1].label);
    });
    const pills=facets.map(([key,f])=>{
      const on=cmdTags.has(key);
      return `<button type="button" class="cmd-tag${on?' on':''}" onclick="cmdToggleTag('${key.replace(/'/g,"\\'")}')">${esc(f.label)}</button>`;
    }).join('');
    html += `<div class="cmd-tag-grp"><span class="cmd-tag-cat">${titre}</span>${pills}</div>`;
  });
  if(cmdTags.size){
    html += `<button type="button" class="cmd-tag-clear" onclick="cmdClearTags()">✕ Réinitialiser (${cmdTags.size})</button>`;
  }
  bar.innerHTML = html;
}
function _cmdRow(row, grp){
  const o=row.o; const paye=o.paiement==='Payé';
  const checked = _cmdSel.has(o.id) ? 'checked' : '';
  const st = orderPayStatus(o); const solde = orderBalance(o);
  const stCol = st==='Payé'?'done':(st==='Partiel'?'todo':'todo');
  grp = grp||{};
  // Repère mois/semaine DANS la cellule client (figée à gauche → reste visible au scroll).
  let periodeBandeau = '';
  if(grp.newMonth && o.date){
    const mk=o.date.slice(0,7); const [yy,mm]=mk.split('-'); const idx=(+mm||1)-1;
    const col=_SEP_COLORS[idx % _SEP_COLORS.length];
    periodeBandeau += `<div class="cmd-period-month" style="background:${col}">${_MOIS_FR[idx]||''} ${yy||''}</div>`;
  }
  if(grp.newWeek && o.date){
    const wk=_isoWeekKey(o.date)||'';
    periodeBandeau += `<div class="cmd-period-week">Semaine ${wk.split('-W')[1]||''}</div>`;
  }
  // Statut commande : menu déroulant (changement direct au clic). « Terminée » s'affiche « Prête ».
  const curStatut = normStatus(o.statut);
  const statutSelect = `<select class="status-select status-${curStatut==='Livrée'?'done':(curStatut==='Terminée'?'ok':'todo')}" onchange="setOrderStatusInline(${o.id}, this.value)" title="Changer le statut">
    ${ORDER_STATUS.map(s=>`<option value="${s}" ${s===curStatut?'selected':''}>${s==='Terminée'?'Prête':esc(s)}</option>`).join('')}
  </select>`;
  return `<tr${grp.newMonth?' class="cmd-new-month"':''}>
     <td>${periodeBandeau}<b>${o.clientId?`${nameP(_cmdClName(o.clientId))} <span class="jump-arrow" onclick="clientPopup(${o.clientId})" title="Voir la fiche client">→</span>`:'—'}</b><br><span style="color:#9a8a82;font-size:.74rem">${fmtDate(o.date)}${o.heureLivraison?' · '+esc(o.heureLivraison):''}</span>${o.lieuLivraison?`<br><span style="color:#9a8a82;font-size:.72rem">📍 ${nameP(o.lieuLivraison)}</span>`:''}</td>
     <td><span style="font-size:.82rem">${esc(row.resume)}</span> <span class="jump-arrow" onclick="cmdView(${o.id})" title="Voir le détail de la commande">→</span>${o.perso?' <span class="tag event">perso</span>':''}</td>
     <td>${euro(+o.montant)}</td>
     <td>
       <span class="tag ${st==='Payé'?'done':(st==='Partiel'?'event':'todo')}">${st}</span>
       ${st!=='Payé'&&solde>0?`<br><span style="color:var(--red,#b3261e);font-size:.72rem">solde ${euro(solde)}</span>`:''}
       ${st==='Payé'&&o.datePaiement?`<br><span style="color:#9a8a82;font-size:.72rem">le ${fmtDate(o.datePaiement)}</span>`:''}
     </td>
     <td>${statutSelect}</td>
     <td>${row.nbLies?`<span class="tag ok">${row.nbLies} batch</span>`:'<span class="tag warn">non lié</span>'}</td>
     <td><div class="qa-row">
       ${st!=='Payé'?`<button class="qa pay" onclick="markPaid(${o.id})" title="Encaisser le solde">✓ Solder</button>`:''}
       <button class="qa" onclick="cmdView(${o.id})" title="Voir le détail">👁 Détail</button>
       <button class="qa edit" onclick="cmdForm(${o.id})" title="Modifier">✎ Modifier</button>
       <button class="qa" onclick="exportOrderText(${o.id})" title="Exporter en texte">⤓ Texte</button>
       <button class="qa" onclick="cmdLink(${o.id})" title="Lier à une production">🔗 Lier</button>
       <button class="qa del" onclick="delCmd(${o.id})" title="Supprimer">🗑</button>
     </div></td>
     <td><input type="checkbox" class="cmd-check" ${checked} onclick="cmdToggleOne(${o.id},this.checked)"></td></tr>`;
}
// Changement de statut depuis le menu déroulant de la liste (sans fermer de modale).
async function setOrderStatusInline(id, statut){
  await db.orders.update(id, {statut});
  renderCmd();
  toast('Statut : '+(statut==='Terminée'?'Prête':statut));
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
  const body=document.getElementById('cmdBody'); if(!body) return;
  // 1) filtre par tags actifs (ET logique), 2) puis recherche texte sur le sous-ensemble.
  const base = cmdTags.size ? _cmdCache.filter(cmdMatchTags) : _cmdCache;
  const rows=searchRank(base, q);
  const cnt=document.getElementById('cmdCount');
  if(cnt){
    const total=_cmdCache.length;
    const filtre=(q&&q.trim()) || cmdTags.size;
    if(!filtre){ cnt.textContent = `${total} commande(s)`; }
    else if(cmdTags.size && (q&&q.trim())){ cnt.textContent = `${rows.length} / ${base.length} filtrée(s) · ${cmdTags.size} tag(s)`; }
    else if(cmdTags.size){ cnt.textContent = `${rows.length} / ${total} · ${cmdTags.size} tag(s)`; }
    else { cnt.textContent = `${rows.length} / ${total} commande(s)`; }
  }
  const empty=document.getElementById('cmdEmpty');
  if(!rows.length){ body.innerHTML=''; if(empty) empty.style.display='block'; return; }
  if(empty) empty.style.display='none';
  // Pendant une recherche, le tri est par pertinence → pas de séparateurs temporels.
  const grouper = !((q && q.trim()) || cmdTags.size);
  const LIMIT=300;
  const shown = rows.slice(0,LIMIT);
  let html=''; let lastMonth=null;
  shown.forEach(r=>{
    let newMonth=false;
    if(grouper){
      const mk = (r.o.date||'').slice(0,7);   // "AAAA-MM"
      if(mk && mk!==lastMonth){ lastMonth=mk; newMonth=true; }
    }
    html += _cmdRow(r, {newMonth, newWeek:false});
  });
  if(rows.length>LIMIT) html += `<tr><td colspan="9" class="note" style="text-align:center">… ${rows.length-LIMIT} autre(s) résultat(s). Affinez la recherche.</td></tr>`;
  body.innerHTML = html;
}
// Ligne séparatrice colorée par mois/année (couleur dérivée du mois → contraste entre groupes).
const _MOIS_FR=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const _SEP_COLORS=['#52252F','#AA7C39','#6aa3a0','#7a6a9a','#b07a4a','#3f7d52','#9a6a82','#5a7a9a','#a98b3d','#7a8a5a','#8a5a6a','#5a8a7a'];
function _cmdMonthSeparator(mk){
  const [y,m]=mk.split('-'); const idx=(+m||1)-1;
  const col=_SEP_COLORS[idx % _SEP_COLORS.length];
  const nb=_cmdCache.filter(r=>(r.o.date||'').slice(0,7)===mk).length;
  const ca=_cmdCache.filter(r=>(r.o.date||'').slice(0,7)===mk).reduce((s,r)=>s+(+r.o.montant||0),0);
  return `<tr class="cmd-sep"><td colspan="9"><div class="cmd-sep-in" style="--sep-col:${col}">
    <span class="cmd-sep-lbl">${_MOIS_FR[idx]||''} ${y||''}</span>
    <span class="cmd-sep-meta">${nb} commande(s) · ${euro(ca)}</span></div></td></tr>`;
}
// Clé d'année-semaine ISO (ex "2026-W24") pour regrouper par semaine.
function _isoWeekKey(dateStr){
  if(!dateStr) return null;
  const d=new Date(dateStr); if(isNaN(d)) return null;
  const t=new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day=(t.getUTCDay()+6)%7;            // lundi=0
  t.setUTCDate(t.getUTCDate()-day+3);        // jeudi de la semaine ISO
  const firstThu=new Date(Date.UTC(t.getUTCFullYear(),0,4));
  const fday=(firstThu.getUTCDay()+6)%7;
  firstThu.setUTCDate(firstThu.getUTCDate()-fday+3);
  const week=1+Math.round((t-firstThu)/(7*86400000));
  return t.getUTCFullYear()+'-W'+String(week).padStart(2,'0');
}
// Sous-séparateur léger : début de la semaine (lundi → dimanche).
function _cmdWeekSeparator(dateStr){
  const d=new Date(dateStr); const day=(d.getDay()+6)%7;
  const lundi=new Date(d); lundi.setDate(d.getDate()-day);
  const dim=new Date(lundi); dim.setDate(lundi.getDate()+6);
  const wk=_isoWeekKey(dateStr)||'';
  const fmt=x=>x.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
  return `<tr class="cmd-sep-week"><td colspan="9"><div class="cmd-sep-week-in">
    <span>Semaine ${wk.split('-W')[1]||''} · ${fmt(lundi)} → ${fmt(dim)}</span></div></td></tr>`;
}
// Vue détail d'une commande (multi-lignes)
async function cmdView(id){
  _privacySuspend=1; // détail de commande toujours en clair, même en mode discret
  const o = await db.orders.get(id);
  const cl = o.clientId ? await db.clients.get(o.clientId) : null;
  const _liv = computeDeliveryCost(o);
  let _livBlock = '';
  if(_liv.actif){
    const _rec = await db.recipes.toArray(), _ri = await db.recipeItems.toArray(), _lo = await db.materialLots.toArray();
    const _m = computeOrderMargins(o, _rec, _ri, _lo);
    const _baisse = Math.max(0, _m.tauxNet - _m.tauxNetApresLiv);
    _livBlock = `<h3 style="font-size:1rem;margin:16px 0 8px">🚚 Livraison & rentabilité</h3>`+
      `<div class="sum-box"><span>Coût livraison (A/R ${_liv.distAR} km${_liv.minutes?` · ${_liv.minutes} min`:''})</span><b>${euro(_liv.total)}</b></div>`+
      `<div class="sum-box" style="font-size:.82rem;color:#8a7a72"><span>dont carburant / temps</span><span>${euro(_liv.coutCarburant)} · ${euro(_liv.coutTemps)}</span></div>`+
      `<div class="sum-box"><span>Marge nette sans livraison</span><b>${euro(_m.margeNette)} (${_m.tauxNet}%)</b></div>`+
      `<div class="sum-box"><span>Marge nette après livraison</span><b style="color:${_m.margeNetteApresLiv<0?'#b3261e':(_baisse>0?'#d98324':'#2e7d32')}">${euro(_m.margeNetteApresLiv)} (${_m.tauxNetApresLiv}%)</b></div>`+
      (_baisse>0?`<div class="sum-box" style="font-size:.82rem;color:#b3261e"><span>Impact sur le taux de marge</span><b>−${_baisse.toFixed(1)} pt</b></div>`:'')+
      (_m.suggLivraison>0?`<p class="note">💡 Prix de livraison conseillé pour préserver la marge : <b>${euro(_m.suggLivraison)}</b>.</p>`:'');
  }
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
    if(ln.type==='vrac'){
      const parfums=(ln.parfums||[]).filter(p=>p.qte>0);
      return `<div class="cmd-line"><div class="line-type">Vrac pro <span class="line-sub">boîte réutilisable, non facturée</span></div>
        ${parfums.length?`<div style="margin-top:6px">${parfums.map(p=>`<span class="pill">${esc(p.nom)} × ${p.qte}</span>`).join('')}</div>`:'<p class="note">Aucun.</p>'}
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
    <p style="margin-bottom:10px"><b>${cl?`<span class="link-name" onclick="closeModal();clientForm(${cl.id})">${esc(cl.nom)}</span>`:'—'}</b> · ${fmtDate(o.date)}${o.heureLivraison?' · '+esc(o.heureLivraison):''}</p>
    ${o.lieuLivraison?`<div class="sum-box"><span>📍 Livraison</span><b>${esc(o.lieuLivraison)}</b></div>`:''}
    ${blocks||'<p class="note">Aucun produit.</p>'}
    <div class="sum-box"><span>Personnalisation couleurs</span><b>${+o.persoMacarons>0?`${o.persoMacarons} macaron(s) · +${euro(money2(o.persoMacarons*0.25))}`:(o.perso?'Oui':'Non')}</b></div>
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
    ${_livBlock}
    <h3 style="font-size:1rem;margin:16px 0 8px">Statut de la commande</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${ORDER_STATUS.map(st=>{const cur=normStatus(o.statut)===st;
        return `<button class="btn ${cur?'':'ghost'} sm" onclick="setOrderStatus(${id},'${st}')" ${cur?'style="pointer-events:none"':''}>${cur?'● ':''}${st}</button>`;}).join('')}
    </div>
    ${o.notes?`<h3 style="font-size:1rem;margin:16px 0 6px">Notes</h3><p style="font-size:.86rem;white-space:pre-wrap">${esc(o.notes)}</p>`:''}
    <div class="modal-actions"><button class="btn ghost" style="margin-right:auto" onclick="closeModal()">Fermer</button><button class="btn ghost" onclick="exportOrderText(${id})">⧉ Texte</button><button class="btn" onclick="closeModal();cmdForm(${id})">Modifier</button><button class="btn danger" onclick="cmdDelete(${id})">🗑 Supprimer</button></div>`);
}
// Total d'une ligne stockée (parfums/items en tableaux)
function lineTotalStored(ln){
  // base = montant AVANT remise de ligne, selon le type
  let base;
  if(ln.type==='coffret'){
    const pu = (ln.prixUnitaireApplique!=null && +ln.prixUnitaireApplique>=0)
      ? +ln.prixUnitaireApplique
      : ((BOX_PRICES[ln.taille]!=null)?BOX_PRICES[ln.taille]:0);
    const nbDiff=(ln.parfums||[]).filter(p=>p.qte>0).length;
    const limit=BOX_FLAVOR_LIMIT[ln.taille]||0;
    base = money2(pu + Math.max(0,nbDiff-limit)*FLAVOR_SURCHARGE);
  }
  else if(ln.type==='evenement') base = money2((ln.evQte||0)*EVENT_PRICE + (ln.equip||0)*EQUIP_PRICE);
  else if(ln.type==='grand'){ const pu=bigPrice(ln.tarif); const tot=(ln.items||[]).reduce((s,p)=>s+(+p.qte||0),0); base = money2(tot*pu); }
  else if(ln.type==='vrac'){ const pu=+getSettings().prixMacaronProStd||0; const tot=(ln.parfums||[]).reduce((s,p)=>s+(+p.qte||0),0); base = money2(tot*pu); }
  else if(ln.type==='don') return 0; // toujours gratuit, pas de remise à appliquer
  else if(ln.type==='prestation'){
    base=money2(+ln.montantHT||0);
    const rem = ln.remiseType==='euro' ? Math.min(base,money2(+ln.remiseEuro||0)) : money2(base*Math.max(0,Math.min(100,+ln.remisePct||0))/100);
    return Math.max(0, money2(base-rem));
  }
  else return 0;
  // Remise de ligne en % (bornée 0–100), appliquée à la base — alignée sur lineTotal() côté édition.
  // Sans ça, le CA recalculé (marges, analytics, export) ignorerait les remises de ligne.
  const pct = Math.max(0, Math.min(100, +ln.remisePct||0));
  const rem = money2(base*pct/100);
  return Math.max(0, money2(base - rem));
}
let cmdLines = [];      // lignes de produits de la commande en cours
let cmdProductsCache = [];
let _cmdMarginCache = {recipes:[], recipeItems:[], lots:[]};
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
  if(t==='vrac') return {type:'vrac', parfums:_parfumsToObj(ln.parfums), remisePct:+ln.remisePct||0};
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
  // caches pour le calcul de marge en direct (impact livraison)
  _cmdMarginCache = {
    recipes: await db.recipes.toArray(),
    recipeItems: await db.recipeItems.toArray(),
    lots: await db.materialLots.toArray()
  };
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
  // Suggestions de lieux de livraison : presets + lieux des commandes passées.
  const places = await usualDeliveryPlaces();
  const placesOpts = places.map(p=>`<option value="${esc(p)}">`).join('');
  openModal(`<h3>${id?'Modifier':'Nouvelle'} commande</h3>
   <div class="field"><label>Client</label>
     <input class="search" id="f_clsearch" placeholder="Rechercher par nom ou téléphone…" oninput="filterCmdClients(this.value)" value="">
     <select id="f_cl" style="margin-top:6px" onchange="cmdSuggestClientAddress()">${clOpts||'<option value="0">— aucun —</option>'}</select>
     <button class="btn ghost sm" style="margin-top:6px" onclick="quickClient(${id||0})">+ Nouveau client</button>
   </div>
   <div class="row2">
     <div class="field"><label>Date</label><input type="date" id="f_date" value="${o.date||today()}" oninput="cmdFeasibilityRecalc()"></div>
     <div class="field"><label>Heure de livraison</label><input type="time" id="f_heure" value="${esc(o.heureLivraison||'')}" oninput="cmdFeasibilityRecalc()"></div>
   </div>
   <div id="feasibility" class="feasibility" style="display:none"></div>
   <div class="field"><label>Adresse / lieu de livraison <span style="color:#9a8a82;font-weight:400">— tapez pour rechercher (clients, lieux habituels)</span></label>
     <input class="search" id="f_lieu" list="lieuxLivraison" autocomplete="off" autocapitalize="words" placeholder="Tapez une adresse, un nom de client ou un lieu…" value="${esc(o.lieuLivraison||'')}">
     <datalist id="lieuxLivraison">${placesOpts}</datalist>
   </div>
   <div class="row2">
     <div class="field"><label>Distance aller (km) <span style="color:#9a8a82;font-weight:400">— l'aller-retour est calculé</span></label>
       <input type="number" min="0" step="0.1" id="f_distKm" value="${o.distanceKm!=null?esc(o.distanceKm):''}" placeholder="ex : 8" oninput="cmdDeliveryRecalc()"></div>
     <div class="field"><label>Prix carburant (€/L)</label>
       <input type="number" min="0" step="0.001" id="f_carbu" value="${o.prixCarburant!=null?esc(o.prixCarburant):''}" placeholder="ex : 1.85" oninput="cmdDeliveryRecalc()"></div>
   </div>
   <div class="field"><label>Temps de trajet aller (min) <span style="color:#9a8a82;font-weight:400">— l'aller-retour est calculé (×2)</span></label>
     <input type="number" min="0" step="1" id="f_tempsLiv" value="${o.tempsLivraisonMin!=null?esc(o.tempsLivraisonMin):''}" placeholder="ex : 15" oninput="cmdDeliveryRecalc()"></div>
   <div class="field"><label>Consommation réelle du véhicule (L/100 km) <span style="color:#9a8a82;font-weight:400">— laisser vide = réglage par défaut (${getSettings().vehicleConso} L)</span></label>
     <input type="number" min="0" step="0.1" id="f_conso" value="${o.consoVehicule!=null&&o.consoVehicule!==''?esc(o.consoVehicule):''}" placeholder="ex : 7.2" oninput="cmdDeliveryRecalc()"></div>
   <div class="sum-box" id="deliveryImpact" style="display:none;flex-direction:column;align-items:stretch;gap:4px"></div>

   <label style="font-size:.82rem;color:#7a6a62;font-weight:500;display:block;margin-bottom:6px">Produits de la commande</label>
   <div id="linesWrap"></div>
   <div class="add-line-row">
     <button class="btn ghost sm" onclick="addLine('coffret')">+ Coffret</button>
     <button class="btn ghost sm" onclick="addLine('evenement')">+ Événement</button>
     <button class="btn ghost sm" onclick="addLine('grand')">+ Grand format</button>
     <button class="btn ghost sm" onclick="addLine('vrac')">+ Vrac pro</button>
     <button class="btn ghost sm" onclick="addLine('prestation')">+ Prestation / Coaching</button>
     <button class="btn ghost sm" onclick="addLine('don')">+ Don (0 €)</button>
   </div>

   <div class="field"><label>Statut commande</label><select id="f_st">${stOpts}</select></div>
   <label class="switch-row"><input type="checkbox" id="f_perso" ${o.perso||+o.persoMacarons>0?'checked':''} onchange="cmdPersoToggle()"> Personnalisation des couleurs (+0,25 €/macaron)</label>
   <div class="field" id="f_persoWrap" style="${(o.perso||+o.persoMacarons>0)?'':'display:none'}"><label>Nombre de macarons personnalisés <span style="color:#9a8a82;font-weight:400">— pas forcément le total de la commande</span></label>
     <input type="number" min="0" step="1" id="f_persoNb" value="${o.persoMacarons||''}" placeholder="ex : 24" oninput="cmdRecalc()"></div>
   <div class="row2">
     <div class="row2" style="align-items:end">
       <div class="field" style="margin:0"><label>Remise globale (€)</label><input type="number" min="0" step="0.01" id="f_remisegEur" placeholder="0" oninput="cmdGlobalRemiseFromEuro(this.value)"></div>
       <div class="field" style="margin:0"><label>Remise globale (%)</label><input type="number" min="0" max="100" step="1" id="f_remiseg" value="${o.remiseGlobale||''}" placeholder="0" oninput="cmdGlobalRemiseFromPct(this.value)"></div>
     </div>
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
  if(matches.length===1){ sel.value=String(matches[0].id); cmdSuggestClientAddress(); }
}

// Quand un client est choisi, propose son adresse comme lieu de livraison —
// uniquement si le champ lieu est encore vide (ne jamais écraser une saisie manuelle).
function cmdSuggestClientAddress(){
  const sel=document.getElementById('f_cl'); const lieu=document.getElementById('f_lieu');
  if(!sel || !lieu) return;
  if((lieu.value||'').trim()) return; // l'utilisateur a déjà renseigné un lieu
  const cid=+sel.value||0; if(!cid) return;
  const cl=(cmdClientsCache||[]).find(c=>c.id===cid);
  if(cl && (cl.adresse||'').trim()) lieu.value=cl.adresse.trim();
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
  else if(type==='vrac') cmdLines.push({type:'vrac', parfums:{}});
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
    if(ln.type==='vrac') return drawVracLine(ln,i);
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
  const pu=bigPrice(ln.tarif);
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
      <option value="particulier" ${ln.tarif!=='pro'?'selected':''}>Particulier — ${euro(bigPrice('particulier'))}/pièce</option>
      <option value="pro" ${ln.tarif==='pro'?'selected':''}>Pro — ${euro(bigPrice('pro'))}/pièce</option>
    </select></div>
    <label style="font-size:.78rem;color:#7a6a62">Produits (quantité)</label>
    <div class="flav-grid">${bigRows}</div>
    <div class="sum-box"><span>${tot} pièce(s) × ${euro(pu)}</span><b>${euro(tot*pu)}</b></div>
    ${lineRemiseRow(ln,i)}
  </div>`;
}
function setBigTarif(i,v){ cmdLines[i].tarif=v; drawLines(); }
function setBigItem(i,fi,v){ const f=BIG_FORMATS[fi]; const q=+v||0; if(q>0)cmdLines[i].items[f]=q; else delete cmdLines[i].items[f]; drawLines(); }

// Ligne VRAC PRO : macarons standards en boîte réutilisable (non facturée), au tarif pro/macaron.
function drawVracLine(ln,i){
  if(!ln.parfums) ln.parfums={};
  const pu=+getSettings().prixMacaronProStd||0;
  const rows = FLAVORS.map((f,fi)=>{
    const q=ln.parfums[f]||0;
    let opts=''; for(let n=0;n<=120;n++) opts+=`<option value="${n}" ${q===n?'selected':''}>${n}</option>`;
    return `<div class="flav-row ${q>0?'on':''}"><span class="nm">${esc(f)}</span>
      <select class="flav-sel" onchange="setVracParfum(${i},${fi},this.value)">${opts}</select></div>`;
  }).join('');
  const tot=Object.values(ln.parfums).reduce((s,q)=>s+(+q||0),0);
  return `<div class="cmd-line">
    <div class="line-head"><span class="line-type">Vrac pro <span class="line-sub">boîte réutilisable, non facturée</span></span><span class="line-del" onclick="removeLine(${i})">✕ retirer</span></div>
    <div class="sum-box"><span>Tarif pro</span><b>${euro(pu)}/macaron</b></div>
    <label style="font-size:.78rem;color:#7a6a62">Parfums (quantité)</label>
    <div class="flav-grid">${rows}</div>
    <div class="sum-box"><span>${tot} macaron(s) × ${euro(pu)}</span><b>${euro(tot*pu)}</b></div>
    ${lineRemiseRow(ln,i)}
  </div>`;
}
function setVracParfum(i,fi,v){ const f=FLAVORS[fi]; const q=+v||0; if(q>0)cmdLines[i].parfums[f]=q; else delete cmdLines[i].parfums[f]; drawLines(); }

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
  if(ln.type==='grand'){ const pu=bigPrice(ln.tarif); const tot=Object.values(ln.items||{}).reduce((s,q)=>s+(+q||0),0); return mulMoney(tot,pu); }
  if(ln.type==='vrac'){ const pu=+getSettings().prixMacaronProStd||0; const tot=Object.values(ln.parfums||{}).reduce((s,q)=>s+(+q||0),0); return mulMoney(tot,pu); }
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
// Remise de ligne en € — gère les deux modes (€ fixe ou %) pour TOUS les types de ligne.
// remiseType:'euro' → montant fixe (borné au prix de base) ; sinon → pourcentage (0–100 %).
function lineRemiseEuro(ln){
  const base=lineTotalBase(ln);
  if(ln.remiseType==='euro') return Math.min(base, money2(+ln.remiseEuro||0));
  const pct=Math.max(0,Math.min(100,+ln.remisePct||0));
  return money2(base*pct/100);
}
// Prix d'une ligne APRÈS remise de ligne
function lineTotal(ln){
  return Math.max(0, subMoney(lineTotalBase(ln), lineRemiseEuro(ln)));
}
// Bloc « remise de ligne » : deux champs synchronisés € et %.
// Saisir l'un recalcule l'autre et le total, en direct. La référence stockée reste remisePct
// (% de la base) pour rester compatible avec tous les calculs en aval (CA, marges, export).
function lineRemiseRow(ln,i){
  if(ln.type==='don') return '';
  const base=lineTotalBase(ln);
  const pct=Math.max(0,Math.min(100,+ln.remisePct||0));
  const eur=money2(base*pct/100);
  const net=lineTotal(ln);
  return `<div class="row2" style="align-items:end">
      <div class="field" style="margin:0"><label>Remise ligne (€)</label>
        <input type="number" min="0" step="0.01" id="remEur_${i}" value="${eur>0?eur:''}" placeholder="0"
          oninput="setLineRemiseEuro(${i},this.value)"></div>
      <div class="field" style="margin:0"><label>Remise ligne (%)</label>
        <input type="number" min="0" max="100" step="1" id="remPct_${i}" value="${pct>0?pct:''}" placeholder="0"
          oninput="setLineRemisePct(${i},this.value)"></div>
    </div>
    <div class="sum-box" style="margin:6px 0 0">${(pct>0)
      ? `<span>Avant ${euro(base)} · −${pct}% (${euro(eur)})</span><b>${euro(net)}</b>`
      : `<span>Montant ligne</span><b>${euro(base)}</b>`}</div>`;
}
// Saisie en POURCENTAGE → borne 0–100, met à jour le champ € jumeau, recalcule.
function setLineRemisePct(i,v){
  let p=+v||0; if(p<0)p=0; if(p>100)p=100;
  cmdLines[i].remiseType='pct'; cmdLines[i].remisePct=p; delete cmdLines[i].remiseEuro;
  const base=lineTotalBase(cmdLines[i]);
  const eurEl=document.getElementById('remEur_'+i);
  if(eurEl && document.activeElement!==eurEl){ const e=money2(base*p/100); eurEl.value=e>0?e:''; }
  cmdRecalc();
}
// Saisie en EUROS → convertie en % de la base (référence canonique), met à jour le champ % jumeau.
function setLineRemiseEuro(i,v){
  let e=money2(+v||0); if(e<0)e=0;
  const base=lineTotalBase(cmdLines[i]);
  if(e>base) e=base;
  const p = base>0 ? Math.max(0,Math.min(100, money2(e/base*100))) : 0;
  cmdLines[i].remiseType='pct'; cmdLines[i].remisePct=p; delete cmdLines[i].remiseEuro;
  const pctEl=document.getElementById('remPct_'+i);
  if(pctEl && document.activeElement!==pctEl){ pctEl.value=p>0?p:''; }
  cmdRecalc();
}
// Normalise les lignes d'édition (cmdLines) vers la forme stockée (tableaux parfums/items).
// Réutilisé par saveCmd ET par le calcul de marge en direct (impact livraison).
function cmdLinesToStored(){
  return (cmdLines||[]).map(ln=>{
    const rp = Math.max(0,Math.min(100,+ln.remisePct||0));
    if(ln.type==='coffret') return {type:'coffret', taille:ln.taille, remisePct:rp, prixUnitaireApplique: coffretUnitPrice(ln), parfums:Object.keys(ln.parfums).filter(k=>ln.parfums[k]>0).map(nom=>({nom,qte:ln.parfums[nom]}))};
    if(ln.type==='evenement') return {type:'evenement', evQte:ln.evQte, equip:ln.equip, remisePct:rp, parfums:Object.keys(ln.parfums).filter(k=>ln.parfums[k]>0).map(nom=>({nom,qte:ln.parfums[nom]}))};
    if(ln.type==='grand') return {type:'grand', tarif:ln.tarif, remisePct:rp, items:Object.keys(ln.items).filter(k=>ln.items[k]>0).map(nom=>({nom,qte:ln.items[nom]}))};
    if(ln.type==='vrac') return {type:'vrac', remisePct:rp, parfums:Object.keys(ln.parfums||{}).filter(k=>ln.parfums[k]>0).map(nom=>({nom,qte:ln.parfums[nom]}))};
    if(ln.type==='don') return {type:'don', parfums:Object.keys(ln.parfums||{}).filter(k=>ln.parfums[k]>0).map(nom=>({nom,qte:ln.parfums[nom]})), items:Object.keys(ln.items||{}).filter(k=>ln.items[k]>0).map(nom=>({nom,qte:ln.items[nom]}))};
    if(ln.type==='prestation') return {type:'prestation', libelle:ln.libelle||'', montantHT:money2(+ln.montantHT||0), remiseType:ln.remiseType||'pct', remisePct:Math.max(0,Math.min(100,+ln.remisePct||0)), remiseEuro:money2(+ln.remiseEuro||0)};
  }).filter(Boolean);
}
function cmdPersoToggle(){
  const on=document.getElementById('f_perso')?.checked;
  const w=document.getElementById('f_persoWrap'); if(w) w.style.display=on?'block':'none';
  if(!on){ const n=document.getElementById('f_persoNb'); if(n) n.value=''; }
  cmdRecalc();
}
const PERSO_PRIX_UNIT = 0.25;   // surcoût personnalisation des couleurs, €/macaron
function cmdPersoCount(){
  const on=document.getElementById('f_perso')?.checked;
  return on ? Math.max(0, +(document.getElementById('f_persoNb')?.value)||0) : 0;
}
// Remise globale — synchronisation €/%. La référence stockée reste le % (champ f_remiseg),
// appliqué au sous-total (après remises de ligne), pour rester compatible avec saveCmd et l'aval.
function _cmdSousTotalAvantGlobal(){
  return addMoney(...cmdLines.map(ln=>lineTotal(ln)));
}
function cmdGlobalRemiseFromPct(v){
  let p=+v||0; if(p<0)p=0; if(p>100)p=100;
  const st=_cmdSousTotalAvantGlobal();
  const eurEl=document.getElementById('f_remisegEur');
  if(eurEl && document.activeElement!==eurEl){ const e=money2(st*p/100); eurEl.value=e>0?e:''; }
  cmdRecalc();
}
function cmdGlobalRemiseFromEuro(v){
  let e=money2(+v||0); if(e<0)e=0;
  const st=_cmdSousTotalAvantGlobal();
  if(e>st) e=st;
  const p = st>0 ? Math.max(0,Math.min(100, money2(e/st*100))) : 0;
  const pctEl=document.getElementById('f_remiseg');
  if(pctEl){ pctEl.value = p>0?p:''; }   // met à jour la référence canonique
  cmdRecalc();
}
function cmdRecalc(){
  const sousTotal = addMoney(...cmdLines.map(ln=>lineTotal(ln))); // après remises de ligne
  const gpct = Math.max(0, Math.min(100, +(document.getElementById('f_remiseg')?.value)||0));
  const remiseG = money2(sousTotal*gpct/100);
  // garde le champ € global cohérent avec le % quand le sous-total évolue (sauf saisie en cours)
  const gEurEl=document.getElementById('f_remisegEur');
  if(gEurEl && document.activeElement!==gEurEl){ gEurEl.value = remiseG>0?remiseG:''; }
  const persoNb = cmdPersoCount();
  const persoSup = money2(persoNb*PERSO_PRIX_UNIT);
  const total = Math.max(0, addMoney(subMoney(sousTotal, remiseG), persoSup));
  const mt=document.getElementById('f_mt');
  if(mt && mt.dataset.auto==='1'){ mt.value = total?total.toFixed(2):''; }
  const brk=document.getElementById('priceBreak');
  if(brk){
    if(cmdLines.length || persoNb){
      brk.style.display='block';
      const remiseLignes = addMoney(...cmdLines.map(ln=>lineRemiseEuro(ln)));
      brk.innerHTML =
        `<div style="display:flex;justify-content:space-between"><span>Sous-total (${cmdLines.length} produit(s))</span><b>${euro(addMoney(...cmdLines.map(ln=>lineTotalBase(ln))))}</b></div>`+
        (remiseLignes>0?`<div style="display:flex;justify-content:space-between;color:#3f7d52"><span>Remises de ligne</span><b>−${euro(remiseLignes)}</b></div>`:'')+
        (gpct>0?`<div style="display:flex;justify-content:space-between;color:#3f7d52"><span>Remise globale (−${gpct}%)</span><b>−${euro(remiseG)}</b></div>`:'')+
        (persoNb>0?`<div style="display:flex;justify-content:space-between;color:var(--caramel)"><span>Personnalisation couleurs (${persoNb}×0,25 €)</span><b>+${euro(persoSup)}</b></div>`:'')+
        `<div style="display:flex;justify-content:space-between;border-top:1px solid #e8dccd;margin-top:4px;padding-top:4px"><span><b>Total TTC</b></span><b>${euro(total)}</b></div>`;
    } else brk.style.display='none';
  }
  if(typeof cmdUpdatePaySummary==='function') cmdUpdatePaySummary();
  if(typeof cmdDeliveryRecalc==='function') cmdDeliveryRecalc();
  if(typeof cmdFeasibilityRecalc==='function') cmdFeasibilityRecalc();
}

// Verdict instantané de faisabilité de la commande en cours d'édition.
// Combine la demande par parfum (lignes), le stock actuel, la date/heure de
// livraison et le temps réellement disponible (planning bi-hebdomadaire).
let _feasTimer=null;
function cmdFeasibilityRecalc(){
  const box=document.getElementById('feasibility'); if(!box) return;
  const date=document.getElementById('f_date')?.value;
  const heure=document.getElementById('f_heure')?.value;
  // demande par parfum à partir des lignes en cours
  let needs={};
  try{ const o={lignes: cmdLinesToStored()}; needs=_orderParfumDemand(o); }catch(e){ needs={}; }
  const totalDemande=Object.values(needs).reduce((s,x)=>s+(+x||0),0);
  if(!date || totalDemande<=0){ box.style.display='none'; return; }
  // léger debounce (le calcul lit le stock en base)
  if(_feasTimer) clearTimeout(_feasTimer);
  _feasTimer=setTimeout(async()=>{
    let r; try{ r=await assessOrderFeasibility(needs, date, heure); }catch(e){ box.style.display='none'; return; }
    const col = r.statut==='ok' ? 'var(--green,#3f7d52)' : r.statut==='tendu' ? 'var(--caramel,#AA7C39)' : 'var(--red,#b3261e)';
    const bg  = r.statut==='ok' ? '#eef6ee' : r.statut==='tendu' ? '#fbf4e9' : '#fdf3f2';
    let detail='';
    if(!r.stockSuffit && r.statut!=='inconnu'){
      const fmtH = m=>{ const h=Math.floor(m/60), mm=Math.round(m%60); return `${h?h+'h':''}${h?String(mm).padStart(2,'0'):mm+' min'}`; };
      detail=`<div class="feas-meta"><span>🏭 ${r.nbBatchs} batch(s) · ${r.nbMeringues} meringue(s)</span>
        <span>⏱ ${fmtH(r.besoinMin)} requis / ${fmtH(r.dispoMin)} dispo</span></div>`;
    }
    box.style.display='block';
    box.style.background=bg; box.style.borderColor=col;
    box.innerHTML=`<div class="feas-msg" style="color:${col}">${r.msg}</div>${detail}`;
  }, 250);
}

// Recalcule en direct l'impact de la livraison sur la marge de la commande
// et propose un prix de livraison qui couvre le coût ET préserve le taux de marge.
function cmdDeliveryRecalc(){
  const box=document.getElementById('deliveryImpact'); if(!box) return;
  // commande de travail à partir des lignes en cours + saisies livraison
  const o={
    lignes: cmdLinesToStored(),
    remiseGlobale: Math.max(0,Math.min(100,+(document.getElementById('f_remiseg')?.value)||0)),
    distanceKm: +val('f_distKm')||0,
    prixCarburant: +val('f_carbu')||0,
    tempsLivraisonMin: +val('f_tempsLiv')||0,
    consoVehicule: val('f_conso')!==''?+val('f_conso'):null
  };
  const liv = computeDeliveryCost(o);
  if(!liv.actif){ box.style.display='none'; return; }
  const c=_cmdMarginCache||{};
  const m = computeOrderMargins(o, c.recipes||[], c.recipeItems||[], c.lots||[]);
  const baisse = Math.max(0, m.tauxNet - m.tauxNetApresLiv);
  const defConso = getSettings().vehicleConso;
  box.style.display='flex';
  box.innerHTML =
    `<div style="display:flex;justify-content:space-between"><span>🚚 Coût livraison (A/R ${liv.distAR} km${liv.minutes?` · ${liv.minutes} min`:''})</span><b>${euro(liv.total)}</b></div>`+
    `<div style="display:flex;justify-content:space-between;color:#8a7a72;font-size:.82rem"><span>dont carburant / temps</span><span>${euro(liv.coutCarburant)} · ${euro(liv.coutTemps)}</span></div>`+
    `<div style="display:flex;justify-content:space-between;color:#8a7a72;font-size:.78rem"><span>conso retenue</span><span>${liv.conso} L/100${(o.consoVehicule&&o.consoVehicule!=defConso)?' (réelle)':' (défaut)'}</span></div>`+
    `<div style="display:flex;justify-content:space-between;border-top:1px solid #e8dccd;margin-top:4px;padding-top:4px"><span>Marge nette <b>sans</b> livraison</span><b>${euro(m.margeNette)} (${m.tauxNet}%)</b></div>`+
    `<div style="display:flex;justify-content:space-between"><span>Marge nette <b>après</b> livraison</span><b style="color:${m.margeNetteApresLiv<0?'#b3261e':(baisse>0?'#d98324':'#2e7d32')}">${euro(m.margeNetteApresLiv)} (${m.tauxNetApresLiv}%)</b></div>`+
    (baisse>0?`<div style="display:flex;justify-content:space-between;color:#b3261e;font-size:.82rem"><span>Impact sur le taux de marge</span><b>−${baisse.toFixed(1)} pt</b></div>`:'')+
    (m.suggLivraison>0?`<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #e0d5c5">💡 Pour préserver ta marge, facture la livraison <b style="color:var(--bordeaux)">${euro(m.suggLivraison)}</b> <button type="button" class="btn gold sm" style="margin-left:6px" onclick="cmdApplyDeliveryFee(${m.suggLivraison})">Ajouter au prix</button></div>`:'');
}
// Ajoute le supplément livraison suggéré au prix total de la commande (champ manuel).
function cmdApplyDeliveryFee(montant){
  const mt=document.getElementById('f_mt'); if(!mt) return;
  const base = +mt.value || 0;
  mt.dataset.auto='0';                       // le prix devient manuel
  mt.value = money2(base + (+montant||0)).toFixed(2);
  cmdRecalc();
  toast(`Livraison ${euro(montant)} ajoutée au prix`);
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
  const lignes = cmdLinesToStored();
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
    heureLivraison: val('f_heure')||'', lieuLivraison: val('f_lieu')||'',
    distanceKm: +val('f_distKm')||0, prixCarburant: +val('f_carbu')||0, tempsLivraisonMin: +val('f_tempsLiv')||0,
    consoVehicule: val('f_conso')!==''?(+val('f_conso')||0):null,
    lignes, remiseGlobale,
    perso:document.getElementById('f_perso').checked,
    persoMacarons: cmdPersoCount(),
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
// Suppression de commande avec RAISON obligatoire (confirmation explicite).
const DELETE_REASONS_ORDER = ['Annulation client','Erreur de saisie','Doublon','Non honorée','Report / remplacée','Autre'];
const DELETE_REASONS_PROD = ['Erreur de saisie','Ratée / non conforme','Doublon','Test / essai','Périmée','Autre'];
async function cmdDelete(id){
  const o=await db.orders.get(id); if(!o){ toast('Commande introuvable'); return; }
  const items = await db.orderItems.where('orderId').equals(id).toArray();
  const totBatch = items.reduce((s,it)=>s+(+it.qte||0),0);
  const cl = o.clientId ? await db.clients.get(o.clientId) : null;
  const opts = DELETE_REASONS_ORDER.map(r=>`<option>${esc(r)}</option>`).join('');
  openModal(`<h3>🗑 Supprimer la commande</h3>
    <p style="margin-bottom:8px">${cl?`<b>${esc(cl.nom)}</b> · `:''}${fmtDate(o.date)} · ${euro(o.montant)}</p>
    ${totBatch?`<div class="banner">↩ <div>${totBatch} macaron(s) de batch(s) lié(s) seront <b>recrédités au stock</b>.</div></div>`:''}
    <div class="field"><label>Raison de la suppression *</label><select id="f_delReason">${opts}</select></div>
    <div class="field"><label>Précision (facultatif)</label><input id="f_delNote" placeholder="détail…"></div>
    <p class="note">La suppression est définitive. La raison est enregistrée dans le journal des suppressions.</p>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn danger" onclick="cmdDeleteConfirm(${id})">Confirmer la suppression</button></div>`);
}
async function cmdDeleteConfirm(id){
  const reason=val('f_delReason')||DELETE_REASONS_ORDER[0];
  const note=val('f_delNote')||'';
  const o=await db.orders.get(id);
  const items = await db.orderItems.where('orderId').equals(id).toArray();
  const evs = await db.events.where('refId').equals(id).toArray().catch(()=>[]);
  const totBatch = items.reduce((s,it)=>s+(+it.qte||0),0);
  // snapshot pour annulation
  const snap = { order:o?{...o}:null, items:items.map(x=>({...x})), events:evs.map(e=>({...e})) };
  await db.transaction('rw',db.orders,db.orderItems,db.productions,db.events,async()=>{
    for(const it of items){
      const prod = await db.productions.get(it.productionId);
      if(prod){ await db.productions.update(prod.id,{qteRestante: addQty(prod.qteRestante, it.qte)}); }
    }
    await db.orderItems.where('orderId').equals(id).delete();
    await db.events.where('refId').equals(id).delete();
    await db.orders.delete(id);
  });
  logDeletion('commande', id, reason, note, o?`${fmtDate(o.date)} · ${euro(o.montant)}`:'');
  closeModal(); renderCmd();
  // annulation rapide : restaure la commande, ses liens, son événement, et ré-décrémente le stock
  showUndoToast(totBatch?`Commande supprimée — ${totBatch} recrédité(s)`:'Commande supprimée', async ()=>{
    await db.transaction('rw',db.orders,db.orderItems,db.productions,db.events,async()=>{
      if(snap.order) await db.orders.put(snap.order);
      for(const it of snap.items){ await db.orderItems.put(it);
        const prod=await db.productions.get(it.productionId);
        if(prod){ await db.productions.update(prod.id,{qteRestante: subQty(prod.qteRestante, it.qte)}); } }
      for(const e of snap.events){ await db.events.put(e); }
    });
    renderCmd();
  });
}
// Journal léger des suppressions (localStorage, pour mémoire/traçabilité interne).
function logDeletion(type, id, reason, note, label){
  try{
    const key='sm_deletionLog';
    const arr=JSON.parse(localStorage.getItem(key)||'[]');
    arr.unshift({type, id, reason, note:note||'', label:label||'', ts:new Date().toISOString()});
    localStorage.setItem(key, JSON.stringify(arr.slice(0,300)));
  }catch(e){}
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
// monthKey() : voir utils.js
// monthLabel() : voir utils.js
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
    const ca=mk.ca||{}; const fond=money2(+mk.fondCaisse||0);
    const esp=money2(Math.max(0,(+ca.especes||0)-fond)), cb=money2(ca.cb||0), au=money2(ca.autre||0);
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
    const c=money2(T.coutMat+T.coutEmb+(T.coutMarche||0));
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
  // Valeur des pertes / casse déclarées (coût de revient des pièces jetées) — imputée au résultat.
  const lossesAll = await db.losses.toArray().catch(()=>[]);
  const totalPertes = money2(lossesAll.reduce((s,l)=>s+(+l.coutTotal||0),0));
  return {
    serie, encByMethod, chargeByCat,
    totalEncaisse, totalFacture, totalCharges, totalCoutMatieres:totalCout,
    totalMarches, totalPertes,
    margeBrute: money2(totalEncaisse-totalCout),
    resultat: money2(totalEncaisse-totalCharges-totalCout-totalPertes),
    creances,
    nbCharges: charges.length
  };
}
// ============================================================
//  BILAN MENSUEL — ventilation marchandise / prestation de service
//  sur les ENCAISSEMENTS du mois (base trésorerie = base déclaration
//  micro-entreprise URSSAF) + prédiction des cotisations.
// ============================================================
async function computeMonthlyBilan(ym){
  // ym = 'YYYY-MM'. Sépare le CA encaissé du mois en marchandise vs service.
  const s=getSettings();
  const orders = await db.orders.toArray();
  const markets = await (db.markets?db.markets.toArray():Promise.resolve([])).catch(()=>[]);
  let goods=0, service=0;            // encaissé du mois, ventilé
  const detailGoods=[], detailService=[];
  // Pour chaque commande, on connaît la part service vs marchandise (lignes prestation = service).
  orders.forEach(o=>{
    const total=money2(+o.montant||0); if(total<=0) return;
    const lignes=orderToLines(o);
    let svc=0;
    lignes.forEach(ln=>{ if(ln.type==='prestation') svc=money2(svc+lineTotalStored(ln)); });
    const partSvc = total>0 ? Math.min(1, svc/total) : 0;   // proportion service de la commande
    // encaissements du mois pour cette commande
    const pays=(o.paiements&&o.paiements.length)?o.paiements
      :(o.paiement==='Payé'&&o.datePaiement?[{date:o.datePaiement,montant:total}]:[]);
    let encMois=0;
    pays.forEach(p=>{ if(monthKey(p.date)===ym) encMois=money2(encMois+money2(p.montant)); });
    if(encMois<=0) return;
    const sPart=money2(encMois*partSvc), gPart=money2(encMois-encMois*partSvc);
    if(gPart>0){ goods=money2(goods+gPart); }
    if(sPart>0){ service=money2(service+sPart); }
    const cl=o.histoLabel||'';
    if(gPart>0) detailGoods.push({label:(o.histo?'[reprise] ':'')+(cl||('commande #'+o.id)), montant:gPart});
    if(sPart>0) detailService.push({label:(cl||('prestation #'+o.id)), montant:sPart});
  });
  // Marchés clôturés du mois = vente de marchandise.
  markets.forEach(mk=>{
    if(mk.statut!=='clos') return;
    if(monthKey(mk.dateCloture||mk.date)!==ym) return;
    const ca=mk.ca||{}; const fond=money2(+mk.fondCaisse||0);
    const esp=money2(Math.max(0,(+ca.especes||0)-fond)), cb=money2(ca.cb||0), au=money2(ca.autre||0);
    const tot=money2(esp+cb+au); if(tot<=0) return;
    goods=money2(goods+tot);
    detailGoods.push({label:'Marché : '+(mk.nom||mk.lieu||'—'), montant:tot});
  });
  const caTotal=money2(goods+service);
  // Cotisations URSSAF micro-entreprise : taux distincts marchandise / service.
  const tauxGoods=+s.socialGoods||0, tauxService=+s.socialService||0;
  const cotisGoods=money2(goods*tauxGoods/100);
  const cotisService=money2(service*tauxService/100);
  const cotisTotal=money2(cotisGoods+cotisService);
  return {ym, goods, service, caTotal, tauxGoods, tauxService, cotisGoods, cotisService, cotisTotal,
    detailGoods, detailService};
}
// Construit le texte du bilan mensuel (export .txt).
function buildBilanText(B){
  const L=[];
  L.push('SENSATIONS MACARONS — BILAN MENSUEL');
  L.push('Mois : '+monthLabel(B.ym));
  L.push('Édité le '+fmtDate(today()));
  L.push('========================================');
  L.push('');
  L.push('CHIFFRE D\'AFFAIRES ENCAISSÉ : '+euro(B.caTotal));
  L.push('');
  L.push('VENTILATION');
  L.push('  • Vente de marchandise : '+euro(B.goods));
  L.push('  • Prestation de service : '+euro(B.service));
  L.push('');
  L.push('COTISATIONS URSSAF (estimation)');
  L.push('  • Marchandise : '+euro(B.goods)+' × '+B.tauxGoods+'%  = '+euro(B.cotisGoods));
  L.push('  • Service     : '+euro(B.service)+' × '+B.tauxService+'%  = '+euro(B.cotisService));
  L.push('  ----------------------------------------');
  L.push('  À PAYER (estimé) : '+euro(B.cotisTotal));
  L.push('');
  if(B.detailGoods.length){
    L.push('DÉTAIL MARCHANDISE');
    B.detailGoods.forEach(d=>L.push('  - '+d.label+' : '+euro(d.montant)));
    L.push('');
  }
  if(B.detailService.length){
    L.push('DÉTAIL PRESTATIONS');
    B.detailService.forEach(d=>L.push('  - '+d.label+' : '+euro(d.montant)));
    L.push('');
  }
  L.push('========================================');
  L.push('Base : encaissements du mois (trésorerie).');
  L.push('Estimation indicative — vérifiez auprès de l\'URSSAF / votre comptable.');
  L.push('Sensations Macarons — Le Mans');
  return L.join('\n');
}
async function exportBilanMois(ym){
  const B=await computeMonthlyBilan(ym);
  const txt=buildBilanText(B);
  const name='bilan-'+ym+'.txt';
  let copied=false;
  try{ if(navigator.clipboard&&navigator.clipboard.writeText){ await navigator.clipboard.writeText(txt); copied=true; } }catch(e){}
  const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  openModal(`<h3>Bilan ${monthLabel(ym)}</h3>
    <p class="note">${copied?'Copié dans le presse-papier ✓.':'Fichier .txt téléchargé.'} </p>
    <textarea rows="16" style="width:100%;font-family:monospace;font-size:.76rem;white-space:pre">${esc(txt)}</textarea>
    <div class="modal-actions"><button class="btn ghost" style="margin-right:auto" onclick="closeModal()">Fermer</button>
      <button class="btn" onclick="(function(){const t=this.closest('.modal').querySelector('textarea');t.select();try{document.execCommand('copy');}catch(e){} toast('Copié ✓');}).call(this)">⧉ Copier</button></div>`);
}

// Export comptable CSV : synthèse mensuelle (CA encaissé, marchandise, service, cotisations, charges, résultat).
async function exportComptaCSV(){
  const A = await computeAccounting();
  const sep=';';
  const esc2 = v => { v=String(v==null?'':v); return /[";\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  const rows=[['Mois','CA encaissé','Vente marchandise','Prestation service','Cotis. marchandise','Cotis. service','Cotis. URSSAF totale','Charges','Coût matières (est.)','Résultat'].map(esc2).join(sep)];
  for(const s of A.serie){
    const B=await computeMonthlyBilan(s.mois);
    rows.push([
      monthLabel(s.mois), money2(s.ca), B.goods, B.service, B.cotisGoods, B.cotisService, B.cotisTotal,
      money2(s.charges), money2(s.coutMatieres), money2(s.resultat)
    ].map(v=>esc2(typeof v==='number'?v.toFixed(2).replace('.',','):v)).join(sep));
  }
  const csv='\uFEFF'+rows.join('\r\n');   // BOM pour Excel FR
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='comptabilite-mensuelle.csv'; a.click();
  toast('Fichier comptable prêt — choisis où l\'enregistrer 📂');
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
    else if(ln.type==='vrac') pieces=(ln.parfums||[]).reduce((s,p)=>s+(+p.qte||0),0);
    else if(ln.type==='don') pieces=(ln.parfums||[]).reduce((s,p)=>s+(+p.qte||0),0);
    if(pieces<=0) return;
    // coût unitaire moyen toutes recettes confondues (approximation si parfum↔recette non résolu)
    const perRecipeUnit = recipes.map(r=>{ const cb=coutRecette(r.id, recipeItems, lots); return r.rendement>0?cb/r.rendement:0; }).filter(x=>x>0);
    const avgUnit = perRecipeUnit.length ? perRecipeUnit.reduce((s,x)=>s+x,0)/perRecipeUnit.length : 0;
    cost += pieces*avgUnit;
  });
  return money2(cost);
}

/* ------------------------------------------------------------
   COÛT DE LIVRAISON d'une commande.
   Entrées stockées sur l'objet order (saisie utilisateur) :
     - distanceKm        : distance ALLER simple (km) — doublée ici pour l'aller-retour
     - prixCarburant     : prix à la pompe (€/L)
     - tempsLivraisonMin : temps ALLER simple (min) — doublé ici pour l'aller-retour ;
                           coût = temps A/R × taux horaire
   Le carburant utilise la consommation du véhicule (L/100 km, réglages).
   ------------------------------------------------------------ */
function computeDeliveryCost(o){
  const s=getSettings();
  const distAller = Math.max(0, +o.distanceKm||0);
  const distAR = distAller*2;                       // aller-retour
  const prixL = Math.max(0, +o.prixCarburant||0);
  // Consommation : valeur RÉELLE saisie pour cette livraison si fournie, sinon réglage global.
  const conso = (o.consoVehicule!=null && o.consoVehicule!=='' && +o.consoVehicule>0)
    ? Math.max(0, +o.consoVehicule)
    : Math.max(0, +s.vehicleConso||0);
  const coutCarburant = money2(distAR * (conso/100) * prixL);
  const minutesAller = Math.max(0, +o.tempsLivraisonMin||0);
  const minutes = minutesAller*2;                   // aller-retour (comme la distance)
  const coutTemps = money2((minutes/60) * (+s.laborRate||0));
  const total = money2(coutCarburant + coutTemps);
  return {distAller, distAR, coutCarburant, coutTemps, minutesAller, minutes, conso, total, actif: (distAller>0||minutesAller>0)};
}
/* ============================================================
   MARGES — rentabilité réelle d'une vente
   Brute  = prix de vente − coût matières − coût emballages − consommables
   Nette  = brute − charges sociales (12,3% marchandise / 25,6% prestation)
   La fiscalité/frais annexes seront ajoutés plus tard (au choix de l'utilisateur).
   ============================================================ */
function computeOrderMargins(o, recipes, recipeItems, lots, materials){
  const s=getSettings();
  const lignes = orderToLines(o);
  // carte des coûts emballage réels par capacité (repli tarif paramétré si indispo)
  const realPkg = realPackagingCostMap(materials||window._allMatsCache||[], lots||[]);
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
    if(ln.type==='coffret'){ pieces=+ln.taille||0; coutEmb=money2(coutEmb+packagingCostReal(ln.taille, realPkg)); }
    else if(ln.type==='grand') pieces=(ln.items||[]).reduce((a,p)=>a+(+p.qte||0),0);
    else if(ln.type==='vrac') pieces=(ln.parfums||[]).reduce((a,p)=>a+(+p.qte||0),0);  // boîte réutilisable : pas de coût emballage
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

  // --- Coût de livraison : carburant (aller-retour) + temps (taux horaire) ---
  const liv = computeDeliveryCost(o);
  const margeNetteApresLiv = money2(margeNette - liv.total);
  const tauxNetApresLiv = caNet>0 ? Math.round(margeNetteApresLiv/caNet*1000)/10 : 0;
  // Suggestion de prix de livraison à facturer pour : (1) couvrir le coût ET
  // (2) préserver le taux de marge nette qu'avait la commande AVANT livraison.
  // On résout : (margeNette + supplément×(1−chargeMoy)) / (caNet + supplément) = tauxNet/100
  // soit le supplément qui maintient tauxNet une fois le coût livraison absorbé.
  let suggLivraison = 0;
  if(liv.actif){
    // taux de charges sociales moyen pondéré appliqué au supplément (marchandise par défaut)
    const partService = caNet>0 ? caServiceN/caNet : 0;
    const chargeMoy = (s.socialGoods/100)*(1-partService) + (s.socialService/100)*partService;
    const r = tauxNet/100; // cible : conserver le même taux net qu'avant livraison
    // supplément X tel que (margeNette − livTotal + X(1−chargeMoy)) = r·(caNet + X)
    const denom = (1 - chargeMoy - r);
    if(denom > 0.0001){
      suggLivraison = money2((r*caNet - (margeNette - liv.total)) / denom);
    } else {
      // repli : au minimum couvrir le coût net de charges
      suggLivraison = money2(liv.total / Math.max(0.0001, 1 - chargeMoy));
    }
    if(suggLivraison < liv.total) suggLivraison = liv.total; // jamais en dessous du coût réel
  }

  return {ca:caNet, caGoods:caGoodsN, caService:caServiceN,
    coutMat, coutEmb, margeBrute, tauxBrut,
    chargesSociales, margeNette, tauxNet,
    livraison: liv, margeNetteApresLiv, tauxNetApresLiv, suggLivraison};
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

// ===== VUE DÉDIÉE : STOCK PAR PARFUM (pastilles colorées, comme la boutique) =====
// Vue d'ensemble : chaque parfum avec sa pastille de couleur, son nom et la quantité
// de macarons finis vendables en stock. Tous les parfums du catalogue sont affichés,
// y compris ceux à 0 (vision complète, comme sur le site).
async function renderStockParfums(){
  const prods=(await db.productions.toArray()).filter(p=>round3(+p.qteRestante)>0 && prodVendable(p));
  const recipes=await db.recipes.toArray();
  const recName=rid=>(recipes.find(r=>r.id===rid)||{}).produitNom||'(parfum ?)';
  const byNom={};
  prods.forEach(p=>{
    const nom = p.libre ? (p.produitLibre||'(libre)') : recName(p.recipeId);
    (byNom[nom] ||= {nom, dispo:0, batches:0});
    byNom[nom].dispo = addQty(byNom[nom].dispo, p.qteRestante);
    byNom[nom].batches++;
  });
  const noms = [...FLAVORS];
  Object.keys(byNom).forEach(n=>{ if(!noms.includes(n)) noms.push(n); });
  const totalDispo = Object.values(byNom).reduce((s,b)=>addQty(s,b.dispo),0);
  const enStock = noms.filter(n=>byNom[n] && byNom[n].dispo>0).length;
  const cards = noms.map(nom=>{
    const b = byNom[nom]; const dispo = b?b.dispo:0; const col = flavorColor(nom);
    const vide = dispo<=0;
    return `<div class="flavor-stock${vide?' fs-empty':''}">
      <span class="fs-pastille" style="background:${col}"></span>
      <span class="fs-nom">${esc(nom)}</span>
      <span class="fs-qte">${vide?'<span class="fs-zero">0</span>':`<b>${qty(dispo)}</b>`}</span>
    </div>`;
  }).join('');
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Stock par parfum</h1>
     <p>${enStock} parfum(s) en stock · ${qty(totalDispo)} macaron(s) vendable(s)</p></div>
     <div class="flex"><button class="btn" onclick="goView('productions')">🍩 Productions →</button></div></div>
   <div class="panel">
     <p class="note" style="margin-bottom:12px">Vue d'ensemble des macarons finis <b>vendables</b> disponibles, par parfum. Les pastilles reprennent les couleurs de la boutique. Les parfums à 0 sont grisés.</p>
     <div class="flavor-stock-grid">${cards}</div>
   </div>`;
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
  if(!EMP_BY_KEY[destination]) throw new Error('Emplacement de rangement du retour obligatoire');
  await db.transaction('rw', db.productions, db.marketMoves, async()=>{
    const p=await db.productions.get(productionId);
    if(!p) throw new Error('Lot introuvable');
    // RÈGLE SÉCURITÉ ALIMENTAIRE : interdiction de recongeler après décongélation (congélo → frigo → congélo).
    if(isFreezer(destination) && aDejaDecongele(p)){
      throw new Error(`${parfum||'Ce lot'} est déjà décongelé : recongélation interdite. Choisissez le frigo.`);
    }
    const nowIso=new Date().toISOString();
    const hist=(p.histEmplacement||[]).concat([{lieu:destination, ts:nowIso, motif:'retour marché'}]);
    const nouveauLot=lotAvecEmplacement(p.lotProduction, destination);
    const patch={qteRestante: addQty(p.qteRestante, qte), emplacement:destination, emplacementMaj:nowIso, histEmplacement:hist, lotProduction:nouveauLot};
    if(isFreezer(destination)) patch.venuDuCongelateur=true;
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
// Prix € par macaron pour un format donné (depuis la grille dégressive).
// Repli : le prix du format le plus proche, sinon le prix unitaire de repli.
function prixParPiece(capacite, settings){
  const s=settings||getSettings();
  const grid=s.prixParFormat||{};
  if(grid[capacite]!=null) return +grid[capacite];
  const keys=Object.keys(grid).map(Number).filter(n=>n>0).sort((a,b)=>a-b);
  if(!keys.length) return +s.prixVenteUnitaire||0;
  // format le plus proche
  let best=keys[0]; keys.forEach(k=>{ if(Math.abs(k-capacite)<Math.abs(best-capacite)) best=k; });
  return +grid[best];
}
// Reconstitue, à partir du COMPTAGE D'EMBALLAGES d'un marché (avant−après par type),
// le nombre de coffrets vendus par format, le CA théorique par format et le total.
// Nécessite que les types d'emballage portent une capacité (nb macarons).
function marketFormatBreakdown(market, settings){
  const s=settings||getSettings();
  const pk=(market && market.packaging) || [];
  const formats=[]; let caTheo=0, piecesFormats=0, coffrets=0;
  pk.forEach(p=>{
    const cap=+p.capacite||0;
    const n=Math.max(0, round3((+p.before||0)-(+p.after||0))); // coffrets vendus de ce type
    if(n<=0) return;
    const pu=cap>0?prixParPiece(cap, s):0;
    const pieces=cap*n;
    const ca=money2(pieces*pu);
    formats.push({nom:p.nom, capacite:cap, coffrets:n, prixPiece:pu, pieces:round3(pieces), ca});
    if(cap>0){ caTheo=money2(caTheo+ca); piecesFormats=round3(piecesFormats+pieces); coffrets+=n; }
  });
  const prixMoyen = piecesFormats>0 ? money2(caTheo/piecesFormats) : null;
  return {formats, caTheo, piecesFormats:round3(piecesFormats), coffrets, prixMoyen, hasData:formats.some(f=>f.capacite>0)};
}
// PRIX DE VENTE MOYEN PONDÉRÉ, calculé sur les ventes RÉELLES :
//  - commandes en ligne : chaque coffret → taille × prix du format
//  - marchés clos : comptage d'emballages → coffrets par format × prix du format
// Repli : moyenne simple de la grille. Renvoie {prix, pieces, source}.
function computeAvgSellPrice(data){
  const {orders, markets, settings}=data;
  const s=settings||getSettings();
  let caP=0, pieces=0;
  // commandes (coffrets uniquement : on connaît la taille et donc le prix du format)
  (orders||[]).forEach(o=>{
    orderToLines(o).forEach(ln=>{
      if(ln.type!=='coffret') return;
      const cap=+ln.taille||0; if(cap<=0) return;
      const pu=prixParPiece(cap, s);
      caP=money2(caP+cap*pu); pieces=round3(pieces+cap);
    });
  });
  // marchés clos avec comptage d'emballages renseigné
  (markets||[]).filter(mk=>mk.statut==='clos').forEach(mk=>{
    const b=marketFormatBreakdown(mk, s);
    if(b.hasData){ caP=money2(caP+b.caTheo); pieces=round3(pieces+b.piecesFormats); }
  });
  if(pieces>0) return {prix:money2(caP/pieces), pieces:round3(pieces), source:'ventes'};
  // repli : moyenne simple de la grille
  const vals=Object.values(s.prixParFormat||{}).map(Number).filter(x=>x>0);
  const moy=vals.length?money2(vals.reduce((a,b)=>a+b,0)/vals.length):(+s.prixVenteUnitaire||0);
  return {prix:moy, pieces:0, source:'grille'};
}
// CA net d'un marché = encaissements − fond de caisse (espèces), jamais négatif.
// Centralise la déduction pour cohérence dashboard / compta / détail.
function marketNetCA(mk){
  const ca=(mk&&mk.ca)||{};
  const fond=money2(+(mk&&mk.fondCaisse)||0);
  const esp=money2(Math.max(0,(+ca.especes||0)-fond));
  return addMoney(esp, money2(ca.cb||0), money2(ca.autre||0));
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
  // Fond de caisse : la caisse comptée en espèces inclut le fond de départ.
  // On le déduit pour obtenir les espèces réellement encaissées (jamais négatif).
  const fondCaisse=money2(+market.fondCaisse||0);
  const caEspecesBrut=money2(ca.especes||0);
  const caEspeces=money2(Math.max(0, caEspecesBrut - fondCaisse));
  const caCB=money2(ca.cb||0), caAutre=money2(ca.autre||0);
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
  // Charges propres au marché : prix du stand + déplacement (carburant A/R + temps de route).
  const coutStand = money2(+market.coutStand||0);
  const deplacement = computeDeliveryCost({distanceKm:+market.distanceKm||0, prixCarburant:+market.prixCarburant||0, tempsLivraisonMin:+market.tempsRouteMin||0, consoVehicule:market.consoVehicule!=null?market.consoVehicule:null});
  const coutMarche = money2(coutStand + deplacement.total);   // total des frais spécifiques au marché
  const margeBrute = money2(caTotal - coutMat - coutEmb - coutMarche);
  const tauxBrut = caTotal>0?Math.round(margeBrute/caTotal*1000)/10:0;
  // marché = vente de marchandise → charges sociales "goods"
  const chargesSociales = money2(caTotal*s.socialGoods/100);
  const margeNette = money2(margeBrute - chargesSociales);
  const tauxNet = caTotal>0?Math.round(margeNette/caTotal*1000)/10:0;
  return {lines, embarque:round3(embarque), retour:round3(retour), don:round3(don), perte:round3(perte), vendu:round3(vendu),
    caEspeces, caCB, caAutre, caTotal, fondCaisse, caEspecesBrut,
    pctCB: caTotal>0?Math.round(caCB/caTotal*100):0, pctEspeces: caTotal>0?Math.round(caEspeces/caTotal*100):0,
    tauxInvendus, tauxPerte,
    caParHeure: (market.heures>0)?money2(caTotal/market.heures):0,
    coutMat, coutEmb, coutStand, deplacement, coutMarche, pkgUsed:pkg.used, margeBrute, tauxBrut, chargesSociales, margeNette, tauxNet};
}
// Coût matière moyen par macaron (helper réutilisable, nécessite recipes+items+lots).
function avgMacaronCost(recipes, recipeItems, lots){
  const per = recipes.map(r=>{ const cb=coutRecette(r.id, recipeItems, lots); return r.rendement>0?cb/r.rendement:0; }).filter(x=>x>0);
  return per.length ? per.reduce((a,x)=>a+x,0)/per.length : 0;
}

/* ============================================================
   MODULE : ANALYSE DE RENTABILITÉ & COÛTS DE REVIENT PAR PARFUM
   ------------------------------------------------------------
   Un « parfum » correspond à une recette (recipe.produitNom).
   Tous les calculs sont DYNAMIQUES : ils repartent des prix d'achat
   courants des lots, des recettes (BOM), des ventes (commandes + marchés)
   et des paramètres (pertes, main-d'œuvre, consommables, charges sociales).
   Aucune saisie manuelle répétée : on recalcule à chaque ouverture de l'écran.
   ============================================================ */

// Heuristique : un ingrédient appartient-il à la COQUE (sinon garniture/ganache) ?
// Sert à ventiler le coût coque vs garniture, à titre indicatif.
function _isCoqueMaterial(nom){
  const n = aiNormalize(nom);
  return /(poudre.*amande|amande.*poudre|sucre glace|blanc.*oeuf|oeuf.*blanc|colorant|sucre semoule|sucre en poudre|tant pour tant|meringue)/.test(n);
}

// Coût de revient COMPLET d'une recette/parfum (par batch ET par pièce).
// Intègre : matières (prix courant), pertes (rendement utile), consommables/pièce,
// et main-d'œuvre si activée. Renvoie aussi la ventilation coque/garniture.
function coutRevientRecette(recipe, recipeItems, lots, settings){
  const s = settings || getSettings();
  const items = recipeItems.filter(it=>it.recipeId===recipe.id);
  let coutMatBatch=0, coutCoqueBatch=0, coutGarnitureBatch=0;
  const detail = items.map(it=>{
    const pu = prixCourant(it.materialId, lots);
    const c = (+it.qteParBatch||0) * pu;
    coutMatBatch += c;
    return {materialId:it.materialId, qteParBatch:+it.qteParBatch||0, pu, cout:c};
  });
  // ventilation coque / garniture (indicative)
  // nécessite les noms de matières — on les retrouvera côté appelant ; ici on garde detail brut.
  const rendement = +recipe.rendement||1;
  const pertePct = Math.max(0, Math.min(90, +recipe.pertePct||0));
  const piecesUtiles = rendement * (1 - pertePct/100);   // pièces réellement vendables
  // coût matière par pièce VENDABLE (les pertes renchérissent le coût unitaire)
  const coutMatUnit = piecesUtiles>0 ? coutMatBatch/piecesUtiles : 0;
  // consommables (par pièce, direct)
  const coutConsoUnit = Math.max(0, +recipe.coutConsoUnit||0);
  // main-d'œuvre (par pièce) — uniquement si activée
  const minParBatch = Math.max(0, +recipe.minParBatch||0);
  const coutMODBatch = s.laborEnabled ? (minParBatch/60)*(+s.laborRate||0) : 0;
  const coutMODUnit  = (s.laborEnabled && piecesUtiles>0) ? coutMODBatch/piecesUtiles : 0;
  // coût de revient unitaire complet
  const coutRevientUnit = money2(coutMatUnit + coutConsoUnit + coutMODUnit);
  return {
    recipeId: recipe.id, nom: recipe.produitNom, rendement, pertePct, piecesUtiles: round3(piecesUtiles),
    coutMatBatch: money2(coutMatBatch),
    coutMatUnit: money2(coutMatUnit),
    coutConsoUnit: money2(coutConsoUnit),
    coutMODUnit: money2(coutMODUnit), coutMODBatch: money2(coutMODBatch),
    coutRevientUnit,
    coutRevientBatch: money2(coutRevientUnit*piecesUtiles),
    laborOn: !!s.laborEnabled,
    detail
  };
}

// Coût coque/garniture par pièce (ventilation indicative) — nécessite la table matières.
function ventilationCoqueGarniture(coutObj, mats){
  let coque=0, garn=0;
  coutObj.detail.forEach(d=>{
    const mat = mats.find(m=>m.id===d.materialId);
    const nom = mat?mat.nom:'';
    if(_isCoqueMaterial(nom)) coque += d.cout; else garn += d.cout;
  });
  const pu = coutObj.piecesUtiles>0 ? coutObj.piecesUtiles : (coutObj.rendement||1);
  return { coqueUnit: money2(coque/pu), garnitureUnit: money2(garn/pu),
           coqueBatch: money2(coque), garnitureBatch: money2(garn) };
}

// Échelle de rentabilité par TAUX DE MARGE (vert / orange / rouge).
// On la base sur le taux de marge brute par pièce (vente − coût de revient).
function flavorScale(tauxMarge){
  if(tauxMarge==null) return {label:'—', col:'#9a8a82', rank:0, dot:'⚪'};
  if(tauxMarge>=55) return {label:'Très rentable', col:'#2e7d32', rank:5, dot:'🟢'};
  if(tauxMarge>=40) return {label:'Rentable', col:'#3f7d52', rank:4, dot:'🟢'};
  if(tauxMarge>=25) return {label:'Rentabilité moyenne', col:'#caa23b', rank:3, dot:'🟠'};
  if(tauxMarge>=10) return {label:'Faible', col:'#d98324', rank:2, dot:'🟠'};
  if(tauxMarge>=0)  return {label:'Très faible', col:'#d4671f', rank:1, dot:'🔴'};
  return {label:'À perte', col:'#b3261e', rank:0, dot:'🔴'};
}

// VENTES PAR PARFUM à partir des commandes ET des marchés.
// BASE DE CALCUL = CA ENCAISSÉ (réel). Le prix moyen pondéré ne sert qu'à un CA
// « théorique » parallèle, pour détecter les incohérences (encaissé vs attendu).
// - Commandes : CA encaissé du coffret ventilé sur ses pièces (CA/pièce × qté du parfum).
// - Marchés : vendu par parfum = sortie − retour − don − perte ; le CA ENCAISSÉ du marché
//   (espèces + CB + autre) est ventilé entre parfums au prorata des pièces vendues.
//   (Tous les parfums partageant le même prix au sein d'un format, le prorata pièces est exact.)
// caVentes = encaissé ; caTheo = Σ pièces × prix moyen pondéré (pour l'alerte d'écart).
function buildFlavorSales(orders, markets, marketMoves, recipes, productions, settings){
  const s = settings || getSettings();
  const prixMoyen = (computeAvgSellPrice({orders, markets, settings:s}).prix)||0;
  const recByNorm = {};
  recipes.forEach(r=>{ recByNorm[aiNormalize(r.produitNom)] = r; });
  const matchRecipe = nom=>{
    const k=aiNormalize(nom);
    if(recByNorm[k]) return recByNorm[k];
    const hit = recipes.find(r=>{ const rn=aiNormalize(r.produitNom); return rn && (rn.startsWith(k.slice(0,5)) || k.startsWith(rn.slice(0,5))); });
    return hit||null;
  };
  // pour retrouver le parfum d'un mouvement marché sans champ "parfum" (sortie par lot)
  const recName = rid=>(recipes.find(r=>r.id===rid)||{}).produitNom||'';
  const prodById = {}; (productions||[]).forEach(p=>{ prodById[p.id]=p; });
  const moveParfum = m=>{
    if(m.parfum) return m.parfum;
    if(m.productionId!=null && prodById[m.productionId]) return recName(prodById[m.productionId].recipeId)||'(parfum ?)';
    return '(parfum ?)';
  };
  const acc = {}; // nom -> {nom, recipeId, piecesVendues, piecesDon, caVentes(=encaissé), caTheo, cmdPieces, mkPieces, mkCA, cmdCA}
  const ensure = nom=>{ const k=nom||'(parfum ?)'; return (acc[k] ||= {nom:k, recipeId:null, piecesVendues:0, piecesDon:0, caVentes:0, caTheo:0, cmdPieces:0, mkPieces:0, mkCA:0, cmdCA:0}); };

  // ---- COMMANDES (CA encaissé réel du coffret) ----
  (orders||[]).forEach(o=>{
    const lignes = orderToLines(o);
    const gpct = Math.max(0,Math.min(100,+o.remiseGlobale||0));
    const factor = gpct>0 ? (1-gpct/100) : 1;
    lignes.forEach(ln=>{
      if(ln.type!=='coffret' && ln.type!=='don' && ln.type!=='evenement') return;
      const parfums = (ln.parfums||[]).filter(p=>+p.qte>0);
      const totPieces = parfums.reduce((s2,p)=>s2+(+p.qte||0),0);
      if(totPieces<=0) return;
      if(ln.type==='don'){
        parfums.forEach(p=>{ const a=ensure(p.nom); a.piecesDon+=+p.qte; a.cmdPieces+=+p.qte; if(!a.recipeId){const r=matchRecipe(p.nom); if(r)a.recipeId=r.id;} });
        return;
      }
      const net = money2(lineTotalStored(ln)*factor);   // CA encaissé du coffret
      const caParPiece = totPieces>0 ? net/totPieces : 0;
      parfums.forEach(p=>{
        const a=ensure(p.nom);
        a.piecesVendues += +p.qte; a.cmdPieces += +p.qte;
        const c = money2(caParPiece*(+p.qte));
        a.caVentes = money2(a.caVentes + c); a.cmdCA = money2(a.cmdCA + c);
        a.caTheo = money2(a.caTheo + prixMoyen*(+p.qte));
        if(!a.recipeId){const r=matchRecipe(p.nom); if(r)a.recipeId=r.id;}
      });
    });
  });

  // ---- MARCHÉS (CA ENCAISSÉ ventilé par pièces vendues) ----
  const movesByMk = {}; (marketMoves||[]).forEach(mv=>{ (movesByMk[mv.marketId] ||= []).push(mv); });
  (markets||[]).filter(mk=>mk.statut==='clos').forEach(mk=>{
    const mv = movesByMk[mk.id]||[];
    const byParfum={};
    mv.forEach(m=>{
      const nom = moveParfum(m);
      const b=(byParfum[nom] ||= {sortie:0,retour:0,don:0,perte:0});
      if(m.type==='sortie') b.sortie+=+m.qte||0;
      else if(m.type==='retour') b.retour+=+m.qte||0;
      else if(m.type==='don') b.don+=+m.qte||0;
      else if(m.type==='perte') b.perte+=+m.qte||0;
    });
    // total vendu (toutes saveurs) pour ventiler le CA ENCAISSÉ du marché
    const venduByParfum={}; let totVendu=0;
    Object.keys(byParfum).forEach(nom=>{ const b=byParfum[nom]; const v=Math.max(0,b.sortie-b.retour-b.don-b.perte); venduByParfum[nom]=v; totVendu+=v; });
    const ca=mk.ca||{}; const caEncaisse=marketNetCA(mk);
    const caParPiece = totVendu>0 ? caEncaisse/totVendu : 0;
    Object.keys(venduByParfum).forEach(nom=>{
      const v=venduByParfum[nom]; if(v<=0) return;
      const a=ensure(nom);
      a.piecesVendues += v; a.mkPieces += v;
      const c = money2(caParPiece*v);          // part du CA ENCAISSÉ
      a.caVentes = money2(a.caVentes + c); a.mkCA = money2(a.mkCA + c);
      a.caTheo = money2(a.caTheo + prixMoyen*v);
      if(!a.recipeId){const r=matchRecipe(nom); if(r)a.recipeId=r.id;}
    });
  });

  return Object.values(acc);
}

// SYNTHÈSE COMPLÈTE par parfum : coût de revient + ventes + marges + classement + stock immobilisé.
// Renvoie {rows:[...], unmatched:[...], totals:{...}, recIndex:{}}
function analyzeFlavorProfitability(data){
  const {recipes, recipeItems, lots, mats, orders, markets, marketMoves, productions, settings} = data;
  const s = settings || getSettings();
  // 1) coût de revient par recette
  const costByRecipe = {};
  recipes.forEach(r=>{ costByRecipe[r.id] = coutRevientRecette(r, recipeItems, lots, s); });
  // 2) ventes par parfum
  const sales = buildFlavorSales(orders, markets, marketMoves, recipes, productions, s);
  const salesByRecipe = {}; const unmatched=[];
  sales.forEach(sa=>{
    if(sa.recipeId){ (salesByRecipe[sa.recipeId] ||= []).push(sa); }
    else if(sa.piecesVendues>0 || sa.piecesDon>0){ unmatched.push(sa); }
  });
  // 3) stock fini (immobilisation) par recette
  const stockByRecipe={};
  (productions||[]).forEach(p=>{ const q=round3(+p.qteRestante||0); if(q>0){ stockByRecipe[p.recipeId]=round3((stockByRecipe[p.recipeId]||0)+q); } });

  // 4) lignes consolidées par recette/parfum
  const rows = recipes.map(r=>{
    const c = costByRecipe[r.id];
    const saList = salesByRecipe[r.id]||[];
    const piecesVendues = round3(saList.reduce((x,a)=>x+a.piecesVendues,0));
    const piecesDon = round3(saList.reduce((x,a)=>x+a.piecesDon,0));
    const ca = money2(saList.reduce((x,a)=>x+a.caVentes,0));            // CA ENCAISSÉ (base de calcul)
    const caTheo = money2(saList.reduce((x,a)=>x+(a.caTheo||0),0));     // CA attendu (pièces × prix moyen)
    const ecartTheo = money2(ca - caTheo);                              // écart encaissé − attendu
    const prixVenteMoyen = piecesVendues>0 ? money2(ca/piecesVendues) : null;
    // coûts rattachés aux pièces vendues
    const coutVentes = money2(piecesVendues * c.coutRevientUnit);
    const margeBrute = money2(ca - coutVentes);
    const margeUnit = (prixVenteMoyen!=null) ? money2(prixVenteMoyen - c.coutRevientUnit) : null;
    const tauxMarge = (prixVenteMoyen!=null && prixVenteMoyen>0) ? Math.round(margeUnit/prixVenteMoyen*1000)/10 : null;
    // charges sociales (marchandise) sur le CA → marge nette estimée
    const chargesSoc = money2(ca * s.socialGoods/100);
    const margeNette = money2(margeBrute - chargesSoc);
    const tauxNet = ca>0 ? Math.round(margeNette/ca*1000)/10 : null;
    const stock = round3(stockByRecipe[r.id]||0);
    const valStockCout = money2(stock * c.coutRevientUnit);
    const scale = flavorScale(tauxMarge);
    return {
      recipeId:r.id, nom:r.produitNom, cost:c,
      piecesVendues, piecesDon, ca, caTheo, ecartTheo, prixVenteMoyen, coutVentes,
      margeBrute, margeUnit, tauxMarge, chargesSoc, margeNette, tauxNet,
      stock, valStockCout, scale
    };
  });

  // 5) totaux
  const totals = {
    ca: money2(rows.reduce((s2,r)=>s2+r.ca,0)),
    caTheo: money2(rows.reduce((s2,r)=>s2+r.caTheo,0)),
    pieces: round3(rows.reduce((s2,r)=>s2+r.piecesVendues,0)),
    margeBrute: money2(rows.reduce((s2,r)=>s2+r.margeBrute,0)),
    margeNette: money2(rows.reduce((s2,r)=>s2+r.margeNette,0)),
    valStock: money2(rows.reduce((s2,r)=>s2+r.valStockCout,0))
  };
  totals.ecartTheo = money2(totals.ca - totals.caTheo);
  totals.tauxMargeGlobal = totals.ca>0 ? Math.round(totals.margeBrute/totals.ca*1000)/10 : null;

  return {rows, unmatched, totals, costByRecipe};
}

// MOTEUR DE RECOMMANDATIONS : règles déterministes sur la synthèse.
// Détecte : best-sellers profit, forte demande/faible marge, faible demande/forte marge,
// stock immobilisé peu rentable, alertes hausse de coût matière, suggestions mise en avant.
function flavorRecommendations(analysis, data){
  const {rows, totals} = analysis;
  const sold = rows.filter(r=>r.piecesVendues>0);
  const recs=[];
  if(!sold.length){ return [{icon:'ℹ️', col:'#9a8a82', txt:'Pas encore de ventes par parfum. Enregistrez des commandes (coffrets) et clôturez des marchés pour activer les recommandations.'}]; }

  // médianes pour qualifier "forte/faible" demande et marge
  const piecesArr = sold.map(r=>r.piecesVendues).sort((a,b)=>a-b);
  const margeArr = sold.filter(r=>r.tauxMarge!=null).map(r=>r.tauxMarge).sort((a,b)=>a-b);
  const med = arr => arr.length? (arr.length%2? arr[(arr.length-1)/2] : (arr[arr.length/2-1]+arr[arr.length/2])/2) : 0;
  const medPieces = med(piecesArr), medMarge = med(margeArr);

  // 1) parfums les plus profitables (marge brute €)
  const topProfit = [...sold].sort((a,b)=>b.margeBrute-a.margeBrute).slice(0,3);
  if(topProfit.length){
    recs.push({icon:'🏆', col:'#2e7d32',
      txt:`Plus gros contributeurs au bénéfice : ${topProfit.map(r=>`${r.nom} (${euro(r.margeBrute)})`).join(', ')}. Sécurisez leur appro et mettez-les systématiquement en avant.`});
  }
  // 2) forte demande mais faible marge → lever le prix ou réduire le coût
  const volFaibleMarge = sold.filter(r=>r.piecesVendues>=medPieces && r.tauxMarge!=null && r.tauxMarge<25)
    .sort((a,b)=>a.tauxMarge-b.tauxMarge);
  volFaibleMarge.slice(0,3).forEach(r=>{
    const cible = r.cost.coutRevientUnit>0 ? money2(r.cost.coutRevientUnit/(1-0.40)) : null; // prix pour 40% de marge
    recs.push({icon:'⚠️', col:'#d98324',
      txt:`${r.nom} : forte demande (${qty(r.piecesVendues)} vendus) mais marge faible (${r.tauxMarge}%). ${cible?`Visez ~${euro(cible)}/pièce pour 40% de marge, ou réduisez le coût de revient (${euro(r.cost.coutRevientUnit)}).`:'Revoyez le prix ou le coût.'}`});
  });
  // 3) faible demande mais très rentable → pousser à la vente
  const nicheRentable = sold.filter(r=>r.piecesVendues<medPieces && r.tauxMarge!=null && r.tauxMarge>=40)
    .sort((a,b)=>b.tauxMarge-a.tauxMarge);
  nicheRentable.slice(0,3).forEach(r=>{
    recs.push({icon:'💎', col:'#3f7d52',
      txt:`${r.nom} : très rentable (${r.tauxMarge}%) mais peu vendu (${qty(r.piecesVendues)}). Donnez-lui plus de visibilité (vitrine, suggestion, dégustation) — chaque vente rapporte ${r.margeUnit!=null?euro(r.margeUnit):'bien'}.`});
  });
  // 4) à perte
  const perte = sold.filter(r=>r.tauxMarge!=null && r.tauxMarge<0);
  perte.forEach(r=>{
    recs.push({icon:'🛑', col:'#b3261e',
      txt:`${r.nom} se vend À PERTE (prix moyen ${r.prixVenteMoyen!=null?euro(r.prixVenteMoyen):'?'} < coût ${euro(r.cost.coutRevientUnit)}). Augmentez le prix ou retirez-le de l'offre.`});
  });
  // 5) stock immobilisé peu rentable
  const stockMort = analysis.rows.filter(r=>r.stock>0 && (r.piecesVendues===0 || (r.tauxMarge!=null && r.tauxMarge<15)))
    .sort((a,b)=>b.valStockCout-a.valStockCout);
  stockMort.slice(0,3).forEach(r=>{
    recs.push({icon:'📦', col:'#d4671f',
      txt:`${r.nom} immobilise ${qty(r.stock)} pièce(s) (${euro(r.valStockCout)} de coût) pour une rentabilité ${r.piecesVendues===0?'sans historique de vente':'faible ('+r.tauxMarge+'%)'}. Écoulez-le (marché, promo) avant la DLC.`});
  });
  // 6) mise en avant marché / forte affluence = top marge brute par pièce parmi les bons vendeurs
  const pourMarche = [...sold].filter(r=>r.margeUnit!=null).sort((a,b)=>(b.margeUnit*Math.log(1+b.piecesVendues))-(a.margeUnit*Math.log(1+a.piecesVendues))).slice(0,4);
  if(pourMarche.length){
    recs.push({icon:'⛺', col:'#AA7C39',
      txt:`Mix conseillé en marché / forte affluence (volume × marge) : ${pourMarche.map(r=>r.nom).join(', ')}.`});
  }
  // 7) priorité de production selon rentabilité historique
  const prioProd = [...sold].filter(r=>r.tauxMarge!=null).sort((a,b)=>(b.margeBrute)-(a.margeBrute)).slice(0,5);
  if(prioProd.length){
    recs.push({icon:'⚙️', col:'#52252F',
      txt:`Priorité de production (bénéfice historique) : ${prioProd.map((r,i)=>`${i+1}. ${r.nom}`).join('  ')}.`});
  }
  // 8) INCOHÉRENCE CA : encaissé vs attendu (pièces × prix moyen). Pertinent une fois
  //    les retours/pertes saisis. Un écart négatif marqué = encaissé < attendu
  //    (pertes non comptées, remises, vol, erreur de caisse) ; positif = ventes au-dessus du tarif.
  const ec = totals.ecartTheo, theo = totals.caTheo;
  if(theo>0 && Math.abs(ec) >= Math.max(5, theo*0.05)){
    if(ec<0) recs.push({icon:'🔎', col:'#b3261e',
      txt:`Incohérence de CA : encaissé ${euro(totals.ca)} vs attendu ${euro(theo)} (écart ${euro(ec)}). L'encaissé est inférieur à ce que les ventes auraient dû rapporter — vérifiez les pertes/dons non saisis, les remises accordées, ou une erreur de caisse.`});
    else recs.push({icon:'🔎', col:'#d98324',
      txt:`Écart de CA favorable : encaissé ${euro(totals.ca)} vs attendu ${euro(theo)} (+${euro(ec)}). Ventes au-dessus du tarif moyen (formats plus chers, ventes à l'unité) — ou un prix de grille à réajuster.`});
  }
  return recs;
}

// ALERTES HAUSSE DE COÛT : pour chaque matière dont le prix a augmenté,
// estime l'impact sur la marge des parfums qui l'utilisent.
function flavorCostHikeAlerts(data, analysis){
  const {recipes, recipeItems, lots, mats} = data;
  const alerts=[];
  mats.forEach(mat=>{
    const ls = lots.filter(l=>l.materialId===mat.id && lotPU(l)>0)
                   .sort((a,b)=>(a.dateReception||'').localeCompare(b.dateReception||''));
    if(ls.length<2) return;
    const first=lotPU(ls[0]), last=lotPU(ls[ls.length-1]);
    if(first<=0) return;
    const varPct=(last-first)/first*100;
    if(varPct<8) return; // seuil d'alerte : +8%
    // recettes impactées
    const impacted = recipeItems.filter(it=>it.materialId===mat.id).map(it=>it.recipeId);
    const noms = recipes.filter(r=>impacted.includes(r.id)).map(r=>r.produitNom);
    if(!noms.length) return;
    alerts.push({mat:mat.nom, varPct:Math.round(varPct*10)/10, parfums:noms,
      delta:money2((last-first))});
  });
  return alerts.sort((a,b)=>b.varPct-a.varPct);
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
  let sumCoutMat=0, sumCoutEmb=0, sumCharges=0;   // composantes pour le détail explicatif
  const paid = orders.filter(o=>o.paiement==='Payé');
  paid.forEach(o=>{ const m=computeOrderMargins(o,recipes,recipeItems,lots);
    margeBrute=money2(margeBrute+m.margeBrute); margeNette=money2(margeNette+m.margeNette); caPaye=money2(caPaye+m.ca);
    sumCoutMat=money2(sumCoutMat+m.coutMat); sumCoutEmb=money2(sumCoutEmb+m.coutEmb); sumCharges=money2(sumCharges+m.chargesSociales); });
  const tauxBrut = caPaye>0?Math.round(margeBrute/caPaye*1000)/10:0;
  const tauxNet = caPaye>0?Math.round(margeNette/caPaye*1000)/10:0;

  // Panier moyen + nb commandes + clients actifs (90 j)
  const nbCmd = paid.length;
  const panier = nbCmd>0 ? money2(caPaye/nbCmd) : 0;
  const since=new Date(now-90*86400000).toISOString().slice(0,10);
  const activeIds = new Set(paid.filter(o=>o.date&&o.date>=since && o.clientId).map(o=>o.clientId));
  const activeClients = activeIds.size;
  const totalClients = clients.length;

  // Détail du panier moyen : chaque commande payée avec son montant (CA marge) et son écart à la moyenne.
  const clName = id => (clients.find(c=>c.id===id)||{}).nom || '—';
  const panierDetail = paid.map(o=>{
    const m=computeOrderMargins(o,recipes,recipeItems,lots);
    return {id:o.id, date:o.date||'', client:clName(o.clientId), montant:m.ca,
            ecart: money2(m.ca-panier), dessus: m.ca>=panier};
  }).sort((a,b)=>b.montant-a.montant);

  // Liste des clients actifs (90 j) avec leur nb de commandes et CA encaissé sur la période.
  const activeList = [...activeIds].map(id=>{
    const cmds = paid.filter(o=>o.clientId===id && o.date && o.date>=since);
    const ca = money2(cmds.reduce((s,o)=>s+((+o.montant)||0),0));
    return {id, nom:clName(id), n:cmds.length, ca};
  }).sort((a,b)=>b.ca-a.ca);

  return {
    caMonth, caPrevMonth, evoMonth, caYear, caPrevYear, evoYear,
    margeBrute, margeNette, tauxBrut, tauxNet,
    coutMat:sumCoutMat, coutEmb:sumCoutEmb, chargesSociales:sumCharges, caPaye,
    panier, nbCmd, activeClients, totalClients,
    panierDetail, activeList,
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
      if(ln.type==='histo') return;   // ligne de reprise : sert aux tendances parfums, pas au mix produit
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
      } else if(ln.type==='histo'){
        // Commande historique (reprise) : on alimente UNIQUEMENT les parfums et le
        // nombre de macarons (pour les tendances), sans créer de faux produit/coffret.
        (ln.parfums||[]).forEach(p=>{ if(p.qte>0){ addP(global.parfums,p.nom,p.qte); addP(C.parfums,p.nom,p.qte);
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
  // Bilan financier mensuel : réutilise le moteur comptable (CA encaissé, charges, résultat)
  // pour éviter toute logique parallèle — la compta reste la source de vérité.
  let bilan=[]; try{ const A=await computeAccounting(); bilan=(A.serie||[]).slice().sort((a,b)=>(b.mois||'').localeCompare(a.mois||'')); }catch(e){}
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
   <div class="panel"><h2>📊 Bilan financier mensuel <span style="font-weight:400;font-size:.8rem;color:#9a8a82">— CA encaissé − charges</span></h2>
     ${bilan.length ? bilan.map(b=>{
       const benef=b.resultat;
       const col = benef>=0 ? 'var(--green,#3f7d52)' : 'var(--red,#b04a3e)';
       return `<div class="bilan-mois">
         <div class="bilan-head"><b>${monthLabel(b.mois)}</b>
           <span style="color:${col};font-weight:700">${euro(benef)}</span></div>
         <div class="bilan-row"><span>📈 CA encaissé</span><b style="color:var(--caramel)">${euro(b.ca)}</b></div>
         <div class="bilan-row"><span>📉 Charges${b.coutMatieres?` + coût matières`:''}</span><b>−${euro(money2(b.charges+b.coutMatieres))}</b></div>
         <div class="bilan-row bilan-net"><span>💰 Bénéfice net</span><b style="color:${col}">${euro(benef)}</b></div>
       </div>`;
     }).join('') : '<p class="note">Pas encore de données mensuelles. Le bilan apparaît dès que des commandes sont encaissées ou des charges saisies.</p>'}
     <button class="btn ghost sm" style="margin-top:8px" onclick="goView('compta')">Détail comptable →</button></div>
   <div class="panel"><h2>Chiffre d'affaires mensuel</h2>${caChart}</div>
   <div class="panel"><h2>Macarons écoulés par mois</h2>${macChart||'<p class="note">—</p>'}</div>`;
}

/* ============================================================
   COMPTABILITÉ — écran de pilotage (CA encaissé, charges, marges)
   ============================================================ */
// Catégories de CHARGES : dépenses hors stock uniquement.
// Les matières premières et emballages se saisissent en LOTS (pas ici), pour éviter
// tout double comptage — ils alimentent déjà le coût de revient via les lots.
const CHARGE_CATS = ['Assurance professionnelle','Hébergement / site web','Abonnements / logiciels','Équipement','Loyer','Énergie','Transport / déplacement','Stand / marché','Marketing','Frais bancaires','Cotisations / impôts','Formation','Autre'];
let _comptaMonth = null;
function comptaSetMonth(m){ _comptaMonth = m; renderCompta(); }
// Raccourci de navigation depuis l'écran Comptabilité vers un autre écran.
// Centralise le pattern view=… + setActiveView + render…() pour les chiffres cliquables.
function comptaGo(dest){
  if(dest==='commandes'){ view='commandes'; if(typeof setActiveView==='function') setActiveView('commandes'); renderCmd(); }
  else if(dest==='charges'){ renderChargesList(); }
  else if(dest==='rentabilite'){ view='rentabilite'; if(typeof setActiveView==='function') setActiveView('rentabilite'); renderProfit(); }
  else if(dest==='detailMois'){
    // reste sur la page Comptabilité : défile jusqu'au tableau « Détail mensuel »
    const el=[...document.querySelectorAll('#main .panel h2')].find(h=>/Détail mensuel/.test(h.textContent));
    if(el){ el.scrollIntoView({behavior:'smooth', block:'start'}); el.closest('.panel').style.transition='box-shadow .3s';
      const p=el.closest('.panel'); p.style.boxShadow='0 0 0 2px var(--caramel)'; setTimeout(()=>p.style.boxShadow='',1200); }
  }
}
// Petit chevron « › » signalant un raccourci (à insérer dans une .sum-box / .kpi cliquable).
const NAV_GO = '<span class="nav-go" aria-hidden="true">›</span>';
// Petit marqueur « ⓘ » signalant qu'un détail explicatif s'ouvre en popup (pas un changement d'écran).
const INFO_I = '<span class="info-i" aria-hidden="true">ⓘ</span>';
async function renderCompta(){
 try {
  const A = await computeAccounting();
  const fmtPct = (n,d)=> d>0 ? Math.round(n/d*100) : 0;
  // mois disponibles (depuis la série) + mois courant
  const moisDispo = [...new Set([...(A.serie||[]).map(s=>s.mois), monthKey(today())])].filter(Boolean).sort().reverse();
  if(!_comptaMonth || !moisDispo.includes(_comptaMonth)) _comptaMonth = moisDispo[0] || monthKey(today());
  const B = await computeMonthlyBilan(_comptaMonth);
  // cumul de l'année en cours (cotisations URSSAF year-to-date)
  const yearOf = (_comptaMonth||'').slice(0,4);
  let ytdGoods=0, ytdService=0, ytdCotis=0;
  for(const m of moisDispo.filter(x=>x.slice(0,4)===yearOf)){
    const bm = (m===_comptaMonth) ? B : await computeMonthlyBilan(m);
    ytdGoods+=bm.goods; ytdService+=bm.service; ytdCotis+=bm.cotisTotal;
  }
  ytdGoods=money2(ytdGoods); ytdService=money2(ytdService); ytdCotis=money2(ytdCotis);
  const moisOpts = moisDispo.map(m=>`<option value="${m}" ${m===_comptaMonth?'selected':''}>${esc(monthLabel(m))}</option>`).join('');

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
    .map(([m,v])=>`<div class="sum-box lnk" onclick="comptaGo('commandes')"><span>${esc(m)}</span><b>${euro(v)} <span style="color:#9a8a82;font-weight:400">(${fmtPct(v,A.totalEncaisse)}%)</span></b>${NAV_GO}</div>`).join('');
  const catRows = Object.entries(A.chargeByCat).sort((a,b)=>b[1]-a[1])
    .map(([c,v])=>`<div class="sum-box lnk" onclick="comptaGo('charges')"><span>${esc(c)}</span><b>${euro(v)}</b>${NAV_GO}</div>`).join('');

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Comptabilité</h1><p>Pilotage en trésorerie — CA comptabilisé à l'encaissement réel</p></div>
     <div class="flex" style="gap:8px"><button class="btn ghost sm" onclick="togglePrivacyMode()">${privacyModeEnabled()?'👁️':'🙈'}</button><button class="btn gold" onclick="chargeForm()">＋ Charge</button></div></div>
   <div class="banner">📒 <div>Deux lectures du chiffre d'affaires : le <b>CA facturé</b> (total des commandes, à leur date) et le <b>CA encaissé</b> (règlements reçus, à leur date réelle). Une commande « en attente de paiement » est facturée mais n'entre pas dans le CA encaissé. Le CA des <b>marchés clôturés</b> est inclus (à leur date de clôture).${A.totalMarches>0?` Dont marchés : <b>${euro(A.totalMarches)}</b>.`:''}</div></div>
   <div class="flex" style="gap:8px;margin-bottom:14px;flex-wrap:wrap">
     <button class="btn" onclick="view='rentabilite';setActiveView&&setActiveView('rentabilite');renderProfit()">📈 Analyse de rentabilité</button>
     <button class="btn ghost" onclick="exportComptaCSV()">⤓ Export comptable (.csv)</button>
     <button class="btn ghost" onclick="settingsForm()">⚙ Paramètres (taux, emballages)</button>
   </div>

   <div class="kpi-grid">
     <div class="kpi lnk" onclick="comptaGo('commandes')"><span>CA facturé</span><b>${euro(A.totalFacture)}</b><small class="kpi-note">toutes commandes, payées ou non</small>${NAV_GO}</div>
     <div class="kpi lnk" onclick="comptaGo('commandes')"><span>CA encaissé</span><b>${euro(A.totalEncaisse)}</b><small class="kpi-note">argent réellement reçu · base URSSAF</small>${NAV_GO}</div>
     <div class="kpi lnk" onclick="comptaGo('charges')"><span>Charges</span><b>${euro(A.totalCharges)}</b>${NAV_GO}</div>
     <div class="kpi lnk" onclick="comptaGo('detailMois')"><span>Coût matières (est.)</span><b>${euro(A.totalCoutMatieres)}</b>${NAV_GO}</div>
     ${A.totalPertes>0?`<div class="kpi"><span>Pertes / casse</span><b style="color:var(--red,#b3261e)">−${euro(A.totalPertes)}</b></div>`:''}
     <div class="kpi lnk" onclick="comptaGo('detailMois')"><span>Résultat (encaissé)</span><b style="color:${A.resultat>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(A.resultat)}</b>${NAV_GO}</div>
     <div class="kpi lnk" onclick="comptaGo('commandes')"><span>Créances clients</span><b style="color:${A.creances>0?'var(--caramel)':'#3f7d52'}">${euro(A.creances)}</b>${NAV_GO}</div>
   </div>

   <div class="panel" style="border:1.5px solid #e7d9b8;background:#fcf8ee">
     <h2>📄 Bilan du mois & URSSAF</h2>
     <div class="flex" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
       <select id="comptaMonth" onchange="comptaSetMonth(this.value)" style="flex:1;min-width:160px;font-size:1rem;padding:10px;border:1.5px solid #e0d5c5;border-radius:10px">${moisOpts}</select>
       <button class="btn gold" onclick="exportBilanMois('${_comptaMonth}')">⤓ Exporter le bilan (.txt)</button>
     </div>
     <div class="sum-box lnk" onclick="comptaGo('commandes')"><span>CA encaissé du mois</span><b>${euro(B.caTotal)}</b>${NAV_GO}</div>
     <div class="sum-box lnk" onclick="comptaGo('rentabilite')"><span>🛍️ Vente de marchandise</span><b>${euro(B.goods)} <span style="color:#9a8a82;font-weight:400">(${fmtPct(B.goods,B.caTotal)}%)</span></b>${NAV_GO}</div>
     <div class="sum-box lnk" onclick="comptaGo('rentabilite')"><span>🧑‍🍳 Prestation de service</span><b>${euro(B.service)} <span style="color:#9a8a82;font-weight:400">(${fmtPct(B.service,B.caTotal)}%)</span></b>${NAV_GO}</div>
     <h3 style="font-size:.95rem;margin:14px 0 6px">Cotisations URSSAF estimées</h3>
     <div class="sum-box"><span>Marchandise · ${B.tauxGoods}%</span><b>${euro(B.cotisGoods)}</b></div>
     <div class="sum-box"><span>Service · ${B.tauxService}%</span><b>${euro(B.cotisService)}</b></div>
     <div class="sum-box" style="border-top:2px solid #e0d5c5;margin-top:4px;padding-top:8px"><span><b>À provisionner ce mois (estimé)</b></span><b style="color:var(--bordeaux);font-size:1.05rem">${euro(B.cotisTotal)}</b></div>
     <div class="sum-box" style="background:#f4faf5"><span>Cumul ${esc(yearOf)} — CA (march. ${euro(ytdGoods)} · serv. ${euro(ytdService)})</span><b>cotis. ${euro(ytdCotis)}</b></div>
     <p class="note">Estimation sur les <b>encaissements du mois</b> (base de déclaration micro-entreprise). Les taux sont réglables dans ⚙ Paramètres. À vérifier auprès de l'URSSAF / votre comptable.</p>
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
/* ============================================================
   CHARGES RÉCURRENTES MENSUELLES (assurance, hébergement web, abos…)
   Modèles stockés en localStorage ; chaque mois, on matérialise une vraie
   charge dans db.charges (idempotent) → elle alimente la compta normalement.
   ============================================================ */
const RECUR_KEY = 'sm_recurringCharges';
function getRecurringCharges(){
  try{ const a=JSON.parse(localStorage.getItem(RECUR_KEY)||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; }
}
function saveRecurringCharges(a){ localStorage.setItem(RECUR_KEY, JSON.stringify(a||[])); }
// Liste des mois "AAAA-MM" entre le mois de début (ou 12 mois en arrière) et le mois courant.
function _monthsUpToNow(startYM){
  const now=new Date(); const cur=new Date(now.getFullYear(), now.getMonth(), 1);
  let d;
  if(startYM && /^\d{4}-\d{2}$/.test(startYM)){ const [y,m]=startYM.split('-').map(Number); d=new Date(y, m-1, 1); }
  else { d=new Date(now.getFullYear(), now.getMonth()-11, 1); }   // par défaut : 12 derniers mois
  const out=[];
  while(d<=cur){ out.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); d.setMonth(d.getMonth()+1); }
  return out;
}
// Matérialise les charges récurrentes manquantes (une par mois et par modèle actif).
// Idempotent : on tague chaque charge générée (recurId+ym) pour ne jamais doublonner.
async function materializeRecurringCharges(){
  const models = getRecurringCharges().filter(m=>m.actif!==false && +m.montant>0);
  if(!models.length) return 0;
  const existing = await db.charges.toArray();
  const seen = new Set(existing.filter(c=>c.recurId).map(c=>c.recurId+'|'+(c.date||'').slice(0,7)));
  let created=0;
  for(const m of models){
    const jour = Math.min(28, Math.max(1, +m.jourMois||1));   // 28 pour éviter les mois courts
    for(const ym of _monthsUpToNow(m.debut)){
      const key=m.id+'|'+ym;
      if(seen.has(key)) continue;
      const date = ym+'-'+String(jour).padStart(2,'0');
      await db.charges.add({date, categorie:m.categorie||'Autre', libelle:m.libelle||'Charge récurrente',
        montant:money2(+m.montant||0), recurId:m.id});
      seen.add(key); created++;
    }
  }
  return created;
}
// Éditeur des charges récurrentes (modèles).
async function recurringChargesForm(){
  const models = getRecurringCharges();
  const rows = models.map((m,i)=>`<div class="sum-box" style="flex-direction:column;align-items:stretch;gap:4px">
    <div style="display:flex;justify-content:space-between"><b>${esc(m.libelle||'—')}</b><b>${euro(m.montant)}/mois</b></div>
    <div style="display:flex;justify-content:space-between;font-size:.8rem;color:#9a8a82">
      <span>${esc(m.categorie||'Autre')} · le ${m.jourMois||1} du mois${m.actif===false?' · ⏸ en pause':''}</span>
      <span><span class="act" onclick="recurEdit(${i})">Modifier</span> <span class="act del" onclick="recurDel(${i})">Suppr.</span></span></div>
  </div>`).join('');
  openModal(`<h3>Charges mensuelles récurrentes</h3>
    <p class="note">Assurance pro, hébergement du site, abonnements… Saisies une fois, elles sont reportées automatiquement chaque mois dans la comptabilité.</p>
    <button class="btn gold sm" style="margin-bottom:8px" onclick="recurEdit(-1)">＋ Nouvelle charge récurrente</button>
    ${rows||'<p class="note">Aucune charge récurrente.</p>'}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
      <button class="btn" onclick="recurApplyNow()">Reporter maintenant</button></div>`);
}
function recurEdit(i){
  const models=getRecurringCharges();
  const m = i>=0 ? models[i] : {libelle:'', categorie:'Assurance professionnelle', montant:'', jourMois:1, debut:today().slice(0,7), actif:true};
  openModal(`<h3>${i>=0?'Modifier':'Nouvelle'} charge récurrente</h3>
    <div class="field"><label>Libellé *</label><input id="rc_lib" value="${esc(m.libelle||'')}" placeholder="ex : Assurance pro, Hébergement site web"></div>
    <div class="field"><label>Catégorie</label><select id="rc_cat">${CHARGE_CATS.map(x=>`<option ${m.categorie===x?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="row2">
      <div class="field"><label>Montant mensuel (€) *</label><input type="number" step="0.01" min="0" id="rc_mt" value="${m.montant||''}"></div>
      <div class="field"><label>Jour du mois</label><input type="number" min="1" max="28" id="rc_jour" value="${m.jourMois||1}"></div>
    </div>
    <div class="field"><label>À partir de (mois)</label><input type="month" id="rc_debut" value="${esc(m.debut||today().slice(0,7))}"></div>
    <label class="switch-row"><input type="checkbox" id="rc_actif" ${m.actif!==false?'checked':''}> Active (décochez pour mettre en pause)</label>
    <div class="modal-actions"><button class="btn ghost" onclick="recurringChargesForm()">Annuler</button>
      <button class="btn" onclick="recurSave(${i})">Enregistrer</button></div>`);
}
async function recurSave(i){
  const models=getRecurringCharges();
  const lib=val('rc_lib'), mt=money2(+val('rc_mt')||0);
  if(!lib){ toast('Libellé requis'); return; }
  if(mt<=0){ toast('Montant requis'); return; }
  const m={ id: (i>=0 && models[i].id) ? models[i].id : ('rc'+Date.now()),
    libelle:lib, categorie:val('rc_cat'), montant:mt,
    jourMois: Math.min(28,Math.max(1,+val('rc_jour')||1)), debut:val('rc_debut')||today().slice(0,7),
    actif: document.getElementById('rc_actif').checked };
  if(i>=0) models[i]=m; else models.push(m);
  saveRecurringCharges(models);
  const n=await materializeRecurringCharges();
  closeModal(); recurringChargesForm(); toast(`Charge récurrente enregistrée ✓${n?` · ${n} mois reporté(s)`:''}`);
}
async function recurDel(i){
  const models=getRecurringCharges();
  if(!confirm('Supprimer ce modèle ? Les charges déjà reportées dans la compta sont conservées.')) return;
  models.splice(i,1); saveRecurringCharges(models);
  recurringChargesForm(); toast('Modèle supprimé');
}
async function recurApplyNow(){
  const n=await materializeRecurringCharges();
  closeModal(); renderCompta(); toast(n?`${n} charge(s) reportée(s) ✓`:'Tout est déjà à jour ✓');
}

async function renderChargesList(){
  const charges = (await db.charges.toArray()).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  openModal(`<h3>Charges / dépenses</h3>
    <div class="flex" style="gap:6px;margin-bottom:8px"><button class="btn gold sm" onclick="chargeForm()">＋ Nouvelle charge</button>
      <button class="btn ghost sm" onclick="recurringChargesForm()">🔁 Charges récurrentes</button></div>
    ${charges.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Catégorie</th><th>Libellé</th><th>Montant</th><th></th></tr></thead>
      <tbody>${charges.map(c=>`<tr><td>${fmtDate(c.date)}</td><td>${esc(c.categorie||'—')}</td><td>${esc(c.libelle||'')}${c.recurId?' <span class="tag" style="background:#7a6a9a;color:#fff">🔁</span>':''}</td><td>${euro(c.montant)}</td>
        <td style="text-align:right"><span class="act" onclick="chargeForm(${c.id})">Modifier</span><span class="act del" onclick="delCharge(${c.id})">Suppr.</span></td></tr>`).join('')}</tbody></table></div>`
      :'<p class="note">Aucune charge enregistrée.</p>'}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`);
}
async function chargeForm(id){
  const c = id ? await db.charges.get(id) : {};
  openModal(`<h3>${id?'Modifier':'Nouvelle'} charge</h3>
    <p class="note">Les charges sont les dépenses <b>hors stock</b> (assurance, hébergement, loyer, stand…). Les <b>matières premières et emballages</b> se saisissent en réception de lot, pas ici.</p>
    <div class="field"><label>Date *</label><input type="date" id="ch_date" value="${esc(c.date||'')}"></div>
    <div class="field"><label>Catégorie *</label><select id="ch_cat">${(c.categorie && !CHARGE_CATS.includes(c.categorie)?[c.categorie]:[]).concat(CHARGE_CATS).map(x=>`<option ${c.categorie===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="field"><label>Libellé</label><input id="ch_lib" value="${esc(c.libelle||'')}" placeholder="ex : Assurance pro, hébergement site…"></div>
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
// Dernier instantané stratégique calculé, partagé avec les popups de détail
// (les onclick ne peuvent pas transporter l'objet S complet).
let _pilotageS = null;

// --- Popup : explication de la MARGE BRUTE ---
function pilotMargeBrute(){
  const S=_pilotageS; if(!S) return;
  openModal(`<h3>📊 Marge brute — comment c'est calculé</h3>
    <p class="note" style="margin-bottom:10px">Sur l'ensemble de tes <b>${S.nbCmd} commande(s) payée(s)</b>. La marge brute, c'est ce qui reste du chiffre d'affaires une fois retirés les coûts directs de fabrication (matières + emballages), <b>avant</b> les charges sociales.</p>
    <div class="sum-box"><span>Chiffre d'affaires encaissé</span><b>${euro(S.caPaye)}</b></div>
    <div class="sum-box"><span>− Coût des matières</span><b style="color:var(--red,#b3261e)">−${euro(S.coutMat)}</b></div>
    <div class="sum-box"><span>− Coût des emballages</span><b style="color:var(--red,#b3261e)">−${euro(S.coutEmb)}</b></div>
    <div class="sum-box" style="border-top:2px solid #e0d5c5;margin-top:4px;padding-top:8px"><span><b>= Marge brute</b></span><b style="color:${S.margeBrute>=0?'#2e7d32':'#b3261e'};font-size:1.05rem">${euro(S.margeBrute)}</b></div>
    <div class="sum-box" style="background:#f4faf5"><span>Taux de marge brute</span><b>${S.tauxBrut}% du CA</b></div>
    <p class="note" style="margin-top:10px">Formule : <b>CA − matières − emballages</b>. Le coût matières est estimé (coût recette ÷ rendement). C'est l'indicateur de rentabilité « atelier », avant cotisations.</p>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
      <button class="btn" onclick="closeModal();renderProfit()">Rentabilité détaillée ›</button></div>`);
}

// --- Popup : explication de la MARGE NETTE ---
function pilotMargeNette(){
  const S=_pilotageS; if(!S) return;
  openModal(`<h3>📊 Marge nette — comment c'est calculé</h3>
    <p class="note" style="margin-bottom:10px">La marge nette part de la marge brute et retire en plus les <b>charges sociales URSSAF</b> (cotisations micro-entreprise). C'est ce qu'il te reste réellement, hors impôt sur le revenu.</p>
    <div class="sum-box"><span>Marge brute</span><b>${euro(S.margeBrute)}</b></div>
    <div class="sum-box"><span>− Charges sociales (URSSAF)</span><b style="color:var(--red,#b3261e)">−${euro(S.chargesSociales)}</b></div>
    <div class="sum-box" style="border-top:2px solid #e0d5c5;margin-top:4px;padding-top:8px"><span><b>= Marge nette</b></span><b style="color:${S.margeNette>=0?'#2e7d32':'#b3261e'};font-size:1.05rem">${euro(S.margeNette)}</b></div>
    <div class="sum-box" style="background:#f4faf5"><span>Taux de marge nette</span><b>${S.tauxNet}% du CA</b></div>
    <p class="note" style="margin-top:10px">Formule : <b>marge brute − charges sociales</b>. Les taux (12,3 % marchandise / 25,6 % service) sont réglables dans ⚙ Paramètres. Hors impôt sur le revenu et frais annexes.</p>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
      <button class="btn" onclick="closeModal();renderProfit()">Rentabilité détaillée ›</button></div>`);
}

// --- Popup : détail du PANIER MOYEN (commandes au-dessus = vert, en dessous = rouge) ---
function pilotPanier(){
  const S=_pilotageS; if(!S) return;
  const det=S.panierDetail||[];
  const rows = det.map(d=>{
    const col = d.dessus ? '#2e7d32' : '#b3261e';
    const sign = d.dessus ? '▲' : '▼';
    const dot = d.dessus ? '🟢' : '🔴';
    return `<div class="sum-box" style="border-left:3px solid ${col}">
      <span>${dot} ${esc(d.client)} <span style="color:#9a8a82;font-size:.74rem">${d.date?fmtDate(d.date):''}</span></span>
      <b style="color:${col}">${euro(d.montant)} <span style="font-weight:400;font-size:.72rem">${sign} ${euro(Math.abs(d.ecart))}</span></b></div>`;
  }).join('');
  openModal(`<h3>🛍️ Panier moyen — ${euro(S.panier)}</h3>
    <p class="note" style="margin-bottom:10px">Moyenne sur <b>${S.nbCmd} commande(s) payée(s)</b> (CA encaissé ÷ nombre de commandes). Ci-dessous, chaque commande avec son écart à la moyenne :
    <span style="color:#2e7d32">🟢 vert = au-dessus</span> (tire la moyenne vers le haut), <span style="color:#b3261e">🔴 rouge = en dessous</span> (tire vers le bas).</p>
    <div style="max-height:48vh;overflow:auto">${rows||'<p class="note">Aucune commande payée.</p>'}</div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
      <button class="btn" onclick="closeModal();view='commandes';setActiveView&&setActiveView('commandes');renderCmd()">Voir les commandes ›</button></div>`);
}

// --- Popup : liste des CLIENTS ACTIFS (90 j) + raccourci vers la liste clients ---
function pilotClientsActifs(){
  const S=_pilotageS; if(!S) return;
  const list=S.activeList||[];
  const rows = list.map(c=>`<div class="sum-box"><span>👤 ${esc(c.nom)} <span style="color:#9a8a82;font-size:.74rem">(${c.n} cmd)</span></span><b>${euro(c.ca)}</b></div>`).join('');
  openModal(`<h3>👥 Clients actifs — ${S.activeClients} sur ${S.totalClients}</h3>
    <p class="note" style="margin-bottom:10px">Clients ayant passé au moins une commande payée sur les <b>90 derniers jours</b>, triés par CA encaissé sur la période.</p>
    <div style="max-height:48vh;overflow:auto">${rows||'<p class="note">Aucun client actif sur les 90 derniers jours.</p>'}</div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
      <button class="btn" onclick="closeModal();view='clients';setActiveView&&setActiveView('clients');renderClients()">Voir tous les clients ›</button></div>`);
}

async function renderPilotage(){
 try {
  const S = await computeStrategic();
  _pilotageS = S;   // mémorisé pour les popups détaillés (marges, panier, clients actifs)
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
     <div class="kpi lnk" onclick="pilotMargeBrute()"><span>Marge brute ${INFO_I}</span><b>${euro(S.margeBrute)}</b><span>${S.tauxBrut}% du CA</span></div>
     <div class="kpi lnk" onclick="pilotMargeNette()"><span>Marge nette ${INFO_I}</span><b style="color:${S.margeNette>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(S.margeNette)}</b><span>${S.tauxNet}% du CA</span></div>
     <div class="kpi lnk" onclick="pilotPanier()"><span>Panier moyen ${INFO_I}</span><b>${euro(S.panier)}</b><span>${S.nbCmd} commande(s)</span></div>
     <div class="kpi lnk" onclick="pilotClientsActifs()"><span>Clients actifs</span><b>${S.activeClients}</b><span>sur ${S.totalClients} (90 j)</span>${NAV_GO}</div>
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
/* ============================================================
   ÉCRAN : RENTABILITÉ PAR PARFUM
   ============================================================ */
let _parfumSort = 'marge'; // marge | ca | pieces | taux | nom | stock
let _parfumEvolWindow = 6; // mois pour la courbe d'évolution
// Mémoire pour les popups détaillés de l'écran Rentabilité parfums.
let _parfumsA = null, _parfumsAvgP = null;

// Popup : détail de la MARGE BRUTE / NETTE totale par parfum (qui contribue, qui plombe).
function parfumMargesPopup(net){
  const A=_parfumsA; if(!A) return;
  const rows=(A.rows||[]).filter(r=>r.piecesVendues>0)
    .map(r=>({nom:r.nom, val: net?r.margeNette:r.margeBrute, taux:r.tauxMarge}))
    .sort((a,b)=>b.val-a.val);
  const moy = rows.length ? rows.reduce((s,r)=>s+r.val,0)/rows.length : 0;
  const body=rows.map(r=>{
    const dessus=r.val>=moy; const col=dessus?'#2e7d32':'#b3261e'; const dot=dessus?'🟢':'🔴';
    return `<div class="sum-box" style="border-left:3px solid ${col}"><span>${dot} ${esc(r.nom)} ${r.taux!=null?`<span style="color:#9a8a82;font-size:.74rem">${r.taux}%</span>`:''}</span><b style="color:${col}">${euro(r.val)}</b></div>`;
  }).join('');
  const tot=net?A.totals.margeNette:A.totals.margeBrute;
  openModal(`<h3>📊 Marge ${net?'nette':'brute'} totale — ${euro(tot)}</h3>
    <p class="note" style="margin-bottom:10px">${net?'Après charges sociales.':'Avant charges sociales (CA − coût de revient des pièces vendues).'} Contribution de chaque parfum, du plus rentable au moins rentable :
    <span style="color:#2e7d32">🟢 au-dessus de la moyenne</span>, <span style="color:#b3261e">🔴 en dessous</span>.</p>
    <div style="max-height:48vh;overflow:auto">${body||'<p class="note">Aucune vente.</p>'}</div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`);
}
// Popup : explication du PRIX MOYEN PONDÉRÉ.
function parfumPrixMoyenPopup(){
  const A=_parfumsA, p=_parfumsAvgP; if(!A||!p) return;
  openModal(`<h3>🏷️ Prix moyen pondéré — ${euro(p.prix)}</h3>
    <p class="note" style="margin-bottom:10px">Prix de vente moyen d'un macaron, ${p.source==='ventes'?'calculé sur tes <b>ventes réelles</b> (commandes + marchés clos)':'estimé depuis la <b>grille de prix</b> (pas encore assez de ventes)'}.</p>
    <div class="sum-box"><span>Pièces prises en compte</span><b>${qty(p.pieces||0)}</b></div>
    <div class="sum-box"><span>Source du calcul</span><b>${p.source==='ventes'?'Ventes réelles':'Grille de prix'}</b></div>
    <div class="sum-box" style="background:#f4faf5"><span>CA attendu (pièces × prix moyen)</span><b>${euro(A.totals.caTheo||0)}</b></div>
    <div class="sum-box"><span>CA réellement encaissé</span><b>${euro(A.totals.ca)}</b></div>
    ${A.totals.ecartTheo!=null?`<div class="sum-box" style="border-top:2px solid #e0d5c5;margin-top:4px;padding-top:8px"><span><b>Écart</b></span><b style="color:${A.totals.ecartTheo<0?'#b3261e':'#2e7d32'}">${A.totals.ecartTheo>0?'+':''}${euro(A.totals.ecartTheo)}</b></div>`:''}
    <p class="note" style="margin-top:10px">Un écart négatif = encaissé sous l'attendu (remises, dons/pertes non saisis, erreur de caisse). Positif = ventes au-dessus du tarif moyen.</p>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`);
}
// Popup : détail du STOCK IMMOBILISÉ (valeur au coût de revient, par parfum).
function parfumStockPopup(){
  const A=_parfumsA; if(!A) return;
  const rows=(A.rows||[]).filter(r=>r.stock>0)
    .map(r=>({nom:r.nom, stock:r.stock, val:r.valStockCout}))
    .sort((a,b)=>b.val-a.val);
  const body=rows.map(r=>`<div class="sum-box"><span>${esc(r.nom)} <span style="color:#9a8a82;font-size:.74rem">${qty(r.stock)} pc</span></span><b>${euro(r.val)}</b></div>`).join('');
  openModal(`<h3>📦 Stock immobilisé — ${euro(A.totals.valStock)}</h3>
    <p class="note" style="margin-bottom:10px">Valeur des macarons en stock, au <b>coût de revient</b> (matières + pertes + consommables). C'est l'argent « dormant » dans ton congélateur/frigo. Par parfum, du plus lourd au plus léger :</p>
    <div style="max-height:48vh;overflow:auto">${body||'<p class="note">Aucun stock.</p>'}</div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
      <button class="btn" onclick="closeModal();goView('productions')">Voir les productions ›</button></div>`);
}

async function renderParfums(){
  const [recipes, recipeItems, lots, mats, orders, markets, marketMoves, productions] = await Promise.all([
    db.recipes.toArray(), db.recipeItems.toArray(), db.materialLots.toArray(), db.materials.toArray(),
    db.orders.toArray(), db.markets.toArray(), db.marketMoves.toArray(), db.productions.toArray()
  ]);
  const s = getSettings();
  const data = {recipes, recipeItems, lots, mats, orders, markets, marketMoves, productions, settings:s};

  if(!recipes.length){
    document.getElementById('main').innerHTML=`
      <div class="topbar"><div><h1>Rentabilité parfums</h1><p>Coûts de revient & marges par parfum</p></div></div>
      <div class="panel"><div class="empty">Aucune recette. Créez vos recettes (BOM) — chaque recette correspond à un parfum — puis réceptionnez des lots avec prix pour activer l'analyse.</div></div>`;
    return;
  }

  const A = analyzeFlavorProfitability(data);
  _parfumsA = A;   // mémorisé pour les popups détaillés (marges, prix moyen, stock)
  const hikes = flavorCostHikeAlerts(data, A);
  const recs = flavorRecommendations(A, data);

  // tri
  const rows=[...A.rows];
  const sorters={
    marge:(a,b)=>b.margeBrute-a.margeBrute,
    ca:(a,b)=>b.ca-a.ca,
    pieces:(a,b)=>b.piecesVendues-a.piecesVendues,
    taux:(a,b)=>(b.tauxMarge==null?-1:b.tauxMarge)-(a.tauxMarge==null?-1:a.tauxMarge),
    stock:(a,b)=>b.valStockCout-a.valStockCout,
    nom:(a,b)=>a.nom.localeCompare(b.nom)
  };
  rows.sort(sorters[_parfumSort]||sorters.marge);

  // Pareto 80/20 (sur marge brute, parfums vendus uniquement)
  const sold=A.rows.filter(r=>r.piecesVendues>0 && r.margeBrute>0).sort((a,b)=>b.margeBrute-a.margeBrute);
  const totMargeSold=sold.reduce((s2,r)=>s2+r.margeBrute,0);
  let cum=0; const pareto=[]; let seuil80=null;
  sold.forEach((r,i)=>{ cum+=r.margeBrute; const pct=totMargeSold>0?cum/totMargeSold*100:0; pareto.push({...r, cumPct:pct}); if(seuil80===null && pct>=80) seuil80=i+1; });

  // classements
  const best=A.rows.filter(r=>r.tauxMarge!=null).sort((a,b)=>b.tauxMarge-a.tauxMarge).slice(0,5);
  const worst=A.rows.filter(r=>r.tauxMarge!=null).sort((a,b)=>a.tauxMarge-b.tauxMarge).slice(0,5);

  // KPI
  const avgP = computeAvgSellPrice(data);
  _parfumsAvgP = avgP;
  const kpis=`<div class="kpi-grid">
    <div class="kpi"><span>CA encaissé (parfums)</span><b>${euro(A.totals.ca)}</b><span>${qty(A.totals.pieces)} pièces vendues</span></div>
    <div class="kpi lnk" onclick="parfumMargesPopup(false)"><span>Marge brute totale ${INFO_I}</span><b style="color:${A.totals.margeBrute>=0?'#3f7d52':'#b3261e'}">${euro(A.totals.margeBrute)}</b><span>${A.totals.tauxMargeGlobal!=null?A.totals.tauxMargeGlobal+'% de marge':'—'}</span></div>
    <div class="kpi lnk" onclick="parfumMargesPopup(true)"><span>Marge nette estimée ${INFO_I}</span><b style="color:${A.totals.margeNette>=0?'#3f7d52':'#b3261e'}">${euro(A.totals.margeNette)}</b><span>après charges ${s.socialGoods}%</span></div>
    <div class="kpi lnk" onclick="parfumPrixMoyenPopup()"><span>Prix moyen pondéré ${INFO_I}</span><b>${euro(avgP.prix)}</b><span>${avgP.source==='ventes'?'d\'après les ventes':'grille (pas de vente)'}</span></div>
    <div class="kpi lnk" onclick="parfumStockPopup()"><span>Stock immobilisé ${INFO_I}</span><b>${euro(A.totals.valStock)}</b><span>au coût de revient</span></div>
  </div>`;

  // bannière d'incohérence CA : encaissé vs attendu (pièces × prix moyen)
  const ecT=A.totals.ecartTheo, theoT=A.totals.caTheo;
  const incohBanner = (theoT>0 && Math.abs(ecT)>=Math.max(5, theoT*0.05))
    ? `<div class="banner" style="background:${ecT<0?'#fdf3f2':'#fff8ec'};border-color:${ecT<0?'#e5b4ae':'#e8cfa0'}">🔎 <div><b>Écart CA encaissé vs attendu : ${ecT>0?'+':''}${euro(ecT)}</b> (encaissé ${euro(A.totals.ca)} · attendu ${euro(theoT)} au prix moyen ${euro(avgP.prix)}). ${ecT<0?'L\'encaissé est sous l\'attendu : pertes/dons non saisis, remises, ou erreur de caisse.':'Ventes au-dessus du tarif moyen, ou grille de prix à réajuster.'}</div></div>`
    : '';

  // alertes hausse de coût
  const hikeBanner = hikes.length?`<div class="banner" style="background:#fdf3f2;border-color:#e5b4ae">📈 <div><b>Hausse de coût matière détectée</b> : ${hikes.slice(0,4).map(h=>`${esc(h.mat)} +${h.varPct}% (impacte ${h.parfums.map(esc).join(', ')})`).join(' · ')}${hikes.length>4?` … +${hikes.length-4}`:''}. Vérifiez les prix de vente des parfums concernés.</div></div>`:'';

  // tableau principal
  const sortBtn=(k,lib)=>`<button class="btn ghost sm" style="${_parfumSort===k?'border-color:var(--caramel);font-weight:600':''}" onclick="_parfumSort='${k}';renderParfums()">${lib}</button>`;
  const mainTable=`<div class="table-wrap"><table><thead><tr>
      <th>Parfum</th><th>Coût revient/pc</th><th>Prix vente moy.</th><th>Marge/pc</th><th>Vendus</th><th>CA</th><th>Marge brute</th><th>Rentabilité</th></tr></thead><tbody>
    ${rows.map(r=>`<tr style="cursor:pointer" onclick="parfumDetail(${r.recipeId})">
      <td><b>${esc(r.nom)}</b>${r.cost.pertePct>0?`<br><span style="color:#9a8a82;font-size:.7rem">pertes ${r.cost.pertePct}%</span>`:''}</td>
      <td>${euro(r.cost.coutRevientUnit)}</td>
      <td>${r.prixVenteMoyen!=null?euro(r.prixVenteMoyen):'<span style="color:#9a8a82">—</span>'}</td>
      <td style="color:${r.margeUnit!=null?(r.margeUnit>=0?'#3f7d52':'#b3261e'):'#9a8a82'}">${r.margeUnit!=null?euro(r.margeUnit):'—'}</td>
      <td>${r.piecesVendues>0?qty(r.piecesVendues):'<span style="color:#9a8a82">0</span>'}</td>
      <td>${euro(r.ca)}</td>
      <td style="font-weight:600;color:${r.margeBrute>=0?'#3f7d52':'#b3261e'}">${euro(r.margeBrute)}</td>
      <td><span class="tag" style="background:${r.scale.col};color:#fff">${r.scale.dot} ${r.tauxMarge!=null?r.tauxMarge+'%':'—'}</span></td></tr>`).join('')}
    </tbody></table></div>
    <p class="note">Touchez une ligne pour le détail (coque/garniture, simulation de prix, seuil de rentabilité). Base de calcul = <b>CA encaissé</b> réel (commandes + marchés), réparti par parfum selon les pièces vendues. Coût de revient = matières (prix courant) + pertes + consommables${s.laborEnabled?' + main-d\'œuvre':''}. La grille de prix par format sert à estimer le prix moyen pondéré et à détecter les écarts.</p>`;

  // parfums sans recette (vendus mais non rattachés)
  const unmatchedBlock=A.unmatched.length?`<div class="panel"><h2>Parfums vendus sans recette <span class="tag warn">${A.unmatched.length}</span></h2>
     <p class="note">Ces parfums apparaissent dans les ventes mais n'ont pas de recette correspondante — impossible de calculer leur coût/marge. Créez une recette portant le même nom : ${A.unmatched.map(u=>`<b>${esc(u.nom)}</b> (${qty(u.piecesVendues+u.piecesDon)} pc)`).join(', ')}.</p></div>`:'';

  // Pareto
  const paretoBlock = sold.length?`<div class="panel"><h2>Analyse Pareto 80/20</h2>
     ${seuil80?`<div class="banner"><div><b>${seuil80} parfum(s)</b> sur ${sold.length} génèrent <b>80%</b> de votre marge brute. Concentrez vos efforts (appro, mise en avant, production) sur eux.</div></div>`:''}
     <div class="table-wrap"><table><thead><tr><th>#</th><th>Parfum</th><th>Marge brute</th><th>% cumulé</th></tr></thead><tbody>
       ${pareto.map((r,i)=>`<tr${seuil80&&i<seuil80?' style="background:#f3f8f4"':''}><td>${i+1}</td><td><b>${esc(r.nom)}</b></td><td>${euro(r.margeBrute)}</td>
         <td><span class="tag ${r.cumPct<=80?'ok':''}">${r.cumPct.toFixed(0)}%</span></td></tr>`).join('')}
     </tbody></table></div></div>`:'';

  // classements
  const rankBlock=`<div class="panel"><h2>Classement par rentabilité</h2>
     <div class="row2">
       <div><h3 style="font-size:.92rem;margin:6px 0;color:#3f7d52">🟢 Les plus rentables</h3>
         ${best.length?best.map(r=>`<div class="sum-box"><span>${esc(r.nom)}</span><b style="color:#3f7d52">${r.tauxMarge}% · ${euro(r.margeUnit||0)}/pc</b></div>`).join(''):'<p class="note">—</p>'}</div>
       <div><h3 style="font-size:.92rem;margin:6px 0;color:#b3261e">🔴 Les moins rentables</h3>
         ${worst.length?worst.map(r=>`<div class="sum-box"><span>${esc(r.nom)}</span><b style="color:${r.tauxMarge<0?'#b3261e':'#d98324'}">${r.tauxMarge}% · ${euro(r.margeUnit||0)}/pc</b></div>`).join(''):'<p class="note">—</p>'}</div>
     </div></div>`;

  // recommandations
  const recBlock=`<div class="panel"><h2>Recommandations intelligentes</h2>
     ${recs.map(r=>`<div class="sum-box" style="align-items:flex-start"><span style="font-size:1.1rem">${r.icon}</span><b style="font-weight:500;color:${r.col};text-align:left;flex:1;margin-left:8px">${r.txt}</b></div>`).join('')}</div>`;

  // évolution de la rentabilité dans le temps (marge brute mensuelle, par CA - coût des ventes)
  const evolBlock = await buildFlavorEvolutionBlock(data, A);

  // outils de prévision
  const prevBlock=`<div class="panel"><h2>Prévisions & aide à la décision</h2>
     <div class="flex" style="gap:8px;flex-wrap:wrap">
       <button class="btn ghost sm" onclick="parfumBatchSim()">🧮 Marge prévisionnelle d'un batch</button>
       <button class="btn ghost sm" onclick="parfumMixOptim()">🎯 Mix de parfums optimal</button>
       <button class="btn ghost sm" onclick="parfumMarketGain()">⛺ Gain estimé d'un marché</button>
     </div>
     <p class="note">Calculs basés sur vos coûts de revient et l'historique de vente. Aucune donnée ne quitte l'appareil.</p></div>`;

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Rentabilité parfums</h1><p>Coûts de revient, marges & recommandations par parfum</p></div>
     <button class="btn ghost sm" onclick="parfumSettingsForm()">⚙ Coûts & MO</button></div>
   ${hikeBanner}
   ${incohBanner}
   ${kpis}
   <div class="panel"><h2>Synthèse par parfum</h2>
     <div class="flex" style="gap:6px;flex-wrap:wrap;margin-bottom:8px"><span style="font-size:.8rem;color:#9a8a82;align-self:center">Trier :</span>
       ${sortBtn('marge','Marge')} ${sortBtn('ca','CA')} ${sortBtn('pieces','Volume')} ${sortBtn('taux','Taux')} ${sortBtn('stock','Stock')} ${sortBtn('nom','A→Z')}</div>
     ${mainTable}</div>
   ${unmatchedBlock}
   ${recBlock}
   ${paretoBlock}
   ${rankBlock}
   ${evolBlock}
   ${prevBlock}`;

  // dessine la courbe d'évolution si présente
  drawFlavorEvolutionChart(data, A);
}

// Bloc HTML pour l'évolution mensuelle de la marge (placeholder de conteneur).
async function buildFlavorEvolutionBlock(data, A){
  return `<div class="panel"><h2>Évolution de la rentabilité <span style="font-weight:400;font-size:.8rem;color:#9a8a82">— marge brute mensuelle</span></h2>
     <div id="flavorEvolChart"></div>
     <p class="note">CA mensuel (commandes + marchés clos) − coût de revient des pièces vendues le mois.</p></div>`;
}

// Calcule et dessine la courbe d'évolution (CA, coût, marge) par mois.
function drawFlavorEvolutionChart(data, A){
  const el=document.getElementById('flavorEvolChart'); if(!el) return;
  const {recipes, recipeItems, lots, orders, markets, marketMoves, productions, settings}=data;
  const s=settings||getSettings();
  const costByRecipe=A.costByRecipe;
  const units=Object.values(costByRecipe).map(c=>c.coutRevientUnit).filter(x=>x>0);
  const avgUnit=units.length?units.reduce((a,b)=>a+b,0)/units.length:0;
  // retrouver la recette d'un parfum/mouvement
  const recByNorm={}; recipes.forEach(r=>{recByNorm[aiNormalize(r.produitNom)]=r;});
  const prodById={}; (productions||[]).forEach(p=>{prodById[p.id]=p;});
  const recName=rid=>(recipes.find(r=>r.id===rid)||{}).produitNom||'';
  const unitCostForParfum=nom=>{ const r=recByNorm[aiNormalize(nom)]; return r&&costByRecipe[r.id]?costByRecipe[r.id].coutRevientUnit:avgUnit; };
  const moveParfum=m=>{ if(m.parfum) return m.parfum; if(m.productionId!=null && prodById[m.productionId]) return recName(prodById[m.productionId].recipeId)||''; return ''; };

  // pièces vendues par mois + CA par mois (commandes)
  const caByMonth={}, coutByMonth={};
  (orders||[]).forEach(o=>{
    const k=ymKey(o.date); if(!k) return;
    caByMonth[k]=money2((caByMonth[k]||0)+(+o.montant||0));
    // pièces de la commande × coût moyen (approche globale mensuelle)
    const lignes=orderToLines(o);
    let pieces=0;
    lignes.forEach(ln=>{
      if(ln.type==='coffret') pieces+=+ln.taille||0;
      else if(ln.type==='don') pieces+=(ln.parfums||[]).reduce((a,p)=>a+(+p.qte||0),0);
      else if(ln.type==='evenement') pieces+=+ln.evQte||0;
      else if(ln.type==='grand') pieces+=(ln.items||[]).reduce((a,p)=>a+(+p.qte||0),0);
    });
    coutByMonth[k]=money2((coutByMonth[k]||0)+pieces*avgUnit);
  });
  // marchés clos : CA = ENCAISSÉ (base de calcul) ; coût = pièces × coût DU PARFUM
  const movesByMk={}; (marketMoves||[]).forEach(mv=>{(movesByMk[mv.marketId] ||= []).push(mv);});
  (markets||[]).filter(mk=>mk.statut==='clos').forEach(mk=>{
    const k=ymKey(mk.dateCloture||mk.date); if(!k) return;
    const ca=mk.ca||{}; caByMonth[k]=money2((caByMonth[k]||0)+marketNetCA(mk));
    const mv=movesByMk[mk.id]||[];
    const byParfum={};
    mv.forEach(m=>{ const nom=moveParfum(m)||'(parfum ?)'; const b=(byParfum[nom] ||= {sortie:0,retour:0,don:0,perte:0});
      if(m.type==='sortie')b.sortie+=+m.qte||0; else if(m.type==='retour')b.retour+=+m.qte||0; else if(m.type==='don')b.don+=+m.qte||0; else if(m.type==='perte')b.perte+=+m.qte||0; });
    let coutMk=0;
    Object.keys(byParfum).forEach(nom=>{ const b=byParfum[nom]; const v=Math.max(0,b.sortie-b.retour-b.don-b.perte); if(v<=0) return;
      coutMk=money2(coutMk+v*unitCostForParfum(nom)); });
    coutByMonth[k]=money2((coutByMonth[k]||0)+coutMk);
  });
  const keys=[...new Set([...Object.keys(caByMonth),...Object.keys(coutByMonth)])].sort().slice(-12);
  if(!keys.length){ el.innerHTML='<div class="empty">Pas encore de ventes datées pour tracer la courbe.</div>'; return; }
  const sCA={label:'CA', color:'#3f7d52', points:keys.map(k=>({x:k,y:caByMonth[k]||0}))};
  const sCout={label:'Coût de revient', color:'#b04a3e', points:keys.map(k=>({x:k,y:coutByMonth[k]||0}))};
  const sMarge={label:'Marge brute', color:'#AA7C39', points:keys.map(k=>({x:k,y:money2((caByMonth[k]||0)-(coutByMonth[k]||0))}))};
  el.innerHTML=lineChart([sCA,sCout,sMarge],{fmt:v=>euro(v),xlabel:ymLabel,zero:true});
}

// DÉTAIL d'un parfum : ventilation coque/garniture, coût détaillé, simulation de prix, seuil de rentabilité.
async function parfumDetail(recipeId){
  const [recipes, recipeItems, lots, mats, orders, markets, marketMoves, productions]=await Promise.all([
    db.recipes.toArray(), db.recipeItems.toArray(), db.materialLots.toArray(), db.materials.toArray(),
    db.orders.toArray(), db.markets.toArray(), db.marketMoves.toArray(), db.productions.toArray()
  ]);
  const s=getSettings();
  const data={recipes, recipeItems, lots, mats, orders, markets, marketMoves, productions, settings:s};
  const r=recipes.find(x=>x.id===recipeId); if(!r){ toast('Recette introuvable'); return; }
  const A=analyzeFlavorProfitability(data);
  const row=A.rows.find(x=>x.recipeId===recipeId); if(!row){ toast('Données indisponibles'); return; }
  const c=row.cost;
  const vent=ventilationCoqueGarniture(c, mats);
  const matName=id=>(mats.find(m=>m.id===id)||{}).nom||'—';
  const matUnit=id=>(mats.find(m=>m.id===id)||{}).unite||'';

  const detailRows=c.detail.filter(d=>d.cout>0).sort((a,b)=>b.cout-a.cout).map(d=>`<tr>
     <td>${esc(matName(d.materialId))}</td><td>${qty(d.qteParBatch)} ${esc(matUnit(d.materialId))}</td>
     <td>${euro(d.pu)}/${esc(matUnit(d.materialId))}</td><td>${euro(money2(d.cout))}</td></tr>`).join('');

  // valeur de référence pour la simulation : prix de vente moyen constaté, sinon prix unitaire global
  const prixRef = row.prixVenteMoyen!=null ? row.prixVenteMoyen : (+s.prixVenteUnitaire||money2((BOX_PRICES[6]||12)/6));
  // seuil de rentabilité : à ce prix de référence, combien de pièces pour couvrir un batch (MO+conso inclus)
  const margeRefUnit = money2(prixRef - c.coutRevientUnit);

  openModal(`<h3>${esc(r.produitNom)} <span class="tag" style="background:${row.scale.col};color:#fff">${row.scale.dot} ${row.scale.label}</span></h3>
    <div class="sum-box"><span>Coût de revient / pièce</span><b>${euro(c.coutRevientUnit)}</b></div>
    <div class="sum-box"><span>· dont matières</span><b>${euro(c.coutMatUnit)}</b></div>
    <div class="sum-box"><span>· dont coque (estim.)</span><b>${euro(vent.coqueUnit)}</b></div>
    <div class="sum-box"><span>· dont garniture (estim.)</span><b>${euro(vent.garnitureUnit)}</b></div>
    ${c.coutConsoUnit>0?`<div class="sum-box"><span>· dont consommables</span><b>${euro(c.coutConsoUnit)}</b></div>`:''}
    ${c.laborOn?`<div class="sum-box"><span>· dont main-d'œuvre</span><b>${euro(c.coutMODUnit)}</b></div>`:''}
    <div class="sum-box"><span>Rendement utile / batch</span><b>${qty(c.piecesUtiles)}${c.pertePct>0?` <span style="color:#9a8a82;font-weight:400">(−${c.pertePct}% pertes)</span>`:''}</b></div>
    <div class="sum-box"><span>Coût de revient / batch</span><b>${euro(c.coutRevientBatch)}</b></div>
    <hr style="border:none;border-top:1px solid #ece2d4;margin:10px 0">
    <div class="sum-box"><span>Prix de vente moyen constaté</span><b>${row.prixVenteMoyen!=null?euro(row.prixVenteMoyen):'— pas de vente —'}</b></div>
    <div class="sum-box"><span>Marge / pièce</span><b style="color:${row.margeUnit!=null?(row.margeUnit>=0?'#3f7d52':'#b3261e'):'#9a8a82'}">${row.margeUnit!=null?euro(row.margeUnit)+' ('+row.tauxMarge+'%)':'—'}</b></div>
    <div class="sum-box"><span>Vendus / CA / marge brute</span><b>${qty(row.piecesVendues)} · ${euro(row.ca)} · ${euro(row.margeBrute)}</b></div>
    ${row.stock>0?`<div class="sum-box"><span>Stock immobilisé</span><b>${qty(row.stock)} pc · ${euro(row.valStockCout)}</b></div>`:''}

    <details style="margin-top:10px"><summary style="cursor:pointer;color:var(--caramel,#AA7C39);font-weight:600">Détail des matières (par batch)</summary>
      ${detailRows?`<div class="table-wrap" style="margin-top:6px"><table><thead><tr><th>Matière</th><th>Qté</th><th>Prix</th><th>Coût</th></tr></thead><tbody>${detailRows}</tbody></table></div>`:'<p class="note">Aucune matière avec prix.</p>'}
    </details>

    <h3 style="font-size:.98rem;margin:14px 0 6px">Simulation de prix</h3>
    <div class="field"><label>Prix de vente / pièce (€)</label>
      <input type="number" step="0.05" min="0" id="simPrix" value="${prixRef}" oninput="parfumSimUpdate(${recipeId},${c.coutRevientUnit},${row.piecesVendues||0})"></div>
    <div id="simOut"></div>
    <p class="note">Le seuil de rentabilité est atteint dès que le prix dépasse le coût de revient (${euro(c.coutRevientUnit)}/pc).</p>

    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
      <button class="btn" onclick="closeModal();recForm(${recipeId})">✎ Modifier la recette</button></div>`);
  parfumSimUpdate(recipeId, c.coutRevientUnit, row.piecesVendues||0);
}

// Met à jour la simulation de prix dans la fiche parfum.
function parfumSimUpdate(recipeId, coutUnit, piecesHist){
  const out=document.getElementById('simOut'); if(!out) return;
  const prix=+(document.getElementById('simPrix')?.value)||0;
  const marge=money2(prix-coutUnit);
  const taux=prix>0?Math.round(marge/prix*1000)/10:0;
  const sc=flavorScale(taux);
  const projMarge = piecesHist>0 ? money2(marge*piecesHist) : null;
  out.innerHTML=`
    <div class="sum-box"><span>Marge / pièce à ce prix</span><b style="color:${marge>=0?'#3f7d52':'#b3261e'}">${euro(marge)} (${taux}%)</b></div>
    <div class="sum-box"><span>Note de rentabilité</span><b><span class="tag" style="background:${sc.col};color:#fff">${sc.dot} ${sc.label}</span></b></div>
    ${projMarge!=null?`<div class="sum-box"><span>Marge brute si volume = historique (${qty(piecesHist)} pc)</span><b style="color:${projMarge>=0?'#3f7d52':'#b3261e'}">${euro(projMarge)}</b></div>`:''}`;
}

// PRÉVISION : marge prévisionnelle d'un batch (avant production).
async function parfumBatchSim(){
  const [recipes, recipeItems, lots]=await Promise.all([db.recipes.toArray(), db.recipeItems.toArray(), db.materialLots.toArray()]);
  if(!recipes.length){ toast('Crée d\'abord une recette'); return; }
  const s=getSettings();
  const opts=recipes.map(r=>`<option value="${r.id}">${esc(r.produitNom)}</option>`).join('');
  openModal(`<h3>🧮 Marge prévisionnelle d'un batch</h3>
    <div class="field"><label>Parfum</label><select id="bs_rec" onchange="parfumBatchSimUpdate()">${opts}</select></div>
    <div class="row2">
      <div class="field"><label>Nombre de batchs</label><input type="number" min="1" step="1" id="bs_n" value="1" oninput="parfumBatchSimUpdate()"></div>
      <div class="field"><label>Prix de vente / pièce (€)</label><input type="number" min="0" step="0.05" id="bs_prix" value="${s.prixVenteUnitaire||2.50}" oninput="parfumBatchSimUpdate()"></div>
    </div>
    <div id="bs_out"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`);
  // stocke les données pour le calcul live
  window._bsData={recipes, recipeItems, lots, settings:s};
  // pré-remplit le prix avec le prix de vente moyen si dispo
  parfumBatchSimUpdate();
}
function parfumBatchSimUpdate(){
  const d=window._bsData; if(!d) return;
  const out=document.getElementById('bs_out'); if(!out) return;
  const rid=+val('bs_rec'); const n=Math.max(1,+val('bs_n')||1); const prix=+val('bs_prix')||0;
  const r=d.recipes.find(x=>x.id===rid); if(!r){ out.innerHTML=''; return; }
  const c=coutRevientRecette(r, d.recipeItems, d.lots, d.settings);
  const pieces=round3(c.piecesUtiles*n);
  const coutTotal=money2(c.coutRevientBatch*n);
  const ca=money2(prix*pieces);
  const margeBrute=money2(ca-coutTotal);
  const chargesSoc=money2(ca*d.settings.socialGoods/100);
  const margeNette=money2(margeBrute-chargesSoc);
  const taux=ca>0?Math.round(margeBrute/ca*1000)/10:0;
  const sc=flavorScale(taux);
  out.innerHTML=`
    <div class="sum-box"><span>Pièces vendables (${n} batch)</span><b>${qty(pieces)}${c.pertePct>0?` <span style="color:#9a8a82;font-weight:400">(−${c.pertePct}%)</span>`:''}</b></div>
    <div class="sum-box"><span>Coût de revient total</span><b>${euro(coutTotal)}</b> <span style="color:#9a8a82;font-size:.72rem">(${euro(c.coutRevientUnit)}/pc)</span></div>
    <div class="sum-box"><span>CA prévisionnel (tout vendu)</span><b>${euro(ca)}</b></div>
    <div class="sum-box"><span>Marge brute prévisionnelle</span><b style="color:${margeBrute>=0?'#3f7d52':'#b3261e'}">${euro(margeBrute)} (${taux}%)</b></div>
    <div class="sum-box"><span>Marge nette estimée</span><b style="color:${margeNette>=0?'#3f7d52':'#b3261e'}">${euro(margeNette)}</b> <span style="color:#9a8a82;font-size:.72rem">après charges ${d.settings.socialGoods}%</span></div>
    <div class="sum-box"><span>Note</span><b><span class="tag" style="background:${sc.col};color:#fff">${sc.dot} ${sc.label}</span></b></div>`;
}

// PRÉVISION : mix de parfums optimal pour maximiser le bénéfice attendu.
async function parfumMixOptim(){
  const [recipes, recipeItems, lots, mats, orders, markets, marketMoves, productions]=await Promise.all([
    db.recipes.toArray(), db.recipeItems.toArray(), db.materialLots.toArray(), db.materials.toArray(),
    db.orders.toArray(), db.markets.toArray(), db.marketMoves.toArray(), db.productions.toArray()
  ]);
  const s=getSettings();
  const data={recipes, recipeItems, lots, mats, orders, markets, marketMoves, productions, settings:s};
  const A=analyzeFlavorProfitability(data);
  const sold=A.rows.filter(r=>r.piecesVendues>0 && r.margeUnit!=null);
  if(!sold.length){ openModal(`<h3>🎯 Mix de parfums optimal</h3><p class="note">Pas assez d'historique de vente. Enregistrez des commandes et des marchés pour estimer la demande et la marge par parfum.</p><div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`); return; }

  // poids de demande = part des pièces vendues ; score = marge unitaire × demande relative
  const totPieces=sold.reduce((x,r)=>x+r.piecesVendues,0);
  const scored=sold.map(r=>({...r, demandePct: totPieces>0?r.piecesVendues/totPieces*100:0,
    score: money2(r.margeUnit * (r.piecesVendues/Math.max(1,totPieces)))}))
    .sort((a,b)=>b.score-a.score);

  // recommandation pour un volume cible (ex : 300 pièces) réparti au prorata marge×demande
  const cible=300;
  const sumScore=scored.reduce((x,r)=>x+Math.max(0,r.margeUnit)*r.piecesVendues,0);
  const mix=scored.map(r=>{
    const part=sumScore>0?(Math.max(0,r.margeUnit)*r.piecesVendues)/sumScore:0;
    const q=Math.round(cible*part);
    return {...r, q, margeAttendue:money2(q*r.margeUnit)};
  }).filter(m=>m.q>0);
  const margeTot=money2(mix.reduce((x,m)=>x+m.margeAttendue,0));

  openModal(`<h3>🎯 Mix de parfums optimal</h3>
    <p class="note">Répartition conseillée pour <b>${cible} pièces</b>, pondérée par la marge unitaire et la demande historique. Maximise le bénéfice attendu pour un volume donné.</p>
    <div class="table-wrap"><table><thead><tr><th>Parfum</th><th>Part conseillée</th><th>Marge/pc</th><th>Marge attendue</th></tr></thead><tbody>
      ${mix.map(m=>`<tr><td><b>${esc(m.nom)}</b><br><span style="color:#9a8a82;font-size:.7rem">demande ${m.demandePct.toFixed(0)}%</span></td>
        <td>${m.q} pc</td><td style="color:${m.margeUnit>=0?'#3f7d52':'#b3261e'}">${euro(m.margeUnit)}</td>
        <td style="font-weight:600">${euro(m.margeAttendue)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="sum-box" style="margin-top:8px"><span><b>Marge brute attendue (${cible} pc)</b></span><b style="color:#3f7d52">${euro(margeTot)}</b></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`);
}

// PRÉVISION : gain estimé d'un marché d'après l'historique.
async function parfumMarketGain(){
  const [markets, marketMoves, recipes, recipeItems, lots]=await Promise.all([
    db.markets.toArray(), db.marketMoves.toArray(), db.recipes.toArray(), db.recipeItems.toArray(), db.materialLots.toArray()
  ]);
  const clos=markets.filter(m=>m.statut==='clos');
  if(!clos.length){ openModal(`<h3>⛺ Gain estimé d'un marché</h3><p class="note">Aucun marché clôturé dans l'historique. Clôturez au moins un marché pour obtenir une estimation.</p><div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`); return; }
  const avgUnit=avgMacaronCost(recipes, recipeItems, lots);
  const movesByMk={}; marketMoves.forEach(mv=>{(movesByMk[mv.marketId] ||= []).push(mv);});
  let caTot=0, margeTot=0, venduTot=0;
  clos.forEach(mk=>{ const T=marketTotals(mk, movesByMk[mk.id]||[], avgUnit); caTot+=T.caTotal; margeTot+=T.margeNette; venduTot+=T.vendu; });
  const caMoy=money2(caTot/clos.length), margeMoy=money2(margeTot/clos.length), venduMoy=round3(venduTot/clos.length);
  openModal(`<h3>⛺ Gain estimé d'un marché</h3>
    <p class="note">Moyenne sur ${clos.length} marché(s) clôturé(s).</p>
    <div class="sum-box"><span>CA moyen / marché</span><b>${euro(caMoy)}</b></div>
    <div class="sum-box"><span>Pièces vendues / marché</span><b>${qty(venduMoy)}</b></div>
    <div class="sum-box"><span>Marge nette moyenne / marché</span><b style="color:${margeMoy>=0?'#3f7d52':'#b3261e'}">${euro(margeMoy)}</b></div>
    <p class="note">Estimation indicative : les ventes réelles dépendent de la météo, de l'affluence et du mix de parfums embarqué.</p>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`);
}

// Réglages coûts & main-d'œuvre (raccourci vers les paramètres pertinents).
function parfumSettingsForm(){
  const s=getSettings();
  const grid=s.prixParFormat||{};
  const fmtKeys=[...new Set([...BOX_SIZES, ...Object.keys(grid).map(Number)])].filter(n=>n>0).sort((a,b)=>a-b);
  openModal(`<h3>⚙ Prix, coûts & main-d'œuvre</h3>
    <p class="note">Le CA réel reste toujours le CA encaissé. La grille ci-dessous (prix dégressif par format) sert à estimer un prix moyen pondéré et à détecter les incohérences de CA.</p>
    <label style="font-weight:600;font-size:.9rem">Prix de vente par format (€ / macaron)</label>
    <div class="row2" style="margin-top:6px">
      ${fmtKeys.map(k=>`<div class="field"><label>Coffret ${k} macarons</label><input type="number" step="0.01" min="0" id="ps_pf_${k}" value="${grid[k]!=null?grid[k]:''}" placeholder="€/pièce"></div>`).join('')}
    </div>
    <input type="hidden" id="ps_pf_keys" value="${fmtKeys.join(',')}">
    <div class="field" style="margin-top:8px"><label>Tarif PRO — macaron standard (€ / macaron) <span style="color:#9a8a82;font-weight:400">— vrac en boîte réutilisable</span></label>
      <input type="number" step="0.01" min="0" id="ps_propstd" value="${s.prixMacaronProStd!=null?s.prixMacaronProStd:1.40}" placeholder="1.40"></div>
    <div class="field"><label>Tarif PRO — macaron grand format (€ / pièce)</label>
      <input type="number" step="0.01" min="0" id="ps_progf" value="${s.prixGrandFormatPro!=null?s.prixGrandFormatPro:3.20}" placeholder="3.20"></div>
    <hr style="border:none;border-top:1px solid #ece2d4;margin:12px 0">
    <div class="field"><label class="pay-opt" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="ps_labor" ${s.laborEnabled?'checked':''}> <span>Inclure la main-d'œuvre dans le coût de revient</span></label></div>
    <div class="field"><label>Taux horaire main-d'œuvre (€/h)</label><input type="number" step="0.5" min="0" id="ps_rate" value="${s.laborRate}"></div>
    <p class="note">Le temps de fabrication (min/batch), les pertes et les consommables se règlent par recette.</p>
    <div class="row2">
      <div class="field"><label>Charges sociales — marchandise (%)</label><input type="number" step="0.1" id="ps_sg" value="${s.socialGoods}"></div>
      <div class="field"><label>Charges sociales — prestation (%)</label><input type="number" step="0.1" id="ps_ss" value="${s.socialService}"></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="parfumSettingsSave()">Enregistrer</button></div>`);
}
function parfumSettingsSave(){
  const s=getSettings();
  const keys=(val('ps_pf_keys')||'').split(',').map(Number).filter(n=>n>0);
  const grid={}; keys.forEach(k=>{ const v=+val('ps_pf_'+k); if(v>0) grid[k]=money2(v); });
  if(Object.keys(grid).length) s.prixParFormat=grid;
  // prix de repli = moyenne simple de la grille
  const vals=Object.values(s.prixParFormat||{}).map(Number).filter(x=>x>0);
  if(vals.length) s.prixVenteUnitaire=money2(vals.reduce((a,b)=>a+b,0)/vals.length);
  { const pp=+val('ps_propstd'); if(pp>0) s.prixMacaronProStd=money2(pp); }
  { const pg=+val('ps_progf'); if(pg>0) s.prixGrandFormatPro=money2(pg); }
  s.laborEnabled=document.getElementById('ps_labor')?.checked||false;
  s.laborRate=Math.max(0,+val('ps_rate')||0);
  s.socialGoods=Math.max(0,+val('ps_sg')||0);
  s.socialService=Math.max(0,+val('ps_ss')||0);
  saveSettings(s);
  closeModal(); renderParfums(); toast('Paramètres enregistrés ✓');
}

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
async function settingsForm(){
  const s=getSettings();
  // Coût RÉEL d'emballage par format, calculé sur les lots effectivement reçus (factures).
  let realMap=new Map();
  try{
    const [mats, lots] = await Promise.all([db.materials.toArray(), db.materialLots.toArray()]);
    realMap = realPackagingCostMap(mats, lots);
  }catch(e){ console.error('settingsForm realMap', e); }
  openModal(`<h3>Paramètres de gestion</h3>
    <p class="note">Charges sociales appliquées au calcul de la marge nette.</p>
    <div class="row2">
      <div class="field"><label>Charges sociales — marchandise (%)</label><input type="number" step="0.1" id="set_sg" value="${s.socialGoods}"></div>
      <div class="field"><label>Charges sociales — prestation (%)</label><input type="number" step="0.1" id="set_ss" value="${s.socialService}"></div>
    </div>
    <p class="note" style="margin-top:8px"><b>Coût emballage par coffret.</b> <span style="color:#9a8a82">Le coût <b>réel</b> est calculé automatiquement sur tes <b>lots d'emballage reçus</b> (moyenne pondérée d'après tes factures). Le tarif saisi ci-dessous ne sert que de <b>repli</b> si aucun lot chiffré n'existe pour ce format.</span></p>
    <div class="row2">
      ${BOX_SIZES.map(t=>{ const reel=realMap.get(+t); const manuel=s.packaging[t]!=null?s.packaging[t]:0;
        return `<div class="field"><label>Coffret ${t}</label>
          <input type="number" step="0.01" id="set_pk_${t}" value="${manuel}">
          ${reel!=null
            ? `<div style="font-size:.72rem;color:#2e7d32;margin-top:3px">✓ réel (lots reçus) : <b>${euro(reel)}</b> <span style="color:#9a8a82">— utilisé dans les calculs</span></div>`
            : `<div style="font-size:.72rem;color:#b07a4a;margin-top:3px">⚠ aucun lot chiffré — c'est le tarif saisi qui est utilisé</div>`}
        </div>`; }).join('')}
    </div>
    <p class="note" style="margin-top:6px;color:#9a8a82">Pour obtenir un coût réel, réceptionne tes emballages comme des lots (avec leur prix de facture) : <b>Matières → ↘ Réception lot</b>, en choisissant une matière de catégorie « emballage » dont la <b>capacité</b> correspond au format (6, 8, 16 ou 25).</p>
    <button type="button" class="btn ghost sm" style="margin-top:6px" onclick="applyPackaging202511()" title="Remplit les champs avec les tarifs reçus le 28/11/2025">↺ Appliquer les tarifs du 28/11/2025 (6→1,26 · 8→2,18 · 16→1,90 · 25→2,32)</button>
    <div id="pkgDiag" style="margin-top:8px;font-size:.74rem;color:#9a8a82;background:#f7f3ee;border:1px solid #ece3d6;border-radius:8px;padding:8px 10px;line-height:1.6">
      ${(()=>{ try{ const raw=JSON.parse(localStorage.getItem('sm_settings')||'{}'); const st=raw.packaging||{}; const ef=getSettings().packaging;
        return `🔎 <b>Diagnostic</b> — valeurs réellement en mémoire :<br>`
          + `Stocké : ${BOX_SIZES.map(t=>`${t}→${st[t]!=null?st[t]:'∅'}`).join(' · ')}<br>`
          + `Effectif : ${BOX_SIZES.map(t=>`${t}→${ef[t]}`).join(' · ')}<br>`
          + `Date réf. stockée : ${raw.packagingDate||'∅'}`;
      }catch(e){ return 'Diagnostic indisponible'; } })()}
    </div>
    <p class="note" style="margin-top:8px">Types d'emballage pour le comptage avant/après en marché : nom, coût unitaire €, et <b>capacité</b> (nb de macarons par boîte — sert à reconstituer le CA par format). Laissez le nom vide pour retirer une ligne.</p>
    <div class="pay-row" style="font-weight:600;color:#9a8a82;font-size:.8rem"><span style="flex:1">Nom</span><span style="width:90px">€/u</span><span style="width:70px">Capacité</span></div>
    <div id="set_pktypes">
      ${(s.packTypes||[]).concat([{nom:'',cout:'',capacite:''}]).map((t,i)=>`<div class="pay-row"><input id="set_pt_n_${i}" value="${esc(t.nom||'')}" placeholder="nom (ex: Boîte 6)" style="flex:1"><input type="number" step="0.01" min="0" id="set_pt_c_${i}" value="${t.cout!==''&&t.cout!=null?t.cout:''}" placeholder="€/u" style="width:90px"><input type="number" step="1" min="0" id="set_pt_cap_${i}" value="${t.capacite!==''&&t.capacite!=null?t.capacite:''}" placeholder="pc" style="width:70px"></div>`).join('')}
    </div>
    <p class="note" style="margin-top:8px">Livraison : sert à chiffrer le carburant (aller-retour) et le coût du temps de livraison.</p>
    <div class="row2">
      <div class="field"><label>Consommation véhicule (L/100 km)</label><input type="number" step="0.1" min="0" id="set_conso" value="${s.vehicleConso}"></div>
      <div class="field"><label>Coût horaire main-d'œuvre (€/h)</label><input type="number" step="0.5" min="0" id="set_rate" value="${s.laborRate}"></div>
    </div>
    <input type="hidden" id="set_pt_n" value="${(s.packTypes||[]).length+1}">
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveSettingsForm()">Enregistrer</button></div>`);
}
function saveSettingsForm(){
  const s=getSettings();
  s.socialGoods=Math.max(0,+val('set_sg')||0);
  s.socialService=Math.max(0,+val('set_ss')||0);
  s.vehicleConso=Math.max(0,+val('set_conso')||0);
  s.laborRate=Math.max(0,+val('set_rate')||0);
  // Si un tarif d'emballage change, on horodate la nouvelle grille à aujourd'hui (date de réception).
  const oldPack=JSON.stringify(s.packaging||{});
  s.packaging={}; BOX_SIZES.forEach(t=>{ s.packaging[t]=money2(+val('set_pk_'+t)||0); });
  if(JSON.stringify(s.packaging)!==oldPack) s.packagingDate=today();
  // types d'emballage (on lit toutes les lignes, on garde celles avec un nom)
  const n=+val('set_pt_n')||0; const pts=[];
  for(let i=0;i<n;i++){ const nom=(val('set_pt_n_'+i)||'').trim(); if(!nom) continue; pts.push({nom, cout:money2(+val('set_pt_c_'+i)||0), capacite:Math.max(0,+val('set_pt_cap_'+i)||0)}); }
  s.packTypes=pts.length?pts:SETTINGS_DEFAULTS.packTypes;
  saveSettings(s);
  closeModal();
  if(view==='rentabilite') renderProfit(); else if(view==='compta') renderCompta(); else if(view==='marches') renderMarkets(); else toast('Paramètres enregistrés ✓');
  toast('Paramètres enregistrés ✓');
}

/* ============================================================
   MARCHÉS / VENTES ITINÉRANTES — écrans
   ============================================================ */
// Mémoire (marchés clos + leurs totaux) pour les popups détaillés.
let _marketsPer = [];

// Popup générique listant les marchés clos selon une métrique, avec code couleur vert/rouge.
function _marketPopup(opts){
  const per=_marketsPer||[];
  if(!per.length){ openModal(`<h3>${opts.titre}</h3><p class="note">Aucun marché clôturé pour le moment.</p><div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`); return; }
  const items=per.map(({mk,T})=>({nom:mk.nom||mk.lieu||'—', date:mk.date, v:opts.val(T)}));
  // moyenne de référence pour le code couleur (sauf si métrique « plus bas = mieux »)
  const moy=items.reduce((s,x)=>s+x.v,0)/items.length;
  items.sort((a,b)=> opts.asc ? a.v-b.v : b.v-a.v);
  const body=items.map(x=>{
    // « bon » = au-dessus de la moyenne, sauf pour les invendus où c'est l'inverse
    const bon = opts.lowerIsBetter ? x.v<=moy : x.v>=moy;
    const col=bon?'#2e7d32':'#b3261e'; const dot=bon?'🟢':'🔴';
    return `<div class="sum-box" style="border-left:3px solid ${col}"><span>${dot} ${esc(x.nom)} <span style="color:#9a8a82;font-size:.74rem">${x.date?fmtDate(x.date):''}</span></span><b style="color:${col}">${opts.fmt(x.v)}</b></div>`;
  }).join('');
  openModal(`<h3>${opts.titre}</h3>
    <p class="note" style="margin-bottom:10px">${opts.note}</p>
    <div style="max-height:48vh;overflow:auto">${body}</div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`);
}
function marketCAPopup(){ _marketPopup({titre:'⛺ CA par marché clôturé', note:'Chiffre d\'affaires encaissé de chaque marché, du plus gros au plus petit. 🟢 au-dessus de la moyenne, 🔴 en dessous.', val:T=>T.caTotal, fmt:v=>euro(v)}); }
function marketMargePopup(){ _marketPopup({titre:'⛺ Marge nette par marché', note:'Marge nette après coûts (matière, emballage, stand, déplacement) et charges sociales. 🟢 rentable, 🔴 à surveiller.', val:T=>T.margeNette, fmt:v=>euro(v)}); }
function marketInvendusPopup(){ _marketPopup({titre:'⛺ Taux d\'invendus par marché', note:'Part des macarons embarqués non vendus (retour + don + perte). Ici 🟢 = peu d\'invendus (mieux), 🔴 = beaucoup (à corriger : moins produire ou mieux vendre).', val:T=>T.tauxInvendus, fmt:v=>v+'%', lowerIsBetter:true, asc:true}); }
function marketVendusPopup(){ _marketPopup({titre:'⛺ Macarons vendus par marché', note:'Volume vendu sur chaque marché. 🟢 au-dessus de la moyenne, 🔴 en dessous.', val:T=>T.vendu, fmt:v=>qty(v)+' pc'}); }

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
  _marketsPer = perMarket.filter(x=>x.mk.statut==='clos');   // pour les popups détaillés

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
     <div class="kpi lnk" onclick="marketCAPopup()"><span>CA marchés (clos) ${INFO_I}</span><b>${euro(caTotal)}</b><span>${nbClos} marché(s)</span></div>
     <div class="kpi"><span>CA moyen / marché</span><b>${euro(caMoyen)}</b></div>
     <div class="kpi lnk" onclick="marketMargePopup()"><span>Marge nette marchés ${INFO_I}</span><b style="color:${margeNetteTotal>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(margeNetteTotal)}</b></div>
     <div class="kpi lnk" onclick="marketVendusPopup()"><span>Macarons vendus ${INFO_I}</span><b>${qty(venduTotal)}</b></div>
     <div class="kpi lnk" onclick="marketInvendusPopup()"><span>Taux d'invendus moyen ${INFO_I}</span><b>${invMoyen}%</b></div>
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
    <div class="field"><label>Fond de caisse au départ (€) <span style="color:#9a8a82;font-weight:400">— déduit automatiquement du résultat</span></label>
      <input type="number" min="0" step="1" id="mk_fond" value="${mk.fondCaisse!=null?esc(mk.fondCaisse):''}" placeholder="ex : 50"></div>
    <h4 style="margin:14px 0 4px;color:var(--bordeaux)">Charges du marché</h4>
    <div class="field"><label>Prix du stand / emplacement (€)</label>
      <input type="number" min="0" step="0.5" id="mk_stand" value="${mk.coutStand!=null?esc(mk.coutStand):''}" placeholder="ex : 25"></div>
    <div class="row2">
      <div class="field"><label>Distance aller (km) <span style="color:#9a8a82;font-weight:400">— A/R calculé</span></label>
        <input type="number" min="0" step="0.1" id="mk_dist" value="${mk.distanceKm!=null?esc(mk.distanceKm):''}" placeholder="ex : 18"></div>
      <div class="field"><label>Prix carburant (€/L)</label>
        <input type="number" min="0" step="0.001" id="mk_carbu" value="${mk.prixCarburant!=null?esc(mk.prixCarburant):''}" placeholder="ex : 1.85"></div>
    </div>
    <div class="field"><label>Temps de route aller (min) <span style="color:#9a8a82;font-weight:400">— l'aller-retour est calculé (×2), valorisé au taux horaire</span></label>
      <input type="number" min="0" step="1" id="mk_route" value="${mk.tempsRouteMin!=null?esc(mk.tempsRouteMin):''}" placeholder="ex : 30"></div>
    <div class="field"><label>Consommation réelle du véhicule (L/100 km) <span style="color:#9a8a82;font-weight:400">— vide = défaut (${getSettings().vehicleConso} L)</span></label>
      <input type="number" min="0" step="0.1" id="mk_conso" value="${mk.consoVehicule!=null&&mk.consoVehicule!==''?esc(mk.consoVehicule):''}" placeholder="ex : 7.2"></div>
    <div class="field"><label>Quantité prévue à emporter (macarons) <span style="color:#9a8a82;font-weight:400">— pour la planification intelligente</span></label>
      <input type="number" min="0" step="10" id="mk_prevu" value="${mk.prevuQte!=null?esc(mk.prevuQte):''}" placeholder="ex : 300">
      <p class="note" id="mk_prevuHint" style="margin-top:4px"></p></div>
    <div class="field"><label>Commentaires</label><textarea id="mk_notes" rows="2">${esc(mk.notes||'')}</textarea></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn" onclick="saveMarket(${id||0})">Enregistrer</button></div>`);
  // suggestion intelligente basée sur l'historique des marchés clos
  marketPrevuSuggestion();
}
// Propose une quantité prévisionnelle d'après la moyenne des ventes des marchés passés.
async function marketPrevuSuggestion(){
  const hint=document.getElementById('mk_prevuHint'); if(!hint) return;
  try{
    const fc = await marketForecast();
    if(fc.nbMarches>0){
      hint.innerHTML = `💡 D'après tes ${fc.nbMarches} marché(s) passé(s) : ~<b>${fc.moyenneVendu}</b> macarons vendus en moyenne (max ${fc.maxVendu}). `+
        `<span class="act" onclick="document.getElementById('mk_prevu').value=${fc.suggestion}">Utiliser ${fc.suggestion}</span>`;
    } else {
      hint.textContent = 'Aucun historique de marché pour le moment — la suggestion s’affinera après tes premiers marchés clôturés.';
    }
  }catch(e){ /* silencieux */ }
}
async function saveMarket(id){
  const nom=val('mk_nom'), date=val('mk_date');
  if(!nom){ toast('Nom obligatoire'); return; }
  if(!date){ toast('Date obligatoire'); return; }
  const o={nom, date, lieu:val('mk_lieu'), horaires:val('mk_horaires'), heures:+val('mk_heures')||0,
    meteo:val('mk_meteo'), notes:val('mk_notes'), prevuQte:+val('mk_prevu')||0, fondCaisse:+val('mk_fond')||0,
    coutStand:+val('mk_stand')||0, distanceKm:+val('mk_dist')||0, prixCarburant:+val('mk_carbu')||0, tempsRouteMin:+val('mk_route')||0, consoVehicule: val('mk_conso')!==''?(+val('mk_conso')||0):null};
  if(id){ await db.markets.update(id,o); }
  else { o.statut='ouvert'; o.ca={especes:0,cb:0,autre:0}; id=await db.markets.add(o); }
  // Connexion calendrier : un marché planifié apparaît dans l'agenda (type 'marche').
  const evRef='mk'+id;
  await db.events.where('refId').equals(evRef).delete().catch(()=>{});
  await db.events.add({date:o.date, titre:'⛺ '+nom+(o.prevuQte?` (${o.prevuQte} prévus)`:''), type:'marche', refId:evRef}).catch(()=>{});
  closeModal(); renderMarkets(); toast('Marché enregistré ✓');
}
async function delMarket(id){
  if(!confirm('Supprimer ce marché et son historique ? Les invendus non retournés ne seront pas recrédités.')) return;
  await doDelMarket(id);
}
async function doDelMarket(id){
  const mk=await db.markets.get(id);
  const moves=await db.marketMoves.where('marketId').equals(id).toArray().catch(()=>[]);
  const evs=await db.events.where('refId').equals('mk'+id).toArray().catch(()=>[]);
  const snap={market:mk?{...mk}:null, moves:moves.map(m=>({...m})), events:evs.map(e=>({...e}))};
  await db.transaction('rw', db.markets, db.marketMoves, async()=>{
    await db.marketMoves.where('marketId').equals(id).delete();
    await db.markets.delete(id);
  });
  await db.events.where('refId').equals('mk'+id).delete().catch(()=>{});
  renderMarkets();
  if(snap.market) showUndoToast('Marché supprimé', async()=>{
    await db.transaction('rw', db.markets, db.marketMoves, db.events, async()=>{
      await db.markets.put(snap.market);
      for(const m of snap.moves){ await db.marketMoves.put(m); }
      for(const e of snap.events){ await db.events.put(e); }
    });
    renderMarkets();
  });
  else toast('Marché supprimé ✓');
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
    ${clos?`<div class="sum-box"><span>CA encaissé (saisi)</span><b>${euro(T.caTotal)}</b></div>
      ${(()=>{ const s=getSettings(); const bd=marketFormatBreakdown(mk, s);
        let caTheo, lbl;
        if(bd.hasData){ caTheo=bd.caTheo; lbl=`CA théorique (${bd.coffrets} coffret(s), prix moy. ${euro(bd.prixMoyen)})`; }
        else { const pu=+s.prixVenteUnitaire||0; caTheo=money2(T.vendu*pu); lbl=`CA théorique (${qty(T.vendu)} × ${euro(pu)})`; }
        const ecart=money2(T.caTotal-caTheo);
        return `<div class="sum-box"><span>${lbl}</span><b>${euro(caTheo)}</b></div>
        <div class="sum-box"><span>Écart encaissé − théorique</span><b style="color:${Math.abs(ecart)<0.01?'#3f7d52':(ecart<0?'var(--red,#b3261e)':'#d98324')}">${ecart>0?'+':''}${euro(ecart)}${Math.abs(ecart)>=0.5?' ⚠':' ✓'}</b></div>
        ${!bd.hasData?'<div class="note" style="margin:2px 0 0">Renseignez le comptage d\'emballages (capacités) pour un CA théorique reconstitué par format.</div>':''}`; })()}
      ${T.fondCaisse>0?`<div class="sum-box"><span>Fond de caisse (déduit)</span><b>−${euro(T.fondCaisse)}</b></div>
      <div class="sum-box" style="color:#9a8a82"><span>Espèces comptées (fond inclus)</span><b>${euro(T.caEspecesBrut)}</b></div>`:''}
      <div class="sum-box"><span>Espèces / CB / Autre</span><b>${euro(T.caEspeces)} / ${euro(T.caCB)} / ${euro(T.caAutre)}</b></div>
      <div class="sum-box"><span>Répartition</span><b>CB ${T.pctCB}% · Espèces ${T.pctEspeces}%</b></div>
      <div class="sum-box"><span>Taux d'invendus / pertes</span><b>${T.tauxInvendus}% / ${T.tauxPerte}%</b></div>
      ${mk.heures>0?`<div class="sum-box"><span>CA / heure</span><b>${euro(T.caParHeure)}</b></div>`:''}
      <h3 style="font-size:.95rem;margin:12px 0 6px">Rentabilité</h3>
      <div class="sum-box"><span>Coût matières (${qty(T.vendu)} vendus)</span><b>−${euro(T.coutMat)}</b></div>
      <div class="sum-box"><span>Coût emballages (delta ${qty(T.pkgUsed)} u.)</span><b>−${euro(T.coutEmb)}</b></div>
      ${T.coutStand>0?`<div class="sum-box"><span>Prix du stand</span><b>−${euro(T.coutStand)}</b></div>`:''}
      ${T.deplacement&&T.deplacement.total>0?`<div class="sum-box"><span>Déplacement (A/R ${T.deplacement.distAR} km${T.deplacement.minutes?` · ${T.deplacement.minutes} min`:''})</span><b>−${euro(T.deplacement.total)}</b></div>`:''}
      <div class="sum-box"><span>Marge brute</span><b>${euro(T.margeBrute)} <span style="color:#9a8a82;font-weight:400">(${T.tauxBrut}%)</span></b></div>
      <div class="sum-box"><span>Charges sociales (${getSettings().socialGoods}%)</span><b>−${euro(T.chargesSociales)}</b></div>
      <div class="sum-box"><span><b>Marge nette</b></span><b style="color:${T.margeNette>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(T.margeNette)} (${T.tauxNet}%)</b></div>
      <button class="btn ghost sm" style="margin-top:8px" onclick="marketPackagingForm(${id})">📦 Comptage emballages (avant/après)</button>`
     :`<button class="btn gold" style="width:100%;margin-top:10px" onclick="marketCloseForm(${id})">Clôturer le marché (saisir le CA)</button>`}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
      <button class="btn ghost" onclick="marketForm(${id})">Modifier la fiche</button>
      <button class="btn danger" onclick="confirmDelMarket(${id})">🗑 Supprimer</button></div>`);
}
function confirmDelMarket(id){
  openModal(`<h3>Supprimer ce marché ?</h3>
    <p class="note">Cette action est définitive. Les données du marché (CA, comptages, planning) seront supprimées.</p>
    <div class="modal-actions"><button class="btn ghost" onclick="marketDetail(${id})">Annuler</button>
      <button class="btn danger" onclick="closeModal();doDelMarket(${id})">Supprimer définitivement</button></div>`);
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
    const decongele = p && aDejaDecongele(p);
    const empOpts = EMPLACEMENTS.map(e=>{
      const interdit = e.type==='congelateur' && decongele;
      return `<option value="${e.key}" ${interdit?'disabled':''}>${e.icon} ${esc(e.nom)} (${e.lettre})${interdit?' — interdit':''}</option>`;
    }).join('');
    return `<div class="pay-row" style="flex-wrap:wrap;align-items:flex-start">
      <span style="flex:1;min-width:120px">${esc(l.parfum||'(parfum ?)')}<br><span class="note">embarqué ${qty(l.sortie)}, déjà retourné ${qty(l.retour)}${decongele?' · ❄️→🧊 décongelé':''}</span></span>
      <input type="number" step="1" min="0" max="${restant}" id="mr_${i}" data-prod="${l.productionId}" data-parfum="${esc(l.parfum)}" placeholder="invendus" style="width:80px">
      <select id="md_${i}" style="width:150px">${empOpts}</select>
    </div>`;}).join('');
  openModal(`<h3>Retour de marché</h3>
    <p class="note">Saisissez les invendus rapportés par parfum et leur emplacement de rangement. Ils sont recrédités au stock atelier. ⚠️ Un produit <b>déjà décongelé</b> (congélateur → frigo) ne peut pas retourner au congélateur.</p>
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
  const s=getSettings();
  const bd=marketFormatBreakdown(mk, s);
  // CA théorique : priorité au CA reconstitué par formats (comptage emballages), sinon vendu × prix moyen pondéré
  const prixMoyen=(computeAvgSellPrice({orders:await db.orders.toArray(), markets:await db.markets.toArray(), settings:s}).prix)||0;
  const caTheo = bd.hasData ? bd.caTheo : money2(T.vendu*prixMoyen);
  const theoSrc = bd.hasData ? `${bd.coffrets} coffret(s) comptés` : `${qty(T.vendu)} × ${euro(prixMoyen)}`;
  openModal(`<h3>Clôture du marché</h3>
    <p class="note">Quantité vendue calculée : <b>${qty(T.vendu)}</b> macaron(s). Saisissez les encaissements par mode de paiement.</p>
    ${mk.fondCaisse>0?`<div class="banner" style="background:#fbf4e9;border-color:#e6d2a8"><div>💰 Fond de caisse de départ : <b>${euro(mk.fondCaisse)}</b>. Saisissez le total des <b>espèces comptées dans la caisse</b> (fond inclus) : il sera déduit automatiquement.</div></div>`:''}
    ${caTheo>0?`<div class="banner" style="background:#eef5f0;border-color:#bcd9c6"><div>CA théorique : <b>${euro(caTheo)}</b> (${theoSrc}).${bd.hasData?'':' Astuce : renseignez le comptage d\'emballages pour un CA reconstitué par format.'} <span class="act" onclick="document.getElementById('mc_esp').value=${money2((+caTheo)+(+mk.fondCaisse||0))};document.getElementById('mc_cb').value='';document.getElementById('mc_autre').value='';marketCloseSummary(${T.vendu},${caTheo})">Pré-remplir en espèces</span></div></div>`:''}
    <div class="field"><label>Espèces comptées (€)${mk.fondCaisse>0?' <span style="color:#9a8a82;font-weight:400">— fond inclus</span>':''}</label><input type="number" step="0.01" min="0" id="mc_esp" value="${(mk.ca&&mk.ca.especes)||''}"></div>
    <div class="field"><label>Carte bancaire (€)</label><input type="number" step="0.01" min="0" id="mc_cb" value="${(mk.ca&&mk.ca.cb)||''}"></div>
    <div class="field"><label>Autres (€) — optionnel</label><input type="number" step="0.01" min="0" id="mc_autre" value="${(mk.ca&&mk.ca.autre)||''}"></div>
    <div class="sum-box" id="mc_summary"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="marketDetail(${marketId})">Annuler</button>
      <button class="btn gold" onclick="marketDoClose(${marketId},${T.vendu})">Clôturer</button></div>`);
  ['mc_esp','mc_cb','mc_autre'].forEach(idf=>{ const el=document.getElementById(idf); if(el) el.oninput=()=>marketCloseSummary(T.vendu, caTheo); });
  window._mcFond = +mk.fondCaisse||0;
  marketCloseSummary(T.vendu, caTheo);
}
function marketCloseSummary(vendu, caTheo){
  const esp=+(document.getElementById('mc_esp')?.value)||0, cb=+(document.getElementById('mc_cb')?.value)||0, au=+(document.getElementById('mc_autre')?.value)||0;
  const fond=+(window._mcFond)||0;
  const espNet=Math.max(0, money2(esp-fond));
  const tot=addMoney(espNet,cb,au); const box=document.getElementById('mc_summary'); if(!box) return;
  const ppu = vendu>0 ? money2(tot/vendu) : 0;
  // cohérence : prix moyen par macaron plausible entre 0,80 € et 5 € (sinon alerte)
  let warn='';
  if(vendu>0 && tot>0 && (ppu<0.8 || ppu>5)) warn=`<div style="color:var(--red,#b3261e);margin-top:4px">⚠ Prix moyen ${euro(ppu)}/macaron : écart inhabituel, vérifiez le CA ou les quantités.</div>`;
  if(vendu>0 && tot===0) warn=`<div style="color:var(--red,#b3261e);margin-top:4px">⚠ ${qty(vendu)} vendus mais 0 € encaissé.</div>`;
  const fondLine = fond>0 ? `<div style="display:flex;justify-content:space-between;color:#9a8a82"><span>dont fond de caisse déduit</span><b>−${euro(fond)}</b></div>
    <div style="display:flex;justify-content:space-between"><span>Espèces nettes</span><b>${euro(espNet)}</b></div>`:'';
  box.innerHTML=`${fondLine}<div style="display:flex;justify-content:space-between"><span>Total encaissé${fond>0?' (net du fond)':''}</span><b>${euro(tot)}</b></div>
    <div style="display:flex;justify-content:space-between"><span>CB / Espèces</span><b>${tot>0?Math.round(cb/tot*100):0}% / ${tot>0?Math.round(espNet/tot*100):0}%</b></div>
    ${vendu>0?`<div style="display:flex;justify-content:space-between"><span>Prix moyen / macaron</span><b>${euro(ppu)}</b></div>`:''}${(()=>{ if(!(caTheo>0)) return ''; const ec=money2(tot-caTheo); return `<div style="display:flex;justify-content:space-between"><span>vs CA théorique (${euro(caTheo)})</span><b style="color:${Math.abs(ec)<0.01?'#3f7d52':(ec<0?'var(--red,#b3261e)':'#d98324')}">${ec>0?'+':''}${euro(ec)}</b></div>`; })()}${warn}`;
}
async function marketDoClose(marketId, vendu){
  const esp=money2(+val('mc_esp')||0), cb=money2(+val('mc_cb')||0), au=money2(+val('mc_autre')||0);
  const tot=addMoney(esp,cb,au);
  if(tot<=0 && vendu>0){ if(!confirm('Aucun encaissement saisi alors que des ventes sont calculées. Clôturer quand même ?')) return; }
  await db.markets.update(marketId, {ca:{especes:esp,cb:cb,autre:au}, statut:'clos', dateCloture:today()});
  toast('Marché clôturé ✓'); marketDetail(marketId);
}

// Comptage des emballages avant/après le marché : coût consommé = Σ((avant−après) × coût unitaire).
// La capacité (nb macarons/boîte) permet aussi de reconstituer le CA par format et le prix moyen réel.
async function marketPackagingForm(marketId){
  const mk=await db.markets.get(marketId); if(!mk) return;
  const types=getSettings().packTypes||[];
  const capOf=nom=>{ const t=types.find(x=>x.nom===nom); return t&&t.capacite!=null?+t.capacite:0; };
  // initialise depuis l'existant ou les types paramétrés (en récupérant la capacité)
  let pk = (mk.packaging && mk.packaging.length) ? mk.packaging.map(p=>({...p, capacite:(p.capacite!=null?p.capacite:capOf(p.nom))}))
    : types.map(t=>({nom:t.nom, cost:+t.cout||0, capacite:+t.capacite||0, before:'', after:''}));
  // fusionne d'éventuels nouveaux types paramétrés non encore présents
  types.forEach(t=>{ if(!pk.some(p=>p.nom===t.nom)) pk.push({nom:t.nom, cost:+t.cout||0, capacite:+t.capacite||0, before:'', after:''}); });
  const rows = pk.map((p,i)=>`<div class="pay-row" style="flex-wrap:wrap;align-items:center">
      <span style="flex:1;min-width:130px">${esc(p.nom)} <span class="note">(${euro(p.cost)}/u${p.capacite>0?` · ${p.capacite} pc`:''})</span></span>
      <input type="number" step="1" min="0" id="pk_b_${i}" value="${p.before!==''&&p.before!=null?p.before:''}" placeholder="avant" style="width:80px" oninput="marketPkBreakdown()">
      <input type="number" step="1" min="0" id="pk_a_${i}" value="${p.after!==''&&p.after!=null?p.after:''}" placeholder="après" style="width:80px" oninput="marketPkBreakdown()">
    </div>`).join('');
  openModal(`<h3>Comptage emballages</h3>
    <p class="note">Saisissez le stock d'emballages embarqué (avant) et rapporté (après). Le coût consommé = (avant − après) × coût unitaire. Les types et coûts se règlent dans ⚙ Paramètres.</p>
    <div class="pay-row" style="font-weight:600;color:#9a8a82"><span style="flex:1;min-width:130px">Type</span><span style="width:80px">Avant</span><span style="width:80px">Après</span></div>
    ${rows||'<p class="note">Aucun type d\'emballage paramétré.</p>'}
    <input type="hidden" id="pk_n" value="${pk.length}">
    <div class="sum-box" id="pk_breakdown" style="margin-top:8px"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="marketDetail(${marketId})">Retour</button>
      <button class="btn" onclick="marketDoPackaging(${marketId})">Enregistrer le comptage</button></div>`);
  // stocke les noms/coûts/capacités pour la sauvegarde
  window._pkDraft = pk;
  marketPkBreakdown();
}
// Recalcule en direct le CA par format reconstitué depuis le comptage d'emballages.
function marketPkBreakdown(){
  const box=document.getElementById('pk_breakdown'); if(!box) return;
  const pk=window._pkDraft||[]; const s=getSettings();
  let caTheo=0, pieces=0, coffrets=0; const parts=[];
  pk.forEach((p,i)=>{
    const cap=+p.capacite||0; if(cap<=0) return;
    const b=+val('pk_b_'+i)||0, a=+val('pk_a_'+i)||0; const n=Math.max(0,b-a);
    if(n<=0) return;
    const pu=prixParPiece(cap, s); const ca=money2(cap*n*pu);
    caTheo=money2(caTheo+ca); pieces+=cap*n; coffrets+=n;
    parts.push(`${n}× ${esc(p.nom)} = ${euro(ca)}`);
  });
  if(pieces<=0){ box.innerHTML='<span class="note">Renseignez les capacités (⚙ Paramètres) et le comptage pour reconstituer le CA par format.</span>'; return; }
  const prixMoy=money2(caTheo/pieces);
  box.innerHTML=`<div style="display:flex;justify-content:space-between"><span>Coffrets vendus / pièces</span><b>${coffrets} / ${pieces}</b></div>
    <div style="display:flex;justify-content:space-between"><span>CA reconstitué (formats)</span><b>${euro(caTheo)}</b></div>
    <div style="display:flex;justify-content:space-between"><span>Prix moyen pondéré</span><b>${euro(prixMoy)}</b></div>
    <div class="note" style="margin-top:4px">${parts.join(' · ')}</div>`;
}
async function marketDoPackaging(marketId){
  const pk=(window._pkDraft||[]).map((p,i)=>({
    nom:p.nom, cost:+p.cost||0, capacite:+p.capacite||0,
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
  _marketsPer = data;   // pour les popups détaillés (marge, invendus)

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Statistiques marchés</h1><p>${data.length} marché(s) clôturé(s)</p></div><button class="btn ghost sm" onclick="renderMarkets()">← Marchés</button></div>
   <div class="kpi-grid">
     <div class="kpi"><span>CA total marchés</span><b>${euro(caTotal)}</b></div>
     <div class="kpi"><span>CA moyen / marché</span><b>${euro(caMoyen)}</b></div>
     <div class="kpi lnk" onclick="marketMargePopup()"><span>Marge nette totale ${INFO_I}</span><b style="color:${margeNetteTot>=0?'#3f7d52':'var(--red,#b3261e)'}">${euro(margeNetteTot)}</b></div>
     <div class="kpi"><span>Macarons vendus</span><b>${qty(venduTotal)}</b></div>
     <div class="kpi lnk" onclick="marketInvendusPopup()"><span>Taux d'invendus global ${INFO_I}</span><b>${tauxInvGlobal}%</b></div>
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
// Analyse des temps de production par NATURE D'ACTIVITÉ (issue du chrono) et
// génération de conseils d'optimisation. Sans lien avec les productions.
async function ttActivityAnalysis(){
  const sessions = await db.workSessions.toArray().catch(()=>[]);
  const tagged = sessions.filter(s=>s.activite);
  const totalMin = sessions.reduce((a,s)=>a+(+s.dureeMin||0),0);
  const byAct={};
  tagged.forEach(s=>{ const k=s.activite; (byAct[k] ||= {min:0,n:0,pause:0}); byAct[k].min+=+s.dureeMin||0; byAct[k].n++; byAct[k].pause+=+s.pauseMin||0; });
  const rows=Object.keys(byAct).map(k=>({activite:k, min:byAct[k].min, n:byAct[k].n, moy:byAct[k].n?Math.round(byAct[k].min/byAct[k].n):0, pause:byAct[k].pause}))
    .sort((a,b)=>b.min-a.min);
  const taggedMin=rows.reduce((a,r)=>a+r.min,0);
  // Conseils d'optimisation (heuristiques simples, lisibles, non intrusives)
  const tips=[];
  if(rows.length){
    const top=rows[0];
    if(taggedMin>0 && top.min/taggedMin>=0.35){
      tips.push(`<b>${esc(top.activite)}</b> représente ${Math.round(top.min/taggedMin*100)}% de ton temps mesuré. C'est ton principal levier : regarde si une partie peut être préparée en lot ou en amont.`);
    }
    const vaisselle=rows.find(r=>/vaisselle/i.test(r.activite));
    if(vaisselle && taggedMin>0 && vaisselle.min/taggedMin>=0.15){
      tips.push(`La <b>vaisselle</b> pèse ${Math.round(vaisselle.min/taggedMin*100)}% du temps : grouper la vaisselle en fin de bloc (plutôt qu'au fil de l'eau) fait souvent gagner du temps.`);
    }
    const nettoyage=rows.find(r=>/nettoyage/i.test(r.activite));
    if(nettoyage && nettoyage.moy>=30){
      tips.push(`Le <b>nettoyage fin de prod</b> dure en moyenne ${nettoyage.moy} min : préparer le poste (produits, chiffons) avant de commencer réduit ce temps.`);
    }
    const pochage=rows.find(r=>/pochage/i.test(r.activite));
    const macaronnage=rows.find(r=>/macaronnage/i.test(r.activite));
    if(pochage && macaronnage && pochage.moy>macaronnage.moy*1.5){
      tips.push(`Ton <b>pochage</b> (${pochage.moy} min/séance) prend nettement plus de temps que le macaronnage : un gabarit ou une poche adaptée peut fluidifier le geste.`);
    }
    const totPause=rows.reduce((a,r)=>a+r.pause,0);
    if(taggedMin>0 && totPause/taggedMin>=0.2){
      tips.push(`Les pauses représentent ~${Math.round(totPause/taggedMin*100)}% du temps : si certaines sont des temps d'attente (cuisson, repos), tu peux les utiliser pour une autre activité (ganache pendant la cuisson).`);
    }
  }
  return {rows, totalMin, taggedMin, nbSessions:sessions.length, nbTagged:tagged.length, tips};
}
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

  // --- TEMPS DE PRODUCTION par nature d'activité (chrono) + conseils ---
  const TA = await ttActivityAnalysis();
  const fmtMin = m => { const h=Math.floor(m/60), mm=m%60; return h?`${h}h ${String(mm).padStart(2,'0')}m`:`${mm} min`; };
  let tempsBlock;
  if(!TA.nbTagged){
    tempsBlock = `<div class="panel"><h2>⏱ Temps par activité</h2>
      <p class="note">Lance le chrono (bouton ▶) et choisis une nature d'activité (ganache, meringue, macaronnage, pochage, vaisselle, nettoyage…). Après quelques sessions, tu verras ici la répartition de ton temps et des conseils d'optimisation.</p></div>`;
  } else {
    const maxMin = TA.rows[0]?.min||1;
    const barRows = TA.rows.map(r=>{
      const pct = TA.taggedMin? Math.round(r.min/TA.taggedMin*100):0;
      return `<div style="margin:6px 0">
        <div style="display:flex;justify-content:space-between;font-size:.85rem"><span>${esc(r.activite)}</span><b>${fmtMin(r.min)} · ${pct}% · ~${fmtMin(r.moy)}/séance</b></div>
        <div style="height:8px;background:#efe6d8;border-radius:6px;overflow:hidden"><span style="display:block;height:100%;width:${Math.round(r.min/maxMin*100)}%;background:var(--bordeaux)"></span></div></div>`;
    }).join('');
    const tipsHtml = TA.tips.length
      ? `<h3 style="font-size:.92rem;margin:12px 0 6px">💡 Conseils d'optimisation</h3>${TA.tips.map(t=>`<div class="sum-box" style="align-items:flex-start"><span>💡</span><span style="text-align:left">${t}</span></div>`).join('')}`
      : `<p class="note" style="margin-top:10px">Continue à taguer tes séances : des conseils d'optimisation apparaîtront avec plus de données.</p>`;
    tempsBlock = `<div class="panel"><h2>⏱ Temps par activité <span style="font-weight:400;font-size:.8rem;color:#9a8a82">— ${TA.nbTagged} séance(s) taguée(s) · ${fmtMin(TA.taggedMin)}</span></h2>
      ${barRows}${tipsHtml}</div>`;
  }

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Analyse &amp; Production</h1><p>Décisions opérationnelles · 100% hors-ligne</p></div></div>
   <div class="banner">🧭 <div>Vue décisionnelle : tendances, clients clés, anomalies, et besoins de production calculés à partir de vos commandes et recettes. Aucune donnée ne quitte l'appareil.</div></div>
   ${trendBlock}
   <h2 style="font-family:'Fraunces',serif;color:var(--bordeaux);margin:24px 0 4px;font-size:1.3rem">Clients</h2>
   ${clientBlock}
   <h2 style="font-family:'Fraunces',serif;color:var(--bordeaux);margin:24px 0 4px;font-size:1.3rem">Anomalies</h2>
   ${anoBlock}
   <h2 style="font-family:'Fraunces',serif;color:var(--bordeaux);margin:24px 0 4px;font-size:1.3rem">Production</h2>
   ${prodBlock}
   <h2 style="font-family:'Fraunces',serif;color:var(--bordeaux);margin:24px 0 4px;font-size:1.3rem">Temps de travail</h2>
   ${tempsBlock}`;
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
  // « après-demain » DOIT être testé AVANT « demain » : sinon /\bdemain\b/ matche
  // l'intérieur de « apres-demain » (le tiret/espace est une frontière de mot) et on
  // se tromperait d'un jour. On tolère le tiret ou l'espace entre « apres » et « demain ».
  if(/\bapres[-\s]demain\b/.test(txt)){ d.setDate(d.getDate()+2); return d.toISOString().slice(0,10); }
  if(/\bdemain\b/.test(txt)){ d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); }
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
// Extrait toutes les paires "quantité + parfum" d'une phrase, ex :
// "3 macarons mangue passion et 3 macarons chocolat" → [{qte:3,raw:'mangue passion'},{qte:3,raw:'chocolat'}]
function aiParseOrderItems(raw, flavors){
  let n=aiNormalize(raw);
  // retire la portion date ("le 19 juin", "pour le 5/06"…) pour ne pas confondre le jour avec une quantité
  n=n.replace(/\b(le|pour le|du|the)\s+\d{1,2}\s*(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|\/\d|[-.]\d)/g,' ');
  n=n.replace(/\b\d{1,2}[\/.-]\d{1,2}([\/.-]\d{2,4})?\b/g,' ');
  // ne garde que ce qui suit un mot déclencheur de contenu si présent (de/avec/:)
  const items=[];
  // motif : <nombre> macaron(s) <parfum...> — on EXIGE le mot "macaron" pour fiabiliser
  // (sinon on tente aussi <nombre> <parfum> après "de"/"avec")
  const reStrict=/(\d+)\s*macarons?\s+([a-zàâäéèêëïîôöùûüç' ]+?)(?=\s*(?:,|;|\bet\b|\bplus\b|\d+|$))/g;
  let m, used=false;
  while((m=reStrict.exec(n))){ used=true; _pushItem(items, +m[1], m[2]); }
  if(!used){
    // repli : "<nombre> <parfum>" après un connecteur de contenu
    const idx=n.search(/\b(de|d'|avec|contenant|:)\b/);
    const seg = idx>=0 ? n.slice(idx) : n;
    const re=/(\d+)\s*(?:pieces?|pcs?)?\s*([a-zàâäéèêëïîôöùûüç' ]+?)(?=\s*(?:,|;|\bet\b|\bplus\b|\d+|$))/g;
    while((m=re.exec(seg))){ _pushItem(items, +m[1], m[2]); }
  }
  // résolution parfum + ambiguïté (priorité : correspondance complète > par mot)
  items.forEach(it=>{
    const full=flavors.filter(f=>{ const nf=aiNormalize(f); return nf===it.raw || nf.includes(it.raw) || it.raw.includes(nf); });
    let cands=full;
    if(!cands.length){ // repli : correspondance par mot significatif
      cands=flavors.filter(f=>{ const nf=aiNormalize(f); return it.raw.split(' ').some(w=>w.length>=4 && nf.includes(w)); });
    }
    if(cands.length===1){ it.flavor=cands[0]; }
    else if(cands.length>1){ it.flavor=null; it.candidates=cands; }
    else { it.flavor=null; it.candidates=[]; it.unknown=true; }
  });
  return items;
}
function _pushItem(items, qte, label){
  label=(label||'').trim().replace(/\b(macarons?|pieces?|pcs?|de|d'|au|aux|a|la|le|les|du|nom|chez|pour)\b/g,' ').replace(/\s+/g,' ').trim();
  if(qte>0 && label.length>=2) items.push({qte, raw:label});
}
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
  // LOCALISATION des macarons finis : "où sont mes macarons vanille", "emplacement chocolat"
  if(/\b(ou (se trouve|sont|est|se trouvent)|localis|emplacement|range|rangee|rangees|range ou|trouve mes|dans quel|quel congelateur|quel frigo)\b/.test(t)
     && /\bmacaron|macarons\b/.test(t) || (/\bou\b/.test(t) && aiFindFlavor(t,flavors))){
    const fl=aiFindFlavor(t,flavors);
    return {intent:'query_locate', params:{flavor:fl}, critical:false,
      label: fl?`Localiser les macarons « ${fl} »`:'Localiser des macarons finis'};
  }
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
  if(/\b(cree|creer|crée|nouvelle commande|ajoute une commande|ajoute une cmd|enregistre une commande|fais une commande|prends une commande)\b/.test(t) && /commande/.test(t)
     || ((/\bcree|creer|ajoute|fais\b/.test(t)) && /commande/.test(t))){
    const client=aiFindClient(t,clients);
    const date=aiParseDate(t);
    const nb=aiParseNumber(t);
    let taille=null; const mm=t.match(/coffret[s]? de (\d+)|(\d+) macaron/);
    if(mm) taille=+(mm[1]||mm[2]);
    const items=aiParseOrderItems(raw, flavors);   // multi-parfums + ambiguïté
    const grand=/\b(grand format|grands formats|gros macaron|grand macaron)\b/.test(t);
    return {intent:'create_order', critical:true,
      params:{client, clientNameRaw: !client?aiExtractName(raw):null, date, taille, qte:nb,
        flavor:aiFindFlavor(t,flavors), items, grandHint:grand, raw},
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
/* ============================================================
   ASSISTANT — ANTI-GASPI & JAUGE DE SÉRÉNITÉ
   Branché sur l'architecture réelle de l'app :
   - lots matières : db.materialLots (dlc, qteRestante)
   - recette→ingrédients : db.recipeItems (recipeId, materialId)
   - stock fini par recette : somme des db.productions.qteRestante
   - temps de prod : recipe.minParBatch (min/batch) · rendement = pièces/batch
   - commandes : db.orders (date) + demande via _orderParfumDemand
   ============================================================ */

// A. ANTI-GASPI : suggère quoi produire pour écouler les matières dont la DLC approche.
// Retourne une liste triée : urgence DLC croissante, puis stock fini croissant.
async function generateProductionSuggestions(daysThreshold){
  const seuil = daysThreshold!=null ? daysThreshold : 7;
  const [lots, mats, recipes, recipeItems, prods] = await Promise.all([
    db.materialLots.toArray(), db.materials.toArray(),
    db.recipes.toArray(), db.recipeItems.toArray(), db.productions.toArray()
  ]);
  const matName = id => (mats.find(m=>m.id===id)||{}).nom||'—';
  // stock fini par recette (somme des batchs restants)
  const finiByRecipe = {};
  prods.forEach(p=>{ finiByRecipe[p.recipeId]=(finiByRecipe[p.recipeId]||0)+(+p.qteRestante||0); });
  // DLC effective d'un lot : la plus proche entre la DLC fournisseur et la DLC d'ouverture
  // (crème/lait entamé). Au plus prudent.
  const effDlc = l => {
    const cand=[l.dlc, l.dlcOuverture].filter(Boolean);
    return cand.length ? cand.sort()[0] : '';
  };
  // 1) lots dont la DLC (effective) expire bientôt ET avec du stock restant
  const lotsUrgents = lots
    .filter(l => +l.qteRestante>0 && effDlc(l))
    .map(l => ({...l, _eff:effDlc(l), jours: daysTo(effDlc(l)), ouvert: !!l.ouvertLe}))
    .filter(l => l.jours!=null && l.jours <= seuil)
    .sort((a,b)=>(a.jours-b.jours));
  // 2) croisement : pour chaque matière urgente → recettes qui l'utilisent → stock fini
  const seen = new Set();   // évite les doublons (recette, matière)
  const suggestions = [];
  for(const lot of lotsUrgents){
    const usedIn = recipeItems.filter(it=>it.materialId===lot.materialId);
    for(const it of usedIn){
      const rec = recipes.find(r=>r.id===it.recipeId);
      if(!rec) continue;
      const key = rec.id+':'+lot.materialId;
      if(seen.has(key)) continue; seen.add(key);
      suggestions.push({
        recipeId: rec.id,
        produitNom: rec.produitNom,
        materialId: lot.materialId,
        matiere: matName(lot.materialId),
        lotId: lot.id,
        lotFournisseur: lot.lotFournisseur||'',
        dlc: lot._eff||lot.dlc,
        joursAvantDLC: lot.jours,
        cremeOuverte: !!lot.ouvert,
        qteLotRestante: round3(+lot.qteRestante||0),
        stockFini: round3(finiByRecipe[rec.id]||0)
      });
    }
  }
  // 3) priorisation : DLC la plus proche d'abord, puis stock fini le plus bas
  suggestions.sort((a,b)=> (a.joursAvantDLC-b.joursAvantDLC) || (a.stockFini-b.stockFini));
  return suggestions;
}

// PRÉVISIONNEL MARCHÉ : analyse les marchés CLOS passés pour suggérer une quantité
// totale à emporter et une répartition par parfum (basée sur les ventes réelles).
async function marketForecast(){
  const [markets, moves, recipes, prods] = await Promise.all([
    db.markets.toArray().catch(()=>[]), db.marketMoves.toArray().catch(()=>[]),
    db.recipes.toArray(), db.productions.toArray()
  ]);
  const recName = id => (recipes.find(r=>r.id===id)||{}).produitNom||'';
  const clos = markets.filter(m=>m.statut==='clos');
  const movesByMarket={}; moves.forEach(mv=>{(movesByMarket[mv.marketId] ||= []).push(mv);});
  let totalVendu=0, maxVendu=0; const venduParParfum={};
  clos.forEach(mk=>{
    const lines = marketLineSummary(movesByMarket[mk.id]||[]);
    let venduMk=0;
    lines.forEach(l=>{
      const nom = l.parfum || recName((prods.find(p=>l.productionIds.includes(p.id))||{}).recipeId) || 'Autre';
      venduParParfum[nom]=(venduParParfum[nom]||0)+(+l.vendu||0);
      venduMk += (+l.vendu||0);
    });
    totalVendu += venduMk; maxVendu = Math.max(maxVendu, venduMk);
  });
  const nbMarches = clos.length;
  const moyenneVendu = nbMarches>0 ? Math.round(totalVendu/nbMarches) : 0;
  // suggestion : moyenne + petite marge de sécurité de 10 %, arrondie à la dizaine
  const suggestion = nbMarches>0 ? Math.ceil(moyenneVendu*1.1/10)*10 : 0;
  // répartition par parfum (en % des ventes cumulées), triée
  const totParf = Object.values(venduParParfum).reduce((s,x)=>s+x,0);
  const repartition = Object.keys(venduParParfum).map(nom=>({
    parfum:nom, vendu:round3(venduParParfum[nom]),
    pct: totParf>0 ? Math.round(venduParParfum[nom]/totParf*100) : 0
  })).sort((a,b)=>b.vendu-a.vendu);
  return {nbMarches, moyenneVendu, maxVendu, suggestion, repartition, totalVendu:round3(totalVendu)};
}

// B. JAUGE DE SÉRÉNITÉ : score 0–100 reflétant ta capacité à honorer les commandes
// des 15 prochains jours avec le stock actuel, en tenant compte de la charge de
// production restante et de l'urgence (échéances proches non couvertes).
async function calculateSerenityScore(opts){
  opts=opts||{};
  const horizon = opts.horizon!=null ? opts.horizon : 15;   // jours
  const [recipes, prods, orders, markets] = await Promise.all([
    db.recipes.toArray(), db.productions.toArray(), db.orders.toArray(),
    db.markets.toArray().catch(()=>[])
  ]);
  // stock fini par parfum (nom de recette)
  const stockByParfum = {};
  prods.forEach(p=>{ const r=recipes.find(x=>x.id===p.recipeId); const nom=r?r.produitNom:('#'+p.recipeId);
    stockByParfum[nom]=(stockByParfum[nom]||0)+(+p.qteRestante||0); });
  const stockTotal = Object.values(stockByParfum).reduce((s,x)=>s+x,0);
  // recette par parfum (pour temps de prod + rendement)
  const recByParfum = {}; recipes.forEach(r=>{ recByParfum[r.produitNom]=r; });
  // temps moyen de production par pièce (toutes recettes) — pour la charge des marchés
  const perPieceMin = (()=>{ const arr=recipes.map(r=>{ const rend=+r.rendement>0?+r.rendement:60; return (Math.max(0,+r.minParBatch||0))/rend; }).filter(x=>x>0); return arr.length?arr.reduce((a,x)=>a+x,0)/arr.length:0; })();
  // commandes validées des N prochains jours (non livrées)
  const todayStr = today();
  const horizonDate = (()=>{ const d=new Date(todayStr); d.setDate(d.getDate()+horizon); return d.toISOString().slice(0,10); })();
  const fenetre = orders.filter(o=> o.date && o.date>=todayStr && o.date<=horizonDate && normStatus(o.statut)!=='Livrée');
  // marchés planifiés dans la fenêtre (non clos) avec une quantité prévue
  const marchesFenetre = markets.filter(m=> m.date && m.date>=todayStr && m.date<=horizonDate && m.statut!=='clos' && (+m.prevuQte||0)>0);

  // demande par parfum + suivi de l'échéance la plus proche non couverte
  const demandeByParfum = {};
  const datedDemand = {};   // parfum -> [{date, qte, dans}]
  fenetre.forEach(o=>{
    const dem=_orderParfumDemand(o); const dans=daysTo(o.date);
    for(const nom in dem){ demandeByParfum[nom]=(demandeByParfum[nom]||0)+dem[nom];
      (datedDemand[nom] ||= []).push({date:o.date, qte:dem[nom], dans}); }
  });

  let totalDemande=0, totalCouvert=0, aProduire=0;
  let chargeMin=0;            // minutes de production nécessaires pour combler le manque
  let urgenceCritique=false;  // une échéance proche (≤3 j) n'est pas couverte par le stock
  const manquesParParfum=[];
  for(const nom in demandeByParfum){
    const dem=demandeByParfum[nom];
    const stock=stockByParfum[nom]||0;
    const couvert=Math.min(dem, stock);
    const manque=Math.max(0, dem-stock);
    totalDemande+=dem; totalCouvert+=couvert; aProduire+=manque;
    if(manque>0){
      manquesParParfum.push({parfum:nom, manque:round3(manque)});
      // charge de production : (manque / rendement) batchs × temps/batch
      const rec=recByParfum[nom];
      const rend=rec&&+rec.rendement>0?+rec.rendement:60;
      const minParBatch=rec?Math.max(0,+rec.minParBatch||0):0;
      chargeMin += Math.ceil(manque/rend)*minParBatch;
      // urgence : la première échéance non couverte tombe-t-elle très bientôt ?
      const ech=(datedDemand[nom]||[]).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
      let solde=stock;
      for(const e of ech){ solde-=e.qte; if(solde<0 && e.dans!=null && e.dans<=3){ urgenceCritique=true; break; } }
    }
  }

  // MARCHÉS PLANIFIÉS : la quantité prévue est une demande supplémentaire (globale,
  // non ventilée par parfum). On l'honore d'abord avec le stock fini RESTANT après
  // les commandes, puis le reste est à produire.
  let marketDemande=0;
  const stockRestantApresCmd = Math.max(0, stockTotal - totalCouvert);
  let stockDispoMarche = stockRestantApresCmd;
  marchesFenetre.forEach(m=>{
    const q=+m.prevuQte||0; marketDemande+=q;
    const dans=daysTo(m.date);
    const couvertM=Math.min(q, stockDispoMarche);
    stockDispoMarche=Math.max(0, stockDispoMarche-couvertM);
    const manqueM=Math.max(0, q-couvertM);
    totalDemande+=q; totalCouvert+=couvertM; aProduire+=manqueM;
    if(manqueM>0){
      chargeMin += Math.round(manqueM*perPieceMin);
      if(dans!=null && dans<=3) urgenceCritique=true;
    }
  });

  // SCORE : part de la demande déjà couverte par le stock (taux de service immédiat),
  // pénalisée si une échéance critique (≤3 j) n'est pas honorée.
  let score;
  if(totalDemande<=0){ score = 100; }   // rien à honorer = sérénité totale
  else {
    score = Math.round(totalCouvert/totalDemande*100);
    if(urgenceCritique) score = Math.min(score, 35);   // alerte rouge : retard quasi inévitable
  }
  score = Math.max(0, Math.min(100, score));
  // libellé + couleur + humeur (mappage partagé avec la mascotte)
  const tier = serenityTier(score);
  const label=tier.label, col=tier.col;
  const heures=Math.floor(chargeMin/60), minutes=Math.round(chargeMin%60);
  return {
    score, label, col, mood: tier.mood, horizon,
    totalDemande:round3(totalDemande), totalCouvert:round3(totalCouvert), aProduire:round3(aProduire),
    chargeMin, chargeTxt: chargeMin>0?`${heures?heures+'h ':''}${String(minutes).padStart(2,'0')}min`:'—',
    urgenceCritique, nbCommandes:fenetre.length,
    nbMarches: marchesFenetre.length, marketDemande: round3(marketDemande),
    marches: marchesFenetre.map(m=>({nom:m.nom, date:m.date, dans:daysTo(m.date), prevu:+m.prevuQte||0})).sort((a,b)=>(a.date||'').localeCompare(b.date||'')),
    manques: manquesParParfum.sort((a,b)=>b.manque-a.manque)
  };
}


/* ============================================================
   BASE DE CONNAISSANCE DE L'APPLICATION (aide intégrée à l'assistant)
   ------------------------------------------------------------
   IMPORTANT — MAINTENANCE : à CHAQUE nouvelle version livrée, mettre à jour
   APP_VERSION et compléter/ajuster APP_KB pour refléter les nouveautés, afin
   que l'assistant réponde toujours juste. Chaque entrée : {id, titre, tags
   (mots-clés normalisés), r (réponse HTML concise)}.
   ============================================================ */
const APP_VERSION = 'v162';
const APP_KB = [
  { id:'commandes', titre:'Créer et gérer une commande',
    tags:'commande commandes creer client coffret parfum livraison remise total prix',
    r:`<p>Onglet <b>Commandes → + Nouvelle commande</b>. Choisis le client, la date, ajoute des produits (coffrets, grands formats, événement, don). Le prix se calcule automatiquement mais reste modifiable. Tu peux appliquer une remise par ligne ou une remise globale, indiquer l'heure et le lieu de livraison, et enregistrer les paiements (chaque encaissement exige montant + date + mode).</p>` },
  { id:'perso', titre:'Personnalisation des couleurs (+0,25 €/macaron)',
    tags:'personnalisation couleur couleurs perso facturation supplement 0.25 macaron personnalise',
    r:`<p>Dans la commande, coche <b>« Personnalisation des couleurs »</b> : un champ apparaît pour saisir le <b>nombre de macarons personnalisés</b> (pas forcément le total). Le surcoût de <b>0,25 €/macaron</b> s'ajoute au total. La personnalisation est spécifique à la commande et lève la règle « 1 couleur = 1 parfum ».</p>` },
  { id:'livraison', titre:'Coût de livraison',
    tags:'livraison deplacement distance carburant cout transport km temps aller retour adresse suggestion consommation vehicule litres',
    r:`<p>Dans la commande, renseigne la <b>distance aller</b> et le <b>temps de trajet aller</b> : l'app double automatiquement les deux pour l'aller-retour. Avec le prix du carburant et la consommation du véhicule, elle calcule le coût (carburant A/R + temps A/R valorisé au taux horaire) et propose un prix de livraison qui préserve la marge. Tu peux saisir une <b>consommation réelle (L/100 km) propre à cette livraison</b> (ou ce marché) pour un coût au plus juste ; si tu la laisses vide, c'est la consommation par défaut des réglages qui s'applique. Le champ adresse suggère les adresses de tes clients et tes lieux habituels.</p>` },
  { id:'stock-matieres', titre:'Matières premières & emballages (lots)',
    tags:'matiere matieres emballage emballages lot lots reception stock denree capacite reference',
    r:`<p>Onglet <b>Matières & emballages</b>. Les références sont toujours affichées dans l'<b>ordre alphabétique</b>, quel que soit l'ordre de saisie. Tu peux renseigner une <b>marque de produit</b> (ex : Valrhona) distincte du <b>fournisseur</b> : la marque se définit sur la fiche matière, le fournisseur se choisit à la <b>réception du lot</b> (ex : fournisseur « Délice et Création », marque « Valrhona »). Les <b>denrées alimentaires</b> sont achetées et valorisées <b>au kilogramme</b> (prix indicatif en <b>€/kg</b>, stock en kg, réception du lot en kg → prix au kg réel), mais dans les <b>recettes</b> tu saisis les quantités <b>en grammes</b> (l'app convertit automatiquement pour le coût et le stock). Les <b>emballages</b> restent comptés <b>à l'unité</b> et portent une <b>capacité</b> (nb de macarons) qui les relie aux coffrets. Le stock réel se gère par <b>lots</b> (réception) — ne saisis jamais les matières/emballages en charges (double comptage).</p>` },
  { id:'productions', titre:'Productions (batchs) & recherche',
    tags:'production productions batch fabrication lot emplacement recherche parfum dlc rendement',
    r:`<p>Onglet <b>Productions</b>. Une production consomme les matières selon la quantité <b>théorique</b> (FIFO par DLC) ; le stock fini suit la quantité <b>réelle</b>. La barre de recherche filtre par n° de lot, parfum, date, statut ; une seule <b>lettre d'emplacement</b> (F/B/C/A) ou les puces de zone filtrent par emplacement. Tu peux découper un batch, ajuster le réel, déclarer une perte, imprimer l'étiquette.</p>` },
  { id:'picking', titre:'Préparation / Picking & liaison batch↔commande',
    tags:'picking preparation liaison batch commande prete affecter zone fifo',
    r:`<p>La liaison batch↔commande est <b>automatique</b> : le picking calcule les besoins, affecte les batchs (optimisé par zone, FIFO par DLC) et, au clic <b>« Commande prête »</b>, crée les liens, décrémente le stock fini et les emballages, et passe la commande en « Terminée ». La liaison manuelle 🔗 reste possible en secours, sans double décompte. Les <b>macarons grand format</b> ont leur <b>propre recette et leur propre stock</b> : coche « Recette grand format » sur la fiche recette. Un grand format n'est jamais servi à partir du stock des petits macarons du même parfum (et inversement) — s'il manque du stock grand format, le picking affiche « stock insuffisant ».</p>` },
  { id:'plan-prod', titre:'Plan de production & planification personnelle',
    tags:'plan production mrp ordonnancement planning meringue capacite temps disponibilite chef',
    r:`<p>Onglet <b>Plan de production</b>. Il agrège les besoins, calcule les batchs et le temps. La <b>planification personnelle</b> te laisse décrire ta disponibilité (jour par jour, plusieurs créneaux) et génère un planning minute par minute : meringues remplies à la capacité (240 coques = 120 macarons standard ; 48 coques = 24 grands formats), ganaches placées pendant la cuisson, montages ensuite, puis maturation 24 h. Le « mot du chef » explique chaque choix de façon chiffrée.</p>` },
  { id:'meringue', titre:'Meringues : capacité et mutualisation',
    tags:'meringue meringues capacite 240 coques mutualisation parfum couleur division',
    r:`<p>Une meringue = <b>240 coques (120 macarons) en standard</b>, <b>48 coques (24 macarons) en grand format</b>. La mutualisation (2 parfums dans une meringue) n'est <b>pas une règle</b> : elle ne sert qu'à combler la capacité. Un parfum qui a besoin de 120 remplit une meringue entière à lui seul. Règle : <b>1 division = 1 couleur = 1 parfum</b> (sauf personnalisation).</p>` },
  { id:'cuisson', titre:'Cuisson en cascade',
    tags:'cuisson four plaque cascade 39 12 coques 20 28 minutes enfourner',
    r:`<p>1 plaque = <b>39 coques</b> (standard, 20 min) ou <b>12 coques</b> (grand format, 28 min). Enfournement en cascade : la 2ᵉ plaque part 7 min après la 1ʳᵉ, la 3ᵉ quand la 1ʳᵉ sort, etc. Le plan de production estime le temps four et le traite comme un temps passif (on prépare les ganaches pendant).</p>` },
  { id:'marches', titre:'Marchés (CA, fond de caisse, charges)',
    tags:'marche marches fond caisse stand deplacement ca especes cb cloture depart retour',
    r:`<p>Onglet <b>Marchés</b>. Renseigne lieu, horaires, quantité prévue, <b>fond de caisse</b>, et les <b>charges du marché</b> (stand, distance, carburant, temps de route). Le CA se ventile espèces/CB/autre (le fond de caisse est déduit des espèces). Les invendus se calculent par différentiel <b>départ − retour</b>. À la clôture, tout alimente la comptabilité.</p>` },
  { id:'charges', titre:'Charges & charges récurrentes',
    tags:'charge charges depense assurance hebergement abonnement recurrente mensuelle loyer',
    r:`<p>Onglet <b>Comptabilité → charges</b>. Les charges sont les dépenses <b>hors stock</b> (assurance, hébergement web, loyer, stand…). Le bouton <b>🔁 Charges récurrentes</b> permet de saisir une charge mensuelle une seule fois : elle est reportée automatiquement chaque mois. Les matières et emballages ne sont jamais des charges (ils se gèrent en lots).</p>` },
  { id:'compta', titre:'Comptabilité & bilan',
    tags:'comptabilite compta resultat benefice ca encaisse charges bilan mensuel marge urssaf cotisation marchandise prestation service ventilation export txt csv declaration',
    r:`<p>La <b>Comptabilité</b> croise le CA encaissé, les charges, le coût matières et les frais de marché pour donner le résultat par mois (base trésorerie). Un panneau <b>« Bilan du mois & URSSAF »</b> ventile le CA encaissé du mois entre <b>vente de marchandise</b> et <b>prestation de service</b>, puis estime les <b>cotisations URSSAF</b> à provisionner (taux distincts marchandise / service, réglables dans Paramètres) avec un <b>cumul annuel</b>. Tu peux <b>exporter le bilan du mois en .txt</b> (un bouton, copie automatique dans le presse-papier) et l'ensemble en <b>.csv</b> pour ton comptable. Une commande mixte (coffrets + prestation) est répartie au prorata ; les marchés clôturés comptent en marchandise.</p>` },
  { id:'crm', titre:'Fiches clients (CRM)',
    tags:'client clients crm fiche panier moyen parfum prefere vip fidele frequence',
    r:`<p>Onglet <b>Clients</b>. Chaque fiche montre le panier moyen, le parfum préféré, la fréquence et un badge (VIP / Fidèle). La recherche couvre nom, société, téléphone, e-mail, réf et notes.</p>` },
  { id:'mode-discret', titre:'Mode discret',
    tags:'discret confidentialite flou masquer nom prix montant privacy',
    r:`<p>Le <b>mode discret</b> floute les noms de clients et masque les montants/volumes. Active-le depuis le bouton 🙈 sur les pages Commandes et Clients, ou depuis le Menu (☰). La saisie et les détails restent lisibles pour travailler.</p>` },
  { id:'haccp', titre:'HACCP / Plan de Maîtrise Sanitaire',
    tags:'haccp pms hygiene temperature releve nettoyage ddpp frigo congelateur',
    r:`<p>Onglet <b>PMS</b>. Relevés de température matin/soir (avec action corrective obligatoire si hors plage), plan de nettoyage (quotidien/hebdo/mensuel) et export DDPP sur 30 jours.</p>` },
  { id:'tracabilite', titre:'Traçabilité & étiquettes',
    tags:'tracabilite tracage etiquette lot dlc impression label origine ddpp confidentialite quantite recette ingredient',
    r:`<p>La <b>traçabilité</b> relie chaque batch aux lots de matières consommés (FIFO). Tu peux imprimer une <b>étiquette</b> par batch (parfum, lot, DLC) depuis Productions ou l'onglet Étiquettes. La traçabilité destinée à la <b>DDPP</b> (écrans et exports CSV) conserve toutes les informations — matières, lots fournisseurs, fournisseurs, DLC, origine — mais <b>masque les quantités d'ingrédients</b> pour préserver la confidentialité de tes recettes.</p>` },
  { id:'pointeuse', titre:'Pointeuse / temps de travail & activités',
    tags:'pointeuse temps travail session heures chrono pause activite parallele simultane pesees pesee ganache meringue macaronnage pochage cuisson vaisselle nettoyage autre optimisation analyse',
    r:`<p>La <b>pointeuse</b> (bandeau flottant) permet de lancer <b>plusieurs chronos en parallèle</b>, chacun avec sa <b>nature d'activité</b> : Pesées, Ganache, Meringue, Macaronnage, Pochage, Cuisson, Garnissage/Montage, Vaisselle, Nettoyage fin de prod, Conditionnement, ou <b>Autre</b> (que tu peux <b>préciser</b> librement). Chaque chrono a sa <b>pause</b> et son <b>stop</b> indépendants — tu peux faire tourner « Cuisson » et « Macaronnage » en même temps, ou deux « Cuisson » à la fois. Le bouton <b>▶ Ajouter une activité</b> démarre un chrono sans interrompre les autres. À l'arrêt, tu renseignes le taux horaire et la session est enregistrée. Dans <b>Analyse → Temps de travail</b> : répartition par activité + conseils. Sans aucun impact sur les productions.</p>` },
  { id:'migration', titre:'Reprise / migration (historique & stock de départ)',
    tags:'migration reprise historique demarrage debut ancienne donnee ca chiffre affaire stock depart inventaire import',
    r:`<p>L'onglet <b>Reprise / migration</b> sert à démarrer avec ton historique. Tu peux saisir des <b>commandes historiques</b> (date, montant, client ou libellé) : elles <b>comptent dans le chiffre d'affaires</b> et les stats, mais sont marquées « historique » — l'app ne demande <b>ni production, ni picking, ni matières</b> et ne génère <b>aucune alerte</b> dessus (elles n'apparaissent pas dans la liste des commandes opérationnelles). Tu peux y ajouter le <b>détail des parfums</b> (parfum + quantité) : cela <b>alimente les statistiques et les tendances</b> (parfums populaires, saisonnalité) sans modifier le montant saisi. Tu peux aussi enregistrer ton <b>stock de départ de produits finis</b> (lot déjà « terminé », sans consommer de matières) et, pour les matières premières, utiliser la <b>réception de lot</b> habituelle dans Matières &amp; emballages.</p>` },
  { id:'sauvegarde', titre:'Sauvegarde & restauration',
    tags:'sauvegarde backup restauration export import donnees fichier rappel ios safari perte purge securite icloud cloud drive partage',
    r:`<p>Onglet <b>Sauvegarde &amp; sécurité</b>. Le plus simple : <b>☁️ Sauvegarder sur iCloud</b> — l'app ouvre le partage iOS, choisis <b>« Enregistrer dans Fichiers » → iCloud Drive</b> (le dossier est mémorisé, les fois suivantes vont plus vite). Tu peux aussi <b>Exporter</b> un fichier .json à ranger ailleurs (e-mail, autre cloud), puis le <b>réimporter</b> pour restaurer (remplacement ou fusion). ⚠️ Important : effacer l'historique Safari <b>supprime aussi la base de l'app</b> (limite iOS) — seule une copie hors appareil (iCloud, fichier) te protège. À l'ouverture, l'app fait une <b>sauvegarde interne quotidienne</b> et te <b>propose automatiquement</b> d'enregistrer sur iCloud si ta dernière sauvegarde dépasse le délai réglé (mets <b>1 jour</b> pour un rappel quotidien). Note : une app web ne peut pas écrire seule dans iCloud sans ce petit geste de validation — c'est une sécurité d'iOS.</p>` },
  { id:'assistant', titre:'Assistant IA (hors-ligne)',
    tags:'assistant ia aide question stock commande tendance rupture comment fonctionne localiser ou sont joindre piece fichier photo txt notes coller',
    r:`<p>L'assistant fonctionne <b>hors-ligne</b>. Il sait : <b>localiser tes macarons</b> (« où sont mes macarons vanille ? »), <b>créer une commande en langage naturel</b>, répondre sur le stock, le CA, les tendances, les ruptures, et expliquer le fonctionnement. Tu peux <b>📎 Joindre</b> un <b>fichier texte (.txt)</b> : son contenu est ajouté à ta demande. Une <b>photo</b> peut être jointe comme simple <b>aperçu visuel temporaire</b> (l'assistant ne lit pas son contenu, et rien n'est enregistré dans l'app). Depuis l'app Notes de l'iPhone, fais <b>Copier</b> puis colle le texte dans le champ (l'accès direct aux notes Apple n'est pas possible). Toute action critique demande validation. Envoi : touche <b>Entrée</b>.</p>` },
  { id:'locate', titre:'Localiser mes macarons (où sont-ils ?)',
    tags:'localiser localisation ou sont emplacement batch batchs frigo congelateur trouve mes macarons popup',
    r:`<p>Demande à l'assistant « <b>où sont mes macarons vanille ?</b> ». Il ouvre une <b>popup</b> qui liste, par emplacement (Frigo F, Congélateurs B/C/A), chaque <b>batch</b> en stock avec sa quantité, son n° de lot, sa DLC et son statut (prêt / en cours). Sans parfum précisé, il propose la liste des parfums en stock.</p>` },
  { id:'composants', titre:'Production par composants (coques / ganache) & assemblage',
    tags:'composant composants coques ganache assemblage assembler sous-lot souslot lot ambiant congelateur frigo degustation echantillon offert marche surplus casse garni perte',
    r:`<p>Au lancement d'une production, choisis <b>« Par composants »</b> pour démarrer par les <b>coques</b> ou la <b>ganache</b> (sous-lots <b>-CO</b> / <b>-GA</b> sous le même n° de lot de base). Tu saisis toujours la quantité <b>en macarons</b> : pour les coques, l'app stocke automatiquement <b>2 coques par macaron</b> (60 macarons → <b>120 coques</b>), tout en calculant les matières sur le nombre de macarons. Règle d'assemblage : <b>1 macaron = 2 coques + 1 ganache</b>. Tu peux <b>terminer</b> la production de coques (choix de l'emplacement à la fin), <b>déclarer pertes et écarts</b> théorie/réel sur les coques, puis utiliser <b>🔗 Assembler</b> pour réunir coques + ganache en un macaron assemblé (assemblage partiel possible). L'application <b>surveille les coques et ganaches non assemblées</b> : un bloc <b>« Assemblages à finaliser »</b> (dans Productions et sur le tableau de bord) te <b>suggère les rapprochements</b> possibles (même lot de base et même parfum en priorité) avec le nombre de macarons assemblables, et un bouton direct pour finaliser. Coche <b>« dégustation »</b> pour un assemblage offert non vendable ; les <b>cassés mais garnis</b> basculent en dégustation depuis « ⚠ Perte ». Coques, ganache et dégustations ne comptent jamais comme stock vendable.</p>` },
  { id:'allergenes', titre:'Allergènes des recettes',
    tags:'allergene allergenes gluten oeuf lait fruits a coque soja arachide etiquetage boutique conformite vente inco',
    r:`<p>Sur chaque <b>recette</b>, tu peux cocher les <b>allergènes</b> présents parmi les 14 à déclaration obligatoire (gluten, œufs, lait, fruits à coque, soja, arachides…). Ils s'affichent sur la fiche recette, et une recette sans allergène renseigné est signalée (⚠) pour t'inciter à compléter. Cette information est <b>obligatoire pour la vente</b> (notamment en ligne) et servira de source unique pour l'étiquetage et la future boutique.</p>` },
  { id:'casse-perte', titre:'Casse / Perte (retirer du stock)',
    tags:'casse perte invendable tombe jete dlc depassee retrait stock decompte rapide taux perte cout',
    r:`<p>Pour sortir des pièces du stock sans les vendre (macaron tombé, invendable, DLC dépassée), deux accès : le bouton <b>⚠ Perte</b> sur chaque batch dans Productions, ou le bouton <b>⚠ Casse / Perte</b> (en haut de Productions et sur le tableau de bord) pour un <b>accès rapide</b> sans chercher le batch. Tu choisis le produit/lot, la quantité et le motif ; la perte est <b>tracée avec son coût de revient</b> et alimente le <b>taux de perte</b> et la valeur perdue (imputée au coût). Cas particulier : un <b>cassé mais garni</b> peut basculer en <b>dégustation</b> (offert, non perdu) au lieu d'être compté en perte.</p>` },
  { id:'suppressions', titre:'Supprimer une entrée (commande, production, marché, client, événement)',
    tags:'supprimer suppression effacer raison motif confirmation perte recrediter congelateur retour chaine froid decongelation annuler annulation undo',
    r:`<p>Chaque fiche complète a un bouton <b>🗑 Supprimer</b> (à droite de Modifier) avec <b>confirmation</b>. Pour une <b>commande</b> ou une <b>production</b>, une <b>raison</b> est demandée. À la suppression d'une production, tu choisis : recréditer le stock matières, ou — si des pièces finies restent — les <b>déclarer en pertes</b>. Après une suppression, une barre <b>↩ Annuler</b> s'affiche quelques secondes pour <b>revenir en arrière immédiatement</b>. Règle chaîne du froid : une production sortie du congélateur ne peut y retourner que dans l'heure ; au-delà le retour A/B/C est bloqué.</p>` }
];
// Recherche dans la base de connaissance : score par mots-clés communs.
function kbSearch(q){
  const nq=aiNormalize(q);
  const terms=nq.split(' ').filter(w=>w.length>=3);
  if(!terms.length) return [];
  return APP_KB.map(e=>{
    const hay=aiNormalize(e.titre+' '+e.tags);
    let score=0;
    for(const t of terms){ if(hay.includes(t)) score+= (e.tags.includes(t)?2:1); }
    return {e, score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.e);
}
// Détecte une question d'AIDE / mode d'emploi.
function isHelpQuery(txt){
  const n=aiNormalize(txt);
  return /(\baide\b|\bcomment\b|\bpourquoi\b|c'?est quoi|qu'?est-?ce|a quoi sert|\bfonctionne|utilise|expliqu|mode d'?emploi|notice|tutoriel|ca marche|marche comment)/.test(n)
    || n==='aide' || n==='help' || n==='?';
}
// Répond depuis la base de connaissance.
function aiHelp(txt){
  const n=aiNormalize(txt);
  // demande générique → sommaire des sujets
  if(n==='aide'||n==='help'||n==='?'||/\b(sommaire|sujets|liste|que peux-?tu|que sais-?tu|fonctionnalit)\b/.test(n)){
    const lis=APP_KB.map(e=>`<button class="btn ghost sm" style="margin:3px 3px 0 0" onclick="document.getElementById('aiInput').value=${JSON.stringify('Comment fonctionne : '+e.titre)};aiRun()">${esc(e.titre)}</button>`).join('');
    return aiSay(`<h3 style="font-size:1rem;margin-bottom:6px">🤖 Aide — que veux-tu savoir ?</h3>
      <p class="note">Voici les sujets que je connais (version ${APP_VERSION}). Touche un sujet ou pose ta question :</p>
      <div style="display:flex;flex-wrap:wrap">${lis}</div>`);
  }
  const hits=kbSearch(txt);
  if(!hits.length){
    return aiSay(`<p>Je n'ai pas de fiche précise pour « ${esc(txt)} ».</p>
      <p class="note">Tape <b>aide</b> pour voir tous les sujets, ou reformule (ex. « comment fonctionne le picking ? »).</p>`);
  }
  const main=hits[0];
  const autres=hits.slice(1,4).map(e=>`<button class="btn ghost sm" style="margin:3px 3px 0 0" onclick="document.getElementById('aiInput').value=${JSON.stringify('Comment fonctionne : '+e.titre)};aiRun()">${esc(e.titre)}</button>`).join('');
  return aiSay(`<h3 style="font-size:1rem;margin-bottom:6px">${esc(main.titre)}</h3>${main.r}
    ${autres?`<p class="note" style="margin-top:10px">Sujets liés :</p><div style="display:flex;flex-wrap:wrap">${autres}</div>`:''}`);
}

function renderAssistant(){
  _aiPhotoPreview=null;   // aucune pièce jointe ne persiste entre deux visites
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Assistant</h1><p>Anti-gaspi, sérénité & pilotage</p></div></div>
   <div id="serenityBox"><div class="banner">🧘 <div>Calcul de la jauge de sérénité…</div></div></div>
   <div id="marketForecast"></div>
   <div id="antiGaspi"></div>
   <div id="aiPredict"><div class="banner">📈 <div>Analyse du rythme de ventes en cours…</div></div></div>
   <div class="banner">🤖 <div>Écrivez ou dictez (micro du clavier) une instruction ou une <b>question d'aide</b> (« comment fonctionne… »). L'assistant fonctionne <b>hors-ligne</b>. Toute action critique demande votre validation.</div></div>
   <div class="panel">
     <div class="field"><label>Votre demande</label>
       <textarea id="aiInput" rows="2" placeholder="ex : Comment fonctionne le picking ? · Quel est le stock de chocolat ? · Crée une commande pour M. Dupont vendredi" onkeydown="aiInputKey(event)"></textarea>
     </div>
     <div id="aiAttachWrap" style="display:none;margin-bottom:8px"></div>
     <input type="file" id="aiFileInput" accept=".txt,.csv,.md,.text,.pdf,text/plain,text/csv,text/markdown,application/pdf,image/*" style="display:none" onchange="aiAttachFile(this.files)">
     <div class="flex" style="gap:8px;flex-wrap:wrap"><button class="btn" onclick="aiRun()">Envoyer</button>
       <button class="btn ghost" onclick="document.getElementById('aiFileInput').click()" title="Joindre un fichier texte (.txt) ou une photo (support visuel)">📎 Joindre</button>
       <button class="btn gold" onclick="document.getElementById('aiInput').value='aide';aiRun()">❓ Aide</button>
       <button class="btn ghost" onclick="aiClearAll()">Effacer</button></div>
     <p class="note" style="margin-top:6px">📎 Un <b>.txt</b> ou un <b>PDF</b> (généré par ordi) est lu et ajouté à ta demande ; une <b>photo</b> ou un PDF scanné reste un aperçu temporaire (non lu, non enregistré). Astuce : depuis l'app Notes, fais <b>Copier</b> puis colle ici. Base d'aide : <b>${APP_VERSION}</b>.</p>
     <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
       ${['Aide','Comment fonctionne le picking ?','Quel est le stock de chocolat ?','Commandes à préparer demain','Chiffre d\'affaires','Que faut-il produire ?','Quand vais-je être en rupture ?'].map(s=>`<button class="btn ghost sm" onclick="document.getElementById('aiInput').value=${JSON.stringify(s)};aiRun()">${esc(s)}</button>`).join('')}
     </div>
   </div>
   <div id="aiOut"></div>`;
  renderSerenityGauge();
  renderMarketForecastBox();
  renderAntiGaspi();
  renderPredictiveAlerts();
  ttScheduleSerenityRefresh();
}
// Prévisionnel marché intelligent : suggestion de quantités d'après l'historique.
async function renderMarketForecastBox(){
  const box=document.getElementById('marketForecast'); if(!box) return;
  let fc; try{ fc=await marketForecast(); }catch(e){ box.innerHTML=''; return; }
  if(!fc.nbMarches){ box.innerHTML=''; return; }   // pas d'historique : on n'encombre pas
  const rep=fc.repartition.slice(0,8).map(r=>`<div class="sum-box"><span>${esc(r.parfum||'Autre')}</span><b>${r.pct}% · ${qty(r.vendu)} vendus</b></div>`).join('');
  box.innerHTML=`<div class="panel"><h2>📊 Prévisionnel marché <span style="font-weight:400;font-size:.82rem;color:#9a8a82">— d'après ${fc.nbMarches} marché(s) passé(s)</span></h2>
    <div class="sum-box"><span>Ventes moyennes par marché</span><b>${qty(fc.moyenneVendu)} macarons</b></div>
    <div class="sum-box"><span>Record</span><b>${qty(fc.maxVendu)} macarons</b></div>
    <div class="sum-box"><span>💡 Quantité conseillée à prévoir</span><b style="color:var(--bordeaux)">${qty(fc.suggestion)} macarons</b></div>
    ${rep?`<p class="note" style="margin:10px 0 4px">Répartition conseillée par parfum (selon tes ventes passées) :</p>${rep}`:''}
  </div>`;
}
// Rafraîchit la jauge périodiquement tant que l'onglet Assistant est affiché
// (background check), et au retour au premier plan. S'auto-arrête sinon.
let _serenityTimer=null;
function ttScheduleSerenityRefresh(){
  if(_serenityTimer) clearInterval(_serenityTimer);
  _serenityTimer=setInterval(()=>{
    if(view==='assistant' && document.getElementById('serenityBox') && document.visibilityState==='visible'){
      renderSerenityGauge();
    } else if(view!=='assistant'){
      clearInterval(_serenityTimer); _serenityTimer=null;
    }
  }, 60000); // toutes les minutes
}
// Jauge de sérénité (barre colorée dynamique) — recalculée à chaque ouverture
// et rafraîchie en arrière-plan tant que l'onglet Assistant est affiché.
async function renderSerenityGauge(){
  const box=document.getElementById('serenityBox'); if(!box) return;
  let g; try{ g=await calculateSerenityScore({horizon:15}); }catch(e){ box.innerHTML=''; return; }
  box.innerHTML=`<div class="panel serenity">
    <div class="ser-head"><span class="ser-title">🧘 Jauge de sérénité</span>
      <span class="ser-score" style="color:${g.col}">${g.score}% · ${g.label}</span></div>
    <div class="ser-bar"><span style="width:${g.score}%;background:linear-gradient(90deg,#b3261e,#d98324,#caa23b,#7faa4f,#3f7d52);"></span>
      <i style="left:calc(${g.score}% - 1px)"></i></div>
    <div class="ser-meta">
      <span>${g.nbCommandes} commande(s)${g.nbMarches?` · ${g.nbMarches} marché(s)`:''} sur ${g.horizon} j</span>
      <span>${g.aProduire>0?`À produire : <b>${qty(g.aProduire)}</b> · charge ~${g.chargeTxt}`:'Tout est couvert par le stock ✓'}</span>
    </div>
    ${g.marches&&g.marches.length?`<div class="ser-markets">${g.marches.map(m=>`<span class="tag event">⛺ ${esc(m.nom||'Marché')} · ${m.dans!=null?(m.dans<=0?"auj.":'J−'+m.dans):''} · ${qty(m.prevu)} prévus</span>`).join(' ')}</div>`:''}
    ${g.urgenceCritique?`<p class="note" style="color:var(--red,#b3261e);margin-top:6px">⚠ Échéance critique sous 3 jours non couverte par le stock — lance une production en priorité.</p>`:''}
  </div>`;
}
// Cartes d'alerte Anti-Gaspi (matières dont la DLC approche).
async function renderAntiGaspi(){
  const box=document.getElementById('antiGaspi'); if(!box) return;
  let sugg; try{ sugg=await generateProductionSuggestions(7); }catch(e){ box.innerHTML=''; return; }
  if(!sugg.length){
    box.innerHTML=`<div class="banner" style="background:#eef6ee;border-color:#bcdcc0">✅ <div>Aucune matière à DLC proche (≤ 7 j). Rien à écouler en urgence.</div></div>`;
    return;
  }
  const cards=sugg.slice(0,10).map(s=>{
    const urgent = s.joursAvantDLC<=2;
    const jTxt = s.joursAvantDLC<=0 ? "aujourd'hui" : (s.joursAvantDLC===1?'demain':`dans ${s.joursAvantDLC} jours`);
    return `<div class="gaspi-card" style="border-left-color:${urgent?'#b3261e':'#d98324'}">
      <div class="gaspi-head">${urgent?'🚨':'⏳'} <b>Produis des ${esc(s.produitNom)}</b></div>
      <div class="gaspi-body">Ton lot de <b>${esc(s.matiere)}</b>${s.lotFournisseur?` (n° ${esc(s.lotFournisseur)})`:''}${s.cremeOuverte?' <span class="tag warn" style="font-size:.66rem">entamé · DLC 7 j</span>':''} périme <b>${jTxt}</b> (${fmtDate(s.dlc)}), et ton stock fini est actuellement de <b>${qty(s.stockFini)}</b>.</div>
      <div class="gaspi-foot"><span class="tag ${urgent?'out':'warn'}">DLC ${s.joursAvantDLC<=0?'⚠ dépassée/jour J':'J−'+s.joursAvantDLC}</span>
        <button class="btn gold sm" onclick="goView('productions')">⚙ Lancer la production</button></div>
    </div>`;
  }).join('');
  box.innerHTML=`<div class="panel"><h2>♻️ Anti-gaspi — à écouler en priorité</h2>${cards}</div>`;
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

// Envoi fluide : Entrée envoie, Maj+Entrée = nouvelle ligne. Anti double-déclenchement.
let _aiRunning=false;
// Aperçu photo en mémoire vive UNIQUEMENT (jamais enregistré en base/cache). Réinitialisé à chaque rendu.
let _aiPhotoPreview=null;
function aiInputKey(ev){
  if(ev.key==='Enter' && !ev.shiftKey){ ev.preventDefault(); aiRun(); }
}
// Gère la pièce jointe choisie : .txt/.csv/.md → injecté dans la demande ; image → aperçu temporaire.
function aiAttachFile(files){
  const f=files&&files[0]; if(!f){ return; }
  const isImage=(f.type||'').startsWith('image/');
  const isPdf = (f.type||'')==='application/pdf' || /\.pdf$/i.test(f.name||'');
  const isText = /^(text\/|application\/(json|csv))/.test(f.type||'') || /\.(txt|csv|md|text|json)$/i.test(f.name||'');
  if(isPdf){
    aiAttachPdf(f);
  } else if(isImage){
    // Limite douce : on n'affiche un aperçu que pour des images raisonnables (évite de saturer la RAM).
    if(f.size > 12*1024*1024){ toast('Image trop lourde pour l\'aperçu (max ~12 Mo)'); document.getElementById('aiFileInput').value=''; return; }
    const reader=new FileReader();
    reader.onload=e=>{ _aiPhotoPreview=e.target.result; aiRenderAttach(f.name); };
    reader.onerror=()=>toast('Lecture de l\'image impossible');
    reader.readAsDataURL(f);
  } else if(isText){
    const reader=new FileReader();
    reader.onload=e=>{
      const content=String(e.target.result||'').trim();
      if(!content){ toast('Fichier texte vide'); return; }
      const ta=document.getElementById('aiInput');
      if(ta){
        const sep = ta.value.trim() ? '\n\n' : '';
        ta.value = ta.value + sep + content;
        ta.focus();
      }
      toast(`Texte de « ${f.name} » ajouté à la demande ✓`);
    };
    reader.onerror=()=>toast('Lecture du fichier impossible');
    reader.readAsText(f);
  } else {
    toast('Format non géré : utilise un .txt ou une photo');
  }
  // réinitialise l'input pour permettre de re-sélectionner le même fichier
  const fi=document.getElementById('aiFileInput'); if(fi) fi.value='';
}
// ---- PIÈCE JOINTE PDF (module isolé, chargé à la demande) ----
let _pdfModuleLoading=null;
function aiLoadPdfModule(){
  if(window.PDFTextExtractor) return Promise.resolve(true);
  if(_pdfModuleLoading) return _pdfModuleLoading;
  _pdfModuleLoading=new Promise((resolve)=>{
    const s=document.createElement('script');
    s.src='./pdf_extract.js';
    s.onload=()=>resolve(!!window.PDFTextExtractor);
    s.onerror=()=>resolve(false);
    document.head.appendChild(s);
  });
  return _pdfModuleLoading;
}
async function aiAttachPdf(f){
  if(f.size > 20*1024*1024){ toast('PDF trop lourd (max ~20 Mo)'); return; }
  toast('Lecture du PDF…');
  const ok=await aiLoadPdfModule();
  if(!ok || !window.PDFTextExtractor){ toast('Module PDF indisponible'); return; }
  let text='';
  try{ text=await window.PDFTextExtractor.extractText(f); }catch(e){ text=''; }
  if(text && text.trim().length>=3){
    const ta=document.getElementById('aiInput');
    if(ta){ const sep=ta.value.trim()?'\n\n':''; ta.value=ta.value+sep+text.trim(); ta.focus(); }
    toast(`Texte de « ${f.name} » ajouté ✓`);
  } else {
    // PDF scanné/sans texte exploitable : on l'indique sans rien stocker.
    const w=document.getElementById('aiAttachWrap');
    if(w){ w.style.display='block';
      w.innerHTML=`<div style="display:flex;align-items:center;gap:10px;background:var(--paper,#f7f1e7);border:1px solid #e6dac8;border-radius:10px;padding:8px">
        <span style="font-size:1.4rem">📄</span>
        <div style="flex:1;font-size:.82rem;color:#6a5a52;min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</b><span class="note">PDF sans texte détecté (scan ?) · tape les détails à la main</span></div>
        <button class="btn ghost sm" onclick="aiRemovePhoto()">✕ Retirer</button></div>`;
    }
    toast('Aucun texte détecté dans ce PDF');
  }
  const fi=document.getElementById('aiFileInput'); if(fi) fi.value='';
}
// Affiche l'aperçu photo temporaire (en RAM) avec bouton de retrait.
function aiRenderAttach(name){
  const w=document.getElementById('aiAttachWrap'); if(!w) return;
  if(!_aiPhotoPreview){ w.style.display='none'; w.innerHTML=''; return; }
  w.style.display='block';
  w.innerHTML=`<div style="display:flex;align-items:center;gap:10px;background:var(--paper,#f7f1e7);border:1px solid #e6dac8;border-radius:10px;padding:8px">
    <img src="${_aiPhotoPreview}" alt="aperçu" style="width:54px;height:54px;object-fit:cover;border-radius:8px;flex:none">
    <div style="flex:1;font-size:.82rem;color:#6a5a52;min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name||'photo')}</b><span class="note">Pense-bête visuel · non enregistré</span></div>
    <button class="btn ghost sm" onclick="aiRemovePhoto()">✕ Retirer</button>
  </div>`;
}
function aiRemovePhoto(){ _aiPhotoPreview=null; aiRenderAttach(''); }
function aiClearAll(){
  const ta=document.getElementById('aiInput'); if(ta) ta.value='';
  const out=document.getElementById('aiOut'); if(out) out.innerHTML='';
  aiRemovePhoto();
}
async function aiRun(){
  if(_aiRunning) return;            // évite les envois multiples (taps rapides)
  const ta=document.getElementById('aiInput');
  const txt=(ta?.value||'').trim();
  if(!txt){ return; }
  _aiRunning=true;
  try{
    const flavors=FLAVORS;
    const clients=await db.clients.toArray();
    const materials=await db.materials.toArray();
    const r=parseIntent(txt,{flavors,clients,materials});
    aiPending=null;
    // Question d'aide / mode d'emploi → base de connaissance (sauf si une intention
    // d'ACTION ou de DONNÉES précise a été reconnue, qu'on laisse passer en priorité).
    if(isHelpQuery(txt) && (r.intent==='unknown' || !r.intent || r.intent==='add_box')){
      return aiHelp(txt);
    }
    switch(r.intent){
      case 'query_stock': return aiQueryStock(r.params);
      case 'query_locate': return aiQueryLocate(r.params);
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
        // Dernier recours : on tente la base de connaissance avant d'abandonner.
        { const hits=kbSearch(txt); if(hits.length) return aiHelp(txt); }
        return aiSay(`<p>Je n'ai pas compris « ${esc(txt)} ».</p>
          <p class="note">Pose une question d'aide (ex. <i>« comment fonctionne le picking ? »</i>) ou tape <b>aide</b>. Exemples d'actions : <i>Quel est le stock de chocolat ?</i> · <i>Crée une commande pour M. Dupont vendredi</i> · <i>Commandes à préparer demain</i>.</p>`);
    }
  } catch(e){
    aiSay(`<p>Une erreur est survenue : ${esc(e.message||'inconnue')}.</p><p class="note">Réessaie ou reformule ta demande.</p>`);
  } finally {
    _aiRunning=false;
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
// LOCALISATION des macarons finis par parfum : détail des batchs + emplacements,
// présenté dans une popup lisible. Si aucun parfum reconnu, propose la liste.
async function aiQueryLocate(params){
  const recipes=await db.recipes.toArray();
  const prods=await db.productions.toArray();
  // parfum non reconnu → demander lequel (boutons des parfums effectivement en stock)
  if(!params.flavor){
    const stockByRec={};
    prods.forEach(p=>{ if(+p.qteRestante>0) stockByRec[p.recipeId]=(stockByRec[p.recipeId]||0)+(+p.qteRestante||0); });
    const dispo=recipes.filter(r=>stockByRec[r.id]>0)
      .sort((a,b)=>stockByRec[b.id]-stockByRec[a.id]);
    if(!dispo.length) return aiSay(`<p>Aucun macaron fini en stock actuellement.</p>`);
    return aiSay(`<h3 style="font-size:1rem;margin-bottom:6px">Quel parfum localiser ?</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${dispo.map(r=>`<button class="btn ghost sm" onclick="document.getElementById('aiInput').value=${JSON.stringify('où sont mes macarons '+r.produitNom)};aiRun()">${esc(r.produitNom)} <span style="color:#9a8a82">(${qty(stockByRec[r.id])})</span></button>`).join('')}</div>`);
  }
  // recettes correspondant au parfum (inclusion normalisée)
  const fn=aiNormalize(params.flavor);
  const recIds=recipes.filter(r=>{ const rn=aiNormalize(r.produitNom); return rn===fn||rn.includes(fn)||fn.includes(rn); }).map(r=>r.id);
  const recName=id=>(recipes.find(r=>r.id===id)||{}).produitNom||'—';
  // batchs finis en stock pour ce parfum
  let batchs=prods.filter(p=>recIds.includes(p.recipeId) && round3(+p.qteRestante)>0);
  if(!batchs.length){
    aiLocatePopup(params.flavor, [], 0);
    return aiSay(`<p>Aucun batch de <b>${esc(params.flavor)}</b> en stock actuellement. <span class="act" onclick="goView('productions')">Voir les productions →</span></p>`);
  }
  // regrouper par emplacement
  const byEmp={};
  batchs.forEach(p=>{ const k=p.emplacement||''; (byEmp[k] ||= []).push(p); });
  const total=batchs.reduce((s,p)=>s+(+p.qteRestante||0),0);
  aiLocatePopup(params.flavor, byEmp, total, recName);
  // trace courte dans le fil de l'assistant
  const zones=Object.keys(byEmp).map(k=>`${empLettre(k)} (${qty(byEmp[k].reduce((s,p)=>s+(+p.qteRestante||0),0))})`).join(' · ');
  aiSay(`<h3 style="font-size:1rem">📍 ${esc(params.flavor)} — ${qty(total)} en stock</h3>
    <div class="sum-box"><span>Répartition</span><b>${zones}</b></div>
    <p class="note">Détail affiché dans la fenêtre. <span class="act" onclick="aiLocateReopen()">Rouvrir</span></p>`);
  // mémorise pour réouverture
  window._aiLastLocate={flavor:params.flavor, byEmp, total};
}
function aiLocateReopen(){ const L=window._aiLastLocate; if(L) aiLocatePopup(L.flavor, L.byEmp, L.total); }
// Popup lisible : un bloc par emplacement, avec chaque batch (lot, qté, DLC, statut).
function aiLocatePopup(flavor, byEmp, total, recName){
  recName=recName||(id=>'');
  let body;
  if(!total){
    body=`<p class="note">Aucun batch en stock pour ce parfum.</p>`;
  } else {
    // ordre : frigo d'abord, puis congélateurs
    const order=['frigo','bahut','colonne','petit',''];
    const keys=Object.keys(byEmp).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
    body=keys.map(k=>{
      const e=empInfo(k);
      const list=byEmp[k].slice().sort((a,b)=>(a.dlcProduit||'9999').localeCompare(b.dlcProduit||'9999'));
      const sousTot=list.reduce((s,p)=>s+(+p.qteRestante||0),0);
      const rows=list.map(p=>{
        const st=prodStatut(p);
        const dlc=p.dlcProduit?`DLC ${fmtDate(p.dlcProduit)}`:'DLC non figée';
        const dj=p.dlcProduit?daysTo(p.dlcProduit):null;
        const dlcCol = dj!=null&&dj<=2?'color:var(--red,#b3261e);font-weight:600':'';
        return `<div class="loc-batch">
          <div class="loc-batch-main"><b>Lot ${esc(p.lotProduction||('#'+p.id))}</b>
            <span class="tag ${st==='termine'?'ok':'event'}" style="font-size:.66rem">${st==='termine'?'✓ prêt':'▶ en cours'}</span></div>
          <div class="loc-batch-sub"><span style="${dlcCol}">${dlc}${dj!=null&&dj<=2?` (J${dj<=0?'':'−'}${dj<=0?'0':dj})`:''}</span> · fabriqué le ${fmtDate(p.date)}</div>
          <div class="loc-batch-qty">${qty(p.qteRestante)}</div></div>`;
      }).join('');
      const bg = e.type==='frigo' ? '#6aa3a0' : '#3b6ea5';
      return `<div class="loc-zone">
        <div class="loc-zone-head"><span class="tag" style="background:${bg||'#999'};color:#fff">${e.icon||'📍'} ${esc(e.nom||'Emplacement non renseigné')} · ${e.lettre||'?'}</span>
          <b>${qty(sousTot)} macaron(s)</b></div>
        ${rows}</div>`;
    }).join('');
  }
  openModal(`<h3>📍 Où sont mes macarons ${esc(flavor)} ?</h3>
    <p class="note" style="margin-bottom:10px">${total?`<b>${qty(total)}</b> macaron(s) répartis sur ${Object.keys(byEmp).length} emplacement(s).`:'Rien en stock pour ce parfum.'}</p>
    ${body}
    <div class="modal-actions"><button class="btn" onclick="closeModal()">Fermer</button></div>`);
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
// Brouillon de commande en cours de dialogue (multi-parfums + format).
let _aiOrderDraft=null;
function aiConfirmCreateOrder(r){
  const p=r.params;
  _aiOrderDraft={
    client:p.client||null, clientNameRaw:p.clientNameRaw||null, date:p.date||null,
    items:(p.items&&p.items.length)?p.items.map(it=>({qte:it.qte, raw:it.raw, flavor:it.flavor||null,
      candidates:it.candidates||[], unknown:!!it.unknown,
      format: p.grandHint?'grand':null })) : [],
    taille:p.taille||null
  };
  aiRenderOrderDraft();
}
// Affiche le brouillon ; demande à lever chaque ambiguïté (parfum puis format).
function aiRenderOrderDraft(){
  const D=_aiOrderDraft; if(!D) return;
  const clientLine = D.client ? D.client.nom : (D.clientNameRaw||'(non précisé)');
  // 1) ambiguïté de PARFUM (ex. "chocolat" → plusieurs)
  const ambig = D.items.find(it=>!it.flavor && it.candidates && it.candidates.length>1);
  if(ambig){
    const idx=D.items.indexOf(ambig);
    return aiSay(`<h3 style="font-size:1rem;margin-bottom:6px">Précision nécessaire</h3>
      <p>Pour « <b>${esc(ambig.raw)}</b> » (${ambig.qte} macaron(s)), quel parfum exactement ?</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
        ${ambig.candidates.map(c=>`<button class="btn ghost sm" onclick="aiOrderSetFlavor(${idx},${JSON.stringify(c).replace(/"/g,'&quot;')})">${esc(c)}</button>`).join('')}
      </div>`);
  }
  // 2) parfum inconnu → saisie libre / proposition
  const unknown=D.items.find(it=>it.unknown && !it.flavor);
  if(unknown){
    const idx=D.items.indexOf(unknown);
    return aiSay(`<h3 style="font-size:1rem;margin-bottom:6px">Parfum non reconnu</h3>
      <p>Je ne connais pas « <b>${esc(unknown.raw)}</b> ». Choisis le parfum voulu :</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
        ${FLAVORS.map(c=>`<button class="btn ghost sm" onclick="aiOrderSetFlavor(${idx},${JSON.stringify(c).replace(/"/g,'&quot;')})">${esc(c)}</button>`).join('')}
        <button class="btn ghost sm" onclick="aiOrderDropItem(${idx})">Retirer cette ligne</button>
      </div>`);
  }
  // 3) ambiguïté de FORMAT (standard vs grand) — une fois les parfums résolus
  const noFmt = D.items.find(it=>it.flavor && !it.format);
  if(noFmt){
    const idx=D.items.indexOf(noFmt);
    return aiSay(`<h3 style="font-size:1rem;margin-bottom:6px">Format ?</h3>
      <p>Les <b>${noFmt.qte} ${esc(noFmt.flavor)}</b>, ce sont des macarons <b>standards</b> ou <b>grand format</b> ?</p>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="btn" onclick="aiOrderSetFormat(${idx},'standard')">Standard</button>
        <button class="btn gold" onclick="aiOrderSetFormat(${idx},'grand')">Grand format</button>
      </div>
      <p class="note" style="margin-top:6px">Astuce : tu peux préciser directement « grand format » dans ta phrase pour éviter la question.</p>`);
  }
  // tout est résolu → récapitulatif + validation
  aiPending={type:'create_order_built', params:{}};
  const estPro = !!(D.client && D.client.type==='Pro');
  const condit = estPro ? 'Vrac pro (boîte réutilisable, tarif pro/macaron)' : 'Coffret';
  const rows=D.items.map(it=>`<div class="sum-box"><span>${it.qte} × ${esc(it.flavor||it.raw)}</span><b>${it.format==='grand'?'Grand format':'Standard'}</b></div>`).join('')
    || '<p class="note">Aucun produit précisé — tu compléteras dans le formulaire.</p>';
  aiSay(`<h3 style="font-size:1rem;margin-bottom:8px">⚠ Commande à valider</h3>
    <div class="sum-box"><span>Client</span><b>${esc(clientLine)}${D.client?` · ${esc(D.client.type||'Particulier')}`:(D.clientNameRaw?' (nouveau)':'')}</b></div>
    <div class="sum-box"><span>Date</span><b>${D.date?fmtDate(D.date):'aujourd\'hui'}</b></div>
    ${rows}
    ${D.items.some(it=>it.flavor && it.format!=='grand')?`<div class="sum-box"><span>Conditionnement standard</span><b>${condit}</b></div>`:''}
    <p class="note">${D.client?(estPro?'Client pro détecté → tarif pro au macaron, sans coffret.':'Client particulier → coffret.'):'Type de client inconnu : coffret par défaut (précise le client pour le tarif pro).'} Je pré-remplis le formulaire ; tu vérifies et enregistres.</p>
    <div class="flex" style="gap:8px;margin-top:10px"><button class="btn ghost" onclick="_aiOrderDraft=null;document.getElementById('aiOut').innerHTML=''">Annuler</button>
      <button class="btn" onclick="aiExecuteOrderDraft()">Ouvrir le formulaire pré-rempli</button></div>`);
}
function aiOrderSetFlavor(idx,flavor){ if(_aiOrderDraft&&_aiOrderDraft.items[idx]){ _aiOrderDraft.items[idx].flavor=flavor; _aiOrderDraft.items[idx].unknown=false; _aiOrderDraft.items[idx].candidates=[]; } aiRenderOrderDraft(); }
function aiOrderSetFormat(idx,fmt){ if(_aiOrderDraft&&_aiOrderDraft.items[idx]){ _aiOrderDraft.items[idx].format=fmt; } aiRenderOrderDraft(); }
function aiOrderDropItem(idx){ if(_aiOrderDraft){ _aiOrderDraft.items.splice(idx,1); } aiRenderOrderDraft(); }
// Construit la commande dans le formulaire : standards → coffret(s) par parfum ; grand format → ligne grand.
async function aiExecuteOrderDraft(){
  const D=_aiOrderDraft; if(!D) return;
  aiPending=null;
  document.getElementById('aiOut').innerHTML='';
  if(D.client){ await cmdForm(0,{clientId:D.client.id}); }
  else { await cmdForm(0); }
  // date
  setTimeout(async ()=>{
    const d=document.getElementById('f_date'); if(d&&D.date) d.value=D.date;
    if(D.clientNameRaw && !D.client){ const s=document.getElementById('f_clsearch'); if(s) s.value=D.clientNameRaw; }
    // Construit les lignes selon le TYPE DU CLIENT (consulté en base) :
    //  - PRO  → macarons standards en VRAC (boîte réutilisable non facturée), tarif pro/macaron
    //  - PARTICULIER → COFFRET (taille la plus petite couvrant le total, par défaut 6)
    const standards=D.items.filter(it=>it.flavor && it.format!=='grand');
    const grands=D.items.filter(it=>it.flavor && it.format==='grand');
    const estPro = !!(D.client && D.client.type==='Pro');
    if(typeof cmdLines!=='undefined'){
      if(standards.length){
        const parfums={}; standards.forEach(it=>{ parfums[it.flavor]=(parfums[it.flavor]||0)+it.qte; });
        if(estPro){
          cmdLines.push({type:'vrac', parfums});   // pro : vrac au tarif pro, sans coffret
        } else {
          const total=Object.values(parfums).reduce((s,q)=>s+q,0);
          const taille=D.taille || (BOX_SIZES.find(t=>t>=total) || BOX_SIZES[BOX_SIZES.length-1]);
          cmdLines.push({type:'coffret', taille, parfums});
        }
      }
      if(grands.length){
        const items={}; grands.forEach(it=>{ items[it.flavor]=(items[it.flavor]||0)+it.qte; });
        cmdLines.push({type:'grand', tarif: estPro?'pro':'particulier', items});
      }
      if(typeof drawLines==='function') drawLines();
      else if(typeof cmdRecalc==='function') cmdRecalc();
    }
    toast(estPro?'Client pro : macarons en vrac au tarif pro — vérifie puis enregistre':'Commande pré-remplie — vérifie le prix puis enregistre');
  },150);
  _aiOrderDraft=null;
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
  // Événement issu d'un marché planifié : géré depuis l'onglet Marchés
  if(e.type==='marche' && typeof e.refId==='string' && e.refId.indexOf('mk')===0){
    const mkId=+e.refId.slice(2);
    const mk=await db.markets.get(mkId);
    openModal(`<h3>Détail de l'événement</h3>
      <div class="sum-box"><span>Type</span><b>Marché</b></div>
      <div class="sum-box"><span>Intitulé</span><b>${esc(e.titre)}</b></div>
      <div class="sum-box"><span>Date</span><b>${fmtDate(e.date)}</b></div>
      ${mk?`<div class="sum-box"><span>Lieu</span><b>${esc(mk.lieu||'—')}</b></div>
      <div class="sum-box"><span>Quantité prévue</span><b>${mk.prevuQte?qty(mk.prevuQte)+' macarons':'—'}</b></div>`:'<p class="note">Marché associé introuvable.</p>'}
      <p class="note">Cet événement est rattaché à un marché. Pour le modifier, passez par l'onglet Marchés.</p>
      <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button>
      ${mk?`<button class="btn" onclick="closeModal();view='marches';setActiveView&&setActiveView('marches');renderMarkets();marketDetail(${mkId})">Voir le marché</button>`:''}</div>`);
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
  const e=await db.events.get(id); const snap=e?{...e}:null;
  await db.events.delete(id); closeModal(); renderCal();
  if(snap) showUndoToast('Événement supprimé', async()=>{ await db.events.put(snap); renderCal(); });
  else toast('Événement supprimé');
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
   <div class="topbar"><div><h1>Étiquettes</h1><p>Format thermique 50 × 25 mm — Phomemo D520BT (AirPrint)</p></div></div>
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
     ${prods.map(p=>{
       const st = prodStatut(p);
       const dlcTxt = st!=='termine' ? '⏳ démarre à la fin de prod' : (p.dlcProduit?fmtDate(p.dlcProduit):'— à compléter —');
       return `<div class="label" data-prod="${p.id}">
        <div class="qr"><canvas data-lot="${esc(p.lotProduction||'')}"></canvas></div>
        <div class="info">
          <b>${esc(recName(p.recipeId))}</b>
          <span class="meta">Lot : ${esc(p.lotProduction||'—')}</span>
          <span class="meta">Emplacement : ${p.emplacement?`${empIcon(p.emplacement)} ${esc(empNom(p.emplacement))} (${empLettre(p.emplacement)})`:'—'}</span>
          <span class="meta">Statut : ${st==='termine'?'✓ Terminée':'▶ Démarrée'}</span>
          <span class="meta">DLC : ${dlcTxt}</span>
          <span class="meta">Fab. : ${(p.prodTermineTs||(st==='termine'?p.prodTimestamp:'')) ? fmtDateTime(p.prodTermineTs||p.prodTimestamp) : fmtDate(p.date)}</span>
        </div>
        <div class="label-actions">
          <label class="copies">Copies <input type="number" id="lblCopies_${p.id}" min="1" max="200" value="1"></label>
          <button class="btn ghost sm" onclick="printLabelCopies(${p.id})">⎙ Imprimer</button>
        </div>
     </div>`;}).join('')}
   </div>`:`<div class="empty">Aucun batch produit. Lance une production pour générer ses étiquettes.</div>`}
   </div>`;
  document.querySelectorAll('#labelsGrid canvas').forEach(cv=>{
    const lot = cv.getAttribute('data-lot');
    try{ QR.render(cv, traceUrl(lot), {scale:4, dark:'#000000', light:'#ffffff'}); }
    catch(e){ console.error('QR',e); }
  });
}

/* ============================================================
   IMPRESSION D'ÉTIQUETTES THERMIQUES 50×25 mm via AirPrint
   Architecture : buildLabelData (données) → renderLabelHTML (1 étiquette)
   → printLabelSheet (feuille de N étiquettes, 1 par page 50×25).
   Web Bluetooth volontairement écarté : non supporté par Safari iOS.
   Un backend Bluetooth/ESC-POS pourra se brancher ici plus tard (Android/desktop).
   ============================================================ */
// Prépare les données d'étiquette d'un batch de production.
async function buildLabelData(prodId){
  const p = await db.productions.get(prodId);
  if(!p) return null;
  const rec = p.recipeId!=null ? await db.recipes.get(p.recipeId) : null;
  const tmp = document.createElement('canvas');
  try{ QR.render(tmp, traceUrl(p.lotProduction||''), {scale:6, dark:'#000000', light:'#ffffff'}); }catch(e){}
  return {
    produit: rec?rec.produitNom:'Produit',
    lot: p.lotProduction||'—',
    dlc: p.dlcProduit ? fmtDate(p.dlcProduit) : '—',
    // Fabrication = heure de FIN de production (prodTermineTs).
    // Repli : ancien horodatage de fin, sinon date saisie. Heure au format 00:00.
    fab: (p.prodTermineTs || (prodStatut(p)==='termine' ? p.prodTimestamp : '')) ? fmtDateTime(p.prodTermineTs || p.prodTimestamp) : fmtDate(p.date),
    emplacement: p.emplacement ? empNom(p.emplacement) : '',
    empLettre: p.emplacement ? empLettre(p.emplacement) : '',
    empType: p.emplacement ? empInfo(p.emplacement).type : '',
    qr: tmp.toDataURL('image/png')
  };
}
// HTML d'UNE étiquette (50×25 mm, noir sur blanc, QR à gauche / infos à droite).
// La lettre d'emplacement est affichée dans une pastille pour localiser la production.
function renderLabelHTML(d){
  const pastille = d.empLettre ? `<span class="emp">${esc(d.empLettre)}</span>` : '';
  return `<div class="lab">
     <div class="q"><img src="${d.qr}"></div>
     <div class="t">
       <div class="prod">${esc(d.produit)}${pastille}</div>
       <div class="row">Lot ${esc(d.lot)}</div>
       <div class="dlc">DLC ${esc(d.dlc)}</div>
       <div class="row">Fab. ${esc(d.fab)}</div>
     </div>
   </div>`;
}
// Ouvre une fenêtre d'impression contenant une feuille de plusieurs étiquettes.
// `labels` = tableau de données d'étiquette (déjà multiplié par le nombre de copies).
// Format Phomemo D520BT : 50 mm (longueur) × 25 mm (hauteur), QR à gauche, texte à droite.
function printLabelSheet(labels, titre){
  if(!labels || !labels.length){ toast('Aucune étiquette à imprimer'); return; }
  const win = window.open('', '_blank', 'width=420,height=300');
  if(!win){ toast('Autorise les fenêtres pour imprimer'); return; }
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(titre||'Étiquettes')}</title>
   <style>
     @page { size: 50mm 25mm; margin: 0; }
     * { margin:0; padding:0; box-sizing:border-box; }
     html,body { background:#fff; }
     .lab { width:50mm; height:25mm; background:#fff; color:#000; padding:1.2mm;
            font-family:Arial,Helvetica,sans-serif; display:flex; gap:1.2mm; align-items:center;
            page-break-after:always; break-after:page; overflow:hidden; }
     .lab:last-child { page-break-after:auto; break-after:auto; }
     /* QR carré calé sur la hauteur utile (25 − 2×1.2 padding ≈ 22.6 mm) */
     .lab .q { width:21mm; height:21mm; flex-shrink:0; }
     .lab .q img { width:21mm; height:21mm; display:block; image-rendering:pixelated; }
     .lab .t { flex:1; min-width:0; line-height:1.15; overflow:hidden; }
     .lab .prod { font-size:2.9mm; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
     .lab .prod .emp { display:inline-block; border:0.3mm solid #000; border-radius:1mm; padding:0 0.8mm; margin-left:1mm; font-size:2.6mm; line-height:1; }
     .lab .row { font-size:2.3mm; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
     .lab .dlc { font-size:2.7mm; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
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
  const p = await db.productions.get(prodId);
  if(p && prodStatut(p)!=='termine'){
    if(!confirm('Cette production est encore « démarrée » : sa DLC n\'est pas figée. Imprimer quand même une étiquette sans DLC ?')) return;
  }
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


const TABLES = ['suppliers','materials','materialLots','recipes','recipeItems','productions','prodConsumption','clients','orders','orderItems','events','products','charges','markets','marketMoves','losses','workSessions','pmsEquipments','temperatureLogs','pmsTasks','cleaningLogs'];
const BACKUP_VERSION = 2;
const MAX_BACKUPS = 20; // historique conservé en base (les plus anciens sont purgés)

// ---- Construction d'un instantané structuré ----
async function buildDump(){
  const dump={_app:'sensations-macarons',_version:BACKUP_VERSION,_date:new Date().toISOString()};
  for(const t of TABLES) dump[t]=await db.table(t).toArray();
  dump._localStorage = collectLocalSettings(); // réglages hors IndexedDB (emballages, charges, préférences…)
  dump._checksum = backupChecksum(dump);        // checksum calculé sur les TABLES uniquement
  return dump;
}
// Clés localStorage incluses dans les sauvegardes (réglages persistants, hors état purement transitoire).
const BACKUP_LS_KEYS = ['sm_settings','sm_autoPay','sm_privacyMode','sm_nav_adv','sm_lastExport','sm_lastICloud','sm_autoBackupDate'];
function collectLocalSettings(){
  const o={};
  BACKUP_LS_KEYS.forEach(k=>{ const v=localStorage.getItem(k); if(v!=null) o[k]=v; });
  return o;
}
// Restaure les réglages localStorage depuis un dump (remplacement). Sans effet si absent.
function applyLocalSettings(dump){
  if(!dump || typeof dump._localStorage!=='object' || !dump._localStorage) return;
  BACKUP_LS_KEYS.forEach(k=>{ if(dump._localStorage[k]!=null) localStorage.setItem(k, dump._localStorage[k]); });
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
  applyLocalSettings(dump); // réapplique les réglages (emballages, charges, préférence de menu…) si présents
}

// ---- EXPORT MANUEL (fichier .json téléchargé) ----
async function exportData(){
  const dump=await buildDump();
  const blob=new Blob([JSON.stringify(dump,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='sensations-macarons-sauvegarde-'+today()+'.json'; a.click();
  localStorage.setItem('sm_lastExport', today());
  localStorage.removeItem('sm_exportSnooze');
  // Message honnête : sur iPhone, Safari ouvre une fenêtre où l'utilisateur choisit
  // d'enregistrer le fichier (Fichiers / iCloud). L'app ne peut PAS savoir si la
  // sauvegarde a été confirmée — on décrit donc l'action, sans affirmer « c'est fait ».
  toast('Fichier prêt — choisis où l\'enregistrer (Fichiers / iCloud) 📂');
}

/* ============================================================
   SAUVEGARDE VERS iCLOUD DRIVE (via la feuille de partage iOS)
   ------------------------------------------------------------
   Une PWA ne peut pas écrire seule dans iCloud Drive (bac à sable du
   navigateur). La seule voie fiable sur iPhone est l'API Web Share avec
   un FICHIER : elle ouvre la feuille de partage native, où l'utilisateur
   choisit « Enregistrer dans Fichiers → iCloud Drive ». Le dossier est
   mémorisé par iOS, donc les fois suivantes ne demandent qu'une validation.
   Repli : si le partage de fichier n'est pas disponible (ex. ordinateur),
   on retombe sur le téléchargement classique (.json).
   ============================================================ */
async function shareBackupToICloud(opts){
  opts = opts || {};
  try{
    const dump = await buildDump();
    const json = JSON.stringify(dump, null, 2);
    const nomFichier = 'sensations-macarons-sauvegarde-'+today()+'.json';
    // 1) Voie idéale iOS : partage d'un vrai fichier
    if(navigator.canShare){
      const file = new File([json], nomFichier, {type:'application/json'});
      if(navigator.canShare({files:[file]})){
        await navigator.share({
          files:[file],
          title:'Sauvegarde Sensations Macarons',
          text:'Sauvegarde du '+fmtDate(today())+' — choisis « Enregistrer dans Fichiers » puis iCloud Drive.'
        });
        // succès : on note la date et on prend aussi un instantané interne
        localStorage.setItem('sm_lastICloud', today());
        localStorage.setItem('sm_lastExport', today());
        localStorage.removeItem('sm_exportSnooze');
        try{ await snapshotBackup('icloud'); }catch(e){}
        toast('Sauvegarde envoyée — enregistre-la dans iCloud Drive ✓');
        if(typeof renderBackups==='function' && view==='backups') renderBackups();
        return true;
      }
    }
    // 2) Repli : téléchargement classique (ordinateur, ou navigateur sans partage de fichier)
    const blob=new Blob([json],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=nomFichier; a.click();
    localStorage.setItem('sm_lastExport', today());
    localStorage.removeItem('sm_exportSnooze');
    try{ await snapshotBackup('icloud'); }catch(e){}
    toast('Partage direct indisponible : fichier téléchargé. Range-le dans iCloud Drive.');
    return true;
  }catch(e){
    // l'utilisateur a annulé la feuille de partage, ou erreur : pas grave, on reste silencieux
    if(e && e.name==='AbortError'){ return false; }
    console.error('shareBackupToICloud', e);
    toast('Sauvegarde iCloud annulée ou impossible.');
    return false;
  }
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
  toast('Fichier prêt — choisis où l\'enregistrer (Fichiers / iCloud) 📂');
}
async function deleteBackup(id){
  if(!confirm('Supprimer cette sauvegarde de l\'historique ?')) return;
  await db.backups.delete(id); renderBackups(); toast('Supprimée');
}

// ---- ÉCRAN SAUVEGARDE & SÉCURITÉ ----
// ============================================================
//  REPRISE / MIGRATION — saisie de l'historique sans déclencher
//  la mécanique opérationnelle (production, picking, alertes).
//  Une commande "historique" : {histo:true, statut:'Livrée',
//  paiement:'Payé', montant, date} → compte dans le CA, mais
//  l'app NE demande NI production NI picking NI matières.
// ============================================================
// Détail parfums d'une commande historique (alimente les stats sans toucher au CA).
let migParfums=[];
function migParfumOptions(){
  const all=[...FLAVORS, ...((typeof BIG_FORMATS!=='undefined')?BIG_FORMATS:[])];
  return [...new Set(all)].sort((a,b)=>a.localeCompare(b,'fr')).map(f=>`<option value="${esc(f)}">`).join('');
}
function migParfumDraw(){
  const box=document.getElementById('mig_parfums'); if(!box) return;
  box.innerHTML = `<datalist id="migFlavorList">${migParfumOptions()}</datalist>` + (migParfums.length?migParfums.map((p,i)=>`
    <div class="bom-line">
      <input list="migFlavorList" value="${esc(p.nom)}" placeholder="parfum" oninput="migParfums[${i}].nom=this.value">
      <input type="number" min="1" step="1" value="${p.qte}" placeholder="qté" oninput="migParfums[${i}].qte=+this.value">
      <span class="x" onclick="migParfumDel(${i})">×</span>
    </div>`).join(''):'<p class="note">Aucun parfum ajouté (facultatif).</p>');
}
function migParfumAdd(){ migParfums.push({nom:'',qte:1}); migParfumDraw(); }
function migParfumDel(i){ migParfums.splice(i,1); migParfumDraw(); }
async function renderMigration(){
  migParfums=[];
  const orders = await db.orders.toArray();
  const histo = orders.filter(o=>o.histo).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const clients = await db.clients.toArray();
  const cname = id => (clients.find(c=>c.id===id)||{}).nom || '—';
  // Matières & emballages, triés par catégorie puis nom (pour le stock de départ rapide).
  const _mats = (await db.materials.toArray()).sort((a,b)=>
    ((a.categorie==='emballage')-(b.categorie==='emballage')) || (a.nom||'').localeCompare(b.nom||''));
  const matOpts = _mats.map(m=>{
    const emb = m.categorie==='emballage';
    const u = emb ? (m.unite||'unité') : 'g';   // denrées saisies en grammes (converties en kg au stockage)
    return `<option value="${m.id}" data-emb="${emb?1:0}" data-unite="${esc(u)}">${emb?'📦 ':'🥚 '}${esc(m.nom)} (${esc(u)})</option>`;
  }).join('');
  const totCA = histo.reduce((s,o)=>s+(+o.montant||0),0);
  const byMonth={};
  histo.forEach(o=>{ const m=(o.date||'').slice(0,7)||'?'; byMonth[m]=(byMonth[m]||0)+(+o.montant||0); });
  const moisRows = Object.keys(byMonth).sort().reverse().map(m=>`<tr><td>${esc(m)}</td><td><b>${euro(byMonth[m])}</b></td></tr>`).join('');
  const clientOpts = clients.slice().sort((a,b)=>(a.nom||'').localeCompare(b.nom||''))
    .map(c=>`<option value="${c.id}">${esc(c.nom)}</option>`).join('');
  const rows = histo.slice(0,60).map(o=>`<tr>
      <td>${fmtDate(o.date)}</td>
      <td>${esc(o.clientId?cname(o.clientId):(o.histoLabel||'—'))}</td>
      <td><b>${euro(o.montant)}</b></td>
      <td style="text-align:right"><span class="act del" onclick="migDeleteOrder(${o.id})">Suppr.</span></td></tr>`).join('');

  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Reprise / migration</h1><p>Saisis ton historique sans déclencher la production</p></div></div>
   <div class="banner">📥 <div>Ce mode te permet de comptabiliser ton <b>chiffre d'affaires passé</b> et ton <b>stock de départ</b>. Les commandes saisies ici sont marquées <b>« historique »</b> : elles comptent dans le CA et les stats, mais l'application ne demande <b>ni production, ni picking, ni matières</b> et ne génère <b>aucune alerte</b> dessus.</div></div>

   <div class="panel"><h2>1 · Commande historique (déjà réalisée)</h2>
     <div class="row2">
       <div class="field"><label>Date</label><input type="date" id="mig_date" value="${today()}"></div>
       <div class="field"><label>Montant encaissé (€)</label><input type="number" min="0" step="0.01" id="mig_montant" placeholder="ex : 48.00"></div>
     </div>
     <div class="field"><label>Client (optionnel)</label>
       <select id="mig_client"><option value="">— sans client / divers —</option>${clientOpts}</select></div>
     <div class="field"><label>Libellé si sans client (optionnel)</label><input id="mig_label" placeholder="ex : Marché de Noël, ventes diverses…"></div>
     <div class="field"><label>Détail des parfums <span style="color:#9a8a82;font-weight:400">— optionnel, alimente les statistiques & tendances</span></label>
       <div id="mig_parfums"></div>
       <button class="btn ghost sm" style="margin-top:6px" onclick="migParfumAdd()">+ Ajouter un parfum</button>
       <p class="note">Renseigne les parfums vendus et leurs quantités pour voir émerger les tendances (parfums populaires, saisonnalité). Sans impact sur le montant : le CA reste celui que tu as saisi.</p>
     </div>
     <button class="btn gold" style="width:100%" onclick="migSaveOrder()">＋ Ajouter au chiffre d'affaires</button>
     <p class="note">Astuce : pour un mois entier, tu peux saisir une seule ligne au total du mois (avec un libellé), ou plusieurs commandes détaillées — comme tu préfères.</p>
   </div>

   <div class="panel"><h2>2 · Stock de départ — produits finis</h2>
     <p class="note" style="margin-bottom:8px">Crée un lot de produits finis déjà en stock (compté comme « terminé », sans consommer de matières). Idéal pour partir avec ton stock réel d'aujourd'hui.</p>
     <div class="field"><label>Parfum / recette</label><select id="mig_rec">${(await db.recipes.toArray()).map(r=>`<option value="${r.id}">${esc(r.produitNom)}</option>`).join('')||'<option value="">(crée d\'abord une recette)</option>'}</select></div>
     <div class="row2">
       <div class="field"><label>Quantité en stock (macarons)</label><input type="number" min="1" id="mig_qte" placeholder="ex : 24"></div>
       <div class="field"><label>DLC (optionnel)</label><input type="date" id="mig_dlc"></div>
     </div>
     <div class="field"><label>Emplacement</label>
       <div class="opt-table">
         ${EMPLACEMENTS.map((e,i)=>`<label class="opt-row"><input type="radio" name="mig_emp" value="${e.key}" ${i===0?'checked':''}> <b class="opt-emp" style="background:${e.type==='frigo'?'#6aa3a0':'#3b6ea5'}">${e.lettre}</b> <span class="opt-main"><b>${e.icon} ${esc(e.nom)}</b></span></label>`).join('')}
       </div></div>
     <button class="btn" style="width:100%" onclick="migSaveStock()">＋ Ajouter au stock de produits finis</button>
   </div>

   <div class="panel"><h2>3 · Stock de départ — matières & emballages</h2>
     <p class="note" style="margin-bottom:8px">Saisie rapide de ton stock actuel de matières premières et d'emballages, <b>sans n° de lot ni prix</b>. Ce stock part « à l'équilibre » (aucun écart de valeur) et sera <b>consommé en priorité</b> avant tes futures réceptions, pour une migration en douceur.</p>
     <div class="field"><label>Matière / emballage</label>
       <select id="mig_mat" onchange="migMatUniteHint()">${matOpts||'<option value="">(aucune matière créée)</option>'}</select></div>
     <div class="field"><label>Quantité en stock <span id="mig_matUnite" style="color:#9a8a82;font-weight:400">— en grammes (denrées) / unités (emballages)</span></label>
       <input type="number" min="0" step="0.001" id="mig_matqte" placeholder="ex : 2500"></div>
     <button class="btn" style="width:100%" onclick="migSaveMatStock()">＋ Ajouter au stock de matières</button>
     <p class="note">Les denrées se saisissent en <b>grammes</b> (comme dans les recettes) ; les emballages à l'<b>unité</b>. Tu pourras ensuite réceptionner tes vrais lots normalement : ils s'ajouteront après ce stock de départ.</p>
   </div>

   <div class="panel"><h2>Chiffre d'affaires historique saisi</h2>
     <div class="sum-box"><span>Total CA historique</span><b>${euro(totCA)} · ${histo.length} ligne(s)</b></div>
     ${moisRows?`<div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Mois</th><th>CA</th></tr></thead><tbody>${moisRows}</tbody></table></div>`:''}
     ${rows?`<h3 style="font-size:.95rem;margin:14px 0 6px">Détail</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Client / libellé</th><th>Montant</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${histo.length>60?'<p class="note">60 dernières lignes affichées.</p>':''}`:'<div class="empty">Aucune commande historique saisie pour l\'instant.</div>'}
   </div>`;
  migParfumDraw();
}
async function migSaveOrder(){
  const date=val('mig_date')||today();
  const montant=+val('mig_montant')||0;
  const clientId=+val('mig_client')||0;
  const label=(val('mig_label')||'').trim();
  if(montant<=0){ toast('Indique un montant encaissé'); return; }
  // détail parfums optionnel (alimente les stats/tendances, n'affecte pas le CA)
  const parfums=(migParfums||[]).filter(p=>p.nom&&p.nom.trim()&&+p.qte>0)
    .map(p=>({nom:p.nom.trim(), qte:+p.qte}));
  const lignes = parfums.length ? [{type:'histo', parfums}] : [];
  const o={ clientId:clientId||null, date, montant:money2(montant),
    statut:'Livrée', paiement:'Payé', histo:true, histoLabel:label||'',
    lignes, paiements:[], notes:'(reprise / historique)' };
  await db.orders.add(o);
  const nbMac=parfums.reduce((s,p)=>s+p.qte,0);
  toast(`Ajouté au CA : ${euro(montant)}${nbMac?` · ${nbMac} macaron(s) détaillés`:''} ✓`);
  renderMigration();
}
async function migDeleteOrder(id){
  const o=await db.orders.get(id);
  if(!o||!o.histo){ toast('Ligne introuvable'); return; }
  if(!confirm('Supprimer cette ligne historique ?')) return;
  await db.orders.delete(id);
  renderMigration();
}
async function migSaveStock(){
  const recipeId=+val('mig_rec');
  const qte=+val('mig_qte')||0;
  const dlc=val('mig_dlc')||'';
  const dest=(document.querySelector('input[name="mig_emp"]:checked')||{}).value||'frigo';
  if(!recipeId){ toast('Choisis un parfum/recette'); return; }
  if(qte<=0){ toast('Indique une quantité'); return; }
  const nowIso=new Date().toISOString();
  const base='L-'+today().replace(/-/g,'')+'-'+genLotCode(3);
  const lot=lotAvecEmplacement(base, dest);
  // Production "historique" déjà terminée, SANS consommation de matières.
  await db.productions.add({
    recipeId, lotProduction:lot, lotBase:base, date:today(),
    composant:'complet', histo:true,
    qteTheorique:qte, qteReelle:qte, ecart:0, qteProduite:qte, qteRestante:qte,
    dlcProduit:dlc||'', dlcAuto:!dlc,
    prodStatut:'termine', prodDebutTs:nowIso, prodTermineTs:nowIso, prodTimestamp:nowIso,
    emplacement:dest, emplacementMaj:nowIso, venuDuCongelateur:isFreezer(dest),
    histEmplacement:[{lieu:dest, ts:nowIso, motif:'stock de départ (reprise)'}]
  });
  toast(`Stock ajouté : ${qty(qte)} ✓`);
  renderMigration();
}
// Met à jour le libellé d'unité sous le sélecteur de matière (g pour denrées, unité pour emballages).
function migMatUniteHint(){
  const sel=document.getElementById('mig_mat'); const hint=document.getElementById('mig_matUnite');
  if(!sel||!hint) return;
  const opt=sel.options[sel.selectedIndex];
  const u=opt?opt.getAttribute('data-unite'):'';
  const emb=opt&&opt.getAttribute('data-emb')==='1';
  hint.textContent = u ? `— en ${emb?u:'grammes'}` : '';
}
// Crée un LOT DE REPRISE (stock de départ) pour une matière/emballage :
//  - sans n° de lot ni prix (prix 0 → aucun écart de valeur),
//  - marqué repriseStock:true → consommé EN PRIORITÉ (avant tout autre lot),
//  - DLC laissée vide → aucune fausse alerte « expiré ».
// Les denrées sont saisies en GRAMMES et stockées en KG (÷1000), comme une réception normale.
async function migSaveMatStock(){
  const matId=+val('mig_mat')||0;
  const saisi=round3(+val('mig_matqte')||0);
  if(!matId){ toast('Choisis une matière'); return; }
  if(saisi<=0){ toast('Indique une quantité'); return; }
  const mat=await db.materials.get(matId);
  if(!mat){ toast('Matière introuvable'); return; }
  const emb = mat.categorie==='emballage';
  // Conversion : denrées saisies en g → stockées en kg ; emballages en unités (pas de conversion).
  const qte = emb ? saisi : round3(saisi/1000);
  await db.materialLots.add({
    materialId: matId, supplierId: 0,
    lotFournisseur: '', qteInitiale: qte, qteRestante: qte,
    prix: 0, prixUnitaire: 0,
    dateReception: today(), dlc: '',
    refProduit: '', commentaire: 'Stock de départ (reprise) — consommé en priorité',
    repriseStock: true
  });
  toast(`Stock de départ ajouté : ${qty(saisi)} ${emb?(mat.unite||'unité'):'g'} ✓`);
  renderMigration();
}

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
       <button class="btn" onclick="snapshotBackup('manuel').then(()=>{renderBackups();toast('Sauvegarde créée ✓');})">＋ Sauvegarder maintenant</button>
       <button class="btn gold" onclick="shareBackupToICloud()">☁️ Sauvegarder sur iCloud</button>
       <label class="btn ghost" style="cursor:pointer">⬆ Importer (.json)<input type="file" accept="application/json,.json" style="display:none" onchange="importData(event)"></label>
       <label class="btn ghost" style="cursor:pointer">➕ Importer en fusion (.json)<input type="file" accept="application/json,.json" style="display:none" onchange="importDataMerge(event)"></label>
       <button class="btn ghost" onclick="runConsistencyCheck(true)">🔍 Vérifier l'intégrité</button>
     </div>
     <p class="note"><b>☁️ Sauvegarder sur iCloud</b> : ouvre le partage iOS — choisis <b>« Enregistrer dans Fichiers » → iCloud Drive</b> (le dossier est mémorisé ensuite). « Sauvegarder maintenant » garde une copie dans l'app. L'import « Importer » <b>remplace</b> tout ; « en fusion » <b>ajoute</b> sans rien effacer. Une sauvegarde automatique se fait à l'ouverture.</p>
   </div>
   <div class="panel"><h2>Sauvegarde iCloud & rappel</h2>
     <p class="note" style="margin-bottom:8px">${lastICloudInfo().txt} ${lastExport?`Dernier export hors appareil : <b>${fmtDate(lastExport)}</b>${dExp!==null?` (il y a ${Math.abs(dExp)} j)`:''}.`:'Aucun export hors appareil enregistré.'}</p>
     <button class="btn gold" style="margin-bottom:10px" onclick="shareBackupToICloud()">☁️ Sauvegarder sur iCloud maintenant</button>
     <div class="field"><label>Me rappeler de sauvegarder tous les… (jours)</label>
       <input type="number" min="1" max="60" id="set_expReminder" value="${exportReminderDays()}" onchange="saveExportReminderDays(this.value)"></div>
     <p class="note">À l'ouverture, si la dernière sauvegarde dépasse ce délai, l'app te proposera en un geste de l'enregistrer sur iCloud Drive. Mets <b>1</b> pour un rappel quotidien.</p>
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
  const rows=[['Produit','Lot production','Date','Matière','Lot fournisseur','Fournisseur','DLC']];
  for(const c of conso){
    const lot=await db.materialLots.get(c.materialLotId); if(!lot)continue;
    const mat=await db.materials.get(lot.materialId);
    const sup=lot.supplierId?await db.suppliers.get(lot.supplierId):null;
    rows.push([recipe?recipe.produitNom:'',prod.lotProduction,prod.date,mat?mat.nom:'',lot.lotFournisseur,sup?sup.nom:'',lot.dlc]);
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
  if(o.heureLivraison || o.lieuLivraison){
    L.push('Livraison : '+[o.heureLivraison, o.lieuLivraison].filter(Boolean).join(' · '));
  }
  L.push('========================================');
  L.push('');
  L.push('CLIENT');
  L.push('  '+(cl?cl.nom:'—')+(cl&&cl.type?' ('+cl.type+')':''));
  if(cl&&cl.email) L.push('  '+cl.email);
  if(cl&&cl.tel) L.push('  '+cl.tel);
  L.push('');
  L.push('PRODUITS');
  if(!lignes.length){ L.push('  (aucun détail enregistré)'); }
  lignes.forEach(ln=>{
    if(ln.type==='coffret'){
      const parfums=(ln.parfums||[]).filter(p=>p.qte>0);
      const totQ=parfums.reduce((s,p)=>s+(+p.qte||0),0);
      const _rem=Math.max(0,Math.min(100,+ln.remisePct||0));
      L.push('  - Coffret '+ln.taille+' macarons'+(totQ?' ('+totQ+' macaron'+(totQ>1?'s':'')+')':'')+(_rem>0?' [remise −'+_rem+'%]':'')+' — '+euro(lineTotalStored(ln)));
      parfums.forEach(p=>L.push('      • '+p.nom+' × '+p.qte));
      if(!parfums.length) L.push('      • (parfums non détaillés)');
    } else if(ln.type==='evenement'){
      const parfums=(ln.parfums||[]).filter(p=>p.qte>0);
      const _rem=Math.max(0,Math.min(100,+ln.remisePct||0));
      L.push('  - Événement : '+(ln.evQte||0)+' macarons + '+(ln.equip||0)+' présentoir(s)'+(_rem>0?' [remise −'+_rem+'%]':'')+' — '+euro(lineTotalStored(ln)));
      parfums.forEach(p=>L.push('      • '+p.nom+' × '+p.qte));
    } else if(ln.type==='grand'){
      const items=(ln.items||[]).filter(p=>p.qte>0);
      const totQ=items.reduce((s,p)=>s+(+p.qte||0),0);
      const _rem=Math.max(0,Math.min(100,+ln.remisePct||0));
      L.push('  - Grand format ('+(ln.tarif||'particulier')+')'+(totQ?' — '+totQ+' pièce'+(totQ>1?'s':''):'')+(_rem>0?' [remise −'+_rem+'%]':'')+' — '+euro(lineTotalStored(ln)));
      items.forEach(p=>L.push('      • '+p.nom+' × '+p.qte));
    } else if(ln.type==='vrac'){
      const parfums=(ln.parfums||[]).filter(p=>p.qte>0);
      const totQ=parfums.reduce((s,p)=>s+(+p.qte||0),0);
      const _rem=Math.max(0,Math.min(100,+ln.remisePct||0));
      L.push('  - Vrac pro'+(totQ?' — '+totQ+' macaron'+(totQ>1?'s':''):'')+(_rem>0?' [remise −'+_rem+'%]':'')+' — '+euro(lineTotalStored(ln)));
      parfums.forEach(p=>L.push('      • '+p.nom+' × '+p.qte));
    } else if(ln.type==='don'){
      const parfums=(ln.parfums||[]).filter(p=>p.qte>0);
      const items=(ln.items||[]).filter(p=>p.qte>0);
      L.push('  - Don (offert)');
      parfums.forEach(p=>L.push('      • '+p.nom+' × '+p.qte+' (offert)'));
      items.forEach(p=>L.push('      • '+p.nom+' (grand format) × '+p.qte+' (offert)'));
    } else if(ln.type==='prestation'){
      L.push('  - Prestation / Coaching : '+(ln.libelle||'Prestation')+' — '+euro(lineTotalStored(ln)));
    }
  });
  if(+o.persoMacarons>0){ L.push('  - Personnalisation couleurs : '+o.persoMacarons+' macaron(s)'); }
  // Récapitulatif par parfum (tous coffrets/formats confondus)
  const parfumTot={};
  lignes.forEach(ln=>{ (ln.parfums||[]).forEach(p=>{ if(+p.qte>0) parfumTot[p.nom]=(parfumTot[p.nom]||0)+(+p.qte); });
                       (ln.items||[]).forEach(p=>{ if(+p.qte>0) parfumTot[p.nom]=(parfumTot[p.nom]||0)+(+p.qte); }); });
  const parfumKeys=Object.keys(parfumTot);
  if(parfumKeys.length){
    L.push('');
    L.push('RÉCAP PARFUMS');
    parfumKeys.sort((a,b)=>a.localeCompare(b,'fr')).forEach(k=>L.push('  • '+k+' × '+parfumTot[k]));
  }
  L.push('');
  if(+o.remiseGlobale>0) L.push('Remise globale : −'+o.remiseGlobale+'%');
  L.push('MONTANT : '+euro(o.montant));
  const _livT = computeDeliveryCost(o);
  if(_livT.actif){
    L.push('Livraison : A/R '+_livT.distAR+' km'+(_livT.minutes?' · '+_livT.minutes+' min':'')+' → coût '+euro(_livT.total)+' (carburant '+euro(_livT.coutCarburant)+' + temps '+euro(_livT.coutTemps)+')');
  }
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

// Rappel d'export automatique (parade à la purge iOS d'IndexedDB).
// Réglable : fréquence en jours. Affiche une MODALE actionnable (pas un simple toast
// qu'on rate). Se déclenche au démarrage si l'export hors-appareil est en retard.
function saveExportReminderDays(v){
  const n=parseInt(v,10);
  if(!n||n<1){ toast('Valeur invalide'); return; }
  const s=getSettings(); s.exportReminderDays=Math.min(60,n); saveSettings(s);
  localStorage.removeItem('sm_exportSnooze');
  toast(`Rappel tous les ${Math.min(60,n)} jour(s) ✓`);
}
function exportReminderDays(){
  const s=getSettings();
  const n=parseInt(s.exportReminderDays,10);
  return (n&&n>0)?n:EXPORT_REMINDER_DAYS_DEFAULT;
}
// Texte d'état de la dernière sauvegarde iCloud (pour l'écran Sauvegarde).
function lastICloudInfo(){
  const last=localStorage.getItem('sm_lastICloud');
  if(!last) return {txt:'Aucune sauvegarde iCloud enregistrée pour le moment.', jours:null};
  const d=daysTo(last);
  const age = (d===0||d===null) ? "aujourd'hui" : `il y a ${Math.abs(d)} j`;
  return {txt:`Dernière sauvegarde iCloud : <b>${fmtDate(last)}</b> (${age}).`, jours:d};
}
async function exportReminder(){
  const freq=exportReminderDays();
  const last = localStorage.getItem('sm_lastExport');
  const snooze = localStorage.getItem('sm_exportSnooze'); // date jusqu'à laquelle on ne redemande pas
  if(snooze){ const ds=daysTo(snooze); if(ds!==null && ds>=0) return; } // encore en sommeil
  // nombre d'enregistrements à risque (donne du poids au message)
  let nb=0; try{ for(const t of ['orders','productions','clients','materialLots']){ nb+=await db.table(t).count(); } }catch(e){}
  let overdue=false, ageTxt='';
  if(!last){ overdue = nb>0; ageTxt='Aucun export hors de cet appareil pour le moment.'; }
  else {
    const diff=daysTo(last); // négatif = dans le passé
    if(diff!==null && diff<=-freq){ overdue=true; ageTxt=`Dernier export il y a ${Math.abs(diff)} jour(s).`; }
  }
  if(!overdue) return;
  openModal(`<h3>💾 Sauvegarde recommandée</h3>
    <div class="banner" style="background:#fdf3f2;border-color:#f0c9c4"><div>${ageTxt} iOS peut purger les données de l'app (effacer l'historique Safari supprime aussi la base). Mets une copie à l'abri sur iCloud Drive.</div></div>
    <p class="note" style="margin:8px 0">${nb} enregistrement(s) clés actuellement sur l'appareil.</p>
    <div class="modal-actions" style="flex-direction:column;gap:8px">
      <button class="btn gold" style="width:100%" onclick="closeModal();shareBackupToICloud()">☁️ Sauvegarder sur iCloud</button>
      <button class="btn ghost" style="width:100%" onclick="closeModal();exportData()">⬇ Exporter le fichier (.json)</button>
      <button class="btn ghost" style="width:100%" onclick="closeModal();goView('sauvegardes')">Ouvrir Sauvegarde &amp; sécurité</button>
      <button class="btn ghost" style="width:100%" onclick="exportSnooze(1)">Me le rappeler demain</button>
    </div>`);
}
// Reporte le rappel de n jours.
function exportSnooze(days){
  const d=new Date(); d.setDate(d.getDate()+(days||1));
  localStorage.setItem('sm_exportSnooze', d.toISOString().slice(0,10));
  closeModal();
  toast('Rappel reporté ✓');
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

/* ============================================================
   POINTEUSE DE LABORATOIRE — time tracker global
   100% offline, résilient à la mise en veille PWA.
   Principe : on stocke uniquement le timestamp de DÉMARRAGE dans
   localStorage. Le temps écoulé est TOUJOURS recalculé depuis
   Date.now() − start (jamais d'accumulation via setInterval, qui
   se fige quand iOS suspend l'app). Le tick ne sert qu'à rafraîchir
   l'affichage ; la source de vérité reste le timestamp stocké.
   ============================================================ */
// ===== POINTEUSE MULTI-CHRONOS (sessions parallèles indépendantes) =====
// Chaque chrono : {id, start(ms), activite, pausedAccum(ms), pauseAt(ms|0)}.
// Stocké en JSON dans localStorage. Chacun a sa pause et son stop individuels.
const TT_SESSIONS_KEY = 'sm_ttSessions';
// Anciennes clés (mono-session) — pour migration au démarrage.
const TT_KEY = 'sm_workSession_start';
const TT_PAUSED_KEY = 'sm_workSession_paused';
const TT_PAUSE_AT_KEY = 'sm_workSession_pauseAt';
const TT_ACT_KEY = 'sm_workSession_act';
const TT_ACTIVITIES = ['Pesées','Ganache','Meringue','Macaronnage','Pochage','Cuisson','Garnissage/Montage','Vaisselle','Nettoyage fin de prod','Conditionnement','Autre'];
let _ttTick = null;

function ttLoad(){
  try{ const a=JSON.parse(localStorage.getItem(TT_SESSIONS_KEY)||'[]'); return Array.isArray(a)?a:[]; }
  catch(e){ return []; }
}
function ttSave(arr){ localStorage.setItem(TT_SESSIONS_KEY, JSON.stringify(arr||[])); }
function ttGet(id){ return ttLoad().find(s=>s.id===id); }
function ttUpsert(sess){ const a=ttLoad(); const i=a.findIndex(s=>s.id===sess.id); if(i>=0) a[i]=sess; else a.push(sess); ttSave(a); }
function ttRemove(id){ ttSave(ttLoad().filter(s=>s.id!==id)); }
function ttSessionPaused(s){ return s && (+s.pauseAt||0)>0; }
// Temps net d'UN chrono (ms) — recalculé depuis les timestamps (résilient à la veille iOS).
function ttSessionNet(s){
  if(!s||!s.start) return 0;
  const accum=+s.pausedAccum||0;
  const cur=(+s.pauseAt||0)>0 ? Math.max(0, Date.now()-(+s.pauseAt)) : 0;
  return Math.max(0, Date.now()-s.start-accum-cur);
}
function ttAnyRunning(){ return ttLoad().some(s=>!ttSessionPaused(s)); }

// Migration : convertit une éventuelle ancienne session mono en multi.
function ttMigrateLegacy(){
  const start=+localStorage.getItem(TT_KEY)||0;
  if(start>0 && !ttLoad().length){
    ttUpsert({ id:'tt'+start, start, activite:localStorage.getItem(TT_ACT_KEY)||'',
      pausedAccum:+localStorage.getItem(TT_PAUSED_KEY)||0, pauseAt:+localStorage.getItem(TT_PAUSE_AT_KEY)||0 });
  }
  [TT_KEY,TT_PAUSED_KEY,TT_PAUSE_AT_KEY,TT_ACT_KEY].forEach(k=>localStorage.removeItem(k));
}

function ttFormat(ms){
  const totalMin = Math.floor(ms/60000);
  const h = Math.floor(totalMin/60), m = totalMin%60;
  if(totalMin<1){ const s=Math.floor(ms/1000); return `00h 00m ${String(s).padStart(2,'0')}s`; }
  return `${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m`;
}

// Couleur associée à chaque type d'activité (pour repérer la tâche en cours d'un coup d'œil).
// Les activités connues ont une teinte fixe ; les libres (« Autre … ») dérivent une couleur
// stable de leur texte, pour qu'une même tâche garde toujours la même couleur.
const TT_ACT_COLORS = {
  'Pesées':'#caa23b', 'Ganache':'#8a5a3c', 'Meringue':'#e8c8d4', 'Macaronnage':'#d76b86',
  'Pochage':'#9bc081', 'Cuisson':'#cf7a3a', 'Garnissage/Montage':'#6aa3a0', 'Vaisselle':'#5a7a9a',
  'Nettoyage fin de prod':'#7a6a9a', 'Conditionnement':'#b98756', 'Autre':'#9a8a82'
};
const TT_COLOR_PALETTE = ['#d76b86','#caa23b','#9bc081','#6aa3a0','#8a5a3c','#cf7a3a','#7a6a9a','#5a7a9a','#b98756','#3f7d52','#9a6a82','#5a8a7a'];
function ttActivityColor(activite){
  const a=(activite||'').trim();
  if(!a) return '#3f7d52';                       // sans précision → vert
  if(TT_ACT_COLORS[a]) return TT_ACT_COLORS[a];  // activité connue
  // activité libre : couleur stable dérivée du texte (hash simple)
  let h=0; for(let i=0;i<a.length;i++){ h=(h*31 + a.charCodeAt(i))>>>0; }
  return TT_COLOR_PALETTE[h % TT_COLOR_PALETTE.length];
}
// Petit macaron SVG colorable : deux coques crème + ganache de la couleur de l'activité.
function macaronSVG(col){
  return `<svg viewBox="0 0 40 32" width="100%" height="100%" aria-hidden="true">
    <ellipse cx="20" cy="9" rx="15" ry="8" fill="#efe3c4"/>
    <ellipse cx="20" cy="23" rx="15" ry="8" fill="#efe3c4"/>
    <rect x="6" y="13" width="28" height="6" rx="3" fill="${col}"/>
    <ellipse cx="13" cy="24" rx="3" ry="1.6" fill="#e3d4b0" opacity=".7"/>
    <ellipse cx="27" cy="24" rx="3" ry="1.6" fill="#e3d4b0" opacity=".7"/>
  </svg>`;
}
// Rendu du bandeau : une puce par chrono actif + bouton « + ».
function ttRefresh(){
  const bar=document.getElementById('timeTracker'); if(!bar) return;
  const sessions=ttLoad();
  bar.innerHTML = `<span class="tt-grip">⠿⠿</span>
    <button type="button" class="tt-light green" onclick="ttLightTap(event)" title="Pointeuse"><span>▶</span></button>
    <button type="button" class="tt-light dim" onclick="ttOpenHistory()" title="Historique"><span>🗒</span></button>`;
  ttBindDrag(bar, 'sm_tt_pos');
  const wrap=document.getElementById('ttWhisks'); if(!wrap) return;
  wrap.innerHTML = sessions.map(s=>{
    const paused=ttSessionPaused(s);
    const col=ttActivityColor(s.activite);
    return `<div class="tt-whisk${paused?' paused':''}" data-w="${s.id}" style="--tt-col:${col}" onclick="ttWhiskToggle(event,'${s.id}')">
      <span class="whisk-ico">${macaronSVG(col)}</span>
      <div class="whisk-info">
        <span class="whisk-lbl">${esc(s.activite||'Production')}${paused?' · pause':''}</span>
        <span class="whisk-time" data-tt="${s.id}">${ttFormat(ttSessionNet(s))}</span>
      </div>
      <span class="whisk-ctrl">
        <button type="button" class="wc-pause" onclick="event.stopPropagation();ttPause('${s.id}')" title="${paused?'Reprendre':'Pause'}">${paused?'▶':'⏸'}</button>
        <button type="button" class="wc-stop" onclick="event.stopPropagation();ttStop('${s.id}')" title="Stop">⏹</button>
      </span>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.tt-whisk').forEach((el,i)=>ttBindDrag(el, 'sm_ttw_'+i, true));
}
// Tap sur le feu vert : si le bandeau est replié → on le déploie ; s'il est déjà déployé →
// on démarre une activité. Un drag ne déclenche rien (géré par _dragged). Repli auto après délai.
let _ttCollapseTimer=null;
function ttLightTap(ev){
  const bar=document.getElementById('timeTracker'); if(!bar) return;
  if(bar._dragged){ bar._dragged=false; return; }   // c'était un déplacement, pas un tap
  if(ev && ev.stopPropagation) ev.stopPropagation();
  if(!bar.classList.contains('tt-open')){
    ttExpand();
  } else {
    ttStart();
  }
}
function ttExpand(){
  const bar=document.getElementById('timeTracker'); if(!bar) return;
  bar.classList.add('tt-open');
  clearTimeout(_ttCollapseTimer);
  // repli automatique après 4 s sans interaction (évite que ça reste ouvert et gêne)
  _ttCollapseTimer=setTimeout(ttCollapse, 4000);
}
function ttCollapse(){
  const bar=document.getElementById('timeTracker'); if(bar) bar.classList.remove('tt-open');
  clearTimeout(_ttCollapseTimer);
}
function ttWhiskToggle(ev, id){
  const el=ev.currentTarget; if(el._dragged){ el._dragged=false; return; }
  el.classList.toggle('open');
}
function ttBindDrag(el, storeKey, isWhisk){
  if(!el || el._dragBound) return; el._dragBound=true;
  try{ const p=JSON.parse(localStorage.getItem(storeKey)||'null');
    if(p && p.left!=null){ el.style.left=p.left+'px'; el.style.top=p.top+'px'; el.style.right='auto'; el.style.bottom='auto'; } }catch(e){}
  let sx,sy,ox,oy,moved;
  const down=e=>{
    const t=e.touches?e.touches[0]:e; sx=t.clientX; sy=t.clientY; moved=false;
    const r=el.getBoundingClientRect(); ox=r.left; oy=r.top;
    el.classList.add('dragging');
    document.addEventListener('mousemove',move); document.addEventListener('mouseup',up);
    document.addEventListener('touchmove',move,{passive:false}); document.addEventListener('touchend',up);
  };
  const move=e=>{
    const t=e.touches?e.touches[0]:e; const dx=t.clientX-sx, dy=t.clientY-sy;
    if(Math.abs(dx)>4||Math.abs(dy)>4){ moved=true; if(e.cancelable)e.preventDefault(); }
    let nl=Math.max(4,Math.min(window.innerWidth-el.offsetWidth-4, ox+dx));
    let nt=Math.max(4,Math.min(window.innerHeight-el.offsetHeight-4, oy+dy));
    el.style.left=nl+'px'; el.style.top=nt+'px'; el.style.right='auto'; el.style.bottom='auto';
  };
  const up=()=>{
    el.classList.remove('dragging');
    document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up);
    document.removeEventListener('touchmove',move); document.removeEventListener('touchend',up);
    if(moved){ el._dragged=true;
      try{ localStorage.setItem(storeKey, JSON.stringify({left:parseInt(el.style.left), top:parseInt(el.style.top)})); }catch(e){} }
  };
  el.addEventListener('mousedown',down); el.addEventListener('touchstart',down,{passive:true});
}
function ttStartTicking(){ ttStopTicking(); _ttTick=setInterval(ttTick,1000); }
function ttStopTicking(){ if(_ttTick){ clearInterval(_ttTick); _ttTick=null; } }
// Tick léger : met à jour uniquement les chronos non en pause (pas de re-render complet).
function ttTick(){
  const sessions=ttLoad(); if(!sessions.length){ ttStopTicking(); return; }
  sessions.forEach(s=>{ const el=document.querySelector(`.whisk-time[data-tt="${s.id}"]`); if(el && !ttSessionPaused(s)) el.textContent=ttFormat(ttSessionNet(s)); });
}

// Démarre un NOUVEAU chrono (choix rapide d'activité). N'interrompt pas les autres.
function ttStart(){
  ttCollapse();
  openModal(`<h3>⏱ Nouvelle activité</h3>
    <p class="note">Un tap pour démarrer un chrono. Plusieurs activités peuvent tourner en parallèle.</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
      ${TT_ACTIVITIES.map(a=>`<button class="btn ghost" style="flex:1;min-width:44%" onclick="ttStartWith(${JSON.stringify(a).replace(/"/g,'&quot;')})">${esc(a)}</button>`).join('')}
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn" onclick="ttStartWith('')">Démarrer sans préciser</button></div>`);
}
function ttStartWith(activite){
  // « Autre » → demander une précision libre avant de démarrer.
  if(activite==='Autre'){ ttStartAutre(); return; }
  const id='tt'+Date.now()+'-'+Math.floor(Math.random()*1000);
  ttUpsert({id, start:Date.now(), activite:activite||'', pausedAccum:0, pauseAt:0});
  closeModal(); ttRefresh(); ttStartTicking();
  toast(activite?`⏱ ${activite} démarré`:'Chrono démarré ⏱');
}
// Saisie d'une précision pour l'activité « Autre ».
function ttStartAutre(){
  openModal(`<h3>⏱ Autre activité</h3>
    <div class="field"><label>Précise l'activité</label>
      <input id="tt_autre" placeholder="ex : préparation décor, livraison, courses…" onkeydown="if(event.key==='Enter'){event.preventDefault();ttStartAutreGo();}"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="ttStart()">Retour</button>
      <button class="btn" onclick="ttStartAutreGo()">Démarrer</button></div>`);
  const i=document.getElementById('tt_autre'); if(i) i.focus();
}
function ttStartAutreGo(){
  const txt=(val('tt_autre')||'').trim();
  const label = txt ? `Autre : ${txt}` : 'Autre';
  const id='tt'+Date.now()+'-'+Math.floor(Math.random()*1000);
  ttUpsert({id, start:Date.now(), activite:label, pausedAccum:0, pauseAt:0});
  closeModal(); ttRefresh(); ttStartTicking();
  toast(`⏱ ${label} démarré`);
}
// Pause / reprise d'UN chrono donné.
function ttPause(id){
  const s=ttGet(id); if(!s) return;
  if((+s.pauseAt||0)>0){
    s.pausedAccum=(+s.pausedAccum||0)+Math.max(0,Date.now()-(+s.pauseAt)); s.pauseAt=0;
    ttUpsert(s); ttRefresh(); ttStartTicking(); toast('Reprise ▶');
  } else {
    s.pauseAt=Date.now(); ttUpsert(s); ttRefresh();
    if(!ttAnyRunning()) ttStopTicking();
    toast('En pause ⏸');
  }
}
// Arrêt d'UN chrono : fige la durée, demande le taux, enregistre la session.
function ttStop(id){
  const s=ttGet(id); if(!s){ ttRefresh(); return; }
  const start=s.start, end=Date.now();
  const ms=ttSessionNet(s);
  const heuresDec=Math.round(ms/3600000*100)/100;
  const accum=+s.pausedAccum||0; const pauseMs=accum+((+s.pauseAt||0)>0?Math.max(0,Date.now()-(+s.pauseAt)):0);
  const set=getSettings(); const tauxDefaut=+set.laborRate||0;
  const curAct=s.activite||'';
  // inclut la valeur courante même si personnalisée (ex. « Autre : … »)
  const baseActs=['',...TT_ACTIVITIES];
  if(curAct && !baseActs.includes(curAct)) baseActs.push(curAct);
  const actOpts=baseActs.map(a=>`<option value="${esc(a)}" ${a===curAct?'selected':''}>${a?esc(a):'— non précisé —'}</option>`).join('');
  openModal(`<h3>Fin de chrono</h3>
    <div class="sum-box"><span>Temps travaillé (pauses déduites)</span><b>${ttFormat(ms)}</b></div>
    ${pauseMs>=60000?`<div class="sum-box"><span>Dont pauses déduites</span><b>${ttFormat(pauseMs)}</b></div>`:''}
    <div class="sum-box"><span>Soit en heures</span><b>${heuresDec.toFixed(2)} h</b></div>
    <div class="field" style="margin-top:12px"><label>Nature de l'activité</label><select id="tt_act">${actOpts}</select></div>
    <div class="field"><label>Taux horaire de cette session (€/h)</label>
      <input type="number" min="0" step="0.5" id="tt_rate" value="${tauxDefaut||''}" placeholder="ex : 12"></div>
    <p class="note" id="tt_cost" style="margin-top:4px"></p>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal();ttRefresh()">Annuler</button>
      <button class="btn" onclick="ttConfirmStop('${id}',${start},${end},${ms},${pauseMs})">Enregistrer</button>
    </div>`);
  const rate=document.getElementById('tt_rate'), cost=document.getElementById('tt_cost');
  const upd=()=>{ const t=+rate.value||0; cost.textContent=t>0?`Coût de main-d'œuvre : ${euro(money2(heuresDec*t))}`:''; };
  if(rate){ rate.addEventListener('input',upd); upd(); rate.focus(); }
}
async function ttConfirmStop(id, start, end, ms, pauseMs){
  const taux=Math.max(0,+val('tt_rate')||0);
  ms=Math.max(0,+ms||0); pauseMs=Math.max(0,+pauseMs||0);
  const heuresDec=Math.round(ms/3600000*100)/100;
  const totalMin=Math.floor(ms/60000);
  const session={ date:today(), debut:new Date(start).toISOString(), fin:new Date(end).toISOString(),
    dureeMin:totalMin, dureeHeures:heuresDec, pauseMin:Math.floor(pauseMs/60000),
    activite:val('tt_act')||'', tauxHoraire:money2(taux), coutTotal:money2(heuresDec*taux) };
  try{ await db.workSessions.add(session); }catch(e){ console.error('workSession',e); }
  ttRemove(id);
  closeModal(); ttRefresh();
  if(!ttAnyRunning()) ttStopTicking();
  toast(`Session enregistrée${session.activite?` · ${session.activite}`:''} : ${ttFormat(ms)} · ${euro(session.coutTotal)}`);
  if(view==='pointeuse' && typeof renderTimeTracker==='function') renderTimeTracker();
}
// Historique rapide des sessions (modale).
async function ttOpenHistory(){
  const sessions = (await db.workSessions.orderBy('date').reverse().toArray().catch(()=>[]));
  const totMin = sessions.reduce((s,x)=>s+(+x.dureeMin||0),0);
  const totCout = sessions.reduce((s,x)=>s+(+x.coutTotal||0),0);
  const rows = sessions.slice(0,40).map(x=>{
    const h=Math.floor((+x.dureeMin||0)/60), m=(+x.dureeMin||0)%60;
    const pMin=+x.pauseMin||0; const ph=Math.floor(pMin/60), pm=pMin%60;
    return `<tr><td>${fmtDate(x.date)}<br><span style="color:#9a8a82;font-size:.72rem">${fmtTime(x.debut)}–${fmtTime(x.fin)}</span></td>
      <td>${x.activite?`<span class="tag" style="background:#6aa3a0;color:#fff;font-size:.66rem">${esc(x.activite)}</span>`:'<span style="color:#c9bcae">—</span>'}</td>
      <td>${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m${pMin>=1?`<br><span style="color:#9a8a82;font-size:.7rem">pause ${ph?ph+'h ':''}${String(pm).padStart(2,'0')}m</span>`:''}</td>
      <td>${euro(x.tauxHoraire)}/h</td>
      <td><b>${euro(x.coutTotal)}</b></td>
      <td style="text-align:right"><span class="act del" onclick="ttDeleteSession(${x.id})">Suppr.</span></td></tr>`;
  }).join('');
  const th=Math.floor(totMin/60), tm=totMin%60;
  openModal(`<h3>Pointeuse — historique</h3>
    <div class="sum-box"><span>Total cumulé</span><b>${String(th).padStart(2,'0')}h ${String(tm).padStart(2,'0')}m · ${euro(totCout)}</b></div>
    ${sessions.length?`<div class="flex" style="gap:8px;margin-top:8px"><button class="btn gold sm" onclick="closeModal();goView('analyse')">📊 Analyse des temps & conseils</button></div>
    <div class="table-wrap no-freeze" style="margin-top:10px"><table><thead><tr><th>Date</th><th>Activité</th><th>Durée</th><th>Taux</th><th>Coût</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${sessions.length>40?'<p class="note">40 dernières sessions affichées.</p>':''}`:'<p class="note">Aucune session enregistrée pour l\'instant.</p>'}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Fermer</button></div>`);
}
async function ttDeleteSession(id){
  if(!confirm('Supprimer cette session de travail ?')) return;
  await db.workSessions.delete(id).catch(()=>{});
  ttOpenHistory();
  if(view==='pointeuse' && typeof renderTimeTracker==='function') renderTimeTracker();
}
// Initialisation au boot : migre une éventuelle session mono, reprend les chronos en cours.
function ttInit(){
  ttMigrateLegacy();
  ttRefresh();
  if(ttAnyRunning()) ttStartTicking();
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible'){ ttRefresh(); if(ttAnyRunning()) ttStartTicking(); } });
}

/* ============================================================
   MASCOTTE — Chat de labo, reflet de la jauge de sérénité
   - 5 expressions calées sur les paliers exacts de la jauge.
   - SVG inline (net, léger, colorable, 100% offline).
   - Bulle flottante DÉPLAÇABLE au doigt ; position mémorisée.
   - S'estompe quand on touche près d'elle / pendant le drag, pour
     ne jamais gêner la lecture. Un tap ouvre l'Assistant (jauge).
   - Synchronisée en continu (au changement de vue + rafraîchissement).
   ============================================================ */
// Mappage partagé jauge ↔ mascotte (paliers IDENTIQUES à la jauge).
function serenityTier(score){
  if(score>=85) return {label:'Sérénité',       col:'#3f7d52', mood:'tres-serein'};
  if(score>=60) return {label:'Maîtrisé',        col:'#7faa4f', mood:'serein'};
  if(score>=40) return {label:'Vigilance',       col:'#caa23b', mood:'vigilance'};
  if(score>=20) return {label:'Tension',         col:'#d98324', mood:'tension'};
  return            {label:'Zone de stress',  col:'#b3261e', mood:'stress'};
}

// Dessine le chat selon l'humeur. Couleur = couleur de palier (col).
// moods : 'stress' | 'tension' | 'vigilance' | 'serein' | 'tres-serein'
function mascotSVG(mood, col){
  // éléments variables selon l'humeur
  let ears, eyes, mouth, extra='', tail, whiskerY=42;
  switch(mood){
    case 'stress': // très stressé : oreilles en arrière, poils hérissés, gouttes
      ears = `<path d="M20 26 L10 10 L30 20 Z" fill="${col}"/><path d="M60 26 L70 10 L50 20 Z" fill="${col}"/>`;
      eyes = `<circle cx="31" cy="38" r="5" fill="#fff"/><circle cx="49" cy="38" r="5" fill="#fff"/>
              <circle cx="31" cy="38" r="3.4" fill="#2b1a1f"/><circle cx="49" cy="38" r="3.4" fill="#2b1a1f"/>
              <path d="M25 31 L36 35 M55 31 L44 35" stroke="#2b1a1f" stroke-width="2" stroke-linecap="round"/>`;
      mouth = `<path d="M34 50 Q40 45 46 50" fill="none" stroke="#2b1a1f" stroke-width="2" stroke-linecap="round"/>`;
      extra = `<path d="M62 30 q3 5 0 9 q-3 -4 0 -9Z" fill="#7ec8e3"/>`; // goutte de sueur
      tail = `<path d="M64 60 q16 -2 12 -18" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round"/>`;
      break;
    case 'tension': // tension : une oreille basse, sourcils inquiets
      ears = `<path d="M20 26 L12 12 L31 20 Z" fill="${col}"/><path d="M60 28 L66 16 L49 21 Z" fill="${col}"/>`;
      eyes = `<circle cx="31" cy="39" r="4.6" fill="#2b1a1f"/><circle cx="49" cy="39" r="4.6" fill="#2b1a1f"/>
              <path d="M26 33 L36 36 M54 33 L44 36" stroke="#2b1a1f" stroke-width="1.8" stroke-linecap="round"/>`;
      mouth = `<path d="M35 49 Q40 47 45 49" fill="none" stroke="#2b1a1f" stroke-width="2" stroke-linecap="round"/>`;
      tail = `<path d="M64 60 q15 2 14 -12" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round"/>`;
      break;
    case 'vigilance': // vigilance : neutre, attentif
      ears = `<path d="M20 24 L13 9 L32 18 Z" fill="${col}"/><path d="M60 24 L67 9 L48 18 Z" fill="${col}"/>`;
      eyes = `<circle cx="31" cy="38" r="4.8" fill="#2b1a1f"/><circle cx="49" cy="38" r="4.8" fill="#2b1a1f"/>
              <circle cx="32.6" cy="36.6" r="1.4" fill="#fff"/><circle cx="50.6" cy="36.6" r="1.4" fill="#fff"/>`;
      mouth = `<path d="M37 49 L40 51 L43 49" fill="none" stroke="#2b1a1f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      tail = `<path d="M64 60 q16 0 14 -14" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round"/>`;
      break;
    case 'serein': // serein : petit sourire, yeux doux
      ears = `<path d="M20 23 L13 8 L32 17 Z" fill="${col}"/><path d="M60 23 L67 8 L48 17 Z" fill="${col}"/>`;
      eyes = `<circle cx="31" cy="38" r="4.6" fill="#2b1a1f"/><circle cx="49" cy="38" r="4.6" fill="#2b1a1f"/>
              <circle cx="32.6" cy="36.6" r="1.4" fill="#fff"/><circle cx="50.6" cy="36.6" r="1.4" fill="#fff"/>`;
      mouth = `<path d="M33 49 Q40 55 47 49" fill="none" stroke="#2b1a1f" stroke-width="2" stroke-linecap="round"/>`;
      extra = `<circle cx="26" cy="46" r="3" fill="#f4a9a0" opacity=".6"/><circle cx="54" cy="46" r="3" fill="#f4a9a0" opacity=".6"/>`;
      tail = `<path d="M64 58 q16 2 12 -14" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round"/>`;
      break;
    default: // tres-serein : yeux fermés satisfaits, ronronne (Z/zen)
      ears = `<path d="M20 23 L13 8 L32 17 Z" fill="${col}"/><path d="M60 23 L67 8 L48 17 Z" fill="${col}"/>`;
      eyes = `<path d="M26 38 Q31 34 36 38" fill="none" stroke="#2b1a1f" stroke-width="2" stroke-linecap="round"/>
              <path d="M44 38 Q49 34 54 38" fill="none" stroke="#2b1a1f" stroke-width="2" stroke-linecap="round"/>`;
      mouth = `<path d="M33 48 Q40 56 47 48" fill="none" stroke="#2b1a1f" stroke-width="2" stroke-linecap="round"/>`;
      extra = `<circle cx="25" cy="46" r="3.2" fill="#f4a9a0" opacity=".7"/><circle cx="55" cy="46" r="3.2" fill="#f4a9a0" opacity=".7"/>
               <text x="60" y="20" font-size="9" fill="${col}" font-family="serif">z</text><text x="67" y="13" font-size="6" fill="${col}" font-family="serif">z</text>`;
      tail = `<path d="M64 58 q18 0 10 -16" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round"/>`;
  }
  const whiskers = `<g stroke="#9a8a82" stroke-width="1.2" stroke-linecap="round" opacity=".8">
      <path d="M28 ${whiskerY} L14 ${whiskerY-2}"/><path d="M28 ${whiskerY+3} L15 ${whiskerY+5}"/>
      <path d="M52 ${whiskerY} L66 ${whiskerY-2}"/><path d="M52 ${whiskerY+3} L65 ${whiskerY+5}"/></g>`;
  return `<svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden="true">
    ${tail}
    <ellipse cx="40" cy="44" rx="24" ry="22" fill="#fff" stroke="${col}" stroke-width="2.5"/>
    ${ears}
    <ellipse cx="40" cy="46" rx="22" ry="19" fill="#fff"/>
    ${whiskers}${eyes}
    <path d="M37 43 L43 43 L40 46 Z" fill="${col}"/>
    ${mouth}${extra}
  </svg>`;
}

let _mascotScore=null, _mascotTimer=null;
// Rafraîchit l'expression de la mascotte d'après le score courant.
async function mascotRefresh(){
  const host=document.getElementById('mascot'); if(!host) return;
  let g; try{ g=await calculateSerenityScore({horizon:15}); }catch(e){ return; }
  _mascotScore=g.score;
  const tier=serenityTier(g.score);
  const face=host.querySelector('.mascot-face');
  if(face) face.innerHTML=mascotSVG(tier.mood, tier.col);
  host.style.setProperty('--mascot-col', tier.col);
  host.classList.toggle('alarm', tier.mood==='stress'); // léger tremblement si stress
  const lbl=host.querySelector('.mascot-badge');
  if(lbl){ lbl.textContent=g.score+'%'; lbl.style.background=tier.col; }
  host.setAttribute('aria-label', `Sérénité : ${g.score}% (${tier.label})`);
  host.title=`Sérénité : ${g.score}% · ${tier.label}`;
}
// Crée la bulle flottante déplaçable et lance la synchro.
function mascotInit(){
  if(document.getElementById('mascot')) return;
  const host=document.createElement('div');
  host.id='mascot';
  host.innerHTML=`<div class="mascot-face"></div><span class="mascot-badge">—</span>`;
  document.body.appendChild(host);
  // position mémorisée (sinon coin bas-droit par défaut)
  try{
    const saved=JSON.parse(localStorage.getItem('sm_mascot_pos')||'null');
    if(saved && typeof saved.x==='number'){ host.style.left=saved.x+'px'; host.style.top=saved.y+'px'; host.style.right='auto'; host.style.bottom='auto'; }
  }catch(e){}
  mascotSetupDrag(host);
  mascotRefresh();
  // synchro périodique (background) tant que l'app est au premier plan
  if(_mascotTimer) clearInterval(_mascotTimer);
  _mascotTimer=setInterval(()=>{ if(document.visibilityState==='visible') mascotRefresh(); }, 60000);
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') mascotRefresh(); });
}
// Drag tactile + souris. Tap (sans déplacement) = ouvrir l'Assistant.
function mascotSetupDrag(host){
  let dragging=false, moved=false, sx=0, sy=0, ox=0, oy=0;
  const start=(x,y)=>{ dragging=true; moved=false; sx=x; sy=y;
    const r=host.getBoundingClientRect(); ox=r.left; oy=r.top; host.classList.add('dragging'); };
  const move=(x,y)=>{ if(!dragging) return;
    const dx=x-sx, dy=y-sy; if(Math.abs(dx)+Math.abs(dy)>4) moved=true;
    let nx=ox+dx, ny=oy+dy;
    const m=8, w=host.offsetWidth, h=host.offsetHeight;
    nx=Math.max(m, Math.min(window.innerWidth-w-m, nx));
    ny=Math.max(m, Math.min(window.innerHeight-h-m, ny));
    host.style.left=nx+'px'; host.style.top=ny+'px'; host.style.right='auto'; host.style.bottom='auto'; };
  const end=()=>{ if(!dragging) return; dragging=false; host.classList.remove('dragging');
    if(moved){ const r=host.getBoundingClientRect();
      try{ localStorage.setItem('sm_mascot_pos', JSON.stringify({x:Math.round(r.left), y:Math.round(r.top)})); }catch(e){} }
    else { goView('assistant'); }   // simple tap → ouvre la jauge
  };
  host.addEventListener('touchstart', e=>{ const t=e.touches[0]; start(t.clientX,t.clientY); }, {passive:true});
  host.addEventListener('touchmove', e=>{ const t=e.touches[0]; move(t.clientX,t.clientY); }, {passive:true});
  host.addEventListener('touchend', end);
  host.addEventListener('mousedown', e=>{ start(e.clientX,e.clientY);
    const mm=ev=>move(ev.clientX,ev.clientY), mu=()=>{ end(); document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); };
    document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu); });
}

/* ============================================================
   MRP — Assistant Plan de Production Adaptatif
   Branché sur les structures réelles (orders → orderToLines/_orderParfumDemand,
   stock fini = somme productions.qteRestante par parfum, recipes.poidsGarnitureUnit).
   Apprentissage des temps stocké en localStorage (config, sans toucher au schéma).
   ============================================================ */
// Habitude de production réelle : 1 batch = 60 macarons (120 coques).
// Une seule MERINGUE sert 2 batchs (2 parfums) = production mutualisée :
// on coule une meringue, on la divise pour 2 ordres de fabrication.
// → l'étape coques/meringue est partagée ; ganache + montage restent par parfum.
const TAILLE_BATCH_MACARONS = 60;        // macarons par "batch" unitaire (1 ordre de fabrication)
const COQUES_PAR_BATCH = 120;            // coques par batch (2 coques/macaron)
const BATCHS_PAR_MERINGUE = 2;           // capacité d'une meringue = 2 batchs = 120 macarons = 240 coques
const MACARONS_PAR_MERINGUE = 120;       // capacité utile réelle d'une meringue (240 coques)

// REMPLISSAGE DES MERINGUES par capacité (120 macarons / 240 coques chacune).
// La mutualisation n'est pas imposée : un parfum qui a besoin de ≥120 macarons
// remplit des meringues entières à lui seul ; on ne regroupe 2 parfums que pour
// combler une meringue partiellement vide (optimisation du remplissage, pas une règle).
// lignes : [{parfum, besoinNet, ...}]. Renvoie [{parfums:[...], repartition:{p:qte}, macarons, nbBatchs, partielle}].
function _packMeringues(lignes){
  // 1) Chaque parfum : autant de meringues PLEINES mono-parfum que possible, + un reste < 120.
  const meringues=[]; const restes=[];   // restes : {parfum, qte<120}
  lignes.forEach(l=>{
    let q=Math.max(0, +l.besoinNet||0);
    while(q>=MACARONS_PAR_MERINGUE){
      meringues.push({parfums:[l.parfum], repartition:{[l.parfum]:MACARONS_PAR_MERINGUE},
        macarons:MACARONS_PAR_MERINGUE, nbBatchs:BATCHS_PAR_MERINGUE, partielle:false});
      q-=MACARONS_PAR_MERINGUE;
    }
    if(q>0) restes.push({parfum:l.parfum, qte:q});
  });
  // 2) Apparier les restes pour remplir au mieux (first-fit decreasing).
  restes.sort((a,b)=>b.qte-a.qte);
  while(restes.length){
    const a=restes.shift();
    // cherche le plus gros reste d'un AUTRE parfum qui tient avec a (≤120)
    let bestIdx=-1;
    for(let i=0;i<restes.length;i++){
      if(restes[i].parfum!==a.parfum && a.qte+restes[i].qte<=MACARONS_PAR_MERINGUE){ bestIdx=i; break; }
    }
    if(bestIdx>=0){
      const b=restes.splice(bestIdx,1)[0];
      meringues.push({parfums:[a.parfum,b.parfum], repartition:{[a.parfum]:a.qte,[b.parfum]:b.qte},
        macarons:a.qte+b.qte, nbBatchs:2, partielle:(a.qte+b.qte)<MACARONS_PAR_MERINGUE});
    } else {
      // reste seul → meringue partielle (un seul parfum, pas assez pour la remplir)
      meringues.push({parfums:[a.parfum], repartition:{[a.parfum]:a.qte},
        macarons:a.qte, nbBatchs:1, partielle:true});
    }
  }
  return meringues;
}

/* ============================================================
   DISPONIBILITÉS & FAISABILITÉ DE COMMANDE
   Planning de travail récurrent BI-HEBDOMADAIRE (alternance A/B),
   ancré sur le lundi 8 juin 2026 (= semaine A). Permet de calculer le
   temps réellement disponible d'ici une date, et de dire instantanément
   si une commande est tenable (stock + temps vs besoin de production).
   Stocké en localStorage (config éditable, sans toucher au schéma).
   ============================================================ */
const AVAIL_KEY = 'sm_availability';
const AVAIL_ANCHOR = '2026-06-08';   // lundi → début d'un cycle, semaine A
// Plages par défaut. dow : 0=Dim … 6=Sam. Chaque plage = [start, end] en "HH:MM".
// 'A' et 'B' alternent une semaine sur deux.
const AVAIL_DEFAULTS = {
  anchor: AVAIL_ANCHOR,
  weekA: {
    1:[['14:00','22:00']], 2:[['14:00','22:00']], 3:[['14:00','22:00']], 4:[['14:00','22:00']], 5:[['14:00','22:00']],
    6:[['09:00','19:00']], 0:[['09:00','19:00']]
  },
  weekB: {
    1:[['08:30','12:00'],['21:30','24:00']], 2:[['08:30','12:00'],['21:30','24:00']],
    3:[['08:30','12:00'],['21:30','24:00']], 4:[['08:30','12:00'],['21:30','24:00']],
    5:[['08:30','12:00'],['21:30','24:00']],
    6:[['09:00','19:00']], 0:[['09:00','19:00']]
  }
};
function getAvailability(){
  try{ const s=JSON.parse(localStorage.getItem(AVAIL_KEY)||'null');
    if(s && s.weekA && s.weekB) return s; }catch(e){}
  return JSON.parse(JSON.stringify(AVAIL_DEFAULTS));
}
function saveAvailability(a){ localStorage.setItem(AVAIL_KEY, JSON.stringify(a)); }

// "HH:MM" → minutes depuis minuit (gère 24:00 = 1440 = minuit fin de journée).
function hmToMin(hm){ const [h,m]=String(hm).split(':').map(Number); return (h||0)*60+(m||0); }
// Numéro de semaine du cycle (A ou B) pour une date donnée, par rapport à l'ancre.
function availWeekType(dateStr, conf){
  const anchor=new Date((conf||getAvailability()).anchor||AVAIL_ANCHOR);
  // lundi de la semaine de l'ancre (déjà un lundi) ; lundi de la date cible
  const d=new Date(dateStr);
  const mondayOf = x=>{ const t=new Date(x); const day=(t.getDay()+6)%7; t.setDate(t.getDate()-day); t.setHours(0,0,0,0); return t; };
  const a=mondayOf(anchor), b=mondayOf(d);
  const weeks=Math.round((b-a)/(7*86400000));
  return (((weeks%2)+2)%2===0) ? 'A' : 'B';
}
// Plages d'un jour donné (Date) selon le cycle.
function availSlotsForDate(d, conf){
  conf=conf||getAvailability();
  const wk = availWeekType(d.toISOString().slice(0,10), conf);
  const map = wk==='A' ? conf.weekA : conf.weekB;
  return (map[d.getDay()]||[]);
}
// Minutes disponibles un jour donné, en ne comptant que le temps APRÈS "fromMin"
// si c'est aujourd'hui (sinon toute la journée). limitMin borne la fin (date/heure de livraison).
function availMinutesOnDay(d, fromMin, untilMin, conf){
  const slots=availSlotsForDate(d, conf); let total=0;
  for(const [s,e] of slots){
    let a=hmToMin(s), b=hmToMin(e);
    if(fromMin!=null) a=Math.max(a, fromMin);
    if(untilMin!=null) b=Math.min(b, untilMin);
    if(b>a) total+=(b-a);
  }
  return total;
}
// Temps total disponible entre maintenant et une échéance (date + heure de livraison).
// Renvoie les minutes cumulées sur toutes les plages de travail d'ici là.
function availableMinutesUntil(deadlineDateStr, deadlineHM, conf){
  conf=conf||getAvailability();
  const now=new Date();
  // Par défaut, l'échéance = minuit (fin de la dernière plage de travail) ; on peut dépasser si besoin.
  const hm = (deadlineHM && /^\d/.test(deadlineHM)) ? deadlineHM : '23:59';
  const end=new Date(deadlineDateStr+'T'+hm);
  if(end<=now) return 0;
  let total=0;
  const cur=new Date(now); cur.setHours(0,0,0,0);
  const endDay=new Date(end); endDay.setHours(0,0,0,0);
  let guard=0;
  while(cur<=endDay && guard++<400){
    const isToday = cur.toDateString()===now.toDateString();
    const isEndDay = cur.toDateString()===end.toDateString();
    const fromMin = isToday ? (now.getHours()*60+now.getMinutes()) : null;
    const untilMin = isEndDay ? (end.getHours()*60+end.getMinutes()) : null;
    total += availMinutesOnDay(cur, fromMin, untilMin, conf);
    cur.setDate(cur.getDate()+1);
  }
  return total;
}

// TEMPS DE PRODUCTION nécessaire pour un ensemble de besoins {parfum: qte},
// en tenant compte du stock courant, avec la logique de mutualisation des meringues.
async function productionMinutesForNeeds(needs, opts){
  opts=opts||{};
  const ignoreStock = opts.ignoreStock===true;
  const {stock, recipes} = await mrpCurrentStockByParfum();
  const times = getMrpTimes();
  let nbBatchsTotal=0, tGanache=0, tMontage=0; const manqueParfums=[];
  for(const parfum in needs){
    const besoin=+needs[parfum]||0; if(besoin<=0) continue;
    const enStock = ignoreStock ? 0 : (stock[parfum]||0);
    const net=Math.max(0, besoin-enStock);
    if(net<=0) continue;
    const nb=Math.ceil(net/TAILLE_BATCH_MACARONS);
    nbBatchsTotal+=nb;
    tGanache += nb*times.ganache.estimatedTime;
    tMontage += nb*times.montage.estimatedTime;
    manqueParfums.push({parfum, net});
  }
  const nbMeringues=Math.ceil(nbBatchsTotal/BATCHS_PAR_MERINGUE);
  const tMeringue=nbMeringues*times.coques.estimatedTime;
  return {minutes: tMeringue+tGanache+tMontage, nbBatchsTotal, nbMeringues, manqueParfums};
}

// VERDICT DE FAISABILITÉ d'une commande (date + heure + parfums demandés).
// Compare stock + temps disponible d'ici la livraison au temps de production requis.
async function assessOrderFeasibility(needs, deadlineDateStr, deadlineHM){
  if(!deadlineDateStr) return {statut:'inconnu', msg:'Renseigne une date de livraison.'};
  const prod = await productionMinutesForNeeds(needs);          // net du stock actuel
  const dispo = availableMinutesUntil(deadlineDateStr, deadlineHM);
  const besoinMin = prod.minutes;
  // déjà couvert par le stock : rien à produire
  if(besoinMin<=0){
    return {statut:'ok', stockSuffit:true, besoinMin:0, dispoMin:dispo,
      msg:'✅ Stock suffisant : aucune production nécessaire.', prod, dispo};
  }
  const marge = dispo - besoinMin;
  const ratio = dispo>0 ? besoinMin/dispo : Infinity;
  let statut, msg;
  const fmtH = m=>{ const h=Math.floor(m/60), mm=Math.round(m%60); return `${h?h+'h':''}${h?String(mm).padStart(2,'0'):mm+' min'}`; };
  if(dispo<=0){
    statut='ko'; msg='⛔ Aucune plage de travail disponible avant la livraison.';
  } else if(marge<0){
    statut='ko'; msg=`⛔ Production estimée ${fmtH(besoinMin)} pour seulement ${fmtH(dispo)} dispo : il manque ~${fmtH(-marge)}.`;
  } else if(ratio>0.8){
    statut='tendu'; msg=`⚠ Tenable mais serré : ${fmtH(besoinMin)} à produire sur ${fmtH(dispo)} dispo (marge ~${fmtH(marge)}).`;
  } else {
    statut='ok'; msg=`✅ Réalisable : ${fmtH(besoinMin)} à produire, ${fmtH(dispo)} disponibles d'ici la livraison.`;
  }
  return {statut, stockSuffit:false, besoinMin, dispoMin:dispo, marge, ratio, msg, prod, dispo,
    nbMeringues:prod.nbMeringues, nbBatchs:prod.nbBatchsTotal};
}

// Éditeur des disponibilités (planning bi-hebdomadaire A/B).
const _DOW_LBL = {1:'Lundi',2:'Mardi',3:'Mercredi',4:'Jeudi',5:'Vendredi',6:'Samedi',0:'Dimanche'};
const _DOW_ORDER = [1,2,3,4,5,6,0];
// Convertit les plages d'un jour en texte éditable : "14:00-22:00, 21:30-24:00"
function _slotsToText(slots){ return (slots||[]).map(s=>`${s[0]}-${s[1]}`).join(', '); }
function _textToSlots(txt){
  return String(txt||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>{
    const [a,b]=x.split('-').map(s=>s.trim());
    return (/^\d{1,2}:\d{2}$/.test(a)&&/^\d{1,2}:\d{2}$/.test(b))?[a,b]:null;
  }).filter(Boolean);
}
function availEditor(){
  const conf=getAvailability();
  const weekRows = (wk, map)=> _DOW_ORDER.map(dw=>`
    <div class="avail-row">
      <label>${_DOW_LBL[dw]}</label>
      <input id="av_${wk}_${dw}" value="${esc(_slotsToText(map[dw]))}" placeholder="ex : 14:00-22:00" spellcheck="false">
    </div>`).join('');
  openModal(`<h3>🗓 Mes disponibilités</h3>
    <p class="note">Plages de travail récurrentes, en alternance une semaine sur deux. Format : <b>HH:MM-HH:MM</b>, plusieurs plages séparées par une virgule (ex : <i>08:30-12:00, 21:30-24:00</i>). Minuit = <b>24:00</b>.</p>
    <div class="avail-anchor">Cycle ancré au <b>${fmtDate(conf.anchor||AVAIL_ANCHOR)}</b> (= Semaine A).</div>
    <h4 style="margin:12px 0 4px;color:var(--bordeaux)">Semaine A</h4>${weekRows('A', conf.weekA)}
    <h4 style="margin:14px 0 4px;color:var(--bordeaux)">Semaine B</h4>${weekRows('B', conf.weekB)}
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn" onclick="availSave()">Enregistrer</button></div>`);
}
function availSave(){
  const conf=getAvailability();
  const out={anchor:conf.anchor||AVAIL_ANCHOR, weekA:{}, weekB:{}};
  _DOW_ORDER.forEach(dw=>{
    out.weekA[dw]=_textToSlots(document.getElementById('av_A_'+dw)?.value);
    out.weekB[dw]=_textToSlots(document.getElementById('av_B_'+dw)?.value);
  });
  saveAvailability(out);
  closeModal(); toast('Disponibilités enregistrées ✓');
  if(view==='mrp') renderMRP();
}


// --- Persistance des temps de production (apprentissage) ---
// 'coques' = temps d'UNE meringue (mutualisée, sert 2 batchs) ; 'ganache'/'montage' = PAR batch.
const MRP_TIME_KEY = 'sm_mrp_times';
const MRP_TIME_DEFAULTS = {
  coques:  { estimatedTime: 35, totalRealTime: 0, completions: 0 },  // par MERINGUE (2 batchs)
  montage: { estimatedTime: 15, totalRealTime: 0, completions: 0 },  // par batch (60 macarons)
  ganache: { estimatedTime: 12, totalRealTime: 0, completions: 0 }   // par batch (60 macarons)
};
function getMrpTimes(){
  try{
    const s=JSON.parse(localStorage.getItem(MRP_TIME_KEY)||'{}');
    const out={};
    for(const k of Object.keys(MRP_TIME_DEFAULTS)){
      const d=MRP_TIME_DEFAULTS[k], v=s[k]||{};
      out[k]={ estimatedTime: v.estimatedTime!=null?+v.estimatedTime:d.estimatedTime,
               totalRealTime: +v.totalRealTime||0, completions: +v.completions||0 };
    }
    return out;
  }catch(e){ return JSON.parse(JSON.stringify(MRP_TIME_DEFAULTS)); }
}
function saveMrpTimes(t){ localStorage.setItem(MRP_TIME_KEY, JSON.stringify(t)); }

// Stock fini courant par parfum (réutilise la convention de computeForecast).
async function mrpCurrentStockByParfum(){
  const [recipes, prods] = await Promise.all([db.recipes.toArray(), db.productions.toArray()]);
  const stock={};
  prods.forEach(p=>{ if(!prodVendable(p)) return; const r=recipes.find(x=>x.id===p.recipeId); const nom=r?r.produitNom:('#'+p.recipeId);
    stock[nom]=(stock[nom]||0)+(+p.qteRestante||0); });
  return {stock, recipes};
}
// Associe un parfum de commande (ex "Caramel") à une recette (ex "Macaron caramel").
function mrpFindRecipe(recipes, parfum){
  const a=aiNormalize(parfum);
  return recipes.find(r=>{ const b=aiNormalize(r.produitNom); return b===a || b.includes(a) || a.includes(b); }) || null;
}

// GÉNÉRATION DU PLAN DE PRODUCTION pour une période [startDate, endDate].
async function generateProductionOrder(startDate, endDate, tempsDisponibleMinutes){
  // requête ciblée sur l'index date (bornée) plutôt qu'un scan global
  // Requête bornée sur l'index date ; repli sur un filtre mémoire si l'index
  // n'est pas (encore) disponible dans la base locale (ancienne version non migrée).
  let orders;
  try{
    orders = await db.orders.where('date').between(startDate, endDate, true, true).toArray();
  }catch(e){
    const all = await db.orders.toArray();
    orders = all.filter(o=> o.date && o.date>=startDate && o.date<=endDate);
  }
  const {stock, recipes} = await mrpCurrentStockByParfum();
  const times = getMrpTimes();
  // 1) Besoin brut agrégé par parfum
  const brut={};
  orders.forEach(o=>{ if(normStatus(o.statut)==='Livrée') return; const dem=_orderParfumDemand(o);
    for(const nom in dem) brut[nom]=(brut[nom]||0)+dem[nom]; });
  // 2) Pour chaque parfum : besoin net, nb de batchs (60), garniture, temps ganache+montage (par batch)
  const lignes=[]; const warnings=[];
  for(const parfum in brut){
    const besoinBrut=brut[parfum];
    const enStock=stock[parfum]||0;
    const besoinNet=Math.max(0, besoinBrut-enStock);
    if(besoinNet<=0) continue;
    const nbBatchs=Math.ceil(besoinNet/TAILLE_BATCH_MACARONS);
    const rec=mrpFindRecipe(recipes, parfum);
    if(!rec) warnings.push(parfum);
    const poidsUnit = rec && rec.poidsGarnitureUnit!=null ? +rec.poidsGarnitureUnit : 0;
    const garnitureG = Math.round(nbBatchs*TAILLE_BATCH_MACARONS*poidsUnit);
    const tMontage = nbBatchs*times.montage.estimatedTime;   // par batch
    const tGanache = nbBatchs*times.ganache.estimatedTime;   // par batch
    lignes.push({parfum, recipeId:rec?rec.id:null, besoinBrut, enStock, besoinNet, nbBatchs,
      coques:nbBatchs*COQUES_PAR_BATCH, garnitureG, poidsUnit, tMontage, tGanache,
      garnitureManque: !rec || poidsUnit<=0});
  }
  lignes.sort((a,b)=>b.besoinNet-a.besoinNet);

  // 3) REMPLISSAGE DES MERINGUES (capacité 120 macarons) — mutualisation seulement
  //    pour combler une meringue, jamais imposée. Un parfum ≥120 prend des meringues pleines.
  const meringues = _packMeringues(lignes);
  const nbBatchsTotal = lignes.reduce((s,l)=>s+l.nbBatchs,0);
  const tMeringue = meringues.length*times.coques.estimatedTime;   // par meringue
  const tGanacheTot = lignes.reduce((s,l)=>s+l.tGanache,0);
  const tMontageTot = lignes.reduce((s,l)=>s+l.tMontage,0);
  const tempsTotal = tMeringue + tGanacheTot + tMontageTot;

  const dispo = +tempsDisponibleMinutes||0;
  return {lignes, meringues, nbMeringues:meringues.length, nbBatchsTotal,
    tMeringue, tGanacheTot, tMontageTot, tempsTotal, tempsDisponible:dispo,
    depassement: dispo>0 && tempsTotal>dispo,
    chargePct: dispo>0 ? Math.round(tempsTotal/dispo*100) : 0,
    warnings, nbParfums:lignes.length};
}

/* ============================================================
   ORDONNANCEMENT PERSONNEL « CHEF D'ATELIER »
   ------------------------------------------------------------
   À partir de créneaux de disponibilité saisis librement (jour par jour,
   plusieurs plages possibles) + une liste de tâches souhaitées, on construit
   un planning minute par minute qui respecte la SÉQUENCE TECHNIQUE du macaron
   et exploite les temps PASSIFS (croûtage, cuisson, maturation) pour caser
   d'autres tâches actives en parallèle. Chaque décision est argumentée.
   ============================================================ */
// Constantes process (minutes). Passif = ne consomme pas de main d'œuvre (on peut faire autre chose).
const PROC = {
  maturationH: 24,     // maturation au frais avant vente (passif)
  relancePlaqueMin: 7  // on enfourne la plaque suivante 7 min après la précédente
};
// Formats de cuisson : coques/plaque + durée de cuisson d'une plaque + capacité meringue.
const CUISSON = {
  standard: { coquesParPlaque:39, cuissonMin:20, coquesParMeringue:240, macaronsParMeringue:120 },
  grand:    { coquesParPlaque:12, cuissonMin:28, coquesParMeringue:48,  macaronsParMeringue:24  }
};
// Temps FOUR total (makespan) pour cuire `nbCoques` d'un format donné, en cascade :
// P1 à t=0, P2 à t=+7, puis P3 quand P1 sort, P4 7 min après, etc. (four ~2 plaques).
// Renvoie {nbPlaques, makespanMin, four:[{plaque,entree,sortie}]}.
function cuissonCascade(nbCoques, format){
  const C = CUISSON[format] || CUISSON.standard;
  const nbPlaques = Math.ceil(Math.max(0,nbCoques)/C.coquesParPlaque);
  const B = C.cuissonMin, R = PROC.relancePlaqueMin;
  const four=[]; 
  // Les plaques entrent par paires : la paire k démarre à t = k*B (k=0,1,2…),
  // 1ère plaque de la paire à k*B, 2ème à k*B + R. Capacité simultanée = 2.
  for(let i=0;i<nbPlaques;i++){
    const pair=Math.floor(i/2), within=i%2;
    const entree = pair*B + (within===1?R:0);
    four.push({plaque:i+1, entree, sortie:entree+B});
  }
  const makespan = four.length ? Math.max(...four.map(p=>p.sortie)) : 0;
  return {nbPlaques, makespanMin:makespan, four, cuissonMin:B, coquesParPlaque:C.coquesParPlaque};
}

// Convertit une saisie de dispo en blocs datés exploitables.
// daySpecs : [{date:'AAAA-MM-JJ', slots:[[startMin,endMin],...]}] déjà en minutes.
function _flattenAvailability(daySpecs){
  const blocks=[];
  daySpecs.forEach(d=>{
    (d.slots||[]).forEach(([s,e])=>{ if(e>s) blocks.push({date:d.date, start:s, end:e, used:0}); });
  });
  // tri chronologique (date puis heure)
  blocks.sort((a,b)=> a.date.localeCompare(b.date) || a.start-b.start);
  return blocks;
}
function _totalAvail(blocks){ return blocks.reduce((s,b)=>s+(b.end-b.start),0); }

// Ordonnance une liste de tâches actives (avec dépendances souples) dans les blocs.
// tasks: [{id,label,type,active,after,passiveAfter}] ; renvoie le planning + diagnostic.
// Heuristique : on respecte l'ordre des phases (meringue → ganache → montage),
// on place chaque tâche active dans le premier créneau qui la contient, et on
// déclenche les temps passifs (cuisson/maturation) en tâche de fond.
function schedulePersonalPlan(daySpecs, plan, opts){
  opts=opts||{};
  const blocks=_flattenAvailability(daySpecs);
  const times=getMrpTimes();
  const events=[];           // {date,start,end,label,kind,passive}
  const warnings=[], insights=[];
  if(!blocks.length) return {events, warnings:['Aucun créneau de disponibilité renseigné.'], insights, blocks, ok:false, totalActive:0, totalAvail:0};

  // 1) Construire la liste ORDONNÉE des tâches actives selon la séquence technique.
  //    Phase 1 : meringues (remplies à la capacité utile). Phase 2 : ganaches. Phase 3 : montages.
  //    On entrelace : les ganaches se font pendant la cuisson des coques (temps passif).
  const meringues = plan.meringues||[];
  const lignes = plan.lignes||[];
  const tMer = Math.round((plan.tMeringue||0)/Math.max(1,plan.nbMeringues||1));

  // file de tâches actives, dans un ordre logique de production
  const active=[];
  meringues.forEach((mg,i)=>{
    const rep = mg.repartition ? Object.entries(mg.repartition).map(([p,q])=>`${p} ${q}`).join(' + ') : mg.parfums.join(' + ');
    const remplissage = mg.partielle ? ` (meringue partielle : ${mg.macarons||''}/${MACARONS_PAR_MERINGUE})` : '';
    const cuis = cuissonCascade((mg.macarons||0)*2, 'standard');
    active.push({
      id:'meringue:'+i, phase:1, label:`Meringue ${i+1} — ${rep}`,
      dur:tMer, type:'coques', passiveAfter:cuis.makespanMin,
      note:`Coulage + dressage de ${(mg.macarons||0)*2} coques${remplissage}. Cuisson : ${cuis.nbPlaques} plaque(s) en cascade (~${cuis.makespanMin} min four). Pendant la cuisson, on enchaîne une ganache pour ne pas perdre de temps.`
    });
  });
  lignes.forEach(l=> active.push({
    id:'ganache:'+l.parfum, phase:2, label:`Ganache ${l.parfum}`,
    dur:l.tGanache, type:'ganache',
    note:`${l.garnitureManque?'⚠ poids garniture à renseigner. ':''}${l.garnitureG||'?'} g pour ${l.nbBatchs} batch(s). À préparer pendant la cuisson des coques pour ne pas perdre de temps machine.`
  }));
  lignes.forEach(l=> active.push({
    id:'montage:'+l.parfum, phase:3, label:`Montage ${l.parfum}`,
    dur:l.tMontage, type:'montage',
    note:`Garnissage de ${l.besoinNet} macarons. Nécessite coques cuites + ganache prête. Lance la maturation de ${PROC.maturationH} h juste après.`
  }));

  // 2) Placement glouton dans les blocs, en respectant l'ordre des phases.
  //    On garde un curseur par bloc ; une tâche ne peut pas être coupée (atomique)
  //    sauf le montage qu'on autorise à se fractionner par batch si besoin.
  let bi=0;
  function place(task){
    // cherche le premier bloc ayant assez de place à partir du curseur courant
    for(let k=bi;k<blocks.length;k++){
      const b=blocks[k]; const free=(b.end-b.start)-b.used;
      if(free>=task.dur){
        const startAbs=b.start+b.used; const endAbs=startAbs+task.dur;
        b.used+=task.dur; bi=k;
        events.push({date:b.date, start:startAbs, end:endAbs, label:task.label, kind:task.type, note:task.note});
        return {date:b.date, end:endAbs, blockIdx:k};
      }
    }
    // pas de place : tâche non planifiée
    warnings.push(`« ${task.label} » (${task.dur} min) ne rentre dans aucun créneau disponible.`);
    return null;
  }
  // placement : phase 1 et 2 entrelacées (meringue puis ganache pendant le passif), puis phase 3.
  const ph1=active.filter(t=>t.phase===1), ph2=active.filter(t=>t.phase===2), ph3=active.filter(t=>t.phase===3);
  // on alterne meringue / ganache pour matérialiser l'entrelacement
  const interleaved=[]; let gi=0;
  ph1.forEach(m=>{ interleaved.push(m); if(gi<ph2.length) interleaved.push(ph2[gi++]); });
  while(gi<ph2.length) interleaved.push(ph2[gi++]);
  interleaved.forEach(place);
  // montages en dernier (dépendent de tout le reste), après maturation des coques cuites
  ph3.forEach(place);

  // 3) Diagnostic chiffré + insights argumentés (le « chef » explique ses choix).
  const totalActive = active.reduce((s,t)=>s+t.dur,0);
  const totalAvail = _totalAvail(blocks);
  const placed = events.length;
  const lastEvent = events[events.length-1];
  // estimation de fin (avec maturation) → prêt à vendre
  let readyInfo=null;
  if(lastEvent){
    const matEnd = new Date(lastEvent.date+'T00:00'); matEnd.setMinutes(lastEvent.end); matEnd.setHours(matEnd.getHours()+PROC.maturationH);
    readyInfo = matEnd;
  }
  // insights
  const pleines = (plan.meringues||[]).filter(m=>!m.partielle).length;
  const partielles = (plan.meringues||[]).length - pleines;
  const mutualisees = (plan.meringues||[]).filter(m=>m.parfums.length>1).length;
  insights.push(`⏱️ Charge active totale : ${Math.floor(totalActive/60)}h${String(totalActive%60).padStart(2,'0')} pour ${Math.floor(totalAvail/60)}h${String(totalAvail%60).padStart(2,'0')} disponibles (${totalAvail>0?Math.round(totalActive/totalAvail*100):0} % de remplissage).`);
  insights.push(`🥚 ${plan.nbMeringues} meringue(s) de ${MACARONS_PAR_MERINGUE} macarons max (240 coques) : ${pleines} pleine(s)${partielles?`, ${partielles} partielle(s)`:''}. ${mutualisees?`${mutualisees} meringue(s) regroupent 2 parfums uniquement pour combler la capacité`:`Aucun regroupement forcé : chaque parfum remplit ses propres meringues`}.`);
  if(partielles) insights.push(`💡 ${partielles} meringue(s) ne sont pas pleines. Si une échéance approche, tu peux soit les lancer telles quelles, soit attendre une commande qui complète la capacité pour ne pas gâcher de blancs.`);
  const coquesTot = (plan.meringues||[]).reduce((s,m)=>s+(m.macarons||0)*2,0);
  const cuisTot = cuissonCascade(coquesTot,'standard');
  insights.push(`🔥 Cuisson : ${cuisTot.nbPlaques} plaque(s) de 39 coques, enfournées en cascade (2ᵉ plaque +${PROC.relancePlaqueMin} min, 3ᵉ à la sortie de la 1ʳᵉ…). Temps four estimé ~${Math.floor(cuisTot.makespanMin/60)?Math.floor(cuisTot.makespanMin/60)+'h':''}${cuisTot.makespanMin%60} min, en parallèle des ganaches/montages.`);
  if(readyInfo) insights.push(`📦 Avec ${PROC.maturationH} h de maturation après le dernier montage, le lot complet est prêt à la vente le ${readyInfo.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'})} vers ${String(readyInfo.getHours()).padStart(2,'0')}h${String(readyInfo.getMinutes()).padStart(2,'0')}.`);
  if(totalActive>totalAvail) insights.push(`⚠ Il manque ${Math.ceil((totalActive-totalAvail)/60*10)/10} h de créneau : envisage d'étaler sur un jour de plus, ou de réduire les quantités les moins prioritaires.`);
  else insights.push(`✅ Tout tient dans tes créneaux, avec ${Math.floor((totalAvail-totalActive)/60)}h${String((totalAvail-totalActive)%60).padStart(2,'0')} de marge pour les imprévus (nettoyage, étiquetage, pauses).`);

  return {events, warnings, insights, blocks, ok: warnings.length===0,
    totalActive, totalAvail, placed, readyInfo, nbMeringues:plan.nbMeringues, nbBatchsTotal:plan.nbBatchsTotal};
}

// APPRENTISSAGE : enregistre le temps réel d'une tâche et met à jour l'estimation (moyenne mobile).
function validateTask(taskType, actualMinutes){
  const t=getMrpTimes();
  if(!t[taskType]) return null;
  const m=Math.max(0, +actualMinutes||0);
  const e=t[taskType];
  e.completions += 1;
  e.totalRealTime = money2(e.totalRealTime + m);
  // moyenne mobile : on lisse l'estimation vers la moyenne réelle observée
  const moyenneReelle = e.totalRealTime / e.completions;
  // pondération douce (70% historique lissé, 30% dernière mesure) pour rester réactif sans osciller
  e.estimatedTime = Math.round((moyenneReelle*0.7 + m*0.3));
  saveMrpTimes(t);
  return e;
}

// ---------- UI ----------
let _mrpStart=null, _mrpEnd=null, _mrpPlan=null, _mrpDispo=0;
function renderMRP(){
  if(!_mrpStart){ _mrpStart=today(); }
  if(!_mrpEnd){ const d=new Date(today()); d.setDate(d.getDate()+7); _mrpEnd=d.toISOString().slice(0,10); }
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>Plan de production</h1><p>Assistant adaptatif — besoins, batchs & temps</p></div>
     <button class="btn ghost" onclick="availEditor()">🗓 Mes disponibilités</button></div>
   <div class="panel">
     <div class="row2">
       <div class="field"><label>Du</label><input type="date" id="mrp_start" value="${_mrpStart}"></div>
       <div class="field"><label>Au</label><input type="date" id="mrp_end" value="${_mrpEnd}"></div>
     </div>
     <div class="field"><label>Temps disponible (minutes)</label>
       <input type="number" inputmode="numeric" min="0" step="15" id="mrp_dispo" value="${_mrpDispo||''}" placeholder="ex : 240"></div>
     <button class="btn" onclick="mrpGenerate()">⚙ Générer le plan</button>
   </div>
   <div id="mrpResult"></div>
   <div class="panel" style="border:1.5px solid var(--gold,#AA7C39)">
     <h2>🧑‍🍳 Planification personnelle sur mesure</h2>
     <p class="note">Décris le temps dont tu disposes (jour par jour, plusieurs créneaux possibles). Le chef d'atelier ordonnance tes tâches en optimisant les temps passifs (croûtage, cuisson, maturation) et la mutualisation des meringues.</p>
     <button class="btn gold" style="margin-top:8px" onclick="persoPlanForm()">📅 Définir ma disponibilité & générer</button>
   </div>`;
}
async function mrpGenerate(){
  _mrpStart=val('mrp_start')||today();
  _mrpEnd=val('mrp_end')||_mrpStart;
  _mrpDispo=+val('mrp_dispo')||0;
  const box=document.getElementById('mrpResult'); if(box) box.innerHTML='<div class="banner">⏳ <div>Calcul du plan…</div></div>';
  let plan; try{ plan=await generateProductionOrder(_mrpStart, _mrpEnd, _mrpDispo); }
  catch(e){ if(box) box.innerHTML=`<div class="banner" style="background:#fdf3f2;border-color:#e5b4ae">⛔ <div>Erreur : ${esc(e.message||'calcul impossible')}</div></div>`; return; }
  _mrpPlan=plan;
  mrpRenderResult();
}
function mrpRenderResult(){
  const box=document.getElementById('mrpResult'); if(!box||!_mrpPlan) return;
  const p=_mrpPlan;
  if(!p.lignes.length){ box.innerHTML='<div class="banner" style="background:#eef6ee;border-color:#bcdcc0">✅ <div>Rien à produire : le stock couvre les commandes de la période.</div></div>'; return; }
  const h=Math.floor(p.tempsTotal/60), m=p.tempsTotal%60;
  const dh=Math.floor(p.tempsDisponible/60), dm=p.tempsDisponible%60;
  const pct=Math.min(100, p.chargePct);
  const barCol = p.depassement ? 'var(--red,#b04a3e)' : (p.chargePct>=80?'var(--caramel,#AA7C39)':'var(--green,#3f7d52)');
  // TÂCHES : d'abord les MERINGUES (remplies à 120 macarons / 240 coques),
  // puis ganache + montage PAR parfum.
  const meringueRows = p.meringues.map((mg,i)=>{
    const key='meringue:'+i;
    const done=_mrpDone.has(key);
    const rep = mg.repartition ? Object.entries(mg.repartition).map(([pf,q])=>`${pf} ${q}`).join(' + ') : mg.parfums.join(' + ');
    const macs = mg.macarons!=null ? mg.macarons : (mg.nbBatchs*TAILLE_BATCH_MACARONS);
    const sub = mg.partielle
      ? `Meringue partielle : ${macs}/${MACARONS_PAR_MERINGUE} macarons (${macs*2} coques)`
      : (mg.parfums.length>1
          ? `Meringue pleine mutualisée → ${rep} · ${macs} macarons (240 coques)`
          : `Meringue pleine → ${rep} · ${macs} macarons (240 coques)`);
    return `<div class="pick-row${done?' done':''}">
      <div class="pick-check" onclick="mrpToggleTask('${key}','coques',${p.tMeringue/Math.max(1,p.nbMeringues)})">${done?'✓':''}</div>
      <div class="pick-main"><div class="pick-name">🥚 Meringue ${i+1} : ${esc(rep)}</div>
        <div class="pick-sub">${esc(sub)}</div></div>
      <div class="pick-qty">${Math.round(p.tMeringue/Math.max(1,p.nbMeringues))}'</div></div>`;
  }).join('');
  // ganache + montage par parfum
  const detailRows = p.lignes.map(l=>{
    const kg='ganache:'+l.parfum, km='montage:'+l.parfum;
    const dg=_mrpDone.has(kg), dm2=_mrpDone.has(km);
    return `<div class="pick-row${dg?' done':''}">
        <div class="pick-check" onclick="mrpToggleTask('${kg.replace(/'/g,"\\'")}','ganache',${l.tGanache})">${dg?'✓':''}</div>
        <div class="pick-main"><div class="pick-name">Ganache ${esc(l.parfum)}</div>
          <div class="pick-sub">${l.garnitureManque?'⚠ poids garniture non renseigné':l.garnitureG+' g'} · ${l.nbBatchs} batch${l.nbBatchs>1?'s':''}</div></div>
        <div class="pick-qty">${l.tGanache}'</div></div>
      <div class="pick-row${dm2?' done':''}">
        <div class="pick-check" onclick="mrpToggleTask('${km.replace(/'/g,"\\'")}','montage',${l.tMontage})">${dm2?'✓':''}</div>
        <div class="pick-main"><div class="pick-name">Montage ${esc(l.parfum)}</div>
          <div class="pick-sub">${l.besoinNet} macarons (stock ${l.enStock}/${l.besoinBrut})</div></div>
        <div class="pick-qty">${l.tMontage}'</div></div>`;
  }).join('');
  box.innerHTML=`
   <div class="panel">
     <h2>Capacité de production</h2>
     <div class="mrp-gauge-meta"><span>Estimé : <b>${h?h+'h ':''}${String(m).padStart(2,'0')}min</b></span>
       <span>Dispo : <b>${p.tempsDisponible?`${dh?dh+'h ':''}${String(dm).padStart(2,'0')}min`:'—'}</b></span></div>
     <div class="mrp-gauge"><span style="width:${pct}%;background:${barCol}"></span></div>
     <p class="note" style="margin-top:6px">${p.nbBatchsTotal} batch(s) de ${TAILLE_BATCH_MACARONS} → <b>${p.nbMeringues} meringue(s)</b> de ${MACARONS_PAR_MERINGUE} macarons max (240 coques). Regroupement de 2 parfums uniquement pour combler une meringue.</p>
     ${p.depassement?`<p class="note" style="color:var(--red,#b04a3e)">⚠ Dépassement de ${p.tempsTotal-p.tempsDisponible} min : réduis la période ou ajoute du temps.</p>`:(p.tempsDisponible?`<p class="note">✓ Tient dans le temps disponible (${p.chargePct}%).</p>`:'')}
     ${p.warnings.length?`<p class="note" style="color:var(--caramel)">ℹ Recette/poids garniture manquant pour : ${p.warnings.map(esc).join(', ')}.</p>`:''}
   </div>
   <div class="panel"><h2>🥚 Meringues à couler (mutualisées)</h2>${meringueRows||'<p class="note">Aucune.</p>'}</div>
   <div class="panel"><h2>Ganache & montage par parfum</h2>${detailRows}</div>`;
}
// état des tâches cochées (en mémoire pour la session de production en cours)
let _mrpDone = new Set();
// Au clic : ouvre l'écran inline de validation du temps réel.
function mrpToggleTask(key, type, estMin){
  if(_mrpDone.has(key)){ _mrpDone.delete(key); mrpRenderResult(); return; }
  mrpValidatePrompt(key, type, estMin);
}
// Validation inline du temps réel passé (pré-rempli avec l'estimation).
function mrpValidatePrompt(key, type, estMin){
  const pref=key.split(':')[0];
  const labelType = pref==='meringue'?'Meringue (mutualisée)':pref==='coques'?'Coques':pref==='ganache'?'Ganache':'Montage';
  const reste=key.split(':').slice(1).join(':');
  openModal(`<h3>Tâche terminée</h3>
    <p style="margin-bottom:8px">${esc(labelType)}${reste?` — ${esc(pref==='meringue'?('meringue n°'+(+reste+1)):reste)}`:''}</p>
    <div class="field"><label>Temps réel passé ? (min)${pref==='meringue'?' <span style="color:#9a8a82;font-weight:400">— pour 1 meringue</span>':''}</label>
      <input type="number" inputmode="numeric" min="0" id="mrp_real" value="${estMin}"></div>
    <p class="note">L'estimation s'ajustera automatiquement d'après tes temps réels (apprentissage).</p>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn" onclick="mrpConfirmTask('${key.replace(/'/g,"\\'")}','${type}')">Valider</button></div>`);
  setTimeout(()=>{ const i=document.getElementById('mrp_real'); if(i){ i.focus(); i.select&&i.select(); } }, 80);
}
function mrpConfirmTask(key, type){
  const real=+val('mrp_real');
  if(isNaN(real)||real<0){ toast('Temps invalide'); return; }
  validateTask(type, real);     // apprentissage : met à jour l'estimation en base
  _mrpDone.add(key);
  closeModal();
  // recalcule le plan pour refléter les nouvelles estimations sur les tâches restantes
  mrpGenerate().then(()=>{ /* _mrpDone conservé */ });
  toast('Tâche validée ✓ — estimation ajustée');
}

/* ---------- Planification personnelle (UI) ---------- */
let _persoDays = null;   // [{date, slotsTxt}]
let _persoPlan = null;   // résultat schedulePersonalPlan
function _persoDefaultDays(){
  const d0=today();
  return [{date:d0, slotsTxt:''}];
}
function persoPlanForm(){
  if(!_persoDays) _persoDays=_persoDefaultDays();
  const rows=_persoDays.map((d,i)=>`
    <div class="perso-day">
      <div class="row2">
        <div class="field"><label>Jour ${i+1}</label><input type="date" id="pd_date_${i}" value="${esc(d.date)}"></div>
        <div class="field"><label>Créneaux (ex : 14:00-18:00, 21:00-23:00)</label>
          <input id="pd_slots_${i}" value="${esc(d.slotsTxt)}" placeholder="14:00-18:00, 21:00-23:00" spellcheck="false"></div>
      </div>
      ${_persoDays.length>1?`<button class="act del" onclick="persoDelDay(${i})">– retirer ce jour</button>`:''}
    </div>`).join('');
  openModal(`<h3>🧑‍🍳 Ma disponibilité</h3>
    <p class="note">Indique tes créneaux réels jour par jour. Tu peux mettre plusieurs plages par jour (séparées par une virgule). Exemples : « 3h aujourd'hui » → un créneau de 3h ; « 1 jour 4h puis le lendemain 5h » → deux jours.</p>
    <div class="perso-presets">
      <button class="btn ghost sm" onclick="persoPreset('today3')">Aujourd'hui 3h</button>
      <button class="btn ghost sm" onclick="persoPreset('2days')">2 jours</button>
      <button class="btn ghost sm" onclick="persoPreset('fromAvail')">⤵ Importer mes dispos</button>
    </div>
    <div id="persoDays">${rows}</div>
    <button class="act" onclick="persoAddDay()">+ ajouter un jour</button>
    <div class="field" style="margin-top:10px"><label>Tâches à accomplir</label>
      <select id="pd_source">
        <option value="orders">Honorer les commandes de la période ci-dessous</option>
        <option value="custom">Quantités libres par parfum</option>
      </select></div>
    <div class="row2">
      <div class="field"><label>Commandes du</label><input type="date" id="pd_from" value="${_mrpStart||today()}"></div>
      <div class="field"><label>au</label><input type="date" id="pd_to" value="${_mrpEnd||today()}"></div>
    </div>
    <div class="field" id="pd_customWrap" style="display:none"><label>Quantités libres (ex : Vanille 120, Caramel 60)</label>
      <input id="pd_custom" placeholder="Vanille 120, Caramel 60" spellcheck="false"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn gold" onclick="persoGenerate()">⚙ Générer mon planning</button></div>`);
  const sel=document.getElementById('pd_source');
  if(sel) sel.onchange=()=>{ document.getElementById('pd_customWrap').style.display = sel.value==='custom'?'block':'none'; };
}
function _persoReadDays(){
  _persoDays = _persoDays.map((d,i)=>({
    date: val('pd_date_'+i)||d.date,
    slotsTxt: val('pd_slots_'+i)||''
  }));
}
function persoAddDay(){ _persoReadDays(); const last=_persoDays[_persoDays.length-1];
  const nd=new Date(last.date); nd.setDate(nd.getDate()+1);
  _persoDays.push({date:nd.toISOString().slice(0,10), slotsTxt:''}); persoPlanForm(); }
function persoDelDay(i){ _persoReadDays(); _persoDays.splice(i,1); if(!_persoDays.length)_persoDays=_persoDefaultDays(); persoPlanForm(); }
function persoPreset(kind){
  _persoReadDays();
  if(kind==='today3'){ _persoDays=[{date:today(), slotsTxt:_presetNextHours(3)}]; }
  else if(kind==='2days'){ const d0=today(); const d1=new Date(d0); d1.setDate(d1.getDate()+1);
    _persoDays=[{date:d0, slotsTxt:_presetNextHours(4)},{date:d1.toISOString().slice(0,10), slotsTxt:'09:00-14:00'}]; }
  else if(kind==='fromAvail'){
    const conf=getAvailability(); const out=[]; const cur=new Date(today());
    for(let k=0;k<3;k++){ const slots=availSlotsForDate(cur,conf); if(slots.length) out.push({date:cur.toISOString().slice(0,10), slotsTxt:_slotsToText(slots)}); cur.setDate(cur.getDate()+1); }
    _persoDays = out.length?out:_persoDefaultDays();
  }
  persoPlanForm();
}
// Construit un créneau "maintenant → +Nh" arrondi, borné à 23:00.
function _presetNextHours(h){
  const now=new Date(); let sh=now.getHours()+(now.getMinutes()>0?1:0); if(sh<8)sh=8;
  let eh=Math.min(23, sh+h);
  return `${String(sh).padStart(2,'0')}:00-${String(eh).padStart(2,'0')}:00`;
}
function _parseCustomNeeds(txt){
  const needs={};
  String(txt||'').split(',').forEach(part=>{
    const m=part.trim().match(/^(.+?)\s+(\d+)$/);
    if(m){ needs[m[1].trim()] = (needs[m[1].trim()]||0)+(+m[2]||0); }
  });
  return needs;
}
async function persoGenerate(){
  _persoReadDays();
  const source=val('pd_source')||'orders';
  // 1) Construire le plan de besoins (batchs/meringues/temps) selon la source choisie.
  let plan;
  if(source==='custom'){
    const needs=_parseCustomNeeds(val('pd_custom'));
    if(!Object.keys(needs).length){ toast('Indique au moins un parfum et une quantité'); return; }
    plan = await _planFromNeeds(needs);
  } else {
    const from=val('pd_from')||today(), to=val('pd_to')||from;
    plan = await generateProductionOrder(from, to, 0);
    if(!plan.lignes.length){ closeModal(); toast('Le stock couvre déjà ces commandes — rien à produire'); return; }
  }
  // 2) Convertir la dispo saisie en blocs (minutes).
  const daySpecs=_persoDays.map(d=>({ date:d.date,
    slots:_textToSlots(d.slotsTxt).map(([a,b])=>[hmToMin(a), hmToMin(b)]) }))
    .filter(d=>d.slots.length);
  if(!daySpecs.length){ toast('Renseigne au moins un créneau horaire'); return; }
  // 3) Ordonnancer.
  _persoPlan = schedulePersonalPlan(daySpecs, plan, {});
  closeModal();
  _mrpPlan = plan;   // pour cohérence d'affichage
  persoRenderResult();
}
// Construit un "plan" (même forme que generateProductionOrder) à partir de besoins libres.
async function _planFromNeeds(needs){
  const {stock, recipes}=await mrpCurrentStockByParfum();
  const times=getMrpTimes();
  const lignes=[]; const warnings=[];
  for(const parfum in needs){
    const besoinBrut=+needs[parfum]||0; if(besoinBrut<=0) continue;
    const enStock=stock[parfum]||0; const besoinNet=Math.max(0,besoinBrut-enStock);
    if(besoinNet<=0) continue;
    const nbBatchs=Math.ceil(besoinNet/TAILLE_BATCH_MACARONS);
    const rec=mrpFindRecipe(recipes,parfum); if(!rec) warnings.push(parfum);
    const poidsUnit=rec&&rec.poidsGarnitureUnit!=null?+rec.poidsGarnitureUnit:0;
    lignes.push({parfum, recipeId:rec?rec.id:null, besoinBrut, enStock, besoinNet, nbBatchs,
      coques:nbBatchs*COQUES_PAR_BATCH, garnitureG:Math.round(nbBatchs*TAILLE_BATCH_MACARONS*poidsUnit),
      poidsUnit, tMontage:nbBatchs*times.montage.estimatedTime, tGanache:nbBatchs*times.ganache.estimatedTime,
      garnitureManque:!rec||poidsUnit<=0});
  }
  lignes.sort((a,b)=>b.besoinNet-a.besoinNet);
  const meringues=_packMeringues(lignes);
  const nbBatchsTotal=lignes.reduce((s,l)=>s+l.nbBatchs,0);
  const tMeringue=meringues.length*times.coques.estimatedTime;
  const tGanacheTot=lignes.reduce((s,l)=>s+l.tGanache,0), tMontageTot=lignes.reduce((s,l)=>s+l.tMontage,0);
  return {lignes, meringues, nbMeringues:meringues.length, nbBatchsTotal,
    tMeringue, tGanacheTot, tMontageTot, tempsTotal:tMeringue+tGanacheTot+tMontageTot,
    tempsDisponible:0, depassement:false, chargePct:0, warnings, nbParfums:lignes.length};
}
const _JOURS_FR=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
function _minToHM(m){ return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
function persoRenderResult(){
  const box=document.getElementById('mrpResult'); if(!box||!_persoPlan) return;
  const S=_persoPlan;
  // grouper les événements par jour
  const byDay={}; S.events.forEach(e=>{ (byDay[e.date] ||= []).push(e); });
  const dayBlocks=Object.keys(byDay).sort().map(date=>{
    const d=new Date(date+'T00:00');
    const rows=byDay[date].map(e=>{
      const icon=e.kind==='coques'?'🥚':e.kind==='ganache'?'🍫':e.kind==='montage'?'🧩':'•';
      return `<div class="perso-ev">
        <div class="perso-ev-time">${_minToHM(e.start)}<br><span>${_minToHM(e.end)}</span></div>
        <div class="perso-ev-body"><div class="perso-ev-lbl">${icon} ${esc(e.label)}</div>
          ${e.note?`<div class="perso-ev-note">${esc(e.note)}</div>`:''}</div></div>`;
    }).join('');
    return `<div class="panel"><h2 style="text-transform:capitalize">${_JOURS_FR[d.getDay()]} ${d.toLocaleDateString('fr-FR',{day:'2-digit',month:'long'})}</h2>${rows}</div>`;
  }).join('');
  const insightHtml=S.insights.map(t=>`<li>${esc(t)}</li>`).join('');
  const warnHtml=S.warnings.length?`<div class="banner" style="background:#fdf3f2;border-color:#e5b4ae">⚠ <div>${S.warnings.map(esc).join('<br>')}</div></div>`:'';
  box.innerHTML=`
    ${warnHtml}
    <div class="panel" style="background:#faf6ef">
      <h2>🧑‍🍳 Le mot du chef d'atelier</h2>
      <ul class="perso-insights">${insightHtml}</ul>
    </div>
    ${dayBlocks||'<div class="banner">Aucune tâche planifiable avec ces créneaux.</div>'}
    <div class="panel"><button class="btn ghost" onclick="persoPlanForm()">✎ Ajuster ma disponibilité</button></div>`;
  box.scrollIntoView({behavior:'smooth', block:'start'});
}

/* ============================================================
   HACCP / PMS — Plan de Maîtrise Sanitaire (utilisateur unique)
   Suivi numérique : relevés de température (matin/soir) + plan de
   nettoyage (quotidien/hebdo/mensuel) + export DDPP 30 jours.
   ============================================================ */
const PMS_CORRECTIVES = [
  'Isolation du lot NC / Réglage thermostat',
  'Déplacement marchandise vers équipement conforme'
];
const PMS_FREQ_ORDER = ['Quotidien','Hebdo','Mensuel'];

// Peuple la base PMS si elle est vide (idempotent).
async function seedPMS(){
  const nbEq = await db.pmsEquipments.count().catch(()=>0);
  if(nbEq===0){
    await db.pmsEquipments.bulkAdd([
      {nom:'Frigo F',            type:'positif', tempMin:0,   tempMax:5,   marcheOnly:false},
      {nom:'Congélateur A (Petit)',   type:'negatif', tempMin:-24, tempMax:-18, marcheOnly:false},
      {nom:'Congélateur B (Bahut)',   type:'negatif', tempMin:-24, tempMax:-18, marcheOnly:false},
      {nom:'Congélateur C (Colonne)', type:'negatif', tempMin:-24, tempMax:-18, marcheOnly:false},
      {nom:'Vitrine Marché V',   type:'positif', tempMin:0,   tempMax:5,   marcheOnly:true}
    ]);
  }
  const nbTasks = await db.pmsTasks.count().catch(()=>0);
  if(nbTasks===0){
    const q=['Plans de travail','Robot','Sol','Façades et poignées de placards','Plonge et Poubelles'];
    const h=['Nettoyage frigos et congélateurs','Étagères de rangement denrées','Four','Hotte'];
    const m=['Nettoyage en profondeur des équipements froid','Dépoussiérage VMC/Aérations'];
    const tasks=[
      ...q.map(nom=>({nom, frequence:'Quotidien'})),
      ...h.map(nom=>({nom, frequence:'Hebdo'})),
      ...m.map(nom=>({nom, frequence:'Mensuel'}))
    ];
    await db.pmsTasks.bulkAdd(tasks);
  }
}

// Une température est-elle conforme à la plage de l'équipement ?
function pmsConforme(eq, t){
  if(t===''||t==null||isNaN(+t)) return null;   // pas de saisie
  return (+t>=eq.tempMin && +t<=eq.tempMax);
}
// Début de période d'une tâche selon sa fréquence (pour savoir si "faite" sur la période courante).
function pmsPeriodStart(freq){
  const d=new Date(today());
  if(freq==='Hebdo'){ const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); }   // lundi de la semaine
  else if(freq==='Mensuel'){ d.setDate(1); }                                       // 1er du mois
  return d.toISOString().slice(0,10);
}

let _pmsTab = 'temp';        // 'temp' | 'nettoyage'
let _pmsPeriode = null;      // 'Matin' | 'Soir' (auto si null)
let _pmsDate = null;         // date du relevé (défaut = aujourd'hui ; permet de corriger un jour passé)
function pmsSetDate(d){ if(d!==_pmsDate && !pmsGuardUnsaved()) return; _pmsDate = d || today(); pmsRenderTemp(); }

async function renderPMS(){
  await seedPMS();
  if(!_pmsPeriode){ _pmsPeriode = (new Date().getHours() < 14) ? 'Matin' : 'Soir'; }
  _pmsDate = today();   // on repart toujours sur aujourd'hui en entrant dans l'écran
  document.getElementById('main').innerHTML=`
   <div class="topbar"><div><h1>HACCP / PMS</h1><p>Plan de Maîtrise Sanitaire — ${fmtDate(today())}</p></div>
     <button class="btn ghost" onclick="pmsExportDDPP()">🗄 Historique / Contrôle DDPP</button></div>
   <div class="pick-tabs">
     <button class="${_pmsTab==='temp'?'active':''}" onclick="pmsSetTab('temp')">🌡 Températures</button>
     <button class="${_pmsTab==='nettoyage'?'active':''}" onclick="pmsSetTab('nettoyage')">🧼 Nettoyage</button>
   </div>
   <div id="pmsBody"></div>`;
  if(_pmsTab==='temp') await pmsRenderTemp(); else await pmsRenderCleaning();
}
function pmsSetTab(t){ if(t!==_pmsTab && !pmsGuardUnsaved()) return; _pmsTab=t; renderPMS(); }
function pmsSetPeriode(p){ if(p!==_pmsPeriode && !pmsGuardUnsaved()) return; _pmsPeriode=p; pmsRenderTemp(); }

// ---------- A. TEMPÉRATURES ----------
async function pmsRenderTemp(){
  const body=document.getElementById('pmsBody'); if(!body) return;
  const eqs = await db.pmsEquipments.toArray();
  // équipements à relever au labo (on exclut la vitrine marché du relevé quotidien)
  const labo = eqs.filter(e=>!e.marcheOnly);
  const vitrine = eqs.filter(e=>e.marcheOnly);
  // relevés déjà saisis pour cette date + période (pré-remplissage)
  const todayLogs = (await db.temperatureLogs.where('date').equals(_pmsDate).toArray())
    .filter(l=>l.periode===_pmsPeriode);
  const logByEq = {}; todayLogs.forEach(l=>{ logByEq[l.equipmentId]=l; });

  const card = eq=>{
    const prev = logByEq[eq.id];
    const cur = prev && prev.temperature!=null ? +prev.temperature : null;
    const corr = prev && prev.actionCorrective ? prev.actionCorrective : '';
    const plage = `${fmtTempSigned(eq.tempMin)} à ${fmtTempSigned(eq.tempMax)}`;
    return `<div class="pms-eq" id="pmsEq_${eq.id}" data-min="${eq.tempMin}" data-max="${eq.tempMax}">
      <div class="pms-eq-head"><div class="pms-eq-nom">${esc(eq.nom)}</div><div class="pms-eq-plage">${plage}</div></div>
      <div class="pms-eq-row">
        <select id="pmsT_${eq.id}" class="pms-temp-input" data-saved="${cur!=null?cur:''}" onchange="pmsCheckTemp(${eq.id})">
          ${tempOptions(eq.tempMin, eq.tempMax, cur)}
        </select>
        <span class="pms-unit">°C</span>
      </div>
      <div class="pms-corr" id="pmsCorr_${eq.id}" style="display:none">
        <label>⚠ Hors plage — action corrective obligatoire :</label>
        <select id="pmsCorrSel_${eq.id}">
          <option value="">— choisir —</option>
          ${PMS_CORRECTIVES.map(c=>`<option ${corr===c?'selected':''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
    </div>`;
  };
  // État du relevé pour cette date + période (✅ fait / ⚠ pas encore) — évite tout doute.
  const estAuj = _pmsDate===today();
  const dejaFait = todayLogs.length>0;
  const jourLbl = estAuj ? "aujourd'hui" : fmtDate(_pmsDate);
  const etatBanner = dejaFait
    ? `<div class="banner" style="background:#eaf6ec;border-color:#bfe0c8;color:#2e7d32">✅ <div><b>Relevé « ${esc(_pmsPeriode)} » enregistré (${jourLbl})</b> — ${todayLogs.length} équipement(s). Modifiable puis revalider si besoin.</div></div>`
    : `<div class="banner">⚠ <div><b>Aucun relevé « ${esc(_pmsPeriode)} » enregistré (${jourLbl}).</b> N'oublie pas de taper <b>« ✓ Valider les relevés »</b> en bas : saisir les valeurs ne suffit pas.</div></div>`;
  body.innerHTML=`
   ${etatBanner}
   <div class="field" style="max-width:240px;margin-bottom:10px">
     <label>Date du relevé ${estAuj?'':'<span style="color:#b04a3e">(jour passé)</span>'}</label>
     <input type="date" value="${_pmsDate}" max="${today()}" onchange="pmsSetDate(this.value)">
   </div>
   <div class="pms-periode">
     <button class="${_pmsPeriode==='Matin'?'active':''}" onclick="pmsSetPeriode('Matin')">☀️ Matin</button>
     <button class="${_pmsPeriode==='Soir'?'active':''}" onclick="pmsSetPeriode('Soir')">🌙 Soir</button>
   </div>
   <div class="panel"><h2>Relevés — ${esc(_pmsPeriode)}</h2>
     ${labo.map(card).join('')}
     <button class="pick-big-btn ready" style="margin-top:6px" onclick="pmsSaveTemp()">✓ Valider les relevés</button>
   </div>
   ${vitrine.length?`<div class="panel"><h2>Relevé marché <span style="font-weight:400;font-size:.82rem;color:#9a8a82">— uniquement les jours de marché</span></h2>
     ${vitrine.map(card).join('')}
     <button class="pick-big-btn wait" style="margin-top:6px;background:var(--caramel);color:#fff" onclick="pmsSaveTemp(true)">✓ Enregistrer le relevé marché</button>
   </div>`:''}`;
  // applique l'état hors-plage initial
  [...labo, ...vitrine].forEach(eq=>pmsCheckTemp(eq.id));
}
// Format température signé, toujours avec signe et 1 décimale : +04.0 / -18.0
function fmtTempSigned(t){
  const v=+t; if(isNaN(v)) return '';
  const sign = v<0 ? '-' : '+';
  const abs = Math.abs(v);
  const intp = String(Math.floor(abs)).padStart(2,'0');
  const dec = Math.round((abs-Math.floor(abs))*10);
  return `${sign}${intp}.${dec}`;
}
// Génère les <option> d'un menu déroulant de températures, PAS de 0,5°.
// La ZONE CONFORME (min..max) est placée EN PREMIER (groupe « ✅ Zone conforme »)
// pour éviter de scroller ; les valeurs hors plage suivent dans un second groupe.
function tempOptions(min, max, current){
  min=+min; max=+max;
  if(isNaN(min)) min=0; if(isNaN(max)) max=8;
  let lo=Math.floor(min)-3, hi=Math.ceil(max)+3;
  lo=Math.max(lo,-40); hi=Math.min(hi,60);
  const round1 = x => Math.round(x*10)/10;
  const half = x => Math.round(x*2)/2;            // arrondi au 0,5° le plus proche
  const cur = current!=null ? round1(+current) : null;
  const eq = (a,b)=>Math.abs(a-b)<1e-9;
  const inRange = v => v>=round1(min)-1e-9 && v<=round1(max)+1e-9;
  const optTag = v => { const sel=(cur!=null && eq(v,cur))?' selected':''; return `<option value="${v}"${sel}>${fmtTempSigned(v)}</option>`; };
  // bornes alignées sur le demi-degré
  const minH=half(min), maxH=half(max), loH=half(lo), hiH=half(hi);
  const STEP=0.5;
  // 1) zone conforme, du plus froid au plus chaud
  const conf=[];
  for(let v=minH; v<=maxH+1e-9; v=round1(v+STEP)){ conf.push(optTag(v)); }
  // 2) hors plage : au-dessus du max (du plus proche au plus chaud), puis en dessous du min
  const horsHaut=[]; for(let v=round1(maxH+STEP); v<=hiH+1e-9; v=round1(v+STEP)){ horsHaut.push(optTag(v)); }
  const horsBas=[];  for(let v=round1(minH-STEP); v>=loH-1e-9; v=round1(v-STEP)){ horsBas.push(optTag(v)); }
  let out = '<option value="">—</option>'
    + `<optgroup label="✅ Zone conforme (${fmtTempSigned(min)} à ${fmtTempSigned(max)})">${conf.join('')}</optgroup>`
    + `<optgroup label="⚠ Hors plage">${horsHaut.join('')}${horsBas.join('')}</optgroup>`;
  // valeur enregistrée hors de la plage générée (ancienne saisie, ex. au 0,1°) → on l'ajoute, sélectionnée
  if(cur!=null && (cur>hi || cur<lo)){
    out = '<option value="">—</option>'
      + `<option value="${cur}" selected>${fmtTempSigned(cur)}</option>`
      + out.slice('<option value="">—</option>'.length);
  }
  return out;
}
// Affiche/masque le menu correctif si la température est hors plage.
function pmsCheckTemp(eqId){
  const wrap=document.getElementById('pmsEq_'+eqId); if(!wrap) return;
  const inp=document.getElementById('pmsT_'+eqId);
  const corr=document.getElementById('pmsCorr_'+eqId);
  const min=+wrap.dataset.min, max=+wrap.dataset.max;
  const v=inp.value;
  if(v===''||isNaN(+v)){ wrap.classList.remove('nc'); corr.style.display='none'; return; }
  const hors = (+v<min || +v>max);
  wrap.classList.toggle('nc', hors);
  corr.style.display = hors ? 'block' : 'none';
}
// Sauvegarde des relevés de la période courante (un log par équipement saisi).
async function pmsSaveTemp(marcheOnly){
  const eqs = await db.pmsEquipments.toArray();
  const cible = eqs.filter(e=> marcheOnly ? e.marcheOnly : !e.marcheOnly);
  const dateStr = _pmsDate || today();
  let nb=0;
  const toSave=[];
  const manquants=[];   // équipements hors plage sans action corrective
  for(const eq of cible){
    const inp=document.getElementById('pmsT_'+eq.id); if(!inp) continue;
    const raw=inp.value;
    if(raw===''||isNaN(+raw)) continue;   // pas saisi → on ignore (pas d'obligation de tout remplir)
    const t=+raw;
    const conforme = (t>=eq.tempMin && t<=eq.tempMax);
    let action='';
    if(!conforme){
      const sel=document.getElementById('pmsCorrSel_'+eq.id);
      action = sel ? sel.value : '';
      if(!action){ manquants.push(eq); }
    }
    toSave.push({equipmentId:eq.id, date:dateStr, periode:_pmsPeriode, temperature:t,
      conforme, actionCorrective:action});
    nb++;
  }
  if(manquants.length){
    // Rien n'est enregistré tant qu'une action corrective manque : on le rend TRÈS visible
    // (surlignage + défilement) pour éviter de croire à tort que le relevé est sauvegardé.
    manquants.forEach(eq=>{ const w=document.getElementById('pmsEq_'+eq.id); if(w){ w.classList.add('nc'); } });
    const first=document.getElementById('pmsEq_'+manquants[0].id);
    if(first&&first.scrollIntoView) first.scrollIntoView({behavior:'smooth',block:'center'});
    toast('⚠ RIEN N\'A ÉTÉ ENREGISTRÉ : choisis une action corrective pour '+manquants.map(e=>e.nom).join(', '));
    return;
  }
  if(!nb){ toast('Saisis au moins une température'); return; }
  // remplace d'éventuels relevés déjà faits aujourd'hui pour cette période + ces équipements
  await db.transaction('rw', db.temperatureLogs, async()=>{
    for(const rec of toSave){
      const dups=await db.temperatureLogs.where('date').equals(dateStr).toArray();
      for(const d of dups){ if(d.equipmentId===rec.equipmentId && d.periode===rec.periode) await db.temperatureLogs.delete(d.id); }
      await db.temperatureLogs.add(rec);
    }
  });
  toast(`${nb} relevé(s) enregistré(s) ✓`);
  pmsRenderTemp();
}

// ---------- B. PLAN DE NETTOYAGE ----------
async function pmsRenderCleaning(){
  const body=document.getElementById('pmsBody'); if(!body) return;
  const tasks = await db.pmsTasks.toArray();
  const logs = await db.cleaningLogs.toArray();
  // une tâche est "faite" si un log existe dans la période courante (jour/semaine/mois)
  const doneByTask = {};
  tasks.forEach(t=>{
    const start=pmsPeriodStart(t.frequence);
    doneByTask[t.id] = logs.some(l=>l.taskId===t.id && (l.date||'')>=start);
  });
  const byFreq = {Quotidien:[], Hebdo:[], Mensuel:[]};
  tasks.forEach(t=>{ (byFreq[t.frequence] ||= []).push(t); });
  const freqLabel = {Quotidien:'Quotidien', Hebdo:'Hebdomadaire', Mensuel:'Mensuel'};
  const section = freq=>{
    const list=byFreq[freq]||[]; if(!list.length) return '';
    const rows=list.map(t=>{
      const done=doneByTask[t.id];
      return `<div class="pick-row${done?' done':''}" onclick="pmsToggleTask(${t.id},${done?1:0})">
        <div class="pick-check">${done?'✓':''}</div>
        <div class="pick-main"><div class="pick-name">${esc(t.nom)}</div>
          <div class="pick-sub">${done?'Fait sur la période':'À faire'}</div></div></div>`;
    }).join('');
    return `<div class="panel"><h2>${freqLabel[freq]}</h2>${rows}</div>`;
  };
  body.innerHTML = PMS_FREQ_ORDER.map(section).join('') || '<div class="empty">Aucune tâche.</div>';
}
// Coche (enregistre un log daté) ou décoche (retire le log de la période) une tâche.
async function pmsToggleTask(taskId, wasDone){
  const t=await db.pmsTasks.get(taskId); if(!t) return;
  if(wasDone){
    // décocher : supprime les logs de la période courante pour cette tâche
    const start=pmsPeriodStart(t.frequence);
    const logs=await db.cleaningLogs.where('taskId').equals(taskId).toArray();
    for(const l of logs){ if((l.date||'')>=start) await db.cleaningLogs.delete(l.id); }
  } else {
    await db.cleaningLogs.add({taskId, date:today()});
  }
  pmsRenderCleaning();
}

// ---------- C. HISTORIQUE / EXPORT DDPP (30 jours) ----------
async function pmsExportDDPP(){
  const [eqs, tasks, tLogs, cLogs] = await Promise.all([
    db.pmsEquipments.toArray(), db.pmsTasks.toArray(),
    db.temperatureLogs.toArray(), db.cleaningLogs.toArray()
  ]);
  const eqById={}; eqs.forEach(e=>eqById[e.id]=e);
  const taskById={}; tasks.forEach(t=>taskById[t.id]=t);
  const since=(()=>{ const d=new Date(today()); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10); })();
  const L=[];
  L.push('SENSATIONS MACARONS — PLAN DE MAÎTRISE SANITAIRE (PMS / HACCP)');
  L.push('Registre des 30 derniers jours — édité le '+fmtDate(today()));
  L.push('========================================================');
  L.push('');
  L.push('1) RELEVÉS DE TEMPÉRATURE');
  L.push('--------------------------------------------------------');
  const tRecent = tLogs.filter(l=>(l.date||'')>=since).sort((a,b)=> (b.date||'').localeCompare(a.date||'') || (a.periode||'').localeCompare(b.periode||''));
  if(!tRecent.length){ L.push('  Aucun relevé sur la période.'); }
  else {
    let curDate=null;
    tRecent.forEach(l=>{
      if(l.date!==curDate){ curDate=l.date; L.push(''); L.push('  '+fmtDate(l.date)); }
      const eq=eqById[l.equipmentId]||{nom:'Équipement #'+l.equipmentId, tempMin:'?', tempMax:'?'};
      const conf = (l.conforme===false) ? 'NON CONFORME' : 'OK';
      let line=`    [${l.periode||'—'}] ${eq.nom} : ${fmtTempSigned(l.temperature)}°C (plage ${fmtTempSigned(eq.tempMin)}/${fmtTempSigned(eq.tempMax)}) → ${conf}`;
      if(l.conforme===false && l.actionCorrective) line+=` | Action : ${l.actionCorrective}`;
      L.push(line);
    });
  }
  L.push('');
  L.push('2) PLAN DE NETTOYAGE & DÉSINFECTION');
  L.push('--------------------------------------------------------');
  const cRecent = cLogs.filter(l=>(l.date||'')>=since).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!cRecent.length){ L.push('  Aucun nettoyage enregistré sur la période.'); }
  else {
    let curDate=null;
    cRecent.forEach(l=>{
      if(l.date!==curDate){ curDate=l.date; L.push(''); L.push('  '+fmtDate(l.date)); }
      const t=taskById[l.taskId]||{nom:'Tâche #'+l.taskId, frequence:''};
      L.push(`    ✓ ${t.nom} (${t.frequence})`);
    });
  }
  L.push('');
  L.push('========================================================');
  L.push('Document généré automatiquement — Sensations Macarons');
  const blob=new Blob([L.join('\n')],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='PMS-HACCP-'+today()+'.txt'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  toast('Registre PMS exporté ✓');
}

/* ============================================================
   HORODATEUR GLOBAL — date + heure en direct (haut à droite, toutes pages)
   Mise à jour chaque seconde. Léger : un seul setInterval, format FR.
   ============================================================ */
let _clockTimer=null;
function startClock(){
  const el=document.getElementById('clock'); if(!el) return;
  const tick=()=>{
    const d=new Date();
    const date=d.toLocaleDateString('fr-FR',{weekday:'short', day:'2-digit', month:'short'});
    const heure=d.toLocaleTimeString('fr-FR',{hour:'2-digit', minute:'2-digit', second:'2-digit'});
    el.innerHTML=`<span class="c-date">${date}</span><span class="c-time">${heure}</span>`;
  };
  tick();
  if(_clockTimer) clearInterval(_clockTimer);
  _clockTimer=setInterval(tick, 1000);
  // resynchronise quand l'app revient au premier plan (l'intervalle peut être gelé en arrière-plan)
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) tick(); });
}

(async()=>{
  migratePackaging202511();   // inscrit les tarifs emballage 28/11/2025 (une seule fois)
  try{ await seedIfEmpty(); }catch(e){ console.error('seed',e); }
  try{ await seedProducts(); }catch(e){ console.error('seedProducts',e); }
  try{ await seedPMS(); }catch(e){ console.error('seedPMS',e); }
  try{ await seedAllergenes(); }catch(e){ console.error('seedAllergenes',e); }
  try{ await seedEmballages(); }catch(e){ console.error('seedEmballages',e); }
  try{ await materializeRecurringCharges(); }catch(e){ console.error('recurCharges',e); }
  const opened = await handleTraceAnchor().catch(()=>false);
  if(!opened) render();
  initHistoryNav();
  ttInit();
  mascotInit();
  startClock();
  try{ window._allMatsCache = await db.materials.toArray(); }catch(e){}
  // Sécurité des données : contrôle de cohérence + sauvegarde auto quotidienne au démarrage.
  try{ await runConsistencyCheck(false); }catch(e){ console.error('consistency',e); }
  try{ await autoDailyBackup(); }catch(e){ console.error('autoBackup',e); }
  // Rappel d'export en DERNIER (et seulement si aucune autre modale n'est ouverte),
  // pour qu'il ne soit pas masqué par un autre message de démarrage.
  setTimeout(()=>{ try{ if(!document.getElementById('overlay')?.classList.contains('show')) exportReminder(); }catch(e){} }, 1200);
  // Surveillance quotidienne : réévalue toutes les commandes futures vs stock actuel.
  setTimeout(()=>{ showForecastPopup({daily:true}); }, 600);
})();
