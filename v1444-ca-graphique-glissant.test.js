'use strict';
// v1444 — GRAPHIQUE DU CA ZOOMABLE ET GLISSANT. Demande de Ben (modèle explicite : l'app Santé
// d'iPhone, capture à l'appui) : onglets jour/semaine/mois/année pour changer la tranche affichée,
// défilement horizontal pour faire glisser la période à granularité constante, et « tout résultat
// affiché reste cliquable et renvoie à la période en question ».
//
// LE RISQUE PRINCIPAL, et la raison d'être de la moitié de cette suite : l'ancien graphique
// appelait caDuMois() une fois par barre — SOURCE UNIQUE DE VÉRITÉ du CA encaissé d'un mois. Le
// nouveau charge tout en un passage et regroupe côté client. Si les deux agrégations divergent
// d'un centime, l'app affiche DEUX chiffres pour le même mois : la barre dit une chose, le détail
// au clic en dit une autre. La réconciliation est donc testée mois par mois, sur les mêmes règles
// (reprises exclues, commandes filles sans paiement propre, marchés clos au CA net).
const { extractFunction, extractConstLine } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- Module réel : les fonctions PURES extraites d'app.js, évaluées en isolation ----
const src = [
  extractConstLine('money2'),
  extractConstLine('CA_GRANS'),
  extractConstLine('CA_GRAN_VISIBLE'),
  extractFunction('ymdLocal'),
  extractFunction('monthLabel'),
  extractFunction('fmtDate'),
  extractFunction('_caLundiDe'),
  extractFunction('_caCleGran'),
  extractFunction('_caPeriodeBornes'),
  extractFunction('_caLabelGran'),
  extractFunction('_caLabelLongGran'),
  extractFunction('_caSuiteCles'),
  extractFunction('_caAgregeLignes'),
].join('\n');

const M = new Function(`
  ${src}
  return { _caLundiDe, _caCleGran, _caPeriodeBornes, _caLabelGran, _caLabelLongGran,
           _caSuiteCles, _caAgregeLignes, CA_GRANS, CA_GRAN_VISIBLE, money2 };
`)();

// ---- A. Les 4 périodes demandées par Ben existent, et « Mois » montre bien une tranche d'1 an ----
check('A. les 4 granularités demandées : jour, semaine, mois, année',
  JSON.stringify(M.CA_GRANS) === JSON.stringify(['jour','semaine','mois','annee']));
check("A. l'onglet « Mois » affiche 12 barres = la tranche d'1 an citée en exemple par Ben",
  M.CA_GRAN_VISIBLE.mois === 12);

// ---- B. Clé de regroupement par granularité ----
check('B. jour : la clé est la date elle-même', M._caCleGran('2026-07-15','jour') === '2026-07-15');
check('B. mois : la clé est AAAA-MM', M._caCleGran('2026-07-15','mois') === '2026-07');
check('B. année : la clé est AAAA', M._caCleGran('2026-07-15','annee') === '2026');
// 2026-07-15 est un mercredi → lundi = 2026-07-13
check('B. semaine : la clé est le lundi de la semaine', M._caCleGran('2026-07-15','semaine') === '2026-07-13');
check('B. semaine : un dimanche appartient à la semaine du lundi PRÉCÉDENT (norme ISO, pas US)',
  M._caCleGran('2026-07-19','semaine') === '2026-07-13');
check('B. semaine : le lundi est sa propre clé', M._caCleGran('2026-07-13','semaine') === '2026-07-13');

// ---- C. Bornes d'une période — c'est ce qui décide quelles lignes le clic affichera ----
{
  const j = M._caPeriodeBornes('2026-07-15','jour');
  check('C. jour : bornes = le jour lui-même', j.debut==='2026-07-15' && j.fin==='2026-07-15');
  const s = M._caPeriodeBornes('2026-07-13','semaine');
  check('C. semaine : lundi → dimanche (7 jours)', s.debut==='2026-07-13' && s.fin==='2026-07-19');
  const m = M._caPeriodeBornes('2026-07','mois');
  check('C. mois : 1er → 31 juillet', m.debut==='2026-07-01' && m.fin==='2026-07-31');
  const f = M._caPeriodeBornes('2026-02','mois');
  check('C. mois : février 2026 se termine bien le 28 (pas de 30/31 en dur)', f.fin==='2026-02-28');
  const bis = M._caPeriodeBornes('2024-02','mois');
  check('C. mois : février 2024 (bissextile) se termine le 29', bis.fin==='2024-02-29');
  const a = M._caPeriodeBornes('2026','annee');
  check('C. année : 1er janvier → 31 décembre', a.debut==='2026-01-01' && a.fin==='2026-12-31');
}

// ---- D. La suite de périodes est CONTINUE : un mois sans vente reste une barre à zéro ----
{
  const mois = M._caSuiteCles('2025-10-01','2026-03-15','mois');
  check('D. mois : suite continue oct.2025 → mars 2026 (6 barres)', mois.length === 6);
  check('D. mois : la suite franchit le changement d\'année sans trou',
    mois[0]==='2025-10' && mois[2]==='2025-12' && mois[3]==='2026-01' && mois[5]==='2026-03');
  const jours = M._caSuiteCles('2026-07-13','2026-07-19','jour');
  check('D. jour : 7 barres pour une semaine pleine', jours.length === 7);
  const sem = M._caSuiteCles('2026-07-01','2026-07-31','semaine');
  check('D. semaine : chaque clé est un lundi', sem.every(k => M._caLundiDe(k) === k));
  const ans = M._caSuiteCles('2024-05-01','2026-02-01','annee');
  check('D. année : 2024, 2025, 2026', JSON.stringify(ans)===JSON.stringify(['2024','2025','2026']));
}
// Garde-fou DOM : on garde les périodes les plus RÉCENTES, pas les plus anciennes.
{
  const bornees = M._caSuiteCles('2020-01-01','2026-08-03','jour', 30);
  check('E. plafond de barres respecté', bornees.length === 30);
  check('E. le plafond garde les périodes les plus RÉCENTES (la fin, pas le début)',
    bornees[bornees.length-1] === '2026-08-03');
}

// ---- F. Agrégation : la somme par période ----
{
  const lignes = [
    { date:'2026-07-13', montant:10 },   // lundi
    { date:'2026-07-15', montant:5.5 },  // mercredi, même semaine
    { date:'2026-07-19', montant:4.5 },  // dimanche, même semaine
    { date:'2026-07-20', montant:100 },  // lundi suivant
    { date:'2026-08-01', montant:7 },    // mois suivant
  ];
  const parJour = M._caAgregeLignes(lignes,'jour');
  check('F. jour : chaque date garde son montant', parJour['2026-07-13']===10 && parJour['2026-07-20']===100);
  const parSem = M._caAgregeLignes(lignes,'semaine');
  check('F. semaine : les 3 jours de la même semaine sont cumulés (10+5,5+4,5=20)', parSem['2026-07-13']===20);
  check('F. semaine : la semaine suivante reste séparée', parSem['2026-07-20']===100);
  const parMois = M._caAgregeLignes(lignes,'mois');
  check('F. mois : juillet cumulé (10+5,5+4,5+100=120)', parMois['2026-07']===120);
  check('F. mois : août séparé', parMois['2026-08']===7);
  const parAn = M._caAgregeLignes(lignes,'annee');
  check('F. année : tout 2026 cumulé (127)', parAn['2026']===127);
}

// ---- G. RÉCONCILIATION AVEC caDuMois — le test qui compte vraiment ----
// On rejoue les DEUX chemins sur le MÊME jeu de données : l'agrégation du graphique
// (_caLignesToutes + _caAgregeLignes) et la source unique de vérité (caDuMois). Tout écart
// signifierait deux chiffres concurrents pour un même mois.
async function testReconciliation(){
  const jeu = {
    orders: [
      // commande normale, 2 paiements sur 2 mois différents
      { id:1, clientId:1, date:'2026-06-10', paiements:[{date:'2026-06-10',montant:50,moyen:'CB'},
                                                        {date:'2026-07-02',montant:30,moyen:'espèces'}] },
      // commande d'un autre mois
      { id:2, clientId:2, date:'2026-07-20', paiements:[{date:'2026-07-20',montant:12.75,moyen:'CB'}] },
      // REPRISE d'historique : doit être exclue des DEUX côtés
      { id:3, clientId:1, date:'2026-07-05', reprise:true, paiements:[{date:'2026-07-05',montant:999,moyen:'CB'}] },
      // paiement à montant nul : ignoré des DEUX côtés
      { id:4, clientId:2, date:'2026-07-08', paiements:[{date:'2026-07-08',montant:0,moyen:'CB'}] },
    ],
    clients: [{id:1,nom:'Alice'},{id:2,nom:'Bob'}],
    markets: [
      { id:1, nom:'Marché A', date:'2026-07-12', statut:'clos' },      // net 40
      { id:2, nom:'Marché B', date:'2026-07-25', statut:'ouvert' },    // NON clos → exclu
      { id:3, nom:'Marché C', date:'2026-06-14', statut:'clos' },      // net 25
    ],
  };
  const netParMarche = { 1:40, 2:1000, 3:25 };

  const harnais = `
    const db = {
      orders:  { toArray: async () => JEU.orders },
      clients: { toArray: async () => JEU.clients },
      markets: { toArray: async () => JEU.markets },
    };
    const estReprise   = o => !!(o && o.reprise);
    const paiementsDe  = o => (o && Array.isArray(o.paiements)) ? o.paiements : [];
    const marketNetCA  = k => NET[k.id] || 0;
    const swallow      = () => {};
    const monthKey = d => String(d||'').slice(0,7);
    const ymKey    = d => monthKey(d);
    const today    = () => '2026-08-03';
    ${extractConstLine('money2')}
    ${extractFunction('_caCleGran')}
    ${extractFunction('_caLundiDe')}
    ${extractFunction('ymdLocal')}
    ${extractFunction('_caAgregeLignes')}
    ${extractFunction('_caLignesToutes')}
    ${extractFunction('caDuMois')}
    return { _caLignesToutes, _caAgregeLignes, caDuMois };
  `;
  const mod = new Function('JEU','NET', harnais)(jeu, netParMarche);

  const lignes = await mod._caLignesToutes();
  const parMois = mod._caAgregeLignes(lignes, 'mois');

  for(const mk of ['2026-06','2026-07','2026-08']){
    const verite = await mod.caDuMois(mk);
    const graph  = +parMois[mk] || 0;
    check(`G. réconciliation ${mk} : graphique (${graph}) = caDuMois (${verite.total})`, graph === verite.total);
  }
  // Et les exclusions, vérifiées explicitement plutôt que déduites du total.
  check('G. la reprise d\'historique est exclue du graphique', !lignes.some(l=>l.montant===999));
  check('G. le marché NON clos est exclu du graphique', !lignes.some(l=>l.montant===1000));
  check('G. le paiement à 0 € n\'est pas une ligne', !lignes.some(l=>l.montant===0));
  check('G. le marché clos est bien compté (40 €)', lignes.some(l=>l.montant===40 && l.type==='mk'));
  check('G. un paiement daté d\'un autre mois que sa commande compte au mois du PAIEMENT',
    (+parMois['2026-07']||0) === 30 + 12.75 + 40);
}

testReconciliation().then(()=>{
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}).catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
